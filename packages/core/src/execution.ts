/**
 * What a payment run is allowed to send, and what one execution adds up to.
 *
 * ADR-0008 moved the SPEI out of the company's banking portal and through
 * `@hackmty/rail`, which is what makes the instruction the payment order instead
 * of a copy of one. The rule that follows is the whole safety of that decision and
 * it belongs here, pure and tested, rather than inside a route handler: **a line
 * leaves only when nothing stops it**.
 *
 * Three properties this module exists to hold.
 *
 * **There is one rule table and it is the one in `./levels.ts`.** `planRunExecution`
 * does not ask a second question about a line. It asks `assessTransactionState` what
 * the line reads as, and the answer decides: `liberado` goes out, `cancelado` is
 * dropped before anything is sent, `rojo` and `pendiente` are left alone in front of
 * a person, `enviado` is already gone. ADR-0009 is why that is one function and not
 * four, and a second selection rule written here would be issue #125 again with a
 * payment instead of a legal name.
 *
 * **A line the caller names can only be narrowed out, never forced through.**
 * `only` is a filter over what the decisions already allow. A named line nothing
 * may send comes back in `refused`, which the API answers as a `409` that says
 * which one, because silently dropping it would let a clerk believe they paid
 * somebody they did not.
 *
 * **Sending twice is not a thing this product does.** A line already carried by the
 * rail reads `enviado` through the same table, so a second execution of the same run
 * plans nothing for it. Idempotence per instruction is the property, not idempotence
 * per request: a line released after the first execution is new work and goes out on
 * the second call.
 *
 * Pure and dependency free, like the rest of the package. No clock, no rail, no
 * repository: the caller hands in what it already read.
 */

import type {
  Action,
  Actor,
  Decision,
  Finding,
  PaymentExecutionLine,
  PaymentExecutionTotals,
  PaymentInstruction,
  PaymentReceipt,
  RailId,
  SealState,
  Supplier,
  TransactionState,
  VerificationStateName,
} from "./domain";
import { assessTransactionState, type TransactionStateRule } from "./levels";
import { sumAmounts } from "./money";

/**
 * One line of the run as the plan reads it, and no more of it than that.
 *
 * Structural like `RunLine` in `./exposure.ts` and for the same reason: the
 * payload the API assembles is not a type that belongs in a package with no
 * dependencies, and naming only the four things the rule reads is the documentation
 * of what the rule reads.
 */
export interface ExecutableLine {
  /**
   * `sentAt` matters as much as the amount. It is the projection of a
   * `payment_sent` event, so a line the ledger already says was paid reads as
   * `enviado` here even when this run is not the thing that paid it: the company's
   * own banking portal is where every SPEI left before ADR-0008, and sending one of
   * those a second time would be the worst bug this endpoint could have.
   */
  instruction: Pick<PaymentInstruction, "id" | "amount" | "sentAt">;
  /** Null or absent while nothing has decided this line. */
  decision?:
    | (Pick<Decision, "action" | "decidedBy"> & {
        findings?: readonly Finding[];
      })
    | null;
  /** The findings behind the decision, for the SAT rule of the state table. */
  findings?: readonly Finding[];
  /** Where the beneficiary verification stands, when one ran. */
  verification?: { state: VerificationStateName } | null;
  /** What the rail already did with this line, from the folded execution. */
  execution?: Pick<PaymentExecutionLine, "state"> | null;
}

/**
 * One line of a plan: what it is, what it reads as, and why.
 *
 * `rule` is the row of the ADR-0009 state table that fired, so the answer is
 * auditable against the table rather than against this file, and `reason` is the
 * sentence in Spanish a clerk reads next to the line. A line in `send` carries no
 * reason: there is nothing to explain about a payment that is going out as decided.
 */
export interface PlannedLine {
  instructionId: string;
  amount: number;
  state: TransactionState;
  rule: TransactionStateRule;
  reason?: string;
}

export interface RunExecutionPlan {
  /** Lines that go out on the rail, in the order the run holds them. */
  send: PlannedLine[];
  /**
   * Lines the run drops before sending, one `payment_cancelled` each.
   *
   * This is the line whose decision says release and whose evidence says no: a
   * definitive SAT listing nobody signed a release over, or a beneficiary
   * verification that came back blocked. Dropping it is a statement and it is
   * recorded as one.
   */
  cancel: PlannedLine[];
  /**
   * Lines the run leaves exactly as they are: stopped in front of a person,
   * undecided, already sent, or not named by the caller.
   *
   * Nothing is appended for these. A held line was never released, so it was never
   * going to be sent, and a `payment_cancelled` against it would claim the run made
   * a decision about it that nobody made.
   */
  skip: PlannedLine[];
  /** Lines the caller named that nothing may send. Non-empty is the `409`. */
  refused: PlannedLine[];
}

export interface PlanRunExecutionInput {
  lines: readonly ExecutableLine[];
  /**
   * Narrows the set. Every id has to be a line of this run: an id the run does not
   * hold is reported in `unknown` rather than ignored, because a clerk who typed
   * the wrong id has to be told.
   */
  only?: readonly string[];
}

