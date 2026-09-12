/**
 * CFDI 4.0 and Complemento de recepcion de pagos 2.0, turned into domain records.
 *
 * This is the data foundation of every fiscal control in Ceptinela: the 69-B
 * sweep needs issuer RFCs, the duplicate detector needs UUIDs and totals, and the
 * beneficiary controls need the account a supplier said it was paid on, which
 * only ever appears inside a payment complement.
 *
 * Three decisions are worth defending out loud, because a judge will ask.
 *
 * 1. **No XML dependency.** The tokenizer below is about two hundred lines and it
 *    reads exactly one dialect: SAT documents, which are attribute-only, ASCII
 *    named, and namespaced. A parser we own cannot expand a DTD, cannot fetch an
 *    external entity and cannot grow a transitive dependency between now and the
 *    demo. In a product whose whole claim is that a document is not to be trusted,
 *    the thing that opens the document is not the place to add supply chain.
 * 2. **Nothing throws.** Every entry point returns a `ParseResult`, because these
 *    documents arrive by email, by WhatsApp and by upload, which means malformed
 *    input is the normal case and not the exception. A parse failure is a finding
 *    the clerk can see, never a stack trace and never a blank screen.
 * 3. **We read, we do not judge.** An invalid CLABE, an RFC that is not on the SAT
 *    list, a payment that does not match its invoice: all of that belongs to the
 *    detectors. This module only reports what the document says, so that a bad
 *    value reaches the control that was built to catch it instead of being
 *    silently dropped here.
 *
 * Amounts come back in MXN major units, rounded to the cent through `money.ts`,
 * so no caller ever compares two floats. Timestamps come back as ISO instants;
 * see `toInstant` for the offset assumption, which is stated rather than hidden.
 */

import type { Cfdi, PaymentComplement } from "./domain";
import { fromCents, toCents } from "./money";
import { MONTERREY_UTC_OFFSET_MINUTES } from "./types";

// ---------------------------------------------------------------------------
// Result type
// ---------------------------------------------------------------------------

/**
 * One error vocabulary for every document parser in this package. A new parser
 * (the CEP one, for example) adds its codes here instead of inventing a second
 * result shape, so the API and the UI only ever switch over one union.
 *
 * - `empty_input`: nothing to parse.
 * - `input_too_large`: past the size cap, refused before any allocation.
 * - `malformed_xml`: the tokenizer could not read the document.
 * - `not_a_comprobante`: the root element is not `cfdi:Comprobante`.
 * - `unsupported_version`: not CFDI 4.0, or not Pagos 2.0.
 * - `not_an_income_cfdi`: `TipoDeComprobante` is not `I`.
 * - `not_a_payment_cfdi`: `TipoDeComprobante` is not `P`.
 * - `missing_timbre`: no `tfd:TimbreFiscalDigital`, so the document was never
 *   stamped and has no fiscal identity at all.
 * - `invalid_uuid`: a UUID is present but not shaped like one.
 * - `missing_party`: the issuer or the receiver RFC is absent.
 * - `invalid_amount`: an amount is absent, not a decimal, or negative.
 * - `invalid_date`: a timestamp is absent or not a SAT timestamp.
 * - `invalid_payment_method`: `MetodoPago` is neither `PUE` nor `PPD`.
 * - `missing_pagos_complement`: a type `P` comprobante with no `pago20:Pagos`.
 * - `no_related_documents`: no payment, or a payment that settles nothing.
 */
export type ParseErrorCode =
  | "empty_input"
  | "input_too_large"
  | "malformed_xml"
  | "not_a_comprobante"
  | "unsupported_version"
  | "not_an_income_cfdi"
  | "not_a_payment_cfdi"
  | "missing_timbre"
  | "invalid_uuid"
  | "missing_party"
  | "invalid_amount"
  | "invalid_date"
  | "invalid_payment_method"
  | "missing_pagos_complement"
  | "no_related_documents";

