/**
 * The only place the web app talks to the API.
 *
 * Three rules hold this file together.
 *
 * 1. Requests go to a relative path. The Vite proxy handles development and the
 *    same build works wherever it is deployed, so there is no base URL to
 *    configure and no CORS story to debug.
 * 2. Failures are values, not exceptions. Every call resolves to an ApiResult,
 *    so a screen renders an error state instead of blanking out and no caller
 *    ever needs a try block.
 * 3. The shapes come from docs/09-api.md through src/lib/contract.ts, which
 *    composes the domain types in packages/core. The client never invents a
 *    field the contract does not have.
 * 4. Every write carries `X-Actor`. The API requires it and answers 400 naming
 *    the header without it, so the identity is attached here, once, rather than
 *    remembered at eleven call sites. `src/lib/actor.ts` holds the identity and
 *    says why it is not authentication.
 */

import type { LedgerEvent } from "@hackmty/core";
import { ACTOR_NAME_MAX_LENGTH } from "@hackmty/core";
import { useCallback, useEffect, useRef, useState } from "react";
import { currentActor } from "./actor";
import type {
  Actor,
  AssistantSession,
  BeneficiaryRegistry,
  CepVerification,
  CepVerifyBody,
  CreateInstructionBody,
  DecideBody,
  ExecuteRunBody,
  Health,
  InstructionDetail,
  LedgerPage,
  Metrics,
  PaymentExecution,
  PaymentExecutionLine,
  PaymentReceipt,
  PaymentRun,
  RailsStatus,
  SatLookup,
  SatPublishBody,
  SatVersions,
  SeedBody,
  SupplierDetail,
  SweepResult,
  VerificationScriptText,
  VerificationState,
  VerifyCallBody,
  VerifyCallResult,
  VerifyCallScript,
} from "./contract";
import { createSseDecoder, type SseFrame } from "./sse";

export const API_TIMEOUT_MS = 6000;
export const API_PREFIX = "/api/v1";
export const EVENTS_PATH = `${API_PREFIX}/events`;
export const ASSISTANT_MESSAGES_PATH = `${API_PREFIX}/assistant/messages`;

/**
 * The `X-Actor` header of every write, formatted the way docs/09-api.md reads it.
 *
 * Two keys separated by `;`, and `name` is the rest of its pair so a real name
 * needs no quoting. A name carrying a `;` is refused by the API rather than
 * truncated, so it is refused here too: a decision recorded under half a name is
 * worse than a request that did not go out, and the panel can say so before
 * anybody presses anything.
 */
export function formatActor(actor: Actor): string | null {
  const name = actor.name.trim();

  if (
    name === "" ||
    name.length > ACTOR_NAME_MAX_LENGTH ||
    name.includes(";")
  ) {
    return null;
  }

  return `role=${actor.role}; name=${name}`;
}

export type ApiFailure = {
  /** HTTP status, or 0 when the request never produced a response. */
  status: number;
  message: string;
  /** The requestId from the error envelope, when the API answered with one. */
  requestId?: string;
  /**
   * The parsed response body, kept because two routes answer a refusal that
   * carries something the screen needs: `/verify-call` puts the script the
   * clerk has to read next to its 422. Nothing else should read this; the
   * envelope is still the contract.
   */
  body?: unknown;
};

export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: ApiFailure };

