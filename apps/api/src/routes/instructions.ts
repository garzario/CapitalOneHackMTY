import {
  definitiveListingReason,
  estimateLoss,
  holdWindow,
  releasedByAPerson,
} from "@hackmty/core";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { ACTOR_HEADER, parseActor } from "../actor";
import type { ApiDeps } from "../deps";
import { fail, notFound, rejectInvalid } from "../http";
import { detailLevels } from "../levels";
import { runIntake } from "../pipeline";
import {
  createInstructionBodySchema,
  type DecideBody,
  type DecideResponse,
  decideBodySchema,
  type InstructionDetail,
  type InstructionDetailResponse,
  idParamSchema,
} from "../schemas";

/**
 * Intake and the human decision.
 *
 * SentryOne never moves money. A release is a person saying yes, and the SPEI
 * still leaves from the company's own banking portal, which is why this file
 * appends `decision_made` and never `payment_sent`. That event arrives later,
 * from bank reconciliation, and it is the only one that means pesos actually
 * left.
 *
 * Two things travel with that yes, and a Capital One judge asked for both on
 * 2026-09-12. The pesos the person accepted responsibility for, stated as
 * `amountAtRisk` rather than left to be re-derived. And `hold`, the deadline the
 * payment is stopped until, which is the same delay the expected-loss arithmetic
 * already charged for. Neither is stored: both are functions of the decision and
 * the clock, so neither can drift away from the decision it describes.
 *
 * The third thing this file enforces is the reopening, which is issue #204 and
 * ADR-0009 row 4. A definitive SAT listing under article 69-B or article 49 Bis
 * cancels the line on the evidence, because the comprobantes have no fiscal effect
 * at all and that is not a hold somebody can wait out. The only way back is a
 * release signed by a named OWNER with a written reason, which is exactly the
 * exception `docs/02-persona.md` says the owner approves, and it is checked here
 * against the `X-Actor` header. See `src/actor.ts` for why the check lives in this
 * issue rather than waiting for the general middleware of issue #199.
 */
export function instructionRoutes(deps: ApiDeps) {
  return new Hono()
    .get(
      "/:id",
      zValidator("param", idParamSchema, rejectInvalid),
      async (c) => {
        const { id } = c.req.valid("param");
        const detail = await deps.repo.instructionDetail(id);

        if (detail === undefined) {
          return notFound(c, `No instruction with id ${id}.`);
        }

        /* The window is computed here and not in the repository, because the
           repository owns no clock. `null` means the money is not stopped.

           The level and the state come from the same `assessLine` the run payload
           reads, so a judge who clicks a line of the run and lands here sees the
           same two words. That is the whole point of ADR-0009 and the failure of
           issue #125 is what it was written after. */
        const response: InstructionDetailResponse = {
          ...detail,
          hold:
            detail.decision === null
              ? null
              : holdWindow(detail.decision, { now: deps.clock.now() }),
          ...detailLevels(detail),
        };

        return c.json(response);
      },
    )
    .post(
      "/",
      zValidator("json", createInstructionBodySchema, rejectInvalid),
      async (c) => {
        const outcome = await runIntake(deps, c.req.valid("json"));

        if (!outcome.ok) {
          return fail(c, 422, "unprocessable", outcome.message);
        }

        const { instruction, findings, decision } = outcome.record;
        await deps.repo.saveIntake(outcome.record);
        await deps.emit({
          type: "instruction_received",
          at: instruction.receivedAt,
          instruction,
        });
        await deps.emit({
          type: "decision_made",
          at: decision.decidedAt,
          decision,
        });
        /* A payment to a definitively listed supplier is cancelled on arrival, and
           the ledger says so with the article in the sentence. No `actor`: nobody
           dropped this line by hand, the evidence cancelled it, which is exactly
           what `payment_cancelled` documents that field for. After the decision,
           because a replay has to read as the assessment and then its consequence. */
        const cancellation = definitiveListingReason(findings);
        if (cancellation !== undefined) {
          await deps.emit({
            type: "payment_cancelled",
            at: decision.decidedAt,
            instructionId: instruction.id,
            reason: cancellation,
          });
        }

        return c.json({ instruction, findings, decision }, 201);
      },
    )
    .post(
      "/:id/decide",
      zValidator("param", idParamSchema, rejectInvalid),
      zValidator("json", decideBodySchema, rejectInvalid),
      async (c) => {
        const { id } = c.req.valid("param");
        const { action, decidedBy, reason } = c.req.valid("json");

        const detail = await deps.repo.instructionDetail(id);
        if (detail === undefined) {
          return notFound(c, `No instruction with id ${id}.`);
        }

        const refused = refuseReopening(
          detail,
          { action, decidedBy, reason },
          c.req.header(ACTOR_HEADER),
        );
        if (refused !== undefined) {
          return fail(c, refused.status, refused.code, refused.message);
        }

        const decision = await deps.repo.recordDecision(
          id,
          action,
          decidedBy,
          deps.clock.now(),
          reason,
        );
        if (decision === undefined) {
          return notFound(
            c,
            `Instruction ${id} has no decision to confirm yet.`,
          );
        }

        await deps.emit({
          type: "decision_made",
          at: decision.decidedAt,
          decision,
        });

        const response: DecideResponse = {
          instruction: detail.instruction,
          decision,
          /* The largest single amount at risk, which is what `estimateLoss`
             calls the exposure. Never the sum: six detectors describing one
             payment describe the same pesos six times. */
          amountAtRisk: estimateLoss(decision.findings).exposure,
          hold: holdWindow(decision, { now: decision.decidedAt }),
        };

        return c.json(response);
      },
    );
}

