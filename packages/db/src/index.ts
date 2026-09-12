/**
 * The Postgres connection, and nothing else.
 *
 * One dialect, two hosts: a managed Timescale instance is the primary, and a plain
 * local PostgreSQL 18 is the offline fallback. Same SQL, same driver, no second
 * implementation, which is why 0001_init.sql runs on both and only
 * 0002_timescale.sql is conditional. There is no SQLite path, deliberately: it
 * cannot run create_hypertable and it would mean maintaining two dialects during a
 * hackathon.
 *
 * Raw SQL through postgres@3.4.9, no ORM. When a judge asks how the query works, the
 * answer is to show them the query.
 *
 * The connection is lazy: postgres.js opens a socket on the first query, so importing
 * this module costs nothing and a process that never touches the database never
 * connects. This file must stay runtime-neutral (no bun:* import, no Bun global) so
 * apps/api can import it on whichever target ADR-0005 picks.
 */

import postgres from "postgres";

export type Sql = ReturnType<typeof postgres>;

/** Small pool: four laptops plus a deploy target, against one free-tier database. */
const POOL_SIZE = 5;
const IDLE_TIMEOUT_SECONDS = 20;
const CONNECT_TIMEOUT_SECONDS = 10;
const DEFAULT_PROBE_TIMEOUT_MS = 2000;

export class DatabaseConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DatabaseConfigError";
  }
}

/** Reads an environment variable without assuming the runtime provides `process`. */
function readEnv(name: string): string | undefined {
  const holder = globalThis as {
    process?: { env?: Record<string, string | undefined> };
  };
  return holder.process?.env?.[name];
}

export function readDatabaseUrl(): string | undefined {
  const url = readEnv("DATABASE_URL");
  return url === undefined || url.trim() === "" ? undefined : url.trim();
}

export function requireDatabaseUrl(): string {
  const url = readDatabaseUrl();
  if (url === undefined) {
    throw new DatabaseConfigError(
      "DATABASE_URL is not set. Copy .env.example to .env and point it at Timescale or at the local Postgres on 5432.",
    );
  }
  return url;
}

/** A fresh client. Callers that own a lifecycle should use this and end it themselves. */
export function createSql(url: string = requireDatabaseUrl()): Sql {
  return postgres(url, {
    max: POOL_SIZE,
    idle_timeout: IDLE_TIMEOUT_SECONDS,
    connect_timeout: CONNECT_TIMEOUT_SECONDS,
    onnotice: (notice) => {
      // A notice is information, not an error: "relation already exists, skipping" is
      // the expected answer to a second `bun run migrate`. One line, rather than the
      // driver's default object dump in the middle of a migration report.
      console.warn(`postgres: ${notice.message ?? "notice"}`);
    },
  });
}

let cached: Sql | undefined;

/** The shared client for a long-lived process such as apps/api. */
export function getSql(): Sql {
  cached ??= createSql();
  return cached;
}

export async function closeSql(): Promise<void> {
  if (cached === undefined) {
    return;
  }
  const sql = cached;
  cached = undefined;
  await sql.end({ timeout: 5 });
}

export interface ProbeResult {
  ok: boolean;
  /** Round trip in milliseconds. */
  ms: number;
  error?: string;
}

/**
 * Answers "is the database reachable right now" in bounded time, so `bun run doctor`
 * cannot hang on a dead host at 04:00. Never throws.
 */
export async function probe(
  sql: Sql,
  timeoutMs = DEFAULT_PROBE_TIMEOUT_MS,
): Promise<ProbeResult> {
  const started = Date.now();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => {
        reject(new Error(`no answer in ${timeoutMs}ms`));
      }, timeoutMs);
    });
    await Promise.race([sql`select 1`, timeout]);
    return { ok: true, ms: Date.now() - started };
  } catch (cause) {
    return {
      ok: false,
      ms: Date.now() - started,
      error: cause instanceof Error ? cause.message : String(cause),
    };
  } finally {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
  }
}

/** True when this server could install Timescale, which decides migration 0002. */
export async function hasTimescale(sql: Sql): Promise<boolean> {
  const rows = await sql<{ name: string }[]>`
    select name from pg_available_extensions where name = 'timescaledb'
  `;
  return rows.length > 0;
}

/** True when ledger_tx is actually a hypertable, so doctor can say which path is live. */
export async function isHypertable(
  sql: Sql,
  table = "ledger_tx",
): Promise<boolean> {
  try {
    const rows = await sql<{ hypertable_name: string }[]>`
      select hypertable_name from timescaledb_information.hypertables
      where hypertable_name = ${table}
    `;
    return rows.length > 0;
  } catch {
    // The view only exists once the extension is installed. Not an error here.
    return false;
  }
}
