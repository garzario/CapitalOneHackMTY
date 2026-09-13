/**
 * The payment run leaving, from the button to the receipt.
 *
 * This is issue #198 in one file, and it is the one file in this product where money
 * that is not a centavo moves. Before ADR-0008 SentryOne stopped payments and the
 * SPEI left from the company's own banking portal, which left the honest answer to
 * "why would Lupita upload the screenshot" at "because we asked her to". Now the
 * instruction is the payment order, so every peso that leaves has a CFDI, a decision
 * and a name behind it in the append-only ledger.
 *
 * The path, in the order it happens:
 *
 * 1. `planRunExecution` in `@hackmty/core` decides which lines may go, reading the
 *    one rule table of ADR-0009. This file decides nothing: it gathers, it sends and
 *    it appends.
 * 2. Each line goes to `@hackmty/rail` for exactly its own amount to exactly the
 *    account its instruction names. A line the rail takes appends `payment_sent`; a
 *    line the rail refuses appends `payment_failed` with the sentence the rail wrote.
 * 3. The rail is asked once, for the whole run, which of the lines it can answer for.
 *    Those append `payment_settled` with the receipt. A rail that cannot be asked
 *    leaves its lines on `sent`, and silence is never read as a settlement.
 * 4. The outflow is written to the company's own bank mirror, which is what lets
 *    control 6 reconcile the payment instead of reporting it missing from a statement.
 *
 * Four properties this file is written to keep.
 *
 * **Nothing is appended for a send that did not happen.** A rail that refuses the
 * whole run (no rail at all, or a rail that cannot be built) appends nothing and the
 * route answers `503`. A `payment_sent` for a payment that never left is the one
 * entry this ledger must not hold, and it is the reason every event here is appended
 * after the rail has answered and never before.
 *
 * **`sent` and `settled` are two claims and this file never collapses them.** The
 * rail says which one it reached, and `confirm` is asked as its own question.
 *
 * **The execution is a projection and never a stored row.** `foldExecution` builds
 * `PaymentExecution` out of the event ledger, exactly like `foldVerification` next
 * door, so the screen, the stream, the receipt, the constancia and a replay a year
 * later read one history.
 *
 * **It weighs no pesos and authors no findings.** The plan is core's, the receipt is
 * core's, the totals are core's. What is here is the order of the steps and the
 * gathering.
 */

import type {
  Actor,
  LedgerEvent,
  LedgerTx,
  PaymentExecution,
  PaymentExecutionLine,
  PaymentInstruction,
  PaymentReceipt,
  SealState,
} from "@hackmty/core";
import {
  claveOfReceiptId,
  type ExecutableLine,
  executionTotals,
  lookupInstitution,
  type PlannedLine,
  planRunExecution,
  type RunExecutionPlanResult,
  receiptFor,
  receiptIdFor,
  stableUuid,
} from "@hackmty/core";
import { sealStateOf } from "@hackmty/engine";
import type {
  DispersalRail,
  PaymentConfirmation,
  PaymentOrder,
  PaymentSent,
  RailResolution,
} from "@hackmty/rail";
import { LayoutRail, type LayoutResponseRow, layoutFile } from "@hackmty/rail";
import type { PipelineClock } from "./pipeline";
import type { PaymentEventQuery, Repository } from "./repo";
import type { PaymentRun } from "./schemas";

/**
 * The slice of `ApiDeps` this file reads. `ApiDeps` satisfies it structurally, so the
 * route hands itself over and this module still names what it touches.
 */
export interface ExecutionDeps {
  repo: Repository;
  clock: PipelineClock;
  rail(): Promise<RailResolution>;
  emit(event: LedgerEvent): Promise<void>;
}