export interface ParseFailure {
  code: ParseErrorCode;
  /**
   * Plain English, and deliberately free of document content. These strings end
   * up in logs and in an error envelope, and a supplier name or an RFC in a log
   * line is exactly the leak this product exists to argue against.
   */
  message: string;
}

export type ParseResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: ParseFailure };

function fail(
  code: ParseErrorCode,
  message: string,
): {
  ok: false;
  error: ParseFailure;
} {
  return { ok: false, error: { code, message } };
}

// ---------------------------------------------------------------------------
// XML tokenizer
// ---------------------------------------------------------------------------

/** SAT namespaces. Prefixes vary between PAC providers, URIs do not. */
export const CFDI_NAMESPACE = "http://www.sat.gob.mx/cfd/4";
export const PAGOS_NAMESPACE = "http://www.sat.gob.mx/Pagos20";
export const TFD_NAMESPACE = "http://www.sat.gob.mx/TimbreFiscalDigital";

/**
 * Refused before parsing. A stamped CFDI with a thousand line items is well under
 * a megabyte, and the intake endpoint accepts uploads from a phone, so the cap is
 * a cheap denial-of-service floor rather than a real limit on honest documents.
 */
export const MAX_INPUT_LENGTH = 2_000_000;

/** A stamped CFDI nests six levels deep. Sixty four is hostile input. */
export const MAX_DEPTH = 64;

/** An element of a parsed document. Text nodes are dropped: SAT XML has none. */
export interface XmlElement {
  /** Qualified name exactly as written, for example `cfdi:Comprobante`. */
  name: string;
  /** Prefix before the colon, empty when the element carries none. */
  prefix: string;
  /** Name after the colon, the part that is stable across PAC providers. */
  localName: string;
  /** Namespace URI the prefix resolved to, empty when it was never declared. */
  namespace: string;
  /** Attributes by qualified name, values already entity-decoded. */
  attributes: Record<string, string>;
  children: XmlElement[];
}

type NamespaceScope = Readonly<Record<string, string>>;

const EMPTY_SCOPE: NamespaceScope = {};

const NAMED_ENTITIES: Readonly<Record<string, string>> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
};

