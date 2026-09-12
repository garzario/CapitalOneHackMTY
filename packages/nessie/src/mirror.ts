/**
 * The company's bank mirror, pushed to Nessie with our own key and read back.
 *
 * The generator in packages/seed already builds the mirror as Nessie PURCHASES
 * against one MERCHANT per supplier, and runs every row through
 * `normalizePurchase` before it ever reaches the engine. This file pushes exactly
 * that shape, so the read-back goes through the same normaliser and the row that
 * comes out of Nessie is the row the generator produced, up to the id Nessie
 * assigns. A bare withdrawal would have been closer to the wording of the issue
 * and strictly worse: a withdrawal carries no payee, and a bank mirror with no
 * payee cannot be reconciled against a supplier.
 *
 * What is pushed is the company's BANK MIRROR: the outflows already settled on the
 * account, newest `limit` first, dated, with the payee named. That is what "the
 * outflows as withdrawals or transfers" means in substance. Never the pending
 * instructions of the current payment run, which have not left the account.
 *
 * Four rules this module holds to, all of them for a judge rather than for style:
 *
 * 1. **Nothing identifying goes up.** Synthetic names, synthetic RFCs and the
 *    company profile's own address. Everything posted with our key is readable by
 *    anyone with the key, so this is not a preference.
 * 2. **Dates are calendar days in Monterrey, never instants.** Nessie has no time
 *    component at all. The local day is taken from the row and the time of day is
 *    dropped here rather than in the API.
 * 3. **Idempotent.** Given the ids of a previous run it reuses them, lists what is
 *    already on the account, and pushes only the rows that are missing. Running it
 *    twice before a rehearsal changes nothing.
 * 4. **The key never appears.** Every error text this module propagates came out
 *    of the client, which strips the key before anything escapes it.
 */

import { createHash } from "node:crypto";
import type { LedgerTx } from "@hackmty/core";
import type { NessieClient } from "./client";
import {
  buildCategoryIndex,
  normalizeAll,
  type RejectedRow,
} from "./normalize";
import type { NessieAddress } from "./types";

/** Monterrey is UTC minus 6 all year, with no daylight-saving seam. */
export const MONTERREY_OFFSET_MINUTES = -360;

/** Monterrey city centroid, the same one scripts/seed.ts stamps on a merchant. */
export const MTY_GEOCODE = { lat: 25.6866, lng: -100.3161 } as const;

/** One nickname, so the account is recognisable in a list of other teams' rows. */
export const MIRROR_ACCOUNT_NICKNAME = "Cuenta operativa SPEI";

/**
 * Every payee on this account is a supplier, which is the only segment Nessie
 * needs. Sent as a bare string: verified on 2026-09-12, POST /merchants answers
 * `400 category str type expected` for the array that GET /merchants gives back.
 */
export const MIRROR_MERCHANT_CATEGORY = "proveedores";

/** Newest rows first, then this many. 0 means every row. */
export const DEFAULT_MIRROR_LIMIT = 200;

/** Invented street number and zip. Apodaca is real, this address is not. */
const MIRROR_STREET_NUMBER = "1200";
const MIRROR_STREET_NAME = "Avenida Miguel Aleman";
const MIRROR_ZIP = "66600";

/** How many failure messages are kept. Three is enough to see a pattern. */
const KEPT_FAILURES = 3;

/**
 * Hex characters of the key digest that are kept.
 *
 * Twelve is 48 bits, which is far more than enough to tell our two or three keys
 * apart and far too little to attack the key with. The point is only to answer
 * "was the write that validated this state made with the key I am holding now",
 * so the whole digest would be storage without a purpose.
 */
export const KEY_FINGERPRINT_LENGTH = 12;

/** Nessie account numbers are 16 digits. A CLABE is 18, so one is never the other. */
const ACCOUNT_NUMBER_LENGTH = 16;

/** The balance is rounded up to a multiple of this, so it reads as a round figure. */
const BALANCE_STEP = 100_000;

/** Headroom over the pushed outflow, so the account never goes negative. */
const BALANCE_MARGIN = 1.25;

const MS_PER_MINUTE = 60_000;

