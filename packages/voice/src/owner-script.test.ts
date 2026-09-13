import { describe, expect, test } from "bun:test";
import { buildAgentBody } from "./client";
import { fold } from "./outcome";
import {
  buildOwnerScript,
  DEFAULT_OWNER_NAME,
  OWNER_BANNED_PHRASES,
  OWNER_CLOSING_LINE,
  OWNER_QUESTION,
  OWNER_TEMPLATE,
  OWNER_VARIABLE_DEFAULTS,
  type OwnerScriptInput,
  renderOwnerText,
} from "./owner-script";
import {
  BANNED_PHRASES,
  DEFAULT_COMPANY_NAME,
  REQUIRED_DISCLOSURE,
} from "./script";

/** Synthetic throughout: the CLABE, the name, the amount and both plazas. */
const CLABE = "012180001234567899";
const SUPPLIER = "Distribuidora Sintetica del Poniente, S.A. de C.V.";

/** Any run of five or more digits. A CLABE is eighteen, a mobile is twelve. */
const LONG_DIGIT_RUN = /\d{5,}/;

/** The stored copy: the two strings that reach the provider's dashboard. */
const STORED = [OWNER_TEMPLATE.systemPrompt, OWNER_TEMPLATE.firstMessage].join(
  "\n",
);

function input(over: Partial<OwnerScriptInput> = {}): OwnerScriptInput {
  return {
    supplierLegalName: SUPPLIER,
    clabe: CLABE,
    amount: 92_480.5,
    plazaNew: "DISTRITO FEDERAL",
    plazaUsual: "APODACA",
    ...over,
  };
}

const script = buildOwnerScript(input());

/** Every sentence one call produces, prompt included. */
function everythingSpoken(built = script): string {
  return [built.systemPrompt, ...built.spoken].join("\n");
}

describe("the owner agent stored at the provider", () => {
  /**
   * Rule 1, and the reason the first version of the supplier agent could not
   * place a call at all: a prompt that claims to be a person and then asks about
   * a payment is refused with `call_initialization_error 3000`. The disclosure is
   * in the greeting, before anything is asked.
   */
  test("says what the call is in the greeting, not later", () => {
    expect(OWNER_TEMPLATE.firstMessage).toContain(REQUIRED_DISCLOSURE);
    expect(OWNER_TEMPLATE.systemPrompt).toContain(REQUIRED_DISCLOSURE);
    expect(OWNER_TEMPLATE.systemPrompt).toContain(
      "Eres una línea automática y no una persona",
    );
  });

  /** Asked outright, it answers. It never denies what it is. */
  test("answers honestly when asked whether it is a recording", () => {
    expect(OWNER_TEMPLATE.systemPrompt).toContain(
      "Te preguntan si eres una persona o una grabación",
    );
  });

  test("carries the slots still empty, and a default for every one of them", () => {
    const slots = [...STORED.matchAll(/\{\{(\w+)\}\}/g)].map(
      (match) => match[1],
    );

    expect(slots.length).toBeGreaterThan(0);
    for (const slot of new Set(slots)) {
      expect(
        OWNER_VARIABLE_DEFAULTS[slot as keyof typeof OWNER_VARIABLE_DEFAULTS],
      ).toBeString();
    }
  });

  /**
   * Issue #206 applied to the second line. An eighteen-digit placeholder in the
   * stored prompt would be read out loud on every call this agent places, and the
   * dashboard it sits in is readable by anybody with the login.
   */
  test("carries no account and no long run of digits", () => {
    expect(STORED).not.toMatch(LONG_DIGIT_RUN);
    expect(STORED).not.toContain(CLABE);
  });

  /** The same pin over the body `bun run voice-setup --owner` uploads. */
  test("uploads a body with no CLABE in it", () => {
    const raw = JSON.stringify(
      buildAgentBody({
        name: "SentryOne dueño",
        systemPrompt: OWNER_TEMPLATE.systemPrompt,
        firstMessage: OWNER_TEMPLATE.firstMessage,
        dynamicVariableDefaults: OWNER_VARIABLE_DEFAULTS,
        endCall: true,
      }),
    );

    expect(raw).not.toMatch(LONG_DIGIT_RUN);
    expect(raw).not.toContain(CLABE);
    expect(raw).toContain("end_call");
  });

  /** Rule 8 of `script.ts`: one line, word for word, and then it hangs up. */
  test("closes on one line it reads word for word, then hangs up itself", () => {
    expect(OWNER_TEMPLATE.systemPrompt).toContain(OWNER_CLOSING_LINE);
    expect(OWNER_TEMPLATE.systemPrompt).toContain("La herramienta end_call");
    expect(OWNER_TEMPLATE.systemPrompt).toContain("cuelgas tú");
  });

  test("quotes the one question, so the prompt cannot ask a different one", () => {
    expect(OWNER_TEMPLATE.systemPrompt).toContain(OWNER_QUESTION);
    expect(script.question).toBe(OWNER_QUESTION);
  });

  test("holds the rules the call may not break", () => {
    const prompt = OWNER_TEMPLATE.systemPrompt;

    expect(prompt).toContain("Nunca digas una cuenta completa");
    expect(prompt).toContain("Nunca pidas datos bancarios");
    expect(prompt).toContain("Nunca prometas que el pago se va a hacer");
    expect(prompt).toContain("menos de noventa segundos");
    expect(prompt).toContain("Una sola aclaración como máximo");
    expect(prompt).toContain("siempre de usted");
  });
});

