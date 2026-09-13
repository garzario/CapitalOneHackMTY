/**
 * The call that rings a visitor as the owner, tested where it can be tested
 * without a telephone.
 *
 * Four things in this file are worth a test and the rest is copy.
 *
 * **The number.** It is the one piece of personal data this product ever touches,
 * and the field has to take it in whatever shape the person in front of it writes
 * their own telephone number: with spaces, with brackets, with a country code or
 * without one. So the table of what somebody types and what would be POSTed is a
 * test, over `callBody`, which is the one place that builds what is sent. The
 * version this replaced kept ten digits and deleted the rest, which is how a
 * number typed with its country code became a different number and how the
 * button stayed dead with a full field in front of it.
 *
 * **Which event belongs to this call.** The ledger stream carries every event of
 * the whole company: a supplier verification call on the same instruction, and a
 * tour call somebody else started in another tab, both arrive here. Three things
 * have to be true at once before a card moves, and each one is a test.
 *
 * **What an answer means.** Four outcomes, two of which are the telephone rather
 * than the owner, and only one of the four moves the line. Getting that mapping
 * backwards would be this page saying a payment was released because nobody picked
 * up.
 *
 * **What to say when the API refuses.** Two of the three named refusals are not
 * failures, and anything this file has never heard of still has to reach the
 * screen in words, because a press that produced nothing at all is the one
 * outcome a visitor cannot act on.
 */

import { describe, expect, test } from "bun:test";
import type { LedgerEvent } from "@hackmty/core";
import type { ApiFailure } from "./api";
import { forbiddenVerdict } from "./assistant";
import type { TourCallStatus, TourHero, TourOwnerOutcome } from "./contract";
import { mockRun } from "./mock";
import { heroOf } from "./tour";
import {
  CALL_BUTTON,
  CONSENT_TEXT,
  callBody,
  callProblem,
  dialNote,
  digitsOf,
  isPhoneComplete,
  isSettled,
  LOCAL_SCRIPT_NOTE,
  localScript,
  MIN_PHONE_DIGITS,
  OUTCOME_SENTENCE,
  outcomeState,
  phoneProblem,
  revertSentence,
  SIMULATED_EVIDENCE,
  stateFromEvent,
  stillHeld,
  stripIndexOf,
  TOUR_CALL_STATUS_LABEL,
  TOUR_CALL_STRIP,
  toE164,
  tourCallFields,
} from "./tour-call";

/**
 * The hero exactly as a payload carries it, and not a hand-written blend.
 *
 * The fixture used to pair this line's folio, amount and account with the two
 * plazas of another one, which is a hero neither `GET /api/v1/tour` nor `heroOf`
 * can answer: the finding on this line is a check digit that does not add up and
 * an account seen for the first time, so both plazas are the same place and
 * neither carries a code. That blend is why a plaza discrepancy between two
 * identical cities shipped, so the fixture is the derived hero itself.
 */
const HERO: TourHero = {
  instructionId: "INS-2026-09-07-029",
  supplierRfc: "SYN980101S01",
  supplierName: "Aceros y Laminas del Norte SA de CV",
  amount: 537960.97,
  accountLast4: "9808",
  plazaNew: "APODACA",
  plazaUsual: "APODACA",
};

/** The other case of the same control: an account that did move city. */
const MOVED: TourHero = {
  ...HERO,
  plazaNew: "DISTRITO FEDERAL",
  plazaUsual: "APODACA",
};

/** A tour call event, with whatever the case under test changes about it. */
function ownerCall(extra: Record<string, unknown> = {}): LedgerEvent {
  return {
    type: "verification_call",
    at: "2026-09-13T15:00:00.000Z",
    instructionId: HERO.instructionId,
    supplierRfc: HERO.supplierRfc,
    outcome: "denied",
    clabeLast4: HERO.accountLast4,
    transcript: [],
    manual: false,
    line: "owner",
    conversationId: "conv-1",
    phoneHash: "0f".repeat(32),
    ownerOutcome: "hold",
    question: "La retenemos o la libera usted?",
    evidence: "No, ese cambio no lo autorice yo.",
    ...extra,
  } as unknown as LedgerEvent;
}

