/**
 * Test wiring, imported only by `*.test.ts` files.
 *
 * Each test gets its own app, its own `MemoryRepository` and its own broadcaster,
 * so a test that posts an instruction cannot change what another test reads. The
 * clock is fixed and the ids are sequential, which is what lets a test assert an
 * exact `decidedAt` instead of matching a regular expression against `now`.
 */

import type { Actor } from "@hackmty/core";
import { NO_RAIL } from "@hackmty/rail";
import { createApp } from "./app";
import { UNAVAILABLE_MODEL } from "./assistant/model";
import { acceptOnlyCepSource, staticCepInbox } from "./cep";
import { offConsortiumSource } from "./consortium";
import { type ApiDeps, createDeps, type DepsOverrides } from "./deps";
import { UNAVAILABLE_EXTRACTOR } from "./extraction";
import { ACTOR_HEADER } from "./middleware/actor";
import type { PipelineClock } from "./pipeline";
import { MemoryRepository } from "./repo";
import type { VoiceDeps } from "./routes/verify-call";

export const TEST_NOW = "2026-09-12T03:00:00.000Z";

/**
 * The two people in the synthetic company, for the suite.
 *
 * Every write endpoint requires an `X-Actor`, so every write in the suite carries
 * one, and the two identities are named here rather than spelled out in forty
 * test files: a test about a refusal then says which of the two it is about
 * instead of building a header string nobody reads twice.
 *
 * Lupita is the persona of `docs/02-persona.md`. The owner is invented for the
 * same synthetic company out of the name catalog in `packages/seed`, and is named
 * nowhere in the product documentation, because who the owner of a fictional
 * metalmecanica is is a test fixture and not a persona claim.
 */
export const TEST_CLERK: Actor = { name: "Lupita Elizondo", role: "clerk" };
export const TEST_OWNER: Actor = { name: "Gerardo Villarreal", role: "owner" };

/** The `X-Actor` value for one of them, in the form docs/09-api.md documents. */
export function actorHeader(actor: Actor = TEST_CLERK): string {
  return `role=${actor.role}; name=${actor.name}`;
}

/**
 * Headers for a JSON write: the content type and the actor.
 *
 * A test that wants to see the refusal for a missing or malformed header builds
 * its own headers instead of calling this, which is what keeps those cases
 * honest: they are the only writes in the suite that do not go through here.
 */
export function writeHeaders(
  actor: Actor = TEST_CLERK,
): Record<string, string> {
  return {
    "content-type": "application/json",
    [ACTOR_HEADER.toLowerCase()]: actorHeader(actor),
  };
}

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
 *
 * The consortium is pinned off for exactly the same reason, and it is the case
 * most likely to bite: `ALLOW_CONSORTIUM=1` sits in the local `.env` of whoever
 * seeds the network, and an ambient flag that switched the network on would change
 * the findings and the decisions of every test in this workspace. A test about the
 * consortium passes its own source, and `consortium.test.ts` does.
 *
 * The payment rail is pinned to none, which is the third case of the same rule: the
 * default rail is whatever `NESSIE_API_KEY` is in the `.env` of whoever runs the
 * suite, and a test that sent a real centavo to a sandbox would be a test nobody
 * could run twice. A test that wants to send one passes a `FakeRail`.
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
    /* And the assistant model, for the same reason and with the same teeth: a
       `GEMINI_API_KEY` in somebody's `.env` would turn the panel tests into live
       calls to a paid third party. A test about the panel passes `scriptedModel`. */
    model: UNAVAILABLE_MODEL,
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
    consortium: offConsortiumSource(),
    ...overrides,
  });

  return { app: createApp(deps, voice), deps };
}

/** Lets queued microtasks and timers with a zero delay run before asserting. */
export function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}
