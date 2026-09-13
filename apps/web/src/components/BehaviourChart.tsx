/**
 * What this supplier invoiced the company, week by week, against its own pace.
 *
 * One unit on one axis, and the unit is invoices. That is not a stylistic
 * preference: the only reference the product can honestly draw on this chart is
 * `baselineRatePerWeek`, the supplier's own issuance rate over its own baseline,
 * which the `supplier_behaviour` detector computed and put in the finding's
 * evidence. A bar chart of pesos with a dashed line at a rate would be two units
 * on one scale, and a judge would be right to ask what the line meant. The pesos
 * and the largest invoice of each week ride in the tooltip and in the words below,
 * where they do not have to share an axis.
 *
 * The dashed line is the whole argument of control 4 in one picture: "emitio N
 * facturas esta semana contra M esperadas por su propio ritmo". When the detector
 * raised nothing there is no line, because there is no baseline the arithmetic
 * ran, and drawing one from the chart's own mean would be this component
 * inventing a threshold.
 *
 * The weeks under review are tinted. The window comes from the finding, not from
 * a count of bars, so the tint moves when the detector's window moves.
 *
 * The chart is not the accessible copy of this information. A screen reader gets
 * the same series as a list, the way `ControlsPanel` does it, because an SVG of
 * rectangles cannot be read out.
 */

import {
  Bar,
  BarChart,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatCount, formatDecimal, formatMoney } from "../lib/format";
import type { SupplierWeekPoint } from "../lib/supplier-profile";
import { useToken } from "../lib/tokens";

/** Tall enough for the tallest bar to have a shape, short enough to sit in a well. */
const HEIGHT = 208;

/** Below this the week labels collide, so the chart scrolls instead of lying. */
const MIN_WIDTH_PER_WEEK = 34;

/** Short month names, the same eight the SAT replay ticks with. */
const MONTH_LABEL = [
  "ene",
  "feb",
  "mar",
  "abr",
  "may",
  "jun",
  "jul",
  "ago",
  "sep",
  "oct",
  "nov",
  "dic",
];

/**
 * The day and the month of the Monday that opens the bucket, in UTC.
 *
 * UTC and not Monterrey, deliberately. The bucket boundary is a UTC Monday
 * midnight, so rendering it in local time would print the Sunday and a judge
 * comparing a bar against a row of `supplier_weekly_outflow` would find the
 * labels off by a day.
 */
export function weekTick(week: string): string {
  const date = new Date(week);

  if (Number.isNaN(date.getTime())) {
    return week;
  }

  const month = MONTH_LABEL[date.getUTCMonth()] ?? "";

  return `${date.getUTCDate()} ${month}`;
}

/** The whole week as one sentence, for the tooltip and for the screen reader. */
export function weekSentence(point: SupplierWeekPoint): string {
  if (point.invoices === 0) {
    return "sin facturas";
  }

  const head = `${formatCount(point.invoices)} ${point.invoices === 1 ? "factura" : "facturas"}, ${formatMoney(point.outflow)}`;

  return point.invoices === 1
    ? head
    : `${head}, la mayor de ${formatMoney(point.maxInvoice)}`;
}

function WeekTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: SupplierWeekPoint }>;
}) {
  const point = payload?.[0]?.payload;

  if (!active || !point) {
    return null;
  }

  return (
    <div className="chart-tip">
      <p className="m-0 font-medium">Semana del {weekTick(point.week)}</p>
      <p className="muted m-0">{weekSentence(point)}</p>
      {point.recent ? (
        <p className="subtle m-0 t-xs">Ventana en revision</p>
      ) : null}
    </div>
  );
}

export function BehaviourChart({
  series,
  ratePerWeek,
}: {
  series: readonly SupplierWeekPoint[];
  /** The baseline pace the detector measured, or null when none ran. */
  ratePerWeek: number | null;
}) {
  const barRadius = useToken("--radius-sm", 6);
  const tickSize = useToken("--text-xs", 12);
  const data = [...series];

  return (
    <>
      {/* The words, for anyone the rectangles cannot reach. */}
      <ul className="sr-only">
        {ratePerWeek === null ? null : (
          <li>
            Ritmo propio del proveedor: {formatDecimal(ratePerWeek)} facturas
            por semana.
          </li>
        )}
        {data.map((point) => (
          <li key={point.week}>
            Semana del {weekTick(point.week)}: {weekSentence(point)}
            {point.recent ? ", en la ventana en revision" : ""}.
          </li>
        ))}
      </ul>

      <div aria-hidden="true" className="chart-scroll">
        <div
          className="chart-canvas"
          style={{ minWidth: `${data.length * MIN_WIDTH_PER_WEEK}px` }}
        >
          <ResponsiveContainer width="100%" height={HEIGHT}>
            <BarChart
              data={data}
              margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
            >
              <XAxis
                dataKey="week"
                tickFormatter={weekTick}
                tickLine={false}
                axisLine={false}
                interval="preserveStartEnd"
                minTickGap={18}
                tick={{ fontSize: tickSize, fill: "var(--c-ink-subtle)" }}
              />
              <YAxis
                allowDecimals={false}
                width={28}
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: tickSize, fill: "var(--c-ink-subtle)" }}
              />
              <Tooltip
                content={<WeekTooltip />}
                cursor={{ fill: "var(--c-surface-sunken)" }}
              />
              {ratePinnable(ratePerWeek) ? (
                <ReferenceLine
                  y={ratePerWeek}
                  stroke="var(--c-verify)"
                  strokeDasharray="4 4"
                  ifOverflow="extendDomain"
                />
              ) : null}
              <Bar
                dataKey="invoices"
                radius={[barRadius, barRadius, 0, 0]}
                maxBarSize={18}
                /* No animation. The run is a financial screen and a bar that
                   grows into place is a number that was wrong in the first
                   frame. Same rule as the controls chart. */
                isAnimationActive={false}
              >
                {data.map((point) => (
                  <Cell
                    key={point.week}
                    fill={
                      point.invoices === 0
                        ? "var(--c-border)"
                        : point.recent
                          ? "var(--c-hold)"
                          : "var(--c-ink-subtle)"
                    }
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </>
  );
}

/** A rate of zero is a rate, but a line on the axis is furniture, not evidence. */
function ratePinnable(rate: number | null): rate is number {
  return rate !== null && Number.isFinite(rate) && rate > 0;
}
