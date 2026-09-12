/**
 * The checks behind `bun run doctor`, one function per check.
 *
 * They live here, apart from the runner in `../doctor.ts`, for one reason: a
 * check that decides whether a demo can happen is worth a test, and a check
 * wired into a script that reads the filesystem, the environment and a database
 * at import time cannot have one. Every function here is either pure over its
 * arguments or takes its effects as injectable dependencies, so
 * `checks.test.ts` drives the edge cases that matter (a snapshot a month old, a
 * migration applied and then edited, a Timescale file missing on a plain host)
 * without a database, a network or a clock.
 *
 * Each function returns `{ name, status, detail }`, or a list of them when one
 * subject answers several questions, and nothing here prints or exits. The
 * runner owns the table and the exit code, and `exitCode` below is the pure
 * function that decides it.
 *
 * One rule that is not stylistic: no detail may ever carry a password. Anything
 * built from a connection string goes through `redactUrl` first.
 */

import type { ProbeResult, Sql } from "../../packages/db/src/index.ts";
import type { MigrationSpec } from "../../packages/db/src/migrate.ts";
import type { CeptinelaCounts } from "../../packages/db/src/queries.ts";

export type Status = "ok" | "warn" | "fail";

/**
 * What the Ceptinela tables are. Three states and not two, because "the tables
 * are empty" and "the tables are not there" take different commands and
 * `bun run seed` does not migrate.
 */
export type CeptinelaTables = "missing" | "empty" | "populated";

export interface Check {
  name: string;
  status: Status;
  detail: string;
  /**
   * Only on the `ceptinela` line. The closing line has to tell an empty schema
   * from an absent one, and a status of "warn" says both; this is that
   * distinction in a form the last check can read without parsing English.
   */
  tables?: CeptinelaTables;
}

/** A dead host must not hang the command; the probe is bounded and so is the rest. */
export const DB_PROBE_TIMEOUT_MS = 2000;
export const DB_QUERY_TIMEOUT_MS = 4000;
export const NESSIE_TIMEOUT_MS = 4000;

/** Names the offline-readiness line reads back off the table. */
export const DATABASE_CHECK = "database";
export const CEPTINELA_CHECK = "ceptinela";

/* -------------------------------------------------------------------------- */
/* Shared helpers                                                              */
/* -------------------------------------------------------------------------- */

/** Keeps a password out of the terminal and out of a screen recording. */
export function redactUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const database = parsed.pathname.replace(/^\//, "");
    return `${parsed.protocol}//${parsed.hostname}:${parsed.port || "5432"}/${database}`;
  } catch {
    return "unparsable DATABASE_URL";
  }
}

/** True when the database is on this laptop, which is what offline mode needs. */
export function isLocalDatabase(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host === "localhost" || host === "127.0.0.1" || host === "::1";
  } catch {
    return false;
  }
}

export function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

/** "a", "a and b", "a, b and c". Used wherever a check names files. */
export function listNames(names: readonly string[]): string {
  if (names.length <= 1) {
    return names[0] ?? "";
  }
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/** Whole days between two "YYYY-MM-DD" days, negative when the first is later. */
export function daysBetween(from: string, to: string): number {
  const start = Date.parse(`${from}T00:00:00Z`);
  const end = Date.parse(`${to}T00:00:00Z`);
  if (Number.isNaN(start) || Number.isNaN(end)) {
    return Number.NaN;
  }
  return Math.round((end - start) / 86_400_000);
}

export function messageOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

/** Bounds a follow-up query the way `probe` bounds the first one. */
export async function withTimeout<T>(
  work: Promise<T>,
  timeoutMs: number,
  label: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => {
        reject(new Error(`${label} did not answer in ${timeoutMs}ms`));
      }, timeoutMs);
    });
    return await Promise.race([work, timeout]);
  } finally {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
  }
}

/* -------------------------------------------------------------------------- */
/* 1. bun version, the only check that is allowed to fail                      */
/* -------------------------------------------------------------------------- */

export function checkBunVersion(input: {
  pinned?: string;
  running: string;
}): Check {
  const { pinned, running } = input;
  if (pinned === undefined || pinned === "") {
    return {
      name: "bun version",
      status: "warn",
      detail: `.bun-version is missing, running bun ${running}`,
    };
  }
  if (pinned === running) {
    return {
      name: "bun version",
      status: "ok",
      detail: `bun ${running} matches .bun-version`,
    };
  }
  return {
    name: "bun version",
    status: "fail",
    detail: `bun ${running} but .bun-version pins ${pinned}. Fix it with: curl -fsSL https://bun.sh/install | bash -s "bun-v${pinned}"`,
  };
}

