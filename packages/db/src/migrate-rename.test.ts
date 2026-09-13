/**
 * The rename reconciliation against a real Postgres.
 *
 * The bug this covers cannot be seen without a server: a host that applied
 * `0003_ceptinela.sql` records that filename, so the runner saw
 * `0003_sentryone.sql` as never applied and sent the whole file again. On the
 * managed Timescale service that second run fails, because 0003 recreates the
 * append-only rules on `ledger_events` and 0004 has since made that table a
 * hypertable, which refuses rules. The assertion that matters is therefore not
 * only what the runner reports but that nothing was executed: the trigger 0005
 * installed is still the guard, and no rule came back.
 *
 * Guarded exactly like queries.test.ts: it runs only when TEST_DATABASE_URL
 * points somewhere that is not DATABASE_URL, because it drops the schema.
 */

import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "bun:test";
import { createSql, type Sql } from "./index";
import {
  ASSISTANT_PAYMENT_EVENTS_MIGRATION,
  COMPANY_MIGRATION,
  CONSORTIUM_SNAPSHOT_MIGRATION,
  DECISION_REASON_MIGRATION,
  fingerprint,
  INIT_MIGRATION,
  MIGRATIONS,
  MIGRATIONS_DIR,
  type MigrationResult,
  migrate,
  RENAMED_MIGRATIONS,
  SENTRYONE_DRIFT_MIGRATION,
  SENTRYONE_MIGRATION,
  SENTRYONE_TIMESCALE_MIGRATION,
  TIMESCALE_MIGRATION,
} from "./migrate";

const url = process.env.TEST_DATABASE_URL;
const enabled =
  url !== undefined &&
  url.trim() !== "" &&
  // Belt and braces: this suite drops the public schema, so it must never be
  // pointed at the database a rehearsal is configured against.
  url.trim() !== (process.env.DATABASE_URL ?? "").trim();

function resultFor(
  results: readonly MigrationResult[],
  file: string,
): MigrationResult {
  const found = results.find((result) => result.file === file);
  if (found === undefined) {
    throw new Error(`the runner reported nothing for ${file}`);
  }
  return found;
}

