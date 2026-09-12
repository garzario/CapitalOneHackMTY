/**
 * These tests cover the parts of the runner that do not need a database, which is
 * what keeps CI free of a Postgres service container. The statement splitter is the
 * risky part: it decides what actually gets sent to the server.
 */

import { describe, expect, it } from "bun:test";
import {
  CEPTINELA_DRIFT_MIGRATION,
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

  it("keeps a semicolon inside a quoted literal or identifier", () => {
    expect(
      splitSqlStatements(
        "insert into t values ('a;b', 'it''s;'); select \";\" from t;",
      ),
    ).toEqual(["insert into t values ('a;b', 'it''s;')", 'select ";" from t']);
  });

  it("keeps a dollar-quoted body whole, tagged or not", () => {
    const body =
      "create function f() returns trigger language plpgsql as $$\nbegin\n  raise exception 'no';\nend\n$$";
    const tagged =
      "create function g() returns int language sql as $fn$ select 1; $fn$";
    expect(splitSqlStatements(`${body};\n${tagged};\nselect 2;`)).toEqual([
      body,
      tagged,
      "select 2",
    ]);
  });

  it("does not read a dollar sign inside a literal as a quote", () => {
    expect(splitSqlStatements("select '$$'; select 1;")).toEqual([
      "select '$$'",
      "select 1",
    ]);
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

  it("is unchanged: the rules it wrote are replaced, not edited, by 0005", async () => {
    const text = await Bun.file(
      `${MIGRATIONS_DIR}/${CEPTINELA_MIGRATION}`,
    ).text();

    // The rules were written when the splitter could not survive a plpgsql
    // body. They stay here because an applied migration is never edited; 0005
    // drops them and installs the trigger a hypertable accepts.
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

describe("0005_ceptinela_drift.sql", () => {
  it("widens the two check constraints the domain outgrew", async () => {
    const text = await Bun.file(
      `${MIGRATIONS_DIR}/${CEPTINELA_DRIFT_MIGRATION}`,
    ).text();
    const statements = splitSqlStatements(text);

    // The reconciliation detector hangs an unbacked outflow off a bank row,
    // and the verification call is a ledger event. 0003 refused both.
    const findings = statements.find((statement) =>
      statement.includes("add constraint findings_subject_kind_check"),
    );
    expect(findings).toContain("'ledger_tx'");
    const ledger = statements.find((statement) =>
      statement.includes("add constraint ledger_events_type_check"),
    );
    expect(ledger).toContain("'verification_call'");
    expect(ledger).toContain("'decision_made'");
  });

  it("is idempotent, so it is safe on a database that already ran 0003", async () => {
    const text = await Bun.file(
      `${MIGRATIONS_DIR}/${CEPTINELA_DRIFT_MIGRATION}`,
    ).text();
    const statements = splitSqlStatements(text);

    expect(text).not.toContain("create table");
    for (const statement of statements) {
      expect(
        /^(alter table|drop rule if exists|drop trigger if exists|create or replace function|create trigger)/.test(
          statement,
        ),
      ).toBe(true);
    }
    // Every column is guarded, the constraints are dropped by name first.
    const adds = statements.filter((statement) =>
      statement.includes("add column"),
    );
    for (const statement of adds) {
      expect(statement).toContain("add column if not exists");
    }
    expect(
      statements.filter((statement) =>
        statement.includes("drop constraint if exists"),
      ),
    ).toHaveLength(3);
  });

  it("replaces the rules with a trigger, which is what a hypertable accepts", async () => {
    const text = await Bun.file(
      `${MIGRATIONS_DIR}/${CEPTINELA_DRIFT_MIGRATION}`,
    ).text();
    const statements = splitSqlStatements(text);

    // Timescale refuses create_hypertable on a table that carries rules, so the
    // guard 0003 wrote as two rules could never coexist with 0004. The function
    // body arrives as one statement, semicolons and all.
    const fn = statements.find((statement) =>
      statement.startsWith(
        "create or replace function ledger_events_append_only",
      ),
    );
    expect(fn).toContain("raise exception");
    expect(fn?.endsWith("$$")).toBe(true);
    expect(statements).toContain(
      "drop rule if exists ledger_events_no_update on ledger_events",
    );
    expect(statements).toContain(
      "drop rule if exists ledger_events_no_delete on ledger_events",
    );
    const trigger = statements.find((statement) =>
      statement.startsWith("create trigger ledger_events_append_only"),
    );
    expect(trigger).toContain("before update or delete on ledger_events");
  });

  it("names every field the domain has that 0003 lacked", async () => {
    const text = await Bun.file(
      `${MIGRATIONS_DIR}/${CEPTINELA_DRIFT_MIGRATION}`,
    ).text();

    for (const column of [
      "delay_cost_per_day",
      "payment_total",
      "operation_number",
      "audio_ref",
      "sent_at",
      "sender_account",
      "beneficiary_rfc",
      "concepto",
      "numero_certificado",
      "signature_reason",
    ]) {
      expect(text).toContain(`add column if not exists ${column}`);
    }
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
      CEPTINELA_DRIFT_MIGRATION,
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
