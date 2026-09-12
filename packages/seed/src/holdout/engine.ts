/**
 * The engine under evaluation.
 *
 * `runEngine` turns the labelled cases in ./cases into predictions: it shapes each
 * case into the `ComposeInput` that `@hackmty/engine` takes, runs all six controls
 * through `runControls`, and asks `decide` from `@hackmty/core` for the action.
 * `computeMetrics` in ./metrics.ts then scores those predictions against the labels.
 * Splitting it this way is what keeps the harness honest: the scorer never knows how a
 * prediction was produced, and a test can score a hand-written prediction without
 * running a control at all.
 *
 * Three properties this module has to keep.
 *
 * 1. **It runs the product, not a friendlier arrangement of it.** `runControls` is the
 *    same entry point `apps/api/src/pipeline.ts` calls on every instruction that
 *    arrives through intake. There is no second wiring here that could drift from the
 *    one the demo actually uses, and no control is dropped to make a row look better.
 * 2. **It never invents a prediction.** A control that cannot run is reported by
 *    `runControls` with the reason it was skipped, and `skippedControls` surfaces that
 *    so a zero in the table reads as "not armed on these cases" rather than "tried and
 *    failed". A harness that fakes a prediction to make its own table look finished is
 *    worse than an empty table.
 * 3. **It is pure and it reads no clock.** The decision instant of a case is
 *    `instruction.receivedAt`, the moment the clerk actually faces the payment.
 *    Deriving it from `Date.now()` would move the duplicate window and the behaviour
 *    baseline on every run, and a metrics table that changes overnight is a table
 *    nobody can defend.
 */

import type {
  ComposeInput,
  Detector,
  DetectorAdapter,
  Finding,
  SkippedDetector,
  SupplierModel,
} from "@hackmty/core";
import { composeFindingsReport, decide } from "@hackmty/core";
import { runControls, SENTRYONE_DETECTORS } from "@hackmty/engine";
import type { CasePrediction, PredictedFinding } from "./metrics";
import type { HoldoutCase } from "./types";

/**
 * What a day of delay costs, for the cases.
 *
 * Zero, deliberately, and it is the same constant `apps/api` uses: nothing in the
 * documents prices a supplier relationship, so the harness does not invent a number
 * that would move an action. With a zero delay cost the engine verifies anything
 * carrying a positive expected loss and releases only what is clean, which is the
 * conservative reading and the one that never moves money on a guess.
 */
export const UNPRICED_SUPPLIER: SupplierModel = {
  delayCostPerDay: 0,
  relationshipWeight: 1,
};

/** The six controls offered to every case, in the order the domain declares them. */
export const OFFERED_CONTROLS: readonly Detector[] = SENTRYONE_DETECTORS.map(
  (adapter) => adapter.detector,
);

export interface RunEngineOptions {
  /**
   * Replace the adapters entirely. Used by `engine.test.ts` to score a control that
   * always fires, and by anyone measuring one control in isolation.
   */
  detectors?: readonly DetectorAdapter[];
  supplierModel?: SupplierModel;
}

/** Everything the case gives the engine, in the shape `@hackmty/engine` takes. */
export function composeInputFor(holdout: HoldoutCase): ComposeInput {
  const { instruction, supplier, cfdis, complements, satEntries, cep } =
    holdout.input;

  return {
    instruction,
    ...(supplier === undefined ? {} : { supplier }),
    cfdis: cfdis ?? [],
    complements: complements ?? [],
    satEntries: satEntries ?? [],
    ...(cep === undefined ? {} : { cep }),
    bankMirror: holdout.input.bankMirror ?? [],
    now: instruction.receivedAt,
  };
}

function predictionFor(
  holdout: HoldoutCase,
  findings: readonly Finding[],
  supplierModel: SupplierModel,
): CasePrediction {
  const predicted: PredictedFinding[] = findings.map((finding) => ({
    detector: finding.detector,
    state: finding.state,
    severity: finding.severity,
  }));

  const decision = decide(holdout.input.instruction, findings, supplierModel, {
    now: holdout.input.instruction.receivedAt,
  });

  return { caseId: holdout.id, findings: predicted, action: decision.action };
}

/** Runs the six controls over every case and turns each report into a prediction. */
export function runEngine(
  cases: readonly HoldoutCase[],
  options: RunEngineOptions = {},
): CasePrediction[] {
  const supplierModel = options.supplierModel ?? UNPRICED_SUPPLIER;

  return cases.map((holdout) => {
    const input = composeInputFor(holdout);
    const report =
      options.detectors === undefined
        ? runControls(input)
        : composeFindingsReport(input, options.detectors);

    return predictionFor(holdout, report.findings, supplierModel);
  });
}

/**
 * Why a control produced nothing across the whole set, when it never ran at all.
 *
 * A control that ran on even one case is not listed: it had its chance and the table
 * is reporting a result. A control that ran on none is a gap in the evidence, and the
 * eval footer and the metrics screen have to say which of the two a zero row is.
 */
export function skippedControls(
  cases: readonly HoldoutCase[],
): SkippedDetector[] {
  const ran = new Set<Detector>();
  const reasons = new Map<Detector, SkippedDetector>();

  for (const holdout of cases) {
    const report = runControls(composeInputFor(holdout));
    for (const detector of report.ran) {
      ran.add(detector);
    }
    for (const skip of report.skipped) {
      if (!reasons.has(skip.detector)) {
        reasons.set(skip.detector, skip);
      }
    }
  }

  return [...reasons.values()].filter((skip) => !ran.has(skip.detector));
}