/** The company, as much of it as a bank mirror needs. */
export interface MirrorCompany {
  rfc: string;
  legalName: string;
  /** Short name. The Nessie customer is built from it, because "SA de CV" is not a surname. */
  tradeName: string;
  city: string;
  state: string;
  /** The CLABE the account number is derived from. It is never posted itself. */
  clabe: string;
  /** The local account id the mirror rows hang off, ours and not Nessie's. */
  bankAccountId: string;
}

/** One payee, as the generator names it. */
export interface MirrorMerchant {
  id: string;
  rfc: string;
  name: string;
  city: string;
}

export interface MirrorSkipped {
  /** Money coming in. The mirror is outflows only. */
  credits: number;
  /** Rows older than the limit. */
  overLimit: number;
  /** Rows an earlier run already pushed. */
  alreadyThere: number;
  failures: number;
}

/** Everything a later run needs to stay idempotent, plus what this run did. */
export interface MirrorIds {
  customerId: string;
  accountId: string;
  /** Local merchant id to the id Nessie assigned. */
  merchants: Record<string, string>;
  /** Purchases this run actually created. */
  purchases: number;
  skipped: MirrorSkipped;
  pushedAt: string;
  /**
   * The instant the customer POST was accepted, present only on the run that
   * created it. That write is the only thing that proves the key: an invalid key
   * answers `200 []` on a read and only fails on a write.
   */
  keyValidatedAt?: string;
  /** The first few failures, already redacted by the client. */
  firstFailures: string[];
  /**
   * True when the idempotence listing failed and the purchase phase was skipped.
   * Separate from the failure count because it says the mirror is unchanged
   * rather than partly pushed.
   */
  listingFailed: boolean;
}

export interface MirrorProgress {
  stage: "customer" | "account" | "merchant" | "purchase";
  done: number;
  total: number;
  detail?: string;
}

export interface PushMirrorInput {
  company: MirrorCompany;
  merchants: readonly MirrorMerchant[];
  /** The bank mirror as the generator built it. Credits are skipped. */
  rows: readonly LedgerTx[];
}

export interface PushMirrorOptions {
  /** Newest rows first, then this many. Defaults to 200. 0 means every row. */
  limit?: number;
  /** The ids of a previous run, which makes this one idempotent. */
  existing?: MirrorIds;
  onProgress?: (progress: MirrorProgress) => void;
}

export interface ReadMirrorResult {
  rows: LedgerTx[];
  rejected: RejectedRow[];
}

/**
 * A one-way fingerprint of the API key, for binding a recorded write to a key.
 *
 * `.seed/nessie.json` records the instant a write was accepted, and that record
 * is worth nothing on its own: a teammate who rotates `NESSIE_API_KEY` inherits a
 * file that says the key was validated when it was a different key that was. The
 * first twelve hex characters of SHA-256 over the key let a later run say whether
 * it is holding the same key, and give nothing back about the key itself. The key
 * is never stored, printed or logged, here or anywhere downstream.
 */
export function keyFingerprint(apiKey: string): string {
  return createHash("sha256")
    .update(apiKey, "utf8")
    .digest("hex")
    .slice(0, KEY_FINGERPRINT_LENGTH);
}

/** The path a judge pastes, without the key. */
export function mirrorPurchasesPath(accountId: string): string {
  return `/accounts/${accountId}/purchases`;
}

/**
 * The calendar day an instant falls on in Monterrey, "YYYY-MM-DD".
 *
 * This is the one place the time of day is dropped. The generator's rows carry
 * the importer's assumed instant (12:00 UTC, 06:00 local), and Nessie has nowhere
 * to put it, so the day is taken in the account holder's own zone rather than in
 * UTC. A row at 23:30 in Monterrey belongs to the day the clerk sent it.
 */
export function monterreyDay(instant: string): string {
  const parsed = Date.parse(instant);
  if (!Number.isFinite(parsed)) {
    throw new RangeError(`not an instant: ${instant}`);
  }
  return new Date(parsed + MONTERREY_OFFSET_MINUTES * MS_PER_MINUTE)
    .toISOString()
    .slice(0, 10);
}

