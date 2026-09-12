/**
 * The post-processor is pure, so every case here is an input string and an
 * expected answer. No model, no network, no key, no clock.
 *
 * The cases are named after the way a CLABE actually arrives at a Mexican SMB:
 * grouped on a handwritten note, run together in a WhatsApp message, sitting
 * under an amount in a screenshot, or one digit short because a pen ran out.
 */

import { describe, expect, it } from "bun:test";
import {
  DEFAULT_CLARITY,
  findClabeCandidates,
  isCheckDigitValid,
  PENALTY_FACTORS,
  readAmount,
  readClabeFromText,
  readHint,
} from "./postprocess";

/** Valid check digit. BANREGIO, plaza 580. */
const VALID = "058580000723456775";
/** The account SYN010101AAA has been paid on seven times. Also valid. */
const KNOWN = "058580000123456715";
/** VALID with the check digit itself wrong. */
const BROKEN = "058580000723456774";

describe("isCheckDigitValid", () => {
  it("accepts the 3-7-1 check digit that core computes", () => {
    expect(isCheckDigitValid(VALID)).toBe(true);
    expect(isCheckDigitValid(KNOWN)).toBe(true);
  });

  it("rejects a CLABE whose last digit was changed", () => {
    expect(isCheckDigitValid(BROKEN)).toBe(false);
  });

  it("rejects anything that is not eighteen digits", () => {
    expect(isCheckDigitValid("")).toBe(false);
    expect(isCheckDigitValid("05858000072345677")).toBe(false);
    expect(isCheckDigitValid("0585800007234567750")).toBe(false);
    expect(isCheckDigitValid("05858000072345677O")).toBe(false);
  });
});

describe("findClabeCandidates", () => {
  it("finds an account number written as one block", () => {
    const found = findClabeCandidates(`Depositar a ${VALID} porfavor`);

    expect(found).toHaveLength(1);
    expect(found[0]?.clabe).toBe(VALID);
    expect(found[0]?.separated).toBe(false);
    expect(found[0]?.checkDigitValid).toBe(true);
  });

  it("finds one written in groups of four, which is how it is handwritten", () => {
    const found = findClabeCandidates("CLABE: 0585 8000 0723 4567 75");

    expect(found).toHaveLength(1);
    expect(found[0]?.clabe).toBe(VALID);
    expect(found[0]?.separated).toBe(true);
    expect(found[0]?.raw).toBe("0585 8000 0723 4567 75");
  });

  it("tolerates hyphens the way normalizeClabe does", () => {
    const found = findClabeCandidates("058-580-0007-2345-6775");

    expect(found[0]?.clabe).toBe(VALID);
  });

  it("tolerates a line break in the middle of the number", () => {
    const found = findClabeCandidates("CLABE\n0585 8000 0723\n4567 75\n");

    expect(found[0]?.clabe).toBe(VALID);
  });

  it("keeps an eighteen-digit run whose check digit fails", () => {
    const found = findClabeCandidates(`CLABE ${BROKEN}`);

    expect(found).toHaveLength(1);
    expect(found[0]?.clabe).toBe(BROKEN);
    expect(found[0]?.checkDigitValid).toBe(false);
  });

  it("pulls the account out of a longer run that starts with an amount", () => {
    // An amount on the line above and the account below, with nothing but a
    // newline between them, is one run of twenty four digits.
    const found = findClabeCandidates(`184300\n${VALID}`);

    expect(found.map((candidate) => candidate.clabe)).toEqual([VALID]);
  });

  it("reports nothing for a long run with no valid window", () => {
    const found = findClabeCandidates("8112345678 2026 09 12 0000");

    expect(found).toEqual([]);
  });

  it("reports nothing for seventeen digits", () => {
    expect(findClabeCandidates(VALID.slice(0, 17))).toEqual([]);
  });

  it("deduplicates the same account written twice", () => {
    const found = findClabeCandidates(`${VALID} y otra vez ${VALID}`);

    expect(found).toHaveLength(1);
  });

  it("returns candidates in the order they appear", () => {
    const found = findClabeCandidates(`${BROKEN}\ny tambien ${KNOWN}`);

    expect(found.map((candidate) => candidate.clabe)).toEqual([BROKEN, KNOWN]);
  });

  it("does not scan past the cap", () => {
    const found = findClabeCandidates(`${"x".repeat(20_000)} ${VALID}`);

    expect(found).toEqual([]);
  });
});

