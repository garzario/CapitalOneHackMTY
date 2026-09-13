/**
 * The two derivations every screen, every document and every mock reads: how much
 * a payment is trusted, and where it stands.
 *
 * They exist because the alternative was four implementations. The engine knew the
 * severity of its findings, the API knew the action, the web knew the colour of the
 * chip and the offline mock knew a hand-written guess, and a judge who clicked a
 * line whose API answer had fallen back to the mock saw two different levels for
 * one payment. One pure function per question, shared by all of them, is the fix,
 * and ADR-0009 carries the exact rule table these two implement.
 *
 * Three properties hold and they are what make the pair safe to share.
 *
 * **No number reaches a screen.** `confidenceOf` answers one of three words.
 * `estimateLoss` in `./decision.ts` says in its own comment that its figure is an
 * upper bound on the evidence and not a calibrated probability, so printing it
 * next to a supplier's name would be a precision nobody earned. The level carries
 * the findings that produced it instead, which is the evidence a clerk can read.
 *
 * **Nothing here decides anything.** Both functions are projections over what the
 * engine, the verification and the rail already did. A level never holds a payment
 * and a state never releases one: `decide` proposes the action, a person signs it,
 * and these two say how that reads.
 *
 * **A person's signature wins.** The one place the two rules could argue with a
 * human is a definitively listed supplier somebody released on their own
 * responsibility with a written reason, and there the signature wins: the line
 * reads `liberado` and then `enviado`, never `cancelado`. ADR-0002 forbids the
 * product overriding a person in either direction.
 *
 * Pure, like the rest of this package: no clock, no network, no mutation.
 */

import type {
  Confidence,
  Decision,
  Finding,
  PaymentExecution,
  PaymentExecutionLine,
  TransactionState,
  VerificationState,
} from "./domain";
import { SYSTEM_DECIDER } from "./domain";

/**
 * What `confidenceOf` reads off a decision, and it is one field.
 *
 * Stated as a `Pick` rather than the whole `Decision` for the reason `holdWindow`
 * states it: the signature is then the documentation of what the function looks at,
 * a caller holding a half-built decision can still ask, and a full `Decision`
 * satisfies it without a cast.
 */
export type DecisionLevelInput = Pick<Decision, "action">;

/**
 * What `transactionStateOf` reads off a decision: the action, who signed it, and
 * the findings, which are optional here because the only rule that reads them is
 * the SAT one and a caller that has none is answered by the other seven.
 */
export type DecisionStateInput = Pick<Decision, "action" | "decidedBy"> & {
  findings?: readonly Finding[];
};

/** What `transactionStateOf` reads off a verification: the state machine, nothing else. */
export type VerificationStateInput = Pick<VerificationState, "state">;

/** What `transactionStateOf` reads off an execution line. */
export type ExecutionStateInput = Pick<PaymentExecutionLine, "state">;

/**
 * The value `@hackmty/engine` writes into `evidence.article` on a finding that
 * comes from the article 49 Bis list, which `@hackmty/sat` exports as
 * `ART_49BIS_LABEL`.
 *
 * Repeated here rather than imported because this package has no dependencies at
 * all and `@hackmty/sat` depends on it, so importing the constant would invert the
 * graph. ADR-0009 names both ends of the string, and the detector id is unchanged:
 * a 49 Bis finding is `sat_69b` because ADR-0002 has six controls and control 1 is
 * the SAT lists cross-check.
 */
export const SAT_49BIS_ARTICLE = "49 Bis";

/**
 * The CLABE forensics signals that mean the account in front of us has no history
 * behind it.
 *
 * `new_supplier` is an RFC we have never paid, `first_time_seen` is a supplier we
 * know paid on an account we do not. Both are "this account is new", which is the
 * single most common shape of the fraud this product exists to stop, and both are
 * `precaucion` whatever the severity table says, because the level is a statement
 * about what we can prove about the beneficiary and not about how loud the finding
 * is.
 */
export const NEW_ACCOUNT_SIGNALS: readonly string[] = [
  "new_supplier",
  "first_time_seen",
];

/** Which confidence rule fired. The panel shows it, and the ledger is audited by it. */
export type ConfidenceRule =
  | "sat_definitive"
  | "critical_finding"
  | "new_account_without_history"
  | "pending_verification"
  | "warning_finding"
  | "no_open_signal";

const LEVEL_BY_CONFIDENCE_RULE: Readonly<Record<ConfidenceRule, Confidence>> = {
  sat_definitive: "alerta",
  critical_finding: "alerta",
  new_account_without_history: "precaucion",
  pending_verification: "precaucion",
  warning_finding: "precaucion",
  no_open_signal: "confiable",
};