/* -------------------------------------------------------------------------- */
/* The projection                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Folds the payment events of one run into what the rail did.
 *
 * Pure, and exported because it is the part worth asserting directly: hand it a list
 * of events and it says what the screen will show, with no repository, no clock and
 * no rail. The rules, in the order they are applied:
 *
 * - `payment_sent` puts the line on `sent` and records the clave, the rail and the
 *   instant. The first one also answers who started the run.
 * - `payment_settled` puts it on `settled` and records the receipt the event names.
 *   It never walks backwards: a `payment_sent` that arrives with a later timestamp
 *   than the settlement it belongs to cannot un-settle it.
 * - `payment_failed` puts it on `failed` with the sentence the rail wrote, and
 *   `payment_cancelled` on `cancelled` with the reason the run dropped it for. Both
 *   lose to a line that actually left, because money that moved is the one fact
 *   nothing else overrides.
 *
 * `amounts` is the pesos per instruction, from the run. The events do not carry an
 * amount and deliberately so: the amount of a line is the instruction's, there is
 * exactly one place it lives, and an amount copied onto an event could disagree with
 * the order that was actually sent.
 */
export function foldExecution(
  runId: string,
  events: readonly LedgerEvent[],
  amounts: ReadonlyMap<string, number>,
  now: string,
): PaymentExecution {
  const lines = new Map<string, PaymentExecutionLine>();
  let startedBy: Actor | undefined;
  let startedAt: string | undefined;
  let newest: string | undefined;

  const amountOf = (instructionId: string) => amounts.get(instructionId) ?? 0;

  for (const event of events) {
    if (event.type === "payment_sent") {
      const line = lines.get(event.instructionId) ?? {
        instructionId: event.instructionId,
        state: "sent" as const,
        amount: amountOf(event.instructionId),
      };
      lines.set(event.instructionId, {
        ...line,
        state: line.state === "settled" ? "settled" : "sent",
        ...(event.claveRastreo === undefined
          ? {}
          : {
              claveRastreo: event.claveRastreo,
              receiptId: receiptIdFor(event.claveRastreo),
            }),
        ...(event.rail === undefined ? {} : { rail: event.rail }),
        sentAt: event.at,
      });
      if (startedAt === undefined) {
        startedAt = event.at;
        startedBy = event.actor;
      }
      newest = event.at;
      continue;
    }

    if (event.type === "payment_settled") {
      const line = lines.get(event.instructionId);
      lines.set(event.instructionId, {
        ...(line ?? {
          instructionId: event.instructionId,
          amount: amountOf(event.instructionId),
        }),
        state: "settled",
        claveRastreo: event.claveRastreo,
        receiptId: event.receiptId,
      });
      newest = event.at;
      continue;
    }

    if (event.type === "payment_failed" || event.type === "payment_cancelled") {
      const line = lines.get(event.instructionId);
      /* Money that left outranks everything, which is the same rule the state table
         applies to a SAT list published afterwards. A failure recorded against a line
         that already settled describes a retry, not the payment. */
      if (line?.state === "sent" || line?.state === "settled") {
        newest = event.at;
        continue;
      }
      lines.set(event.instructionId, {
        instructionId: event.instructionId,
        state: event.type === "payment_failed" ? "failed" : "cancelled",
        amount: amountOf(event.instructionId),
        reason: event.reason,
        ...(event.type === "payment_failed" && event.claveRastreo !== undefined
          ? { claveRastreo: event.claveRastreo }
          : {}),
      });
      if (event.type === "payment_cancelled" && startedBy === undefined) {
        startedBy = event.actor;
      }
      newest = event.at;
    }
  }

  const rows = [...lines.values()];
  return {
    runId,
    lines: rows,
    totals: executionTotals(rows),
    ...(startedBy === undefined ? {} : { startedBy }),
    ...(startedAt === undefined ? {} : { startedAt }),
    updatedAt: newest ?? now,
  };
}

/** Pesos per instruction of one run, which is what the fold joins against. */
export function amountsOf(run: PaymentRun): Map<string, number> {
  return new Map(
    run.items.map((item) => [item.instruction.id, item.instruction.amount]),
  );
}

