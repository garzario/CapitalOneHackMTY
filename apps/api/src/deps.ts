/**
 * What every route needs, assembled in one place and passed in explicitly.
 *
 * No module-level singleton and no service locator: `createApp(deps)` takes
 * these, so a test builds an app with its own repository and its own clock and
 * two tests can never see each other's writes. That is also what makes swapping
 * `MemoryRepository` for the Postgres one a one-line change here instead of a
 * change in nine route files.
 */

import type { LedgerEvent } from "@hackmty/core";
import { getSql } from "@hackmty/db";
import { type RailResolution, resolveRail } from "@hackmty/rail";
import { officialSatIndex, type SatIndex } from "@hackmty/sat";
import { type AssistantModel, createAssistantModel } from "./assistant/model";
import {
  type CepInbox,
  type CepSource,
  committedCepInbox,
  createCepSource,
} from "./cep";
import { type ConsortiumSource, createConsortiumSource } from "./consortium";
import { createDependencySource, type DependencySource } from "./dependencies";
import { createBroadcaster, type LedgerBroadcaster } from "./events";
import { createExtractor, type IntakeExtractor } from "./extraction";
import type { LogSink } from "./middleware/log";
import { createClock, type PipelineClock } from "./pipeline";
import { PostgresRepository } from "./postgres-repo";
import { MemoryRepository, type Repository } from "./repo";
import { sentryoneDataset, wantsSentryOne } from "./sentryone";
import {
  defaultVerificationOptions,
  type VerificationOptions,
} from "./verification";

export interface ApiDeps {
  repo: Repository;
  events: LedgerBroadcaster;
  clock: PipelineClock;
  /**
   * The official Article 69-B list, read-only, for `GET /api/v1/sat/lookup`.
   *
   * It is a function and not an index because the committed snapshot is 14234
   * taxpayers: an API that never receives a lookup never parses it, and one that
   * does parses it once. A failure is not swallowed into an empty index, because
   * "not listed" is the one answer this endpoint must never invent.
   */
  satList(): Promise<SatIndex>;
  /** `POST /api/v1/seed` only answers when this is true. Dev and demo only. */
  allowSeed: boolean;
  /**
   * Reads a CLABE off a photo or a voice note. Transcription only, never a
   * decision: see `packages/extract/README.md`. It refuses everything when the
   * server holds no `GEMINI_API_KEY`, which is also how the tests run it.
   */
  extractor: IntakeExtractor;
  /**
   * The model behind the assistant panel: Gemini with function calling over the
   * read tools in `src/assistant/tools.ts`.
   *
   * It is injected for the same reason the extractor is, and the consequence is the
   * same: `bun test` drives the whole panel against a scripted model with no key and
   * no socket. A server with no `GEMINI_API_KEY` gets the refusing one and
   * `POST /api/v1/assistant/messages` answers 422 naming the variable, which is the
   * behaviour docs/09-api.md promises and the behaviour CI exercises.
   */
  model: AssistantModel;
  /**
   * Retrieves and checks a Banxico CEP. Pasted XML is always accepted; reaching
   * the portal needs `ALLOW_CEP_FETCH=1` and checking the seal needs
   * `BANXICO_CEP_CERT_PEM`. See `src/cep.ts` for why both are opt-in.
   */
  cep: CepSource;
  /**
   * Where a CEP is looked for by clave de rastreo before Banxico is asked: the
   * documents committed to this repository. `bun run demo` hands in its own.
   */
  cepInbox: CepInbox;
  /**
   * The rail the one-cent verification leaves on, or the reason this server has
   * none.
   *
   * A function and not a value for two reasons. The STP rail names the company as
   * the ordenante and the company comes out of the repository, which is async; and
   * a server with no rail has to be able to say so on a request rather than
   * refusing to boot, because every other endpoint still works. Resolved once and
   * remembered, so a request is never what discovers the configuration.
   */
  rail(): Promise<RailResolution>;
  /** How long the CEP poll waits and how often it asks. See `src/verification.ts`. */
  verification: VerificationOptions;
  /**
   * Reads the LOCAL consortium snapshot for one beneficiary pair, hashing the RFC
   * and the CLABE on the way in. Off unless `ALLOW_CONSORTIUM=1`, and it never
   * reaches Snowflake: `bun run consortium:pull` fills the snapshot and this reads
   * it, which is what keeps a warehouse off the hot path of a payment decision.
   * See `src/consortium.ts`.
   */
  consortium: ConsortiumSource;
  /**
   * What this instance was configured with, and the one probe `GET /health` is
   * allowed to run. Injected for the same reason the extractor is: a test asserts
   * the whole payload with no `DATABASE_URL` and no socket, and a laptop holding a
   * live connection string does not turn a health test into a network call.
   */
  dependencies: DependencySource;
  /**
   * Where a log line goes. One line per request carries the request id, so the id
   * on a response and the id in the container log are the same string.
   *
   * It is injected rather than called as `console.log` so the suite can assert the
   * shape of a line, and so 1341 tests do not print 1341 of them.
   */
  log: LogSink;
  /**
   * Append to the ledger and push to every open SSE connection, in that order.
   * The ledger is the record; the stream is a view of it, so a subscriber can
   * never see an event that was not stored.
   */
  emit(event: LedgerEvent): Promise<void>;
}

