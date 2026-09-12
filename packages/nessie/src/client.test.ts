/**
 * Every test here runs against an injected fetch, so the suite needs no network,
 * no key and no fixtures beyond the recorded shapes in ./fixtures. That is what
 * keeps CI under three minutes and keeps a judge's "what happens when the sandbox
 * is down" question answerable.
 */

import { describe, expect, it } from "bun:test";
import {
  type FetchLike,
  NessieClient,
  NessieConfigError,
  NessieError,
  NessiePathError,
} from "./client";
import accounts from "./fixtures/accounts.json";
import customers from "./fixtures/customers.json";
import purchaseCreated from "./fixtures/purchase-created.json";
import purchases from "./fixtures/purchases.json";
import transfersNone from "./fixtures/transfers-none.json";

interface Recorded {
  url: string;
  init: RequestInit | undefined;
}

type Handler = (
  url: string,
  init: RequestInit | undefined,
) => Response | Promise<Response>;

function stub(handler: Handler): { calls: Recorded[]; fetchImpl: FetchLike } {
  const calls: Recorded[] = [];
  const fetchImpl: FetchLike = async (url, init) => {
    calls.push({ url, init });
    return handler(url, init);
  };
  return { calls, fetchImpl };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** timeoutMs 0 keeps no timer alive, and sleep is instant, so the suite is fast. */
function client(
  fetchImpl: FetchLike,
  overrides: Record<string, unknown> = {},
): NessieClient {
  return new NessieClient({
    apiKey: "test-key",
    fetch: fetchImpl,
    timeoutMs: 0,
    sleep: async () => {},
    ...overrides,
  });
}

describe("authentication", () => {
  it("puts the key in the query string and sends no auth header", async () => {
    const { calls, fetchImpl } = stub(() => json(accounts));

    await client(fetchImpl).listAccounts();

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(
      "https://api.nessieisreal.com/accounts?key=test-key",
    );
    expect(JSON.stringify(calls[0].init?.headers)).not.toContain(
      "authorization",
    );
  });

  it("appends the key to a path that already has a query", async () => {
    const { calls, fetchImpl } = stub(() =>
      json({ code: 200, message: "deleted" }),
    );

    await client(fetchImpl).deleteData("Purchases");

    expect(calls[0].url).toBe(
      "https://api.nessieisreal.com/data?type=Purchases&key=test-key",
    );
  });

  it("refuses to build a request with no key, instead of sending one", async () => {
    const { calls, fetchImpl } = stub(() => json([]));
    const unconfigured = new NessieClient({
      apiKey: "",
      fetch: fetchImpl,
      timeoutMs: 0,
    });

    expect(unconfigured.configured).toBe(false);
    await expect(unconfigured.listAccounts()).rejects.toThrow(
      NessieConfigError,
    );
    expect(calls).toHaveLength(0);
  });

  it("reports itself configured when a key is present", () => {
    expect(new NessieClient({ apiKey: "abc", timeoutMs: 0 }).configured).toBe(
      true,
    );
  });
});

describe("the 403 that is really a 404", () => {
  it("throws NessiePathError and says the path is wrong, not the key", async () => {
    const { fetchImpl } = stub(() =>
      json({ message: "Missing Authentication Token" }, 403),
    );

    const failure = await client(fetchImpl)
      .listAccounts()
      .catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(NessiePathError);
    const error = failure as NessiePathError;
    expect(error.hint).toBe("wrong path, not a bad key");
    expect(error.status).toBe(403);
    expect(error.message).toContain("the path is wrong, not the key");
  });
});

describe("inconsistent empty sub-collections", () => {
  it("maps a 404 to an empty list", async () => {
    const { fetchImpl } = stub(() =>
      json("No transfers found for this account", 404),
    );

    expect(await client(fetchImpl).listTransfers("acct-1")).toEqual([]);
  });

  it("maps a 200 with a bare JSON string to an empty list", async () => {
    const { fetchImpl } = stub(() => json(transfersNone));

    expect(await client(fetchImpl).listTransfers("acct-1")).toEqual([]);
  });

  it("maps an empty body to an empty list", async () => {
    const { fetchImpl } = stub(() => new Response("", { status: 200 }));

    expect(await client(fetchImpl).listWithdrawals("acct-1")).toEqual([]);
  });

  it("still fails loudly on a 404 for a single object", async () => {
    const { fetchImpl } = stub(() => json({ message: "not found" }, 404));

    await expect(client(fetchImpl).getAccount("nope")).rejects.toThrow(
      NessieError,
    );
  });
});

describe("mixed value types", () => {
  it("parses a balance that arrived as a string", async () => {
    const { fetchImpl } = stub(() => json(accounts));

    const rows = await client(fetchImpl).listAccounts();

    expect(rows[0].balance).toBe(1280);
    expect(rows[1].balance).toBe(4502.5);
    expect(typeof rows[1].balance).toBe("number");
  });

  it("parses integer, string and negative amounts on purchases", async () => {
    const { fetchImpl } = stub(() => json(purchases));

    const rows = await client(fetchImpl).listPurchases("acct-1");

    expect(rows.map((row) => row.amount)).toEqual([46, 1245.5, -320]);
  });

  it("never validates the shape of an _id", async () => {
    const { fetchImpl } = stub(() => json(customers));

    const rows = await client(fetchImpl).listCustomers();

    expect(rows[0]._id).toBe("d8c3de04-7f1a-4c2e-9a0b-1c6f5b2e4d31");
    expect(rows[1]._id).toBe("56c66be5a73e4927415071a3");
  });
});

describe("retries", () => {
  it("retries a 5xx and then succeeds", async () => {
    let attempts = 0;
    const { calls, fetchImpl } = stub(() => {
      attempts += 1;
      return attempts < 3 ? json({ message: "upstream" }, 503) : json(accounts);
    });

    const rows = await client(fetchImpl).listAccounts();

    expect(rows).toHaveLength(2);
    expect(calls).toHaveLength(3);
  });

  it("retries a transport error", async () => {
    let attempts = 0;
    const { calls, fetchImpl } = stub(() => {
      attempts += 1;
      if (attempts === 1) {
        throw new TypeError("fetch failed");
      }
      return json(accounts);
    });

    await client(fetchImpl).listAccounts();

    expect(calls).toHaveLength(2);
  });

  it("gives up after the retry budget and reports the status", async () => {
    const { calls, fetchImpl } = stub(() => json({ message: "upstream" }, 500));

    const failure = await client(fetchImpl)
      .listAccounts()
      .catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(NessieError);
    expect((failure as NessieError).status).toBe(500);
    expect(calls).toHaveLength(4);
  });

  it("does not retry a 4xx", async () => {
    const { calls, fetchImpl } = stub(() =>
      json({ message: "bad request" }, 400),
    );

    await expect(
      client(fetchImpl).createCustomer({
        first_name: "Ximena",
        last_name: "Trevino",
        address: {
          street_number: "2100",
          street_name: "Avenida Eugenio Garza Sada",
          city: "Monterrey",
          state: "NL",
          zip: "64849",
        },
      }),
    ).rejects.toThrow(NessieError);
    expect(calls).toHaveLength(1);
  });
});

describe("writes", () => {
  it("posts JSON to the account sub-collection and unwraps the created object", async () => {
    const { calls, fetchImpl } = stub(() => json(purchaseCreated, 201));

    const created = await client(fetchImpl).createPurchase("acct-1", {
      merchant_id: "5b6a0f3a1c9d440000a1b2c3",
      medium: "balance",
      purchase_date: "2026-09-11",
      amount: 89.9,
      description: "Cafe de barrio",
    });

    expect(calls[0].url).toBe(
      "https://api.nessieisreal.com/accounts/acct-1/purchases?key=test-key",
    );
    expect(calls[0].init?.method).toBe("POST");
    expect(JSON.parse(String(calls[0].init?.body)).amount).toBe(89.9);
    expect(created._id).toBe("c1f7c5e8-0a3b-4f9d-8e21-5d6c7b8a9f04");
    expect(created.amount).toBe(89.9);
  });

  it("creates an account under the customer, because the path owns the parent id", async () => {
    const { calls, fetchImpl } = stub(() => json(accounts[0], 201));

    await client(fetchImpl).createAccount("cust-1", {
      type: "Checking",
      nickname: "Gastos diarios",
      rewards: 0,
      balance: 1280,
    });

    expect(calls[0].url).toBe(
      "https://api.nessieisreal.com/customers/cust-1/accounts?key=test-key",
    );
  });
});

describe("secret hygiene", () => {
  it("strips the key out of error text", async () => {
    const { fetchImpl } = stub(
      () => new Response("upstream failed for key=test-key", { status: 500 }),
    );

    const failure = await client(fetchImpl, { maxRetries: 0 })
      .listAccounts()
      .catch((error: unknown) => error);

    const error = failure as NessieError;
    expect(error.message).not.toContain("test-key");
    expect(error.message).toContain("<key>");
  });
});
