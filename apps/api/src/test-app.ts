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
 * A test app is hermetic. Every dependency `createDeps` would otherwise read out
 * of the environment is pinned here, so the suite behaves the same on CI, which
 * has no `.env`, and on a laptop that followed the setup in the README and filled
 * one in. That is not hypothetical: `SEED=sentryone` swaps the hand-written
 * fixture for the generated company and turns 48 assertions red, and a
 * `GEMINI_API_KEY` turns the intake refusal into a live model call.
 *
 * A test that wants one of those passes it explicitly. Ambient environment is
 * never allowed to decide what a test is testing.
 */
export function createTestApp(
  overrides: DepsOverrides = {},
  voice: VoiceDeps = { readConfig: () => undefined },
): TestHarness {
  const deps = createDeps({
    clock: createTestClock(),
    allowSeed: false,
    repo: new MemoryRepository(),
    extractor: UNAVAILABLE_EXTRACTOR,
    ...overrides,
  });

  return { app: createApp(deps, voice), deps };
}

/** Lets queued microtasks and timers with a zero delay run before asserting. */
export function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}
