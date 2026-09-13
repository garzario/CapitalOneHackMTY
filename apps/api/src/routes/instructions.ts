import { estimateLoss, holdWindow } from "@hackmty/core";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import type { ApiDeps } from "../deps";
import { fail, notFound, rejectInvalid } from "../http";
import { runIntake } from "../pipeline";
import {
  createInstructionBodySchema,
  type DecideResponse,
  decideBodySchema,
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
           repository owns no clock. `null` means the money is not stopped. */
        const response: InstructionDetailResponse = {
          ...detail,
          hold:
            detail.decision === null
              ? null
              : holdWindow(detail.decision, { now: deps.clock.now() }),
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
