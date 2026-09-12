import { describe, expect, it } from "bun:test";
import { isPayday } from "./catalogs/mx-income";
import { MX_MERCHANTS } from "./catalogs/mx-merchants";
import { isDay } from "./dates";
import type { GeneratedDataset } from "./generator";
import {
  DEFAULT_SEED,
  generate,
  SEED_SOURCE,
  summarize,
  todayInMonterrey,
  toInstant,
  toLedgerTx,
} from "./generator";

/** A fixed end date, so the suite does not change behaviour overnight. */
const OPTIONS = {
  seed: DEFAULT_SEED,
  customers: 3,
  months: 6,
  endDate: "2026-09-11",
} as const;

const dataset: GeneratedDataset = generate(OPTIONS);

function cents(value: number): number {
  return Math.round(value * 100);
}

describe("determinism", () => {
  it("gives byte-identical output for the same seed", () => {
    expect(generate(OPTIONS)).toEqual(generate(OPTIONS));
  });

  it("gives different output for a different seed", () => {
    const other = generate({ ...OPTIONS, seed: 87 });

    expect(summarize(other).totals.spend).not.toBe(
      summarize(dataset).totals.spend,
    );
  });

  it("does not read the clock when an endDate is given", () => {
    const withClock = generate({
      ...OPTIONS,
      now: Date.parse("2030-01-01T00:00:00.000Z"),
    });

    expect(withClock).toEqual(dataset);
  });

  it("defaults the window to today in Monterrey", () => {
    const now = Date.parse("2026-09-12T04:30:00.000Z");

    // 04:30 UTC is 22:30 the previous day in Monterrey.
    expect(todayInMonterrey(now)).toBe("2026-09-11");
    expect(
      generate({ seed: DEFAULT_SEED, customers: 1, months: 1, now }).window.to,
    ).toBe("2026-09-11");
  });
});

describe("the window", () => {
  it("covers whole months ending on the end date", () => {
    expect(dataset.window).toEqual({ from: "2026-04-01", to: "2026-09-11" });
  });

  it("refuses options it cannot honour", () => {
    expect(() => generate({ ...OPTIONS, customers: 0 })).toThrow(RangeError);
    expect(() => generate({ ...OPTIONS, months: 0 })).toThrow(RangeError);
    expect(() => generate({ ...OPTIONS, endDate: "manana" })).toThrow(
      RangeError,
    );
  });
});

