/**
 * The first thing on the payment run, and for ten seconds the only thing.
 *
 * There is one figure, and it is the money that is not leaving. The scaffold
 * had three cards of equal weight and the largest of them was the total of the
 * run, which is the number that matters least: it is the same whether the
 * product works or not. The other two are still here and still secondary.
 *
 * What carries the hierarchy now is the ground each one stands on. The figure
 * sits on the single dark card in the app, the other two on pale wells, so the
 * eye lands on the stopped amount before it has read a word -- one inversion on
 * a light page is the strongest signal available, and it only stays strong
 * while there is exactly one of them. Size then says the same thing a second
 * time: 38px against 30px.
 *
 * The figure is set in the card's own ink, not in red. The state is carried by
 * the words beside it, so the decision colours stay available for the rows that
 * need them. A page where the biggest thing is also the reddest thing has spent
 * its loudest signal on the summary instead of on the exception.
 */

import { formatCount, formatPlural } from "../lib/format";
import { DETECTOR_LABEL } from "../lib/labels";
import { instructionPath, Link } from "../lib/router";
import type { RunVerdict as Verdict } from "../lib/run-view";
import { IconReceipt, IconShield } from "./Icons";
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
    <section
      aria-label="Resumen de la corrida"
      className="grid gap-4 md:grid-cols-3"
    >
      {/* The focal card. Its label does not change when nothing was stopped:
          it names the question the clerk opens the screen with, and a run that
          answers it with zero is still answering that question. The sentence
          under the bar is where a clean run is celebrated. */}
      <div className="card-dark flex flex-col gap-4">
        <span className="muted t-sm">No sale todavia</span>

        <Amount value={verdict.stoppedAmount} size="xl" />

        {/* The split the sentence below states in words, in the channel the
            eye reads first. Monochrome up here: see RunBar. */}
        <RunBar verdict={verdict} tone="dark" />

        <div className="flex flex-col gap-1">
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

          {/* The only part of this card that is somewhere to go rather than
              something to know, so it is the only part that is a link. */}
          {verdict.worst ? (
            <p className="muted m-0 t-sm">
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
      </div>

      {/* The two supporting figures. A well each, no panel: three lines of
          text on a pale ground do not need a white rectangle drawn behind
          them. The glyph is the only shape in the cell that is not type, which
          is what keeps two of them from reading as decoration. */}
      <div className="well">
        <div className="well-body flex flex-col gap-2">
          <div className="flex items-start justify-between gap-3">
            <span className="muted t-sm">Liberado</span>
            <span className="subtle">
              <IconShield size={18} />
            </span>
          </div>
          <span className="t-2xl">
            <Amount value={verdict.releasedAmount} size="inherit" />
          </span>
          <span className="subtle t-sm">
            {formatPlural(verdict.releasedCount, "instruccion")}
          </span>
        </div>
      </div>

      <div className="well">
        <div className="well-body flex flex-col gap-2">
          <div className="flex items-start justify-between gap-3">
            <span className="muted t-sm">Total de la corrida</span>
            <span className="subtle">
              <IconReceipt size={18} />
            </span>
          </div>
          <span className="t-2xl">
            <Amount value={verdict.totalAmount} size="inherit" />
          </span>
          <span className="subtle t-sm">
            {formatPlural(verdict.totalCount, "instruccion")}
          </span>
        </div>
      </div>
    </section>
  );
}