/** `PaymentExecution` for one run, out of the ledger. */
export async function executionOf(
  deps: Pick<ExecutionDeps, "repo" | "clock">,
  run: PaymentRun,
): Promise<PaymentExecution> {
  const events = await deps.repo.paymentEvents({ runId: run.id });
  return foldExecution(run.id, events, amountsOf(run), deps.clock.now());
}

/* -------------------------------------------------------------------------- */
/* The plan                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * The run as the plan reads it: the decision, the findings, the verification and
 * whatever the rail already did.
 *
 * The verification is read off the ledger per line rather than recomputed, because a
 * blocked beneficiary is a reason a line does not leave and the fold is where that
 * state lives.
 */
export async function executableLines(
  deps: Pick<ExecutionDeps, "repo" | "clock">,
  run: PaymentRun,
  execution: PaymentExecution,
): Promise<ExecutableLine[]> {
  const byInstruction = new Map(
    execution.lines.map((line) => [line.instructionId, line]),
  );
  const blocked = await blockedVerifications(deps, run);
  const paid = await paidElsewhere(deps, run);

  return run.items.map((item) => ({
    /* `sentAt` comes off the instruction when the store holds one and off the ledger
       when it does not. Neither store projects the seed's own `payment_sent` events
       onto `sent_at`, so a line the company paid from its banking portal before this
       endpoint existed would otherwise be offered to a rail. One read answers it for
       the whole run. */
    instruction: {
      ...item.instruction,
      ...(item.instruction.sentAt === undefined && paid.has(item.instruction.id)
        ? { sentAt: paid.get(item.instruction.id) }
        : {}),
    },
    decision: item.decision ?? null,
    findings: item.findings,
    ...(blocked.has(item.instruction.id)
      ? { verification: { state: "blocked" as const } }
      : {}),
    execution: byInstruction.get(item.instruction.id) ?? null,
  }));
}

/**
 * When each instruction of this run was paid, according to the whole ledger.
 *
 * Not filtered by run on purpose: the question is whether this instruction has ever
 * been paid, and the answer has to include the SPEI the company sent from its own
 * banking portal, which predates ADR-0008 and carries no run id at all. Sending one of
 * those a second time is the worst bug this endpoint could have.
 */
async function paidElsewhere(
  deps: Pick<ExecutionDeps, "repo">,
  run: PaymentRun,
): Promise<Map<string, string>> {
  const events = await deps.repo.paymentEvents({
    instructionIds: run.items.map((item) => item.instruction.id),
  });
  const paid = new Map<string, string>();
  for (const event of events) {
    if (event.type !== "payment_sent") {
      continue;
    }
    const known = paid.get(event.instructionId);
    if (known === undefined || Date.parse(event.at) < Date.parse(known)) {
      paid.set(event.instructionId, event.at);
    }
  }
  return paid;
}

/**
 * Which lines of this run the beneficiary verification blocked.
 *
 * Read off the `decision_made` events the engine signed that carry a critical
 * `beneficiary_cep` finding, which is exactly what `foldVerification` reads to answer
 * `blocked`. It is done in one pass over the run's own findings rather than with one
 * ledger read per line, because eighty-six reads before a button press is a button
 * that feels broken.
 */
async function blockedVerifications(
  _deps: Pick<ExecutionDeps, "repo" | "clock">,
  run: PaymentRun,
): Promise<Set<string>> {
  const blocked = new Set<string>();
  for (const item of run.items) {
    const critical = item.findings.some(
      (finding) =>
        finding.detector === "beneficiary_cep" &&
        finding.severity === "critical",
    );
    if (critical) {
      blocked.add(item.instruction.id);
    }
  }
  return blocked;
}

/* -------------------------------------------------------------------------- */
/* The execution                                                               */
/* -------------------------------------------------------------------------- */

export type ExecuteFailure = "not_found" | "conflict" | "no_rail";

