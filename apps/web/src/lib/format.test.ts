/**
 * Formatting tests. They deliberately avoid asserting exact currency strings,
 * because the separators Intl produces depend on the ICU build and a test that
 * pins them breaks on someone else's laptop for no reason. What matters is that
 * the digits are right and the grouping happens at all.
 */

import { describe, expect, test } from "bun:test";
import {
  diffPositions,
  formatClabe,
  formatDate,
  formatMoney,
  formatPercent,
  shortUuid,
  splitClabe,
} from "./format";

describe("formatDate", () => {
  test("renders a date-only string as the calendar day it says", () => {
    /* The bug this pins: new Date("2026-09-07") is UTC midnight, which is the
       sixth in Monterrey, so every CFDI would show one day early. */
    expect(formatDate("2026-09-07")).toContain("07");
    expect(formatDate("2026-01-01")).toContain("01");
  });

  test("says so instead of throwing when the string is not a date", () => {
    expect(formatDate("no es fecha")).toBe("fecha invalida");
  });
});

describe("formatMoney", () => {
  test("keeps two decimals and groups the thousands", () => {
    const text = formatMoney(184300);

    expect(text).toContain("184");
    expect(text).toContain("300.00");
  });

  test("renders a cent without rounding it away", () => {
    expect(formatMoney(0.01)).toContain("0.01");
  });
});

describe("formatPercent", () => {
  test("turns a ratio into a percentage with one decimal", () => {
    expect(formatPercent(0.8723)).toBe("87.2 %");
    expect(formatPercent(1)).toBe("100.0 %");
    expect(formatPercent(0)).toBe("0.0 %");
  });

  test("says so when there is nothing to divide", () => {
    expect(formatPercent(Number.NaN)).toBe("n/d");
  });
});

describe("splitClabe", () => {
  test("splits the eighteen digits into bank, plaza, account and control", () => {
    expect(splitClabe("012180001234567899")).toEqual({
      bank: "012",
      plaza: "180",
      account: "00123456789",
      control: "9",
    });
  });

  test("ignores the spaces a person typed", () => {
    expect(splitClabe("012 180 00123456789 9").bank).toBe("012");
  });

  test("formats back into readable blocks", () => {
    expect(formatClabe("012180001234567899")).toBe("012 180 00123456789 9");
  });
});

describe("diffPositions", () => {
  test("lists the positions at which two accounts differ", () => {
    expect(diffPositions("012180001234567899", "012180101234567799")).toEqual([
      6, 15,
    ]);
  });

  test("returns nothing for identical strings", () => {
    expect(diffPositions("0121800012", "0121800012")).toEqual([]);
  });

  test("counts the tail when one string is shorter", () => {
    expect(diffPositions("01218", "012")).toEqual([3, 4]);
  });
});

describe("shortUuid", () => {
  test("keeps the head a person can match by eye", () => {
    expect(shortUuid("a1b2c3d4-0001-4000-8000-000000000001")).toBe(
      "a1b2c3d4...",
    );
  });

  test("leaves a short string alone", () => {
    expect(shortUuid("a1b2")).toBe("a1b2");
  });
});