/**
 * "Metalicos del Norte" into "Metalicos" and "del Norte".
 *
 * Nessie has a first and a last name and a company has neither. Splitting the
 * trade name is the least dishonest thing available: "SA de CV" as a surname
 * would read as a parsing bug in a screenshot, and inventing a person's name
 * would be inventing a person.
 */
export function splitTradeName(tradeName: string): {
  firstName: string;
  lastName: string;
} {
  const words = tradeName.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) {
    return { firstName: "Empresa", lastName: "Sintetica" };
  }
  const [first = "Empresa", ...rest] = words;
  return {
    firstName: first,
    lastName: rest.length === 0 ? "Sintetica" : rest.join(" "),
  };
}

/**
 * A 16-digit account number derived from the CLABE and deliberately not the CLABE.
 *
 * The CLABE is the thing the whole product is about protecting, so it does not go
 * up to a pool other teams can read. The digits below are a stable fold of it:
 * the same CLABE always produces the same account number, and the account number
 * does not give the CLABE back.
 */
export function syntheticAccountNumber(clabe: string): string {
  const digits = clabe.replace(/\D/g, "");
  let out = "";
  for (let index = 0; index < ACCOUNT_NUMBER_LENGTH; index += 1) {
    let sum = 7 + index * 3;
    for (let position = 0; position < digits.length; position += 1) {
      const digit = digits.charCodeAt(position) - 48;
      sum += digit * (position + 1) * (index + 2);
    }
    out += String(sum % 10);
  }
  if (out === digits.slice(0, ACCOUNT_NUMBER_LENGTH)) {
    throw new Error("the synthetic account number reproduced the CLABE");
  }
  return out;
}

/** The opening balance, big enough that every pushed purchase leaves it positive. */
export function openingBalanceFor(rows: readonly LedgerTx[]): number {
  const outflow = rows
    .filter((row) => row.direction === "debit")
    .reduce((sum, row) => sum + row.amount, 0);
  return Math.max(
    BALANCE_STEP,
    Math.ceil((outflow * BALANCE_MARGIN) / BALANCE_STEP) * BALANCE_STEP,
  );
}

/**
 * The rows a push with this limit would send, oldest first.
 *
 * Exported because the verify pass has to reconcile against the same subset the
 * push chose. Newest first for the cut, because a demo that shows the last two
 * hundred payments is a demo that shows this week's run.
 */
export function selectMirrorRows(
  rows: readonly LedgerTx[],
  limit: number = DEFAULT_MIRROR_LIMIT,
): LedgerTx[] {
  const newestFirst = rows
    .filter((row) => row.direction === "debit")
    .sort((left, right) =>
      left.occurredAt === right.occurredAt
        ? right.id.localeCompare(left.id)
        : right.occurredAt.localeCompare(left.occurredAt),
    );
  const selected = limit > 0 ? newestFirst.slice(0, limit) : newestFirst;
  return selected.reverse();
}

/**
 * A two-letter state code, because Nessie refuses anything longer.
 *
 * Verified on 2026-09-12: POST /merchants answers
 * `400 address -> state ensure this value has at most 2 characters` for "Nuevo
 * Leon". The initials of the words are taken, which turns Nuevo Leon into NL and
 * leaves a code that is already two letters alone.
 */
export function stateCode(state: string): string {
  const trimmed = state.trim();
  if (trimmed.length <= 2) {
    return trimmed.toUpperCase();
  }
  const initials = trimmed
    .split(/\s+/)
    .map((word) => word.charAt(0))
    .join("")
    .toUpperCase();
  return (initials.length >= 2 ? initials : trimmed).slice(0, 2).toUpperCase();
}

function companyAddress(company: MirrorCompany): NessieAddress {
  return {
    street_number: MIRROR_STREET_NUMBER,
    street_name: MIRROR_STREET_NAME,
    city: company.city,
    state: stateCode(company.state),
    zip: MIRROR_ZIP,
  };
}

/** Fields a clave de rastreo has been seen under, in the order they are trusted. */
const REFERENCE_FIELDS = [
  "claveRastreo",
  "clave_rastreo",
  "operationNumber",
  "operation_number",
  "reference",
] as const;

/** A clave de rastreo as this repository mints them: letters then digits. */
const REFERENCE_PATTERN = /\b[A-Z]{2,4}\d{8,}\b/;

