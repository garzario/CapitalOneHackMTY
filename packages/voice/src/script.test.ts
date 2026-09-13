import { describe, expect, test } from "bun:test";
import {
  buildVerificationScript,
  last4,
  renderVerificationText,
  scriptForInstruction,
  spokenAmount,
  spokenLast4,
  VERIFICATION_TEMPLATE,
  VERIFICATION_VARIABLE_DEFAULTS,
} from "./script";

/** Synthetic throughout: the CLABE, the name and the amount are invented. */
const CLABE = "012180001234567899";
/** The account this synthetic supplier has already been paid on. */
const KNOWN_CLABE = "012580100091764611";
const SUPPLIER = "Distribuidora Sintetica del Poniente, S.A. de C.V.";

/** Any run of five or more digits. A CLABE is eighteen, a mobile is twelve. */
const LONG_DIGIT_RUN = /\d{5,}/;

function script() {
  return buildVerificationScript({
    supplierLegalName: SUPPLIER,
    clabe: CLABE,
    amount: 184_300,
  });
}

function changedScript() {
  return buildVerificationScript({
    supplierLegalName: SUPPLIER,
    clabe: CLABE,
    amount: 184_300,
    accountChanged: true,
  });
}

function everythingSpoken(built: ReturnType<typeof script>): string {
  return [
    built.systemPrompt,
    built.firstMessage,
    built.question,
    ...built.spoken,
    ...Object.values(built.variables),
  ].join("\n");
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

describe("spokenLast4", () => {
  /**
   * Heard on the live call of 2026-09-13,
   * `conv_0901m2cp16q0feht603dbz1t8a5r`: given "4611" the text to speech model
   * said "cuatro mil seiscientos once". A supplier matching the tail of their own
   * account is comparing four characters, not a quantity.
   */
  test("spaces the digits so they are read one at a time", () => {
    expect(spokenLast4("4611")).toBe("4 6 1 1");
    expect(spokenLast4(last4(CLABE))).toBe("7 8 9 9");
  });

  test("says nothing when there were no digits to say", () => {
    expect(spokenLast4("")).toBe("");
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

describe("VERIFICATION_TEMPLATE", () => {
  /**
   * The rule the whole package exists under, asserted against the copy the
   * provider stores rather than against the copy we render. An account number in
   * an ElevenLabs dashboard is an account number somebody can read.
   */
  test("carries no two digits in a row, so it can carry no account", () => {
    const stored = [
      VERIFICATION_TEMPLATE.systemPrompt,
      VERIFICATION_TEMPLATE.firstMessage,
    ].join("\n");

    /* The only digits in the stored prompt are the numbers of the six steps of
       the guion, one digit each. An account is eighteen, four digits of one are
       four, and the smallest amount this product pays is 0.01. */
    expect(stored).not.toMatch(/\d\d/);
    expect(stored).not.toContain(CLABE);
  });

  test("leaves a slot for every value a call has to fill", () => {
    const stored = [
      VERIFICATION_TEMPLATE.systemPrompt,
      VERIFICATION_TEMPLATE.firstMessage,
    ].join("\n");

    for (const name of Object.keys(VERIFICATION_VARIABLE_DEFAULTS)) {
      expect(stored).toContain(`{{${name}}}`);
    }
  });

  test("still names the four rules that are not about digits", () => {
    const prompt = VERIFICATION_TEMPLATE.systemPrompt;

    expect(prompt).toContain("Nunca digas una cuenta completa");
    expect(prompt).toContain("Nunca pidas datos bancarios");
    expect(prompt).toContain("Nunca prometas que el pago se va a hacer");
    expect(prompt).toContain("Nunca hables de fraude");
  });
});

describe("VERIFICATION_VARIABLE_DEFAULTS", () => {
  /**
   * What a call with no variables says. It has to be a sentence, because a text
   * to speech model hands a literal "{{supplier}}" to whoever answered.
   */
  test("asks nothing and names no account", () => {
    const rendered = renderVerificationText(
      [
        VERIFICATION_TEMPLATE.systemPrompt,
        VERIFICATION_TEMPLATE.firstMessage,
      ].join("\n"),
      VERIFICATION_VARIABLE_DEFAULTS,
    );

    expect(rendered).not.toContain("{{");
    expect(rendered).not.toMatch(LONG_DIGIT_RUN);
    expect(VERIFICATION_VARIABLE_DEFAULTS.question).toContain(
      "Una persona de la empresa se comunica con usted",
    );
    expect(VERIFICATION_VARIABLE_DEFAULTS.question).not.toContain("cuenta que");
  });
});

describe("renderVerificationText", () => {
  /** The failure mode is a model reading "{{supplier}}" to a real person. */
  test("refuses a template whose slot nothing fills", () => {
    expect(() =>
      renderVerificationText("hola {{nadie}}", VERIFICATION_VARIABLE_DEFAULTS),
    ).toThrow(RangeError);
  });

  test("fills every slot it knows", () => {
    expect(
      renderVerificationText(
        "{{company}} y {{account_last4}}",
        VERIFICATION_VARIABLE_DEFAULTS,
      ),
    ).toBe(
      `${VERIFICATION_VARIABLE_DEFAULTS.company} y ${VERIFICATION_VARIABLE_DEFAULTS.account_last4}`,
    );
  });
});

describe("buildVerificationScript", () => {
  test("names the supplier, the amount and the last four digits", () => {
    const built = script();

    expect(built.firstMessage).toContain(
      "Distribuidora Sintetica del Poniente",
    );
    expect(built.question).toContain("184,300.00");
    expect(built.question).toContain("7 8 9 9");
    expect(built.clabeLast4).toBe("7899");
  });

  /**
   * The rule the whole script exists under. Reading an account number to
   * whoever answered a phone hands them the account, and that has to hold of
   * every string this function returns, the dynamic variables included.
   */
  test("never puts the full account anywhere it could be spoken", () => {
    const everything = everythingSpoken(script());

    expect(everything).not.toContain(CLABE);
    expect(everything).not.toContain(CLABE.slice(0, 10));
    expect(everything).not.toMatch(LONG_DIGIT_RUN);
    expect(everything).toContain("7 8 9 9");
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
    expect(prompt).toContain("No digas que algo se ve mal");
  });

  /**
   * Found on the live call of 2026-09-13, `conv_8201m2cnt2fbf949zxnawp7hktfs`:
   * the agent reached a voicemail and asked "sigue ahi" for a hundred and fifty
   * seconds. A recording cannot answer, so there is nothing to wait for, and the
   * instruction must not be read to an answering machine.
   */
  test("hangs up on a voicemail rather than reading the instruction to it", () => {
    const prompt = script().systemPrompt;

    expect(prompt).toContain("Si te contesta un buzon de voz o una grabacion");
    expect(prompt).toContain("No dejes mensaje");
  });

  test("carries the question the agent must read word for word", () => {
    const built = script();

    expect(built.systemPrompt).toContain(built.question);
    expect(built.spoken).toEqual([built.firstMessage, built.question]);
    expect(built.variables.question).toBe(built.question);
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
    expect(built.variables.company).toBe("Sintetica Industrial");
  });

  /**
   * Issue #206. "Is this account yours" can be answered yes by somebody who
   * opened it yesterday. "Did you change your account, and is this one yours"
   * cannot be answered yes by accident, and it is still one yes or no, which is
   * what the parser in outcome.ts reads.
   */
  test("asks about the change when the account changed", () => {
    const built = changedScript();

    expect(built.accountChanged).toBe(true);
    expect(built.question).toContain(
      "una cuenta que no es la que le hemos pagado antes",
    );
    expect(built.question).toContain("si ustedes cambiaron su cuenta");
    expect(built.question).toContain("7 8 9 9");
    expect(built.question.endsWith("Si o no?")).toBe(true);
  });

  /**
   * A supplier with no payment history has changed nothing, and saying it did
   * would be a claim about a history that does not exist.
   */
  test("claims no change when there is no history to have changed", () => {
    const built = script();

    expect(built.accountChanged).toBe(false);
    expect(built.question).not.toContain("cambiaron");
    expect(built.question).toContain("una cuenta que termina en 7 8 9 9");
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

  /** The account history is what decides which of the two questions is asked. */
  test("reads the change off the accounts the supplier was paid on", () => {
    const built = scriptForInstruction(
      { clabe: CLABE, amount: 5000, supplierRfc: "SYN010101AAA" },
      {
        legalName: SUPPLIER,
        knownAccounts: [
          {
            clabe: KNOWN_CLABE,
            establishedBy: "payment_complement",
            establishedAt: "2026-03-04T10:00:00.000Z",
            timesPaid: 52,
          },
        ],
      },
    );

    expect(built.accountChanged).toBe(true);
    expect(built.question).toContain("si ustedes cambiaron su cuenta");
  });

  /**
   * The account the supplier has always been paid on is never read out, not
   * even its four digits: whoever answered does not need it to recognise their
   * own account, and a caller who is not the supplier would be handed it.
   */
  test("never speaks the account that was paid before", () => {
    const built = scriptForInstruction(
      { clabe: CLABE, amount: 5000, supplierRfc: "SYN010101AAA" },
      {
        legalName: SUPPLIER,
        knownAccounts: [
          {
            clabe: KNOWN_CLABE,
            establishedBy: "cep",
            establishedAt: "2026-03-04T10:00:00.000Z",
            timesPaid: 52,
          },
        ],
      },
    );
    const everything = everythingSpoken(built);

    expect(everything).not.toContain(KNOWN_CLABE);
    expect(everything).not.toContain(last4(KNOWN_CLABE));
    expect(everything).not.toMatch(LONG_DIGIT_RUN);
  });

  /** Paying the same account again is not a change, however it was typed. */
  test("does not call the account a change when it is the one already paid", () => {
    const built = scriptForInstruction(
      { clabe: "0125 8010 0091 7646 11", amount: 5000, supplierRfc: "SYN01" },
      {
        legalName: SUPPLIER,
        knownAccounts: [
          {
            clabe: KNOWN_CLABE,
            establishedBy: "instruction",
            establishedAt: "2026-03-04T10:00:00.000Z",
            timesPaid: 52,
          },
        ],
      },
    );

    expect(built.accountChanged).toBe(false);
    expect(built.question).not.toContain("cambiaron");
  });
});
