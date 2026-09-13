import { describe, expect, it } from "bun:test";
import { createTestApp } from "../apps/api/src/test-app.ts";

/**
 * Every endpoint this API serves has to be reachable through the Vercel origin.
 *
 * The browser only ever talks to Vercel: `apps/web` ships with no base URL, so a
 * path that no rewrite in `vercel.json` matches is a 404 on the deployed product and
 * a green test suite, which is the most expensive shape a bug can have on a judging
 * day. The two rewrites cover two roots, `/api` and `/health`, and the reason this
 * file exists is that the set of paths under them grows every few hours: the
 * assistant SSE, the payment execution stream, the layout response and the carta all
 * landed after those two lines were written.
 *
 * So the check is mechanical rather than a memory. The route tree is read off the
 * app itself, the rewrite sources are read off `vercel.json`, and the assertion is
 * that each of the first is matched by one of the second. Nothing here opens a
 * socket: both sides are already on this disk.
 */

const ROOT = new URL("..", import.meta.url).pathname;

type Rewrite = { source: string; destination: string };
type HeaderRule = { source: string; headers: { key: string; value: string }[] };

const config = (await Bun.file(`${ROOT}vercel.json`).json()) as {
  rewrites: Rewrite[];
  headers: HeaderRule[];
};

/**
 * A Vercel source pattern as a regular expression.
 *
 * `:name*` matches the rest of the path including nothing at all, which is why it
 * swallows the slash in front of it; `:name` matches one segment; `(.*)` is already a
 * regular expression and is left alone.
 */
function matcherFor(source: string): RegExp {
  const pattern = source
    .replace(/[.+?^${}|[\]\\]/g, "\\$&")
    .replace(/\/:[A-Za-z0-9_]+\*/g, "(?:/.*)?")
    .replace(/:[A-Za-z0-9_]+/g, "[^/]+");

  return new RegExp(`^${pattern}$`);
}

/** A Hono path with its parameters filled in, so it can be matched as a URL. */
function concrete(path: string): string {
  return path.replace(/:[A-Za-z0-9_]+/g, "sample");
}

/**
 * The endpoints, read off the app.
 *
 * Middleware is registered on `*` and on `/api/v1/*` and is not an endpoint, so the
 * wildcard mounts are dropped. Everything that survives is a path a client can call.
 */
function endpoints(): string[] {
  const { app } = createTestApp();
  const paths = app.routes
    .filter((route) => !route.path.endsWith("*"))
    .map((route) => concrete(route.path));

  return [...new Set(paths)].sort();
}

const matchers = config.rewrites.map((rewrite) => matcherFor(rewrite.source));

function covered(path: string): boolean {
  return matchers.some((matcher) => matcher.test(path));
}

describe("the Vercel rewrites cover the API", () => {
  it("found the route tree, so an empty list cannot pass this file", () => {
    expect(endpoints().length).toBeGreaterThan(25);
  });

  it("matches every endpoint the API serves", () => {
    const orphans = endpoints().filter((path) => !covered(path));

    expect(orphans).toEqual([]);
  });

  it("covers the assistant stream, the execution stream and the event stream", () => {
    /* The three that stream. Named one by one rather than left to the loop above,
       because these are the ones a rewrite breaking would be noticed on stage: the
       panel answers nothing, the run sends nothing, and the screen stops moving. */
    expect(covered("/api/v1/assistant/messages")).toBe(true);
    expect(covered("/api/v1/run/current/execute")).toBe(true);
    expect(covered("/api/v1/events")).toBe(true);
  });

  it("covers /health, which the status card and the deploy script both call", () => {
    expect(covered("/health")).toBe(true);
  });

  it("sends every path to one origin, so an address change is one edit", () => {
    const origins = new Set(
      config.rewrites.map((rewrite) => new URL(rewrite.destination).origin),
    );

    expect(origins.size).toBe(1);
  });

  it("rewrites over HTTPS and never to a machine that is not the instance", () => {
    for (const rewrite of config.rewrites) {
      const url = new URL(rewrite.destination);

      expect(url.protocol).toBe("https:");
      expect(url.hostname).not.toBe("localhost");
      expect(url.hostname).not.toBe("127.0.0.1");
    }
  });

  it("keeps the API and /health out of any cache", () => {
    /* A CDN that cached `GET /api/v1/run/current` would show a judge last hour's run,
       and a cached event stream is not a stream at all. The static assets keep their
       immutable year; everything proxied is no-store. */
    for (const source of ["/api/(.*)", "/health"]) {
      const rule = config.headers.find((entry) => entry.source === source);
      const cacheControl = rule?.headers.find(
        (header) => header.key.toLowerCase() === "cache-control",
      );

      expect(cacheControl?.value).toBe("no-store");
    }
  });
});
