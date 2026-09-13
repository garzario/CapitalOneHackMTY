/**
 * Reading an instruction out of what the owner actually said.
 *
 * `outcome.ts` reads a supplier answering whether an account is theirs. This
 * reads the owner of the company answering what to do with a payment the control
 * stopped, which is a different question with a different vocabulary: the
 * supplier says "es nuestra", the owner says "reténla".
 *
 * It is the same machinery on purpose, imported and not copied: `sentencesOf`
 * and `matchAt` come from next door, and so do the voicemail phrases, the
 * uncertainty phrases and the negation words. A second copy of any
 * of them would be the one place where two parsers disagree about a voicemail.
 * And it is a parser and not a model, for the three reasons that file gives:
 * `docs/06-regulatory-privacy.md` keeps an LLM out of the per-transaction path, a
 * judge can predict this file's answer on any sentence, and the same transcript
 * has to give the same outcome in a rehearsal and in the demo ten minutes later.
 *
 * How it reads a call:
 *
 * 1. Only what the person who answered said counts. The agent's own turns carry
 *    the question, which names both actions, so scoring them would make every
 *    call whichever action the question mentions first.
 * 2. Each turn is cut into sentences and each sentence into comma-separated
 *    clauses. The comma is load-bearing here too: "no, libérala" is two clauses
 *    and "no la liberes" is one, and they mean opposite things.
 * 3. Each clause is classified and the strongest class anywhere in the call wins:
 *    hold, then uncertainty, then release.
 *
 * That order is the cost asymmetry of this product, written down again. A false
 * `release` sends money that a SPEI will never bring back. A false `hold` or
 * `unclear` leaves the payment exactly where the control already put it and costs
 * somebody a telephone call. So a hold anywhere outranks a release everywhere.
 *
 * Two rules are worth stating because they decide the call:
 *
 * - **A bare "sí" or "ok" is not a release.** The question offers two actions and
 *   asks for one of them in words. A monosyllable answers neither, and the line
 *   asks once more rather than reading agreement into it.
 * - **A negation flips the verb.** "No lo retengas" is a release and "no la
 *   liberes" is a hold, which is why the phrase lists carry plain verbs and the
 *   negation is read separately. An intervening pronoun is skipped, so "no me la
 *   retengas" is read the same way as "no la retengas".
 */

import type { OwnerOutcome } from "@hackmty/core";
import {
  matchAt,
  NEGATION_WORDS,
  type Sentence,
  sentencesOf,
  UNSURE_PHRASES,
  VOICEMAIL_PHRASES,
} from "./outcome";

export interface OwnerReading {
  outcome: OwnerOutcome;
  /**
   * The sentence the outcome was read from, quoted exactly as it was spoken,
   * accents and all. Absent only when nobody said anything.
   */
  evidence?: string;
  /** Which phrase matched, so the screen can say why. Normalised form. */
  matched?: string;
}

/**
 * The owner says the payment does not go out.
 *
 * Written folded, like every list in `outcome.ts`: "reténla" and "retenla" are
 * the same string once the accents are gone, so each spelling appears once.
 * Three families are in here for reasons worth naming. The usted forms
 * ("reténgala", "espere") are here because this call is in usted and the owner
 * answers it the same way. The infinitive with a pronoun attached
 * ("retenerla") is a separate entry because `matchAt` is a whole-word match and
 * "retener" does not match inside it. And the phrases that carry their own
 * negation ("que no salga", "no la liberes") are never flipped by the negation
 * rule below, because the negation is the phrase.
 */
export const HOLD_PHRASES = [
  "retenlo",
  "retenla",
  "retengalo",
  "retengala",
  "retengas",
  "retengan",
  "retenemos",
  "retenerlo",
  "retenerla",
  "retener",
  "que no salga",
  "no lo mandes",
  "no la mandes",
  "no lo manden",
  "no la manden",
  "no lo envies",
  "no la envies",
  "no se envie",
  "detenlo",
  "detenla",
  "detengalo",
  "detengala",
  "parenlo",
  "parala",
  "espera",
  "espere",
  "esperen",
  "no lo pagues",
  "no lo paguen",
  "no lo liberes",
  "no la liberes",
  "mejor no",
  "bloquealo",
  "bloqueala",
  "cancelalo",
  "cancelala",
];

