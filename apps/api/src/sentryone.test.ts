/**
 * The `SEED=sentryone` boot path.
 *
 * The generator has its own invariants in packages/seed; what is asserted here is
 * only the wiring: that the repository really serves the generated company through
 * the contract in docs/09-api.md, that the ids `bun run seed` prints are ids the API
 * can actually be asked for, and that the seed number changes the data.
 *
 * The environment variable is never set here. A test that reads process state is a
 * test that passes or fails depending on which shell started it, so the factory is
 * handed to the repository directly, exactly as `bootRepository` does it.
 */

import { beforeAll, describe, expect, it } from "bun:test";
import { MemoryRepository } from "./repo";
import { instructionDetailSchema, paymentRunSchema } from "./schemas";
import {
  sentryoneBootNotes,
  sentryoneDataset,
  wantsSentryOne,
} from "./sentryone";
import { createTestApp } from "./test-app";

/**
 * One app for the read-only tests, built once in `beforeAll`.
 *
 * Generating 44 suppliers with eight months of history and then running the six
 * controls over the whole payment run is real work, and every test below only
 * reads. Building it once keeps that cost out of every individual test's
 * timeout; the one test that writes builds its own repository, so nothing here
 * shares state that anything mutates.
 */
let shared: ReturnType<typeof createTestApp> | undefined;

function sentryoneApp() {
  if (shared === undefined) {
    throw new Error("the shared app was not built");
  }
  return shared;
}

describe("SEED=sentryone", () => {
  beforeAll(() => {
    shared = createTestApp({ repo: new MemoryRepository(0, sentryoneDataset) });
  }, 30_000);

  it("switches only on the documented value", () => {
    expect(wantsSentryOne("sentryone")).toBe(true);
    expect(wantsSentryOne(undefined)).toBe(false);
    expect(wantsSentryOne("")).toBe(false);
    expect(wantsSentryOne("SentryOne")).toBe(false);
  });

  it("serves the generated payment run through the documented shape", async () => {
    const { app } = sentryoneApp();
    const res = await app.request("/api/v1/run/current");

    expect(res.status).toBe(200);
    const run = paymentRunSchema.parse(await res.json());

    // The band from issue #43. The run is not padded to hit it; it falls out of the
    // supplier cadence, and packages/seed asserts the arithmetic behind it.
    expect(run.totals.instructions).toBeGreaterThanOrEqual(70);
    expect(run.totals.instructions).toBeLessThanOrEqual(110);
    expect(run.items).toHaveLength(run.totals.instructions);
    expect(run.totals.amount).toBeGreaterThan(0);

    for (const item of run.items) {
      expect(item.instruction.synthetic).toBe(true);
      expect(item.supplier.synthetic).toBe(true);
      expect(item.supplier.rfc.startsWith("SYN")).toBe(true);
      // The engine proposed an action for every line, and nobody has signed any
      // of them: `decidedBy` stays absent until a person presses the button.
      expect(item.decision?.instructionId).toBe(item.instruction.id);
      expect(item.decision?.decidedBy).toBeUndefined();
      expect(item.decision?.findings).toEqual(item.findings);
    }

    // The generator ships no findings, so every one of these came out of the six
    // controls at boot. A run that opened on an empty alert rail would prove
    // nothing, which is exactly what issue #62 is about.
    const rail = run.items.flatMap((item) => item.findings);
    expect(rail.length).toBeGreaterThan(0);
    expect(run.totals.held + run.totals.toVerify).toBeGreaterThan(0);
    expect(run.totals.released).toBe(
      run.totals.instructions - run.totals.held - run.totals.toVerify,
    );
  });

  it("stops the two payments the demo is about, on evidence from the documents", async () => {
    const { app } = sentryoneApp();
    const run = paymentRunSchema.parse(
      await (await app.request("/api/v1/run/current")).json(),
    );
    const byDetector = new Map<string, string[]>();
    for (const item of run.items) {
      for (const finding of item.findings) {
        byDetector.set(finding.detector, [
          ...(byDetector.get(finding.detector) ?? []),
          item.instruction.id,
        ]);
      }
    }

    // The supplier on the 69-B list, and the account that changed by two digits.
    // Both are cases the generator injected and neither is labelled in the data:
    // the detectors found them.
    expect(byDetector.get("sat_69b")?.length).toBe(1);
    expect(byDetector.get("clabe_forensics")?.length).toBeGreaterThan(0);

    for (const [, ids] of byDetector) {
      for (const id of ids) {
        const item = run.items.find((row) => row.instruction.id === id);
        expect(item?.decision?.action).not.toBe("release");
      }
    }
  });

  it("prints hero ids the API can be asked for", async () => {
    const { app } = sentryoneApp();
    const notes = sentryoneBootNotes();

    expect(notes?.heroInstructionIds).toHaveLength(4);
    expect(notes?.demoRfcs).toHaveLength(4);

    for (const id of notes?.heroInstructionIds ?? []) {
      const res = await app.request(`/api/v1/instructions/${id}`);
      expect(res.status).toBe(200);
      const detail = instructionDetailSchema.parse(await res.json());
      expect(detail.instruction.id).toBe(id);
      expect(detail.supplier?.rfc).toBe(detail.instruction.supplierRfc);
    }
  });

  it("answers the supplier drawer for every RFC it names", async () => {
    const { app } = sentryoneApp();
    const notes = sentryoneBootNotes();
    // The first RFC is the company's own, which is not a supplier.
    for (const rfc of (notes?.demoRfcs ?? []).slice(1)) {
      const res = await app.request(`/api/v1/suppliers/${rfc}`);
      expect(res.status).toBe(200);
    }
  });

  /**
   * The only test here that writes, and the slowest thing in this workspace: it
   * generates 44 suppliers with eight months of history twice and runs the six
   * controls over both payment runs. That is the work `POST /api/v1/seed` really
   * does, so the timeout is raised rather than the work faked.
   */
  it("changes the data when the seed changes, which is what POST /seed claims", async () => {
    const repo = new MemoryRepository(0, sentryoneDataset);
    const before = await repo.currentRun();
    const summary = await repo.reset(1234);
    const after = await repo.currentRun();

    expect(summary.seed).toBe(1234);
    expect(summary.suppliers).toBe(44);
    expect(JSON.stringify(after.items)).not.toBe(JSON.stringify(before.items));
  }, 30_000);
});