describe("the telephone number", () => {
  /**
   * What a person at the stand types, and the exact body that would be POSTed.
   *
   * Every row here is a shape somebody actually writes: the local way, the way a
   * contact card exports a Mexican mobile with its `1`, bare digits, and a number
   * from another country pasted out of a chat. Not one of them may be refused,
   * and not one of them may be quietly turned into a different telephone number.
   */
  const typed: Array<[string, string]> = [
    ["81 1234 5678", "+528112345678"],
    ["+52 1 81 1234 5678", "+5218112345678"],
    ["8112345678", "+528112345678"],
    ["+1 (512) 555 0100", "+15125550100"],
  ];

  test("what a person types is what would be sent", () => {
    for (const [raw, phone] of typed) {
      expect([raw, callBody(raw)]).toEqual([raw, { phone, consent: true }]);
    }
  });

  test("every one of those enables the button", () => {
    /* The half of the bug that produced no request at all: the button was
       disabled until the field held exactly ten digits, and the normaliser that
       fed it deleted whatever did not fit, so a number with a country code sat
       in the field looking complete while the button stayed dead. */
    for (const [raw] of typed) {
      expect([raw, isPhoneComplete(raw)]).toEqual([raw, true]);
      expect([raw, phoneProblem(raw)]).toEqual([raw, null]);
    }
  });

  test("the other shapes of the same number", () => {
    /* The `00` prefix is the `+` written the way most of the world dials it, and
       a Mexican number that lost its plus somewhere is twelve or thirteen digits
       that start in 52. */
    expect(toE164("00 52 81 1234 5678")).toBe("+528112345678");
    expect(toE164("528112345678")).toBe("+528112345678");
    expect(toE164("52 1 81 1234 5678")).toBe("+5218112345678");
    expect(toE164("(81) 1234-5678")).toBe("+528112345678");
    expect(toE164("15125550100")).toBe("+15125550100");
  });

  test("nothing is capped, trimmed or renamed", () => {
    /* The bug itself, as a test. `keepDigits` kept ten digits and stripped a
       leading 52, so a thirteen digit number reached the endpoint one digit
       short and pointing at a different telephone: a number built in the
       browser out of digits a person had typed correctly. */
    expect(digitsOf("+52 1 81 1234 5678")).toHaveLength(13);
    expect(toE164("+52 1 81 1234 5678")).toHaveLength(14);
    /* And a number from another country keeps all eleven of its digits rather
       than losing the last one to a ten digit cap. */
    expect(digitsOf(toE164("+1 (512) 555 0100"))).toHaveLength(11);
  });

  test("a number from a country nobody guessed is sent as it was written", () => {
    /* Sending it is the honest answer: the endpoint takes any E.164 number now,
       and a browser that invented a country code for it would be dialling a
       number nobody typed. */
    expect(toE164("+34 600 123 456")).toBe("+34600123456");
    expect(toE164("+81 90 1234 5678")).toBe("+819012345678");
  });

  test("the only refusal is too few digits to be a number", () => {
    expect(isPhoneComplete("")).toBe(false);
    expect(isPhoneComplete("81 12")).toBe(false);
    expect(isPhoneComplete("811 2345")).toBe(false);
    /* Eight is the floor, and it is the endpoint's own floor. */
    expect(MIN_PHONE_DIGITS).toBe(8);
    expect(isPhoneComplete("8112 3456")).toBe(true);
  });

  test("it says what is missing instead of saying invalid", () => {
    expect(phoneProblem("")).toContain("Escribe tu numero");
    expect(phoneProblem("811 2345")).toBe("Falta 1 digito.");
    expect(phoneProblem("81123")).toBe("Faltan 3 digitos.");
    expect(phoneProblem("81 1234 5678")).toBeNull();
  });

  test("the field says which telephone is about to ring", () => {
    /* Before the button is pressed, in the grouping the number is said in. It is
       what the fixed `+52` chip was pretending to answer and could not, because
       the normalisation happened after the field and out of sight. */
    expect(dialNote("81 1234 5678")).toBe("Marcaremos a +52 81 1234 5678");
    expect(dialNote("+52 1 81 1234 5678")).toBe(
      "Marcaremos a +52 1 81 1234 5678",
    );
    expect(dialNote("+1 (512) 555 0100")).toBe("Marcaremos a +1 512 555 0100");
    /* A country this file cannot group is printed as the E.164 string it is,
       rather than split into groups somebody invented. */
    expect(dialNote("+34 600 123 456")).toBe("Marcaremos a +34600123456");
    expect(dialNote("")).toBe("");
  });

  test("what is sent matches the rule the endpoint applies", () => {
    /* `tourCallBodySchema` in `apps/api/src/schemas.ts`, which is now the whole
       rule: E.164, eight to fifteen digits, no country of its own. */
    const e164 = /^\+[1-9]\d{7,14}$/;

    for (const [raw] of typed) {
      expect([raw, e164.test(callBody(raw).phone)]).toEqual([raw, true]);
    }
  });
});

