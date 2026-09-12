/**
 * @hackmty/sat is the Article 69-B half of Ceptinela: load a published version of
 * the SAT list, match a supplier RFC against it, and replay the event ledger to
 * price what a new publication just did to invoices we already deducted.
 *
 * Three constraints shape this package.
 *
 * 1. **Runtime neutral.** `apps/api` runs on the Node runtime per ADR-0005, so
 *    nothing here may import `bun:*` or reach for a Bun global. Reading a file is
 *    the caller's job: `loadSnapshot` takes text or a URL, and the URL path takes
 *    an injectable `fetch` so a test never touches the network.
 * 2. **Pure.** `matchRfc` and `sweep` are functions of their arguments. `sweep` in
 *    particular is a fold over `LedgerEvent[]` and nothing else, which is what makes
 *    the retroactive exposure number reproducible in front of a judge.
 * 3. **Nothing is dropped silently.** A row the loader cannot read comes back in
 *    `rejected` with the line number and the reason. A fiscal blacklist that quietly
 *    loses rows is worse than no blacklist.
 *
 * The detectors are NOT here. `sat_69b` is an adapter in `packages/engine`, next to
 * the other five, and it consumes what this package returns.
 */

import type {
  Cfdi,
  LedgerEvent,
  Rfc,
  SatListEntry,
  SatListStatus,
  SweepResult,
} from "@hackmty/core";

import { normalizeRfc } from "./rfc";
import { isListed } from "./status";

export * from "./rfc";
export * from "./snapshot/synthetic";
export * from "./status";

/**
 * Marks a body that is not written yet. The variadic tail keeps the real parameters
 * referenced at the call site, so the linter does not rename them out from under the
 * person who implements this.
 */
function todo(what: string, ..._context: readonly unknown[]): never {
  throw new Error(
    `TODO(Apanawa): ${what} is not implemented yet (issue #35). The method is sketched above it in packages/sat/src/index.ts.`,
  );
}

// --- Loading a published version -------------------------------------------

/**
 * Where a snapshot comes from. `text` is the offline path, used by tests and by the
 * committed download in `src/snapshot/official/`; `url` is the live path a judge can
 * watch run.
 *
 * `listVersion` is supplied by the caller and not sniffed from the file: the SAT
 * gives no version id inside the document, so the DOF publication date of the
 * download is the identifier, and guessing it from the contents would be a lie with
 * a date attached.
 */
export type SnapshotSource =
  | {
      kind: "text";
      csv: string;
      listVersion: string;
      publishedAt?: string;
      source?: string;
    }
  | {
      kind: "url";
      url: string;
      listVersion: string;
      publishedAt?: string;
      source?: string;
      /** Injected so a test can serve the fixture without a network. */
      fetch?: typeof globalThis.fetch;
    };

/** A row the parser refused, kept so the count can be reconciled with the portal. */
export interface RejectedRow {
  /** 1-based line number in the source file, header included. */
  line: number;
  reason: string;
  raw: string;
}

export interface SatSnapshot {
  listVersion: string;
  /** DOF publication date of this version, "YYYY-MM-DD". */
  publishedAt: string;
  source: string;
  loadedAt: string;
  entries: SatListEntry[];
  rejected: RejectedRow[];
}

/**
 * Parses one published version of the list into `SatListEntry` rows.
 *
 * Method:
 *
 * 1. Get the text. For `kind: "url"`, `fetch` it and decode; the published file is
 *    not guaranteed to be UTF-8 and legal names carry accents and `Ñ`, so decode
 *    before splitting, not after. Strip a byte order mark if there is one.
 * 2. Split on `\r\n` or `\n`, then split each line respecting RFC 4180 quoting. One
 *    name in the fixture carries a comma precisely so a naive `split(",")` fails in
 *    a test.
 * 3. Read the header and resolve the column indices by name rather than by position.
 *    TODO(Apanawa): confirm the header spelling against a real download, see
 *    `src/snapshot/README.md`.
 * 4. For each row, normalise the RFC with `normalizeRfc`, reject it when
 *    `isRfcShaped` says no, and read the situation with `parseSatStatus`. A row can
 *    carry several situations with their own DOF dates, and each one becomes its own
 *    entry, which is why the key in `0003_ceptinela.sql` is
 *    `(list_version, rfc, status)`.
 * 5. Never throw on a bad row. Push it into `rejected` with its line number and
 *    carry on.
 */
export async function loadSnapshot(
  source: SnapshotSource,
): Promise<SatSnapshot> {
  return todo("loadSnapshot", source);
}

// --- Matching one RFC -------------------------------------------------------

/** What the list says about one taxpayer, across every version we hold. */
export interface SatMatch {
  /** Normalised, so the caller can print it back without re-normalising. */
  rfc: Rfc;
  /** Every row for this RFC, newest publication first. */
  entries: SatListEntry[];
  /**
   * The row that decides, which is the newest one. A taxpayer who was `presunto`
   * and is now `desvirtuado` is not listed, and a product that alerts on the old row
   * is a product the clerk stops trusting inside a week.
   */
  effective?: SatListEntry;
  /** True when the effective status is `presunto` or `definitivo`. */
  listed: boolean;
}

