/**
 * Looking one taxpayer up.
 *
 * Two questions look alike and are not the same, and getting the second one
 * wrong is what this file exists to prevent:
 *
 * - "Is this supplier listed today?" decides whether the payment run holds a
 *   payment that has not left yet.
 * - "Was this supplier listed on the day we deducted their invoice?" decides
 *   whether a deduction we already took is still good, which is the retroactive
 *   half of Article 69-B and the number the sweep reports.
 *
 * `matchRfc` answers the first, `matchRfcAsOf` the second, and they are the same
 * fold with a different cutoff so the two can never drift apart.
 *
 * The effective row is the NEWEST one, never the most alarming one. A taxpayer
 * who was presumed and then cleared is not listed, and a product that keeps
 * alerting on the old row is a product the clerk stops trusting inside a week,
 * which costs more than the alert was ever worth.
 */

import type { Rfc, SatListEntry, SatListStatus } from "@hackmty/core";
import { normalizeRfc } from "./rfc";
import { isListed, SAT_STATUSES } from "./status";

/** What the list says about one taxpayer, across every version we hold. */
export interface SatMatch {
  /** Normalised, so the caller can print it back without re-normalising. */
  rfc: Rfc;
  /** Every row for this RFC, newest publication first. */
  entries: SatListEntry[];
  /** The row that decides, which is the newest one. */
  effective?: SatListEntry;
  /** True when the effective status is `presunto` or `definitivo`. */
  listed: boolean;
}

/**
 * Newest first. Ties are broken by the order a taxpayer moves through the four
 * situations, so a clearing published on the same day as the listing it clears
 * wins. That direction is deliberate: when the file cannot tell us which of two
 * same-day rows came last, reporting the taxpayer as cleared is the error that
 * a person catches by reading the entries, and reporting them as listed is the
 * error that holds a legitimate supplier's money.
 */
function byRecency(left: SatListEntry, right: SatListEntry): number {
  const published = right.publishedAt.localeCompare(left.publishedAt);
  if (published !== 0) {
    return published;
  }

  const version = right.listVersion.localeCompare(left.listVersion);
  if (version !== 0) {
    return version;
  }

  return SAT_STATUSES.indexOf(right.status) - SAT_STATUSES.indexOf(left.status);
}

function matchOf(rfc: Rfc, rows: SatListEntry[]): SatMatch {
  const entries = [...rows].sort(byRecency);
  const effective = entries[0];

  return {
    rfc,
    entries,
    ...(effective === undefined ? {} : { effective }),
    listed: effective !== undefined && isListed(effective.status),
  };
}

/**
 * Looks one RFC up in the entries it is handed.
 *
 * Pure and offline: the caller decides whether the entries came from one
 * snapshot, from the committed official download, or from every version stored
 * in Postgres, and this function reads exactly what it was given. An RFC that is
 * on no row comes back with `listed: false` and no `effective`, which is an
 * answer and not an error.
 */
export function matchRfc(entries: readonly SatListEntry[], rfc: Rfc): SatMatch {
  const wanted = normalizeRfc(rfc);
  return matchOf(
    wanted,
    entries.filter((entry) => normalizeRfc(entry.rfc) === wanted),
  );
}

/**
 * As of a date, for answering "what did we know on the day we paid". Rows
 * published after `asOf` are invisible, which is the only way to price a
 * retroactive publication without hindsight leaking into the number.
 */
export function matchRfcAsOf(
  entries: readonly SatListEntry[],
  rfc: Rfc,
  asOf: string,
): SatMatch {
  const day = asOf.slice(0, 10);
  return matchRfc(
    entries.filter((entry) => entry.publishedAt.slice(0, 10) <= day),
    rfc,
  );
}

/**
 * The statuses this RFC has held, oldest first. The sweep uses it to tell a
 * newly listed supplier from one that has been on the list since March.
 */
export function statusHistory(
  entries: readonly SatListEntry[],
  rfc: Rfc,
): SatListStatus[] {
  return matchRfc(entries, rfc)
    .entries.reverse()
    .map((entry) => entry.status);
}

/* -------------------------------------------------------------------------- */
/* Index                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * The committed official snapshot is 14234 taxpayers and 29106 rows. A linear
 * filter per lookup is 29106 comparisons for an answer a judge is watching
 * arrive, so the API holds this instead: built once, then one map read.
 */
export interface SatIndex {
  /** Rows for this RFC, newest publication first. Empty when it is not listed. */
  lookup(rfc: Rfc): SatListEntry[];
  match(rfc: Rfc): SatMatch;
  /** Distinct taxpayers. */
  taxpayers: number;
  /** Rows, which is larger because one taxpayer carries one row per situation. */
  size: number;
}

export function createSatIndex(entries: readonly SatListEntry[]): SatIndex {
  const byRfc = new Map<string, SatListEntry[]>();

  for (const entry of entries) {
    const rfc = normalizeRfc(entry.rfc);
    const rows = byRfc.get(rfc);
    if (rows === undefined) {
      byRfc.set(rfc, [entry]);
      continue;
    }
    rows.push(entry);
  }

  for (const rows of byRfc.values()) {
    rows.sort(byRecency);
  }

  return {
    lookup(rfc) {
      return [...(byRfc.get(normalizeRfc(rfc)) ?? [])];
    },
    match(rfc) {
      const wanted = normalizeRfc(rfc);
      return matchOf(wanted, byRfc.get(wanted) ?? []);
    },
    taxpayers: byRfc.size,
    size: entries.length,
  };
}
