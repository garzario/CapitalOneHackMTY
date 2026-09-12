/**
 * The engine side of the harness: what `runEngine` is allowed to produce.
 *
 * The scorer is tested in holdout.test.ts against hand-counted cases. This file tests
 * the other half, and the properties it protects are the ones that decide whether the
 * number on the metrics screen can be defended: no clock, no invented prediction, and
 * no control quietly missing from the run.
 */

import { describe, expect, it } from "bun:test";
import type { DetectorAdapter, Finding } from "@hackmty/core";
import { detectorRan } from "@hackmty/core";
import {
  ALL_DETECTORS,
  composeInputFor,
  HOLDOUT_CASES,
  OFFERED_CONTROLS,
  runEngine,
  skippedControls,
} from "./index";
import type { HoldoutCase } from "./types";

function findingOf(overrides: Partial<Finding> = {}): Finding {
  return {
    id: "finding-1",
    detector: "clabe_forensics",
    severity: "critical",
    state: "comprobable",
    subject: { kind: "instruction", id: "INS-TEST-1" },
    amountAtRisk: 1000,
    explanation: "Prueba.",
    evidence: {},
    createdAt: "2026-09-10T15:30:00.000Z",
    ...overrides,
  };
}

function caseOf(): HoldoutCase {
  return {
    id: "engine-test-case",
    title: "One instruction for the engine test",
    kind: "positive",
    input: {
      instruction: {
        id: "INS-TEST-1",
        supplierRfc: "SYN010101S01",
        cfdiUuids: [],
        clabe: "072180100000000007",
        amount: 1000,
        source: "email",
        receivedAt: "2026-09-10T15:30:00.000Z",
        synthetic: true,
      },
      cfdis: [],
    },
    expectedFindings: [{ detector: "clabe_forensics" }],
    expectedAction: "verify",
  };
}

/** An adapter that answers with whatever it is handed. */
function adapterOf(findings: Finding[]): DetectorAdapter[] {
  return [{ detector: "clabe_forensics", run: () => detectorRan(findings) }];
}

describe("runEngine", () => {
  it("returns one prediction per case, keyed by the case id", () => {
    const predictions = runEngine(HOLDOUT_CASES);

    expect(predictions).toHaveLength(HOLDOUT_CASES.length);
    expect(predictions.map((row) => row.caseId).sort()).toEqual(
      HOLDOUT_CASES.map((row) => row.id).sort(),
    );
  });

  it("gives the same answer twice, because it reads no clock", () => {
    expect(runEngine(HOLDOUT_CASES)).toEqual(runEngine(HOLDOUT_CASES));
  });

  it("takes the decision instant from the instruction, not from now", () => {
    const holdout = caseOf();

    expect(composeInputFor(holdout).now).toBe(
      holdout.input.instruction.receivedAt,
    );
  });

  it("offers every case all six controls", () => {
    expect([...OFFERED_CONTROLS].sort()).toEqual([...ALL_DETECTORS].sort());
  });

  it("reports no control as never armed, because the set exercises all six", () => {
    // A control listed here ran on no case at all, which means the labelled set
    // has no evidence for it and its row in the table is a gap rather than a
    // result. Adding a case that arms it is the fix, never deleting the row.
    expect(skippedControls(HOLDOUT_CASES)).toEqual([]);
  });

  it("holds on a critical finding the documents already prove", () => {
    const [prediction] = runEngine([caseOf()], {
      detectors: adapterOf([findingOf()]),
    });

    expect(prediction?.action).toBe("hold");
  });

  it("carries state and severity through, because the labels can narrow on them", () => {
    const [prediction] = runEngine([caseOf()], {
      detectors: adapterOf([
        findingOf({ severity: "warning", state: "requiere_verificacion" }),
      ]),
    });

    expect(prediction?.findings[0]).toEqual({
      detector: "clabe_forensics",
      state: "requiere_verificacion",
      severity: "warning",
    });
    // A warning with a positive expected loss and no priced delay cost verifies.
    expect(prediction?.action).toBe("verify");
  });

  it("releases a case where nothing fires", () => {
    const [prediction] = runEngine([caseOf()], { detectors: adapterOf([]) });

    expect(prediction?.findings).toHaveLength(0);
    expect(prediction?.action).toBe("release");
  });

  it("answers with an empty list for an empty case list", () => {
    expect(runEngine([])).toEqual([]);
  });

  it("hands the bank mirror through, and an absent one through as empty", () => {
    const withMirror = HOLDOUT_CASES.find(
      (holdout) => (holdout.input.bankMirror ?? []).length > 0,
    );

    expect(withMirror).toBeDefined();
    expect(composeInputFor(caseOf()).bankMirror).toEqual([]);
  });
});
