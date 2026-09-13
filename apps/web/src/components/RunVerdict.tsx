/**
 * The first thing on the payment run, and for ten seconds the only thing.
 *
 * There is one figure. The scaffold had three cards of equal weight and the
 * largest of them was the total of the run, which is the number that matters
 * least: it is the same whether the product works or not. Two of those cards
 * are now a line of text, because that is what they are -- context for the one
 * number the clerk actually acts on, which is the money that is not leaving.
 *
 * The figure is set in ink, not in red. The state is carried by the dot and the
 * words beside it, so the colour stays available for the row that needs it. A
 * page where the biggest thing is also the reddest thing has spent its loudest
 * signal on the summary instead of on the exception.
 */

import { formatCount } from "../lib/format";
import { DETECTOR_LABEL } from "../lib/labels";
import { instructionPath, Link } from "../lib/router";
import type { RunVerdict as Verdict } from "../lib/run-view";
import { Amount } from "./Primitives";
import { RunBar } from "./RunBar";

/** The breakdown under the figure, only for the states that are present. */
function stoppedBreakdown(verdict: Verdict): string {
  const parts: string[] = [];

  if (verdict.heldCount > 0) {
    parts.push(`${formatCount(verdict.heldCount)} retenidas`);
  }
  if (verdict.toVerifyCount > 0) {
    parts.push(`${formatCount(verdict.toVerifyCount)} por verificar`);
  }

  return parts.join(", ");
}

export function RunVerdict({ verdict }: { verdict: Verdict }) {
  const stopped = verdict.stoppedCount > 0;

  /* Tone follows the verdict, not the screen. A run where nothing was stopped
     is a good outcome and must not be painted as an alert, or the colour stops
     meaning anything on the run where something was. */
  const tone = stopped
    ? { klass: "decision decision-hold", label: "No sale todavia" }
    : { klass: "decision decision-release", label: "Nada detenido" };

  return (
    <section aria-label="Resumen de la corrida" className="figure-block">
      <span className={`${tone.klass} figure-tone`}>
        <span className="decision-dot" />
        {tone.label}
      </span>

      <span className="figure-value">
        <Amount value={verdict.stoppedAmount} size="inherit" />
      </span>

      {/* The two totals the deleted cards used to carry. They sit here rather
          than in the sentence below because the card is 1400px wide on a laptop
          and a figure alone in the left third of it leaves the other two thirds
          saying nothing. Secondary by size and weight, not by being hidden, and
          set on the hero's own baseline so the three numbers read as one row
          rather than as a figure with a footnote floating beside it. */}
      <dl className="figure-side">
        <div>
          <dt className="subtle t-xs">Liberado</dt>
          <dd className="figure-side-value">
            <Amount value={verdict.releasedAmount} size="inherit" />
          </dd>
        </div>
        <div>
          <dt className="subtle t-xs">Total de la corrida</dt>
          <dd className="figure-side-value">
            <Amount value={verdict.totalAmount} size="inherit" />
          </dd>
        </div>
      </dl>

      {/* The same split the sentence below states in words, drawn across the
          full width of the block so it reads as the composition of the total
          rather than as an ornament under the hero. */}
      <RunBar verdict={verdict} />

      <div className="figure-foot">
        <p className="muted m-0 t-sm">
          {stopped ? (
            <>
              {formatCount(verdict.stoppedCount)} de{" "}
              {formatCount(verdict.totalCount)} instrucciones.{" "}
              {stoppedBreakdown(verdict)}.
            </>
          ) : (
            <>
              Las {formatCount(verdict.totalCount)} instrucciones pasaron los
              seis controles.
            </>
          )}
        </p>

        {/* The only part of this block that is somewhere to go rather than
            something to know, so it is the only part that is a link. */}
        {verdict.worst ? (
          <p className="subtle m-0 t-sm">
            Mayor riesgo{" "}
            <Link
              to={instructionPath(verdict.worst.instructionId)}
              className="underline"
            >
              {DETECTOR_LABEL[verdict.worst.finding.detector]}
            </Link>
            {", "}
            <Amount value={verdict.worst.finding.amountAtRisk} size="sm" />
          </p>
        ) : null}
      </div>
    </section>
  );
}
