/**
 * The sixth control of ADR-0002: hold, verify or release, decided by expected
 * loss.
 *
 * The other five controls produce findings. This module is the one that turns
 * findings into an action, and it is the only place in the product where the
 * cost of being wrong is written down. Two numbers meet here:
 *
 * - the expected loss of paying, which is the pesos at risk times how often a
 *   finding of that severity turns out to be a real loss, and
 * - the cost of not paying, which is real money too: a supplier that stops
 *   shipping, a discount lost, a relationship spent.
 *
 * An engine that looks only at the first number holds everything, and the clerk
 * switches it off in week two. That failure mode is why this file exists and
 * why `SupplierModel` is an argument rather than a constant.
 *
 * Nothing here accuses anyone, which is binding narrative from ADR-0002. A
 * finding is `comprobable` (provable from the documents) or
 * `requiere_verificacion` (a person has to check), the engine proposes an
 * action, and `Decision.decidedBy` stays absent until a human presses the
 * button. `release` means "nothing stops this payment", never "paid
 * automatically".
 *
 * Purity, like everywhere in this package: no clock, no network, no mutation of
 * the caller's arrays. The decision instant is passed in or derived from the
 * evidence, so the same payment run decided twice gives the same answer.
 */

import type {
  Action,
  Cep,
  Cfdi,
  Decision,
  Detector,
  Finding,
  PaymentComplement,
  PaymentInstruction,
  SatListEntry,
  Severity,
  Supplier,
} from "./domain";
import { formatAmount, fromCents, toCents } from "./money";

/**
 * How often a finding of each severity turns out to be a real loss, that is,
 * the precision we expect from the detectors that fire at that severity.
 *
 * They sit in one table on purpose: tuning the engine has to be a one-line
 * change a reviewer can see in a diff, not a number buried in a branch. The
 * shape of the table is the argument, the values are the assumption. `critical`
 * is pessimistic (a supplier on the definitive 69-B list, or a CLABE that fails
 * its own check digit, is wrong far more often than not) and `info` is almost
 * dismissive, so noise alone never moves an action.
 *
 * TODO(garzario): replace each value with the precision measured per detector
 * by the blind evaluation in issue #55. Until that labelled holdout exists
 * these are priors, and the UI says so rather than implying they were measured.
 */
export const LOSS_PROBABILITY_BY_SEVERITY: Readonly<Record<Severity, number>> =
  {
    critical: 0.6,
    warning: 0.15,
    info: 0.02,
  };

/**
 * Days of delay each action buys.
 *
 * A verification is one phone call to the supplier on a number we already had,
 * so one day. A hold waits for the clerk, the accountant and often the
 * supplier's own bank, so three. `release` delays nothing, which is what makes
 * releasing the default when the arithmetic says the payment is fine.
 */
export const EXPECTED_DELAY_DAYS: Readonly<Record<Action, number>> = {
  hold: 3,
  verify: 1,
  release: 0,
};

/** Sort order of the alert rail when two findings put the same pesos at risk. */
export const SEVERITY_RANK: Readonly<Record<Severity, number>> = {
  critical: 3,
  warning: 2,
  info: 1,
};

/**
 * What a day of delay costs this company with this supplier.
 *
 * `delayCostPerDay` is pesos: late-payment interest, the early-payment discount
 * that expires, the line that stops. `relationshipWeight` scales it, because
 * the same delay is not the same event for every supplier: 1 is the ordinary
 * case, 0 is a supplier who will not notice, above 1 is the single-source
 * supplier who stops the production line. Weighting the cost and not the
 * probability is deliberate: the relationship changes what a delay is worth, it
 * cannot change how likely the invoice is to be fraudulent.
 */
export interface SupplierModel {
  /** Pesos lost for every day this payment is late. Never negative. */
  delayCostPerDay: number;
  /** Multiplier on that cost. 1 is an ordinary supplier. Never negative. */
  relationshipWeight: number;
}