const ENTITY_PATTERN = /&(#[Xx][0-9A-Fa-f]+|#\d+|[A-Za-z]+);/g;

function isSpaceCode(code: number): boolean {
  return code === 0x20 || code === 0x09 || code === 0x0a || code === 0x0d;
}

function isNameStartCode(code: number): boolean {
  return (
    (code >= 0x41 && code <= 0x5a) ||
    (code >= 0x61 && code <= 0x7a) ||
    code === 0x5f
  );
}

function isNameCode(code: number): boolean {
  return (
    isNameStartCode(code) ||
    (code >= 0x30 && code <= 0x39) ||
    code === 0x2d ||
    code === 0x2e ||
    code === 0x3a
  );
}

/**
 * Resolves the five predefined entities and numeric character references.
 *
 * Anything else is left verbatim on purpose: resolving a named entity would mean
 * reading a DTD, and reading a DTD is how XML parsers end up fetching a URL or
 * expanding a billion laughs. An unknown entity in a supplier name is a cosmetic
 * problem; an entity resolver in a payments sentinel is a vulnerability.
 */
export function decodeXmlEntities(raw: string): string {
  if (!raw.includes("&")) {
    return raw;
  }
  return raw.replace(ENTITY_PATTERN, (match: string, body: string) => {
    if (body.charCodeAt(0) === 0x23) {
      const hex = body.charCodeAt(1) === 0x78 || body.charCodeAt(1) === 0x58;
      const digits = hex ? body.slice(2) : body.slice(1);
      const code = Number.parseInt(digits, hex ? 16 : 10);
      if (!Number.isInteger(code) || code < 0 || code > 0x10ffff) {
        return match;
      }
      return String.fromCodePoint(code);
    }
    const named = NAMED_ENTITIES[body];
    return named === undefined ? match : named;
  });
}

function extendScope(
  inherited: NamespaceScope,
  attributes: Record<string, string>,
): NamespaceScope {
  let extended: Record<string, string> | undefined;
  for (const key of Object.keys(attributes)) {
    if (key !== "xmlns" && !key.startsWith("xmlns:")) {
      continue;
    }
    extended ??= { ...inherited };
    extended[key === "xmlns" ? "" : key.slice("xmlns:".length)] =
      attributes[key];
  }
  return extended ?? inherited;
}

/**
 * Reads an XML document into a tree of elements, or explains why it could not.
 *
 * What is supported: elements, attributes, namespace prefixes and the default
 * namespace, self-closing tags, comments, processing instructions, CDATA
 * sections and the five predefined entities. What is skipped without being
 * expanded: doctype declarations. What is dropped: text content, because a CFDI
 * carries every value in an attribute and keeping text would only invite a caller
 * to trust it. What is rejected: a document that is empty, oversized, nested past
 * `MAX_DEPTH`, has two roots, or has a tag that never closes.
 */
export function parseXml(source: string): ParseResult<XmlElement> {
  if (typeof source !== "string" || source.trim() === "") {
    return fail("empty_input", "the document is empty");
  }
  if (source.length > MAX_INPUT_LENGTH) {
    return fail(
      "input_too_large",
      `the document is larger than ${MAX_INPUT_LENGTH} characters`,
    );
  }

  const length = source.length;
  const stack: XmlElement[] = [];
  const scopes: NamespaceScope[] = [];
  let root: XmlElement | undefined;
  let index = 0;

  while (index < length) {
    const open = source.indexOf("<", index);
    if (open === -1) {
      break;
    }
    index = open;

    if (source.startsWith("<!--", index)) {
      const end = source.indexOf("-->", index + 4);
      if (end === -1) {
        return fail("malformed_xml", "a comment is never closed");
      }
      index = end + 3;
      continue;
    }
    if (source.startsWith("<![CDATA[", index)) {
      const end = source.indexOf("]]>", index + 9);
      if (end === -1) {
        return fail("malformed_xml", "a CDATA section is never closed");
      }
      index = end + 3;
      continue;
    }
    if (source.startsWith("<?", index)) {
      const end = source.indexOf("?>", index + 2);
      if (end === -1) {
        return fail(
          "malformed_xml",
          "a processing instruction is never closed",
        );
      }
      index = end + 2;
      continue;
    }
    if (source.startsWith("<!", index)) {
      // Doctype and friends are stepped over, never expanded.
      const end = source.indexOf(">", index + 2);
      if (end === -1) {
        return fail("malformed_xml", "a declaration is never closed");
      }
      index = end + 1;
      continue;
    }
    if (source.startsWith("</", index)) {
      const end = source.indexOf(">", index + 2);
      if (end === -1) {
        return fail("malformed_xml", "a closing tag is never closed");
      }
      const name = source.slice(index + 2, end).trim();
      const open_element = stack.pop();
      scopes.pop();
      if (open_element === undefined || open_element.name !== name) {
        return fail(
          "malformed_xml",
          "a closing tag does not match the element it closes",
        );
      }
      index = end + 1;
      continue;
    }

    index += 1;
    const nameStart = index;
    if (index >= length || !isNameStartCode(source.charCodeAt(index))) {
      return fail("malformed_xml", "a tag name is missing or is not a name");
    }
    while (index < length && isNameCode(source.charCodeAt(index))) {
      index += 1;
    }
    const name = source.slice(nameStart, index);

    const attributes: Record<string, string> = {};
    let selfClosing = false;
    let tagClosed = false;

    while (index < length) {
      while (index < length && isSpaceCode(source.charCodeAt(index))) {
        index += 1;
      }
      if (index >= length) {
        break;
      }
      const char = source[index];
      if (char === ">") {
        index += 1;
        tagClosed = true;
        break;
      }
      if (char === "/") {
        if (source[index + 1] !== ">") {
          return fail("malformed_xml", "a slash in a tag is not followed by >");
        }
        index += 2;
        selfClosing = true;
        tagClosed = true;
        break;
      }

      const attributeStart = index;
      if (!isNameStartCode(source.charCodeAt(index))) {
        return fail(
          "malformed_xml",
          "an attribute name is missing or is not a name",
        );
      }
      while (index < length && isNameCode(source.charCodeAt(index))) {
        index += 1;
      }
      const attributeName = source.slice(attributeStart, index);
      while (index < length && isSpaceCode(source.charCodeAt(index))) {
        index += 1;
      }
      if (source[index] !== "=") {
        return fail("malformed_xml", "an attribute has no value");
      }
      index += 1;
      while (index < length && isSpaceCode(source.charCodeAt(index))) {
        index += 1;
      }
      const quote = source[index];
      if (quote !== '"' && quote !== "'") {
        return fail("malformed_xml", "an attribute value is not quoted");
      }
      index += 1;
      const valueEnd = source.indexOf(quote, index);
      if (valueEnd === -1) {
        return fail("malformed_xml", "an attribute value is never closed");
      }
      const value = decodeXmlEntities(source.slice(index, valueEnd));
      index = valueEnd + 1;
      // A document never reaches Object.prototype, and the first spelling of a
      // repeated attribute wins so that two values can never race.
      if (
        attributeName !== "__proto__" &&
        !Object.hasOwn(attributes, attributeName)
      ) {
        attributes[attributeName] = value;
      }
    }

    if (!tagClosed) {
      return fail("malformed_xml", "a tag is never closed");
    }

    const inherited =
      scopes.length === 0 ? EMPTY_SCOPE : scopes[scopes.length - 1];
    const scope = extendScope(inherited, attributes);
    const colon = name.indexOf(":");
    const prefix = colon === -1 ? "" : name.slice(0, colon);
    const localName = colon === -1 ? name : name.slice(colon + 1);
    const element: XmlElement = {
      name,
      prefix,
      localName,
      namespace: scope[prefix] ?? "",
      attributes,
      children: [],
    };

    const parent = stack[stack.length - 1];
    if (parent === undefined) {
      if (root !== undefined) {
        return fail("malformed_xml", "the document has more than one root");
      }
      root = element;
    } else {
      parent.children.push(element);
    }

    if (!selfClosing) {
      if (stack.length >= MAX_DEPTH) {
        return fail("malformed_xml", "the document is nested too deeply");
      }
      stack.push(element);
      scopes.push(scope);
    }
  }

  if (stack.length > 0) {
    return fail("malformed_xml", "an element is never closed");
  }
  if (root === undefined) {
    return fail("malformed_xml", "the document has no root element");
  }
  return { ok: true, value: root };
}

/**
 * Namespace-aware name match, with one deliberate concession: an element that
 * declared no namespace at all matches on its local name.
 *
 * Real documents from small PAC providers do arrive with the xmlns declarations
 * stripped by a mail gateway or a copy-paste, and refusing to read a document a
 * human can clearly read is a worse failure than reading a mislabelled one. A
 * document that declares a different namespace is still rejected.
 */
function matches(
  element: XmlElement,
  localName: string,
  namespace?: string,
): boolean {
  if (element.localName !== localName) {
    return false;
  }
  if (namespace === undefined || element.namespace === "") {
    return true;
  }
  return element.namespace === namespace;
}

/** Direct children with this local name, in document order. */
export function childrenNamed(
  parent: XmlElement,
  localName: string,
  namespace?: string,
): XmlElement[] {
  return parent.children.filter((child) =>
    matches(child, localName, namespace),
  );
}

/** First direct child with this local name. */
export function childNamed(
  parent: XmlElement | undefined,
  localName: string,
  namespace?: string,
): XmlElement | undefined {
  if (parent === undefined) {
    return undefined;
  }
  return parent.children.find((child) => matches(child, localName, namespace));
}

/**
 * First descendant with this local name, depth first.
 *
 * Only used for the timbre, which providers place at different depths inside
 * `cfdi:Complemento`. Everything else is addressed by an exact path, so a nested
 * `cfdi:Traslado` inside a concept can never be mistaken for a document total.
 */
export function descendantNamed(
  parent: XmlElement,
  localName: string,
  namespace?: string,
): XmlElement | undefined {
  for (const child of parent.children) {
    if (matches(child, localName, namespace)) {
      return child;
    }
    const found = descendantNamed(child, localName, namespace);
    if (found !== undefined) {
      return found;
    }
  }
  return undefined;
}

/** Trimmed attribute value, or undefined when absent or blank. */
export function attribute(
  element: XmlElement | undefined,
  name: string,
): string | undefined {
  if (element === undefined) {
    return undefined;
  }
  const raw = element.attributes[name];
  if (raw === undefined) {
    return undefined;
  }
  const trimmed = raw.trim();
  return trimmed === "" ? undefined : trimmed;
}

// ---------------------------------------------------------------------------
// SAT scalars
// ---------------------------------------------------------------------------

const MONEY_PATTERN = /^\d+(\.\d+)?$/;
const UUID_PATTERN =
  /^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}$/;
