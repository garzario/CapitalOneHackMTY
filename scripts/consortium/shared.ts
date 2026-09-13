/**
 * What the three `consortium:*` scripts have in common, in one place.
 *
 * The reason it is one place: each of the three refuses for the same reasons, and
 * a refusal that reads differently in three scripts is a refusal a teammate at
 * 03:00 has to debug three times. Every exit here names the variable or the
 * command that fixes it.
 *
 * Nothing in this file reads a secret into a log line. The private key is read
 * from a path and never printed, the salt is never printed, and the only thing
 * said about the account is its identifier, which is in `.env.example` as a name
 * and is not a credential.
 */

import {
  type ConsortiumEnv,
  readConsortiumEnv,
  SnowflakeClient,
  type SnowflakeConfig,
  warehouseRefusal,
} from "../../packages/consortium/src/index.ts";
import type { SentryOneDataset } from "../../packages/seed/src/index.ts";
import {
  DEMO_COMPANY,
  generateSentryOne,
} from "../../packages/seed/src/index.ts";

/**
 * The seed the demo network and the demo company share.
 *
 * Restated here rather than imported from `@hackmty/consortium` so the three
 * scripts read one default: the network's `DEMO_SEED` and the company's
 * `SENTRYONE_DEFAULT_SEED` are the same number by design, and the assertion that
 * they stay the same lives in `packages/consortium/src/synthetic.test.ts`.
 */
export const DEFAULT_SEED = 69;

export interface Flags {
  seed: number;
  /** `--offline` on the pull: fill the snapshot from the generator, no Snowflake. */
  offline: boolean;
  /** `--reset` on the seed: empty the warehouse table before loading it. */
  reset: boolean;
  /** `--week=YYYY-MM-DD`, any day of the payment-run week. */
  week?: string;
  help: boolean;
}

export function readFlags(argv: readonly string[]): Flags {
  const value = (name: string): string | undefined =>
    argv.find((arg) => arg.startsWith(`--${name}=`))?.split("=")[1];
  const seed = Number(value("seed"));

  const flags: Flags = {
    seed: Number.isInteger(seed) ? seed : DEFAULT_SEED,
    offline: argv.includes("--offline"),
    reset: argv.includes("--reset"),
    help: argv.includes("--help") || argv.includes("-h"),
  };
  const week = value("week");
  if (week !== undefined) {
    flags.week = week;
  }
  return flags;
}

/**
 * The environment, or an exit that says which variable is empty.
 *
 * `ALLOW_CONSORTIUM` is checked before anything else and is reported as a choice
 * rather than as an error: a teammate who has not opted into the network has not
 * misconfigured anything.
 */
export function requireEnv(options: { warehouse: boolean }): ConsortiumEnv {
  const env = readConsortiumEnv();
  if (!env.allowed) {
    console.error(
      "ALLOW_CONSORTIUM=1 is not set in .env, so this command will not touch the consortium.",
    );
    console.error(
      "That is a choice and not a misconfiguration: the network is off by default.",
    );
    process.exit(1);
  }
  if (!options.warehouse) {
    return env;
  }
  const refusal = warehouseRefusal(env);
  if (refusal !== undefined) {
    console.error(refusal);
    console.error(
      "Create the Snowflake trial account, add the key pair to the user, and fill those three in.",
    );
    console.error(
      "Offline alternative that needs no account: bun run consortium:pull --offline",
    );
    process.exit(1);
  }
  return env;
}

/**
 * A client for the configured account.
 *
 * The PEM is read from `SNOWFLAKE_PRIVATE_KEY_PATH`, which points OUTSIDE the
 * repository, and it is never echoed: a key in a terminal is a key in a screen
 * recording, and this terminal is the one that gets projected.
 */
export async function clientFor(env: ConsortiumEnv): Promise<SnowflakeClient> {
  const path = env.privateKeyPath as string;
  const file = Bun.file(path);
  if (!(await file.exists())) {
    console.error(
      `SNOWFLAKE_PRIVATE_KEY_PATH points at ${path}, and there is no file there.`,
    );
    console.error(
      "It must be an unencrypted PKCS8 PEM, stored outside this repository.",
    );
    process.exit(1);
  }

  const config: SnowflakeConfig = {
    account: env.account as string,
    user: env.user as string,
    privateKeyPem: await file.text(),
  };
  for (const [field, value] of [
    ["role", env.role],
    ["warehouse", env.warehouse],
    ["database", env.database],
    ["schema", env.schema],
  ] as const) {
    if (value !== undefined) {
      config[field] = value;
    }
  }
  return new SnowflakeClient(config);
}

/** The DDL options the environment names, so a statement is built once. */
export function ddlOptions(env: ConsortiumEnv): {
  database?: string;
  schema?: string;
} {
  return {
    ...(env.database === undefined ? {} : { database: env.database }),
    ...(env.schema === undefined ? {} : { schema: env.schema }),
  };
}

/**
 * The demo company, generated rather than read from a database.
 *
 * Deterministic from the seed, so `consortium:seed` and `consortium:pull
 * --offline` build the same network on two laptops and neither of them needs
 * Postgres to be up. The RFCs and the CLABEs never leave this process: they go
 * straight into `hashPair`.
 */
export function company(flags: Flags): SentryOneDataset {
  return generateSentryOne({
    seed: flags.seed,
    ...(flags.week === undefined ? {} : { weekOf: flags.week }),
  });
}

/** This tenant's own RFC, which is hashed and never sent in the clear. */
export const TENANT_RFC = DEMO_COMPANY.rfc;

/** The day the payment run is prepared, which the network counts history back from. */
export function runDay(dataset: SentryOneDataset): string {
  return dataset.runDay;
}

/** A count with its noun, so a summary line reads. */
export function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

export function messageOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}
