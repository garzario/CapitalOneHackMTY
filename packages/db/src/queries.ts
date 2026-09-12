/**
 * Every SQL statement the product runs, in one file, as raw SQL.
 *
 * Two rules:
 *
 * 1. **Money never crosses the boundary as a float.** `amount` is numeric(14,2) in
 *    Postgres, and postgres.js hands numerics back as strings to avoid exactly the
 *    drift @hackmty/core guards against. Aggregates are therefore returned as
 *    integer cents in a text column and parsed here, so nothing is rounded twice.
 * 2. **No business logic.** Filtering and grouping live here, deciding what it means
 *    lives in @hackmty/core.
 */

import type {
  Cep,
  Cfdi,
  Clabe,
  Decision,
  Finding,
  KnownAccount,
  LedgerEvent,
  LedgerTx,
  PaymentComplement,
  PaymentInstruction,
  Rfc,
  SatListEntry,
  Supplier,
} from "@hackmty/core";
import type { Sql } from "./index";

/** Matches the column list in migrations/0001_init.sql, field for field. */
export interface LedgerTxInsertRow {
  id: string;
  account_id: string;
  occurred_at: string;
  amount: number;
  direction: string;
  merchant_id: string | null;
  category: string | null;
  source: string;
  /** jsonb, sent as a JSON string so the driver never has to guess a type. */
  raw: string;
}

/** Rows per statement. Large enough to be fast, small enough to keep the SQL readable. */
export const DEFAULT_CHUNK_SIZE = 500;

export const DEFAULT_TIME_ZONE = "America/Monterrey";

export function toInsertRow(tx: LedgerTx): LedgerTxInsertRow {
  return {
    id: tx.id,
    account_id: tx.accountId,
    occurred_at: tx.occurredAt,
    amount: tx.amount,
    direction: tx.direction,
    merchant_id: tx.merchantId ?? null,
    category: tx.category ?? null,
    source: tx.source,
    raw: JSON.stringify(tx.raw),
  };
}

function chunk<T>(items: readonly T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let start = 0; start < items.length; start += size) {
    chunks.push(items.slice(start, start + size));
  }
  return chunks;
}

/**
 * Inserts a batch, skipping rows that are already there.
 *
 * `on conflict (id) do nothing` is what makes `bun run seed` idempotent: running it
 * twice writes the same rows once, so nobody has to remember whether they already
 * seeded before a rehearsal.
 *
 * @returns how many rows were actually written.
 */
export async function insertLedgerTx(
  sql: Sql,
  txs: readonly LedgerTx[],
  chunkSize: number = DEFAULT_CHUNK_SIZE,
): Promise<number> {
  if (txs.length === 0) {
    return 0;
  }
  let written = 0;
  for (const batch of chunk(txs, chunkSize)) {
    const rows = batch.map(toInsertRow);
    const result = await sql`
      insert into ledger_tx ${sql(rows)}
      on conflict (id) do nothing
    `;
    written += result.count;
  }
  return written;
}

export interface DailySpendRow {
  /** Calendar day in the requested time zone, "YYYY-MM-DD". */
  day: string;
  /** Exact total, in cents. */
  spendCents: number;
  /** The same total in pesos, for display. */
  spend: number;
  txCount: number;
}

/**
 * Debits per local calendar day for one account, over [from, to).
 *
 * The day is cut in the account holder's time zone, not in UTC: a purchase at 23:30
 * in Monterrey belongs to the day the person made it. Monterrey is UTC minus 6 all
 * year, so there is no daylight-saving seam to handle.
 *
 * This is the query a judge gets shown when they ask how the chart is built, and it
 * is the same shape as the Timescale continuous aggregate in 0002_timescale.sql, so
 * the fallback path answers identically.
 */
