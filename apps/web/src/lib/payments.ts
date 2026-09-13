/**
 * How the payment run is read on its way out, as pure functions over the
 * contract types.
 *
 * The screen above this file answers one question: which lines of this week's run
 * are about to leave, and what happened to each one. Everything that decides that
 * lives here rather than in the component, for the reason `run-view.ts` gives for
 * the same split, and with one rule added on top of it.
 *
 * **Nothing here decides anything.** Two values describe a line and both are
 * derived by `@hackmty/core`: `confidenceOf` answers the level and
 * `transactionStateOf` answers the state, and ADR-0009 makes that the only place
 * either is computed. This module calls them, it does not reimplement them, and
 * the one thing it adds is words: a `cancelado` line is shown with the sentence
 * that says why, because a state with no reason under it is not something a clerk
 * can act on.
 *
 * **Two questions, two fields, because the contract answers them separately.**
 * Whether the run TAKES a line is the decision: `POST /api/v1/run/:id/execute` hands
 * the rail every released line and nothing else, which is why a held line is not in
 * the execution at all and why a request that names one is a `409`. Whether a line
 * the run took will actually be PAID is the state table: a released line whose
 * beneficiary came back blocked, or whose supplier is definitively listed with no
 * signature over it, reads `cancelado` and comes back off the rail as a `cancelled`
 * line carrying a reason. `inRun` is the first question and `payable` is the second.
 * Collapsing them is how a screen either hides a payment that was refused or offers
 * one the API was never going to send.
 *
 * **The totals are recomputed, never trusted.** Every peso here goes through
 * `sumAmounts`, the same integer-cent arithmetic the API and the constancia use,
 * because a total that does not decompose into the rows under it is a total nobody
 * can check.
 */

import {
  type Confidence,
  confidenceOf,
  isDefinitiveSatListing,
  type PaymentExecution,
  type PaymentExecutionLine,
  type PaymentExecutionTotals,
  type PaymentLineState,
  releasedByAPerson,
  sumAmounts,
  type TransactionState,
  transactionStateOf,
  type VerificationState,
} from "@hackmty/core";
import type { PaymentRun, PaymentRunItem } from "./contract";

/* ----------------------------------------------------------- the execution */

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
 * The execution of a run nothing has been sent for.
 *
 * `GET /api/v1/run/:id/execution` answers exactly this for a run nobody has
 * executed, rather than a 404, because "nothing has been sent" is an answer. The
 * screen opens on it, so it is a value here and not an absence the component has
 * to special-case at every use.
 */
export function emptyExecution(runId: string, at: string): PaymentExecution {
  return { runId, lines: [], totals: { ...ZERO_TOTALS }, updatedAt: at };
}

/** True when this execution has not been started. */
export function isUnstarted(execution: PaymentExecution): boolean {
  return execution.lines.length === 0;
}

/**
 * Counts and pesos of a set of lines, one bucket per line state.
 *
 * Recomputed rather than carried, because the screen builds an execution up one
 * streamed line at a time and the totals have to be true at every frame of that,
 * not only at the end. The five peso buckets are disjoint and add up to `amount`
 * exactly, which is the identity `PaymentExecutionTotals` documents.
 */
export function executionTotalsOf(
  lines: readonly PaymentExecutionLine[],
): PaymentExecutionTotals {
  const amountsOf = (state: PaymentLineState) =>
    lines.filter((line) => line.state === state).map((line) => line.amount);
  const countOf = (state: PaymentLineState) =>
    lines.filter((line) => line.state === state).length;

  return {
    lines: lines.length,
    queued: countOf("queued"),
    sent: countOf("sent"),
    settled: countOf("settled"),
    failed: countOf("failed"),
    cancelled: countOf("cancelled"),
    amount: sumAmounts(lines.map((line) => line.amount)),
    queuedAmount: sumAmounts(amountsOf("queued")),
    sentAmount: sumAmounts(amountsOf("sent")),
    settledAmount: sumAmounts(amountsOf("settled")),
    failedAmount: sumAmounts(amountsOf("failed")),
    cancelledAmount: sumAmounts(amountsOf("cancelled")),
  };
}

/**
 * One streamed line, folded into the execution the screen is holding.
 *
 * Replaces the line of the same instruction rather than appending it, which is
 * what makes the stream safe to read twice: the execute stream pushes a line and
 * the ledger channel pushes the same payment as an event, so a screen that
 * appended would show a run of 172 lines for 86 payments. Keyed on the
 * instruction, because that is what both carry and what the API is idempotent on.
 *
 * Returns a new object. The execution belongs to React state and mutating it in
 * place is how a render gets skipped.
 */
