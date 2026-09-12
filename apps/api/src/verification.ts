/**
 * The one-cent verification, from the cent to the decision, with nobody typing.
 *
 * This is issue #165 in one file. Before it, the beneficiary control read as a
 * manual procedure with a button on top: a person sent one cent from the company's
 * bank, read the clave de rastreo off a statement, typed it into a form, and
 * SentryOne did the rest. Mexico has no confirmation-of-payee API and the Banxico
 * CEP is the only document a central bank signs about who held an account on a
 * given day, so the cent stays. What goes away is the person.
 *
 * The path, in the order it happens:
 *
 * 1. The rail sends 0.01 MXN to the account the instruction names and answers with
 *    the clave de rastreo it filed the transfer under. `cent_sent` is appended.
 * 2. The CEP for that clave is looked for where docs/09-api.md says to look:
 *    the verified beneficiary registry, then the committed index, then the Banxico
 *    portal and only with `ALLOW_CEP_FETCH=1`. Nothing is ever synthesised.
 * 3. With no CEP yet, `cep_awaited` is appended and a bounded poll keeps asking
 *    until its deadline. A CEP is published once the transfer settles, so waiting
 *    is the ordinary case and not an error.
 * 4. With the CEP in hand, the registry row is saved (which is what ARMS control 5
 *    for this account), the six controls run again over the instruction, and the
 *    expected-loss rule decides. `decision_made` carries it, signed
 *    `SYSTEM_DECIDER`.
 *
 * Four properties this file is written to keep.
 *
 * **It authors no findings and weighs no pesos.** The `beneficiary_cep` finding is
 * `packages/engine`'s and the action is `decide`'s in `packages/core`. This file
 * gathers evidence and appends events, exactly like `pipeline.ts` next door.
 *
 * **It never claims a seal.** `sealState` comes from `sealStateOf` in the engine,
 * which reads the CEP the seam checked: `valid` only when
 * `BANXICO_CEP_CERT_PEM` verified it, and `not_checked` otherwise, which the UI
 * renders as "firma no verificada" and never as valid.
 *
 * **It moves no money and releases nothing by itself.** The cent is the only
 * transfer SentryOne ever originates, `release` means nothing stops this payment,
 * and the SPEI still leaves from the company's own banking portal.
 *
 * **The state is a projection, never a row.** `foldVerification` builds
 * `VerificationState` out of the event ledger, so the screen, the stream and a
 * replay a year later read one history. There is no second copy to drift.
 */

import type {
  Cep,
  Decision,
  Finding,
  LedgerEvent,
  PaymentInstruction,
  Supplier,
  VerificationState,
  VerificationStateName,
} from "@hackmty/core";
import { decide, SYSTEM_DECIDER, supplierModelOf } from "@hackmty/core";
import { sealStateOf } from "@hackmty/engine";
import type { CentSent, RailResolution } from "@hackmty/rail";
import type { SatIndex } from "@hackmty/sat";
import { type CepInbox, type CepSource, resolveCepByClave } from "./cep";
import {
  compareBeneficiaryName,
  type PipelineClock,
  runControlsFor,
} from "./pipeline";
import type { Repository } from "./repo";
import type { InstructionDetail } from "./schemas";

/* -------------------------------------------------------------------------- */
/* Waiting for a CEP                                                           */
/* -------------------------------------------------------------------------- */

/** How long between two asks while the CEP has not been published. */
export const DEFAULT_POLL_INTERVAL_MS = 3_000;

/**
 * How long the poll keeps asking before it hands the clave back to the clerk.
 *
 * A SPEI settles in seconds and its CEP is published shortly after, so a minute is
 * generous for the case this exists for. It is deliberately finite: a background
 * loop with no deadline is a process that never stops asking a public service, and
 * the state machine already has a place to stand while nothing has arrived.
 */
export const DEFAULT_POLL_DEADLINE_MS = 60_000;

