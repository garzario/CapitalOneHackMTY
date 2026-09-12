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
 *
 * The second half of this file composes the other five controls into the
 * findings that reach `decide`. Every control is an explicit, typed
 * `DetectorAdapter` over one `ComposeInput`, and every one of them ends up in
 * either `report.ran` or `report.skipped` with a reason. That accounting is the
 * whole of issue #106: the registry it replaced discovered modules by dynamic
 * import, guessed their argument tuples from arity, called none of them, and
 * returned an empty payment run that every test read as "sin hallazgos".
 */

import { detectSupplierBehaviour } from "./behaviour";
import { detectClabe } from "./clabe";
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
  SweepResult,
} from "./domain";
import { detectDuplicateInvoice } from "./duplicates";
import { formatAmount, fromCents, toCents } from "./money";
import { detectBankReconciliation } from "./reconciliation";
import type { LedgerTx } from "./types";

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

/* -------------------------------------------------------------------------- */
/* Composing the six controls                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Everything the six controls of ADR-0002 are given, as one typed object.
 *
 * One object rather than six argument tuples, and that is the whole point of
 * this type. The previous version of this file discovered detector modules by
 * dynamic import and guessed their argument tuples by arity; the guesses stopped
 * matching the real signatures and every slot quietly returned nothing while the
 * tests stayed green. A payment run that reports "sin hallazgos" because the
 * engine could not call its own detectors is the one failure this product cannot
 * ship, so the call shape is a type now and a wrong one is a compile error.
 *
 * Building this is the caller's job, because gathering the evidence needs a
 * database and this package owns no clock, no network and no connection.
 */
export interface ComposeInput {
  /** The payment about to leave. The composition is about this one. */
  instruction: PaymentInstruction;
  /** Absent when this RFC has never been paid before, which is itself a signal. */
  supplier?: Supplier;
  /**
   * EVERY CFDI the company holds, not only this supplier's. The concentration
   * signal of `supplier_behaviour` needs the whole ledger as its denominator:
   * handed one issuer's invoices it would read every supplier as 100 percent of
   * the spend. The duplicate detector narrows to `instruction.cfdiUuids` itself.
   */
  cfdis: readonly Cfdi[];
  /** Every payment complement the company holds, for the same reason. */
  complements: readonly PaymentComplement[];
  /**
   * The Article 69-B rows in force for `instruction.supplierRfc`, across every
   * list version we hold, in any order.
   *
   * Empty means this RFC is on no version we hold, which is the good news. It
   * does NOT mean no list is loaded: that is a question about the list registry
   * and it is answered by the list endpoint, never by a detector.
   */
  satEntries: readonly SatListEntry[];
  /** The CEP already verified for the account this instruction pays, if any. */
  cep?: Cep;
  /**
   * The company's own bank statement, mirrored from Nessie and normalised into
   * `LedgerTx`. Empty means the mirror was not loaded, and the reconciliation
   * control says so rather than reporting every payment as missing from it.
   */
  bankMirror: readonly LedgerTx[];
  /** The instant the run happens, ISO 8601. This package owns no clock. */
  now: string;
  /**
   * The retroactive sweep of the newest 69-B publication, when one has been run.
   * It carries what a newly listed supplier already cost us in deductions we
   * have taken, which is money at risk that this instruction's own amount does
   * not describe.
   */
  sweep?: SweepResult;
}

/**
 * Why a control produced nothing. Every value is a structural fact about the
 * evidence, not a shrug: a skipped control is a control the clerk is not
 * getting, and the screen has to be able to say which one and why.
 *
 * A detector that ran and found nothing is NOT a skip. "Este proveedor no esta
 * en la lista" is an answer.
 */
export type SkipReason =
  | "no_supplier"
  | "no_cep"
  | "cep_other_account"
  | "no_bank_mirror"
  | "invalid_findings"
  | "threw";

/** What one adapter answers: findings, or a named reason there are none. */
export type DetectorOutcome =
  | { status: "ran"; findings: readonly Finding[] }
  | { status: "skipped"; reason: SkipReason; detail: string };

/** The control ran. Zero findings is a legitimate, and usual, answer. */
export function detectorRan(findings: readonly Finding[]): DetectorOutcome {
  return { status: "ran", findings };
}

/** The control could not run, and this is exactly what was missing. */
export function detectorSkipped(
  reason: SkipReason,
  detail: string,
): DetectorOutcome {
  return { status: "skipped", reason, detail };
}

/**
 * One of the six controls, adapted to `ComposeInput`.
 *
 * The adapter is the only place that knows a detector's real signature, and it
 * is typed, so a detector whose arguments change breaks the build of its adapter
 * instead of silently producing an empty payment run.
 */
export interface DetectorAdapter {
  detector: Detector;
  /** Pure. Dirty data is survived, never thrown on. */
  run(input: ComposeInput): DetectorOutcome;
}