/**
 * The short reference that goes in the purchase description.
 *
 * The clave de rastreo if the row carries one, because that is the string a judge
 * can take to Banxico and the string the CEP is filed under. Then the transfer id
 * the generator minted, then our own row id. Never anything identifying, and
 * never anything that is not already in the row.
 */
export function referenceFor(row: LedgerTx): string {
  const raw = row.raw as Record<string, unknown>;
  for (const field of REFERENCE_FIELDS) {
    const value = raw[field];
    if (typeof value === "string" && value.trim() !== "") {
      return `SPEI ${value.trim()}`;
    }
  }
  const description = raw.description;
  if (typeof description === "string") {
    const match = REFERENCE_PATTERN.exec(description);
    if (match !== null) {
      return `SPEI ${match[0]}`;
    }
  }
  const rawId = raw._id;
  if (typeof rawId === "string" && rawId.trim() !== "") {
    return `SPEI ${rawId.trim()}`;
  }
  return `SPEI ${row.id}`;
}

/**
 * What makes two purchases the same one, for the second run.
 *
 * The day, the whole-peso amount and the description, and the amount is compared
 * in whole pesos ON PURPOSE: Nessie stores an amount as a whole number, so a row
 * posted at 31320.50 reads back as 31320 and a key carrying centavos would never
 * match its own row. The description is what actually makes the key unique, being
 * a clave de rastreo, and the other two are there so a description that somehow
 * repeated could not collapse two different payments into one.
 */
function purchaseKey(
  purchaseDate: string,
  amount: number,
  description: string,
): string {
  return `${purchaseDate}|${Math.trunc(amount)}|${description}`;
}

function messageOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

/**
 * Pushes the company's bank mirror to Nessie with our own key.
 *
 * Order is forced by the API: the customer owns the account, the account owns the
 * purchases, and a purchase names a merchant that has to exist first. Credits are
 * skipped and counted, because the mirror is outflows only and money with no
 * document behind it would be a false positive we wrote ourselves.
 *
 * Failures are counted rather than thrown: a push that dies on row 40 of 200 in
 * front of a judge is worse than a push that reports what it could not do. The
 * client already retries 5xx and transport errors, so anything counted here is a
 * 4xx or a body the API refused.
 */
