/**
 * bun run consortium:pull
 *
 * Fills the LOCAL `consortium_snapshot` table from the warehouse, so the engine
 * can read the network without ever opening a socket.
 *
 * That is the whole architectural point of this command. The operational ledger is
 * per company on Tiger Data and answers on the hot path in milliseconds; the
 * network is a cold, cross-tenant warehouse and a payment decision must never wait
 * on it. So the warehouse is read here, by a person, on a laptop, and the snapshot
 * it writes carries the instant it was taken. A decision made from a snapshot works
 * with the network unplugged, which is a property a judge can test by unplugging it.
 *
 * The snapshot is REPLACED and never merged. A pair the network has stopped
 * corroborating must not stay behind: a stale corroboration is the one way this
 * signal turns into a false release. The delete and the insert run in one
 * transaction, so there is no instant at which the snapshot is half a network.
 *
 * `--offline` fills the same table from the deterministic synthetic network instead
 * of from Snowflake, and records `source = 'synthetic'` in `consortium_pull` so
 * nothing downstream can mistake one for the other. It exists because the demo has
 * to work on a laptop with no Snowflake account and no conference Wi-Fi, and
 * because pretending otherwise is exactly the failure mode this repository is
 * written against.
 *
 * Flags:
 *   --offline            fill from the local synthetic generator, no Snowflake
 *   --seed=N             the seed the network and the company share (default 69)
 *   --week=YYYY-MM-DD    any day of the payment-run week
 */

import {
  aggregateNetwork,
  networkSelect,
  readNetworkRows,
  syntheticNetwork,
} from "../packages/consortium/src/index.ts";
import type {
  ConsortiumPull,
  ConsortiumSnapshotRow,
} from "../packages/core/src/index.ts";
import { createSql, readDatabaseUrl } from "../packages/db/src/index.ts";
import { replaceConsortiumSnapshot } from "../packages/db/src/queries.ts";
import {
  clientFor,
  company,
  ddlOptions,
  messageOf,
  plural,
  readFlags,
  requireEnv,
  runDay,
} from "./consortium/shared.ts";

const flags = readFlags(Bun.argv.slice(2));

if (flags.help) {
  console.log(
    [
      "bun run consortium:pull [--offline] [--seed=N] [--week=YYYY-MM-DD]",
      "",
      "Replaces the local consortium_snapshot from the warehouse, so the engine reads",
      "the network offline and a payment decision never waits on Snowflake.",
      "",
      "--offline fills the same table from the deterministic synthetic network and",
      "records source = 'synthetic'. It needs no Snowflake account.",
    ].join("\n"),
  );
  process.exit(0);
}

const databaseUrl = readDatabaseUrl();
if (databaseUrl === undefined) {
  console.error(
    "DATABASE_URL is not set, so there is no local snapshot to fill. Run: cp .env.example .env",
  );
  console.error("Then: bun run migrate");
  process.exit(1);
}

const env = requireEnv({ warehouse: !flags.offline });

/**
 * The rows the synthetic network aggregates to, computed on this laptop.
 *
 * `aggregateNetwork` in `@hackmty/consortium` is the same fold the
 * `BENEFICIARY_NETWORK` view performs, which is why it lives in the package and is
 * tested there against the view's own column list rather than being written out
 * here.
 */
function offlineRows(): ConsortiumSnapshotRow[] {
  const dataset = company(flags);
  const { events } = syntheticNetwork({
    suppliers: dataset.suppliers,
    instructions: dataset.instructions,
    runDay: runDay(dataset),
    seed: flags.seed,
    ...(env.salt === undefined ? {} : { salt: env.salt }),
  });

  return aggregateNetwork(events);
}

const sql = createSql(databaseUrl);
let failed = false;

try {
  let rows: ConsortiumSnapshotRow[];
  let source: ConsortiumPull["source"];

  if (flags.offline) {
    rows = offlineRows();
    source = "synthetic";
    console.log(
      `consortium:pull --offline  seed ${flags.seed}, no Snowflake was contacted`,
    );
  } else {
    const client = await clientFor(env);
    const result = await client.statement(networkSelect(ddlOptions(env)));
    const read = readNetworkRows(result.rows);
    rows = read.rows;
    source = "snowflake";
    console.log(`consortium:pull  account ${env.account}`);
    if (read.skipped.length > 0) {
      /* Skipped and reported, never stored as zeros: a snapshot row of zeros reads
         on the screen as "nobody pays this account", which is a claim. */
      console.log(
        `${plural(read.skipped.length, "row")} could not be read and were skipped:`,
      );
      for (const skip of read.skipped.slice(0, 5)) {
        console.log(`  ${skip.reason}`);
      }
    }
  }

  const pulledAt = new Date().toISOString();
  await replaceConsortiumSnapshot(sql, { rows, pulledAt, source });

  const reported = rows.filter((row) => row.fraudReports > 0).length;
  const corroborated = rows.filter(
    (row) => row.fraudReports === 0 && row.tenants > 0,
  ).length;

  console.log(
    `Snapshot replaced: ${plural(rows.length, "pair")}, ${corroborated} corroborated, ${reported} with a fraud report`,
  );
  console.log(`pulled_at ${pulledAt}, source ${source}`);
  console.log("");
  console.log(
    "The engine reads this table and never Snowflake, so the demo now works offline.",
  );
  /* No pair is echoed, deliberately. A pull that printed one would put a hash next
     to the RFC that produced it, in a terminal that gets projected, and the whole
     point of the hash is that the two are not written down together. The endpoint
     is how one pair gets inspected. */
  console.log(
    "One pair, by hand:  curl -s 'http://localhost:8787/api/v1/consortium/signal?rfc=<rfc>&clabe=<clabe>' | jq",
  );
} catch (cause) {
  failed = true;
  console.error("");
  console.error(`consortium:pull failed: ${messageOf(cause)}`);
  console.error(
    "The snapshot was not touched: the replace runs inside one transaction, so it is",
  );
  console.error("either the whole new network or the old one.");
} finally {
  await sql.end({ timeout: 5 });
}

process.exit(failed ? 1 : 0);
