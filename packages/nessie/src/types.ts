/**
 * Nessie payload shapes, field for field.
 *
 * These mirror the payloads verified against https://api.nessieisreal.com and
 * written down in docs/09-api.md. Nothing here is guessed: when a field was not
 * observed it is marked optional rather than invented, and nothing in this
 * package validates the shape of an `_id`, because the pool mixes UUIDs with
 * Mongo ObjectIds such as 56c66be5a73e4927415071a3.
 *
 * Two rules that the types deliberately encode:
 *
 * 1. `amount` and friends are numbers here, but the API mixes 46, 320 and 450.0,
 *    and has been seen sending numbers as strings. The client coerces on the way
 *    in, which is why every consumer can treat them as numbers.
 * 2. Dates are "YYYY-MM-DD" with no time component at all. Intraday behaviour
 *    cannot come from Nessie, it comes from our own ledger. `normalize.ts` is
 *    explicit about the time of day it assumes.
 */

export interface NessieAddress {
  street_number: string;
  street_name: string;
  city: string;
  /**
   * At most TWO characters on a create. Verified on 2026-09-12: POST /merchants
   * answers `400 address -> state ensure this value has at most 2 characters`
   * for "Nuevo Leon". Use "NL".
   */
  state: string;
  zip: string;
}

export interface NessieCustomer {
  _id: string;
  first_name: string;
  last_name: string;
  address: NessieAddress;
  /**
   * Present in responses but NOT maintained by the API: it comes back empty even
   * when the customer has accounts. Never rely on it, list the accounts instead.
   */
  account_ids?: string[];
}

export interface NessieAccount {
  _id: string;
  /** Observed: "Checking", "Savings", "Credit Card". Treat as an open string set. */
  type: string;
  nickname: string;
  rewards: number;
  balance: number;
  account_number: string;
  customer_id: string;
}

export interface NessiePurchase {
  _id: string;
  /** Observed as "merchant". */
  type: string;
  merchant_id: string;
  /** The account that paid, not the customer. */
  payer_id: string;
  /** "YYYY-MM-DD". */
  purchase_date: string;
  amount: number;
  /** Observed: "completed", "pending". Not the "executed" of older docs. */
  status: string;
  /** Observed: "balance", "rewards". */
  medium: string;
  description: string;
}

export interface NessieBill {
  _id: string;
  status: string;
  payee: string;
  nickname: string;
  /** "YYYY-MM-DD". */
  creation_date: string;
  /** "YYYY-MM-DD". */
  payment_date: string;
  /** Day of the month the bill repeats on, 1 to 31. */
  recurring_date: number;
  /** "YYYY-MM-DD", and legitimately in the future. */
  upcoming_payment_date: string;
  payment_amount: number;
  account_id: string;
}

export interface NessieDeposit {
  _id: string;
  /** Observed: "balance". */
  medium: string;
  /** "YYYY-MM-DD". */
  transaction_date: string;
  status: string;
  amount: number;
  description: string;
  /** Observed on some rows only. */
  type?: string;
  /** The receiving account. Present on some rows only. */
  payee_id?: string;
}

export interface NessieWithdrawal {
  _id: string;
  medium: string;
  /** "YYYY-MM-DD". */
  transaction_date: string;
  status: string;
  amount: number;
  description: string;
  type?: string;
  /** The paying account. Present on some rows only. */
  payer_id?: string;
}

export interface NessieTransfer {
  _id: string;
  medium: string;
  /** "YYYY-MM-DD". */
  transaction_date: string;
  status: string;
  amount: number;
  description: string;
  type?: string;
  payer_id?: string;
  payee_id?: string;
}

export interface NessieLoan {
  _id: string;
  type: string;
  status: string;
  /** "YYYY-MM-DD". */
  creation_date: string;
  amount: number;
  monthly_payment: number;
  description?: string;
  credit_score?: number;
}

export interface NessieMerchant {
  _id: string;
  name: string;
  /**
   * The shared pool returns this as an array of strings, and a single string has
   * been seen too. `normalize.ts` flattens both, and a merchant with no category
   * at all is a normal row, not an error.
   */
  category?: string[] | string;
  address?: NessieAddress;
  geocode?: { lat: number; lng: number };
}

/**
 * Create payloads.
 *
 * Shapes mirror the verified GET payloads minus the fields the API owns (`_id`,
 * and the parent id that the path already carries). Fields are optional where the
 * API fills them in. If a POST answers 400, add the missing field here rather
 * than going looking for another route.
 */

export interface NewCustomer {
  first_name: string;
  last_name: string;
  address: NessieAddress;
}

export interface NewAccount {
  type: string;
  nickname: string;
  rewards: number;
  balance: number;
  account_number?: string;
}

export interface NewPurchase {
  merchant_id: string;
  medium: string;
  /** "YYYY-MM-DD". */
  purchase_date: string;
  amount: number;
  status?: string;
  description?: string;
}

export interface NewDeposit {
  medium: string;
  /** "YYYY-MM-DD". */
  transaction_date: string;
  amount: number;
  status?: string;
  description?: string;
}

export interface NewWithdrawal {
  medium: string;
  /** "YYYY-MM-DD". */
  transaction_date: string;
  amount: number;
  status?: string;
  description?: string;
}

export interface NewTransfer {
  medium: string;
  /** The receiving account id. */
  payee_id: string;
  /** "YYYY-MM-DD". */
  transaction_date: string;
  amount: number;
  status?: string;
  description?: string;
}

export interface NewBill {
  status: string;
  payee: string;
  nickname: string;
  /** "YYYY-MM-DD". */
  payment_date: string;
  recurring_date: number;
  payment_amount: number;
  /** "YYYY-MM-DD". */
  creation_date?: string;
  /** "YYYY-MM-DD". */
  upcoming_payment_date?: string;
}

export interface NewLoan {
  type: string;
  status: string;
  amount: number;
  monthly_payment: number;
  credit_score?: number;
  description?: string;
}

export interface NewMerchant {
  name: string;
  /**
   * A bare STRING on a create, even though GET /merchants answers with an array.
   * Verified on 2026-09-12: POST /merchants answers
   * `400 category str type expected` for `["proveedores"]`. Narrowed to a string
   * on purpose, so the shape the API refuses does not compile. The read type
   * `NessieMerchant.category` stays `string[] | string`, because that is what
   * comes back.
   */
  category?: string;
  address?: NessieAddress;
  geocode?: { lat: number; lng: number };
}
