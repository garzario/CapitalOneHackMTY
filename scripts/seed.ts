/**
 * bun run seed
 *
 * Generates the demo dataset from seed 86, writes the ids the demo script needs to
 * .seed/ids.json, mirrors the rows into the local ledger, and optionally pushes
 * everything to Nessie.
 *
 * Flags:
 *   --force              regenerate with today's window instead of reusing .seed/ids.json
 *   --nessie             also push the dataset to Nessie through our own key
 *   --no-db              skip the local ledger, even when DATABASE_URL is set
 *   --customers=N        how many customers to invent (default 3)
 *   --months=N           how many months of history (default 6)
 *   --nessie-limit=N     cap purchases pushed per account (default 150, 0 means all)
 *
 * Idempotent by design. The window is stored in .seed/ids.json and reused, and the
 * ledger insert is `on conflict (id) do nothing`, so running it twice before a
 * rehearsal changes nothing and breaks nothing.
 */

import { resolve } from "node:path";
import type { GeneratedDataset } from "../packages/seed/src/index.ts";
import {
  DEFAULT_SEED,
  generate,
  MTY_COLONIAS,
  summarize,
  toLedgerTx,
} from "../packages/seed/src/index.ts";

const ROOT = resolve(import.meta.dir, "..");
const STATE_FILE = `${ROOT}/.seed/ids.json`;

const DEFAULT_CUSTOMERS = 3;
const DEFAULT_MONTHS = 6;
const DEFAULT_NESSIE_PURCHASE_LIMIT = 150;
const PROGRESS_EVERY = 25;
/** Monterrey city centroid, used for every synthetic merchant. Not a real branch location. */
const MTY_GEOCODE = { lat: 25.6866, lng: -100.3161 };

interface SeedState {
  seed: number;
  generatedAt: string;
  options: { customers: number; months: number; endDate: string };
  window: { from: string; to: string };
  counts: Record<string, number>;
  heroAccountId: string;
  demoAccountIds: string[];
  accounts: Array<{
    id: string;
    customerId: string;
    type: string;
    nickname: string;
    balance: number;
  }>;
  nessie?: {
    pushedAt: string;
    customers: Record<string, string>;
    accounts: Record<string, string>;
    merchants: Record<string, string>;
    counts: Record<string, number>;
    skipped: Record<string, number>;
  };
}

const args = Bun.argv.slice(2);
const flags = new Set(
  args.filter((arg) => arg.startsWith("--") && !arg.includes("=")),
);
const options = new Map(
  args
    .filter((arg) => arg.startsWith("--") && arg.includes("="))
    .map(
      (arg) =>
        [
          arg.slice(0, arg.indexOf("=")),
          arg.slice(arg.indexOf("=") + 1),
        ] as const,
    ),
);

