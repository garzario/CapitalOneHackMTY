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
 *
 * Every function takes a `Db`, which is either the pooled client or a transaction
 * handle, so a caller that already opened a transaction can compose these without
 * a second connection. The row shapes and the mappers are in rows.ts, which is
 * pure and unit tested; this file only knows the SQL.
 */

import type {
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
import type postgres from "postgres";
import type { Sql } from "./index";
import {
  beneficiaryFromRow,
  type CfdiRow,
  cfdiFromRow,
  cfdiToRow,
  complementFromRow,
  complementToRow,
  type DecisionRow,
  decisionFromRow,
  encodeBase64,
  type FindingRow,
  findingFromRow,
  findingToRow,
  type InstructionRow,
  instructionFromRow,
  instructionToRow,
  knownAccountToRow,
  type LedgerEventRow,
  type LedgerTxRow,
  ledgerEventFromRow,
  ledgerEventToRow,
  ledgerTxFromRow,
  type NameMatchValue,
  type PaymentComplementRow,
  type SatListEntryRow,
  type SupplierRow,
  satEntryFromRow,
  satEntryToRow,
  subjectIdForStorage,
  supplierFromRow,
  supplierToRow,
  type VerifiedBeneficiaryRecord,
  type VerifiedBeneficiaryRow,
} from "./rows";

/**
 * The pooled client or a transaction handle. Both run the same template tag, so
 * a query written once serves `sql.begin(async (tx) => ...)` and a plain call.
 */
export type Db = Sql | postgres.TransactionSql;

/**
 * Runs `work` inside a transaction when `db` can open one, and inline when `db`
 * already is one. A nested `begin` on a transaction handle does not exist, so
 * this is how a multi-statement write composes into a caller's transaction.
 */
/**
 * What the driver's bulk-insert helper accepts. Our row types carry domain
 * objects in their jsonb fields, which the driver serialises once; the cast
 * happens here, at the one boundary, and nowhere in the mappers.
 */
type DriverRow = Record<string, postgres.ParameterOrJSON<never>>;

function driverRows<T extends object>(rows: readonly T[]): DriverRow[] {
  return rows as unknown as DriverRow[];
}

function json(value: unknown): postgres.JSONValue {
  return value as postgres.JSONValue;
}

export function transact<T>(db: Db, work: (tx: Db) => Promise<T>): Promise<T> {
  if ("begin" in db && typeof db.begin === "function") {
    return db.begin((tx) => work(tx)) as Promise<T>;
  }
  return work(db);
}

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
  /**
   * jsonb, as the object. postgres.js serialises a value bound to a jsonb
   * column itself; handing it a string stores a JSON string of JSON.
   */
  raw: Record<string, unknown>;
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
    raw: { ...tx.raw },
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
 * `on conflict (occurred_at, id) do nothing` is what makes `bun run seed`
 * idempotent: running it twice writes the same rows once, so nobody has to
 * remember whether they already seeded before a rehearsal. The key carries the
 * instant because a Timescale hypertable is partitioned on it (0005).
 *
 * @returns how many rows were actually written.
 */
export async function insertLedgerTx(
  sql: Db,
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
      insert into ledger_tx ${sql(driverRows(rows))}
      on conflict (occurred_at, id) do nothing
    `;
    written += result.count;
  }
  return written;
}

/**
 * The bank mirror as the engine reads it, oldest first. One account or all of
 * them. Only `bank_reconciliation` consumes this, and it reduces every instant
 * to a calendar day because Nessie never had a time of day to begin with.
 */
export async function listLedgerTx(
  sql: Db,
  accountId?: string,
): Promise<LedgerTx[]> {
  const rows =
    accountId === undefined
      ? await sql<LedgerTxRow[]>`
          select id, account_id, occurred_at, amount, direction, merchant_id,
                 category, source, raw
          from ledger_tx
          order by occurred_at asc, id asc
        `
      : await sql<LedgerTxRow[]>`
          select id, account_id, occurred_at, amount, direction, merchant_id,
                 category, source, raw
          from ledger_tx
          where account_id = ${accountId}
          order by occurred_at asc, id asc
        `;
  return rows.map(ledgerTxFromRow);
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
  sql: Db,
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
  sql: Db,
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
  sql: Db,
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
export async function listAccountIds(sql: Db): Promise<string[]> {
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
export async function truncateLedger(sql: Db): Promise<void> {
  await sql`truncate table ledger_tx`;
}

// ---------------------------------------------------------------------------
// Ceptinela. Everything below reads and writes the tables in
// migrations/0003_ceptinela.sql and 0005_ceptinela_drift.sql, and every
// argument and return value is a type from packages/core/src/domain.ts. There
// is no second shape: if a screen needs a field, it is added to the domain
// first and to a table second.
// ---------------------------------------------------------------------------

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
export type NameMatch = NameMatchValue;

/** A row of the per-company verified beneficiary registry. */
export type VerifiedBeneficiary = VerifiedBeneficiaryRecord;

/**
 * One line of the payment run. The composite is the one in docs/09-api.md, built out
 * of domain types and nothing else, so the API returns it unchanged. `supplier` is
 * optional because an instruction can arrive for an RFC we have never invoiced with,
 * which is itself the interesting case.
 */
export interface PaymentRunItem {
  instruction: PaymentInstruction;
  supplier?: Supplier;
  decision?: Decision;
  findings: Finding[];
}

export interface LedgerReadOptions {
  /**
   * Exclusive lower bound on the event instant, ISO 8601. Exclusive because the
   * timeline asks for "everything after the last event I have", and inclusive
   * would hand it that event a second time on every poll.
   */
  since?: string;
  limit?: number;
}

/** What `GET /api/v1/ledger` answers when the caller sets no limit. */
export const DEFAULT_LEDGER_LIMIT = 500;

/**
 * The evidence rank of a known account, as SQL. A verified CEP beats a payment
 * complement, which beats a prior instruction, and an upsert never moves an
 * account down this ladder: an account established by a CEP stays established
 * by the CEP when a later instruction arrives on it.
 */
const EVIDENCE_RANK_EXCLUDED =
  "case excluded.established_by when 'cep' then 3 when 'payment_complement' then 2 else 1 end";
const EVIDENCE_RANK_CURRENT =
  "case known_accounts.established_by when 'cep' then 3 when 'payment_complement' then 2 else 1 end";

// --- Event ledger ----------------------------------------------------------

/**
 * Appends one event. The ledger is the system of record and every other table in
 * 0003 is a projection of it, so this is the write that must never fail silently.
 *
 * `payload` is the event with `type` and `at` removed, so the discriminant is
 * not stored twice. `event_id` and `seq` are generated by the server.
 */
export async function appendLedgerEvent(
  sql: Db,
  event: LedgerEvent,
): Promise<void> {
  const row = ledgerEventToRow(event);
  await sql`
    insert into ledger_events (at, type, payload)
    values (${row.at}::timestamptz, ${row.type}, ${sql.json(json(row.payload))})
  `;
}

/**
 * Appends a batch in insert order, chunked like insertLedgerTx.
 *
 * No `on conflict` clause: two identical events at the same instant are two real
 * events, and collapsing them would break the replay. Returns how many were written.
 */
export async function appendLedgerEvents(
  sql: Db,
  events: readonly LedgerEvent[],
  chunkSize: number = DEFAULT_CHUNK_SIZE,
): Promise<number> {
  let written = 0;
  for (const batch of chunk(events, chunkSize)) {
    const rows = batch.map(ledgerEventToRow);
    const result =
      await sql`insert into ledger_events ${sql(driverRows(rows))}`;
    written += result.count;
  }
  return written;
}

/**
 * Reads the ledger in append order, which is what the timeline and the retroactive
 * sweep both consume.
 *
 * `seq` breaks ties inside the same instant, which matters because the generator
 * emits a CFDI and its complement on the same timestamp far more often than real
 * life does. Rows are rehydrated into the LedgerEvent union by putting `type` and
 * `at` back onto the payload.
 */
export async function readLedger(
  sql: Db,
  options: LedgerReadOptions = {},
): Promise<LedgerEvent[]> {
  const since = options.since ?? null;
  const limit = options.limit ?? DEFAULT_LEDGER_LIMIT;
  const rows = await sql<LedgerEventRow[]>`
    select at, type, payload from ledger_events
    where at > coalesce(${since}::timestamptz, '-infinity'::timestamptz)
    order by at asc, seq asc
    limit ${limit}
  `;
  return rows.map(ledgerEventFromRow);
}

/** How many events the ledger holds, for the doctor and the seed summary. */
export async function countLedgerEvents(sql: Db): Promise<number> {
  const rows = await sql<{ count: number }[]>`
    select count(*)::int as count from ledger_events
  `;
  return rows[0]?.count ?? 0;
}

// --- Suppliers and their accounts ------------------------------------------

/**
 * Upserts the supplier and its known accounts in one transaction.
 *
 * `least` on the first invoice matters: back-filling eight months of history after
 * the supplier row already exists has to move the date earlier, never later, or the
 * supplier_behaviour detector sees a brand new supplier that has been there all year.
 * The accounts keep the strongest evidence and the larger payment count, so a
 * second load of the same supplier is a no-op rather than a downgrade.
 */
export async function upsertSupplier(
  sql: Db,
  supplier: Supplier,
): Promise<void> {
  const row = supplierToRow(supplier);
  await transact(sql, async (tx) => {
    await tx`
      insert into suppliers (rfc, legal_name, first_invoice_at, delay_cost_per_day, synthetic)
      values (${row.rfc}, ${row.legal_name}, ${row.first_invoice_at}::timestamptz,
              ${row.delay_cost_per_day}, ${row.synthetic})
      on conflict (rfc) do update set
        legal_name = excluded.legal_name,
        first_invoice_at = least(suppliers.first_invoice_at, excluded.first_invoice_at),
        delay_cost_per_day = coalesce(excluded.delay_cost_per_day, suppliers.delay_cost_per_day),
        synthetic = excluded.synthetic
    `;
    for (const account of supplier.knownAccounts) {
      const known = knownAccountToRow(supplier.rfc, account);
      await tx.unsafe(
        `insert into known_accounts (supplier_rfc, clabe, established_by, established_at, times_paid)
         values ($1, $2, $3, $4::timestamptz, $5)
         on conflict (supplier_rfc, clabe) do update set
           times_paid = greatest(known_accounts.times_paid, excluded.times_paid),
           established_at = case
             when ${EVIDENCE_RANK_EXCLUDED} > ${EVIDENCE_RANK_CURRENT}
               then excluded.established_at else known_accounts.established_at end,
           established_by = case
             when ${EVIDENCE_RANK_EXCLUDED} > ${EVIDENCE_RANK_CURRENT}
               then excluded.established_by else known_accounts.established_by end`,
        [
          known.supplier_rfc,
          known.clabe,
          known.established_by,
          known.established_at,
          known.times_paid,
        ],
      );
    }
  });
}

/**
 * Records an account we now have evidence for. Idempotent, and it never downgrades
 * the evidence: an account established by a verified CEP stays established by the
 * CEP even when a later instruction arrives on it. `times_paid` accumulates, so
 * recording the same payment twice is the caller's bug and not this function's.
 */
export async function recordKnownAccount(
  sql: Db,
  supplierRfc: Rfc,
  account: KnownAccount,
): Promise<void> {
  const known = knownAccountToRow(supplierRfc, account);
  await sql.unsafe(
    `insert into known_accounts (supplier_rfc, clabe, established_by, established_at, times_paid)
     values ($1, $2, $3, $4::timestamptz, $5)
     on conflict (supplier_rfc, clabe) do update set
       times_paid = known_accounts.times_paid + excluded.times_paid,
       established_at = case
         when ${EVIDENCE_RANK_EXCLUDED} > ${EVIDENCE_RANK_CURRENT}
           then excluded.established_at else known_accounts.established_at end,
       established_by = case
         when ${EVIDENCE_RANK_EXCLUDED} > ${EVIDENCE_RANK_CURRENT}
           then excluded.established_by else known_accounts.established_by end`,
    [
      known.supplier_rfc,
      known.clabe,
      known.established_by,
      known.established_at,
      known.times_paid,
    ],
  );
}

/**
 * The supplier with its accounts, most recent first, or undefined when we have never
 * seen the RFC.
 *
 * The `filter` on the aggregate is the part that matters: without it a supplier with
 * no known account comes back with a one-element array of nulls, which the forensics
 * detector would happily compare against.
 */
export async function getSupplier(
  sql: Db,
  rfc: Rfc,
): Promise<Supplier | undefined> {
  const rows = await selectSuppliers(sql, [rfc]);
  return rows[0];
}

/** Every supplier with its accounts, ordered by legal name. Same join as getSupplier. */
export async function listSuppliers(sql: Db): Promise<Supplier[]> {
  const rows = await sql<SupplierRow[]>`
    select s.rfc, s.legal_name, s.first_invoice_at, s.delay_cost_per_day, s.synthetic,
           coalesce(
             json_agg(
               json_build_object(
                 'clabe', k.clabe,
                 'established_by', k.established_by,
                 'established_at', k.established_at,
                 'times_paid', k.times_paid)
               order by k.established_at desc, k.clabe asc)
             filter (where k.clabe is not null),
             '[]') as accounts
    from suppliers s
    left join known_accounts k on k.supplier_rfc = s.rfc
    group by s.rfc
    order by s.legal_name asc, s.rfc asc
  `;
  return rows.map(supplierFromRow);
}

/** The suppliers behind a set of RFCs, in the order asked for. Unknown RFCs are skipped. */
export async function selectSuppliers(
  sql: Db,
  rfcs: readonly Rfc[],
): Promise<Supplier[]> {
  if (rfcs.length === 0) {
    return [];
  }
  const rows = await sql<SupplierRow[]>`
    select s.rfc, s.legal_name, s.first_invoice_at, s.delay_cost_per_day, s.synthetic,
           coalesce(
             json_agg(
               json_build_object(
                 'clabe', k.clabe,
                 'established_by', k.established_by,
                 'established_at', k.established_at,
                 'times_paid', k.times_paid)
               order by k.established_at desc, k.clabe asc)
             filter (where k.clabe is not null),
             '[]') as accounts
    from suppliers s
    left join known_accounts k on k.supplier_rfc = s.rfc
    where s.rfc = any(${[...rfcs]}::text[])
    group by s.rfc
  `;
  const byRfc = new Map(rows.map((row) => [row.rfc, supplierFromRow(row)]));
  const ordered: Supplier[] = [];
  for (const rfc of rfcs) {
    const supplier = byRfc.get(rfc);
    if (supplier !== undefined) {
      ordered.push(supplier);
    }
  }
  return ordered;
}

// --- CFDI and payment complements ------------------------------------------

/**
 * Inserts invoices, chunked, skipping UUIDs already stored.
 *
 * `do nothing` rather than `do update`: a CFDI is immutable once it is timbrado, so
 * a second copy of the same UUID is a re-ingest and never a correction.
 */
export async function insertCfdis(
  sql: Db,
  cfdis: readonly Cfdi[],
  chunkSize: number = DEFAULT_CHUNK_SIZE,
): Promise<number> {
  let written = 0;
  for (const batch of chunk(cfdis, chunkSize)) {
    const rows = batch.map(cfdiToRow);
    const result = await sql`
      insert into cfdis ${sql(rows)}
      on conflict (uuid) do nothing
    `;
    written += result.count;
  }
  return written;
}

const CFDI_COLUMNS = `uuid, serie, folio, issued_at, issuer_rfc, issuer_name, receiver_rfc,
  subtotal, iva, total, payment_method, payment_form, synthetic`;

/**
 * The invoice history of one supplier, newest first. This is the series the
 * supplier_behaviour detector reads. Served by cfdis_issuer_time.
 */
export async function listCfdisByIssuer(
  sql: Db,
  rfc: Rfc,
  window: { from?: string; to?: string } = {},
): Promise<Cfdi[]> {
  const rows = await sql.unsafe<CfdiRow[]>(
    `select ${CFDI_COLUMNS} from cfdis
     where issuer_rfc = $1
       and issued_at >= coalesce($2::timestamptz, '-infinity'::timestamptz)
       and issued_at <  coalesce($3::timestamptz, 'infinity'::timestamptz)
     order by issued_at desc, uuid asc`,
    [rfc, window.from ?? null, window.to ?? null],
  );
  return rows.map(cfdiFromRow);
}

/**
 * Every CFDI the company holds, oldest first. The concentration signal of the
 * behaviour detector needs the whole ledger as its denominator, so the API reads
 * all of it rather than one supplier's slice.
 */
export async function listCfdis(sql: Db): Promise<Cfdi[]> {
  const rows = await sql.unsafe<CfdiRow[]>(
    `select ${CFDI_COLUMNS} from cfdis order by issued_at asc, uuid asc`,
  );
  return rows.map(cfdiFromRow);
}

/** The invoices behind a set of UUIDs, in issue order. Unknown UUIDs are skipped. */
export async function listCfdisByUuid(
  sql: Db,
  uuids: readonly string[],
): Promise<Cfdi[]> {
  if (uuids.length === 0) {
    return [];
  }
  const rows = await sql.unsafe<CfdiRow[]>(
    `select ${CFDI_COLUMNS} from cfdis
     where uuid = any($1::uuid[])
     order by issued_at asc, uuid asc`,
    [[...uuids]],
  );
  return rows.map(cfdiFromRow);
}

/**
 * Inserts complements, chunked.
 *
 * A complement whose `beneficiary_account` is new is the legitimate way an account
 * changes, so this write is what feeds recordKnownAccount with `payment_complement`.
 */
export async function insertPaymentComplements(
  sql: Db,
  complements: readonly PaymentComplement[],
  chunkSize: number = DEFAULT_CHUNK_SIZE,
): Promise<number> {
  let written = 0;
  for (const batch of chunk(complements, chunkSize)) {
    const rows = batch.map(complementToRow);
    const result = await sql`
      insert into payment_complements ${sql(rows)}
      on conflict (uuid) do nothing
    `;
    written += result.count;
  }
  return written;
}

const COMPLEMENT_COLUMNS = `uuid, related_cfdi_uuid, paid_at, paid_amount, payment_total,
  operation_number, beneficiary_account, beneficiary_bank_rfc, synthetic`;

/** Complements for a set of invoices, oldest payment first. */
export async function listComplementsForCfdis(
  sql: Db,
  cfdiUuids: readonly string[],
): Promise<PaymentComplement[]> {
  if (cfdiUuids.length === 0) {
    return [];
  }
  const rows = await sql.unsafe<PaymentComplementRow[]>(
    `select ${COMPLEMENT_COLUMNS} from payment_complements
     where related_cfdi_uuid = any($1::uuid[])
     order by paid_at asc, uuid asc`,
    [[...cfdiUuids]],
  );
  return rows.map(complementFromRow);
}

/** Every complement the company holds, oldest payment first. */
export async function listPaymentComplements(
  sql: Db,
): Promise<PaymentComplement[]> {
  const rows = await sql.unsafe<PaymentComplementRow[]>(
    `select ${COMPLEMENT_COLUMNS} from payment_complements
     order by paid_at asc, uuid asc`,
  );
  return rows.map(complementFromRow);
}

// --- Instructions, findings and decisions ----------------------------------

/**
 * Stores an intake. `on conflict (id) do nothing`, so re-assessing an instruction
 * that is already stored (the seed does this) never rewrites what arrived.
 */
export async function insertInstruction(
  sql: Db,
  instruction: PaymentInstruction,
): Promise<void> {
  const row = instructionToRow(instruction);
  await sql`
    insert into instructions (id, supplier_rfc, cfdi_uuids, clabe, amount, source,
      received_at, message_text, image_ref, audio_ref, ocr_confidence, sent_at, synthetic)
    values (${row.id}, ${row.supplier_rfc}, ${row.cfdi_uuids}::uuid[], ${row.clabe},
      ${row.amount}, ${row.source}, ${row.received_at}::timestamptz, ${row.message_text},
      ${row.image_ref}, ${row.audio_ref}, ${row.ocr_confidence}, ${row.sent_at}::timestamptz,
      ${row.synthetic})
    on conflict (id) do nothing
  `;
}

/** Inserts a batch of instructions, chunked, skipping ids already stored. */
export async function insertInstructions(
  sql: Db,
  instructions: readonly PaymentInstruction[],
  chunkSize: number = DEFAULT_CHUNK_SIZE,
): Promise<number> {
  let written = 0;
  for (const batch of chunk(instructions, chunkSize)) {
    const rows = batch.map(instructionToRow);
    const result = await sql`
      insert into instructions ${sql(rows)}
      on conflict (id) do nothing
    `;
    written += result.count;
  }
  return written;
}

const INSTRUCTION_COLUMNS = `id, supplier_rfc, cfdi_uuids::text[] as cfdi_uuids, clabe, amount,
  source, received_at, message_text, image_ref, audio_ref, ocr_confidence, sent_at, synthetic`;

export async function getInstruction(
  sql: Db,
  id: string,
): Promise<PaymentInstruction | undefined> {
  const rows = await sql.unsafe<InstructionRow[]>(
    `select ${INSTRUCTION_COLUMNS} from instructions where id = $1`,
    [id],
  );
  const row = rows[0];
  return row === undefined ? undefined : instructionFromRow(row);
}

/** Instructions of one supplier, newest first. */
export async function listInstructionsBySupplier(
  sql: Db,
  rfc: Rfc,
): Promise<PaymentInstruction[]> {
  const rows = await sql.unsafe<InstructionRow[]>(
    `select ${INSTRUCTION_COLUMNS} from instructions
     where supplier_rfc = $1
     order by received_at desc, id asc`,
    [rfc],
  );
  return rows.map(instructionFromRow);
}

/**
 * Instructions that carry no decision yet, oldest first. The seed loads a whole
 * run and then assesses it through the same pipeline an intake uses, and this is
 * how it finds what is still pending; a resumed seed picks up where it stopped.
 */
export async function listUnassessedInstructions(
  sql: Db,
): Promise<PaymentInstruction[]> {
  const rows = await sql.unsafe<InstructionRow[]>(
    `select ${INSTRUCTION_COLUMNS} from instructions i
     where not exists (select 1 from decisions d where d.instruction_id = i.id)
     order by received_at asc, id asc`,
  );
  return rows.map(instructionFromRow);
}

/**
 * Projects a `payment_sent` event onto its instruction. The column is a
 * convenience for the run screen; the event is the record.
 */
export async function markInstructionSent(
  sql: Db,
  instructionId: string,
  sentAt: string,
): Promise<void> {
  await sql`
    update instructions
    set sent_at = least(coalesce(sent_at, ${sentAt}::timestamptz), ${sentAt}::timestamptz)
    where id = ${instructionId}
  `;
}

/**
 * The Monday of the week the newest instruction was received in, "YYYY-MM-DD",
 * cut in Monterrey time. This is the week `GET /api/v1/run/current` shows, so a
 * demo on a Sunday still opens on the run that was seeded on the Thursday.
 * Undefined when there is no instruction at all.
 */
export async function latestRunWeek(
  sql: Db,
  timeZone: string = DEFAULT_TIME_ZONE,
): Promise<string | undefined> {
  const rows = await sql<{ week_of: string | null }[]>`
    select to_char(
             date_trunc('week', max(received_at) at time zone ${timeZone}::text),
             'YYYY-MM-DD') as week_of
    from instructions
  `;
  return rows[0]?.week_of ?? undefined;
}

/**
 * The week's payment run, assembled for GET /api/v1/run/current.
 *
 * Four reads instead of one lateral join, because the assembled shape has three
 * one-to-many arms (accounts, decision findings, subject findings) and one query
 * that fans all three out multiplies rows and hides which arm was empty.
 *
 * `decisions` keeps one row per decision moment, so the current decision is the
 * newest row and not the only row: `distinct on` takes it. A run line's findings
 * are the ones that justified its current decision plus any later finding whose
 * subject is the instruction itself. The rail is sorted by amountAtRisk in
 * @hackmty/core and not here, because that ordering is a product judgement and
 * belongs with the rest of them.
 */
export async function currentPaymentRun(
  sql: Db,
  weekOf: string,
  timeZone: string = DEFAULT_TIME_ZONE,
): Promise<PaymentRunItem[]> {
  const instructionRows = await sql.unsafe<InstructionRow[]>(
    `select ${INSTRUCTION_COLUMNS} from instructions
     where received_at >= ($1::date::timestamp at time zone $2)
       and received_at <  (($1::date + 7)::timestamp at time zone $2)
     order by received_at asc, id asc`,
    [weekOf, timeZone],
  );
  const instructions = instructionRows.map(instructionFromRow);
  if (instructions.length === 0) {
    return [];
  }

  const rfcs = [...new Set(instructions.map((row) => row.supplierRfc))];
  const suppliers = new Map(
    (await selectSuppliers(sql, rfcs)).map((supplier) => [
      supplier.rfc,
      supplier,
    ]),
  );
  const ids = instructions.map((row) => row.id);
  const decisions = await latestDecisions(sql, ids);
  const subjectFindings = await findingsForSubjects(sql, "instruction", ids);

  return instructions.map((instruction) => {
    const decision = decisions.get(instruction.id);
    const seen = new Set<string>();
    const findings: Finding[] = [];
    for (const finding of [
      ...(decision?.findings ?? []),
      ...(subjectFindings.get(instruction.id) ?? []),
    ]) {
      if (!seen.has(finding.id)) {
        seen.add(finding.id);
        findings.push(finding);
      }
    }
    const item: PaymentRunItem = { instruction, findings };
    const supplier = suppliers.get(instruction.supplierRfc);
    if (supplier !== undefined) {
      item.supplier = supplier;
    }
    if (decision !== undefined) {
      item.decision = decision;
    }
    return item;
  });
}

/**
 * Stores findings, chunked, skipping ids already stored.
 *
 * `evidence` goes in as the object and the driver serialises it once for the
 * jsonb column. A finding id is deterministic on its evidence in core, so a
 * re-run of the same detectors over the same documents is a no-op here.
 */
export async function insertFindings(
  sql: Db,
  findings: readonly Finding[],
  chunkSize: number = DEFAULT_CHUNK_SIZE,
): Promise<number> {
  let written = 0;
  for (const batch of chunk(findings, chunkSize)) {
    const rows = batch.map(findingToRow);
    const result = await sql`
      insert into findings ${sql(driverRows(rows))}
      on conflict (id) do nothing
    `;
    written += result.count;
  }
  return written;
}

const FINDING_COLUMNS = `id, detector, severity, state, subject_kind, subject_id,
  amount_at_risk, explanation, evidence, created_at`;

/**
 * Findings attached to one subject, newest first. Served by findings_subject.
 * A CFDI uuid is matched in the case it is stored in, so a caller holding the
 * uppercase form the SAT prints finds the same rows as one holding the
 * lowercase form the database returns.
 */
export async function findingsFor(
  sql: Db,
  kind: Finding["subject"]["kind"],
  id: string,
): Promise<Finding[]> {
  const rows = await sql.unsafe<FindingRow[]>(
    `select ${FINDING_COLUMNS} from findings
     where subject_kind = $1 and subject_id = $2
     order by created_at desc, id asc`,
    [kind, subjectIdForStorage(kind, id)],
  );
  return rows.map(findingFromRow);
}

/** Findings for many subjects of one kind at once, grouped by subject id, newest first. */
export async function findingsForSubjects(
  sql: Db,
  kind: Finding["subject"]["kind"],
  ids: readonly string[],
): Promise<Map<string, Finding[]>> {
  const grouped = new Map<string, Finding[]>();
  if (ids.length === 0) {
    return grouped;
  }
  const wanted = new Map(ids.map((id) => [subjectIdForStorage(kind, id), id]));
  const rows = await sql.unsafe<FindingRow[]>(
    `select ${FINDING_COLUMNS} from findings
     where subject_kind = $1 and subject_id = any($2::text[])
     order by created_at desc, id asc`,
    [kind, [...wanted.keys()]],
  );
  for (const row of rows) {
    const finding = findingFromRow(row);
    // Grouped under the id the caller asked with, whatever case it used.
    const key = wanted.get(finding.subject.id) ?? finding.subject.id;
    const list = grouped.get(key) ?? [];
    list.push(finding);
    grouped.set(key, list);
  }
  return grouped;
}

/**
 * Everything that touches one supplier: findings on the supplier itself, on any
 * of its invoices, and on any instruction that pays it. Newest first. This is
 * the supplier drawer's list.
 *
 * The invoice arm lowercases the stored subject id before comparing it with
 * `uuid::text`, which Postgres always renders lowercase. Without that, a
 * finding minted from a parsed CFDI (uppercase, the way the SAT prints the
 * folio fiscal) would never match its own invoice and would vanish from the
 * drawer with no error.
 */
export async function findingsForSupplier(
  sql: Db,
  rfc: Rfc,
): Promise<Finding[]> {
  const rows = await sql.unsafe<FindingRow[]>(
    `select ${FINDING_COLUMNS} from findings f
     where (f.subject_kind = 'supplier' and f.subject_id = $1)
        or (f.subject_kind = 'cfdi' and lower(f.subject_id) in
              (select uuid::text from cfdis where issuer_rfc = $1))
        or (f.subject_kind = 'instruction' and f.subject_id in
              (select id from instructions where supplier_rfc = $1))
     order by f.created_at desc, f.id asc`,
    [rfc],
  );
  return rows.map(findingFromRow);
}

/**
 * Writes a decision and the findings that justified it, in one transaction, and
 * returns the generated decision id.
 *
 * The join table exists so the exact set can be rebuilt later, even after the
 * detectors change and would produce a different set today. The findings must
 * already be stored: the foreign key refuses a decision that cites evidence the
 * database does not hold, which is the loud failure this table wants.
 */
export async function insertDecision(
  sql: Db,
  decision: Decision,
): Promise<number> {
  return transact(sql, async (tx) => {
    const rows = await tx<{ id: string | number }[]>`
      insert into decisions (instruction_id, action, expected_loss,
        delay_cost_per_day, decided_at, decided_by)
      values (${decision.instructionId}, ${decision.action}, ${decision.expectedLoss},
        ${decision.delayCostPerDay}, ${decision.decidedAt}::timestamptz,
        ${decision.decidedBy ?? null})
      returning id
    `;
    const id = Number(rows[0]?.id);
    if (!Number.isFinite(id)) {
      throw new Error("the decision insert returned no id");
    }
    const findingIds = [...new Set(decision.findings.map((row) => row.id))];
    if (findingIds.length > 0) {
      await tx`
        insert into decision_findings (decision_id, finding_id)
        select ${id}, unnest(${findingIds}::text[])
        on conflict do nothing
      `;
    }
    return id;
  });
}

const DECISION_SELECT = `
  select d.id, d.instruction_id, d.action, d.expected_loss, d.delay_cost_per_day,
         d.decided_at, d.decided_by,
         coalesce(
           json_agg(
             json_build_object(
               'id', f.id, 'detector', f.detector, 'severity', f.severity,
               'state', f.state, 'subject_kind', f.subject_kind,
               'subject_id', f.subject_id, 'amount_at_risk', f.amount_at_risk,
               'explanation', f.explanation, 'evidence', f.evidence,
               'created_at', f.created_at)
             order by f.amount_at_risk desc, f.id asc)
           filter (where f.id is not null),
           '[]') as findings
  from decisions d
  left join decision_findings df on df.decision_id = d.id
  left join findings f on f.id = df.finding_id`;

/**
 * The current decision for an instruction, with its findings rehydrated. The
 * newest row wins: a clerk can hold on Thursday and release on Friday, and both
 * rows survive in the history.
 */
export async function latestDecision(
  sql: Db,
  instructionId: string,
): Promise<Decision | undefined> {
  const found = await latestDecisions(sql, [instructionId]);
  return found.get(instructionId);
}

/** The current decision for each of many instructions, keyed by instruction id. */
export async function latestDecisions(
  sql: Db,
  instructionIds: readonly string[],
): Promise<Map<string, Decision>> {
  const decisions = new Map<string, Decision>();
  if (instructionIds.length === 0) {
    return decisions;
  }
  const rows = await sql.unsafe<DecisionRow[]>(
    `select * from (
       select distinct on (instruction_id) *
       from (${DECISION_SELECT}
             where d.instruction_id = any($1::text[])
             group by d.id) grouped
       order by instruction_id, decided_at desc, id desc
     ) latest`,
    [[...instructionIds]],
  );
  for (const row of rows) {
    decisions.set(row.instruction_id, decisionFromRow(row));
  }
  return decisions;
}

// --- SAT Article 69-B list --------------------------------------------------

/**
 * Loads one published version of the list, in a transaction.
 *
 * Versions are never rewritten in place. A corrected download is a new version,
 * which is what makes "what did we know on the day we paid" answerable at all.
 * Loading the same version twice adds the rows that were missing and refreshes
 * the count. Returns how many entry rows were written.
 */
export async function insertSatListVersion(
  sql: Db,
  version: SatListVersionRow,
  entries: readonly SatListEntry[],
  chunkSize: number = DEFAULT_CHUNK_SIZE,
): Promise<number> {
  return transact(sql, async (tx) => {
    await tx`
      insert into sat_list_versions (list_version, published_at, row_count, source)
      values (${version.listVersion}, ${version.publishedAt.slice(0, 10)}::date,
              ${version.rows}, ${version.source})
      on conflict (list_version) do update set
        row_count = excluded.row_count,
        published_at = excluded.published_at,
        source = excluded.source
    `;
    let written = 0;
    for (const batch of chunk(entries, chunkSize)) {
      const rows = batch.map(satEntryToRow);
      const result = await tx`
        insert into sat_list_entries ${tx(rows)}
        on conflict (list_version, rfc, status) do nothing
      `;
      written += result.count;
    }
    return written;
  });
}

/**
 * Every row the list has ever carried for one RFC, newest publication first. This is
 * what GET /api/v1/sat/lookup?rfc= serves, and it is read-only over the official
 * list, which is why a judge can type a real RFC into it without any synthetic data
 * being attached to the answer.
 *
 * The RFC must be normalised by the caller, uppercase with no spaces or hyphens; see
 * normalizeRfc in @hackmty/sat. Served by sat_list_entries_rfc.
 */
export async function lookupSatEntries(
  sql: Db,
  rfc: Rfc,
): Promise<SatListEntry[]> {
  const rows = await sql<SatListEntryRow[]>`
    select list_version, rfc, name, status, published_at::text as published_at
    from sat_list_entries
    where rfc = ${rfc}
    order by published_at desc, list_version desc, status asc
  `;
  return rows.map(satEntryFromRow);
}

/** Every entry of one version, in file order as far as the key allows. */
export async function listSatEntries(
  sql: Db,
  listVersion: string,
): Promise<SatListEntry[]> {
  const rows = await sql<SatListEntryRow[]>`
    select list_version, rfc, name, status, published_at::text as published_at
    from sat_list_entries
    where list_version = ${listVersion}
    order by rfc asc, status asc
  `;
  return rows.map(satEntryFromRow);
}

/** Loaded versions, newest publication first. */
export async function listSatVersions(sql: Db): Promise<SatListVersionRow[]> {
  const rows = await sql<
    {
      list_version: string;
      published_at: string;
      row_count: number;
      source: string;
    }[]
  >`
    select list_version, published_at::text as published_at, row_count, source
    from sat_list_versions
    order by published_at desc, list_version desc
  `;
  return rows.map((row) => ({
    listVersion: row.list_version,
    publishedAt: row.published_at.slice(0, 10),
    rows: row.row_count,
    source: row.source,
  }));
}

// --- Verified beneficiary registry -----------------------------------------

/**
 * Stores the evidence from a CEP verification.
 *
 * `cep_xml` is bytea and the XML goes in byte-exact: an XMLDSig signature validates
 * over the bytes Banxico served, so canonicalising, re-encoding or trimming the
 * payload destroys the only thing that makes this row evidence rather than a claim.
 * Passing it as base64 and decoding server-side is what stops the driver from
 * picking an encoding on our behalf.
 */
export async function upsertVerifiedBeneficiary(
  sql: Db,
  entry: VerifiedBeneficiary,
): Promise<void> {
  const { cep } = entry;
  await sql`
    insert into verified_beneficiaries (supplier_rfc, clabe, clave_rastreo,
      transferred_at, amount, sender_name, sender_bank, sender_account,
      beneficiary_name, beneficiary_bank, beneficiary_rfc, concepto,
      numero_certificado, signature_valid, signature_reason, name_match,
      cep_xml, verified_at, synthetic)
    values (${entry.supplierRfc}, ${entry.clabe}, ${cep.claveRastreo},
      ${cep.transferredAt}::timestamptz, ${cep.amount}, ${cep.senderName},
      ${cep.senderBank}, ${cep.senderAccount ?? null}, ${cep.beneficiaryName},
      ${cep.beneficiaryBank}, ${cep.beneficiaryRfc ?? null}, ${cep.concepto ?? null},
      ${cep.numeroCertificado ?? null}, ${cep.signatureValid},
      ${cep.signatureReason ?? null}, ${entry.nameMatch},
      decode(${encodeBase64(cep.xml)}, 'base64'), ${entry.verifiedAt}::timestamptz,
      ${cep.synthetic})
    on conflict (supplier_rfc, clabe) do update set
      clave_rastreo = excluded.clave_rastreo,
      transferred_at = excluded.transferred_at,
      amount = excluded.amount,
      sender_name = excluded.sender_name,
      sender_bank = excluded.sender_bank,
      sender_account = excluded.sender_account,
      beneficiary_name = excluded.beneficiary_name,
      beneficiary_bank = excluded.beneficiary_bank,
      beneficiary_rfc = excluded.beneficiary_rfc,
      concepto = excluded.concepto,
      numero_certificado = excluded.numero_certificado,
      signature_valid = excluded.signature_valid,
      signature_reason = excluded.signature_reason,
      name_match = excluded.name_match,
      cep_xml = excluded.cep_xml,
      verified_at = excluded.verified_at,
      synthetic = excluded.synthetic
  `;
}

const BENEFICIARY_COLUMNS = `supplier_rfc, clabe, clave_rastreo, transferred_at, amount,
  sender_name, sender_bank, sender_account, beneficiary_name, beneficiary_bank,
  beneficiary_rfc, concepto, numero_certificado, signature_valid, signature_reason,
  name_match, encode(cep_xml, 'base64') as cep_xml_b64, verified_at, synthetic`;

/** The registry, newest first, for GET /api/v1/beneficiaries. */
export async function listVerifiedBeneficiaries(
  sql: Db,
): Promise<VerifiedBeneficiary[]> {
  const rows = await sql.unsafe<VerifiedBeneficiaryRow[]>(
    `select ${BENEFICIARY_COLUMNS} from verified_beneficiaries
     order by verified_at desc, supplier_rfc asc, clabe asc`,
  );
  return rows.map(beneficiaryFromRow);
}

/** The verified accounts of one supplier, newest first, for the supplier drawer. */
export async function listVerifiedBeneficiariesFor(
  sql: Db,
  supplierRfc: Rfc,
): Promise<VerifiedBeneficiary[]> {
  const rows = await sql.unsafe<VerifiedBeneficiaryRow[]>(
    `select ${BENEFICIARY_COLUMNS} from verified_beneficiaries
     where supplier_rfc = $1
     order by verified_at desc, clabe asc`,
    [supplierRfc],
  );
  return rows.map(beneficiaryFromRow);
}

/**
 * Is this exact account already verified for this exact supplier. The beneficiary_cep
 * detector asks this before it asks anything else.
 */
export async function getVerifiedBeneficiary(
  sql: Db,
  supplierRfc: Rfc,
  clabe: Clabe,
): Promise<VerifiedBeneficiary | undefined> {
  const rows = await sql.unsafe<VerifiedBeneficiaryRow[]>(
    `select ${BENEFICIARY_COLUMNS} from verified_beneficiaries
     where supplier_rfc = $1 and clabe = $2`,
    [supplierRfc, clabe],
  );
  const row = rows[0];
  return row === undefined ? undefined : beneficiaryFromRow(row);
}

// --- Maintenance ------------------------------------------------------------

/** Row counts per Ceptinela table, for the doctor and the seed summary. */
export interface CeptinelaCounts {
  suppliers: number;
  knownAccounts: number;
  cfdis: number;
  complements: number;
  instructions: number;
  findings: number;
  decisions: number;
  satVersions: number;
  satEntries: number;
  beneficiaries: number;
  events: number;
}

export async function countCeptinela(sql: Db): Promise<CeptinelaCounts> {
  const rows = await sql<
    {
      suppliers: number;
      known_accounts: number;
      cfdis: number;
      complements: number;
      instructions: number;
      findings: number;
      decisions: number;
      sat_versions: number;
      sat_entries: number;
      beneficiaries: number;
      events: number;
    }[]
  >`
    select
      (select count(*)::int from suppliers) as suppliers,
      (select count(*)::int from known_accounts) as known_accounts,
      (select count(*)::int from cfdis) as cfdis,
      (select count(*)::int from payment_complements) as complements,
      (select count(*)::int from instructions) as instructions,
      (select count(*)::int from findings) as findings,
      (select count(*)::int from decisions) as decisions,
      (select count(*)::int from sat_list_versions) as sat_versions,
      (select count(*)::int from sat_list_entries) as sat_entries,
      (select count(*)::int from verified_beneficiaries) as beneficiaries,
      (select count(*)::int from ledger_events) as events
  `;
  const row = rows[0];
  return {
    suppliers: row?.suppliers ?? 0,
    knownAccounts: row?.known_accounts ?? 0,
    cfdis: row?.cfdis ?? 0,
    complements: row?.complements ?? 0,
    instructions: row?.instructions ?? 0,
    findings: row?.findings ?? 0,
    decisions: row?.decisions ?? 0,
    satVersions: row?.sat_versions ?? 0,
    satEntries: row?.sat_entries ?? 0,
    beneficiaries: row?.beneficiaries ?? 0,
    events: row?.events ?? 0,
  };
}

/**
 * Empties every Ceptinela table. Destructive, and called only by scripts/reset.ts
 * and the guarded `POST /api/v1/seed`, the same as truncateLedger.
 *
 * `truncate` and not `delete` on ledger_events: the append-only rules in 0003 turn a
 * DELETE into a no-op, and truncate is not routed through the rule system.
 */
export async function truncateCeptinela(sql: Db): Promise<void> {
  await sql`
    truncate table ledger_events, decision_findings, decisions, findings,
      instructions, payment_complements, cfdis, verified_beneficiaries,
      known_accounts, sat_list_entries, sat_list_versions, suppliers
    restart identity
  `;
}