/* -------------------------------------------------------------------------- */
/* 2. environment                                                              */
/* -------------------------------------------------------------------------- */

/** One variable the demo depends on: who reads it, and what breaks without it. */
export interface DemoVariable {
  /** The files that read it today, so the reader knows where to look. */
  readers: string;
  /** What stops working while it is empty. */
  consequence: string;
}

/**
 * The variables the demo depends on, each with one clause on what stops working
 * and one on who reads it. A doctor that says "missing" and nothing else makes
 * a tired person guess at 03:00 whether it matters, and a doctor that says "the
 * demo path reads it" about a file that does not sends them to the wrong one.
 *
 * `readers` is a grep of this tree and not a memory of the architecture. Redo it
 * whenever a variable moves:
 *
 *     grep -rn NAME apps packages scripts --include='*.ts' --include='*.tsx'
 *
 * Run on 2026-09-12 it gives the citations in the comments below. Two of them
 * are worth stating out loud, because the previous wording had both wrong:
 * `apps/api` reads no connection string yet (`apps/api/src/repo.ts` still boots
 * `MemoryRepository` and carries the TODO for the Postgres one), and no route
 * calls Nessie, so both variables are read by `packages/*` and by the scripts.
 *
 * `SEED` and `SEED_NUMBER` are read by `apps/api/src/deps.ts` too, but they are
 * not in `.env.example` and this check only walks that file, so listing them
 * here would print nothing.
 */
export const DEMO_VARIABLES: Readonly<Record<string, DemoVariable>> = {
  // packages/db/src/index.ts:46, scripts/migrate.ts:16, scripts/seed.ts:253,
  // scripts/reset.ts:50, scripts/doctor.ts:127.
  DATABASE_URL: {
    readers:
      "packages/db, bun run migrate, seed, reset and doctor, and the API, which boots the Postgres repository instead of the in-memory one when it is set",
    consequence: "nothing is persisted and no screen survives a restart",
  },
  // packages/nessie/src/client.ts:261, scripts/seed.ts:295,
  // scripts/reset.ts:98, scripts/doctor.ts:141.
  NESSIE_API_KEY: {
    readers: "packages/nessie and bun run seed, reset and doctor",
    consequence:
      "the bank mirror has no upstream and reconciliation finds nothing",
  },
  // apps/api/src/extraction.ts:69, packages/extract/src/gemini.ts:254.
  GEMINI_API_KEY: {
    readers: "apps/api through packages/extract",
    consequence:
      "the photo and voice-note intake answers 422, typed intake is unaffected",
  },
  // apps/api/src/routes/verify-call.ts:75, packages/voice/src/client.ts:274.
  ELEVENLABS_API_KEY: {
    readers: "apps/api through packages/voice",
    consequence: "the verification call degrades to the script on the card",
  },
  // apps/api/src/deps.ts:85, guarding apps/api/src/routes/seed.ts:27.
  ALLOW_SEED: {
    readers: "apps/api, where only the exact value 1 opens POST /api/v1/seed",
    consequence:
      "that endpoint answers 403 and the web app cannot regenerate the demo company between rehearsals",
  },
};

/** Reported as one line: the call needs both ids or it cannot dial. */
export const VOICE_VARIABLES = [
  "ELEVENLABS_AGENT_ID",
  "ELEVENLABS_PHONE_NUMBER_ID",
] as const;

/** Every variable name in `.env.example`, in the order the file lists them. */
export function parseEnvTemplate(template: string): string[] {
  return template
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "" && !line.startsWith("#"))
    .map((line) => line.split("=")[0]?.trim() ?? "")
    .filter((key) => key !== "");
}

function envValue(
  env: Readonly<Record<string, string | undefined>>,
  name: string,
): string | undefined {
  const value = env[name];
  return value === undefined || value === "" ? undefined : value;
}

/**
 * One line per variable in `.env.example`, with the demo path's own variables
 * saying what breaks without them. The two ElevenLabs ids answer one question,
 * so they are one line.
 */
