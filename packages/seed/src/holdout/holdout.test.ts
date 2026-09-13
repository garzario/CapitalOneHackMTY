/**
 * The harness has to be right before the number it produces means anything, so the
 * confusion matrix is tested against hand-counted cases rather than against itself.
 *
 * The schema invariants are here too: every RFC invented, every object watermarked, and
 * a positive case that expects nothing rejected rather than quietly scored as a
 * negative.
 */

import { describe, expect, it } from "bun:test";
import type { Confidence } from "@hackmty/core";
import {
  ALL_DETECTORS,
  ALL_LEVELS,
  computeMetrics,
  emptyMetrics,
  HOLDOUT_CASES,
  type HoldoutCase,
  levelMatrix,
  parseHoldoutCase,
  predictNothing,
} from "./index";

function caseOf(overrides: Partial<HoldoutCase> = {}): HoldoutCase {
  return parseHoldoutCase({
    id: "example",
    title: "An example case for the harness",
    kind: "positive",
    input: {
      instruction: {
        id: "INS-TEST-001",
        supplierRfc: "SYN010203AB1",
        cfdiUuids: [],
        clabe: "072180100000000007",
        amount: 1000,
        source: "email",
        receivedAt: "2026-09-09T15:00:00.000Z",
        synthetic: true,
      },
    },
    expectedFindings: [{ detector: "sat_69b" }],
    expectedAction: "hold",
    expectedLevel: "alerta",
    ...overrides,
  });
}

describe("parseHoldoutCase", () => {
  it("accepts a well formed case", () => {
    expect(caseOf().id).toBe("example");
  });

  it("refuses a positive case that expects nothing", () => {
    expect(() => caseOf({ kind: "positive", expectedFindings: [] })).toThrow(
      /at least one finding/,
    );
  });

  it("refuses a negative case that expects something", () => {
    expect(() =>
      caseOf({ kind: "negative", expectedFindings: [{ detector: "sat_69b" }] }),
    ).toThrow(/no findings/);
  });

  it("refuses two expectations for the same detector", () => {
    expect(() =>
      caseOf({
        expectedFindings: [{ detector: "sat_69b" }, { detector: "sat_69b" }],
      }),
    ).toThrow(/at most once/);
  });

  it("refuses an unknown detector, action or state", () => {
    expect(() =>
      caseOf({ expectedFindings: [{ detector: "clabe" as never }] }),
    ).toThrow(/detector must be one of/);
    expect(() => caseOf({ expectedAction: "freeze" as never })).toThrow(
      /expectedAction must be one of/,
    );
    expect(() =>
      caseOf({
        expectedFindings: [{ detector: "sat_69b", state: "maybe" as never }],
      }),
    ).toThrow(/state must be one of/);
  });

  it("refuses an instruction that is not flagged synthetic", () => {
    // ADR-0002. This folder is the easiest place for a real RFC to slip in unnoticed.
    expect(() =>
      parseHoldoutCase({
        id: "unflagged",
        title: "An instruction with no watermark",
        kind: "negative",
        input: {
          instruction: {
            id: "INS-TEST-002",
            clabe: "072180100000000007",
          },
        },
        expectedFindings: [],
        expectedAction: "release",
        expectedLevel: "confiable",
      }),
    ).toThrow(/synthetic must be true/);
  });
});

describe("the labelled set", () => {
  it("carries the twenty-five cases issue #55 asks for, and validates every one", () => {
    expect(HOLDOUT_CASES.length).toBeGreaterThanOrEqual(25);
    for (const holdout of HOLDOUT_CASES) {
      expect(holdout.id).not.toBe("");
      expect(holdout.input.instruction.synthetic).toBe(true);
      expect(holdout.input.instruction.supplierRfc).toMatch(
        /^SYN[0-9]{6}[A-Z0-9]{3}$/,
      );
    }
  });

  it("is at least a third hard negatives, the half that decides usability", () => {
    const negatives = HOLDOUT_CASES.filter(
      (holdout) => holdout.kind === "negative",
    );
    expect(negatives.length * 3).toBeGreaterThanOrEqual(HOLDOUT_CASES.length);
    for (const holdout of negatives) {
      expect(holdout.expectedFindings).toHaveLength(0);
      expect(holdout.expectedAction).toBe("release");
    }
  });

  it("explains every expectation, because somebody has to defend it", () => {
    for (const holdout of HOLDOUT_CASES) {
      for (const expectation of holdout.expectedFindings) {
        expect(expectation.because).toBeDefined();
        expect((expectation.because ?? "").length).toBeGreaterThan(20);
      }
    }
  });
});

