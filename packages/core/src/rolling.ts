/**
 * Time-window primitives over a ledger.
 *
 * Two functions, both pure, both total: they take a list of transactions and
 * return a new list. No clock, no network, no database, no mutation of the input.
 * That is what makes the behaviour provable in a unit test an engineer can read
 * in thirty seconds, which is the point of packages/core existing at all.
 *
 * Dirty input is survived rather than rejected: a row whose `occurredAt` does not
 * parse, or whose `amount` is not a finite number, is skipped instead of throwing,
 * because one bad row from an upstream API must not blank out a screen. Callers
 * that need to know how many rows were dropped compare `prepareTimeline` length
 * against their own input length.
 */

import { fromCents, toCents } from "./money";
import type { Direction, LedgerTx, TimedTx } from "./types";
import { MONTERREY_UTC_OFFSET_MINUTES } from "./types";

const MS_PER_MINUTE = 60_000;
const MS_PER_DAY = 86_400_000;
const DAY_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** True when `Date.parse` can read the value, which is the only check we trust. */
export function isParsableInstant(value: string): boolean {
  return Number.isFinite(Date.parse(value));
}

/**
 * Sorts the usable rows oldest first and parses each instant exactly once.
 *
 * Out-of-order input is the normal case: Nessie returns sub-collections in
 * insertion order, and a reseed interleaves months. Sorting happens on a copy,
 * so the caller's array is never touched.
 */
export function prepareTimeline(
  txs: readonly LedgerTx[],
  direction?: Direction,
): TimedTx[] {
  const timeline: TimedTx[] = [];
  for (const tx of txs) {
    if (direction !== undefined && tx.direction !== direction) {
      continue;
    }
    const at = Date.parse(tx.occurredAt);
    if (!Number.isFinite(at) || !Number.isFinite(tx.amount)) {
      continue;
    }
    timeline.push({ tx, at, cents: toCents(tx.amount) });
  }
  timeline.sort((left, right) => {
    if (left.at !== right.at) {
      return left.at - right.at;
    }
    // Stable tie-break, so two runs on the same data produce the same series.
    return left.tx.id < right.tx.id ? -1 : left.tx.id > right.tx.id ? 1 : 0;
  });
  return timeline;
}

export interface RollingWindowOptions {
  /** Width of the window in days. Fractions are allowed, zero and below are not. */
  windowDays: number;
  /** Which side of the ledger to sum. Defaults to "debit", that is, spending. */
  direction?: Direction;
}

export interface RollingWindowPoint {
  /** Right edge, inclusive: the instant of the transaction that closed the window. */
  at: string;
  /** Left edge, exclusive. */
  windowStart: string;
  /** Exact total of the window. */
  totalCents: number;
  /** The same total in major units, for display only. */
  total: number;
  /** How many transactions the window holds. */
  count: number;
}

/**
 * One point per transaction, each carrying the total of the `windowDays` that end
 * at that transaction. The window is half-open, (at - windowDays, at], so a
 * transaction exactly one window old has already fallen out.
 *
 * Single pass with two indices after the sort, so the cost is O(n log n) for the
 * sort and O(n) for the sums, not O(n * window).
 *
 * @throws RangeError when `windowDays` is not a positive finite number.
 */
export function rollingWindowSum(
  txs: readonly LedgerTx[],
  options: RollingWindowOptions,
): RollingWindowPoint[] {
  const { windowDays } = options;
  if (!Number.isFinite(windowDays) || windowDays <= 0) {
    throw new RangeError(
      `windowDays must be a positive number: ${String(windowDays)}`,
    );
  }
  const windowMs = Math.round(windowDays * MS_PER_DAY);
  const timeline = prepareTimeline(txs, options.direction ?? "debit");
  const points: RollingWindowPoint[] = [];
  let left = 0;
  let totalCents = 0;

  for (let right = 0; right < timeline.length; right += 1) {
    const current = timeline[right];
    totalCents += current.cents;
    while (left < right) {
      const oldest = timeline[left];
      if (current.at - oldest.at < windowMs) {
        break;
      }
      totalCents -= oldest.cents;
      left += 1;
    }
    points.push({
      at: new Date(current.at).toISOString(),
      windowStart: new Date(current.at - windowMs).toISOString(),
      totalCents,
      total: fromCents(totalCents),
      count: right - left + 1,
    });
  }

  return points;
}

/**
 * The heaviest window in a series, which is the number a velocity or anomaly
 * story is actually about. Ties go to the earliest point, so the answer is stable.
 */