/** `planRunExecution` plus the ids the run does not hold. */
export interface RunExecutionPlanResult extends RunExecutionPlan {
  unknown: string[];
}

/** Why a line was not sent, in the words the clerk reads. */
const REASON_BY_RULE: Readonly<Record<TransactionStateRule, string>> = {
  executed:
    "Esta linea ya salio en esta corrida, asi que no se envia otra vez.",
  execution_cancelled:
    "La corrida ya habia cancelado esta linea, asi que no se vuelve a intentar.",
  verification_blocked:
    "El CEP dice que la cuenta esta a nombre de alguien distinto del proveedor de la factura, asi que la linea no sale con esta evidencia.",
  sat_definitive:
    "El proveedor esta en la lista definitiva del SAT y nadie firmo una liberacion, asi que los comprobantes no tienen efecto fiscal y la linea no sale.",
  stopped_for_a_person:
    "La linea esta detenida esperando a una persona, asi que la corrida no la envia.",
  execution_failed:
    "El riel rechazo esta linea antes, asi que queda en manos de una persona.",
  released: "",
  undecided: "Nadie ha resuelto esta linea todavia, asi que no se envia.",
};

/** What a line the caller did not name is told. */
const NOT_SELECTED =
  "La peticion no incluyo esta linea, asi que la corrida la dejo como estaba.";

/**
 * Which lines of a run go out, which are dropped, and which are left alone.
 *
 * The order of the answer is the order of the run, so the stream a clerk watches
 * and the table they are reading move together.
 */
export function planRunExecution(
  input: PlanRunExecutionInput,
): RunExecutionPlanResult {
  const plan: RunExecutionPlanResult = {
    send: [],
    cancel: [],
    skip: [],
    refused: [],
    unknown: [],
  };
  const only =
    input.only === undefined ? undefined : new Set<string>(input.only);
  const held = new Set(input.lines.map((line) => line.instruction.id));

  for (const id of only ?? []) {
    if (!held.has(id)) {
      plan.unknown.push(id);
    }
  }

  for (const line of input.lines) {
    const assessed = assessTransactionState(
      decisionInputOf(line),
      line.verification ?? undefined,
      executionStateOf(line),
    );
    const planned: PlannedLine = {
      instructionId: line.instruction.id,
      amount: line.instruction.amount,
      state: assessed.state,
      rule: assessed.rule,
    };

    if (only !== undefined && !only.has(line.instruction.id)) {
      plan.skip.push({ ...planned, reason: NOT_SELECTED });
      continue;
    }

    if (assessed.state === "liberado") {
      plan.send.push(planned);
      continue;
    }

    const withReason: PlannedLine = {
      ...planned,
      reason: REASON_BY_RULE[assessed.rule],
    };

    /* A named line nothing may send is the `409`, and it is reported before it is
       classified: the caller asked for it by name and is owed the sentence rather
       than a run that quietly left it out. It is still classified below, so the
       refusal and the plan cannot disagree about what the line is. */
    if (only !== undefined) {
      plan.refused.push(withReason);
      continue;
    }

    /* `cancelado` is cancelled by the run, except when the run is what already
       cancelled it. A second press of the button must not append a second
       `payment_cancelled` for a line it dropped the first time: the event is a
       statement about a moment and two of them would read as two runs dropping one
       payment. `execution_cancelled` is the one rule of this state that means "we did
       this already", so it falls through to the skip below. */
    if (
      assessed.state === "cancelado" &&
      assessed.rule !== "execution_cancelled"
    ) {
      plan.cancel.push(withReason);
      continue;
    }

    plan.skip.push(withReason);
  }

  return plan;
}

/**
 * What the rail did with this line, or what the ledger already says about it.
 *
 * The folded execution wins when there is one, because it carries the state the rail
 * actually reached. With none, a `sentAt` on the instruction is read as `sent`: the
 * event behind that projection is a `payment_sent`, whoever appended it, and the one
 * thing this endpoint may never do is send a payment twice.
 */
function executionStateOf(line: ExecutableLine) {
  if (line.execution !== undefined && line.execution !== null) {
    return line.execution;
  }
  return line.instruction.sentAt === undefined
    ? undefined
    : { state: "sent" as const };
}

function decisionInputOf(line: ExecutableLine) {
  const { decision } = line;
  if (decision === undefined || decision === null) {
    return undefined;
  }
  const findings = decision.findings ?? line.findings ?? [];
  return {
    action: decision.action as Action,
    ...(decision.decidedBy === undefined
      ? {}
      : { decidedBy: decision.decidedBy }),
    findings,
  };
}

const ZERO_TOTALS: PaymentExecutionTotals = {
  lines: 0,
  queued: 0,
  sent: 0,
  settled: 0,
  failed: 0,
  cancelled: 0,
  amount: 0,
  queuedAmount: 0,
  sentAmount: 0,
  settledAmount: 0,
  failedAmount: 0,
  cancelledAmount: 0,
};