export function checkEnv(input: {
  template?: string;
  envFilePresent: boolean;
  env: Readonly<Record<string, string | undefined>>;
}): Check[] {
  const { template, envFilePresent, env } = input;
  if (template === undefined) {
    return [
      {
        name: "env template",
        status: "warn",
        detail: ".env.example is missing, cannot tell which variables matter",
      },
    ];
  }

  const checks: Check[] = [
    {
      name: ".env",
      status: envFilePresent ? "ok" : "warn",
      detail: envFilePresent
        ? "present, bun loads it automatically"
        : "missing, run: cp .env.example .env",
    },
  ];

  const voice = new Set<string>(VOICE_VARIABLES);
  let voiceReported = false;

  for (const name of parseEnvTemplate(template)) {
    if (voice.has(name)) {
      if (voiceReported) {
        continue;
      }
      voiceReported = true;
      const missing = VOICE_VARIABLES.filter(
        (id) => envValue(env, id) === undefined,
      );
      checks.push({
        name: "env voice ids",
        status: missing.length === 0 ? "ok" : "warn",
        detail:
          missing.length === 0
            ? `${VOICE_VARIABLES.join(" and ")} are set, apps/api dials with them`
            : `${listNames(missing)} empty, read by apps/api: without both ids the verification call cannot dial and degrades to the script. Run: bun run voice-setup`,
      });
      continue;
    }

    const value = envValue(env, name);
    const variable = DEMO_VARIABLES[name];
    if (value !== undefined) {
      checks.push({
        name: `env ${name}`,
        status: "ok",
        detail:
          variable === undefined
            ? `set, ${plural(value.length, "character")}`
            : `set, ${plural(value.length, "character")}, read by ${variable.readers}`,
      });
      continue;
    }
    checks.push({
      name: `env ${name}`,
      status: variable === undefined ? "ok" : "warn",
      detail:
        variable === undefined
          ? "empty, and the demo path does not depend on it"
          : `empty, read by ${variable.readers}: ${variable.consequence}`,
    });
  }

  return checks;
}

/* -------------------------------------------------------------------------- */
/* 3. the SAT list snapshot                                                    */
/* -------------------------------------------------------------------------- */

/** The list changes, so a download this old is reported rather than trusted. */
export const SNAPSHOT_STALE_AFTER_DAYS = 30;

/** What the snapshot says about itself, read from what @hackmty/sat exports. */
export interface SatSnapshotFacts {
  filename: string;
  listVersion: string;
  /** "YYYY-MM-DD", the day the file was downloaded. */
  retrievedAt: string;
  sourceUrl: string;
  /** Data rows in the file. */
  rows: number;
  /** Distinct taxpayers the loader could read. */
  taxpayers: number;
  /** Dated situations, which is more than one per taxpayer. */
  situations: number;
}

export function checkSatSnapshot(input: {
  facts?: SatSnapshotFacts;
  error?: string;
  /** "YYYY-MM-DD". Injected so the staleness rule is testable. */
  today: string;
}): Check {
  const { facts, error, today } = input;
  if (facts === undefined) {
    return {
      name: "sat snapshot",
      status: "warn",
      detail: `missing or unreadable (${error ?? "no file"}), so GET /api/v1/sat/lookup cannot answer a real RFC. Download it again: packages/sat/src/snapshot/README.md, Refreshing the snapshot`,
    };
  }

  const age = daysBetween(facts.retrievedAt, today);
  const body = `${facts.filename}, list version ${facts.listVersion}, retrieved ${facts.retrievedAt}, ${facts.rows} rows, ${facts.taxpayers} taxpayers, ${facts.situations} dated situations, from ${facts.sourceUrl}`;

  if (Number.isFinite(age) && age > SNAPSHOT_STALE_AFTER_DAYS) {
    return {
      name: "sat snapshot",
      status: "warn",
      detail: `${body}. That is ${plural(age, "day")} old and the SAT republishes the list, so refresh it: packages/sat/src/snapshot/README.md, Refreshing the snapshot`,
    };
  }

  return {
    name: "sat snapshot",
    status: "ok",
    detail: `${body}, ${plural(Number.isFinite(age) ? age : 0, "day")} old`,
  };
}

/** What the closing line needs to know about the snapshot. */
export interface OfflineSatSnapshot {
  /** The file is on disk and the loader parsed it. */
  readable: boolean;
  /** Whole days since the download, absent when the file is not readable. */
  ageDays?: number;
}

