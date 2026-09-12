/**
 * The migration runner.
 *
 * Four decisions, each with a reason:
 *
 * 1. **Plain files always, Timescale files only when the extension exists.** The
 *    order and the condition live in the MIGRATIONS table below. A continuous aggregate
 *    cannot be created without timescaledb, and `create_hypertable` does not exist on
 *    a plain Postgres, so the Timescale DDL is a separate file that is skipped rather
 *    than guarded inline. That is what keeps the local PostgreSQL 18 fallback alive.
 * 2. **No transaction wrapper.** A continuous aggregate cannot be created inside a
 *    transaction block, so statements are sent one at a time and a partial failure is
 *    reported rather than hidden. Re-running is safe: every statement in 0001 is
 *    `if not exists`, and schema_migrations stops 0002 from running twice, which
 *    matters because `create materialized view` has no `if not exists` form with the
 *    continuous option.
 * 3. **Applied files are tracked with a checksum**, so an edited migration is reported
 *    instead of silently diverging between four laptops.
 * 4. **This file is bun-only on purpose.** It reads from disk through Bun.file and is
 *    reached through `bun run migrate`. index.ts and queries.ts stay runtime-neutral
 *    so apps/api can import them on whatever ADR-0005 picks.
 */

import type { Sql } from "./index";

export const INIT_MIGRATION = "0001_init.sql";
export const TIMESCALE_MIGRATION = "0002_timescale.sql";
export const CEPTINELA_MIGRATION = "0003_ceptinela.sql";
export const CEPTINELA_TIMESCALE_MIGRATION = "0004_timescale_ceptinela.sql";

/** Resolved from this file, so the runner works from any working directory. */
export const MIGRATIONS_DIR = `${import.meta.dir}/../migrations`;

export interface MigrationSpec {
  file: string;
  /** Skipped on a server without timescaledb, which is the offline fallback. */
  requiresTimescale: boolean;
}

/**
 * The migrations, in the order they are applied. Listed rather than discovered by
 * reading the directory, so adding a file is a deliberate one-line change that shows
 * up in a diff and cannot be triggered by a stray .sql left in the folder.
 *
 * The plain files run first and the Timescale ones after, so a fresh database is
 * fully usable even when the extension is missing halfway through.
 */
export const MIGRATIONS: readonly MigrationSpec[] = [
  { file: INIT_MIGRATION, requiresTimescale: false },
  { file: CEPTINELA_MIGRATION, requiresTimescale: false },
  { file: TIMESCALE_MIGRATION, requiresTimescale: true },
  { file: CEPTINELA_TIMESCALE_MIGRATION, requiresTimescale: true },
];

export interface MigrationResult {
  file: string;
  status: "applied" | "already-applied" | "skipped";
  /** Why it was skipped, or what looks wrong about an already-applied file. */
  reason?: string;
  statements?: number;
}

export interface MigrateOptions {
  migrationsDir?: string;
}

/**
 * Splits a migration into statements.
 *
 * Whole-line `--` comments are dropped and the rest is split on semicolons. Inline
 * comments are left alone rather than stripped, because stripping them correctly
 * means parsing string literals, and neither migration in this repo has one.
 */
export function splitSqlStatements(sql: string): string[] {
  const withoutComments = sql
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n");

  return withoutComments
    .split(";")
    .map((statement) => statement.trim())
    .filter((statement) => statement !== "");
}

/**
 * A short non-cryptographic fingerprint (FNV-1a, 32 bits) of a migration's text.
 * It answers one question: has this file changed since it was applied.
 */
export function fingerprint(text: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

async function ensureMigrationsTable(sql: Sql): Promise<void> {
  await sql`
    create table if not exists schema_migrations (
      filename   text primary key,
      checksum   text not null,
      applied_at timestamptz not null default now()
    )
  `;
}

async function appliedFiles(sql: Sql): Promise<Map<string, string>> {
  const rows = await sql<{ filename: string; checksum: string }[]>`
    select filename, checksum from schema_migrations
  `;
  return new Map(rows.map((row) => [row.filename, row.checksum]));
}

async function timescaleAvailable(sql: Sql): Promise<boolean> {
  const rows = await sql<{ name: string }[]>`
    select name from pg_available_extensions where name = 'timescaledb'
  `;
  return rows.length > 0;
}

async function applyFile(
  sql: Sql,
  directory: string,
  file: string,
  applied: ReadonlyMap<string, string>,
): Promise<MigrationResult> {
  const text = await Bun.file(`${directory}/${file}`).text();
  const checksum = fingerprint(text);
  const previous = applied.get(file);

  if (previous !== undefined) {
    if (previous === checksum) {
      return { file, status: "already-applied" };
    }
    return {
      file,
      status: "already-applied",
      reason: `the file changed since it was applied (${previous} then ${checksum}). Add a new migration instead of editing this one.`,
    };
  }

  const statements = splitSqlStatements(text);
  for (const statement of statements) {
    await sql.unsafe(statement);
  }
  await sql`
    insert into schema_migrations (filename, checksum)
    values (${file}, ${checksum})
    on conflict (filename) do nothing
  `;

  return { file, status: "applied", statements: statements.length };
}

/**
 * Applies the migrations in order and reports what happened to each one. Safe to run
 * repeatedly, which is what `bun run migrate` relies on.
 */
export async function migrate(
  sql: Sql,
  options: MigrateOptions = {},
): Promise<MigrationResult[]> {
  const directory = options.migrationsDir ?? MIGRATIONS_DIR;
  await ensureMigrationsTable(sql);
  const applied = await appliedFiles(sql);
  const hasTimescale = await timescaleAvailable(sql);
  const results: MigrationResult[] = [];

  for (const spec of MIGRATIONS) {
    if (spec.requiresTimescale && !hasTimescale) {
      results.push({
        file: spec.file,
        status: "skipped",
        reason:
          "timescaledb is not available on this server, so the plain Postgres path is live. Same SQL, no hypertable and no continuous aggregate.",
      });
      continue;
    }
    results.push(await applyFile(sql, directory, spec.file, applied));
  }

  return results;
}