export async function pushCompanyMirror(
  client: NessieClient,
  input: PushMirrorInput,
  options: PushMirrorOptions = {},
): Promise<MirrorIds> {
  const limit = options.limit ?? DEFAULT_MIRROR_LIMIT;
  const existing = options.existing;
  const onProgress = options.onProgress ?? ((): void => {});
  const skipped: MirrorSkipped = {
    credits: 0,
    overLimit: 0,
    alreadyThere: 0,
    failures: 0,
  };
  const firstFailures: string[] = [];
  let keyValidatedAt: string | undefined;

  const fail = (label: string, cause: unknown): void => {
    skipped.failures += 1;
    if (firstFailures.length < KEPT_FAILURES) {
      firstFailures.push(`${label}: ${messageOf(cause)}`);
    }
  };

  // 1. The customer. This POST is the write that validates the key: a read
  // answers 200 [] whatever the key is, and only a write answers 401.
  let customerId = existing?.customerId;
  if (customerId === undefined || customerId === "") {
    const { firstName, lastName } = splitTradeName(input.company.tradeName);
    const customer = await client.createCustomer({
      first_name: firstName,
      last_name: lastName,
      address: companyAddress(input.company),
    });
    customerId = customer._id;
    keyValidatedAt = new Date().toISOString();
    onProgress({ stage: "customer", done: 1, total: 1, detail: customerId });
  } else {
    onProgress({ stage: "customer", done: 1, total: 1, detail: customerId });
  }

  // 2. The account. One Checking account, opened with enough balance that every
  // purchase below leaves it positive.
  let accountId = existing?.accountId;
  if (accountId === undefined || accountId === "") {
    const account = await client.createAccount(customerId, {
      type: "Checking",
      nickname: MIRROR_ACCOUNT_NICKNAME,
      rewards: 0,
      balance: openingBalanceFor(input.rows),
      account_number: syntheticAccountNumber(input.company.clabe),
    });
    accountId = account._id;
  }
  onProgress({ stage: "account", done: 1, total: 1, detail: accountId });

  // 3. One merchant per supplier, so every row on the statement has a payee.
  const merchants: Record<string, string> = { ...(existing?.merchants ?? {}) };
  let merchantsDone = 0;
  for (const merchant of input.merchants) {
    merchantsDone += 1;
    if (merchants[merchant.id] !== undefined && merchants[merchant.id] !== "") {
      onProgress({
        stage: "merchant",
        done: merchantsDone,
        total: input.merchants.length,
        detail: merchant.id,
      });
      continue;
    }
    try {
      const created = await client.createMerchant({
        name: merchant.name,
        category: MIRROR_MERCHANT_CATEGORY,
        address: {
          street_number: MIRROR_STREET_NUMBER,
          street_name: MIRROR_STREET_NAME,
          city: merchant.city,
          state: stateCode(input.company.state),
          zip: MIRROR_ZIP,
        },
        geocode: { ...MTY_GEOCODE },
      });
      merchants[merchant.id] = created._id;
    } catch (cause) {
      fail(`merchant ${merchant.rfc}`, cause);
    }
    onProgress({
      stage: "merchant",
      done: merchantsDone,
      total: input.merchants.length,
      detail: merchant.id,
    });
  }

  // 4. The outflows. Newest first for the limit, then pushed oldest first so the
  // account reads like a statement.
  const debits = input.rows.filter((row) => {
    if (row.direction === "credit") {
      skipped.credits += 1;
      return false;
    }
    return true;
  });
  const toPush = selectMirrorRows(debits, limit);
  skipped.overLimit = debits.length - toPush.length;

  // What is already there, so a second run creates nothing.
  const already = new Set<string>();
  let listingFailed = false;
  if (existing !== undefined) {
    try {
      for (const purchase of await client.listPurchases(accountId)) {
        already.add(
          purchaseKey(
            purchase.purchase_date,
            Number(purchase.amount),
            purchase.description ?? "",
          ),
        );
      }
    } catch (cause) {
      // Aborts the purchase phase rather than carrying on with an empty dedupe
      // set. This branch is only reached on a run that was handed ids, which
      // means the account already holds the mirror: pushing it again with
      // nothing to compare against would double every row on it, and a doubled
      // bank statement in front of a judge is worse than a reported failure.
      listingFailed = true;
      fail(`list purchases on ${accountId}`, cause);
    }
  }

  let purchases = 0;
  let pushDone = 0;
  for (const row of listingFailed ? [] : toPush) {
    pushDone += 1;
    const merchantId =
      row.merchantId === undefined ? undefined : merchants[row.merchantId];
    if (merchantId === undefined || merchantId === "") {
      fail(`purchase ${row.id}`, new Error("its merchant was never created"));
      continue;
    }
    const purchaseDate = monterreyDay(row.occurredAt);
    const description = referenceFor(row);
    if (already.has(purchaseKey(purchaseDate, row.amount, description))) {
      skipped.alreadyThere += 1;
      continue;
    }
    try {
      await client.createPurchase(accountId, {
        merchant_id: merchantId,
        medium: "balance",
        purchase_date: purchaseDate,
        amount: row.amount,
        status: "completed",
        description,
      });
      purchases += 1;
      onProgress({
        stage: "purchase",
        done: pushDone,
        total: toPush.length,
        detail: description,
      });
    } catch (cause) {
      fail(`purchase ${row.id}`, cause);
    }
  }

  return {
    customerId,
    accountId,
    merchants,
    purchases,
    skipped,
    pushedAt: new Date().toISOString(),
    ...(keyValidatedAt === undefined ? {} : { keyValidatedAt }),
    firstFailures,
    listingFailed,
  };
}

/**
 * Reads the mirror back out of Nessie, through the same normaliser the live
 * import uses.
 *
 * The rows come home on the LOCAL account id, not the Nessie one, so they drop
 * straight into `ledger_tx` next to the generator's rows, or instead of them. The
 * only field that cannot survive the round trip is the id, which is derived from
 * the `_id` Nessie assigned on the way in.
 */
