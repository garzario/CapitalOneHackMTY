/**
 * bun run migrate
 *
 * Applies 0001_init.sql always, and 0002_timescale.sql only when the server can
 * install timescaledb. Safe to run repeatedly: applied files are tracked in
 * schema_migrations with a checksum, so an edited migration is reported rather than
 * silently diverging across four laptops.
 */

import { createSql, readDatabaseUrl } from "../packages/db/src/index.ts";
import { migrate } from "../packages/db/src/migrate.ts";

const databaseUrl = readDatabaseUrl();
if (databaseUrl === undefined) {
  console.error(
    "DATABASE_URL is not set. Run: cp .env.example .env and fill it in.",
  );
  console.error("Local fallback, if Postgres is running on 5432:");
  console.error(
    "  DATABASE_URL=postgres://postgres:postgres@localhost:5432/hackmty",
  );
  process.exit(1);
}

const sql = createSql(databaseUrl);
let failed = false;

try {
  const results = await migrate(sql);
  for (const result of results) {
    const suffix =
      result.statements === undefined
        ? ""
        : ` (${result.statements} statements)`;
    console.log(`${result.status.padEnd(15)} ${result.file}${suffix}`);
    if (result.reason !== undefined) {
      console.log(`${" ".repeat(16)}${result.reason}`);
    }
  }
  console.log("");
  console.log("Schema is up to date. Next: bun run seed");
} catch (cause) {
  failed = true;
  console.error(
    "migration failed:",
    cause instanceof Error ? cause.message : String(cause),
  );
  console.error(
    "Nothing was rolled back: migrations run statement by statement, because a",
  );
  console.error(
    "continuous aggregate cannot be created inside a transaction. Fix the cause and",
  );
  console.error("run it again, the applied statements are all idempotent.");
} finally {
  await sql.end({ timeout: 5 });
}

process.exit(failed ? 1 : 0);
