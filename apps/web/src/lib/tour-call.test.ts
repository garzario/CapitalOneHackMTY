/**
 * The call that rings a visitor as the owner, tested where it can be tested
 * without a telephone.
 *
 * Four things in this file are worth a test and the rest is copy.
 *
 * **The number.** It is the one piece of personal data this product ever touches,
 * it is Mexican mobiles only, and the page has to refuse a bad one before the
 * request rather than render a `400` a visitor cannot act on. The same regular
 * expression the endpoint applies is applied here first, and `callBody` is the one
 * place that builds what is sent.
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
 * **What to say when the API refuses.** Three of the four refusals are not
 * failures, and the one that asks a visitor to wait has to say how long.
 */

import { describe, expect, test } from "bun:test";
import type { LedgerEvent } from "@hackmty/core";
import type { ApiFailure } from "./api";
import { forbiddenVerdict } from "./assistant";
import type { TourHero, TourOwnerOutcome } from "./contract";
import {
  CALL_BUTTON,
  CONSENT_TEXT,
  callBody,
  callProblem,
  formatPhone,
  isMexicanMobile,
  isPhoneComplete,
  isSettled,
  keepDigits,
  localScript,
  OUTCOME_SENTENCE,
  outcomeState,
  PHONE_DIGITS,
  phoneProblem,
  retryAfter,
  revertSentence,
  SIMULATED_EVIDENCE,
  stateFromEvent,
  stillHeld,
  TOUR_CALL_STATUS_LABEL,
  TOUR_CALL_STATUS_ORDER,
  tourCallFields,
} from "./tour-call";

const HERO: TourHero = {
  instructionId: "INS-2026-09-07-029",
  supplierRfc: "SYN980101S01",
  supplierName: "Aceros y Laminas del Norte SA de CV",
  amount: 537960.97,
  accountLast4: "9808",
  plazaNew: "180 DISTRITO FEDERAL",
  plazaUsual: "580 (APODACA, NL)",
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
  test("keeps ten digits out of whatever shape it was typed in", () => {
    expect(keepDigits("81 1234 5678")).toBe("8112345678");
    expect(keepDigits("(81) 1234-5678")).toBe("8112345678");
    expect(keepDigits("+52 81 1234 5678")).toBe("8112345678");
    /* Pasting a complete number with its country code must not cost the last two
       digits of the number, which is what a plain ten-character cut would do. */
    expect(keepDigits("528112345678")).toBe("8112345678");
    expect(keepDigits("81123456789999")).toHaveLength(PHONE_DIGITS);
  });

  test("a national number starting in 52 is not mistaken for a country code", () => {
    /* Ten digits are already national, so nothing is stripped: 52 is the area
       code of Zacatecas and of half a dozen other places. */
    expect(keepDigits("5212345678")).toBe("5212345678");
  });

  test("reads back grouped the way it is said out loud", () => {
    expect(formatPhone("8112345678")).toBe("81 1234 5678");
    expect(formatPhone("811")).toBe("81 1");
    expect(formatPhone("")).toBe("");
  });

  test("says what is missing instead of saying invalid", () => {
    expect(phoneProblem("")).toContain("10 digitos");
    expect(phoneProblem("811234567")).toBe(
      "Falta 1 digito: son 10 despues del +52.",
    );
    expect(phoneProblem("81123")).toBe(
      "Faltan 5 digitos: son 10 despues del +52.",
    );
    expect(phoneProblem("8112345678")).toBeNull();
    expect(isPhoneComplete("8112345678")).toBe(true);
    expect(isPhoneComplete("811234567")).toBe(false);
  });

  test("what is sent is E.164 and the consent is the literal true", () => {
    const body = callBody("81 1234 5678");

    expect(body).toEqual({ phone: "+528112345678", consent: true });
    expect(isMexicanMobile(body.phone)).toBe(true);
  });

  test("the rule is the endpoint's rule", () => {
    /* Same expression as `POST /api/v1/tour/call`: Mexico, ten digits, nothing
       else, unless the server was started with TOUR_ALLOW_ANY_COUNTRY. */
    expect(isMexicanMobile("+528112345678")).toBe(true);
    expect(isMexicanMobile("+5281123456")).toBe(false);
    expect(isMexicanMobile("+12025550123")).toBe(false);
    expect(isMexicanMobile("8112345678")).toBe(false);
    expect(isMexicanMobile("+52 81 1234 5678")).toBe(false);
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

  test("the strip is four steps and every status has a word", () => {
    expect(TOUR_CALL_STATUS_ORDER).toEqual([
      "initiated",
      "in-progress",
      "processing",
      "done",
    ]);

    for (const status of [...TOUR_CALL_STATUS_ORDER, "failed" as const]) {
      expect([status, TOUR_CALL_STATUS_LABEL[status].length > 3]).toEqual([
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

  test("429 says when to try again, from Retry-After", () => {
    expect(callProblem(failure(429, { retryAfterSeconds: 480 }))).toContain(
      "8 minutos",
    );
    expect(callProblem(failure(429, { retryAfterSeconds: 45 }))).toContain(
      "45 segundos",
    );
    /* A 429 with no header still has to say something a person can act on. */
    expect(callProblem(failure(429))).toContain("un rato");
  });

  test("the waiting sentence rounds up, because a wait cut short is a second 429", () => {
    expect(retryAfter(61)).toBe("Intenta de nuevo en 2 minutos.");
    expect(retryAfter(60)).toBe("Intenta de nuevo en 1 minuto.");
    expect(retryAfter(undefined)).toContain("un rato");
  });

  test("a 400 carries the API's own sentence", () => {
    const message = callProblem(
      failure(400, { message: "phone must be a Mexican mobile" }),
    );

    expect(message).toContain("phone must be a Mexican mobile");
  });

  test("anything else is reported as it came", () => {
    expect(
      callProblem(failure(0, { message: "The API is not reachable." })),
    ).toBe("The API is not reachable.");
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
  });
});

describe("the copy of the form", () => {
  test("the consent says what is kept and what is not", () => {
    expect(CONSENT_TEXT).toContain("una vez");
    expect(CONSENT_TEXT).toContain("No se guarda");
    expect(CONSENT_TEXT).toContain("hash con sal");
    expect(forbiddenVerdict(CONSENT_TEXT)).toBeNull();
  });

  test("the button says who the visitor is about to be", () => {
    expect(CALL_BUTTON).toContain("dueno");
  });
});
