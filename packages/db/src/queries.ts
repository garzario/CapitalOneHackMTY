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

import type { LedgerTx } from "@hackmty/core";
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
