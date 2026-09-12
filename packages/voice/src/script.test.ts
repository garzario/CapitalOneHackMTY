import { describe, expect, test } from "bun:test";
import {
  buildVerificationScript,
  last4,
  scriptForInstruction,
  spokenAmount,
} from "./script";

/** Synthetic throughout: the CLABE, the name and the amount are invented. */
const CLABE = "012180001234567899";
const SUPPLIER = "Distribuidora Sintetica del Poniente, S.A. de C.V.";

function script() {
  return buildVerificationScript({
    supplierLegalName: SUPPLIER,
    clabe: CLABE,
    amount: 184_300,
  });
}

describe("last4", () => {
  test("takes the last four digits of a CLABE", () => {
    expect(last4(CLABE)).toBe("7899");
  });

  test("ignores spacing a clerk typed into the account", () => {
    expect(last4("0121 8000 1234 5678 99")).toBe("7899");
  });

  test("returns what it has rather than padding a short account", () => {
    expect(last4("99")).toBe("99");
    expect(last4("")).toBe("");
  });
});

describe("spokenAmount", () => {
  test("says the currency out loud so pesos are never ambiguous", () => {
    expect(spokenAmount(184_300)).toContain("184,300.00");
    expect(spokenAmount(184_300).endsWith(" pesos")).toBe(true);
  });

  test("keeps the cents of a one-cent probe", () => {
    expect(spokenAmount(0.01)).toContain("0.01");
  });
});

describe("buildVerificationScript", () => {
  test("names the supplier, the amount and the last four digits", () => {
    const built = script();

    expect(built.firstMessage).toContain(
      "Distribuidora Sintetica del Poniente",
    );
    expect(built.question).toContain("184,300.00");
    expect(built.question).toContain("7899");
    expect(built.clabeLast4).toBe("7899");
  });

  /**
   * The rule the whole script exists under. Reading an account number to
   * whoever answered a phone hands them the account.
   */
  test("never puts the full account anywhere it could be spoken", () => {
    const built = script();
    const everything = [
      built.systemPrompt,
      built.firstMessage,
      built.question,
      ...built.spoken,
    ].join("\n");

    expect(everything).not.toContain(CLABE);
    expect(everything).not.toContain(CLABE.slice(0, 10));
    expect(everything).toContain("7899");
  });

  test("promises nothing about the payment", () => {
    const prompt = script().systemPrompt;

    expect(prompt).toContain("Nunca prometas que el pago se va a hacer");
    expect(prompt).toContain("sigue en revision");
  });

  test("accuses nobody and asks for no data", () => {
    const prompt = script().systemPrompt;

    expect(prompt).toContain("Nunca hables de fraude");
    expect(prompt).toContain("Nunca pidas datos bancarios");
  });

  test("carries the question the agent must read word for word", () => {
    const built = script();

    expect(built.systemPrompt).toContain(built.question);
    expect(built.spoken).toEqual([built.firstMessage, built.question]);
  });

  test("uses the company name it was given", () => {
    const built = buildVerificationScript({
      supplierLegalName: SUPPLIER,
      clabe: CLABE,
      amount: 1,
      companyName: "Sintetica Industrial",
    });

    expect(built.firstMessage).toContain("Sintetica Industrial");
    expect(built.systemPrompt).toContain("Sintetica Industrial");
  });
});

describe("scriptForInstruction", () => {
  test("takes the legal name from the supplier record", () => {
    const built = scriptForInstruction(
      { clabe: CLABE, amount: 5000, supplierRfc: "SYN010101AAA" },
      { legalName: SUPPLIER },
    );

    expect(built.firstMessage).toContain(
      "Distribuidora Sintetica del Poniente",
    );
  });

  /** "S.A. de C.V.." is a pause in the wrong place, right on the name. */
  test("does not double the full stop of a razon social", () => {
    const built = scriptForInstruction(
      { clabe: CLABE, amount: 5000, supplierRfc: "SYN010101AAA" },
      { legalName: SUPPLIER },
    );

    expect(built.firstMessage).toContain("S.A. de C.V.?");
    expect(built.systemPrompt).not.toContain("C.V..");
  });

  /**
   * No supplier record means no razon social. The RFC is a fact on the
   * instruction; a company name would be something this package made up.
   */
  test("falls back to the RFC rather than inventing a company name", () => {
    const built = scriptForInstruction(
      { clabe: CLABE, amount: 5000, supplierRfc: "SYN010101AAA" },
      undefined,
    );

    expect(built.firstMessage).toContain("SYN010101AAA");
  });
});
