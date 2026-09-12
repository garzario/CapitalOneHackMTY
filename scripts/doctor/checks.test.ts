/**
 * The doctor's checks, at the edges that decide a demo.
 *
 * Every case here is one a person actually hits: a snapshot downloaded last
 * month, a migration applied and then edited, a Timescale file that is missing
 * because the host is the plain Postgres fallback and not because anything is
 * wrong, a database that was migrated and never seeded. The clock and the
 * filesystem are injected, so none of it depends on today's date or on what
 * happens to be in this checkout.
 *
 * The one case that needs a real server is gated on TEST_DATABASE_URL and
 * refuses to run against the database DATABASE_URL points at.
 */

import { describe, expect, it } from "bun:test";
import type { Sql } from "../../packages/db/src/index.ts";
import { MIGRATIONS } from "../../packages/db/src/migrate.ts";
import type { SentryOneCounts } from "../../packages/db/src/queries.ts";
import {
  type AppliedMigration,
  type Check,
  checkBunVersion,
  checkCepFixture,
  checkDatabase,
  checkEnv,
  checkMigrations,
  checkOfflineDemo,
  checkSatSnapshot,
  type DatabaseDeps,
  defaultDatabaseDeps,
  exitCode,
  isLocalDatabase,
  NO_LISTENER_REASON,
  offlineSatSnapshot,
  redactUrl,
  type SatSnapshotFacts,
  sentryoneTables,
} from "./checks.ts";

const ROOT = `${import.meta.dir}/../..`;
const CEP_FIXTURE = `${ROOT}/packages/cep/src/fixtures/synthetic-cep.xml`;

function detailOf(checks: readonly Check[], name: string): string {
  const check = checks.find((candidate) => candidate.name === name);
  if (check === undefined) {
    throw new Error(`no check named ${name} in ${checks.map((c) => c.name)}`);
  }
  return check.detail;
}

function statusOf(checks: readonly Check[], name: string): string {
  const check = checks.find((candidate) => candidate.name === name);
  if (check === undefined) {
    throw new Error(`no check named ${name} in ${checks.map((c) => c.name)}`);
  }
  return check.status;
}

describe("bun version", () => {
  it("is the only check allowed to fail, and says how to fix it", () => {
    const check = checkBunVersion({ pinned: "1.3.11", running: "1.2.0" });
    expect(check.status).toBe("fail");
    expect(check.detail).toContain("bun-v1.3.11");
  });

  it("passes on a match and warns when the pin file is gone", () => {
    expect(
      checkBunVersion({ pinned: "1.3.11", running: "1.3.11" }).status,
    ).toBe("ok");
    expect(checkBunVersion({ running: "1.3.11" }).status).toBe("warn");
  });
});

