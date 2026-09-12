/**
 * Bank reconciliation, the sixth control, read backwards.
 *
 * Controls 1 to 5 look at a payment before it leaves. This one looks at the
 * money that already left. It takes the outflows the bank posted (the Nessie
 * mirror of the company account) and asks, for each one, which document
 * authorised it. Three answers are findings:
 *
 * 1. `unbacked_outflow`, money left with no instruction and no CFDI behind it.
 * 2. `cfdi_paid_twice`, two outflows behind a single expected payment.
 * 3. `payment_not_in_mirror`, an instruction marked as sent that the bank
 *    never posted.
 *
 * All three fall out of one pass. Every outflow is assigned to at most one
 * expected payment and every expected payment accepts at most one outflow, so
 * an outflow with no candidate at all is case 1, an outflow whose only
 * candidates were already taken is case 2, and an instruction marked sent whose
 * expected payment nobody took is case 3. One assignment, three questions, no
 * thresholds to tune beyond the two the caller passes in.
 *
 * NESSIE CARRIES NO TIME OF DAY. Its dates are `YYYY-MM-DD` with no time
 * component at all, so whatever hour a `LedgerTx.occurredAt` shows for a
 * mirrored row was invented by the importer. Nothing in this file compares
 * instants. Every date on both sides is reduced to a calendar day and matched
 * inside a window of whole days, which is the resolution the source actually
 * has. Intraday ordering exists only in our own ledger and this detector
 * deliberately does not use it.
 *
 * The mirror also carries no beneficiary account, so nothing here can say where
 * the money landed. That question belongs to the Banxico CEP (control 5) and is
 * never answered from the bank feed.
 */

import type {
  Cfdi,
  Finding,
  LedgerEvent,
  PaymentComplement,
  PaymentInstruction,
  Rfc,
} from "./domain";
import { formatAmount, fromCents, toCents } from "./money";
import { isParsableInstant, prepareTimeline, toDayKey } from "./rolling";
import type { LedgerTx, TimedTx } from "./types";
import { MONTERREY_UTC_OFFSET_MINUTES } from "./types";

const MS_PER_DAY = 86_400_000;

/**
 * One peso. The mirror stores `amount` as an int in one row and a float in the
 * next, so a rounded cent must not turn a perfectly documented payment into a
 * "payment with no invoice". Pass 0 for exact matching.
 */
export const DEFAULT_RECONCILIATION_TOLERANCE = 1;

/**
 * Three whole days either side. The bank posts a SPEI the same day or the next
 * business day, a Friday instruction lands on Monday, and the importer had to
 * invent an hour for a date that carries none.
 */
export const DEFAULT_RECONCILIATION_WINDOW_DAYS = 3;

/** Which of the three questions a finding answers. Also in `evidence.case`. */
export type ReconciliationCase =
  | "unbacked_outflow"
  | "cfdi_paid_twice"
  | "payment_not_in_mirror";

export interface BankReconciliationOptions {
  /**
   * Instant stamped on every finding. This package owns no clock, so the caller
   * passes one and two runs over the same data produce identical findings.
   */
  now: string;
  /** Amount tolerance in MXN. Defaults to DEFAULT_RECONCILIATION_TOLERANCE. */
  tolerance?: number;
  /**
   * Half-width of the match window, in whole days. 0 means same day only.
   * Defaults to DEFAULT_RECONCILIATION_WINDOW_DAYS.
   */
  windowDays?: number;
  /** Timezone the calendar day is taken in. Defaults to Monterrey. */
  tzOffsetMinutes?: number;
}

/** Where an expected payment came from, best evidence first. */
type ExpectedPaymentKind = "complement" | "instruction" | "cfdi";

const KIND_RANK: Record<ExpectedPaymentKind, number> = {
  // The supplier's own receipt beats what we told the bank, which beats an
  // invoice date that nobody promised to pay on.
  complement: 0,
  instruction: 1,
  cfdi: 2,
};

/**
 * One payment the documents say should exist, deduplicated across the three
 * sources. An invoice, its instruction and its complement describe the same
 * movement of money, so they collapse into a single expectation. Without that
 * merge a second outflow would find a free document to hide behind and a
 * duplicate payment would never be reported.
 */