export type RequestOptions = {
  signal?: AbortSignal;
  timeoutMs?: number;
  /**
   * Who is acting, sent as `X-Actor`. Every write in this product carries it and
   * the ledger event it appends records the name, because nothing here executes
   * without a person: docs/09-api.md "The actor on every write".
   *
   * It lives on the options rather than on each signature so that every write
   * already written gained the header without changing its arguments, and so a
   * read can never accidentally claim somebody acted.
   */
  actor?: Actor;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isAbortError(error: unknown): boolean {
  return isRecord(error) && error.name === "AbortError";
}

/** Pull the documented error envelope out of a failing response body. */
function failureFrom(status: number, body: unknown): ApiFailure {
  if (isRecord(body) && isRecord(body.error)) {
    const { code, message, requestId } = body.error;

    return {
      status,
      message:
        typeof message === "string"
          ? message
          : `The API answered with status ${status}.`,
      requestId:
        typeof requestId === "string"
          ? requestId
          : typeof code === "string"
            ? code
            : undefined,
      body,
    };
  }

  return { status, message: `The API answered with status ${status}.`, body };
}

type JsonInit = {
  method?: "GET" | "POST";
  body?: unknown;
};

/** The actor header, or nothing, so one expression builds every header bag. */
function actorHeaders(actor?: Actor): Record<string, string> {
  if (actor === undefined) {
    return {};
  }

  const value = formatActor(actor);

  return value === null ? {} : { "x-actor": value };
}

async function request(
  path: string,
  init: JsonInit = {},
  options: RequestOptions = {},
): Promise<ApiResult<unknown>> {
  const { signal, timeoutMs = API_TIMEOUT_MS, actor } = options;
  const controller = new AbortController();
  const forwardAbort = () => controller.abort();

  signal?.addEventListener("abort", forwardAbort, { once: true });

  let timedOut = false;
  const timer = window.setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  try {
    const method = init.method ?? "GET";
    /* The actor travels on every write and on no read. A GET that carried a name
       would be saying somebody did something when they only looked, and a write
       without one is refused by the API with a 400 naming the header, so the
       identity this browser is acting as stands in when a caller named nobody. */
    const headers: Record<string, string> = { accept: "application/json" };
    if (init.body !== undefined) {
      headers["content-type"] = "application/json";
    }
    if (method !== "GET") {
      Object.assign(headers, actorHeaders(actor ?? currentActor()));
    }

    const response = await fetch(path, {
      method,
      headers,
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: controller.signal,
    });

    /** A 204 has no body; everything else in this API answers JSON. */
    const payload =
      response.status === 204 ? null : await response.json().catch(() => null);

    if (!response.ok) {
      return { ok: false, error: failureFrom(response.status, payload) };
    }

    return { ok: true, data: payload };
  } catch (error) {
    if (timedOut) {
      return {
        ok: false,
        error: {
          status: 0,
          message: `The API did not answer within ${timeoutMs} ms.`,
        },
      };
    }

    if (isAbortError(error)) {
      return { ok: false, error: { status: 0, message: "Request cancelled." } };
    }

    return {
      ok: false,
      error: { status: 0, message: "The API is not reachable." },
    };
  } finally {
    window.clearTimeout(timer);
    signal?.removeEventListener("abort", forwardAbort);
  }
}

/**
 * Structural check at the boundary, not a full validator. It asserts the few
 * fields a screen indexes into, so a contract change shows up here as a clear
 * message instead of as `undefined` three components deep.
 *
 * TODO(garzario): if the contract starts moving, the honest fix is a shared
 * schema in packages/core that both sides import, not a bigger guard here.
 */
function shaped<T>(
  value: unknown,
  check: (record: Record<string, unknown>) => boolean,
  what: string,
): ApiResult<T> {
  if (!isRecord(value) || !check(value)) {
    return {
      ok: false,
      error: {
        status: 0,
        message: `The ${what} payload did not match the documented shape.`,
      },
    };
  }

  return { ok: true, data: value as T };
}

function andThen<T>(
  result: ApiResult<unknown>,
  parse: (value: unknown) => ApiResult<T>,
): ApiResult<T> {
  return result.ok ? parse(result.data) : result;
}

/* --------------------------------------------------------------------- read */

export function parseHealth(value: unknown): Health | null {
  if (!isRecord(value)) {
    return null;
  }

  const { ok, service, version } = value;

  if (
    typeof ok !== "boolean" ||
    typeof service !== "string" ||
    typeof version !== "string"
  ) {
    return null;
  }

  return { ok, service, version };
}

export async function getHealth(
  options?: RequestOptions,
): Promise<ApiResult<Health>> {
  const result = await request("/health", {}, options);

  if (!result.ok) {
    return result;
  }

  const health = parseHealth(result.data);

  if (!health) {
    return {
      ok: false,
      error: {
        status: 0,
        message: "The health payload did not match the documented shape.",
      },
    };
  }

  return { ok: true, data: health };
}

/** This week's payment run: rows, decisions, findings and totals. */
export async function getCurrentRun(
  options?: RequestOptions,
): Promise<ApiResult<PaymentRun>> {
  return andThen(
    await request(`${API_PREFIX}/run/current`, {}, options),
    (value) =>
      shaped<PaymentRun>(
        value,
        (run) => Array.isArray(run.items) && isRecord(run.totals),
        "payment run",
      ),
  );
}

/** Detail panel for one payment instruction. */
export async function getInstruction(
  id: string,
  options?: RequestOptions,
): Promise<ApiResult<InstructionDetail>> {
  return andThen(
    await request(
      `${API_PREFIX}/instructions/${encodeURIComponent(id)}`,
      {},
      options,
    ),
    (value) =>
      shaped<InstructionDetail>(
        value,
        (detail) =>
          isRecord(detail.instruction) && Array.isArray(detail.findings),
        "instruction",
      ),
  );
}

/** Everything the supplier drawer shows. */
export async function getSupplier(
  rfc: string,
  options?: RequestOptions,
): Promise<ApiResult<SupplierDetail>> {
  return andThen(
    await request(
      `${API_PREFIX}/suppliers/${encodeURIComponent(rfc)}`,
      {},
      options,
    ),
    (value) =>
      shaped<SupplierDetail>(
        value,
        (detail) => isRecord(detail.supplier) && Array.isArray(detail.cfdis),
        "supplier",
      ),
  );
}

/**
 * Read-only lookup over the official Article 69-B list. ADR-0002 keeps this
 * separate from the simulation on purpose: a real RFC is only ever typed in
 * here, and it never appears next to synthetic fraud evidence.
 */
export async function lookupSatRfc(
  rfc: string,
  options?: RequestOptions,
): Promise<ApiResult<SatLookup>> {
  return andThen(
    await request(
      `${API_PREFIX}/sat/lookup?rfc=${encodeURIComponent(rfc)}`,
      {},
      options,
    ),
    (value) =>
      shaped<SatLookup>(
        value,
        (lookup) =>
          typeof lookup.rfc === "string" &&
          Array.isArray(lookup.entries) &&
          typeof lookup.listed === "boolean",
        "SAT lookup",
      ),
  );
}

/** Which versions of the list are loaded, for the replay timeline. */
export async function getSatVersions(
  options?: RequestOptions,
): Promise<ApiResult<SatVersions>> {
  return andThen(
    await request(`${API_PREFIX}/sat/versions`, {}, options),
    (value) =>
      shaped<SatVersions>(
        value,
        (payload) => Array.isArray(payload.versions),
        "SAT versions",
      ),
  );
}

/** The per-company registry of beneficiaries verified with a CEP. */
export async function getBeneficiaries(
  options?: RequestOptions,
): Promise<ApiResult<BeneficiaryRegistry>> {
  return andThen(
    await request(`${API_PREFIX}/beneficiaries`, {}, options),
    (value) =>
      shaped<BeneficiaryRegistry>(
        value,
        (payload) => Array.isArray(payload.items),
        "beneficiary registry",
      ),
  );
}

/** Blind evaluation of the detectors, recomputed on demand. */
export async function getMetrics(
  options?: RequestOptions,
): Promise<ApiResult<Metrics>> {
  return andThen(await request(`${API_PREFIX}/metrics`, {}, options), (value) =>
    shaped<Metrics>(
      value,
      (metrics) =>
        typeof metrics.cases === "number" && isRecord(metrics.perDetector),
      "metrics",
    ),
  );
}

/** The append-only ledger, for the timeline and the replay. */
export async function getLedger(
  since?: string,
  options?: RequestOptions,
): Promise<ApiResult<LedgerPage>> {
  const query =
    since === undefined ? "" : `?since=${encodeURIComponent(since)}`;

  return andThen(
    await request(`${API_PREFIX}/ledger${query}`, {}, options),
    (value) =>
      shaped<LedgerPage>(value, (page) => Array.isArray(page.events), "ledger"),
  );
}

/**
 * What this run did on the payment rail, folded out of the ledger.
 *
 * A run nobody has executed answers `200` with no lines rather than a `404`, so an
 * empty result here is the review state of the screen and never an error. `current`
 * is accepted as the id, the same as everywhere else in this contract.
 */
export async function getRunExecution(
  runId: string,
  options?: RequestOptions,
): Promise<ApiResult<PaymentExecution>> {
  return andThen(
    await request(
      `${API_PREFIX}/run/${encodeURIComponent(runId)}/execution`,
      {},
      options,
    ),
    (value) =>
      shaped<PaymentExecution>(
        value,
        (execution) =>
          Array.isArray(execution.lines) && isRecord(execution.totals),
        "payment execution",
      ),
  );
}

/**
 * Which rails this server holds, so a screen can say which one is live without
 * reading an environment file it cannot see.
 *
 * No secret is in this payload and that is the whole reason it is its own
 * endpoint: `configured` says whether the variables exist and never what they
 * contain, and `live` is whether that rail has ever actually moved money from this
 * repository, which is what stops a screen claiming the production path has run.
 */
export async function getRails(
  options?: RequestOptions,
): Promise<ApiResult<RailsStatus>> {
  return andThen(await request(`${API_PREFIX}/rails`, {}, options), (value) =>
    shaped<RailsStatus>(
      value,
      (payload) => Array.isArray(payload.rails) && "active" in payload,
      "rails",
    ),
  );
}

/** The receipt of one payment, as JSON. `id` is the line's `receiptId`. */
export async function getPaymentReceipt(
  id: string,
  options?: RequestOptions,
): Promise<ApiResult<PaymentReceipt>> {
  return andThen(
    await request(
      `${API_PREFIX}/payments/${encodeURIComponent(id)}/receipt`,
      {},
      options,
    ),
    (value) =>
      shaped<PaymentReceipt>(
        value,
        (receipt) =>
          typeof receipt.claveRastreo === "string" &&
          typeof receipt.sealState === "string",
        "payment receipt",
      ),
  );
}

/**
 * One conversation of the assistant panel, projected from the
 * `assistant_message` events of that session id.
 *
 * A read, so it carries no actor: `AssistantSession.actor` is who opened the
 * conversation and it comes back on the payload, rather than being asserted by
 * whoever is asking for it.
 */
export async function getAssistantSession(
  id: string,
  options?: RequestOptions,
): Promise<ApiResult<AssistantSession>> {
  return andThen(
    await request(
      `${API_PREFIX}/assistant/sessions/${encodeURIComponent(id)}`,
      {},
      options,
    ),
    (value) =>
      shaped<AssistantSession>(
        value,
        (session) =>
          typeof session.id === "string" && Array.isArray(session.messages),
        "assistant session",
      ),
  );
}

/**
 * The constancia is a PDF, so it is a link and not a fetch.
 *
 * These build the href the anchor carries. Letting the browser navigate is what
 * makes the file open in the reader the judge already has, keeps the filename
 * the server chose, and costs no memory. Fetching the bytes into a blob would
 * cost all three and buy nothing.
 */
export function sweepConstanciaHref(listVersion: string): string {
  return `${API_PREFIX}/sat/constancia?listVersion=${encodeURIComponent(listVersion)}`;
}

export function runConstanciaHref(runId: string): string {
  return `${API_PREFIX}/run/${encodeURIComponent(runId)}/constancia`;
}

/** The same receipt as a PDF, which is the copy the accountant files. */
export function paymentReceiptHref(receiptId: string): string {
  return `${API_PREFIX}/payments/${encodeURIComponent(receiptId)}/receipt?format=pdf`;
}

/** The one-page evidence letter of one instruction, for a supplier who asks. */
export function instructionCartaHref(instructionId: string): string {
  return `${API_PREFIX}/instructions/${encodeURIComponent(instructionId)}/carta`;
}

/* -------------------------------------------------------------------- write */

/** Intake from the QR page. Runs the detectors and answers with the decision. */
export async function createInstruction(
  body: CreateInstructionBody,
  options?: RequestOptions,
): Promise<ApiResult<InstructionDetail>> {
  return andThen(
    await request(
      `${API_PREFIX}/instructions`,
      { method: "POST", body },
      options,
    ),
    (value) =>
      shaped<InstructionDetail>(
        value,
        (detail) =>
          isRecord(detail.instruction) && Array.isArray(detail.findings),
        "instruction",
      ),
  );
}

/** A person confirms hold, verify or release. Appends decision_made. */
export async function decideInstruction(
  id: string,
  body: DecideBody,
  options?: RequestOptions,
): Promise<ApiResult<InstructionDetail>> {
  return andThen(
    await request(
      `${API_PREFIX}/instructions/${encodeURIComponent(id)}/decide`,
      { method: "POST", body },
      options,
    ),
    (value) =>
      shaped<InstructionDetail>(
        value,
        (detail) => isRecord(detail.decision) || isRecord(detail.instruction),
        "decision",
      ),
  );
}

/** Loads or simulates a list version and runs the retroactive sweep. */
export async function publishSatList(
  body: SatPublishBody,
  options?: RequestOptions,
): Promise<ApiResult<SweepResult>> {
  return andThen(
    await request(
      `${API_PREFIX}/sat/publish`,
      { method: "POST", body },
      options,
    ),
    (value) =>
      shaped<SweepResult>(
        value,
        (sweep) =>
          Array.isArray(sweep.newlyListed) &&
          typeof sweep.totalExposure === "number",
        "sweep result",
      ),
  );
}

/** Fetches or accepts a CEP, validates the signature, compares the name. */
export async function verifyCep(
  body: CepVerifyBody,
  options?: RequestOptions,
): Promise<ApiResult<CepVerification>> {
  return andThen(
    await request(
      `${API_PREFIX}/cep/verify`,
      { method: "POST", body },
      options,
    ),
    (value) =>
      shaped<CepVerification>(
        value,
        (verification) =>
          isRecord(verification.cep) &&
          typeof verification.nameMatch === "string",
        "CEP verification",
      ),
  );
}

/** The shape check both verification routes share. */
function shapedVerification(value: unknown): ApiResult<VerificationState> {
  return shaped<VerificationState>(
    value,
    (state) =>
      typeof state.instructionId === "string" &&
      typeof state.state === "string",
    "verification",
  );
}

/**
 * Sends the one-cent probe for one instruction and answers with how far the
 * pipeline got before the response had to be written.
 *
 * There is no body: the instruction already knows its supplier, its account and
 * its amount, and a rail that took an account from a caller would be a rail
 * that can be pointed anywhere. The 202 is the state machine, not a promise:
 * `cent_sent` means the cent left, `awaiting_cep` means Banxico has not
 * published the CEP yet, and the rest of the beat arrives over the ledger
 * stream.
 */
export async function verifyAccount(
  id: string,
  options?: RequestOptions,
): Promise<ApiResult<VerificationState>> {
  return andThen(
    await request(
      `${API_PREFIX}/instructions/${encodeURIComponent(id)}/verify-account`,
      { method: "POST" },
      options,
    ),
    shapedVerification,
  );
}

/** Where the one-cent verification of this instruction has got to. */
export async function getVerification(
  id: string,
  options?: RequestOptions,
): Promise<ApiResult<VerificationState>> {
  return andThen(
    await request(
      `${API_PREFIX}/instructions/${encodeURIComponent(id)}/verification`,
      {},
      options,
    ),
    shapedVerification,
  );
}

/**
 * The script for one instruction. Reading it rings nobody and writes nothing,
 * which is what lets the page show a clerk the words before anything happens.
 */
export async function getVerifyCallScript(
  id: string,
  options?: RequestOptions,
): Promise<ApiResult<VerifyCallScript>> {
  return andThen(
    await request(
      `${API_PREFIX}/instructions/${encodeURIComponent(id)}/verify-call`,
      {},
      options,
    ),
    (value) =>
      shaped<VerifyCallScript>(
        value,
        (payload) => isRecord(payload.script),
        "verification script",
      ),
  );
}

/**
 * The verification call to the supplier.
 *
 * Three bodies, one endpoint: ring the supplier, collect a call that already
 * happened, or record one a person made by hand. The answer never releases the
 * payment; the release stays `decideInstruction` with a name on it.
 */
export async function verifyCall(
  id: string,
  body: VerifyCallBody,
  options?: RequestOptions,
): Promise<ApiResult<VerifyCallResult>> {
  return andThen(
    await request(
      `${API_PREFIX}/instructions/${encodeURIComponent(id)}/verify-call`,
      { method: "POST", body },
      options,
    ),
    (value) =>
      shaped<VerifyCallResult>(
        value,
        (result) =>
          typeof result.status === "string" && isRecord(result.script),
        "verification call",
      ),
  );
}

/**
 * The script out of a refusal.
 *
 * When the voice integration is not configured the API answers 422 and puts the
 * words the clerk has to say next to the envelope, so the page can show them
 * instead of only reporting that nothing worked.
 */
export function scriptFromFailure(
  failure: ApiFailure,
): VerificationScriptText | null {
  const body = failure.body;

  if (!isRecord(body) || !isRecord(body.script)) {
    return null;
  }

  const { firstMessage, question, clabeLast4, spoken } = body.script;

  if (
    typeof firstMessage !== "string" ||
    typeof question !== "string" ||
    typeof clabeLast4 !== "string" ||
    !Array.isArray(spoken)
  ) {
    return null;
  }

  return {
    firstMessage,
    question,
    clabeLast4,
    spoken: spoken.filter((line): line is string => typeof line === "string"),
  };
}

/** Regenerates the demo company. Development only, guarded by ALLOW_SEED=1. */
export async function reseed(
  body: SeedBody = {},
  options?: RequestOptions,
): Promise<ApiResult<unknown>> {
  return request(`${API_PREFIX}/seed`, { method: "POST", body }, options);
}

/* ---------------------------------------------------------------- streaming */

/**
 * A POST that answers `text/event-stream`, frame by frame.
 *
 * `EventSource` cannot do this: it only issues a GET, and three endpoints of this
 * API stream a reply to a POST because each of them is one piece of work the
 * caller started and is waiting on. So the response body is read here and
 * `createSseDecoder` turns the chunks into frames. This function knows nothing
 * about the assistant: it moves frames, and `lib/assistant.ts` is what decides
 * what a frame means, which is what keeps the contract check testable with no
 * network in it.
 *
 * The timeout deliberately covers only the wait for the headers. A six second
 * ceiling is right for a JSON route and wrong for a stream, where the whole point
 * is that the answer arrives over time: a server that never responds still fails
 * fast, and a server that is answering is never cut off mid-sentence. Cancelling
 * is the caller's `signal`, which is what the close button uses.
 */
export type SseStreamInit = {
  method: "POST";
  /** A `FormData` for the multipart form, or a JSON value for the other one. */
  body?: BodyInit;
  json?: unknown;
};

export async function streamSse(
  path: string,
  init: SseStreamInit,
  onFrame: (frame: SseFrame) => void,
  options: RequestOptions = {},
): Promise<ApiResult<void>> {
  const { signal, timeoutMs = API_TIMEOUT_MS, actor } = options;
  const controller = new AbortController();
  const forwardAbort = () => controller.abort();

  signal?.addEventListener("abort", forwardAbort, { once: true });

  let timedOut = false;
  let timer: number | undefined = window.setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  const clearHeaderTimeout = () => {
    if (timer !== undefined) {
      window.clearTimeout(timer);
      timer = undefined;
    }
  };

  try {
    const json = init.json !== undefined;
    const response = await fetch(path, {
      method: init.method,
      headers: {
        accept: "text/event-stream",
        ...(json ? { "content-type": "application/json" } : {}),
        ...actorHeaders(actor),
      },
      body: json ? JSON.stringify(init.json) : init.body,
      signal: controller.signal,
    });

    clearHeaderTimeout();

    if (!response.ok) {
      /* A refusal is JSON even on a route that answers a stream, which is what
         lets the panel show the 422 naming the variable this server lacks. */
      const payload = await response.json().catch(() => null);

      return { ok: false, error: failureFrom(response.status, payload) };
    }

    const body = response.body;

    if (!body) {
      return {
        ok: false,
        error: {
          status: response.status,
          message: "This browser cannot read a streamed response.",
        },
      };
    }

    const reader = body.getReader();
    const decoder = new TextDecoder();
    const frames = createSseDecoder();

    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      for (const frame of frames.push(
        decoder.decode(value, { stream: true }),
      )) {
        onFrame(frame);
      }
    }

    for (const frame of frames.flush()) {
      onFrame(frame);
    }

    return { ok: true, data: undefined };
  } catch (error) {
    if (timedOut) {
      return {
        ok: false,
        error: {
          status: 0,
          message: `The API did not answer within ${timeoutMs} ms.`,
        },
      };
    }

    if (isAbortError(error)) {
      return { ok: false, error: { status: 0, message: "Request cancelled." } };
    }

    return {
      ok: false,
      error: { status: 0, message: "The stream was cut before it finished." },
    };
  } finally {
    clearHeaderTimeout();
    signal?.removeEventListener("abort", forwardAbort);
  }
}