const SAT_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?$/;
const OFFSET_TIMESTAMP_PATTERN = /(Z|[+-]\d{2}:\d{2})$/;
const MS_PER_MINUTE = 60_000;

/**
 * A SAT amount: a non-negative decimal, rounded to the cent.
 *
 * Everything else is undefined rather than coerced. `"1,234.56"` from a
 * hand-edited file would become `NaN` under `Number`, an empty string would
 * become `0`, and a negative total is not a rounding problem but a tampered
 * document, so none of the three are quietly accepted.
 */
export function parseSatAmount(raw: string | undefined): number | undefined {
  if (raw === undefined) {
    return undefined;
  }
  const trimmed = raw.trim();
  if (!MONEY_PATTERN.test(trimmed)) {
    return undefined;
  }
  const value = Number(trimmed);
  // The guard is the same multiply and round that `toCents` does, so an amount
  // this function accepts can never make `toCents` throw on the next line.
  if (
    !Number.isFinite(value) ||
    !Number.isSafeInteger(Math.round(value * 100))
  ) {
    return undefined;
  }
  return fromCents(toCents(value));
}

/** Uppercased UUID, or undefined when the value is not shaped like one. */
export function parseSatUuid(raw: string | undefined): string | undefined {
  if (raw === undefined || !UUID_PATTERN.test(raw.trim())) {
    return undefined;
  }
  return raw.trim().toUpperCase();
}

