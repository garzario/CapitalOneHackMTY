/**
 * What this instance was configured with, in one place, so `GET /health` and
 * `bun run doctor` answer the same lines about the same seven capabilities.
 *
 * The reason it is one module and not two is the reason `packages/core/src/levels.ts`
 * is one module: a fact derived in two places is a fact that eventually disagrees
 * with itself, and "the deployed API cannot reach Tiger Data" is the single worst
 * thing to learn from two sources that contradict each other at 04:00. The terminal
 * and the endpoint read the same function over the same inputs here, and
 * `dependencies.test.ts` is what holds them to it.
 *
 * Three rules are load-bearing and all three are tested.
 *
 * 1. **No secret is ever in the report.** `configured` is a boolean and never a
 *    value, a length or a fingerprint, and every `detail` names VARIABLES rather
 *    than what they hold. The same argument `GET /api/v1/rails` makes in its own
 *    comment: a health payload is the thing somebody extends without thinking, so
 *    the rule is written down next to the code that could break it.
 * 2. **It may not touch a third party.** `docs/09-api.md` says so in those words and
 *    the route comment has said it since the first day: a health check that depends
 *    on the Banxico portal restarts the container when the Banxico portal is slow.
 *    Exactly two things are probed, both of them cheap, bounded and ours: a
 *    `select 1` against the ledger, and building the payment rail, which is local
 *    work. Every other row reports what the process holds, and its `detail` says
 *    "not probed from here" rather than implying a check nobody ran.
 * 3. **A driver message never reaches the wire.** A failed probe is classified into
 *    one of five sentences by `databaseReason`. The raw message stays in the server
 *    log next to the request id, which is the rule `src/http.ts` already states for
 *    every other failure.
 *
 * `up` therefore means "this instance holds what the capability needs, and where
 * there is something cheap to check, the check passed". It is not a claim that a
 * third party answered, and no `detail` says it is.
 */

import type { RailId } from "@hackmty/core";
import { getSql, type ProbeResult, probe } from "@hackmty/db";
import type { RailResolution } from "@hackmty/rail";
import { NO_RAIL } from "@hackmty/rail";
import { DISABLED_MESSAGE } from "./consortium";

/** The order the endpoint answers in and the doctor prints in. */
export const DEPENDENCY_NAMES = [
  "database",
  "nessie",
  "rail",
  "consortium",
  "cep",
  "extraction",
  "voice",
] as const;

export type DependencyName = (typeof DEPENDENCY_NAMES)[number];

/**
 * `not_configured` is a statement about this deployment and never a failure, which
 * is the same distinction `503 service_unavailable` draws against a `403`.
 */
export type DependencyState = "up" | "down" | "not_configured";

export interface Dependency {
  name: DependencyName;
  /** Whether the variables exist. NEVER what they contain. */
  configured: boolean;
  state: DependencyState;
  /** One sentence, naming variables and never values. Always present. */
  detail: string;
  checkedAt: string;
}

/** The probe is bounded so a dead host answers `down` instead of hanging. */
export const DEPENDENCY_PROBE_TIMEOUT_MS = 2000;

/**
 * Which variables this process holds, read once at wiring time.
 *
 * Booleans only, on purpose: there is no field on this object that could carry a
 * key into a response, which is a stronger guarantee than remembering not to print
 * one.
 */
export interface DependencyConfig {
  /** `DATABASE_URL`, the ledger on Tiger Data. */
  database: boolean;
  /** `NESSIE_API_KEY`, the company bank mirror. */
  nessie: boolean;
  /** `GEMINI_API_KEY`, read by the intake extraction and by the assistant panel. */
  gemini: boolean;
  /** All three `ELEVENLABS_*` ids. Fewer than three cannot dial. */
  voice: boolean;
  /** `ALLOW_CONSORTIUM=1`, the flag that opens the cross-tenant network. */
  consortium: boolean;
  /** A Snowflake account and a key path are named, so a pull is possible. */
  snowflake: boolean;
  /** `ALLOW_CEP_FETCH=1`, the Banxico portal. */
  cepFetch: boolean;
  /** `BANXICO_CEP_CERT_PEM`, without which a seal stays `not_checked`. */
  cepSeal: boolean;
}

export type EnvLike = Readonly<Record<string, string | undefined>>;

function has(env: EnvLike, name: string): boolean {
  const value = env[name];
  return value !== undefined && value.trim() !== "";
}

function flagged(env: EnvLike, name: string): boolean {
  return env[name]?.trim() === "1";
}

/** The three ids the verification call needs, named so a detail can list them. */
export const VOICE_VARIABLES = [
  "ELEVENLABS_API_KEY",
  "ELEVENLABS_AGENT_ID",
  "ELEVENLABS_PHONE_NUMBER_ID",
] as const;

