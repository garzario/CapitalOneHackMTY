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
import type { PipelineClock } from "./pipeline";

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

export function createTestApp(overrides: DepsOverrides = {}): TestHarness {
  const deps = createDeps({
    clock: createTestClock(),
    allowSeed: false,
    ...overrides,
  });

  return { app: createApp(deps), deps };
}

/** Lets queued microtasks and timers with a zero delay run before asserting. */
export function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}
