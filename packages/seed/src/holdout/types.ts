/**
 * The shape of a labelled holdout case.
 *
 * A case is one payment instruction plus everything the detectors are allowed to see
 * about it, plus the label: which detectors should fire, and what a person should be
 * asked to do. The harness in ./metrics.ts runs the engine over every case and counts
 * agreements, which is the only number in this repository that is not self-reported.
 *
 * The JSON on disk is validated against `./case.schema.json` and against
 * `parseHoldoutCase` below, which is the runtime half of the same contract. A case that
 * does not parse is a loud failure, never a skipped row: a silently dropped case makes
 * recall look better than it is.
 */

import type {
  Action,
  Cep,
  Cfdi,
  Confidence,
  Detector,
  FindingState,
  LedgerTx,
  PaymentComplement,
  PaymentInstruction,
  Sat49BisEntry,
  SatListEntry,
  Severity,
  Supplier,
} from "@hackmty/core";

/** Everything the engine may read for this case. Nothing else exists for it. */
export interface HoldoutInput {
  instruction: PaymentInstruction;
  supplier?: Supplier;
  cfdis?: Cfdi[];
  complements?: PaymentComplement[];
  /** The list rows in force for this case, as if a version had just been published. */
  satEntries?: SatListEntry[];
  /** A CEP already in the registry for this supplier, when the case is about one. */
  cep?: Cep;
  /**
   * The company's own bank statement, mirrored from Nessie. Absent means the mirror
   * was not loaded for this case, and the reconciliation control reports that it was
   * skipped rather than reading every payment as missing from a statement that is not
   * there.
   */
  bankMirror?: LedgerTx[];
  /**
   * Article 49 Bis rows for this supplier. A separate statute from 69-B with one
   * published outcome and no published clearing, which is why the domain keeps
   * the two lists apart and so does a case.
   */
  sat49BisEntries?: Sat49BisEntry[];
}

/**
 * One finding the engine is expected to produce.
 *
 * Matching is by `detector`, optionally narrowed by `state` and `severity`. It is
 * deliberately not matched on the explanation text: the wording will change twenty
 * times before the demo and a test that breaks on copy is a test people delete.
 */
export interface ExpectedFinding {
  detector: Detector;
  state?: FindingState;
  severity?: Severity;
  /** Why this is the right label, in one sentence. Read out loud during review. */
  because?: string;
}

export interface HoldoutCase {
  id: string;
  /** One line a judge could read: what this case is. */
  title: string;
  /**
   * `positive` when at least one detector should fire, `negative` when the case looks
   * like fraud and is not. The split is stated rather than derived, so a case with an
   * empty `expectedFindings` cannot be mistaken for an unfinished one.
   */
  kind: "positive" | "negative";
  input: HoldoutInput;
  expectedFindings: ExpectedFinding[];
  expectedAction: Action;
  /**
   * How the line should read on the screen: `confiable`, `precaucion` or
   * `alerta`.
   *
   * Labelled separately from the findings on purpose, and it is not derived from
   * them here. A control can be right and the line still wrong, which is the
   * failure a clerk actually experiences and the one the per-control table
   * cannot show. Deriving this from `expectedFindings` through the same rule
   * table the engine uses would make the level matrix agree with itself by
   * construction and measure nothing.
   */
  expectedLevel: Confidence;
  /** Author's note. Not used by the harness. */
  notes?: string;
}

function fail(id: string, what: string): never {
  throw new Error(`holdout case ${id}: ${what}`);
}

function asRecord(
  value: unknown,
  id: string,
  what: string,
): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return fail(id, `${what} must be an object`);
  }
  return value as Record<string, unknown>;
}

const DETECTORS: readonly Detector[] = [
  "sat_69b",
  "clabe_forensics",
  "duplicate_invoice",
  "supplier_behaviour",
  "beneficiary_cep",
  "bank_reconciliation",
];

const ACTIONS: readonly Action[] = ["hold", "verify", "release"];
const STATES: readonly FindingState[] = [
  "comprobable",
  "requiere_verificacion",
];
const SEVERITIES: readonly Severity[] = ["info", "warning", "critical"];
const LEVELS: readonly Confidence[] = ["confiable", "precaucion", "alerta"];

