/**
 * These tests cover the parts of the runner that do not need a database, which is
 * what keeps CI free of a Postgres service container. The statement splitter is the
 * risky part: it decides what actually gets sent to the server.
 */

import { describe, expect, it } from "bun:test";
import {
  fingerprint,
  INIT_MIGRATION,
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

describe("fingerprint", () => {
  it("is stable for the same text and different for an edit", () => {
    expect(fingerprint("select 1")).toBe(fingerprint("select 1"));
    expect(fingerprint("select 1")).not.toBe(fingerprint("select 2"));
  });

  it("is eight hex characters, so it fits a log line", () => {
    expect(fingerprint("create table ledger_tx ()")).toMatch(/^[0-9a-f]{8}$/);
  });
});
