/**
 * The two sentences the behaviour chart writes, and the reason they are tested
 * rather than eyeballed.
 *
 * The tick, because the bucket boundary is a UTC Monday midnight and the rest of
 * this app formats dates in Monterrey: a tick rendered in local time prints the
 * Sunday, and a judge comparing a bar against a row of `supplier_weekly_outflow`
 * finds the chart off by a day with no error anywhere.
 *
 * The week sentence, because it is the accessible copy of the chart. An SVG of
 * rectangles reads as nothing, so this string is the whole chart for anybody on a
 * screen reader, and a week with no invoice has to say so rather than come out as
 * "0 facturas, $0.00".
 */

import { describe, expect, test } from "bun:test";
import type { SupplierWeekPoint } from "../lib/supplier-profile";
import { weekSentence, weekTick } from "./BehaviourChart";

function point(over: Partial<SupplierWeekPoint> = {}): SupplierWeekPoint {
  return {
    week: "2026-09-07T00:00:00.000Z",
    invoices: 0,
    outflow: 0,
    maxInvoice: 0,
    recent: false,
    ...over,
  };
}

describe("weekTick", () => {
  test("names the Monday that opens the bucket, in UTC", () => {
    expect(weekTick("2026-09-07T00:00:00.000Z")).toBe("7 sep");
  });

  /*
   * The bucket opens at UTC midnight and Monterrey is UTC-6 all year. A tick
   * formatted locally would read "6 sep" on a bucket the database calls the
   * seventh.
   */
  test("does not slide to the previous day in Monterrey", () => {
    expect(weekTick("2026-01-05T00:00:00.000Z")).toBe("5 ene");
    expect(weekTick("2026-12-28T00:00:00.000Z")).toBe("28 dic");
  });

  test("gives back what it was handed when that is not a date", () => {
    expect(weekTick("la semana pasada")).toBe("la semana pasada");
  });
});

describe("weekSentence", () => {
  test("says a silent week is silent", () => {
    expect(weekSentence(point())).toBe("sin facturas");
  });

  test("drops the largest invoice when there is only one", () => {
    /* "1 factura, $1,160.00, la mayor de $1,160.00" says the same number twice. */
    expect(
      weekSentence(point({ invoices: 1, outflow: 1160, maxInvoice: 1160 })),
    ).toBe("1 factura, $1,160.00");
  });

  test("carries the three columns of the aggregate when there are several", () => {
    const sentence = weekSentence(
      point({ invoices: 4, outflow: 52_000.5, maxInvoice: 40_000 }),
    );

    expect(sentence).toContain("4 facturas");
    expect(sentence).toContain("$52,000.50");
    expect(sentence).toContain("la mayor de $40,000.00");
  });
});
