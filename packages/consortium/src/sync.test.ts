/**
 * The push and the pull.
 *
 * The first two cases are the product claim: what leaves this tenant carries no
 * name, no amount, no invoice and no account number, and the assertion is made by
 * searching the serialised payload AND the SQL it becomes, because the statement
 * is what actually goes on the wire.
 */

import { describe, expect, test } from "bun:test";
import { insertEvents } from "./ddl";
import { hashClabe, hashRfc, hashTenant } from "./hash";
import { pushEvents, readNetworkRows, type TenantOutcome } from "./sync";

const TENANT_RFC = "SYN900101MTY";
const TENANT_NAME = "Ensambles del Poniente SA de CV";
const SUPPLIER_RFC = "SYN990202S02";
const SUPPLIER_NAME = "Herramentales y Moldes del Norte SA de CV";
const CLABE = "012180101391764613";
const AMOUNT = 184_300.55;
const CLAVE_RASTREO = "SYNCEP20260902SYN0707";

const OUTCOMES: TenantOutcome[] = [
  {
    supplierRfc: SUPPLIER_RFC,
    clabe: CLABE,
    outcome: "verified",
    day: "2026-09-02",
  },
  {
    supplierRfc: SUPPLIER_RFC,
    clabe: CLABE,
    outcome: "paid",
    day: "2026-09-10",
  },
];

describe("what the push sends", () => {
  test("is hashes, a bank code, an outcome and a day, and nothing else", () => {
    const events = pushEvents({
      tenantRfc: TENANT_RFC,
      outcomes: OUTCOMES,
      synthetic: true,
    });

    expect(events).toHaveLength(2);
    expect(Object.keys(events[0] as object).sort()).toEqual([
      "bankCode",
      "clabeHash",
      "eventDate",
      "outcome",
      "rfcHash",
      "synthetic",
      "tenantHash",
    ]);
    expect(events[0]?.tenantHash).toBe(hashTenant(TENANT_RFC));
    expect(events[0]?.rfcHash).toBe(hashRfc(SUPPLIER_RFC));
    expect(events[0]?.clabeHash).toBe(hashClabe(CLABE));
    expect(events[0]?.bankCode).toBe("012");
  });

  test("carries no name, no amount, no CLABE, no RFC and no clave de rastreo", () => {
    const events = pushEvents({
      tenantRfc: TENANT_RFC,
      outcomes: OUTCOMES,
      synthetic: true,
    });
    /* Both the payload and the statement: the SQL is what reaches Snowflake, so
       an assertion on the objects alone would not be the claim. */
    const surfaces = [
      JSON.stringify(events),
      insertEvents(events).join("\n"),
    ].join("\n");

    for (const secret of [
      TENANT_NAME,
      SUPPLIER_NAME,
      TENANT_RFC,
      SUPPLIER_RFC,
      CLABE,
      CLABE.slice(-6),
      CLAVE_RASTREO,
      String(AMOUNT),
      "184300",
    ]) {
      expect(surfaces).not.toContain(secret);
    }
  });

  test("counts a tenant once per pair, outcome and day", () => {
    const events = pushEvents({
      tenantRfc: TENANT_RFC,
      synthetic: true,
      outcomes: [
        ...OUTCOMES,
        /* The same supplier paid twice on the same day. The network counts
           tenants and days, never payments, so this is one row. */
        {
          supplierRfc: SUPPLIER_RFC,
          clabe: CLABE,
          outcome: "paid",
          day: "2026-09-10",
        },
      ],
    });

    expect(events).toHaveLength(2);
  });

  test("accepts an instant and keeps only the day", () => {
    const events = pushEvents({
      tenantRfc: TENANT_RFC,
      synthetic: false,
      outcomes: [
        {
          supplierRfc: SUPPLIER_RFC,
          clabe: CLABE,
          outcome: "paid",
          day: "2026-09-10T22:41:07.000Z",
        },
      ],
    });

    expect(events[0]?.eventDate).toBe("2026-09-10");
    expect(events[0]?.synthetic).toBe(false);
  });

  test("drops a row whose day cannot be read rather than inventing one", () => {
    const events = pushEvents({
      tenantRfc: TENANT_RFC,
      synthetic: true,
      outcomes: [
        {
          supplierRfc: SUPPLIER_RFC,
          clabe: CLABE,
          outcome: "paid",
          day: "ayer",
        },
      ],
    });

    expect(events).toEqual([]);
  });
});

