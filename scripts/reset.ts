/**
 * bun run reset
 *
 * Empties the local ledger, and optionally wipes our own Nessie key's data. There is
 * no undo, so it asks first: you have to type RESET. A non-interactive shell gets
 * null from prompt() and the command aborts, which is the behaviour you want when
 * this ends up in a script by accident.
 *
 * Flags:
 *   --yes       skip the confirmation. Only for a shell you are watching.
 *   --nessie    also delete this key's Nessie data, entity type by entity type
 *   --keep-ids  leave .seed/ids.json in place
 */

import { unlink } from "node:fs/promises";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dir, "..");
const STATE_FILE = `${ROOT}/.seed/ids.json`;

/**
 * Children before parents. Nessie's reset route is not part of the verified surface
 * in docs/09-api.md, so each call is reported individually rather than assumed.
 */
const NESSIE_TYPES = [
  "Purchases",
  "Deposits",
  "Withdrawals",
  "Transfers",
  "Bills",
  "Loans",
  "Accounts",
  "Customers",
  "Merchants",
] as const;

const args = new Set(Bun.argv.slice(2));

if (args.has("--help")) {
  console.log("bun run reset [--yes] [--nessie] [--keep-ids]");
  console.log("");
  console.log(
    "Truncates ledger_tx and removes .seed/ids.json. With --nessie, also wipes",
  );
  console.log("this key's Nessie data. Destructive and not undoable.");
  process.exit(0);
}

const wipeNessie = args.has("--nessie");
const databaseUrl = Bun.env.DATABASE_URL;

console.log("This deletes:");
console.log(
  `  - every row in ledger_tx${databaseUrl === undefined || databaseUrl === "" ? " (skipped, DATABASE_URL is not set)" : ""}`,
);
if (!args.has("--keep-ids")) {
  console.log("  - .seed/ids.json");
}
if (wipeNessie) {
  console.log(`  - this Nessie key's data: ${NESSIE_TYPES.join(", ")}`);
}
console.log("");

if (!args.has("--yes")) {
  const answer = prompt("Type RESET to continue:");
  if (answer !== "RESET") {
    console.log("aborted, nothing was deleted");
    process.exit(0);
  }
}

let failed = false;

if (databaseUrl !== undefined && databaseUrl !== "") {
  const { createSql } = await import("../packages/db/src/index.ts");
  const { countLedgerTx, truncateLedger } = await import(
    "../packages/db/src/queries.ts"
  );
  const sql = createSql(databaseUrl);
  try {
    const before = await countLedgerTx(sql);
    await truncateLedger(sql);
    console.log(`ledger_tx: ${before} rows deleted`);
  } catch (cause) {
    failed = true;
    console.error(
      `ledger truncate failed: ${cause instanceof Error ? cause.message : String(cause)}`,
    );
  } finally {
    await sql.end({ timeout: 5 });
  }
}

if (wipeNessie) {
  const { NessieClient } = await import("../packages/nessie/src/client.ts");
  const client = new NessieClient();
  if (!client.configured) {
    console.error("NESSIE_API_KEY is not set, so there is nothing to wipe.");
    failed = true;
  } else {
    for (const type of NESSIE_TYPES) {
      try {
        await client.deleteData(type);
        console.log(`nessie: ${type} deleted`);
      } catch (cause) {
        console.log(
          `nessie: ${type} not deleted (${cause instanceof Error ? cause.message : String(cause)})`,
        );
      }
    }
    console.log("");
    console.log(
      "If every type above failed, the reset route is wrong rather than the key.",
    );
    console.log(
      "See the TODO on NessieDataType in packages/nessie/src/client.ts.",
    );
  }
}

if (!args.has("--keep-ids")) {
  try {
    await unlink(STATE_FILE);
    console.log(".seed/ids.json removed");
  } catch {
    console.log(".seed/ids.json was not there");
  }
}

console.log("");
console.log("Rebuild with: bun run migrate && bun run seed");

process.exit(failed ? 1 : 0);