export interface ExecuteRunInput {
  run: PaymentRun;
  actor: Actor;
  /** Narrows the set of lines. Never widens it past what the decisions allow. */
  instructionIds?: readonly string[];
}

export type ExecuteOutcome =
  | {
      ok: true;
      execution: PaymentExecution;
      /** Lines the run deliberately left alone, with the reason for each. */
      skipped: PlannedLine[];
      /** What the rail says it is, for the stream's own `done` payload. */
      rail: string;
    }
  | { ok: false; failure: ExecuteFailure; message: string };

/** One line the caller watches go by. */
export type ExecutionProgress =
  | { kind: "line"; line: PaymentExecutionLine }
  | { kind: "skipped"; line: PlannedLine };

export type OnProgress = (progress: ExecutionProgress) => void | Promise<void>;

/** What a caller is told when the run has nothing left to send. */
export function nothingToSend(
  runId: string,
  execution: PaymentExecution,
): string {
  return execution.totals.lines === 0
    ? `La corrida ${runId} no tiene ninguna linea liberada, asi que no hay nada que enviar. Una linea sale cuando una persona la libera y nada la detiene.`
    : `La corrida ${runId} ya se ejecuto: ${execution.totals.sent + execution.totals.settled} lineas salieron y no queda ninguna linea liberada pendiente, asi que no se envia nada otra vez.`;
}

/** What a caller is told when they named lines nothing may send. */
export function refusedLines(plan: RunExecutionPlanResult): string {
  const named = plan.refused
    .map((line) => `${line.instructionId} (${line.state}: ${line.reason})`)
    .join("; ");
  const unknown =
    plan.unknown.length === 0
      ? ""
      : ` Y la corrida no tiene estas instrucciones: ${plan.unknown.join(", ")}.`;
  return `La peticion nombra lineas que no pueden salir, asi que no se envio nada: ${named}.${unknown} Quitalas de la peticion o resuelvelas primero.`;
}

/**
 * Sends the run and appends what happened, line by line.
 *
 * `onProgress` is called as each line resolves, which is what the SSE stream writes.
 * The return value is the whole execution folded back out of the ledger, so the
 * `done` payload and `GET /api/v1/run/:id/execution` cannot disagree about a line
 * that was just sent.
 */
