/**
 * The only place in the repo that talks to Nessie.
 *
 * Everything in here exists because of something verified against the live API on
 * 2026-09-11 and written down in docs/09-api.md. Read that file before changing a
 * line; none of this is defensive programming for its own sake.
 *
 * The five quirks this client absorbs so no caller has to:
 *
 * 1. HTTPS only, and auth is `?key=<apiKey>` in the query string. No headers.
 * 2. `403 {"message":"Missing Authentication Token"}` is API Gateway's
 *    route-not-found. It means the PATH is wrong, not the key. Regenerating a key
 *    at 03:00 over this has cost other teams hours, so it throws a named error
 *    that says so.
 * 3. Empty sub-collections are inconsistent: some answer `200 []`, transfers
 *    answers `404 "No transfers found for this account"` as a bare JSON string.
 *    Both become an empty array.
 * 4. `amount`, `balance` and `payment_amount` mix integers, floats and occasionally
 *    strings. They are coerced to numbers on the way in.
 * 5. `_id` mixes uuids and Mongo ObjectIds. The shape is never validated.
 *
 * `fetch` is injectable, which is how the tests run with no network at all.
 */

import type {
  NessieAccount,
  NessieBill,
  NessieCustomer,
  NessieDeposit,
  NessieLoan,
  NessieMerchant,
  NessiePurchase,
  NessieTransfer,
  NessieWithdrawal,
  NewAccount,
  NewBill,
  NewCustomer,
  NewDeposit,
  NewLoan,
  NewMerchant,
  NewPurchase,
  NewTransfer,
  NewWithdrawal,
} from "./types";

export const NESSIE_BASE_URL = "https://api.nessieisreal.com";

/** Only the part of `fetch` we use, so a test stub is three lines long. */
export type FetchLike = (
  input: string,
  init?: RequestInit,
) => Promise<Response>;

export interface NessieClientOptions {
  /** Falls back to the NESSIE_API_KEY environment variable. */
  apiKey?: string;
  baseUrl?: string;
  fetch?: FetchLike;
  /** Retries after a 5xx or a transport error. Defaults to 3, so 4 attempts. */
  maxRetries?: number;
  /** First backoff step in milliseconds, doubling per attempt. Defaults to 200. */
  retryBaseDelayMs?: number;
  /** Per-attempt timeout. Defaults to 10000. Set 0 to disable. */
  timeoutMs?: number;
  /** Injectable so tests do not actually wait. */
  sleep?: (ms: number) => Promise<void>;
}

export class NessieError extends Error {
  /** HTTP status, or 0 when the request never produced a response. */
  readonly status: number;
  readonly path: string;
  /** Raw response text, truncated. Never contains the key: it is stripped. */
  readonly body: string;

  constructor(message: string, status: number, path: string, body: string) {
    super(message);
    this.name = "NessieError";
    this.status = status;
    this.path = path;
    this.body = body;
  }
}

/**
 * Thrown on `403 Missing Authentication Token`, which is a routing error dressed
 * up as an auth error. Do not regenerate the key when you see this.
 */
export class NessiePathError extends NessieError {
  readonly hint = "wrong path, not a bad key";

  constructor(path: string, body: string) {
    super(
      `Nessie answered 403 "Missing Authentication Token" for ${path}. That is API Gateway's route-not-found: the path is wrong, not the key. Check docs/09-api.md for the verified routes.`,
      403,
      path,
      body,
    );
    this.name = "NessiePathError";
  }
}

/** Thrown when no key was given and none is in the environment. */
export class NessieConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NessieConfigError";
  }
}

/**
 * Entity names accepted by the bulk data reset.
 *
 * TODO(fabbyyyy): this route is NOT part of the verified surface in
 * docs/09-api.md. Confirm it against the Nessie docs before the demo depends on
 * it, and never point it at anything other than our own key's data.
 */
export type NessieDataType =
  | "Customers"
  | "Accounts"
  | "Merchants"
  | "Purchases"
  | "Bills"
  | "Deposits"
  | "Withdrawals"
  | "Transfers"
  | "Loans";