/** A level with the reason it is that level, which is the only way it is shown. */
export interface ConfidenceAssessment {
  level: Confidence;
  rule: ConfidenceRule;
  /** The findings that produced the level. Empty only on `no_open_signal`. */
  findingIds: string[];
}

/** Which state rule fired, in the vocabulary of ADR-0009. */
export type TransactionStateRule =
  | "executed"
  | "execution_cancelled"
  | "verification_blocked"
  | "sat_definitive"
  | "stopped_for_a_person"
  | "execution_failed"
  | "released"
  | "undecided";

const STATE_BY_RULE: Readonly<Record<TransactionStateRule, TransactionState>> =
  {
    executed: "enviado",
    execution_cancelled: "cancelado",
    verification_blocked: "cancelado",
    sat_definitive: "cancelado",
    stopped_for_a_person: "rojo",
    execution_failed: "rojo",
    released: "liberado",
    undecided: "pendiente",
  };

/** A state with the reason it is that state. */
export interface TransactionStateAssessment {
  state: TransactionState;
  rule: TransactionStateRule;
}

/**
 * True when this finding says the supplier is definitively listed by the SAT.
 *
 * Two shapes count and they are two statutes rather than two spellings. A 69-B row
 * whose effective situation is `definitivo` voids the fiscal effect of the
 * comprobantes retroactively. A 49 Bis row is one published resolution that is
 * already final, so it counts whatever else it carries, and `@hackmty/engine`
 * always writes it as `critical`.
 *
 * `listedNow === false` disqualifies a 69-B row: a taxpayer who was listed and then
 * cleared their name is not listed, the history stays on the finding so a clerk can
 * see both rows, and reading the old row as an alert forever would be the product
 * refusing to notice a taxpayer won.
 */
export function isDefinitiveSatListing(finding: Finding): boolean {
  if (finding.detector !== "sat_69b") {
    return false;
  }
  if (finding.evidence.article === SAT_49BIS_ARTICLE) {
    return true;
  }
  return (
    finding.evidence.status === "definitivo" &&
    finding.evidence.listedNow !== false
  );
}

/**
 * True when this finding says the account has no payment history behind it.
 *
 * Read off the signals `detectClabe` joined into the evidence, with the count of
 * known accounts as the fallback, so a finding written before the signals key
 * existed still answers. Neither is inferred from the severity: the severity table
 * can change without changing what "we have never paid this account" means.
 */
export function isAccountWithoutHistory(finding: Finding): boolean {
  if (finding.detector !== "clabe_forensics") {
    return false;
  }
  const signals = signalsOf(finding);
  if (NEW_ACCOUNT_SIGNALS.some((signal) => signals.includes(signal))) {
    return true;
  }
  return finding.evidence.knownAccounts === 0;
}

/**
 * The level of one payment: `alerta`, `precaucion` or `confiable`.
 *
 * The rules, in the order they are applied, and the order only picks which reason
 * is reported because every rule of one level answers that level:
 *
 * 1. a definitive SAT listing, under article 69-B or article 49 Bis, is `alerta`.
 *    It is first because it is the most specific thing this product can say: the
 *    comprobantes have no fiscal effect and no delay cost is worth paying against
 *    that.
 * 2. any `critical` finding is `alerta`.
 * 3. an account with no history behind it is `precaucion`.
 * 4. a verification still pending is `precaucion`: the engine asked for one, or a
 *    finding is `requiere_verificacion` and nobody has checked it yet.
 * 5. any `warning` finding is `precaucion`.
 * 6. otherwise `confiable`, which means the documents we hold agree and nothing is
 *    open. It is not the word "seguro" and it never will be: a SPEI cannot be
 *    recalled and no level is a guarantee about one.
 *
 * `info` findings alone are `confiable`. A supplier that was listed and cleared
 * their name is exactly that case, and it is the right answer: the row is on the
 * screen as history and it stops nothing.
 *
 * `decision` is optional because a line nobody has decided yet still has a level,
 * which is what the intake screen shows the second an instruction exists.
 */
export function confidenceOf(
  findings: readonly Finding[],
  decision?: DecisionLevelInput | null,
): Confidence {
  return assessConfidence(findings, decision).level;
}

/** `confidenceOf` with the rule and the findings behind it, which is what is shown. */
export function assessConfidence(
  findings: readonly Finding[],
  decision?: DecisionLevelInput | null,
): ConfidenceAssessment {
  const definitive = findings.filter(isDefinitiveSatListing);
  if (definitive.length > 0) {
    return assessment("sat_definitive", definitive);
  }

  const critical = findings.filter(
    (finding) => finding.severity === "critical",
  );
  if (critical.length > 0) {
    return assessment("critical_finding", critical);
  }

  const newAccount = findings.filter(isAccountWithoutHistory);
  if (newAccount.length > 0) {
    return assessment("new_account_without_history", newAccount);
  }

  const pending = findings.filter(
    (finding) => finding.state === "requiere_verificacion",
  );
  if (decision?.action === "verify" || pending.length > 0) {
    return assessment("pending_verification", pending);
  }

  const warning = findings.filter((finding) => finding.severity === "warning");
  if (warning.length > 0) {
    return assessment("warning_finding", warning);
  }

  return assessment("no_open_signal", []);
}

