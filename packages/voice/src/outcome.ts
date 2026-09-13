/**
 * Reading an outcome out of what the supplier actually said.
 *
 * This is a deterministic parser and not a model, for three reasons that all
 * point the same way. docs/06-regulatory-privacy.md keeps an LLM out of the
 * per-transaction path. A judge can read this file and predict its answer on any
 * sentence, which is not true of a prompt. And the same transcript has to give
 * the same outcome in a rehearsal and in the demo ten minutes later.
 *
 * How it reads a call:
 *
 * 1. Only what the supplier said counts. The agent's own turns carry the
 *    question and the words "confirme" and "cuenta", so scoring them would make
 *    every call a confirmation.
 * 2. Each turn is cut into sentences, and each sentence into comma-separated
 *    clauses. The comma matters: "no, es correcta" is two clauses and "no es
 *    correcta" is one, and they mean opposite things. Matching happens on the
 *    clause; the quote handed back to the clerk is the whole sentence.
 * 3. Each clause is classified in a fixed order, and the strongest class found
 *    anywhere in the call wins: denial, then uncertainty, then confirmation.
 *
 * That order is the cost asymmetry, written down. A false `confirmed` releases
 * money that a SPEI will never bring back. A false `denied` or `unclear` costs a
 * clerk a phone call. So a denial anywhere outranks a confirmation everywhere,
 * and "no estoy seguro" outranks a "si" said earlier in the same call.
 *
 * The one rule that surprises people: a bare "si" is NOT a confirmation. The
 * agent's first question is whether it is speaking to the supplier at all, and
 * the "si" that answers it must never be counted as agreement about a bank
 * account. A confirmation needs a verb or an object: "si es correcta", "asi es",
 * "confirmo", "es nuestra cuenta".
 */

import type { VerificationOutcome, VerificationTurn } from "@hackmty/core";

export interface OutcomeReading {
  outcome: VerificationOutcome;
  /**
   * The sentence the outcome was read from, quoted from the transcript exactly
   * as it was spoken, accents and all. Absent only when nobody said anything.
   */
  evidence?: string;
  /** Which phrase matched, so the evidence chip can say why. Normalised form. */
  matched?: string;
}

/**
 * Folds accents, case and whitespace so one spelling of a phrase matches every
 * spelling a speech to text engine might produce.
 */
