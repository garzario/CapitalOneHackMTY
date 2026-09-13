import { describe, expect, test } from "bun:test";
import type { VerificationTurn } from "@hackmty/core";
import { fold } from "./outcome";
import {
  OWNER_TRANSCRIPT_BARE_SI,
  OWNER_TRANSCRIPT_BUSY,
  OWNER_TRANSCRIPT_COMMA_HOLD,
  OWNER_TRANSCRIPT_COMMA_RELEASE,
  OWNER_TRANSCRIPT_HOLD,
  OWNER_TRANSCRIPT_HOLD_PLAIN,
  OWNER_TRANSCRIPT_HOLD_USTED,
  OWNER_TRANSCRIPT_NEGATED_HOLD,
  OWNER_TRANSCRIPT_NEGATED_RELEASE,
  OWNER_TRANSCRIPT_RELEASE,
  OWNER_TRANSCRIPT_RELEASE_THEN_HOLD,
  OWNER_TRANSCRIPT_RELEASE_UNDER_NAME,
  OWNER_TRANSCRIPT_SILENT,
  OWNER_TRANSCRIPT_UNSURE,
  OWNER_TRANSCRIPT_VOICEMAIL,
  OWNER_TRANSCRIPT_WRONG_PERSON,
} from "./owner-fixtures";
import {
  HOLD_PHRASES,
  parseOwnerOutcome,
  RELEASE_PHRASES,
} from "./owner-outcome";
import { OWNER_QUESTION } from "./owner-script";

/** One owner turn, which is all most of these cases need. */
function said(text: string): VerificationTurn[] {
  return [
    { role: "agent", text: OWNER_QUESTION },
    { role: "supplier", text },
  ];
}

function outcomeOf(text: string) {
  return parseOwnerOutcome(said(text)).outcome;
}

/**
 * The sixteen invented calls, each one read end to end.
 *
 * They are the cases a person actually produces on this question, which is why
 * they are fixtures rather than strings inside an assertion: the same transcripts
 * drive the route test in `apps/api`, so the parser and the endpoint cannot
 * disagree about what was said.
 */
describe("parseOwnerOutcome, the fixture calls", () => {
  test("hold: the owner retains the payment", () => {
    const reading = parseOwnerOutcome(OWNER_TRANSCRIPT_HOLD);

    expect(reading.outcome).toBe("hold");
    expect(reading.evidence).toBe(
      "No, reténla hasta que confirmemos con ellos",
    );
    expect(reading.matched).toBe("retenla");
  });

  test("hold: the phrase that carries its own negation", () => {
    const reading = parseOwnerOutcome(OWNER_TRANSCRIPT_HOLD_PLAIN);

    expect(reading.outcome).toBe("hold");
    expect(reading.matched).toBe("que no salga");
  });

  test("hold: the usted form, which is how this call is answered", () => {
    expect(parseOwnerOutcome(OWNER_TRANSCRIPT_HOLD_USTED).outcome).toBe("hold");
  });

  test("release: the owner releases it and names themselves", () => {
    const reading = parseOwnerOutcome(OWNER_TRANSCRIPT_RELEASE);

    expect(reading.outcome).toBe("release");
    expect(reading.evidence).toBe("Libérala, yo la autorizo");
    expect(reading.matched).toBe("liberala");
  });

  test("release: under their own name, which is what the question asks", () => {
    const reading = parseOwnerOutcome(OWNER_TRANSCRIPT_RELEASE_UNDER_NAME);

    expect(reading.outcome).toBe("release");
    expect(reading.matched).toBe("adelante");
  });

  test("no_answer: a machine answered", () => {
    const reading = parseOwnerOutcome(OWNER_TRANSCRIPT_VOICEMAIL);

    expect(reading.outcome).toBe("no_answer");
    expect(reading.matched).toBe("no esta disponible");
  });

  test("no_answer: nobody said anything at all", () => {
    const reading = parseOwnerOutcome(OWNER_TRANSCRIPT_SILENT);

    expect(reading.outcome).toBe("no_answer");
    expect(reading.evidence).toBeUndefined();
  });

  test("unclear: they are not at their desk", () => {
    const reading = parseOwnerOutcome(OWNER_TRANSCRIPT_UNSURE);

    expect(reading.outcome).toBe("unclear");
    expect(reading.matched).toBe("dejame ver");
  });

  test("unclear: they are driving", () => {
    expect(parseOwnerOutcome(OWNER_TRANSCRIPT_BUSY).outcome).toBe("unclear");
  });

  test("unclear: whoever picked up is not who was called", () => {
    expect(parseOwnerOutcome(OWNER_TRANSCRIPT_WRONG_PERSON).outcome).toBe(
      "unclear",
    );
  });
});

