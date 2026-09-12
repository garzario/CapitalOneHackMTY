/**
 * The one transaction shape the rest of the repo agrees on.
 *
 * Every source (Nessie, the synthetic generator, a future CSV import) normalises
 * into LedgerTx, and every algorithm in this package reads only LedgerTx. That is
 * what keeps the intelligence testable without a network or a database.
 */

/** Money leaving the account is a debit, money arriving is a credit. */
export type Direction = "debit" | "credit";

export interface LedgerTx {
  /**
   * Primary key, a UUID. Nessie `_id` values are not UUIDs (the pool mixes UUIDs
   * and Mongo ObjectIds), so importers derive a stable UUID and keep the original
   * identifier inside `raw`.
   */
  id: string;
  /** Account the row belongs to. Free-form because Nessie ids are not UUIDs either. */
  accountId: string;
  /**
   * ISO 8601 instant in UTC, for example 2026-09-11T18:00:00.000Z.
   *
   * Nessie carries dates with no time component at all, so anything intraday has
   * to come from our own ledger. Importers say out loud, in code, what time of day
   * they assumed.
   */
  occurredAt: string;
  /** Always positive, in major units (MXN). `direction` carries the sign. */
  amount: number;
  direction: Direction;
  /** Absent when the row has no merchant, for example payroll. */
  merchantId?: string;
  /** Absent when the source did not classify the row. Real data has gaps. */
  category?: string;
  /** Where the row came from: "nessie", "seed", "manual". */
  source: string;
  /** The original payload, kept verbatim so nothing is lost in normalisation. */
  raw: Record<string, unknown>;
}

/** A transaction plus the parsed instant, used internally by the window functions. */
export interface TimedTx {
  tx: LedgerTx;
  /** Milliseconds since the epoch, from `occurredAt`. */
  at: number;
  /** `amount` in cents, signed by `direction` is NOT applied here. */
  cents: number;
}

/**
 * Monterrey runs on UTC minus 6 all year: Mexico dropped DST nationally in 2022,
 * so there is no summer offset to handle. Daily buckets default to this offset
 * because a spending day is a local day, not a UTC day.
 */
export const MONTERREY_UTC_OFFSET_MINUTES = -360;
