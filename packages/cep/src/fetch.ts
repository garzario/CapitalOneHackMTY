/**
 * Retrieval of a CEP from the public Banxico portal.
 *
 * The portal is a two-step form, not an API. A POST to `valida.do` establishes a
 * session for one transfer and answers with an HTML page, and a GET to
 * `descarga.do?formato=XML` on that same session returns the signed XML. The
 * session lives in a cookie, so the two calls have to share one, which is why
 * this module reads `set-cookie` instead of relying on a cookie jar.
 *
 * Four things to know before wiring this into anything that runs unattended:
 *
 * 1. There is no documented API and no contract. Banxico can change the form at
 *    any time and owes us nothing.
 * 2. The portal shows a CAPTCHA and rate-limits by address. A run that trips the
 *    limit gets an HTML page, which this module reports as `rate_limited` rather
 *    than retrying. Retrying into a rate limit on a public service is the wrong
 *    behaviour, so there is deliberately no retry loop here.
 * 3. Because of 1 and 2, the product's primary path is the one in docs/09-api.md:
 *    the clerk pastes the XML their own bank handed them, and `parseCep` takes it
 *    from there. This function is the convenience path, not the demo path.
 * 4. `http` is injectable and the test suite only ever passes a stub. Nothing in
 *    `bun test` touches the network or the Banxico portal.
 */

import type { Cep } from "@hackmty/core";
import { parseCep } from "./parse";

export const CEP_BASE_URL = "https://www.banxico.org.mx/cep";

/** Only the part of `fetch` this module uses, so a test stub is three lines. */
export type HttpLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface CepQuery {
  /** Date of the transfer, ISO YYYY-MM-DD. The portal wants DD-MM-YYYY. */
  date: string;
  claveRastreo: string;
  /** Clave SPEI of the sending participant, the five-digit code. */
  senderBank: string;
  /** Clave SPEI of the receiving participant. */
  receiverBank: string;
  /** Beneficiary CLABE, debit card or phone number, as the instruction printed it. */
  beneficiaryAccount: string;
  /** Amount in MXN major units, matching the rest of the domain. */
  amount: number;
  /**
   * True when the money went to the receiving bank itself rather than to a
   * customer of it. The portal validates the two cases differently.
   */
  toBank?: boolean;
}

export interface FetchCepOptions {
  baseUrl?: string;
  /** Per-request timeout in milliseconds. 0 disables it. */
  timeoutMs?: number;
  /** Marks the result as synthetic. Only a fake portal in a test sets this. */
  synthetic?: boolean;
}

export type CepFetchErrorCode =
  /** The portal refused because this address has consulted too often. */
  | "rate_limited"
  /** No transfer matches the criteria given. */
  | "not_found"
  /** SPEI has no payment order matching the criteria. */
  | "no_payment_order"
  /** The payment exists but its CEP is not available yet. */
  | "cep_unavailable"
  /** The portal answered with a status we cannot act on. */
  | "http_error"
  /** The download answered with something that is not a CEP. */
  | "not_a_cep"
  /** The query itself is malformed, caught before any request is made. */
  | "bad_query";

export class CepFetchError extends Error {
  readonly code: CepFetchErrorCode;
  /** Portal response text, truncated. Useful in a PR, useless to a clerk. */
  readonly detail: string;

  constructor(code: CepFetchErrorCode, message: string, detail = "") {
    super(message);
    this.name = "CepFetchError";
    this.code = code;
    this.detail = detail;
  }
}

/**
 * Sentences the portal puts in the HTML instead of a status code.
 *
 * They are matched accent-insensitively and case-insensitively, because the page
 * is served in a legacy encoding and a mis-decoded accent must not turn a rate
 * limit into an unexplained failure.
 */
const PORTAL_SENTINELS: ReadonlyArray<[CepFetchErrorCode, string, string]> = [
  [
    "rate_limited",
    "ha excedido el numero maximo de consultas",
    "the Banxico portal rate-limited this address",
  ],
  [
    "not_found",
    "no se encontro ningun pago con la informacion proporcionada",
    "no SPEI transfer matches the criteria given",
  ],
  [
    "no_payment_order",
    "el spei no ha recibido una orden de pago",
    "SPEI has no payment order matching the criteria given",
  ],
  [
    "cep_unavailable",
    "con la informacion proporcionada se identifico el siguiente pago",
    "the payment was identified but its CEP is not available",
  ],
];

const MAX_DETAIL = 400;

/** Folds accents and case so a sentinel matches whatever encoding arrived. */
export function foldForMatching(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .toLowerCase();
}

/**
 * Turns a portal page into the error it describes, or undefined when the page
 * carries no known sentinel.
 */