describe("which event belongs to this call", () => {
  test("the owner line of this conversation, and nothing else", () => {
    const fields = tourCallFields(ownerCall(), "conv-1");

    expect(fields?.line).toBe("owner");
    expect(fields?.ownerOutcome).toBe("hold");
    expect(fields?.conversationId).toBe("conv-1");
  });

  test("a supplier verification call on the same instruction is ignored", () => {
    /* The event type is shared on purpose: one call, two lines. `line` is what
       tells them apart, and an ordinary verification call carries none. */
    expect(tourCallFields(ownerCall({ line: undefined }), "conv-1")).toBeNull();
    expect(
      tourCallFields(ownerCall({ line: "supplier" }), "conv-1"),
    ).toBeNull();
  });

  test("a tour call somebody else started is ignored", () => {
    expect(tourCallFields(ownerCall(), "conv-2")).toBeNull();
    expect(
      tourCallFields(ownerCall({ conversationId: undefined }), "conv-1"),
    ).toBeNull();
  });

  test("an event with no outcome moves nothing", () => {
    expect(
      tourCallFields(ownerCall({ ownerOutcome: "maybe" }), "conv-1"),
    ).toBeNull();
    expect(
      tourCallFields(ownerCall({ ownerOutcome: undefined }), "conv-1"),
    ).toBeNull();
  });

  test("another kind of ledger event is not a call", () => {
    const decision: LedgerEvent = {
      type: "payment_failed",
      at: "2026-09-13T15:00:00.000Z",
      instructionId: HERO.instructionId,
      reason: "the rail refused the line",
    };

    expect(tourCallFields(decision, "conv-1")).toBeNull();
  });

  test("an event on the stream means the call is over", () => {
    const state = stateFromEvent(ownerCall(), "conv-1");

    expect(state?.status).toBe("done");
    expect(state?.ownerOutcome).toBe("hold");
    expect(state?.evidence).toBe("No, ese cambio no lo autorice yo.");

    /* And an event that carried no sentence quotes nothing rather than an empty
       pair of quotation marks. */
    const quiet = stateFromEvent(ownerCall({ evidence: undefined }), "conv-1");

    expect(quiet?.evidence).toBeUndefined();
  });

  test("only the two settled statuses stop the page asking", () => {
    expect(isSettled("done")).toBe(true);
    expect(isSettled("failed")).toBe(true);
    expect(isSettled("initiated")).toBe(false);
    expect(isSettled("in-progress")).toBe(false);
    expect(isSettled("processing")).toBe(false);
  });
});

