/**
 * bun run demo
 *
 * Drives the happy path with no browser and no database: generate the dataset in
 * memory, run the engine over it, assert the invariants the demo depends on, and
 * check the API if it happens to be up.
 *
 * This is the command that runs before every rehearsal and before every judge visit.
 * If it is red, the demo is broken, whatever the screen says.
 *
 * Exit code: 0 when every check passed. An API that is not running is a warning, not
 * a failure, because the engine and the data are what this script exists to prove.
 */

import { resolve } from "node:path";

import {
  dailyBuckets,
  formatAmount,
  maxRollingWindow,
  rollingWindowSum,
} from "../packages/core/src/index.ts";
import {
  addDays,
  DEFAULT_SEED,
  generate,
  summarize,
  toLedgerTx,
} from "../packages/seed/src/index.ts";

const ROOT = resolve(import.meta.dir, "..");
const STATE_FILE = `${ROOT}/.seed/ids.json`;
const ROLLING_WINDOW_DAYS = 7;
const CHART_DAYS = 14;
const CHART_WIDTH = 40;
const HEALTH_TIMEOUT_MS = 1500;

interface Check {
  label: string;
  ok: boolean;
  detail: string;
}

const checks: Check[] = [];

function check(label: string, ok: boolean, detail: string): void {
  checks.push({ label, ok, detail });
}

function cents(value: number): number {
  return Math.round(value * 100);
}

// 1. The data. Reuse the saved window so the demo and the database agree.
let endDate: string | undefined;
let customers = 3;
let months = 6;
const stateFile = Bun.file(STATE_FILE);
if (await stateFile.exists()) {
  try {
    const state = (await stateFile.json()) as {
      options?: { endDate?: string; customers?: number; months?: number };
    };
    endDate = state.options?.endDate;
    customers = state.options?.customers ?? customers;
    months = state.options?.months ?? months;
  } catch {
    endDate = undefined;
  }
}

const dataset = generate({
  seed: DEFAULT_SEED,
  customers,
  months,
  ...(endDate === undefined ? {} : { endDate }),
});
const summary = summarize(dataset);
const ledger = toLedgerTx(dataset);

check(
  "generator produces a dataset",
  dataset.purchases.length > 0 && dataset.deposits.length > 0,
  `${dataset.purchases.length} purchases, ${dataset.deposits.length} deposits, ${dataset.bills.length} bills`,
);
check(
  "dataset is reproducible",
  JSON.stringify(
    generate({
      seed: DEFAULT_SEED,
      customers,
      months,
      ...(endDate === undefined ? {} : { endDate }),
    }),
  ) === JSON.stringify(dataset),
  `seed ${DEFAULT_SEED} regenerated identical output`,
);

let reconciles = true;
for (const account of dataset.accounts) {
  let movement = 0;
  for (const row of ledger) {
    if (row.accountId !== account.id) {
      continue;
    }
    movement +=
      row.direction === "credit" ? cents(row.amount) : -cents(row.amount);
  }
  if (cents(account.balance) !== cents(account.openingBalance) + movement) {
    reconciles = false;
  }
}
check(
  "balances reconcile with the ledger",
  reconciles,
  `${dataset.accounts.length} accounts checked`,
);

// 2. The engine, on the hero account.
const hero = dataset.notes.heroAccountId;
const heroRows = ledger.filter((row) => row.accountId === hero);
const rolling = rollingWindowSum(heroRows, { windowDays: ROLLING_WINDOW_DAYS });
const peak = maxRollingWindow(rolling);
const chartTo = dataset.window.to;
const chartFrom = addDays(chartTo, -(CHART_DAYS - 1));
const buckets = dailyBuckets(heroRows, {
  from: chartFrom,
  to: chartTo,
  fill: true,
});

check(
  "hero account has history",
  heroRows.length > 0,
  `${heroRows.length} ledger rows on ${hero}`,
);
check(
  `rolling ${ROLLING_WINDOW_DAYS} day window runs`,
  rolling.length > 0 && peak !== undefined && peak.totalCents > 0,
  peak === undefined
    ? "no window produced"
    : `peak ${formatAmount(peak.total)} MXN over ${peak.count} transactions ending ${peak.at.slice(0, 10)}`,
);
check(
  "daily buckets fill every day",
  buckets.length === CHART_DAYS,
  `${buckets.length} days from ${chartFrom} to ${chartTo}`,
);
check(
  "every instant parses",
  ledger.every((row) => Number.isFinite(Date.parse(row.occurredAt))),
  `${ledger.length} ledger rows`,
);

const refund = ledger.find((row) => row.id === dataset.notes.refundPurchaseId);
check(
  "the refund reads as a credit",
  refund !== undefined && refund.direction === "credit",
  refund === undefined
    ? "refund missing"
    : `${formatAmount(refund.amount)} MXN credited back`,
);

// 3. The API, if it is up.
const base = Bun.env.API_BASE_URL ?? "http://localhost:3000";
let apiNote = `not running at ${base}, which is fine for this script`;
try {
  const response = await fetch(`${base}/health`, {
    signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS),
  });
  const body = await response.text();
  check(
    "api /health",
    response.ok,
    response.ok
      ? `200 from ${base}/health`
      : `${response.status} from ${base}/health: ${body.slice(0, 120)}`,
  );
  apiNote = response.ok ? "up" : "up but unhealthy";
} catch {
  // Deliberately not a failed check: the engine is what this script proves.
}

// Report.
const spendByDay = buckets.map((bucket) => bucket.debitCents);
const peakDay = Math.max(1, ...spendByDay);
console.log(
  `demo: seed ${dataset.seed}, window ${dataset.window.from} to ${dataset.window.to}`,
);
console.log(`hero account ${hero}, ${heroRows.length} rows, api ${apiNote}`);
console.log("");
console.log(`last ${CHART_DAYS} days of spending on the hero account`);
for (const bucket of buckets) {
  const bar = "#".repeat(
    Math.round((bucket.debitCents / peakDay) * CHART_WIDTH),
  );
  console.log(
    `  ${bucket.day}  ${formatAmount(bucket.debit).padStart(10)}  ${bar}`,
  );
}
console.log("");
console.log(
  `totals: spend ${formatAmount(summary.totals.spend)} MXN, income ${formatAmount(summary.totals.income)} MXN`,
);
console.log("");

let failed = false;
for (const entry of checks) {
  if (!entry.ok) {
    failed = true;
  }
  console.log(
    `[${entry.ok ? "pass" : "FAIL"}] ${entry.label}: ${entry.detail}`,
  );
}
console.log("");
console.log(
  failed
    ? "DEMO PATH IS BROKEN, do not rehearse on this"
    : "demo path is green",
);

process.exit(failed ? 1 : 0);
