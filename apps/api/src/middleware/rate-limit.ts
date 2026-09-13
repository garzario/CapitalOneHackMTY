/**
 * A per-client token bucket, in memory, for the reads that touch real data and for
 * every write.
 *
 * Two things it is for, and they are different problems.
 *
 * `GET /api/v1/sat/lookup` answers from the committed download of the official
 * Article 69-B list. It is the endpoint we hand a judge and tell them to type a
 * real RFC into, which is also exactly the shape of an endpoint somebody
 * enumerates: 14234 taxpayers is one afternoon of requests. The list is public and
 * the SAT publishes it as a download, so this is not a secret to protect. It is our
 * own service, and a scraper that turns it into an API costs us the demo.
 *
 * Every write, because a write appends to the ledger, and three of them cost real
 * money: a turn of the assistant panel calls a paid model, the one-cent
 * verification sends a centavo, and the payment run sends the run. A retry loop in
 * our own web app is the likeliest cause of all three, which is the failure this
 * limit is actually written for, and a loop that appends ten thousand events to an
 * append-only ledger cannot be undone by deleting rows.
 *
 * What this is NOT: a defence against a distributed client, or against anybody who
 * can set their own `X-Forwarded-For`. Both are out of reach of an in-process
 * counter and pretending otherwise in a comment would be worse than the gap. What
 * it does buy is that one machine cannot walk the list or spend the token budget,
 * and that a runaway loop cannot take the API down mid-demo.
 *
 * **A token bucket and not a fixed window.** The window this file used to hold was
 * a map read and an integer compare, and it had the boundary that every fixed
 * window has: a client that exhausts its budget waits, gets the whole allowance
 * back at once, and can burst twice the limit across the edge. A bucket refills
 * continuously, so the honest clerk who confirms eight lines in a row is never
 * refused and the loop is throttled to the refill rate rather than released in
 * batches. It is still a map read and some arithmetic, it still needs no timer, and
 * `Retry-After` becomes a real answer: the seconds until one token exists, rather
 * than the seconds until a window nobody can see rolls over. The bookkeeping is
 * bounded by pruning full buckets on write, so a long-lived process does not
 * accumulate one entry per address that ever called it.
 *
 * The state is per process. Two instances behind a load balancer each hold their
 * own buckets, which is the honest limitation of not having Redis and is the right
 * trade for one weekend.
 */

import { createMiddleware } from "hono/factory";
import { fail } from "../http";

/** Requests per window, per client. Generous: a person typing cannot reach it. */
export const SAT_LOOKUP_LIMIT = 30;

/** Window length. One minute keeps `Retry-After` a number a human accepts. */
export const SAT_LOOKUP_WINDOW_MS = 60_000;

/**
 * Writes per minute, per client, across every write endpoint in `docs/09-api.md`.
 *
 * Two a second sustained, and the whole minute's worth available at once. A clerk
 * working a ninety-line run at speed does not reach it, `bun run demo` does not
 * reach it, and a loop exceeds it in under a second. The assistant panel keeps its
 * own tighter bucket on top of this one, because a turn costs tokens rather than a
 * row.
 */
export const WRITE_LIMIT = 120;

/** Above this many tracked clients, the full ones are swept before insert. */
const PRUNE_THRESHOLD = 1024;

const MS_PER_SECOND = 1000;

export interface RateLimitOptions {
  /** Bucket capacity, and the sustained rate per `windowMs`. */
  limit?: number;
  /** How long a full bucket takes to refill from empty. */
  windowMs?: number;
  /** Injected by the tests so time can pass without waiting for it. */
  now?: () => number;
  /**
   * What the 429 calls the thing that was counted. The lookup box counts lookups,
   * the assistant panel counts turns and the ledger counts writes, and a clerk
   * reading "too many lookups" after confirming a payment would go looking for a
   * lookup she never made.
   */
  label?: string;
  /**
   * Count only the methods that change something, so one middleware on the whole
   * `/api/v1` tree covers every write without touching a route file and without
   * charging a screen for reading.
   */
  writesOnly?: boolean;
}

/** True for the methods that change something. Everything else is a read. */
export function isWrite(method: string): boolean {
  const normalized = method.toUpperCase();
  return (
    normalized !== "GET" && normalized !== "HEAD" && normalized !== "OPTIONS"
  );
}

interface Bucket {
  /** Tokens left, fractional between refills. */
  tokens: number;
  /** When `tokens` was last brought up to date. */
  at: number;
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

/** Drops buckets that have refilled completely, so the map cannot grow forever. */
function prune(buckets: Map<string, Bucket>, limit: number): void {
  for (const [key, bucket] of buckets) {
    if (bucket.tokens >= limit) {
      buckets.delete(key);
    }
  }
}

export function createRateLimit(options: RateLimitOptions = {}) {
  const limit = options.limit ?? SAT_LOOKUP_LIMIT;
  const windowMs = options.windowMs ?? SAT_LOOKUP_WINDOW_MS;
  const clock = options.now ?? (() => Date.now());
  const label = options.label ?? "lookups";
  const writesOnly = options.writesOnly ?? false;
  /** Tokens per millisecond. One full bucket per window, by definition. */
  const refill = limit / windowMs;
  const buckets = new Map<string, Bucket>();

  return createMiddleware(async (c, next) => {
    if (writesOnly && !isWrite(c.req.method)) {
      return next();
    }

    const at = clock();
    const key = clientKey(c.req.raw.headers);
    const bucket = buckets.get(key);

    let tokens: number;
    if (bucket === undefined) {
      if (buckets.size >= PRUNE_THRESHOLD) {
        prune(buckets, limit);
      }
      tokens = limit;
    } else {
      /* Continuous refill, capped at the capacity. Elapsed time is clamped at zero
         so a clock that jumps backwards cannot mint tokens. */
      const elapsed = Math.max(0, at - bucket.at);
      tokens = Math.min(limit, bucket.tokens + elapsed * refill);
    }

    const allowed = tokens >= 1;
    const left = allowed ? tokens - 1 : tokens;
    buckets.set(key, { tokens: left, at });

    /* Seconds until the bucket is full again, which is what RateLimit-Reset means:
       the point at which this client's whole allowance is back. */
    const resetSeconds = Math.max(
      0,
      Math.ceil((limit - left) / refill / MS_PER_SECOND),
    );

    c.header("RateLimit-Limit", String(limit));
    c.header("RateLimit-Remaining", String(Math.floor(left)));
    c.header("RateLimit-Reset", String(resetSeconds));

    if (!allowed) {
      /* Seconds until one token exists, never zero, because a Retry-After of 0 is
         an invitation to retry immediately and get the same 429. */
      const retrySeconds = Math.max(
        1,
        Math.ceil((1 - left) / refill / MS_PER_SECOND),
      );
      c.header("Retry-After", String(retrySeconds));
      return fail(
        c,
        429,
        "rate_limited",
        `Too many ${label} from this client. The limit is ${limit} per minute, refilled continuously; try again in ${retrySeconds} s.`,
      );
    }

    await next();
  });
}