describe("what an answer means", () => {
  const outcomes: TourOwnerOutcome[] = [
    "hold",
    "release",
    "no_answer",
    "unclear",
  ];

  test("only a release moves the line", () => {
    expect(outcomeState("release")).toBe("liberado");
    expect(outcomeState("hold")).toBe("rojo");
    /* The conservative half, and the one worth a test: a telephone that nobody
       answered must never read as a payment that was let through. */
    expect(outcomeState("no_answer")).toBe("rojo");
    expect(outcomeState("unclear")).toBe("rojo");

    expect(stillHeld("release")).toBe(false);
    expect(stillHeld("no_answer")).toBe(true);
  });

  test("every outcome has a sentence, and none of them promises anything", () => {
    for (const outcome of outcomes) {
      const sentence = OUTCOME_SENTENCE[outcome];

      expect([outcome, sentence.length > 20]).toEqual([outcome, true]);
      expect([outcome, forbiddenVerdict(sentence)]).toEqual([outcome, null]);
    }

    expect(OUTCOME_SENTENCE.no_answer).toContain("sigue retenida");
    expect(OUTCOME_SENTENCE.unclear).toContain("sigue retenida");
  });

  test("only the two answers a person can give are simulated", () => {
    expect(SIMULATED_EVIDENCE.hold.length).toBeGreaterThan(10);
    expect(SIMULATED_EVIDENCE.release.length).toBeGreaterThan(10);
    /* Nobody says anything when nobody answers, so there is nothing to quote. */
    expect(SIMULATED_EVIDENCE.no_answer).toBe("");
    expect(SIMULATED_EVIDENCE.unclear).toBe("");
  });

  /* Every status there is, read off the map the compiler keeps exhaustive: it is
     a `Record<TourCallStatus, string>`, so a status added to the union fails the
     build here rather than rendering as an empty pill. */
  const statuses = Object.keys(TOUR_CALL_STATUS_LABEL) as TourCallStatus[];

  test("every status the provider can report has a word", () => {
    expect(statuses).toHaveLength(5);

    for (const status of statuses) {
      expect([status, TOUR_CALL_STATUS_LABEL[status].length > 3]).toEqual([
        status,
        true,
      ]);
    }
  });

  test("the strip a visitor watches is three states and not four", () => {
    /* It rings, you talk, it ends. `processing` is the provider reading its own
       transcript, which is not a thing that happens to the person holding the
       telephone: they are still on the call until the answer lands, so it folds
       into the middle one rather than being a fourth pill saying nothing. */
    expect(TOUR_CALL_STRIP).toEqual(["Marcando", "En llamada", "Termino"]);

    expect(stripIndexOf("initiated")).toBe(0);
    expect(stripIndexOf("in-progress")).toBe(1);
    expect(stripIndexOf("processing")).toBe(1);
    expect(stripIndexOf("done")).toBe(2);
  });

  test("a call that failed is off the strip rather than stuck on it", () => {
    /* The strip comes off and the sentence underneath says what happened to the
       payment, which is the only thing a visitor can act on. A fourth pill that
       said "No se pudo completar" would be a step of a call that never had one. */
    expect(stripIndexOf("failed")).toBeLessThan(0);
  });

  test("the strip never points past its own last state", () => {
    /* The guard on the renderer: every index it can be handed is inside the
       array it indexes, in both directions. */
    for (const status of statuses) {
      expect([status, stripIndexOf(status) < TOUR_CALL_STRIP.length]).toEqual([
        status,
        true,
      ]);
    }
  });
});

describe("the promise about how long it lasts", () => {
  test("the sentence is computed from the number the API sent", () => {
    expect(revertSentence(600_000)).toBe("Se revierte sola en 10 minutos.");
    expect(revertSentence(60_000)).toBe("Se revierte sola en 1 minuto.");
    expect(revertSentence(120_000)).toBe("Se revierte sola en 2 minutos.");
    expect(revertSentence(30_000)).toBe("Se revierte sola en 30 segundos.");
  });

  test("a server that does not revert says so instead of counting to nothing", () => {
    expect(revertSentence(0)).toContain("no la revierte sola");
    expect(revertSentence(-1)).toContain("no la revierte sola");
  });
});

describe("a refusal", () => {
  const failure = (
    status: number,
    extra: Partial<ApiFailure> = {},
  ): ApiFailure => ({
    status,
    message: `The API answered with status ${status}.`,
    ...extra,
  });

  test("403 says the calls are off, not that something broke", () => {
    expect(callProblem(failure(403))).toContain("apagadas");
  });

  test("422 sends the visitor to the script", () => {
    expect(callProblem(failure(422))).toContain("guion");
  });

  test("a 400 carries the API's own sentence", () => {
    const message = callProblem(
      failure(400, { message: "phone must be an E.164 telephone number" }),
    );

    expect(message).toContain("phone must be an E.164 telephone number");
  });

  test("anything else is reported as it came, and nothing is swallowed", () => {
    /* Every status this function has never heard of still reaches the screen as
       the API's own sentence. The alternative is a press that produced no
       request the visitor can see and no words either, which is exactly what
       this stop shipped with. */
    for (const status of [0, 404, 409, 500, 503]) {
      expect([
        status,
        callProblem(failure(status, { message: "nope" })),
      ]).toEqual([status, "nope"]);
    }
  });
});