const MISSING_AUTH_TOKEN = "Missing Authentication Token";
const MAX_BODY_IN_ERROR = 400;

/** Fields the API has been seen sending as a string, an int and a float. */
const NUMERIC_FIELDS = [
  "amount",
  "balance",
  "rewards",
  "payment_amount",
  "monthly_payment",
  "recurring_date",
  "credit_score",
] as const;

/**
 * Reads an environment variable without assuming a runtime.
 *
 * `process` is not declared in a browser bundle and this package is imported by
 * code that may run anywhere, so it is read off globalThis rather than referenced
 * directly.
 */
function readEnv(name: string): string | undefined {
  const holder = globalThis as {
    process?: { env?: Record<string, string | undefined> };
  };
  return holder.process?.env?.[name];
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/** Parses a body that may be JSON, a bare JSON string, plain prose, or empty. */
export function parseBody(text: string): unknown {
  const trimmed = text.trim();
  if (trimmed === "") {
    return undefined;
  }
  try {
    return JSON.parse(trimmed);
  } catch {
    // Some routes answer with a sentence and no JSON framing at all.
    return trimmed;
  }
}

function toNumber(value: unknown): number | undefined {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : undefined;
  }
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

/**
 * Copies a response object and turns the known numeric fields into numbers.
 *
 * Deliberately shallow and deliberately silent: an unreadable value is left
 * exactly as it arrived rather than dropped, so nothing is invented and nothing
 * is lost.
 */
export function coerceRecord<T>(value: unknown): T {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return value as T;
  }
  const source = value as Record<string, unknown>;
  const copy: Record<string, unknown> = { ...source };
  for (const field of NUMERIC_FIELDS) {
    if (field in copy) {
      const parsed = toNumber(copy[field]);
      if (parsed !== undefined) {
        copy[field] = parsed;
      }
    }
  }
  return copy as T;
}

/** A bare string body means "nothing here", which is an empty list. */
function asList<T>(value: unknown): T[] {
  if (Array.isArray(value)) {
    return value.map((item) => coerceRecord<T>(item));
  }
  if (value === undefined || value === null || typeof value === "string") {
    return [];
  }
  return [coerceRecord<T>(value)];
}

/** Some creates answer with the object, others wrap it. Unwrap without asserting. */
function unwrapCreated(value: unknown): unknown {
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    const envelope = value as { objectCreated?: unknown };
    if (envelope.objectCreated !== undefined) {
      return envelope.objectCreated;
    }
  }
  return value;
}

function asObject<T>(value: unknown, path: string): T {
  const unwrapped = unwrapCreated(value);
  if (
    unwrapped === null ||
    typeof unwrapped !== "object" ||
    Array.isArray(unwrapped)
  ) {
    throw new NessieError(
      `expected a single object from ${path}`,
      200,
      path,
      String(value),
    );
  }
  return coerceRecord<T>(unwrapped);
}

export class NessieClient {
  private readonly apiKey: string | undefined;
  private readonly baseUrl: string;
  private readonly fetchImpl: FetchLike;
  private readonly maxRetries: number;
  private readonly retryBaseDelayMs: number;
  private readonly timeoutMs: number;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(options: NessieClientOptions = {}) {
    this.apiKey = options.apiKey ?? readEnv("NESSIE_API_KEY");
    this.baseUrl = (options.baseUrl ?? NESSIE_BASE_URL).replace(/\/+$/, "");
    this.fetchImpl = options.fetch ?? ((input, init) => fetch(input, init));
    this.maxRetries = options.maxRetries ?? 3;
    this.retryBaseDelayMs = options.retryBaseDelayMs ?? 200;
    this.timeoutMs = options.timeoutMs ?? 10_000;
    this.sleep = options.sleep ?? defaultSleep;
  }

  /** True when a key is available. `bun run doctor` asks this before probing. */
  get configured(): boolean {
    return this.apiKey !== undefined && this.apiKey !== "";
  }

