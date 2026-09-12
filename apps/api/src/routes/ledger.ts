import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import type { ApiDeps } from "../deps";
import { rejectInvalid } from "../http";
import { ledgerQuerySchema } from "../schemas";

/**
 * The append-only ledger, in order, for the timeline.
 *
 * `since` is exclusive and compared as an instant rather than as a string, so a
 * client sending an offset such as -06:00 gets the same answer as one sending Z.
 * Monterrey is UTC minus 6 all year and our ledger stores the instant, which is
 * the whole reason intraday ordering exists here and not in Nessie.
 */
export function ledgerRoutes(deps: ApiDeps) {
  return new Hono().get(
    "/",
    zValidator("query", ledgerQuerySchema, rejectInvalid),
    async (c) => {
      const { since, limit } = c.req.valid("query");
      const query: { since?: string; limit?: number } = {};
      if (since !== undefined) {
        query.since = since;
      }
      if (limit !== undefined) {
        query.limit = limit;
      }

      return c.json({ events: await deps.repo.ledger(query) });
    },
  );
}