/**
 * The owner says the payment goes out, under their name.
 *
 * "Bajo mi nombre" and the three forms of "autorizo" are in here because that is
 * what the question asks for: a release over a finding is the owner's exception
 * and it is recorded with their name and their words against it.
 *
 * "Está bien, mándalo" is deliberately NOT an entry. The comma splits it into two
 * clauses before anything is matched, so a phrase containing one could never fire;
 * "mandalo" is the clause that carries the instruction and it is here on its own.
 */
export const RELEASE_PHRASES = [
  "liberalo",
  "liberala",
  "liberelo",
  "liberela",
  "liberenlo",
  "liberenla",
  "liberarlo",
  "liberarla",
  "liberar",
  "que salga",
  "dejalo pasar",
  "dejala pasar",
  "mandalo",
  "mandala",
  "envialo",
  "enviala",
  "paguenlo",
  "paguenla",
  "pagalo",
  "pagala",
  "adelante",
  "procede",
  "procedan",
  "bajo mi nombre",
  "lo autorizo",
  "la autorizo",
  "autorizado",
];

/**
 * The owner spoke and did not answer.
 *
 * The shared list plus four of this call's own. "Déjame ver" and "luego te digo"
 * are what a person says when they are not at their desk, and "después" is the
 * shortest way of saying not now. None of them applies anything.
 */
export const OWNER_UNSURE_PHRASES = [
  ...UNSURE_PHRASES,
  "dejame ver",
  "dejeme ver",
  "luego te digo",
  "luego le digo",
  "despues",
];

/**
 * Pronouns a negation may hide behind.
 *
 * "No lo retengas" puts one between the negation and the verb, so a rule that
 * only read the word immediately before the phrase would call it a hold, which is
 * the opposite of what was said. They are skipped rather than stripped, so "mejor
 * lo retenemos" is still a hold: what matters is the first word that is not a
 * pronoun.
 */
const PRONOUNS = [
  "lo",
  "la",
  "los",
  "las",
  "le",
  "les",
  "se",
  "me",
  "nos",
  "te",
];

type OwnerClass = "voicemail" | "hold" | "unsure" | "release";

/** Strongest first. The first class present anywhere in the call is the answer. */
const PRECEDENCE: OwnerClass[] = ["hold", "unsure", "release"];

/** Only the `folded` half of a clause is ever matched against. */
interface FoldedClause {
  folded: string;
}

function firstMatch(
  folded: string,
  phrases: readonly string[],
): string | undefined {
  return phrases.find((phrase) => matchAt(folded, phrase) !== -1);
}

/** A phrase that carries its own negation is never flipped by one. */
function carriesNegation(phrase: string): boolean {
  return phrase.split(" ").some((word) => NEGATION_WORDS.includes(word));
}

/**
 * Is the phrase at `at` negated by a word before it, pronouns skipped?
 *
 * Only the words between the start of the clause and the phrase are read, so
 * "no, libérala" can never reach here: the comma already split it into two
 * clauses and the negation is in the other one.
 */
function negatedBefore(folded: string, at: number): boolean {
  const words = folded
    .slice(0, at)
    .trim()
    .split(" ")
    .filter((word) => word !== "");

  for (let index = words.length - 1; index >= 0; index -= 1) {
    const word = words[index] ?? "";
    if (NEGATION_WORDS.includes(word)) {
      return true;
    }
    if (PRONOUNS.includes(word)) {
      continue;
    }
    return false;
  }

  return false;
}

