/**
 * bun run nessie:mirror
 *
 * Seeds the company's bank mirror into Nessie with our own key, reads it back,
 * and optionally imports what came back into the local ledger.
 *
 * Why this command exists at all, and it is not "because the challenge mentions
 * Nessie": a read against Nessie proves nothing about the key. An invalid key
 * answers `200 []` on every read, so `bun run doctor` can go green against a key
 * that would fail the first time the demo tried to write. The POST that creates
 * the customer is the only thing that tells the truth, and the instant it was
 * accepted is written to .seed/nessie.json as `keyValidatedAt`, next to a
 * fingerprint of the key that made it. That is the sentence the doctor reads
 * back, and the fingerprint is what stops it claiming a rotated key was proven.
 *
 * What is pushed is the company's BANK MIRROR: one purchase per outflow that has
 * already settled on the account, newest `--limit` first, 200 of 2446 by default
 * on seed 69. Never the pending instructions of the current payment run, which
 * have not left the account and have no business on a bank statement. Purchases
 * and not bare withdrawals, because a purchase carries a payee and a withdrawal
 * does not, and a bank mirror with no payee cannot be reconciled against a
 * supplier. In substance these are the settled withdrawals and transfers of the
 * account: dated, signed outwards, with the beneficiary named.
 *
 * Flags:
 *   --push               push the mirror. Default, with --verify.
 *   --verify             read it back and reconcile per calendar day. Default.
 *   --import             write the read-back rows into ledger_tx, replacing the
 *                        generator's rows for the company account. Needs
 *                        --limit=0, because the import replaces the mirror
 *   --limit=N            newest N outflows (default 200, 0 means all)
 *   --seed=N             SentryOne seed (default 69)
 *   --week=YYYY-MM-DD    any day of the payment-run week (default: the saved one)
 *   --help
 *
 * Idempotent: the ids in .seed/nessie.json are reused, the account's purchases
 * are listed, and only the rows that are missing are pushed. Running it twice
 * before a rehearsal creates nothing.
 *
 * A re-seed undoes an import. `bun run seed` loads the company through
 * PostgresRepository.load, which deletes the company account's ledger_tx rows
 * and writes the generator's mirror back, so after a `bun run seed` the ledger
 * holds the generator's rows again and `--import --limit=0` has to run once more
 * to put Nessie's rows back. It never doubles the mirror: the load deletes by
 * account id before it inserts.
 *
 * The key is never printed. It reaches the client through the environment and
 * every error text this script shows came out of the client, which strips it.
 */

import { resolve } from "node:path";
import type { LedgerTx } from "../packages/core/src/index.ts";
import { NessieClient } from "../packages/nessie/src/client.ts";
import {
  keyFingerprint,
  type MirrorIds,
  mirrorPurchasesPath,
  pushCompanyMirror,
  readCompanyMirror,
  reconcileByDay,
  selectMirrorRows,
  totalsByDay,
} from "../packages/nessie/src/mirror.ts";
import { NESSIE_SOURCE as MIRROR_SOURCE } from "../packages/nessie/src/normalize.ts";
import {
  generateSentryOne,
  SENTRYONE_DEFAULT_SEED,
} from "../packages/seed/src/index.ts";
import {
  coveredLimit,
  datasetMismatch,
  importDecision,
  type MirrorState,
  purchasesOnAccount,
  verifyLimit,
} from "./nessie-mirror/plan.ts";

const ROOT = resolve(import.meta.dir, "..");
const STATE_FILE = `${ROOT}/.seed/nessie.json`;
const DEFAULT_LIMIT = 200;
const PROGRESS_EVERY = 25;

const argv = Bun.argv.slice(2);
const flags = new Set(
  argv.filter((arg) => arg.startsWith("--") && !arg.includes("=")),
);
const options = new Map(
  argv
    .filter((arg) => arg.startsWith("--") && arg.includes("="))
    .map(
      (arg) =>
        [
          arg.slice(0, arg.indexOf("=")),
          arg.slice(arg.indexOf("=") + 1),
        ] as const,
    ),
);

