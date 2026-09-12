import { motion, useReducedMotion } from "motion/react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { StatusCard } from "./components/StatusCard";

/** TODO(product): the product name, once ADR-0002 picks the track and thesis. */
const PRODUCT_NAME = "TODO(product)";

/** TODO(thesis): one sentence, who gets what outcome through which mechanism. */
const THESIS =
  "TODO(thesis): one sentence naming who this serves, the outcome they get, and the mechanism that makes it possible.";

type Point = { label: string; value: number };

/**
 * Placeholder series, not measured data. The real numbers will come from
 * packages/core through the API once the engine exists.
 * TODO(data): replace with a seeded ledger aggregate.
 */
const PLACEHOLDER_SERIES: Point[] = [
  { label: "W1", value: 18 },
  { label: "W2", value: 24 },
  { label: "W3", value: 21 },
  { label: "W4", value: 32 },
  { label: "W5", value: 29 },
  { label: "W6", value: 38 },
];

export default function App() {
  const reduceMotion = useReducedMotion();
  const hidden = reduceMotion ? false : { opacity: 0, y: 10 };

  return (
    <div className="min-h-screen">
      <a className="skip-link" href="#main">
        Skip to main content
      </a>

      <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-5 py-10 sm:px-8 sm:py-14">
        <motion.header
          initial={hidden}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
          className="flex flex-col gap-3"
        >
          <p
            className="text-xs font-semibold tracking-widest uppercase"
            style={{ color: "var(--ink-muted)" }}
          >
            HackMTY 2026, Capital One challenge
          </p>
          <h1 className="text-3xl leading-tight font-semibold sm:text-4xl">
            {PRODUCT_NAME}
          </h1>
          <p
            className="max-w-2xl text-base leading-relaxed"
            style={{ color: "var(--ink-muted)" }}
          >
            {THESIS}
          </p>
        </motion.header>

        <motion.main
          id="main"
          initial={hidden}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.08, ease: "easeOut" }}
          className="grid gap-4 lg:grid-cols-3"
        >
          <figure className="panel m-0 flex flex-col gap-4 p-5 lg:col-span-2">
            <figcaption className="flex flex-col gap-1">
              <h2
                className="text-sm font-semibold tracking-wide uppercase"
                style={{ color: "var(--ink-muted)" }}
              >
                Trend
              </h2>
              <p className="text-sm" style={{ color: "var(--ink-muted)" }}>
                Placeholder series with six points, kept here so the chart layer
                is wired and styled before the engine exists.
              </p>
            </figcaption>

            <div className="h-64 w-full sm:h-72">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={PLACEHOLDER_SERIES}
                  margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
                >
                  <defs>
                    <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
                      <stop
                        offset="0%"
                        stopColor="var(--accent)"
                        stopOpacity={0.32}
                      />
                      <stop
                        offset="100%"
                        stopColor="var(--accent)"
                        stopOpacity={0}
                      />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="var(--grid)" vertical={false} />
                  <XAxis
                    dataKey="label"
                    stroke="var(--border)"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fill: "var(--ink-muted)", fontSize: 12 }}
                  />
                  <YAxis
                    width={36}
                    stroke="var(--border)"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fill: "var(--ink-muted)", fontSize: 12 }}
                  />
                  <Tooltip
                    cursor={{ stroke: "var(--border)" }}
                    contentStyle={{
                      backgroundColor: "var(--surface)",
                      border: "1px solid var(--border)",
                      borderRadius: 10,
                      boxShadow: "var(--shadow)",
                    }}
                    labelStyle={{ color: "var(--ink-muted)" }}
                    itemStyle={{ color: "var(--ink)" }}
                  />
                  <Area
                    type="monotone"
                    dataKey="value"
                    name="Placeholder value"
                    stroke="var(--accent)"
                    strokeWidth={2}
                    fill="url(#trendFill)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </figure>

          <StatusCard />
        </motion.main>

        <motion.footer
          initial={hidden}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.16, ease: "easeOut" }}
          className="text-xs leading-relaxed"
          style={{ color: "var(--ink-muted)" }}
        >
          Prototype built on synthetic data. Not a financial institution, and
          not financial advice.
        </motion.footer>
      </div>
    </div>
  );
}