describe("environment", () => {
  const template = [
    "# a comment",
    "NESSIE_API_KEY=",
    "DATABASE_URL=",
    "GEMINI_API_KEY=",
    "ELEVENLABS_API_KEY=",
    "ELEVENLABS_AGENT_ID=",
    "ELEVENLABS_PHONE_NUMBER_ID=",
    "ALLOW_SEED=",
    "VULTR_API_KEY=",
  ].join("\n");

  it("says what stops working without a variable the demo path reads", () => {
    const checks = checkEnv({
      template,
      envFilePresent: true,
      env: { DATABASE_URL: "postgres://localhost:5432/sentryone" },
    });

    expect(statusOf(checks, ".env")).toBe("ok");
    expect(statusOf(checks, "env GEMINI_API_KEY")).toBe("warn");
    expect(detailOf(checks, "env GEMINI_API_KEY")).toContain("422");
    expect(detailOf(checks, "env ELEVENLABS_API_KEY")).toContain(
      "degrades to the script",
    );
    expect(statusOf(checks, "env DATABASE_URL")).toBe("ok");
  });

  it("leaves a variable nothing on the demo path reads green when empty", () => {
    const checks = checkEnv({ template, envFilePresent: true, env: {} });
    expect(statusOf(checks, "env VULTR_API_KEY")).toBe("ok");
    expect(statusOf(checks, "env NESSIE_API_KEY")).toBe("warn");
  });

  /**
   * The classification, against what actually reads each variable in this tree.
   * Two of these were wrong: nothing in `apps/api` reads a connection string
   * yet and no route calls Nessie, so naming the API as the reader of either
   * sends a tired person to the wrong file. ALLOW_SEED was in neither set and
   * `apps/api/src/deps.ts` reads it.
   */
  it("names the files that read each variable, not the ones that do not", () => {
    const checks = checkEnv({ template, envFilePresent: true, env: {} });

    const database = detailOf(checks, "env DATABASE_URL");
    expect(statusOf(checks, "env DATABASE_URL")).toBe("warn");
    expect(database).toContain("bun run migrate");
    expect(database).toContain("packages/db");
    expect(database).toContain("the Postgres repository");

    const nessie = detailOf(checks, "env NESSIE_API_KEY");
    expect(nessie).toContain("packages/nessie");
    expect(nessie).not.toContain("apps/api");

    expect(detailOf(checks, "env GEMINI_API_KEY")).toContain("apps/api");
    expect(detailOf(checks, "env ELEVENLABS_API_KEY")).toContain("apps/api");

    const allowSeed = detailOf(checks, "env ALLOW_SEED");
    expect(statusOf(checks, "env ALLOW_SEED")).toBe("warn");
    expect(allowSeed).toContain("apps/api");
    expect(allowSeed).toContain("POST /api/v1/seed");
  });

  it("does not claim the demo path reads a variable when a script does", () => {
    const checks = checkEnv({
      template,
      envFilePresent: true,
      env: { DATABASE_URL: "postgres://localhost:5432/sentryone" },
    });
    const database = detailOf(checks, "env DATABASE_URL");
    expect(database).toContain("35 characters");
    expect(database).toContain("read by packages/db");
    expect(database).not.toContain("read by the demo path");
  });

  it("reports the two ElevenLabs ids as one line, because one call needs both", () => {
    const half = checkEnv({
      template,
      envFilePresent: true,
      env: { ELEVENLABS_AGENT_ID: "agent_1" },
    });
    expect(statusOf(half, "env voice ids")).toBe("warn");
    expect(detailOf(half, "env voice ids")).toContain(
      "ELEVENLABS_PHONE_NUMBER_ID",
    );
    expect(half.filter((check) => check.name === "env voice ids")).toHaveLength(
      1,
    );

    const both = checkEnv({
      template,
      envFilePresent: true,
      env: {
        ELEVENLABS_AGENT_ID: "agent_1",
        ELEVENLABS_PHONE_NUMBER_ID: "p_1",
      },
    });
    expect(statusOf(both, "env voice ids")).toBe("ok");
  });

  it("never prints a value, only how long it is", () => {
    const checks = checkEnv({
      template,
      envFilePresent: true,
      env: { NESSIE_API_KEY: "abcdefghij" },
    });
    expect(detailOf(checks, "env NESSIE_API_KEY")).not.toContain("abcdefghij");
    expect(detailOf(checks, "env NESSIE_API_KEY")).toContain("10 characters");
  });

  it("warns about a missing .env with the command that fixes it", () => {
    const checks = checkEnv({ template, envFilePresent: false, env: {} });
    expect(detailOf(checks, ".env")).toContain("cp .env.example .env");
  });
});