  /** Cheapest call that proves the key and the base URL are both good. */
  async ping(): Promise<boolean> {
    await this.listAccounts();
    return true;
  }

  listCustomers(): Promise<NessieCustomer[]> {
    return this.getList<NessieCustomer>("/customers");
  }

  getCustomer(customerId: string): Promise<NessieCustomer> {
    return this.getOne<NessieCustomer>(
      `/customers/${encodeURIComponent(customerId)}`,
    );
  }

  createCustomer(customer: NewCustomer): Promise<NessieCustomer> {
    return this.post<NessieCustomer>("/customers", customer);
  }

  listAccounts(): Promise<NessieAccount[]> {
    return this.getList<NessieAccount>("/accounts");
  }

  getAccount(accountId: string): Promise<NessieAccount> {
    return this.getOne<NessieAccount>(
      `/accounts/${encodeURIComponent(accountId)}`,
    );
  }

  /** Accounts for one customer. The back-reference on the customer is not maintained. */
  listCustomerAccounts(customerId: string): Promise<NessieAccount[]> {
    return this.getList<NessieAccount>(
      `/customers/${encodeURIComponent(customerId)}/accounts`,
    );
  }

  createAccount(
    customerId: string,
    account: NewAccount,
  ): Promise<NessieAccount> {
    return this.post<NessieAccount>(
      `/customers/${encodeURIComponent(customerId)}/accounts`,
      account,
    );
  }

  listMerchants(): Promise<NessieMerchant[]> {
    return this.getList<NessieMerchant>("/merchants");
  }

  getMerchant(merchantId: string): Promise<NessieMerchant> {
    return this.getOne<NessieMerchant>(
      `/merchants/${encodeURIComponent(merchantId)}`,
    );
  }

  createMerchant(merchant: NewMerchant): Promise<NessieMerchant> {
    return this.post<NessieMerchant>("/merchants", merchant);
  }

  listPurchases(accountId: string): Promise<NessiePurchase[]> {
    return this.getList<NessiePurchase>(
      this.accountPath(accountId, "purchases"),
    );
  }

  createPurchase(
    accountId: string,
    purchase: NewPurchase,
  ): Promise<NessiePurchase> {
    return this.post<NessiePurchase>(
      this.accountPath(accountId, "purchases"),
      purchase,
    );
  }

  listBills(accountId: string): Promise<NessieBill[]> {
    return this.getList<NessieBill>(this.accountPath(accountId, "bills"));
  }

  createBill(accountId: string, bill: NewBill): Promise<NessieBill> {
    return this.post<NessieBill>(this.accountPath(accountId, "bills"), bill);
  }

  listDeposits(accountId: string): Promise<NessieDeposit[]> {
    return this.getList<NessieDeposit>(this.accountPath(accountId, "deposits"));
  }

  createDeposit(
    accountId: string,
    deposit: NewDeposit,
  ): Promise<NessieDeposit> {
    return this.post<NessieDeposit>(
      this.accountPath(accountId, "deposits"),
      deposit,
    );
  }

  listWithdrawals(accountId: string): Promise<NessieWithdrawal[]> {
    return this.getList<NessieWithdrawal>(
      this.accountPath(accountId, "withdrawals"),
    );
  }

  createWithdrawal(
    accountId: string,
    withdrawal: NewWithdrawal,
  ): Promise<NessieWithdrawal> {
    return this.post<NessieWithdrawal>(
      this.accountPath(accountId, "withdrawals"),
      withdrawal,
    );
  }

  listTransfers(accountId: string): Promise<NessieTransfer[]> {
    return this.getList<NessieTransfer>(
      this.accountPath(accountId, "transfers"),
    );
  }

  createTransfer(
    accountId: string,
    transfer: NewTransfer,
  ): Promise<NessieTransfer> {
    return this.post<NessieTransfer>(
      this.accountPath(accountId, "transfers"),
      transfer,
    );
  }

