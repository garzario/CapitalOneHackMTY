/**
 * RFC normalisation.
 *
 * The SAT list and a CFDI do not spell an RFC the same way. The list is served
 * uppercase with no separators, a CFDI carries it uppercase too, but an RFC typed
 * by a human into the lookup box arrives lowercase, with spaces, with a hyphen
 * before the homoclave, or all three. Every comparison in this package goes through
 * normalizeRfc first, which is why there is exactly one place to fix when the next
 * spelling turns up.
 *
 * What is NOT stripped: `&` and `Ñ` are legitimate characters in the name portion of
 * a moral person's RFC, so removing them would silently turn one taxpayer into
 * another.
 */

import type { Rfc } from "@hackmty/core";

/** Moral person: 3 letters. Physical person: 4. Then YYMMDD, then 3 of homoclave. */
const RFC_PATTERN = /^[A-ZÑ&]{3,4}[0-9]{6}[A-Z0-9]{3}$/;

/** Everything a human or a spreadsheet adds that carries no meaning. */
const SEPARATORS = /[\s._/-]+/g;

/**
 * Uppercase, separators removed. Does not validate: a caller that needs to know
 * whether the result is an RFC at all asks isRfcShaped.
 */
export function normalizeRfc(raw: string): Rfc {
  return raw.replace(SEPARATORS, "").toUpperCase();
}

/**
 * True when the string has the shape of an RFC. This is a shape check and not a
 * check-digit check: the homoclave is computed by the SAT from data we do not have,
 * so the only honest verification is a lookup, which is what this package exists for.
 */
export function isRfcShaped(raw: string): boolean {
  const normalized = normalizeRfc(raw);
  return (
    (normalized.length === 12 || normalized.length === 13) &&
    RFC_PATTERN.test(normalized)
  );
}

/** True when the RFC belongs to a moral person, which is every supplier on a CFDI de ingreso we pay by SPEI. */
export function isMoralRfc(raw: string): boolean {
  return isRfcShaped(raw) && normalizeRfc(raw).length === 12;
}

/**
 * The prefix every RFC invented by this repo carries.
 *
 * ADR-0002 is binding here: a real RFC from the SAT list may only ever appear in the
 * read-only lookup box, never attached to a synthetic invoice or a synthetic finding.
 * The prefix is the machine-readable half of that rule, and `synthetic: true` on the
 * object is the half the UI watermarks from.
 */
export const SYNTHETIC_RFC_PREFIX = "SYN";

export function isSyntheticRfc(raw: string): boolean {
  return normalizeRfc(raw).startsWith(SYNTHETIC_RFC_PREFIX);
}