describe("the SAT list snapshot", () => {
  const facts: SatSnapshotFacts = {
    filename: "official-2026-09-12.csv",
    listVersion: "2025-12-31",
    retrievedAt: "2026-09-12",
    sourceUrl: "http://omawww.sat.gob.mx/cifras_sat/Documents/x.csv",
    rows: 14234,
    taxpayers: 14054,
    situations: 28935,
  };

  it("names the version, the date and the counts when it is fresh", () => {
    const check = checkSatSnapshot({ facts, today: "2026-09-12" });
    expect(check.status).toBe("ok");
    expect(check.detail).toContain("list version 2025-12-31");
    expect(check.detail).toContain("retrieved 2026-09-12");
    expect(check.detail).toContain("14234 rows");
    expect(check.detail).toContain("14054 taxpayers");
  });

  it("warns when the file is missing and says where the refresh steps are", () => {
    const check = checkSatSnapshot({ error: "ENOENT", today: "2026-09-12" });
    expect(check.status).toBe("warn");
    expect(check.detail).toContain("packages/sat/src/snapshot/README.md");
  });

  it("warns past thirty days, because the SAT republishes the list", () => {
    expect(checkSatSnapshot({ facts, today: "2026-10-12" }).status).toBe("ok");
    const stale = checkSatSnapshot({ facts, today: "2026-10-13" });
    expect(stale.status).toBe("warn");
    expect(stale.detail).toContain("31 days old");
  });
});

describe("the CEP fixture", () => {
  it("parses the committed fixture and reports the signature as not checked", async () => {
    const check = await checkCepFixture({ path: CEP_FIXTURE });
    expect(check.status).toBe("ok");
    expect(check.detail).toContain("clave de rastreo");
    expect(check.detail).toContain("signature reported and not checked");
    expect(check.detail).not.toContain("valid");
  });

  it("warns on a missing path instead of throwing", async () => {
    const check = await checkCepFixture({
      path: `${ROOT}/packages/cep/src/fixtures/no-such-cep.xml`,
    });
    expect(check.status).toBe("warn");
    expect(check.detail).toContain("missing");
  });

  it("warns when the file is there but the parser refuses it", async () => {
    const check = await checkCepFixture({
      path: "injected",
      readText: async () => "<not-a-cep/>",
    });
    expect(check.status).toBe("warn");
    expect(check.detail).toContain("unparseable");
  });
});

describe("migrations", () => {
  const migrations = [
    { file: "0001_init.sql", requiresTimescale: false },
    { file: "0003_sentryone.sql", requiresTimescale: false },
    { file: "0005_sentryone_drift.sql", requiresTimescale: false },
    { file: "0002_timescale.sql", requiresTimescale: true },
    { file: "0004_timescale_sentryone.sql", requiresTimescale: true },
  ] as const;

  function applied(...files: string[]): AppliedMigration[] {
    return files.map((filename) => ({ filename, checksum: "aaaaaaaa" }));
  }

  it("is green when every file is applied on a Timescale host", () => {
    const check = checkMigrations({
      migrations,
      applied: applied(...migrations.map((spec) => spec.file)),
      timescale: true,
    });
    expect(check.status).toBe("ok");
    expect(check.detail).toBe("5 of 5 applied");
  });

  it("is green when only the Timescale files are missing on a plain host", () => {
    const check = checkMigrations({
      migrations,
      applied: applied(
        "0001_init.sql",
        "0003_sentryone.sql",
        "0005_sentryone_drift.sql",
      ),
      timescale: false,
    });
    expect(check.status).toBe("ok");
    expect(check.detail).toContain("3 of 5 applied");
    expect(check.detail).toContain("0002_timescale.sql");
    expect(check.detail).toContain("0004_timescale_sentryone.sql");
    expect(check.detail).toContain("working as designed");
    expect(check.detail).not.toContain("run: bun run migrate");
  });

  it("warns when a plain file is missing, whatever the host", () => {
    const check = checkMigrations({
      migrations,
      applied: applied("0001_init.sql", "0005_sentryone_drift.sql"),
      timescale: false,
    });
    expect(check.status).toBe("warn");
    expect(check.detail).toContain("missing 0003_sentryone.sql");
    expect(check.detail).toContain("run: bun run migrate");
  });

  it("warns when an applied file was edited afterwards", () => {
    const check = checkMigrations({
      migrations,
      applied: applied(
        "0001_init.sql",
        "0003_sentryone.sql",
        "0005_sentryone_drift.sql",
      ),
      checksums: { "0003_sentryone.sql": "bbbbbbbb" },
      timescale: false,
    });
    expect(check.status).toBe("warn");
    expect(check.detail).toContain("0003_sentryone.sql changed");
    expect(check.detail).toContain("add a new migration");
  });
});

