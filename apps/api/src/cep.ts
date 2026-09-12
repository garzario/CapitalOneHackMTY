/**
 * The seam between `POST /api/v1/cep/verify` and `@hackmty/cep`.
 *
 * The package owns all four steps of the CEP (retrieve, parse, check the seal,
 * compare the name) and this file owns none of them. What it adds is the three
 * decisions a transport layer has to make, and it makes them in one place so the
 * route handler stays four lines of plumbing:
 *
 * 1. **A pasted CEP is always accepted.** `accept` needs no key, no certificate
 *    and no network, so the primary path in docs/09-api.md works on a laptop with
 *    an empty `.env`. It is also the path the demo uses.
 * 2. **Retrieval from Banxico is opt-in.** The portal is an undocumented form
 *    behind a CAPTCHA and an address rate limit, and `packages/cep` says so at
 *    the top of `fetch.ts`. A deployed API that POSTs to a public government
 *    service on every click is worse for the demo and worse for the service, so
 *    it is off unless `ALLOW_CEP_FETCH=1`, exactly as seeding is off unless
 *    `ALLOW_SEED=1`. What it is never allowed to become is a lookup over other
 *    people's payments, which is the product rule in docs/06 section 6.4: the
 *    query the portal needs is the clave de rastreo, both participants, the
 *    account and the amount to the centavo, so only a party to the transfer can
 *    build one, and this module accepts no broader query than that.
 * 3. **The seal is checked when, and only when, a certificate is configured.**
 *    The CEP carries the serial of the Banxico certificate and not the
 *    certificate itself, so `verifySignature` has to be handed one out of band.
 *    With none, the document keeps the `not_checked` that `parseCep` puts on it.
 *    What never happens is a `signatureValid: true` nobody earned: that would be
 *    the single most expensive lie in this repository.
 *
 * Everything is injected through `ApiDeps`, like the extractor next door, so the
 * whole suite runs this path with no key, no certificate and no network.
 */

import {
  CepFetchError,
  CepParseError,
  type CepQuery,
  fetchCep,
  type HttpLike,
  parseCep,
  verifySignature,
} from "@hackmty/cep";
import type { Cep } from "@hackmty/core";
import type { Read } from "./extraction";

export interface CepSource {
  /** True when this server may reach the Banxico portal at all. */
  readonly canRetrieve: boolean;
  /** True when this server holds a certificate, so a seal can be checked. */
  readonly canCheckSeal: boolean;
  /** A CEP a person pasted. Parsed, then checked as far as this server can. */
  accept(xml: string): Read<Cep>;
  /** A CEP from the Banxico portal, checked the same way. */
  retrieve(query: CepQuery): Promise<Read<Cep>>;
}

/**
 * What a caller is told when this server was not given a way to reach Banxico.
 *
 * It names the flag and the package rather than just refusing, because the clerk
 * standing in front of the screen has a second way in and needs to be told what
 * it is.
 */
export const NO_RETRIEVAL =
  "No signed CEP is available for this transfer yet, and Banxico retrieval is off on this server (ALLOW_CEP_FETCH=1 turns it on, see packages/cep). Paste the signed XML in `xml` instead.";

function readEnv(name: string): string | undefined {
  const holder = globalThis as {
    process?: { env?: Record<string, string | undefined> };
  };
  const value = holder.process?.env?.[name];

  return value === undefined || value.trim() === "" ? undefined : value.trim();
}

/**
 * A PEM out of an environment variable.
 *
 * An `.env` line holds one line, so a PEM arrives with its newlines escaped.
 * Both forms are accepted because both are what people actually paste.
 */
export function readCertificate(
  raw = readEnv("BANXICO_CEP_CERT_PEM"),
): string | undefined {
  return raw === undefined ? undefined : raw.replace(/\\n/g, "\n");
}

/**
 * Sets `signatureValid` and `signatureReason` from an actual check.
 *
 * With no certificate the CEP is returned untouched, which means it keeps the
 * `signatureValid: false` and `signatureReason: "not_checked"` that `parseCep`
 * wrote. The engine reads `not_checked` as "not verified" and never as
 * "invalid"; `UNPROVEN_SEAL_REASONS` in `packages/engine/src/beneficiary.ts` is
 * the other half of that promise.
 */
