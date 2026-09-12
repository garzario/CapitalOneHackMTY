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
 */

import type { LedgerEvent } from "@hackmty/core";
import { useCallback, useEffect, useRef, useState } from "react";
import type {
  BeneficiaryRegistry,
  CepVerification,
  CepVerifyBody,
  CreateInstructionBody,
  DecideBody,
  Health,
  InstructionDetail,
  LedgerPage,
  Metrics,
  PaymentRun,
  SatLookup,
  SatPublishBody,
  SatVersions,
  SeedBody,
  SupplierDetail,
  SweepResult,
  VerificationScriptText,
  VerifyCallBody,
  VerifyCallResult,
  VerifyCallScript,
} from "./contract";

export const API_TIMEOUT_MS = 6000;
export const API_PREFIX = "/api/v1";
export const EVENTS_PATH = `${API_PREFIX}/events`;

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

async function request(
  path: string,
  init: JsonInit = {},
  options: RequestOptions = {},
): Promise<ApiResult<unknown>> {
  const { signal, timeoutMs = API_TIMEOUT_MS } = options;
  const controller = new AbortController();
  const forwardAbort = () => controller.abort();

  signal?.addEventListener("abort", forwardAbort, { once: true });

  let timedOut = false;
  const timer = window.setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  try {
    const response = await fetch(path, {
      method: init.method ?? "GET",
      headers:
        init.body === undefined
          ? { accept: "application/json" }
          : { accept: "application/json", "content-type": "application/json" },
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