/** The arithmetic behind an action, kept so the screen can show its own maths. */
export interface LossEstimate {
  /** Pesos the worst single finding says are at risk. */
  exposure: number;
  /** `exposure` in cents, for exact comparisons. */
  exposureCents: number;
  /** Probability that this payment is really a loss, stacked over findings. */
  probability: number;
  /** `exposure` times `probability`, to the cent. */
  expectedLoss: number;
  /** `expectedLoss` in cents. Nothing in this repo compares two floats. */
  expectedLossCents: number;
  /** How many findings carried a usable amount at risk. */
  counted: number;
}

/** Which rule fired. The UI shows this, and the ledger can be audited by it. */
export type DecisionRule =
  | "no_findings"
  | "critical_comprobable"
  | "critical_requiere_verificacion"
  | "expected_loss_over_delay_cost"
  | "expected_loss_under_delay_cost";

const ACTION_BY_RULE: Readonly<Record<DecisionRule, Action>> = {
  no_findings: "release",
  critical_comprobable: "hold",
  critical_requiere_verificacion: "verify",
  expected_loss_over_delay_cost: "verify",
  expected_loss_under_delay_cost: "release",
};

/** The `Decision` plus everything that was used to reach it. */
export interface DecisionAssessment {
  /** Exactly the domain object, which is what the ledger stores. */
  decision: Decision;
  rule: DecisionRule;
  loss: LossEstimate;
  /** What each action would cost in delay, in pesos, for this supplier. */
  delayCost: Readonly<Record<Action, number>>;
  /** One sentence for the clerk, same register as `Finding.explanation`. */
  rationale: string;
}

export interface DecideOptions {
  /**
   * The instant to stamp on the decision. Defaults to the newest piece of
   * evidence, because this package owns no clock and a decision that changes
   * every time it is recomputed cannot be replayed from the event ledger.
   */
  now?: string;
}

/**
 * Hold, verify or release one payment instruction.
 *
 * The rules, in the order they are applied:
 *
 * 1. a critical finding that is `comprobable` holds the payment. Nothing is
 *    weighed, because the documents already prove the problem and no delay cost
 *    is worth paying a definitively listed supplier.
 * 2. a critical finding that is `requiere_verificacion` asks for verification.
 * 3. with no critical finding, verify when the expected loss is strictly
 *    greater than one day of delay, otherwise release with the findings
 *    attached.
 *
 * A critical finding can therefore never reach the release branch, and that is
 * structural rather than a check bolted on the end: rules 1 and 2 return
 * before it.
 *
 * The tie goes to paying. An expected loss exactly equal to the delay cost
 * releases, because the delay cost is certain money and the loss is a
 * probability, and because a false hold is the failure the clerk remembers.
 *
 * @throws RangeError when the supplier model is not finite and non-negative.
 */
export function decide(
  instruction: PaymentInstruction,
  findings: readonly Finding[],
  supplierModel: SupplierModel,
  options: DecideOptions = {},
): Decision {
  return assessInstruction(instruction, findings, supplierModel, options)
    .decision;
}

/**
 * `decide` with its homework shown: the rule that fired, the exposure, the
 * probability, the delay cost of every action and one sentence for the clerk.
 *
 * `apps/api` returns this on the detail panel; the event ledger stores only
 * `assessment.decision`, which is the domain type, and this object can be
 * rebuilt from it at any time because every step is pure.
 */
export function assessInstruction(
  instruction: PaymentInstruction,
  findings: readonly Finding[],
  supplierModel: SupplierModel,
  options: DecideOptions = {},
): DecisionAssessment {
  assertSupplierModel(supplierModel);
  const sorted = sortFindings(findings);
  const loss = estimateLoss(sorted);
  const costs: Record<Action, number> = {
    hold: delayCost(supplierModel, "hold"),
    verify: delayCost(supplierModel, "verify"),
    release: 0,
  };
  const rule = chooseRule(
    sorted,
    loss.expectedLossCents,
    toCents(costs.verify),
  );
  const decision: Decision = {
    instructionId: instruction.id,
    action: ACTION_BY_RULE[rule],
    expectedLoss: loss.expectedLoss,
    delayCostPerDay: supplierModel.delayCostPerDay,
    findings: sorted,
    decidedAt: options.now ?? newestInstant(instruction, sorted),
  };
  return {
    decision,
    rule,
    loss,
    delayCost: costs,
    rationale: rationaleFor(rule, loss, costs),
  };
}

