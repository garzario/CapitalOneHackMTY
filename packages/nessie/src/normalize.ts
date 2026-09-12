/**
 * Nessie rows into the one ledger shape the engine reads.
 *
 * Three decisions worth knowing before you read the code:
 *
 * 1. **Time of day is assumed, and said out loud.** Nessie carries
 *    "YYYY-MM-DD" and no time at all, so an importer has to pick an instant.
 *    This one picks 12:00 UTC, which is 06:00 in Monterrey: the same calendar day
 *    in both UTC and local time, so a row never drifts across midnight in either.
 *    Anything genuinely intraday comes from our own ledger, never from here.
 * 2. **A negative purchase is a refund, so it becomes a credit.** `LedgerTx.amount`
 *    is always positive and `direction` carries the sign. A reversal posted as a
 *    negative purchase would otherwise inflate the spending total twice over.
 * 3. **Bad rows are returned, not swallowed.** The single-row functions throw, and
 *    `normalizeAll` collects the failures in `rejected` so a caller can show "3 of
 *    412 rows could not be read" instead of silently under-reporting a total.
 */

import type { LedgerTx } from "@hackmty/core";
import type {
  NessieDeposit,
  NessieMerchant,
  NessiePurchase,
  NessieWithdrawal,
} from "./types";
import { stableUuid } from "./uuid";

export const NESSIE_SOURCE = "nessie";

/** 12:00 UTC, which is 06:00 in Monterrey. See the note at the top of the file. */
export const DEFAULT_TIME_OF_DAY_MINUTES = 720;

const MS_PER_MINUTE = 60_000;

export interface NormalizeOptions {
  /**
   * The account the rows belong to. Purchases carry `payer_id`, but deposits and
   * withdrawals do not, and they are fetched per account anyway.
   */
  accountId: string;
  /** Minutes past midnight UTC to place a date-only row at. */
  timeOfDayMinutes?: number;
  /** Merchant id to category, from `buildCategoryIndex`. Gaps are normal. */
  categoryByMerchantId?: Readonly<Record<string, string>>;
}

export class NessieNormalizeError extends Error {
  readonly raw: Record<string, unknown>;

  constructor(message: string, raw: Record<string, unknown>) {
    super(message);
    this.name = "NessieNormalizeError";
    this.raw = raw;
  }
}

export interface RejectedRow {
  kind: "purchase" | "deposit" | "withdrawal";
  reason: string;
  raw: Record<string, unknown>;
}

export interface NormalizeResult {
  rows: LedgerTx[];
  rejected: RejectedRow[];
}

/** Copies an API object into a plain record, so `raw` is never a live reference. */
function toRaw(value: object): Record<string, unknown> {
  return { ...(value as Record<string, unknown>) };
}

/**
 * Turns a Nessie date into an ISO instant.
 *
 * A full instant is passed through, a "YYYY-MM-DD" date is placed at
 * `timeOfDayMinutes`.
 *
 * @throws RangeError when the value is neither.
 */
export function dateToInstant(
  value: string,
  timeOfDayMinutes: number = DEFAULT_TIME_OF_DAY_MINUTES,
): string {
  if (value.includes("T")) {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) {
      return new Date(parsed).toISOString();
    }
  }
  const day = value.slice(0, 10);
  const midnight = Date.parse(`${day}T00:00:00.000Z`);
  if (!Number.isFinite(midnight)) {
    throw new RangeError(`not a Nessie date: ${value}`);
  }
  return new Date(midnight + timeOfDayMinutes * MS_PER_MINUTE).toISOString();
}

/** Flattens the merchant category, which arrives as an array, a string, or not at all. */
export function merchantCategory(merchant: NessieMerchant): string | undefined {
  const { category } = merchant;
  if (typeof category === "string") {
    return category.trim() === "" ? undefined : category.trim();
  }
  if (Array.isArray(category)) {
    const first = category.find(
      (entry) => typeof entry === "string" && entry.trim() !== "",
    );
    return first === undefined ? undefined : first.trim();
  }
  return undefined;
}

/** Merchant id to category. Merchants with no category are simply absent. */
export function buildCategoryIndex(
  merchants: readonly NessieMerchant[],
): Record<string, string> {
  const index: Record<string, string> = {};
  for (const merchant of merchants) {
    const category = merchantCategory(merchant);
    if (merchant._id !== "" && category !== undefined) {
      index[merchant._id] = category;
    }
  }
  return index;
}