describe("emptyMetrics", () => {
  it("zeroes every field and every detector", () => {
    const metrics = emptyMetrics();
    expect(metrics.cases).toBe(0);
    expect(metrics.precision).toBe(0);
    expect(Object.keys(metrics.perDetector).sort()).toEqual(
      [...ALL_DETECTORS].sort(),
    );
  });
});

describe("computeMetrics", () => {
  it("produces a zeroed table for zero cases", () => {
    const evaluation = computeMetrics([], []);
    expect(evaluation.metrics).toEqual(emptyMetrics());
    expect(evaluation.rows).toEqual([]);
    expect(evaluation.actionAgreement).toBe(0);
  });

  it("counts a true positive", () => {
    const cases = [caseOf()];
    const evaluation = computeMetrics(cases, [
      {
        caseId: "example",
        findings: [{ detector: "sat_69b" }],
        action: "hold",
      },
    ]);

    expect(evaluation.metrics.truePositives).toBe(1);
    expect(evaluation.metrics.falsePositives).toBe(0);
    expect(evaluation.metrics.falseNegatives).toBe(0);
    expect(evaluation.metrics.precision).toBe(1);
    expect(evaluation.metrics.recall).toBe(1);
    expect(evaluation.actionAgreement).toBe(1);
    // Five detectors were not expected and did not fire.
    expect(evaluation.metrics.falsePositiveRate).toBe(0);
  });

  it("counts a false negative when the detector stays quiet", () => {
    const evaluation = computeMetrics(
      [caseOf()],
      [{ caseId: "example", findings: [] }],
    );

    expect(evaluation.metrics.falseNegatives).toBe(1);
    expect(evaluation.metrics.recall).toBe(0);
    expect(evaluation.rows[0]?.missed).toEqual(["sat_69b"]);
  });

  it("counts a false positive on a hard negative", () => {
    const negative = caseOf({
      id: "hard-negative",
      kind: "negative",
      expectedFindings: [],
      expectedAction: "release",
    });
    const evaluation = computeMetrics(
      [negative],
      [
        {
          caseId: "hard-negative",
          findings: [{ detector: "clabe_forensics" }],
          action: "hold",
        },
      ],
    );

    expect(evaluation.metrics.falsePositives).toBe(1);
    expect(evaluation.metrics.precision).toBe(0);
    expect(evaluation.actionAgreement).toBe(0);
    // Six detectors were unexpected, one fired, so five are true negatives.
    expect(evaluation.metrics.falsePositiveRate).toBeCloseTo(1 / 6, 10);
    expect(evaluation.rows[0]?.spurious).toEqual(["clabe_forensics"]);
  });

  it("treats a narrowed label as a miss when the state differs", () => {
    const narrowed = caseOf({
      expectedFindings: [{ detector: "sat_69b", state: "comprobable" }],
    });
    const evaluation = computeMetrics(
      [narrowed],
      [
        {
          caseId: "example",
          findings: [{ detector: "sat_69b", state: "requiere_verificacion" }],
        },
      ],
    );

    // comprobable and requiere_verificacion are different things to say to a clerk,
    // so agreeing on the detector alone is not agreement.
    expect(evaluation.metrics.truePositives).toBe(0);
    expect(evaluation.metrics.falseNegatives).toBe(1);
    expect(evaluation.metrics.falsePositives).toBe(1);
  });

  it("scores a missing prediction as nothing found, not as a skipped case", () => {
    const evaluation = computeMetrics([caseOf()], []);
    expect(evaluation.metrics.cases).toBe(1);
    expect(evaluation.metrics.falseNegatives).toBe(1);
    expect(evaluation.rows).toHaveLength(1);
  });

  it("scores the null model at precision 0 and recall 0 over the whole set", () => {
    const evaluation = computeMetrics(
      HOLDOUT_CASES,
      predictNothing(HOLDOUT_CASES),
    );

    expect(evaluation.metrics.cases).toBe(HOLDOUT_CASES.length);
    expect(evaluation.metrics.recall).toBe(0);
    expect(evaluation.metrics.precision).toBe(0);
    expect(evaluation.metrics.falsePositives).toBe(0);
    // Every expectation on every positive case is a miss, and nothing else is.
    expect(evaluation.metrics.falseNegatives).toBe(
      HOLDOUT_CASES.reduce(
        (total, holdout) => total + holdout.expectedFindings.length,
        0,
      ),
    );
  });
});