export async function dailySpend(
  sql: Sql,
  accountId: string,
  from: string,
  to: string,
  timeZone: string = DEFAULT_TIME_ZONE,
): Promise<DailySpendRow[]> {
  const rows = await sql<
    { day: string; spend_cents: string; tx_count: number }[]
  >`
    select
      to_char(occurred_at at time zone ${timeZone}::text, 'YYYY-MM-DD') as day,
      (coalesce(sum(case when direction = 'debit' then amount else 0 end), 0) * 100)::bigint::text
        as spend_cents,
      count(*)::int as tx_count
    from ledger_tx
    where account_id = ${accountId}
      and occurred_at >= ${from}::timestamptz
      and occurred_at < ${to}::timestamptz
    group by 1
    order by 1
  `;

  return rows.map((row) => {
    const spendCents = Number(row.spend_cents);
    return {
      day: row.day,
      spendCents,
      spend: spendCents / 100,
      txCount: row.tx_count,
    };
  });
}

/** How many rows the ledger holds, for one account or for all of them. */
export async function countLedgerTx(
  sql: Sql,
  accountId?: string,
): Promise<number> {
  const rows =
    accountId === undefined
      ? await sql<
          { count: number }[]
        >`select count(*)::int as count from ledger_tx`
      : await sql<{ count: number }[]>`
          select count(*)::int as count from ledger_tx where account_id = ${accountId}
        `;
  return rows[0]?.count ?? 0;
}

/**
 * The most recent instant on record, as a UTC ISO string, which `bun run doctor` prints
 * as a freshness check. Formatted in UTC rather than in the connection's time zone, so
 * the answer does not depend on which host the query ran against.
 */
export async function latestOccurredAt(
  sql: Sql,
  accountId?: string,
): Promise<string | undefined> {
  const rows =
    accountId === undefined
      ? await sql<{ at: string | null }[]>`
          select to_char(max(occurred_at) at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as at
          from ledger_tx
        `
      : await sql<{ at: string | null }[]>`
          select to_char(max(occurred_at) at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as at
          from ledger_tx where account_id = ${accountId}
        `;
  return rows[0]?.at ?? undefined;
}

/** Every account id that has at least one row, most active first. */
export async function listAccountIds(sql: Sql): Promise<string[]> {
  const rows = await sql<{ account_id: string }[]>`
    select account_id from ledger_tx
    group by account_id
    order by count(*) desc, account_id asc
  `;
  return rows.map((row) => row.account_id);
}

/**
 * Empties the ledger. Destructive, and called only by scripts/reset.ts after an
 * interactive confirmation.
 */
export async function truncateLedger(sql: Sql): Promise<void> {
  await sql`truncate table ledger_tx`;
}

// ---------------------------------------------------------------------------
// Ceptinela. Everything below reads and writes the tables in
// migrations/0003_ceptinela.sql, and every argument and return value is a type
// from packages/core/src/domain.ts. There is no second shape: if a screen needs a
// field, it is added to the domain first and to a table second.
//
// The bodies are stubs on purpose. This file is the contract apps/api codes
// against while the detectors land in a different pull request, and the SQL each
// stub will run is sketched in the comment above it, so writing the body is a
// transcription rather than a design exercise.
// ---------------------------------------------------------------------------

/**
 * Marks a body that is not written yet.
 *
 * The variadic tail exists so the real parameters are referenced at the call site:
 * a stub whose parameters are all unused is a stub the linter renames, and the next
 * person has to un-rename them.
 */
function todo(what: string, ..._context: readonly unknown[]): never {
  throw new Error(
    `TODO(fabbyyyy): ${what} is not implemented yet (issue #40). The SQL it will run is sketched above it in packages/db/src/queries.ts.`,
  );
}

/**
 * Column names differ from the domain field names in exactly two places, and both
 * are deliberate. Restated here because this is the file that has to know.
 *
 * - `PaymentInstruction.text` is stored as `instructions.message_text`, because
 *   `text` is a type name in Postgres and a column called `text` reads as a bug.
 * - the row count of a SAT list version is stored as `sat_list_versions.row_count`
 *   and served as `rows` in docs/09-api.md, because `rows` is a keyword in enough
 *   dialects to be worth avoiding in DDL.
 */
export const COLUMN_ALIASES = {
  "PaymentInstruction.text": "instructions.message_text",
  "SatListVersion.rows": "sat_list_versions.row_count",
} as const;

/** One published version of the SAT Article 69-B list, as docs/09-api.md serves it. */
export interface SatListVersionRow {
  listVersion: string;
  /** DOF publication date, "YYYY-MM-DD". */
  publishedAt: string;
  rows: number;
  source: string;
}