describe("connection strings", () => {
  it("never prints a password", () => {
    expect(redactUrl("postgres://user:hunter2@db.example.com:5432/sentryone")) //
      .toBe("postgres://db.example.com:5432/sentryone");
  });

  it("knows a local database from a hosted one", () => {
    expect(isLocalDatabase("postgres://localhost:5432/sentryone")).toBe(true);
    expect(isLocalDatabase("postgres://127.0.0.1:5432/sentryone")).toBe(true);
    expect(isLocalDatabase("postgres://user:p@tsdb.cloud:5432/sentryone")).toBe(
      false,
    );
  });
});

describe("offline readiness", () => {
  const ready = {
    databaseUrl: "postgres://localhost:5432/sentryone",
    databaseReachable: true,
    tables: "populated" as const,
    satSnapshot: { readable: true, ageDays: 0 },
    cepFixture: true,
  };

  it("is ready when all four inputs hold", () => {
    const check = checkOfflineDemo(ready);
    expect(check.status).toBe("ok");
    expect(check.detail).toContain("ready");
  });

  it("flips on each missing input and names it", () => {
    expect(
      checkOfflineDemo({ ...ready, databaseUrl: undefined }).detail,
    ).toContain("DATABASE_URL is not set");
    expect(
      checkOfflineDemo({
        ...ready,
        databaseUrl: "postgres://user:p@tsdb.cloud:5432/sentryone",
      }).detail,
    ).toContain("needs a network");
    expect(
      checkOfflineDemo({ ...ready, databaseReachable: false }).detail,
    ).toContain("did not answer");
    expect(checkOfflineDemo({ ...ready, tables: "empty" }).detail).toContain(
      "bun run seed",
    );
    expect(
      checkOfflineDemo({ ...ready, satSnapshot: { readable: false } }).detail,
    ).toContain("SAT list snapshot");
    expect(checkOfflineDemo({ ...ready, cepFixture: false }).detail).toContain(
      "CEP fixture",
    );

    for (const broken of [
      { ...ready, databaseUrl: undefined },
      { ...ready, databaseReachable: false },
      { ...ready, tables: "empty" as const },
      { ...ready, satSnapshot: { readable: false } },
      { ...ready, cepFixture: false },
    ]) {
      expect(checkOfflineDemo(broken).status).toBe("warn");
    }
  });

  /**
   * The bug this covers: the runner used to hand this line the snapshot check's
   * status, so the demo was declared not ready, for a file that is on disk and
   * answers a lookup offline, on the thirty-first day after the download.
   */
  it("stays ready on a stale snapshot and names the age, the way the runner collapses it", () => {
    const facts: SatSnapshotFacts = {
      filename: "official-2026-09-12.csv",
      listVersion: "2025-12-31",
      retrievedAt: "2026-09-12",
      sourceUrl: "http://omawww.sat.gob.mx/cifras_sat/Documents/x.csv",
      rows: 14234,
      taxpayers: 14054,
      situations: 28935,
    };
    const today = "2026-10-22"; // 40 days after the retrieval date.

    // The table still asks for a refresh.
    expect(checkSatSnapshot({ facts, today }).status).toBe("warn");

    const check = checkOfflineDemo({
      ...ready,
      satSnapshot: offlineSatSnapshot({ facts, today }),
    });
    expect(check.status).toBe("ok");
    expect(check.detail).toContain("ready, this laptop can run the demo");
    expect(check.detail).toContain("40 days old");
    expect(check.detail).not.toContain("not readable");
  });

  it("carries no age clause while the snapshot is fresh", () => {
    const check = checkOfflineDemo({
      ...ready,
      satSnapshot: { readable: true, ageDays: 3 },
    });
    expect(check.detail).toBe(
      "ready, this laptop can run the demo with the network unplugged",
    );
  });

  /**
   * `bun run seed` does not migrate, so a schema that is not there needs the
   * other command. The two used to collapse into one boolean and one hint.
   */
  it("sends an unmigrated database to migrate and an empty one to seed", () => {
    const absent = checkOfflineDemo({ ...ready, tables: "missing" });
    expect(absent.status).toBe("warn");
    expect(absent.detail).toContain(
      "the SentryOne tables do not exist, run: bun run migrate",
    );
    expect(absent.detail).not.toContain("bun run seed");

    const empty = checkOfflineDemo({ ...ready, tables: "empty" });
    expect(empty.status).toBe("warn");
    expect(empty.detail).toContain(
      "the SentryOne tables are empty, run: bun run seed",
    );
    expect(empty.detail).not.toContain("bun run migrate");
  });

  it("does not also call the tables empty when there is no database to be empty", () => {
    const detail = checkOfflineDemo({
      ...ready,
      databaseUrl: undefined,
      tables: "missing",
    }).detail;
    expect(detail).toContain("DATABASE_URL is not set");
    expect(detail).not.toContain("bun run seed");
    expect(detail).not.toContain("bun run migrate");
  });

  it("never prints the password of a hosted database", () => {
    expect(
      checkOfflineDemo({
        ...ready,
        databaseUrl: "postgres://user:hunter2@tsdb.cloud:5432/sentryone",
      }).detail,
    ).not.toContain("hunter2");
  });
});