/**
 * Turns a SAT timestamp into an ISO instant.
 *
 * `Fecha`, `FechaTimbrado` and `FechaPago` are local times with no offset at all,
 * and the local time in question is the one at the place of issue. We say the
 * assumption out loud instead of hiding it: the offset is a parameter, it
 * defaults to Monterrey, and a document that does carry an explicit offset is
 * trusted over the default. Getting this wrong by six hours would move a payment
 * across a day boundary, which is exactly the kind of silent error the duplicate
 * detector would then report as a finding.
 */
export function toInstant(
  raw: string | undefined,
  utcOffsetMinutes: number = MONTERREY_UTC_OFFSET_MINUTES,
): string | undefined {
  if (raw === undefined) {
    return undefined;
  }
  const trimmed = raw.trim();
  if (OFFSET_TIMESTAMP_PATTERN.test(trimmed)) {
    const explicit = Date.parse(trimmed);
    return Number.isFinite(explicit)
      ? new Date(explicit).toISOString()
      : undefined;
  }
  if (!SAT_TIMESTAMP_PATTERN.test(trimmed)) {
    return undefined;
  }
  const asIfUtc = Date.parse(`${trimmed}Z`);
  if (!Number.isFinite(asIfUtc) || !Number.isFinite(utcOffsetMinutes)) {
    return undefined;
  }
  return new Date(asIfUtc - utcOffsetMinutes * MS_PER_MINUTE).toISOString();
}