describe("the statements the push becomes", () => {
  test("chunk a long load and validate every value they interpolate", () => {
    /* One row per day, so the deduplication does not collapse the load and the
       chunking is the thing under test. */
    const many = Array.from({ length: 1201 }, (_, index) => ({
      supplierRfc: SUPPLIER_RFC,
      clabe: CLABE,
      outcome: "paid" as const,
      day: new Date((20_000 + index) * 86_400_000).toISOString().slice(0, 10),
    }));
    const statements = insertEvents(
      pushEvents({ tenantRfc: TENANT_RFC, outcomes: many, synthetic: true }),
    );

    expect(statements.length).toBeGreaterThan(1);
    for (const statement of statements) {
      expect(statement).toContain(
        "insert into SENTRYONE.CONSORTIUM.BENEFICIARY_EVENTS",
      );
    }
  });

  test("refuse a hash, a bank code, a date or an outcome that is not one", () => {
    const valid = {
      tenantHash: "a".repeat(64),
      rfcHash: "b".repeat(64),
      clabeHash: "c".repeat(64),
      bankCode: "012",
      outcome: "paid" as const,
      eventDate: "2026-09-10",
      synthetic: true,
    };

    expect(() =>
      insertEvents([{ ...valid, rfcHash: "'; drop table --" }]),
    ).toThrow(/hex hash/);
    expect(() => insertEvents([{ ...valid, bankCode: "12" }])).toThrow(
      /three digits/,
    );
    expect(() => insertEvents([{ ...valid, eventDate: "10-09-2026" }])).toThrow(
      /YYYY-MM-DD/,
    );
    expect(() =>
      insertEvents([
        { ...valid, outcome: "released" as unknown as typeof valid.outcome },
      ]),
    ).toThrow(/outcome must be one of/);
  });

  test("refuse a database or schema name that is not a plain identifier", () => {
    expect(() => insertEvents([], { database: "SENTRYONE; drop" })).toThrow(
      /plain Snowflake identifier/,
    );
  });
});

describe("the pull", () => {
  const row = {
    RFC_HASH: "a".repeat(64),
    CLABE_HASH: "b".repeat(64),
    BANK_CODE: "012",
    TENANTS: "37",
    FIRST_SEEN: "2024-03-04",
    LAST_SEEN: "2026-09-02",
    FRAUD_REPORTS: "0",
    OTHER_ACCOUNTS: "2",
  };

  test("maps a warehouse row into a snapshot row, parsing every number", () => {
    const { rows, skipped } = readNetworkRows([row]);

    expect(skipped).toEqual([]);
    expect(rows[0]).toEqual({
      rfcHash: "a".repeat(64),
      clabeHash: "b".repeat(64),
      bankCode: "012",
      tenants: 37,
      firstSeen: "2024-03-04",
      lastSeen: "2026-09-02",
      fraudReports: 0,
      otherAccounts: 2,
    });
  });

  test("reads a column whatever case the warehouse returned it in", () => {
    const lower = Object.fromEntries(
      Object.entries(row).map(([key, value]) => [key.toLowerCase(), value]),
    );

    expect(readNetworkRows([lower]).rows[0]?.tenants).toBe(37);
  });

  test("truncates a DATE the driver serialised as an instant", () => {
    expect(
      readNetworkRows([{ ...row, FIRST_SEEN: "2024-03-04T00:00:00.000Z" }])
        .rows[0]?.firstSeen,
    ).toBe("2024-03-04");
  });

  test("skips a row it cannot read, with the reason, instead of storing zeros", () => {
    /* A snapshot row of zeros would read on the screen as "nobody pays this
       account", which is a claim, and this row is a warehouse bug. */
    const { rows, skipped } = readNetworkRows([
      { ...row, RFC_HASH: null },
      { ...row, TENANTS: "many" },
      { ...row, FIRST_SEEN: null },
    ]);

    expect(rows).toEqual([]);
    expect(skipped).toHaveLength(3);
    expect(skipped[0]?.reason).toContain("rfc_hash");
    expect(skipped[1]?.reason).toContain("tenants");
    expect(skipped[2]?.reason).toContain("first_seen");
  });

  test("reads a missing optional count as zero and a bad bank code as 000", () => {
    const { rows } = readNetworkRows([
      { ...row, FRAUD_REPORTS: null, OTHER_ACCOUNTS: "-1", BANK_CODE: "NA" },
    ]);

    expect(rows[0]?.fraudReports).toBe(0);
    expect(rows[0]?.otherAccounts).toBe(0);
    expect(rows[0]?.bankCode).toBe("000");
  });
});
