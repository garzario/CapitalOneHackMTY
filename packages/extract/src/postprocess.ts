/**
 * Everything that happens after the model answers, as pure functions.
 *
 * This file is the reason the LLM boundary in ADR-0004 is a design and not a
 * promise. The model hands back characters. What survives from those characters
 * into `PaymentInstruction.clabe` is decided here, by a scan and by the same
 * 3-7-1 check digit the CLABE forensics detector uses, imported from
 * `@hackmty/core` rather than reimplemented, so there is exactly one definition
 * of what a CLABE is in this repository.
 *
 * Three jobs, in order:
 *
 * 1. **Find the 18-digit runs.** A handwritten account number arrives grouped,
 *    `058 580 0007 2345 6775`, and a voice note transcribed by a model arrives
 *    grouped too. Spaces and hyphens are formatting, so they are tolerated the
 *    same way `normalizeClabe` tolerates them.
 * 2. **Check the arithmetic.** The check digit is a closed calculation over the
 *    other seventeen digits, so it costs nothing, needs no history and catches
 *    every single-digit misreading.
 * 3. **Price the uncertainty.** The confidence that reaches
 *    `PaymentInstruction.ocrConfidence` starts at what the model said about its
 *    own reading and is then discounted by named, deterministic factors. The
 *    model's self-report is not a calibrated probability and is not treated as
 *    one: the check digit is the term that dominates, and it is ours.
 *
 * Nothing here decides anything. It produces digits and a number between 0 and
 * 1. The hold, verify or release is computed afterwards, by
 * `packages/core/src/decision.ts`, from findings that the detectors raise.
 */

import { clabeCheckDigit, normalizeClabe } from "@hackmty/core";

/** A CLABE is 18 digits. Repeated from core as a local readability alias. */
const CLABE_DIGITS = 18;

/** Beyond this many characters of model output, stop scanning. */
export const MAX_SCAN_LENGTH = 20_000;

/**
 * A run of digits, possibly broken up by spaces or hyphens, that ends on a
 * digit. `\d[\d\s-]*\d` is greedy on purpose: a CLABE written in groups is one
 * run, and so is an amount that happens to sit on the line above it. Splitting
 * the run into windows afterwards is what separates those two cases.
 */
const DIGIT_RUN = /\d[\d\s-]*\d|\d/g;

export interface ClabeCandidate {
  /** The eighteen digits, separators removed. */
  clabe: string;
  /** Index in the scanned text of the first digit, for an evidence chip. */
  index: number;
  /** The substring exactly as it was written, separators included. */
  raw: string;
  /** True when the digits arrived grouped rather than as one block. */
  separated: boolean;
  /** True when the 3-7-1 check digit closes. */
  checkDigitValid: boolean;
}

/**
 * Every 18-digit CLABE candidate in a piece of text, earliest first.
 *
 * The rule for a run longer than eighteen digits is the interesting one. Such a
 * run has several windows, and emitting all of them would bury the real account
 * in noise, so only the windows whose check digit closes are kept. A twenty four
 * digit run that is an amount followed by an account therefore yields exactly
 * the account, and a twenty four digit run that is a phone number followed by a
 * date yields nothing.
 *
 * A run of exactly eighteen digits is always emitted, valid or not, because
 * "these are the eighteen digits on the paper and the check digit fails" is the
 * single most useful thing this package can say.
 */
export function findClabeCandidates(text: string): ClabeCandidate[] {
  const scanned = text.slice(0, MAX_SCAN_LENGTH);
  const found = new Map<string, ClabeCandidate>();

  for (const match of scanned.matchAll(DIGIT_RUN)) {
    const run = match[0];
    const start = match.index;
    const digits: string[] = [];
    const offsets: number[] = [];
    for (let index = 0; index < run.length; index += 1) {
      const character = run[index];
      if (character >= "0" && character <= "9") {
        digits.push(character);
        offsets.push(start + index);
      }
    }

    const windows = digits.length - CLABE_DIGITS + 1;
    for (let first = 0; first < windows; first += 1) {
      const last = first + CLABE_DIGITS - 1;
      const clabe = digits.slice(first, last + 1).join("");
      const checkDigitValid = isCheckDigitValid(clabe);
      if (windows > 1 && !checkDigitValid) {
        continue;
      }
      if (found.has(clabe)) {
        continue;
      }
      const from = offsets[first];
      const to = offsets[last];
      const raw = scanned.slice(from, to + 1);
      found.set(clabe, {
        clabe,
        index: from,
        raw,
        separated: raw.length > CLABE_DIGITS,
        checkDigitValid,
      });
    }
  }

  return [...found.values()].sort((left, right) => left.index - right.index);
}

/** The 3-7-1 rule of `packages/core/src/clabe.ts`, applied to 18 digits. */
export function isCheckDigitValid(clabe: string): boolean {
  if (!/^\d{18}$/.test(clabe)) {
    return false;
  }
  return (
    clabeCheckDigit(clabe.slice(0, CLABE_DIGITS - 1)) === Number(clabe[17])
  );
}

/* -------------------------------------------------------------------------- */
/* Confidence                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Why the confidence is lower than the model's own self-report. Each one is a
 * fact about the digits, not an opinion, and each one has a test named after it.
 */
export type ConfidencePenalty =
  /** The 3-7-1 check digit does not close, so this account cannot exist. */
  | "check_digit_failed"
  /** More than one equally good candidate. We do not know which one was meant. */
  | "ambiguous_candidates"
  /** The digits are the model's field only; they are not in the transcription. */
  | "not_in_text"
  /** The transcription and the model's own field disagree about the account. */
  | "model_disagrees";

