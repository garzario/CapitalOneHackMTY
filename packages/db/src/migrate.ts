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
 *    continuous option. The splitter respects quoted strings and dollar-quoted
 *    bodies, so a plpgsql function is one statement and not two halves.
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
export const CEPTINELA_DRIFT_MIGRATION = "0005_ceptinela_drift.sql";
export const COMPANY_MIGRATION = "0006_company.sql";

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
  { file: CEPTINELA_DRIFT_MIGRATION, requiresTimescale: false },
  { file: COMPANY_MIGRATION, requiresTimescale: false },
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
 * Whole-line `--` comments are dropped and the rest is split on semicolons that
 * sit outside a string. Three kinds of string are respected, because a
 * semicolon inside any of them is text and not a statement boundary: a
 * single-quoted literal (`'a;b'`, with `''` as the escape), a double-quoted
 * identifier, and a dollar-quoted body (`$$ ... $$` or `$tag$ ... $tag$`). The
 * last one is what lets 0005 carry the plpgsql trigger that keeps the event
 * ledger append-only on a hypertable, where a rule is refused.
 *
 * Inline `--` comments after code on the same line are left alone rather than
 * stripped, so a `--` inside a literal is never mistaken for one.
 */
export function splitSqlStatements(sql: string): string[] {
  const withoutComments = sql
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n");

  const statements: string[] = [];
  let current = "";
  let index = 0;
  while (index < withoutComments.length) {
    const char = withoutComments[index] as string;

    if (char === "'" || char === '"') {
      const end = closingQuote(withoutComments, index, char);
      current += withoutComments.slice(index, end);
      index = end;
      continue;
    }

    const tag = dollarTagAt(withoutComments, index);
    if (tag !== undefined) {
      const close = withoutComments.indexOf(tag, index + tag.length);
      const end = close === -1 ? withoutComments.length : close + tag.length;
      current += withoutComments.slice(index, end);
      index = end;
      continue;
    }

    if (char === ";") {
      statements.push(current);
      current = "";
      index += 1;
      continue;
    }

    current += char;
    index += 1;
  }
  statements.push(current);

  return statements
    .map((statement) => statement.trim())
    .filter((statement) => statement !== "");
}

/** Index just past the quote that closes the one at `start`, doubling respected. */
function closingQuote(text: string, start: number, quote: string): number {
  let index = start + 1;
  while (index < text.length) {
    if (text[index] === quote) {
      if (text[index + 1] === quote) {
        index += 2;
        continue;
      }
      return index + 1;
    }
    index += 1;
  }
  return text.length;
}

/** The dollar-quote tag starting at `index` (`$$` or `$tag$`), or undefined. */
function dollarTagAt(text: string, index: number): string | undefined {
  if (text[index] !== "$") {
    return undefined;
  }
  const match = /^\$[A-Za-z_][A-Za-z0-9_]*\$|^\$\$/.exec(text.slice(index));
  return match === null ? undefined : match[0];
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