export async function executeRun(
  deps: ExecutionDeps,
  input: ExecuteRunInput,
  onProgress: OnProgress = () => {},
): Promise<ExecuteOutcome> {
  const { run, actor } = input;
  const before = await executionOf(deps, run);
  const lines = await executableLines(deps, run, before);
  const plan = planRunExecution({
    lines,
    ...(input.instructionIds === undefined
      ? {}
      : { only: input.instructionIds }),
  });

  if (plan.refused.length > 0 || plan.unknown.length > 0) {
    return { ok: false, failure: "conflict", message: refusedLines(plan) };
  }
  if (plan.send.length === 0 && plan.cancel.length === 0) {
    return {
      ok: false,
      failure: "conflict",
      message: nothingToSend(run.id, before),
    };
  }

  const resolution = await deps.rail();
  if (!resolution.ok) {
    /* Nothing is appended on this branch and that is the whole reason it is its own
       branch: a `payment_sent` for a payment that never left is the one entry this
       ledger must not hold, and a server with no rail has not sent anything. */
    return { ok: false, failure: "no_rail", message: resolution.message };
  }

  const rail: DispersalRail = resolution.rail;
  const instructions = new Map(
    run.items.map((item) => [item.instruction.id, item]),
  );

  /* The cancellations go first, and the order is deliberate: a line the evidence
     stops is recorded as dropped before a single peso moves, so a ledger replay can
     never show the run sending money while it was still deciding not to. */
  for (const line of plan.cancel) {
    await deps.emit({
      type: "payment_cancelled",
      at: deps.clock.now(),
      instructionId: line.instructionId,
      reason: line.reason ?? "La corrida no envio esta linea.",
      runId: run.id,
      /* No actor. Nobody dropped this line by hand: the evidence did, and the reason
         says which evidence. `payment_cancelled` carries an actor only when a person
         is the one who cancelled it. */
    });
    await onProgress({
      kind: "line",
      line: {
        instructionId: line.instructionId,
        state: "cancelled",
        amount: line.amount,
        reason: line.reason,
      },
    });
  }

  const sent: PaymentSent[] = [];
  for (const planned of plan.send) {
    const item = instructions.get(planned.instructionId);
    if (item === undefined) {
      continue;
    }
    const order: PaymentOrder = {
      instructionId: item.instruction.id,
      runId: run.id,
      beneficiaryAccount: item.instruction.clabe,
      amount: item.instruction.amount,
      beneficiary: {
        legalName: item.supplier.legalName,
        rfc: item.instruction.supplierRfc,
        cfdiUuids: item.instruction.cfdiUuids,
      },
    };

    const answer = await rail
      .send(order)
      .catch((cause: unknown) =>
        cause instanceof Error ? cause : new Error(String(cause)),
      );

    if (answer instanceof Error) {
      await deps.emit({
        type: "payment_failed",
        at: deps.clock.now(),
        instructionId: order.instructionId,
        reason: answer.message,
        runId: run.id,
      });
      await onProgress({
        kind: "line",
        line: {
          instructionId: order.instructionId,
          state: "failed",
          amount: order.amount,
          reason: answer.message,
        },
      });
      continue;
    }

    /* A rail that only queued the line has not sent anything: the dispersal file is
       on the clerk's computer and the bank has not seen it. Nothing is appended, for
       the same reason a `503` appends nothing, and the line is streamed as `queued`
       with the file it is waiting in. */
    if (answer.state === "queued") {
      await onProgress({
        kind: "line",
        line: {
          instructionId: order.instructionId,
          state: "queued",
          amount: order.amount,
          reason: `La linea quedo en el archivo de dispersion con la referencia ${answer.reference ?? "sin referencia"}. No sale hasta que alguien lo suba al portal del banco.`,
        },
      });
      sent.push(answer);
      continue;
    }

    await deps.emit({
      type: "payment_sent",
      at: answer.sentAt,
      instructionId: order.instructionId,
      ...(answer.claveRastreo === undefined
        ? {}
        : { claveRastreo: answer.claveRastreo }),
      runId: run.id,
      ...(answer.rail === undefined ? {} : { rail: answer.rail }),
      actor,
    });
    await recordOutflow(deps, item.instruction, answer);
    sent.push(answer);

    await onProgress({
      kind: "line",
      line: {
        instructionId: order.instructionId,
        state: "sent",
        amount: order.amount,
        ...(answer.claveRastreo === undefined
          ? {}
          : {
              claveRastreo: answer.claveRastreo,
              receiptId: receiptIdFor(answer.claveRastreo),
            }),
        ...(answer.rail === undefined ? {} : { rail: answer.rail }),
        sentAt: answer.sentAt,
      },
    });
  }

  await settleConfirmed(deps, run.id, rail, sent, onProgress);

  for (const line of plan.skip) {
    await onProgress({ kind: "skipped", line });
  }

  return {
    ok: true,
    execution: await executionOf(deps, run),
    skipped: plan.skip,
    rail: rail.describe,
  };
}

/**
 * Asks the rail which lines it can answer for, once, and settles those.
 *
 * A rail with no `confirm` leaves every line on `sent`. That is the honest answer and
 * not an omission: `StpRail` has none because the proof that an STP order became a
 * transfer is the CEP Banxico publishes for its clave, and asking STP to restate its
 * own acceptance would be the same claim twice wearing a different name.
 */
