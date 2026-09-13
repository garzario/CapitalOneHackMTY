/**
 * The level, the state and the hold window of one payment, on the web side of
 * the wire.
 *
 * Not a second implementation of any of the three. `assessConfidence`,
 * `assessTransactionState` and `holdWindow` live in `@hackmty/core` and this
 * file only decides what to feed them and what to do when a date is unreadable:
 * ADR-0009 says one place derives a level and one place derives a state, and a
 * browser that computed its own would be the fourth implementation the core
 * module was written to delete.
 *
 * Three rules hold here and they are the reason the file exists at all.
 *
 * **The API's answer wins when it sent one.** `confidence`, `state` and `hold`
 * are documented on the instruction detail, and a server one version ahead can
 * carry them before this build knows how to ask. When the payload has them they
 * are read; when it does not, the same pure functions are called over the same
 * findings and decision, so the two paths cannot disagree about a line. That is
 * also what keeps `?data=mock` honest: the offline dataset carries the pair, and
 * it was produced by these functions.
 *
 * **A level is never shown without the findings under it.** `assessConfidence`
 * answers the rule that fired and the ids it fired on, and the panel renders
 * those findings next to the word. A level with no evidence under it is not a
 * thing this product shows, and a probability is not a thing it prints at all.
 *
 * **An unreadable date is not a deadline.** `holdWindow` throws a `RangeError`
 * on an instant no runtime can read, which on a screen means a blank page in
 * front of a judge. Here it answers `null` instead, which renders as "sin plazo"
 * and never as a window somebody could act on.
 */

import type {
  ConfidenceAssessment,
  Decision,
  Finding,
  HoldWindow,
  PaymentExecutionLine,
  TransactionStateAssessment,
  VerificationState,
} from "@hackmty/core";
import {
  assessConfidence,
  assessTransactionState,
  estimateLoss,
  holdWindow,
} from "@hackmty/core";

/** Everything the three derivations read, and nothing else. */
export interface LineInput {
  decision: Decision;
  findings: readonly Finding[];
  /** The one-cent verification, when the screen loaded it. `blocked` cancels a line. */
  verification?: Pick<VerificationState, "state"> | null;
  /** The rail's own line, once the run has been executed. `sent` beats everything. */
  execution?: Pick<PaymentExecutionLine, "state"> | null;
}

/** The level and the state of one line, each with the rule that produced it. */
export interface LineAssessment {
  confidence: ConfidenceAssessment;
  state: TransactionStateAssessment;
}

/**
 * The level and the state of one payment.
 *
 * The findings are passed to both, because `transactionStateOf` reads them for
 * exactly one rule, the definitive SAT listing, and a caller that let the
 * decision carry its own copy would answer differently depending on which of the
 * two lists the API happened to fill.
 */
export function assessLine(input: LineInput): LineAssessment {
  return {
    confidence: assessConfidence(input.findings, input.decision),
    state: assessTransactionState(
      { ...input.decision, findings: [...input.findings] },
      input.verification ?? null,
      input.execution ?? null,
    ),
  };
}

/**
 * Pesos this payment puts at risk: the largest single amount among its
 * findings, never the sum.
 *
 * The same figure `POST /api/v1/instructions/:id/decide` answers as
 * `amountAtRisk`, read off the same function, so the number the screen shows
 * before an override and the number the ledger records after it are one number.
 * `estimateLoss` states the argument for the maximum in its own header: six
 * detectors looking at one payment describe the same pesos from six angles.
 */
export function amountAtRiskOf(findings: readonly Finding[]): number {
  return estimateLoss(findings).exposure;
}

/**
 * The hold window of one payment, or null when nothing is holding it.
 *
 * `sent` is the API's own `hold`, which is the one to prefer: it was measured
 * against the server's clock and the browser's may be minutes off. Without it
 * the window is computed here from the decision, which is what the offline run
 * needs and what a server that has not shipped the field yet leaves us with.
 */
export function holdOf(
  decision: Pick<Decision, "action" | "decidedAt">,
  now: string,
  sent?: HoldWindow | null,
): HoldWindow | null {
  if (sent !== undefined && sent !== null) {
    return sent;
  }

  try {
    return holdWindow(decision, { now });
  } catch {
    /* An instant no runtime can read is not a deadline anybody can act on. The
       panel says there is no window rather than rendering one from a guess. */
    return null;
  }
}

/**
 * Whole days left in a window, rounded down, for the sentence next to the date.
 *
 * Hours are what the contract carries and days are what a person says out loud.
 * Under a day the answer is the hours, because "quedan 0 dias" reads as expired
 * on a payment that still has eleven hours on it.
 */
export function remainingLabel(window: HoldWindow): string {
  if (window.expired) {
    return "El plazo ya se cumplio";
  }
  if (window.hoursLeft < 24) {
    return window.hoursLeft === 1
      ? "Queda 1 hora"
      : `Quedan ${String(window.hoursLeft)} horas`;
  }

  const days = Math.floor(window.hoursLeft / 24);

  return days === 1 ? "Queda 1 dia" : `Quedan ${String(days)} dias`;
}