/** Every level, in the order the matrix prints them: best news first. */
export const ALL_LEVELS = LEVELS;

/** Every detector, in the order the metrics table prints them. */
export const ALL_DETECTORS = DETECTORS;

/**
 * Validates a parsed JSON case and narrows it. Structural only: it checks that the
 * enumerations are real values and that the labels are consistent with `kind`, and it
 * does not check that the instruction is plausible, because "plausible" is the author's
 * judgement and not something a parser can hold an opinion about.
 */
export function parseHoldoutCase(value: unknown): HoldoutCase {
  const raw = asRecord(value, "<unknown>", "case");
  const id = typeof raw.id === "string" && raw.id !== "" ? raw.id : undefined;
  if (id === undefined) {
    return fail("<unknown>", "id must be a non-empty string");
  }
  if (typeof raw.title !== "string" || raw.title === "") {
    return fail(id, "title must be a non-empty string");
  }
  if (raw.kind !== "positive" && raw.kind !== "negative") {
    return fail(id, 'kind must be "positive" or "negative"');
  }
  if (
    typeof raw.expectedAction !== "string" ||
    !ACTIONS.includes(raw.expectedAction as Action)
  ) {
    return fail(id, `expectedAction must be one of ${ACTIONS.join(", ")}`);
  }
  if (
    typeof raw.expectedLevel !== "string" ||
    !LEVELS.includes(raw.expectedLevel as Confidence)
  ) {
    // Required, not optional. A case with no level would be silently dropped
    // from the matrix, and a matrix computed over the cases that happened to
    // carry a label is a number nobody can reason about.
    return fail(id, `expectedLevel must be one of ${LEVELS.join(", ")}`);
  }

  const input = asRecord(raw.input, id, "input");
  const instruction = asRecord(input.instruction, id, "input.instruction");
  if (
    typeof instruction.id !== "string" ||
    typeof instruction.clabe !== "string"
  ) {
    return fail(id, "input.instruction needs at least an id and a clabe");
  }
  if (instruction.synthetic !== true) {
    // ADR-0002: there is no non-synthetic object anywhere in this repository, and a
    // holdout case is the easiest place for a real RFC to slip in unnoticed.
    return fail(id, "input.instruction.synthetic must be true");
  }

  if (!Array.isArray(raw.expectedFindings)) {
    return fail(id, "expectedFindings must be an array");
  }
  const expectedFindings = raw.expectedFindings.map((entry) => {
    const finding = asRecord(entry, id, "expectedFindings[]");
    if (
      typeof finding.detector !== "string" ||
      !DETECTORS.includes(finding.detector as Detector)
    ) {
      return fail(id, `detector must be one of ${DETECTORS.join(", ")}`);
    }
    if (
      finding.state !== undefined &&
      !STATES.includes(finding.state as FindingState)
    ) {
      return fail(id, `state must be one of ${STATES.join(", ")}`);
    }
    if (
      finding.severity !== undefined &&
      !SEVERITIES.includes(finding.severity as Severity)
    ) {
      return fail(id, `severity must be one of ${SEVERITIES.join(", ")}`);
    }
    return finding as unknown as ExpectedFinding;
  });

  const detectors = expectedFindings.map((finding) => finding.detector);
  if (new Set(detectors).size !== detectors.length) {
    // One expectation per detector per case keeps the confusion matrix well defined:
    // TP, FP and FN are counted over case-by-detector pairs.
    return fail(id, "expectedFindings must carry each detector at most once");
  }
  if (raw.kind === "positive" && expectedFindings.length === 0) {
    return fail(id, "a positive case must expect at least one finding");
  }
  if (raw.kind === "negative" && expectedFindings.length > 0) {
    return fail(id, "a negative case must expect no findings");
  }

  return {
    id,
    title: raw.title,
    kind: raw.kind,
    input: input as unknown as HoldoutInput,
    expectedFindings,
    expectedAction: raw.expectedAction as Action,
    expectedLevel: raw.expectedLevel as Confidence,
    ...(typeof raw.notes === "string" ? { notes: raw.notes } : {}),
  };
}
