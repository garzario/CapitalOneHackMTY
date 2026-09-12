/**
 * The signature hash a constancia carries.
 *
 * The document says what the ledger held over a range of time. Anyone can
 * reprint it, so the printed number has to be checkable: this hashes the
 * events themselves, canonically, and prints the digest on the page next to
 * the range it covers. Reprinting the same range gives the same digest;
 * appending one event or editing one field does not.
 *
 * What this is and is not, stated plainly because the word "signature" carries
 * weight in a fiscal document: it is a SHA-256 content digest, not a
 * cryptographic signature. Nothing here proves who produced the file. Proving
 * that needs a key we do not have and a certificate authority we are not, and
 * claiming it on a page an accountant keeps would be a lie with a hash
 * attached. The page says "huella" and names the algorithm.
 *
 * Canonicalisation is the whole difficulty. Two servers must agree byte for
 * byte, so object keys are sorted at every depth and numbers go through
 * `JSON.stringify`'s own shortest round-trip form. Arrays keep their order,
 * because in a ledger the order is the meaning.
 */

import { createHash } from "node:crypto";
import type { LedgerEvent } from "@hackmty/core";

export const LEDGER_HASH_ALGORITHM = "sha256";

export interface LedgerRange {
  /** Inclusive lower bound, ISO 8601. Absent means from the first event. */
  from?: string;
  /** Inclusive upper bound, ISO 8601. Absent means up to the last event. */
  to?: string;
}

export interface LedgerFingerprint {
  algorithm: string;
  /** Lowercase hex. */
  digest: string;
  /** How many events went into it. */
  events: number;
  /** The instant of the first event counted, absent when none were. */
  from?: string;
  /** The instant of the last event counted, absent when none were. */
  to?: string;
}

/** Sorts object keys at every depth so two servers serialise the same bytes. */
export function canonicalise(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalise);
  }
  if (value === null || typeof value !== "object") {
    return value;
  }
  const source = value as Record<string, unknown>;
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(source).sort()) {
    sorted[key] = canonicalise(source[key]);
  }
  return sorted;
}

/** The events of a range, in ledger order. Exported because the page counts them. */
export function eventsInRange(
  events: readonly LedgerEvent[],
  range: LedgerRange = {},
): LedgerEvent[] {
  const from = range.from === undefined ? undefined : Date.parse(range.from);
  const to = range.to === undefined ? undefined : Date.parse(range.to);

  return events.filter((event) => {
    const at = Date.parse(event.at);
    if (!Number.isFinite(at)) {
      // An event with an unreadable instant cannot be placed in a range, and
      // silently including it would make the digest depend on filter order.
      return false;
    }
    if (from !== undefined && at < from) {
      return false;
    }
    return !(to !== undefined && at > to);
  });
}

/**
 * Hashes a range of the ledger.
 *
 * An empty range is hashed too, rather than refused: "nothing happened in this
 * week" is a real answer for a constancia to carry, and the digest of the empty
 * list is a fixed, checkable value.
 */
export function fingerprintLedger(
  events: readonly LedgerEvent[],
  range: LedgerRange = {},
): LedgerFingerprint {
  const scoped = eventsInRange(events, range);
  const hash = createHash(LEDGER_HASH_ALGORITHM);

  for (const event of scoped) {
    hash.update(JSON.stringify(canonicalise(event)));
    // A separator, so that two events cannot be concatenated into a third that
    // hashes the same as a different pair.
    hash.update("\n");
  }

  const first = scoped[0]?.at;
  const last = scoped[scoped.length - 1]?.at;

  return {
    algorithm: LEDGER_HASH_ALGORITHM,
    digest: hash.digest("hex"),
    events: scoped.length,
    ...(first === undefined ? {} : { from: first }),
    ...(last === undefined ? {} : { to: last }),
  };
}

/** `abcd1234 abcd1234 ...`, so a person can read a digest off paper. */
export function groupDigest(digest: string, size = 8): string {
  const groups: string[] = [];
  for (let index = 0; index < digest.length; index += size) {
    groups.push(digest.slice(index, index + size));
  }
  return groups.join(" ");
}
