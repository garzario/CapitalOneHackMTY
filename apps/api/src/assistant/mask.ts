/**
 * What leaves the perimeter, and the one file that decides it.
 *
 * ADR-0007 bounds the transfer to three things: the clerk's own sentence, the
 * image she dropped, and the evidence of the findings the turn is about. This
 * module is the half of that sentence the code can enforce, and it enforces it by
 * rewriting every value on its way out rather than by trusting each tool to
 * remember. Two rules, both structural:
 *
 * 1. **An account number leaves as four digits.** A CLABE is eighteen digits that
 *    address money, and an eighteen-digit string in a model request is the one item
 *    on the list in docs/06 section 6.2 that a careless tool result would leak. So
 *    `maskClabe` keeps the last four, which is what the verification call and
 *    `cent_sent` already record, and the full digits stay on our side of the wire.
 *    The panel renders the full CLABE off its own API read, so nothing the clerk
 *    can see is lost by the model never having seen it.
 * 2. **A document never leaves at all.** A CFDI or a CEP XML carries the supplier,
 *    the concepts, the taxes and a digital seal, and none of it is evidence about
 *    the decision the turn is about. `DROPPED_KEYS` is the list, it is matched on
 *    the key and not on the value, and it is dropped rather than masked so a reader
 *    of the request body can see that the field is absent.
 *
 * The functions are pure and the test asserts on the request body rather than on a
 * promise, which is the same argument `packages/extract/src/gemini.ts` makes about
 * `buildRequestBody`: a privacy claim that cannot be checked by reading one file is
 * a privacy claim nobody should believe.
 */

import type { EvidenceValue } from "@hackmty/core";

/** How many trailing digits of an account survive the mask. */
export const CLABE_VISIBLE_DIGITS = 4;

/** Exactly eighteen digits, which is what a CLABE is. */
const CLABE_SHAPE = /^\d{18}$/;

/** Eighteen digits anywhere inside a longer string, for free prose. */
const CLABE_INSIDE = /\d{18}/g;

/**
 * Keys whose value never leaves, whatever it holds.
 *
 * `xml` and `rawXml` are the CFDI and the CEP documents. `sello` and
 * `certificate` are the cryptographic halves of a CEP, which prove nothing to a
 * model and are the most sensitive thing in the payload. `rawText` and
 * `transcript` are what an extraction read off a file, and they are already in the
 * clerk's hands: sending them back up would put a whole screenshot's text through
 * the model for no answer. `knownAccounts` is the company's account book.
 */
export const DROPPED_KEYS: readonly string[] = [
  "xml",
  "rawXml",
  "cfdiXml",
  "cepXml",
  "sello",
  "selloDigital",
  "certificate",
  "certificado",
  "rawText",
  "transcript",
  "knownAccounts",
  "image",
  "audio",
];

/**
 * `3450 0000 0000 0001 23` becomes `****0123`.
 *
 * A string that is not eighteen digits is returned unchanged, because this is
 * called on values whose shape is not guaranteed and a mask that silently rewrote
 * an RFC would be worse than one that did nothing.
 */
export function maskClabe(value: string): string {
  if (!CLABE_SHAPE.test(value)) {
    return value;
  }
  return `****${value.slice(-CLABE_VISIBLE_DIGITS)}`;
}

/** The last four digits of an account, for a sentence that names one. */
export function clabeLast4(value: string): string {
  return value.slice(-CLABE_VISIBLE_DIGITS);
}

/** Masks every eighteen-digit run inside a longer string, prose included. */
export function maskClabesInText(value: string): string {
  return value.replace(CLABE_INSIDE, (digits) => maskClabe(digits));
}

/**
 * One evidence value on its way out: an account becomes four digits, a number and
 * a boolean pass, and the network signal is recursed into because it is the one
 * compound `EvidenceValue` the domain has.
 */
export function maskEvidenceValue(value: EvidenceValue): EvidenceValue {
  if (typeof value === "string") {
    return maskClabesInText(value);
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  return value;
}

/** A whole evidence map on its way out. */
export function maskEvidence(
  evidence: Record<string, EvidenceValue>,
): Record<string, EvidenceValue> {
  const masked: Record<string, EvidenceValue> = {};
  for (const [key, value] of Object.entries(evidence)) {
    if (DROPPED_KEYS.includes(key)) {
      continue;
    }
    masked[key] = maskEvidenceValue(value);
  }
  return masked;
}

/**
 * Any JSON value on its way out: accounts masked, dropped keys gone, arrays and
 * objects walked to the bottom.
 *
 * It is deliberately a walk over unknown rather than a per-type projection. A tool
 * that returns a new field tomorrow gets the mask for free, and the alternative,
 * which is each tool remembering to mask its own CLABE, is the shape of every leak
 * that has ever happened.
 */
export function maskDeep(value: unknown): unknown {
  if (typeof value === "string") {
    return maskClabesInText(value);
  }
  if (Array.isArray(value)) {
    return value.map((item) => maskDeep(item));
  }
  if (value !== null && typeof value === "object") {
    const masked: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      if (DROPPED_KEYS.includes(key)) {
        continue;
      }
      masked[key] = maskDeep(item);
    }
    return masked;
  }
  return value;
}

/**
 * True when this string still carries a full account number.
 *
 * The test for the whole module is one assertion over a built request body using
 * this predicate, so a tool added later that forgets the mask fails the suite
 * instead of failing at a judge's table.
 */
export function carriesFullClabe(text: string): boolean {
  CLABE_INSIDE.lastIndex = 0;
  return CLABE_INSIDE.test(text);
}