if (flags.has("--help") || flags.has("-h")) {
  console.log(
    [
      "bun run nessie:mirror [--push] [--verify] [--import]",
      "                      [--limit=N] [--seed=N] [--week=YYYY-MM-DD]",
      "",
      "Pushes the company's bank mirror to Nessie with our own key, reads it back and",
      "reconciles it per calendar day. What goes up is one purchase per outflow already",
      "settled on the company's account, newest first, never the pending instructions of",
      "the current run. --push and --verify are the default; naming either one turns the",
      "other off unless it is named too.",
      "",
      "  --import   replace the generator's ledger_tx rows for the company account",
      "             with the rows Nessie answered. Needs DATABASE_URL, and refuses",
      "             a push that failed, a read-back that did not come home and a",
      "             reconciliation that did not balance.",
      "  --limit=N  newest N outflows, default 200. 0 pushes every row.",
      "",
      "A re-seed undoes an import: bun run seed deletes the company account's ledger_tx",
      "rows and writes the generator's mirror back, so run --import --limit=0 again",
      "afterwards to put Nessie's rows in the ledger. It never doubles the mirror.",
      "",
      "State goes to .seed/nessie.json, which is gitignored and which bun run doctor",
      "reads to say when the key was last validated with a write, and with which key.",
    ].join("\n"),
  );
  process.exit(0);
}

function intOption(name: string, fallback: number): number {
  const raw = options.get(name);
  if (raw === undefined) {
    return fallback;
  }
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 0) {
    console.error(`${name} must be a non-negative integer, got ${raw}`);
    process.exit(1);
  }
  return parsed;
}

async function readState(): Promise<MirrorState | undefined> {
  const file = Bun.file(STATE_FILE);
  if (!(await file.exists())) {
    return undefined;
  }
  try {
    return (await file.json()) as MirrorState;
  } catch {
    console.log(".seed/nessie.json is unreadable, so this run starts fresh");
    return undefined;
  }
}

function messageOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

