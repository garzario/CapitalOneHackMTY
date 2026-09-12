/**
 * The two endpoints of the one-cent verification.
 *
 * `POST /api/v1/instructions/:id/verify-account` sends the cent and answers `202`
 * with the verification as far as it got synchronously. `GET .../verification`
 * answers the same shape, folded out of the ledger, and is what the screen polls
 * and what it re-reads when the SSE stream names this instruction.
 *
 * Transport only, like every other file under `src/routes`: the pipeline is
 * `src/verification.ts` and the decision is the engine's. What lives here is the
 * mapping from four outcomes to four status codes, and it is worth writing down
 * because three of them are about us and not about the caller.
 *
 * - `202` and not `200`: the cent has left, and on a real rail the CEP is published
 *   after the transfer settles, so the work this call started is not finished when
 *   the response is written. The body says exactly how far it got.
 * - `404` when no such instruction exists.
 * - `409` when the instruction is already released or blocked on a CEP. A second
 *   cent would cost another centavo and prove nothing new, and silently re-running
 *   would overwrite a decision somebody may already have acted on.
 * - `503` when this server has no rail. That is our configuration, not the
 *   request: a `422` would tell a clerk their request was wrong when it was not,
 *   and the message names the variables, so the answer is actionable instead of
 *   mysterious.
 *
 * It is mounted as a third router on `/instructions`, next to the verification
 * call, for the same reason: this feature is one file that can be reverted in one
 * commit while somebody else edits the intake next door.
 */

import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import type { ApiDeps } from "../deps";
import { fail, notFound, rejectInvalid } from "../http";
import { idParamSchema, type VerificationStateResponse } from "../schemas";
import { verificationStateOf, verifyAccount } from "../verification";

export function verifyAccountRoutes(deps: ApiDeps) {
  return new Hono()
    .get(
      "/:id/verification",
      zValidator("param", idParamSchema, rejectInvalid),
      async (c) => {
        const { id } = c.req.valid("param");
        const detail = await deps.repo.instructionDetail(id);

        if (detail === undefined) {
          return notFound(c, `No instruction with id ${id}.`);
        }

        /* `not_started` is a real answer and not an empty one: it says the cent
           has not been sent, which is exactly what the screen needs to offer the
           button. */
        const state: VerificationStateResponse = await verificationStateOf(
          deps,
          detail,
        );

        return c.json(state);
      },
    )
    .post(
      "/:id/verify-account",
      zValidator("param", idParamSchema, rejectInvalid),
      async (c) => {
        const { id } = c.req.valid("param");
        const outcome = await verifyAccount(deps, id);

        if (!outcome.ok) {
          if (outcome.failure === "not_found") {
            return notFound(c, outcome.message);
          }
          if (outcome.failure === "conflict") {
            return fail(c, 409, "conflict", outcome.message);
          }
          /* No rail, and a rail that refused the cent, are one answer: this
             server cannot do it right now and nothing about the request was
             wrong. Both say what would change that. */
          return fail(c, 503, "service_unavailable", outcome.message);
        }

        /* The poll is deliberately not awaited. The clerk has the clave de
           rastreo now, and the states that follow reach the screen over the SSE
           stream, which is the same path every other ledger event takes. */
        if (outcome.pending !== undefined) {
          void outcome.pending;
        }

        const state: VerificationStateResponse = outcome.state;

        return c.json(state, 202);
      },
    );
}
