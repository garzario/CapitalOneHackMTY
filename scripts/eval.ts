/**
 * bun run scripts/eval.ts
 *
 * Loads the labelled holdout cases, runs the engine over them, and prints the metrics
 * table that `GET /api/v1/metrics` serves and that the metrics page reads.
 *
 * Flags:
 *   --cases=<dir>   read cases from here instead of packages/seed/src/holdout/cases
 *   --json          print Metrics as JSON instead of the table
 *   --rows          also print one line per case, for finding which one regressed
 *
 * Two properties this script has to keep:
 *
 * 1. **It works with zero cases.** An empty or missing directory prints a zeroed table
 *    and says why, rather than dividing by zero or exiting with a stack trace. The
 *    metrics page is on the demo path and it cannot be the thing that breaks it.
 * 2. **It never invents a prediction.** Predictions come from `runEngine`, which runs
 *    the six controls in @hackmty/engine over the case and asks `decide` for the
 *    action. A control that could not run on any case is named in the footer with the
 *    reason, so a zero in its row reads as "not armed" and never as "tried and failed".
 *    A judge reading 0.97 precision off a control that never executed is the fastest
 *    way to lose the room.
 *
 * Exit code: 0 when the table printed. Loading a malformed case is a failure, because a
 * case silently skipped makes recall look better than it is.
 */

import { resolve } from "node:path";
import type { Detector, Metrics } from "../packages/core/src/index.ts";
import type {
  CasePrediction,
  HoldoutCase,
} from "../packages/seed/src/holdout/index.ts";
import {
  ALL_DETECTORS,
  ALL_LEVELS,
  computeMetrics,
  emptyMetrics,
  parseHoldoutCase,
  runEngine,
  skippedControls,
} from "../packages/seed/src/holdout/index.ts";

const ROOT = resolve(import.meta.dir, "..");
const DEFAULT_CASES_DIR = `${ROOT}/packages/seed/src/holdout/cases`;
const PERCENT = 100;

const args = Bun.argv.slice(2);
const flags = new Set(args.filter((arg) => !arg.includes("=")));
const options = new Map(
  args
    .filter((arg) => arg.startsWith("--") && arg.includes("="))
    .map(
      (arg) =>
        [
          arg.slice(0, arg.indexOf("=")),
          arg.slice(arg.indexOf("=") + 1),
        ] as const,
    ),
);

if (flags.has("--help")) {
  console.log(
    [
      "bun run scripts/eval.ts [--cases=<dir>] [--json] [--rows]",
      "",
      "Scores the detectors against the labelled holdout cases and prints Metrics.",
      "Works with zero cases. Never invents a prediction.",
    ].join("\n"),
  );
  process.exit(0);
}

const casesDir = options.get("--cases") ?? DEFAULT_CASES_DIR;

/**
 * Reads every .json in the directory, in name order so two runs print the same table.
 * A file that does not parse throws with its own name: skipping it would inflate the
 * score of whatever is left.
 */
async function loadCases(directory: string): Promise<HoldoutCase[]> {
  const glob = new Bun.Glob("*.json");
  const files: string[] = [];
  try {
    for await (const file of glob.scan({ cwd: directory, absolute: true })) {
      files.push(file);
    }
  } catch {
    // A missing directory is zero cases, not a crash. The holdout owner may not have
    // pushed yet, and the demo path still has to print something true.
    return [];
  }

  files.sort((left, right) => left.localeCompare(right));
  const cases: HoldoutCase[] = [];
  for (const file of files) {
    let parsed: unknown;
    try {
      parsed = await Bun.file(file).json();
    } catch (cause) {
      throw new Error(
        `${file} is not valid JSON: ${cause instanceof Error ? cause.message : String(cause)}`,
      );
    }
    cases.push(parseHoldoutCase(parsed));
  }
  return cases;
}

function pct(value: number): string {
  return `${(value * PERCENT).toFixed(1)}%`;
}

function pad(value: string, width: number): string {
  return value.padEnd(width);
}

function padStart(value: string | number, width: number): string {
  return String(value).padStart(width);
}

