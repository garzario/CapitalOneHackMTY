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
 *
 * One rule about `info` is worth stating on its own, because it changes the numbers.
 * An `info` finding is context and not an alert: "this beneficiary is already verified"
 * and "this supplier was on the list in March and desvirtuo it" carry no pesos at risk,
 * the severity table weighs them at almost nothing and `decide` cannot move an action
 * on them. So an `info` row is scored as "the control did not alert": it is never a
 * false positive on a clean case, and it never satisfies an expectation either, unless
 * the label asks for `severity: "info"` explicitly. Counting good news as a false
 * positive would report a false positive rate the product does not have.
 */

import type { Confidence, Detector, Finding, Metrics } from "@hackmty/core";
import type { ExpectedFinding, HoldoutCase } from "./types";
import { ALL_DETECTORS, ALL_LEVELS } from "./types";

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
  /**
   * The level the line would read at on the screen. Absent when the caller
   * scored findings without deriving one, and then the case counts against
   * every level's recall and against no level's precision: nothing was shown,
   * so nothing can have been shown correctly.
   */
  level?: Confidence;
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
  expectedLevel: Confidence;
  predictedLevel?: Confidence;
  levelMatches: boolean;
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
  const perLevel = {} as Metrics["perLevel"];
  for (const level of ALL_LEVELS) {
    perLevel[level] = {
      expected: 0,
      predicted: 0,
      agreed: 0,
      precision: 0,
      recall: 0,
    };
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
    perLevel,
  };
}

/**
 * The level matrix: how often the line on the screen read the way it should.
 *
 * A whole case at a time, not a finding, because that is what a clerk sees. The
 * per-control table can be perfect while a payment still reads `precaucion`
 * when it should read `alerta`, and that gap is the only thing this view exists
 * to show.
 *
 * A prediction with no level counts against recall and not against precision.
 * The engine did not put the line anywhere, so it cannot have put it in the
 * wrong place; it can only have failed to put it in the right one.
 */
export function levelMatrix(
  cases: readonly HoldoutCase[],
  predictions: readonly CasePrediction[],
): Metrics["perLevel"] {
  const byCase = new Map(predictions.map((entry) => [entry.caseId, entry]));
  const counts = {} as Record<
    Confidence,
    { expected: number; predicted: number; agreed: number }
  >;
  for (const level of ALL_LEVELS) {
    counts[level] = { expected: 0, predicted: 0, agreed: 0 };
  }

  for (const holdout of cases) {
    const predicted = byCase.get(holdout.id)?.level;
    counts[holdout.expectedLevel].expected += 1;

    if (predicted === undefined) {
      continue;
    }
    counts[predicted].predicted += 1;
    if (predicted === holdout.expectedLevel) {
      counts[predicted].agreed += 1;
    }
  }

  const perLevel = {} as Metrics["perLevel"];
  for (const level of ALL_LEVELS) {
    const cell = counts[level];
    perLevel[level] = {
      ...cell,
      precision: ratio(cell.agreed, cell.predicted),
      recall: ratio(cell.agreed, cell.expected),
    };
  }
  return perLevel;
}

/** An `info` row is context for the clerk. Everything else is an alert. */
function isAlert(finding: CasePrediction["findings"][number]): boolean {
  return finding.severity !== "info";
}

/**
 * True when a prediction satisfies an expectation. The expectation narrows: a label
 * that names only a detector is met by any alerting finding from that detector, and a
 * label that names a state or a severity requires it.
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
          // An expectation that does not ask for `info` is asking for an alert,
          // and a context row does not answer it.
          (isAlert(candidate) || expectation.severity === "info") &&
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
      if (matchedPredictions.has(position) || !isAlert(candidate)) {
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
      predicted.filter(isAlert).map((finding) => finding.detector),
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
      expectedLevel: holdout.expectedLevel,
      ...(prediction?.level === undefined
        ? {}
        : { predictedLevel: prediction.level }),
      levelMatches: prediction?.level === holdout.expectedLevel,
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
      perLevel: levelMatrix(cases, predictions),
    },
    rows,
    actionAgreement,
    trueNegatives,
  };
}

/**
 * The null model: an engine that finds nothing on every case.
 *
 * The real engine lives in ./engine.ts and `bun run eval` uses that. This one stays
 * because it is the baseline the table is worth reading against: it scores precision 0
 * and recall 0 by construction, and any detector that cannot beat it is not earning
 * its place in the payment run.
 */
export function predictNothing(
  cases: readonly HoldoutCase[],
): CasePrediction[] {
  return cases.map((holdout) => ({ caseId: holdout.id, findings: [] }));
}
