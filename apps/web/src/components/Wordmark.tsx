/**
 * The name lockup. The mark and the word travel together and no screen draws
 * the logo by hand, so a change here reaches the rail, the intake page a judge
 * opens on their phone, and anything printed later.
 *
 * The mark is a shield, solid, in whatever colour holds it: `currentColor`,
 * because the lockup now lives on the navy rail, where the brand navy it used to
 * be painted in is the ground behind it. It is the only
 * figurative thing in the app and it earns that by being the product: a sentry
 * stands in front of a payment and does not let it past until someone looks.
 * There is no interior detail because at 20 px interior detail is mud, and the
 * rail renders it at 20 px more often than anywhere else.
 *
 * SentryOne is presented as an extension of Capital One, so the word is set the
 * way theirs is: one word, semibold, tight tracking, no italic, no swoosh of
 * our own. Borrowing their typography is the claim; borrowing their logo would
 * be a different and untrue one.
 *
 * The svg is `aria-hidden` because the word next to it already carries the
 * accessible name. Two readings of "SentryOne" in a row is noise.
 */

const SIZES = {
  sm: { mark: 18, text: "var(--text-base)" },
  md: { mark: 22, text: "var(--text-md)" },
} as const;

export type WordmarkSize = keyof typeof SIZES;

export function WordmarkGlyph({ size = 22 }: { size?: number }) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      width={size}
      height={size}
      viewBox="0 0 32 32"
      style={{ display: "block", flex: "none" }}
    >
      <path
        d="M16 2.5 27.5 6.6v9.2c0 7.3-4.8 12.2-11.5 13.7C9.3 28 4.5 23.1 4.5 15.8V6.6Z"
        fill="currentColor"
      />
    </svg>
  );
}

export function Wordmark({
  size = "md",
  showName = true,
}: {
  size?: WordmarkSize;
  showName?: boolean;
}) {
  const { mark, text } = SIZES[size];

  return (
    <span
      className="inline-flex items-center"
      style={{ gap: "var(--space-2)" }}
    >
      <WordmarkGlyph size={mark} />
      {showName ? (
        <span
          style={{
            fontSize: text,
            fontWeight: "var(--weight-semibold)",
            letterSpacing: "var(--tracking-display)",
          }}
        >
          SentryOne
        </span>
      ) : null}
    </span>
  );
}