async function settleConfirmed(
  deps: ExecutionDeps,
  runId: string,
  rail: DispersalRail,
  sent: readonly PaymentSent[],
  onProgress: OnProgress,
): Promise<void> {
  const confirmable = sent.filter(
    (line) => line.state !== "queued" && line.claveRastreo !== undefined,
  );
  if (rail.confirm === undefined || confirmable.length === 0) {
    return;
  }

  const confirmations: PaymentConfirmation[] = await rail
    .confirm(confirmable)
    .catch(() => []);
  const byInstruction = new Map(
    confirmations.map((row) => [row.instructionId, row]),
  );

  for (const line of confirmable) {
    const confirmation = byInstruction.get(line.instructionId);
    if (confirmation === undefined || confirmation.state !== "settled") {
      continue;
    }
    const clave = line.claveRastreo as string;
    const receiptId = receiptIdFor(clave);
    await deps.emit({
      type: "payment_settled",
      at: confirmation.at,
      instructionId: line.instructionId,
      claveRastreo: clave,
      receiptId,
      runId,
    });
    await onProgress({
      kind: "line",
      line: {
        instructionId: line.instructionId,
        state: "settled",
        amount: line.amount,
        claveRastreo: clave,
        receiptId,
        ...(line.rail === undefined ? {} : { rail: line.rail }),
        sentAt: line.sentAt,
      },
    });
  }
}

/**
 * Writes the outflow to the company's own bank mirror.
 *
 * This is what makes control 6 read the payment back. `bank_reconciliation` compares
 * the outflows the bank posted against the company's own documents, so an executed
 * run with nothing on the statement would have it report every line as
 * `payment_not_in_mirror`, which is true for about a day on a real bank and false the
 * moment we are the ones who posted it. The row is the mirror of what the rail wrote,
 * it carries the clave de rastreo in `raw` so the two can be matched by hand, and it
 * names no payee, exactly like the rail's own row.
 *
 * A mirror write that fails does not fail the payment. The money left; the statement
 * row is bookkeeping, and losing it costs one reconciliation finding a person can
 * read, which is a much smaller thing than a route that throws after a rail accepted
 * a transfer.
 */
async function recordOutflow(
  deps: ExecutionDeps,
  instruction: PaymentInstruction,
  answer: PaymentSent,
): Promise<void> {
  const tx: Omit<LedgerTx, "accountId"> = {
    /* A version 8 uuid derived from the clave de rastreo, because `ledger_tx.id` is a
       uuid column and a clave is up to thirty letters and digits. Derived and not
       random, so a second write of the same transfer is the same row: two rows for one
       payment is control 6's `cfdi_paid_twice` finding raised by our own bookkeeping.
       `stableUuid` is the same derivation the Nessie importer uses. */
    id: stableUuid(`rail:outflow:${answer.claveRastreo ?? instruction.id}`),
    occurredAt: answer.sentAt,
    amount: instruction.amount,
    direction: "debit",
    source: answer.rail ?? "rail",
    raw: {
      claveRastreo: answer.claveRastreo ?? null,
      instructionId: instruction.id,
      simulated: answer.simulated,
    },
  };
  await deps.repo.recordBankOutflow(tx).catch((cause: unknown) => {
    console.error(
      `[execution] the outflow of ${instruction.id} was not written to the bank mirror:`,
      cause,
    );
  });
}

/* -------------------------------------------------------------------------- */
/* The receipt                                                                 */
/* -------------------------------------------------------------------------- */

export interface ReceiptLookup {
  receipt: PaymentReceipt;
  instruction: PaymentInstruction;
}

/**
 * The receipt of one payment, rebuilt from the ledger every time it is asked for.
 *
 * Nothing about a receipt is stored. The clave de rastreo is inside the id, the
 * events say when it was sent and whether the rail acknowledged it, the instruction
 * says how much and to whom, and the CEP for that clave says what can be proven about
 * the seal. A stored receipt could disagree with all four.
 *
 * `undefined` is a `404`: a receipt for a payment this instance never held would be a
 * fabricated document, and that is the one word in this repository with legal weight.
 */
