/**
 * Deterministic synthetic Mexican transaction data.
 *
 * Why this package exists at all: the Nessie /enterprise/* pool is shared with
 * every other team at the event and is already contaminated (41 of 45 merchants in
 * it carry the single category "food", with near-duplicate names), so no analytics
 * can honestly be computed on it. We generate our own data instead, seed it through
 * our own key, and say so out loud when a judge asks where the numbers came from.
 *
 * What makes this data worth defending:
 *
 * - **Quincena cadence.** Payroll lands on the 15th and the last day of the month,
 *   shifted off weekends, which is the rhythm a Mexican statement actually has.
 * - **Lognormal tickets.** Most purchases sit near the low end of a merchant's range
 *   with a long tail, instead of the uniform noise a naive generator produces.
 * - **Deliberate dirt.** Exactly one refund posted as a negative purchase, exactly
 *   one merchant name issued twice under two ids, and exactly one merchant with no
 *   category at all. The engine has to survive all three, and `notes` says where
 *   they are so a test can assert it rather than hope.
 * - **Balances that reconcile.** Every account's balance equals its opening balance
 *   plus credits minus debits, to the cent. Asserted in generator.test.ts.
 * - **Real times of day.** Nessie carries dates with no time component, so it cannot
 *   answer an intraday question. Our generated rows carry a local time of day, which
 *   is exactly why the ledger is the system of record and Nessie is the mirror.
 *
 * Same seed, same output, byte for byte, on every machine.
 */

import type { LedgerTx } from "@hackmty/core";
import {
  EXTRA_INCOME_DESCRIPTIONS,
  MX_INCOME_PROFILES,
  paydaysInWindow,
} from "./catalogs/mx-income";
import type { MerchantSpec } from "./catalogs/mx-merchants";
import {
  DUPLICATED_MERCHANT_NAME,
  isWeekendHeavy,
  MERCHANT_WITHOUT_CATEGORY,
  MX_MERCHANTS,
} from "./catalogs/mx-merchants";
import {
  ACCOUNT_FLAVOURS,
  MTY_COLONIAS,
  MX_CITY,
  MX_FIRST_NAMES,
  MX_LAST_NAMES,
  MX_STATE,
} from "./catalogs/mx-people";
import {
  addDays,
  addMonths,
  clampDay,
  daysBetween,
  formatDay,
  isDay,
  isWeekend,
  lastDayOfMonth,
  monthsInWindow,
  parseDay,
  startOfMonth,
} from "./dates";
import type { Rng } from "./rng";
import { AMOUNT_MEDIAN_POSITION, createRng } from "./rng";

/** The seed the scripts use, so every teammate sees the same demo data. */
export const DEFAULT_SEED = 86;

export const SEED_SOURCE = "seed";

/**
 * Monterrey is UTC minus 6 all year. Restated here rather than imported, because
 * this package deliberately has no runtime dependency on @hackmty/core: core stays
 * dependency-free, and the generator stays importable from a script or a test with
 * nothing installed.
 */
const MONTERREY_UTC_OFFSET_MINUTES = -360;
const MS_PER_MINUTE = 60_000;
const CENTS_PER_UNIT = 100;

/** Money is handled as integer cents inside the generator, for the same reason as everywhere else. */
function pesosToCents(value: number): number {
  return Math.round(value * CENTS_PER_UNIT);
}

function centsToPesos(cents: number): number {
  return cents / CENTS_PER_UNIT;
}

function roundPesos(value: number): number {
  return centsToPesos(pesosToCents(value));
}

/** Earliest purchase at 07:00 local, latest at 22:00 local. */
const FIRST_PURCHASE_MINUTE = 420;
const LAST_PURCHASE_MINUTE = 1320;
/** Payroll lands in the morning, bills are charged mid-morning. */
const PAYROLL_MINUTE = 540;
const BILL_MINUTE = 600;

/** 365.2425 / 12. The window is rarely a whole number of months, and the volume of
 * generated spending has to follow the real length of it, not the month count asked
 * for, or a window that ends on the 11th gets a full month of purchases crammed into
 * eleven days and every total downstream is wrong. */
