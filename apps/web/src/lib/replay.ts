/**
 * The ledger replay behind the 69-B simulation.
 *
 * The screen shows a publication landing and eight months of already-deducted
 * invoices lighting up one by one. That animation is only worth anything if the
 * number it lands on is the number the engine computed, so this module is a
 * pure function from `SweepResult` to frames, and the last frame is asserted
 * against the totals it came from.
 *
 * Nothing here is hardcoded. The months come from the invoices the sweep priced,
 * the exposure comes from the sweep, and a supplier lights up in the month its
 * first already-paid invoice was issued. If the seed changes, the timeline
 * changes with it, which is what makes it a replay rather than a cartoon.
 *
 * The rounding rule is the one thing worth stating: the per-month figures are
 * apportioned from each supplier's own totals in proportion to the invoices in
 * that month, and the final frame is pinned to the sweep's own totals rather
 * than to the sum of the frames. Cents that fall out of a proportional split
 * belong in the last month, not in a footnote nobody reads.
 */

import type { SweepResult } from "@hackmty/core";

export interface ReplayFrame {
  /** `YYYY-MM`, the month this frame covers. */
  month: string;
  /** Invoices of listed suppliers issued in this month. */
  invoices: number;
  /** RFCs whose first exposed invoice falls in this month. */
  lit: string[];
  /** Every RFC lit up to and including this frame. */
  litSoFar: string[];
  /** Running totals up to and including this frame, in MXN. */
  deductedBase: number;
  isrExposure: number;
  ivaExposure: number;
  totalExposure: number;
}

export interface Replay {
  frames: ReplayFrame[];
  /** The sweep's own totals, which the last frame is pinned to. */
  totals: {
    deductedBase: number;
    isrExposure: number;
    ivaExposure: number;
    totalExposure: number;
  };
}

const CENTS = 100;

function toCents(amount: number): number {
  return Math.round(amount * CENTS);
}

function fromCents(cents: number): number {
  return cents / CENTS;
}

/** `2026-08-11T16:40:00.000Z` becomes `2026-08`. Empty when it cannot be read. */
export function monthOf(instant: string): string {
  const at = Date.parse(instant);
  if (!Number.isFinite(at)) {
    return "";
  }
  return instant.slice(0, 7);
}

/** Every month between the first and the last invoice, with no gaps. */
export function monthsBetween(first: string, last: string): string[] {
  const months: string[] = [];
  const [startYear, startMonth] = first.split("-").map(Number);
  const [endYear, endMonth] = last.split("-").map(Number);

  if (
    startYear === undefined ||
    startMonth === undefined ||
    endYear === undefined ||
    endMonth === undefined
  ) {
    return months;
  }

  let year = startYear;
  let month = startMonth;
  // A guard rather than a while(true): a corrupt pair of dates must not spin.
  for (let step = 0; step < 240; step += 1) {
    months.push(`${year}-${String(month).padStart(2, "0")}`);
    if (year === endYear && month === endMonth) {
      break;
    }
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }

  return months;
}

interface Priced {
  rfc: string;
  month: string;
  baseCents: number;
  isrCents: number;
  ivaCents: number;
}

/**
 * Spreads one supplier's exposure across the months its paid invoices fall in,
 * in proportion to the subtotal of each month. The remainder lands on the last
 * month that supplier appears in, so the frames add up to the supplier's own
 * figures exactly.
 */
function priceSupplier(row: SweepResult["newlyListed"][number]): Priced[] {
  const byMonth = new Map<string, number>();
  for (const cfdi of row.paidCfdis) {
    const month = monthOf(cfdi.issuedAt);
    if (month === "") {
      continue;
    }
    byMonth.set(month, (byMonth.get(month) ?? 0) + toCents(cfdi.subtotal));
  }

  const months = [...byMonth.keys()].sort();
  if (months.length === 0) {
    return [];
  }

  const totalBase = [...byMonth.values()].reduce(
    (sum, cents) => sum + cents,
    0,
  );
  const isrTotal = toCents(row.isrExposure);
  const ivaTotal = toCents(row.ivaExposure);

  let isrSpread = 0;
  let ivaSpread = 0;
  const priced: Priced[] = [];

  months.forEach((month, index) => {
    const baseCents = byMonth.get(month) ?? 0;
    const last = index === months.length - 1;
    const share = totalBase === 0 ? 0 : baseCents / totalBase;
    const isrCents = last ? isrTotal - isrSpread : Math.round(isrTotal * share);
    const ivaCents = last ? ivaTotal - ivaSpread : Math.round(ivaTotal * share);
    isrSpread += isrCents;
    ivaSpread += ivaCents;
    priced.push({
      rfc: row.supplier.rfc,
      month,
      baseCents,
      isrCents,
      ivaCents,
    });
  });

  return priced;
}