  listLoans(accountId: string): Promise<NessieLoan[]> {
    return this.getList<NessieLoan>(this.accountPath(accountId, "loans"));
  }

  createLoan(accountId: string, loan: NewLoan): Promise<NessieLoan> {
    return this.post<NessieLoan>(this.accountPath(accountId, "loans"), loan);
  }

  /**
   * Bulk reset of one entity type for this key. Destructive and not undoable.
   * See the TODO on NessieDataType: the route is unconfirmed.
   */
  async deleteData(type: NessieDataType): Promise<void> {
    await this.send("DELETE", `/data?type=${encodeURIComponent(type)}`);
  }

  private accountPath(accountId: string, collection: string): string {
    return `/accounts/${encodeURIComponent(accountId)}/${collection}`;
  }

  private async getList<T>(path: string): Promise<T[]> {
    return asList<T>(await this.send("GET", path, undefined, true));
  }

  private async getOne<T>(path: string): Promise<T> {
    return asObject<T>(await this.send("GET", path), path);
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    return asObject<T>(await this.send("POST", path, body), path);
  }

  private requireApiKey(): string {
    if (this.apiKey === undefined || this.apiKey === "") {
      throw new NessieConfigError(
        "NESSIE_API_KEY is not set. Copy .env.example to .env and paste the sandbox key, or pass apiKey to the client.",
      );
    }
    return this.apiKey;
  }

  private buildUrl(path: string): string {
    const separator = path.includes("?") ? "&" : "?";
    return `${this.baseUrl}${path}${separator}key=${encodeURIComponent(this.requireApiKey())}`;
  }

  private backoffMs(attempt: number): number {
    return this.retryBaseDelayMs * 2 ** attempt;
  }

  /** Strips the key before any error text escapes this module. */
  private redact(text: string): string {
    const key = this.apiKey;
    const safe =
      key === undefined || key === "" ? text : text.split(key).join("<key>");
    return safe.length > MAX_BODY_IN_ERROR
      ? `${safe.slice(0, MAX_BODY_IN_ERROR)}...`
      : safe;
  }

  private async send(
    method: "GET" | "POST" | "PUT" | "DELETE",
    path: string,
    body?: unknown,
    emptyOn404 = false,
  ): Promise<unknown> {
    const url = this.buildUrl(path);
    const headers: Record<string, string> = { accept: "application/json" };
    if (body !== undefined) {
      headers["content-type"] = "application/json";
    }
    let lastFailure = "";

    for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
      const init: RequestInit = { method, headers };
      if (body !== undefined) {
        init.body = JSON.stringify(body);
      }
      if (this.timeoutMs > 0) {
        init.signal = AbortSignal.timeout(this.timeoutMs);
      }

      let response: Response;
      try {
        response = await this.fetchImpl(url, init);
      } catch (cause) {
        // Transport error: DNS, TLS, timeout. Worth a retry, the body is not.
        lastFailure = cause instanceof Error ? cause.message : String(cause);
        if (attempt === this.maxRetries) {
          break;
        }
        await this.sleep(this.backoffMs(attempt));
        continue;
      }

      const text = await response.text();

      if (response.status >= 500 && attempt < this.maxRetries) {
        lastFailure = `${response.status} ${this.redact(text)}`;
        await this.sleep(this.backoffMs(attempt));
        continue;
      }
      if (response.status === 403 && text.includes(MISSING_AUTH_TOKEN)) {
        throw new NessiePathError(path, this.redact(text));
      }
      if (response.status === 404 && emptyOn404) {
        // Verified: /accounts/{id}/transfers answers 404 for an account with none.
        return [];
      }
      if (!response.ok) {
        throw new NessieError(
          `Nessie answered ${response.status} for ${method} ${path}: ${this.redact(text)}`,
          response.status,
          path,
          this.redact(text),
        );
      }

      return parseBody(text);
    }

    throw new NessieError(
      `Nessie request failed after ${this.maxRetries + 1} attempts for ${method} ${path}: ${lastFailure}`,
      0,
      path,
      lastFailure,
    );
  }
}