/**
 * Expected loss over a set of findings.
 *
 * Two rules, and they are the part of this engine worth arguing about.
 *
 * The amount is the largest single `amountAtRisk`, never the sum. Six detectors
 * looking at one payment describe the same pesos from six angles: a duplicate
 * invoice for 184,300 and a CLABE that changed on the same instruction do not
 * put 368,600 at risk, they put 184,300 at risk twice as convincingly. Summing
 * would inflate the headline number precisely on the instructions with the most
 * evidence, which is the number a judge will check first. The one case where an
 * amount legitimately exceeds the instruction is the 69-B retroactive sweep,
 * where the detector already carries the whole deducted exposure in its own
 * `amountAtRisk`, and taking the maximum keeps it.
 *
 * The evidence stacks in the probability instead, as a noisy-OR: the payment
 * survives only if every finding is a false alarm. Two warnings at 0.15 give
 * 0.2775, not 0.30, and never reach 1. The assumption behind the product is
 * independence between detectors, which is only approximately true, so the
 * result is read as an upper bound on the evidence and never as a calibrated
 * probability.
 *
 * Dirty input is survived, not rejected: a finding whose `amountAtRisk` is
 * missing, negative, non-finite or too large to hold in cents counts as zero
 * pesos and still contributes its probability, because one detector with a bug
 * must not blank out a payment run.
 */
export function estimateLoss(findings: readonly Finding[]): LossEstimate {
  let exposureCents = 0;
  let survives = 1;
  let counted = 0;
  for (const finding of findings) {
    const cents = riskCents(finding);
    if (cents > exposureCents) {
      exposureCents = cents;
    }
    if (cents > 0) {
      counted += 1;
    }
    survives *= 1 - probabilityOf(finding.severity);
  }
  const probability = Math.min(Math.max(1 - survives, 0), 1);
  const expectedLossCents = Math.round(exposureCents * probability);
  return {
    exposure: fromCents(exposureCents),
    exposureCents,
    probability,
    expectedLoss: fromCents(expectedLossCents),
    expectedLossCents,
    counted,
  };
}

/**
 * What delaying this payment by one action costs, in pesos.
 *
 * @throws RangeError when the supplier model is not finite and non-negative.
 */
export function delayCost(model: SupplierModel, action: Action): number {
  assertSupplierModel(model);
  const days = EXPECTED_DELAY_DAYS[action] ?? 0;
  const perDayCents = toCents(model.delayCostPerDay);
  return fromCents(Math.round(perDayCents * days * model.relationshipWeight));
}

/**
 * The alert rail order: biggest pesos at risk first, because that is the
 * question the clerk is actually asking, then the graver severity, then the
 * oldest evidence, then the id so two runs over the same data agree.
 *
 * Findings are deduplicated by id, first one kept: two detectors that both
 * derive the same finding of a shared cause must not show the clerk the same
 * row twice. The caller's array is never touched.
 */
export function sortFindings(findings: readonly Finding[]): Finding[] {
  const seen = new Set<string>();
  const unique: Finding[] = [];
  for (const finding of findings) {
    if (seen.has(finding.id)) {
      continue;
    }
    seen.add(finding.id);
    unique.push(finding);
  }
  return unique.sort((left, right) => {
    const byAmount = riskCents(right) - riskCents(left);
    if (byAmount !== 0) {
      return byAmount;
    }
    const bySeverity = rankOf(right.severity) - rankOf(left.severity);
    if (bySeverity !== 0) {
      return bySeverity;
    }
    if (left.createdAt !== right.createdAt) {
      return left.createdAt < right.createdAt ? -1 : 1;
    }
    return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
  });
}

/**
 * Everything a detector is given. One object, so a detector that later needs
 * another source is a change in this file and not in six signatures.
 */