/** How close the CEP account holder name was to the supplier's CFDI legal name. */
export type NameMatch = "match" | "partial" | "mismatch";

/** A row of the per-company verified beneficiary registry. */
export interface VerifiedBeneficiary {
  supplierRfc: Rfc;
  clabe: Clabe;
  cep: Cep;
  nameMatch: NameMatch;
  verifiedAt: string;
}

/**
 * One line of the payment run. The composite is the one in docs/09-api.md, built out
 * of domain types and nothing else, so the API returns it unchanged. `supplier` is
 * optional because an instruction can arrive for an RFC we have never invoiced with,
 * which is itself the interesting case.
 *
 * TODO(garzario): if the API ends up needing the whole `PaymentRun` envelope as a
 * value, it belongs in packages/core/src/domain.ts next to this item, not here.
 */
export interface PaymentRunItem {
  instruction: PaymentInstruction;
  supplier?: Supplier;
  decision?: Decision;
  findings: Finding[];
}

export interface LedgerReadOptions {
  /** Inclusive lower bound on the event instant, ISO 8601. */
  since?: string;
  limit?: number;
}

// --- Event ledger ----------------------------------------------------------

/**
 * Appends one event. The ledger is the system of record and every other table in
 * 0003 is a projection of it, so this is the write that must never fail silently.
 *
 *   insert into ledger_events (at, type, payload)
 *   values (${event.at}::timestamptz, ${event.type}, ${sql.json(payload)})
 *
 * where `payload` is the event with `type` and `at` removed, so the discriminant is
 * not stored twice. `event_id` and `seq` are generated by the server.
 */
export async function appendLedgerEvent(
  sql: Sql,
  event: LedgerEvent,
): Promise<void> {
  return todo("appendLedgerEvent", sql, event);
}

/**
 * Appends a batch in insert order, chunked like insertLedgerTx.
 *
 *   insert into ledger_events ${sql(rows)}
 *
 * No `on conflict` clause: two identical events at the same instant are two real
 * events, and collapsing them would break the replay. Returns how many were written.
 */
export async function appendLedgerEvents(
  sql: Sql,
  events: readonly LedgerEvent[],
  chunkSize: number = DEFAULT_CHUNK_SIZE,
): Promise<number> {
  return todo("appendLedgerEvents", sql, events, chunkSize);
}

/**
 * Reads the ledger in append order, which is what the timeline and the retroactive
 * sweep both consume.
 *
 *   select at, type, payload from ledger_events
 *   where at >= coalesce(${since}::timestamptz, '-infinity'::timestamptz)
 *   order by at asc, seq asc
 *   limit ${limit}
 *
 * `seq` breaks ties inside the same instant, which matters because the generator
 * emits a CFDI and its complement on the same timestamp far more often than real
 * life does. Rows are rehydrated into the LedgerEvent union by putting `type` and
 * `at` back onto the payload.
 */
export async function readLedger(
  sql: Sql,
  options: LedgerReadOptions = {},
): Promise<LedgerEvent[]> {
  return todo("readLedger", sql, options);
}

// --- Suppliers and their accounts ------------------------------------------

/**
 * Upserts the supplier and its known accounts in one transaction.
 *
 *   insert into suppliers (rfc, legal_name, first_invoice_at, synthetic)
 *   values (...)
 *   on conflict (rfc) do update set legal_name = excluded.legal_name,
 *     first_invoice_at = least(suppliers.first_invoice_at, excluded.first_invoice_at)
 *
 * `least` on the first invoice matters: back-filling eight months of history after
 * the supplier row already exists has to move the date earlier, never later, or the
 * supplier_behaviour detector sees a brand new supplier that has been there all year.
 */
export async function upsertSupplier(
  sql: Sql,
  supplier: Supplier,
): Promise<void> {
  return todo("upsertSupplier", sql, supplier);
}

/**
 * Records an account we now have evidence for. Idempotent, and it never downgrades
 * the evidence: an account established by a verified CEP stays established by the
 * CEP even when a later instruction arrives on it.
 *
 *   insert into known_accounts
 *     (supplier_rfc, clabe, established_by, established_at, times_paid)
 *   values (...)
 *   on conflict (supplier_rfc, clabe) do update
 *     set times_paid = known_accounts.times_paid + excluded.times_paid
 */
