import { describe, expect, it } from "bun:test";
import {
  costMxnOf,
  formatMxn,
  formatMxnPrecise,
  MXN_PER_USD,
  USD_PER_MILLION_INPUT_TOKENS,
  USD_PER_MILLION_OUTPUT_TOKENS,
} from "./cost";

describe("costMxnOf", () => {
  it("prices one million input tokens at the stamped rate", () => {
    /* The worked example the rate constants exist for: a million input tokens is
       USD 0.75, and at the FIX of 2026-09-11 that is MXN 12.728025. If this
       assertion ever has to change, the pricing page and the FIX in cost.ts changed
       with it and the date on both has to move in the same commit. */
    const cost = costMxnOf({
      promptTokens: 1_000_000,
      outputTokens: 0,
      totalTokens: 1_000_000,
    });
    expect(cost).toBeCloseTo(USD_PER_MILLION_INPUT_TOKENS * MXN_PER_USD, 6);
    expect(cost).toBeCloseTo(12.728025, 6);
  });

  it("prices output five times higher than input, which is why tool reads cost", () => {
    const input = costMxnOf({
      promptTokens: 1000,
      outputTokens: 0,
      totalTokens: 1000,
    });
    const output = costMxnOf({
      promptTokens: 0,
      outputTokens: 1000,
      totalTokens: 1000,
    });
    expect(output / input).toBeCloseTo(
      USD_PER_MILLION_OUTPUT_TOKENS / USD_PER_MILLION_INPUT_TOKENS,
      6,
    );
  });

  it("adds the two sides rather than reading the provider's total", () => {
    /* `totalTokens` is what the provider billed in total and it is recorded, but it
       is deliberately not what the cost is computed from: input and output are
       priced differently, so a sum would be the wrong arithmetic even when the
       number is right. */
    const cost = costMxnOf({
      promptTokens: 2000,
      outputTokens: 400,
      totalTokens: 99_999,
    });
    const expected =
      ((2000 / 1_000_000) * USD_PER_MILLION_INPUT_TOKENS +
        (400 / 1_000_000) * USD_PER_MILLION_OUTPUT_TOKENS) *
      MXN_PER_USD;
    expect(cost).toBeCloseTo(expected, 6);
  });

  it("does not round a short turn to zero centavos", () => {
    /* Rounding each turn to the centavo would make a month of conversations sum to
       nothing, which is the one arithmetic error that would make the cost claim in
       docs/06 look invented. A hundred prompt tokens is under a centavo and has to
       stay a number. */
    const cost = costMxnOf({
      promptTokens: 100,
      outputTokens: 20,
      totalTokens: 120,
    });
    expect(cost).toBeGreaterThan(0);
    expect(cost).toBeLessThan(0.01);
  });

  it("is zero for a turn that never reached the provider", () => {
    expect(
      costMxnOf({ promptTokens: 0, outputTokens: 0, totalTokens: 0 }),
    ).toBe(0);
  });
});

describe("formatting", () => {
  it("writes a total to the centavo", () => {
    expect(formatMxn(12.728025)).toBe("MXN 12.73");
    expect(formatMxn(0)).toBe("MXN 0.00");
  });

  it("writes a single turn with enough decimals to be visible", () => {
    expect(formatMxnPrecise(0.000123)).toBe("MXN 0.000123");
  });
});