export async function receiptOf(
  deps: Pick<ExecutionDeps, "repo" | "clock">,
  receiptId: string,
): Promise<ReceiptLookup | undefined> {
  const clave = claveOfReceiptId(receiptId);
  if (clave === undefined) {
    return undefined;
  }

  const events = await deps.repo.paymentEvents({ claveRastreo: clave });
  const sentEvent = events.find(
    (event) => event.type === "payment_sent" && event.claveRastreo === clave,
  );
  if (sentEvent === undefined || sentEvent.type !== "payment_sent") {
    return undefined;
  }
  const settledEvent = events.find(
    (event) => event.type === "payment_settled" && event.claveRastreo === clave,
  );

  const detail = await deps.repo.instructionDetail(sentEvent.instructionId);
  if (detail === undefined) {
    return undefined;
  }

  const company = await deps.repo.company();
  const cep = await deps.repo
    .beneficiaries()
    .then((rows) =>
      rows.find(
        (row) =>
          row.cep.claveRastreo.toUpperCase() === clave.toUpperCase() ||
          (row.supplierRfc === detail.instruction.supplierRfc &&
            row.clabe === detail.instruction.clabe),
      ),
    )
    .catch(() => undefined);

  const line: PaymentExecutionLine = {
    instructionId: sentEvent.instructionId,
    state: settledEvent === undefined ? "sent" : "settled",
    amount: detail.instruction.amount,
    claveRastreo: clave,
    ...(sentEvent.rail === undefined ? {} : { rail: sentEvent.rail }),
    sentAt: sentEvent.at,
    receiptId,
  };

  return {
    instruction: detail.instruction,
    receipt: receiptFor({
      runId: sentEvent.runId ?? "",
      line,
      instruction: detail.instruction,
      supplier: detail.supplier ?? undefined,
      beneficiaryBank: bankOf(detail.instruction.clabe),
      executedBy: sentEvent.actor ?? UNRECORDED_ACTOR,
      sealState: sealOf(cep?.cep),
      ...(cep === undefined ? {} : { cepAt: cep.verifiedAt }),
      ...(settledEvent === undefined ? {} : { settledAt: settledEvent.at }),
      rail: sentEvent.rail ?? "nessie",
      synthetic: company.synthetic,
    }),
  };
}

/**
 * Who a receipt names when the `payment_sent` carries no actor.
 *
 * Every execution through `POST /api/v1/run/:id/execute` records one, because the
 * route requires the header. What does not is a `payment_sent` the seed wrote for a
 * payment the company made from its own banking portal before this endpoint existed,
 * and the honest thing to print on that receipt is that nobody is recorded, not a
 * name the ledger does not hold.
 */
export const UNRECORDED_ACTOR: Actor = {
  name: "sin registro en la bitacora",
  role: "clerk",
};

/** What can be proven about the Banxico seal, or `not_checked` when nothing can. */
function sealOf(cep: Parameters<typeof sealStateOf>[0] | undefined): SealState {
  return cep === undefined ? "not_checked" : sealStateOf(cep);
}

/** The bank the account belongs to, from the Banxico catalogue in core. */
export function bankOf(clabe: string): string {
  const code = clabe.replace(/\D+/g, "").slice(0, 3);
  return lookupInstitution(code)?.name ?? `institucion ${code}`;
}

/* -------------------------------------------------------------------------- */
/* The dispersal file                                                          */
/* -------------------------------------------------------------------------- */

/**
 * The bank portal layout of one run: the released lines, as the file a clerk uploads.
 *
 * It is the same selection the execution uses, through the same `planRunExecution`,
 * because a file that held a line the run would not send would be the control being
 * bypassed by an export button. Nothing is appended: writing a file sends nothing.
 */
