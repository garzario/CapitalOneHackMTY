/**
 * How the run's money splits, as an arc each.
 *
 * The bar on the dark card says the same thing in one line and says it first;
 * this is the same split given room to be read. An arc answers "about how
 * much of the run is held" in the time it takes to look at it, and the list
 * beside it answers "how much exactly, and over how many instructions", which
 * is the question the clerk asks second and the one a chart cannot answer.
 *
 * The list is not a legend in the decorative sense: it is the accessible copy
 * of the arcs and the part a person actually reads, so it is real text with
 * real numbers, and the chart beside it is one image with a sentence for its
 * name. The dots are the table's own decision ink, so one colour still means
 * one thing everywhere on this screen.
 */

import { Cell, Pie, PieChart } from "recharts";
import { formatMoneyShort, formatPlural } from "../lib/format";
import type { RunVerdict } from "../lib/run-view";
import { useToken } from "../lib/tokens";
import { Amount } from "./Primitives";
import { EmptyBlock } from "./States";

/*
 * Geometry, not design tokens. A radius in here is not a corner of a box a
 * person could compare with another box: it is the shape of the ring itself,
 * chosen so the arcs stay thick enough to carry a colour at 200px and the
 * centre stays wide enough for the total. `tokens.css` holds the values the
 * interface repeats; these three exist once, here, and mean nothing anywhere
 * else.
 */
const SIZE = 200;
const INNER_RADIUS = 64;
const OUTER_RADIUS = 92;

/* The gap between two arcs, in degrees, and the width of the line that draws
   it in the panel's own white. Together they are what makes three arcs read as
   three objects rather than as one ring in three colours. */
const PADDING_ANGLE = 4;
const ARC_STROKE = 2;

type Segment = {
  key: "hold" | "verify" | "release";
  label: string;
  amount: number;
  count: number;
  fill: string;
};

/** Whole numbers, because the sentence is one a person would say out loud. */
function percent(part: number, whole: number): number {
  return Math.round((part / whole) * 100);
}

export function RunDonut({ verdict }: { verdict: RunVerdict }) {
  /* Recharts takes numbers where the rest of the app writes `var(--…)`. See
     lib/tokens.ts for why this hook is the only place that is allowed. */
  const cornerRadius = useToken("--radius-sm", 6);

  /* A run with no money has no composition, and three arcs of NaN degrees are
     a blank square where the answer should be. */
  if (verdict.totalAmount === 0) {
    return (
      <EmptyBlock
        title="No hay nada que repartir"
        description="La corrida todavia no tiene importes, asi que no hay composicion que mostrar."
      />
    );
  }

  const segments: Segment[] = (
    [
      {
        key: "hold",
        label: "Retenido",
        amount: verdict.heldAmount,
        count: verdict.heldCount,
        fill: "var(--c-hold)",
      },
      {
        key: "verify",
        label: "Por verificar",
        amount: verdict.toVerifyAmount,
        count: verdict.toVerifyCount,
        fill: "var(--c-verify)",
      },
      {
        key: "release",
        label: "Liberado",
        amount: verdict.releasedAmount,
        count: verdict.releasedCount,
        fill: "var(--c-release)",
      },
    ] satisfies Segment[]
  ).filter((segment) => segment.amount > 0);

  /* The name the chart answers to. It is the same sentence the bar on the
     dark card carries, for the same reason: three unlabelled arcs announce
     nothing, and this is what the picture actually says. */
  const label = segments
    .map((segment, index) => {
      const word = index === 0 ? segment.label : segment.label.toLowerCase();

      return `${word} ${percent(segment.amount, verdict.totalAmount)}%`;
    })
    .join(", ");

  return (
    <div className="donut-row">
      {/* One image with one name. Everything inside is presentational: the
          arcs cannot be read and the total under them is said again by the
          list on the right and by the run's own total above. */}
      <div
        className="donut-figure"
        role="img"
        aria-label={`${label} del total de la corrida`}
      >
        {/* Recharts makes its surface a focus stop by default -- `role`
            `application` with a tab index, and a second one on the ring
            itself. Here that is two stops on a picture with nothing to
            operate and no name of its own, in front of the list that says
            everything the picture says. `bun run audit:web` counted them
            before anyone had to tab into them. */}
        <PieChart width={SIZE} height={SIZE} accessibilityLayer={false}>
          <Pie
            data={segments}
            dataKey="amount"
            nameKey="label"
            rootTabIndex={-1}
            cx="50%"
            cy="50%"
            innerRadius={INNER_RADIUS}
            outerRadius={OUTER_RADIUS}
            paddingAngle={PADDING_ANGLE}
            cornerRadius={cornerRadius}
            strokeLinecap="round"
            stroke="var(--c-surface-raised)"
            strokeWidth={ARC_STROKE}
            /* No animation, on purpose, and the same reason as the bars in
               Controls: a number a person is about to act on should be
               correct in the first frame rather than grow into place. It is
               also what reduced motion would ask for anyway. */
            isAnimationActive={false}
          >
            {segments.map((segment) => (
              <Cell key={segment.key} fill={segment.fill} />
            ))}
          </Pie>
        </PieChart>

        <span className="donut-centre">
          <span className="subtle t-xs">Total</span>
          <span className="num t-xl">
            {formatMoneyShort(verdict.totalAmount)}
          </span>
        </span>
      </div>

      <ul className="donut-legend">
        {segments.map((segment) => (
          <li className="donut-legend-row" key={segment.key}>
            {/* The dot borrows `.decision`, which is the primitive that pairs
                a status colour with a word; here the word is the label beside
                it rather than inside it. */}
            <span
              aria-hidden="true"
              className={`decision decision-${segment.key}`}
            >
              <span className="decision-dot" />
            </span>

            <span className="donut-legend-main">
              <span className="flex flex-wrap items-baseline gap-2">
                <span className="t-base font-medium">{segment.label}</span>
                <span className="muted t-sm">
                  {percent(segment.amount, verdict.totalAmount)}%
                </span>
              </span>
              <span className="subtle t-xs">
                {formatPlural(segment.count, "instruccion")}
              </span>
            </span>

            <Amount
              value={segment.amount}
              size="base"
              className="donut-legend-amount"
            />
          </li>
        ))}
      </ul>
    </div>
  );
}