describe("the words the owner hears", () => {
  const script = localScript(HERO);

  test("it names the line, the amount and four digits of the account", () => {
    const spoken = script.spoken.join(" ");

    expect(spoken).toContain(HERO.supplierName);
    expect(spoken).toContain("537,960.97");
    expect(spoken).toContain(HERO.accountLast4);
  });

  test("it never says a whole account number", () => {
    /* The same rule as the supplier's verification call: four digits are said
       and the other fourteen never leave the screen they are on. */
    const everything = [
      script.firstMessage,
      script.question,
      ...script.spoken,
    ].join(" ");

    expect(/\d{10,}/.test(everything)).toBe(false);
  });

  test("it asks one question and promises nothing", () => {
    expect(script.question).toContain("retenemos");
    expect(script.question).toContain("libera");

    for (const line of [
      script.firstMessage,
      script.question,
      ...script.spoken,
    ]) {
      expect([line, forbiddenVerdict(line)]).toEqual([line, null]);
    }
  });

  test("it falls back to a sentence about the account when there is no plaza", () => {
    const plain = localScript({ ...HERO, plazaNew: "", plazaUsual: "" });

    expect(plain.spoken.join(" ")).toContain(
      "no es la que esta empresa le ha pagado antes",
    );
    /* Either half missing is the same case: a comparison needs both sides. */
    expect(localScript({ ...HERO, plazaUsual: "" }).spoken.join(" ")).toContain(
      "no es la que esta empresa le ha pagado antes",
    );
  });

  test("it says it is an automated line before it asks anything", () => {
    /* `REQUIRED_DISCLOSURE` in `packages/voice/src/script.ts`, which
       `owner-script.test.ts` makes mandatory for the stored templates. The card
       says these are the words the owner hears, so the stand-in cannot open with
       words the real agent is forbidden to use. */
    expect(script.firstMessage).toContain("linea automatica");
  });

  test("it says it is an approximation, and the card says so too", () => {
    expect(LOCAL_SCRIPT_NOTE).toContain("Aproximacion");
    expect(LOCAL_SCRIPT_NOTE).toContain("servidor");
    expect(forbiddenVerdict(LOCAL_SCRIPT_NOTE)).toBeNull();
  });
});

describe("the two plazas", () => {
  test("two different cities are both named, which is the whole signal", () => {
    expect(localScript(MOVED).spoken.join(" ")).toContain(
      "se abrio en la plaza DISTRITO FEDERAL, y la de siempre esta en APODACA",
    );
  });

  test("one city is not a discrepancy, and is never read out twice", () => {
    /* The case the seeded run actually produces, and the one the rendering got
       wrong: one place printed as two, next to a telephone call that says it
       once. `plazasFor` in `packages/voice/src/owner-script.ts` already
       collapses it, so the screen says the same thing the telephone does. */
    const spoken = localScript(HERO).spoken.join(" ");

    expect(spoken).toContain("esa misma plaza");
    expect(spoken.match(/APODACA/g)).toHaveLength(1);
  });

  test("nothing to compare says nothing rather than half a comparison", () => {
    /* Either half missing is the same case, and the sentence then says the
       account is simply not one this company has paid before. */
    for (const hero of [
      { ...HERO, plazaUsual: "" },
      { ...HERO, plazaNew: "", plazaUsual: "" },
    ]) {
      expect(localScript(hero).spoken.join(" ")).toContain(
        "no es la que esta empresa le ha pagado antes",
      );
    }
  });

  test("the fixture is a hero a real payload can carry", () => {
    /* The offline hero is derived by the same rule the API applies and in the
       same shape, so pinning the fixture to it is what keeps this file from
       testing a payload no endpoint answers. */
    expect(HERO).toEqual(heroOf(mockRun()) as TourHero);

    /* Plain place names on both, per `plazasOf` in `apps/api/src/routes/tour.ts`:
       the call says them out loud, and "580 APODACA" would be read as a code. */
    for (const hero of [HERO, MOVED]) {
      expect(hero.plazaNew).toMatch(/^[A-Z ]+$/);
      expect(hero.plazaUsual).toMatch(/^[A-Z ]+$/);
    }
  });
});

describe("the copy of the form", () => {
  test("the consent is one line, and it is the thing being consented to", () => {
    /* One call, to this number, because that is what the box authorises. It is
       one line on purpose: it sits beside the button, and the paragraph it used
       to be is a paragraph nobody reads before pressing. */
    expect(CONSENT_TEXT).toContain("una vez");
    expect(CONSENT_TEXT).toContain("llame");
    expect(CONSENT_TEXT.split(" ")).toHaveLength(10);
    expect(forbiddenVerdict(CONSENT_TEXT)).toBeNull();
  });

  test("the button says who the visitor is about to be", () => {
    expect(CALL_BUTTON).toContain("dueno");
  });
});
