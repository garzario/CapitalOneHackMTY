import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import type { ApiDeps } from "../deps";
import { HEARTBEAT_MS, LEDGER_EVENT_NAME, READY_EVENT_NAME } from "../events";

/**
 * `GET /api/v1/events`, Server-Sent Events.
 *
 * Every appended `LedgerEvent` arrives as `event: ledger` with the event itself
 * as JSON, so the payment-run screen and the sweep animation never poll. SSE and
 * not a WebSocket on purpose: the traffic is one way, it survives a proxy that
 * only speaks HTTP, and the browser reconnects on its own.
 *
 * Three details that are easy to get wrong and expensive to debug at 04:00:
 *
 * - A `ready` event is sent immediately, so the client knows the stream is live
 *   rather than waiting for the first thing to happen.
 * - A comment line every 15 seconds keeps the connection through proxies that
 *   close a silent stream, and `X-Accel-Buffering: no` stops a reverse proxy
 *   from holding the first chunk.
 * - The subscription is removed when the client goes away, from either side:
 *   `onAbort` covers the stream being cancelled, and the request signal covers
 *   the Node runtime dropping the socket. Missing either one leaks a listener
 *   per reload.
 */
export function eventRoutes(deps: ApiDeps) {
  return new Hono().get("/", (c) => {
    c.header("X-Accel-Buffering", "no");

    return streamSSE(c, async (stream) => {
      let sequence = 0;
      const nextId = () => String(sequence++);

      const unsubscribe = deps.events.subscribe((event) => {
        // write() swallows its own errors, so a closed stream cannot take the
        // publisher down with it.
        void stream.writeSSE({
          event: LEDGER_EVENT_NAME,
          id: nextId(),
          data: JSON.stringify(event),
        });
      });

      const closed = new Promise<void>((resolve) => {
        stream.onAbort(resolve);
        const { signal } = c.req.raw;
        if (signal.aborted) {
          resolve();
          return;
        }
        signal.addEventListener("abort", () => resolve(), { once: true });
      });

      const heartbeat = setInterval(() => {
        // A comment line, not a message: clients ignore it and proxies count it
        // as traffic.
        void stream.write(": heartbeat\n\n");
      }, HEARTBEAT_MS);

      try {
        await stream.writeSSE({
          event: READY_EVENT_NAME,
          id: nextId(),
          data: JSON.stringify({
            at: deps.clock.now(),
            subscribers: deps.events.subscribers,
          }),
        });
        await closed;
      } finally {
        clearInterval(heartbeat);
        unsubscribe();
      }
    });
  });
}