export function applyExecutionLine(
  execution: PaymentExecution,
  line: PaymentExecutionLine,
  at: string,
): PaymentExecution {
  const known = execution.lines.some(
    (current) => current.instructionId === line.instructionId,
  );
  const lines = known
    ? execution.lines.map((current) =>
        current.instructionId === line.instructionId ? line : current,
      )
    : [...execution.lines, line];

  return {
    ...execution,
    lines,
    totals: executionTotalsOf(lines),
    updatedAt: at,
  };
}

/* ----------------------------------------------------------------- the rows */

/**
 * Why no money is moving for a line, in the vocabulary of ADR-0009's state table.
 *
 * It is the rule that fired and not a free-text category, so the sentence the
 * screen prints and the reason the ledger holds cannot drift apart.
 */
export type ExclusionRule =
  | "execution_cancelled"
  | "execution_failed"
  | "verification_blocked"
  | "sat_definitive"
  | "stopped_for_a_person"
  | "undecided";

export interface Exclusion {
  rule: ExclusionRule;
  /** One sentence of Spanish a clerk can act on. Never empty. */
  sentence: string;
}

/** One line of the run, as the payments screen reads it. */
export interface PaymentRow {
  item: PaymentRunItem;
  /** The level, with the findings behind it on the row. Never a number. */
  confidence: Confidence;
  /**
   * Where the line stood before the rail touched it, which is what decides whether
   * any money is going to move for it.
   */
  baseline: TransactionState;
  /** Where it stands now: the baseline until an execution line says otherwise. */
  state: TransactionState;
  /** What the rail did with it. Absent until the run was executed. */
  line?: PaymentExecutionLine;
  /** Whether the run hands this line to the rail: the decision released it. */
  inRun: boolean;
  /**
   * Whether the rail will actually pay it. A released line a control stops is
   * `inRun` and not `payable`, and it comes back `cancelled` with a reason.
   */
  payable: boolean;
  /** Why no money is moving for it. Null on a line that is paid or about to be. */
  exclusion: Exclusion | null;
}

/** Where the verification of one line stands, for a caller that holds them. */
export type VerificationLookup = (
  instructionId: string,
) => VerificationState | null | undefined;

/**
 * Every line of the run, with its level, its state and what the rail did.
 *
 * `verificationOf` is optional and the asymmetry is deliberate. The API already
 * computes `state` per item with the verification in hand, so on that path this
 * function has nothing to add and uses the answer it was given. Offline there is
 * no API to ask and the verifications are a local table, so the lookup is passed
 * in and the same `transactionStateOf` runs in the browser. What neither path does
 * is fetch 92 verifications to draw one screen.
 */
export function paymentRows(
  run: PaymentRun,
  execution: PaymentExecution,
  verificationOf?: VerificationLookup,
): PaymentRow[] {
  const lineOf = new Map(
    execution.lines.map((line) => [line.instructionId, line]),
  );

  return run.items.map((item) => {
    const verification = verificationOf?.(item.instruction.id) ?? null;
    const baseline =
      item.state ??
      transactionStateOf(
        { ...item.decision, findings: item.findings },
        verification,
        null,
      );
    const line = lineOf.get(item.instruction.id);
    const state = line
      ? transactionStateOf(
          { ...item.decision, findings: item.findings },
          verification,
          line,
        )
      : baseline;
    const row: PaymentRow = {
      item,
      confidence: item.confidence ?? confidenceOf(item.findings, item.decision),
      baseline,
      state,
      inRun: item.decision?.action === "release",
      payable: baseline === "liberado",
      exclusion: null,
    };

    return line
      ? { ...row, line, exclusion: exclusionOf(row, line) }
      : { ...row, exclusion: exclusionOf(row) };
  });
}

/**
 * The sentence that goes next to a state, or null when the line is in the run.
 *
 * A `failed` or `cancelled` line carries its own `reason` from the rail, and that
 * sentence wins over anything this file could compose: it is what the API wrote
 * and what the ledger holds, so a screen that paraphrased it would be showing a
 * second account of one event.
 *
 * For a line the rail never touched the rule is deduced from the state table and
 * the findings, and the deduction is exhaustive rather than a guess. ADR-0009
 * reaches `cancelado` with no execution behind it two ways and only two: a
 * verification that came back `blocked`, and a definitive SAT listing no person
 * signed a release over. The second is testable here with
 * `isDefinitiveSatListing` over the findings of the row, so the first is what is
 * left.
 */