const AVERAGE_DAYS_PER_MONTH = 30.436875;

const MIN_OPENING_CENTS = 150_000;
const OPENING_BUFFER_CENTS = 50_000;

/**
 * The budget model, and the reason the data survives a judge reading the totals.
 *
 * Spending is sized against income rather than drawn freely: an account spends
 * between 62 and 88 per cent of its net pay, fixed bills are capped at 45 per cent,
 * and whatever is left is the day to day budget. Without this, a generator that draws
 * purchases from a catalogue produces somebody who spends twice what they earn, and
 * every number downstream is fiction.
 *
 * The budget is met by moving both the number of purchases and the size of each one,
 * each by the square root of the ratio. Scaling only the count would turn a student
 * into somebody who shops twice a month, and scaling only the amounts would keep the
 * count of a high earner. Small and frequent has to stay small and frequent.
 */
const MIN_SPEND_RATE = 0.62;
const MAX_SPEND_RATE = 0.88;
const MAX_BILL_SHARE = 0.45;
const MIN_PURCHASE_SHARE = 0.12;
const MIN_INTENSITY = 0.2;
const MAX_INTENSITY = 1.8;

const SAVINGS_OPENING_MIN = 8000;
const SAVINGS_OPENING_MAX = 60_000;

const SAVINGS_PROBABILITY = 0.4;
const POST_PAYDAY_PROBABILITY = 0.25;
const WEEKEND_SHIFT_PROBABILITY = 0.5;
const MIN_BILLS_PER_ACCOUNT = 3;
const MAX_BILLS_PER_ACCOUNT = 5;

export interface GenerateOptions {
  /** Any integer. The scripts use DEFAULT_SEED. */
  seed: number;
  /** How many customers to invent. One of them owns the hero account. */
  customers: number;
  /**
   * How many calendar months of history the window spans, ending on endDate. The last
   * month is usually partial, and the volume of generated spending follows the real
   * length of the window rather than this count.
   *
   * Note that a window shorter than a month can contain no payday at all, because
   * payroll lands on the 15th and the last day: the spending in it was funded by the
   * previous quincena, which is what the opening balance represents. Use 2 or more for
   * anything a judge will look at.
   */
  months: number;
  /** Last day of the window, "YYYY-MM-DD". Defaults to today in Monterrey. */
  endDate?: string;
  /** Wall clock behind the endDate default. Pass it to make a test independent of the date. */
  now?: number;
}

export interface GeneratedAddress {
  streetNumber: string;
  streetName: string;
  city: string;
  state: string;
  zip: string;
}

export interface GeneratedCustomer {
  id: string;
  firstName: string;
  lastName: string;
  address: GeneratedAddress;
}

export interface GeneratedAccount {
  id: string;
  customerId: string;
  type: string;
  nickname: string;
  accountNumber: string;
  rewards: number;
  /** Balance before the first generated row. Chosen so the account never goes negative. */
  openingBalance: number;
  /** openingBalance plus credits minus debits. Reconciles to the cent. */
  balance: number;
}

export interface GeneratedMerchant {
  id: string;
  name: string;
  /** Absent on exactly one merchant, on purpose. */
  category?: string;
  city: string;
}

export interface GeneratedPurchase {
  id: string;
  accountId: string;
  merchantId: string;
  /** "YYYY-MM-DD", which is all Nessie can hold. */
  date: string;
  /** Minutes after local midnight. Ours to keep, Nessie has nowhere to put it. */
  timeOfDayMinutes: number;
  /** Negative on the single refund. */
  amount: number;
  status: string;
  medium: string;
  description: string;
}

export interface GeneratedDeposit {
  id: string;
  accountId: string;
  date: string;
  timeOfDayMinutes: number;
  amount: number;
  status: string;
  medium: string;
  description: string;
}

