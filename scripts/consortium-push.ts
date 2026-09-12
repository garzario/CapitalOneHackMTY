/**
 * bun run consortium:push
 *
 * Sends THIS tenant's own beneficiary outcomes to the consortium, hashed.
 *
 * This is the direction that carries a privacy claim, so the claim is written out
 * here as well as in `packages/consortium/README.md`. What goes up, per outcome:
 * a hash of this company's RFC, a hash of the supplier's RFC, a hash of the
 * account, the three-digit bank code that is printed on every SPEI receipt, one of
 * `verified`, `paid`, `mismatch` or `fraud_reported`, and a calendar day.
 *
 * What never goes up: a legal name, an amount, an invoice UUID, a clave de
 * rastreo, a raw RFC or a raw CLABE. There is no column for any of them in the
 * warehouse, and `packages/consortium/src/sync.test.ts` asserts that neither the
 * payload nor the SQL it becomes contains one.
 *
 * Where the outcomes come from: the company's own registry and its own payment
 * run. A verified beneficiary is a `verified` on the day its CEP was accepted; a
 * transfer that has already left is a `paid` on the day the bank booked it; a
 * beneficiary_cep finding whose holder name did not match the CFDI is a
 * `mismatch`. Nothing is invented, and this tenant reports no fraud it has not
 * suffered: there is no `fraud_reported` in this push, which is the honest answer
 * for a company that has not lost money.
 *
 * Idempotent in effect: the outcomes are deduplicated on (pair, outcome, day)
 * before they are sent, so running it twice does not inflate anybody's history.
 * The warehouse table is append-only, so a re-run does add rows; the view counts
 * DISTINCT tenants and days, which is why it does not matter.
 *
 * Flags:
 *   --seed=N             the company seed (default 69)
 *   --week=YYYY-MM-DD    any day of the payment-run week
 *   --dry-run            print what would be sent, send nothing
 */

import {
  insertEvents,
  pushEvents,
  type TenantOutcome,
} from "../packages/consortium/src/index.ts";
import { runControls } from "../packages/engine/src/index.ts";
import {
  clientFor,
  company,
  ddlOptions,
  messageOf,
  plural,
  readFlags,
  requireEnv,
  TENANT_RFC,
} from "./consortium/shared.ts";

const argv = Bun.argv.slice(2);
const flags = readFlags(argv);
const dryRun = argv.includes("--dry-run");

if (flags.help) {
  console.log(
    [
      "bun run consortium:push [--seed=N] [--week=YYYY-MM-DD] [--dry-run]",
      "",
      "Sends this tenant's beneficiary outcomes to the consortium as salted hashes.",
      "No name, no amount, no invoice, no raw RFC and no raw CLABE leave this laptop.",
      "",
      "--dry-run prints the counts and the first statement and sends nothing.",
    ].join("\n"),
  );
  process.exit(0);
}

const env = requireEnv({ warehouse: !dryRun });
const dataset = company(flags);

/**
 * The outcomes this company can honestly report.
 *
 * The `mismatch` rows come from running the six controls over the run rather than
 * from a column in the generator: a generator that shipped its own findings would
 * be answering the question the detectors exist to answer, which is the rule
 * `apps/api/src/sentryone.ts` already lives under.
 */
const outcomes: TenantOutcome[] = [];

for (const transfer of dataset.transfers) {
  outcomes.push({
    supplierRfc: transfer.supplierRfc,
    clabe: transfer.beneficiaryAccount,
    outcome: "paid",
    day: transfer.day,
  });
}

const suppliers = new Map(
  dataset.suppliers.map((supplier) => [supplier.rfc, supplier] as const),
);

for (const supplier of dataset.suppliers) {
  for (const account of supplier.knownAccounts) {
    if (account.establishedBy !== "cep") {
      continue;
    }
    outcomes.push({
      supplierRfc: supplier.rfc,
      clabe: account.clabe,
      outcome: "verified",
      day: account.establishedAt.slice(0, 10),
    });
  }
}

for (const instruction of dataset.instructions) {
  const supplier = suppliers.get(instruction.supplierRfc);
  const report = runControls({
    instruction,
    ...(supplier === undefined ? {} : { supplier }),
    cfdis: dataset.cfdis,
    complements: dataset.complements,
    satEntries: dataset.satEntries.filter(
      (entry) => entry.rfc === instruction.supplierRfc,
    ),
    bankMirror: dataset.bankMirror,
    now: `${dataset.runDay}T15:00:00.000Z`,
  });
  for (const finding of report.findings) {
    if (
      finding.detector === "beneficiary_cep" &&
      finding.evidence.nameMatch === "mismatch"
    ) {
      outcomes.push({
        supplierRfc: instruction.supplierRfc,
        clabe: instruction.clabe,
        outcome: "mismatch",
        day: finding.createdAt.slice(0, 10),
      });
    }
  }
}

const events = pushEvents({
  tenantRfc: TENANT_RFC,
  outcomes,
  /* This tenant's own data is synthetic, and the warehouse row says so. A real
     tenant would push false here, and the view would stop reporting the pair as
     synthetic the moment one real company joined. */
  synthetic: true,
  ...(env.salt === undefined ? {} : { salt: env.salt }),
});

const byOutcome = new Map<string, number>();
for (const event of events) {
  byOutcome.set(event.outcome, (byOutcome.get(event.outcome) ?? 0) + 1);
}

console.log(`consortium:push  seed ${flags.seed}, tenant hashed, never named`);
console.log(
  `${plural(events.length, "event")} after deduplication on (pair, outcome, day)`,
);
for (const [outcome, count] of [...byOutcome].sort()) {
  console.log(`  ${outcome.padEnd(15)} ${count}`);
}
console.log("");

const statements = insertEvents(events, ddlOptions(env));

if (dryRun) {
  console.log("--dry-run: nothing was sent. First statement, truncated:");
  console.log(`${(statements[0] ?? "").slice(0, 400)}...`);
  process.exit(0);
}

let failed = false;

try {
  const client = await clientFor(env);
  for (const [index, statement] of statements.entries()) {
    await client.statement(statement);
    console.log(`ok     insert ${index + 1} of ${statements.length}`);
  }
  console.log("");
  console.log(
    `Pushed ${plural(events.length, "hashed outcome")}. Next: bun run consortium:pull`,
  );
} catch (cause) {
  failed = true;
  console.error("");
  console.error(`consortium:push failed: ${messageOf(cause)}`);
  console.error(
    "The table is append-only and the view counts distinct tenants and days, so a",
  );
  console.error("partial push is safe to run again.");
}

process.exit(failed ? 1 : 0);
