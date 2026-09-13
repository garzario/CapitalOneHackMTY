import {
  assessConfidence,
  type DecideRequirement,
  decideRequirement,
  definitiveListingReason,
  estimateLoss,
  holdWindow,
  roleSatisfies,
} from "@hackmty/core";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import type { ApiDeps } from "../deps";
import { fail, notFound, rejectInvalid } from "../http";
import { detailLevels } from "../levels";
import { ACTOR_HEADER, actorOf, requireActor } from "../middleware/actor";
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
 *
 * A third thing travels with it, and it is the one this file enforces rather than
 * records: the name and the role on the `X-Actor` header. Two shapes are the
 * owner's, `decideRequirement` in @hackmty/core decides which, and both of them
 * need prose. A clerk who asks for one of the two is answered `403` with the
 * sentence that says who can, and an owner who asks for one with no reason is
 * answered `422` with the sentence that asks for it. Neither refusal is a
 * formality: a release over a finding and the reopening of a cancelled line are
 * the only two moments in this product where a person overrules the evidence, and
 * an exception with nobody's name and no argument against it is the one record
 * ADR-0002 says the ledger must never hold.
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
           same two words. That is the whole point of ADR-0009, and the failure of
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
      requireActor,
      zValidator("json", createInstructionBodySchema, rejectInvalid),
      async (c) => {
        const actor = actorOf(c);
        const outcome = await runIntake(deps, c.req.valid("json"));

        if (!outcome.ok) {
          return fail(c, 422, "unprocessable", outcome.message);
        }

        const { instruction, findings, decision } = outcome.record;
        await deps.repo.saveIntake(outcome.record);
        /* The actor goes on the arrival and not on the decision that follows it:
           the person posted the instruction, the engine scored it, and the name on
           a `decision_made` means somebody signed the action. */
        await deps.emit({
          type: "instruction_received",
          at: instruction.receivedAt,
          instruction,
          actor,
        });
        await deps.emit({
          type: "decision_made",
          at: decision.decidedAt,
          decision,
        });
        /* A payment to a definitively listed supplier is cancelled on arrival, and
           the ledger says so with the article in the sentence. No `actor`: nobody
           dropped this line by hand, the evidence cancelled it, which is what
           `payment_cancelled` documents that field for. It goes out after the
           decision, because a replay has to read as the assessment and then its
           consequence. From here it is `deps.repo.cancellation` that the owner rule
           of issue #199 reads, so the two halves meet on the ledger and nowhere
           else. */
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
      requireActor,
      zValidator("param", idParamSchema, rejectInvalid),
      zValidator("json", decideBodySchema, rejectInvalid),
      async (c) => {
        const actor = actorOf(c);
        const { id } = c.req.valid("param");
        const { action, decidedBy, reason } = c.req.valid("json");

        /* The body names a person and so does the header, so they have to be the
           same person. Neither name is echoed back: a failing response is the one
           most likely to be pasted into a chat, which is the argument
           `rejectInvalid` already makes about a CLABE. */
        if (decidedBy !== actor.name) {
          return fail(c, 400, "bad_request", NAME_DISAGREES);
        }

        const detail = await deps.repo.instructionDetail(id);
        if (detail === undefined) {
          return notFound(c, `No instruction with id ${id}.`);
        }

        /* Whether the run already dropped this line, read off the ledger rather
           than off a column: `payment_cancelled` is the fact, and a second home
           for it would be a second answer. */
        const cancellation = await deps.repo.cancellation(id);
        const requirement = decideRequirement({
          action,
          findings: detail.findings,
          standing: detail.decision,
          cancelled: cancellation !== undefined,
        });

        if (!roleSatisfies(actor.role, requirement.requiresRole)) {
          return fail(
            c,
            403,
            "forbidden",
            refusal(requirement, detail, cancellation?.at),
          );
        }
        if (requirement.requiresReason && reason === undefined) {
          return fail(c, 422, "unprocessable", reasonRequired(requirement));
        }

        const decision = await deps.repo.recordDecision(
          id,
          action,
          actor,
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

/**
 * The three sentences this file refuses with.
 *
 * English, like every other error message in this API, and each one says what to
 * do next rather than only what went wrong: the caller is a screen that has to
 * tell a person whether to call the owner or to write a line of prose.
 */
const NAME_DISAGREES =
  "`decidedBy` in the body and the name on the " +
  `${ACTOR_HEADER} header have to be the same person. A decision signed by one ` +
  "name under a header carrying another is a record nobody can rely on later.";

function refusal(
  requirement: DecideRequirement,
  line: Pick<InstructionDetailResponse, "findings" | "decision">,
  cancelledAt?: string,
): string {
  const howTo =
    `Send ${ACTOR_HEADER} with role=owner and a reason in the body, ` +
    "or leave the payment stopped.";

  if (requirement.rule === "reopen_cancelled") {
    return (
      "Only the owner can reopen a line the run cancelled" +
      `${cancelledAt === undefined ? "" : ` on ${cancelledAt}`}. ` +
      `A clerk cannot decide a payment that was already dropped. ${howTo}`
    );
  }

  /* The level is named rather than the findings counted, because that is the word
     on the chip the clerk is looking at while she reads this. It is assessed over
     the same two inputs `decideRequirement` weighed, the findings and the standing
     decision, so the sentence cannot name a level the rule did not use. */
  const level = assessConfidence(line.findings, line.decision).level;
  return (
    `Only the owner can release a payment in ${level}. ` +
    `A clerk can hold it or ask for a verification. ${howTo}`
  );
}

function reasonRequired(requirement: DecideRequirement): string {
  const what =
    requirement.rule === "reopen_cancelled"
      ? "Reopening a line the run cancelled"
      : "Releasing a payment something stands against";

  return (
    `${what} is recorded with the argument the owner gave for it. ` +
    "Send `reason` in the body, in the words a person can be asked about a year " +
    "from now."
  );
}