/**
 * The counts and the pesos of one execution.
 *
 * Both, never one of them: a screen that reports only rows is a screen the clerk
 * has to add up herself, and the product's value is the pesos. The five buckets are
 * disjoint because a line has exactly one state, and they add up to `amount`
 * exactly, which is an identity a judge can check against the rows underneath.
 * Every addition goes through the cent arithmetic in `./money`, because eighty-six
 * lines summed as floats are off by centavos.
 */
export function executionTotals(
  lines: readonly PaymentExecutionLine[],
): PaymentExecutionTotals {
  if (lines.length === 0) {
    return { ...ZERO_TOTALS };
  }

  const amounts: Record<PaymentExecutionLine["state"], number[]> = {
    queued: [],
    sent: [],
    settled: [],
    failed: [],
    cancelled: [],
  };
  for (const line of lines) {
    amounts[line.state].push(line.amount);
  }

  return {
    lines: lines.length,
    queued: amounts.queued.length,
    sent: amounts.sent.length,
    settled: amounts.settled.length,
    failed: amounts.failed.length,
    cancelled: amounts.cancelled.length,
    amount: sumAmounts(lines.map((line) => line.amount)),
    queuedAmount: sumAmounts(amounts.queued),
    sentAmount: sumAmounts(amounts.sent),
    settledAmount: sumAmounts(amounts.settled),
    failedAmount: sumAmounts(amounts.failed),
    cancelledAmount: sumAmounts(amounts.cancelled),
  };
}

/**
 * The id of the receipt of one payment, minted from its clave de rastreo.
 *
 * Derived and never stored, for the reason `holdWindow` gives about the deadline it
 * never stores: the clave is the string the transfer is filed under at Banxico, so a
 * receipt id built from it points at exactly one transfer, is the same on a reprint
 * a year later, and cannot drift away from the line it belongs to. A random id would
 * need a column, and a column can disagree with the ledger.
 */
export function receiptIdFor(claveRastreo: string): string {
  return `rcp-${claveRastreo}`;
}

/** The clave a receipt id was minted from, or undefined when it was not one. */
export function claveOfReceiptId(receiptId: string): string | undefined {
  return receiptId.startsWith("rcp-")
    ? receiptId.slice("rcp-".length)
    : undefined;
}

export interface ReceiptInput {
  runId: string;
  line: PaymentExecutionLine;
  instruction: PaymentInstruction;
  /** The supplier on the CFDI. Absent when this store does not hold it. */
  supplier?: Supplier | undefined;
  /** Which bank holds the account that was paid, as the CLABE resolves it. */
  beneficiaryBank: string;
  executedBy: Actor;
  /** What can be proven about the Banxico seal of the CEP for this clave. */
  sealState: SealState;
  /** When the CEP for this clave was read. Absent while none has been. */
  cepAt?: string | undefined;
  /**
   * When the rail acknowledged the transfer, from the `payment_settled` event.
   * Absent while the line is only `sent`, because "we asked" and "the rail says it
   * happened" are two different claims and the receipt reports both separately.
   */
  settledAt?: string | undefined;
  rail: RailId;
  synthetic: boolean;
}

/**
 * The receipt of one payment: what left, to whom, under which clave de rastreo.
 *
 * Two honesty rules are in the shape rather than in a comment. `sealState` is a
 * `SealState` and never a boolean, so a receipt printed for a rail that produces no
 * CEP reads "firma no verificada" and can never read as valid. And the account is
 * four digits, because a document that leaves the building does not need the other
 * fourteen, which is the rule the `cent_sent` event and the verification call
 * already follow.
 *
 * @throws RangeError when the line carries no clave de rastreo. A receipt for a
 *   transfer nobody can look up would be a document with nothing behind it.
 */
export function receiptFor(input: ReceiptInput): PaymentReceipt {
  const { line, instruction } = input;
  if (line.claveRastreo === undefined || line.claveRastreo === "") {
    throw new RangeError(
      `line ${line.instructionId} carries no clave de rastreo, so there is no transfer to write a receipt about`,
    );
  }

  return {
    id: receiptIdFor(line.claveRastreo),
    runId: input.runId,
    instructionId: line.instructionId,
    claveRastreo: line.claveRastreo,
    rail: input.rail,
    amount: instruction.amount,
    sentAt: line.sentAt ?? instruction.receivedAt,
    ...(input.settledAt === undefined ? {} : { settledAt: input.settledAt }),
    supplierRfc: instruction.supplierRfc,
    beneficiaryName: input.supplier?.legalName ?? instruction.supplierRfc,
    beneficiaryAccountLast4: instruction.clabe.slice(-4),
    beneficiaryBank: input.beneficiaryBank,
    cfdiUuids: [...instruction.cfdiUuids],
    sealState: input.sealState,
    ...(input.cepAt === undefined ? {} : { cepAt: input.cepAt }),
    executedBy: input.executedBy,
    synthetic: input.synthetic,
  };
}