export const PENALTY_FACTORS: Readonly<Record<ConfidencePenalty, number>> = {
  // An invalid check digit is close to proof that the reading is wrong, so it
  // takes the confidence to a quarter rather than nudging it.
  check_digit_failed: 0.25,
  ambiguous_candidates: 0.5,
  not_in_text: 0.4,
  model_disagrees: 0.5,
};

/** Used when the model returns no self-report. Half, because we do not know. */
export const DEFAULT_CLARITY = 0.5;

/** Where the chosen digits came from. */
export type ClabeSource = "text" | "model" | "none";

export interface ClabeReading {
  /** The eighteen digits, or absent when the text carries no account number. */
  clabe?: string;
  source: ClabeSource;
  /** False when there is no CLABE at all, so a caller never reads it as proof. */
  checkDigitValid: boolean;
  candidates: ClabeCandidate[];
  /** The factors applied, in the order they were applied. */
  penalties: ConfidencePenalty[];
  /** What the model said about its own reading, clamped to 0 to 1. */
  clarity: number;
  /** `clarity` times the factors, rounded to three decimals. 0 with no CLABE. */
  confidence: number;
}

function clamp01(value: number | null | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DEFAULT_CLARITY;
  }
  return Math.min(1, Math.max(0, value));
}

/** Three decimals is more precision than a self-report deserves already. */
function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/**
 * Chooses the account number and prices the uncertainty around it.
 *
 * @param text What the model transcribed: the visible text of a photo, or the
 *   words of a voice note.
 * @param claimed The account number the model put in its own `clabe` field, if
 *   any. It is a hint, never the answer: the transcription wins whenever it
 *   carries a candidate, because the transcription is the thing a person can
 *   check against the original by eye.
 * @param clarity The model's self-report, 0 to 1.
 */
export function readClabeFromText(
  text: string,
  claimed?: string | null,
  clarity?: number | null,
): ClabeReading {
  const candidates = findClabeCandidates(text);
  const normalizedClaim =
    typeof claimed === "string" ? normalizeClabe(claimed) : "";
  const claim = /^\d{18}$/.test(normalizedClaim) ? normalizedClaim : undefined;
  const base = clamp01(clarity);

  if (candidates.length === 0 && claim === undefined) {
    return {
      source: "none",
      checkDigitValid: false,
      candidates,
      penalties: [],
      clarity: base,
      confidence: 0,
    };
  }

  const penalties: ConfidencePenalty[] = [];
  let clabe: string;
  let source: ClabeSource;

  if (candidates.length === 0 && claim !== undefined) {
    clabe = claim;
    source = "model";
    penalties.push("not_in_text");
  } else {
    const chosen = chooseCandidate(candidates, claim);
    clabe = chosen.clabe;
    source = "text";
    if (countAtSameTier(candidates, chosen) > 1) {
      penalties.push("ambiguous_candidates");
    }
    if (claim !== undefined && claim !== chosen.clabe) {
      penalties.push("model_disagrees");
    }
  }

  const checkDigitValid = isCheckDigitValid(clabe);
  if (!checkDigitValid) {
    penalties.push("check_digit_failed");
  }

  const confidence = penalties.reduce(
    (value, penalty) => value * PENALTY_FACTORS[penalty],
    base,
  );

  return {
    clabe,
    source,
    checkDigitValid,
    candidates,
    penalties,
    clarity: base,
    confidence: round3(confidence),
  };
}

/**
 * Arithmetic first, then the model's own hint, then the earliest one on the
 * page. Ordering by something other than position would make the answer depend
 * on the order the scanner happened to walk the text in.
 */
function chooseCandidate(
  candidates: readonly ClabeCandidate[],
  claim: string | undefined,
): ClabeCandidate {
  const valid = candidates.filter((candidate) => candidate.checkDigitValid);
  const tier = valid.length > 0 ? valid : candidates;
  return (
    tier.find((candidate) => candidate.clabe === claim) ??
    (tier[0] as ClabeCandidate)
  );
}

/** How many candidates are as good, arithmetically, as the one chosen. */
function countAtSameTier(
  candidates: readonly ClabeCandidate[],
  chosen: ClabeCandidate,
): number {
  return candidates.filter(
    (candidate) => candidate.checkDigitValid === chosen.checkDigitValid,
  ).length;
}

/* -------------------------------------------------------------------------- */
/* The other two fields                                                        */
/* -------------------------------------------------------------------------- */

/** Longest supplier hint kept. It is a label for a human, not an identifier. */
export const MAX_SUPPLIER_HINT = 200;

/**
 * An amount only survives if it is a positive finite number.
 *
 * No text scanning here on purpose. `184,300.00`, `184.300,00` and `$184,300` all
 * appear on Mexican paperwork and guessing which separator is the decimal one is
 * how a hundred and eighty four thousand peso payment becomes a hundred and
 * eighty four peso payment. The model is asked for a number, and anything that
 * is not one is dropped rather than repaired.
 */
export function readAmount(
  value: number | string | null | undefined,
): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return undefined;
  }
  return value;
}

/** Trims, collapses whitespace and caps the length. Empty becomes absent. */
export function readHint(value: string | null | undefined): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const cleaned = value.replace(/\s+/g, " ").trim().slice(0, MAX_SUPPLIER_HINT);
  return cleaned === "" ? undefined : cleaned;
}
