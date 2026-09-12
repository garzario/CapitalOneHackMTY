/**
 * The blind evaluation harness.
 *
 * One pure function, `computeMetrics`, turns labelled cases plus the engine's
 * predictions into the `Metrics` in `packages/core/src/domain.ts`. It is served by
 * `GET /api/v1/metrics` and printed by `bun run scripts/eval.ts`.
 *
 * The definitions, stated once here so the number on the slide means something:
 *
 * - The unit of account is a **case by detector pair**. With six detectors, twenty-five
 *   cases give 150 pairs. Each pair is either expected to fire or expected not to.
 * - **TP**: expected to fire and fired. **FP**: not expected and fired. **FN**: expected
 *   and did not fire. **TN**: not expected and did not fire.
 * - `precision = TP / (TP + FP)`, `recall = TP / (TP + FN)`,
 *   `falsePositiveRate = FP / (FP + TN)`.
 * - A denominator of zero yields 0, not NaN, and not a silent 1. A product that reports
 *   100 per cent precision because it fired once and got lucky is the kind of number a
 *   judge takes apart in ten seconds.
 *
 * Severity and state are compared only when the label asks for them: an expectation
 * that names a `state` and gets the other one counts as a miss, because "comprobable"
 * and "requiere_verificacion" are different things to say to a clerk. The explanation
 * text is never compared.
 */

import type { Detector, Finding, Metrics } from "@hackmty/core";
import type { ExpectedFinding, HoldoutCase } from "./types";
import { ALL_DETECTORS } from "./types";

/**
 * What the engine said about one finding. A real `Finding` satisfies this, and so does
 * the detector alone, which is what a test writes. An expectation that narrows on a
 * field the prediction omits counts as a miss: an unstated state cannot be agreement.
 */
export type PredictedFinding = Pick<Finding, "detector"> &
  Partial<Pick<Finding, "state" | "severity">>;

/** What the engine produced for one case. Findings only: the action is scored apart. */
export interface CasePrediction {
  caseId: string;
  findings: readonly PredictedFinding[];
  /** The action the engine chose, when it got as far as choosing one. */
  action?: HoldoutCase["expectedAction"];
}

/** A per-detector cell of the confusion matrix, with the true negatives kept. */
export interface DetectorCell {
  tp: number;
  fp: number;
  fn: number;
  tn: number;
}

export interface EvaluationRow {
  caseId: string;
  title: string;
  kind: HoldoutCase["kind"];
  expected: Detector[];
  predicted: Detector[];
  missed: Detector[];
  spurious: Detector[];
  expectedAction: HoldoutCase["expectedAction"];
  predictedAction?: HoldoutCase["expectedAction"];
  actionMatches: boolean;
}

export interface Evaluation {
  metrics: Metrics;
  rows: EvaluationRow[];
  /** Cases where the engine chose the action the label asks for. */
  actionAgreement: number;
  /** Per-detector true negatives, which `Metrics` has no field for but FPR needs. */
  trueNegatives: Record<Detector, number>;
}

function ratio(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : numerator / denominator;
}

function emptyCells(): Record<Detector, DetectorCell> {
  const cells = {} as Record<Detector, DetectorCell>;
  for (const detector of ALL_DETECTORS) {
    cells[detector] = { tp: 0, fp: 0, fn: 0, tn: 0 };
  }
  return cells;
}

/** `Metrics` with every field zeroed, which is what zero cases has to produce. */
export function emptyMetrics(): Metrics {
  const perDetector = {} as Metrics["perDetector"];
  for (const detector of ALL_DETECTORS) {
    perDetector[detector] = { tp: 0, fp: 0, fn: 0 };
  }
  return {
    cases: 0,
    truePositives: 0,
    falsePositives: 0,
    falseNegatives: 0,
    precision: 0,
    recall: 0,
    falsePositiveRate: 0,
    perDetector,
  };
}

/**
 * True when a prediction satisfies an expectation. The expectation narrows: a label
 * that names only a detector is met by any finding from that detector, and a label that
 * names a state or a severity requires it.
 */
function satisfies(
  expected: ExpectedFinding,
  predicted: CasePrediction["findings"][number],
): boolean {
  if (expected.detector !== predicted.detector) {
    return false;
  }
  if (expected.state !== undefined && expected.state !== predicted.state) {
    return false;
  }
  if (
    expected.severity !== undefined &&
    expected.severity !== predicted.severity
  ) {
    return false;
  }
  return true;
}

