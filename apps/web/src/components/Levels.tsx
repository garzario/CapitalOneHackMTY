/**
 * The two chips ADR-0009 put in the product: a level and a state.
 *
 * They are components rather than three spans inside the payments screen for the
 * reason `Primitives.tsx` gives for the peso amount. A level that reads one way on
 * the run and another on the payments screen is the failure of issue 125 with a
 * longer fuse, and this is the one file that decides how either word looks.
 *
 * What they may not do is decide. Both take the value the caller already derived
 * through `confidenceOf` or `transactionStateOf` in `@hackmty/core`: there is one
 * place a level is computed and it is not a component. And neither prints a number,
 * ever. ADR-0009 forbids a probability, a percentage or a score on any screen of
 * this product, so the chip carries a word and the evidence sits next to it.
 *
 * `title` carries the one-sentence help from `lib/labels.ts`, which is what a clerk
 * hovers when she wants to know why `liberado` is not `enviado`. Colour is never the
 * only signal: every chip says the word out loud.
 *
 * TODO(FabriBanda): issue 207 owns the design system. When its chip lands, replace
 * the bodies here and leave the three signatures alone, so no screen has to change.
 */

import type {
  Confidence,
  PaymentLineState,
  TransactionState,
} from "../lib/contract";
import {
  CONFIDENCE_BADGE,
  CONFIDENCE_HELP,
  CONFIDENCE_LABEL,
  PAYMENT_LINE_BADGE,
  PAYMENT_LINE_HELP,
  PAYMENT_LINE_LABEL,
  TRANSACTION_STATE_BADGE,
  TRANSACTION_STATE_HELP,
  TRANSACTION_STATE_LABEL,
} from "../lib/labels";

/** `confiable`, `precaucion` or `alerta`, and never a figure. */
export function LevelChip({ level }: { level: Confidence }) {
  return (
    <span className={CONFIDENCE_BADGE[level]} title={CONFIDENCE_HELP[level]}>
      {CONFIDENCE_LABEL[level]}
    </span>
  );
}

/** Where the payment stands: the three public states plus the internal pair. */
export function StateChip({ state }: { state: TransactionState }) {
  return (
    <span
      className={TRANSACTION_STATE_BADGE[state]}
      title={TRANSACTION_STATE_HELP[state]}
    >
      {TRANSACTION_STATE_LABEL[state]}
    </span>
  );
}

/**
 * What the rail did with one line.
 *
 * Separate from the state chip on purpose, because they answer different questions
 * and a judge asks the second one: the state is where the payment stands for the
 * company, and this is what the rail said. `sent` and `settled` are two claims and
 * this chip is where the difference is visible.
 */
export function LineStateChip({ state }: { state: PaymentLineState }) {
  return (
    <span
      className={PAYMENT_LINE_BADGE[state]}
      title={PAYMENT_LINE_HELP[state]}
    >
      {PAYMENT_LINE_LABEL[state]}
    </span>
  );
}
