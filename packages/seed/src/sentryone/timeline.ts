/**
 * The calendar and money arithmetic every part of the SentryOne generator shares.
 *
 * It is a separate file so the injectors in ./hard-negatives.ts and the demo
 * scenarios in ./scenarios.ts can build objects that land on the same business days
 * as the ones ./generator.ts drew, without importing the generator and creating a
 * cycle.
 *
 * Everything works on "YYYY-MM-DD" days in UTC and only becomes an instant at the
 * very end, for the reason ../dates.ts exists: a generator that reads the machine's
 * time zone produces different data on a laptop in Monterrey and on a runner in the
 * cloud, which breaks the one promise this package makes.
 */

import { addDays, dayOfWeek, formatDay, parseDay } from "../dates";
import { DEMO_COMPANY } from "./company";

const CENTS = 100;
const MS_PER_MINUTE = 60_000;
const MS_PER_DAY = 86_400_000;

/** Monterrey is UTC minus 6 all year, so there is no daylight-saving seam. */
export const MONTERREY_OFFSET_MINUTES = -360;

export const WORK_DAY_START_MINUTE = 8 * 60;
/**
 * 17:59 local and not 18:00. Monterrey is UTC minus 6, so 18:00 local is exactly
 * midnight UTC and an instant stamped there belongs to the NEXT day once it is read
 * back with `formatDay`. The terms arithmetic reads the day back, so one minute of
 * slack here is the difference between an invoice being due on Friday and being due
 * on Saturday, for one draw in six hundred, which is precisely the kind of bug that
 * only shows up in the run size on the morning of the demo.
 */
export const WORK_DAY_END_MINUTE = 18 * 60 - 1;

/** The run is prepared first thing, before the bank's cut-off. */
export const RUN_MINUTE = 9 * 60;

/** When a SPEI actually leaves, after the run has been reviewed. */
export const SPEI_MINUTE = 11 * 60;

export const AVERAGE_DAYS_PER_MONTH = 30.436875;
export const DAYS_PER_WEEK = 7;

export function round2(value: number): number {
  return Math.round(value * CENTS) / CENTS;
}

/** Exact integer cents, the only safe way to compare two money figures. */
export function cents(value: number): number {
  return Math.round(value * CENTS);
}

export function fromCents(value: number): number {
  return value / CENTS;
}

/** A local day plus a minute offset, as an ISO instant. */
export function instantAt(day: string, minuteOfDay: number): string {
  const at =
    parseDay(day) + (minuteOfDay - MONTERREY_OFFSET_MINUTES) * MS_PER_MINUTE;
  return new Date(at).toISOString();
}

/**
 * The day an instant belongs to. Every instant this generator mints falls between
 * 08:00 and 18:00 local, which is 14:00Z to 24:00Z, so the UTC day and the local day
 * are the same one and reading it back with `formatDay` is exact.
 */
export function dayOf(instant: string): string {
  return formatDay(Date.parse(instant));
}

export function isWeekendDay(day: string): boolean {
  const weekday = dayOfWeek(day);
  return weekday === 0 || weekday === 6;
}

/** Nearest working day at or after `day`. Invoices are not issued on a Sunday. */
export function nextBusinessDay(day: string): string {
  let cursor = day;
  while (isWeekendDay(cursor)) {
    cursor = addDays(cursor, 1);
  }
  return cursor;
}

/** `count` working days after `day`, weekends skipped rather than counted. */
export function addBusinessDays(day: string, count: number): string {
  let cursor = day;
  for (let step = 0; step < count; step += 1) {
    cursor = nextBusinessDay(addDays(cursor, 1));
  }
  return cursor;
}

/** The Monday of the week `day` falls in. */
export function mondayOf(day: string): string {
  const weekday = dayOfWeek(day);
  const back = weekday === 0 ? 6 : weekday - 1;
  return addDays(day, -back);
}

/** The day the payment run is prepared, from the company's weekday. */
export function runDayOf(weekOf: string): string {
  return addDays(weekOf, DEMO_COMPANY.paymentRunWeekday - 1);
}

/**
 * What a Thursday run actually pays: everything that came due from the Friday before
 * up to and including the run day. A run that only covered Monday to Thursday would
 * leave Friday's dues for eleven days, which no supplier would accept, and it would
 * also make the run four sevenths of the size the demo screen was designed for.
 *
 * This is the window the run size falls out of, so it is exported: the test asserts
 * the band against the same arithmetic rather than against a magic number.
 */
export function runWindow(weekOf: string): { from: string; to: string } {
  const runDay = runDayOf(weekOf);
  return { from: addDays(runDay, -(DAYS_PER_WEEK - 1)), to: runDay };
}

/** Whole days between two "YYYY-MM-DD" days, `to` minus `from`. */
export function dayCount(from: string, to: string): number {
  return Math.round((parseDay(to) - parseDay(from)) / MS_PER_DAY);
}

/** Every working day in `[from, to]`, oldest first. Empty when the range is inverted. */
export function businessDaysBetween(from: string, to: string): string[] {
  const days: string[] = [];
  let cursor = from;
  while (cursor <= to) {
    if (!isWeekendDay(cursor)) {
      days.push(cursor);
    }
    cursor = addDays(cursor, 1);
  }
  return days;
}