export function fold(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Nobody picked up, or a machine did. Checked first, because a voicemail
 * greeting is a cooperative sounding sentence that would otherwise be scored.
 */
const VOICEMAIL = [
  "buzon de voz",
  "deje su mensaje",
  "despues del tono",
  "no esta disponible",
  "el numero que usted marco",
  "fuera del area de servicio",
  "apagado o fuera de",
  "no puede contestar",
  "contestadora",
];

/**
 * The supplier says the account is not theirs, or that they sent nothing.
 *
 * Every phrase here is a denial on its own, independent of any negation before
 * it. Negated confirmations are handled separately, by NEGATIONS below, so this
 * list does not have to enumerate "no es correcta", "no es correcto" and the
 * rest of that family.
 */
const DENIALS = [
  "no reconozco",
  "no la reconozco",
  "no lo reconozco",
  "no es de nosotros",
  "no somos nosotros",
  "no fuimos nosotros",
  "no fuimos",
  "no enviamos",
  "no mandamos",
  "no solicitamos",
  "no pedimos",
  "no autorizamos",
  "no cambiamos de cuenta",
  "no hemos cambiado",
  "nunca cambiamos",
  "seguimos con la misma cuenta",
  "la misma cuenta de siempre",
  "la cuenta de siempre",
  "no tenemos cuenta en",
  "no trabajamos con ese banco",
  "esa no es",
  "esa cuenta no",
  "es un fraude",
  "nos estan suplantando",
  "alguien se hizo pasar",
];

/**
 * The supplier spoke and did not answer. Checked before the denials so that
 * "no se" and "no estoy seguro" are never read as a refusal, and before the
 * confirmations so that an earlier "si" cannot outvote a later doubt.
 */
const UNSURE = [
  "no estoy seguro",
  "no estoy segura",
  "no se",
  "no sabria",
  "no tengo idea",
  "no me consta",
  "tengo que revisar",
  "tengo que preguntar",
  "dejeme revisar",
  "dejame revisar",
  "hay que revisar",
  "lo checo",
  "lo reviso",
  "no soy yo",
  "no me corresponde",
  "quien habla",
  "de parte de quien",
  "no entiendo",
  "puede repetir",
  "mas tarde",
  "le marco",
  "ahorita no puedo",
  "estoy manejando",
  "mande",
];

/**
 * The supplier says the account is theirs.
 *
 * Each of these carries a verb or an object. "si" alone is deliberately absent,
 * and so is "ok", for the reason in the file header.
 *
 * Two of them were added from live calls of 2026-09-13 rather than from a list
 * somebody imagined. `conv_7801m2cw1wxve2kv9yf768p3600f` answered the new
 * question with "Sí, es mía", which this parser read as `unclear`, and a call
 * where the supplier plainly confirmed and the ledger says unclear costs the
 * clerk the telephone call the control just made. "La cambiamos" is the other
 * half of the same question, which asks about the change as well as the digits.
 * Both are safe against the negation rule below: "no la cambiamos" and "no es
 * mía" put a negation immediately in front of the phrase and come back denials.
 */
const CONFIRMATIONS = [
  "confirmo",
  "confirmado",
  "la confirmo",
  "lo confirmo",
  "es correcta",
  "es correcto",
  "correcto",
  "asi es",
  "es la nuestra",
  "es nuestra",
  "es nuestro",
  "es mi cuenta",
  "es mia",
  "es de nosotros",
  "somos nosotros",
  "esa es",
  "si cambiamos",
  "si la cambiamos",
  "la cambiamos",
  "cambiamos de cuenta",
  "cambiamos de banco",
  "la abrimos",
  "esa usamos",
  "si es",
];

/** A negation immediately before a confirmation turns it into a denial. */
const NEGATIONS = ["no", "nunca", "jamas", "tampoco", "ni"];

type Class = "voicemail" | "denial" | "unsure" | "confirmation";

/** Strongest first. The first class present anywhere in the call is the answer. */
const PRECEDENCE: Class[] = ["denial", "unsure", "confirmation"];

interface Clause {
  /** Folded, for matching. */
  folded: string;
}

export interface Sentence {
  /** As spoken, punctuation and accents intact. This is what gets quoted. */
  text: string;
  /** The pieces a comma separates, which is where matching happens. */
  clauses: Clause[];
}

const SENTENCE_BREAKS = /[.;!?\n\r]+/;
const CLAUSE_BREAKS = /[,:]+/;

/**
 * Cuts one turn into sentences, and each sentence into clauses.
 *
 * Two levels, because they answer two different questions. Matching happens on
 * clauses, so that "no, es correcta" and "no es correcta" are told apart: a
 * comma is the only thing separating agreement from refusal there. Quoting
 * happens on sentences, because a clerk reading "es correcta" out of context
 * learns nothing and "Si, es correcta, esa cuenta la abrimos en marzo" is the
 * evidence they can act on.
 */
export function sentencesOf(text: string): Sentence[] {
  return text
    .split(SENTENCE_BREAKS)
    .map((part) => part.trim())
    .filter((part) => part !== "")
    .map((part) => ({
      text: part,
      clauses: part
        .split(CLAUSE_BREAKS)
        .map((piece) => piece.trim())
        .filter((piece) => piece !== "")
        .map((piece) => ({ folded: fold(piece) })),
    }));
}

const WORD = /[a-z0-9]/;

/**
 * Where `phrase` first appears in `folded` on whole-word boundaries, or -1.
 *
 * Boundaries are checked rather than a bare `indexOf` so that "ni" does not
 * match inside "ninguna" and "no" does not match inside "nosotros". Every
 * occurrence is scanned, not only the first, so a phrase that appears once
 * inside a longer word and once on its own is still found.
 */
export function matchAt(folded: string, phrase: string): number {
  let from = 0;

  while (from <= folded.length) {
    const at = folded.indexOf(phrase, from);
    if (at === -1) {
      return -1;
    }

    const before = at === 0 ? " " : (folded[at - 1] ?? " ");
    const afterIndex = at + phrase.length;
    const after =
      afterIndex >= folded.length ? " " : (folded[afterIndex] ?? " ");

    if (!WORD.test(before) && !WORD.test(after)) {
      return at;
    }
    from = at + 1;
  }

  return -1;
}

function contains(folded: string, phrase: string): boolean {
  return matchAt(folded, phrase) !== -1;
}

function firstMatch(
  folded: string,
  phrases: readonly string[],
): string | undefined {
  return phrases.find((phrase) => contains(folded, phrase));
}

/**
 * Is the confirmation at `at` negated by a word right before it?
 *
 * Only the words between the start of the clause and the phrase are considered,
 * and only the last of them, so "no es correcta" is a denial while "no, es
 * correcta" cannot reach here at all: the comma already split it.
 */
function negatedAt(folded: string, at: number): boolean {
  const before = folded.slice(0, at).trim();
  if (before === "") {
    return false;
  }

  const words = before.split(" ");
  const last = words[words.length - 1] ?? "";

  return NEGATIONS.includes(last);
}

/** Classifies one clause, in the order the file header describes. */
export function classifyClause(
  clause: Clause,
): { klass: Class; matched: string } | undefined {
  const voicemail = firstMatch(clause.folded, VOICEMAIL);
  if (voicemail !== undefined) {
    return { klass: "voicemail", matched: voicemail };
  }

  const unsure = firstMatch(clause.folded, UNSURE);
  if (unsure !== undefined) {
    return { klass: "unsure", matched: unsure };
  }

  const denial = firstMatch(clause.folded, DENIALS);
  if (denial !== undefined) {
    return { klass: "denial", matched: denial };
  }

  for (const phrase of CONFIRMATIONS) {
    const at = matchAt(clause.folded, phrase);
    if (at === -1) {
      continue;
    }

    return negatedAt(clause.folded, at)
      ? { klass: "denial", matched: `no ${phrase}` }
      : { klass: "confirmation", matched: phrase };
  }

  return undefined;
}

/**
 * Turns a transcript into one of the four outcomes, with the sentence it was
 * read from.
 *
 * A transcript with no supplier speech at all is `no_answer`, and so is one
 * whose only supplier content is a voicemail greeting. A supplier who spoke and
 * matched nothing is `unclear` with their last sentence as the evidence, which
 * is what the clerk needs to see to decide whether to call again.
 */
export function parseVerificationOutcome(
  transcript: readonly VerificationTurn[],
): OutcomeReading {
  const sentences = transcript
    .filter((turn) => turn.role === "supplier")
    .flatMap((turn) => sentencesOf(turn.text));

  if (sentences.length === 0) {
    return { outcome: "no_answer" };
  }

  /** Every sentence scored once, so precedence is a lookup and not a rescan. */
  const scored = sentences.map((sentence) => ({
    sentence,
    hit: classifySentence(sentence),
  }));

  for (const klass of [...PRECEDENCE, "voicemail" as const]) {
    const found = scored.find((row) => row.hit?.klass === klass);
    if (found?.hit !== undefined) {
      return {
        outcome: outcomeOf(klass),
        evidence: found.sentence.text,
        matched: found.hit.matched,
      };
    }
  }

  /* Somebody spoke and said none of the four things. The last sentence is the
     quote, because that is the one the clerk would ask about. */
  const last = scored[scored.length - 1];

  return last === undefined
    ? { outcome: "no_answer" }
    : { outcome: "unclear", evidence: last.sentence.text };
}

/** The strongest class any clause of the sentence carries. */
export function classifySentence(
  sentence: Sentence,
): { klass: Class; matched: string } | undefined {
  const hits = sentence.clauses
    .map((clause) => classifyClause(clause))
    .filter(
      (hit): hit is { klass: Class; matched: string } => hit !== undefined,
    );

  for (const klass of [...PRECEDENCE, "voicemail" as const]) {
    const hit = hits.find((row) => row.klass === klass);
    if (hit !== undefined) {
      return hit;
    }
  }

  return undefined;
}

function outcomeOf(klass: Class): VerificationOutcome {
  switch (klass) {
    case "denial":
      return "denied";
    case "unsure":
      return "unclear";
    case "voicemail":
      return "no_answer";
    case "confirmation":
      return "confirmed";
  }
}
