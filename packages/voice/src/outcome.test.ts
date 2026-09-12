import { describe, expect, test } from "bun:test";
import type { VerificationTurn } from "@hackmty/core";
import {
  TRANSCRIPT_BARE_SI,
  TRANSCRIPT_CONFIRMED,
  TRANSCRIPT_DENIED,
  TRANSCRIPT_SI_THEN_DENIED,
  TRANSCRIPT_SILENT,
  TRANSCRIPT_UNSURE,
  TRANSCRIPT_VOICEMAIL,
} from "./fixtures";
import {
  fold,
  matchAt,
  parseVerificationOutcome,
  sentencesOf,
} from "./outcome";

/** One supplier turn, which is all most of these cases need. */
function said(text: string): VerificationTurn[] {
  return [
    { role: "agent", text: "Esa cuenta es de ustedes? Si o no?" },
    { role: "supplier", text },
  ];
}

function outcomeOf(text: string) {
  return parseVerificationOutcome(said(text)).outcome;
}

describe("fold", () => {
  test("removes accents, case and repeated whitespace", () => {
    expect(fold("  Sí,  ESA   es Nuestra Cuenta ")).toBe(
      "si, esa es nuestra cuenta",
    );
    expect(fold("Déjeme revisar")).toBe("dejeme revisar");
    expect(fold("NÚMERO")).toBe("numero");
  });
});

describe("matchAt", () => {
  test("matches on word boundaries and not inside a longer word", () => {
    expect(matchAt("no somos nosotros", "no")).toBe(0);
    /* "no" lives inside "nosotros"; the second occurrence is not a word. */
    expect(matchAt("nosotros pagamos", "no")).toBe(-1);
    expect(matchAt("ninguna de las dos", "ni")).toBe(-1);
  });

  test("keeps scanning past an occurrence that is not a word", () => {
    expect(matchAt("nosotros no enviamos", "no")).toBe(9);
  });
});

describe("sentencesOf", () => {
  test("splits on sentence marks and keeps the spoken text for the quote", () => {
    const sentences = sentencesOf("Si, es correcta. La abrimos en marzo!");

    expect(sentences.map((s) => s.text)).toEqual([
      "Si, es correcta",
      "La abrimos en marzo",
    ]);
    expect(sentences[0]?.clauses.map((c) => c.folded)).toEqual([
      "si",
      "es correcta",
    ]);
  });

  test("drops empty pieces so silence is never a clause", () => {
    expect(sentencesOf("   ")).toEqual([]);
    expect(sentencesOf("...")).toEqual([]);
  });
});

describe("parseVerificationOutcome, fixture calls", () => {
  test("confirmed: the supplier says the account is correct", () => {
    const reading = parseVerificationOutcome(TRANSCRIPT_CONFIRMED);

    expect(reading.outcome).toBe("confirmed");
    expect(reading.evidence).toBe(
      "Sí, es correcta, esa cuenta la abrimos en marzo",
    );
    expect(reading.matched).toBe("es correcta");
  });

  test("denied: the supplier says the account is not theirs", () => {
    const reading = parseVerificationOutcome(TRANSCRIPT_DENIED);

    expect(reading.outcome).toBe("denied");
    expect(reading.evidence).toBe("No, esa cuenta no es nuestra");
  });

  test("no_answer: a machine answered", () => {
    const reading = parseVerificationOutcome(TRANSCRIPT_VOICEMAIL);

    expect(reading.outcome).toBe("no_answer");
    expect(reading.matched).toBe("no esta disponible");
    expect(reading.evidence).toBe(
      "El número que usted marcó no está disponible",
    );
  });

  test("no_answer: nobody said anything at all", () => {
    const reading = parseVerificationOutcome(TRANSCRIPT_SILENT);

    expect(reading.outcome).toBe("no_answer");
    expect(reading.evidence).toBeUndefined();
  });

  test("unclear: whoever answered does not know", () => {
    const reading = parseVerificationOutcome(TRANSCRIPT_UNSURE);

    expect(reading.outcome).toBe("unclear");
    expect(reading.matched).toBe("no estoy seguro");
  });
});

describe("parseVerificationOutcome, the cases that decide the control", () => {
  /**
   * The expensive regression. The agent's first question is "am I speaking to
   * the supplier", so the "si" that answers it is about identity, never about a
   * bank account.
   */
  test("a bare si is not a confirmation", () => {
    expect(parseVerificationOutcome(TRANSCRIPT_BARE_SI).outcome).toBe(
      "unclear",
    );
    expect(outcomeOf("Si")).toBe("unclear");
    expect(outcomeOf("Aja")).toBe("unclear");
    expect(outcomeOf("Ok")).toBe("unclear");
  });

  test("a si early in the call never outvotes a denial later", () => {
    expect(parseVerificationOutcome(TRANSCRIPT_SI_THEN_DENIED).outcome).toBe(
      "denied",
    );
  });

  test("a comma is what separates agreement from refusal", () => {
    expect(outcomeOf("No es correcta")).toBe("denied");
    expect(outcomeOf("No, es correcta")).toBe("confirmed");
  });

  test("a negation before a confirmation turns it into a denial", () => {
    expect(outcomeOf("Esa no es nuestra cuenta")).toBe("denied");
    expect(outcomeOf("Nunca cambiamos de cuenta")).toBe("denied");
    expect(outcomeOf("Esa es nuestra cuenta")).toBe("confirmed");
  });

  test("uncertainty is never rounded to a denial", () => {
    expect(outcomeOf("No se, tendria que revisar")).toBe("unclear");
    expect(outcomeOf("No estoy segura, eso lo ve contabilidad")).toBe(
      "unclear",
    );
    expect(outcomeOf("Quien habla?")).toBe("unclear");
  });

  test("uncertainty outranks a confirmation said earlier", () => {
    expect(outcomeOf("Si es nuestra. Bueno, no estoy seguro")).toBe("unclear");
  });

  test("a denial outranks everything, wherever it is said", () => {
    expect(outcomeOf("Si es correcta. Ah no, espere, no es nuestra")).toBe(
      "denied",
    );
  });

  test("reads the accented spelling a transcription actually returns", () => {
    expect(outcomeOf("Sí, así es")).toBe("confirmed");
    expect(outcomeOf("No la reconozco")).toBe("denied");
  });

  test("only the supplier is scored, never the agent", () => {
    const agentOnly: VerificationTurn[] = [
      { role: "agent", text: "Confirmo que la cuenta es correcta." },
    ];

    expect(parseVerificationOutcome(agentOnly).outcome).toBe("no_answer");
  });

  test("an empty transcript is no_answer, not unclear", () => {
    expect(parseVerificationOutcome([]).outcome).toBe("no_answer");
  });

  test("quotes the last sentence when nothing matched", () => {
    const reading = parseVerificationOutcome(
      said("Bueno. Estamos en junta ahorita"),
    );

    expect(reading.outcome).toBe("unclear");
    expect(reading.evidence).toBe("Estamos en junta ahorita");
  });
});
