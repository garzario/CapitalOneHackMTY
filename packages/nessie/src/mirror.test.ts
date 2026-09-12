/**
 * The bank mirror push and read-back, against an injected fetch that records every
 * request. No network, no key, no fixtures beyond the rows built here.
 *
 * The cases are the ones that decide whether the mirror is real: the order of the
 * creates, the exact body of each one, dates with no time anywhere, credits left
 * out, the limit taking the newest rows, a second run that creates nothing, a
 * read-back that equals the generator's rows, a 5xx retried, and a 403 reported as
 * a wrong path rather than a bad key.
 */

import { describe, expect, it } from "bun:test";
import type { LedgerTx } from "@hackmty/core";
import { type FetchLike, NessieClient, NessiePathError } from "./client";
import {
  KEY_FINGERPRINT_LENGTH,
  keyFingerprint,
  type MirrorCompany,
  type MirrorIds,
  type MirrorMerchant,
  mirrorPurchasesPath,
  monterreyDay,
  openingBalanceFor,
  pushCompanyMirror,
  readCompanyMirror,
  reconcileByDay,
  referenceFor,
  splitTradeName,
  stateCode,
  syntheticAccountNumber,
  totalsByDay,
} from "./mirror";
import { normalizePurchase } from "./normalize";
import type { NessiePurchase } from "./types";

const API_KEY = "test-key";

interface Recorded {
  method: string;
  path: string;
  url: string;
  body: unknown;
}

type Handler = (call: Recorded) => Response | Promise<Response>;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function stub(handler: Handler): { calls: Recorded[]; fetchImpl: FetchLike } {
  const calls: Recorded[] = [];
  const fetchImpl: FetchLike = async (url, init) => {
    const withoutKey = url.split("?")[0] ?? url;
    const call: Recorded = {
      method: init?.method ?? "GET",
      path: withoutKey.replace("https://api.nessieisreal.com", ""),
      url,
      body: typeof init?.body === "string" ? JSON.parse(init.body) : init?.body,
    };
    calls.push(call);
    return handler(call);
  };
  return { calls, fetchImpl };
}

function client(fetchImpl: FetchLike): NessieClient {
  return new NessieClient({
    apiKey: API_KEY,
    fetch: fetchImpl,
    timeoutMs: 0,
    sleep: async () => {},
  });
}

const COMPANY: MirrorCompany = {
  rfc: "SYN090615C01",
  legalName: "Metalicos del Norte SA de CV",
  tradeName: "Metalicos del Norte",
  city: "Apodaca",
  state: "Nuevo Leon",
  clabe: "058180001142789037",
  bankAccountId: "5e1a0f00c0ffee0000000001",
};

const MERCHANTS: MirrorMerchant[] = [
  {
    id: "m-regios",
    rfc: "SYN990202S02",
    name: "Maquinados Industriales Regios SA de CV",
    city: "Monterrey",
  },
  {
    id: "m-aceros",
    rfc: "SYN010203A03",
    name: "Aceros del Poniente SA de CV",
    city: "Santa Catarina",
  },
];

/**
 * A mirror row exactly as packages/seed builds one: a Nessie purchase run through
 * the real normaliser. Building it any other way would test a shape this
 * repository does not produce.
 */
function mirrorRow(input: {
  id: string;
  day: string;
  amount: number;
  merchantId: string;
  clave: string;
}): LedgerTx {
  const purchase: NessiePurchase = {
    _id: input.id,
    type: "merchant",
    merchant_id: input.merchantId,
    payer_id: COMPANY.bankAccountId,
    purchase_date: input.day,
    amount: input.amount,
    status: "completed",
    medium: "balance",
    description: `SPEI ${input.clave} SYN990202S02`,
  };
  return normalizePurchase(purchase, {
    accountId: COMPANY.bankAccountId,
    categoryByMerchantId: { [input.merchantId]: "maquinados" },
  });
}

const ROWS: LedgerTx[] = [
  mirrorRow({
    id: "aaa0000000000000000000a1",
    day: "2026-08-27",
    amount: 31320.5,
    merchantId: "m-regios",
    clave: "SYN202608270001",
  }),
  mirrorRow({
    id: "aaa0000000000000000000a2",
    day: "2026-09-03",
    amount: 128400,
    merchantId: "m-aceros",
    clave: "SYN202609030001",
  }),
  mirrorRow({
    id: "aaa0000000000000000000a3",
    day: "2026-09-10",
    amount: 47812.25,
    merchantId: "m-regios",
    clave: "SYN202609100001",
  }),
];

