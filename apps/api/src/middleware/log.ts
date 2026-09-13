/**
 * One log line per request, and the request id is the first thing on it.
 *
 * The point is the join. `X-Request-Id` is already on every response, and the error
 * envelope in `src/http.ts` already carries it, so a judge who sees a 500 on screen
 * can read the id off the payload and find the request in the container log. Until
 * this middleware existed only the failures were logged, which meant the id was
 * useful for exactly the requests that had already gone wrong.
 *
 * **The query string is deliberately dropped.** `c.req.path` is the pathname and
 * nothing else, and that is a privacy decision rather than a convenience: the one
 * endpoint in this API that reads real data takes its argument in the query string,
 * so `GET /api/v1/sat/lookup?rfc=...` carries the RFC of a real Mexican taxpayer.
 * A log line is the easiest thing in a system to copy into an issue or a screen
 * recording, and `docs/06-regulatory-privacy.md` is what that would breach. The
 * parameters inside a path are synthetic ids of our own company, which is why those
 * are allowed to stay.
 *
 * The sink is injected through `ApiDeps.log`, which is what lets the suite assert
 * the shape of a line and lets 1341 tests run without printing 1341 of them.
 */

import { createMiddleware } from "hono/factory";
import { UNKNOWN_REQUEST_ID } from "../http";

export type LogSink = (line: string) => void;

/**
 * `[<id>] <method> <path> <status> <ms>ms`, in that order, because the id is what a
 * reader greps for and a fixed prefix is what makes grepping work.
 */
export function requestLine(input: {
  id: string;
  method: string;
  path: string;
  status: number;
  ms: number;
}): string {
  return `[${input.id}] ${input.method} ${input.path} ${input.status} ${input.ms}ms`;
}

export function createRequestLog(log: LogSink) {
  return createMiddleware(async (c, next) => {
    const started = Date.now();
    await next();

    const id: string | undefined = c.get("requestId");
    log(
      requestLine({
        id: id ?? UNKNOWN_REQUEST_ID,
        method: c.req.method,
        path: c.req.path,
        status: c.res.status,
        ms: Date.now() - started,
      }),
    );
  });
}