interface ExpectedPayment {
  /** Position in the array, the identity used by the assignment maps. */
  index: number;
  kind: ExpectedPaymentKind;
  /** Complement uuid, instruction id or CFDI uuid, whichever created it. */
  documentId: string;
  /** The invoice this settles, when it settles exactly one. */
  cfdiUuid?: string;
  /** Instructions considered paid once this expectation is matched. */
  instructionIds: string[];
  supplierRfc?: Rfc;
  cents: number;
  day: DayStamp;
}

interface DayStamp {
  /** Whole days since the epoch, in the requested offset. */
  index: number;
  /** The same day as "YYYY-MM-DD", for evidence a person reads. */
  key: string;
}

interface Outflow {
  row: TimedTx;
  day: DayStamp;
}

/**
 * Compares the bank mirror against the company's own documents.
 *
 * Pure and total: dirty rows are skipped rather than thrown on, because one
 * unparseable date from an upstream API must not blank out the payment run.
 * Credits are ignored, only money leaving the account is reconciled.
 *
 * @throws RangeError when `now` is not an instant, `tolerance` is negative, or
 *   `windowDays` is not a whole number of days.
 */
export function detectBankReconciliation(
  ledgerTxs: readonly LedgerTx[],
  instructions: readonly PaymentInstruction[],
  cfdis: readonly Cfdi[],
  complements: readonly PaymentComplement[],
  options: BankReconciliationOptions,
): Finding[] {
  const { now } = options;
  const tolerance = options.tolerance ?? DEFAULT_RECONCILIATION_TOLERANCE;
  const windowDays = options.windowDays ?? DEFAULT_RECONCILIATION_WINDOW_DAYS;
  const offset = options.tzOffsetMinutes ?? MONTERREY_UTC_OFFSET_MINUTES;

  if (!isParsableInstant(now)) {
    throw new RangeError(`now is not an instant: ${now}`);
  }
  if (!Number.isFinite(tolerance) || tolerance < 0) {
    throw new RangeError(
      `tolerance must be zero or more: ${String(tolerance)}`,
    );
  }
  if (!Number.isInteger(windowDays) || windowDays < 0) {
    throw new RangeError(
      `windowDays must be a whole number of days: ${String(windowDays)}`,
    );
  }

  const toleranceCents = toCents(tolerance);
  const expected = buildExpectedPayments(
    instructions,
    cfdis,
    complements,
    offset,
  );

  // prepareTimeline sorts oldest first and skips rows with a broken date or a
  // non-finite amount. Assignment follows that order on purpose: a clerk
  // reconciles a statement from the top, and so does this.
  const outflows: Outflow[] = [];
  for (const row of prepareTimeline(ledgerTxs, "debit")) {
    const day = dayStampOf(row.tx.occurredAt, offset);
    if (day !== undefined) {
      outflows.push({ row, day });
    }
  }

  const takenBy = new Map<number, Outflow>();
  const unbacked: Outflow[] = [];
  const contested = new Map<number, Outflow[]>();

  for (const outflow of outflows) {
    // Linear scan per outflow. A payment run is hundreds of rows and the whole
    // detector runs in well under a millisecond; when that stops being true,
    // bucket `expected` by cents and scan only the neighbouring buckets.
    let free: ExpectedPayment | undefined;
    let busy: ExpectedPayment | undefined;
    for (const candidate of expected) {
      if (!matches(outflow, candidate, toleranceCents, windowDays)) {
        continue;
      }
      if (takenBy.has(candidate.index)) {
        busy = preferred(busy, candidate, outflow);
      } else {
        free = preferred(free, candidate, outflow);
      }
    }
    if (free !== undefined) {
      takenBy.set(free.index, outflow);
    } else if (busy !== undefined) {
      contested.set(busy.index, [
        ...(contested.get(busy.index) ?? []),
        outflow,
      ]);
    } else {
      unbacked.push(outflow);
    }
  }

  const findings: Finding[] = [
    ...unbackedFindings(unbacked, expected.length, tolerance, windowDays, now),
    ...duplicateFindings(contested, takenBy, expected, now),
    ...missingOutflowFindings(
      instructions,
      expected,
      takenBy,
      outflows,
      tolerance,
      windowDays,
      offset,
      now,
    ),
  ];

  // The alert rail is sorted by money at risk, so the engine hands it over
  // already sorted. Ties fall back to the id, which is derived from the data
  // and never from the input order.
  findings.sort((left, right) => {
    const byAmount = toCents(right.amountAtRisk) - toCents(left.amountAtRisk);
    if (byAmount !== 0) {
      return byAmount;
    }
    return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
  });
  return findings;
}