/** A refund, which is a credit, and must never reach the bank mirror. */
const CREDIT: LedgerTx = {
  ...ROWS[0],
  id: "credit-row",
  direction: "credit",
};

/** Answers every create with a Nessie-shaped envelope and an id built from the body. */
function creatingHandler(options: { purchases?: NessiePurchase[] } = {}) {
  let merchantSeq = 0;
  let purchaseSeq = 0;
  return (call: Recorded): Response => {
    if (call.method === "GET" && call.path.endsWith("/purchases")) {
      return json(options.purchases ?? []);
    }
    if (call.method === "GET" && call.path === "/merchants") {
      return json([]);
    }
    if (call.path === "/customers") {
      return json(
        {
          code: 201,
          objectCreated: { _id: "cust-1", ...(call.body as object) },
        },
        201,
      );
    }
    if (call.path.endsWith("/accounts")) {
      return json(
        {
          code: 201,
          objectCreated: { _id: "acct-1", ...(call.body as object) },
        },
        201,
      );
    }
    if (call.path === "/merchants") {
      merchantSeq += 1;
      return json(
        {
          code: 201,
          objectCreated: {
            _id: `merch-${merchantSeq}`,
            ...(call.body as object),
          },
        },
        201,
      );
    }
    purchaseSeq += 1;
    return json(
      {
        code: 201,
        objectCreated: {
          _id: `purch-${purchaseSeq}`,
          ...(call.body as object),
        },
      },
      201,
    );
  };
}

describe("the day a row is booked on", () => {
  it("takes the Monterrey calendar day and drops the time of day", () => {
    // 12:00 UTC is 06:00 in Monterrey, which is the importer's assumed instant.
    expect(monterreyDay("2026-09-03T12:00:00.000Z")).toBe("2026-09-03");
    // 23:30 local on the 3rd is 05:30 UTC on the 4th, and it is still the 3rd.
    expect(monterreyDay("2026-09-04T05:30:00.000Z")).toBe("2026-09-03");
  });

  it("refuses an unparseable instant rather than inventing a day", () => {
    expect(() => monterreyDay("not a date")).toThrow(RangeError);
  });
});

describe("the customer built from a company", () => {
  it("splits the trade name, because SA de CV is not a surname", () => {
    expect(splitTradeName("Metalicos del Norte")).toEqual({
      firstName: "Metalicos",
      lastName: "del Norte",
    });
  });

  it("never leaves a name empty", () => {
    expect(splitTradeName("Metalicos").lastName).toBe("Sintetica");
    expect(splitTradeName("   ").firstName).toBe("Empresa");
  });

  /**
   * Both of these are verified refusals from the live API on 2026-09-12, not
   * guesses: a longer state and an array category each answer 400.
   */
  it("shortens the state to the two characters Nessie accepts", () => {
    expect(stateCode("Nuevo Leon")).toBe("NL");
    expect(stateCode("NL")).toBe("NL");
    expect(stateCode("Jalisco")).toBe("JA");
  });
});

describe("the account number", () => {
  it("is 16 digits, deterministic, and is not the CLABE", () => {
    const number = syntheticAccountNumber(COMPANY.clabe);
    expect(number).toMatch(/^\d{16}$/);
    expect(syntheticAccountNumber(COMPANY.clabe)).toBe(number);
    expect(COMPANY.clabe).not.toContain(number);
    expect(number).not.toBe(COMPANY.clabe.slice(0, 16));
  });

  it("changes when the CLABE changes", () => {
    expect(syntheticAccountNumber("012180100091764613")).not.toBe(
      syntheticAccountNumber(COMPANY.clabe),
    );
  });
});

describe("the opening balance", () => {
  it("covers every purchase, so the account never goes negative", () => {
    const outflow = ROWS.reduce((sum, row) => sum + row.amount, 0);
    expect(openingBalanceFor(ROWS)).toBeGreaterThan(outflow);
  });
});

describe("the purchase description", () => {
  it("carries the clave de rastreo out of the row, and nothing else", () => {
    expect(referenceFor(ROWS[1] as LedgerTx)).toBe("SPEI SYN202609030001");
  });

  it("falls back to the transfer id, then to the local row id", () => {
    const noClave: LedgerTx = {
      ...(ROWS[0] as LedgerTx),
      raw: { _id: "bbb0000000000000000000b1" },
    };
    expect(referenceFor(noClave)).toBe("SPEI bbb0000000000000000000b1");
    const bare: LedgerTx = { ...(ROWS[0] as LedgerTx), raw: {} };
    expect(referenceFor(bare)).toBe(`SPEI ${ROWS[0]?.id}`);
  });
});

