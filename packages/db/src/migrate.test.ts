/**
 * These tests cover the parts of the runner that do not need a database, which is
 * what keeps CI free of a Postgres service container. The statement splitter is the
 * risky part: it decides what actually gets sent to the server.
 */

import { describe, expect, it } from "bun:test";
import {
  CEPTINELA_MIGRATION,
  CEPTINELA_TIMESCALE_MIGRATION,
  fingerprint,
  INIT_MIGRATION,
  MIGRATIONS,
  MIGRATIONS_DIR,
  splitSqlStatements,
  TIMESCALE_MIGRATION,
} from "./migrate";

describe("splitSqlStatements", () => {
  it("drops whole-line comments and empty statements", () => {
    const statements = splitSqlStatements(`
      -- a comment
      select 1;

      ;
      select 2;
    `);

    expect(statements).toEqual(["select 1", "select 2"]);
  });

  it("keeps a statement that has no trailing semicolon", () => {
    expect(splitSqlStatements("select 1")).toEqual(["select 1"]);
  });

  it("returns nothing for a file that is only comments", () => {
    expect(splitSqlStatements("-- nothing to do here\n-- really\n")).toEqual(
      [],
    );
  });

  it("splits 0001_init.sql into its table and its index", async () => {
    const text = await Bun.file(`${MIGRATIONS_DIR}/${INIT_MIGRATION}`).text();
    const statements = splitSqlStatements(text);

    expect(statements).toHaveLength(2);
    expect(statements[0]).toContain("create table if not exists ledger_tx");
    expect(statements[0]).toContain("numeric(14,2)");
    expect(statements[1]).toContain("ledger_tx_account_time");
  });

  it("keeps the continuous aggregate in 0002 as one statement", async () => {
    const text = await Bun.file(
      `${MIGRATIONS_DIR}/${TIMESCALE_MIGRATION}`,
    ).text();
    const statements = splitSqlStatements(text);

    expect(statements).toHaveLength(3);
    expect(statements[0]).toContain(
      "create extension if not exists timescaledb",
    );
    expect(statements[1]).toContain("create_hypertable");
    // The aggregate must arrive whole: it cannot run inside a transaction either.
    expect(statements[2]).toContain("timescaledb.continuous");
    expect(statements[2]).toContain("time_bucket('1 day', occurred_at)");
  });
});

describe("0003_ceptinela.sql", () => {
  it("splits into statements the runner can send one at a time", async () => {
    const text = await Bun.file(
      `${MIGRATIONS_DIR}/${CEPTINELA_MIGRATION}`,
    ).text();
    const statements = splitSqlStatements(text);

    // Every table the payment run, the sweep and the registry need.
    const tables = statements
      .filter((statement) => statement.startsWith("create table"))
      .map((statement) => statement.split(/\s+/)[5]);
    expect(tables).toEqual([
      "suppliers",
      "known_accounts",
      "cfdis",
      "payment_complements",
      "instructions",
      "findings",
      "decisions",
      "decision_findings",
      "sat_list_versions",
      "sat_list_entries",
      "verified_beneficiaries",
      "ledger_events",
    ]);
  });

  it("carries no dollar quoting, which the splitter cannot survive", async () => {
    const text = await Bun.file(
      `${MIGRATIONS_DIR}/${CEPTINELA_MIGRATION}`,
    ).text();

    // A plpgsql body would be cut in half on its first internal semicolon, so the
    // append-only guard is written as rules instead. This is the assertion that
    // stops someone from quietly adding a function later.
    expect(text).not.toContain("$$");
    expect(text).toContain("create or replace rule ledger_events_no_update");
    expect(text).toContain("create or replace rule ledger_events_no_delete");
  });

  it("keeps the cep xml as bytea and money as numeric(14,2)", async () => {
    const text = await Bun.file(
      `${MIGRATIONS_DIR}/${CEPTINELA_MIGRATION}`,
    ).text();

    expect(text).toContain("cep_xml          bytea not null");
    expect(text).not.toContain("cep_xml text");

    // A float anywhere is the drift @hackmty/core exists to avoid. Checked against
    // the statements rather than the file, so the prose above may say the word.
    const ddl = splitSqlStatements(text).join("\n");
    expect(ddl).not.toMatch(/\b(real|double precision|float\d*)\b/);
    expect(ddl).toContain("amount           numeric(14,2) not null");
  });

  it("partitions the event ledger by the column its primary key carries", async () => {
    const plain = await Bun.file(
      `${MIGRATIONS_DIR}/${CEPTINELA_MIGRATION}`,
    ).text();
    const timescale = await Bun.file(
      `${MIGRATIONS_DIR}/${CEPTINELA_TIMESCALE_MIGRATION}`,
    ).text();

    // create_hypertable refuses a unique index that does not include the
    // partitioning column, so these two facts have to stay in step.
    expect(plain).toContain("primary key (at, event_id)");
    expect(timescale).toContain("create_hypertable('ledger_events', 'at'");
  });
});

describe("0004_timescale_ceptinela.sql", () => {
  it("keeps its continuous aggregate whole", async () => {
    const text = await Bun.file(
      `${MIGRATIONS_DIR}/${CEPTINELA_TIMESCALE_MIGRATION}`,
    ).text();
    const statements = splitSqlStatements(text);

    expect(statements).toHaveLength(3);
    expect(statements[0]).toContain(
      "create extension if not exists timescaledb",
    );
    expect(statements[1]).toContain("create_hypertable");
    expect(statements[2]).toContain("timescaledb.continuous");
    expect(statements[2]).toContain("time_bucket('1 day', at)");
  });
});

describe("MIGRATIONS", () => {
  it("runs the plain files before the ones that need the extension", () => {
    const first = MIGRATIONS.findIndex((spec) => spec.requiresTimescale);
    const plainAfter = MIGRATIONS.slice(first).filter(
      (spec) => !spec.requiresTimescale,
    );

    expect(plainAfter).toEqual([]);
    expect(MIGRATIONS.map((spec) => spec.file)).toEqual([
      INIT_MIGRATION,
      CEPTINELA_MIGRATION,
      TIMESCALE_MIGRATION,
      CEPTINELA_TIMESCALE_MIGRATION,
    ]);
  });

  it("names a file that exists on disk", async () => {
    for (const spec of MIGRATIONS) {
      const file = Bun.file(`${MIGRATIONS_DIR}/${spec.file}`);
      expect(await file.exists()).toBe(true);
    }
  });
});

describe("fingerprint", () => {
  it("is stable for the same text and different for an edit", () => {
    expect(fingerprint("select 1")).toBe(fingerprint("select 1"));
    expect(fingerprint("select 1")).not.toBe(fingerprint("select 2"));
  });

  it("is eight hex characters, so it fits a log line", () => {
    expect(fingerprint("create table ledger_tx ()")).toMatch(/^[0-9a-f]{8}$/);
  });
});
