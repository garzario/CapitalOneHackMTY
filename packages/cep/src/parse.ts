/**
 * Reads a Banxico CEP (Comprobante Electronico de Pago) XML into the `Cep`
 * domain type.
 *
 * Field names are taken from the SAT `Complemento_SPEI` schema, which is the
 * published schema for this exact document, and every one of them was then seen
 * on a production CEP downloaded from the Banxico portal. The sources are listed
 * in packages/cep/README.md. Nothing here is guessed; anything still unconfirmed
 * is named as unconfirmed in the README rather than quietly assumed.
 *
 * The document is flat:
 *
 *   <SPEI_Tercero FechaOperacion Hora ClaveSPEI sello numeroCertificado
 *                 cadenaCDA claveRastreo>
 *     <Beneficiario BancoReceptor Nombre TipoCuenta Cuenta RFC Concepto IVA
 *                   MontoPago/>
 *     <Ordenante BancoEmisor Nombre TipoCuenta Cuenta RFC/>
 *   </SPEI_Tercero>
 *
 * Two things a reader has to respect. The children arrive in different orders
 * from different producers, so they are found by name and never by position. And
 * `xml` is kept byte-exact on the result, because the signature is over bytes and
 * a re-serialised document is a different document.
 */

import type { Cep } from "@hackmty/core";
import {
  readElementAttributes,
  readRootElement,
  type XmlAttributes,
} from "./xml";

/** Root element name of a CEP. Anything else is not a CEP. */
export const CEP_ROOT_ELEMENT = "SPEI_Tercero";

/**
 * Offset written into `transferredAt`.
 *
 * A CEP states a date and a wall-clock time with no offset at all. The time is
 * Mexico City time, which is UTC-6 with no daylight saving since the seasonal
 * change was repealed in October 2022, and AGENTS.md already fixes UTC-6 for the
 * whole repo. Known limitation: a CEP issued in the summer before that repeal was
 * UTC-5, so a pre-2022 CEP is stamped one hour late. The product only ever reads
 * CEPs from the payment run in front of the clerk, so this is recorded rather
 * than handled, and it is listed in the README.
 */
export const CEP_UTC_OFFSET = "-06:00";

/** Raw attribute records of a CEP, for anything the domain type does not model. */
export interface CepAttributes {
  root: XmlAttributes;
  beneficiario: XmlAttributes;
  ordenante: XmlAttributes;
}

export interface ParseCepOptions {
  /**
   * Marks the result as synthetic. Never inferred from the content: a fixture is
   * synthetic because the caller made it, not because its names look invented.
   */
  synthetic?: boolean;
}

/** Thrown when the input is not a CEP, or is a CEP with a field we cannot read. */
export class CepParseError extends Error {
  /** Stable code, so a route can map the failure without matching on prose. */
  readonly code: CepParseErrorCode;

  constructor(code: CepParseErrorCode, message: string) {
    super(message);
    this.name = "CepParseError";
    this.code = code;
  }
}

export type CepParseErrorCode =
  | "not_xml"
  | "wrong_root"
  | "missing_element"
  | "missing_attribute"
  | "bad_amount"
  | "bad_timestamp";

/**
 * Pulls the three attribute records out of a CEP without interpreting them.
 *
 * `verifySignature` reads `sello`, `numeroCertificado` and `cadenaCDA` from here,
 * and a caller that needs something the domain `Cep` does not model (TipoCuenta,
 * IVA, the sender RFC) reads it from here too, so there is never a second model
 * of the same document.
 */
export function readCepAttributes(xml: string): CepAttributes {
  const root = readRootElement(xml);
  if (root === undefined) {
    throw new CepParseError(
      "not_xml",
      "the input does not open an XML element, so it is not a CEP",
    );
  }
  if (root.name !== CEP_ROOT_ELEMENT) {
    throw new CepParseError(
      "wrong_root",
      `expected a <${CEP_ROOT_ELEMENT}> root, found <${root.name}>`,
    );
  }
  const beneficiario = readElementAttributes(xml, "Beneficiario");
  if (beneficiario === undefined) {
    throw new CepParseError(
      "missing_element",
      "the CEP has no <Beneficiario> element",
    );
  }
  const ordenante = readElementAttributes(xml, "Ordenante");
  if (ordenante === undefined) {
    throw new CepParseError(
      "missing_element",
      "the CEP has no <Ordenante> element",
    );
  }
  return { root: root.attributes, beneficiario, ordenante };
}

