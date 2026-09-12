/**
 * Test wiring, imported only by `*.test.ts` files.
 *
 * Each test gets its own app, its own `MemoryRepository` and its own broadcaster,
 * so a test that posts an instruction cannot change what another test reads. The
 * clock is fixed and the ids are sequential, which is what lets a test assert an
 * exact `decidedAt` instead of matching a regular expression against `now`.
 */

import { NO_RAIL } from "@hackmty/rail";
import { createApp } from "./app";
import { acceptOnlyCepSource, staticCepInbox } from "./cep";
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
 *
 * The CEP source is pinned for the same reason and with no certificate: a
 * teammate who sets `ALLOW_CEP_FETCH=1` must not turn the suite into something
 * that POSTs to the Banxico portal, and one who holds a certificate must not get
 * a different `signatureReason` from CI.
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
    cep: acceptOnlyCepSource(),
    /* No rail, because the default one is whatever `NESSIE_API_KEY` is in the
       `.env` of whoever runs the suite. A test that wants to send a cent passes
       a `FakeRail`, and every other test gets the documented 503. */
    rail: async () => ({ ok: false, message: NO_RAIL }),
    cepInbox: staticCepInbox([], "empty CEP index (test)"),
    /* A zero deadline means the pipeline appends `cep_awaited` and starts no
       background work at all, so no test leaves a timer behind. The tests that
       drive the poll pass their own interval and their own `sleep`. */
    verification: {
      pollIntervalMs: 0,
      pollDeadlineMs: 0,
      sleep: async () => {},
    },
    ...overrides,
  });

  return { app: createApp(deps, voice), deps };
}

/** Lets queued microtasks and timers with a zero delay run before asserting. */
export function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}
