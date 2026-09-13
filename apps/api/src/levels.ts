/**
 * Where the level and the state reach the wire, and the only place in this
 * workspace that touches either.
 *
 * Both are derived and neither is stored. `assessLine` in `@hackmty/core` is the
 * rule table of ADR-0009 and this file is argument shaping over it: it takes the
 * four objects a repository joined and returns the five keys docs/09-api.md says
 * travel with every line. Nothing here decides anything, and nothing here may grow
 * a rule. The moment this file starts answering "is this alerta" rather than
 * "which keys does the payload carry", it is the second implementation issue #125
 * already cost us once.
 *
 * Why the API and not the repository. Two repositories join a run and one of them
 * is SQL, so a level computed in each would be two implementations on the same
 * request, and neither store owns a clock or a verification fold. The stores build
 * `PaymentRunLine` and this attaches what is derived.
 *
 * What is deliberately NOT read here, and it is a request to issue #198 rather
 * than an omission. `transactionStateOf` takes a payment line, and the execution
 * projection (`GET /api/v1/run/:id/execution`) is that issue's to land. Until it
 * does, no line of this payload reads `enviado` from a folded execution, which is
 * correct for a run nothing has sent and wrong the minute one has. When that fold
 * arrives it is handed in through `LevelLine.execution` and one rule applies to it:
 * a `payment_cancelled` that a later person-signed release superseded must not keep
 * reporting a `cancelled` line, because ADR-0009 row 4 lets an owner reopen a
 * cancelled payment and `releasedByAPerson` is the predicate for that.
 */

import type { LevelLine } from "@hackmty/core";
import { assessLine } from "@hackmty/core";
import type {
  InstructionDetail,
  LineLevels,
  PaymentRunItem,
  PaymentRunLine,
} from "./schemas";

/**
 * The five keys the level and the state travel as.
 *
 * One call to `assessLine`, because the level and the state of one line are two
 * answers about the same evidence and asking twice is how they drift apart.
 */
export function lineLevels(line: LevelLine): LineLevels {
  const { confidence, state } = assessLine(line);

  return {
    confidence: confidence.level,
    confidenceRule: confidence.rule,
    confidenceFindingIds: confidence.findingIds,
    state: state.state,
    stateRule: state.rule,
  };
}

/**
 * One line of the run, with the level and the state attached.
 *
 * Called by both repositories on every line of `currentRun`, so the memory store
 * and the Postgres store cannot answer different levels for the same payment.
 */
export function levelled(line: PaymentRunLine): PaymentRunItem {
  return { ...line, ...lineLevels(line) };
}

/**
 * The level and the state of one instruction detail.
 *
 * The same two words the run carries for the same line, from the same function
 * over the same evidence. A judge who clicks a line of the run and reads a
 * different level on the panel is the failure ADR-0009 was written after.
 */
export function detailLevels(detail: InstructionDetail): LineLevels {
  return lineLevels({
    findings: detail.findings,
    decision: detail.decision,
  });
}
