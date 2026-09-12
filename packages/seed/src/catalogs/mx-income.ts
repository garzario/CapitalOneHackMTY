/**
 * Income cadence, Mexican style.
 *
 * Payroll here lands on the quincena: the 15th and the last day of the month. That
 * single fact changes the shape of a month completely, and it is the reason a
 * generator built on a US biweekly cadence produces data that no Mexican user
 * recognises. Spending spikes the day after each payday and thins out before it,
 * and any engine that forecasts or detects anomalies has to live with that rhythm.
 *
 * When a payday falls on a Saturday or a Sunday, payroll lands on the preceding
 * working day, which is why `quincenaPaydays` shifts by default.
 *
 * The net-pay figures are plausible synthetic parameters for a young professional
 * in Monterrey, not survey data and not salary advice.
 * TODO(FabriBanda): replace with a cited source if any of them reaches docs/04.
 */

import {
  addDays,
  lastDayOfMonth,
  monthsInWindow,
  precedingBusinessDay,
} from "../dates";

export interface IncomeProfile {
  id: string;
  /** What shows up on the statement. */
  label: string;
  /** Net pay per month in MXN, split across the two quincenas. */
  monthlyNet: number;
}

export const MX_INCOME_PROFILES: readonly IncomeProfile[] = [
  { id: "becario", label: "Nomina quincena", monthlyNet: 9000 },
  { id: "junior", label: "Nomina quincena", monthlyNet: 18000 },
  { id: "semi-senior", label: "Nomina quincena", monthlyNet: 26000 },
  { id: "senior", label: "Nomina quincena", monthlyNet: 38000 },
];

/** The first payday of every month. The second is the last day of that month. */
export const QUINCENA_DAY = 15;

/** Income that is not payroll, and should not be mistaken for it by a classifier. */
export const EXTRA_INCOME_DESCRIPTIONS: readonly string[] = [
  "Transferencia recibida",
  "Deposito en efectivo",
  "Reembolso de viaticos",
];

export interface QuincenaOptions {
  /** Move a weekend payday back to the preceding working day. Defaults to true. */
  shiftWeekends?: boolean;
}

/** The two paydays of one month, in order. Month is 1 to 12. */
export function quincenaPaydays(
  year: number,
  month: number,
  options: QuincenaOptions = {},
): string[] {
  const shift = options.shiftWeekends !== false;
  const monthKey = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}`;
  const mid = `${monthKey}-${String(QUINCENA_DAY).padStart(2, "0")}`;
  const end = `${monthKey}-${String(lastDayOfMonth(year, month)).padStart(2, "0")}`;
  const paydays = shift
    ? [precedingBusinessDay(mid), precedingBusinessDay(end)]
    : [mid, end];
  // The shift can only move a payday earlier, so the order is already correct.
  return paydays;
}

/** Every payday inside the window, inclusive, oldest first. */
export function paydaysInWindow(
  from: string,
  to: string,
  options: QuincenaOptions = {},
): string[] {
  const paydays: string[] = [];
  for (const { year, month } of monthsInWindow(from, to)) {
    for (const payday of quincenaPaydays(year, month, options)) {
      if (payday >= from && payday <= to) {
        paydays.push(payday);
      }
    }
  }
  return paydays;
}

/** True when the day is a payday in its own month. */
export function isPayday(day: string, options: QuincenaOptions = {}): boolean {
  const year = Number(day.slice(0, 4));
  const month = Number(day.slice(5, 7));
  return quincenaPaydays(year, month, options).includes(day);
}

/**
 * The day after a payday is the heaviest spending day of the fortnight, so the
 * generator leans purchases towards it.
 */
export function dayAfterPayday(day: string): string {
  return addDays(day, 1);
}