export function exclusionOf(
  row: Omit<PaymentRow, "exclusion">,
  line?: PaymentExecutionLine,
): Exclusion | null {
  if (line) {
    if (line.state === "cancelled") {
      return {
        rule: "execution_cancelled",
        sentence:
          line.reason ?? "La corrida dejo fuera esta linea antes de enviarla.",
      };
    }

    if (line.state === "failed") {
      return {
        rule: "execution_failed",
        sentence: line.reason ?? "El riel rechazo esta linea.",
      };
    }

    return null;
  }

  if (row.payable) {
    return null;
  }

  const { decision, findings, instruction } = row.item;

  if (decision?.action === "hold") {
    return {
      rule: "stopped_for_a_person",
      sentence: `Retenida: ${reasonFromFindings(row)} No sale en esta corrida hasta que alguien la resuelva.`,
    };
  }

  if (decision?.action === "verify") {
    return {
      rule: "stopped_for_a_person",
      sentence: `Falta verificar la cuenta antes de pagar: ${reasonFromFindings(row)}`,
    };
  }

  if (row.state === "pendiente") {
    return {
      rule: "undecided",
      sentence: `Nadie ha decidido la instruccion ${instruction.id}, asi que no entra en la corrida.`,
    };
  }

  if (findings.some(isDefinitiveSatListing) && !releasedByAPerson(decision)) {
    return {
      rule: "sat_definitive",
      sentence:
        "El proveedor esta en la lista del SAT con una situacion definitiva, asi que sus comprobantes no tienen efecto fiscal y la linea no sale.",
    };
  }

  return {
    rule: "verification_blocked",
    sentence:
      "La verificacion de un centavo devolvio un CEP que no sostiene que la cuenta sea del proveedor, asi que la linea no sale.",
  };
}

/**
 * The explanation of the finding that stopped the line, or a sentence that admits
 * there is none.
 *
 * The engine wrote the explanation and this is the only place the screen quotes
 * it instead of composing one, which is what keeps the reason on the run screen
 * and the reason here identical. The fallback is not decoration: a decision with
 * no finding under it is a state worth naming rather than covering.
 */
function reasonFromFindings(row: Omit<PaymentRow, "exclusion">): string {
  const worst = [...row.item.findings].sort(
    (left, right) => right.amountAtRisk - left.amountAtRisk,
  )[0];

  return (
    worst?.explanation ??
    "la decision la tomo una persona y no dejo un hallazgo contra la linea."
  );
}

/**
 * Reading order: what is about to leave first, by amount, then what is not.
 *
 * The opposite of the run screen on purpose. There the clerk's job is the
 * exceptions, because the releases are already handled; here the screen exists to
 * be the last look at what is leaving, so the money about to move is at the top
 * and everything that is staying put is below it with its reason.
 */
export function orderPaymentRows(rows: readonly PaymentRow[]): PaymentRow[] {
  return [...rows].sort((left, right) => {
    if (left.payable !== right.payable) {
      return left.payable ? -1 : 1;
    }

    return right.item.instruction.amount - left.item.instruction.amount;
  });
}

/** The lines the run hands to the rail: the ones a person released. */
export function runRows(rows: readonly PaymentRow[]): PaymentRow[] {
  return orderPaymentRows(rows.filter((row) => row.inRun));
}

/** The lines the run does not take at all, each with the reason it did not. */
export function excludedRows(rows: readonly PaymentRow[]): PaymentRow[] {
  return orderPaymentRows(rows.filter((row) => !row.inRun));
}

/* ------------------------------------------------------------ the headline */

/**
 * What the top of the screen says, counts and pesos both.
 *
 * Counts alone would be a screen a clerk has to add up herself, and pesos alone
 * hide that one line of a quarter of a million is not eighty small ones. No
 * percentage and no ratio anywhere in this shape: ADR-0009 forbids a figure like
 * that on any screen of this product, and "34 de 86 lineas" is the honest way to
 * say how far a run has got.
 */
export interface RunOutlook {
  /** Lines the run hands to the rail, and the pesos they carry. */
  inRun: number;
  inRunAmount: number;
  /** Lines the run does not take at all, with the pesos that are staying put. */
  excluded: number;
  excludedAmount: number;
  /** Of the lines in the run, the ones a control stops before the rail does. */
  stopped: number;
  stoppedAmount: number;
  /** Lines in the run the rail has already answered for, whatever it answered. */
  answered: number;
  /** Lines that left, whether or not the rail has acknowledged them. */
  left: number;
  leftAmount: number;
  sent: number;
  settled: number;
  queued: number;
  failed: number;
  cancelled: number;
  /** Money that has not moved yet and nothing is stopping: what a press sends. */
  pending: number;
  pendingAmount: number;
  /** Receipts the execution produced, which is what the screen can open. */
  receipts: number;
}