function printTable(
  metrics: Metrics,
  trueNegatives: Record<Detector, number>,
): void {
  const width = Math.max(...ALL_DETECTORS.map((name) => name.length));

  console.log("");
  console.log(`cases ${metrics.cases}`);
  console.log("");
  console.log(
    `${pad("detector", width)}  ${padStart("tp", 5)}${padStart("fp", 6)}${padStart("fn", 6)}${padStart("tn", 6)}${padStart("precision", 12)}${padStart("recall", 9)}`,
  );
  console.log("-".repeat(width + 46));

  for (const detector of ALL_DETECTORS) {
    const cell = metrics.perDetector[detector];
    const precision =
      cell.tp + cell.fp === 0 ? 0 : cell.tp / (cell.tp + cell.fp);
    const recall = cell.tp + cell.fn === 0 ? 0 : cell.tp / (cell.tp + cell.fn);
    console.log(
      `${pad(detector, width)}  ${padStart(cell.tp, 5)}${padStart(cell.fp, 6)}${padStart(cell.fn, 6)}${padStart(trueNegatives[detector], 6)}${padStart(pct(precision), 12)}${padStart(pct(recall), 9)}`,
    );
  }

  console.log("-".repeat(width + 46));
  console.log(
    `${pad("total", width)}  ${padStart(metrics.truePositives, 5)}${padStart(metrics.falsePositives, 6)}${padStart(metrics.falseNegatives, 6)}${padStart(
      ALL_DETECTORS.reduce((sum, detector) => sum + trueNegatives[detector], 0),
      6,
    )}${padStart(pct(metrics.precision), 12)}${padStart(pct(metrics.recall), 9)}`,
  );
  console.log("");
  console.log(`false positive rate  ${pct(metrics.falsePositiveRate)}`);
}

/**
 * The level matrix, which is the per-control table read the way a clerk reads
 * the screen.
 *
 * It is printed second and not first because the per-control table is what a
 * detector author fixes. This one is what a judge asks about: a control can be
 * right and the line still read `precaucion` when it should read `alerta`, and
 * the row that matters most is `confiable`, because a payment the product
 * called trustworthy and that was not is the mistake it cannot make twice.
 */
function printLevels(
  metrics: Metrics,
  rows: readonly { expectedLevel: string; predictedLevel?: string }[],
): void {
  const width = Math.max(...ALL_LEVELS.map((level) => level.length));

  console.log("");
  console.log(
    `${pad("nivel", width)}  ${padStart("esperado", 10)}${padStart("predicho", 10)}${padStart("coincide", 10)}${padStart("precision", 12)}${padStart("recall", 9)}`,
  );
  console.log("-".repeat(width + 53));

  for (const level of ALL_LEVELS) {
    const cell = metrics.perLevel[level];
    console.log(
      `${pad(level, width)}  ${padStart(cell.expected, 10)}${padStart(cell.predicted, 10)}${padStart(cell.agreed, 10)}${padStart(pct(cell.precision), 12)}${padStart(pct(cell.recall), 9)}`,
    );
  }

  const agreed = rows.filter(
    (row) => row.predictedLevel === row.expectedLevel,
  ).length;
  console.log("-".repeat(width + 53));
  console.log(
    `${pad("total", width)}  ${padStart(rows.length, 10)}${padStart(rows.length, 10)}${padStart(agreed, 10)}`,
  );
}

const cases = await loadCases(casesDir);

const predictions: CasePrediction[] = runEngine(cases);

const evaluation =
  cases.length === 0
    ? {
        metrics: emptyMetrics(),
        rows: [],
        actionAgreement: 0,
        trueNegatives: Object.fromEntries(
          ALL_DETECTORS.map((detector) => [detector, 0]),
        ) as Record<Detector, number>,
      }
    : computeMetrics(cases, predictions);

if (flags.has("--json")) {
  console.log(JSON.stringify(evaluation.metrics, null, 2));
} else {
  console.log(`eval: ${cases.length} case(s) from ${casesDir}`);
  printTable(evaluation.metrics, evaluation.trueNegatives);
  printLevels(evaluation.metrics, evaluation.rows);

  if (flags.has("--rows")) {
    console.log("");
    for (const row of evaluation.rows) {
      const verdict =
        row.missed.length === 0 && row.spurious.length === 0 ? "ok  " : "MISS";
      console.log(
        `[${verdict}] ${row.caseId}  expected ${row.expected.join(",") || "-"}  got ${row.predicted.join(",") || "-"}` +
          `  level ${row.expectedLevel} -> ${row.predictedLevel ?? "-"}`,
      );
    }
  }

  console.log("");
  if (cases.length === 0) {
    console.log(
      `no cases in ${casesDir}. The table above is zeroed, not computed. See packages/seed/src/holdout/README.md.`,
    );
  }
  const notArmed = skippedControls(cases);
  for (const skip of notArmed) {
    console.log(`not armed  ${skip.detector}: ${skip.detail}`);
  }
  if (notArmed.length > 0) {
    console.log(
      "A control that never ran is a gap in the evidence, not a measured result.",
    );
  }
  console.log(
    `action agreement ${evaluation.actionAgreement} of ${cases.length}`,
  );
}