export function readDependencyConfig(env: EnvLike): DependencyConfig {
  return {
    database: has(env, "DATABASE_URL"),
    nessie: has(env, "NESSIE_API_KEY"),
    gemini: has(env, "GEMINI_API_KEY"),
    voice: VOICE_VARIABLES.every((name) => has(env, name)),
    consortium: flagged(env, "ALLOW_CONSORTIUM"),
    snowflake:
      has(env, "SNOWFLAKE_ACCOUNT") && has(env, "SNOWFLAKE_PRIVATE_KEY_PATH"),
    cepFetch: flagged(env, "ALLOW_CEP_FETCH"),
    cepSeal: has(env, "BANXICO_CEP_CERT_PEM"),
  };
}

/** Nothing configured. The shape a test pins, and the shape a fresh clone has. */
export function emptyDependencyConfig(): DependencyConfig {
  return readDependencyConfig({});
}

/**
 * The rail, as the report needs it: which one this process built, or why none.
 *
 * Derived from the resolution and never from the environment, so a test that pins
 * `rail` gets a report about the rail it pinned. `NO_RAIL` is the one message that
 * means "nothing was named at all", which is the line between `not_configured` and
 * a rail that was named and could not be built.
 */
export interface RailFacts {
  active: RailId | null;
  message?: string;
}

export function railFactsOf(resolution: RailResolution): RailFacts {
  return resolution.ok
    ? { active: resolution.rail.rail }
    : { active: null, message: resolution.message };
}

export interface DependencyFacts {
  config: DependencyConfig;
  /** Absent when there is no `DATABASE_URL`, because then there is nothing to probe. */
  database?: ProbeResult;
  rail: RailFacts;
  checkedAt: string;
}

/**
 * Turns a failed probe into a sentence a clerk and a judge can read, and keeps the
 * driver's own message off the wire.
 *
 * Five cases, because they take five different actions: the host is not listening,
 * the name does not resolve, the credentials were refused, it did not answer inside
 * the timeout, or something else happened and the sentence for that one is in the
 * server log under the request id.
 */
export function databaseReason(probed: ProbeResult): string {
  const raw = probed.error ?? "";
  if (/no answer in \d+ms/.test(raw)) {
    return `The ledger did not answer a select 1 inside ${DEPENDENCY_PROBE_TIMEOUT_MS} ms.`;
  }
  if (raw.includes("ECONNREFUSED")) {
    return "The ledger host refused the connection. Nothing is listening on the port DATABASE_URL names.";
  }
  if (raw.includes("ENOTFOUND") || raw.includes("getaddrinfo")) {
    return "The host DATABASE_URL names did not resolve.";
  }
  if (/password|authentication|SASL/i.test(raw)) {
    return "The ledger refused the credentials in DATABASE_URL.";
  }
  return "The ledger answered a select 1 with an error. The sentence is in the server log, under this request id.";
}

/**
 * One row per capability, pure over its inputs.
 *
 * Pure is what makes it the same answer in the terminal and on the wire, and it is
 * also what lets `dependencies.test.ts` assert that a configuration full of fake
 * keys produces a report that carries none of them.
 */
export function dependencyReport(facts: DependencyFacts): Dependency[] {
  const { config, database, rail, checkedAt } = facts;
  const at = checkedAt;

  const rows: Omit<Dependency, "checkedAt">[] = [
    databaseRow(config, database),
    {
      name: "nessie",
      configured: config.nessie,
      state: config.nessie ? "up" : "not_configured",
      detail: config.nessie
        ? "NESSIE_API_KEY is set, and the company bank mirror is read through packages/nessie. Not probed from here: /health never reaches a third party."
        : "NESSIE_API_KEY is empty, so the bank mirror has no upstream and control 6 reports payment_not_in_mirror on every line.",
    },
    railRow(rail),
    {
      name: "consortium",
      configured: config.consortium,
      state: config.consortium ? "up" : "not_configured",
      detail: config.consortium
        ? `ALLOW_CONSORTIUM is on, and the engine reads the LOCAL consortium_snapshot table rather than the warehouse, so a decision never waits on Snowflake. ${
            config.snowflake
              ? "SNOWFLAKE_ACCOUNT and SNOWFLAKE_PRIVATE_KEY_PATH are named, so bun run consortium:pull can refill the snapshot from here."
              : "No SNOWFLAKE_ACCOUNT and key path are named here, so this instance reads the snapshot and cannot refill it."
          }`
        : DISABLED_MESSAGE,
    },
    cepRow(config),
    {
      name: "extraction",
      configured: config.gemini,
      state: config.gemini ? "up" : "not_configured",
      detail: config.gemini
        ? "GEMINI_API_KEY is set. It is read by the photo and voice-note intake through packages/extract, which is transcription only under ADR-0004, and by the assistant panel, which reads and proposes under ADR-0007. Not probed from here."
        : "GEMINI_API_KEY is empty: an image or a voice note on POST /api/v1/instructions answers 422 and so does the assistant panel. Typed intake and every other endpoint are unaffected.",
    },
    voiceRow(config),
  ];

  return rows.map((row) => ({ ...row, checkedAt: at }));
}

