/**
 * The first thing on the payment run, and for ten seconds the only thing.
 *
 * There is one figure, and it is the money that is not leaving. The scaffold
 * had three cards of equal weight and the largest of them was the total of the
 * run, which is the number that matters least: it is the same whether the
 * product works or not. The others are still here and still secondary.
 *
 * What carries the hierarchy now is the ground each one stands on. The figure
 * sits on the single dark card in the app, the rest on pale wells, so the
 * eye lands on the stopped amount before it has read a word -- one inversion on
 * a light page is the strongest signal available, and it only stays strong
 * while there is exactly one of them. Size then says the same thing a second
 * time: 38px against 30px.
 *
 * The figure is set in the card's own ink, not in red. The state is carried by
 * the words beside it, so the decision colours stay available for the rows that
 * need them. A page where the biggest thing is also the reddest thing has spent
 * its loudest signal on the summary instead of on the exception.
 *
 * Two of the four wells are the answer to the question a Capital One judge
 * asked, which is what the product is worth rather than what it does. "En
 * riesgo" is the pesos this run puts at risk, and "Exposicion retroactiva" is
 * the loss that needs no fraud at all: the SAT publishes a list and everything
 * already paid and already deducted to a supplier on it reverses. Both come from
 * `runMoney` in `@hackmty/core`, which is the arithmetic behind the API's own
 * totals, so the tile and `GET /api/v1/run/current` cannot disagree.
 *
 * Every figure counts up when it changes, because the second beat of the demo
 * changes four of them without anybody clicking, and a number replaced between
 * two frames is a number nobody saw change. The same fact is written out as a
 * sentence in a live region under the figures, because the count is only visible
 * to whoever happened to be looking at that corner of the screen.
 */

import type { ReactNode } from "react";
import { useCountUp } from "../lib/count-up";
import { formatCount, formatMoney, formatPlural } from "../lib/format";
import { DETECTOR_LABEL } from "../lib/labels";
import { instructionPath, Link } from "../lib/router";
import type { RunVerdict as Verdict } from "../lib/run-view";
import { IconList, IconReceipt, IconRun, IconShield } from "./Icons";
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

/**
 * One supporting figure: a word, a glyph, the pesos and one line saying what the
 * pesos are.
 *
 * A well each and no panel: three lines of text on a pale ground do not need a
 * white rectangle drawn behind them. The glyph is the only shape in the cell that
 * is not type, which is what keeps four of them from reading as decoration.
 */
function Tile({
  label,
  value,
  detail,
  icon,
}: {
  label: string;
  value: number;
  detail: string;
  icon: ReactNode;
}) {
  const shown = useCountUp(value);

  return (
    <div className="well min-w-0">
      <div className="well-body flex flex-col gap-2">
        <div className="flex items-start justify-between gap-3">
          <span className="muted t-sm">{label}</span>
          <span className="subtle">{icon}</span>
        </div>
        <span className="t-2xl">
          <Amount value={shown} size="inherit" />
        </span>
        <span className="subtle t-sm">{detail}</span>
      </div>
    </div>
  );
}

export function RunVerdict({
  verdict,
  change = "",
}: {
  verdict: Verdict;
  /** What the last refresh moved, from `runChangeSentence`. Empty until one did. */
  change?: string;
}) {
  const stopped = verdict.stoppedCount > 0;
  const stoppedAmount = useCountUp(verdict.stoppedAmount);
  const swept =
    verdict.retroactive69bExposure > 0 || verdict.retroactive69bBase > 0;

  return (
    <section aria-label="Resumen de la corrida" className="flex flex-col gap-2">
      <div className="grid gap-4 md:grid-cols-3">
        {/* The focal card. Its label does not change when nothing was stopped:
            it names the question the clerk opens the screen with, and a run that
            answers it with zero is still answering that question. The sentence
            under the bar is where a clean run is celebrated. */}
        <div className="card-dark flex flex-col gap-4">
          <span className="muted t-sm">No sale todavia</span>

          <Amount value={stoppedAmount} size="xl" />

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
                  Las {formatCount(verdict.totalCount)} instrucciones pasaron
                  los seis controles.
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

        {/* Two by two in the two columns the card leaves, and one under the
            other on a phone.

            Four in a row is what this wanted to be and it does not fit: beside
            the card at 1440 each tile is 152px wide and the widest amount in
            the run sets 181px of digits, so the row overflowed its own wells and
            pushed the document four pixels wider than the viewport, which is the
            failure `bun run audit:web` exists to catch. Two by two is the
            arrangement where a seven-digit peso figure is still a peso figure. */}
        <div className="grid gap-4 sm:grid-cols-2 md:col-span-2">
          <Tile
            label="Liberado"
            value={verdict.releasedAmount}
            detail={formatPlural(verdict.releasedCount, "instruccion")}
            icon={<IconShield size={18} />}
          />

          <Tile
            label="En riesgo"
            value={verdict.amountAtRisk}
            detail="el mayor importe en riesgo de cada linea, sumado"
            icon={<IconRun size={18} />}
          />

          <Tile
            label="Exposicion retroactiva 69-B"
            value={verdict.retroactive69bExposure}
            detail={
              swept
                ? `sobre una base deducida de ${formatMoney(verdict.retroactive69bBase)}`
                : "ninguna publicacion ha alcanzado a un proveedor de esta corrida"
            }
            icon={<IconList size={18} />}
          />

          <Tile
            label="Total de la corrida"
            value={verdict.totalAmount}
            detail={formatPlural(verdict.totalCount, "instruccion")}
            icon={<IconReceipt size={18} />}
          />
        </div>
      </div>

      {/*
       * What moved, in words, for everybody who was not watching the figure that
       * moved. Polite rather than assertive: the run re-scoring itself is news
       * and not an alarm, so it waits for whatever the reader is in the middle
       * of. Always rendered, so the region exists before it has anything to say
       * -- a live region added to the page at the same moment as its text is a
       * live region a screen reader does not announce.
       */}
      <p aria-live="polite" className="subtle m-0 t-xs">
        {change}
      </p>
    </section>
  );
}
