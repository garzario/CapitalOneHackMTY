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

const CHROME =
  process.env.CHROME_PATH ??
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const PORT = 9333;
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
}

const SHOTS: Shot[] = [
  { path: "/run", name: "run", width: 1600, height: 1100 },
  { path: "/run", name: "run-narrow", width: 900, height: 1200 },
];

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
  const base = (process.argv[2] ?? "http://localhost:4173").replace(/\/$/, "");

  const chrome = spawn(
    CHROME,
    [
      "--headless=new",
      "--disable-gpu",
      "--hide-scrollbars",
      `--remote-debugging-port=${PORT}`,
      "--user-data-dir=/tmp/ceptinela-shoot",
      "about:blank",
    ],
    { stdio: "ignore" },
  );

  try {
    const devtools = await Devtools.connect(await pageSocket());

    await devtools.send("Page.enable");
    await mkdir(OUT_DIR, { recursive: true });

    for (const shot of SHOTS) {
      for (const scheme of SCHEMES) {
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

        await devtools.send("Page.navigate", { url: `${base}${shot.path}` });
        /* The app falls back to the synthetic run when the API is absent, and
           that fallback is a failed fetch with a timeout behind it. */
        await wait(2500);

        const { data } = await devtools.send<{ data: string }>(
          "Page.captureScreenshot",
          { format: "png", captureBeyondViewport: true },
        );

        const file = join(OUT_DIR, `${shot.name}-${scheme}.png`);
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

await main();
