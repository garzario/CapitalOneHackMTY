/**
 * What a hold costs in time, and what somebody does next.
 *
 * A Capital One judge asked the question this file exists for: what happens if
 * the supplier does not answer the telephone, and what happens if the payment is
 * urgent. Before this module the honest answer was "the payment stays held and
 * nothing tells anybody for how long", which is how a control becomes the thing
 * the clerk switches off.
 *
 * Two ideas, and they are deliberately small.
 *
 * **A hold has a deadline, and it is the delay the decision already charged
 * for.** `decide` in `./decision` weighs the expected loss against
 * `EXPECTED_DELAY_DAYS` days of delay cost: three days for a hold, one for a
 * verification. So the honest deadline is exactly that window. Putting a
 * different number here would mean the arithmetic priced one delay and the
 * screen promised another.
 *
 * **The deadline never decides anything.** Nothing is released when it passes
 * and nothing is refused either. `expired` is true, the payment goes back in
 * front of a person, and the next step is theirs. That is binding under
 * ADR-0002: no automated adverse action, and no automated release. What the
 * deadline does buy is a bound on the retry loop, which is the real answer to
 * "what if nobody ever answers": the call is retried until the window closes,
 * and then a person answers instead of the supplier.
 *
 * Pure, like the rest of this package: the instant is passed in, so the same
 * payment asked twice gives the same window.
 */

import { EXPECTED_DELAY_DAYS } from "./decision";
import type { Action, Decision, VerificationOutcome } from "./domain";

const HOURS_PER_DAY = 24;
const MS_PER_HOUR = 3_600_000;

/**
 * Days a decision holds money, per action.
 *
 * Not a second table: it is `EXPECTED_DELAY_DAYS` under the name the screen
 * uses, so the delay the expected-loss arithmetic paid for and the deadline the
 * clerk is shown can never drift apart.
 */
export const HOLD_WINDOW_DAYS: Readonly<Record<Action, number>> =
  EXPECTED_DELAY_DAYS;

/**
 * What a person can do next with a payment that has not left.
 *
 * `one_cent_cep` is the one worth naming out loud: it needs nobody to answer a
 * telephone. A cent leaves the company's own bank, Banxico signs a CEP for it,
 * and the holder name on that receipt is compared with the legal name on the
 * CFDI. A supplier who never picks up is still verifiable.
 *
 * `release_with_reason` is a release with a name against it and an argument
 * written down, which is `decidedBy` and `reason` on `Decision`. It is offered
 * rather than hidden, because an urgent payment with no way out is a control
 * that gets bypassed outside the product instead of inside it.
 */
export type HoldNextStep =
  | "call_supplier"
  | "retry_call"
  | "one_cent_cep"
  | "release_with_reason"
  | "keep_held";

/** The hold window of one payment, as the screen and the API state it. */
export interface HoldWindow {
  /** The action that stopped the money. Never `release`. */
  action: Extract<Action, "hold" | "verify">;
  /** Days the window lasts, from `HOLD_WINDOW_DAYS`. */
  days: number;
  /** When the window closes, ISO 8601. */
  deadline: string;
  /** Whole hours left at `now`, floored at zero. */
  hoursLeft: number;
  /** True once `now` has reached the deadline. Nothing happens by itself. */
  expired: boolean;
  /** What the last verification attempt proved, when one was recorded. */
  outcome?: VerificationOutcome;
  /** Ordered, best first. Never empty. */
  nextSteps: readonly HoldNextStep[];
}

export interface HoldWindowOptions {
  /** The instant to measure against, ISO 8601. This package owns no clock. */
  now: string;
  /** The outcome of the last verification call, when one was recorded. */
  outcome?: VerificationOutcome;
}

/**
 * The next steps for each outcome of a verification call.
 *
 * `denied` is the only one that offers no release. A supplier who says the
 * account is not theirs has produced the strongest evidence this product can
 * get without a document, and offering "release anyway" next to it would be the
 * product arguing against its own finding. A person can still hold and then
 * decide something else later; what the software does not do is suggest it.
 *
 * `confirmed` drops the call and keeps the CEP, because a confirmation over the
 * telephone is evidence and not proof: whoever answered is whoever answered, and
 * the account holder Banxico names is a fact.
 */
const NEXT_STEPS: Readonly<
  Record<VerificationOutcome, readonly HoldNextStep[]>
> = {
  confirmed: ["one_cent_cep", "release_with_reason"],
  denied: ["keep_held"],
  no_answer: ["retry_call", "one_cent_cep", "release_with_reason"],
  unclear: ["retry_call", "one_cent_cep", "release_with_reason"],
};

/** Before anybody has called: the call is the first step, not a retry. */
const NEXT_STEPS_UNVERIFIED: readonly HoldNextStep[] = [
  "call_supplier",
  "one_cent_cep",
  "release_with_reason",
];

/**
 * What a hold or a verification is allowed to do next.
 *
 * Exported on its own because the verification-call route answers it at the
 * moment the outcome is recorded, which is the one moment a clerk is looking at
 * a telephone that nobody answered.
 */
export function nextStepsFor(
  outcome?: VerificationOutcome,
): readonly HoldNextStep[] {
  return outcome === undefined ? NEXT_STEPS_UNVERIFIED : NEXT_STEPS[outcome];
}

/**
 * When a decision stops holding money, ISO 8601, or null when it holds none.
 *
 * @throws RangeError when `decidedAt` is not a date this runtime can read.
 */
export function holdDeadlineOf(
  decision: Pick<Decision, "action" | "decidedAt">,
): string | null {
  const days = HOLD_WINDOW_DAYS[decision.action] ?? 0;
  if (days <= 0) {
    return null;
  }

  return new Date(
    instantOf(decision.decidedAt, "decidedAt") +
      days * HOURS_PER_DAY * MS_PER_HOUR,
  ).toISOString();
}

/**
 * The window of a payment that has not left, or null for one that has been
 * released.
 *
 * Null and not a window with zero hours: a released payment is not a hold that
 * expired, and a screen that rendered one as the other would be telling a clerk
 * that money they let go is still waiting for them.
 *
 * @throws RangeError when either instant is not a date this runtime can read.
 */
export function holdWindow(
  decision: Pick<Decision, "action" | "decidedAt">,
  options: HoldWindowOptions,
): HoldWindow | null {
  const deadline = holdDeadlineOf(decision);
  if (deadline === null) {
    return null;
  }

  const now = instantOf(options.now, "now");
  const closesAt = Date.parse(deadline);
  const hoursLeft = Math.max(0, Math.floor((closesAt - now) / MS_PER_HOUR));

  const window: HoldWindow = {
    /* Safe by construction: `holdDeadlineOf` returned a deadline, and `release`
       is the only action whose window is zero days. */
    action: decision.action as Extract<Action, "hold" | "verify">,
    days: HOLD_WINDOW_DAYS[decision.action] ?? 0,
    deadline,
    hoursLeft,
    expired: now >= closesAt,
    nextSteps: nextStepsFor(options.outcome),
  };
  if (options.outcome !== undefined) {
    window.outcome = options.outcome;
  }

  return window;
}

/**
 * `Date.parse` with the field name in the error.
 *
 * A silent NaN here would produce a deadline of "Invalid Date" on a screen, and
 * the clerk would read it as "no deadline" rather than as a bug.
 */
function instantOf(value: string, field: string): number {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    throw new RangeError(`${field} is not a readable instant: ${value}`);
  }

  return parsed;
}
