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
 * 4. **A renamed file is followed, not re-run.** RENAMED_MIGRATIONS below maps the
 *    old filename to the new one and migrate() rewrites the schema_migrations row
 *    before anything is applied. See the comment on that table for why re-running
 *    is not an option.
 * 5. **This file is bun-only on purpose.** It reads from disk through Bun.file and is
 *    reached through `bun run migrate`. index.ts and queries.ts stay runtime-neutral
 *    so apps/api can import them on whatever ADR-0005 picks.
 */

import type { Sql } from "./index";

export const INIT_MIGRATION = "0001_init.sql";
export const TIMESCALE_MIGRATION = "0002_timescale.sql";
export const SENTRYONE_MIGRATION = "0003_sentryone.sql";
export const SENTRYONE_TIMESCALE_MIGRATION = "0004_timescale_sentryone.sql";
export const SENTRYONE_DRIFT_MIGRATION = "0005_sentryone_drift.sql";
export const COMPANY_MIGRATION = "0006_company.sql";
export const SUPPLIER_OUTFLOW_MIGRATION = "0007_supplier_outflow.sql";
export const SUPPLIER_OUTFLOW_TIMESCALE_MIGRATION =
  "0008_timescale_supplier_outflow.sql";
export const CONSORTIUM_SNAPSHOT_MIGRATION = "0009_consortium_snapshot.sql";
export const RAIL_EVENTS_MIGRATION = "0010_rail_events.sql";
export const DECISION_REASON_MIGRATION = "0011_decision_reason.sql";
export const ASSISTANT_PAYMENT_EVENTS_MIGRATION =
  "0012_assistant_and_payment_events.sql";
export const DECISION_ACTOR_ROLE_MIGRATION = "0013_decision_actor_role.sql";
export const CFDI_ISSUE_PLACE_MIGRATION = "0014_cfdi_issue_place.sql";

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
  { file: SENTRYONE_MIGRATION, requiresTimescale: false },
  { file: SENTRYONE_DRIFT_MIGRATION, requiresTimescale: false },
  { file: COMPANY_MIGRATION, requiresTimescale: false },
  { file: SUPPLIER_OUTFLOW_MIGRATION, requiresTimescale: false },
  { file: CONSORTIUM_SNAPSHOT_MIGRATION, requiresTimescale: false },
  { file: RAIL_EVENTS_MIGRATION, requiresTimescale: false },
  { file: DECISION_REASON_MIGRATION, requiresTimescale: false },
  { file: ASSISTANT_PAYMENT_EVENTS_MIGRATION, requiresTimescale: false },
  { file: DECISION_ACTOR_ROLE_MIGRATION, requiresTimescale: false },
  { file: CFDI_ISSUE_PLACE_MIGRATION, requiresTimescale: false },
  { file: TIMESCALE_MIGRATION, requiresTimescale: true },
  { file: SENTRYONE_TIMESCALE_MIGRATION, requiresTimescale: true },
  { file: SUPPLIER_OUTFLOW_TIMESCALE_MIGRATION, requiresTimescale: true },
];

/**
 * Files that were renamed after they had already been applied somewhere.
 *
 * A rename is not a change in effect: the SQL in `to` does exactly what the SQL in
 * `from` did, only the product name in the filename and the comments moved. But a
 * host that applied `from` records `from` in schema_migrations, so the runner sees
 * `to` as never applied and sends the whole file again. That is not safe. 0003
 * recreates the append-only rules on `ledger_events`, and 0004 turns that table into
 * a hypertable: Timescale refuses rules on a hypertable, so the second run fails on
 * the managed service and `bun run migrate` stops working there. On a plain Postgres
 * the re-run is silent but still wrong, because the same schema then sits under two
 * filenames in schema_migrations and doctor counts it twice.
 *
 * So a rename is reconciled, never re-run: the recorded row is moved to the new name
 * and given the new file's checksum. Add a pair here whenever a migration is renamed.
 */
export const RENAMED_MIGRATIONS: readonly { from: string; to: string }[] = [
  { from: "0003_ceptinela.sql", to: SENTRYONE_MIGRATION },
  { from: "0004_timescale_ceptinela.sql", to: SENTRYONE_TIMESCALE_MIGRATION },
  { from: "0005_ceptinela_drift.sql", to: SENTRYONE_DRIFT_MIGRATION },
];

export interface MigrationResult {
  file: string;
  status: "applied" | "already-applied" | "renamed" | "skipped";
  /** Why it was skipped or renamed, or what looks wrong about an applied file. */
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
 * Moves the schema_migrations rows of renamed files onto their new names, before a
 * single statement is applied, and reports one result per pair it touched.
 *
 * Three cases, and only the first two do anything. Old name recorded and new one
 * not: the row is rewritten to the new filename with the new file's checksum, so the
 * "file changed since it was applied" warning stays meaningful afterwards. Both
 * recorded: this host already re-ran the file under its new name before this fix
 * existed, so the stale old row is dropped and the file is reported as applied.
 * Neither recorded: nothing to reconcile, and a fresh database falls straight
 * through to the normal runner.
 *
 * `applied` is mutated to match, so the caller's view of the database stays true.
 */
async function reconcileRenames(
  sql: Sql,
  directory: string,
  applied: Map<string, string>,
): Promise<Map<string, MigrationResult>> {
  const results = new Map<string, MigrationResult>();

  for (const { from, to } of RENAMED_MIGRATIONS) {
    if (!applied.has(from)) {
      continue;
    }

    if (applied.has(to)) {
      await sql`delete from schema_migrations where filename = ${from}`;
      applied.delete(from);
      results.set(to, {
        file: to,
        status: "already-applied",
        reason: `also recorded as ${from} before the product rename, and that stale row was dropped`,
      });
      continue;
    }

    const checksum = fingerprint(await Bun.file(`${directory}/${to}`).text());
    await sql`
      update schema_migrations
      set filename = ${to}, checksum = ${checksum}
      where filename = ${from}
    `;
    applied.delete(from);
    applied.set(to, checksum);
    results.set(to, {
      file: to,
      status: "renamed",
      reason: `recorded as ${from} before the product rename`,
    });
  }

  return results;
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
  const renamed = await reconcileRenames(sql, directory, applied);
  const hasTimescale = await timescaleAvailable(sql);
  const results: MigrationResult[] = [];

  for (const spec of MIGRATIONS) {
    const reconciled = renamed.get(spec.file);
    if (reconciled !== undefined) {
      // Reported before the Timescale check: the row exists, so this file did run
      // here once, and calling it skipped would be a lie on a host that lost the
      // extension since.
      results.push(reconciled);
      continue;
    }
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