describe("levelMatrix", () => {
  const cases = [
    caseOf({ id: "a", expectedLevel: "alerta" }),
    caseOf({ id: "b", expectedLevel: "alerta" }),
    caseOf({ id: "c", expectedLevel: "precaucion" }),
    caseOf({
      id: "d",
      kind: "negative",
      expectedFindings: [],
      expectedAction: "release",
      expectedLevel: "confiable",
    }),
  ];

  function predictions(levels: Record<string, Confidence | undefined>) {
    return cases.map((holdout) => ({
      caseId: holdout.id,
      findings: [],
      ...(levels[holdout.id] === undefined
        ? {}
        : { level: levels[holdout.id] as Confidence }),
    }));
  }

  it("counts a case once on each axis, so the columns sum to the case count", () => {
    const matrix = levelMatrix(
      cases,
      predictions({
        a: "alerta",
        b: "alerta",
        c: "precaucion",
        d: "confiable",
      }),
    );
    const expected = ALL_LEVELS.reduce(
      (total, level) => total + matrix[level].expected,
      0,
    );
    const predicted = ALL_LEVELS.reduce(
      (total, level) => total + matrix[level].predicted,
      0,
    );

    expect(expected).toBe(cases.length);
    expect(predicted).toBe(cases.length);
  });

  it("scores a perfect run at one on every level that has a case", () => {
    const matrix = levelMatrix(
      cases,
      predictions({
        a: "alerta",
        b: "alerta",
        c: "precaucion",
        d: "confiable",
      }),
    );

    expect(matrix.alerta.precision).toBe(1);
    expect(matrix.alerta.recall).toBe(1);
    expect(matrix.confiable.recall).toBe(1);
  });

  it("charges a line shown too calm to the level it was shown at and to the one it should have been", () => {
    // The failure that matters: a payment that reads precaucion when the
    // documents say alerta. It costs alerta its recall and precaucion its
    // precision, and both halves are the point.
    const matrix = levelMatrix(
      cases,
      predictions({
        a: "precaucion",
        b: "alerta",
        c: "precaucion",
        d: "confiable",
      }),
    );

    expect(matrix.alerta.recall).toBeCloseTo(0.5, 10);
    expect(matrix.precaucion.precision).toBeCloseTo(0.5, 10);
    expect(matrix.precaucion.recall).toBe(1);
  });

  it("counts a case with no predicted level against recall and not against precision", () => {
    // Nothing was shown, so nothing can have been shown in the wrong place.
    const matrix = levelMatrix(
      cases,
      predictions({
        a: undefined,
        b: "alerta",
        c: "precaucion",
        d: "confiable",
      }),
    );

    expect(matrix.alerta.expected).toBe(2);
    expect(matrix.alerta.predicted).toBe(1);
    expect(matrix.alerta.precision).toBe(1);
    expect(matrix.alerta.recall).toBeCloseTo(0.5, 10);
  });

  it("answers zero rather than NaN for a level no case carries", () => {
    const matrix = levelMatrix(
      [cases[0] as HoldoutCase],
      [{ caseId: "a", findings: [], level: "alerta" as Confidence }],
    );

    expect(matrix.confiable.precision).toBe(0);
    expect(matrix.confiable.recall).toBe(0);
  });
});

describe("the labelled set, by level", () => {
  it("labels every case with a level", () => {
    for (const holdout of HOLDOUT_CASES) {
      expect([holdout.id, ALL_LEVELS.includes(holdout.expectedLevel)]).toEqual([
        holdout.id,
        true,
      ]);
    }
  });

  it("carries cases at all three levels, so no row of the matrix is empty", () => {
    const levels = new Set(
      HOLDOUT_CASES.map((holdout) => holdout.expectedLevel),
    );

    expect([...levels].sort()).toEqual([...ALL_LEVELS].sort());
  });

  it("never labels a negative case above confiable", () => {
    // A case with nothing to find is a case with nothing open, and a level
    // above confiable on one would mean the label contradicts itself.
    for (const holdout of HOLDOUT_CASES) {
      if (holdout.kind === "negative") {
        expect([holdout.id, holdout.expectedLevel]).toEqual([
          holdout.id,
          "confiable",
        ]);
      }
    }
  });
});
