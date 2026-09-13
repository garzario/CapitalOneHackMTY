/**
 * The two chips the whole product is read through: the level of a payment and
 * the state of a payment. ADR-0009 is the decision behind both.
 *
 * They are separate components because they answer different questions and a
 * screen shows both at once. The level says how much the evidence is trusted
 * (`confiable`, `precaucion`, `alerta`). The state says where the money stands
 * (`rojo`, `cancelado`, `enviado`, plus the two the run counts internally). The
 * action the engine proposes is a third thing and it has `DecisionBadge`.
 *
 * Two rules both of them obey, and they come from the product and not from
 * taste.
 *
 * **Never a number.** No probability, no percentage, no score, in either chip.
 * `estimateLoss` says in its own comment that its figure is an upper bound on
 * the evidence rather than a calibrated probability, so 0.73 next to a supplier
 * would be a precision nobody earned. The level's meter is an ordinal over the
 * same three words, which is why it is allowed: it adds a channel, not a digit.
 *
 * **Never the word "seguro".** `confiable` is a statement about the documents we
 * hold. "Safe" would be a guarantee about a transfer that cannot be recalled.
 * `lib/labels.test.ts` fails if that word reaches any label in the dictionary.
 *
 * Colour is never the only channel either. The level carries a three step meter,
 * the state carries a dot and a dashed border when nothing has decided the line,
 * and both always carry their word as real text.
 */

import type { Confidence, TransactionState } from "@hackmty/core";
import {
  CONFIDENCE_BARS,
  CONFIDENCE_CHIP,
  CONFIDENCE_HELP,
  CONFIDENCE_LABEL,
  TRANSACTION_STATE_CHIP,
  TRANSACTION_STATE_HELP,
  TRANSACTION_STATE_LABEL,
} from "../lib/labels";

const BARS = [1, 2, 3] as const;

type LevelProps = {
  level: Confidence;
  /**
   * Puts the one-line explanation in a `title`. Off by default: a tooltip is
   * not an accessible way to carry meaning, so the screens that need the
   * sentence render `CONFIDENCE_HELP` as text next to the findings instead.
   */
  withHint?: boolean;
  className?: string;
};

/**
 * The level of one payment, with the findings behind it rendered by the caller.
 * ADR-0009: a level with no evidence under it is not something this product
 * shows, so this chip is never the only thing on a row.
 */
export function LevelChip({
  level,
  withHint = false,
  className = "",
}: LevelProps) {
  const filled = CONFIDENCE_BARS[level];

  return (
    <span
      className={`${CONFIDENCE_CHIP[level]} ${className}`.trim()}
      title={withHint ? CONFIDENCE_HELP[level] : undefined}
    >
      {/* The meter repeats the word, so it is hidden from a screen reader
          rather than read out as three empty spans. */}
      <span aria-hidden="true" className="level-meter">
        {BARS.map((bar) => (
          <span
            key={bar}
            className="level-bar"
            data-on={bar <= filled ? "true" : "false"}
          />
        ))}
      </span>
      {CONFIDENCE_LABEL[level]}
    </span>
  );
}

type StateProps = {
  state: TransactionState;
  withHint?: boolean;
  className?: string;
};

/** Where one payment of the run stands. */
export function StateChip({
  state,
  withHint = false,
  className = "",
}: StateProps) {
  return (
    <span
      className={`${TRANSACTION_STATE_CHIP[state]} ${className}`.trim()}
      title={withHint ? TRANSACTION_STATE_HELP[state] : undefined}
    >
      <span aria-hidden="true" className="status-dot" />
      {TRANSACTION_STATE_LABEL[state]}
    </span>
  );
}