function databaseRow(
  config: DependencyConfig,
  database: ProbeResult | undefined,
): Omit<Dependency, "checkedAt"> {
  if (!config.database) {
    return {
      name: "database",
      configured: false,
      state: "not_configured",
      detail:
        "DATABASE_URL is empty, so this instance holds no ledger and serves the generated company out of memory. Nothing survives a restart.",
    };
  }
  if (database === undefined) {
    return {
      name: "database",
      configured: true,
      state: "down",
      detail:
        "DATABASE_URL is set and this instance did not probe it, which is a wiring bug rather than a database fault.",
    };
  }
  return database.ok
    ? {
        name: "database",
        configured: true,
        state: "up",
        detail: `The ledger answered a select 1 in ${database.ms} ms.`,
      }
    : {
        name: "database",
        configured: true,
        state: "down",
        detail: databaseReason(database),
      };
}

function railRow(rail: RailFacts): Omit<Dependency, "checkedAt"> {
  if (rail.active !== null) {
    return {
      name: "rail",
      configured: true,
      state: "up",
      detail: `This process built the ${rail.active} rail, so the one-cent verification and the payment run can leave from here. GET /api/v1/rails says which rails this build has and which of them has ever moved money.`,
    };
  }
  /* `NO_RAIL` is the one message that means nothing was named at all. Anything
     else is a rail somebody did name and this process could not build, which is a
     typo or a missing variable and has to read as a fault rather than a choice. */
  const named = rail.message !== undefined && rail.message !== NO_RAIL;
  return {
    name: "rail",
    configured: named,
    state: named ? "down" : "not_configured",
    detail: rail.message ?? NO_RAIL,
  };
}

/**
 * The CEP is the one capability that always answers something, so it is never
 * `not_configured`: `accept` parses a pasted XML with no key, no certificate and no
 * network, and that is the primary path in `docs/09-api.md` and the one the demo
 * uses. What the two flags change is how far the check goes, and the detail says
 * which halves are on rather than rounding the row to a colour.
 */
function cepRow(config: DependencyConfig): Omit<Dependency, "checkedAt"> {
  return {
    name: "cep",
    configured: true,
    state: "up",
    detail: `A pasted CEP is always accepted and parsed here. Banxico retrieval is ${
      config.cepFetch ? "on" : "off (ALLOW_CEP_FETCH=1 turns it on)"
    }, and the Banxico seal ${
      config.cepSeal
        ? "is checked, because a certificate is configured"
        : "stays not_checked, because no BANXICO_CEP_CERT_PEM is configured"
    }.`,
  };
}

function voiceRow(config: DependencyConfig): Omit<Dependency, "checkedAt"> {
  return {
    name: "voice",
    configured: config.voice,
    state: config.voice ? "up" : "not_configured",
    detail: config.voice
      ? `${VOICE_VARIABLES.join(", ")} are all set, so the verification call can dial through packages/voice. Not probed from here.`
      : `Fewer than three of ${VOICE_VARIABLES.join(", ")} are set, so POST /api/v1/instructions/:id/verify-call answers 422 with the script and the clerk reads it on their own telephone. The call degrading is not a failure of this instance.`,
  };
}

/**
 * Where the report gets its two probes. Injected so a test never opens a socket.
 */
export interface DependencySource {
  readonly config: DependencyConfig;
  /**
   * The one probe `/health` may run. Bounded, never throws, and `undefined` when
   * there is no `DATABASE_URL`, because then there is nothing to probe.
   */
  database(): Promise<ProbeResult | undefined>;
}

function processEnv(): EnvLike {
  const holder = globalThis as {
    process?: { env?: Record<string, string | undefined> };
  };
  return holder.process?.env ?? {};
}

/**
 * The real source. The connection is the one `@hackmty/db` already memoizes, so a
 * health check does not open a pool of its own.
 */
export function createDependencySource(
  env: EnvLike = processEnv(),
): DependencySource {
  const config = readDependencyConfig(env);

  return {
    config,
    database: async () =>
      config.database
        ? probe(getSql(), DEPENDENCY_PROBE_TIMEOUT_MS)
        : undefined,
  };
}

/** A source with no probe and no socket, for the suite and for `bun run demo`. */
export function staticDependencySource(
  config: DependencyConfig = emptyDependencyConfig(),
  database?: ProbeResult,
): DependencySource {
  return { config, database: async () => database };
}

/** The report, gathering both probes. Never throws: a health check may not. */
export async function readDependencies(input: {
  source: DependencySource;
  rail: RailFacts;
  checkedAt: string;
}): Promise<Dependency[]> {
  const database = await input.source.database().catch(
    (cause): ProbeResult => ({
      ok: false,
      ms: 0,
      error: cause instanceof Error ? cause.message : String(cause),
    }),
  );

  return dependencyReport({
    config: input.source.config,
    ...(database === undefined ? {} : { database }),
    rail: input.rail,
    checkedAt: input.checkedAt,
  });
}