describe("pushing the mirror", () => {
  it("creates the customer, then the account, then the merchants, then the purchases", async () => {
    const { calls, fetchImpl } = stub(creatingHandler());

    const ids = await pushCompanyMirror(client(fetchImpl), {
      company: COMPANY,
      merchants: MERCHANTS,
      rows: ROWS,
    });

    expect(calls.map((call) => `${call.method} ${call.path}`)).toEqual([
      "POST /customers",
      "POST /customers/cust-1/accounts",
      "POST /merchants",
      "POST /merchants",
      "POST /accounts/acct-1/purchases",
      "POST /accounts/acct-1/purchases",
      "POST /accounts/acct-1/purchases",
    ]);
    expect(ids.customerId).toBe("cust-1");
    expect(ids.accountId).toBe("acct-1");
    expect(ids.purchases).toBe(3);
    expect(ids.merchants).toEqual({
      "m-regios": "merch-1",
      "m-aceros": "merch-2",
    });
    expect(ids.skipped.failures).toBe(0);
    expect(ids.keyValidatedAt).toBeDefined();
  });

  it("posts exactly one customer body, with the address off the company profile", async () => {
    const { calls, fetchImpl } = stub(creatingHandler());

    await pushCompanyMirror(client(fetchImpl), {
      company: COMPANY,
      merchants: MERCHANTS,
      rows: ROWS,
    });

    expect(calls[0]?.body).toEqual({
      first_name: "Metalicos",
      last_name: "del Norte",
      address: {
        street_number: "1200",
        street_name: "Avenida Miguel Aleman",
        city: "Apodaca",
        state: "NL",
        zip: "66600",
      },
    });
  });

  it("opens one Checking account whose number is not the CLABE", async () => {
    const { calls, fetchImpl } = stub(creatingHandler());

    await pushCompanyMirror(client(fetchImpl), {
      company: COMPANY,
      merchants: MERCHANTS,
      rows: ROWS,
    });

    const account = calls[1]?.body as Record<string, unknown>;
    expect(account.type).toBe("Checking");
    expect(account.nickname).toBe("Cuenta operativa SPEI");
    expect(account.rewards).toBe(0);
    expect(account.account_number).toBe(syntheticAccountNumber(COMPANY.clabe));
    expect(JSON.stringify(calls)).not.toContain(COMPANY.clabe);
  });

  it("posts one merchant per supplier, in the proveedores category", async () => {
    const { calls, fetchImpl } = stub(creatingHandler());

    await pushCompanyMirror(client(fetchImpl), {
      company: COMPANY,
      merchants: MERCHANTS,
      rows: ROWS,
    });

    expect(calls[2]?.body).toEqual({
      name: "Maquinados Industriales Regios SA de CV",
      category: "proveedores",
      address: {
        street_number: "1200",
        street_name: "Avenida Miguel Aleman",
        city: "Monterrey",
        state: "NL",
        zip: "66600",
      },
      geocode: { lat: 25.6866, lng: -100.3161 },
    });
  });

  it("posts a purchase with a date and no time at all", async () => {
    const { calls, fetchImpl } = stub(creatingHandler());

    await pushCompanyMirror(client(fetchImpl), {
      company: COMPANY,
      merchants: MERCHANTS,
      rows: ROWS,
    });

    expect(calls[4]?.body).toEqual({
      merchant_id: "merch-1",
      medium: "balance",
      purchase_date: "2026-08-27",
      amount: 31320.5,
      status: "completed",
      description: "SPEI SYN202608270001",
    });
    for (const call of calls) {
      const body = JSON.stringify(call.body ?? {});
      expect(body).not.toContain("T12:00:00");
      expect(body).not.toContain('Z"');
    }
  });

  it("never puts the key in a body or in a description", async () => {
    const { calls, fetchImpl } = stub(creatingHandler());

    await pushCompanyMirror(client(fetchImpl), {
      company: COMPANY,
      merchants: MERCHANTS,
      rows: ROWS,
    });

    for (const call of calls) {
      expect(JSON.stringify(call.body ?? {})).not.toContain(API_KEY);
      // The key belongs in the query string and nowhere else.
      expect(call.url).toContain(`key=${API_KEY}`);
    }
  });

  it("skips credits and counts them, because the mirror is outflows only", async () => {
    const { calls, fetchImpl } = stub(creatingHandler());

    const ids = await pushCompanyMirror(client(fetchImpl), {
      company: COMPANY,
      merchants: MERCHANTS,
      rows: [...ROWS, CREDIT],
    });

    expect(ids.skipped.credits).toBe(1);
    expect(ids.purchases).toBe(3);
    expect(
      calls.filter((call) => call.path.endsWith("/purchases")).length,
    ).toBe(3);
  });

  it("takes the newest rows when a limit is given, and pushes them oldest first", async () => {
    const { calls, fetchImpl } = stub(creatingHandler());

    const ids = await pushCompanyMirror(
      client(fetchImpl),
      { company: COMPANY, merchants: MERCHANTS, rows: ROWS },
      { limit: 2 },
    );

    const dates = calls
      .filter((call) => call.path.endsWith("/purchases"))
      .map((call) => (call.body as { purchase_date: string }).purchase_date);
    expect(dates).toEqual(["2026-09-03", "2026-09-10"]);
    expect(ids.skipped.overLimit).toBe(1);
  });

  it("pushes every row when the limit is 0", async () => {
    const { calls, fetchImpl } = stub(creatingHandler());

    const ids = await pushCompanyMirror(
      client(fetchImpl),
      { company: COMPANY, merchants: MERCHANTS, rows: ROWS },
      { limit: 0 },
    );

    expect(ids.purchases).toBe(3);
    expect(ids.skipped.overLimit).toBe(0);
    expect(calls.filter((c) => c.path.endsWith("/purchases")).length).toBe(3);
  });
});