describe("shape of the data", () => {
  it("generates customers, accounts, merchants and transactions", () => {
    expect(dataset.customers).toHaveLength(3);
    expect(dataset.accounts.length).toBeGreaterThanOrEqual(3);
    expect(dataset.merchants.length).toBeGreaterThan(30);
    expect(dataset.purchases.length).toBeGreaterThan(200);
    expect(dataset.deposits.length).toBeGreaterThan(20);
    expect(dataset.bills.length).toBeGreaterThan(10);
  });

  it("gives every account a 16 digit number, as Nessie does", () => {
    for (const account of dataset.accounts) {
      expect(account.accountNumber).toMatch(/^\d{16}$/);
    }
  });

  it("keeps every id unique across every entity", () => {
    const ids = [
      ...dataset.customers.map((row) => row.id),
      ...dataset.accounts.map((row) => row.id),
      ...dataset.merchants.map((row) => row.id),
      ...dataset.purchases.map((row) => row.id),
      ...dataset.deposits.map((row) => row.id),
      ...dataset.bills.map((row) => row.id),
    ];

    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("invariants", () => {
  it("reconciles every balance with the transactions, to the cent", () => {
    for (const account of dataset.accounts) {
      let movement = 0;
      for (const deposit of dataset.deposits) {
        if (deposit.accountId === account.id) {
          movement += cents(deposit.amount);
        }
      }
      for (const purchase of dataset.purchases) {
        if (purchase.accountId === account.id) {
          movement -= cents(purchase.amount);
        }
      }
      for (const bill of dataset.bills) {
        if (bill.accountId === account.id && bill.status === "completed") {
          movement -= cents(bill.paymentAmount);
        }
      }

      expect(cents(account.balance)).toBe(
        cents(account.openingBalance) + movement,
      );
      expect(account.balance).toBeGreaterThan(0);
    }
  });

  it("never dates a transaction in the future or before the window", () => {
    for (const purchase of dataset.purchases) {
      expect(isDay(purchase.date)).toBe(true);
      expect(purchase.date >= dataset.window.from).toBe(true);
      expect(purchase.date <= dataset.window.to).toBe(true);
    }
    for (const deposit of dataset.deposits) {
      expect(deposit.date >= dataset.window.from).toBe(true);
      expect(deposit.date <= dataset.window.to).toBe(true);
    }
    for (const bill of dataset.bills) {
      if (bill.status === "completed") {
        expect(bill.paymentDate <= dataset.window.to).toBe(true);
      }
    }
  });

  it("puts the only future date on the bills that have not been paid yet", () => {
    const pending = dataset.bills.filter((bill) => bill.status === "pending");

    expect(pending.length).toBeGreaterThan(0);
    for (const bill of pending) {
      expect(bill.upcomingPaymentDate > dataset.window.to).toBe(true);
      expect(bill.recurringDate).toBeGreaterThanOrEqual(1);
      expect(bill.recurringDate).toBeLessThanOrEqual(28);
    }
  });

  it("references only merchants that exist", () => {
    const ids = new Set(dataset.merchants.map((merchant) => merchant.id));

    for (const purchase of dataset.purchases) {
      expect(ids.has(purchase.merchantId)).toBe(true);
    }
  });

  it("pays salary on the quincena, shifted off weekends", () => {
    const payroll = dataset.deposits.filter(
      (deposit) => deposit.description === "Nomina quincena",
    );

    expect(payroll.length).toBeGreaterThan(10);
    for (const deposit of payroll) {
      expect(isPayday(deposit.date)).toBe(true);
    }
  });

  it("sizes spending against income, so nobody spends twice what they earn", () => {
    const ledger = toLedgerTx(dataset);
    for (const account of dataset.accounts) {
      const rows = ledger.filter((row) => row.accountId === account.id);
      if (rows.length === 0) {
        // A savings account is generated with an opening balance and no activity.
        expect(account.balance).toBe(account.openingBalance);
        continue;
      }
      let debit = 0;
      let credit = 0;
      for (const row of rows) {
        if (row.direction === "debit") {
          debit += cents(row.amount);
        } else {
          credit += cents(row.amount);
        }
      }

      expect(credit).toBeGreaterThan(0);
      expect(debit / credit).toBeGreaterThan(0.45);
      expect(debit / credit).toBeLessThan(1.2);
    }
  });

  it("spends less than it earns across the whole dataset", () => {
    const totals = summarize(dataset).totals;

    expect(totals.spend).toBeLessThan(totals.income);
  });

  it("opens the demo on the account with the most purchases", () => {
    const hero = dataset.notes.heroAccountId;
    const countFor = (accountId: string): number =>
      dataset.purchases.filter((purchase) => purchase.accountId === accountId)
        .length;

    expect(hero).not.toBe("");
    for (const account of dataset.accounts) {
      expect(countFor(hero)).toBeGreaterThanOrEqual(countFor(account.id));
    }
  });
});

describe("deliberate dirt", () => {
  it("ships exactly one refund, posted as a negative purchase", () => {
    const refunds = dataset.purchases.filter((purchase) => purchase.amount < 0);

    expect(refunds).toHaveLength(1);
    expect(refunds[0].id).toBe(dataset.notes.refundPurchaseId);
    expect(refunds[0].description).toContain("Devolucion");
    expect(refunds[0].accountId).toBe(dataset.notes.heroAccountId);
  });

  it("ships exactly one merchant name under two different ids", () => {
    const byName = new Map<string, number>();
    for (const merchant of dataset.merchants) {
      byName.set(merchant.name, (byName.get(merchant.name) ?? 0) + 1);
    }
    const duplicated = [...byName.entries()].filter(([, count]) => count > 1);

    expect(duplicated).toHaveLength(1);
    expect(duplicated[0][0]).toBe(dataset.notes.duplicateMerchantName);
  });

  it("ships exactly one merchant with no category at all", () => {
    const uncategorised = dataset.merchants.filter(
      (merchant) => merchant.category === undefined,
    );

    expect(uncategorised).toHaveLength(1);
    expect(uncategorised[0].id).toBe(dataset.notes.merchantWithoutCategoryId);
  });
});

describe("toLedgerTx", () => {
  const ledger = toLedgerTx(dataset);

  it("covers purchases, deposits and paid bills, and nothing else", () => {
    const paidBills = dataset.bills.filter(
      (bill) => bill.status === "completed",
    ).length;

    expect(ledger).toHaveLength(
      dataset.purchases.length + dataset.deposits.length + paidBills,
    );
  });

  it("turns the refund into a credit with a positive amount", () => {
    const refund = ledger.find(
      (row) => row.id === dataset.notes.refundPurchaseId,
    );

    expect(refund?.direction).toBe("credit");
    expect(refund?.amount).toBeGreaterThan(0);
    expect(refund?.raw.amount).toBeLessThan(0);
  });

  it("produces parsable instants, sorted oldest first, tagged with the source", () => {
    let previous = "";
    for (const row of ledger) {
      expect(Number.isFinite(Date.parse(row.occurredAt))).toBe(true);
      expect(row.occurredAt >= previous).toBe(true);
      expect(row.source).toBe(SEED_SOURCE);
      previous = row.occurredAt;
    }
  });

  it("carries a real time of day, which is what Nessie cannot hold", () => {
    // 22:00 in Monterrey is 04:00 UTC the next day. A date-only mirror loses that.
    expect(toInstant("2026-09-11", 1320)).toBe("2026-09-12T04:00:00.000Z");
    expect(
      new Set(ledger.map((row) => row.occurredAt.slice(11, 16))).size,
    ).toBeGreaterThan(5);
  });

  it("leaves the category off rows the data cannot classify", () => {
    const uncategorisedMerchantId = dataset.notes.merchantWithoutCategoryId;
    const rows = ledger.filter(
      (row) => row.merchantId === uncategorisedMerchantId,
    );

    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.category).toBeUndefined();
    }
  });
});

describe("summarize", () => {
  it("reports the counts, the hero account and the totals", () => {
    const summary = summarize(dataset);

    expect(summary.seed).toBe(DEFAULT_SEED);
    expect(summary.window).toEqual(dataset.window);
    expect(summary.counts.purchases).toBe(dataset.purchases.length);
    expect(summary.counts.ledgerRows).toBe(toLedgerTx(dataset).length);
    expect(summary.heroAccountId).toBe(dataset.notes.heroAccountId);
    expect(summary.demoAccountIds[0]).toBe(summary.heroAccountId);
    expect(summary.demoAccountIds).toHaveLength(3);
    expect(summary.totals.spend).toBeGreaterThan(0);
    expect(summary.totals.income).toBeGreaterThan(0);
  });
});

describe("the merchant catalogue", () => {
  it("has enough Monterrey merchants to look like a statement", () => {
    expect(MX_MERCHANTS.length).toBeGreaterThanOrEqual(30);
  });

  it("gives every merchant a usable range and frequency", () => {
    for (const merchant of MX_MERCHANTS) {
      expect(merchant.min).toBeGreaterThan(0);
      expect(merchant.max).toBeGreaterThan(merchant.min);
      expect(merchant.monthlyFrequency).toBeGreaterThan(0);
      expect(merchant.name.trim()).toBe(merchant.name);
    }
  });
});
