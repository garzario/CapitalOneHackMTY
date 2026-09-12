/**
 * `NessieRail` against an injected fetch, so the suite needs no key and no
 * network.
 *
 * What these tests are really guarding is the list of things the rail must never
 * do: create a customer, create an account, write a name or an account number into
 * a pool other teams can read, or report a clave de rastreo for a row Nessie never
 * confirmed. Each of those is one assertion below, because each of them is a thing
 * a judge can check on the live sandbox in thirty seconds.
 */

import { describe, expect, it } from "bun:test";
import { MIRROR_ACCOUNT_NICKNAME, NessieClient } from "@hackmty/nessie";
import { NESSIE_CLAVE_PREFIX, NessieRail, pickMirrorAccount } from "./nessie";
import { CENT_AMOUNT, RailConfigError, RailSendError } from "./rail";

const ACCOUNT_ID = "68c3f0a1b2c3d4e5f6a7b8c9";
const WITHDRAWAL_ID = "68c4aa11bb22cc33dd44ee55";
const CLABE = "012180101391764613";

interface Call {
  url: string;
  method: string;
  body: unknown;
}

function stub(handler: (url: string, method: string) => Response): {
  calls: Call[];
  client: NessieClient;
} {
  const calls: Call[] = [];
  const client = new NessieClient({
    apiKey: "test-key",
    timeoutMs: 0,
    sleep: async () => {},
    fetch: async (url, init) => {
      const method = init?.method ?? "GET";
      calls.push({
        url,
        method,
        body:
          typeof init?.body === "string" ? JSON.parse(init.body) : undefined,
      });
      return handler(url, method);
    },
  });
  return { calls, client };
}

function json(body: unknown, status = 201): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function account(id: string, nickname: string) {
  return {
    _id: id,
    type: "Checking",
    nickname,
    rewards: 0,
    balance: 500_000,
    account_number: "1234567890123456",
    customer_id: "68c3e0000000000000000001",
  };
}

function railWith(client: NessieClient, accountId?: string): NessieRail {
  return new NessieRail({
    client,
    now: () => "2026-09-12T03:00:00.000Z",
    ...(accountId === undefined ? {} : { accountId }),
  });
}

describe("configuration", () => {
  it("refuses to exist without a key, rather than failing on the first cent", () => {
    const client = new NessieClient({ apiKey: "" });

    expect(() => new NessieRail({ client })).toThrow(RailConfigError);
  });
});