describe("a second run with the ids of the first", () => {
  /** What the first run left on the account, as Nessie would answer a GET. */
  function pushed(rows: readonly LedgerTx[]): NessiePurchase[] {
    return rows.map((row, index) => ({
      _id: `purch-${index + 1}`,
      type: "merchant",
      merchant_id: row.merchantId === "m-regios" ? "merch-1" : "merch-2",
      payer_id: "acct-1",
      purchase_date: monterreyDay(row.occurredAt),
      // Whole pesos, the way Nessie actually stores an amount. If the dedupe key
      // carried centavos, this is the case that would fail.
      amount: Math.trunc(row.amount),
      status: "completed",
      medium: "balance",
      description: referenceFor(row),
    }));
  }

  const existing: MirrorIds = {
    customerId: "cust-1",
    accountId: "acct-1",
    merchants: { "m-regios": "merch-1", "m-aceros": "merch-2" },
    purchases: 3,
    skipped: { credits: 0, overLimit: 0, alreadyThere: 0, failures: 0 },
    pushedAt: "2026-09-12T04:00:00.000Z",
    keyValidatedAt: "2026-09-12T04:00:00.000Z",
    firstFailures: [],
    listingFailed: false,
  };

  it("creates nothing at all when every row is already there", async () => {
    const { calls, fetchImpl } = stub(
      creatingHandler({ purchases: pushed(ROWS) }),
    );

    const ids = await pushCompanyMirror(
      client(fetchImpl),
      { company: COMPANY, merchants: MERCHANTS, rows: ROWS },
      { existing },
    );

    expect(calls.filter((call) => call.method === "POST")).toEqual([]);
    expect(ids.purchases).toBe(0);
    expect(ids.skipped.alreadyThere).toBe(3);
    // The key was validated by the first run, and this run did not write.
    expect(ids.keyValidatedAt).toBeUndefined();
  });

  it("aborts the purchase phase when the account cannot be listed", async () => {
    // Without the listing there is no dedupe set, and the rows below are all
    // already on the account: pushing them again would double the statement.
    const inner = creatingHandler({ purchases: pushed(ROWS) });
    const { calls, fetchImpl } = stub((call) => {
      if (call.method === "GET" && call.path.endsWith("/purchases")) {
        return json({ message: "Internal Server Error" }, 500);
      }
      return inner(call);
    });

    const ids = await pushCompanyMirror(
      client(fetchImpl),
      { company: COMPANY, merchants: MERCHANTS, rows: ROWS },
      { existing },
    );

    expect(ids.listingFailed).toBe(true);
    expect(ids.purchases).toBe(0);
    expect(ids.skipped.failures).toBe(1);
    expect(ids.firstFailures[0]).toContain("list purchases on acct-1");
    // The point of the case: nothing was posted, so the mirror is unchanged.
    expect(calls.filter((call) => call.method === "POST")).toEqual([]);
  });

  it("pushes only the rows that are missing", async () => {
    const { calls, fetchImpl } = stub(
      creatingHandler({ purchases: pushed(ROWS.slice(0, 2)) }),
    );

    const ids = await pushCompanyMirror(
      client(fetchImpl),
      { company: COMPANY, merchants: MERCHANTS, rows: ROWS },
      { existing },
    );

    const posted = calls.filter((call) => call.method === "POST");
    expect(posted).toHaveLength(1);
    expect(posted[0]?.body).toMatchObject({ purchase_date: "2026-09-10" });
    expect(ids.purchases).toBe(1);
    expect(ids.skipped.alreadyThere).toBe(2);
  });

  it("creates a merchant the first run never got to", async () => {
    const { calls, fetchImpl } = stub(
      creatingHandler({ purchases: pushed(ROWS) }),
    );

    const ids = await pushCompanyMirror(
      client(fetchImpl),
      { company: COMPANY, merchants: MERCHANTS, rows: ROWS },
      { existing: { ...existing, merchants: { "m-regios": "merch-1" } } },
    );

    expect(
      calls.filter(
        (call) => call.method === "POST" && call.path === "/merchants",
      ),
    ).toHaveLength(1);
    expect(ids.merchants["m-aceros"]).toBe("merch-1");
  });
});