describe("the exit code", () => {
  const warned: Check[] = [
    { name: "bun version", status: "ok", detail: "" },
    { name: "nessie", status: "warn", detail: "" },
  ];

  it("ignores warnings by default, so the doctor is a command people run", () => {
    expect(exitCode(warned, false)).toBe(0);
  });

  it("turns a warning into exit 1 under --strict, for the release gate", () => {
    expect(exitCode(warned, true)).toBe(1);
  });

  it("fails on a bun mismatch either way", () => {
    const failed: Check[] = [
      { name: "bun version", status: "fail", detail: "" },
    ];
    expect(exitCode(failed, false)).toBe(1);
    expect(exitCode(failed, true)).toBe(1);
  });

  it("is 0 under --strict when nothing warned", () => {
    expect(
      exitCode([{ name: "bun version", status: "ok", detail: "" }], true),
    ).toBe(0);
  });
});

/**
 * The database check over injected dependencies, so the two failures a laptop
 * actually hits need no server: a Postgres that is not running, and a database
 * that was never migrated.
 */
describe("the database check, over injected dependencies", () => {
  const zeroCounts: SentryOneCounts = {
    suppliers: 0,
    knownAccounts: 0,
    cfdis: 0,
    complements: 0,
    instructions: 0,
    findings: 0,
    decisions: 0,
    satVersions: 0,
    satEntries: 0,
    beneficiaries: 0,
    events: 0,
  };

  function deps(overrides: Partial<DatabaseDeps> = {}): DatabaseDeps {
    return {
      createSql: () => ({}) as unknown as Sql,
      probe: async () => ({ ok: true, ms: 3 }),
      hasTimescale: async () => false,
      isHypertable: async () => false,
      appliedMigrations: async () => [],
      migrations: [],
      checksums: async () => ({}),
      countSentryOne: async () => zeroCounts,
      countLedgerTx: async () => 0,
      latestOccurredAt: async () => undefined,
      close: async () => undefined,
      ...overrides,
    };
  }

  /**
   * postgres.js raises an AggregateError with an empty message on
   * ECONNREFUSED, so the most common failure of all used to print the colon and
   * stop there: the `?? "unknown error"` fallback never fired on an empty
   * string.
   */
  it("gives a reason when the driver gives none, which is what a stopped Postgres does", async () => {
    const checks = await checkDatabase(
      "postgres://localhost:5432/sentryone",
      deps({ probe: async () => ({ ok: false, ms: 12, error: "" }) }),
    );

    expect(statusOf(checks, "database")).toBe("warn");
    expect(detailOf(checks, "database")).toBe(
      `postgres://localhost:5432/sentryone unreachable: ${NO_LISTENER_REASON}`,
    );
    expect(detailOf(checks, "database")).not.toContain("unknown error");
  });

  it("keeps the driver's own message when there is one", async () => {
    const checks = await checkDatabase(
      "postgres://localhost:5432/nothing_here",
      deps({
        probe: async () => ({
          ok: false,
          ms: 8,
          error: 'database "nothing_here" does not exist',
        }),
      }),
    );
    expect(detailOf(checks, "database")).toContain("does not exist");
  });

  it("tells tables that are not there from tables that are merely empty", async () => {
    const unmigrated = await checkDatabase(
      "postgres://localhost:5432/sentryone",
      deps({
        countSentryOne: async () => {
          throw new Error('relation "suppliers" does not exist');
        },
      }),
    );
    expect(sentryoneTables(unmigrated)).toBe("missing");
    expect(detailOf(unmigrated, "sentryone")).toContain("bun run migrate");

    const empty = await checkDatabase(
      "postgres://localhost:5432/sentryone",
      deps(),
    );
    expect(sentryoneTables(empty)).toBe("empty");
    expect(detailOf(empty, "sentryone")).toBe("empty, run: bun run seed");

    const seeded = await checkDatabase(
      "postgres://localhost:5432/sentryone",
      deps({
        countSentryOne: async () => ({ ...zeroCounts, suppliers: 12 }),
      }),
    );
    expect(sentryoneTables(seeded)).toBe("populated");
    expect(statusOf(seeded, "sentryone")).toBe("ok");
  });

  it("reads missing off a database that never answered, so no command is guessed", async () => {
    const checks = await checkDatabase(
      "postgres://localhost:5432/sentryone",
      deps({ probe: async () => ({ ok: false, ms: 12, error: "" }) }),
    );
    expect(sentryoneTables(checks)).toBe("missing");
  });
});

