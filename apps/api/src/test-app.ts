/**
 * Test wiring, imported only by `*.test.ts` files.
 *
 * Each test gets its own app, its own `MemoryRepository` and its own broadcaster,
 * so a test that posts an instruction cannot change what another test reads. The
 * clock is fixed and the ids are sequential, which is what lets a test assert an
 * exact `decidedAt` instead of matching a regular expression against `now`.
 */

import { createApp } from "./app";
import { type ApiDeps, createDeps, type DepsOverrides } from "./deps";
import { UNAVAILABLE_EXTRACTOR } from "./extraction";
import type { PipelineClock } from "./pipeline";
import { MemoryRepository } from "./repo";
import type { VoiceDeps } from "./routes/verify-call";

export const TEST_NOW = "2026-09-12T03:00:00.000Z";

export function createTestClock(now: string = TEST_NOW): PipelineClock {
  let counter = 0;
  return {
    now: () => now,
    newId: (prefix) => `${prefix}-test-${String(++counter).padStart(4, "0")}`,
  };
}

export interface TestHarness {
  app: ReturnType<typeof createApp>;
  deps: ApiDeps;
}

/**
 * Every dependency that `createDeps` would otherwise read out of the process
 * environment is constructed here instead, so the suite gives the same answers
 * on CI and on a laptop whose `.env` bun has already auto-loaded:
 *
 * - `repo` is a fresh `MemoryRepository` over the hand-written fixture, never
 *   the generated company `SEED=ceptinela` boots the server on.
 * - `extractor` is the one a server with no `GEMINI_API_KEY` gets. A developer
 *   with a real key used to make the two "refuses an image or a voice note"
 *   tests fail, and the voice-note one reached the model over the network,
 *   which is a test suite that is neither offline nor repeatable.
 * - `voice` is a configuration that is deliberately absent, for the same reason.
 *
 * A test that wants any of the three passes its own.
 */
export function createTestApp(
  overrides: DepsOverrides = {},
  voice: VoiceDeps = { readConfig: () => undefined },
): TestHarness {
  const deps = createDeps({
    repo: new MemoryRepository(),
    clock: createTestClock(),
    allowSeed: false,
    extractor: UNAVAILABLE_EXTRACTOR,
    ...overrides,
  });

  return { app: createApp(deps, voice), deps };
}

/** Lets queued microtasks and timers with a zero delay run before asserting. */
export function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}
