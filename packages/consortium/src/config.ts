/**
 * Reading the consortium's configuration out of the environment, once, with the
 * refusals stated as sentences a teammate can act on.
 *
 * Two rules live here and nowhere else.
 *
 * 1. **`ALLOW_CONSORTIUM=1` or nothing happens.** The network is off by default,
 *    exactly like `ALLOW_CEP_FETCH` and `ALLOW_SEED`: a cross-tenant warehouse
 *    that a fresh clone reaches out to on boot is not a default anybody chose.
 *    Every script and the API check this, and the API answers 503 with the name
 *    of the flag rather than pretending the route does not exist.
 * 2. **The private key is read from a path, never from a variable.** A PKCS8 PEM
 *    is multi-line and a PEM in an `.env` is a PEM in a screenshot; the path
 *    points outside the repository and `bun run scrub` has nothing to find.
 */

export const CONSORTIUM_FLAG = "ALLOW_CONSORTIUM";

export interface ConsortiumEnv {
  account?: string;
  user?: string;
  privateKeyPath?: string;
  role?: string;
  warehouse?: string;
  database?: string;
  schema?: string;
  allowed: boolean;
  salt?: string;
}

function readEnv(
  env: Readonly<Record<string, string | undefined>>,
  name: string,
): string | undefined {
  const value = env[name];
  return value === undefined || value.trim() === "" ? undefined : value.trim();
}

/**
 * The environment as this package reads it. Pure over its argument so the doctor
 * check and the scripts can both be tested without touching the real process.
 */
export function readConsortiumEnv(
  env: Readonly<Record<string, string | undefined>> = globalEnv(),
): ConsortiumEnv {
  const result: ConsortiumEnv = {
    allowed: readEnv(env, CONSORTIUM_FLAG) === "1",
  };
  const optional = {
    account: "SNOWFLAKE_ACCOUNT",
    user: "SNOWFLAKE_USER",
    privateKeyPath: "SNOWFLAKE_PRIVATE_KEY_PATH",
    role: "SNOWFLAKE_ROLE",
    warehouse: "SNOWFLAKE_WAREHOUSE",
    database: "SNOWFLAKE_DATABASE",
    schema: "SNOWFLAKE_SCHEMA",
    salt: "CONSORTIUM_SALT",
  } as const;
  for (const [field, name] of Object.entries(optional)) {
    const value = readEnv(env, name);
    if (value !== undefined) {
      result[field as keyof typeof optional] = value;
    }
  }
  return result;
}

function globalEnv(): Readonly<Record<string, string | undefined>> {
  const holder = globalThis as {
    process?: { env?: Record<string, string | undefined> };
  };
  return holder.process?.env ?? {};
}

/** Why the warehouse cannot be reached, as one sentence, or undefined when it can. */
export function warehouseRefusal(env: ConsortiumEnv): string | undefined {
  if (!env.allowed) {
    return `${CONSORTIUM_FLAG}=1 is not set, so this command will not reach the consortium warehouse.`;
  }
  const missing = [
    env.account === undefined ? "SNOWFLAKE_ACCOUNT" : undefined,
    env.user === undefined ? "SNOWFLAKE_USER" : undefined,
    env.privateKeyPath === undefined ? "SNOWFLAKE_PRIVATE_KEY_PATH" : undefined,
  ].filter((name): name is string => name !== undefined);

  return missing.length === 0
    ? undefined
    : `${missing.join(", ")} ${missing.length === 1 ? "is" : "are"} empty in .env, so there is no Snowflake account to reach yet.`;
}