/**
 * Uppercased RFC, or undefined when absent.
 *
 * The shape is not validated. The 69-B list is the authority on whether an RFC
 * exists, and an RFC this module rejected would never reach it. Case is
 * normalised because the official list is uppercase and a lowercase copy of a
 * listed RFC would otherwise miss the match, which is the one failure mode this
 * product cannot have.
 */
function normalizeRfc(raw: string | undefined): string | undefined {
  return raw === undefined ? undefined : raw.trim().toUpperCase();
}

// ---------------------------------------------------------------------------
// CFDI 4.0 de ingreso
// ---------------------------------------------------------------------------

export interface CfdiParseOptions {
  /**
   * Marks the produced records as generated data. The UI renders its watermark
   * from this flag and never from a name, so a synthetic document is impossible
   * to present as a real one by renaming the supplier.
   */
  synthetic?: boolean;
  /** Offset assumed for SAT local timestamps. Defaults to Monterrey, UTC-6. */
  utcOffsetMinutes?: number;
}

/** IVA is tax code 002 in the SAT catalogue. IEPS is 003 and is not IVA. */
const IVA_TAX_CODE = "002";

function readComprobante(
  source: string,
  expectedType: "I" | "P",
): ParseResult<XmlElement> {
  const document = parseXml(source);
  if (!document.ok) {
    return document;
  }
  const root = document.value;
  if (root.localName !== "Comprobante") {
    return fail("not_a_comprobante", "the root element is not a comprobante");
  }
  // A 3.3 document is a comprobante in the cfd/3 namespace, so the namespace is
  // checked before the attribute: the honest answer is "wrong version", not
  // "wrong document", and the clerk is told which one it is.
  if (root.namespace !== "" && root.namespace !== CFDI_NAMESPACE) {
    return fail("unsupported_version", "the comprobante is not CFDI 4.0");
  }
  if (attribute(root, "Version") !== "4.0") {
    return fail("unsupported_version", "only CFDI 4.0 is supported");
  }
  const type = attribute(root, "TipoDeComprobante");
  if (type !== expectedType) {
    return expectedType === "I"
      ? fail("not_an_income_cfdi", "the comprobante is not de ingreso")
      : fail("not_a_payment_cfdi", "the comprobante is not de pago");
  }
  return { ok: true, value: root };
}

function readStampUuid(root: XmlElement): ParseResult<string> {
  const timbre = descendantNamed(root, "TimbreFiscalDigital", TFD_NAMESPACE);
  const raw = attribute(timbre, "UUID");
  if (timbre === undefined || raw === undefined) {
    return fail("missing_timbre", "the comprobante carries no timbre fiscal");
  }
  const uuid = parseSatUuid(raw);
  if (uuid === undefined) {
    return fail("invalid_uuid", "the timbre UUID is not a UUID");
  }
  return { ok: true, value: uuid };
}

/**
 * Sums the IVA actually transferred by the document.
 *
 * Deliberately not `TotalImpuestosTrasladados`: that attribute is the sum of
 * every transferred tax, so on a document that also carries IEPS it overstates
 * IVA, and IVA is the number the 69-B exposure calculation deducts. Only the
 * document-level `cfdi:Impuestos` block is read, never the per-concept one,
 * which would double the total on any invoice with more than one line.
 */