export async function recordKnownAccount(
  sql: Sql,
  supplierRfc: Rfc,
  account: KnownAccount,
): Promise<void> {
  return todo("recordKnownAccount", sql, supplierRfc, account);
}

/**
 * The supplier with its accounts, most recent first, or undefined when we have never
 * seen the RFC.
 *
 *   select s.*, coalesce(json_agg(k.* order by k.established_at desc)
 *                          filter (where k.clabe is not null), '[]') as accounts
 *   from suppliers s left join known_accounts k on k.supplier_rfc = s.rfc
 *   where s.rfc = ${rfc} group by s.rfc
 *
 * The `filter` is the part that matters: without it a supplier with no known account
 * comes back with a one-element array of nulls, which the forensics detector would
 * happily compare against.
 */
export async function getSupplier(
  sql: Sql,
  rfc: Rfc,
): Promise<Supplier | undefined> {
  return todo("getSupplier", sql, rfc);
}

/** Every supplier with its accounts, ordered by legal name. Same join as getSupplier. */
export async function listSuppliers(sql: Sql): Promise<Supplier[]> {
  return todo("listSuppliers", sql);
}

// --- CFDI and payment complements ------------------------------------------

/**
 * Inserts invoices, chunked, skipping UUIDs already stored.
 *
 *   insert into cfdis ${sql(rows)} on conflict (uuid) do nothing
 *
 * `do nothing` rather than `do update`: a CFDI is immutable once it is timbrado, so
 * a second copy of the same UUID is a re-ingest and never a correction.
 */
export async function insertCfdis(
  sql: Sql,
  cfdis: readonly Cfdi[],
  chunkSize: number = DEFAULT_CHUNK_SIZE,
): Promise<number> {
  return todo("insertCfdis", sql, cfdis, chunkSize);
}

/**
 * The invoice history of one supplier, newest first. This is the series the
 * supplier_behaviour detector reads.
 *
 *   select * from cfdis
 *   where issuer_rfc = ${rfc}
 *     and issued_at >= coalesce(${from}::timestamptz, '-infinity'::timestamptz)
 *     and issued_at <  coalesce(${to}::timestamptz, 'infinity'::timestamptz)
 *   order by issued_at desc
 *
 * Served by cfdis_issuer_time.
 */
export async function listCfdisByIssuer(
  sql: Sql,
  rfc: Rfc,
  window: { from?: string; to?: string } = {},
): Promise<Cfdi[]> {
  return todo("listCfdisByIssuer", sql, rfc, window);
}

/**
 * Inserts complements, chunked.
 *
 *   insert into payment_complements ${sql(rows)} on conflict (uuid) do nothing
 *
 * A complement whose `beneficiary_account` is new is the legitimate way an account
 * changes, so this write is what feeds recordKnownAccount with `payment_complement`.
 */
export async function insertPaymentComplements(
  sql: Sql,
  complements: readonly PaymentComplement[],
  chunkSize: number = DEFAULT_CHUNK_SIZE,
): Promise<number> {
  return todo("insertPaymentComplements", sql, complements, chunkSize);
}

/**
 * Complements for a set of invoices.
 *
 *   select * from payment_complements
 *   where related_cfdi_uuid = any(${uuids}::uuid[])
 *   order by paid_at asc
 */
export async function listComplementsForCfdis(
  sql: Sql,
  cfdiUuids: readonly string[],
): Promise<PaymentComplement[]> {
  return todo("listComplementsForCfdis", sql, cfdiUuids);
}

// --- Instructions, findings and decisions ----------------------------------

/**
 * Stores an intake.
 *
 *   insert into instructions (id, supplier_rfc, cfdi_uuids, clabe, amount, source,
 *     received_at, message_text, image_ref, ocr_confidence, synthetic)
 *   values (..., ${instruction.cfdiUuids}::uuid[], ...)
 *   on conflict (id) do nothing
 *
 * `supplier_rfc` is nullable in 0003, so an instruction from an RFC we cannot place
 * is still stored rather than rejected at the door.
 */
