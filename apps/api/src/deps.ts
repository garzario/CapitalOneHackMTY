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
import { createBroadcaster, type LedgerBroadcaster } from "./events";
import { createClock, type PipelineClock } from "./pipeline";
import { MemoryRepository, type Repository } from "./repo";

export interface ApiDeps {
  repo: Repository;
  events: LedgerBroadcaster;
  clock: PipelineClock;
  /** `POST /api/v1/seed` only answers when this is true. Dev and demo only. */
  allowSeed: boolean;
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
}

function readEnv(name: string): string | undefined {
  const holder = globalThis as {
    process?: { env?: Record<string, string | undefined> };
  };
  return holder.process?.env?.[name];
}

export function createDeps(overrides: DepsOverrides = {}): ApiDeps {
  const repo = overrides.repo ?? new MemoryRepository();
  const events = overrides.events ?? createBroadcaster();
  const clock = overrides.clock ?? createClock();
  const allowSeed = overrides.allowSeed ?? readEnv("ALLOW_SEED") === "1";

  return {
    repo,
    events,
    clock,
    allowSeed,
    async emit(event) {
      await repo.appendEvent(event);
      events.publish(event);
    },
  };
}