describe("readClabeFromText", () => {
  it("keeps the model's self-report when everything agrees", () => {
    const reading = readClabeFromText(`CLABE ${VALID}`, VALID, 0.9);

    expect(reading.clabe).toBe(VALID);
    expect(reading.source).toBe("text");
    expect(reading.checkDigitValid).toBe(true);
    expect(reading.penalties).toEqual([]);
    expect(reading.confidence).toBe(0.9);
  });

  it("lowers the confidence when the check digit fails", () => {
    const reading = readClabeFromText(`CLABE ${BROKEN}`, BROKEN, 0.8);

    expect(reading.clabe).toBe(BROKEN);
    expect(reading.checkDigitValid).toBe(false);
    expect(reading.penalties).toEqual(["check_digit_failed"]);
    expect(reading.confidence).toBe(0.8 * PENALTY_FACTORS.check_digit_failed);
  });

  it("lowers it when the digits are the model's word only", () => {
    const reading = readClabeFromText("no se alcanza a leer", VALID, 0.6);

    expect(reading.clabe).toBe(VALID);
    expect(reading.source).toBe("model");
    expect(reading.penalties).toEqual(["not_in_text"]);
    expect(reading.confidence).toBe(0.6 * PENALTY_FACTORS.not_in_text);
  });

  it("prefers the transcription and says so when the two disagree", () => {
    const reading = readClabeFromText(`CLABE ${VALID}`, KNOWN, 0.9);

    expect(reading.clabe).toBe(VALID);
    expect(reading.source).toBe("text");
    expect(reading.penalties).toEqual(["model_disagrees"]);
  });

  it("lowers it when two valid accounts are on the page", () => {
    const reading = readClabeFromText(`${VALID} o ${KNOWN}`, null, 1);

    expect(reading.penalties).toEqual(["ambiguous_candidates"]);
    expect(reading.confidence).toBe(PENALTY_FACTORS.ambiguous_candidates);
  });

  it("prefers the arithmetically valid account over the earlier one", () => {
    const reading = readClabeFromText(`${BROKEN} o bien ${KNOWN}`, null, 1);

    expect(reading.clabe).toBe(KNOWN);
    expect(reading.penalties).toEqual([]);
  });

  it("multiplies the factors when more than one applies", () => {
    const reading = readClabeFromText("dicho de viva voz", BROKEN, 1);

    expect(reading.penalties).toEqual(["not_in_text", "check_digit_failed"]);
    expect(reading.confidence).toBe(
      PENALTY_FACTORS.not_in_text * PENALTY_FACTORS.check_digit_failed,
    );
  });

  it("answers with no CLABE and no confidence when there is nothing to read", () => {
    const reading = readClabeFromText("la foto salio movida", null, 0.2);

    expect(reading.clabe).toBeUndefined();
    expect(reading.source).toBe("none");
    expect(reading.checkDigitValid).toBe(false);
    expect(reading.confidence).toBe(0);
  });

  it("ignores a claimed account that is not eighteen digits", () => {
    const reading = readClabeFromText("sin numero", "0585 8000", 0.9);

    expect(reading.source).toBe("none");
    expect(reading.confidence).toBe(0);
  });

  it("accepts a claimed account written with separators", () => {
    const reading = readClabeFromText("dictada", "0585 8000 0723 4567 75", 0.5);

    expect(reading.clabe).toBe(VALID);
  });

  it("treats a missing self-report as half", () => {
    const reading = readClabeFromText(`CLABE ${VALID}`, VALID, null);

    expect(reading.clarity).toBe(DEFAULT_CLARITY);
    expect(reading.confidence).toBe(DEFAULT_CLARITY);
  });

  it("clamps a self-report outside 0 to 1", () => {
    expect(readClabeFromText(`x ${VALID}`, VALID, 7).confidence).toBe(1);
    expect(readClabeFromText(`x ${VALID}`, VALID, -3).confidence).toBe(0);
  });
});

describe("readAmount", () => {
  it("keeps a positive finite number", () => {
    expect(readAmount(184_300)).toBe(184_300);
  });

  it("drops zero, a negative, a string and a null", () => {
    expect(readAmount(0)).toBeUndefined();
    expect(readAmount(-1)).toBeUndefined();
    expect(readAmount("184,300.00")).toBeUndefined();
    expect(readAmount(null)).toBeUndefined();
    expect(readAmount(Number.NaN)).toBeUndefined();
  });
});

describe("readHint", () => {
  it("collapses whitespace and trims", () => {
    expect(readHint("  Aceros   y\nPerfiles ")).toBe("Aceros y Perfiles");
  });

  it("drops an empty hint", () => {
    expect(readHint("   ")).toBeUndefined();
    expect(readHint(null)).toBeUndefined();
  });

  it("caps a hint that is really a paragraph", () => {
    expect(readHint("a".repeat(500))).toHaveLength(200);
  });
});
