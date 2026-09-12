/**
 * bun run consortium:seed
 *
 * Stands the consortium up on Snowflake: the database, the schema,
 * `BENEFICIARY_EVENTS`, the `BENEFICIARY_NETWORK` view, and the synthetic network
 * of other tenants the demo reads.
 *
 * The network it loads is NOT real, and this script says so on every run rather
 * than leaving it to a footnote. SentryOne has one tenant, so there are no other
 * companies to aggregate; what goes up is generated deterministically from the
 * same seed as the demo company, with `synthetic = TRUE` on every row, so a judge
 * can check the claim in the warehouse instead of taking it from a slide. The
 * mechanism is real: the hashing, the JWT, the table, the aggregate and the pull
 * all run against a real account.
 *
 * What leaves this laptop: salted hashes of (RFC, CLABE), a three-digit bank code,
 * one of four outcomes, a calendar day and the synthetic flag. No name, no amount,
 * no invoice, no clave de rastreo. `packages/consortium/src/hash.ts` is the only
 * file that sees the other side of those hashes.
 *
 * Idempotent. Every DDL statement is `if not exists` or `or replace`; the row load
 * is not, so `--reset` empties the table first, which is what a second seed of the
 * same week wants.
 *
 * Flags:
 *   --seed=N             the seed the network and the company share (default 69)
 *   --week=YYYY-MM-DD    any day of the payment-run week the history ends before
 *   --reset              truncate BENEFICIARY_EVENTS before loading
 */

import {
  consortiumDdl,
  insertEvents,
  syntheticNetwork,
  truncateEvents,
} from "../packages/consortium/src/index.ts";
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
      "bun run consortium:seed [--seed=N] [--week=YYYY-MM-DD] [--reset]",
      "",
      "Creates SENTRYONE.CONSORTIUM on Snowflake and loads the SYNTHETIC network of",
      "other tenants the demo reads. Every row carries synthetic = TRUE.",
      "",
      "Needs ALLOW_CONSORTIUM=1, SNOWFLAKE_ACCOUNT, SNOWFLAKE_USER and",
      "SNOWFLAKE_PRIVATE_KEY_PATH. With no account yet, the offline path is:",
      "  bun run consortium:pull --offline",
    ].join("\n"),
  );
  process.exit(0);
}

const env = requireEnv({ warehouse: true });
const client = await clientFor(env);
const options = ddlOptions(env);

const dataset = company(flags);
const network = syntheticNetwork({
  suppliers: dataset.suppliers,
  instructions: dataset.instructions,
  runDay: runDay(dataset),
  seed: flags.seed,
  ...(env.salt === undefined ? {} : { salt: env.salt }),
});

console.log(`consortium:seed  account ${env.account}, seed ${flags.seed}`);
console.log(
  `SYNTHETIC network: ${plural(network.corroborated, "corroborated account")}, ${plural(
    network.reported,
    "reported account",
  )}, ${plural(network.unseen, "account the network never saw")}`,
);
console.log(
  `${plural(network.events.length, "event")} to load, every one of them synthetic = TRUE`,
);
console.log("");

let failed = false;

try {
  for (const statement of consortiumDdl(options)) {
    const name = statement.slice(0, 48).replace(/\s+/g, " ");
    await client.statement(statement);
    console.log(`ok     ${name}...`);
  }

  if (flags.reset) {
    await client.statement(truncateEvents(options));
    console.log("ok     truncate BENEFICIARY_EVENTS");
  }

  const inserts = insertEvents(network.events, options);
  for (const [index, statement] of inserts.entries()) {
    await client.statement(statement);
    console.log(`ok     insert ${index + 1} of ${inserts.length}`);
  }

  console.log("");
  console.log(
    `Loaded ${plural(network.events.length, "synthetic event")}. Next: bun run consortium:push, then bun run consortium:pull`,
  );
} catch (cause) {
  failed = true;
  console.error("");
  console.error(`consortium:seed failed: ${messageOf(cause)}`);
  console.error(
    "Nothing is half applied that matters: the DDL is idempotent and a failed insert",
  );
  console.error("can be re-run with --reset.");
}

process.exit(failed ? 1 : 0);