export async function layoutFor(
  deps: Pick<ExecutionDeps, "repo" | "clock">,
  run: PaymentRun,
): Promise<{ file: string; lines: number }> {
  const execution = await executionOf(deps, run);
  const plan = planRunExecution({
    lines: await executableLines(deps, run, execution),
  });
  const rail = new LayoutRail({ now: () => deps.clock.now() });
  const items = new Map(run.items.map((item) => [item.instruction.id, item]));

  for (const planned of plan.send) {
    const item = items.get(planned.instructionId);
    if (item === undefined) {
      continue;
    }
    await rail.send({
      instructionId: item.instruction.id,
      runId: run.id,
      beneficiaryAccount: item.instruction.clabe,
      amount: item.instruction.amount,
      beneficiary: {
        legalName: item.supplier.legalName,
        rfc: item.instruction.supplierRfc,
        cfdiUuids: item.instruction.cfdiUuids,
      },
    });
  }

  return { file: layoutFile(rail.queued), lines: rail.queued.length };
}

export interface LayoutResponseOutcome {
  /** Rows the file carried that this run could match to a line. */
  applied: PaymentExecutionLine[];
  /** References the file carried that this run does not hold. */
  unknown: string[];
  execution: PaymentExecution;
}

/**
 * Reads the response file the bank portal handed back and records what it says.
 *
 * This is the second half of the no-API path and the half where the clave de rastreo
 * finally arrives. It still obeys the rule the whole package is built on: the clave
 * comes from the bank and never from a keyboard, and a row the portal reported as paid
 * with no clave on it is dropped by `readLayoutResponse` rather than recorded, because
 * a settled payment nobody can look up is a receipt with nothing behind it.
 *
 * The reference in the file is matched against the reference the layout wrote, which
 * is the line's position in the file. That is why the file is rebuilt here from the
 * same plan: the join is the file, and rebuilding it from the same run is what makes
 * the reference mean the same thing on both sides.
 */
export async function applyLayoutResponse(
  deps: ExecutionDeps,
  run: PaymentRun,
  rows: readonly LayoutResponseRow[],
  actor: Actor,
): Promise<LayoutResponseOutcome> {
  const execution = await executionOf(deps, run);
  const plan = planRunExecution({
    lines: await executableLines(deps, run, execution),
  });
  const items = new Map(run.items.map((item) => [item.instruction.id, item]));
  const byReference = new Map<string, string>();
  for (const [at, planned] of plan.send.entries()) {
    byReference.set(String(at + 1).padStart(7, "0"), planned.instructionId);
  }

  const applied: PaymentExecutionLine[] = [];
  const unknown: string[] = [];

  for (const row of rows) {
    const instructionId = byReference.get(row.referencia);
    const item =
      instructionId === undefined ? undefined : items.get(instructionId);
    if (item === undefined || instructionId === undefined) {
      unknown.push(row.referencia);
      continue;
    }

    if (row.state === "failed") {
      await deps.emit({
        type: "payment_failed",
        at: deps.clock.now(),
        instructionId,
        reason:
          row.reason ?? "El portal del banco reporto la linea como rechazada.",
        runId: run.id,
      });
      applied.push({
        instructionId,
        state: "failed",
        amount: item.instruction.amount,
        reason: row.reason,
      });
      continue;
    }

    const clave = row.claveRastreo as string;
    const at = deps.clock.now();
    await deps.emit({
      type: "payment_sent",
      at,
      instructionId,
      claveRastreo: clave,
      runId: run.id,
      actor,
    });
    await deps.emit({
      type: "payment_settled",
      at,
      instructionId,
      claveRastreo: clave,
      receiptId: receiptIdFor(clave),
      runId: run.id,
    });
    await recordOutflow(deps, item.instruction, {
      state: "settled",
      sentAt: at,
      amount: item.instruction.amount,
      instructionId,
      claveRastreo: clave,
      simulated: false,
    });
    applied.push({
      instructionId,
      state: "settled",
      amount: item.instruction.amount,
      claveRastreo: clave,
      receiptId: receiptIdFor(clave),
      sentAt: at,
    });
  }

  return { applied, unknown, execution: await executionOf(deps, run) };
}

export type { PaymentEventQuery };
