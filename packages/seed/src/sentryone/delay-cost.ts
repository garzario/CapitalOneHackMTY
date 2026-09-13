/**
 * What one day of delay costs this company with one supplier, in pesos.
 *
 * `decide` in @hackmty/core is written as a trade-off: the pesos at risk on one side,
 * the cost of not paying on the other. Until this file existed the generator priced
 * neither, `supplierModelOf` fell back to `DEFAULT_DELAY_COST_PER_DAY`, and every
 * decision on the demo company carried a delay cost of zero. With zero on that side
 * there is no trade-off: anything with a positive expected loss is stopped, the
 * release branch of rule 3 is only ever reached by the lines that carry no finding at
 * all, and the field the instruction screen calls "Costo de retrasar un dia" reads
 * MXN 0.00 on all 92 payments. That is issue #182.
 *
 * ## The two inputs
 *
 * A delay is not free, and the two things that make it cost money on a Mexican
 * payables desk are both in the contract rather than in anybody's judgement.
 *
 * 1. **Late-payment interest on the outstanding balance.** A supplier that is owed
 *    money past its terms charges moratory interest on it, and the clause is
 *    routinely written at three per cent a month on the overdue balance, which is
 *    `LATE_PAYMENT_ANNUAL_RATE` over a 360-day commercial year. The balance is not
 *    the invoice: it is what this company owes this supplier on an ordinary day,
 *    which is the monthly spend scaled by the payment terms. Thirty-day terms leave
 *    about a month of purchases outstanding, fifteen-day terms about half a month.
 * 2. **A lost early-payment discount.** The pronto pago discount is
 *    `EARLY_PAYMENT_DISCOUNT` of the payment, and it is lost in full the day the
 *    payment is late rather than pro rata: the window closes. The payment at stake is
 *    one payment run, and this company runs payments once a week, so it is a week of
 *    dues rather than a month of them.
 *
 * The second dominates the first, by roughly three to one at thirty-day terms, and
 * that is the real arithmetic of trade credit rather than a calibration: one and a
 * half per cent lost in a day is a month of interest at any rate a supplier would
 * dare write down. It is worth knowing before somebody reads the numbers and assumes
 * the interest term is decorative.
 *
 * ## Why one supplier costs more than another
 *
 * A delay that stops the production line is not the same event as a delay that annoys
 * a consumables vendor, so raw material, tooling and the outside processes a part
 * cannot ship without carry `LINE_STOP_FACTOR`, and the consumables and the services
 * carry 1. The split is not a second list invented here: it is the complement of
 * `CONSUMABLE_SEGMENTS` in ./suppliers.ts, which is the same list the seasonal spike
 * moves, plus the service segments. That is the point of reusing it. The things a
 * plant buys more of during a shutdown are exactly the things whose delay does not
 * stop a line, and two lists that disagreed about which segment is which would make
 * one of the two cases wrong without either of them failing.
 *
 * Strictly this belongs in `SupplierModel.relationshipWeight`, which is what
 * @hackmty/core has the multiplier for. `Supplier` carries no field for it, so
 * `supplierModelOf` holds the weight at 1 and the factor is folded into the peso
 * figure here. When the domain grows the field, the factor moves there and this
 * function returns the unweighted cost.
 *
 * ## Two properties this file keeps
 *
 * **It draws nothing.** The price is arithmetic over the catalogue row, not an RNG
 * draw, for the same reason the catalogue is literals: a number drawn here would take
 * a value out of the stream and move every invoice, every amount and every
 * instruction id after it, and `docs/10-demo-script.md` names instruction ids out
 * loud. Deterministic from the seed is the requirement and this is the stronger
 * version of it, because it is deterministic full stop.
 *
 * **It is priced from the relationship, never from the window.** `invoicesPerMonth`,
 * `ticket` and `termsDays` are properties of how this company buys from this
 * supplier, so the price is the same whichever eight months the generator draws. A
 * cost read off the invoices that happen to be in the window would move with the
 * seed, and a supplier whose delay cost changed because the window shifted by a week
 * is not a cost model, it is a measurement.
 */

import type { SentryOneSupplierSpec, SupplierSegment } from "./suppliers";
import { CONSUMABLE_SEGMENTS, medianTicket } from "./suppliers";
import { AVERAGE_DAYS_PER_MONTH, DAYS_PER_WEEK, round2 } from "./timeline";

/**
 * Moratory interest a supplier charges on an overdue balance, annual. Three per cent
 * a month is the clause a Mexican supplier contract routinely carries.
 */
export const LATE_PAYMENT_ANNUAL_RATE = 0.36;

/** A commercial year, which is what interest clauses are written against. */
export const INTEREST_YEAR_DAYS = 360;

/**
 * The pronto pago discount that expires the day the payment is late. One and a half
 * per cent is the middle of the band a metalworking shop is actually offered.
 */
export const EARLY_PAYMENT_DISCOUNT = 0.015;

/**
 * How much more a day of delay costs when it stops production. Above 1 because the
 * same delay is not the same event: a coating line that is not fed cannot ship the
 * part, and a fastener vendor that is paid on Monday instead of Friday sends the next
 * box anyway.
 */
export const LINE_STOP_FACTOR = 1.5;

/**
 * What the plant buys as a service rather than as a thing that goes into the product.
 * Calibration, metrology and control engineering are scheduled work: a delay moves
 * the appointment, it does not stop the line.
 */
export const SERVICE_SEGMENTS: readonly SupplierSegment[] = ["servicios"];

/**
 * True when a delay with this supplier stops production: raw material, tooling, and
 * the parts and outside processes a shipment waits on.
 *
 * Defined as the complement of the consumables and the services rather than as a
 * third list, so a segment added to ./suppliers.ts is priced by whichever of the two
 * lists claims it and never falls through both.
 */
export function stopsProduction(segment: SupplierSegment): boolean {
  return (
    !CONSUMABLE_SEGMENTS.includes(segment) &&
    !SERVICE_SEGMENTS.includes(segment)
  );
}

/**
 * The pesos one day of delay costs with this supplier, to the cent.
 *
 * Never negative, and never zero: every row of the catalogue buys something often
 * enough that a day of it is worth a number, which is the whole reason the field
 * exists. The scale is the one the hand-written fixture in `apps/api/src/synthetic.ts`
 * already uses, hundreds to low thousands of pesos a day, and it comes out of the
 * cadence rather than out of a target: the smallest consumables vendor lands near a
 * hundred and the supplier this company buys most from lands in the low thousands.
 */
export function delayCostPerDayOf(spec: SentryOneSupplierSpec): number {
  const monthlySpend = spec.invoicesPerMonth * medianTicket(spec);
  // Little's law on the payables ledger: what is outstanding on an ordinary day is
  // the rate we buy at times the days we take to pay.
  const outstanding = (monthlySpend * spec.termsDays) / AVERAGE_DAYS_PER_MONTH;
  const interestPerDay =
    (outstanding * LATE_PAYMENT_ANNUAL_RATE) / INTEREST_YEAR_DAYS;
  // The payment that is actually being delayed: one weekly run of dues, because
  // `CompanyProfile.paymentRunWeekday` says this company pays once a week.
  const dueThisRun = (monthlySpend * DAYS_PER_WEEK) / AVERAGE_DAYS_PER_MONTH;
  const discountLost = dueThisRun * EARLY_PAYMENT_DISCOUNT;
  const factor = stopsProduction(spec.segment) ? LINE_STOP_FACTOR : 1;
  return round2((interestPerDay + discountLost) * factor);
}
