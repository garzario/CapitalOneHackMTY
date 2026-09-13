/**
 * The button, as one component instead of a class string every screen retypes.
 *
 * It exists for three things the `.btn` class cannot do on its own.
 *
 * `busy` is the important one. A write that takes two seconds on venue wifi and
 * a button that looks idle is how a judge double-sends a payment run, so a busy
 * button reports `aria-busy`, goes `disabled` and says so in words: the caller
 * passes `busyLabel` and the label is swapped, because a spinner is not a
 * sentence and a screen reader gets nothing from one.
 *
 * `tone` keeps the decision palette attached to the decision. The three actions
 * the engine proposes are the only coloured buttons in this app; everything else
 * is neutral or the one accent. Passing a tone for decoration is the thing this
 * component is meant to make awkward.
 *
 * And it is a real `<button>` with a real `type`, so the focus ring in
 * `design/base.css` applies and nothing has to be reimplemented per screen.
 */

import type { ButtonHTMLAttributes, ReactNode } from "react";

/**
 * Neutral is the default. `accent` is the one primary action on a screen, and
 * `hold`, `verify` and `release` are the three decisions, nothing else.
 */
export type ButtonTone = "neutral" | "accent" | "hold" | "verify" | "release";

export type ButtonSize = "sm" | "base" | "lg";

const TONE_CLASS: Record<ButtonTone, string> = {
  neutral: "",
  accent: "btn-accent",
  hold: "btn-hold",
  verify: "btn-verify",
  release: "btn-release",
};

const SIZE_CLASS: Record<ButtonSize, string> = {
  sm: "btn-sm",
  base: "",
  lg: "btn-lg",
};

/** The class list a button carries, also used by the anchor that looks like one. */
export function buttonClass(
  tone: ButtonTone = "neutral",
  size: ButtonSize = "base",
  extra = "",
): string {
  return ["btn", TONE_CLASS[tone], SIZE_CLASS[size], extra]
    .filter((part) => part !== "")
    .join(" ");
}

type Props = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className"> & {
  children: ReactNode;
  tone?: ButtonTone;
  size?: ButtonSize;
  /** A write is in flight: the control disables itself and says so. */
  busy?: boolean;
  /** What to read while busy. Without one the label does not change. */
  busyLabel?: string;
  className?: string;
};

export function Button({
  children,
  tone = "neutral",
  size = "base",
  busy = false,
  busyLabel,
  className = "",
  disabled,
  type = "button",
  ...rest
}: Props) {
  return (
    <button
      {...rest}
      type={type}
      className={buttonClass(tone, size, className)}
      aria-busy={busy || undefined}
      disabled={disabled || busy}
    >
      {busy && busyLabel !== undefined ? busyLabel : children}
    </button>
  );
}