export interface GeneratedBill {
  id: string;
  accountId: string;
  payee: string;
  nickname: string;
  /** "completed" for a bill already paid, "pending" for the one still to come. */
  status: string;
  creationDate: string;
  paymentDate: string;
  recurringDate: number;
  /** Legitimately in the future. The only future date in the dataset. */
  upcomingPaymentDate: string;
  paymentAmount: number;
}

export interface DatasetNotes {
  /** The single negative purchase. Empty when the window held no purchases at all. */
  refundPurchaseId: string;
  /** The merchant name that exists twice under two ids. */
  duplicateMerchantName: string;
  /** The merchant shipped with no category. */
  merchantWithoutCategoryId: string;
  /** The account the demo opens on: the one with the richest history. */
  heroAccountId: string;
}

export interface GeneratedDataset {
  seed: number;
  window: { from: string; to: string };
  customers: GeneratedCustomer[];
  accounts: GeneratedAccount[];
  merchants: GeneratedMerchant[];
  purchases: GeneratedPurchase[];
  deposits: GeneratedDeposit[];
  bills: GeneratedBill[];
  notes: DatasetNotes;
}

/** Today in Monterrey, from a wall clock the caller controls. */
export function todayInMonterrey(now: number): string {
  return formatDay(now + MONTERREY_UTC_OFFSET_MINUTES * MS_PER_MINUTE);
}

/** A local day plus a local time of day, as a UTC instant. */
export function toInstant(day: string, timeOfDayMinutes: number): string {
  const utcMinutes = timeOfDayMinutes - MONTERREY_UTC_OFFSET_MINUTES;
  return new Date(parseDay(day) + utcMinutes * MS_PER_MINUTE).toISOString();
}

interface CatalogEntry {
  spec: MerchantSpec;
  merchant: GeneratedMerchant;
}