/**
 * Where one payment stands: `rojo`, `cancelado`, `enviado`, or the two internal
 * states the run has always had.
 *
 * The rules, in the order they are applied, first match wins:
 *
 * 1. the rail sent or settled this line: `enviado`. Money that left is the one fact
 *    nothing else overrides, and a list published afterwards does not un-send it.
 * 2. the execution cancelled the line: `cancelado`.
 * 3. the verification came back `blocked`: `cancelado`. The CEP contradicts the
 *    documents, so the payment does not leave on this evidence.
 * 4. a definitive SAT listing with no release a person signed: `cancelado`. This is
 *    not a hold somebody can wait out, because the invoices have no fiscal effect
 *    at all. A release signed by a named person with a written reason overrides it
 *    and falls through to rule 7, which is ADR-0002 refusing to overrule a human in
 *    either direction.
 * 5. the decision holds or asks to verify: `rojo`. Stopped, and in front of a
 *    person.
 * 6. the rail refused the line: `rojo`. It did not leave and somebody has to act.
 * 7. the decision released it: `liberado`. Nothing stops this payment and nothing
 *    has been sent, which is the distinction the three public states cannot make on
 *    their own.
 * 8. nothing decided it: `pendiente`.
 *
 * `execution` is one line and not the whole run, so a caller holding a single
 * payment never needs the run to answer. `executionLineOf` is the lookup.
 */
export function transactionStateOf(
  decision?: DecisionStateInput | null,
  verification?: VerificationStateInput | null,
  execution?: ExecutionStateInput | null,
): TransactionState {
  return assessTransactionState(decision, verification, execution).state;
}

/** `transactionStateOf` with the rule that produced it. */
export function assessTransactionState(
  decision?: DecisionStateInput | null,
  verification?: VerificationStateInput | null,
  execution?: ExecutionStateInput | null,
): TransactionStateAssessment {
  const rule = transactionStateRule(decision, verification, execution);
  return { state: STATE_BY_RULE[rule], rule };
}

/** The line of an execution that pays one instruction, or undefined. */
export function executionLineOf(
  execution: PaymentExecution | null | undefined,
  instructionId: string,
): PaymentExecutionLine | undefined {
  return execution?.lines.find((line) => line.instructionId === instructionId);
}

/**
 * True when a named person released this payment: `release` signed by somebody who
 * is not the engine. `SYSTEM_DECIDER` is the one decision the engine signs itself,
 * and it is not a signature.
 */
export function releasedByAPerson(
  decision?: DecisionStateInput | null,
): boolean {
  return (
    decision?.action === "release" &&
    decision.decidedBy !== undefined &&
    decision.decidedBy !== SYSTEM_DECIDER
  );
}

function transactionStateRule(
  decision: DecisionStateInput | null | undefined,
  verification: VerificationStateInput | null | undefined,
  execution: ExecutionStateInput | null | undefined,
): TransactionStateRule {
  if (execution?.state === "sent" || execution?.state === "settled") {
    return "executed";
  }
  if (execution?.state === "cancelled") {
    return "execution_cancelled";
  }
  if (verification?.state === "blocked") {
    return "verification_blocked";
  }
  const findings = decision?.findings ?? [];
  if (findings.some(isDefinitiveSatListing) && !releasedByAPerson(decision)) {
    return "sat_definitive";
  }
  if (decision?.action === "hold" || decision?.action === "verify") {
    return "stopped_for_a_person";
  }
  if (execution?.state === "failed") {
    return "execution_failed";
  }
  if (decision?.action === "release") {
    return "released";
  }
  return "undecided";
}

function assessment(
  rule: ConfidenceRule,
  findings: readonly Finding[],
): ConfidenceAssessment {
  return {
    level: LEVEL_BY_CONFIDENCE_RULE[rule],
    rule,
    findingIds: findings.map((finding) => finding.id),
  };
}

/**
 * The signals `detectClabe` wrote, split back out.
 *
 * They travel as one comma-joined string because `Finding.evidence` holds no
 * arrays, which is what keeps a finding renderable as chips and storable as jsonb
 * without a second table.
 */
function signalsOf(finding: Finding): string[] {
  const raw = finding.evidence.signals;
  if (typeof raw !== "string") {
    return [];
  }
  return raw
    .split(",")
    .map((signal) => signal.trim())
    .filter((signal) => signal !== "");
}