export function classifyPortalResponse(
  body: string,
): CepFetchError | undefined {
  const folded = foldForMatching(body);
  for (const [code, sentinel, message] of PORTAL_SENTINELS) {
    if (folded.includes(sentinel)) {
      return new CepFetchError(code, message, body.slice(0, MAX_DETAIL));
    }
  }
  return undefined;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** ISO YYYY-MM-DD to the DD-MM-YYYY the form expects. */
export function portalDate(isoDate: string): string {
  if (!ISO_DATE.test(isoDate)) {
    throw new CepFetchError(
      "bad_query",
      `date "${isoDate}" is not ISO YYYY-MM-DD`,
    );
  }
  const [year, month, day] = isoDate.split("-");
  return `${day}-${month}-${year}`;
}

/**
 * The form body for `valida.do`.
 *
 * `tipoCriterio` T selects the clave de rastreo, `tipoConsulta` 1 the transfer
 * consultation, and `captcha` is the field the portal's own form posts. Exported
 * so the shape can be asserted in a test without a request going anywhere.
 */
export function buildValidaForm(params: CepQuery): URLSearchParams {
  if (params.claveRastreo.trim() === "") {
    throw new CepFetchError("bad_query", "claveRastreo is required");
  }
  if (!Number.isFinite(params.amount) || params.amount <= 0) {
    throw new CepFetchError(
      "bad_query",
      `amount ${params.amount} is not a positive amount`,
    );
  }
  return new URLSearchParams({
    tipoCriterio: "T",
    captcha: "c",
    tipoConsulta: "1",
    fecha: portalDate(params.date),
    criterio: params.claveRastreo.trim(),
    emisor: params.senderBank.trim(),
    receptor: params.receiverBank.trim(),
    cuenta: params.beneficiaryAccount.trim(),
    monto: params.amount.toFixed(2),
    receptorParticipante: params.toBank === true ? "1" : "0",
  });
}

/** Collects the session cookies a response set, without a cookie jar. */
export function sessionCookieHeader(response: Response): string | undefined {
  const headers = response.headers as Headers & {
    getSetCookie?: () => string[];
  };
  const raw =
    typeof headers.getSetCookie === "function"
      ? headers.getSetCookie()
      : [headers.get("set-cookie") ?? ""];
  const pairs = raw
    .filter((cookie) => cookie !== "")
    .map((cookie) => cookie.split(";")[0]?.trim() ?? "")
    .filter((cookie) => cookie !== "");
  return pairs.length > 0 ? pairs.join("; ") : undefined;
}

function requestInit(
  method: "GET" | "POST",
  cookie: string | undefined,
  timeoutMs: number,
  body?: URLSearchParams,
): RequestInit {
  const headers: Record<string, string> = {
    /** We identify ourselves rather than impersonating a browser. */
    "user-agent": "SentryOne/0.1",
    accept: "*/*",
  };
  if (cookie !== undefined) {
    headers.cookie = cookie;
  }
  if (body !== undefined) {
    headers["content-type"] = "application/x-www-form-urlencoded";
  }
  const init: RequestInit = { method, headers };
  if (body !== undefined) {
    init.body = body.toString();
  }
  if (timeoutMs > 0) {
    init.signal = AbortSignal.timeout(timeoutMs);
  }
  return init;
}

/**
 * Fetches one CEP from the Banxico portal and parses it.
 *
 * `http` is the only way this module reaches the network, so a caller that passes
 * a stub gets a fully offline run. It is not called anywhere in the test suite
 * with a real fetch.
 */
export async function fetchCep(
  params: CepQuery,
  http: HttpLike,
  options: FetchCepOptions = {},
): Promise<Cep> {
  const baseUrl = (options.baseUrl ?? CEP_BASE_URL).replace(/\/+$/, "");
  const timeoutMs = options.timeoutMs ?? 15_000;
  const form = buildValidaForm(params);

  const validate = await http(
    `${baseUrl}/valida.do`,
    requestInit("POST", undefined, timeoutMs, form),
  );
  const validateBody = await validate.text();
  if (!validate.ok) {
    throw new CepFetchError(
      "http_error",
      `the Banxico portal answered ${validate.status} to valida.do`,
      validateBody.slice(0, MAX_DETAIL),
    );
  }
  const portalError = classifyPortalResponse(validateBody);
  if (portalError !== undefined) {
    throw portalError;
  }

  const cookie = sessionCookieHeader(validate);
  const download = await http(
    `${baseUrl}/descarga.do?formato=XML`,
    requestInit("GET", cookie, timeoutMs),
  );
  const xml = await download.text();
  if (!download.ok) {
    throw new CepFetchError(
      "http_error",
      `the Banxico portal answered ${download.status} to descarga.do`,
      xml.slice(0, MAX_DETAIL),
    );
  }
  const downloadError = classifyPortalResponse(xml);
  if (downloadError !== undefined) {
    throw downloadError;
  }
  if (!xml.includes("SPEI_Tercero")) {
    throw new CepFetchError(
      "not_a_cep",
      "descarga.do did not return a CEP document",
      xml.slice(0, MAX_DETAIL),
    );
  }

  return parseCep(xml, { synthetic: options.synthetic ?? false });
}