export interface VerificationOptions {
  /** `CEP_POLL_INTERVAL_MS`. */
  pollIntervalMs: number;
  /** `CEP_POLL_DEADLINE_MS`. Zero means do not poll in the background at all. */
  pollDeadlineMs: number;
  /** Injected so a test drives the whole wait in microseconds. */
  sleep(ms: number): Promise<void>;
}

export function defaultVerificationOptions(
  read: (name: string) => string | undefined,
): VerificationOptions {
  return {
    pollIntervalMs: positiveNumber(
      read("CEP_POLL_INTERVAL_MS"),
      DEFAULT_POLL_INTERVAL_MS,
    ),
    pollDeadlineMs: positiveNumber(
      read("CEP_POLL_DEADLINE_MS"),
      DEFAULT_POLL_DEADLINE_MS,
    ),
    sleep: (ms) =>
      new Promise((resolve) => {
        setTimeout(resolve, ms);
      }),
  };
}

/** A number a person can set to zero, which is why zero is not "unset". */
function positiveNumber(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw.trim() === "") {
    return fallback;
  }
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

/* -------------------------------------------------------------------------- */
/* What the pipeline needs                                                     */
/* -------------------------------------------------------------------------- */

/**
 * The slice of `ApiDeps` this file reads. `ApiDeps` satisfies it structurally, so
 * the route hands itself over and this module still names what it touches.
 */
export interface VerificationDeps {
  repo: Repository;
  clock: PipelineClock;
  cep: CepSource;
  cepInbox: CepInbox;
  rail(): Promise<RailResolution>;
  verification: VerificationOptions;
  satList?: () => Promise<SatIndex>;
  emit(event: LedgerEvent): Promise<void>;
}

export type VerifyAccountFailure =
  | "not_found"
  | "conflict"
  /** This server has no rail at all. */
  | "no_rail"
  /** There is a rail and it refused the cent. Same answer to the caller. */
  | "rail_failed";

export type VerifyAccountOutcome =
  | {
      ok: true;
      state: VerificationState;
      /**
       * The bounded poll, when one started. The route does not await it: the
       * answer is `202` with the state as far as it got synchronously, and the
       * later states reach the screen over SSE. A test awaits it and asserts the
       * end of the machine with no timers at all.
       */
      pending?: Promise<void>;
    }
  | {
      ok: false;
      failure: VerifyAccountFailure;
      message: string;
      /** The state that refused the call, so a 409 says what it is. */
      state?: VerificationState;
    };

/** What a caller is told when the payment is already resolved. */
export function alreadyResolved(state: VerificationState): string {
  return state.state === "released"
    ? `Instruction ${state.instructionId} was already released on the CEP for ${state.claveRastreo ?? "its clave de rastreo"}. Sending a second cent would prove nothing new.`
    : `Instruction ${state.instructionId} is blocked by the CEP for ${state.claveRastreo ?? "its clave de rastreo"}. It stays blocked until a person resolves it, so no second cent is sent.`;
}

/* -------------------------------------------------------------------------- */
/* The pipeline                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Sends the cent and takes the verification as far as it can go synchronously.
 *
 * "As far as it got" is the contract of the `202`: with the CEP already in hand
 * (the registry holds one, or the committed index does) one call reaches
 * `released` or `blocked`; otherwise it reaches `awaiting_cep` and the poll
 * finishes the machine in the background.
 */