/** Why a write was refused: the status, the envelope code and the sentence. */
interface Refusal {
  status: 400 | 403 | 422;
  code: "bad_request" | "forbidden" | "unprocessable";
  message: string;
}

/**
 * Why a reopening was refused, or undefined when this `decide` is not one.
 *
 * A reopening is one shape and only one: `action: "release"` on a line a definitive
 * SAT listing cancelled and that nobody has released yet. Everything else goes
 * through untouched, which is deliberate. Making every write carry `X-Actor` is
 * issue #199 and turning this narrow check into that one here would have broken
 * every caller the night before the demo for a rule that issue owns.
 *
 * Three refusals, and the status codes are the ones docs/09-api.md already sets.
 *
 * - A missing or malformed header is `400 bad_request` naming the header. Not a
 *   `403`: nothing about the caller was rejected, the request did not say who.
 * - A well formed header whose role may not do it is `403 forbidden`.
 * - A header whose name disagrees with `decidedBy` in the body is `400`, because a
 *   decision signed by one name under a header carrying another is a record nobody
 *   can rely on later.
 * - A release with no written reason is `422 unprocessable`. The reason is required
 *   here and optional everywhere else, because reopening a payment whose invoices
 *   have no fiscal effect at all is exactly the decision somebody has to be able to
 *   explain in eighteen months.
 */
function refuseReopening(
  detail: InstructionDetail,
  body: { action: DecideBody["action"]; decidedBy: string; reason?: string },
  header: string | undefined,
): Refusal | undefined {
  if (
    definitiveListingReason(detail.findings) === undefined ||
    body.action !== "release" ||
    releasedByAPerson(detail.decision)
  ) {
    return undefined;
  }

  const parsed = parseActor(header);
  if (!parsed.ok) {
    return { status: 400, code: "bad_request", message: parsed.message };
  }
  if (parsed.actor.role !== "owner") {
    return {
      status: 403,
      code: "forbidden",
      message:
        "Solo el propietario puede reabrir una linea que una lista definitiva del SAT cancelo. " +
        `${ACTOR_HEADER} llego con role=${parsed.actor.role}.`,
    };
  }
  if (parsed.actor.name !== body.decidedBy) {
    return {
      status: 400,
      code: "bad_request",
      message: `${ACTOR_HEADER} nombra a ${parsed.actor.name} y el cuerpo firma como ${body.decidedBy}. Los dos tienen que coincidir.`,
    };
  }
  if (body.reason === undefined || body.reason.trim() === "") {
    return {
      status: 422,
      code: "unprocessable",
      message:
        "Reabrir esta linea necesita un motivo escrito, porque los comprobantes del proveedor " +
        "no tienen efecto fiscal y alguien tiene que poder explicarlo despues.",
    };
  }
  return undefined;
}