export type EventsStatus = "connecting" | "open" | "closed" | "unsupported";

export type UseEventsOptions = {
  /** Set false to leave the stream closed, for a screen that does not need it. */
  enabled?: boolean;
  /** How many events to keep in memory. The ledger is unbounded; this is not. */
  limit?: number;
  /** Called for every ledger event, in arrival order. */
  onEvent?: (event: LedgerEvent) => void;
};

export type UseEvents = {
  status: EventsStatus;
  /** Most recent last, capped at `limit`. */
  events: LedgerEvent[];
  lastEventAt: Date | null;
  /** Reopen after the stream closed, for the retry button. */
  reconnect: () => void;
};

function parseLedgerEvent(raw: string): LedgerEvent | null {
  try {
    const value: unknown = JSON.parse(raw);

    return isRecord(value) && typeof value.type === "string"
      ? (value as LedgerEvent)
      : null;
  } catch {
    return null;
  }
}

/**
 * Subscribes to `GET /api/v1/events`, the Server-Sent Events stream that pushes
 * every appended LedgerEvent as `event: ledger`.
 *
 * The browser reconnects an EventSource by itself, which turns into a hot retry
 * loop while the API is down. This closes the stream on the first error and
 * exposes `reconnect`, so a screen can offer a button instead of hammering a
 * dead port during a demo.
 */
