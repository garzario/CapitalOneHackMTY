import { describe, expect, it } from "bun:test";
import { NessieClient } from "./client";
import merchantsFixture from "./fixtures/merchants.json";
import purchasesFixture from "./fixtures/purchases.json";
import {
  buildCategoryIndex,
  dateToInstant,
  merchantCategory,
  NESSIE_SOURCE,
  normalizeAll,
  normalizeDeposit,
  normalizePurchase,
  normalizeWithdrawal,
} from "./normalize";
import type { NessieDeposit, NessiePurchase, NessieWithdrawal } from "./types";

const ACCOUNT_ID = "012de01e-4f2b-4c9d-8a77-9b3a1d5e6f02";
const MERCHANT_ID = "5b6a0f3a1c9d440000a1b2c3";

function purchase(overrides: Partial<NessiePurchase> = {}): NessiePurchase {
  return {
    _id: "c1f7c5e8-0a3b-4f9d-8e21-5d6c7b8a9f01",
    type: "merchant",
    merchant_id: MERCHANT_ID,
    payer_id: ACCOUNT_ID,
    purchase_date: "2026-09-10",
    amount: 46,
    status: "completed",
    medium: "balance",
    description: "OXXO recarga y cafe",
    ...overrides,
  };
}

function deposit(overrides: Partial<NessieDeposit> = {}): NessieDeposit {
  return {
    _id: "a9b8c7d6-1234-4f00-9abc-de0123456789",
    medium: "balance",
    transaction_date: "2026-09-15",
    status: "completed",
    amount: 9000,
    description: "Nomina quincena",
    ...overrides,
  };
}

function withdrawal(
  overrides: Partial<NessieWithdrawal> = {},
): NessieWithdrawal {
  return {
    _id: "f0e1d2c3-4b5a-4987-8123-0a1b2c3d4e5f",
    medium: "balance",
    transaction_date: "2026-09-05",
    status: "completed",
    amount: 1500,
    description: "Retiro en cajero",
    ...overrides,
  };
}

describe("dateToInstant", () => {
  it("places a date-only row at 12:00 UTC, which is 06:00 in Monterrey", () => {
    expect(dateToInstant("2026-09-10")).toBe("2026-09-10T12:00:00.000Z");
  });

  it("passes a full instant through untouched", () => {
    expect(dateToInstant("2026-09-10T23:45:00.000Z")).toBe(
      "2026-09-10T23:45:00.000Z",
    );
  });

  it("accepts an explicit time of day", () => {
    expect(dateToInstant("2026-09-10", 0)).toBe("2026-09-10T00:00:00.000Z");
  });

  it("refuses a value it cannot read", () => {
    expect(() => dateToInstant("manana")).toThrow(RangeError);
  });
});

describe("normalizePurchase", () => {
  it("becomes a debit on the account, with the original row kept in raw", () => {
    const row = normalizePurchase(purchase(), { accountId: ACCOUNT_ID });

    expect(row.accountId).toBe(ACCOUNT_ID);
    expect(row.direction).toBe("debit");
    expect(row.amount).toBe(46);
    expect(row.occurredAt).toBe("2026-09-10T12:00:00.000Z");
    expect(row.merchantId).toBe(MERCHANT_ID);
    expect(row.source).toBe(NESSIE_SOURCE);
    expect(row.raw._id).toBe("c1f7c5e8-0a3b-4f9d-8e21-5d6c7b8a9f01");
    expect(row.category).toBeUndefined();
  });

  it("turns a negative purchase into a credit, because that is a refund", () => {
    const row = normalizePurchase(purchase({ amount: -320 }), {
      accountId: ACCOUNT_ID,
    });

    expect(row.direction).toBe("credit");
    expect(row.amount).toBe(320);
    expect(row.raw.amount).toBe(-320);
  });

  it("derives a uuid key, because a Nessie _id is not one", () => {
    const first = normalizePurchase(purchase(), { accountId: ACCOUNT_ID });
    const again = normalizePurchase(purchase(), { accountId: ACCOUNT_ID });
    const other = normalizePurchase(
      purchase({ _id: "56c66be5a73e4927415071a3" }),
      {
        accountId: ACCOUNT_ID,
      },
    );

    expect(first.id).toBe(again.id);
    expect(first.id).not.toBe(other.id);
    expect(first.id).not.toBe("c1f7c5e8-0a3b-4f9d-8e21-5d6c7b8a9f01");
  });

  it("attaches a category only when the merchant index has one", () => {
    const options = {
      accountId: ACCOUNT_ID,
      categoryByMerchantId: { [MERCHANT_ID]: "convenience" },
    };

    expect(normalizePurchase(purchase(), options).category).toBe("convenience");
    expect(
      normalizePurchase(purchase({ merchant_id: "unknown" }), options).category,
    ).toBeUndefined();
  });

  it("leaves merchantId off a row that has none", () => {
    const row = normalizePurchase(purchase({ merchant_id: "" }), {
      accountId: ACCOUNT_ID,
    });

    expect(row.merchantId).toBeUndefined();
  });
});

