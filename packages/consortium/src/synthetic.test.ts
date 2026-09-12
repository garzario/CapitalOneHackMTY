/**
 * The generated network, and the four properties the demo rests on.
 *
 * It is deterministic, every row is watermarked, the established accounts are
 * corroborated by many tenants over months, and the account that arrived in this
 * week's run is either unseen or reported. If any of those stops being true, the
 * demo beat in `docs/10-demo-script.md` stops being true with it.
 */

import { describe, expect, test } from "bun:test";
import { SENTRYONE_DEFAULT_SEED } from "@hackmty/seed";
import { consortiumDdl, networkSelect } from "./ddl";
import { hashClabe, hashRfc } from "./hash";
import { readNetworkRows } from "./sync";
import { aggregateNetwork, DEMO_SEED, syntheticNetwork } from "./synthetic";

const RUN_DAY = "2026-09-07";

const INPUT = {
  runDay: RUN_DAY,
  suppliers: [
    {
      rfc: "SYN010101AAA",
      knownAccounts: [{ clabe: "058580000123456715" }],
    },
    {
      rfc: "SYN990202S02",
      knownAccounts: [
        { clabe: "012180001234567899" },
        { clabe: "072580000456123788" },
      ],
    },
  ],
  instructions: [
    /* Established: the network corroborates it. */
    { supplierRfc: "SYN010101AAA", clabe: "058580000123456715" },
    /* Fresh: the account changed this week and the network has never paid it. */
    { supplierRfc: "SYN990202S02", clabe: "012180101391764613" },
    { supplierRfc: "SYN010101AAA", clabe: "014180107788990011" },
    { supplierRfc: "SYN990202S02", clabe: "021180104455667788" },
  ],
};

describe("determinism", () => {
  test("the demo network and the demo company run on one seed", () => {
    /* Two seeds would make "seed 69" mean two things in this repository, and the
       network would stop lining up with the company it is supposed to describe. */
    expect(DEMO_SEED).toBe(SENTRYONE_DEFAULT_SEED);
  });

  test("the same seed gives byte-identical events", () => {
    const left = syntheticNetwork({ ...INPUT, seed: DEMO_SEED });
    const right = syntheticNetwork({ ...INPUT, seed: DEMO_SEED });

    expect(right.events).toEqual(left.events);
  });

  test("a different seed gives a different network", () => {
    const sixtyNine = syntheticNetwork({ ...INPUT, seed: 69 });
    const seventy = syntheticNetwork({ ...INPUT, seed: 70 });

    expect(seventy.events).not.toEqual(sixtyNine.events);
  });
});

describe("every row is watermarked and anonymised", () => {
  test("synthetic is true on all of them", () => {
    const { events } = syntheticNetwork(INPUT);

    expect(events.length).toBeGreaterThan(0);
    expect(events.every((event) => event.synthetic)).toBe(true);
  });

  test("no RFC and no CLABE appears anywhere in the network", () => {
    const serialised = JSON.stringify(syntheticNetwork(INPUT).events);

    for (const supplier of INPUT.suppliers) {
      expect(serialised).not.toContain(supplier.rfc);
      for (const account of supplier.knownAccounts) {
        expect(serialised).not.toContain(account.clabe);
      }
    }
    for (const instruction of INPUT.instructions) {
      expect(serialised).not.toContain(instruction.clabe);
    }
  });

  test("the tenants are hashes of RFCs that do not exist", () => {
    const { events } = syntheticNetwork(INPUT);
    const tenants = new Set(events.map((event) => event.tenantHash));

    expect(tenants.size).toBeGreaterThan(5);
    for (const tenant of tenants) {
      expect(tenant).toMatch(/^[0-9a-f]{64}$/);
    }
  });
});