export interface SkippedDetector {
  detector: Detector;
  reason: SkipReason;
  /** One sentence naming what was missing, for the report and for the screen. */
  detail: string;
}

export interface CompositionReport {
  /** Every finding, deduplicated, in alert rail order. */
  findings: Finding[];
  /** Controls that ran, whether or not they found anything. */
  ran: Detector[];
  /** Controls that did not, each with the reason it did not. */
  skipped: SkippedDetector[];
}

/**
 * Runs the adapters it is given and returns their findings in alert rail order,
 * biggest pesos at risk first.
 *
 * Every adapter appears in exactly one of `ran` and `skipped`, so
 * `ran.length + skipped.length` is the number of controls that were offered and
 * a control can never disappear between the two. That accounting is the contract
 * this function exists to keep: silence that reads as "nothing found" is the
 * failure mode this file was rewritten to remove.
 *
 * Nothing is discovered. The adapters are an argument because a bundled
 * deployment resolves no dynamic import, and because a test must not depend on
 * which detector pull request merged first.
 */
export function composeFindingsReport(
  input: ComposeInput,
  adapters: readonly DetectorAdapter[],
): CompositionReport {
  const report: CompositionReport = { findings: [], ran: [], skipped: [] };
  const collected: Finding[] = [];

  for (const adapter of adapters) {
    let outcome: DetectorOutcome;
    try {
      outcome = adapter.run(input);
    } catch (error) {
      // One control crashing is a missing control, not a blank payment run. The
      // clerk still sees the other five and the report names the one that is
      // out.
      report.skipped.push({
        detector: adapter.detector,
        reason: "threw",
        detail: messageOf(error),
      });
      continue;
    }

    if (outcome.status === "skipped") {
      report.skipped.push({
        detector: adapter.detector,
        reason: outcome.reason,
        detail: outcome.detail,
      });
      continue;
    }

    // A single malformed row is dropped rather than shown to the clerk as half
    // an alert. A detector whose every row is malformed has a bug, and that is
    // reported instead of rendering as "nothing found".
    const kept = outcome.findings.filter(isFinding);
    if (kept.length === 0 && outcome.findings.length > 0) {
      report.skipped.push({
        detector: adapter.detector,
        reason: "invalid_findings",
        detail: `${adapter.detector} returned ${outcome.findings.length} rows and none of them is a Finding`,
      });
      continue;
    }

    collected.push(...kept);
    report.ran.push(adapter.detector);
  }

  report.findings = sortFindings(collected);
  return report;
}

/** `composeFindingsReport` when the caller only wants the alert rail. */
export function composeFindings(
  input: ComposeInput,
  adapters: readonly DetectorAdapter[],
): Finding[] {
  return composeFindingsReport(input, adapters).findings;
}

/* -------------------------------------------------------------------------- */
/* The four adapters that need nothing but this package                        */
/* -------------------------------------------------------------------------- */

/**
 * CLABE forensics, control 2.
 *
 * Runs on every instruction, supplier or not: an RFC with no history at all is
 * the brand-new-supplier case, and the detector reports it as a warning rather
 * than staying silent.
 */
export const clabeForensicsAdapter: DetectorAdapter = {
  detector: "clabe_forensics",
  run: (input) =>
    detectorRan(
      listOf(
        detectClabe(input.instruction, input.supplier, { now: input.now }),
      ),
    ),
};

/**
 * Duplicate invoices, control 3.
 *
 * Only the CFDIs this instruction claims to settle are under review. Without
 * that narrowing the settlement rules flag every invoice the company has ever
 * paid, which is every invoice in a healthy ledger. An instruction that names no
 * CFDI settles nothing, so the control runs and finds nothing: a result, not a
 * skip.
 */
export const duplicateInvoiceAdapter: DetectorAdapter = {
  detector: "duplicate_invoice",
  run: (input) =>
    detectorRan(
      detectDuplicateInvoice({
        cfdis: input.cfdis,
        complements: input.complements,
        underReview: input.instruction.cfdiUuids,
        now: input.now,
      }),
    ),
};

/**
 * Supplier behaviour change, control 4.
 *
 * Skipped, with a reason, when the RFC has never been paid: there is no history
 * to measure a change against, and the new-supplier case already belongs to
 * `clabe_forensics`.
 *
 * A supplier whose history is too thin to test is NOT a skip. The detector runs,
 * gates itself on sample size and stays silent, which is the honest answer and
 * the one `assessSupplierBehaviour` spells out for the screen.
 */