export interface DetectorContext {
  instruction: PaymentInstruction;
  /** Absent when this RFC has never been paid before, which is itself a signal. */
  supplier?: Supplier;
  cfdis: readonly Cfdi[];
  complements: readonly PaymentComplement[];
  satEntries: readonly SatListEntry[];
  cep?: Cep;
}

/** The contract a detector module satisfies to be run by `composeFindings`. */
export interface DetectorModule {
  detector: Detector;
  run(context: DetectorContext): Finding[] | Promise<Finding[]>;
}

export interface ComposeOptions {
  /**
   * Run exactly these detectors and discover nothing. Two callers need it: a
   * test that must not depend on which detector PR merged first, and a bundled
   * deployment, where a dynamic import built from a variable is not resolved at
   * build time and would silently find nothing.
   */
  detectors?: readonly DetectorModule[];
}

/**
 * Why a slot produced nothing: the module is not written yet, the detector
 * answered with something that is not a `Finding[]`, or it threw.
 */
export type SkipReason = "not_built" | "no_result" | "threw";

/** Raised when no call shape produced findings, so the report can say so. */
class DetectorShapeError extends TypeError {}

export interface CompositionReport {
  findings: Finding[];
  /** Detectors that ran, whether or not they found anything. */
  ran: Detector[];
  skipped: Array<{ detector: Detector; reason: SkipReason }>;
}

/**
 * Where each detector is expected to live and what it is expected to be called.
 *
 * The registry exists so that six detector pull requests can land in any order
 * during a 36 hour event without a merge conflict in this file and without a
 * broken import in `dev`. A slot whose module has not been written yet is
 * skipped and reported, never thrown on.
 *
 * Only modules inside this package are listed. `packages/sat` and
 * `packages/cep` are separate workspaces, and `packages/core` having zero
 * dependencies is the rule in its README, so those two detectors reach the
 * engine through `options.detectors` from `apps/api` instead.
 *
 * The export names and argument tuples come from the issues that define each
 * detector (#34 CLABE, #35 69-B, #36 duplicates and behaviour, #37 CEP, #39
 * reconciliation). They are a best effort at somebody else's signature; the
 * contract that is actually guaranteed is `DetectorModule`.
 */
interface DetectorSlot {
  detector: Detector;
  /** Module specifiers relative to this file, tried in order. */
  modules: readonly string[];
  /** Export names, tried in order. */
  exports: readonly string[];
  /** Lowercase fragments that identify this detector in a shared module. */
  keywords: readonly string[];
  /** The positional arguments this detector is expected to take. */
  positional: (context: DetectorContext) => readonly unknown[];
}

const DETECTOR_REGISTRY: readonly DetectorSlot[] = [
  {
    detector: "sat_69b",
    modules: ["./sat69b", "./sat-69b"],
    exports: ["detectSat69b", "detectSat69B"],
    keywords: ["69b", "sat"],
    positional: (context) => [context.supplier, context.satEntries],
  },
  {
    detector: "clabe_forensics",
    modules: ["./clabe", "./clabe-forensics"],
    exports: ["detectClabeForensics", "detectClabe"],
    keywords: ["clabe"],
    positional: (context) => [context.instruction, context.supplier],
  },
  {
    detector: "duplicate_invoice",
    modules: ["./duplicates", "./duplicate-invoice", "./behaviour"],
    exports: ["detectDuplicateInvoices", "detectDuplicateInvoice"],
    keywords: ["duplicate"],
    positional: (context) => [context.instruction, context.cfdis],
  },
  {
    detector: "supplier_behaviour",
    modules: ["./behaviour", "./supplier-behaviour", "./duplicates"],
    exports: ["detectSupplierBehaviour", "detectSupplierBehavior"],
    keywords: ["behaviour", "behavior"],
    positional: (context) => [
      context.supplier,
      context.cfdis,
      context.instruction,
    ],
  },
  {
    detector: "beneficiary_cep",
    modules: ["./beneficiary", "./cep-beneficiary"],
    exports: ["detectBeneficiaryCep", "detectCepBeneficiary"],
    keywords: ["beneficiary", "cep"],
    positional: (context) => [
      context.cep,
      context.supplier,
      context.instruction,
    ],
  },
  {
    detector: "bank_reconciliation",
    modules: ["./reconciliation", "./bank-reconciliation"],
    exports: ["detectBankReconciliation", "detectReconciliation"],
    keywords: ["reconcil"],
    positional: (context) => [
      context.instruction,
      context.cfdis,
      context.complements,
    ],
  },
];