describe("sending the cent", () => {
  it("records a 0.01 withdrawal on the mirror account and mints the clave from the id", async () => {
    const { calls, client } = stub((_url, method) =>
      method === "GET"
        ? json([account(ACCOUNT_ID, MIRROR_ACCOUNT_NICKNAME)], 200)
        : json({ code: 201, objectCreated: { _id: WITHDRAWAL_ID } }),
    );

    const sent = await railWith(client).sendCent({
      instructionId: "INS-2026-09-07-047",
      beneficiaryAccount: CLABE,
    });

    expect(sent.rail).toBe("nessie");
    expect(sent.amount).toBe(CENT_AMOUNT);
    expect(sent.sentAt).toBe("2026-09-12T03:00:00.000Z");
    expect(sent.reference).toBe(WITHDRAWAL_ID);
    expect(sent.claveRastreo).toBe(
      `${NESSIE_CLAVE_PREFIX}${WITHDRAWAL_ID.toUpperCase()}`,
    );
    // Nessie is not a SPEI participant, so there is no ordenante key to offer the
    // Banxico portal, and inventing one would be inventing a bank.
    expect(sent.senderSpeiKey).toBeUndefined();
    expect(sent.simulated).toBe(false);

    const write = calls.find((call) => call.method === "POST");
    expect(write?.url).toContain(`/accounts/${ACCOUNT_ID}/withdrawals`);
    expect(write?.body).toEqual({
      medium: "balance",
      transaction_date: "2026-09-11",
      amount: CENT_AMOUNT,
      status: "pending",
      description: "Verificacion de cuenta SPEI 0.01 MXN",
    });
  });

  /**
   * The row goes up with no supplier, no legal name and no CLABE on it. Everything
   * posted with our key is readable by anybody holding that key, which is not a
   * preference: it is why the probe names nobody.
   */
  it("writes nothing identifying into the sandbox", async () => {
    const { calls, client } = stub((_url, method) =>
      method === "GET"
        ? json([account(ACCOUNT_ID, MIRROR_ACCOUNT_NICKNAME)], 200)
        : json({ _id: WITHDRAWAL_ID }),
    );

    await railWith(client).sendCent({
      instructionId: "INS-2026-09-07-047",
      beneficiaryAccount: CLABE,
    });

    const payload = JSON.stringify(
      calls.filter((call) => call.method === "POST").map((call) => call.body),
    );
    expect(payload).not.toContain(CLABE);
    expect(payload).not.toContain("INS-2026-09-07-047");
    expect(payload).not.toMatch(/\d{10,}/);
  });

  /** Never a customer, never an account: an orphan per probe litters a shared pool. */
  it("creates no customer and no account", async () => {
    const { calls, client } = stub((_url, method) =>
      method === "GET"
        ? json([account(ACCOUNT_ID, MIRROR_ACCOUNT_NICKNAME)], 200)
        : json({ _id: WITHDRAWAL_ID }),
    );

    await railWith(client).sendCent({
      instructionId: "INS-1",
      beneficiaryAccount: CLABE,
    });

    const writes = calls
      .filter((call) => call.method === "POST")
      .map((call) => call.url);
    expect(writes).toHaveLength(1);
    expect(writes[0]).toContain("/withdrawals");
    expect(
      calls.some(
        (call) => call.method === "POST" && call.url.includes("/customers"),
      ),
    ).toBe(false);
  });

  it("finds the mirror account once and reuses it", async () => {
    const { calls, client } = stub((_url, method) =>
      method === "GET"
        ? json([account(ACCOUNT_ID, MIRROR_ACCOUNT_NICKNAME)], 200)
        : json({ _id: WITHDRAWAL_ID }),
    );
    const rail = railWith(client);

    await rail.sendCent({ instructionId: "INS-1", beneficiaryAccount: CLABE });
    await rail.sendCent({ instructionId: "INS-2", beneficiaryAccount: CLABE });

    expect(calls.filter((call) => call.method === "GET")).toHaveLength(1);
  });

  it("skips the listing entirely when the account is configured", async () => {
    const { calls, client } = stub(() => json({ _id: WITHDRAWAL_ID }));

    await railWith(client, ACCOUNT_ID).sendCent({
      instructionId: "INS-1",
      beneficiaryAccount: CLABE,
    });

    expect(calls).toHaveLength(1);
    expect(calls[0]?.method).toBe("POST");
  });

  it("says which command creates the account when this key has none", async () => {
    const { client } = stub(() => json([], 200));

    const failure = await railWith(client)
      .sendCent({ instructionId: "INS-1", beneficiaryAccount: CLABE })
      .catch((cause: unknown) => cause);

    expect(failure).toBeInstanceOf(RailSendError);
    expect((failure as RailSendError).message).toContain(
      "bun run nessie:mirror",
    );
  });

  /** A clave with no row behind it is a clave the CEP can never be filed under. */
  it("refuses to mint a clave when Nessie answers without an id", async () => {
    const { client } = stub((_url, method) =>
      method === "GET"
        ? json([account(ACCOUNT_ID, MIRROR_ACCOUNT_NICKNAME)], 200)
        : json({ code: 201 }),
    );

    const failure = await railWith(client)
      .sendCent({ instructionId: "INS-1", beneficiaryAccount: CLABE })
      .catch((cause: unknown) => cause);

    expect(failure).toBeInstanceOf(RailSendError);
    expect((failure as RailSendError).message).toContain("clave de rastreo");
  });

  it("reports the API's own failure rather than throwing a driver error", async () => {
    const { client } = stub((_url, method) =>
      method === "GET"
        ? json([account(ACCOUNT_ID, MIRROR_ACCOUNT_NICKNAME)], 200)
        : json({ message: "Error" }, 400),
    );

    const failure = await railWith(client)
      .sendCent({ instructionId: "INS-1", beneficiaryAccount: CLABE })
      .catch((cause: unknown) => cause);

    expect(failure).toBeInstanceOf(RailSendError);
    expect((failure as RailSendError).message).toContain("bank mirror");
  });
});

describe("pickMirrorAccount", () => {
  it("prefers the account bun run nessie:mirror named", () => {
    const rows = [
      account("other", "Ahorro"),
      account(ACCOUNT_ID, MIRROR_ACCOUNT_NICKNAME),
    ];

    expect(pickMirrorAccount(rows)?._id).toBe(ACCOUNT_ID);
  });

  it("takes the only account when there is exactly one", () => {
    expect(pickMirrorAccount([account(ACCOUNT_ID, "Ahorro")])?._id).toBe(
      ACCOUNT_ID,
    );
  });

  /** Charging the wrong account is worse than refusing to charge one. */
  it("refuses to choose between two unnamed accounts", () => {
    const rows = [account("a", "Ahorro"), account("b", "Nomina")];

    expect(pickMirrorAccount(rows)).toBeUndefined();
  });
});