export interface ReplayOptions {
  /**
   * The months the ledger itself covers, as instants. The replay walks this
   * window rather than only the months that carry an exposed invoice, because
   * the story is "eight months of this company's ledger, replayed", and a
   * timeline that skips the quiet months tells the reader the publication only
   * touched the months it touched, which is the opposite of the point.
   *
   * Absent, the window is the first and last exposed invoice, which is what an
   * offline screen with no ledger to read can honestly show.
   */
  window?: { from: string; to: string };
}

/**
 * Turns a sweep into the frames the screen walks.
 *
 * A sweep that priced nothing produces no frames, and the screen shows the
 * empty state rather than an animation of zero.
 */
export function buildReplay(
  sweep: SweepResult,
  options: ReplayOptions = {},
): Replay {
  const totals = {
    deductedBase: 0,
    isrExposure: 0,
    ivaExposure: 0,
    totalExposure: sweep.totalExposure,
  };
  let baseTotal = 0;
  let isrTotal = 0;
  let ivaTotal = 0;

  const priced: Priced[] = [];
  const invoiceMonths: string[] = [];
  const firstMonthOf = new Map<string, string>();

  for (const row of sweep.newlyListed) {
    baseTotal += toCents(row.deductedBase);
    isrTotal += toCents(row.isrExposure);
    ivaTotal += toCents(row.ivaExposure);

    for (const entry of priceSupplier(row)) {
      priced.push(entry);
      const current = firstMonthOf.get(entry.rfc);
      if (current === undefined || entry.month < current) {
        firstMonthOf.set(entry.rfc, entry.month);
      }
    }
    for (const cfdi of row.paidCfdis) {
      const month = monthOf(cfdi.issuedAt);
      if (month !== "") {
        invoiceMonths.push(month);
      }
    }
  }

  totals.deductedBase = fromCents(baseTotal);
  totals.isrExposure = fromCents(isrTotal);
  totals.ivaExposure = fromCents(ivaTotal);

  if (invoiceMonths.length === 0) {
    return { frames: [], totals };
  }

  const sorted = [...invoiceMonths].sort();
  const windowFrom = monthOf(options.window?.from ?? "");
  const windowTo = monthOf(options.window?.to ?? "");
  const first =
    windowFrom !== "" && windowFrom < (sorted[0] as string)
      ? windowFrom
      : (sorted[0] as string);
  const lastInvoice = sorted[sorted.length - 1] as string;
  const last =
    windowTo !== "" && windowTo > lastInvoice ? windowTo : lastInvoice;
  const months = monthsBetween(first, last);

  const frames: ReplayFrame[] = [];
  const litSoFar: string[] = [];
  let base = 0;
  let isr = 0;
  let iva = 0;

  months.forEach((month, index) => {
    const rows = priced.filter((entry) => entry.month === month);
    for (const entry of rows) {
      base += entry.baseCents;
      isr += entry.isrCents;
      iva += entry.ivaCents;
    }

    const lit = [...firstMonthOf.entries()]
      .filter(([, first]) => first === month)
      .map(([rfc]) => rfc)
      .sort();
    litSoFar.push(...lit);

    const last = index === months.length - 1;

    frames.push({
      month,
      invoices: invoiceMonths.filter((value) => value === month).length,
      lit,
      litSoFar: [...litSoFar],
      // The last frame is the sweep's own arithmetic, not the sum of the
      // frames. A screen that lands one cent away from the number the engine
      // reported is a screen a judge stops trusting.
      deductedBase: last ? totals.deductedBase : fromCents(base),
      isrExposure: last ? totals.isrExposure : fromCents(isr),
      ivaExposure: last ? totals.ivaExposure : fromCents(iva),
      totalExposure: last ? totals.totalExposure : fromCents(isr + iva),
    });
  });

  return { frames, totals };
}

/**
 * How long each frame is held, so the whole replay stays under the budget.
 *
 * Issue #49 asks for under three seconds on seeded data, and the demo has four
 * minutes for six screens. `REPLAY_BUDGET_MS` is the ceiling and the step is
 * derived from it, so adding a month to the seed slows each frame instead of
 * lengthening the animation past the budget.
 */
export const REPLAY_BUDGET_MS = 2400;
export const REPLAY_MAX_STEP_MS = 320;

export function stepDurationMs(frames: number): number {
  if (frames <= 0) {
    return 0;
  }
  return Math.min(REPLAY_MAX_STEP_MS, Math.floor(REPLAY_BUDGET_MS / frames));
}
