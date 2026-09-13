/**
 * The first thing on the payment run, and for ten seconds the only thing.
 *
 * There is one figure. The scaffold had three cards of equal weight and the
 * largest of them was the total of the run, which is the number that matters
 * least: it is the same whether the product works or not. The other two are
 * still here, still secondary, but they are now cells in the same row as the
 * figure rather than a footnote floating beside it -- which is what they always
 * were, and the row is the shape that says so.
 *
 * What went away with the redesign is the box. This used to be a tinted card,
 * the one surface on the screen with a background of its own, because a
 * dashboard of white cards on a white page has no centre. It has one now
 * without the tint: the row is bounded by two hairlines and nothing else, and
 * the eye lands on the stopped amount because it is the biggest thing on the
 * page after the greeting, not because something was painted behind it. Size
 * and air do the work a background was doing.
 *
 * The figure is set in ink, not in red. The state is carried by the words
 * beside it, so the colour stays available for the row that needs it. A page
 * where the biggest thing is also the reddest thing has spent its loudest
 * signal on the summary instead of on the exception.
 */

import { formatCount } from "../lib/format";
import { DETECTOR_LABEL } from "../lib/labels";
import { instructionPath, Link } from "../lib/router";
import type { RunVerdict as Verdict } from "../lib/run-view";
import { IconReceipt, IconRun, IconShield } from "./Icons";
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

  return (
    <section aria-label="Resumen de la corrida" className="flex flex-col">
      <dl className="metric-row">
        {/* The focal cell. Its label does not change when nothing was stopped:
            it names the question the clerk opens the screen with, and a run
            that answers it with zero is still answering that question. The
            sentence under the bar is where a clean run is celebrated. */}
        <div className="metric metric-lead">
          <dt className="metric-head">
            <span className="metric-tile">
              <IconRun size={20} />
            </span>
            <span className="metric-label">No sale todavia</span>
          </dt>
          <dd className="metric-body">
            <span className="metric-value metric-value-lead">
              <Amount value={verdict.stoppedAmount} size="inherit" />
            </span>

            {/* The only part of this row that is somewhere to go rather than
                something to know, so it is the only part that is a link. */}
            {verdict.worst ? (
              <span className="subtle block t-sm">
                Mayor riesgo{" "}
                <Link
                  to={instructionPath(verdict.worst.instructionId)}
                  className="underline"
                >
                  {DETECTOR_LABEL[verdict.worst.finding.detector]}
                </Link>
                {", "}
                <Amount value={verdict.worst.finding.amountAtRisk} size="sm" />
              </span>
            ) : null}
          </dd>
        </div>

        <div className="metric">
          <dt className="metric-head">
            <span className="metric-tile">
              <IconShield size={20} />
            </span>
            <span className="metric-label">Liberado</span>
          </dt>
          <dd className="metric-body">
            <span className="metric-value">
              <Amount value={verdict.releasedAmount} size="inherit" />
            </span>
          </dd>
        </div>

        <div className="metric">
          <dt className="metric-head">
            <span className="metric-tile">
              <IconReceipt size={20} />
            </span>
            <span className="metric-label">Total de la corrida</span>
          </dt>
          <dd className="metric-body">
            <span className="metric-value">
              <Amount value={verdict.totalAmount} size="inherit" />
            </span>
          </dd>
        </div>
      </dl>

      {/* The same split the sentence below states in words, drawn across the
          full width of the screen so it reads as the composition of the total
          rather than as an ornament under one cell. */}
      <div className="metric-bar">
        <RunBar verdict={verdict} />
      </div>

      <p className="muted m-0 t-sm">
        {stopped ? (
          <>
            {formatCount(verdict.stoppedCount)} de{" "}
            {formatCount(verdict.totalCount)} instrucciones.{" "}
            {stoppedBreakdown(verdict)}.
          </>
        ) : (
          <>
            Las {formatCount(verdict.totalCount)} instrucciones pasaron los seis
            controles.
          </>
        )}
      </p>
    </section>
  );
}
