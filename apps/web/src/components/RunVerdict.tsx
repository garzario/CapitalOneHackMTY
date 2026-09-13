/**
 * The first thing on the payment run, and for ten seconds the only thing.
 *
 * The scaffold showed four totals of equal weight, and the largest of them was
 * the total of the run, which is the number that matters least: it is the same
 * whether the product works or not. What the clerk needs on a Thursday, and
 * what a judge needs at the table, is the money that is NOT leaving and the
 * single payment that costs the most to get wrong.
 *
 * So the hierarchy is deliberate. One hero figure, two supporting ones, and a
 * named worst case with a link straight to its row. Everything else on the
 * screen is subordinate to that.
 */

import { formatCount } from "../lib/format";
import { ACTION_EDGE, ACTION_INK, DETECTOR_LABEL } from "../lib/labels";
import { instructionPath, Link } from "../lib/router";
import type { RunVerdict as Verdict } from "../lib/run-view";
import { Amount } from "./Primitives";

/** The breakdown under the hero figure, only for the states that are present. */
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
     meaning anything on the run where something was.
     
     Classes and not tokens in an inline style: the design system owns the edge
     and the ink, and `ACTION_EDGE` keys them off the same `Action` union the
     decision buttons read. */
  const tone = stopped
    ? {
        edge: ACTION_EDGE.hold,
        ink: ACTION_INK.hold,
        eyebrow: "No sale todavia",
      }
    : {
        edge: ACTION_EDGE.release,
        ink: ACTION_INK.release,
        eyebrow: "Nada detenido",
      };

  return (
    <section
      aria-label="Resumen de la corrida"
      className="grid gap-3 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)]"
    >
      <div className={`panel flex flex-col gap-2 p-5 ${tone.edge}`}>
        <span className="eyebrow">{tone.eyebrow}</span>

        <span className={tone.ink}>
          <Amount value={verdict.stoppedAmount} size="xl" />
        </span>

        <p className="muted m-0 t-sm">
          {stopped ? (
            <>
              {formatCount(verdict.stoppedCount)} de{" "}
              {formatCount(verdict.totalCount)} instrucciones.{" "}
              {stoppedBreakdown(verdict)}.
            </>
          ) : (
            <>
              Las {formatCount(verdict.totalCount)} instrucciones de la semana
              pasaron los seis controles.
            </>
          )}
        </p>

        {verdict.worst ? (
          <p className="m-0 t-sm">
            <span className="subtle">Mayor riesgo: </span>
            <Link
              to={instructionPath(verdict.worst.instructionId)}
              className="underline"
            >
              {DETECTOR_LABEL[verdict.worst.finding.detector]}
            </Link>
            <span className="subtle">, </span>
            <Amount value={verdict.worst.finding.amountAtRisk} size="sm" />
          </p>
        ) : null}
      </div>

      <div className="panel flex flex-col gap-1 p-5">
        <span className="eyebrow">Liberado</span>
        <span className="ink-release">
          <Amount value={verdict.releasedAmount} size="lg" />
        </span>
        <span className="subtle t-xs">
          {formatCount(verdict.releasedCount)} instrucciones
        </span>
      </div>

      <div className="panel flex flex-col gap-1 p-5">
        <span className="eyebrow">Total de la corrida</span>
        <Amount value={verdict.totalAmount} size="lg" />
        <span className="subtle t-xs">
          {formatCount(verdict.totalCount)} instrucciones
        </span>
      </div>
    </section>
  );
}
