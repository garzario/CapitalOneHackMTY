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
 * 2. **It never invents a prediction.** The detectors are not wired in yet, so the
 *    table reports recall 0 and states that out loud, in the output, every time. A
 *    harness that fakes predictions to make its own table look finished is worse than
 *    an empty table, and a judge reading 0.97 precision off unimplemented detectors is
 *    the fastest way to lose the room.
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
  computeMetrics,
  emptyMetrics,
  parseHoldoutCase,
  predictNothing,
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

const cases = await loadCases(casesDir);

// TODO(garzario), issue #55: replace predictNothing with composeFindings and decide
// from @hackmty/core when the detectors merge. The line below is the only change this
// script needs, which is the reason the harness takes predictions as an argument.
const predictions: CasePrediction[] = predictNothing(cases);

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

  if (flags.has("--rows")) {
    console.log("");
    for (const row of evaluation.rows) {
      const verdict =
        row.missed.length === 0 && row.spurious.length === 0 ? "ok  " : "MISS";
      console.log(
        `[${verdict}] ${row.caseId}  expected ${row.expected.join(",") || "-"}  got ${row.predicted.join(",") || "-"}`,
      );
    }
  }

  console.log("");
  if (cases.length === 0) {
    console.log(
      `no cases in ${casesDir}. The table above is zeroed, not computed. See packages/seed/src/holdout/README.md.`,
    );
  }
  console.log(
    "DETECTORS ARE NOT WIRED IN. composeFindings and decide land with the detector PR,",
  );
  console.log(
    "so every prediction above is empty and recall is 0 by construction, not by result.",
  );
  console.log(
    `action agreement ${evaluation.actionAgreement} of ${cases.length}, for the same reason.`,
  );
}