/**
 * The one case that needs a server. It runs only with TEST_DATABASE_URL set,
 * and never against the database DATABASE_URL points at: this check reads a
 * migrated and deliberately unseeded database, and asserting "empty" against
 * someone's working database would be both wrong and rude.
 */
const testDatabaseUrl = Bun.env.TEST_DATABASE_URL;
const gated = testDatabaseUrl === undefined || testDatabaseUrl === "";

describe("the database check, against a real Postgres", () => {
  it.skipIf(gated)(
    "reports the plain path, the expected-skipped Timescale files and an empty schema",
    async () => {
      expect(testDatabaseUrl).not.toBe(Bun.env.DATABASE_URL);

      const checks = await checkDatabase(
        testDatabaseUrl as string,
        await defaultDatabaseDeps(),
      );

      expect(statusOf(checks, "database")).toBe("ok");
      expect(detailOf(checks, "database")).not.toContain("@");
      expect(detailOf(checks, "timeseries path")).toContain("plain Postgres");

      expect(statusOf(checks, "migrations")).toBe("ok");
      // Counted off MIGRATIONS rather than written down, so adding a file is
      // one line in the runner and not a red test here that says nothing.
      const plain = MIGRATIONS.filter((spec) => !spec.requiresTimescale).length;
      expect(detailOf(checks, "migrations")).toContain(
        `${plain} of ${MIGRATIONS.length} applied`,
      );
      expect(detailOf(checks, "migrations")).toContain("0002_timescale.sql");
      expect(detailOf(checks, "migrations")).toContain(
        "0004_timescale_sentryone.sql",
      );

      expect(statusOf(checks, "sentryone")).toBe("warn");
      expect(detailOf(checks, "sentryone")).toBe("empty, run: bun run seed");
      // Empty and not absent, which is the difference between the two commands
      // the closing line can print.
      expect(sentryoneTables(checks)).toBe("empty");
    },
  );
});