export async function readCompanyMirror(
  client: NessieClient,
  ids: Pick<MirrorIds, "accountId">,
  localAccountId: string,
): Promise<ReadMirrorResult> {
  const [merchants, purchases] = await Promise.all([
    client.listMerchants(),
    client.listPurchases(ids.accountId),
  ]);
  return normalizeAll(
    { purchases },
    {
      accountId: localAccountId,
      categoryByMerchantId: buildCategoryIndex(merchants),
    },
  );
}

/** What the round trip is allowed to differ by, for the reconciliation report. */
export interface MirrorDayTotal {
  day: string;
  count: number;
  amount: number;
}

/** Counts and summed amounts per Monterrey calendar day, oldest day first. */
export function totalsByDay(rows: readonly LedgerTx[]): MirrorDayTotal[] {
  const byDay = new Map<string, MirrorDayTotal>();
  for (const row of rows) {
    if (row.direction !== "debit") {
      continue;
    }
    const day = monterreyDay(row.occurredAt);
    const entry = byDay.get(day) ?? { day, count: 0, amount: 0 };
    entry.count += 1;
    // Summed in cents, so 200 rows of two decimals do not drift into a diff.
    entry.amount =
      (Math.round(entry.amount * 100) + Math.round(row.amount * 100)) / 100;
    byDay.set(day, entry);
  }
  return [...byDay.values()].sort((left, right) =>
    left.day.localeCompare(right.day),
  );
}

export interface MirrorDayDiff {
  day: string;
  expectedCount: number;
  actualCount: number;
  expectedAmount: number;
  actualAmount: number;
}

/**
 * Pesos per row the read-back is allowed to be SHORT by.
 *
 * Verified against the live API on 2026-09-12: Nessie stores a purchase amount
 * as a whole number. A row posted at 31320.50 comes back as 31320, so every row
 * loses its centavos and loses under one peso. That is not a rounding preference
 * of ours, it is what the sandbox does with the body it was handed, and it is
 * the sharpest example of why the exact amount lives in our own ledger and the
 * mirror is only the bank's view.
 */
export const NESSIE_CENTS_TOLERANCE = 1;

export interface ReconcileOptions {
  /**
   * Pesos per row the actual side may be short by. Defaults to
   * NESSIE_CENTS_TOLERANCE. Pass 0 to compare down to the centavo.
   */
  tolerancePerRow?: number;
}

/**
 * The per-day difference between what the generator produced and what came back.
 *
 * Only days that differ are returned, so an empty array is the whole report a
 * reconciliation needs: every day matched in count, and in pesos to within the
 * centavos Nessie drops. A day short by MORE than one peso per row, or over by
 * anything at all, is a real difference and is reported as one.
 */
export function reconcileByDay(
  expected: readonly LedgerTx[],
  actual: readonly LedgerTx[],
  options: ReconcileOptions = {},
): MirrorDayDiff[] {
  const tolerancePerRow = options.tolerancePerRow ?? NESSIE_CENTS_TOLERANCE;
  const left = new Map(totalsByDay(expected).map((day) => [day.day, day]));
  const right = new Map(totalsByDay(actual).map((day) => [day.day, day]));
  const days = [...new Set([...left.keys(), ...right.keys()])].sort();
  const diffs: MirrorDayDiff[] = [];
  for (const day of days) {
    const expectedDay = left.get(day) ?? { day, count: 0, amount: 0 };
    const actualDay = right.get(day) ?? { day, count: 0, amount: 0 };
    // Compared in cents, so 200 rows of two decimals never drift into a diff.
    const shortfallCents =
      Math.round(expectedDay.amount * 100) - Math.round(actualDay.amount * 100);
    const allowedCents = Math.round(expectedDay.count * tolerancePerRow * 100);
    if (
      expectedDay.count !== actualDay.count ||
      shortfallCents < 0 ||
      shortfallCents > allowedCents
    ) {
      diffs.push({
        day,
        expectedCount: expectedDay.count,
        actualCount: actualDay.count,
        expectedAmount: expectedDay.amount,
        actualAmount: actualDay.amount,
      });
    }
  }
  return diffs;
}
