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
 *   bun run apps/web/brand/shoot.ts http://localhost:4173 --only payments
 *
 * `CHROME_PATH` names the browser and `SHOOT_PORT` the DevTools port. Set the port
 * when somebody else may be shooting at the same time; see the constant below.
 */

import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  HERO_INSTRUCTION_IDS,
  LISTED_SUPPLIER_RFC,
  VERIFICATIONS,
} from "../src/lib/mock-data";

const CHROME =
  process.env.CHROME_PATH ??
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

/**
 * The DevTools port, overridable, and that is not a convenience.
 *
 * `pageSocket` attaches to whatever answers `/json/list` on this port. When two
 * people run this script at once the second one attaches to the FIRST one's
 * browser, navigates it to its own base URL and captures a page of somebody else's
 * build, with no error anywhere: that is how `payments-light.png` was first written
 * showing a screen this branch does not have. `SHOOT_PORT` is the way out, and the
 * profile directory follows it so two browsers never share one lock either.
 */
const PORT = Number(process.env.SHOOT_PORT ?? 9333);

/**
 * The line the finding screenshot is of, read off the synthetic run.
 *
 * A folio written down here is a screenshot of the error state the day the seed
 * moves, and `assets/screenshots` is what the README shows a judge.
 */
const DETAIL_PATH = `#/instructions/${HERO_INSTRUCTION_IDS[0] ?? ""}`;

/**
 * The CEP screenshot is of the cent's six states, not of an empty form.
 *
 * The screen only draws the track when the instruction in the query has a
 * verification, and the seeded API has none: nothing on it has been verified, and
 * starting one to take a screenshot would send a real cent down the rail. So this
 * frame is the offline run, where `VERIFICATIONS` carries one instruction per
 * state by construction.
 *
 * `blocked` rather than `released`, because it is the ending that draws the whole
 * machine: the four common steps, both endings, and the one that was taken. The
 * folio is read off the generated mock for the same reason `DETAIL_PATH` is: a
 * folio written down here is a screenshot of an empty state the day the seed
 * moves.
 */
const CEP_PATH = `?data=mock#/cep?instruction=${
  VERIFICATIONS.find((verification) => verification.state === "blocked")
    ?.instructionId ?? ""
}`;
/**
 * The SAT frame is of both articles answering, which is what issue #214 added and
 * what no URL can reach.
 *
 * `#/sat?rfc=` fills the box and stops there: the lookup runs when a person
 * presses Consultar, so a screenshot taken from the URL alone is of an empty
 * panel next to a filled input. This types and presses exactly what a judge at
 * the table types and presses, and then waits for the answer to land.
 *
 * The RFC is the synthetic listed supplier and never a real one. ADR-0002 is the
 * reason: this screen is the one place in the product that touches the real
 * published list, and a real RFC sitting in a committed screenshot beside a
 * generated run is the pairing that ADR says this repository does not ship.
 *
 * React owns the input, so the value goes in through the native setter and an
 * `input` event. Assigning `.value` directly sets the DOM property and leaves
 * React's state on the old value, so the button reads an empty RFC and refuses.
 */