export async function insertInstruction(
  sql: Sql,
  instruction: PaymentInstruction,
): Promise<void> {
  return todo("insertInstruction", sql, instruction);
}

/**
 *   select * from instructions where id = ${id}
 */
export async function getInstruction(
  sql: Sql,
  id: string,
): Promise<PaymentInstruction | undefined> {
  return todo("getInstruction", sql, id);
}

/**
 * The week's payment run, assembled for GET /api/v1/run/current.
 *
 *   select i.*, s.*, d.*, f.*
 *   from instructions i
 *   left join suppliers s on s.rfc = i.supplier_rfc
 *   left join lateral (
 *     select * from decisions dd where dd.instruction_id = i.id
 *     order by dd.decided_at desc limit 1
 *   ) d on true
 *   left join findings f on f.subject_kind = 'instruction' and f.subject_id = i.id
 *   where i.received_at >= ${weekOf}::timestamptz
 *     and i.received_at <  ${weekOf}::timestamptz + interval '7 days'
 *   order by i.received_at asc
 *
 * The lateral join is the part worth reading: `decisions` keeps one row per decision
 * moment, so the current decision is the newest row and not the only row. The rail is
 * sorted by amountAtRisk in @hackmty/core and not here, because that ordering is a
 * product judgement and belongs with the rest of them.
 */
export async function currentPaymentRun(
  sql: Sql,
  weekOf: string,
): Promise<PaymentRunItem[]> {
  return todo("currentPaymentRun", sql, weekOf);
}

/**
 * Stores findings, chunked.
 *
 *   insert into findings ${sql(rows)} on conflict (id) do nothing
 *
 * `evidence` goes in as `sql.json(finding.evidence)`, so the driver never has to
 * guess whether a Record<string, string | number | boolean> is a composite type.
 */
export async function insertFindings(
  sql: Sql,
  findings: readonly Finding[],
  chunkSize: number = DEFAULT_CHUNK_SIZE,
): Promise<number> {
  return todo("insertFindings", sql, findings, chunkSize);
}

/**
 * Findings attached to one subject, newest first.
 *
 *   select * from findings
 *   where subject_kind = ${kind} and subject_id = ${id}
 *   order by created_at desc
 *
 * Served by findings_subject.
 */
export async function findingsFor(
  sql: Sql,
  kind: Finding["subject"]["kind"],
  id: string,
): Promise<Finding[]> {
  return todo("findingsFor", sql, kind, id);
}

/**
 * Writes a decision and the findings that justified it, in one transaction, and
 * returns the generated decision id.
 *
 *   insert into decisions (instruction_id, action, expected_loss,
 *     delay_cost_per_day, decided_at, decided_by)
 *   values (...) returning id
 *   insert into decision_findings (decision_id, finding_id)
 *   select ${id}, unnest(${findingIds}::text[])
 *   on conflict do nothing
 *
 * The join table exists so the exact set can be rebuilt later, even after the
 * detectors change and would produce a different set today. The caller appends a
 * `decision_made` event in the same transaction.
 */
export async function insertDecision(
  sql: Sql,
  decision: Decision,
): Promise<number> {
  return todo("insertDecision", sql, decision);
}

/**
 * The current decision for an instruction, with its findings rehydrated.
 *
 *   select d.*, coalesce(json_agg(f.*) filter (where f.id is not null), '[]')
 *            as findings
 *   from decisions d
 *   left join decision_findings df on df.decision_id = d.id
 *   left join findings f on f.id = df.finding_id
 *   where d.instruction_id = ${instructionId}
 *   group by d.id order by d.decided_at desc limit 1
 */
export async function latestDecision(
  sql: Sql,
  instructionId: string,
): Promise<Decision | undefined> {
  return todo("latestDecision", sql, instructionId);
}

// --- SAT Article 69-B list --------------------------------------------------

/**
 * Loads one published version of the list, in a transaction.
 *
 *   insert into sat_list_versions (list_version, published_at, row_count, source)
 *   values (...) on conflict (list_version) do update
 *     set row_count = excluded.row_count
 *   insert into sat_list_entries ${sql(rows)}
 *   on conflict (list_version, rfc, status) do nothing
 *
 * Versions are never rewritten in place. A corrected download is a new version,
 * which is what makes "what did we know on the day we paid" answerable at all.
 * Returns how many entry rows were written.
 */