function pesos(value: number): string {
  return value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

// Naming one of --push or --verify turns the other off, which is what makes
// `--verify` alone a read-only command a judge can watch.
const askedPush = flags.has("--push");
const askedVerify = flags.has("--verify");
const doPush = askedPush || !askedVerify;
const doVerify = askedVerify || !askedPush;
const doImport = flags.has("--import");

const previous = await readState();
const limitGiven = options.has("--limit");
const limit = intOption("--limit", DEFAULT_LIMIT);
const seed = intOption("--seed", previous?.seed ?? SENTRYONE_DEFAULT_SEED);
const weekOf = options.get("--week") ?? previous?.weekOf;

const dataset = generateSentryOne({
  seed,
  ...(weekOf === undefined ? {} : { weekOf }),
});
const { company } = dataset;

// The saved ids belong to one dataset. Reusing them for another one would push a
// second company's statement onto the first company's account, and nothing that
// comes back out of Nessie could tell the two apart afterwards.
const mismatch = datasetMismatch({
  ...(previous === undefined ? {} : { previous }),
  seed: dataset.seed,
  weekOf: dataset.weekOf,
});
if (mismatch !== undefined) {
  console.error(mismatch);
  process.exit(1);
}

/** The rows this run would push. */
const expected = selectMirrorRows(dataset.bankMirror, limit);
/** The rows the account is expected to HOLD, which is what the read-back meets. */
const verifyRows = selectMirrorRows(
  dataset.bankMirror,
  verifyLimit({
    limit,
    limitGiven,
    pushed: doPush,
    ...(previous?.limit === undefined ? {} : { previousLimit: previous.limit }),
  }),
);

console.log(
  `${company.legalName} (${company.rfc}), seed ${dataset.seed}, week of ${dataset.weekOf}`,
);
console.log(
  `bank mirror: ${dataset.bankMirror.length} rows, ${expected.length} to push with --limit=${limit}`,
);
console.log("");
console.log(
  "Everything posted with our key is readable by anyone holding it, so only the",
);
console.log(
  "synthetic company goes up: invented names, SYN RFCs, and no CLABE at all.",
);
console.log("");

const client = new NessieClient();
if (!client.configured) {
  console.error(
    "NESSIE_API_KEY is not set. Run this with: bun --env-file=.env run scripts/nessie-mirror.ts",
  );
  process.exit(1);
}
// A fingerprint, never the key: twelve hex characters of its SHA-256, which is
// enough for a later doctor to say "the same key" and gives nothing back.
const fingerprint = keyFingerprint(Bun.env.NESSIE_API_KEY ?? "");

let failed = false;
let ids: MirrorIds | undefined = previous?.ids;
let keyValidatedAt = previous?.keyValidatedAt;
let keyFingerprintOf = previous?.keyFingerprint;
let pushedThisRun = 0;
let pushFailures = 0;
let listingFailed = false;

if (doPush) {
  let lastReported = 0;
  try {
    ids = await pushCompanyMirror(
      client,
      {
        company: {
          rfc: company.rfc,
          legalName: company.legalName,
          tradeName: company.tradeName,
          city: company.city,
          state: company.state,
          clabe: company.clabe,
          bankAccountId: company.bankAccountId,
        },
        merchants: dataset.merchants,
        rows: dataset.bankMirror,
      },
      {
        limit,
        ...(previous?.ids === undefined ? {} : { existing: previous.ids }),
        onProgress: (progress) => {
          if (progress.stage === "customer") {
            console.log(`customer ${progress.detail ?? ""}`);
            return;
          }
          if (progress.stage === "account") {
            console.log(`account  ${progress.detail ?? ""}`);
            return;
          }
          if (
            progress.stage === "merchant" &&
            progress.done === progress.total
          ) {
            console.log(`merchants ${progress.total} of ${progress.total}`);
            return;
          }
          if (
            progress.stage === "purchase" &&
            progress.done - lastReported >= PROGRESS_EVERY
          ) {
            lastReported = progress.done;
            console.log(`purchases ${progress.done} of ${progress.total}`);
          }
        },
      },
    );
  } catch (cause) {
    console.error(`push failed: ${messageOf(cause)}`);
    process.exit(1);
  }

  if (ids.keyValidatedAt !== undefined) {
    keyValidatedAt = ids.keyValidatedAt;
    keyFingerprintOf = fingerprint;
  }
  pushedThisRun = ids.purchases;
  pushFailures = ids.skipped.failures;
  listingFailed = ids.listingFailed;
  console.log("");
  console.log(
    `pushed ${ids.purchases} purchases, ${Object.keys(ids.merchants).length} merchants`,
  );
  console.log(
    `skipped ${ids.skipped.credits} credits, ${ids.skipped.overLimit} over the limit, ${ids.skipped.alreadyThere} already there, ${ids.skipped.failures} failures`,
  );
  for (const failure of ids.firstFailures) {
    console.log(`  first failure: ${failure}`);
  }
  if (listingFailed) {
    console.log(
      "the account could not be listed, so no purchase was pushed: without the",
    );
    console.log(
      "dedupe set a second push would double every row already on the account",
    );
  }
  if (ids.skipped.failures > 0) {
    failed = true;
  }
}

if (ids === undefined) {
  console.error(
    "no Nessie ids yet and --push was not asked for. Run: bun run nessie:mirror --push",
  );
  process.exit(1);
}

// Undefined until a read-back actually came home. Never seeded from the
// generator's own rows: an import of those would be the generator's mirror
// wearing the bank's name.
let readBack: LedgerTx[] | undefined;
let readBackRejected = 0;
let verifyError: string | undefined;
let differingDays = 0;

if (doVerify) {
  console.log("");
  try {
    const result = await readCompanyMirror(client, ids, company.bankAccountId);
    readBack = result.rows;
    readBackRejected = result.rejected.length;
    console.log(
      `read back ${result.rows.length} rows from ${mirrorPurchasesPath(ids.accountId)}`,
    );
    if (result.rejected.length > 0) {
      failed = true;
      console.log(
        `  ${result.rejected.length} rows could not be normalised: ${result.rejected[0]?.reason ?? ""}`,
      );
    }

    const diffs = reconcileByDay(verifyRows, result.rows);
    differingDays = diffs.length;
    const expectedTotal = totalsByDay(verifyRows).reduce(
      (sum, day) => sum + day.amount,
      0,
    );
    const actualTotal = totalsByDay(result.rows).reduce(
      (sum, day) => sum + day.amount,
      0,
    );
    console.log(
      `generator ${verifyRows.length} rows for ${pesos(expectedTotal)} MXN, Nessie ${result.rows.length} rows for ${pesos(actualTotal)} MXN`,
    );
    const droppedCents =
      Math.round(expectedTotal * 100) - Math.round(actualTotal * 100);
    if (diffs.length === 0) {
      console.log(
        "reconciled: every calendar day matches in count and in pesos",
      );
      if (droppedCents > 0) {
        // Not a failure, and not hidden either. Nessie stores an amount as a
        // whole number, so it drops the centavos of every row it is given.
        console.log(
          `Nessie stores a whole-peso amount, so it dropped ${pesos(droppedCents / 100)} MXN of centavos across ${result.rows.length} rows. The exact amount is in our ledger`,
        );
      }
    } else {
      failed = true;
      console.log(`${diffs.length} days differ:`);
      for (const diff of diffs) {
        console.log(
          `  ${diff.day}  generator ${diff.expectedCount} rows ${pesos(diff.expectedAmount)}, nessie ${diff.actualCount} rows ${pesos(diff.actualAmount)}`,
        );
      }
    }
  } catch (cause) {
    failed = true;
    verifyError = messageOf(cause);
    console.error(`verify failed: ${verifyError}`);
  }

  // A read-back that came home whole re-binds the recorded write to THIS key.
  // Nessie scopes every row to the key that created it: a different key answers
  // `200 []` for this account, not 200 reconciled rows. So a mirror that
  // reconciles is proof that the key in hand is the key the validating write was
  // made with, which is the one thing a read normally cannot prove, and it is
  // how a run that creates nothing still refreshes the fingerprint.
  if (
    keyValidatedAt !== undefined &&
    readBack !== undefined &&
    readBack.length > 0 &&
    readBackRejected === 0 &&
    differingDays === 0
  ) {
    keyFingerprintOf = fingerprint;
  }
}

if (doImport) {
  console.log("");
  const databaseUrl = Bun.env.DATABASE_URL;
  const decision = importDecision({
    ...(databaseUrl === undefined ? {} : { databaseUrl }),
    verifyAsked: doVerify,
    pushFailures,
    listingFailed,
    ...(readBack === undefined ? {} : { readBackRows: readBack.length }),
    readBackRejected,
    ...(verifyError === undefined ? {} : { verifyError }),
    differingDays,
    selectedRows: verifyRows.length,
    outflows: dataset.bankMirror.filter((row) => row.direction === "debit")
      .length,
  });

  if (decision.kind === "skip") {
    console.log(decision.reason);
  } else if (decision.kind === "refuse") {
    failed = true;
    console.log(`--import refused: ${decision.reason}`);
  } else {
    const rows = readBack ?? [];
    const { createSql } = await import("../packages/db/src/index.ts");
    const { deleteLedgerTxBySource, insertLedgerTx, transact } = await import(
      "../packages/db/src/queries.ts"
    );
    const sql = createSql(databaseUrl as string);
    try {
      // One transaction, so a failure between the delete and the insert cannot
      // leave the company with a ledger shorter than its bank. The generator's
      // rows and Nessie's rows describe the same payments with different ids, so
      // they are replaced rather than added to. The source deleted is "nessie"
      // and not "seed" because the generator already ran its rows through
      // normalizePurchase, which stamps them "nessie": the mirror was
      // Nessie-shaped before it was ever pushed. Scoped to the company account,
      // so the consumer dataset in the same table is untouched.
      const { removed, written } = await transact(sql, async (tx) => {
        const deleted = await deleteLedgerTxBySource(
          tx,
          company.bankAccountId,
          MIRROR_SOURCE,
        );
        const inserted = await insertLedgerTx(tx, rows);
        return { removed: deleted, written: inserted };
      });
      console.log(
        `ledger_tx: ${removed} rows removed for ${company.bankAccountId}, ${written} rows written from Nessie, in one transaction`,
      );
      console.log(
        "the imported rows carry the bank's whole-peso amounts, which is what the bank has",
      );
      console.log(
        "a later bun run seed puts the generator's mirror back, so run this again after one",
      );
    } catch (cause) {
      failed = true;
      console.error(`import failed: ${messageOf(cause)}`);
      console.error("If the table is missing, run: bun run migrate");
    } finally {
      await sql.end({ timeout: 5 });
    }
  }
}

const storedLimit = coveredLimit({
  limit,
  pushed: doPush,
  ...(previous?.limit === undefined ? {} : { previousLimit: previous.limit }),
});
const state: MirrorState = {
  seed: dataset.seed,
  weekOf: dataset.weekOf,
  updatedAt: new Date().toISOString(),
  localAccountId: company.bankAccountId,
  getPath: mirrorPurchasesPath(ids.accountId),
  ...(keyValidatedAt === undefined ? {} : { keyValidatedAt }),
  ...(keyFingerprintOf === undefined
    ? {}
    : { keyFingerprint: keyFingerprintOf }),
  limit: storedLimit,
  pushedRows: selectMirrorRows(dataset.bankMirror, storedLimit).length,
  purchases: purchasesOnAccount({
    ...(readBack === undefined ? {} : { verifiedRows: readBack.length }),
    ...(previous?.purchases === undefined
      ? {}
      : { previous: previous.purchases }),
    pushed: pushedThisRun,
  }),
  ids,
};
await Bun.write(STATE_FILE, `${JSON.stringify(state, null, 2)}\n`);

console.log("");
console.log(`nessie customer ${ids.customerId}`);
console.log(`nessie account  ${ids.accountId}`);
console.log(
  keyValidatedAt === undefined
    ? "key not validated by a write yet"
    : `key validated with a write at ${keyValidatedAt} (POST /customers), key ${keyFingerprintOf ?? "unknown"}`,
);
console.log("state written to .seed/nessie.json");
console.log("");
console.log("The bank mirror, live, for a judge who wants to see it:");
console.log(
  `  curl "https://api.nessieisreal.com${state.getPath}?key=$NESSIE_API_KEY" | jq length`,
);
console.log("");
console.log(
  "Say this out loud with it on screen: Nessie carries dates with no time at all,",
);
console.log(
  "so the day is the bank's and the intraday order is ours, out of our own ledger.",
);

process.exit(failed ? 1 : 0);