export function useEvents(options: UseEventsOptions = {}): UseEvents {
  const { enabled = true, limit = 50 } = options;
  const [status, setStatus] = useState<EventsStatus>(
    enabled ? "connecting" : "closed",
  );
  const [events, setEvents] = useState<LedgerEvent[]>([]);
  const [lastEventAt, setLastEventAt] = useState<Date | null>(null);
  const [attempt, setAttempt] = useState(0);

  /** Held in a ref so a new callback identity does not reopen the stream. */
  const onEventRef = useRef(options.onEvent);
  onEventRef.current = options.onEvent;

  const reconnect = useCallback(() => {
    setAttempt((value) => value + 1);
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: `attempt` is the retrigger for reconnect(); it is deliberately unused in the body
  useEffect(() => {
    if (!enabled) {
      setStatus("closed");

      return;
    }

    if (typeof EventSource === "undefined") {
      setStatus("unsupported");

      return;
    }

    const source = new EventSource(EVENTS_PATH);
    setStatus("connecting");

    const onOpen = () => setStatus("open");

    const onLedger = (message: MessageEvent<string>) => {
      const event = parseLedgerEvent(message.data);

      if (!event) {
        return;
      }

      setEvents((current) => [...current, event].slice(-limit));
      setLastEventAt(new Date());
      onEventRef.current?.(event);
    };

    const onError = () => {
      source.close();
      setStatus("closed");
    };

    source.addEventListener("open", onOpen);
    source.addEventListener("ledger", onLedger as EventListener);
    source.addEventListener("error", onError);

    return () => {
      source.removeEventListener("open", onOpen);
      source.removeEventListener("ledger", onLedger as EventListener);
      source.removeEventListener("error", onError);
      source.close();
    };
  }, [enabled, limit, attempt]);

  return { status, events, lastEventAt, reconnect };
}

/* ------------------------------------------------------ the payment run out */

/** The two event names `POST /run/:id/execute` writes, from docs/09-api.md. */
export const EXECUTE_LINE_EVENT = "line";
export const EXECUTE_DONE_EVENT = "done";

export type ExecuteRunHandlers = {
  /** Every `line` event, in arrival order, as the rail answered it. */
  onLine?: (line: PaymentExecutionLine) => void;
};

/**
 * The payment run leaving on the configured rail.
 *
 * It rides `streamSse` like the assistant turn does, for the same reason that
 * function exists: `EventSource` only issues a GET and this stream starts with a
 * body and a header, `confirm: true` and a valid `X-Actor`, both required and
 * neither optional. What this function adds on top is the meaning of a frame: a
 * `line` is one payment the rail answered for, a `done` carries the whole
 * `PaymentExecution`, and nothing else is read.
 *
 * Three things it deliberately does not do.
 *
 * It **never retries**. A retried execute is a second request to move money, and
 * the endpoint is idempotent per instruction precisely so that a person can decide
 * to press the button again rather than a client deciding for them.
 *
 * It **reports a refusal as a value**, like the rest of this file. A `503` from a
 * server with no rail, a `409` naming a line the decisions stop and a `403` for a
 * role that may not execute all arrive as an `ApiFailure` carrying the message the
 * API wrote, and nothing was appended to the ledger for any of them.
 *
 * It **refuses to send with no name on it**. `formatActor` answers null for an
 * empty name or one carrying a `;`, and this stops before the request rather than
 * letting the API reject it, because the screen can say so before anybody presses
 * anything.
 */
export async function executeRun(
  runId: string,
  body: ExecuteRunBody,
  actor: Actor,
  handlers: ExecuteRunHandlers = {},
  options: RequestOptions = {},
): Promise<ApiResult<PaymentExecution>> {
  if (formatActor(actor) === null) {
    return {
      ok: false,
      error: {
        status: 0,
        message:
          "Falta el nombre de quien envia la corrida, o trae un punto y coma. Nada sale sin una persona detras.",
      },
    };
  }

  let execution: PaymentExecution | null = null;

  const result = await streamSse(
    `${API_PREFIX}/run/${encodeURIComponent(runId)}/execute`,
    { method: "POST", json: body },
    (frame) => {
      const parsed: unknown = parseJson(frame.data);

      if (!isRecord(parsed)) {
        return;
      }

      if (frame.event === EXECUTE_LINE_EVENT) {
        if (
          typeof parsed.instructionId === "string" &&
          typeof parsed.state === "string"
        ) {
          handlers.onLine?.(parsed as unknown as PaymentExecutionLine);
        }

        return;
      }

      if (
        frame.event === EXECUTE_DONE_EVENT &&
        Array.isArray(parsed.lines) &&
        isRecord(parsed.totals)
      ) {
        execution = parsed as unknown as PaymentExecution;
      }
    },
    { ...options, actor },
  );

  if (!result.ok) {
    return result;
  }

  if (execution === null) {
    return {
      ok: false,
      error: {
        status: 0,
        message:
          "El flujo termino sin el resumen de la corrida. Vuelve a leer la ejecucion antes de concluir nada.",
      },
    };
  }

  return { ok: true, data: execution };
}

function parseJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