/**
 * Runs every detector that exists and returns their findings in alert rail
 * order, biggest pesos at risk first.
 *
 * The arguments are the payment run as the clerk sees it: one instruction, the
 * supplier behind it if we have ever paid that RFC, the invoices it claims to
 * settle, the payment complements that established its known accounts, the SAT
 * list version in force, and the CEP when one has been fetched for this
 * beneficiary.
 *
 * A detector that has not been written yet, that throws, or that answers with
 * something that is not a `Finding[]` is skipped. Use `composeFindingsReport`
 * when the caller needs to know which of the six were live, for example to show
 * the clerk that the CEP control is not armed on this instruction.
 */
export async function composeFindings(
  instruction: PaymentInstruction,
  supplier: Supplier | undefined,
  cfdis: readonly Cfdi[],
  complements: readonly PaymentComplement[],
  satEntries: readonly SatListEntry[],
  cep?: Cep,
  options: ComposeOptions = {},
): Promise<Finding[]> {
  const report = await composeFindingsReport(
    { instruction, supplier, cfdis, complements, satEntries, cep },
    options,
  );
  return report.findings;
}

/** `composeFindings` plus which detectors ran and why the others did not. */
export async function composeFindingsReport(
  context: DetectorContext,
  options: ComposeOptions = {},
): Promise<CompositionReport> {
  const report: CompositionReport = { findings: [], ran: [], skipped: [] };
  const collected: Finding[] = [];

  if (options.detectors !== undefined) {
    for (const module of options.detectors) {
      await runInto(module, context, collected, report);
    }
    report.findings = sortFindings(collected);
    return report;
  }

  for (const slot of DETECTOR_REGISTRY) {
    const module = await loadSlot(slot);
    if (module === undefined) {
      report.skipped.push({ detector: slot.detector, reason: "not_built" });
      continue;
    }
    await runInto(module, context, collected, report);
  }
  report.findings = sortFindings(collected);
  return report;
}

/**
 * Wraps whatever a detector module exported into the `DetectorModule` contract,
 * or refuses it.
 *
 * Three shapes are accepted, in this order: an object with a `run` method, a
 * function that takes the whole context, and a function that takes positional
 * arguments. The last two are told apart by arity as a first guess, and both
 * are attempted at call time, because a function declared with two parameters
 * and a function declared with one are the two honest readings of somebody
 * else's detector. A shape that answers with findings wins; if every shape
 * answers with an empty array, the answer is an empty array.
 *
 * `apps/api` uses this directly when it imports a detector statically, so that
 * a bundled deployment does not depend on the dynamic registry below.
 */
export function asDetectorModule(
  detector: Detector,
  value: unknown,
  positional?: (context: DetectorContext) => readonly unknown[],
): DetectorModule | undefined {
  if (value !== null && typeof value === "object") {
    const run = (value as { run?: unknown }).run;
    if (typeof run === "function") {
      return {
        detector,
        run: (context) =>
          (run as (context: DetectorContext) => Finding[]).call(value, context),
      };
    }
    return undefined;
  }
  if (typeof value !== "function") {
    return undefined;
  }
  const fn = value as (...args: readonly unknown[]) => unknown;
  const contextFirst = fn.length <= 1;
  return {
    detector,
    run: async (context) => {
      const shapes: Array<readonly unknown[]> = [];
      const asPositional = positional?.(context);
      if (contextFirst || asPositional === undefined) {
        shapes.push([context]);
        if (asPositional !== undefined) {
          shapes.push(asPositional);
        }
      } else {
        shapes.push(asPositional, [context]);
      }
      let empty = false;
      for (const args of shapes) {
        const findings = keepValidFindings(await fn(...args));
        if (findings === undefined) {
          continue;
        }
        if (findings.length > 0) {
          return findings;
        }
        empty = true;
      }
      if (empty) {
        return [];
      }
      throw new DetectorShapeError(
        `detector ${detector} did not return findings`,
      );
    },
  };
}