function requireId(id: unknown, raw: Record<string, unknown>): string {
  if (typeof id !== "string" || id.trim() === "") {
    // The shape of an _id is never checked, only that there is one.
    throw new NessieNormalizeError("row has no _id", raw);
  }
  return id;
}

function requireAmount(amount: unknown, raw: Record<string, unknown>): number {
  const parsed = typeof amount === "number" ? amount : Number(amount);
  if (!Number.isFinite(parsed)) {
    throw new NessieNormalizeError(
      `row has an unreadable amount: ${String(amount)}`,
      raw,
    );
  }
  return parsed;
}

export function normalizePurchase(
  purchase: NessiePurchase,
  options: NormalizeOptions,
): LedgerTx {
  const raw = toRaw(purchase);
  const id = requireId(purchase._id, raw);
  const amount = requireAmount(purchase.amount, raw);
  const merchantId =
    typeof purchase.merchant_id === "string" && purchase.merchant_id !== ""
      ? purchase.merchant_id
      : undefined;
  const category =
    merchantId === undefined
      ? undefined
      : options.categoryByMerchantId?.[merchantId];

  return {
    id: stableUuid(`nessie:purchase:${id}`),
    accountId: options.accountId,
    occurredAt: dateToInstant(purchase.purchase_date, options.timeOfDayMinutes),
    amount: Math.abs(amount),
    direction: amount < 0 ? "credit" : "debit",
    ...(merchantId === undefined ? {} : { merchantId }),
    ...(category === undefined ? {} : { category }),
    source: NESSIE_SOURCE,
    raw,
  };
}

export function normalizeDeposit(
  deposit: NessieDeposit,
  options: NormalizeOptions,
): LedgerTx {
  const raw = toRaw(deposit);
  const id = requireId(deposit._id, raw);
  const amount = requireAmount(deposit.amount, raw);

  return {
    id: stableUuid(`nessie:deposit:${id}`),
    accountId: options.accountId,
    occurredAt: dateToInstant(
      deposit.transaction_date,
      options.timeOfDayMinutes,
    ),
    amount: Math.abs(amount),
    direction: amount < 0 ? "debit" : "credit",
    source: NESSIE_SOURCE,
    raw,
  };
}

export function normalizeWithdrawal(
  withdrawal: NessieWithdrawal,
  options: NormalizeOptions,
): LedgerTx {
  const raw = toRaw(withdrawal);
  const id = requireId(withdrawal._id, raw);
  const amount = requireAmount(withdrawal.amount, raw);

  return {
    id: stableUuid(`nessie:withdrawal:${id}`),
    accountId: options.accountId,
    occurredAt: dateToInstant(
      withdrawal.transaction_date,
      options.timeOfDayMinutes,
    ),
    amount: Math.abs(amount),
    direction: amount < 0 ? "credit" : "debit",
    source: NESSIE_SOURCE,
    raw,
  };
}

export interface NormalizeInput {
  purchases?: readonly NessiePurchase[];
  deposits?: readonly NessieDeposit[];
  withdrawals?: readonly NessieWithdrawal[];
}

/**
 * Normalises every sub-collection of one account, oldest first, and reports what
 * it could not read instead of hiding it.
 */
export function normalizeAll(
  input: NormalizeInput,
  options: NormalizeOptions,
): NormalizeResult {
  const rows: LedgerTx[] = [];
  const rejected: RejectedRow[] = [];

  const collect = <T extends object>(
    kind: RejectedRow["kind"],
    items: readonly T[] | undefined,
    normalize: (item: T, options: NormalizeOptions) => LedgerTx,
  ): void => {
    for (const item of items ?? []) {
      try {
        rows.push(normalize(item, options));
      } catch (cause) {
        rejected.push({
          kind,
          reason: cause instanceof Error ? cause.message : String(cause),
          raw: toRaw(item),
        });
      }
    }
  };

  collect("purchase", input.purchases, normalizePurchase);
  collect("deposit", input.deposits, normalizeDeposit);
  collect("withdrawal", input.withdrawals, normalizeWithdrawal);
  rows.sort((left, right) => {
    if (left.occurredAt !== right.occurredAt) {
      return left.occurredAt < right.occurredAt ? -1 : 1;
    }
    // Stable tie-break, so a reimport produces the same order every time.
    return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
  });

  return { rows, rejected };
}
