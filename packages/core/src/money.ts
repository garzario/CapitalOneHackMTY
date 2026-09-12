/**
 * Money, in cents, always.
 *
 * Floating point cannot represent 0.1, so 0.1 + 0.2 !== 0.3 and a month of
 * transactions drifts by enough to be visible in a chart. Every sum and every
 * comparison in this repo goes through an integer number of cents. There is no
 * `===` on two floats anywhere in this package, and there should not be one in
 * any caller either.
 */

/** Minor units in one major unit. MXN, like USD, has 100. */
export const CENTS_PER_UNIT = 100;

/**
 * Converts major units to an integer number of cents, rounding half away from
 * zero so that 1.005 and -1.005 land symmetrically on 101 and -101.
 *
 * The `toFixed(6)` step is load-bearing: `1.005 * 100` is 100.49999999999999 in
 * binary floating point, and rounding that directly would return 100.
 *
 * @throws RangeError when the input is not a finite number, or is too large to
 *   hold in cents without losing integer precision.
 */
export function toCents(amount: number): number {
  if (!Number.isFinite(amount)) {
    throw new RangeError(`amount is not a finite number: ${String(amount)}`);
  }
  const scaled = Number((amount * CENTS_PER_UNIT).toFixed(6));
  const magnitude = Math.round(Math.abs(scaled));
  if (!Number.isSafeInteger(magnitude)) {
    throw new RangeError(
      `amount is too large to hold in cents: ${String(amount)}`,
    );
  }
  const cents = scaled < 0 ? -magnitude : magnitude;
  // Normalise -0, which is not === 0 under Object.is and leaks into snapshots.
  return cents === 0 ? 0 : cents;
}

/**
 * Converts an integer number of cents back to major units.
 *
 * @throws RangeError when the input is not an integer, because a fractional cent
 *   means somebody did float arithmetic upstream and the total is already wrong.
 */
export function fromCents(cents: number): number {
  if (!Number.isInteger(cents)) {
    throw new RangeError(`cents must be an integer: ${String(cents)}`);
  }
  return cents / CENTS_PER_UNIT;
}

/** Sums major-unit amounts and returns cents. Empty input is 0, never NaN. */
export function sumCents(amounts: Iterable<number>): number {
  let total = 0;
  for (const amount of amounts) {
    total += toCents(amount);
  }
  return total;
}

/** Sums major-unit amounts and returns major units, rounded to the cent. */
export function sumAmounts(amounts: Iterable<number>): number {
  return fromCents(sumCents(amounts));
}

/** Adds major-unit amounts exactly. Use this instead of `a + b` on money. */
export function addAmounts(left: number, right: number): number {
  return fromCents(toCents(left) + toCents(right));
}

/** Subtracts major-unit amounts exactly. */
export function subtractAmounts(left: number, right: number): number {
  return fromCents(toCents(left) - toCents(right));
}

/** -1, 0 or 1. The only sanctioned way to order two money values. */
export function compareAmounts(left: number, right: number): -1 | 0 | 1 {
  const difference = toCents(left) - toCents(right);
  if (difference < 0) {
    return -1;
  }
  return difference > 0 ? 1 : 0;
}

/** True when two money values are the same to the cent. Never use `===`. */
export function equalsAmount(left: number, right: number): boolean {
  return compareAmounts(left, right) === 0;
}

/**
 * Plain-ASCII money for terminals, tables and test assertions: "-1,234.56".
 *
 * Deliberately not Intl.NumberFormat. ICU output differs between runtimes and
 * inserts a non-breaking space, which makes assertions flaky and CLI columns
 * ragged. UI formatting belongs in the web app, where a locale is known.
 */
export function formatAmount(amount: number): string {
  const cents = toCents(amount);
  const sign = cents < 0 ? "-" : "";
  const absolute = Math.abs(cents);
  const major = Math.floor(absolute / CENTS_PER_UNIT);
  const minor = absolute % CENTS_PER_UNIT;
  const grouped = String(major).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${sign}${grouped}.${String(minor).padStart(2, "0")}`;
}