export function generate(options: GenerateOptions): GeneratedDataset {
  const { seed, customers: customerCount, months } = options;
  if (!Number.isInteger(customerCount) || customerCount < 1) {
    throw new RangeError(
      `customers must be a positive integer: ${String(customerCount)}`,
    );
  }
  if (!Number.isInteger(months) || months < 1) {
    throw new RangeError(
      `months must be a positive integer: ${String(months)}`,
    );
  }
  const to = options.endDate ?? todayInMonterrey(options.now ?? Date.now());
  if (!isDay(to)) {
    throw new RangeError(`endDate must be a YYYY-MM-DD day: ${to}`);
  }
  const from = startOfMonth(addMonths(to, -(months - 1)));

  const rng = createRng(seed);
  const catalog = buildCatalog(rng);
  const merchants = catalog.map((entry) => entry.merchant);
  const tapped = catalog.filter((entry) => entry.spec.recurring !== true);
  const recurring = catalog.filter((entry) => entry.spec.recurring === true);
  const paydays = paydaysInWindow(from, to);
  const windowMonths = (daysBetween(from, to) + 1) / AVERAGE_DAYS_PER_MONTH;
  const catalogMonthlySpend = tapped.reduce(
    (total, entry) =>
      total + entry.spec.monthlyFrequency * expectedTicket(entry.spec),
    0,
  );

  const customers: GeneratedCustomer[] = [];
  const accounts: GeneratedAccount[] = [];
  const purchases: GeneratedPurchase[] = [];
  const deposits: GeneratedDeposit[] = [];
  const bills: GeneratedBill[] = [];

  for (let index = 0; index < customerCount; index += 1) {
    const customer = buildCustomer(rng);
    customers.push(customer);

    const profile = cycle(MX_INCOME_PROFILES, index, "MX_INCOME_PROFILES");
    const quincena = profile.monthlyNet / 2;

    const checking = buildAccount(rng, customer.id, 0);
    accounts.push(checking);

    // Payroll, the backbone of the month.
    for (const payday of paydays) {
      deposits.push({
        id: rng.uuid(),
        accountId: checking.id,
        date: payday,
        timeOfDayMinutes: PAYROLL_MINUTE,
        amount: roundPesos(quincena * (0.98 + rng.next() * 0.04)),
        status: "completed",
        medium: "balance",
        description: profile.label,
      });
    }

    // Occasional income that is not payroll, so a classifier cannot just pattern
    // match on the amount.
    const extras = Math.max(1, Math.round(windowMonths / 2));
    for (let extra = 0; extra < extras; extra += 1) {
      deposits.push({
        id: rng.uuid(),
        accountId: checking.id,
        date: randomDay(rng, from, to),
        timeOfDayMinutes: rng.int(FIRST_PURCHASE_MINUTE, LAST_PURCHASE_MINUTE),
        amount: rng.amount(200, 2500),
        status: "completed",
        medium: "balance",
        description: rng.pick(EXTRA_INCOME_DESCRIPTIONS),
      });
    }

    // Bills come first: their monthly weight decides what is left to spend.
    const chosenBills = chooseBills(rng, recurring, profile.monthlyNet);
    for (const chosen of chosenBills) {
      bills.push(...buildBills(rng, checking.id, chosen, from, to));
    }
    const monthlyBills = chosenBills.reduce(
      (total, chosen) => total + chosen.baseAmount,
      0,
    );

    // Day to day spending, sized against this account's income.
    const spendRate =
      MIN_SPEND_RATE + rng.next() * (MAX_SPEND_RATE - MIN_SPEND_RATE);
    const purchaseBudget = Math.max(
      profile.monthlyNet * MIN_PURCHASE_SHARE,
      profile.monthlyNet * spendRate - monthlyBills,
    );
    const intensity = Math.min(
      MAX_INTENSITY,
      Math.max(MIN_INTENSITY, Math.sqrt(purchaseBudget / catalogMonthlySpend)),
    );

    for (const entry of tapped) {
      const expected = entry.spec.monthlyFrequency * windowMonths * intensity;
      const count = drawCount(rng, expected);
      for (let occurrence = 0; occurrence < count; occurrence += 1) {
        const date = pickSpendingDay(rng, from, to, entry.spec, paydays);
        purchases.push({
          id: rng.uuid(),
          accountId: checking.id,
          merchantId: entry.merchant.id,
          date,
          timeOfDayMinutes: rng.int(
            FIRST_PURCHASE_MINUTE,
            LAST_PURCHASE_MINUTE,
          ),
          amount: rng.amount(
            entry.spec.min * intensity,
            entry.spec.max * intensity,
          ),
          status: "completed",
          medium: "balance",
          description: entry.merchant.name,
        });
      }
    }

    // Some people also hold a savings account. It is generated with an opening balance
    // and no activity: an honest monthly transfer needs both legs, and the dataset
    // contract here is purchases, deposits and bills.
    // TODO(garzario): add a transfers collection when the product actually needs one.
    if (rng.bool(SAVINGS_PROBABILITY)) {
      const savings = buildAccount(rng, customer.id, 1);
      savings.openingBalance = rng.amount(
        SAVINGS_OPENING_MIN,
        SAVINGS_OPENING_MAX,
      );
      accounts.push(savings);
    }
  }

  const heroAccountId = pickHeroAccount(accounts, purchases);
  const refundId = appendRefund(
    rng,
    purchases,
    merchants,
    heroAccountId,
    from,
    to,
  );
  reconcileBalances(accounts, purchases, deposits, bills);

  const uncategorised = merchants.find(
    (merchant) => merchant.category === undefined,
  );

  return {
    seed,
    window: { from, to },
    customers,
    accounts,
    merchants,
    purchases,
    deposits,
    bills,
    notes: {
      refundPurchaseId: refundId,
      duplicateMerchantName: DUPLICATED_MERCHANT_NAME,
      merchantWithoutCategoryId: uncategorised?.id ?? "",
      heroAccountId,
    },
  };
}

/** Indexes into a catalogue that must not be empty, and says which one if it is. */
function cycle<T>(items: readonly T[], index: number, label: string): T {
  const item = items[index % items.length];
  if (item === undefined) {
    throw new Error(`${label} is empty`);
  }
  return item;
}

