/**
 * The seam between the consortium and everything in this workspace that reads
 * it, built like `src/cep.ts` next door and injected through `ApiDeps` the same
 * way.
 *
 * It owns exactly three decisions, and they are all decisions a transport layer
 * has to make rather than rules the product owns:
 *
 * 1. **The network is off unless `ALLOW_CONSORTIUM=1`.** A cross-tenant store is
 *    not something a fresh clone should reach, even a read-only local projection
 *    of one, so the flag is the same shape as `ALLOW_CEP_FETCH` and `ALLOW_SEED`.
 *    With it off, every lookup answers `NOT_CONSULTED` and the endpoint answers
 *    503 naming the flag, which is an honest "this server will not" rather than a
 *    404 that pretends the route does not exist.
 * 2. **The hashing happens here and nowhere else in this workspace.** The raw RFC
 *    and the raw CLABE reach `hashPair` and stop: the repository interface takes
 *    hashes, so no route and no query can accidentally be the thing that puts an
 *    account number into the consortium's half of the database.
 * 3. **Nothing here ever reaches Snowflake.** The whole point of the local
 *    snapshot is that a payment decision never waits on a warehouse, so this file
 *    imports the hashing from `@hackmty/consortium` and not the client. `bun run
 *    consortium:pull` is the only thing in the repository that opens that socket,
 *    and it runs on a laptop rather than inside a request.
 *
 * The three-state answer in `ConsortiumLookup` is carried all the way out to the
 * `NetworkSignal`: an account the network was consulted about and has never seen
 * is `source: "snapshot"` with `tenants: 0`, which is a real and useful answer,
 * and it must never be flattened into the `not_consulted` that means the network
 * was not read at all.
 */

import { hashPair } from "@hackmty/consortium";
import type { NetworkSignal } from "@hackmty/core";
import { NOT_CONSULTED } from "@hackmty/core";
import type { ConsortiumLookup, Repository } from "./repo";

/** Why a caller got no signal. The route turns each of these into a status. */
export type ConsortiumMiss =
  /** `ALLOW_CONSORTIUM` is not 1 on this server. */
  | "disabled"
  /** The flag is on and nothing has ever been pulled into the snapshot. */
  | "not_pulled"
  /** The snapshot is there and the network has never seen this pair. */
  | "unknown";

export type ConsortiumAnswer =
  | { ok: true; signal: NetworkSignal }
  | { ok: false; miss: ConsortiumMiss; signal: NetworkSignal; message: string };

export interface ConsortiumSource {
  /** True when `ALLOW_CONSORTIUM=1`, read once at wiring time. */
  readonly enabled: boolean;
  /**
   * The signal for one pair, with the reason when there is none.
   *
   * Never throws and never reaches the network. A caller that only wants a signal
   * to hand the engine reads `.signal`, which is `NOT_CONSULTED` on every miss.
   */
  lookup(pair: { rfc: string; clabe: string }): Promise<ConsortiumAnswer>;
}

export const DISABLED_MESSAGE =
  "The SentryOne consortium is off on this server. Set ALLOW_CONSORTIUM=1 to turn it on; see packages/consortium/README.md for what the network holds and what it does not.";

export const NOT_PULLED_MESSAGE =
  "The local consortium snapshot is empty on this server, so the network has not been consulted. Run: bun run consortium:pull";

function unknownMessage(rfc: string): string {
  return `The consortium has never seen this account for ${rfc}. That is an answer and not a failure: the network was consulted and holds nothing for this pair.`;
}

function readEnv(name: string): string | undefined {
  const holder = globalThis as {
    process?: { env?: Record<string, string | undefined> };
  };
  const value = holder.process?.env?.[name];
  return value === undefined || value.trim() === "" ? undefined : value.trim();
}

/**
 * The `NetworkSignal` one lookup becomes.
 *
 * Exported and pure so the mapping from three stored facts to one domain object
 * can be asserted without a repository: the `tenants: 0` on a consulted-but-unseen
 * pair is the value most likely to be broken by a well-meaning refactor, and it is
 * the one that changes what the screen claims.
 */
export function signalFrom(lookup: ConsortiumLookup): NetworkSignal {
  const { pull, pair } = lookup;
  if (pull === undefined) {
    return NOT_CONSULTED;
  }
  if (pair === undefined) {
    return {
      source: "snapshot",
      tenants: 0,
      fraudReports: 0,
      /* Every account the network holds for this RFC is another account, because
         this one is not among them. This is the impersonation number. */
      otherAccounts: lookup.accountsForRfc,
      pulledAt: pull.pulledAt,
    };
  }
  return {
    source: "snapshot",
    tenants: pair.tenants,
    firstSeen: pair.firstSeen,
    lastSeen: pair.lastSeen,
    fraudReports: pair.fraudReports,
    otherAccounts: pair.otherAccounts,
    pulledAt: pull.pulledAt,
  };
}

export interface ConsortiumSourceOptions {
  /** Defaults to `ALLOW_CONSORTIUM=1`. */
  allowed?: boolean;
  /** Defaults to `CONSORTIUM_SALT`, then to the documented demo value. */
  salt?: string;
}

/**
 * The source this process boots with, bound to one repository.
 *
 * The environment is read once, at wiring time, so a request can never be the
 * thing that discovers the server is misconfigured. Same rule as
 * `createCepSource` and `createExtractor`.
 */
export function createConsortiumSource(
  repo: Repository,
  options: ConsortiumSourceOptions = {},
): ConsortiumSource {
  const enabled = options.allowed ?? readEnv("ALLOW_CONSORTIUM") === "1";
  const hashing = options.salt === undefined ? {} : { salt: options.salt };

  if (!enabled) {
    return offConsortiumSource();
  }

  return {
    enabled: true,
    lookup: async (pair) => {
      const { rfcHash, clabeHash } = hashPair(pair, hashing);
      const lookup = await repo.consortiumLookup(rfcHash, clabeHash);
      if (lookup.pull === undefined) {
        return {
          ok: false,
          miss: "not_pulled",
          signal: NOT_CONSULTED,
          message: NOT_PULLED_MESSAGE,
        };
      }
      const signal = signalFrom(lookup);
      if (lookup.pair === undefined) {
        /* A miss for the endpoint, which answers 404, and still a usable signal
           for the engine: "consulted, never seen" is not "not consulted". */
        return {
          ok: false,
          miss: "unknown",
          signal,
          message: unknownMessage(pair.rfc),
        };
      }
      return { ok: true, signal };
    },
  };
}

/**
 * The source a server without the flag gets, and the one every test that is not
 * about the consortium gets.
 *
 * It touches no repository at all, which is the honest shape of "this server will
 * not consult the network": there is nothing to read, so there is nothing to
 * connect to.
 */
export function offConsortiumSource(): ConsortiumSource {
  return {
    enabled: false,
    lookup: async () => ({
      ok: false,
      miss: "disabled",
      signal: NOT_CONSULTED,
      message: DISABLED_MESSAGE,
    }),
  };
}