export function maxRollingWindow(
  points: readonly RollingWindowPoint[],
): RollingWindowPoint | undefined {
  let best: RollingWindowPoint | undefined;
  for (const point of points) {
    if (best === undefined || point.totalCents > best.totalCents) {
      best = point;
    }
  }
  return best;
}

export interface DailyBucketOptions {
  /**
   * Offset applied before the calendar day is taken. Defaults to Monterrey, so a
   * purchase at 23:30 local stays on the day the person made it instead of
   * jumping to tomorrow in UTC.
   */
  tzOffsetMinutes?: number;
  /** First day to report, inclusive. "YYYY-MM-DD" or any parsable instant. */
  from?: string;
  /** Last day to report, inclusive. */
  to?: string;
  /** Emit zero rows for days with no transactions. Charts need this, totals do not. */
  fill?: boolean;
}

export interface DailyBucket {
  /** Calendar day in the requested offset, "YYYY-MM-DD". */
  day: string;
  debitCents: number;
  creditCents: number;
  /** credits minus debits, so a saving day is positive. */
  netCents: number;
  debit: number;
  credit: number;
  net: number;
  count: number;
}

/**
 * Groups a ledger into local calendar days, oldest first.
 *
 * @throws RangeError when `from` or `to` cannot be read as a day or an instant.
 */
export function dailyBuckets(
  txs: readonly LedgerTx[],
  options: DailyBucketOptions = {},
): DailyBucket[] {
  const offset = options.tzOffsetMinutes ?? MONTERREY_UTC_OFFSET_MINUTES;
  const from =
    options.from === undefined ? undefined : toDayKey(options.from, offset);
  const to =
    options.to === undefined ? undefined : toDayKey(options.to, offset);
  const totals = new Map<string, DailyBucket>();

  for (const row of prepareTimeline(txs)) {
    const day = dayKeyOf(row.at, offset);
    if ((from !== undefined && day < from) || (to !== undefined && day > to)) {
      continue;
    }
    const bucket = totals.get(day) ?? emptyBucket(day);
    if (row.tx.direction === "credit") {
      bucket.creditCents += row.cents;
    } else {
      bucket.debitCents += row.cents;
    }
    bucket.count += 1;
    totals.set(day, bucket);
  }

  const days = [...totals.keys()].sort();
  const first = from ?? days[0];
  const last = to ?? days[days.length - 1];
  const ordered: DailyBucket[] = [];

  if (options.fill === true && first !== undefined && last !== undefined) {
    for (let day = first; day <= last; day = nextDayKey(day)) {
      ordered.push(totals.get(day) ?? emptyBucket(day));
    }
  } else {
    for (const day of days) {
      ordered.push(totals.get(day) ?? emptyBucket(day));
    }
  }

  return ordered.map(finishBucket);
}

/** The calendar day an instant falls on, after the offset is applied. */
export function dayKeyOf(
  at: number,
  tzOffsetMinutes = MONTERREY_UTC_OFFSET_MINUTES,
): string {
  return new Date(at + tzOffsetMinutes * MS_PER_MINUTE)
    .toISOString()
    .slice(0, 10);
}

/**
 * Reads a bound as a day key. A bare "YYYY-MM-DD" is taken literally, anything
 * else is parsed as an instant and shifted into the requested offset first.
 */
export function toDayKey(
  value: string,
  tzOffsetMinutes = MONTERREY_UTC_OFFSET_MINUTES,
): string {
  if (DAY_KEY_PATTERN.test(value)) {
    return value;
  }
  const at = Date.parse(value);
  if (!Number.isFinite(at)) {
    throw new RangeError(`not a day or an instant: ${value}`);
  }
  return dayKeyOf(at, tzOffsetMinutes);
}

/** The next calendar day. Handles month and year ends through the date maths. */
export function nextDayKey(day: string): string {
  const at = Date.parse(`${day}T00:00:00.000Z`);
  if (!Number.isFinite(at)) {
    throw new RangeError(`not a day: ${day}`);
  }
  return new Date(at + MS_PER_DAY).toISOString().slice(0, 10);
}

function emptyBucket(day: string): DailyBucket {
  return {
    day,
    debitCents: 0,
    creditCents: 0,
    netCents: 0,
    debit: 0,
    credit: 0,
    net: 0,
    count: 0,
  };
}

function finishBucket(bucket: DailyBucket): DailyBucket {
  const netCents = bucket.creditCents - bucket.debitCents;
  return {
    ...bucket,
    netCents,
    debit: fromCents(bucket.debitCents),
    credit: fromCents(bucket.creditCents),
    net: fromCents(netCents),
  };
}