export const supplierBehaviourAdapter: DetectorAdapter = {
  detector: "supplier_behaviour",
  run: (input) => {
    const { supplier } = input;
    if (supplier === undefined) {
      return detectorSkipped(
        "no_supplier",
        `Nunca hemos pagado a ${input.instruction.supplierRfc}, asi que no hay historial contra el cual medir un cambio de comportamiento.`,
      );
    }
    return detectorRan(
      listOf(
        detectSupplierBehaviour({
          supplier,
          cfdis: input.cfdis,
          now: input.now,
        }),
      ),
    );
  },
};

/**
 * Bank reconciliation, control 6, asked from one instruction's side.
 *
 * The detector is a run-level control: it reconciles the whole mirror against
 * every document the company holds. Composed for one payment it is asked a
 * narrower question, "does our own bank statement already contradict this
 * instruction", so the pass runs over everything and only the findings whose
 * subject is this instruction or one of its CFDIs come back. An
 * `unbacked_outflow` is money that left with no document at all: that is a
 * finding about the run and not about the payment on the clerk's screen, and the
 * run-level sweep calls `detectBankReconciliation` directly to get it.
 *
 * Skipped, with a reason, when the mirror is empty. An empty statement cannot
 * tell "the bank posted nothing" from "the mirror was never imported", and
 * reporting every sent payment as missing from a statement we do not hold is how
 * a clerk learns to ignore a control.
 */
export const bankReconciliationAdapter: DetectorAdapter = {
  detector: "bank_reconciliation",
  run: (input) => {
    if (input.bankMirror.length === 0) {
      return detectorSkipped(
        "no_bank_mirror",
        "El espejo bancario no esta cargado, asi que no hay estado de cuenta contra el cual conciliar.",
      );
    }
    const uuids = new Set(input.instruction.cfdiUuids);
    const findings = detectBankReconciliation(
      input.bankMirror,
      [input.instruction],
      input.cfdis,
      input.complements,
      { now: input.now },
    );
    return detectorRan(
      findings.filter(
        (finding) =>
          (finding.subject.kind === "instruction" &&
            finding.subject.id === input.instruction.id) ||
          (finding.subject.kind === "cfdi" && uuids.has(finding.subject.id)),
      ),
    );
  },
};

/**
 * The four controls that need nothing outside this package, in the order
 * `Detector` declares them.
 *
 * `sat_69b` and `beneficiary_cep` are not here and cannot be: they read
 * `@hackmty/sat` and `@hackmty/cep`, both of which already depend on this
 * package, and `packages/core` carries zero runtime dependencies by rule. Their
 * adapters live in `@hackmty/engine`, which composes all six.
 */
export const CORE_DETECTORS: readonly DetectorAdapter[] = [
  clabeForensicsAdapter,
  duplicateInvoiceAdapter,
  supplierBehaviourAdapter,
  bankReconciliationAdapter,
];

/* -------------------------------------------------------------------------- */
/* Pricing the relationship                                                    */
/* -------------------------------------------------------------------------- */

/**
 * What a day of delay costs with a supplier whose record does not price the
 * relationship.
 *
 * Zero is conservative rather than neutral: with no delay cost the engine
 * verifies anything that carries a positive expected loss and releases only what
 * is clean. That is the reading that never moves money on a guess, and it is the
 * number `Supplier.delayCostPerDay` exists to replace.
 */
export const DEFAULT_DELAY_COST_PER_DAY = 0;

/** An ordinary supplier. Above 1 is the one whose delay stops the line. */
export const DEFAULT_RELATIONSHIP_WEIGHT = 1;

/**
 * The cost model for one supplier, read off the supplier record.
 *
 * The caller passes the record and not a number, so the engine cannot be handed
 * a constant somebody invented in a route handler. A record with no price, a
 * negative price or a non-finite one falls back to the documented default rather
 * than throwing: one bad supplier row must not blank out a payment run, and
 * `assertSupplierModel` still guards a model built by hand.
 *
 * `relationshipWeight` has no field on `Supplier` yet, so it stays at 1 here.
 */
export function supplierModelOf(supplier?: Supplier): SupplierModel {
  const priced = supplier?.delayCostPerDay;
  const delayCostPerDay =
    priced !== undefined && Number.isFinite(priced) && priced >= 0
      ? priced
      : DEFAULT_DELAY_COST_PER_DAY;
  return { delayCostPerDay, relationshipWeight: DEFAULT_RELATIONSHIP_WEIGHT };
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
      subject.kind === "supplier" ||
      // The bank mirror is a legal subject: an outflow with no document behind
      // it has nothing else to hang a finding on. Leaving it out of this guard
      // dropped every `unbacked_outflow` on the floor.
      subject.kind === "ledger_tx") &&
    typeof finding.amountAtRisk === "number" &&
    typeof finding.explanation === "string" &&
    typeof finding.createdAt === "string"
  );
}

/** A detector that answers with one finding or none, as a list. */
function listOf(finding: Finding | null): Finding[] {
  return finding === null ? [] : [finding];
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
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
