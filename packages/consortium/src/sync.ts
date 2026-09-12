/**
 * The two directions the consortium moves in, and what is allowed in each.
 *
 * **Push** takes this tenant's own outcomes and turns them into warehouse rows.
 * Everything a clerk can see is dropped on the way: no legal name, no amount, no
 * clave de rastreo, no invoice UUID, no raw RFC and no raw CLABE. What is left is
 * a tenant hash, two pair hashes, a public bank code, one of four outcomes and a
 * calendar day. `sync.test.ts` asserts that by serialising the payload and
 * searching it for the company's name, the supplier's name, the amount, the RFC
 * and the CLABE, because that assertion is the product claim and a comment is
 * not.
 *
 * **Pull** takes the aggregate rows back and maps them into the local snapshot.
 * Every value arrives from the SQL API as a string, nulls included, so the
 * mapping parses rather than casts: a row the warehouse could not compute turns
 * into a skipped row and a named reason, never into a zero that reads as "nobody
 * pays this account".
 *
 * Nothing in this file opens a socket. The client is handed in, so every test
 * runs the whole push and the whole pull against a stub.
 */

import type { ConsortiumSnapshotRow } from "@hackmty/core";
import type { SqlRow } from "./client";
import type { BeneficiaryEvent, Outcome } from "./ddl";
import {
  bankCodeOf,
  type HashOptions,
  hashClabe,
  hashRfc,
  hashTenant,
} from "./hash";

/**
 * One thing this tenant knows about one beneficiary, before it is anonymised.
 *
 * This is the only type in the package that holds a raw RFC and a raw CLABE, and
 * it never leaves the tenant: `pushEvents` is the function that consumes it and
 * what it returns carries neither.
 */
export interface TenantOutcome {
  supplierRfc: string;
  clabe: string;
  outcome: Outcome;
  /** The day it happened, ISO YYYY-MM-DD. Not an instant: a day is enough. */
  day: string;
}

export interface PushInput {
  /** This company's own RFC. Hashed, and never sent in the clear. */
  tenantRfc: string;
  outcomes: readonly TenantOutcome[];
  /** True while this tenant's own data is synthetic, which the demo's is. */
  synthetic: boolean;
  salt?: string;
}

/**
 * This tenant's outcomes as warehouse rows.
 *
 * Deduplicated on (pair, outcome, day): a company that paid the same supplier
 * twice on the same day contributes one row for that day, because the network
 * counts tenants and days and never payments. It is also what keeps a re-run of
 * `bun run consortium:push` from inflating anybody's history.
 */
export function pushEvents(input: PushInput): BeneficiaryEvent[] {
  const hashing: HashOptions =
    input.salt === undefined ? {} : { salt: input.salt };
  const tenantHash = hashTenant(input.tenantRfc, hashing);
  const seen = new Set<string>();
  const events: BeneficiaryEvent[] = [];

  for (const outcome of input.outcomes) {
    const day = outcome.day.slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) {
      continue;
    }
    const rfcHash = hashRfc(outcome.supplierRfc, hashing);
    const clabeHash = hashClabe(outcome.clabe, hashing);
    const key = `${rfcHash}|${clabeHash}|${outcome.outcome}|${day}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    events.push({
      tenantHash,
      rfcHash,
      clabeHash,
      bankCode: bankCodeOf(outcome.clabe),
      outcome: outcome.outcome,
      eventDate: day,
      synthetic: input.synthetic,
    });
  }

  return events;
}

export interface PullResult {
  rows: ConsortiumSnapshotRow[];
  /** Rows the warehouse returned that could not be read, with the reason. */
  skipped: { row: SqlRow; reason: string }[];
}

/**
 * The aggregate rows as local snapshot rows.
 *
 * Column names are matched case insensitively, because Snowflake upper-cases an
 * unquoted identifier and a view that is later rewritten with quoted names must
 * not silently return a snapshot of zeros.
 */
export function readNetworkRows(rows: readonly SqlRow[]): PullResult {
  const result: PullResult = { rows: [], skipped: [] };

  for (const row of rows) {
    const read = readRow(row);
    if (typeof read === "string") {
      result.skipped.push({ row, reason: read });
      continue;
    }
    result.rows.push(read);
  }

  return result;
}

function readRow(row: SqlRow): ConsortiumSnapshotRow | string {
  const lookup = new Map(
    Object.entries(row).map(([key, value]) => [key.toLowerCase(), value]),
  );
  const rfcHash = hash(lookup.get("rfc_hash"));
  const clabeHash = hash(lookup.get("clabe_hash"));
  if (rfcHash === undefined || clabeHash === undefined) {
    return "rfc_hash or clabe_hash is missing or is not a 64-character hex hash";
  }
  const firstSeen = day(lookup.get("first_seen"));
  const lastSeen = day(lookup.get("last_seen"));
  if (firstSeen === undefined || lastSeen === undefined) {
    return "first_seen or last_seen is missing or is not a date";
  }
  const tenants = count(lookup.get("tenants"));
  if (tenants === undefined) {
    return "tenants is missing or is not a whole number";
  }

  return {
    rfcHash,
    clabeHash,
    bankCode: /^[0-9]{3}$/.test(lookup.get("bank_code") ?? "")
      ? (lookup.get("bank_code") as string)
      : "000",
    tenants,
    firstSeen,
    lastSeen,
    fraudReports: count(lookup.get("fraud_reports")) ?? 0,
    otherAccounts: count(lookup.get("other_accounts")) ?? 0,
  };
}

function hash(value: string | null | undefined): string | undefined {
  const candidate = (value ?? "").trim().toLowerCase();
  return /^[0-9a-f]{64}$/.test(candidate) ? candidate : undefined;
}

/** Days in the epoch-day encoding below, so the arithmetic stays integer. */
const MS_PER_DAY = 86_400_000;

/**
 * One calendar day, from either shape the warehouse can hand back.
 *
 * The SQL REST API does NOT serialise a DATE as `YYYY-MM-DD`. Its own
 * documentation, read on 2026-09-12, says the result set is "encoded in JSON
 * expressed as strings, regardless of the Snowflake data type of the column" and
 * that a DATE is an "Integer value (in a string) of the number of days since the
 * epoch (e.g. 18262)". So `min(event_date)` comes back as `"19854"`, and a parser
 * that only accepted the ISO form rejected every row of a real pull and wrote an
 * empty snapshot with `source = 'snowflake'`, which is the worst failure this
 * signal has: the screen would say the network was consulted and has never seen
 * any of these accounts.
 *
 * `networkSelect` in `ddl.ts` now formats both dates in SQL so the ISO form is
 * what actually arrives. The epoch-day branch stays because it costs three lines
 * and it is the difference between a hand-written query returning nothing usable
 * and returning the truth.
 */
function day(value: string | null | undefined): string | undefined {
  const candidate = (value ?? "").trim();
  if (/^-?\d{1,7}$/.test(candidate)) {
    const at = new Date(Number(candidate) * MS_PER_DAY);
    return Number.isNaN(at.getTime())
      ? undefined
      : at.toISOString().slice(0, 10);
  }
  const iso = candidate.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso : undefined;
}

/**
 * A count from the warehouse, as a non-negative integer.
 *
 * Negative is refused rather than clamped for `tenants`, because
 * `other_accounts` is a subtraction in the view and a negative there would mean
 * the view is wrong; reading it as zero would hide that. The caller decides:
 * `tenants` undefined skips the row, `other_accounts` undefined becomes zero.
 */
function count(value: string | null | undefined): number | undefined {
  if (value === null || value === undefined || value.trim() === "") {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : undefined;
}