if (flags.has("--help")) {
  console.log(
    [
      "bun run seed [--force] [--nessie] [--no-db] [--customers=N] [--months=N] [--nessie-limit=N]",
      "",
      "Writes .seed/ids.json, mirrors the ledger into Postgres, and optionally pushes to Nessie.",
      "Deterministic: the same seed and window always produce the same data.",
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

async function readState(): Promise<SeedState | undefined> {
  const file = Bun.file(STATE_FILE);
  if (!(await file.exists())) {
    return undefined;
  }
  try {
    return (await file.json()) as SeedState;
  } catch {
    return undefined;
  }
}

const previous = await readState();
const force = flags.has("--force");
const customers = intOption(
  "--customers",
  previous?.options.customers ?? DEFAULT_CUSTOMERS,
);
const months = intOption(
  "--months",
  previous?.options.months ?? DEFAULT_MONTHS,
);

if (previous !== undefined && !force) {
  console.log(
    `reusing the window in .seed/ids.json (${previous.window.from} to ${previous.window.to}). Pass --force to regenerate with today's date.`,
  );
}

const dataset: GeneratedDataset = generate({
  seed: DEFAULT_SEED,
  customers,
  months,
  ...(previous !== undefined && !force
    ? { endDate: previous.options.endDate }
    : {}),
});
const summary = summarize(dataset);
const ledger = toLedgerTx(dataset);

// The ids file is what docs/10-demo-script.md and bun run demo read, so it is written
// before anything that can fail over the network.
const state: SeedState = {
  seed: dataset.seed,
  generatedAt: new Date().toISOString(),
  options: { customers, months, endDate: dataset.window.to },
  window: dataset.window,
  counts: { ...summary.counts },
  heroAccountId: summary.heroAccountId,
  demoAccountIds: summary.demoAccountIds,
  accounts: dataset.accounts.map((account) => ({
    id: account.id,
    customerId: account.customerId,
    type: account.type,
    nickname: account.nickname,
    balance: account.balance,
  })),
  ...(previous?.nessie === undefined ? {} : { nessie: previous.nessie }),
};
await Bun.write(STATE_FILE, `${JSON.stringify(state, null, 2)}\n`);

// Local ledger.
let failed = false;
const databaseUrl = Bun.env.DATABASE_URL;
if (flags.has("--no-db")) {
  console.log("skipping the local ledger (--no-db)");
} else if (databaseUrl === undefined || databaseUrl === "") {
  console.log("DATABASE_URL is not set, so the local ledger was skipped");
} else {
  const { createSql } = await import("../packages/db/src/index.ts");
  const { insertLedgerTx } = await import("../packages/db/src/queries.ts");
  const sql = createSql(databaseUrl);
  try {
    const written = await insertLedgerTx(sql, ledger);
    console.log(
      `ledger: ${written} rows written, ${ledger.length - written} already there (insert is idempotent)`,
    );
  } catch (cause) {
    failed = true;
    console.error(
      `ledger insert failed: ${cause instanceof Error ? cause.message : String(cause)}`,
    );
    console.error("If the table is missing, run: bun run migrate");
  } finally {
    await sql.end({ timeout: 5 });
  }
}

// Nessie.
if (flags.has("--nessie")) {
  const limit = intOption("--nessie-limit", DEFAULT_NESSIE_PURCHASE_LIMIT);
  const { NessieClient } = await import("../packages/nessie/src/client.ts");
  const client = new NessieClient();

  if (!client.configured) {
    console.error("NESSIE_API_KEY is not set, so there is nothing to push to.");
    process.exit(1);
  }

  console.log("");
  console.log(
    "pushing to Nessie. Anything posted is readable by every other team at the",
  );
  console.log(
    "event, so only these synthetic rows go up, and never anything identifying.",
  );

  try {
    await client.listAccounts();
  } catch (cause) {
    console.error(
      `Nessie preflight failed: ${cause instanceof Error ? cause.message : String(cause)}`,
    );
    process.exit(1);
  }

  const merchantIds = new Map<string, string>();
  const customerIds = new Map<string, string>();
  const accountIds = new Map<string, string>();
  const counts = {
    merchants: 0,
    customers: 0,
    accounts: 0,
    purchases: 0,
    deposits: 0,
    bills: 0,
  };
  const skipped = { purchases: 0, refunds: 0, failures: 0 };
  const firstErrors: string[] = [];

  const attempt = async (
    label: string,
    run: () => Promise<void>,
  ): Promise<void> => {
    try {
      await run();
    } catch (cause) {
      skipped.failures += 1;
      if (firstErrors.length < 3) {
        firstErrors.push(
          `${label}: ${cause instanceof Error ? cause.message : String(cause)}`,
        );
      }
    }
  };

  for (const [index, merchant] of dataset.merchants.entries()) {
    const colonia = MTY_COLONIAS[index % MTY_COLONIAS.length];
    await attempt(`merchant ${merchant.name}`, async () => {
      const created = await client.createMerchant({
        name: merchant.name,
        ...(merchant.category === undefined
          ? {}
          : { category: [merchant.category] }),
        address: {
          street_number: String(100 + index),
          street_name: colonia?.streetName ?? "Avenida Constitucion",
          city: merchant.city,
          state: "NL",
          zip: colonia?.zip ?? "64000",
        },
        geocode: MTY_GEOCODE,
      });
      merchantIds.set(merchant.id, created._id);
      counts.merchants += 1;
    });
  }
  console.log(`merchants: ${counts.merchants} of ${dataset.merchants.length}`);

  for (const customer of dataset.customers) {
    await attempt(`customer ${customer.id}`, async () => {
      const created = await client.createCustomer({
        first_name: customer.firstName,
        last_name: customer.lastName,
        address: {
          street_number: customer.address.streetNumber,
          street_name: customer.address.streetName,
          city: customer.address.city,
          state: customer.address.state,
          zip: customer.address.zip,
        },
      });
      customerIds.set(customer.id, created._id);
      counts.customers += 1;
    });
  }
  console.log(`customers: ${counts.customers} of ${dataset.customers.length}`);

  // The hero account goes first, so an interrupted push still leaves the demo working.
  const accounts = [...dataset.accounts].sort((left, right) => {
    if (left.id === summary.heroAccountId) {
      return -1;
    }
    return right.id === summary.heroAccountId ? 1 : 0;
  });

  for (const account of accounts) {
    const remoteCustomerId = customerIds.get(account.customerId);
    if (remoteCustomerId === undefined) {
      skipped.failures += 1;
      continue;
    }
    await attempt(`account ${account.id}`, async () => {
      // The opening balance goes up, not the closing one: Nessie applies the
      // transactions itself, and our ledger stays the system of record either way.
      const created = await client.createAccount(remoteCustomerId, {
        type: account.type,
        nickname: account.nickname,
        rewards: account.rewards,
        balance: account.openingBalance,
        account_number: account.accountNumber,
      });
      accountIds.set(account.id, created._id);
      counts.accounts += 1;
    });

    const remoteAccountId = accountIds.get(account.id);
    if (remoteAccountId === undefined) {
      continue;
    }

    const purchases = dataset.purchases.filter(
      (purchase) => purchase.accountId === account.id,
    );
    let pushedForAccount = 0;
    for (const purchase of purchases) {
      if (purchase.amount < 0) {
        // Nessie has no reversal, which is precisely why the refund lives in our
        // ledger and the demo talks about the ledger being the system of record.
        skipped.refunds += 1;
        continue;
      }
      if (limit > 0 && pushedForAccount >= limit) {
        skipped.purchases += 1;
        continue;
      }
      const remoteMerchantId = merchantIds.get(purchase.merchantId);
      if (remoteMerchantId === undefined) {
        skipped.purchases += 1;
        continue;
      }
      await attempt(`purchase ${purchase.id}`, async () => {
        await client.createPurchase(remoteAccountId, {
          merchant_id: remoteMerchantId,
          medium: purchase.medium,
          purchase_date: purchase.date,
          amount: purchase.amount,
          status: purchase.status,
          description: purchase.description,
        });
        counts.purchases += 1;
        pushedForAccount += 1;
      });
      if (counts.purchases % PROGRESS_EVERY === 0) {
        console.log(`purchases: ${counts.purchases} pushed`);
      }
    }

    for (const deposit of dataset.deposits.filter(
      (row) => row.accountId === account.id,
    )) {
      await attempt(`deposit ${deposit.id}`, async () => {
        await client.createDeposit(remoteAccountId, {
          medium: deposit.medium,
          transaction_date: deposit.date,
          amount: deposit.amount,
          status: deposit.status,
          description: deposit.description,
        });
        counts.deposits += 1;
      });
    }

    for (const bill of dataset.bills.filter(
      (row) => row.accountId === account.id,
    )) {
      await attempt(`bill ${bill.id}`, async () => {
        await client.createBill(remoteAccountId, {
          status: bill.status,
          payee: bill.payee,
          nickname: bill.nickname,
          payment_date: bill.paymentDate,
          recurring_date: bill.recurringDate,
          payment_amount: bill.paymentAmount,
          creation_date: bill.creationDate,
          upcoming_payment_date: bill.upcomingPaymentDate,
        });
        counts.bills += 1;
      });
    }
  }

  state.nessie = {
    pushedAt: new Date().toISOString(),
    customers: Object.fromEntries(customerIds),
    accounts: Object.fromEntries(accountIds),
    merchants: Object.fromEntries(merchantIds),
    counts: { ...counts },
    skipped: { ...skipped },
  };
  await Bun.write(STATE_FILE, `${JSON.stringify(state, null, 2)}\n`);

  console.log("");
  console.log(
    `nessie: ${counts.customers} customers, ${counts.accounts} accounts, ${counts.merchants} merchants, ${counts.purchases} purchases, ${counts.deposits} deposits, ${counts.bills} bills`,
  );
  console.log(
    `nessie skipped: ${skipped.purchases} over the limit, ${skipped.refunds} refunds (no reversal in Nessie), ${skipped.failures} failures`,
  );
  for (const error of firstErrors) {
    console.log(`  first failure: ${error}`);
  }
  if (skipped.failures > 0) {
    failed = true;
  }
}

// Report.
console.log("");
console.log(
  `seed ${dataset.seed}, window ${dataset.window.from} to ${dataset.window.to}`,
);
for (const [entity, count] of Object.entries(summary.counts)) {
  console.log(`  ${entity.padEnd(12)} ${count}`);
}
console.log(`  spend        ${summary.totals.spend.toFixed(2)} MXN`);
console.log(`  income       ${summary.totals.income.toFixed(2)} MXN`);
console.log("");
console.log(`hero account (the demo opens here): ${summary.heroAccountId}`);
console.log(`demo accounts: ${summary.demoAccountIds.join(", ")}`);
console.log(`ids written to .seed/ids.json`);

process.exit(failed ? 1 : 0);