/**
 * True when the value carries every field the rest of the product reads off a
 * finding. Exported because `apps/api` validates rows coming back from the
 * database with the same predicate the engine uses.
 */
export function isFinding(value: unknown): value is Finding {
  if (value === null || typeof value !== "object") {
    return false;
  }
  const finding = value as Partial<Finding>;
  const subject = finding.subject;
  return (
    typeof finding.id === "string" &&
    typeof finding.detector === "string" &&
    (finding.severity === "info" ||
      finding.severity === "warning" ||
      finding.severity === "critical") &&
    (finding.state === "comprobable" ||
      finding.state === "requiere_verificacion") &&
    subject !== null &&
    typeof subject === "object" &&
    typeof subject.id === "string" &&
    (subject.kind === "instruction" ||
      subject.kind === "cfdi" ||
      subject.kind === "supplier") &&
    typeof finding.amountAtRisk === "number" &&
    typeof finding.explanation === "string" &&
    typeof finding.createdAt === "string"
  );
}

async function runInto(
  module: DetectorModule,
  context: DetectorContext,
  collected: Finding[],
  report: CompositionReport,
): Promise<void> {
  try {
    const findings = keepValidFindings(await module.run(context));
    if (findings === undefined) {
      report.skipped.push({ detector: module.detector, reason: "no_result" });
      return;
    }
    collected.push(...findings);
    report.ran.push(module.detector);
  } catch (error) {
    // One detector crashing is a missing control, not a blank payment run. The
    // clerk still sees the other five, and the report says which one is out.
    report.skipped.push({
      detector: module.detector,
      reason: error instanceof DetectorShapeError ? "no_result" : "threw",
    });
  }
}

async function loadSlot(
  slot: DetectorSlot,
): Promise<DetectorModule | undefined> {
  for (const specifier of slot.modules) {
    let loaded: Record<string, unknown>;
    try {
      // The specifier is a variable so that a bundler leaves it alone instead
      // of failing the build on a detector that has not been written yet. The
      // cost is that a bundled caller finds nothing here and passes
      // `options.detectors` instead, which is what ComposeOptions documents.
      loaded = (await import(/* @vite-ignore */ specifier)) as Record<
        string,
        unknown
      >;
    } catch {
      continue;
    }
    const exported = pickExport(loaded, slot);
    if (exported === undefined) {
      continue;
    }
    const module = asDetectorModule(slot.detector, exported, slot.positional);
    if (module !== undefined) {
      return module;
    }
  }
  return undefined;
}

/**
 * The named export if it is there, otherwise any exported function whose name
 * mentions this detector. The keyword guard matters because issue #36 puts two
 * detectors in one module, and a bare "starts with detect" rule would let the
 * duplicate-invoice slot run the behaviour detector.
 */
function pickExport(
  loaded: Record<string, unknown>,
  slot: DetectorSlot,
): unknown {
  for (const name of slot.exports) {
    if (typeof loaded[name] === "function") {
      return loaded[name];
    }
  }
  for (const [name, value] of Object.entries(loaded)) {
    if (typeof value !== "function") {
      continue;
    }
    const lower = name.toLowerCase();
    if (slot.keywords.some((keyword) => lower.includes(keyword))) {
      return value;
    }
  }
  return undefined;
}

/**
 * `undefined` when the value is not an array of findings at all, which is how a
 * wrong call shape is told apart from a detector that simply found nothing.
 * Individual malformed rows are dropped.
 */
function keepValidFindings(value: unknown): Finding[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const findings = value.filter(isFinding);
  if (value.length > 0 && findings.length === 0) {
    return undefined;
  }
  return findings;
}