/**
 * The snapshot as the offline line sees it, which is not its status.
 *
 * `checkSatSnapshot` is tri-state: green, amber because the download is old,
 * amber because there is no download at all. Only the last of those stops a
 * demo. A snapshot that parses answers `GET /api/v1/sat/lookup` with the
 * network unplugged whether it was downloaded this morning or last month, so
 * age is a word on the closing line and never the verdict.
 */
export function offlineSatSnapshot(input: {
  facts?: SatSnapshotFacts;
  today: string;
}): OfflineSatSnapshot {
  if (input.facts === undefined) {
    return { readable: false };
  }
  const age = daysBetween(input.facts.retrievedAt, input.today);
  return { readable: true, ageDays: Number.isFinite(age) ? age : undefined };
}

/* -------------------------------------------------------------------------- */
/* 4. the CEP fixture                                                          */
/* -------------------------------------------------------------------------- */

/** The part of a parsed CEP this check reports. */
export interface CepFacts {
  claveRastreo: string;
  amount: number;
  beneficiaryAccount: string;
  synthetic: boolean;
  signatureValid: boolean;
  signatureReason?: string;
}

async function readTextFile(path: string): Promise<string | undefined> {
  const file = Bun.file(path);
  return (await file.exists()) ? file.text() : undefined;
}

async function parseCepFacts(xml: string): Promise<CepFacts> {
  const { parseCep } = await import("../../packages/cep/src/index.ts");
  const cep = parseCep(xml, { synthetic: true });
  return {
    claveRastreo: cep.claveRastreo,
    amount: cep.amount,
    beneficiaryAccount: cep.beneficiaryAccount,
    synthetic: cep.synthetic,
    signatureValid: cep.signatureValid,
    signatureReason: cep.signatureReason,
  };
}

/**
 * The committed synthetic CEP: present, and still parseable by the parser the
 * product uses. The signature is reported as not checked and never as valid,
 * which is the same sentence beat 4 of `bun run demo` asserts.
 */
export async function checkCepFixture(input: {
  path: string;
  readText?: (path: string) => Promise<string | undefined>;
  parse?: (xml: string) => Promise<CepFacts>;
}): Promise<Check> {
  const read = input.readText ?? readTextFile;
  const parse = input.parse ?? parseCepFacts;

  const xml = await read(input.path);
  if (xml === undefined) {
    return {
      name: "cep fixture",
      status: "warn",
      detail: `missing at ${input.path}, so the CEP beat of bun run demo cannot run`,
    };
  }

  try {
    const cep = await parse(xml);
    return {
      name: "cep fixture",
      status: "ok",
      detail: `clave de rastreo ${cep.claveRastreo}, ${cep.amount.toFixed(2)} MXN to ${cep.beneficiaryAccount}, synthetic ${cep.synthetic}, signature reported and not checked (${cep.signatureReason ?? "no reason given"})`,
    };
  } catch (cause) {
    return {
      name: "cep fixture",
      status: "warn",
      detail: `present but unparseable: ${messageOf(cause)}`,
    };
  }
}

async function listDirectory(directory: string): Promise<string[]> {
  try {
    const { readdir } = await import("node:fs/promises");
    return (await readdir(directory)).filter((name) => !name.startsWith("."));
  } catch {
    return [];
  }
}

/**
 * The real CEP is gitignored (issue #57) and its absence is normal on a fresh
 * clone, so this warns rather than failing and says which issue lands it.
 */
export async function checkRealCep(input: {
  directory: string;
  list?: (directory: string) => Promise<string[]>;
}): Promise<Check> {
  const list = input.list ?? listDirectory;
  const files = await list(input.directory);
  if (files.length === 0) {
    return {
      name: "cep real",
      status: "warn",
      detail:
        "absent, issue #57. Until a real CEP and the Banxico certificate are here, the signature scheme stays unconfirmed and the product says so",
    };
  }
  return {
    name: "cep real",
    status: "ok",
    detail: `${plural(files.length, "file")} in ${input.directory} (gitignored): ${listNames(files)}`,
  };
}

/* -------------------------------------------------------------------------- */
/* 5. the database                                                             */
/* -------------------------------------------------------------------------- */

export interface AppliedMigration {
  filename: string;
  checksum: string;
}

/**
 * `schema_migrations` against the MIGRATIONS table in packages/db.
 *
 * A Timescale-only file missing on a plain Postgres host is the offline
 * fallback working as designed, so it is named and left green. A plain file
 * missing is a warning, and so is a file whose text changed after it was
 * applied, because that is four laptops quietly diverging.
 */