/**
 * Classifies one clause.
 *
 * Voicemail first, because a recorded greeting is a cooperative sounding
 * sentence that would otherwise be scored. Then the holds, and that is the one
 * place this file departs from `outcome.ts`, which checks its uncertainty list
 * first: "no se envíe" is a hold here and the shared list's "no se" would
 * swallow it. The departure costs nothing, because both classes leave the
 * payment exactly where the control put it and the ledger quotes the sentence
 * either way.
 */
export function classifyOwnerClause(
  clause: FoldedClause,
): { klass: OwnerClass; matched: string } | undefined {
  const voicemail = firstMatch(clause.folded, VOICEMAIL_PHRASES);
  if (voicemail !== undefined) {
    return { klass: "voicemail", matched: voicemail };
  }

  for (const phrase of HOLD_PHRASES) {
    const at = matchAt(clause.folded, phrase);
    if (at === -1) {
      continue;
    }
    if (carriesNegation(phrase) || !negatedBefore(clause.folded, at)) {
      return { klass: "hold", matched: phrase };
    }

    /* "No lo retengas" is the owner refusing the hold, which is a release. It is
       reported with the negation in the matched phrase so the screen can show
       the reason rather than a verb that was never said on its own. */
    return { klass: "release", matched: `no ${phrase}` };
  }

  const unsure = firstMatch(clause.folded, OWNER_UNSURE_PHRASES);
  if (unsure !== undefined) {
    return { klass: "unsure", matched: unsure };
  }

  for (const phrase of RELEASE_PHRASES) {
    const at = matchAt(clause.folded, phrase);
    if (at === -1) {
      continue;
    }

    return carriesNegation(phrase) || !negatedBefore(clause.folded, at)
      ? { klass: "release", matched: phrase }
      : { klass: "hold", matched: `no ${phrase}` };
  }

  return undefined;
}

/** The strongest class any clause of the sentence carries. */
export function classifyOwnerSentence(
  sentence: Sentence,
): { klass: OwnerClass; matched: string } | undefined {
  const hits = sentence.clauses
    .map((clause) => classifyOwnerClause(clause))
    .filter(
      (hit): hit is { klass: OwnerClass; matched: string } => hit !== undefined,
    );

  for (const klass of [...PRECEDENCE, "voicemail" as const]) {
    const hit = hits.find((row) => row.klass === klass);
    if (hit !== undefined) {
      return hit;
    }
  }

  return undefined;
}

/**
 * Turns a transcript into one of the four outcomes, with the sentence it was read
 * from.
 *
 * A transcript with nobody but the agent in it is `no_answer`, and so is one
 * whose only human content is a voicemail greeting. Somebody who spoke and
 * matched nothing is `unclear` with their last sentence quoted, which is what the
 * screen needs in order to say why nothing was applied.
 *
 * The role filter reads `supplier`, which is the provider's `user` turn as
 * `toTranscript` in `client.ts` renames it. On this call that person is the owner
 * and not a supplier; the domain has two roles for a two-sided call and inventing
 * a third would change every stored transcript to describe one line.
 */
export function parseOwnerOutcome(
  transcript: readonly { role: "agent" | "supplier"; text: string }[],
): OwnerReading {
  const sentences = transcript
    .filter((turn) => turn.role === "supplier")
    .flatMap((turn) => sentencesOf(turn.text));

  if (sentences.length === 0) {
    return { outcome: "no_answer" };
  }

  /** Every sentence scored once, so precedence is a lookup and not a rescan. */
  const scored = sentences.map((sentence) => ({
    sentence,
    hit: classifyOwnerSentence(sentence),
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

  /* Somebody spoke and said none of the three things. The last sentence is the
     quote, because that is the one a person would ask about. */
  const last = scored[scored.length - 1];

  return last === undefined
    ? { outcome: "no_answer" }
    : { outcome: "unclear", evidence: last.sentence.text };
}

function outcomeOf(klass: OwnerClass): OwnerOutcome {
  switch (klass) {
    case "hold":
      return "hold";
    case "unsure":
      return "unclear";
    case "voicemail":
      return "no_answer";
    case "release":
      return "release";
  }
}
