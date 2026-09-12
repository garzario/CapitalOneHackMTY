/**
 * The smallest shared pieces: a peso amount, a synthetic watermark, a decision
 * badge, a labelled field. They exist so that a number looks the same on all
 * six screens and so the watermark can never be forgotten on one of them.
 */

import type { Action, Severity } from "@hackmty/core";
import type { ReactNode } from "react";
import { formatMoney, formatMoneyShort } from "../lib/format";
import {
  ACTION_BADGE,
  ACTION_LABEL,
  SEVERITY_BADGE,
  SEVERITY_LABEL,
  SYNTHETIC_LABEL,
} from "../lib/labels";

type AmountSize = "inherit" | "sm" | "base" | "lg" | "xl";

const AMOUNT_CLASS: Record<AmountSize, string> = {
  /* Tabular figures and nothing else, for an amount whose size belongs to the
     block around it. Without this the only way to render money was to pick a
     step off the scale, so the run's headline figure sat inside a 48px
     `.figure-value` and printed itself at 15px, because the span the component
     renders set its own size and won. */
  inherit: "num",
  sm: "num t-sm",
  base: "num t-base",
  lg: "num-lg",
  xl: "num-xl",
};

type AmountProps = {
  value: number;
  size?: AmountSize;
  /** Compact notation, for a total read from two metres away. */
  short?: boolean;
  className?: string;
};

/** Pesos, always tabular, so a column of amounts lines up digit over digit. */
export function Amount({
  value,
  size = "base",
  short = false,
  className = "",
}: AmountProps) {
  const full = formatMoney(value);
  const classes = `${AMOUNT_CLASS[size]} ${className}`.trim();

  if (!short) {
    return <span className={classes}>{full}</span>;
  }

  /* Compact on screen, complete for a screen reader. An aria-label on a plain
     span is not reliably exposed, so the full amount is real text instead. */
  return (
    <span className={classes}>
      <span aria-hidden="true">{formatMoneyShort(value)}</span>
      <span className="sr-only">{full}</span>
    </span>
  );
}

/**
 * ADR-0002: anything generated carries a visible synthetic marker, and the
 * marker comes from the `synthetic` flag on the payload. Passing `when` from
 * anything other than that flag is the one thing this component must not do.
 */
export function SyntheticMark({
  when,
  className = "",
}: {
  when: boolean;
  className?: string;
}) {
  if (!when) {
    return null;
  }

  return (
    <span className={`watermark ${className}`.trim()}>{SYNTHETIC_LABEL}</span>
  );
}

/** True when any object in the list declares itself synthetic. */
export function anySynthetic(values: Array<{ synthetic: boolean }>): boolean {
  return values.some((value) => value.synthetic);
}

export function DecisionBadge({ action }: { action: Action }) {
  return <span className={ACTION_BADGE[action]}>{ACTION_LABEL[action]}</span>;
}

export function SeverityBadge({ severity }: { severity: Severity }) {
  return (
    <span className={SEVERITY_BADGE[severity]}>{SEVERITY_LABEL[severity]}</span>
  );
}

type FieldProps = {
  label: string;
  children: ReactNode;
  /** Stacks under the label on a phone and beside it on a wide screen. */
  wide?: boolean;
};

/** A read-only label and value pair, used across the CEP and supplier views. */
export function Field({ label, children, wide = false }: FieldProps) {
  return (
    <div className={wide ? "sm:col-span-2" : undefined}>
      <dt className="eyebrow">{label}</dt>
      <dd className="m-0 mt-1 t-base">{children}</dd>
    </div>
  );
}

/** A section heading with an optional right-hand slot, used by every panel. */
export function SectionHeader({
  title,
  description,
  aside,
  id,
}: {
  title: string;
  description?: string;
  aside?: ReactNode;
  id?: string;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex flex-col gap-1">
        {/* h2, because the shell's top bar carries the page's h1: it names the
            section you are in, on every screen, which is exactly what an h1 is
            for. Two h1s would leave "jump to the main heading" ambiguous. The
            visual size is a token, not the tag. */}
        <h2 id={id} className="t-lg">
          {title}
        </h2>
        {description ? (
          <p className="muted max-w-prose t-sm">{description}</p>
        ) : null}
      </div>
      {aside}
    </div>
  );
}