describe("reading the mirror back", () => {
  it("returns the generator's rows, re-homed on the local account", async () => {
    const nessieRows: NessiePurchase[] = ROWS.map((row, index) => ({
      _id: `purch-${index + 1}`,
      type: "merchant",
      merchant_id: row.merchantId === "m-regios" ? "merch-1" : "merch-2",
      payer_id: "acct-1",
      purchase_date: monterreyDay(row.occurredAt),
      amount: row.amount,
      status: "completed",
      medium: "balance",
      description: referenceFor(row),
    }));
    const merchantIdByLocal: Record<string, string> = {
      "m-regios": "merch-1",
      "m-aceros": "merch-2",
    };
    const { fetchImpl } = stub((call) => {
      if (call.path === "/merchants") {
        return json([
          { _id: "merch-1", name: "Maquinados", category: ["proveedores"] },
          { _id: "merch-2", name: "Aceros", category: ["proveedores"] },
        ]);
      }
      return json(nessieRows);
    });

    const { rows, rejected } = await readCompanyMirror(
      client(fetchImpl),
      { accountId: "acct-1" },
      COMPANY.bankAccountId,
    );

    expect(rejected).toEqual([]);
    expect(rows).toHaveLength(ROWS.length);
    for (const [index, actual] of rows.entries()) {
      const expected = ROWS[index] as LedgerTx;
      expect(actual.accountId).toBe(expected.accountId);
      expect(monterreyDay(actual.occurredAt)).toBe(
        monterreyDay(expected.occurredAt),
      );
      expect(actual.amount).toBe(expected.amount);
      expect(actual.direction).toBe(expected.direction);
      expect(actual.source).toBe("nessie");
      expect(actual.merchantId).toBe(
        merchantIdByLocal[expected.merchantId as string],
      );
      // The id is the one field the round trip cannot preserve: it is derived
      // from the _id Nessie assigned, not from the one the generator minted.
      expect(actual.id).not.toBe(expected.id);
    }
  });

  it("reconciles day by day, and reports nothing when the round trip is exact", async () => {
    expect(totalsByDay(ROWS)).toEqual([
      { day: "2026-08-27", count: 1, amount: 31320.5 },
      { day: "2026-09-03", count: 1, amount: 128400 },
      { day: "2026-09-10", count: 1, amount: 47812.25 },
    ]);
    expect(reconcileByDay(ROWS, ROWS)).toEqual([]);
  });

  it("names the day that differs, in count and in pesos", () => {
    const short = ROWS.slice(0, 2);
    expect(reconcileByDay(ROWS, short)).toEqual([
      {
        day: "2026-09-10",
        expectedCount: 1,
        actualCount: 0,
        expectedAmount: 47812.25,
        actualAmount: 0,
      },
    ]);
  });

  /**
   * Verified against the live API on 2026-09-12: Nessie stores a purchase
   * amount as a whole number, so a row posted at 31320.50 comes back as 31320.
   * The reconciliation tolerates a shortfall of under one peso per row and
   * nothing else.
   */
  it("tolerates the centavos Nessie drops, and only those", () => {
    const truncated = ROWS.map((row) => ({
      ...row,
      amount: Math.floor(row.amount),
    }));
    expect(reconcileByDay(ROWS, truncated)).toEqual([]);
    // A peso missing is a peso missing, not a rounding artefact.
    const short = truncated.map((row, index) =>
      index === 0 ? { ...row, amount: row.amount - 1 } : row,
    );
    expect(reconcileByDay(ROWS, short).map((diff) => diff.day)).toEqual([
      "2026-08-27",
    ]);
    // And a read-back that is OVER is always a difference.
    const over = ROWS.map((row, index) =>
      index === 0 ? { ...row, amount: row.amount + 0.01 } : row,
    );
    expect(reconcileByDay(ROWS, over).map((diff) => diff.day)).toEqual([
      "2026-08-27",
    ]);
    // With no tolerance every row that lost a centavo is a difference again.
    // 128400.00 is already whole, so two of the three days move.
    expect(
      reconcileByDay(ROWS, truncated, { tolerancePerRow: 0 }).map(
        (diff) => diff.day,
      ),
    ).toEqual(["2026-08-27", "2026-09-10"]);
  });
});