function sumTransferredIva(root: XmlElement): number {
  const impuestos = childNamed(root, "Impuestos", CFDI_NAMESPACE);
  const traslados = childNamed(impuestos, "Traslados", CFDI_NAMESPACE);
  if (traslados === undefined) {
    return 0;
  }
  let cents = 0;
  for (const traslado of childrenNamed(traslados, "Traslado", CFDI_NAMESPACE)) {
    if (attribute(traslado, "Impuesto") !== IVA_TAX_CODE) {
      continue;
    }
    // An exempt line carries no Importe at all, and contributes nothing.
    const amount = parseSatAmount(attribute(traslado, "Importe"));
    if (amount !== undefined) {
      cents += toCents(amount);
    }
  }
  return fromCents(cents);
}

/**
 * Parses a CFDI 4.0 de ingreso, the invoice a supplier issued to the company.
 *
 * `total` is read, never recomputed. The SAT stamp signs the document as it was
 * issued, so a recomputed total would be our arithmetic replacing the fiscal
 * fact; if subtotal plus IVA does not equal total, that is a finding for a
 * detector to raise and not a value for a parser to correct.
 */
export function parseCfdi(
  source: string,
  options: CfdiParseOptions = {},
): ParseResult<Cfdi> {
  const comprobante = readComprobante(source, "I");
  if (!comprobante.ok) {
    return comprobante;
  }
  const root = comprobante.value;

  const stamp = readStampUuid(root);
  if (!stamp.ok) {
    return stamp;
  }

  const issuer = childNamed(root, "Emisor", CFDI_NAMESPACE);
  const receiver = childNamed(root, "Receptor", CFDI_NAMESPACE);
  const issuerRfc = normalizeRfc(attribute(issuer, "Rfc"));
  const receiverRfc = normalizeRfc(attribute(receiver, "Rfc"));
  if (issuerRfc === undefined || receiverRfc === undefined) {
    return fail("missing_party", "the issuer or the receiver RFC is missing");
  }

  const subtotal = parseSatAmount(attribute(root, "SubTotal"));
  const total = parseSatAmount(attribute(root, "Total"));
  if (subtotal === undefined || total === undefined) {
    return fail("invalid_amount", "SubTotal or Total is not a SAT amount");
  }

  const issuedAt = toInstant(
    attribute(root, "Fecha"),
    options.utcOffsetMinutes ?? MONTERREY_UTC_OFFSET_MINUTES,
  );
  if (issuedAt === undefined) {
    return fail("invalid_date", "Fecha is not a SAT timestamp");
  }

  const paymentMethod = attribute(root, "MetodoPago");
  if (paymentMethod !== "PUE" && paymentMethod !== "PPD") {
    return fail("invalid_payment_method", "MetodoPago is neither PUE nor PPD");
  }

  const cfdi: Cfdi = {
    uuid: stamp.value,
    issuedAt,
    issuerRfc,
    issuerName: attribute(issuer, "Nombre") ?? "",
    receiverRfc,
    subtotal,
    iva: sumTransferredIva(root),
    total,
    paymentMethod,
    synthetic: options.synthetic === true,
  };
  const serie = attribute(root, "Serie");
  if (serie !== undefined) {
    cfdi.serie = serie;
  }
  const folio = attribute(root, "Folio");
  if (folio !== undefined) {
    cfdi.folio = folio;
  }
  const paymentForm = attribute(root, "FormaPago");
  if (paymentForm !== undefined) {
    cfdi.paymentForm = paymentForm;
  }
  return { ok: true, value: cfdi };
}

// ---------------------------------------------------------------------------
// Complemento de recepcion de pagos 2.0
// ---------------------------------------------------------------------------