export function checkMigrations(input: {
  migrations: readonly MigrationSpec[];
  applied: readonly AppliedMigration[];
  /** Current fingerprint per file. Absent entries are simply not compared. */
  checksums?: Readonly<Record<string, string>>;
  timescale: boolean;
}): Check {
  const { migrations, applied, timescale } = input;
  const checksums = input.checksums ?? {};
  const appliedByFile = new Map(
    applied.map((row) => [row.filename, row.checksum]),
  );

  const present = migrations.filter((spec) => appliedByFile.has(spec.file));
  const missing = migrations.filter((spec) => !appliedByFile.has(spec.file));
  const expectedSkips = missing.filter(
    (spec) => spec.requiresTimescale && !timescale,
  );
  const trulyMissing = missing.filter(
    (spec) => !(spec.requiresTimescale && !timescale),
  );
  const changed = migrations.filter((spec) => {
    const previous = appliedByFile.get(spec.file);
    const current = checksums[spec.file];
    return (
      previous !== undefined && current !== undefined && previous !== current
    );
  });

  const parts = [`${present.length} of ${migrations.length} applied`];
  if (expectedSkips.length > 0) {
    parts.push(
      `${listNames(expectedSkips.map((spec) => spec.file))} ${expectedSkips.length === 1 ? "needs" : "need"} timescaledb and this host has none, which is the plain Postgres path working as designed`,
    );
  }
  if (trulyMissing.length > 0) {
    parts.push(
      `missing ${listNames(trulyMissing.map((spec) => spec.file))}, run: bun run migrate`,
    );
  }
  if (changed.length > 0) {
    parts.push(
      `${listNames(changed.map((spec) => spec.file))} changed since it was applied, add a new migration instead of editing one`,
    );
  }

  return {
    name: "migrations",
    status: trulyMissing.length > 0 || changed.length > 0 ? "warn" : "ok",
    detail: parts.join(". "),
  };
}

/** Everything the database check touches, so a test can hand over its own. */
export interface DatabaseDeps {
  createSql(url: string): Sql;
  probe(sql: Sql, timeoutMs: number): Promise<ProbeResult>;
  hasTimescale(sql: Sql): Promise<boolean>;
  isHypertable(sql: Sql): Promise<boolean>;
  appliedMigrations(sql: Sql): Promise<AppliedMigration[]>;
  migrations: readonly MigrationSpec[];
  /** Current fingerprint per migration file, read from disk. */
  checksums(): Promise<Record<string, string>>;
  countCeptinela(sql: Sql): Promise<CeptinelaCounts>;
  countLedgerTx(sql: Sql): Promise<number>;
  latestOccurredAt(sql: Sql): Promise<string | undefined>;
  close(sql: Sql): Promise<void>;
}

/** The real dependencies, imported lazily so a test never loads the driver. */
export async function defaultDatabaseDeps(): Promise<DatabaseDeps> {
  const db = await import("../../packages/db/src/index.ts");
  const queries = await import("../../packages/db/src/queries.ts");
  const migrate = await import("../../packages/db/src/migrate.ts");

  return {
    createSql: (url) => db.createSql(url),
    probe: (sql, timeoutMs) => db.probe(sql, timeoutMs),
    hasTimescale: (sql) => db.hasTimescale(sql),
    isHypertable: (sql) => db.isHypertable(sql),
    appliedMigrations: async (sql) => {
      const rows = await sql<AppliedMigration[]>`
        select filename, checksum from schema_migrations
      `;
      return [...rows];
    },
    migrations: migrate.MIGRATIONS,
    checksums: async () => {
      const entries: Record<string, string> = {};
      for (const spec of migrate.MIGRATIONS) {
        const file = Bun.file(`${migrate.MIGRATIONS_DIR}/${spec.file}`);
        if (await file.exists()) {
          entries[spec.file] = migrate.fingerprint(await file.text());
        }
      }
      return entries;
    },
    countCeptinela: (sql) => queries.countCeptinela(sql),
    countLedgerTx: (sql) => queries.countLedgerTx(sql),
    latestOccurredAt: (sql) => queries.latestOccurredAt(sql),
    close: (sql) => sql.end({ timeout: 1 }),
  };
}

/** Printed when the probe failed and said nothing about why. */
export const NO_LISTENER_REASON =
  "nothing is listening on that port; start Postgres or fix the port";

