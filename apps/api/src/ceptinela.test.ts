/**
 * The `SEED=ceptinela` boot path.
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

import { describe, expect, it } from "bun:test";
import {
  ceptinelaBootNotes,
  ceptinelaDataset,
  wantsCeptinela,
} from "./ceptinela";
import { MemoryRepository } from "./repo";
import { instructionDetailSchema, paymentRunSchema } from "./schemas";
import { createTestApp } from "./test-app";

function ceptinelaApp() {
  return createTestApp({ repo: new MemoryRepository(0, ceptinelaDataset) });
}

describe("SEED=ceptinela", () => {
  it("switches only on the documented value", () => {
    expect(wantsCeptinela("ceptinela")).toBe(true);
    expect(wantsCeptinela(undefined)).toBe(false);
    expect(wantsCeptinela("")).toBe(false);
    expect(wantsCeptinela("Ceptinela")).toBe(false);
  });

  it("serves the generated payment run through the documented shape", async () => {
    const { app } = ceptinelaApp();
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
      // No decision and no finding: those are the engine's answers, and a dataset
      // that shipped them would be answering the question the detectors exist for.
      expect(item.decision).toBeNull();
      expect(item.findings).toHaveLength(0);
    }
  });

  it("prints hero ids the API can be asked for", async () => {
    const { app } = ceptinelaApp();
    const notes = ceptinelaBootNotes();

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
    const { app } = ceptinelaApp();
    const notes = ceptinelaBootNotes();
    // The first RFC is the company's own, which is not a supplier.
    for (const rfc of (notes?.demoRfcs ?? []).slice(1)) {
      const res = await app.request(`/api/v1/suppliers/${rfc}`);
      expect(res.status).toBe(200);
    }
  });

  it("changes the data when the seed changes, which is what POST /seed claims", async () => {
    const repo = new MemoryRepository(0, ceptinelaDataset);
    const before = await repo.currentRun();
    const summary = await repo.reset(1234);
    const after = await repo.currentRun();

    expect(summary.seed).toBe(1234);
    expect(summary.suppliers).toBe(44);
    expect(JSON.stringify(after.items)).not.toBe(JSON.stringify(before.items));
  });
});
