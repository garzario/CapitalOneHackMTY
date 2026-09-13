/**
 * The six controls, all six, every time.
 *
 * This replaced a column that listed the run's findings a second time, sorted
 * the same way the table beside it was already sorted. Repeating the table is
 * not a second opinion; it is the same opinion in a different shape, and it cost
 * the screen a third of its width.
 *
 * What was missing instead was the thing the product actually claims: that six
 * named controls run over every instruction, and that a control which found
 * nothing says so rather than going quiet. A panel that only lists hits cannot
 * be told apart from a panel whose checks never ran. This one always draws six
 * bars in the order of `DETECTOR_ORDER`, so "Sin hallazgos" is a result and not
 * an absence.
 *
 * It became a chart when the panels came off the screen. The six numbers are
 * pesos at risk and they are wildly unequal -- one control usually carries most
 * of the run -- which is a comparison a column of text makes you do in your head
 * and a row of bars makes in the first glance. Nothing else changed: it is still
 * derived from the findings on the run, never from a hardcoded list, so a
 * seventh detector in `packages/core` shows up here the day it lands.
 *
 * The chart is not the accessible copy of this information. A screen reader gets
 * the same six lines as words, which is what the list used to be and what an SVG
 * of rectangles cannot be.
 */

import type { Detector } from "@hackmty/core";
import {
  Bar,
  BarChart,
  Cell,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { PaymentRunItem } from "../lib/contract";
import { formatMoney, formatMoneyShort, formatPlural } from "../lib/format";
import { DETECTOR_LABEL, DETECTOR_ORDER } from "../lib/labels";
import { useToken } from "../lib/tokens";

type ControlSummary = {
  detector: Detector;
  /** Instructions this control raised at least one finding on. */
  instructions: number;
  amountAtRisk: number;
};

export function summariseControls(
  items: readonly PaymentRunItem[],
): ControlSummary[] {
  return DETECTOR_ORDER.map((detector) => {
    let instructions = 0;
    let amountAtRisk = 0;

    for (const item of items) {
      const hits = item.findings.filter(
        (finding) => finding.detector === detector,
      );

      if (hits.length === 0) continue;

      /* Counted once per instruction, not once per finding: two findings from
         the same control on the same payment is one payment to look at. */
      instructions += 1;
      for (const hit of hits) amountAtRisk += hit.amountAtRisk;
    }

    return { detector, instructions, amountAtRisk };
  });
}

/** One bar's worth of the chart, with the words it needs already resolved. */
type ControlPoint = ControlSummary & { label: string };

/** Six rows at 36px each, which is the height the labels need to breathe. */
const ROW_HEIGHT = 36;

/* Room at the right for the amount that sits at the end of the longest bar.
   Recharts scales the bars to the plot area, so without this reservation the
   widest bar ends at the edge and its own label is drawn off the canvas. */
const LABEL_GUTTER = 96;

/** How wide the detector names need before they start clipping. */
const AXIS_WIDTH = 232;

function ControlTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: ControlPoint }>;
}) {
  const point = payload?.[0]?.payload;

  if (!active || !point) {
    return null;
  }

  return (
    <div className="chart-tip">
      <p className="m-0 font-medium">{point.label}</p>
      <p className="muted m-0">
        {point.instructions === 0 ? (
          "Sin hallazgos"
        ) : (
          <>
            {formatPlural(point.instructions, "instruccion")} ·{" "}
            <span className="num">{formatMoney(point.amountAtRisk)}</span>
          </>
        )}
      </p>
    </div>
  );
}

export function ControlsPanel({ items }: { items: readonly PaymentRunItem[] }) {
  const controls = summariseControls(items);
  const data: ControlPoint[] = controls.map((control) => ({
    ...control,
    label: DETECTOR_LABEL[control.detector],
  }));

  /* Recharts takes numbers where the rest of the app writes `var(--…)`. See
     lib/tokens.ts for why this hook is the only place that is allowed. */
  const barRadius = useToken("--radius-md", 8);
  const tickSize = useToken("--text-xs", 12);
  /* The gap between the end of a bar and its amount, off the spacing scale
     like every other gap on the screen. */
  const labelGap = useToken("--space-2", 8);

  return (
    <section
      aria-labelledby="controls-heading"
      className="flex min-w-0 flex-col"
    >
      <div className="section-head">
        <h2 id="controls-heading" className="t-lg">
          Controles
        </h2>
        <span className="subtle t-sm">
          {formatPlural(items.length, "instruccion")} revisadas
        </span>
      </div>

      {/* The words, for anyone the rectangles cannot reach. */}
      <ul className="sr-only">
        {data.map((control) => (
          <li key={control.detector}>
            {control.label}:{" "}
            {control.instructions === 0
              ? "sin hallazgos"
              : `${formatPlural(control.instructions, "instruccion")}, ${formatMoney(control.amountAtRisk)} en riesgo`}
          </li>
        ))}
      </ul>

      {/* The detector names do not shrink, so below their own width the chart
          scrolls inside its own box rather than squeezing six labels into a
          phone. Same rule as the table. */}
      <div aria-hidden="true" className="chart-scroll">
        <div className="chart-canvas">
          <ResponsiveContainer width="100%" height={data.length * ROW_HEIGHT}>
            <BarChart
              data={data}
              layout="vertical"
              margin={{ top: 0, right: LABEL_GUTTER, bottom: 0, left: 0 }}
            >
              <XAxis type="number" hide />
              <YAxis
                dataKey="label"
                type="category"
                width={AXIS_WIDTH}
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: tickSize, fill: "var(--c-ink-muted)" }}
              />
              <Tooltip
                content={<ControlTooltip />}
                cursor={{ fill: "var(--c-surface-sunken)" }}
              />
              <Bar
                dataKey="amountAtRisk"
                barSize={12}
                radius={[0, barRadius, barRadius, 0]}
                /* A control that found nothing still has a row, and a row with
                   no width at all reads as a missing control rather than as a
                   clean one. Two pixels is the stub that says "this ran". */
                minPointSize={2}
                /* No animation, on purpose. A number a person is about to act
                   on should be correct in the first frame and not grow into
                   place, and this is the amount of money at risk. */
                isAnimationActive={false}
              >
                {data.map((control) => (
                  <Cell
                    key={control.detector}
                    fill={
                      control.instructions > 0
                        ? "var(--c-hold)"
                        : "var(--c-border)"
                    }
                  />
                ))}
                <LabelList
                  dataKey="amountAtRisk"
                  position="right"
                  content={(props) => {
                    const { x, y, width, height, index } = props as {
                      x: number;
                      y: number;
                      width: number;
                      height: number;
                      index: number;
                    };
                    const control = data[index];

                    if (!control) {
                      return null;
                    }

                    const hit = control.instructions > 0;

                    return (
                      <text
                        className={hit ? "num" : undefined}
                        x={x + width + labelGap}
                        y={y + height / 2}
                        dominantBaseline="central"
                        fontSize={tickSize}
                        fill={hit ? "var(--c-ink)" : "var(--c-ink-subtle)"}
                      >
                        {!hit
                          ? "Sin hallazgos"
                          : control.amountAtRisk > 0
                            ? formatMoneyShort(control.amountAtRisk)
                            : `${formatPlural(control.instructions, "instruccion")}, sin pesos en riesgo`}
                      </text>
                    );
                  }}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </section>
  );
}
