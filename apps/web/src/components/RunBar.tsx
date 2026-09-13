/**
 * How the run's money splits between held, awaiting verification and released.
 *
 * It is the one visual on the screen that could not belong to any other
 * product: the sentence under the figure already spells the split out in
 * words, and this is the same claim in the channel a person reads before they
 * read. It is six pixels tall and carries no label of its own, so it stays
 * subordinate to the figure it sits under.
 *
 * It is an image with a sentence for its name rather than three labelled
 * elements, because a screen reader walking three unlabelled spans learns
 * nothing and the sentence is what the bar actually says.
 *
 * The tone is which ground it is drawn on and nothing else. On the page the
 * segments are the three decision colours; on the dark card they are three
 * opacities of the card's own ink, because a colour tuned to be read on white
 * is not the same colour on navy and three saturated bars up there would be
 * louder than the figure they belong to. The split, the geometry and the name
 * a screen reader gets are identical either way.
 */

import type { RunVerdict } from "../lib/run-view";

/** Which ground the bar is drawn on. */
export type RunBarTone = "light" | "dark";

/** Whole numbers for the label, so the sentence a screen reader gets is one
    a person would say out loud. */
function percent(part: number, whole: number): number {
  return Math.round((part / whole) * 100);
}

export function RunBar({
  verdict,
  tone = "light",
}: {
  verdict: RunVerdict;
  tone?: RunBarTone;
}) {
  const { totalAmount, heldAmount, toVerifyAmount, releasedAmount } = verdict;

  /* An empty run has no composition, and dividing by its total would paint
     three NaN widths. */
  if (totalAmount === 0) {
    return null;
  }

  const segments = [
    { key: "hold", amount: heldAmount, label: "Retenido" },
    { key: "verify", amount: toVerifyAmount, label: "Por verificar" },
    { key: "release", amount: releasedAmount, label: "Liberado" },
  ].filter((segment) => segment.amount > 0);

  const label = segments
    .map((segment, index) => {
      const word = index === 0 ? segment.label : segment.label.toLowerCase();

      return `${word} ${percent(segment.amount, totalAmount)}%`;
    })
    .join(", ");

  return (
    <div
      className={tone === "dark" ? "run-bar run-bar-dark" : "run-bar"}
      role="img"
      aria-label={`${label} del total de la corrida`}
    >
      {segments.map((segment) => (
        <span
          key={segment.key}
          className={`run-bar-seg run-bar-${segment.key}`}
          /* The widths keep their decimals: rounding them to the whole
             numbers the label reads would drop a thin segment to zero and
             leave a gap the eye can see. */
          style={{ width: `${(segment.amount / totalAmount) * 100}%` }}
        />
      ))}
    </div>
  );
}
