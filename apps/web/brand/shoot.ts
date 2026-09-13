/**
 * Deterministic screenshots of the running app, for `assets/screenshots`.
 *
 * `chrome --screenshot` cannot do this job. It has no way to ask for a colour
 * scheme, and it races the entrance animations: the alert rail is driven by
 * `motion/react`, so roughly one capture in three came back with the rail
 * heading and no cards under it. Both problems disappear over the DevTools
 * protocol, which can emulate the media features directly. Asking for
 * `prefers-reduced-motion: reduce` is not a cosmetic choice here, it is what
 * makes the capture reproducible: every animation resolves to its end state
 * immediately because the design tokens collapse to 1 ms.
 *
 * No dependency. Chrome is launched as a child process and driven over a
 * WebSocket, both of which the runtime already has.
 *
 * Usage, with the app already served somewhere:
 *   bun run apps/web/brand/shoot.ts http://localhost:4173
 */

import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { HERO_INSTRUCTION_IDS } from "../src/lib/mock-data";

const CHROME =
  process.env.CHROME_PATH ??
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const PORT = 9333;

/**
 * The line the finding screenshot is of, read off the synthetic run.
 *
 * A folio written down here is a screenshot of the error state the day the seed
 * moves, and `assets/screenshots` is what the README shows a judge.
 */
const DETAIL_PATH = `#/instructions/${HERO_INSTRUCTION_IDS[0] ?? ""}`;
const REPO_ROOT = join(import.meta.dir, "..", "..", "..");
const OUT_DIR = join(REPO_ROOT, "assets", "screenshots");

type Scheme = "light" | "dark";

interface Shot {
  /** Path appended to the base URL. */
  path: string;
  /** File name without the scheme suffix or the extension. */
  name: string;
  width: number;
  height: number;
  /** Capture both themes. Light only when absent, to keep the repo small. */
  both?: boolean;
}

/**
 * Both themes for the two screens a judge looks at longest, light only for the
 * rest. Every file here is carried in git, so the set is the smallest one that
 * covers the README, the Devpost gallery and the responsive claim in #96.
 */
/**
 * The paths carry their `#`, and that is load bearing.
 *
 * `apps/web` is a hash router. Navigating to `/metrics` serves index.html, the
 * app finds an empty hash and redirects itself to the payment run, and the
 * shutter opens on the run screen inside a file called `metrics.png`. That is
 * what happened: four of the eight captures were byte identical copies of the
 * run screen under four different names, which is worse than having no
 * screenshot at all, because a README that shows the wrong screen is a claim
 * nobody checked.
 */
const SHOTS: Shot[] = [
  { path: "#/run", name: "run", width: 1440, height: 1000, both: true },
  {
    path: DETAIL_PATH,
    name: "finding",
    width: 1200,
    height: 1100,
    both: true,
  },
  { path: "#/run", name: "run-tablet", width: 768, height: 1100 },
  { path: "#/run", name: "run-phone", width: 390, height: 900 },
  { path: "#/intake", name: "intake-phone", width: 390, height: 900 },
  { path: "#/sat", name: "sat", width: 1440, height: 1000 },
  { path: "#/cep", name: "cep", width: 1440, height: 1000 },
  { path: "#/metrics", name: "metrics", width: 1440, height: 1000 },
];

/**
 * The tour a README GIF shows, one screen per stop. Navigation only, no
 * clicking: an interaction script is one more thing to go stale, and the point
 * of the loop is to show what the product looks like, not to prove it works.
 * That is what `bun run demo` is for.
 */
/** Same rule as SHOTS: the app is a hash router, so the fragment travels. */
const TOUR = ["#/run", DETAIL_PATH, "#/sat", "#/cep", "#/metrics"];

/** Frames per stop. Six at 8 fps reads as a deliberate pause, not a stutter. */
const FRAMES_PER_STOP = 6;

const SCHEMES: Scheme[] = ["light", "dark"];

/** One in-flight DevTools protocol connection. */
class Devtools {
  private nextId = 1;
  private readonly pending = new Map<
    number,
    { resolve: (value: unknown) => void; reject: (reason: Error) => void }
  >();

  private constructor(private readonly socket: WebSocket) {
    socket.addEventListener("message", (event) => {
      const frame = JSON.parse(String(event.data)) as {
        id?: number;
        result?: unknown;
        error?: { message: string };
      };

      if (frame.id === undefined) return;

      const waiter = this.pending.get(frame.id);
      if (!waiter) return;

      this.pending.delete(frame.id);

      if (frame.error) {
        waiter.reject(new Error(frame.error.message));
        return;
      }

      waiter.resolve(frame.result);
    });
  }

  static async connect(url: string): Promise<Devtools> {
    const socket = new WebSocket(url);

    await new Promise<void>((resolve, reject) => {
      socket.addEventListener("open", () => resolve(), { once: true });
      socket.addEventListener(
        "error",
        () => reject(new Error(`cannot reach ${url}`)),
        { once: true },
      );
    });

    return new Devtools(socket);
  }