describe.skipIf(!enabled)("migrate follows a renamed file", () => {
  let sql: Sql;

  beforeAll(() => {
    sql = createSql(url);
  });

  afterAll(async () => {
    await sql?.end({ timeout: 5 });
  });

  beforeEach(async () => {
    // A fresh database every case: the reconciliation is about what is recorded,
    // so a leftover row from the previous case would decide the outcome.
    await sql.unsafe("drop schema public cascade");
    await sql.unsafe("create schema public");
  });

  async function checksumOf(file: string): Promise<string> {
    return fingerprint(await Bun.file(`${MIGRATIONS_DIR}/${file}`).text());
  }

  /**
   * Records the new name if this host never ran the file, then rewrites every
   * recorded new name back to its pre-rename one. The insert is what lets a
   * plain Postgres 18 stand in for the managed service: 0004 is skipped here,
   * and it is exactly the file whose re-run breaks Timescale.
   */
  async function recordOldNames(): Promise<void> {
    for (const pair of RENAMED_MIGRATIONS) {
      await sql`
        insert into schema_migrations (filename, checksum)
        values (${pair.to}, ${await checksumOf(pair.to)})
        on conflict (filename) do nothing
      `;
      await sql`
        update schema_migrations set filename = ${pair.from}
        where filename = ${pair.to}
      `;
    }
  }

  async function recordedFiles(): Promise<string[]> {
    const rows = await sql<{ filename: string }[]>`
      select filename from schema_migrations order by filename
    `;
    return rows.map((row) => row.filename);
  }

  async function rulesOnLedgerEvents(): Promise<number> {
    const rows = await sql<{ count: string }[]>`
      select count(*)::text as count from pg_rules
      where tablename = 'ledger_events'
    `;
    return Number(rows[0]?.count ?? "0");
  }

  /**
   * The invariant every case ends on: `ledger_events` is guarded by the trigger
   * 0005 installed and by no rule at all, which is the shape 0004 needs to make
   * it a hypertable. On this plain host a re-run of 0003 would restore the rules
   * and the re-run of 0005 behind it would drop them again, so this is a
   * standing invariant rather than the discriminator; the discriminator is that
   * the runner reports no statements for a file it decided not to re-run.
   */
  async function appendOnlyStillGuards(): Promise<void> {
    expect(await rulesOnLedgerEvents()).toBe(0);
    const triggers = await sql<{ tgname: string }[]>`
      select tgname from pg_trigger where tgname = 'ledger_events_append_only'
    `;
    // At least one: on a hypertable Timescale copies the trigger onto every
    // chunk, so the count there is the parent plus one row per chunk.
    expect(triggers.length).toBeGreaterThan(0);

    // The trigger is per row, so the guard needs a row to fire on. A rule, which
    // is what 0003 writes, would swallow the update silently instead of raising.
    await sql`
      insert into ledger_events (at, type, payload)
      values (now(), 'payment_sent', '{"instructionId":"INS-GUARD"}'::jsonb)
    `;
    let raised = false;
    try {
      await sql.unsafe("update ledger_events set type = 'payment_sent'");
    } catch (cause) {
      raised = true;
      expect(String(cause)).toContain("append-only");
    }
    expect(raised).toBe(true);
    const remaining = await sql<{ count: string }[]>`
      select count(*)::text as count from ledger_events
    `;
    expect(remaining[0]?.count).toBe("1");
  }

  it("applies every file in order on a fresh database", async () => {
    const results = await migrate(sql);

    expect(results.map((result) => result.file)).toEqual(
      MIGRATIONS.map((spec) => spec.file),
    );
    for (const result of results) {
      // A plain Postgres 18 has no timescaledb, and that skip is the offline
      // fallback working as designed rather than a failure.
      expect(["applied", "skipped"]).toContain(result.status);
      if (result.status === "applied") {
        expect(result.statements).toBeGreaterThan(0);
      }
    }
    expect(resultFor(results, INIT_MIGRATION).status).toBe("applied");
    expect(resultFor(results, SENTRYONE_MIGRATION).status).toBe("applied");
    expect(resultFor(results, SENTRYONE_DRIFT_MIGRATION).status).toBe(
      "applied",
    );
    expect(resultFor(results, COMPANY_MIGRATION).status).toBe("applied");
    expect(resultFor(results, CONSORTIUM_SNAPSHOT_MIGRATION).status).toBe(
      "applied",
    );
    expect(resultFor(results, DECISION_REASON_MIGRATION).status).toBe(
      "applied",
    );
    expect(resultFor(results, ASSISTANT_PAYMENT_EVENTS_MIGRATION).status).toBe(
      "applied",
    );
    await appendOnlyStillGuards();
  });

  it("accepts the five event kinds 0012 widened the ledger to", async () => {
    /* The constraint is the only thing standing between an assistant turn and a
       rejection at the door, and a CHECK is the one kind of migration whose effect
       cannot be read off the file: it either accepts the row or it does not. So the
       five kinds are inserted here, and a sixth kind the domain does not have is
       inserted after them, because a constraint that accepts everything would pass
       the first half of this case and mean nothing. */
    await migrate(sql);

    for (const type of [
      "payment_settled",
      "payment_failed",
      "payment_cancelled",
      "assistant_message",
      "intake_image",
    ]) {
      await sql`
        insert into ledger_events (at, type, payload)
        values (now(), ${type}, ${sql.json({ instructionId: "INS-0012" })})
      `;
    }

    const rows = await sql<{ count: string }[]>`
      select count(*)::text as count from ledger_events
      where payload->>'instructionId' = 'INS-0012'
    `;
    expect(rows[0]?.count).toBe("5");

    let refused = false;
    try {
      await sql`
        insert into ledger_events (at, type, payload)
        values (now(), 'payment_teleported', '{}'::jsonb)
      `;
    } catch (cause) {
      refused = true;
      expect(String(cause)).toContain("ledger_events_type_check");
    }
    // A widening and not an opening: a kind the domain does not have is still refused.
    expect(refused).toBe(true);
  });

  it("renames the recorded rows instead of running the files again", async () => {
    await migrate(sql);
    await recordOldNames();
    expect(await recordedFiles()).toContain("0003_ceptinela.sql");

    const second = await migrate(sql);

    for (const pair of RENAMED_MIGRATIONS) {
      const result = resultFor(second, pair.to);
      expect(result.status).toBe("renamed");
      expect(result.reason).toBe(
        `recorded as ${pair.from} before the product rename`,
      );
      // Nothing was sent to the server for these files.
      expect(result.statements).toBeUndefined();
    }
    for (const result of second) {
      expect(result.statements).toBeUndefined();
      if (
        !RENAMED_MIGRATIONS.some((pair) => pair.to === result.file) &&
        result.status !== "skipped"
      ) {
        expect(result.status).toBe("already-applied");
      }
    }

    // The stored checksum is the new file's, so the drift warning still means
    // something the next time somebody edits one of these.
    const rows = await sql<{ filename: string; checksum: string }[]>`
      select filename, checksum from schema_migrations
      where filename = ${SENTRYONE_MIGRATION}
    `;
    expect(rows[0]?.checksum).toBe(
      fingerprint(
        await Bun.file(`${MIGRATIONS_DIR}/${SENTRYONE_MIGRATION}`).text(),
      ),
    );

    /* Every file the plain-Postgres path applies, plus the one Timescale file whose
       row `recordOldNames` wrote so the rename pairs are complete. The expected set
       is derived from MIGRATIONS rather than written out again: an exact comparison
       still notices a file that stopped being applied or a row nobody expected,
       which is the point of this assertion, and it no longer goes stale the moment
       somebody adds a plain migration and fails for a reason that has nothing to do
       with the rename this test covers. */
    const plainFiles = MIGRATIONS.filter((spec) => !spec.requiresTimescale).map(
      (spec) => spec.file,
    );

    expect([...(await recordedFiles())].sort()).toEqual(
      [...plainFiles, SENTRYONE_TIMESCALE_MIGRATION].sort(),
    );
    // And no pre-rename name survived the reconciliation.
    const recorded = new Set(await recordedFiles());
    for (const pair of RENAMED_MIGRATIONS) {
      expect(recorded.has(pair.from)).toBe(false);
    }
    await appendOnlyStillGuards();
  });

  it("settles: the run after a rename is already-applied everywhere", async () => {
    await migrate(sql);
    await recordOldNames();
    await migrate(sql);

    const third = await migrate(sql);

    for (const result of third) {
      expect(["already-applied", "skipped"]).toContain(result.status);
      expect(result.statements).toBeUndefined();
      if (result.status === "already-applied") {
        // No drift warning either: the checksum the rename stored is the one
        // the file on disk still fingerprints to.
        expect(result.reason).toBeUndefined();
      }
    }
    expect(resultFor(third, SENTRYONE_MIGRATION).status).toBe(
      "already-applied",
    );
    await appendOnlyStillGuards();
  });

  it("drops the stale row when a host already re-ran the file under both names", async () => {
    await migrate(sql);
    // What a plain Postgres looks like today: it re-ran 0003 and 0005 under
    // their new names and kept the old rows next to them. 0004 is skipped on
    // this host, so its new-name row is written here to make the pair complete.
    for (const pair of RENAMED_MIGRATIONS) {
      await sql`
        insert into schema_migrations (filename, checksum)
        values (${pair.to}, ${await checksumOf(pair.to)})
        on conflict (filename) do nothing
      `;
      await sql`
        insert into schema_migrations (filename, checksum)
        values (${pair.from}, ${"stale000"})
        on conflict (filename) do nothing
      `;
    }

    const results = await migrate(sql);

    for (const pair of RENAMED_MIGRATIONS) {
      const result = resultFor(results, pair.to);
      expect(result.status).toBe("already-applied");
      expect(result.reason).toBe(
        `also recorded as ${pair.from} before the product rename, and that stale row was dropped`,
      );
      expect(result.statements).toBeUndefined();
    }
    for (const pair of RENAMED_MIGRATIONS) {
      expect(await recordedFiles()).not.toContain(pair.from);
    }
    await appendOnlyStillGuards();
  });

  it("leaves a fresh database alone: neither name is recorded", async () => {
    const results = await migrate(sql);

    expect(results.some((result) => result.status === "renamed")).toBe(false);
    expect(await recordedFiles()).not.toContain(TIMESCALE_MIGRATION);
  });
});