/**
 * Projects `payment_sent` ledger events onto the instructions they settle.
 *
 * The detector reads one flat list of instructions, so this is the only place
 * that knows the event shape. Returns new objects, the input is untouched, and
 * the earliest event wins when a payment was retried.
 */
export function applyPaymentSentEvents(
  instructions: readonly PaymentInstruction[],
  events: readonly LedgerEvent[],
): PaymentInstruction[] {
  const sentAt = new Map<string, string>();
  for (const event of events) {
    if (event.type !== "payment_sent" || !isParsableInstant(event.at)) {
      continue;
    }
    const known = sentAt.get(event.instructionId);
    if (known === undefined || Date.parse(event.at) < Date.parse(known)) {
      sentAt.set(event.instructionId, event.at);
    }
  }
  return instructions.map((instruction) => {
    const at = sentAt.get(instruction.id);
    return at === undefined ? instruction : { ...instruction, sentAt: at };
  });
}

/**
 * Collapses invoices, instructions and complements into one expectation per
 * real payment obligation.
 *
 * A complement is the supplier saying it received the money, so it wins, and it
 * also splits a PPD invoice into its instalments. Otherwise the instruction is
 * closer to the payment than the invoice date, so it wins over the CFDI. An
 * invoice nobody instructed and nobody acknowledged still expects a payment.
 */
function buildExpectedPayments(
  instructions: readonly PaymentInstruction[],
  cfdis: readonly Cfdi[],
  complements: readonly PaymentComplement[],
  offset: number,
): ExpectedPayment[] {
  const instructionsByCfdi = new Map<string, PaymentInstruction[]>();
  for (const instruction of instructions) {
    for (const uuid of instruction.cfdiUuids) {
      instructionsByCfdi.set(uuid, [
        ...(instructionsByCfdi.get(uuid) ?? []),
        instruction,
      ]);
    }
  }

  const expected: ExpectedPayment[] = [];
  const settledByComplement = new Set<string>();

  for (const complement of complements) {
    const day = dayStampOf(complement.paidAt, offset);
    if (day === undefined || !Number.isFinite(complement.paidAmount)) {
      continue;
    }
    settledByComplement.add(complement.relatedCfdiUuid);
    expected.push({
      index: expected.length,
      kind: "complement",
      documentId: complement.uuid,
      cfdiUuid: complement.relatedCfdiUuid,
      instructionIds: (
        instructionsByCfdi.get(complement.relatedCfdiUuid) ?? []
      ).map((instruction) => instruction.id),
      cents: toCents(complement.paidAmount),
      day,
    });
  }

  for (const instruction of instructions) {
    const uncovered = instruction.cfdiUuids.filter(
      (uuid) => !settledByComplement.has(uuid),
    );
    // Every invoice on this instruction already has its complement, so the
    // money it expects is the money those complements expect. Adding it again
    // would leave a free slot for a duplicate outflow to hide in.
    if (instruction.cfdiUuids.length > 0 && uncovered.length === 0) {
      continue;
    }
    const day = dayStampOf(
      instruction.sentAt ?? instruction.receivedAt,
      offset,
    );
    if (day === undefined || !Number.isFinite(instruction.amount)) {
      continue;
    }
    expected.push({
      index: expected.length,
      kind: "instruction",
      documentId: instruction.id,
      cfdiUuid: uncovered.length === 1 ? uncovered[0] : undefined,
      instructionIds: [instruction.id],
      supplierRfc: instruction.supplierRfc,
      cents: toCents(instruction.amount),
      day,
    });
  }

  for (const cfdi of cfdis) {
    if (
      settledByComplement.has(cfdi.uuid) ||
      instructionsByCfdi.has(cfdi.uuid)
    ) {
      continue;
    }
    const day = dayStampOf(cfdi.issuedAt, offset);
    if (day === undefined || !Number.isFinite(cfdi.total)) {
      continue;
    }
    expected.push({
      index: expected.length,
      kind: "cfdi",
      documentId: cfdi.uuid,
      cfdiUuid: cfdi.uuid,
      instructionIds: [],
      supplierRfc: cfdi.issuerRfc,
      cents: toCents(cfdi.total),
      day,
    });
  }

  return expected;
}