/**
 * Scores the engine against the labels. Pure, and it never reads a clock or a file, so
 * the table it produces is the same on a laptop and in CI.
 *
 * A case with no prediction is scored as a case where the engine found nothing, not as
 * a case that was skipped. That is the honest reading while the detectors are still
 * unimplemented: recall is 0 because nothing fired, and the table says so.
 */
export function computeMetrics(
  cases: readonly HoldoutCase[],
  predictions: readonly CasePrediction[],
): Evaluation {
  const byCase = new Map(predictions.map((entry) => [entry.caseId, entry]));
  const cells = emptyCells();
  const rows: EvaluationRow[] = [];
  let actionAgreement = 0;

  for (const holdout of cases) {
    const prediction = byCase.get(holdout.id);
    const predicted = prediction?.findings ?? [];

    const matchedExpectations = new Set<Detector>();
    const matchedPredictions = new Set<number>();

    for (const expectation of holdout.expectedFindings) {
      const index = predicted.findIndex(
        (candidate, position) =>
          !matchedPredictions.has(position) &&
          satisfies(expectation, candidate),
      );
      if (index >= 0) {
        matchedPredictions.add(index);
        matchedExpectations.add(expectation.detector);
        cells[expectation.detector].tp += 1;
      } else {
        cells[expectation.detector].fn += 1;
      }
    }

    const spurious: Detector[] = [];
    predicted.forEach((candidate, position) => {
      if (matchedPredictions.has(position)) {
        return;
      }
      spurious.push(candidate.detector);
      cells[candidate.detector].fp += 1;
    });

    // A true negative is a detector that was not expected on this case and did not
    // fire on it. Counted per detector so the rate is per detector too.
    const expectedDetectors = new Set(
      holdout.expectedFindings.map((finding) => finding.detector),
    );
    const firedDetectors = new Set(
      predicted.map((finding) => finding.detector),
    );
    for (const detector of ALL_DETECTORS) {
      if (!expectedDetectors.has(detector) && !firedDetectors.has(detector)) {
        cells[detector].tn += 1;
      }
    }

    const actionMatches =
      prediction?.action !== undefined &&
      prediction.action === holdout.expectedAction;
    if (actionMatches) {
      actionAgreement += 1;
    }

    rows.push({
      caseId: holdout.id,
      title: holdout.title,
      kind: holdout.kind,
      expected: [...expectedDetectors],
      predicted: [...firedDetectors],
      missed: [...expectedDetectors].filter(
        (detector) => !matchedExpectations.has(detector),
      ),
      spurious,
      expectedAction: holdout.expectedAction,
      ...(prediction?.action === undefined
        ? {}
        : { predictedAction: prediction.action }),
      actionMatches,
    });
  }

  const perDetector = {} as Metrics["perDetector"];
  const trueNegatives = {} as Record<Detector, number>;
  let tp = 0;
  let fp = 0;
  let fn = 0;
  let tn = 0;
  for (const detector of ALL_DETECTORS) {
    const cell = cells[detector];
    perDetector[detector] = { tp: cell.tp, fp: cell.fp, fn: cell.fn };
    trueNegatives[detector] = cell.tn;
    tp += cell.tp;
    fp += cell.fp;
    fn += cell.fn;
    tn += cell.tn;
  }

  return {
    metrics: {
      cases: cases.length,
      truePositives: tp,
      falsePositives: fp,
      falseNegatives: fn,
      precision: ratio(tp, tp + fp),
      recall: ratio(tp, tp + fn),
      falsePositiveRate: ratio(fp, fp + tn),
      perDetector,
    },
    rows,
    actionAgreement,
    trueNegatives,
  };
}

/**
 * The engine under evaluation.
 *
 * TODO(garzario): this is where `composeFindings` and `decide` from @hackmty/core get
 * wired in, once they exist. Until then it returns nothing for every case, which is why
 * `bun run scripts/eval.ts` prints recall 0 and says out loud that the detectors are
 * not connected. An eval harness that invents predictions to make the table look
 * finished is worse than an empty table.
 */
export function predictNothing(
  cases: readonly HoldoutCase[],
): CasePrediction[] {
  return cases.map((holdout) => ({ caseId: holdout.id, findings: [] }));
}