function required(
  attributes: XmlAttributes,
  name: string,
  where: string,
): string {
  const value = attributes[name];
  if (value === undefined || value.trim() === "") {
    throw new CepParseError(
      "missing_attribute",
      `${where} has no ${name} attribute`,
    );
  }
  return value.trim();
}

function optional(attributes: XmlAttributes, name: string): string | undefined {
  const value = attributes[name];
  if (value === undefined || value.trim() === "") {
    return undefined;
  }
  return value.trim();
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^\d{2}:\d{2}:\d{2}(\.\d+)?$/;

/** True when the three parts name a day that exists. */
function isRealDay(year: number, month: number, day: number): boolean {
  const probe = new Date(Date.UTC(year, month - 1, day));
  return (
    probe.getUTCFullYear() === year &&
    probe.getUTCMonth() === month - 1 &&
    probe.getUTCDate() === day
  );
}

/**
 * Combines `FechaOperacion` and `Hora` into one ISO 8601 instant.
 *
 * The CEP splits them and gives no offset. See CEP_UTC_OFFSET for why the offset
 * is fixed. The parts are checked by hand rather than handed to `Date.parse`,
 * which rolls 2026-02-31 forward into March without complaining and would turn a
 * malformed CEP into a plausible-looking timestamp on a payment evidence record.
 */
export function cepTimestamp(fechaOperacion: string, hora: string): string {
  if (!DATE_PATTERN.test(fechaOperacion)) {
    throw new CepParseError(
      "bad_timestamp",
      `FechaOperacion "${fechaOperacion}" is not YYYY-MM-DD`,
    );
  }
  if (!TIME_PATTERN.test(hora)) {
    throw new CepParseError("bad_timestamp", `Hora "${hora}" is not HH:MM:SS`);
  }
  const [year, month, day] = fechaOperacion.split("-").map(Number) as [
    number,
    number,
    number,
  ];
  if (!isRealDay(year, month, day)) {
    throw new CepParseError(
      "bad_timestamp",
      `FechaOperacion "${fechaOperacion}" is not a day that exists`,
    );
  }
  const [hours, minutes, seconds] = hora.split(":").map(Number) as [
    number,
    number,
    number,
  ];
  if (hours > 23 || minutes > 59 || seconds >= 60) {
    throw new CepParseError(
      "bad_timestamp",
      `Hora "${hora}" is not a real time`,
    );
  }
  return `${fechaOperacion}T${hora}${CEP_UTC_OFFSET}`;
}

/**
 * Parses `MontoPago`.
 *
 * The schema types it as a decimal with two fraction digits and a minimum of 1,
 * so a non-numeric or non-positive value means the document is broken, not that
 * the transfer was for nothing. It fails loudly instead of defaulting to zero,
 * because a zero amount would quietly disarm the expected-loss decision.
 */
export function cepAmount(montoPago: string): number {
  const amount = Number(montoPago);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new CepParseError(
      "bad_amount",
      `MontoPago "${montoPago}" is not a positive amount`,
    );
  }
  return amount;
}

/**
 * Parses a CEP XML into the domain `Cep`.
 *
 * `signatureValid` comes back false with reason `not_checked`: parsing proves
 * authorship of nothing. Call `verifySignature` and set the result yourself, so
 * that no code path can mistake "we read it" for "Banxico signed it".
 */
export function parseCep(xml: string, options: ParseCepOptions = {}): Cep {
  const { root, beneficiario, ordenante } = readCepAttributes(xml);

  return {
    claveRastreo: required(root, "claveRastreo", "the CEP root"),
    transferredAt: cepTimestamp(
      required(root, "FechaOperacion", "the CEP root"),
      required(root, "Hora", "the CEP root"),
    ),
    amount: cepAmount(required(beneficiario, "MontoPago", "<Beneficiario>")),
    senderName: required(ordenante, "Nombre", "<Ordenante>"),
    senderBank: required(ordenante, "BancoEmisor", "<Ordenante>"),
    senderAccount: optional(ordenante, "Cuenta"),
    beneficiaryName: required(beneficiario, "Nombre", "<Beneficiario>"),
    beneficiaryAccount: required(beneficiario, "Cuenta", "<Beneficiario>"),
    beneficiaryBank: required(beneficiario, "BancoReceptor", "<Beneficiario>"),
    beneficiaryRfc: optional(beneficiario, "RFC"),
    concepto: optional(beneficiario, "Concepto"),
    numeroCertificado: optional(root, "numeroCertificado"),
    signatureValid: false,
    signatureReason: "not_checked",
    xml,
    synthetic: options.synthetic ?? false,
  };
}