/** Amount inside the tolerance and calendar day inside the window. */
function matches(
  outflow: Outflow,
  candidate: ExpectedPayment,
  toleranceCents: number,
  windowDays: number,
): boolean {
  return (
    Math.abs(outflow.row.cents - candidate.cents) <= toleranceCents &&
    Math.abs(outflow.day.index - candidate.day.index) <= windowDays
  );
}

/** Best evidence, then closest day, then closest amount, then the id. */
function preferred(
  current: ExpectedPayment | undefined,
  candidate: ExpectedPayment,
  outflow: Outflow,
): ExpectedPayment {
  if (current === undefined) {
    return candidate;
  }
  const byKind = KIND_RANK[candidate.kind] - KIND_RANK[current.kind];
  if (byKind !== 0) {
    return byKind < 0 ? candidate : current;
  }
  const byDay =
    Math.abs(candidate.day.index - outflow.day.index) -
    Math.abs(current.day.index - outflow.day.index);
  if (byDay !== 0) {
    return byDay < 0 ? candidate : current;
  }
  const byAmount =
    Math.abs(candidate.cents - outflow.row.cents) -
    Math.abs(current.cents - outflow.row.cents);
  if (byAmount !== 0) {
    return byAmount < 0 ? candidate : current;
  }
  return candidate.documentId < current.documentId ? candidate : current;
}

function unbackedFindings(
  unbacked: readonly Outflow[],
  documentsConsidered: number,
  tolerance: number,
  windowDays: number,
  now: string,
): Finding[] {
  return unbacked.map(({ row, day }) => {
    const amount = fromCents(row.cents);
    return {
      id: `recon:unbacked_outflow:${row.tx.id}`,
      detector: "bank_reconciliation",
      // The document may simply not be loaded yet, so this asks for a check and
      // never states that the payment was improper.
      severity: "warning",
      state: "requiere_verificacion",
      subject: { kind: "ledger_tx", id: row.tx.id },
      amountAtRisk: amount,
      explanation: `Salida de ${formatAmount(amount)} MXN el ${day.key} sin instrucción ni CFDI que la respalde. El gasto no es deducible mientras no aparezca el comprobante.`,
      evidence: {
        case: "unbacked_outflow",
        ledgerTxId: row.tx.id,
        accountId: row.tx.accountId,
        day: day.key,
        amount,
        source: row.tx.source,
        documentsConsidered,
        toleranceMxn: tolerance,
        windowDays,
      },
      createdAt: now,
    };
  });
}