export async function insertSatListVersion(
  sql: Sql,
  version: SatListVersionRow,
  entries: readonly SatListEntry[],
  chunkSize: number = DEFAULT_CHUNK_SIZE,
): Promise<number> {
  return todo("insertSatListVersion", sql, version, entries, chunkSize);
}

/**
 * Every row the list has ever carried for one RFC, newest publication first. This is
 * what GET /api/v1/sat/lookup?rfc= serves, and it is read-only over the official
 * list, which is why a judge can type a real RFC into it without any synthetic data
 * being attached to the answer.
 *
 *   select * from sat_list_entries where rfc = ${normalizedRfc}
 *   order by published_at desc, list_version desc
 *
 * The RFC must be normalised by the caller, uppercase with no spaces or hyphens; see
 * normalizeRfc in @hackmty/sat. Served by sat_list_entries_rfc.
 */
export async function lookupSatEntries(
  sql: Sql,
  rfc: Rfc,
): Promise<SatListEntry[]> {
  return todo("lookupSatEntries", sql, rfc);
}

/**
 *   select list_version, published_at, row_count as rows, source
 *   from sat_list_versions order by published_at desc
 */
export async function listSatVersions(sql: Sql): Promise<SatListVersionRow[]> {
  return todo("listSatVersions", sql);
}

// --- Verified beneficiary registry -----------------------------------------

/**
 * Stores the evidence from a CEP verification.
 *
 *   insert into verified_beneficiaries (supplier_rfc, clabe, clave_rastreo,
 *     transferred_at, amount, sender_name, sender_bank, beneficiary_name,
 *     beneficiary_bank, signature_valid, name_match, cep_xml, verified_at, synthetic)
 *   values (..., decode(${base64Xml}, 'base64'), ...)
 *   on conflict (supplier_rfc, clabe) do update set ...
 *
 * `cep_xml` is bytea and the XML goes in byte-exact: an XMLDSig signature validates
 * over the bytes Banxico served, so canonicalising, re-encoding or trimming the
 * payload destroys the only thing that makes this row evidence rather than a claim.
 * Passing it as base64 and decoding server-side is what stops the driver from
 * picking an encoding on our behalf.
 */
export async function upsertVerifiedBeneficiary(
  sql: Sql,
  entry: VerifiedBeneficiary,
): Promise<void> {
  return todo("upsertVerifiedBeneficiary", sql, entry);
}

/**
 * The registry, newest first, for GET /api/v1/beneficiaries.
 *
 *   select *, encode(cep_xml, 'base64') as cep_xml_b64
 *   from verified_beneficiaries order by verified_at desc
 */
export async function listVerifiedBeneficiaries(
  sql: Sql,
): Promise<VerifiedBeneficiary[]> {
  return todo("listVerifiedBeneficiaries", sql);
}

/**
 * Is this exact account already verified for this exact supplier. The beneficiary_cep
 * detector asks this before it asks anything else.
 *
 *   select *, encode(cep_xml, 'base64') as cep_xml_b64
 *   from verified_beneficiaries where supplier_rfc = ${rfc} and clabe = ${clabe}
 */
export async function getVerifiedBeneficiary(
  sql: Sql,
  supplierRfc: Rfc,
  clabe: Clabe,
): Promise<VerifiedBeneficiary | undefined> {
  return todo("getVerifiedBeneficiary", sql, supplierRfc, clabe);
}

// --- Maintenance ------------------------------------------------------------

/**
 * Empties every Ceptinela table. Destructive, and called only by scripts/reset.ts
 * after an interactive confirmation, the same as truncateLedger.
 *
 *   truncate table ledger_events, decision_findings, decisions, findings,
 *     instructions, payment_complements, cfdis, verified_beneficiaries,
 *     known_accounts, sat_list_entries, sat_list_versions, suppliers
 *   restart identity
 *
 * `truncate` and not `delete` on ledger_events: the append-only rules in 0003 turn a
 * DELETE into a no-op, and truncate is not routed through the rule system.
 */
export async function truncateCeptinela(sql: Sql): Promise<void> {
  return todo("truncateCeptinela", sql);
}
