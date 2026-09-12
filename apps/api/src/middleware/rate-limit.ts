/**
 * A per-client fixed-window rate limit, for the one endpoint that reads real
 * data.
 *
 * `GET /api/v1/sat/lookup` answers from the committed download of the official
 * Article 69-B list. It is the endpoint we hand a judge and tell them to type a
 * real RFC into, which is also exactly the shape of an endpoint somebody
 * enumerates: 14234 taxpayers is one afternoon of requests. The list is public
 * and the SAT publishes it as a download, so this is not a secret to protect.
 * It is our own service, and a scraper that turns it into an API costs us the
 * demo.
 *
 * What this is NOT: a defence against a distributed client, or against anybody
 * who can set their own `X-Forwarded-For`. Both are out of reach of an
 * in-process counter and pretending otherwise in a comment would be worse than
 * the gap. What it does buy is that one machine cannot walk the list, and that
 * a runaway retry loop in our own web app cannot take the API down mid-demo.
 *
 * Fixed window rather than a sliding one, on purpose: it is a map read and an
 * integer compare, it needs no timer, and the burst it allows at a window
 * boundary is at most twice the limit, which for a lookup box is nothing. The
 * bookkeeping is bounded by pruning expired keys on write, so a long-lived
 * process does not accumulate one entry per address that ever called it.
 *
 * The state is per process. Two instances behind a load balancer each hold
 * their own counters, which is the honest limitation of not having Redis and is
 * the right trade for one weekend.
 */

import { createMiddleware } from "hono/factory";
import { fail } from "../http";

/** Requests per window, per client. Generous: a person typing cannot reach it. */
export const SAT_LOOKUP_LIMIT = 30;

/** Window length. One minute keeps `Retry-After` a number a human accepts. */
export const SAT_LOOKUP_WINDOW_MS = 60_000;

/** Above this many tracked clients, the expired ones are swept before insert. */
const PRUNE_THRESHOLD = 1024;

const MS_PER_SECOND = 1000;

export interface RateLimitOptions {
  limit?: number;
  windowMs?: number;
  /** Injected by the tests so a window can pass without waiting for one. */
  now?: () => number;
}

interface Window {
  count: number;
  /** Epoch milliseconds at which this window ends. */
  resetAt: number;
}

/**
 * Who is calling.
 *
 * Behind Vercel or a Vultr reverse proxy the socket address is the proxy, so
 * the forwarded header is the only thing that identifies a client. It is
 * caller-controlled and therefore spoofable, which is stated in the module
 * comment rather than hidden behind a helper that looks authoritative.
 *
 * Everything unattributable shares one bucket. That is deliberate: local
 * development and a health checker land there together, and the limit is set
 * high enough that sharing it is not a problem for either.
 */
export function clientKey(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  const first = forwarded?.split(",")[0]?.trim();
  if (first !== undefined && first !== "") {
    return first;
  }

  const real = headers.get("x-real-ip")?.trim();
  return real !== undefined && real !== "" ? real : "unattributed";
}

/** Drops windows that have already expired, so the map cannot grow forever. */
function prune(windows: Map<string, Window>, at: number): void {
  for (const [key, window] of windows) {
    if (window.resetAt <= at) {
      windows.delete(key);
    }
  }
}

export function createRateLimit(options: RateLimitOptions = {}) {
  const limit = options.limit ?? SAT_LOOKUP_LIMIT;
  const windowMs = options.windowMs ?? SAT_LOOKUP_WINDOW_MS;
  const clock = options.now ?? (() => Date.now());
  const windows = new Map<string, Window>();

  return createMiddleware(async (c, next) => {
    const at = clock();
    const key = clientKey(c.req.raw.headers);
    let window = windows.get(key);

    if (window === undefined || window.resetAt <= at) {
      if (windows.size >= PRUNE_THRESHOLD) {
        prune(windows, at);
      }
      window = { count: 0, resetAt: at + windowMs };
      windows.set(key, window);
    }

    window.count += 1;

    const remaining = Math.max(0, limit - window.count);
    const resetSeconds = Math.max(
      1,
      Math.ceil((window.resetAt - at) / MS_PER_SECOND),
    );

    c.header("RateLimit-Limit", String(limit));
    c.header("RateLimit-Remaining", String(remaining));
    c.header("RateLimit-Reset", String(resetSeconds));

    if (window.count > limit) {
      c.header("Retry-After", String(resetSeconds));
      return fail(
        c,
        429,
        "rate_limited",
        `Too many lookups from this client. The limit is ${limit} per minute; try again in ${resetSeconds} s.`,
      );
    }

    await next();
  });
}