/**
 * Why the probe failed, in a sentence that is never empty.
 *
 * The most common database failure of all is a Postgres that is not running,
 * and on ECONNREFUSED postgres.js raises an `AggregateError` whose message is
 * the empty string. `probe` copies that empty string into `ProbeResult.error`,
 * so `error ?? "unknown error"` never fires and the line would end in a colon
 * and nothing. An empty message is treated as no message.
 */
export function probeReason(probe: ProbeResult): string {
  const message = probe.error?.trim() ?? "";
  return message === "" ? NO_LISTENER_REASON : message;
}

/**
 * Reachability, which path is live, what is migrated, and what is in the
 * tables. Bounded at every step: a database that is down costs two seconds and
 * one that answers `select 1` and then stalls costs four more, never the demo.
 */
export async function checkDatabase(
  url: string,
  deps: DatabaseDeps,
): Promise<Check[]> {
  const checks: Check[] = [];
  const where = redactUrl(url);
  let sql: Sql | undefined;

  try {
    sql = deps.createSql(url);
    const probe = await deps.probe(sql, DB_PROBE_TIMEOUT_MS);
    if (!probe.ok) {
      return [
        {
          name: DATABASE_CHECK,
          status: "warn",
          detail: `${where} unreachable: ${probeReason(probe)}`,
        },
      ];
    }
    checks.push({
      name: DATABASE_CHECK,
      status: "ok",
      detail: `${where} answered in ${probe.ms}ms`,
    });

    let timescale = false;
    try {
      timescale = await withTimeout(
        deps.hasTimescale(sql),
        DB_QUERY_TIMEOUT_MS,
        "pg_available_extensions",
      );
      const hypertable = timescale
        ? await withTimeout(
            deps.isHypertable(sql),
            DB_QUERY_TIMEOUT_MS,
            "timescaledb_information.hypertables",
          )
        : false;
      checks.push({
        name: "timeseries path",
        status: "ok",
        detail: timescale
          ? hypertable
            ? "timescaledb installed and ledger_tx is a hypertable"
            : "timescaledb available but ledger_tx is a plain table, run: bun run migrate"
          : "plain Postgres, the offline fallback path is live",
      });
    } catch (cause) {
      checks.push({
        name: "timeseries path",
        status: "warn",
        detail: messageOf(cause),
      });
    }

    try {
      const [applied, checksums] = await Promise.all([
        withTimeout(
          deps.appliedMigrations(sql),
          DB_QUERY_TIMEOUT_MS,
          "schema_migrations",
        ),
        deps.checksums(),
      ]);
      checks.push(
        checkMigrations({
          migrations: deps.migrations,
          applied,
          checksums,
          timescale,
        }),
      );
    } catch (cause) {
      checks.push({
        name: "migrations",
        status: "warn",
        detail: `schema_migrations is not readable (${messageOf(cause)}), run: bun run migrate`,
      });
    }

    try {
      const counts = await withTimeout(
        deps.countCeptinela(sql),
        DB_QUERY_TIMEOUT_MS,
        "the Ceptinela counts",
      );
      const populated =
        counts.suppliers +
          counts.cfdis +
          counts.instructions +
          counts.findings +
          counts.decisions +
          counts.events >
        0;
      checks.push({
        name: CEPTINELA_CHECK,
        status: populated ? "ok" : "warn",
        detail: populated
          ? `${counts.suppliers} suppliers, ${counts.cfdis} cfdis, ${counts.instructions} instructions, ${counts.findings} findings, ${counts.decisions} decisions, ${counts.events} events`
          : "empty, run: bun run seed",
        tables: populated ? "populated" : "empty",
      });
    } catch (cause) {
      // The count query names every Ceptinela table, so a failure here is
      // overwhelmingly an unmigrated database rather than an empty one.
      checks.push({
        name: CEPTINELA_CHECK,
        status: "warn",
        detail: `not queryable yet (${messageOf(cause)}), run: bun run migrate`,
        tables: "missing",
      });
    }

    try {
      const rows = await withTimeout(
        deps.countLedgerTx(sql),
        DB_QUERY_TIMEOUT_MS,
        "the bank mirror count",
      );
      const latest =
        rows > 0
          ? await withTimeout(
              deps.latestOccurredAt(sql),
              DB_QUERY_TIMEOUT_MS,
              "the newest bank mirror row",
            )
          : undefined;
      checks.push({
        name: "ledger_tx",
        status: rows > 0 ? "ok" : "warn",
        detail:
          rows > 0
            ? `${plural(rows, "row")} in the bank mirror, newest ${latest ?? "unknown"}`
            : "empty, run: bun run seed",
      });
    } catch (cause) {
      checks.push({
        name: "ledger_tx",
        status: "warn",
        detail: `not queryable yet (${messageOf(cause)}), run: bun run migrate`,
      });
    }
  } catch (cause) {
    checks.push({
      name: DATABASE_CHECK,
      status: "warn",
      detail: `${where}: ${messageOf(cause)}`,
    });
  } finally {
    if (sql !== undefined) {
      await deps.close(sql).catch(() => undefined);
    }
  }

  return checks;
}