const SAT_LOOKUP = `(async () => {
  const field = document.querySelector("#sat-rfc");
  const press = [...document.querySelectorAll("button")].find(
    (button) => button.textContent.trim() === "Consultar",
  );

  if (field === null || press === undefined) {
    return "no lookup form";
  }

  const setValue = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    "value",
  ).set;
  setValue.call(field, ${JSON.stringify(LISTED_SUPPLIER_RFC)});
  field.dispatchEvent(new Event("input", { bubbles: true }));

  press.click();
  await new Promise((resolve) => setTimeout(resolve, 2500));

  return "ok";
})()`;

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
  /**
   * JavaScript run in the page after it loads and before the shutter opens, for
   * a screen whose interesting state is behind a press rather than behind a URL.
   *
   * One screen needs it and the rule is that it stays that way: this presses
   * what a person would press and never writes state the app would not have
   * produced itself. It is awaited, so it may resolve once the screen has
   * settled.
   */
  prepare?: string;
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
  /* The payments screen is captured offline, and it is the only one that has to
     be. Every other shot renders the same whether or not an API answers, but this
     one prints what the run did on the rail, so with a server reachable the file
     would carry whatever that server happened to have executed, and with a broken
     one it would carry its error notice. `?data=mock` is the deterministic state
     and the page says out loud that it is synthetic. */
  {
    path: "?data=mock#/payments",
    name: "payments",
    width: 1440,
    height: 1200,
    both: true,
  },
  {
    path: DETAIL_PATH,
    name: "finding",
    width: 1200,
    height: 1100,
    both: true,
  },
  { path: "#/run", name: "run-tablet", width: 768, height: 1100 },
  { path: "#/run", name: "run-phone", width: 390, height: 900 },
  {
    path: "?data=mock#/payments",
    name: "payments-phone",
    width: 390,
    height: 1000,
  },
  { path: "#/intake", name: "intake-phone", width: 390, height: 900 },
  /* The entry screen, offline, and the mode is the reason rather than a
     convenience: the panel that says which rail this server holds is the one
     thing on that page whose answer depends on whoever is running an API at the
     moment of the capture, so `?data=mock` is the state the file can be taken of
     twice and come back the same. The phone width is there because this is the
     screen somebody opens first, on whatever they are holding. */
  {
    /* 2620 was the page before its two columns. Shooting a 2175px screen into a
       2620px frame prints four hundred pixels of empty canvas under the last
       panel, which reads as a screen that ran out of content. */
    path: "?data=mock#/entrada",
    name: "entry",
    width: 1440,
    height: 2220,
  },
  {
    path: "?data=mock#/entrada",
    name: "entry-phone",
    width: 390,
    height: 3760,
  },
  {
    path: "#/sat",
    name: "sat",
    width: 1440,
    height: 1100,
    prepare: SAT_LOOKUP,
  },
  { path: CEP_PATH, name: "cep", width: 1440, height: 1000 },
  { path: "#/metrics", name: "metrics", width: 1440, height: 1000 },
  /* The token sheet, in both themes, because the sheet's whole claim is that the
     system holds up in whichever one the browser is in. It is the tall capture
     of the set: every token and every base component is on that page. */
  { path: "#/design", name: "tokens", width: 1440, height: 5020, both: true },
];

/**
 * The tour a README GIF shows, one screen per stop. Navigation only, no
 * clicking: an interaction script is one more thing to go stale, and the point
 * of the loop is to show what the product looks like, not to prove it works.
 * That is what `bun run demo` is for.
 */
/** Same rule as SHOTS: the app is a hash router, so the fragment travels. */
const TOUR = ["#/run", DETAIL_PATH, "#/sat", CEP_PATH, "#/metrics"];

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
  const positional = args.filter((a) => !a.startsWith("--"));
  const base = (positional[0] ?? "http://localhost:4173").replace(/\/$/, "");
  /* `--only <name>` captures one entry of SHOTS and leaves the rest of
     `assets/screenshots` untouched. A new screen otherwise means rewriting all
     ten files, and ten PNGs that differ by a pixel of font rendering is a diff
     nobody can review for the one file that was actually meant to change. */
  const only = args.includes("--only") ? positional[1] : undefined;
  const shots = only
    ? SHOTS.filter(
        (shot) => shot.name === only || shot.name.startsWith(`${only}-`),
      )
    : SHOTS;

  if (only && shots.length === 0) {
    throw new Error(`no shot named ${only}`);
  }

  const chrome = spawn(
    CHROME,
    [
      "--headless=new",
      "--disable-gpu",
      "--hide-scrollbars",
      `--remote-debugging-port=${PORT}`,
      `--user-data-dir=/tmp/sentryone-shoot-${PORT}`,
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

    for (const shot of shots) {
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

        if (shot.prepare !== undefined) {
          await devtools.send("Runtime.evaluate", {
            expression: shot.prepare,
            awaitPromise: true,
          });
        }

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
 * The muxing is left to ffmpeg and the command is printed rather than run, so the
 * script has no dependency it cannot satisfy on a machine that does not have it.
 * `brew install ffmpeg`, then paste it.
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