/**
 * Looks one RFC up.
 *
 * Normalises the RFC, keeps the rows that are it, orders them newest publication
 * first, and reads the head as the status in force. A taxpayer who was
 * `presunto` and is now `desvirtuado` is not listed, so ordering is the whole
 * algorithm here and getting it backwards would accuse somebody who already
 * cleared their name.
 *
 * Pure and offline: it takes the entries it should search, so the caller decides
 * whether they came from one snapshot or from every version in Postgres through
 * `lookupSatEntries`. An empty result means this RFC is on no version that was
 * handed in, which is not the same claim as "no version was loaded"; that one
 * belongs to whoever holds the snapshots.
 */
export function matchRfc(entries: readonly SatListEntry[], rfc: Rfc): SatMatch {
  const wanted = normalizeRfc(rfc);
  const matched = entries
    .filter((entry) => normalizeRfc(entry.rfc) === wanted)
    .sort(byNewestPublication);
  const effective = matched[0];

  if (effective === undefined) {
    return { rfc: wanted, entries: matched, listed: false };
  }
  return {
    rfc: wanted,
    entries: matched,
    effective,
    listed: isListed(effective.status),
  };
}

/**
 * Newest DOF publication first, then the newest list version, then the status
 * itself. The last tiebreak is not decoration: one version can carry two
 * situations for one taxpayer with the same date, and without it the row that
 * decides would depend on the order the rows were loaded in.
 */
function byNewestPublication(left: SatListEntry, right: SatListEntry): number {
  if (left.publishedAt !== right.publishedAt) {
    return left.publishedAt < right.publishedAt ? 1 : -1;
  }
  if (left.listVersion !== right.listVersion) {
    return left.listVersion < right.listVersion ? 1 : -1;
  }
  return left.status < right.status ? -1 : left.status > right.status ? 1 : 0;
}

/** As of a date, for answering "what did we know on the day we paid". */
export function matchRfcAsOf(
  entries: readonly SatListEntry[],
  rfc: Rfc,
  asOf: string,
): SatMatch {
  return todo("matchRfcAsOf", entries, rfc, asOf);
}

// --- The retroactive sweep --------------------------------------------------

/**
 * The ordinary corporate income tax rate and the general IVA rate, applied to the
 * base already deducted to size the exposure a new publication creates.
 *
 * TODO(FabriBanda): docs/06-regulatory-privacy.md should carry the article citation
 * for both of these next to the sweep's output, because the number on screen is only
 * as good as the rate under it, and a judge will ask where the rate came from. Until
 * that citation exists, the UI states the rate it used instead of implying a
 * calculation nobody can check.
 */
export const DEFAULT_ISR_RATE = 0.3;
export const DEFAULT_IVA_RATE = 0.16;

export interface SweepOptions {
  /** The version whose publication triggered this sweep. */
  listVersion: string;
  /** Only CFDIs paid at or before this instant count. Defaults to the whole ledger. */
  asOf?: string;
  isrRate?: number;
  ivaRate?: number;
}

/**
 * Replays the ledger and prices what a new list version did to what we already paid.
 *
 * Method, one pass over the events in append order:
 *
 * 1. Fold `cfdi_received` into a map of issuer RFC to their invoices, and
 *    `payment_sent` plus `complement_received` into the set of CFDI uuids actually
 *    settled. An invoice that was received but never paid carries no exposure, and
 *    counting it would inflate the headline number, which is the fastest way to lose
 *    a judge.
 * 2. Take the `sat_list_published` event for `options.listVersion` and diff its
 *    entries against what the previous versions said, so `newlyListed` means newly
 *    listed and not listed-since-March.
 * 3. For each newly listed supplier, collect the paid CFDIs, sum their `subtotal`
 *    into `deductedBase`, and compute `isrExposure = deductedBase * isrRate` and
 *    `ivaExposure` from the `iva` actually credited, not from the rate times the
 *    base, because a CFDI can carry mixed rates.
 * 4. `totalExposure` is the sum of both across suppliers.
 *
 * Pure: no database, no clock, no network. The same `LedgerEvent[]` gives the same
 * `SweepResult` on every machine, which is what makes the number defensible.
 */
export function sweep(
  events: readonly LedgerEvent[],
  options: SweepOptions,
): SweepResult {
  return todo("sweep", events, options);
}

/**
 * The invoices of one issuer that the ledger shows as actually paid. Factored out of
 * `sweep` because the `bank_reconciliation` detector asks the same question from the
 * other direction, and two different answers to "was this paid" is a bug waiting for
 * a demo.
 */
export function paidCfdisOf(
  events: readonly LedgerEvent[],
  issuerRfc: Rfc,
  asOf?: string,
): Cfdi[] {
  return todo("paidCfdisOf", events, issuerRfc, asOf);
}

/**
 * The statuses this RFC held before `listVersion` was published, oldest first. The
 * sweep uses it to tell a newly listed supplier from one that was already there.
 */
export function statusHistory(
  entries: readonly SatListEntry[],
  rfc: Rfc,
): SatListStatus[] {
  return todo("statusHistory", entries, rfc);
}