/** True when the database answered, read back off the table by the last line. */
export function isReachable(checks: readonly Check[]): boolean {
  return checks.some(
    (check) => check.name === DATABASE_CHECK && check.status === "ok",
  );
}

/**
 * What the Ceptinela tables are, read back off the line the table printed.
 *
 * Not a boolean: the closing line has to send a person to `bun run migrate` or
 * to `bun run seed`, and telling someone with no tables at all to seed them is
 * telling them to run a command that cannot work.
 */
export function ceptinelaTables(checks: readonly Check[]): CeptinelaTables {
  const check = checks.find((candidate) => candidate.name === CEPTINELA_CHECK);
  return check?.tables ?? "missing";
}

/* -------------------------------------------------------------------------- */
/* 6. Nessie                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * One read, and an honest sentence about what a read proves: nothing about the
 * key. An invalid key answers `200 []` on a read, so only a write tells the
 * truth, and the write validation is issue #45. This check does not write.
 */
export async function checkNessie(input: {
  apiKey?: string;
  list?: () => Promise<unknown[]>;
  timeoutMs?: number;
}): Promise<Check> {
  const { apiKey } = input;
  if (apiKey === undefined || apiKey === "") {
    return {
      name: "nessie",
      status: "warn",
      detail: "NESSIE_API_KEY is not set, skipped",
    };
  }

  const timeoutMs = input.timeoutMs ?? NESSIE_TIMEOUT_MS;
  const nessie = await import("../../packages/nessie/src/client.ts");
  const list =
    input.list ??
    (() => {
      const client = new nessie.NessieClient({
        apiKey,
        timeoutMs,
        maxRetries: 0,
      });
      return client.listAccounts();
    });

  const started = Date.now();
  try {
    const accounts = await list();
    return {
      name: "nessie",
      status: "ok",
      detail: `GET /accounts returned ${plural(accounts.length, "account")} in ${Date.now() - started}ms. A read proves reachability and not the key: an invalid key answers 200 [] on reads, and the write that would prove it is issue #45`,
    };
  } catch (cause) {
    if (cause instanceof nessie.NessiePathError) {
      return {
        name: "nessie",
        status: "warn",
        detail:
          "403 Missing Authentication Token, which means a wrong path, not a bad key",
      };
    }
    return { name: "nessie", status: "warn", detail: messageOf(cause) };
  }
}

/* -------------------------------------------------------------------------- */
/* 7. seed state                                                               */
/* -------------------------------------------------------------------------- */

interface CeptinelaSeedState {
  seed?: number;
  weekOf?: string;
  runId?: string;
  heroInstructionIds?: string[];
}

interface LedgerSeedState {
  heroAccountId?: string;
  window?: { from?: string; to?: string };
}

async function readJsonFile(path: string): Promise<unknown> {
  const file = Bun.file(path);
  return (await file.exists()) ? file.json() : undefined;
}

