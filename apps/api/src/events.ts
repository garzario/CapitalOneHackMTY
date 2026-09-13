/**
 * The in-process fan-out behind `GET /api/v1/events`.
 *
 * Every appended `LedgerEvent` is published here and every open SSE connection
 * receives it, so the payment-run screen and the sweep animation update without
 * polling. It is a Set of callbacks on purpose: no EventEmitter, no bun:* and no
 * Node-only global, because this workspace has to run on the Vercel Node runtime
 * per ADR-0005 and in `bun test` without a socket.
 *
 * One deliberate limit: this fans out inside one process. Two API instances do
 * not see each other's events, so a browser connected to instance B misses what
 * instance A appended.
 *
 * TODO(fabbyyyy): when the API runs on more than one instance, replace the
 * publish side with Postgres LISTEN/NOTIFY on the ledger table. The
 * `LedgerBroadcaster` interface stays; only `createBroadcaster` changes.
 */

import type { LedgerEvent } from "@hackmty/core";

export type LedgerListener = (event: LedgerEvent) => void;

export interface LedgerBroadcaster {
  /** Returns the unsubscribe function. Calling it twice is safe. */
  subscribe(listener: LedgerListener): () => void;
  publish(event: LedgerEvent): void;
  /** Open connections. The health and demo screens show it. */
  readonly subscribers: number;
}

/** SSE event names, used by the route and by the web client. */
export const LEDGER_EVENT_NAME = "ledger";
export const READY_EVENT_NAME = "ready";

/**
 * Proxies and load balancers close a stream that says nothing. A comment line
 * every 15 seconds is cheap and keeps the connection open through them.
 */
export const HEARTBEAT_MS = 15_000;

/**
 * The first bytes of a stream, written before the work that will fill it.
 *
 * A comment line and not an event: SSE clients drop it, it adds no name to the
 * five in docs/09-api.md, and it is the same mechanism the heartbeat already
 * uses. What it buys is the flush. A proxy between the browser and this API
 * decides for itself when to hand the response headers on, and the ones we do
 * not control hold them until the first body byte: through the Vite dev proxy
 * an assistant turn with a screenshot delivered its headers only when the
 * extractor and the model had both answered, twenty-eight seconds later, and
 * `streamSse` in `apps/web/src/lib/api.ts` had already given up at its six
 * second header ceiling and printed "The API did not answer within 6000 ms"
 * over a turn the server went on to complete. Writing this first makes the
 * headers leave with it, so the ceiling measures the server being alive, which
 * is what that ceiling is for, rather than how slow the answer is.
 */
export const STREAM_OPEN_COMMENT = ": abierto\n\n";

export function createBroadcaster(): LedgerBroadcaster {
  const listeners = new Set<LedgerListener>();

  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    publish(event) {
      // Copied first: a listener that iterates while another unsubscribes must
      // not skip a neighbour, and one that throws must not silence the rest.
      for (const listener of [...listeners]) {
        try {
          listener(event);
        } catch (cause) {
          console.error("ledger listener failed:", cause);
        }
      }
    },

    get subscribers() {
      return listeners.size;
    },
  };
}
