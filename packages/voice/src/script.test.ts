import { describe, expect, test } from "bun:test";
import { fold } from "./outcome";
import {
  BANNED_PHRASES,
  buildVerificationScript,
  DEFAULT_CALLER_NAME,
  last4,
  REQUIRED_DISCLOSURE,
  renderVerificationText,
  scriptForInstruction,
  spokenAmount,
  spokenLast4,
  VERIFICATION_CLOSING_LINE,
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

/** The stored copy: the two strings that reach the provider's dashboard. */
const STORED = [
  VERIFICATION_TEMPLATE.systemPrompt,
  VERIFICATION_TEMPLATE.firstMessage,
].join("\n");

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
    built.purpose,
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
    /* The only digits in the stored prompt are the numbers of the steps of the
       guion and of the closing sequence, one digit each. An account is eighteen,
       four digits of one are four, and the smallest amount this product pays is
       0.01. */
    expect(STORED).not.toMatch(/\d\d/);
    expect(STORED).not.toContain(CLABE);
  });

  test("leaves a slot for every value a call has to fill", () => {
    for (const name of Object.keys(VERIFICATION_VARIABLE_DEFAULTS)) {
      expect(STORED).toContain(`{{${name}}}`);
    }
  });

  /**
   * Rule 1, and the reason the control rings at all. The first version of this
   * prompt claimed to be a person and asked for account confirmations, and the
   * provider refused every call with `call_initialization_error 3000`: they
   * dropped at zero seconds. The disclosure is in the greeting, before anything
   * is asked, and it is repeated wherever the agent says who it is.
   */
  test("says what the call is in the greeting, not later", () => {
    expect(VERIFICATION_TEMPLATE.firstMessage).toContain(REQUIRED_DISCLOSURE);
    expect(VERIFICATION_TEMPLATE.systemPrompt).toContain(REQUIRED_DISCLOSURE);
    expect(VERIFICATION_TEMPLATE.systemPrompt).toContain(
      "Eres una línea automática y no una persona",
    );
  });

  /** Asked outright, it answers. It never denies what it is. */
  test("answers honestly when asked whether it is a recording", () => {
    expect(VERIFICATION_TEMPLATE.systemPrompt).toContain(
      "Te preguntan si eres una persona o una grabación",
    );
    expect(VERIFICATION_TEMPLATE.systemPrompt).toContain(
      "una persona del área revisa el resultado",
    );
  });

  /**
   * Rule 8. `conv_2601m2ctkvwrfsq9ar74mzby77f3` is the call where this sequence
   * was heard end to end: the summary, this line, and the hang up. An agent that
   * was only told to finish said the goodbye and then held the line open to the
   * duration cap.
   */
  test("closes on one line it reads word for word, then hangs up itself", () => {
    expect(VERIFICATION_TEMPLATE.systemPrompt).toContain(
      VERIFICATION_CLOSING_LINE,
    );
    expect(VERIFICATION_TEMPLATE.systemPrompt).toContain(
      "La herramienta end_call",
    );
    expect(VERIFICATION_TEMPLATE.systemPrompt).toContain(
      "No esperes a que cuelguen ellos",
    );
    expect(VERIFICATION_CLOSING_LINE).toContain("agradezco");
  });

  /** What makes two turns sound like a person doing their job. */
  test("acknowledges, pauses at most once, and never repeats a sentence", () => {
    const prompt = VERIFICATION_TEMPLATE.systemPrompt;

    expect(prompt).toContain("reconoce en dos palabras");
    expect(prompt).toContain("Perfecto, gracias.");
    expect(prompt).toContain("Entendido.");
    expect(prompt).toContain("Si necesitas una pausa, una sola palabra");
    expect(prompt).toContain("Nunca repitas un enunciado que ya dijiste");
  });

  /** The closing summary is in their words, which is also the evidence we keep. */
  test("closes on what the supplier said, in the words they used", () => {
    expect(VERIFICATION_TEMPLATE.systemPrompt).toContain(
      "con las palabras que ellos usaron",
    );
    expect(VERIFICATION_TEMPLATE.systemPrompt).toContain(
      "en las palabras del proveedor",
    );
  });

  test("still names the rules that are not about digits", () => {
    const prompt = VERIFICATION_TEMPLATE.systemPrompt;

    expect(prompt).toContain("Nunca digas una cuenta completa");
    expect(prompt).toContain("Nunca pidas datos bancarios");
    expect(prompt).toContain("Nunca prometas que el pago se va a hacer");
    expect(prompt).toContain("Nunca hables de fraude");
  });

  /** Rule 2's second half, now written into the prompt and not only into code. */
  test("forbids the account that was paid before, four digits included", () => {
    expect(VERIFICATION_TEMPLATE.systemPrompt).toContain(
      "Nunca digas la cuenta en la que ya se le había pagado antes",
    );
  });
});

/**
 * The banned words, read off the copy the provider stores and off a rendered
 * call.
 *
 * Each phrase is here because it was heard. The two word either-or was the
 * question's last line and the model repeated it on every re-ask, which is what
 * a recording sounds like, and it handed `outcome.ts` a monosyllable where it
 * needs a clause. "Asistente virtual", "sistema" and "inteligencia artificial"
 * are what a supplier hangs up on: this is the payments line of a company they
 * invoice, and rule 1 is satisfied by saying that, not by naming a technology.
 *
 * Folded before comparing, so "Sí o no" and "SI O NO" cannot walk past the
 * assertion that "si o no" fails. The rule is stated in the prompt without using
 * the phrase, for the same reason.
 */
