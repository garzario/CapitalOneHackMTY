/**
 * The name lockup. The mark and the word travel together and no screen draws
 * the logo by hand, so a change here reaches the header, the intake page a
 * judge opens on their phone, and anything printed later.
 *
 * The mark is a geometric C with flat terminals. It is the initial of the
 * product and nothing more: a cleverer mark would need explaining, and the
 * screen a judge is looking at is the payment run, not our logo. The flat
 * terminals are the one deliberate choice, so the letter reads as a drawn
 * shape rather than a font glyph at 16 px.
 *
 * The svg is `aria-hidden` because the word next to it already carries the
 * accessible name. Two readings of "SentryOne" in a row is noise.
 */

const SIZES = {
  sm: { mark: 20, text: "var(--text-base)" },
  md: { mark: 26, text: "var(--text-lg)" },
} as const;

export type WordmarkSize = keyof typeof SIZES;

export function Wordmark({ size = "md" }: { size?: WordmarkSize }) {
  const { mark, text } = SIZES[size];

  return (
    <span
      className="inline-flex items-center"
      style={{ gap: "var(--space-2)" }}
    >
      <svg
        aria-hidden="true"
        focusable="false"
        width={mark}
        height={mark}
        viewBox="0 0 32 32"
        style={{ display: "block", flex: "none" }}
      >
        <rect width="32" height="32" rx="7" fill="var(--c-accent)" />
        <path
          d="M21.21 10.61 A 7.5 7.5 0 1 0 21.21 21.39"
          fill="none"
          stroke="var(--c-accent-ink)"
          strokeWidth="4"
          strokeLinecap="butt"
        />
      </svg>
      <span
        style={{
          fontSize: text,
          fontWeight: "var(--weight-semibold)",
          letterSpacing: "-0.015em",
          color: "var(--c-ink)",
        }}
      >
        SentryOne
      </span>
    </span>
  );
}