export function checkSeal(cep: Cep, certificatePem?: string): Cep {
  if (certificatePem === undefined) {
    return cep;
  }

  const result = verifySignature(cep.xml, certificatePem);

  return {
    ...cep,
    signatureValid: result.valid,
    signatureReason: result.reason,
    ...(result.numeroCertificado === undefined
      ? {}
      : { numeroCertificado: result.numeroCertificado }),
  };
}

/** Turns a parse failure into the sentence the clerk reads. Never a throw. */
function acceptXml(xml: string, certificatePem?: string): Read<Cep> {
  try {
    return { ok: true, value: checkSeal(parseCep(xml), certificatePem) };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof CepParseError
          ? `That is not a CEP this server can read: ${error.message}`
          : "That is not a CEP this server can read.",
    };
  }
}

/**
 * The portal's own failures, as sentences.
 *
 * `CepFetchError.detail` is deliberately dropped: it is a slice of the portal's
 * HTML page, it is useful in a pull request and it is the sort of thing that
 * ends up pasted into a chat, so only our own sentence goes on the wire.
 */
function retrievalMessage(error: CepFetchError): string {
  switch (error.code) {
    case "rate_limited":
      return "The Banxico portal rate-limited this address. Download the CEP from banxico.org.mx/cep and paste the XML in `xml`.";
    case "not_found":
      return "Banxico has no SPEI transfer matching those details. Check the date, the amount and the clave de rastreo against the bank statement.";
    case "no_payment_order":
      return "SPEI holds no payment order for those details yet.";
    case "cep_unavailable":
      return "Banxico found the payment and its CEP is not available yet. A CEP is published once the transfer settles.";
    case "bad_query":
      return `Those details cannot be sent to the Banxico portal: ${error.message}`;
    default:
      return "The Banxico portal could not be reached right now. Download the CEP from banxico.org.mx/cep and paste the XML in `xml`.";
  }
}

/** The source a server with no retrieval flag gets. `accept` still works. */
export function acceptOnlyCepSource(certificatePem?: string): CepSource {
  return {
    canRetrieve: false,
    canCheckSeal: certificatePem !== undefined,
    accept: (xml) => acceptXml(xml, certificatePem),
    retrieve: async () => ({ ok: false, message: NO_RETRIEVAL }),
  };
}

export interface CepSourceOptions {
  /** Defaults to the global `fetch`. A test passes a stub and stays offline. */
  http?: HttpLike;
  /** Defaults to `ALLOW_CEP_FETCH=1`. */
  allowRetrieval?: boolean;
  /** Defaults to `BANXICO_CEP_CERT_PEM`. */
  certificatePem?: string;
}

/**
 * The CEP source this process boots with.
 *
 * The environment is read once, at wiring time, so a request can never be the
 * thing that discovers the server is misconfigured. That is the same rule
 * `createExtractor` follows next door.
 */
export function createCepSource(options: CepSourceOptions = {}): CepSource {
  const certificatePem = options.certificatePem ?? readCertificate();
  const allowRetrieval =
    options.allowRetrieval ?? readEnv("ALLOW_CEP_FETCH") === "1";

  if (!allowRetrieval) {
    return acceptOnlyCepSource(certificatePem);
  }

  const http = options.http ?? fetch;

  return {
    canRetrieve: true,
    canCheckSeal: certificatePem !== undefined,
    accept: (xml) => acceptXml(xml, certificatePem),
    retrieve: async (query) => {
      try {
        return {
          ok: true,
          value: checkSeal(await fetchCep(query, http), certificatePem),
        };
      } catch (error) {
        if (error instanceof CepFetchError) {
          return { ok: false, message: retrievalMessage(error) };
        }
        if (error instanceof CepParseError) {
          return {
            ok: false,
            message: `The Banxico portal answered something this server cannot read as a CEP: ${error.message}`,
          };
        }
        /* A dead network throws a TypeError and the timeout throws an
           AbortError. Neither is a sentence for a clerk. */
        return {
          ok: false,
          message:
            "The Banxico portal could not be reached right now. Download the CEP from banxico.org.mx/cep and paste the XML in `xml`.",
        };
      }
    },
  };
}