/** What `bun run seed` left behind, which is what the printed card was made from. */
export async function checkSeedState(input: {
  root: string;
  readJson?: (path: string) => Promise<unknown>;
}): Promise<Check[]> {
  const readJson = input.readJson ?? readJsonFile;
  const checks: Check[] = [];

  try {
    const state = (await readJson(`${input.root}/.seed/ceptinela.json`)) as
      | CeptinelaSeedState
      | undefined;
    checks.push(
      state === undefined
        ? {
            name: "seed ceptinela",
            status: "warn",
            detail: "no .seed/ceptinela.json yet, run: bun run seed",
          }
        : {
            name: "seed ceptinela",
            status: "ok",
            detail: `seed ${state.seed ?? "unknown"}, week of ${state.weekOf ?? "unknown"}, run ${state.runId ?? "unknown"}, hero ${listNames(state.heroInstructionIds ?? []) || "none recorded"}`,
          },
    );
  } catch (cause) {
    checks.push({
      name: "seed ceptinela",
      status: "warn",
      detail: `.seed/ceptinela.json is unreadable (${messageOf(cause)}), run: bun run seed --force`,
    });
  }

  try {
    const state = (await readJson(`${input.root}/.seed/ids.json`)) as
      | LedgerSeedState
      | undefined;
    checks.push(
      state === undefined
        ? {
            name: "seed ledger",
            status: "warn",
            detail: "no .seed/ids.json yet, run: bun run seed",
          }
        : {
            name: "seed ledger",
            status: "ok",
            detail: `.seed/ids.json present, hero account ${state.heroAccountId ?? "unknown"}, window ${state.window?.from ?? "?"} to ${state.window?.to ?? "?"}`,
          },
    );
  } catch (cause) {
    checks.push({
      name: "seed ledger",
      status: "warn",
      detail: `.seed/ids.json is unreadable (${messageOf(cause)}), run: bun run seed --force`,
    });
  }

  return checks;
}

/* -------------------------------------------------------------------------- */
/* 8. offline readiness                                                        */
/* -------------------------------------------------------------------------- */

export interface OfflineInputs {
  databaseUrl?: string;
  databaseReachable: boolean;
  tables: CeptinelaTables;
  satSnapshot: OfflineSatSnapshot;
  cepFixture: boolean;
}

/**
 * The question the pre-demo checklist actually asks: if the conference network
 * dies right now, does this laptop still show the product? Four inputs, and the
 * line names whichever one is missing.
 *
 * Two rules that are the whole point of this line being computed rather than
 * copied off the table. Only a thing that stops the demo may flip the verdict,
 * so a snapshot that is merely old is a clause after the verdict and not a
 * reason against it. And every reason carries the command that fixes it, which
 * means telling an unmigrated database from a merely empty one.
 */
export function checkOfflineDemo(input: OfflineInputs): Check {
  const missing: string[] = [];
  const notes: string[] = [];
  let database = true;
  if (input.databaseUrl === undefined || input.databaseUrl === "") {
    missing.push("DATABASE_URL is not set");
    database = false;
  } else if (!isLocalDatabase(input.databaseUrl)) {
    missing.push(
      `DATABASE_URL points at ${redactUrl(input.databaseUrl)}, which needs a network`,
    );
    database = false;
  } else if (!input.databaseReachable) {
    missing.push("the local database did not answer");
    database = false;
  }
  // Only worth saying once there is a database to be empty. "Not set" and
  // "empty" on the same line reads as two problems where there is one.
  if (database && input.tables !== "populated") {
    missing.push(
      input.tables === "missing"
        ? "the Ceptinela tables do not exist, run: bun run migrate"
        : "the Ceptinela tables are empty, run: bun run seed",
    );
  }
  const age = input.satSnapshot.ageDays;
  if (!input.satSnapshot.readable) {
    missing.push("the SAT list snapshot is not readable");
  } else if (age !== undefined && age > SNAPSHOT_STALE_AFTER_DAYS) {
    notes.push(
      `the SAT list snapshot is readable, ${plural(age, "day")} old, so it answers offline and the table says to refresh it`,
    );
  }
  if (!input.cepFixture) {
    missing.push("the CEP fixture is not readable");
  }

  const verdict =
    missing.length === 0
      ? "ready, this laptop can run the demo with the network unplugged"
      : `not ready: ${missing.join("; ")}`;

  return {
    name: "offline demo",
    status: missing.length === 0 ? "ok" : "warn",
    detail: [verdict, ...notes].join("; "),
  };
}

/* -------------------------------------------------------------------------- */
/* Exit code                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * The contract. A bun mismatch is the only thing that fails the plain command,
 * because a teammate writing documentation on a train legitimately has no
 * database and no key, and a doctor that fails for them is a doctor nobody
 * runs. `--strict` is the other audience: the release gate and CI, where a
 * warning is a missing precondition and not a shrug.
 */
export function exitCode(checks: readonly Check[], strict: boolean): number {
  if (checks.some((check) => check.status === "fail")) {
    return 1;
  }
  if (strict && checks.some((check) => check.status === "warn")) {
    return 1;
  }
  return 0;
}