export function runOutlook(rows: readonly PaymentRow[]): RunOutlook {
  const inRun = rows.filter((row) => row.inRun);
  const excluded = rows.filter((row) => !row.inRun);
  const stopped = inRun.filter((row) => !row.payable);
  const linesOf = (state: PaymentLineState) =>
    inRun.filter((row) => row.line?.state === state);
  const left = inRun.filter(
    (row) => row.line?.state === "sent" || row.line?.state === "settled",
  );
  const pending = inRun.filter((row) => row.payable && row.state !== "enviado");
  const amountOf = (set: readonly PaymentRow[]) =>
    sumAmounts(set.map((row) => row.item.instruction.amount));

  return {
    inRun: inRun.length,
    inRunAmount: amountOf(inRun),
    excluded: excluded.length,
    excludedAmount: amountOf(excluded),
    stopped: stopped.length,
    stoppedAmount: amountOf(stopped),
    answered: inRun.filter((row) => row.line !== undefined).length,
    left: left.length,
    leftAmount: amountOf(left),
    sent: linesOf("sent").length,
    settled: linesOf("settled").length,
    queued: linesOf("queued").length,
    failed: linesOf("failed").length,
    cancelled: linesOf("cancelled").length,
    pending: pending.length,
    pendingAmount: amountOf(pending),
    receipts: inRun.filter((row) => row.line?.receiptId !== undefined).length,
  };
}

/* -------------------------------------------------------- the bank layout */

/**
 * The columns of the dispersal file, and what each one is.
 *
 * This is SentryOne's own column layout and the header says so on screen, because
 * every bank publishes its own template and claiming to have written somebody's
 * would be a claim nobody checked. What the file guarantees is the part that
 * matters: one row per line the run is allowed to pay, and every field on it comes
 * off the instruction this product already holds, which is the same rule ADR-0008
 * puts on the rail.
 *
 * The order is the order a portal form asks for it: who is paid, where, how much,
 * and against what.
 */
export const LAYOUT_COLUMNS = [
  "referencia",
  "beneficiario",
  "rfc",
  "banco",
  "clabe",
  "importe",
  "cfdi",
] as const;

/**
 * One field, escaped for CSV.
 *
 * A legal name with a comma in it is not hypothetical in this country, and a file
 * that splits one company into two columns is a file that pays the wrong row.
 */
function csvField(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/**
 * The amount as a machine reads it: a dot, two decimals, no thousands separator
 * and no currency symbol.
 *
 * Deliberately not `formatMoney`. That function is for a person on a screen and it
 * writes `$1,234.56` in es-MX, which a bank portal parses as something else or
 * refuses outright.
 */
export function layoutAmount(amount: number): string {
  return amount.toFixed(2);
}

/**
 * Which lines the layout carries, and the two conditions are both refusals.
 *
 * **Only a payable line.** A file that carried a held payment, a blocked
 * beneficiary or a definitively listed supplier would be the control being bypassed
 * by the export, which is worse than having no export: the clerk would have done it
 * herself, through a file this product handed her.
 *
 * **Only a line no rail is holding.** Once an execution line exists the fate of that
 * payment belongs to the rail, and a bank file that repeats it is how a supplier gets
 * paid twice. That covers the `queued` line too, which has not been paid and is not
 * ours to pay a second way while the rail still has it.
 */
export function layoutRows(rows: readonly PaymentRow[]): PaymentRow[] {
  return orderPaymentRows(
    rows.filter((row) => row.payable && row.line === undefined),
  );
}

/**
 * The file itself: a header row and one line per payment.
 *
 * `bankNameOf` is injected rather than imported so this module stays free of the
 * institution catalogue and the test can name a bank without loading it.
 */
export function dispersalLayoutCsv(
  rows: readonly PaymentRow[],
  bankNameOf: (clabe: string) => string,
): string {
  const header = LAYOUT_COLUMNS.join(",");
  const lines = layoutRows(rows).map((row) => {
    const { instruction, supplier } = row.item;

    return [
      csvField(instruction.id),
      csvField(supplier.legalName),
      csvField(supplier.rfc),
      csvField(bankNameOf(instruction.clabe)),
      csvField(instruction.clabe),
      csvField(layoutAmount(instruction.amount)),
      csvField(instruction.cfdiUuids.join(" ")),
    ].join(",");
  });

  /* A trailing newline. A file whose last row has no line ending is the one a
     spreadsheet silently drops when it is appended to another. */
  return `${[header, ...lines].join("\n")}\n`;
}

/** The name the download carries, so two runs never overwrite each other. */
export function dispersalLayoutFilename(runId: string): string {
  const safe = runId.replace(/[^a-zA-Z0-9_-]+/g, "-");

  return `layout-dispersion-${safe}.csv`;
}