describe("what the network says about the demo company", () => {
  /**
   * One pair out of `aggregateNetwork`, which is the same fold the
   * `BENEFICIARY_NETWORK` view performs and the one `consortium:pull --offline`
   * runs. Asserting through it rather than through a second local fold is what
   * keeps the offline path and the warehouse path from drifting.
   *
   * A pair with no rows at all is reported as zeros, which is what the snapshot
   * reader turns into "consulted and never seen".
   */
  function aggregate(rfc: string, clabe: string) {
    const rows = aggregateNetwork(syntheticNetwork(INPUT).events);
    const rfcHash = hashRfc(rfc);
    const clabeHash = hashClabe(clabe);
    const row = rows.find(
      (candidate) =>
        candidate.rfcHash === rfcHash && candidate.clabeHash === clabeHash,
    );

    return (
      row ?? {
        tenants: 0,
        firstSeen: undefined,
        lastSeen: undefined,
        fraudReports: 0,
        otherAccounts: rows.filter((candidate) => candidate.rfcHash === rfcHash)
          .length,
      }
    );
  }

  test("an established account is paid by many companies, for months", () => {
    const established = aggregate("SYN010101AAA", "058580000123456715");

    expect(established.tenants).toBeGreaterThan(5);
    expect(established.fraudReports).toBe(0);
    expect(established.firstSeen).toBeDefined();
    /* At least four months of unbroken history: the corroboration case. */
    const months =
      (Date.parse(`${established.lastSeen}T00:00:00Z`) -
        Date.parse(`${established.firstSeen}T00:00:00Z`)) /
      86_400_000 /
      30.436_875;
    expect(months).toBeGreaterThanOrEqual(4);
  });

  test("history never runs past the day of the run", () => {
    const established = aggregate("SYN010101AAA", "058580000123456715");

    expect(String(established.lastSeen) < RUN_DAY).toBe(true);
  });

  test("a fresh account is either unseen or reported, never corroborated", () => {
    for (const clabe of [
      "012180101391764613",
      "014180107788990011",
      "021180104455667788",
    ]) {
      const rfc =
        clabe === "014180107788990011" ? "SYN010101AAA" : "SYN990202S02";
      const fresh = aggregate(rfc, clabe);

      if (fresh.tenants === 0) {
        expect(fresh.fraudReports).toBe(0);
      } else {
        /* Whoever the network has seen on this account only reported it. */
        expect(fresh.fraudReports).toBe(fresh.tenants);
      }
    }
  });

  test("a fresh account still shows the supplier's other accounts", () => {
    /* The impersonation sentence: forty companies pay this supplier, and none of
       them pays it here. */
    const fresh = aggregate("SYN990202S02", "012180101391764613");

    expect(fresh.otherAccounts).toBeGreaterThan(0);
  });

  test("the summary counts add up to the run", () => {
    const network = syntheticNetwork(INPUT);

    expect(network.corroborated).toBe(3);
    expect(network.reported + network.unseen).toBe(3);
  });
});

describe("the DDL", () => {
  test("creates the database, the schema, the table and the view, in order", () => {
    const statements = consortiumDdl();

    expect(statements).toHaveLength(4);
    expect(statements[0]).toContain("create database if not exists SENTRYONE");
    expect(statements[1]).toContain(
      "create schema if not exists SENTRYONE.CONSORTIUM",
    );
    expect(statements[2]).toContain("BENEFICIARY_EVENTS");
    expect(statements[3]).toContain("BENEFICIARY_NETWORK");
  });

  test("constrains the outcome in the table rather than in a comment", () => {
    expect(consortiumDdl()[2]).toContain(
      "check (outcome in ('verified', 'paid', 'mismatch', 'fraud_reported'))",
    );
  });

  test("holds no column that could name a company, a person or an amount", () => {
    const table = consortiumDdl()[2] as string;

    for (const forbidden of ["name", "amount", "rfc ", "clabe ", "clave"]) {
      expect(table.toLowerCase()).not.toContain(forbidden);
    }
  });

  test("the pull reads the view, ordered, so two pulls diff", () => {
    const select = networkSelect();

    expect(select).toContain("SENTRYONE.CONSORTIUM.BENEFICIARY_NETWORK");
    expect(select).toContain("order by rfc_hash, clabe_hash");
  });

  test("the columns the view exposes are the ones the pull reads", () => {
    /* The two halves of the contract, checked against each other: a view that
       renamed a column would otherwise produce a snapshot of skipped rows. */
    const select = networkSelect();
    const { rows } = readNetworkRows([
      {
        RFC_HASH: "a".repeat(64),
        CLABE_HASH: "b".repeat(64),
        BANK_CODE: "012",
        TENANTS: "3",
        FIRST_SEEN: "2026-01-01",
        LAST_SEEN: "2026-09-01",
        FRAUD_REPORTS: "0",
        OTHER_ACCOUNTS: "1",
      },
    ]);

    expect(rows).toHaveLength(1);
    for (const column of [
      "rfc_hash",
      "clabe_hash",
      "bank_code",
      "tenants",
      "first_seen",
      "last_seen",
      "fraud_reports",
      "other_accounts",
    ]) {
      expect(select).toContain(column);
      expect(consortiumDdl()[3]).toContain(column);
    }
  });
});
