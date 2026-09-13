import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import type { ApiDeps } from "../deps";
import { fail, notFound, rejectInvalid } from "../http";
import { consortiumQuerySchema } from "../schemas";

/**
 * The consortium surface: one read, and deliberately only one.
 *
 * `GET /api/v1/consortium/signal?rfc=&clabe=` answers what the network holds for
 * one beneficiary pair, out of the LOCAL snapshot. It exists so the UI and a
 * judge can ask the question directly instead of only seeing the answer inside a
 * finding, and so the three states can be told apart from outside:
 *
 * - `503 service_unavailable` when `ALLOW_CONSORTIUM` is not 1. The route exists
 *   and this instance will not answer it, which is a different statement from a
 *   404 that pretends the endpoint is not there. The message names the flag.
 * - `404 not_found` when the network has never seen the pair, or when nothing has
 *   ever been pulled into the snapshot. Both messages say which of the two it is,
 *   because "run the pull" and "the network does not know this account" are
 *   different actions for whoever is reading.
 * - `200` with the `NetworkSignal` from `packages/core/src/domain.ts`.
 *
 * What there is deliberately no shape of request for: a search. The query needs
 * both the RFC and the exact eighteen-digit CLABE, so it can only be asked by
 * somebody who already holds both, exactly like the CEP endpoint next door. There
 * is no listing, no prefix match and no "which accounts does this supplier have",
 * because that would turn a fraud-prevention signal into a directory of other
 * companies' banking relationships. `docs/06-regulatory-privacy.md` holds the
 * rule; this comment holds the consequence for this file.
 *
 * It never reaches Snowflake. `deps.consortium` reads the snapshot through the
 * repository, so this endpoint answers in a millisecond, works offline and cannot
 * be the thing that puts a warehouse on the hot path.
 */
export function consortiumRoutes(deps: ApiDeps) {
  return new Hono().get(
    "/signal",
    zValidator("query", consortiumQuerySchema, rejectInvalid),
    async (c) => {
      const { rfc, clabe } = c.req.valid("query");
      const answer = await deps.consortium.lookup({ rfc, clabe });

      if (!answer.ok) {
        return answer.miss === "disabled"
          ? fail(c, 503, "service_unavailable", answer.message)
          : notFound(c, answer.message);
      }

      return c.json({ rfc, clabe, network: answer.signal });
    },
  );
}
