import { describe, expect, test } from "bun:test";
import { amountInWords } from "./numbers";

/** Any digit at all. Nothing this file writes is ever read off a screen. */
const ANY_DIGIT = /\d/;

/** The largest amount `numbers.ts` will speak, repeated here as the test's own. */
const MAX = 999_999_999;

/**
 * The table is the specification.
 *
 * Every row is a rule of Mexican Spanish this call has to get right in somebody's
 * ear, and the first one is the figure that was said wrong on a real call.
 */
const CASES: readonly [number, string][] = [
  /* The live call of 2026-09-13: the owner line was handed "$537,960.97 pesos"
     and the model said "cincuenta y tres mil setecientos noventa y seis pesos
     con noventa y siete centavos", a digit gone and the figure off by an order
     of magnitude. This is the row the file exists for. */
  [
    537_960.97,
    "quinientos treinta y siete mil novecientos sesenta pesos con noventa y siete centavos",
  ],
  /* Apocope: before a masculine noun the one is "un" and never "uno", and the
     noun is singular only at exactly one. */
  [1, "un peso"],
  [21, "veintiún pesos"],
  [31, "treinta y un pesos"],
  [101, "ciento un pesos"],
  /* A bare hundred is "cien"; a hundred with anything after it is "ciento". */
  [100, "cien pesos"],
  [100_000, "cien mil pesos"],
  [101_000, "ciento un mil pesos"],
  /* "Mil" carries no one in front of it, which is also how a person says it. */
  [1_000, "mil pesos"],
  [21_000, "veintiún mil pesos"],
  /* "De" after a round million, and no "de" once the million is not the last
     word before the amount. */
  [1_000_000, "un millón de pesos"],
  [2_500_000.5, "dos millones quinientos mil pesos con cincuenta centavos"],
  [1_000_500, "un millón quinientos pesos"],
  [1_000_000.5, "un millón de pesos con cincuenta centavos"],
  [21_000_000, "veintiún millones de pesos"],
  /* Under a peso there is no peso clause at all, because "cero pesos con un
     centavo" is nobody's sentence. The one-cent probe of `packages/rail` is the
     smallest thing this product moves. */
  [0.01, "un centavo"],
  [0.21, "veintiún centavos"],
  [0.5, "cincuenta centavos"],
  [0, "cero pesos"],
  /* The two figures the fixtures of this package are built on. */
  [184_300, "ciento ochenta y cuatro mil trescientos pesos"],
  [
    92_480.5,
    "noventa y dos mil cuatrocientos ochenta pesos con cincuenta centavos",
  ],
  /* The teens and the twenties, which Spanish writes as single accented words. */
  [16, "dieciséis pesos"],
  [22, "veintidós pesos"],
  [500, "quinientos pesos"],
  /* The ceiling, said in full. */
  [
    999_999_999.99,
    "novecientos noventa y nueve millones novecientos noventa y nueve mil novecientos noventa y nueve pesos con noventa y nueve centavos",
  ],
];

describe("amountInWords", () => {
  test.each(CASES)("says %s out loud", (amount, words) => {
    expect(amountInWords(amount)).toBe(words);
  });

  /**
   * The bug in one assertion. A comma every three digits is a convention the
   * text to speech model does not have to honour, so no amount this package
   * speaks may carry a digit at all.
   */
  test("leaves no digit for a model to regroup", () => {
    for (const [amount] of CASES) {
      expect(amountInWords(amount)).not.toMatch(ANY_DIGIT);
    }
  });

  /** A round figure gets no centavos clause, because nobody says one. */
  test("says no centavos when there are none", () => {
    expect(amountInWords(184_300)).not.toContain("centavo");
    expect(amountInWords(184_300)).not.toContain(" con ");
  });

  /**
   * The centavos come off a rounding done once. The ledger holds exact centavos
   * and rounding twice is the only way a figure moves between the screen and the
   * ear.
   */
  test("rounds the centavos once, at the centavo", () => {
    expect(amountInWords(0.014)).toBe("un centavo");
    expect(amountInWords(0.999)).toBe("un peso");
    expect(amountInWords(1.006)).toBe("un peso con un centavo");
  });

  /**
   * Three things it refuses to say rather than say wrong. A negative amount is
   * not a payment, an infinity is a bug upstream, and an amount past the ceiling
   * would need "mil millones", a word Mexican Spanish and the rest of the
   * Spanish-speaking world do not agree on. The failure belongs in a test and
   * not in the owner's ear.
   */
  test("refuses what it cannot say exactly", () => {
    expect(() => amountInWords(-1)).toThrow(RangeError);
    expect(() => amountInWords(Number.NaN)).toThrow(RangeError);
    expect(() => amountInWords(Number.POSITIVE_INFINITY)).toThrow(RangeError);
    expect(() => amountInWords(1_000_000_000)).toThrow(RangeError);
  });

  /** The ceiling itself is said, so the refusal above is a ceiling and not a wall. */
  test("says the largest amount it accepts", () => {
    expect(amountInWords(MAX)).toContain(
      "novecientos noventa y nueve millones",
    );
  });
});