describe("parseOwnerOutcome, the cases that decide the call", () => {
  /**
   * The expensive regression, and the reason a monosyllable is refused. The
   * greeting asks whether it is speaking to the owner, so the "sí" that answers
   * it is about who picked up the telephone and never about a payment.
   */
  test("a bare si or ok is not a release", () => {
    expect(parseOwnerOutcome(OWNER_TRANSCRIPT_BARE_SI).outcome).toBe("unclear");
    expect(outcomeOf("Sí")).toBe("unclear");
    expect(outcomeOf("Ok")).toBe("unclear");
    expect(outcomeOf("Ajá")).toBe("unclear");
  });

  test("a release said first never outvotes a hold said later", () => {
    const reading = parseOwnerOutcome(OWNER_TRANSCRIPT_RELEASE_THEN_HOLD);

    expect(reading.outcome).toBe("hold");
    expect(reading.evidence).toBe("No, espérate, mejor reténla");
  });

  test("a comma is what separates the refusal from the instruction", () => {
    expect(parseOwnerOutcome(OWNER_TRANSCRIPT_COMMA_RELEASE).outcome).toBe(
      "release",
    );
    expect(parseOwnerOutcome(OWNER_TRANSCRIPT_COMMA_HOLD).outcome).toBe("hold");
  });

  test("a negated release is a hold", () => {
    expect(parseOwnerOutcome(OWNER_TRANSCRIPT_NEGATED_RELEASE).outcome).toBe(
      "hold",
    );
    expect(outcomeOf("No lo liberes")).toBe("hold");
    expect(outcomeOf("No lo pagues todavía")).toBe("hold");
  });

  test("a negated hold is a release, pronouns in the way included", () => {
    const reading = parseOwnerOutcome(OWNER_TRANSCRIPT_NEGATED_HOLD);

    expect(reading.outcome).toBe("release");
    expect(reading.matched).toBe("no retengas");
    expect(outcomeOf("No la retengas")).toBe("release");
    expect(outcomeOf("No me la retengas")).toBe("release");
  });

  test("uncertainty is never rounded to either action", () => {
    expect(outcomeOf("No sé, déjame ver")).toBe("unclear");
    expect(outcomeOf("Luego te digo")).toBe("unclear");
    expect(outcomeOf("Después te marco")).toBe("unclear");
  });

  test("a hold outranks a release wherever it is said", () => {
    expect(outcomeOf("Adelante. Ah no, espérame, deténla")).toBe("hold");
    expect(outcomeOf("Mándala... mejor no")).toBe("hold");
  });

  test("reads the accented spelling a transcription actually returns", () => {
    expect(outcomeOf("Reténla")).toBe("hold");
    expect(outcomeOf("Libérenla, ya lo revisé")).toBe("release");
    expect(outcomeOf("Bloquéala")).toBe("hold");
    expect(outcomeOf("Páguenla")).toBe("release");
  });

  test("reads the infinitive with the pronoun attached", () => {
    /* "Retener" is a whole-word match, so "retenerla" is its own entry: without
       it the commonest answer a person gives to this question reads unclear. */
    expect(outcomeOf("Mejor retenerla")).toBe("hold");
    expect(outcomeOf("Puedes liberarla")).toBe("release");
  });

  test("only the person who answered is scored, never the line", () => {
    const agentOnly: VerificationTurn[] = [
      { role: "agent", text: "¿La retenemos, o la libera bajo su nombre?" },
    ];

    expect(parseOwnerOutcome(agentOnly).outcome).toBe("no_answer");
  });

  test("an empty transcript is no_answer, not unclear", () => {
    expect(parseOwnerOutcome([]).outcome).toBe("no_answer");
  });

  test("quotes the last sentence when nothing matched", () => {
    const reading = parseOwnerOutcome(
      said("Bueno. Estamos en junta ahorita con el contador"),
    );

    expect(reading.outcome).toBe("unclear");
    expect(reading.evidence).toBe("Estamos en junta ahorita con el contador");
  });
});

describe("the phrase lists", () => {
  /**
   * Matching happens on folded text, so a list entry that still carries an accent
   * could never fire. This is the assertion that catches the next person adding
   * "reténla" to the list and watching the call read unclear.
   */
  test("are written folded, because that is what they are matched against", () => {
    for (const phrase of [...HOLD_PHRASES, ...RELEASE_PHRASES]) {
      expect(phrase).toBe(fold(phrase));
    }
  });

  /** One phrase cannot mean both things. */
  test("do not overlap", () => {
    const holds = new Set(HOLD_PHRASES);
    const both = RELEASE_PHRASES.filter((phrase) => holds.has(phrase));

    expect(both).toEqual([]);
  });

  /**
   * A clause never contains a comma, because `sentencesOf` splits on one before
   * anything is matched, so a phrase with a comma in it could never fire.
   */
  test("carry no comma, which a clause can never contain", () => {
    for (const phrase of [...HOLD_PHRASES, ...RELEASE_PHRASES]) {
      expect(phrase).not.toContain(",");
    }
  });
});
