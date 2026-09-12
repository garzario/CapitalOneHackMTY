/**
 * These tests cover the parts of the runner that do not need a database, which is
 * what keeps CI free of a Postgres service container. The statement splitter is the
 * risky part: it decides what actually gets sent to the server.
 */

import { describe, expect, it } from "bun:test";
import {
  COMPANY_MIGRATION,
  CONSORTIUM_SNAPSHOT_MIGRATION,
  DECISION_REASON_MIGRATION,
  fingerprint,
  INIT_MIGRATION,
  MIGRATIONS,
  MIGRATIONS_DIR,
  RAIL_EVENTS_MIGRATION,
  RENAMED_MIGRATIONS,
  SENTRYONE_DRIFT_MIGRATION,
  SENTRYONE_MIGRATION,
  SENTRYONE_TIMESCALE_MIGRATION,
  SUPPLIER_OUTFLOW_MIGRATION,
  SUPPLIER_OUTFLOW_TIMESCALE_MIGRATION,
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

describe("0003_sentryone.sql", () => {
  it("splits into statements the runner can send one at a time", async () => {
    const text = await Bun.file(
      `${MIGRATIONS_DIR}/${SENTRYONE_MIGRATION}`,
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
      `${MIGRATIONS_DIR}/${SENTRYONE_MIGRATION}`,
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
      `${MIGRATIONS_DIR}/${SENTRYONE_MIGRATION}`,
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
      `${MIGRATIONS_DIR}/${SENTRYONE_MIGRATION}`,
    ).text();
    const timescale = await Bun.file(
      `${MIGRATIONS_DIR}/${SENTRYONE_TIMESCALE_MIGRATION}`,
    ).text();

    // create_hypertable refuses a unique index that does not include the
    // partitioning column, so these two facts have to stay in step.
    expect(plain).toContain("primary key (at, event_id)");
    expect(timescale).toContain("create_hypertable('ledger_events', 'at'");
  });
});

describe("0005_sentryone_drift.sql", () => {
  it("widens the two check constraints the domain outgrew", async () => {
    const text = await Bun.file(
      `${MIGRATIONS_DIR}/${SENTRYONE_DRIFT_MIGRATION}`,
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
      `${MIGRATIONS_DIR}/${SENTRYONE_DRIFT_MIGRATION}`,
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
      `${MIGRATIONS_DIR}/${SENTRYONE_DRIFT_MIGRATION}`,
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
      `${MIGRATIONS_DIR}/${SENTRYONE_DRIFT_MIGRATION}`,
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

describe("0004_timescale_sentryone.sql", () => {
  it("keeps its continuous aggregate whole", async () => {
    const text = await Bun.file(
      `${MIGRATIONS_DIR}/${SENTRYONE_TIMESCALE_MIGRATION}`,
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

describe("0006_company.sql", () => {
  it("creates one guarded company row and nothing else", async () => {
    const text = await Bun.file(
      `${MIGRATIONS_DIR}/${COMPANY_MIGRATION}`,
    ).text();
    const statements = splitSqlStatements(text);

    expect(statements).toHaveLength(1);
    expect(statements[0]).toContain("create table if not exists company");
    // One row, enforced by the table. Two company rows would make "who are we"
    // a question with two answers on the header of every constancia.
    expect(statements[0]).toContain(
      "integer primary key default 1 check (id = 1)",
    );
    expect(statements[0]).toContain("bank_account_id text not null");
    // The run anchor. Without it GET /api/v1/run/current has to guess the week
    // from the newest instruction, and one late intake moves the whole run.
    expect(statements[0]).toContain("week_of         date not null");
    expect(statements[0]).toContain("run_id          text not null");
  });
});

describe("supplier_weekly_outflow, both paths", () => {
  /** The aliases a select gives its columns, in order. */
  function aliases(sql: string): string[] {
    return (
      [...sql.matchAll(/\bas\s+([a-z_]+)\b/g)]
        .map((match) => match[1] as string)
        // `create ... as select` matches too, and it is not a column alias.
        .filter((name) => name !== "select")
    );
  }

  async function plainText(): Promise<string> {
    return Bun.file(`${MIGRATIONS_DIR}/${SUPPLIER_OUTFLOW_MIGRATION}`).text();
  }

  async function timescaleText(): Promise<string> {
    return Bun.file(
      `${MIGRATIONS_DIR}/${SUPPLIER_OUTFLOW_TIMESCALE_MIGRATION}`,
    ).text();
  }

  it("is one plain view on a database with no extension", async () => {
    const statements = splitSqlStatements(await plainText());

    expect(statements).toHaveLength(1);
    expect(statements[0]).toContain(
      "create or replace view supplier_weekly_outflow",
    );
    // A continuous aggregate cannot exist here, and neither can a hypertable.
    expect(statements[0]).not.toContain("timescaledb");
  });

  it("keeps the continuous aggregate whole and turns off materialized_only", async () => {
    const statements = splitSqlStatements(await timescaleText());

    expect(statements).toHaveLength(5);
    expect(statements[0]).toContain(
      "create extension if not exists timescaledb",
    );
    // The plain view has to go before the aggregate can take its name.
    expect(statements[1]).toBe("drop view if exists supplier_weekly_outflow");
    expect(statements[2]).toContain("timescaledb.continuous");
    expect(statements[2]).toContain("time_bucket('7 days', at)");
    // Without this a CFDI ingested during the demo would not reach the detector
    // until the next refresh ran, because 2.13 made materialized_only default
    // to true.
    expect(statements[3]).toContain("timescaledb.materialized_only = false");
    expect(statements[4]).toContain("add_continuous_aggregate_policy");
  });

  it("answers with the same five columns in the same order", async () => {
    const plain = splitSqlStatements(await plainText())[0] as string;
    const aggregate = splitSqlStatements(await timescaleText())[2] as string;

    const columns = [
      "supplier_rfc",
      "week",
      "invoices",
      "outflow",
      "max_invoice",
    ];
    // queries.ts selects these by name off whichever object is live, and
    // rows.ts maps them once. A column added to one path and not the other is
    // the bug this test exists for.
    expect(aliases(plain)).toEqual(columns);
    expect(aliases(aggregate)).toEqual(columns);
  });

  it("reads the event ledger on both paths, and only the CFDI events", async () => {
    for (const text of [await plainText(), await timescaleText()]) {
      const definition = splitSqlStatements(text).join("\n");

      expect(definition).toContain("from ledger_events");
      expect(definition).toContain("'cfdi_received'");
      // cfdis and instructions are pinned by foreign keys that need a unique
      // index without the partitioning column, so neither can be a hypertable
      // and neither can carry this aggregate.
      expect(definition).not.toContain("from cfdis");
      expect(definition).not.toContain("from instructions");
    }
  });

  it("casts the money to the storage type on both paths", async () => {
    for (const text of [await plainText(), await timescaleText()]) {
      const definition = splitSqlStatements(text).join("\n");

      // Without the cast the sum is a float built out of jsonb numbers, and it
      // stops agreeing with sum(total) from cfdis at the cent.
      expect(definition).toContain("::numeric(14,2)");
      expect(definition).not.toMatch(/\b(real|double precision|float\d*)\b/);
    }
  });
});

describe("0010_rail_events.sql", () => {
  it("teaches the ledger the two event kinds the cent appends", async () => {
    const text = await Bun.file(
      `${MIGRATIONS_DIR}/${RAIL_EVENTS_MIGRATION}`,
    ).text();
    const statements = splitSqlStatements(text);
    const added = statements.find((statement) =>
      statement.includes("add constraint ledger_events_type_check"),
    );

    expect(added).toContain("'cent_sent'");
    expect(added).toContain("'cep_awaited'");
    // The kinds that were already legal stay legal: this is a widening, and a
    // set that dropped one would reject history the ledger already holds.
    for (const kind of [
      "cfdi_received",
      "complement_received",
      "instruction_received",
      "payment_sent",
      "sat_list_published",
      "cep_verified",
      "verification_call",
      "decision_made",
    ]) {
      expect(added).toContain(`'${kind}'`);
    }
  });

  it("is idempotent, and drops the constraint by name before adding it", async () => {
    const text = await Bun.file(
      `${MIGRATIONS_DIR}/${RAIL_EVENTS_MIGRATION}`,
    ).text();
    const statements = splitSqlStatements(text);

    expect(statements).toHaveLength(2);
    expect(statements[0]).toContain("drop constraint if exists");
    expect(text).not.toContain("create table");
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
      SENTRYONE_MIGRATION,
      SENTRYONE_DRIFT_MIGRATION,
      COMPANY_MIGRATION,
      SUPPLIER_OUTFLOW_MIGRATION,
      CONSORTIUM_SNAPSHOT_MIGRATION,
      RAIL_EVENTS_MIGRATION,
      DECISION_REASON_MIGRATION,
      TIMESCALE_MIGRATION,
      SENTRYONE_TIMESCALE_MIGRATION,
      SUPPLIER_OUTFLOW_TIMESCALE_MIGRATION,
    ]);
  });

  it("creates the plain supplier_weekly_outflow before replacing it", () => {
    // 0008 drops the view 0007 created and puts the continuous aggregate under
    // the same name. That is only safe while the plain file is guaranteed to
    // have run first, which is what this ordering is.
    const plain = MIGRATIONS.findIndex(
      (spec) => spec.file === SUPPLIER_OUTFLOW_MIGRATION,
    );
    const timescale = MIGRATIONS.findIndex(
      (spec) => spec.file === SUPPLIER_OUTFLOW_TIMESCALE_MIGRATION,
    );

    expect(plain).toBeGreaterThanOrEqual(0);
    expect(timescale).toBeGreaterThan(plain);
  });

  it("names a file that exists on disk", async () => {
    for (const spec of MIGRATIONS) {
      const file = Bun.file(`${MIGRATIONS_DIR}/${spec.file}`);
      expect(await file.exists()).toBe(true);
    }
  });
});

describe("RENAMED_MIGRATIONS", () => {
  it("maps every old name onto a file the runner actually runs", () => {
    const files = new Set(MIGRATIONS.map((spec) => spec.file));

    for (const pair of RENAMED_MIGRATIONS) {
      expect(files.has(pair.to)).toBe(true);
      // The old name must be gone from MIGRATIONS, otherwise the runner would
      // try to apply a file that no longer exists on disk.
      expect(files.has(pair.from)).toBe(false);
      expect(pair.from).not.toBe(pair.to);
    }
  });

  it("points at a file that exists and away from one that does not", async () => {
    for (const pair of RENAMED_MIGRATIONS) {
      expect(await Bun.file(`${MIGRATIONS_DIR}/${pair.to}`).exists()).toBe(
        true,
      );
      // If the old file came back, the rename was undone and the pair is a lie.
      expect(await Bun.file(`${MIGRATIONS_DIR}/${pair.from}`).exists()).toBe(
        false,
      );
    }
  });

  it("carries the three files the SentryOne rename moved", () => {
    expect(RENAMED_MIGRATIONS.map((pair) => pair.to)).toEqual([
      SENTRYONE_MIGRATION,
      SENTRYONE_TIMESCALE_MIGRATION,
      SENTRYONE_DRIFT_MIGRATION,
    ]);
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