function chooseRule(
  findings: readonly Finding[],
  expectedLossCents: number,
  verifyCostCents: number,
): DecisionRule {
  const criticals = findings.filter(
    (finding) => finding.severity === "critical",
  );
  if (criticals.length > 0) {
    // Both critical branches return here, above the release branch, so the
    // promise that a critical finding is never auto-released is the shape of
    // this function rather than a check somebody can delete by accident.
    return criticals.some((finding) => finding.state === "comprobable")
      ? "critical_comprobable"
      : "critical_requiere_verificacion";
  }
  if (findings.length === 0) {
    return "no_findings";
  }
  return expectedLossCents > verifyCostCents
    ? "expected_loss_over_delay_cost"
    : "expected_loss_under_delay_cost";
}

/**
 * One sentence for the clerk, in the register of `Finding.explanation`: what
 * happened, what it is worth, and what it costs to wait. Spanish without
 * accents, like the rest of this repository, and the final copy belongs to
 * `apps/web`.
 */
function rationaleFor(
  rule: DecisionRule,
  loss: LossEstimate,
  costs: Readonly<Record<Action, number>>,
): string {
  const expected = formatPesos(loss.expectedLoss);
  switch (rule) {
    case "no_findings":
      return "Sin hallazgos: nada detiene este pago.";
    case "critical_comprobable":
      return `Hallazgo critico comprobable: se retiene. Perdida esperada ${expected} contra ${formatPesos(costs.hold)} de costo por tres dias de retraso.`;
    case "critical_requiere_verificacion":
      return `Hallazgo critico por verificar: se pide verificacion antes de pagar. Perdida esperada ${expected} contra ${formatPesos(costs.verify)} de costo por un dia de retraso.`;
    case "expected_loss_over_delay_cost":
      return `Perdida esperada ${expected} por encima de ${formatPesos(costs.verify)} de costo por verificar: se pide verificacion.`;
    case "expected_loss_under_delay_cost":
      return `Perdida esperada ${expected} por debajo de ${formatPesos(costs.verify)} de costo por verificar: se libera con los hallazgos adjuntos.`;
  }
}

/**
 * The instant of the newest piece of evidence, which is when this decision
 * became possible. Unparsable dates are ignored rather than thrown on, and the
 * string is returned exactly as it arrived instead of being reserialised, so
 * the decision points at a row somebody can find.
 */
function newestInstant(
  instruction: PaymentInstruction,
  findings: readonly Finding[],
): string {
  let best = instruction.receivedAt;
  let bestAt = Date.parse(instruction.receivedAt);
  for (const finding of findings) {
    const at = Date.parse(finding.createdAt);
    if (!Number.isFinite(at)) {
      continue;
    }
    if (!Number.isFinite(bestAt) || at > bestAt) {
      best = finding.createdAt;
      bestAt = at;
    }
  }
  return best;
}

/** Pesos a finding puts at risk, in cents, tolerant of a detector with a bug. */
function riskCents(finding: Finding): number {
  const amount = finding.amountAtRisk;
  if (!Number.isFinite(amount) || amount <= 0) {
    return 0;
  }
  try {
    return toCents(amount);
  } catch {
    return 0;
  }
}

function probabilityOf(severity: Severity): number {
  // A severity the table does not know is read as a warning: a detector added
  // later must not silently weigh nothing.
  return (
    LOSS_PROBABILITY_BY_SEVERITY[severity] ??
    LOSS_PROBABILITY_BY_SEVERITY.warning
  );
}

function rankOf(severity: Severity): number {
  return SEVERITY_RANK[severity] ?? 0;
}

function assertSupplierModel(model: SupplierModel): void {
  if (!Number.isFinite(model.delayCostPerDay) || model.delayCostPerDay < 0) {
    throw new RangeError(
      `delayCostPerDay must be a non-negative number: ${String(model.delayCostPerDay)}`,
    );
  }
  if (
    !Number.isFinite(model.relationshipWeight) ||
    model.relationshipWeight < 0
  ) {
    throw new RangeError(
      `relationshipWeight must be a non-negative number: ${String(model.relationshipWeight)}`,
    );
  }
}

/** Plain ASCII pesos for a sentence, from the same formatter as the tables. */
function formatPesos(amount: number): string {
  return `${formatAmount(amount)} MXN`;
}