export async function verifyAccount(
  deps: VerificationDeps,
  instructionId: string,
): Promise<VerifyAccountOutcome> {
  const detail = await deps.repo.instructionDetail(instructionId);
  if (detail === undefined) {
    return {
      ok: false,
      failure: "not_found",
      message: `No instruction with id ${instructionId}.`,
    };
  }

  const current = await verificationStateOf(deps, detail);
  if (current.state === "released" || current.state === "blocked") {
    return {
      ok: false,
      failure: "conflict",
      message: alreadyResolved(current),
      state: current,
    };
  }

  const resolution = await deps.rail();
  if (!resolution.ok) {
    return { ok: false, failure: "no_rail", message: resolution.message };
  }

  /* A rail that refused is not a bad request and not a crash: it is this server
     unable to do the thing right now, which is the same answer as having no rail
     and the same status code. The message is the adapter's own, already stripped
     of the key by the Nessie client, and nothing is appended: a `cent_sent` for a
     cent that never left would be the one lie this ledger must not hold. */
  const sent = await resolution.rail
    .sendCent({
      instructionId: detail.instruction.id,
      beneficiaryAccount: detail.instruction.clabe,
    })
    .catch((cause: unknown) =>
      cause instanceof Error ? cause : new Error(String(cause)),
    );

  if (sent instanceof Error) {
    return {
      ok: false,
      failure: "rail_failed",
      message: `The cent did not leave on the ${resolution.rail.rail} rail, so there is nothing to verify yet: ${sent.message}`,
      state: current,
    };
  }

  await deps.emit({
    type: "cent_sent",
    at: sent.sentAt,
    instructionId: detail.instruction.id,
    rail: sent.rail,
    claveRastreo: sent.claveRastreo,
    amount: sent.amount,
    clabeLast4: detail.instruction.clabe.slice(-4),
    simulated: sent.simulated,
  });

  const found = await lookForCep(deps, detail, sent);
  if (found.found) {
    await completeVerification(deps, detail, found.cep);
    return { ok: true, state: await verificationStateOf(deps, detail) };
  }

  await deps.emit({
    type: "cep_awaited",
    at: deps.clock.now(),
    instructionId: detail.instruction.id,
    claveRastreo: sent.claveRastreo,
    attempts: 1,
    waitedMs: 0,
    reason: found.reason,
  });

  const state = await verificationStateOf(deps, detail);
  const pending = pollForCep(deps, detail, sent);

  return pending === undefined
    ? { ok: true, state }
    : { ok: true, state, pending };
}

/** One ask of the CEP seam for the clave this rail just minted. */
function lookForCep(
  deps: VerificationDeps,
  detail: InstructionDetail,
  sent: CentSent,
) {
  return resolveCepByClave(deps, {
    claveRastreo: sent.claveRastreo,
    beneficiaryAccount: detail.instruction.clabe,
    amount: sent.amount,
    date: sent.sentAt.slice(0, 10),
    ...(sent.senderSpeiKey === undefined
      ? {}
      : { senderSpeiKey: sent.senderSpeiKey }),
  });
}

/**
 * The bounded poll: ask, wait, ask again, until the deadline.
 *
 * The elapsed time is the sum of the intervals rather than a wall clock reading, so
 * an injected `sleep` that returns immediately runs the whole budget in
 * microseconds and a test asserts the end state without a fake timer. Undefined
 * when there is no budget to spend, which is how the suite and a server with
 * `CEP_POLL_DEADLINE_MS=0` stay free of background work.
 *
 * A failure inside the loop is swallowed on purpose, and only here: the caller
 * already has its `202`, the state machine is sitting on `awaiting_cep`, which is
 * the truth, and an unhandled rejection in a detached promise would take the
 * process down over a CEP that simply has not been published.
 */
function pollForCep(
  deps: VerificationDeps,
  detail: InstructionDetail,
  sent: CentSent,
): Promise<void> | undefined {
  const { pollIntervalMs, pollDeadlineMs, sleep } = deps.verification;
  if (pollDeadlineMs <= 0 || pollIntervalMs <= 0) {
    return undefined;
  }

  return (async () => {
    let waited = 0;
    let attempts = 1;

    while (waited < pollDeadlineMs) {
      await sleep(pollIntervalMs);
      waited += pollIntervalMs;
      attempts += 1;

      const found = await lookForCep(deps, detail, sent);
      if (found.found) {
        await completeVerification(deps, detail, found.cep);
        return;
      }
      if (waited >= pollDeadlineMs) {
        await deps.emit({
          type: "cep_awaited",
          at: deps.clock.now(),
          instructionId: detail.instruction.id,
          claveRastreo: sent.claveRastreo,
          attempts,
          waitedMs: waited,
          reason: found.reason,
        });
      }
    }
  })().catch((cause: unknown) => {
    console.error(
      `[verification] the CEP poll for ${detail.instruction.id} stopped:`,
      cause,
    );
  });
}

