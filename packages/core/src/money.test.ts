import { describe, expect, it } from "bun:test";
import {
  addAmounts,
  CENTS_PER_UNIT,
  compareAmounts,
  equalsAmount,
  formatAmount,
  fromCents,
  subtractAmounts,
  sumAmounts,
  sumCents,
  toCents,
} from "./money";

describe("toCents", () => {
  it("converts integers and floats the same way", () => {
    // Nessie mixes 46, 320 and 450.0 in the same field, verified in docs/09-api.md.
    expect(toCents(46)).toBe(4600);
    expect(toCents(320)).toBe(32000);
    expect(toCents(450.0)).toBe(45000);
  });

  it("rounds half away from zero, symmetrically", () => {
    // 1.005 * 100 is 100.49999999999999 in binary floating point, so a naive
    // Math.round would answer 100 and lose a cent on every such row.
    expect(toCents(1.005)).toBe(101);
    expect(toCents(-1.005)).toBe(-101);
    expect(toCents(0.145)).toBe(15);
  });

  it("normalises negative zero", () => {
    expect(Object.is(toCents(-0), 0)).toBe(true);
  });

  it("rejects values that are not finite numbers", () => {
    expect(() => toCents(Number.NaN)).toThrow(RangeError);
    expect(() => toCents(Number.POSITIVE_INFINITY)).toThrow(RangeError);
  });

  it("rejects amounts too large to hold in cents", () => {
    expect(() => toCents(1e20)).toThrow(RangeError);
  });
});

describe("fromCents", () => {
  it("is the inverse of toCents", () => {
    for (const amount of [0, 1, 46, 0.1, 1234.56, -980.05]) {
      expect(fromCents(toCents(amount))).toBe(amount);
    }
  });

  it("rejects a fractional cent, because it means the total is already wrong", () => {
    expect(() => fromCents(150.5)).toThrow(RangeError);
    expect(() => fromCents(Number.NaN)).toThrow(RangeError);
  });
});

describe("sumCents", () => {
  it("is 0 on empty input, never NaN", () => {
    expect(sumCents([])).toBe(0);
    expect(sumAmounts([])).toBe(0);
  });

  it("adds float amounts without drift", () => {
    // The whole reason this module exists: 0.1 + 0.2 is 0.30000000000000004.
    expect(0.1 + 0.2 === 0.3).toBe(false);
    expect(sumCents([0.1, 0.2])).toBe(30);
    expect(sumAmounts([0.1, 0.2])).toBe(0.3);
  });

  it("survives a month of small cash spend with no drift", () => {
    const month = Array.from({ length: 300 }, () => 0.1);
    expect(sumCents(month)).toBe(3000);
    expect(sumAmounts(month)).toBe(30);
  });

  it("accepts any iterable, not just arrays", () => {
    const values = new Set([1.1, 2.2]);
    expect(sumCents(values)).toBe(330);
  });
});

describe("arithmetic and comparison", () => {
  it("adds and subtracts exactly", () => {
    expect(addAmounts(0.1, 0.2)).toBe(0.3);
    expect(subtractAmounts(1000, 999.99)).toBe(0.01);
  });

  it("compares by cents, so float noise cannot change the answer", () => {
    expect(equalsAmount(0.1 + 0.2, 0.3)).toBe(true);
    expect(compareAmounts(10, 9.99)).toBe(1);
    expect(compareAmounts(9.99, 10)).toBe(-1);
    expect(compareAmounts(-0, 0)).toBe(0);
  });
});

describe("formatAmount", () => {
  it("groups thousands and always shows two decimals", () => {
    expect(formatAmount(0)).toBe("0.00");
    expect(formatAmount(1234.5)).toBe("1,234.50");
    expect(formatAmount(1234567.891)).toBe("1,234,567.89");
  });

  it("keeps the sign in front of the digits", () => {
    expect(formatAmount(-1234.567)).toBe("-1,234.57");
    expect(formatAmount(-0.5)).toBe("-0.50");
  });

  it("is plain ASCII, so CLI columns and assertions stay stable", () => {
    expect(/^[-0-9,.]+$/.test(formatAmount(-98765.43))).toBe(true);
  });
});

describe("CENTS_PER_UNIT", () => {
  it("is 100, because MXN has two minor digits", () => {
    expect(CENTS_PER_UNIT).toBe(100);
  });
});
