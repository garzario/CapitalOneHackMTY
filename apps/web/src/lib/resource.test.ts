/**
 * The data mode is a promise made in the URL, and this is where it is kept.
 *
 * `?data=mock` is documented in `README.md` and at the top of `resource.ts` as
 * "no request leaves the browser". It was not true. `useResource` honoured it,
 * so every screen that loads through it was silent, but two things open a
 * connection on their own and neither asked: the run screen's event stream and
 * the API status card. Under `?data=mock` the run screen therefore said "Datos:
 * solo datos sinteticos" and "Flujo de eventos conectado" at the same time, and
 * the status card reported on a server the page had promised not to ask.
 *
 * So there are two kinds of test here. The unit tests fix the rule. The source
 * test is the one that matters, because the bug is not any particular call site
 * but the class of them: a component added at 04:00 that reaches the network
 * without consulting the mode. It reads the sources rather than rendering them,
 * which proves the guard is present in the file and not that it is correct at
 * runtime; the runtime proof is a headless browser counting requests, and that
 * is what `?data=mock` was measured with.
 */

import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { reachesApi, readDataMode } from "./resource";

const WEB_SRC = join(import.meta.dir, "..");

describe("readDataMode", () => {
  test("reads the three documented modes", () => {
    expect(readDataMode("?data=api")).toBe("api");
    expect(readDataMode("?data=mock")).toBe("mock");
    expect(readDataMode("?data=auto")).toBe("auto");
  });

  test("defaults to auto for anything else", () => {
    /* Including a typo. A mode nobody recognises must not silently become the
       offline one: a judge who mistyped `?data=moc` should see the API. */
    expect(readDataMode("")).toBe("auto");
    expect(readDataMode("?data=moc")).toBe("auto");
    expect(readDataMode("?data=")).toBe("auto");
    expect(readDataMode("?other=mock")).toBe("auto");
  });

  test("reads the query and not the hash, which is where the route lives", () => {
    expect(readDataMode("?data=mock")).toBe("mock");
    /* The app is a hash router, so `#/cep?instruction=...` carries its own
       query. That one is the route's, not the page's. */
    expect(readDataMode("?data=api&other=1")).toBe("api");
  });
});

describe("reachesApi", () => {
  test("is false only for the offline mode", () => {
    expect(reachesApi("mock")).toBe(false);
    expect(reachesApi("api")).toBe(true);
    /* `auto` is API first by definition: it is allowed to try and to fail, and
       the failure is what the fallback notice on screen is about. */
    expect(reachesApi("auto")).toBe(true);
  });
});

/**
 * Files allowed to name the two calls without a guard, each with the reason.
 *
 * `api.ts` defines them. Nothing else gets an entry without a sentence here
 * saying why the mode does not apply to it.
 */
const EXEMPT: Record<string, string> = {
  "lib/api.ts": "defines useEvents and getHealth",
};

function sourceFiles(dir: string, prefix = ""): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const here = prefix === "" ? entry.name : `${prefix}/${entry.name}`;

    if (entry.isDirectory()) {
      return sourceFiles(join(dir, entry.name), here);
    }

    return /\.tsx?$/.test(entry.name) && !entry.name.includes(".test.")
      ? [here]
      : [];
  });
}

/** The text between the parentheses of every call to `name` in `source`. */
function callArguments(source: string, name: string): string[] {
  const out: string[] = [];
  const needle = `${name}(`;
  let from = source.indexOf(needle);

  while (from !== -1) {
    let depth = 0;
    let at = from + needle.length - 1;

    for (; at < source.length; at++) {
      const character = source[at];

      if (character === "(") depth += 1;
      if (character === ")") {
        depth -= 1;
        if (depth === 0) break;
      }
    }

    out.push(source.slice(from + needle.length, at));
    from = source.indexOf(needle, at);
  }

  return out;
}

describe("no component reaches the API without consulting the data mode", () => {
  const files = sourceFiles(WEB_SRC).filter(
    (relative) => EXEMPT[relative] === undefined,
  );
  const sources = new Map(
    files.map((relative) => [
      relative,
      readFileSync(join(WEB_SRC, relative), "utf8"),
    ]),
  );

  test("there are sources to check, so an empty walk cannot pass", () => {
    expect(files.length).toBeGreaterThan(20);
  });

  /**
   * `useEvents` opens an EventSource the moment it mounts unless it is told not
   * to, so the check is on the call and not on the file. A file-wide search for
   * the word "mock" would have passed on the run screen while it was broken: it
   * already carried `source !== "mock"` on the constancia link, three hundred
   * lines away from the stream it was not guarding.
   */
  const streamCallers = files.filter((relative) =>
    (sources.get(relative) ?? "").includes("useEvents("),
  );

  test("the walk found the screens that open the stream", () => {
    expect(streamCallers.length).toBeGreaterThan(0);
  });

  for (const relative of streamCallers) {
    test(`${relative} passes enabled: to useEvents`, () => {
      const calls = callArguments(sources.get(relative) ?? "", "useEvents");

      expect(calls.length).toBeGreaterThan(0);

      for (const call of calls) {
        expect(call).toContain("enabled:");
      }
    });
  }

  /**
   * `getHealth` is a plain fetch inside a callback, so there is no argument to
   * inspect: what this asserts is that the file consulted the mode at all. It is
   * the weaker of the two checks and it is worth saying so, because a file could
   * import the guard and not use it. What it does buy is the case that happened,
   * which is a component that never knew the mode existed.
   */
  const healthCallers = files.filter((relative) =>
    (sources.get(relative) ?? "").includes("getHealth("),
  );

  test("the walk found the component that reads /health", () => {
    expect(healthCallers.length).toBeGreaterThan(0);
  });

  for (const relative of healthCallers) {
    test(`${relative} consults the data mode before reading /health`, () => {
      expect(sources.get(relative) ?? "").toContain("reachesApi");
    });
  }
});