/**
 * The CEP is in hand: store it, run the controls again, decide.
 *
 * The registry row is saved FIRST and that order is the point. `composeInputFor`
 * offers control 5 the CEP verified for the account this instruction pays to and no
 * other, so saving the row is what arms the control; it also turns the account into
 * a known account established by a CEP, which is the evidence the CLABE control
 * reads when it stops calling it a new account. Both are the product working as
 * ADR-0002 describes, and neither is this file deciding anything.
 */
export async function completeVerification(
  deps: VerificationDeps,
  detail: InstructionDetail,
  cep: Cep,
): Promise<Decision> {
  const { instruction } = detail;
  const now = deps.clock.now();

  await deps.repo.saveVerifiedBeneficiary({
    supplierRfc: instruction.supplierRfc,
    clabe: cep.beneficiaryAccount,
    cep,
    verifiedAt: now,
  });
  await deps.emit({
    type: "cep_verified",
    at: now,
    cep,
    supplierRfc: instruction.supplierRfc,
  });

  /* The official 69-B snapshot is passed in, unlike `POST /api/v1/cep/verify`
     which only reads the CEP finding out of the report. This decision releases or
     stops a payment, so it has to see exactly the evidence the intake decision
     saw; a control that knew less here than on the screen next door would be a
     second product. */
  const report = await runControlsFor(
    deps.repo,
    instruction,
    now,
    deps.satList,
  );
  const supplier = await deps.repo.findSupplier(instruction.supplierRfc);
  const decision: Decision = {
    ...decide(instruction, report.findings, supplierModelOf(supplier), { now }),
    decidedBy: SYSTEM_DECIDER,
  };

  await deps.repo.recordEngineDecision(decision);
  await deps.emit({ type: "decision_made", at: decision.decidedAt, decision });

  return decision;
}

/* -------------------------------------------------------------------------- */
/* The projection                                                              */
/* -------------------------------------------------------------------------- */

/** `VerificationState` for one instruction, out of the ledger. */
export async function verificationStateOf(
  deps: Pick<VerificationDeps, "repo" | "clock">,
  detail: InstructionDetail,
): Promise<VerificationState> {
  const events = await deps.repo.verificationEvents(
    detail.instruction.id,
    detail.instruction.clabe,
  );

  return foldVerification(
    detail.instruction,
    detail.supplier ?? undefined,
    events,
    deps.clock.now(),
  );
}

/**
 * Folds the events of one instruction into its verification state.
 *
 * Pure, and exported because it is the part worth asserting directly: hand it a
 * list of events and it says what the screen will show, with no repository, no
 * clock and no rail. The rules, in the order they are applied:
 *
 * - `cent_sent` puts the machine on `cent_sent` and records the rail and the clave.
 * - `cep_awaited` puts it on `awaiting_cep`, which is strictly later than
 *   `cent_sent` and never earlier: a CEP that then arrives moves it forward.
 * - `cep_verified` for this account puts it on `cep_signed` and fills in what the
 *   document says: the holder, the legal name it is compared with, the verdict and
 *   the seal. It is accepted whoever produced it, so a CEP a clerk pasted into
 *   `POST /api/v1/cep/verify` advances the same machine. Evidence is evidence.
 * - a `decision_made` the engine signed, carrying a `beneficiary_cep` finding, is
 *   the end: `blocked` when that finding is critical, which is the CEP itself
 *   saying do not pay, `released` when the action is to release, and otherwise the
 *   machine stays on `cep_signed` with the decision attached, because the payment
 *   is held for a reason that is not the CEP.
 *
 * A decision a PERSON signed is deliberately not an end state. `POST /decide` is
 * the clerk's call and it is recorded as theirs; folding it in here would let the
 * verification claim credit for a release somebody else made.
 */