describe("normalizeDeposit and normalizeWithdrawal", () => {
  it("reads a deposit as a credit and a withdrawal as a debit", () => {
    expect(
      normalizeDeposit(deposit(), { accountId: ACCOUNT_ID }).direction,
    ).toBe("credit");
    expect(
      normalizeWithdrawal(withdrawal(), { accountId: ACCOUNT_ID }).direction,
    ).toBe("debit");
  });

  it("keys deposits and withdrawals into different uuids", () => {
    const sharedId = "a9b8c7d6-1234-4f00-9abc-de0123456789";
    const asDeposit = normalizeDeposit(deposit({ _id: sharedId }), {
      accountId: ACCOUNT_ID,
    });
    const asWithdrawal = normalizeWithdrawal(withdrawal({ _id: sharedId }), {
      accountId: ACCOUNT_ID,
    });

    expect(asDeposit.id).not.toBe(asWithdrawal.id);
  });
});

describe("merchant categories", () => {
  it("flattens an array, a string, and nothing at all", () => {
    expect(
      merchantCategory({ _id: "1", name: "OXXO", category: ["convenience"] }),
    ).toBe("convenience");
    expect(
      merchantCategory({ _id: "2", name: "HEB", category: "groceries" }),
    ).toBe("groceries");
    expect(
      merchantCategory({ _id: "3", name: "Taqueria", category: [] }),
    ).toBeUndefined();
    expect(merchantCategory({ _id: "4", name: "Taqueria" })).toBeUndefined();
  });

  it("indexes only the merchants that actually have a category", () => {
    const index = buildCategoryIndex([
      { _id: "1", name: "OXXO", category: ["convenience"] },
      { _id: "3", name: "Taqueria", category: [] },
    ]);

    expect(index).toEqual({ "1": "convenience" });
  });
});

describe("normalizeAll", () => {
  it("reports the rows it cannot read instead of hiding them", () => {
    const result = normalizeAll(
      {
        purchases: [purchase(), purchase({ _id: "", description: "sin id" })],
        deposits: [deposit({ amount: Number.NaN })],
      },
      { accountId: ACCOUNT_ID },
    );

    expect(result.rows).toHaveLength(1);
    expect(result.rejected).toHaveLength(2);
    expect(result.rejected[0].kind).toBe("purchase");
    expect(result.rejected[0].reason).toContain("no _id");
    expect(result.rejected[1].kind).toBe("deposit");
    expect(result.rejected[1].reason).toContain("unreadable amount");
  });

  it("returns rows oldest first, whatever order the API used", () => {
    const result = normalizeAll(
      {
        purchases: [
          purchase({ _id: "p2", purchase_date: "2026-09-11" }),
          purchase({ _id: "p1" }),
        ],
        deposits: [deposit({ transaction_date: "2026-08-31" })],
      },
      { accountId: ACCOUNT_ID },
    );

    expect(result.rows.map((row) => row.occurredAt)).toEqual([
      "2026-08-31T12:00:00.000Z",
      "2026-09-10T12:00:00.000Z",
      "2026-09-11T12:00:00.000Z",
    ]);
  });

  it("works end to end on recorded payloads, through the client", async () => {
    const api = new NessieClient({
      apiKey: "test-key",
      timeoutMs: 0,
      fetch: async (url) =>
        new Response(
          JSON.stringify(
            url.includes("/merchants") ? merchantsFixture : purchasesFixture,
          ),
          {
            status: 200,
          },
        ),
    });
    const merchants = await api.listMerchants();
    const rows = await api.listPurchases(ACCOUNT_ID);

    const result = normalizeAll(
      { purchases: rows },
      {
        accountId: ACCOUNT_ID,
        categoryByMerchantId: buildCategoryIndex(merchants),
      },
    );

    expect(result.rejected).toHaveLength(0);
    expect(result.rows).toHaveLength(3);
    // The string amount arrived as "1245.50" and the refund as a negative number.
    expect(result.rows.map((row) => row.amount)).toEqual([1245.5, 46, 320]);
    expect(result.rows.map((row) => row.direction)).toEqual([
      "debit",
      "debit",
      "credit",
    ]);
    expect(result.rows[0].category).toBe("groceries");
  });
});