describe("what the network does to the push", () => {
  it("retries a 5xx and then succeeds, so one bad gateway is not a failed demo", async () => {
    let customerAttempts = 0;
    const base = creatingHandler();
    const { calls, fetchImpl } = stub((call) => {
      if (call.path === "/customers") {
        customerAttempts += 1;
        if (customerAttempts === 1) {
          return new Response("upstream hiccup", { status: 502 });
        }
      }
      return base(call);
    });

    const ids = await pushCompanyMirror(client(fetchImpl), {
      company: COMPANY,
      merchants: MERCHANTS,
      rows: ROWS,
    });

    expect(customerAttempts).toBe(2);
    expect(ids.customerId).toBe("cust-1");
    expect(calls.filter((c) => c.path === "/customers")).toHaveLength(2);
  });

  it("reports a 403 Missing Authentication Token as a wrong path, not a bad key", async () => {
    const { fetchImpl } = stub(() =>
      json({ message: "Missing Authentication Token" }, 403),
    );

    const push = pushCompanyMirror(client(fetchImpl), {
      company: COMPANY,
      merchants: MERCHANTS,
      rows: ROWS,
    });

    await expect(push).rejects.toBeInstanceOf(NessiePathError);
    await push.catch((cause: NessiePathError) => {
      expect(cause.message).toContain("the path is wrong, not the key");
      expect(cause.message).not.toContain(API_KEY);
    });
  });

  it("counts a purchase the API refused instead of abandoning the rest", async () => {
    const base = creatingHandler();
    let purchaseCalls = 0;
    const { fetchImpl } = stub((call) => {
      if (call.method === "POST" && call.path.endsWith("/purchases")) {
        purchaseCalls += 1;
        if (purchaseCalls === 2) {
          return json({ message: "bad amount" }, 400);
        }
      }
      return base(call);
    });

    const ids = await pushCompanyMirror(client(fetchImpl), {
      company: COMPANY,
      merchants: MERCHANTS,
      rows: ROWS,
    });

    expect(ids.purchases).toBe(2);
    expect(ids.skipped.failures).toBe(1);
    expect(ids.firstFailures).toHaveLength(1);
    expect(ids.firstFailures[0]).not.toContain(API_KEY);
  });
});

describe("the path a judge pastes", () => {
  it("names the account's purchases and carries no key", () => {
    const path = mirrorPurchasesPath("acct-1");
    expect(path).toBe("/accounts/acct-1/purchases");
    expect(path).not.toContain("key");
  });
});

describe("the key fingerprint", () => {
  it("is twelve hex characters of SHA-256, and never the key", () => {
    // The published SHA-256 of the empty string, which is what makes this a
    // check of the digest rather than a check of itself.
    expect(keyFingerprint("")).toBe("e3b0c44298fc");
    const fingerprint = keyFingerprint(API_KEY);
    expect(fingerprint).toHaveLength(KEY_FINGERPRINT_LENGTH);
    expect(fingerprint).toMatch(/^[0-9a-f]+$/);
    expect(fingerprint).not.toContain(API_KEY);
  });

  it("is stable for one key and different for another", () => {
    expect(keyFingerprint(API_KEY)).toBe(keyFingerprint(API_KEY));
    expect(keyFingerprint(API_KEY)).not.toBe(keyFingerprint(`${API_KEY}-2`));
  });
});