/**
 * Parses a complemento de recepcion de pagos 2.0 into one record per settled
 * invoice, in document order.
 *
 * The shape of the complement is one comprobante, several `pago20:Pago` nodes,
 * and several `pago20:DoctoRelacionado` under each of them, so a single stamped
 * document can settle nine invoices with two transfers. The domain record is per
 * invoice because every control is per invoice, and the transfer-level facts that
 * the beneficiary controls need (`paymentTotal`, `operationNumber`,
 * `beneficiaryAccount`) are repeated on each row rather than modelled separately.
 * That is the whole reason this parser exists: `CtaBeneficiario` is the only
 * place in the fiscal record where a supplier states, after the fact and under
 * its own stamp, which account it was actually paid on.
 */
export function parsePaymentComplement(
  source: string,
  options: CfdiParseOptions = {},
): ParseResult<PaymentComplement[]> {
  const comprobante = readComprobante(source, "P");
  if (!comprobante.ok) {
    return comprobante;
  }
  const root = comprobante.value;

  const stamp = readStampUuid(root);
  if (!stamp.ok) {
    return stamp;
  }

  const complemento = childNamed(root, "Complemento", CFDI_NAMESPACE);
  const pagos = childNamed(complemento, "Pagos", PAGOS_NAMESPACE);
  if (pagos === undefined) {
    return fail(
      "missing_pagos_complement",
      "the comprobante carries no pagos complement",
    );
  }
  const pagosVersion = attribute(pagos, "Version");
  if (pagosVersion !== undefined && pagosVersion !== "2.0") {
    return fail("unsupported_version", "only Pagos 2.0 is supported");
  }

  const offset = options.utcOffsetMinutes ?? MONTERREY_UTC_OFFSET_MINUTES;
  const synthetic = options.synthetic === true;
  const rows: PaymentComplement[] = [];

  for (const pago of childrenNamed(pagos, "Pago", PAGOS_NAMESPACE)) {
    const paidAt = toInstant(attribute(pago, "FechaPago"), offset);
    if (paidAt === undefined) {
      return fail("invalid_date", "FechaPago is not a SAT timestamp");
    }
    const paymentTotal = parseSatAmount(attribute(pago, "Monto"));
    if (paymentTotal === undefined) {
      return fail("invalid_amount", "Monto is not a SAT amount");
    }
    const beneficiaryAccount = attribute(pago, "CtaBeneficiario");
    const beneficiaryBankRfc = normalizeRfc(attribute(pago, "RfcEmisorCtaBen"));
    const operationNumber = attribute(pago, "NumOperacion");

    const documents = childrenNamed(pago, "DoctoRelacionado", PAGOS_NAMESPACE);
    if (documents.length === 0) {
      return fail("no_related_documents", "a payment settles no document");
    }

    for (const document of documents) {
      const relatedCfdiUuid = parseSatUuid(attribute(document, "IdDocumento"));
      if (relatedCfdiUuid === undefined) {
        return fail("invalid_uuid", "IdDocumento is not a UUID");
      }
      // ImpPagado is omitted by some providers when one transfer settles exactly
      // one invoice, because then the amount is the transfer itself.
      const paidAmount =
        parseSatAmount(attribute(document, "ImpPagado")) ??
        (documents.length === 1 ? paymentTotal : undefined);
      if (paidAmount === undefined) {
        return fail("invalid_amount", "ImpPagado is not a SAT amount");
      }

      const row: PaymentComplement = {
        uuid: stamp.value,
        relatedCfdiUuid,
        paidAt,
        paidAmount,
        paymentTotal,
        synthetic,
      };
      if (beneficiaryAccount !== undefined) {
        row.beneficiaryAccount = beneficiaryAccount;
      }
      if (beneficiaryBankRfc !== undefined) {
        row.beneficiaryBankRfc = beneficiaryBankRfc;
      }
      if (operationNumber !== undefined) {
        row.operationNumber = operationNumber;
      }
      rows.push(row);
    }
  }

  if (rows.length === 0) {
    return fail("no_related_documents", "the complement carries no payment");
  }
  return { ok: true, value: rows };
}