export interface DepsOverrides {
  repo?: Repository;
  events?: LedgerBroadcaster;
  clock?: PipelineClock;
  allowSeed?: boolean;
  satList?: () => Promise<SatIndex>;
  extractor?: IntakeExtractor;
  model?: AssistantModel;
  cep?: CepSource;
  cepInbox?: CepInbox;
  rail?: () => Promise<RailResolution>;
  verification?: VerificationOptions;
  consortium?: ConsortiumSource;
  dependencies?: DependencySource;
  log?: LogSink;
}

function readEnv(name: string): string | undefined {
  const holder = globalThis as {
    process?: { env?: Record<string, string | undefined> };
  };
  return holder.process?.env?.[name];
}

let bootNote: string | undefined;

/**
 * Which repository this process actually booted on, for the log line in
 * index.ts. Undefined in a test, which pins its own repository and never goes
 * through `bootRepository`.
 */
export function repositoryBootNote(): string | undefined {
  return bootNote;
}

/**
 * Names the host and the database of a connection string, and never anything
 * before the `@`. A password in a log line is a password in a screenshot, and
 * this line is printed on a laptop that is being projected.
 */
function describeDatabaseUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const database = parsed.pathname.replace(/^\//, "");
    return `${parsed.host}/${database}`;
  } catch {
    return "the configured host";
  }
}

/**
 * The repository the process boots with.
 *
 * `DATABASE_URL` wins: the API then answers every endpoint in docs/09-api.md out
 * of Postgres, over the query layer in @hackmty/db, and the event ledger behind
 * it is the one `bun run seed` wrote. With no database, `SEED=sentryone` serves
 * the generated demo company in memory, with `SEED_NUMBER` choosing which one,
 * and anything else keeps the hand-written fixture.
 *
 * A test never reaches this: `createTestApp` pins `MemoryRepository`, so the
 * suite behaves the same on CI, which has no `.env`, and on a laptop configured
 * for a rehearsal.
 */
function bootRepository(): Repository {
  const databaseUrl = readEnv("DATABASE_URL");
  if (databaseUrl !== undefined && databaseUrl.trim() !== "") {
    bootNote = `postgres ${describeDatabaseUrl(databaseUrl.trim())}`;
    return new PostgresRepository(getSql());
  }

  if (!wantsSentryOne(readEnv("SEED"))) {
    bootNote = "memory (fixture)";
    return new MemoryRepository();
  }
  const parsed = Number(readEnv("SEED_NUMBER"));
  const seed = Number.isInteger(parsed) ? parsed : 0;
  bootNote = `memory (sentryone seed ${seed})`;
  return new MemoryRepository(seed, sentryoneDataset);
}

export function createDeps(overrides: DepsOverrides = {}): ApiDeps {
  const repo = overrides.repo ?? bootRepository();
  const events = overrides.events ?? createBroadcaster();
  const clock = overrides.clock ?? createClock();
  const allowSeed = overrides.allowSeed ?? readEnv("ALLOW_SEED") === "1";
  const satList = overrides.satList ?? (() => officialSatIndex());
  const extractor = overrides.extractor ?? createExtractor();
  const model = overrides.model ?? createAssistantModel();
  const cep = overrides.cep ?? createCepSource();
  const cepInbox = overrides.cepInbox ?? committedCepInbox();
  const verification =
    overrides.verification ?? defaultVerificationOptions(readEnv);
  const rail = overrides.rail ?? memoize(() => railFor(repo));
  /* Bound to the repository this process booted with, so the snapshot it reads is
     the one the live store holds rather than a second connection's. */
  const consortium = overrides.consortium ?? createConsortiumSource(repo);
  /* Read once, so a request is never what discovers the configuration, which is the
     same argument `rail` makes two lines up. */
  const dependencies = overrides.dependencies ?? createDependencySource();
  const log = overrides.log ?? ((line: string) => console.log(line));

  return {
    repo,
    events,
    clock,
    satList,
    allowSeed,
    extractor,
    model,
    cep,
    cepInbox,
    rail,
    verification,
    consortium,
    dependencies,
    log,
    async emit(event) {
      await repo.appendEvent(event);
      events.publish(event);
    },
  };
}

/**
 * The rail, with the company as the ordenante.
 *
 * The company is read from the store because an STP order names it, and a rail
 * that named a company nobody configured would be a payment order with an invented
 * sender on it. A store that cannot answer is not a reason to fail the whole
 * resolution: the Nessie rail needs no company at all, so the lookup failing only
 * narrows what can be built.
 */
async function railFor(repo: Repository): Promise<RailResolution> {
  const company = await repo
    .company()
    .then((row) => ({ legalName: row.legalName, rfc: row.rfc }))
    .catch(() => undefined);

  return resolveRail(company === undefined ? {} : { company });
}

/** Resolves once per process. A request is never what discovers the config. */
function memoize<T>(build: () => Promise<T>): () => Promise<T> {
  let pending: Promise<T> | undefined;
  return () => {
    pending ??= build();
    return pending;
  };
}
