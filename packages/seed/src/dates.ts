/**
 * Calendar maths on "YYYY-MM-DD" strings, all in UTC.
 *
 * Deliberately not using the local time zone anywhere: a generator that reads the
 * machine's zone produces different data on a laptop in Monterrey and a runner in
 * the cloud, which breaks the one promise this package makes.
 */

const MS_PER_DAY = 86_400_000;
const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function isDay(value: string): boolean {
  return (
    DAY_PATTERN.test(value) &&
    Number.isFinite(Date.parse(`${value}T00:00:00.000Z`))
  );
}

/** Milliseconds at UTC midnight of that day. */
export function parseDay(day: string): number {
  if (!isDay(day)) {
    throw new RangeError(`not a YYYY-MM-DD day: ${day}`);
  }
  return Date.parse(`${day}T00:00:00.000Z`);
}

export function formatDay(at: number): string {
  return new Date(at).toISOString().slice(0, 10);
}

export function addDays(day: string, delta: number): string {
  return formatDay(parseDay(day) + delta * MS_PER_DAY);
}

/** Whole days from `from` to `to`. Negative when `to` is earlier. */
export function daysBetween(from: string, to: string): number {
  return Math.round((parseDay(to) - parseDay(from)) / MS_PER_DAY);
}

/** 0 is Sunday, 6 is Saturday, matching Date.getUTCDay. */
export function dayOfWeek(day: string): number {
  return new Date(parseDay(day)).getUTCDay();
}

export function isWeekend(day: string): boolean {
  const weekday = dayOfWeek(day);
  return weekday === 0 || weekday === 6;
}

/** Month is 1 to 12, the way a human writes it. */
export function lastDayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function startOfMonth(day: string): string {
  return `${day.slice(0, 7)}-01`;
}

export interface YearMonth {
  year: number;
  month: number;
}

export function yearMonthOf(day: string): YearMonth {
  const at = new Date(parseDay(day));
  return { year: at.getUTCFullYear(), month: at.getUTCMonth() + 1 };
}

/** Shifts by whole months and clamps the day, so 31 January minus a month is 31 December. */
export function addMonths(day: string, delta: number): string {
  const { year, month } = yearMonthOf(day);
  const dayOfMonth = Number(day.slice(8, 10));
  const absolute = year * 12 + (month - 1) + delta;
  const targetYear = Math.floor(absolute / 12);
  const targetMonth = (absolute % 12) + 1;
  const clamped = Math.min(dayOfMonth, lastDayOfMonth(targetYear, targetMonth));
  return `${String(targetYear).padStart(4, "0")}-${String(targetMonth).padStart(2, "0")}-${String(clamped).padStart(2, "0")}`;
}

/** Every calendar month the window touches, oldest first. */
export function monthsInWindow(from: string, to: string): YearMonth[] {
  const months: YearMonth[] = [];
  let cursor = startOfMonth(from);
  const limit = startOfMonth(to);
  while (cursor <= limit) {
    months.push(yearMonthOf(cursor));
    cursor = addMonths(cursor, 1);
  }
  return months;
}

export function minDay(left: string, right: string): string {
  return left <= right ? left : right;
}

export function maxDay(left: string, right: string): string {
  return left >= right ? left : right;
}

export function clampDay(day: string, min: string, max: string): string {
  return minDay(maxDay(day, min), max);
}

/** Nearest earlier working day, which is how payroll lands when a payday is a weekend. */
export function precedingBusinessDay(day: string): string {
  let cursor = day;
  while (isWeekend(cursor)) {
    cursor = addDays(cursor, -1);
  }
  return cursor;
}