/**
 * The merchant list, plus the two deliberate defects: one name issued twice under
 * two ids, and one merchant with no category.
 */
function buildCatalog(rng: Rng): CatalogEntry[] {
  const catalog: CatalogEntry[] = MX_MERCHANTS.map((spec) => ({
    spec,
    merchant: {
      id: rng.uuid(),
      name: spec.name,
      ...(spec.name === MERCHANT_WITHOUT_CATEGORY
        ? {}
        : { category: spec.category }),
      city: MX_CITY,
    },
  }));

  const twin = catalog.find(
    (entry) => entry.merchant.name === DUPLICATED_MERCHANT_NAME,
  );
  if (twin === undefined) {
    throw new Error(
      `the catalogue no longer contains ${DUPLICATED_MERCHANT_NAME}, so the duplicate-name case cannot be generated`,
    );
  }
  catalog.push({
    spec: twin.spec,
    merchant: { ...twin.merchant, id: rng.uuid() },
  });

  if (!catalog.some((entry) => entry.merchant.category === undefined)) {
    throw new Error(
      `the catalogue no longer contains ${MERCHANT_WITHOUT_CATEGORY}, so the missing-category case cannot be generated`,
    );
  }
  return catalog;
}

function buildCustomer(rng: Rng): GeneratedCustomer {
  const colonia = rng.pick(MTY_COLONIAS);
  return {
    id: rng.uuid(),
    firstName: rng.pick(MX_FIRST_NAMES),
    lastName: rng.pick(MX_LAST_NAMES),
    address: {
      streetNumber: String(rng.int(100, 4999)),
      streetName: colonia.streetName,
      city: MX_CITY,
      state: MX_STATE,
      zip: colonia.zip,
    },
  };
}

function buildAccount(
  rng: Rng,
  customerId: string,
  flavourIndex: number,
): GeneratedAccount {
  const flavour = cycle(ACCOUNT_FLAVOURS, flavourIndex, "ACCOUNT_FLAVOURS");
  return {
    id: rng.uuid(),
    customerId,
    type: flavour.type,
    nickname: flavour.nickname,
    accountNumber: buildAccountNumber(rng),
    rewards: 0,
    openingBalance: 0,
    balance: 0,
  };
}

function buildAccountNumber(rng: Rng): string {
  let digits = "";
  for (let index = 0; index < 16; index += 1) {
    digits += String(rng.int(0, 9));
  }
  return digits;
}

/** The median ticket of a merchant, the same figure Rng.amount centres its draw on. */
function expectedTicket(spec: MerchantSpec): number {
  return spec.min + (spec.max - spec.min) * AMOUNT_MEDIAN_POSITION;
}

interface ChosenBill {
  entry: CatalogEntry;
  baseAmount: number;
  recurringDate: number;
}

/**
 * Picks the fixed monthly services for one account, keeping the total under
 * MAX_BILL_SHARE of net income. The first one is always accepted, so every account has
 * at least one recurring charge, and anything that would break the cap is skipped
 * rather than shrunk, because a household drops a subscription, it does not negotiate
 * a smaller electricity bill.
 */
function chooseBills(
  rng: Rng,
  recurring: readonly CatalogEntry[],
  monthlyNet: number,
): ChosenBill[] {
  const cap = monthlyNet * MAX_BILL_SHARE;
  const wanted = rng.int(MIN_BILLS_PER_ACCOUNT, MAX_BILLS_PER_ACCOUNT);
  const chosen: ChosenBill[] = [];
  let total = 0;

  for (const entry of rng.shuffle(recurring)) {
    if (chosen.length >= wanted) {
      break;
    }
    const baseAmount = rng.amount(entry.spec.min, entry.spec.max);
    if (chosen.length > 0 && total + baseAmount > cap) {
      continue;
    }
    chosen.push({ entry, baseAmount, recurringDate: rng.int(1, 28) });
    total += baseAmount;
  }

  return chosen;
}