describe("the words this call never says", () => {
  /**
   * Asserted over what is SPOKEN and not over the prompt, and the difference is
   * deliberate: the rules block has to name "fraude" in order to forbid it, and a
   * prohibition the model reads is the opposite of the sentence it bans.
   */
  test("are absent from every sentence one call renders", () => {
    const folded = fold(script.spoken.join("\n"));

    for (const phrase of OWNER_BANNED_PHRASES) {
      expect(folded).not.toContain(phrase);
    }
  });

  /** The four inherited ones appear in neither, prohibitions included. */
  test("are absent from the prompt the provider stores", () => {
    const folded = fold(everythingSpoken());

    for (const phrase of BANNED_PHRASES) {
      expect(folded).not.toContain(phrase);
    }
  });
});

describe("buildOwnerScript", () => {
  test("says the amount, the supplier and four digits of the account", () => {
    expect(script.firstMessage).toContain(DEFAULT_OWNER_NAME);
    expect(script.firstMessage).toContain(DEFAULT_COMPANY_NAME);
    expect(script.spoken[1]).toContain(
      "noventa y dos mil cuatrocientos ochenta pesos con cincuenta centavos",
    );
    expect(script.spoken[1]).toContain(SUPPLIER);
    expect(script.clabeLast4).toBe("7899");
    /* Spaced, because a live call read "4611" as a quantity. */
    expect(script.spoken[1]).toContain("7 8 9 9");
  });

  /**
   * The reason this file stopped handing the provider a formatted figure. On the
   * live call of 2026-09-13 the variable went out as "$537,960.97 pesos" and the
   * text to speech model said "cincuenta y tres mil setecientos noventa y seis
   * pesos con noventa y siete centavos", a tenth of the amount, to the person
   * being asked whether to release it. The grouping comma is a convention the
   * model does not have to honour, so the amount travels in words.
   */
  test("hands the provider the amount in words, with no digit in it", () => {
    expect(script.dynamicVariables.amount).toBe(
      "noventa y dos mil cuatrocientos ochenta pesos con cincuenta centavos",
    );
    expect(script.dynamicVariables.amount).not.toMatch(/\d/);
    expect(script.dynamicVariables.amount).not.toContain("$");

    const big = buildOwnerScript(input({ amount: 537_960.97 }));

    expect(big.dynamicVariables.amount).toBe(
      "quinientos treinta y siete mil novecientos sesenta pesos con noventa y siete centavos",
    );
  });

  test("never puts the whole account anywhere, spoken or on the wire", () => {
    const everything = [
      everythingSpoken(),
      JSON.stringify(script.dynamicVariables),
    ].join("\n");

    expect(everything).not.toContain(CLABE);
    expect(everything).not.toMatch(LONG_DIGIT_RUN);
  });

  test("ends on the question, which is the whole call", () => {
    expect(script.spoken[script.spoken.length - 1]).toBe(OWNER_QUESTION);
    expect(script.spoken).toHaveLength(4);
  });

  test("takes the owner and the company from the caller when given", () => {
    const named = buildOwnerScript(
      input({ ownerName: "Visitante", companyName: "Metálicos del Sur" }),
    );

    expect(named.firstMessage).toContain("Visitante");
    expect(named.firstMessage).toContain("Metálicos del Sur");
    expect(named.firstMessage).not.toContain(DEFAULT_OWNER_NAME);
  });

  test("falls back to the defaults on a blank name", () => {
    const blank = buildOwnerScript(input({ ownerName: "  ", companyName: "" }));

    expect(blank.dynamicVariables.owner).toBe(DEFAULT_OWNER_NAME);
    expect(blank.dynamicVariables.company).toBe(DEFAULT_COMPANY_NAME);
  });
});

/**
 * The plaza sentence, which is the signal that held the payment.
 *
 * Three cases and the middle one is the one that matters: a call that read one
 * city out twice as though it were two places would be claiming a change that did
 * not happen, which is the ADR-0002 rule about invented data applied to speech.
 */
describe("the two plazas", () => {
  test("names both when the account moved", () => {
    expect(script.dynamicVariables.plaza_new).toBe("DISTRITO FEDERAL");
    expect(script.dynamicVariables.plaza_usual).toBe("APODACA");
    expect(script.spoken[2]).toContain("DISTRITO FEDERAL");
    expect(script.spoken[2]).toContain("APODACA");
  });

  test("says so instead of naming one place twice", () => {
    const same = buildOwnerScript(
      input({ plazaNew: "APODACA", plazaUsual: "APODACA" }),
    );

    expect(same.dynamicVariables.plaza_usual).toBe("esa misma plaza");
    expect(same.spoken[2]).toContain("APODACA");
    expect(same.spoken[2]).toContain("esa misma plaza");
  });

  test("claims no history when the supplier has none", () => {
    const fresh = buildOwnerScript(input({ plazaUsual: "" }));

    expect(fresh.dynamicVariables.plaza_usual).toContain(
      "ninguna plaza que tengamos registrada",
    );
  });

  test("names no place the catalogue could not name", () => {
    const unknown = buildOwnerScript(input({ plazaNew: "" }));

    expect(unknown.dynamicVariables.plaza_new).toBe(
      "una plaza que no podemos nombrar",
    );
  });
});

describe("renderOwnerText", () => {
  test("fills every slot it is given", () => {
    expect(
      renderOwnerText("{{owner}} de {{company}}", OWNER_VARIABLE_DEFAULTS),
    ).toBe(`${DEFAULT_OWNER_NAME} de ${DEFAULT_COMPANY_NAME}`);
  });

  /**
   * The failure this throw exists for is a text to speech model reading
   * "{{supplier}}" to a real person on a telephone.
   */
  test("throws rather than speaking a placeholder nothing filled", () => {
    expect(() =>
      renderOwnerText("{{nada}}", OWNER_VARIABLE_DEFAULTS),
    ).toThrowError(RangeError);
  });
});