describe("the words this call never says", () => {
  test("are absent from the prompt the provider stores", () => {
    const folded = fold(STORED);

    for (const phrase of BANNED_PHRASES) {
      expect(folded).not.toContain(phrase);
    }
  });

  test("are absent from every sentence one call renders", () => {
    for (const built of [script(), changedScript()]) {
      const folded = fold(everythingSpoken(built));

      for (const phrase of BANNED_PHRASES) {
        expect(folded).not.toContain(phrase);
      }
    }
  });

  test("are absent from the defaults a call with no variables says", () => {
    const folded = fold(
      Object.values(VERIFICATION_VARIABLE_DEFAULTS).join(" "),
    );

    for (const phrase of BANNED_PHRASES) {
      expect(folded).not.toContain(phrase);
    }
  });

  /** The list is the point, so a silent edit that empties it fails here. */
  test("include the two-word either-or that the last version ended on", () => {
    expect(BANNED_PHRASES).toContain("si o no");
    expect(BANNED_PHRASES).toContain("asistente virtual");
    expect(BANNED_PHRASES).toContain("sistema");
    expect(BANNED_PHRASES).toContain("inteligencia artificial");
  });
});

describe("VERIFICATION_VARIABLE_DEFAULTS", () => {
  /**
   * What a call with no variables says. It has to be a sentence, because a text
   * to speech model hands a literal "{{supplier}}" to whoever answered.
   */
  test("asks nothing and names no account", () => {
    const rendered = renderVerificationText(
      STORED,
      VERIFICATION_VARIABLE_DEFAULTS,
    );

    expect(rendered).not.toContain("{{");
    expect(rendered).not.toMatch(LONG_DIGIT_RUN);
    expect(VERIFICATION_VARIABLE_DEFAULTS.question).toContain(
      "Una persona del área se comunica con usted",
    );
    expect(VERIFICATION_VARIABLE_DEFAULTS.question).not.toContain("cuenta que");
  });

  /** The name the line gives itself, and the company it says it calls for. */
  test("names the line and the company, so neither slot is ever literal", () => {
    expect(VERIFICATION_VARIABLE_DEFAULTS.caller).toBe(DEFAULT_CALLER_NAME);
    expect(VERIFICATION_VARIABLE_DEFAULTS.company).not.toContain("SentryOne");
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
  /**
   * The amount is in the purpose and the digits are in the question, which is
   * the order a supplier can follow: this is your payment, and this is the one
   * thing I need. Issue #247 heard the earlier version read an amount with no
   * account attached to it.
   */
  test("names the supplier, then the amount, then the last four digits", () => {
    const built = script();

    expect(built.firstMessage).toContain(
      "Distribuidora Sintetica del Poniente",
    );
    expect(built.purpose).toContain("184,300.00");
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
    expect(prompt).toContain("sigue en revisión");
  });

  test("accuses nobody and asks for no data", () => {
    const prompt = script().systemPrompt;

    expect(prompt).toContain("Nunca hables de fraude");
    expect(prompt).toContain("Nunca pidas datos bancarios");
    expect(prompt).toContain("confirmar la cuenta antes de pagar es un paso");
  });

  /**
   * Found on the live call of 2026-09-13, `conv_8201m2cnt2fbf949zxnawp7hktfs`:
   * the agent reached a voicemail and asked "sigue ahi" for a hundred and fifty
   * seconds. A recording cannot answer, so there is nothing to wait for, and the
   * instruction must not be read to an answering machine.
   */
  test("hangs up on a voicemail rather than reading the instruction to it", () => {
    const prompt = script().systemPrompt;

    expect(prompt).toContain("Buzón de voz, grabación");
    expect(prompt).toContain("sin dejar mensaje");
  });

  test("carries the two lines the agent must read word for word", () => {
    const built = script();

    expect(built.systemPrompt).toContain(built.question);
    expect(built.systemPrompt).toContain(built.purpose);
    expect(built.spoken).toEqual([
      built.firstMessage,
      built.purpose,
      built.question,
    ]);
    expect(built.variables.question).toBe(built.question);
    expect(built.variables.purpose).toBe(built.purpose);
  });

  test("uses the company name and the caller name it was given", () => {
    const built = buildVerificationScript({
      supplierLegalName: SUPPLIER,
      clabe: CLABE,
      amount: 1,
      companyName: "Sintetica Industrial",
      callerName: "Rodrigo",
    });

    expect(built.firstMessage).toContain("Sintetica Industrial");
    expect(built.firstMessage).toContain("Rodrigo");
    expect(built.systemPrompt).toContain("Sintetica Industrial");
    expect(built.variables.company).toBe("Sintetica Industrial");
    expect(built.variables.caller).toBe("Rodrigo");
  });

  /**
   * Issue #206. "Is this account yours" can be answered yes by somebody who
   * opened it yesterday. "Did you change your account, and is this one yours"
   * cannot be answered yes by accident. Issue #250 took the two word either-or
   * off the end of it: the supplier is asked to confirm, in words.
   */
  test("asks about the change when the account changed", () => {
    const built = changedScript();

    expect(built.accountChanged).toBe(true);
    expect(built.purpose).toContain(
      "una cuenta distinta de la que le hemos pagado antes",
    );
    expect(built.question).toBe(
      "¿Me confirma que ustedes cambiaron su cuenta y que la que termina en 7 8 9 9 es de ustedes?",
    );
  });

  /**
   * A supplier with no payment history has changed nothing, and saying it did
   * would be a claim about a history that does not exist.
   */
  test("claims no change when there is no history to have changed", () => {
    const built = script();

    expect(built.accountChanged).toBe(false);
    expect(built.purpose).not.toContain("distinta");
    expect(built.question).toBe(
      "¿Me confirma que la cuenta que termina en 7 8 9 9 es de ustedes?",
    );
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
    expect(built.question).toContain("ustedes cambiaron su cuenta");
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