export function foldVerification(
  instruction: PaymentInstruction,
  supplier: Supplier | undefined,
  events: readonly LedgerEvent[],
  now: string,
): VerificationState {
  const state: VerificationState = {
    instructionId: instruction.id,
    state: "not_started",
    rail: null,
    claveRastreo: null,
    centSentAt: null,
    cepAt: null,
    sealState: null,
    holderName: null,
    legalName: supplier?.legalName ?? null,
    nameMatch: null,
    decision: null,
    updatedAt: now,
  };
  let newest: string | undefined;

  for (const event of events) {
    if (event.type === "cent_sent") {
      if (event.instructionId !== instruction.id) {
        continue;
      }
      state.state = atLeast(state.state, "cent_sent");
      state.rail = event.rail;
      state.claveRastreo = event.claveRastreo;
      state.centSentAt = event.at;
      newest = event.at;
      continue;
    }

    if (event.type === "cep_awaited") {
      if (event.instructionId !== instruction.id) {
        continue;
      }
      state.state = atLeast(state.state, "awaiting_cep");
      state.claveRastreo = event.claveRastreo;
      newest = event.at;
      continue;
    }

    if (event.type === "cep_verified") {
      if (!sameAccount(event.cep.beneficiaryAccount, instruction.clabe)) {
        continue;
      }
      state.state = atLeast(state.state, "cep_signed");
      state.cepAt = event.at;
      state.sealState = sealStateOf(event.cep);
      state.holderName = event.cep.beneficiaryName;
      state.nameMatch =
        supplier === undefined
          ? null
          : compareBeneficiaryName(
              event.cep.beneficiaryName,
              supplier.legalName,
            );
      newest = event.at;
      continue;
    }

    if (event.type !== "decision_made") {
      continue;
    }
    const { decision } = event;
    if (
      decision.instructionId !== instruction.id ||
      decision.decidedBy !== SYSTEM_DECIDER
    ) {
      continue;
    }
    const cepFinding = beneficiaryFindingOf(decision.findings);
    if (cepFinding === undefined) {
      continue;
    }
    state.decision = decision;
    state.state =
      cepFinding.severity === "critical"
        ? "blocked"
        : decision.action === "release"
          ? "released"
          : "cep_signed";
    newest = event.at;
  }

  if (newest !== undefined) {
    state.updatedAt = newest;
  }
  return state;
}

/** The finding control 5 wrote, which is the one this state machine turns on. */
function beneficiaryFindingOf(
  findings: readonly Finding[],
): Finding | undefined {
  return findings.find((finding) => finding.detector === "beneficiary_cep");
}

/**
 * The order of the machine, so a backdated event cannot walk it backwards.
 *
 * The ledger is append-ordered by instant and an event that arrives late is legal,
 * so "the last event wins" would let a `cep_awaited` stamped a second before a
 * `cep_verified` erase the CEP. The terminal states are set explicitly and are not
 * part of this ladder.
 */
const ORDER: readonly VerificationStateName[] = [
  "not_started",
  "cent_sent",
  "awaiting_cep",
  "cep_signed",
];

function atLeast(
  current: VerificationStateName,
  candidate: VerificationStateName,
): VerificationStateName {
  const here = ORDER.indexOf(current);
  const there = ORDER.indexOf(candidate);
  if (here === -1) {
    // Already released or blocked. Nothing earlier moves it.
    return current;
  }
  return there > here ? candidate : current;
}

function sameAccount(left: string, right: string): boolean {
  return left.replace(/\D+/g, "") === right.replace(/\D+/g, "");
}
