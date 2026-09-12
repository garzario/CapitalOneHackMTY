import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import type { ApiDeps } from "../deps";
import { fail, notFound, rejectInvalid } from "../http";
import { runIntake } from "../pipeline";
import {
  createInstructionBodySchema,
  decideBodySchema,
  idParamSchema,
} from "../schemas";

/**
 * Intake and the human decision.
 *
 * Ceptinela never moves money. A release is a person saying yes, and the SPEI
 * still leaves from the company's own banking portal, which is why this file
 * appends `decision_made` and never `payment_sent`. That event arrives later,
 * from bank reconciliation, and it is the only one that means pesos actually
 * left.
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

        return c.json(detail);
      },
    )
    .post(
      "/",
      zValidator("json", createInstructionBodySchema, rejectInvalid),
      async (c) => {
        const outcome = await runIntake(
          deps.repo,
          deps.clock,
          c.req.valid("json"),
        );

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
        const { action, decidedBy } = c.req.valid("json");

        const detail = await deps.repo.instructionDetail(id);
        if (detail === undefined) {
          return notFound(c, `No instruction with id ${id}.`);
        }

        const decision = await deps.repo.recordDecision(
          id,
          action,
          decidedBy,
          deps.clock.now(),
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

        return c.json({ instruction: detail.instruction, decision });
      },
    );
}