function duplicateFindings(
  contested: ReadonlyMap<number, Outflow[]>,
  takenBy: ReadonlyMap<number, Outflow>,
  expected: readonly ExpectedPayment[],
  now: string,
): Finding[] {
  const findings: Finding[] = [];
  for (const [index, extras] of contested) {
    // Both lookups are safe: an index only reaches `contested` after the
    // expectation it collides with was taken by an earlier outflow.
    const target = expected[index];
    const first = takenBy.get(index);
    if (first === undefined) {
      continue;
    }
    const duplicateAmount = fromCents(
      extras.reduce((total, extra) => total + extra.row.cents, 0),
    );
    const subjectId = target.cfdiUuid ?? target.documentId;
    const label =
      target.cfdiUuid === undefined
        ? `La instrucción ${target.documentId}`
        : `El CFDI ${target.cfdiUuid}`;
    const extraCount =
      extras.length === 1 ? "una salida más" : `${extras.length} salidas más`;
    findings.push({
      id: `recon:cfdi_paid_twice:${subjectId}`,
      detector: "bank_reconciliation",
      // Two rows of our own bank statement against one expected payment. That
      // is arithmetic over documents we hold, and it accuses nobody.
      severity: "critical",
      state: "comprobable",
      subject: {
        kind: target.cfdiUuid === undefined ? "instruction" : "cfdi",
        id: subjectId,
      },
      amountAtRisk: duplicateAmount,
      explanation: `${label} ya estaba cubierto por la salida del ${first.day.key} por ${formatAmount(fromCents(first.row.cents))} MXN. Hay ${extraCount} por ${formatAmount(duplicateAmount)} MXN sin otro documento detrás.`,
      evidence: {
        case: "cfdi_paid_twice",
        documentKind: target.kind,
        documentId: target.documentId,
        cfdiUuid: target.cfdiUuid ?? "",
        supplierRfc: target.supplierRfc ?? "",
        expectedAmount: fromCents(target.cents),
        expectedDay: target.day.key,
        matchedOutflowId: first.row.tx.id,
        matchedOutflowDay: first.day.key,
        duplicateOutflowIds: extras.map((extra) => extra.row.tx.id).join(", "),
        duplicateOutflowDays: extras.map((extra) => extra.day.key).join(", "),
        duplicateAmount,
        outflows: extras.length + 1,
      },
      createdAt: now,
    });
  }
  return findings;
}

function missingOutflowFindings(
  instructions: readonly PaymentInstruction[],
  expected: readonly ExpectedPayment[],
  takenBy: ReadonlyMap<number, Outflow>,
  outflows: readonly Outflow[],
  tolerance: number,
  windowDays: number,
  offset: number,
  now: string,
): Finding[] {
  const settled = new Set<string>();
  for (const index of takenBy.keys()) {
    for (const id of expected[index].instructionIds) {
      settled.add(id);
    }
  }

  const findings: Finding[] = [];
  for (const instruction of instructions) {
    const sentAt = instruction.sentAt;
    if (sentAt === undefined || settled.has(instruction.id)) {
      continue;
    }
    const day = dayStampOf(sentAt, offset);
    if (day === undefined || !Number.isFinite(instruction.amount)) {
      continue;
    }
    // How many outflows of any amount the mirror does hold around that day.
    // Zero reads as "the mirror has not caught up yet", more than zero reads as
    // "the bank moved money that day and none of it was this".
    const nearby = outflows.filter(
      (outflow) => Math.abs(outflow.day.index - day.index) <= windowDays,
    ).length;
    findings.push({
      id: `recon:payment_not_in_mirror:${instruction.id}`,
      detector: "bank_reconciliation",
      severity: "warning",
      state: "requiere_verificacion",
      subject: { kind: "instruction", id: instruction.id },
      amountAtRisk: instruction.amount,
      explanation: `La instrucción ${instruction.id} quedó marcada como enviada el ${day.key} y el espejo del banco no tiene la salida de ${formatAmount(instruction.amount)} MXN. Verificar antes de reenviar el pago.`,
      evidence: {
        case: "payment_not_in_mirror",
        instructionId: instruction.id,
        supplierRfc: instruction.supplierRfc,
        amount: instruction.amount,
        sentAt,
        sentDay: day.key,
        outflowsNearby: nearby,
        toleranceMxn: tolerance,
        windowDays,
      },
      createdAt: now,
    });
  }
  return findings;
}

/**
 * The calendar day a date falls on, as an index and a key.
 *
 * A bare "YYYY-MM-DD" is taken literally, which is what Nessie hands over and
 * what a CFDI date often is. Anything carrying a time is shifted into the
 * company's timezone first, because a payment made at 22:00 in Monterrey
 * belongs to that day and not to tomorrow in UTC. An unreadable date returns
 * undefined so the caller skips the row instead of throwing.
 */
function dayStampOf(
  value: string,
  tzOffsetMinutes: number,
): DayStamp | undefined {
  if (!isParsableInstant(value)) {
    return undefined;
  }
  const key = toDayKey(value, tzOffsetMinutes);
  const at = Date.parse(`${key}T00:00:00.000Z`);
  if (!Number.isFinite(at)) {
    return undefined;
  }
  return { index: Math.round(at / MS_PER_DAY), key };
}