/** One bill per month already paid, plus the next one still pending. */
function buildBills(
  rng: Rng,
  accountId: string,
  chosen: ChosenBill,
  from: string,
  to: string,
): GeneratedBill[] {
  const { entry, baseAmount: base, recurringDate } = chosen;
  const created = from;
  const rows: GeneratedBill[] = [];

  for (const { year, month } of monthsInWindow(from, to)) {
    const dayOfMonth = Math.min(recurringDate, lastDayOfMonth(year, month));
    const paymentDate = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(dayOfMonth).padStart(2, "0")}`;
    if (paymentDate < from || paymentDate > to) {
      continue;
    }
    rows.push({
      id: rng.uuid(),
      accountId,
      payee: entry.merchant.name,
      nickname: entry.spec.category,
      status: "completed",
      creationDate: created,
      paymentDate,
      recurringDate,
      upcomingPaymentDate: addMonths(paymentDate, 1),
      paymentAmount: roundPesos(base * (0.9 + rng.next() * 0.2)),
    });
  }

  // The upcoming one: the first occurrence strictly after the window.
  const endYear = Number(to.slice(0, 4));
  const endMonth = Number(to.slice(5, 7));
  const dayInEndMonth = Math.min(
    recurringDate,
    lastDayOfMonth(endYear, endMonth),
  );
  let upcoming = `${to.slice(0, 7)}-${String(dayInEndMonth).padStart(2, "0")}`;
  if (upcoming <= to) {
    upcoming = addMonths(upcoming, 1);
  }
  rows.push({
    id: rng.uuid(),
    accountId,
    payee: entry.merchant.name,
    nickname: entry.spec.category,
    status: "pending",
    creationDate: created,
    paymentDate: upcoming,
    recurringDate,
    upcomingPaymentDate: upcoming,
    paymentAmount: roundPesos(base),
  });

  return rows;
}

/** Floor plus a probabilistic remainder, so a frequency of 0.5 means every other month. */
function drawCount(rng: Rng, expected: number): number {
  const whole = Math.floor(expected);
  return whole + (rng.next() < expected - whole ? 1 : 0);
}

function randomDay(rng: Rng, from: string, to: string): string {
  return addDays(from, rng.int(0, Math.max(0, daysBetween(from, to))));
}

/**
 * Picks the day a purchase lands on, with two real-world biases: a quarter of
 * spending follows a payday, and leisure categories drift onto the weekend.
 */
function pickSpendingDay(
  rng: Rng,
  from: string,
  to: string,
  spec: MerchantSpec,
  paydays: readonly string[],
): string {
  let day = randomDay(rng, from, to);

  if (paydays.length > 0 && rng.bool(POST_PAYDAY_PROBABILITY)) {
    day = clampDay(addDays(rng.pick(paydays), 1), from, to);
  }
  if (
    isWeekendHeavy(spec.category) &&
    !isWeekend(day) &&
    rng.bool(WEEKEND_SHIFT_PROBABILITY)
  ) {
    let cursor = day;
    for (let step = 0; step < 6 && !isWeekend(cursor); step += 1) {
      cursor = addDays(cursor, 1);
    }
    day = clampDay(cursor, from, to);
  }
  return day;
}

/** The account with the most purchases. Ties break on the id, so it is stable. */
function pickHeroAccount(
  accounts: readonly GeneratedAccount[],
  purchases: readonly GeneratedPurchase[],
): string {
  const counts = new Map<string, number>();
  for (const purchase of purchases) {
    counts.set(purchase.accountId, (counts.get(purchase.accountId) ?? 0) + 1);
  }
  let best = "";
  let bestCount = -1;
  for (const account of accounts) {
    const count = counts.get(account.id) ?? 0;
    if (count > bestCount || (count === bestCount && account.id < best)) {
      best = account.id;
      bestCount = count;
    }
  }
  return best;
}

/**
 * Posts the single refund: the hero account's largest ticket, reversed a couple of
 * days later as a negative purchase. This is the shape a real reversal arrives in,
 * and it is the row that catches an engine that sums absolute values.
 */
function appendRefund(
  rng: Rng,
  purchases: GeneratedPurchase[],
  merchants: readonly GeneratedMerchant[],
  heroAccountId: string,
  from: string,
  to: string,
): string {
  let biggest: GeneratedPurchase | undefined;
  for (const purchase of purchases) {
    if (purchase.accountId !== heroAccountId) {
      continue;
    }
    if (biggest === undefined || purchase.amount > biggest.amount) {
      biggest = purchase;
    }
  }
  if (biggest === undefined) {
    return "";
  }
  const reversed = biggest;
  const merchantName =
    merchants.find((merchant) => merchant.id === reversed.merchantId)?.name ??
    "comercio";
  const refund: GeneratedPurchase = {
    id: rng.uuid(),
    accountId: reversed.accountId,
    merchantId: reversed.merchantId,
    date: clampDay(addDays(reversed.date, 2), from, to),
    timeOfDayMinutes: rng.int(FIRST_PURCHASE_MINUTE, LAST_PURCHASE_MINUTE),
    amount: -reversed.amount,
    status: "completed",
    medium: "balance",
    description: `Devolucion ${merchantName}`,
  };
  purchases.push(refund);
  return refund.id;
}

/**
 * Chooses each opening balance so the account never goes negative, then sets the
 * closing balance to opening plus credits minus debits. Integer cents throughout,
 * which is what makes the reconciliation assertion in the tests exact.
 */
function reconcileBalances(
  accounts: GeneratedAccount[],
  purchases: readonly GeneratedPurchase[],
  deposits: readonly GeneratedDeposit[],
  bills: readonly GeneratedBill[],
): void {
  interface Movement {
    date: string;
    cents: number;
  }
  const byAccount = new Map<string, Movement[]>();
  const push = (accountId: string, movement: Movement): void => {
    const list = byAccount.get(accountId) ?? [];
    list.push(movement);
    byAccount.set(accountId, list);
  };

  for (const deposit of deposits) {
    push(deposit.accountId, {
      date: deposit.date,
      cents: pesosToCents(deposit.amount),
    });
  }
  for (const purchase of purchases) {
    push(purchase.accountId, {
      date: purchase.date,
      cents: -pesosToCents(purchase.amount),
    });
  }
  for (const bill of bills) {
    if (bill.status === "completed") {
      push(bill.accountId, {
        date: bill.paymentDate,
        cents: -pesosToCents(bill.paymentAmount),
      });
    }
  }

  for (const account of accounts) {
    const movements = (byAccount.get(account.id) ?? [])
      .slice()
      .sort((left, right) => {
        return left.date < right.date ? -1 : left.date > right.date ? 1 : 0;
      });
    let running = 0;
    let lowest = 0;
    for (const movement of movements) {
      running += movement.cents;
      lowest = Math.min(lowest, running);
    }
    const openingCents = Math.max(
      pesosToCents(account.openingBalance),
      MIN_OPENING_CENTS,
      -lowest + OPENING_BUFFER_CENTS,
    );
    account.openingBalance = centsToPesos(openingCents);
    account.balance = centsToPesos(openingCents + running);
  }
}

/**
 * The dataset as ledger rows: the shape @hackmty/core reads and packages/db stores.
 *
 * A negative purchase becomes a credit, because `LedgerTx.amount` is always positive
 * and `direction` carries the sign. Pending bills are not ledger rows: nobody has
 * paid them yet.
 */
export function toLedgerTx(dataset: GeneratedDataset): LedgerTx[] {
  const categoryById = new Map<string, string>();
  const categoryByName = new Map<string, string>();
  for (const merchant of dataset.merchants) {
    if (merchant.category === undefined) {
      continue;
    }
    categoryById.set(merchant.id, merchant.category);
    if (!categoryByName.has(merchant.name)) {
      // A bill carries a payee name and no merchant id, so the name is all there is.
      // The catalogue ships one name twice on purpose, which is exactly why the
      // purchase path below keys on the id instead.
      categoryByName.set(merchant.name, merchant.category);
    }
  }

  const rows: LedgerTx[] = [];

  for (const purchase of dataset.purchases) {
    const category = categoryById.get(purchase.merchantId);
    rows.push({
      id: purchase.id,
      accountId: purchase.accountId,
      occurredAt: toInstant(purchase.date, purchase.timeOfDayMinutes),
      amount: Math.abs(purchase.amount),
      direction: purchase.amount < 0 ? "credit" : "debit",
      merchantId: purchase.merchantId,
      ...(category === undefined ? {} : { category }),
      source: SEED_SOURCE,
      raw: { ...purchase },
    });
  }

  for (const deposit of dataset.deposits) {
    rows.push({
      id: deposit.id,
      accountId: deposit.accountId,
      occurredAt: toInstant(deposit.date, deposit.timeOfDayMinutes),
      amount: Math.abs(deposit.amount),
      direction: deposit.amount < 0 ? "debit" : "credit",
      category: "income",
      source: SEED_SOURCE,
      raw: { ...deposit },
    });
  }

  for (const bill of dataset.bills) {
    if (bill.status !== "completed") {
      continue;
    }
    const category = categoryByName.get(bill.payee);
    rows.push({
      id: bill.id,
      accountId: bill.accountId,
      occurredAt: toInstant(bill.paymentDate, BILL_MINUTE),
      amount: Math.abs(bill.paymentAmount),
      direction: "debit",
      ...(category === undefined ? {} : { category }),
      source: SEED_SOURCE,
      raw: { ...bill },
    });
  }

  rows.sort((left, right) => {
    if (left.occurredAt !== right.occurredAt) {
      return left.occurredAt < right.occurredAt ? -1 : 1;
    }
    return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
  });
  return rows;
}

export interface DatasetSummary {
  seed: number;
  window: { from: string; to: string };
  counts: {
    customers: number;
    accounts: number;
    merchants: number;
    purchases: number;
    deposits: number;
    bills: number;
    ledgerRows: number;
  };
  /** The account the demo opens on. */
  heroAccountId: string;
  /** The three busiest accounts, hero first, which is what docs/10-demo-script.md lists. */
  demoAccountIds: string[];
  totals: { spend: number; income: number };
}

/** Account ids ordered by how much history they hold, so the hero comes first. */
function busiestAccounts(
  dataset: GeneratedDataset,
  ledger: readonly LedgerTx[],
  limit: number,
): string[] {
  const rows = new Map<string, number>();
  for (const row of ledger) {
    rows.set(row.accountId, (rows.get(row.accountId) ?? 0) + 1);
  }
  return [...dataset.accounts]
    .sort((left, right) => {
      const difference = (rows.get(right.id) ?? 0) - (rows.get(left.id) ?? 0);
      if (difference !== 0) {
        return difference;
      }
      return left.id < right.id ? -1 : 1;
    })
    .slice(0, limit)
    .map((account) => account.id);
}

/** Everything `bun run seed` prints, derived rather than recounted by the caller. */
export function summarize(dataset: GeneratedDataset): DatasetSummary {
  const ledger = toLedgerTx(dataset);
  let spendCents = 0;
  let incomeCents = 0;
  for (const row of ledger) {
    if (row.direction === "debit") {
      spendCents += pesosToCents(row.amount);
    } else {
      incomeCents += pesosToCents(row.amount);
    }
  }

  return {
    seed: dataset.seed,
    window: dataset.window,
    counts: {
      customers: dataset.customers.length,
      accounts: dataset.accounts.length,
      merchants: dataset.merchants.length,
      purchases: dataset.purchases.length,
      deposits: dataset.deposits.length,
      bills: dataset.bills.length,
      ledgerRows: ledger.length,
    },
    heroAccountId: dataset.notes.heroAccountId,
    demoAccountIds: busiestAccounts(dataset, ledger, 3),
    totals: {
      spend: centsToPesos(spendCents),
      income: centsToPesos(incomeCents),
    },
  };
}