  send<T = unknown>(method: string, params: unknown = {}): Promise<T> {
    const id = this.nextId++;

    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, {
        resolve: resolve as (value: unknown) => void,
        reject,
      });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  close(): void {
    this.socket.close();
  }
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * The socket of a page target, not of the browser. `/json/version` hands back
 * the browser endpoint, which has no `Page` domain and fails with a flat
 * "wasn't found" that says nothing about why.
 */
async function pageSocket(): Promise<string> {
  for (let attempt = 0; attempt < 50; attempt++) {
    try {
      const response = await fetch(`http://127.0.0.1:${PORT}/json/list`);
      const targets = (await response.json()) as Array<{
        type: string;
        webSocketDebuggerUrl?: string;
      }>;

      const page = targets.find(
        (target) => target.type === "page" && target.webSocketDebuggerUrl,
      );

      if (page?.webSocketDebuggerUrl) {
        return page.webSocketDebuggerUrl;
      }
    } catch {
      /* Chrome has not opened the port yet. */
    }

    await wait(100);
  }

  throw new Error("Chrome never exposed a page target");
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const frames = args.includes("--frames");
  const base = (
    args.find((a) => !a.startsWith("--")) ?? "http://localhost:4173"
  ).replace(/\/$/, "");

  const chrome = spawn(
    CHROME,
    [
      "--headless=new",
      "--disable-gpu",
      "--hide-scrollbars",
      `--remote-debugging-port=${PORT}`,
      "--user-data-dir=/tmp/sentryone-shoot",
      "about:blank",
    ],
    { stdio: "ignore" },
  );

  try {
    const devtools = await Devtools.connect(await pageSocket());

    await devtools.send("Page.enable");
    await mkdir(OUT_DIR, { recursive: true });

    if (frames) {
      await captureTour(devtools, base);
      devtools.close();

      return;
    }

    for (const shot of SHOTS) {
      for (const scheme of shot.both ? SCHEMES : (["light"] as const)) {
        await devtools.send("Emulation.setDeviceMetricsOverride", {
          width: shot.width,
          height: shot.height,
          deviceScaleFactor: 1,
          mobile: false,
        });

        await devtools.send("Emulation.setEmulatedMedia", {
          features: [
            { name: "prefers-color-scheme", value: scheme },
            /* The point of the whole script. Without it the alert rail is
               mid-animation when the shutter opens. */
            { name: "prefers-reduced-motion", value: "reduce" },
          ],
        });

        /* about:blank first. Two URLs that differ only in the fragment are
           the same document to Page.navigate, so without this the second shot
           of a session captures whatever the first one left on screen. */
        await devtools.send("Page.navigate", { url: "about:blank" });
        await wait(120);
        await devtools.send("Page.navigate", { url: `${base}/${shot.path}` });
        /* The app falls back to the synthetic run when the API is absent, and
           that fallback is a failed fetch with a timeout behind it. */
        await wait(2500);

        /* Clipped to exactly the declared frame. `captureBeyondViewport` on
           its own expands horizontally as well as vertically, so a 390 wide
           phone shot came back 751 wide with the run table's own horizontal
           scroll unrolled into it, which is the opposite of what a responsive
           screenshot is meant to show. It also produced 4000px tall files. */
        const { data } = await devtools.send<{ data: string }>(
          "Page.captureScreenshot",
          {
            format: "png",
            captureBeyondViewport: true,
            clip: {
              x: 0,
              y: 0,
              width: shot.width,
              height: shot.height,
              scale: 1,
            },
          },
        );

        const file = join(
          OUT_DIR,
          shot.both ? `${shot.name}-${scheme}.png` : `${shot.name}.png`,
        );
        await mkdir(dirname(file), { recursive: true });
        await writeFile(file, Buffer.from(data, "base64"));

        console.log(`wrote ${file}`);
      }
    }

    devtools.close();
  } finally {
    chrome.kill();
  }
}

/**
 * Frames for the README loop, written to a temp directory rather than the
 * repository: forty PNGs is not something to carry in git, and the GIF is the
 * artefact worth committing.
 *
 * The muxing is left to ffmpeg, which this machine does not have. Rather than
 * ship an encoder nobody can run tonight, the frames are real and the command
 * is printed. `brew install ffmpeg`, then paste it.
 */
async function captureTour(devtools: Devtools, base: string): Promise<void> {
  const dir = "/tmp/sentryone-frames";
  await mkdir(dir, { recursive: true });

  await devtools.send("Emulation.setDeviceMetricsOverride", {
    width: 1280,
    height: 800,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await devtools.send("Emulation.setEmulatedMedia", {
    features: [
      { name: "prefers-color-scheme", value: "dark" },
      { name: "prefers-reduced-motion", value: "reduce" },
    ],
  });

  let index = 0;

  for (const path of TOUR) {
    await devtools.send("Page.navigate", { url: "about:blank" });
    await wait(120);
    await devtools.send("Page.navigate", { url: `${base}/${path}` });
    await wait(2500);

    for (let frame = 0; frame < FRAMES_PER_STOP; frame++) {
      const { data } = await devtools.send<{ data: string }>(
        "Page.captureScreenshot",
        { format: "png" },
      );

      const file = join(dir, `${String(index).padStart(3, "0")}.png`);
      await writeFile(file, Buffer.from(data, "base64"));
      index++;
      await wait(120);
    }

    console.log(`captured ${path}`);
  }

  console.log(`\n${index} frames in ${dir}`);
  console.log("\nTo build the GIF, with ffmpeg installed:\n");
  console.log(
    `  ffmpeg -y -framerate 4 -i ${dir}/%03d.png \\\n` +
      `    -vf "scale=960:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=128[p];[b][p]paletteuse=dither=bayer" \\\n` +
      `    -loop 0 ${join(REPO_ROOT, "assets", "screenshots", "tour.gif")}`,
  );
}

await main();
