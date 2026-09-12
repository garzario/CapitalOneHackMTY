/**
 * bun run scripts/import-real-cfdi.ts <path/to/real.xml> [flags]
 *
 * Turns one real CFDI 4.0, de ingreso or complemento de recepcion de pagos 2.0,
 * into a fixture that can be committed, so that the parser in
 * `packages/core/src/cfdi.ts` is proven on a document a PAC actually stamped and
 * not only on documents we wrote ourselves.
 *
 * The rule this script exists to enforce: the real file never enters the
 * repository. It stays outside it, or under `.seed/real/`, which is gitignored,
 * and only the redacted copy reaches `packages/core/src/fixtures/real/`.
 *
 * What it replaces, all of it derived deterministically from one secret factor:
 *
 * - every amount, scaled by that factor, so a real invoice total can never be
 *   read off the fixture,
 * - every RFC, by a `SYN` prefixed synthetic one whose last character is a
 *   correct SAT check digit, so the value is still shaped like an RFC,
 * - every legal name, by a constructed one that keeps the legal form suffix,
 * - every address, which in CFDI 4.0 means the postal codes,
 * - every UUID, folio, serie, bank account, operation number, certificate
 *   serial, stamp and certificate.
 *
 * What it keeps, on purpose: the structure, the namespaces, the attribute order,
 * the whitespace, the catalogue codes, the dates and the tax breakdown. The
 * output is the input with attribute values rewritten in place, so a diff of the
 * two is a diff of values and never of shape. Amounts keep the number of
 * decimals they were written with, and every arithmetic identity the original
 * document satisfied is recomputed and rechecked on the redacted one, so the
 * rounding behaviour of the issuing PAC survives the scaling.
 *
 * Two verifications run before anything is written, and either one fails the
 * command:
 *
 * 1. no value that was replaced survives anywhere in the output, and no RFC
 *    shaped or CURP shaped token that is not ours survives either, which is what
 *    catches an RFC typed into a free text description,
 * 2. the redacted document parses with the same parser, as the same kind of
 *    document, and every relation that held in the original still holds.
 *
 * Flags:
 *   --name=<slug>               output basename, default <type>-<4 hex chars>
 *   --scale=<factor>            same as REAL_CFDI_SCALE, for one run
 *   --dry-run                   print everything, write nothing
 *   --force                     overwrite an existing fixture
 *   --allow-unknown-complement  redact a document carrying a complement this
 *                               script does not understand, blanking it whole
 *
 * The factor comes from `REAL_CFDI_SCALE`. With the variable unset a random one
 * is generated and printed once, and that same factor has to be exported before
 * importing the payment complement that belongs to the same invoice, because the
 * factor is also the seed of every pseudonym: the same RFC maps to the same
 * synthetic RFC, and the same UUID to the same synthetic UUID, only while the
 * factor is the same. It is never written into the fixture and never committed.
 *
 * This lives in `scripts/` rather than in `packages/core` because it is a build
 * time tool for one operator, and `packages/core` is bundled into the API. The
 * engine has no reason to carry a redaction engine into production.
 */

import { createHash, randomInt } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type {
  Cfdi,
  PaymentComplement,
  XmlElement,
} from "../packages/core/src/index.ts";
import {
  CFDI_NAMESPACE,
  childNamed,
  clabeCheckDigit,
  decodeXmlEntities,
  PAGOS_NAMESPACE,
  parseCfdi,
  parsePaymentComplement,
  parseXml,
  attribute as satAttribute,
  TFD_NAMESPACE,
} from "../packages/core/src/index.ts";

const ROOT = resolve(import.meta.dir, "..");
const FIXTURE_DIRECTORY = `${ROOT}/packages/core/src/fixtures/real`;
const MAP_DIRECTORY = `${ROOT}/.seed/real`;
const FIXTURE_SUFFIX = ".redacted.xml";
const MAP_SUFFIX = ".map.json";
const SCALE_VARIABLE = "REAL_CFDI_SCALE";

/** How far from 1 a factor has to be before it actually hides an amount. */
const MIN_SCALE_DISTANCE = 0.05;
const MAX_SCALE = 100;
const MAX_SCALE_DECIMALS = 6;
/** Range of a generated factor, low enough that no amount survives rounding. */
const GENERATED_SCALE_MIN = 2500;
const GENERATED_SCALE_MAX = 7500;
const GENERATED_SCALE_DECIMALS = 4;

const DERIVATION_LABEL = "sentryone/import-real-cfdi/v1";
const SYNTHETIC_POSTAL_CODE = "64000";
const SIGNATURE_PLACEHOLDER = "REDACTED-SELLO-NOT-A-SIGNATURE";
const CERTIFICATE_PLACEHOLDER = "REDACTED-CERTIFICADO-NOT-A-CERTIFICATE";
const SYNTHETIC_RFC_PREFIX = "SYN";
/** Long enough to name a file, short enough to read out loud. */
const SHORT_ID_LENGTH = 4;

const PROVENANCE_COMMENT = `<!-- Redacted copy of a real CFDI 4.0. Every RFC, legal name, address, folio,
     UUID, bank account, stamp, certificate and amount was replaced by
     scripts/import-real-cfdi.ts before this file was committed, and the amounts
     are scaled by a factor that lives outside the repository, so no figure here
     is a real one. Kept because a parser has to be proven on a document a PAC
     produced. See docs/08-data-model.md, Real document validation. -->`;

// ---------------------------------------------------------------------------
// Decimal arithmetic
// ---------------------------------------------------------------------------

/**
 * A fixed point decimal, `units` scaled by ten to the power of `scale`.
 *
 * Every amount in this script moves through `bigint`. Scaling a document by
 * 0.6137 in floating point would leave the redaction a cent away from the
 * arithmetic the PAC signed, and a cent is exactly the difference the
 * verification at the end refuses to accept.
 */
interface Decimal {
  units: bigint;
  scale: number;
}

const DECIMAL_PATTERN = /^-?\d+(\.\d+)?$/;

function parseDecimal(raw: string): Decimal | undefined {
  const trimmed = raw.trim();
  if (!DECIMAL_PATTERN.test(trimmed)) {
    return undefined;
  }
  const negative = trimmed.startsWith("-");
  const body = negative ? trimmed.slice(1) : trimmed;
  const dot = body.indexOf(".");
  const digits = dot === -1 ? body : body.slice(0, dot) + body.slice(dot + 1);
  const scale = dot === -1 ? 0 : body.length - dot - 1;
  const units = BigInt(digits);
  return { units: negative ? -units : units, scale };
}

function pow10(exponent: number): bigint {
  return 10n ** BigInt(exponent);
}

/** Rescales half away from zero, which is how a SAT amount is rounded. */
function rescale(value: Decimal, scale: number): Decimal {
  if (value.scale === scale) {
    return value;
  }
  if (value.scale < scale) {
    return { units: value.units * pow10(scale - value.scale), scale };
  }
  const divisor = pow10(value.scale - scale);
  const negative = value.units < 0n;
  const magnitude = negative ? -value.units : value.units;
  const quotient = magnitude / divisor;
  const remainder = magnitude % divisor;
  const rounded = remainder * 2n >= divisor ? quotient + 1n : quotient;
  return { units: negative ? -rounded : rounded, scale };
}

function align(left: Decimal, right: Decimal): [Decimal, Decimal] {
  const scale = Math.max(left.scale, right.scale);
  return [rescale(left, scale), rescale(right, scale)];
}

function addDecimal(left: Decimal, right: Decimal): Decimal {
  const [a, b] = align(left, right);
  return { units: a.units + b.units, scale: a.scale };
}

function subtractDecimal(left: Decimal, right: Decimal): Decimal {
  const [a, b] = align(left, right);
  return { units: a.units - b.units, scale: a.scale };
}

function multiplyDecimal(left: Decimal, right: Decimal): Decimal {
  return { units: left.units * right.units, scale: left.scale + right.scale };
}

function equalsDecimal(left: Decimal, right: Decimal): boolean {
  const [a, b] = align(left, right);
  return a.units === b.units;
}

function isZeroDecimal(value: Decimal): boolean {
  return value.units === 0n;
}

function formatDecimal(value: Decimal, scale: number): string {
  const fixed = rescale(value, scale);
  const negative = fixed.units < 0n;
  const magnitude = (negative ? -fixed.units : fixed.units).toString();
  const digits = magnitude.padStart(scale + 1, "0");
  const whole = digits.slice(0, digits.length - scale);
  const fraction = scale === 0 ? "" : `.${digits.slice(digits.length - scale)}`;
  return `${negative ? "-" : ""}${whole}${fraction}`;
}

function toNumber(value: Decimal): number {
  return Number(value.units) / Number(pow10(value.scale));
}

// ---------------------------------------------------------------------------
// Span level XML scanner
// ---------------------------------------------------------------------------

/**
 * An attribute and the exact bytes its value occupies in the source.
 *
 * The rewrite is a set of substitutions over those spans, never a serialisation
 * of a parsed tree. Serialising would reorder attributes, normalise whitespace
 * and rewrite the namespace declarations, and the whole claim of this fixture is
 * that its shape is the shape a PAC emitted.
 */
interface Attribute {
  name: string;
  localName: string;
  /** Exactly as written between the quotes, entities included. */
  raw: string;
  /** Entity decoded, which is what a comparison and a replacement work on. */
  value: string;
  start: number;
  end: number;
}

interface Element {
  name: string;
  prefix: string;
  localName: string;
  attributes: Attribute[];
  children: Element[];
  parent: Element | undefined;
}

function isSpaceCode(code: number): boolean {
  return code === 0x20 || code === 0x09 || code === 0x0a || code === 0x0d;
}

function isNameCode(code: number): boolean {
  return (
    (code >= 0x41 && code <= 0x5a) ||
    (code >= 0x61 && code <= 0x7a) ||
    (code >= 0x30 && code <= 0x39) ||
    code === 0x5f ||
    code === 0x2d ||
    code === 0x2e ||
    code === 0x3a
  );
}

function localNameOf(name: string): string {
  const colon = name.indexOf(":");
  return colon === -1 ? name : name.slice(colon + 1);
}

function prefixOf(name: string): string {
  const colon = name.indexOf(":");
  return colon === -1 ? "" : name.slice(0, colon);
}

/**
 * Reads the document a second time, keeping offsets.
 *
 * `parseXml` from the engine has already accepted the document by the time this
 * runs, so this pass is deliberately simple: it may assume well formed input and
 * only has to agree with the engine about where one tag ends and the next
 * begins.
 */
function scan(source: string): Element | undefined {
  const stack: Element[] = [];
  let root: Element | undefined;
  let index = 0;

  while (index < source.length) {
    const open = source.indexOf("<", index);
    if (open === -1) {
      break;
    }
    index = open;
    if (source.startsWith("<!--", index)) {
      const end = source.indexOf("-->", index + 4);
      if (end === -1) {
        return undefined;
      }
      index = end + 3;
      continue;
    }
    if (source.startsWith("<![CDATA[", index)) {
      const end = source.indexOf("]]>", index + 9);
      if (end === -1) {
        return undefined;
      }
      index = end + 3;
      continue;
    }
    if (source.startsWith("<?", index)) {
      const end = source.indexOf("?>", index + 2);
      if (end === -1) {
        return undefined;
      }
      index = end + 2;
      continue;
    }
    if (source.startsWith("</", index)) {
      const end = source.indexOf(">", index + 2);
      if (end === -1) {
        return undefined;
      }
      stack.pop();
      index = end + 1;
      continue;
    }
    if (source.startsWith("<!", index)) {
      const end = source.indexOf(">", index + 2);
      if (end === -1) {
        return undefined;
      }
      index = end + 1;
      continue;
    }

    index += 1;
    const nameStart = index;
    while (index < source.length && isNameCode(source.charCodeAt(index))) {
      index += 1;
    }
    const name = source.slice(nameStart, index);
    if (name === "") {
      return undefined;
    }

    const attributes: Attribute[] = [];
    let selfClosing = false;
    let closed = false;
    while (index < source.length) {
      while (index < source.length && isSpaceCode(source.charCodeAt(index))) {
        index += 1;
      }
      const char = source[index];
      if (char === ">") {
        index += 1;
        closed = true;
        break;
      }
      if (char === "/") {
        index += 2;
        selfClosing = true;
        closed = true;
        break;
      }
      const attributeStart = index;
      while (index < source.length && isNameCode(source.charCodeAt(index))) {
        index += 1;
      }
      const attributeName = source.slice(attributeStart, index);
      if (attributeName === "") {
        return undefined;
      }
      while (index < source.length && isSpaceCode(source.charCodeAt(index))) {
        index += 1;
      }
      if (source[index] !== "=") {
        return undefined;
      }
      index += 1;
      while (index < source.length && isSpaceCode(source.charCodeAt(index))) {
        index += 1;
      }
      const quote = source[index];
      if (quote !== '"' && quote !== "'") {
        return undefined;
      }
      index += 1;
      const valueEnd = source.indexOf(quote, index);
      if (valueEnd === -1) {
        return undefined;
      }
      const raw = source.slice(index, valueEnd);
      attributes.push({
        name: attributeName,
        localName: localNameOf(attributeName),
        raw,
        value: decodeXmlEntities(raw),
        start: index,
        end: valueEnd,
      });
      index = valueEnd + 1;
    }
    if (!closed) {
      return undefined;
    }

    const parent = stack[stack.length - 1];
    const element: Element = {
      name,
      prefix: prefixOf(name),
      localName: localNameOf(name),
      attributes,
      children: [],
      parent,
    };
    if (parent === undefined) {
      if (root !== undefined) {
        return undefined;
      }
      root = element;
    } else {
      parent.children.push(element);
    }
    if (!selfClosing) {
      stack.push(element);
    }
  }

  return stack.length === 0 ? root : undefined;
}

function childrenOf(
  element: Element | undefined,
  localName: string,
): Element[] {
  if (element === undefined) {
    return [];
  }
  return element.children.filter((child) => child.localName === localName);
}

function childOf(
  element: Element | undefined,
  localName: string,
): Element | undefined {
  return childrenOf(element, localName)[0];
}

function attributeOf(
  element: Element | undefined,
  localName: string,
): Attribute | undefined {
  if (element === undefined) {
    return undefined;
  }
  return element.attributes.find((entry) => entry.localName === localName);
}

function walk(element: Element, visit: (node: Element) => void): void {
  visit(element);
  for (const child of element.children) {
    walk(child, visit);
  }
}

/** `cfdi:Comprobante/cfdi:Conceptos/cfdi:Concepto[2]`, for the change map. */
function pathOf(element: Element): string {
  const parent = element.parent;
  if (parent === undefined) {
    return element.name;
  }
  const siblings = parent.children.filter(
    (child) => child.name === element.name,
  );
  const suffix =
    siblings.length > 1 ? `[${siblings.indexOf(element) + 1}]` : "";
  return `${pathOf(parent)}/${element.name}${suffix}`;
}

/**
 * Escapes for either delimiter, because a PAC is free to write an attribute in
 * single quotes and a replacement dropped into one of those unescaped would end
 * the value early and produce a document that no longer parses.
 */
function escapeXmlAttribute(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// ---------------------------------------------------------------------------
// Pseudonyms, all of them derived from the factor
// ---------------------------------------------------------------------------

const DIGITS = "0123456789".split("");
const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
const HOMOCLAVE_ALPHABET = [...DIGITS, ...LETTERS];

/**
 * The SAT alphabet for the RFC verification digit. The index is the value, so
 * `0` is 0, `A` is 10, `&` is 24, `O` is 25, `Z` is 36 and a space is 37. The
 * enie is 38 and is the only character outside this string.
 */
const RFC_ALPHABET = "0123456789ABCDEFGHIJKLMN&OPQRSTUVWXYZ ";
const RFC_ENIE_VALUE = 38;
const RFC_SPACE_VALUE = 37;
const RFC_CHECK_MODULUS = 11;
const RFC_FIRST_WEIGHT = 13;
const RFC_STEM_LENGTH = 12;

function rfcCharacterValue(character: string): number {
  if (character === "Ñ") {
    return RFC_ENIE_VALUE;
  }
  const index = RFC_ALPHABET.indexOf(character);
  return index === -1 ? RFC_SPACE_VALUE : index;
}

/**
 * The published SAT verification digit: weight the twelve positions by 13 down
 * to 2, take the sum modulo 11, and map a remainder of 0 to "0", 1 to "A" and
 * anything else to eleven minus the remainder.
 *
 * A twelve character RFC, which is what a company has, is padded on the left
 * with a space, which is why the space has a value at all. Computing it rather
 * than inventing a last character is what keeps a synthetic RFC from failing a
 * validator for a reason that has nothing to do with the test.
 */
export function rfcCheckDigit(stem: string): string {
  const padded = stem.padStart(RFC_STEM_LENGTH, " ").slice(-RFC_STEM_LENGTH);
  let sum = 0;
  for (let index = 0; index < padded.length; index += 1) {
    sum += rfcCharacterValue(padded[index]) * (RFC_FIRST_WEIGHT - index);
  }
  const remainder = sum % RFC_CHECK_MODULUS;
  if (remainder === 0) {
    return "0";
  }
  if (remainder === 1) {
    return "A";
  }
  return String(RFC_CHECK_MODULUS - remainder);
}

/** True when the last character of an RFC is the digit the SAT rule produces. */
export function hasValidRfcCheckDigit(rfc: string): boolean {
  const value = rfc.trim().toUpperCase();
  if (value.length < 2) {
    return false;
  }
  return rfcCheckDigit(value.slice(0, -1)) === value.slice(-1);
}

function digest(
  secret: string,
  kind: string,
  value: string,
  salt: number,
): Buffer {
  return createHash("sha256")
    .update(`${DERIVATION_LABEL}|${secret}|${kind}|${value}|${salt}`)
    .digest();
}

function pick<T>(list: readonly T[], byte: number): T {
  return list[byte % list.length];
}

function pad2(value: number): string {
  return value.toString().padStart(2, "0");
}

const MIN_SYNTHETIC_YEAR = 10;
const SYNTHETIC_YEAR_SPAN = 90;
const MONTHS_IN_YEAR = 12;
/** Days 1 to 28 only, so a synthetic date is valid in every month. */
const SAFE_DAYS = 28;
const PERSONA_FISICA_RFC_LENGTH = 13;

/**
 * A synthetic RFC: `SYN`, a plausible date, two homoclave characters and the
 * real check digit over all of it. The length of the original is kept, so a
 * persona fisica stays thirteen characters and a company stays twelve.
 */
function syntheticRfc(bytes: Buffer, length: number): string {
  const head =
    length >= PERSONA_FISICA_RFC_LENGTH
      ? `${SYNTHETIC_RFC_PREFIX}${pick(LETTERS, bytes[0])}`
      : SYNTHETIC_RFC_PREFIX;
  const year = MIN_SYNTHETIC_YEAR + (bytes[1] % SYNTHETIC_YEAR_SPAN);
  const month = 1 + (bytes[2] % MONTHS_IN_YEAR);
  const day = 1 + (bytes[3] % SAFE_DAYS);
  const homoclave = `${pick(HOMOCLAVE_ALPHABET, bytes[4])}${pick(
    HOMOCLAVE_ALPHABET,
    bytes[5],
  )}`;
  const stem = `${head}${pad2(year)}${pad2(month)}${pad2(day)}${homoclave}`;
  return `${stem}${rfcCheckDigit(stem)}`;
}

const UUID_HEX_LENGTH = 32;
const UUID_VARIANTS = "89ab";

/** A version 4 shaped UUID, so the parser accepts it as a timbre UUID. */
function syntheticUuid(bytes: Buffer, lowercase: boolean): string {
  const hex = bytes.toString("hex").slice(0, UUID_HEX_LENGTH).split("");
  hex[12] = "4";
  hex[16] = UUID_VARIANTS[bytes[16] % UUID_VARIANTS.length];
  const joined = hex.join("");
  const uuid = [
    joined.slice(0, 8),
    joined.slice(8, 12),
    joined.slice(12, 16),
    joined.slice(16, 20),
    joined.slice(20, 32),
  ].join("-");
  return lowercase ? uuid : uuid.toUpperCase();
}

/**
 * Rewrites a token character by character, keeping its classes: a digit stays a
 * digit and a letter stays a letter. A folio of four digits comes back as four
 * digits, so nothing downstream that reads a length or a shape changes its mind.
 */
function maskToken(bytes: Buffer, original: string): string {
  let masked = "";
  for (let index = 0; index < original.length; index += 1) {
    const character = original[index];
    const byte = bytes[index % bytes.length];
    if (character >= "0" && character <= "9") {
      masked += pick(DIGITS, byte);
    } else if (character >= "A" && character <= "Z") {
      masked += pick(LETTERS, byte);
    } else if (character >= "a" && character <= "z") {
      masked += pick(LETTERS, byte).toLowerCase();
    } else {
      masked += character;
    }
  }
  return masked;
}

const CLABE_DIGITS = 18;
const CLABE_INSTITUTION_DIGITS = 3;
const DEFAULT_CLABE_INSTITUTION = "012";
const CLABE_PATTERN = /^\d{18}$/;

/**
 * A synthetic CLABE with a correct control digit, keeping the three digit
 * institution code of the original.
 *
 * The bank is kept because the CLABE control reads it, and a fixture whose bank
 * code was invented would exercise that control against nothing. The eleven
 * digit account, which is the part that identifies the company, is replaced.
 */
function syntheticClabe(bytes: Buffer, original: string): string {
  if (!CLABE_PATTERN.test(original)) {
    return maskToken(bytes, original);
  }
  let body = original.slice(0, CLABE_INSTITUTION_DIGITS);
  if (body === "000") {
    body = DEFAULT_CLABE_INSTITUTION;
  }
  for (let index = body.length; index < CLABE_DIGITS - 1; index += 1) {
    body += pick(DIGITS, bytes[index % bytes.length]);
  }
  return `${body}${clabeCheckDigit(body)}`;
}

/**
 * Legal form suffixes, the longer forms first so that `S.A. DE C.V.` wins over
 * `S.A.`.
 *
 * The suffix of the original is kept verbatim. It identifies nobody, it is what
 * the name normalisation in `packages/cep` strips before comparing two names,
 * and keeping it is what makes this fixture useful to that comparison.
 */
const LEGAL_SUFFIX_PATTERN =
  /,?\s*(S\.?\s?A\.?\s?P\.?\s?I\.?|S\.?\s?A\.?\s?S\.?|S\.?\s?DE\s?R\.?\s?L\.?|S\.?\s?A\.?|S\.?\s?C\.?|A\.?\s?C\.?)(\s*DE\s*C\.?\s?V\.?)?\.?\s*$/i;

const COMPANY_HEADS = [
  "DISTRIBUIDORA",
  "MANUFACTURAS",
  "SERVICIOS",
  "COMERCIALIZADORA",
  "INSUMOS",
  "REFACCIONES",
  "TRANSPORTES",
  "SUMINISTROS",
  "PROVEEDORA",
  "INDUSTRIAS",
] as const;

const COMPANY_PLACES = [
  "DEL NORTE",
  "DEL PONIENTE",
  "DE MONTERREY",
  "DEL VALLE",
  "DE APODACA",
  "DEL BOSQUE",
  "DE ORIENTE",
  "DE OCCIDENTE",
  "DE LA SIERRA",
  "DEL CENTRO",
] as const;

const PERSON_FIRST_NAMES = [
  "MARIA",
  "JOSE",
  "ANA",
  "LUIS",
  "SOFIA",
  "MIGUEL",
  "CARMEN",
  "JAVIER",
] as const;

const PERSON_SURNAMES = [
  "RIVERA",
  "SALAZAR",
  "TREVINO",
  "VILLARREAL",
  "CANTU",
  "MONTEMAYOR",
  "ELIZONDO",
  "LOZANO",
] as const;

/**
 * A constructed legal name carrying the word DEMO, which is the marker the other
 * fixtures already use, so a name that reaches a screenshot reads as generated
 * to anyone looking at it.
 */
function syntheticCompanyName(bytes: Buffer, original: string): string {
  const suffix = LEGAL_SUFFIX_PATTERN.exec(original)?.[0] ?? "";
  return `${pick(COMPANY_HEADS, bytes[0])} DEMO ${pick(
    COMPANY_PLACES,
    bytes[1],
  )}${suffix}`;
}

function syntheticPersonName(bytes: Buffer): string {
  return `${pick(PERSON_FIRST_NAMES, bytes[0])} DEMO ${pick(
    PERSON_SURNAMES,
    bytes[1],
  )} ${pick(PERSON_SURNAMES, bytes[2])}`;
}

const CURP_SEX = ["H", "M"] as const;
const CURP_STATE_LETTERS = 5;

/** A CURP shaped token. Nomina is out of scope, but a blank CURP is a leak. */
function syntheticCurp(bytes: Buffer): string {
  const head = Array.from({ length: 4 }, (_value, index) =>
    pick(LETTERS, bytes[index]),
  ).join("");
  const year = MIN_SYNTHETIC_YEAR + (bytes[4] % SYNTHETIC_YEAR_SPAN);
  const month = 1 + (bytes[5] % MONTHS_IN_YEAR);
  const day = 1 + (bytes[6] % SAFE_DAYS);
  const tail = Array.from({ length: CURP_STATE_LETTERS }, (_value, index) =>
    pick(LETTERS, bytes[8 + index]),
  ).join("");
  const homoclave = `${pick(HOMOCLAVE_ALPHABET, bytes[13])}${pick(
    DIGITS,
    bytes[14],
  )}`;
  const date = `${pad2(year)}${pad2(month)}${pad2(day)}`;
  return `${head}${date}${pick(CURP_SEX, bytes[7])}${tail}${homoclave}`;
}

/**
 * Keeps one replacement per original value, for the life of one factor.
 *
 * Consistency is the whole point. An invoice and the complement that settles it
 * are two files and two runs, and they only stay one story if the supplier RFC
 * maps to the same synthetic RFC in both, and if `IdDocumento` in the complement
 * lands on the UUID the invoice was given. Two different originals never share a
 * replacement either: a collision would merge two suppliers into one, which is a
 * silent corruption of the very data the duplicate detector reads.
 */
interface Registry {
  map(kind: string, original: string, build: (bytes: Buffer) => string): string;
}

const MAX_COLLISION_ATTEMPTS = 64;

function createRegistry(secret: string): Registry {
  const assigned = new Map<string, string>();
  const taken = new Set<string>();
  return {
    map(kind, original, build) {
      const key = `${kind}|${original}`;
      const existing = assigned.get(key);
      if (existing !== undefined) {
        return existing;
      }
      for (let salt = 0; salt < MAX_COLLISION_ATTEMPTS; salt += 1) {
        const candidate = build(digest(secret, kind, original, salt));
        if (!taken.has(`${kind}|${candidate}`)) {
          assigned.set(key, candidate);
          taken.add(`${kind}|${candidate}`);
          return candidate;
        }
      }
      throw new Error(`could not derive a unique replacement for a ${kind}`);
    },
  };
}

// ---------------------------------------------------------------------------
// What each attribute is
// ---------------------------------------------------------------------------

/**
 * The amounts, named one by one rather than matched by a prefix.
 *
 * A pattern over attribute names would have scaled `ImpuestoDR`, which is the
 * three digit tax code 002 and not an amount, and a document whose IVA code had
 * been multiplied by 0.61 would still have parsed. Anything decimal that is not
 * in this set is reported at the end of the run instead of being touched.
 */
const AMOUNT_ATTRIBUTES = new Set([
  // cfdi:Comprobante
  "SubTotal",
  "Descuento",
  "Total",
  // cfdi:Concepto
  "ValorUnitario",
  "Importe",
  // cfdi:Impuestos, cfdi:Traslado, cfdi:Retencion
  "Base",
  "TotalImpuestosTrasladados",
  "TotalImpuestosRetenidos",
  // pago20:Pago and pago20:DoctoRelacionado
  "Monto",
  "ImpPagado",
  "ImpSaldoAnt",
  "ImpSaldoInsoluto",
  "BaseDR",
  "ImporteDR",
  "BaseP",
  "ImporteP",
  // pago20:Totales
  "MontoTotalPagos",
  "TotalTrasladosBaseIVA16",
  "TotalTrasladosImpuestoIVA16",
  "TotalTrasladosBaseIVA8",
  "TotalTrasladosImpuestoIVA8",
  "TotalTrasladosBaseIVA0",
  "TotalTrasladosImpuestoIVA0",
  "TotalTrasladosBaseIVAExento",
  "TotalRetencionesIVA",
  "TotalRetencionesISR",
  "TotalRetencionesIEPS",
]);

const POSTAL_ATTRIBUTES = new Set([
  "LugarExpedicion",
  "DomicilioFiscalReceptor",
  "CodigoPostal",
]);

const ADDRESS_ATTRIBUTES = new Set([
  "Calle",
  "NumeroExterior",
  "NumeroInterior",
  "Colonia",
  "Localidad",
  "Referencia",
  "Municipio",
]);

const UUID_ATTRIBUTES = new Set(["UUID", "IdDocumento"]);
const ACCOUNT_ATTRIBUTES = new Set(["CtaOrdenante", "CtaBeneficiario"]);
const SIGNATURE_ATTRIBUTES = new Set([
  "Sello",
  "SelloCFD",
  "SelloSAT",
  "SelloPago",
  "CadPago",
]);
const CERTIFICATE_ATTRIBUTES = new Set(["Certificado", "CertPago"]);
const SERIAL_ATTRIBUTES = new Set([
  "NoCertificado",
  "NoCertificadoSAT",
  "NumRegIdTrib",
  "RegistroPatronal",
  "NumSeguridadSocial",
  "NumEmpleado",
]);
const OPERATION_ATTRIBUTES = new Set(["NumOperacion"]);
const CONTACT_ATTRIBUTES = new Set(["Telefono", "Correo", "Email"]);
const NAME_ATTRIBUTES = new Set(["RazonSocial", "NomBancoOrdExt"]);

/** Attributes kept verbatim that a person still has to read before committing. */
const FREE_TEXT_ATTRIBUTES = new Set([
  "Descripcion",
  "NoIdentificacion",
  "CondicionesDePago",
  "Unidad",
]);

/**
 * Decimal looking attributes that are not money, so that the run can report
 * every other unscaled decimal as something a human should look at. A rate, a
 * quantity and a catalogue code all read as numbers and none of them is an
 * amount: scaling a quantity would break the unit price of its own line.
 */
const KNOWN_NON_AMOUNTS = new Set([
  "Version",
  "Cantidad",
  "NumParcialidad",
  "TasaOCuota",
  "TasaOCuotaDR",
  "TasaOCuotaP",
  "TipoCambio",
  "TipoCambioP",
  "TipoCambioDR",
  "EquivalenciaDR",
  "FormaPago",
  "FormaDePagoP",
  "MetodoPago",
  "Exportacion",
  "RegimenFiscal",
  "RegimenFiscalReceptor",
  "ClaveProdServ",
  "ClaveUnidad",
  "ObjetoImp",
  "ObjetoImpDR",
  "Impuesto",
  "ImpuestoDR",
  "ImpuestoP",
  "UsoCFDI",
  "NumCtaPago",
]);

type ChangeKind =
  | "amount"
  | "rfc"
  | "name"
  | "address"
  | "uuid"
  | "folio"
  | "serie"
  | "account"
  | "operation"
  | "serial"
  | "signature"
  | "certificate"
  | "curp"
  | "contact"
  | "blank";

function classify(attribute: Attribute): ChangeKind | undefined {
  const { name, localName } = attribute;
  if (
    name === "xmlns" ||
    name.startsWith("xmlns:") ||
    localName === "schemaLocation"
  ) {
    return undefined;
  }
  if (AMOUNT_ATTRIBUTES.has(localName)) {
    return "amount";
  }
  if (UUID_ATTRIBUTES.has(localName)) {
    return "uuid";
  }
  if (localName === "Folio") {
    return "folio";
  }
  if (localName === "Serie") {
    return "serie";
  }
  if (SIGNATURE_ATTRIBUTES.has(localName)) {
    return "signature";
  }
  if (CERTIFICATE_ATTRIBUTES.has(localName)) {
    return "certificate";
  }
  if (SERIAL_ATTRIBUTES.has(localName)) {
    return "serial";
  }
  if (OPERATION_ATTRIBUTES.has(localName)) {
    return "operation";
  }
  if (ACCOUNT_ATTRIBUTES.has(localName)) {
    return "account";
  }
  if (localName === "Curp") {
    return "curp";
  }
  if (CONTACT_ATTRIBUTES.has(localName)) {
    return "contact";
  }
  if (POSTAL_ATTRIBUTES.has(localName) || ADDRESS_ATTRIBUTES.has(localName)) {
    return "address";
  }
  if (NAME_ATTRIBUTES.has(localName) || localName.includes("Nombre")) {
    return "name";
  }
  if (localName.includes("Rfc")) {
    return "rfc";
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// The arithmetic the document already satisfied
// ---------------------------------------------------------------------------

/**
 * A relation is one identity the document may or may not satisfy, for example
 * `Total = SubTotal - Descuento + trasladados - retenidos`.
 *
 * Each one is evaluated twice. On the original it answers one question: did this
 * PAC round this way? Only when the answer is yes is the target recomputed from
 * the scaled inputs, so a document that was internally inconsistent before the
 * scaling stays exactly as inconsistent afterwards, and a document that added up
 * still adds up. Silently correcting the first kind would hand the duplicate and
 * reconciliation detectors a document no PAC ever issues.
 */
interface Relation {
  label: string;
  target: Attribute;
  compute: (read: Reader) => Decimal | undefined;
}

type Reader = (attribute: Attribute) => Decimal | undefined;

const ZERO: Decimal = { units: 0n, scale: 0 };

function sumOf(
  read: Reader,
  attributes: readonly (Attribute | undefined)[],
): Decimal | undefined {
  let total = ZERO;
  for (const attribute of attributes) {
    if (attribute === undefined) {
      return undefined;
    }
    const value = read(attribute);
    if (value === undefined) {
      return undefined;
    }
    total = addDecimal(total, value);
  }
  return total;
}

function readOrZero(
  read: Reader,
  attribute: Attribute | undefined,
): Decimal | undefined {
  return attribute === undefined ? ZERO : read(attribute);
}

function taxNodes(
  parent: Element | undefined,
  group: string,
  item: string,
): Element[] {
  return childrenOf(childOf(parent, group), item);
}

function groupKey(
  element: Element,
  tax: string,
  factor: string,
  rate: string,
): string {
  return [
    attributeOf(element, tax)?.value ?? "",
    attributeOf(element, factor)?.value ?? "",
    attributeOf(element, rate)?.value ?? "",
  ].join("|");
}

/** `Importe = Base x TasaOCuota`, for every node taxed at a rate. */
function rateRelations(
  nodes: readonly Element[],
  base: string,
  amount: string,
  factor: string,
  rate: string,
): Relation[] {
  const relations: Relation[] = [];
  for (const node of nodes) {
    if (attributeOf(node, factor)?.value !== "Tasa") {
      continue;
    }
    const target = attributeOf(node, amount);
    const baseAttribute = attributeOf(node, base);
    const rateAttribute = attributeOf(node, rate);
    if (target === undefined || baseAttribute === undefined) {
      continue;
    }
    if (rateAttribute === undefined) {
      continue;
    }
    relations.push({
      label: `${pathOf(node)}/@${amount} = ${base} x ${rate}`,
      target,
      compute: (read) => {
        const taxable = read(baseAttribute);
        const applied = read(rateAttribute);
        return taxable && applied
          ? multiplyDecimal(taxable, applied)
          : undefined;
      },
    });
  }
  return relations;
}

function ingresoRelations(root: Element): Relation[] {
  const relations: Relation[] = [];
  const concepts = childrenOf(childOf(root, "Conceptos"), "Concepto");
  const conceptTraslados: Element[] = [];

  for (const concept of concepts) {
    const importe = attributeOf(concept, "Importe");
    const cantidad = attributeOf(concept, "Cantidad");
    const valorUnitario = attributeOf(concept, "ValorUnitario");
    if (
      importe !== undefined &&
      cantidad !== undefined &&
      valorUnitario !== undefined
    ) {
      relations.push({
        label: `${pathOf(concept)}/@Importe = Cantidad x ValorUnitario`,
        target: importe,
        compute: (read) => {
          const quantity = read(cantidad);
          const unit = read(valorUnitario);
          return quantity && unit ? multiplyDecimal(quantity, unit) : undefined;
        },
      });
    }
    const taxes = childOf(concept, "Impuestos");
    const traslados = taxNodes(taxes, "Traslados", "Traslado");
    const retenciones = taxNodes(taxes, "Retenciones", "Retencion");
    conceptTraslados.push(...traslados);

    // The taxable base of a line is the line, less its discount. Recomputing it
    // is what keeps `Base` and `Importe` equal on the usual line, which has no
    // discount, after the line was recomputed from a rounded unit price.
    const conceptDescuento = attributeOf(concept, "Descuento");
    for (const node of [...traslados, ...retenciones]) {
      const base = attributeOf(node, "Base");
      if (base === undefined || importe === undefined) {
        continue;
      }
      relations.push({
        label: `${pathOf(node)}/@Base = the concept importe less its discount`,
        target: base,
        compute: (read) => {
          const line = read(importe);
          const discount = readOrZero(read, conceptDescuento);
          return line && discount ? subtractDecimal(line, discount) : undefined;
        },
      });
    }

    relations.push(
      ...rateRelations(
        traslados,
        "Base",
        "Importe",
        "TipoFactor",
        "TasaOCuota",
      ),
      ...rateRelations(
        retenciones,
        "Base",
        "Importe",
        "TipoFactor",
        "TasaOCuota",
      ),
    );
  }

  const subTotal = attributeOf(root, "SubTotal");
  const conceptImportes = concepts.map((concept) =>
    attributeOf(concept, "Importe"),
  );
  if (subTotal !== undefined && conceptImportes.length > 0) {
    relations.push({
      label: `${root.name}/@SubTotal = sum of the concept importes`,
      target: subTotal,
      compute: (read) => sumOf(read, conceptImportes),
    });
  }

  const descuento = attributeOf(root, "Descuento");
  const conceptDescuentos = concepts
    .map((concept) => attributeOf(concept, "Descuento"))
    .filter((attribute): attribute is Attribute => attribute !== undefined);
  if (descuento !== undefined && conceptDescuentos.length > 0) {
    relations.push({
      label: `${root.name}/@Descuento = sum of the concept discounts`,
      target: descuento,
      compute: (read) => sumOf(read, conceptDescuentos),
    });
  }

  const impuestos = childOf(root, "Impuestos");
  const traslados = taxNodes(impuestos, "Traslados", "Traslado");
  const retenciones = taxNodes(impuestos, "Retenciones", "Retencion");

  for (const traslado of traslados) {
    const base = attributeOf(traslado, "Base");
    if (base === undefined) {
      continue;
    }
    const key = groupKey(traslado, "Impuesto", "TipoFactor", "TasaOCuota");
    const sources = conceptTraslados
      .filter(
        (node) =>
          groupKey(node, "Impuesto", "TipoFactor", "TasaOCuota") === key,
      )
      .map((node) => attributeOf(node, "Base"));
    if (sources.length === 0) {
      continue;
    }
    relations.push({
      label: `${pathOf(traslado)}/@Base = sum of the concept bases at the same rate`,
      target: base,
      compute: (read) => sumOf(read, sources),
    });
  }

  relations.push(
    ...rateRelations(traslados, "Base", "Importe", "TipoFactor", "TasaOCuota"),
    ...rateRelations(
      retenciones,
      "Base",
      "Importe",
      "TipoFactor",
      "TasaOCuota",
    ),
  );

  const totalTrasladados = attributeOf(impuestos, "TotalImpuestosTrasladados");
  const trasladoImportes = traslados.map((node) =>
    attributeOf(node, "Importe"),
  );
  if (totalTrasladados !== undefined && trasladoImportes.length > 0) {
    relations.push({
      label: "cfdi:Impuestos/@TotalImpuestosTrasladados = sum of the traslados",
      target: totalTrasladados,
      compute: (read) => sumOf(read, trasladoImportes),
    });
  }

  const totalRetenidos = attributeOf(impuestos, "TotalImpuestosRetenidos");
  const retencionImportes = retenciones.map((node) =>
    attributeOf(node, "Importe"),
  );
  if (totalRetenidos !== undefined && retencionImportes.length > 0) {
    relations.push({
      label: "cfdi:Impuestos/@TotalImpuestosRetenidos = sum of the retenciones",
      target: totalRetenidos,
      compute: (read) => sumOf(read, retencionImportes),
    });
  }

  const total = attributeOf(root, "Total");
  if (total !== undefined && subTotal !== undefined) {
    relations.push({
      label: `${root.name}/@Total = SubTotal - Descuento + trasladados - retenidos`,
      target: total,
      compute: (read) => {
        const net = read(subTotal);
        const discount = readOrZero(read, descuento);
        const transferred = readOrZero(read, totalTrasladados);
        const withheld = readOrZero(read, totalRetenidos);
        if (!net || !discount || !transferred || !withheld) {
          return undefined;
        }
        return subtractDecimal(
          addDecimal(subtractDecimal(net, discount), transferred),
          withheld,
        );
      },
    });
  }

  return relations;
}

const IVA_RATE_TAGS = [
  { tag: "IVA16", rate: "0.160000" },
  { tag: "IVA8", rate: "0.080000" },
  { tag: "IVA0", rate: "0.000000" },
] as const;

function pagosRelations(root: Element): Relation[] {
  const relations: Relation[] = [];
  const pagos = childOf(childOf(root, "Complemento"), "Pagos");
  const payments = childrenOf(pagos, "Pago");
  const everyTrasladoP: Element[] = [];

  for (const payment of payments) {
    const documents = childrenOf(payment, "DoctoRelacionado");
    const documentTraslados: Element[] = [];

    for (const document of documents) {
      const taxes = childOf(document, "ImpuestosDR");
      const traslados = taxNodes(taxes, "TrasladosDR", "TrasladoDR");
      const retenciones = taxNodes(taxes, "RetencionesDR", "RetencionDR");
      documentTraslados.push(...traslados);
      relations.push(
        ...rateRelations(
          traslados,
          "BaseDR",
          "ImporteDR",
          "TipoFactorDR",
          "TasaOCuotaDR",
        ),
        ...rateRelations(
          retenciones,
          "BaseDR",
          "ImporteDR",
          "TipoFactorDR",
          "TasaOCuotaDR",
        ),
      );

      // What was paid on this invoice is its base plus the tax transferred on it
      // less anything withheld. The base is read once rather than summed, since
      // two taxes on one document are two rates over the same base.
      const pagado = attributeOf(document, "ImpPagado");
      const firstBase = attributeOf(traslados[0], "BaseDR");
      const transferred = traslados.map((node) =>
        attributeOf(node, "ImporteDR"),
      );
      const withheld = retenciones.map((node) =>
        attributeOf(node, "ImporteDR"),
      );
      if (pagado !== undefined && firstBase !== undefined) {
        relations.push({
          label: `${pathOf(document)}/@ImpPagado = BaseDR plus the tax on it`,
          target: pagado,
          compute: (read) => {
            const base = read(firstBase);
            const added = sumOf(read, transferred);
            const removed = sumOf(read, withheld);
            if (!base || !added || !removed) {
              return undefined;
            }
            return subtractDecimal(addDecimal(base, added), removed);
          },
        });
      }

      const insoluto = attributeOf(document, "ImpSaldoInsoluto");
      const anterior = attributeOf(document, "ImpSaldoAnt");
      if (
        insoluto !== undefined &&
        anterior !== undefined &&
        pagado !== undefined
      ) {
        relations.push({
          label: `${pathOf(document)}/@ImpSaldoInsoluto = ImpSaldoAnt - ImpPagado`,
          target: insoluto,
          compute: (read) => {
            const previous = read(anterior);
            const paid = read(pagado);
            return previous && paid
              ? subtractDecimal(previous, paid)
              : undefined;
          },
        });
      }
    }

    const trasladosP = taxNodes(
      childOf(payment, "ImpuestosP"),
      "TrasladosP",
      "TrasladoP",
    );
    everyTrasladoP.push(...trasladosP);
    for (const traslado of trasladosP) {
      const base = attributeOf(traslado, "BaseP");
      if (base === undefined) {
        continue;
      }
      const key = groupKey(traslado, "ImpuestoP", "TipoFactorP", "TasaOCuotaP");
      const sources = documentTraslados
        .filter(
          (node) =>
            groupKey(node, "ImpuestoDR", "TipoFactorDR", "TasaOCuotaDR") ===
            key,
        )
        .map((node) => attributeOf(node, "BaseDR"));
      if (sources.length === 0) {
        continue;
      }
      relations.push({
        label: `${pathOf(traslado)}/@BaseP = sum of the related bases at the same rate`,
        target: base,
        compute: (read) => sumOf(read, sources),
      });
    }
    relations.push(
      ...rateRelations(
        trasladosP,
        "BaseP",
        "ImporteP",
        "TipoFactorP",
        "TasaOCuotaP",
      ),
      ...rateRelations(
        taxNodes(childOf(payment, "ImpuestosP"), "RetencionesP", "RetencionP"),
        "BaseP",
        "ImporteP",
        "TipoFactorP",
        "TasaOCuotaP",
      ),
    );

    const monto = attributeOf(payment, "Monto");
    const paidAmounts = documents.map((document) =>
      attributeOf(document, "ImpPagado"),
    );
    if (monto !== undefined && paidAmounts.length > 0) {
      relations.push({
        label: `${pathOf(payment)}/@Monto = sum of the related ImpPagado`,
        target: monto,
        compute: (read) => sumOf(read, paidAmounts),
      });
    }
  }

  const totales = childOf(pagos, "Totales");
  const montoTotal = attributeOf(totales, "MontoTotalPagos");
  const montos = payments.map((payment) => attributeOf(payment, "Monto"));
  if (montoTotal !== undefined && montos.length > 0) {
    relations.push({
      label: "pago20:Totales/@MontoTotalPagos = sum of the payments",
      target: montoTotal,
      compute: (read) => sumOf(read, montos),
    });
  }

  for (const { tag, rate } of IVA_RATE_TAGS) {
    const expected = parseDecimal(rate);
    const matching = everyTrasladoP.filter((node) => {
      const written = attributeOf(node, "TasaOCuotaP")?.value;
      const parsed = written === undefined ? undefined : parseDecimal(written);
      return (
        parsed !== undefined &&
        expected !== undefined &&
        equalsDecimal(parsed, expected)
      );
    });
    if (matching.length === 0) {
      continue;
    }
    const base = attributeOf(totales, `TotalTrasladosBase${tag}`);
    if (base !== undefined) {
      const sources = matching.map((node) => attributeOf(node, "BaseP"));
      relations.push({
        label: `pago20:Totales/@TotalTrasladosBase${tag} = sum of the bases at that rate`,
        target: base,
        compute: (read) => sumOf(read, sources),
      });
    }
    const tax = attributeOf(totales, `TotalTrasladosImpuesto${tag}`);
    if (tax !== undefined) {
      const sources = matching.map((node) => attributeOf(node, "ImporteP"));
      relations.push({
        label: `pago20:Totales/@TotalTrasladosImpuesto${tag} = sum of the taxes at that rate`,
        target: tax,
        compute: (read) => sumOf(read, sources),
      });
    }
  }

  return relations;
}

export type DocumentType = "ingreso" | "pagos";

function relationsFor(root: Element, type: DocumentType): Relation[] {
  return type === "ingreso" ? ingresoRelations(root) : pagosRelations(root);
}

function decimalsOf(root: Element): Map<Attribute, Decimal> {
  const values = new Map<Attribute, Decimal>();
  walk(root, (node) => {
    for (const entry of node.attributes) {
      const parsed = parseDecimal(entry.value);
      if (parsed !== undefined) {
        values.set(entry, parsed);
      }
    }
  });
  return values;
}

/** Which identities this document satisfies, by label. */
function relationStatus(
  root: Element,
  type: DocumentType,
): Map<string, boolean> {
  const values = decimalsOf(root);
  const read: Reader = (entry) => values.get(entry);
  const status = new Map<string, boolean>();
  for (const relation of relationsFor(root, type)) {
    const expected = relation.compute(read);
    const actual = values.get(relation.target);
    if (expected === undefined || actual === undefined) {
      continue;
    }
    status.set(
      relation.label,
      equalsDecimal(rescale(expected, actual.scale), actual),
    );
  }
  return status;
}

// ---------------------------------------------------------------------------
// The factor
// ---------------------------------------------------------------------------

export type ScaleOutcome =
  | { ok: true; value: string }
  | { ok: false; error: string };

const SCALE_PATTERN = /^\d+(\.\d+)?$/;

/**
 * Accepts a factor, or explains why it is not one.
 *
 * A factor of 1.02 would leave most amounts recognisable to anyone who has seen
 * the invoice, so anything within five percent of 1 is refused rather than
 * quietly accepted. This is the one input the whole redaction hangs from.
 */
export function parseScale(raw: string): ScaleOutcome {
  const trimmed = raw.trim();
  if (!SCALE_PATTERN.test(trimmed)) {
    return {
      ok: false,
      error: `${SCALE_VARIABLE} has to be a positive decimal, for example 0.6137`,
    };
  }
  const parsed = parseDecimal(trimmed);
  if (parsed === undefined) {
    return { ok: false, error: `${SCALE_VARIABLE} is not a decimal` };
  }
  if (parsed.scale > MAX_SCALE_DECIMALS) {
    return {
      ok: false,
      error: `${SCALE_VARIABLE} carries more than ${MAX_SCALE_DECIMALS} decimals`,
    };
  }
  const value = toNumber(parsed);
  if (value <= 0 || value > MAX_SCALE) {
    return {
      ok: false,
      error: `${SCALE_VARIABLE} has to be greater than 0 and at most ${MAX_SCALE}`,
    };
  }
  if (Math.abs(value - 1) < MIN_SCALE_DISTANCE) {
    return {
      ok: false,
      error: `${SCALE_VARIABLE} is too close to 1 to hide an amount, pick something outside ${
        1 - MIN_SCALE_DISTANCE
      } to ${1 + MIN_SCALE_DISTANCE}`,
    };
  }
  return { ok: true, value: formatDecimal(parsed, parsed.scale) };
}

/** A factor nobody chose, printed once and never written to a file. */
export function generateScale(): string {
  const units = randomInt(GENERATED_SCALE_MIN, GENERATED_SCALE_MAX + 1);
  return formatDecimal(
    { units: BigInt(units), scale: GENERATED_SCALE_DECIMALS },
    GENERATED_SCALE_DECIMALS,
  );
}

// ---------------------------------------------------------------------------
// Redaction
// ---------------------------------------------------------------------------

export interface Change {
  kind: ChangeKind;
  element: string;
  attribute: string;
  original: string;
  replacement: string;
}

export interface TextEntry {
  element: string;
  attribute: string;
  value: string;
}

export interface RedactionResult {
  xml: string;
  documentType: DocumentType;
  scale: string;
  /** Four hex characters of the new UUID, enough to name the fixture. */
  shortId: string;
  changes: Change[];
  relationsPreserved: string[];
  relationsSkipped: string[];
  freeTextKept: TextEntry[];
  unscaledDecimals: TextEntry[];
  warnings: string[];
}

export type RedactionOutcome =
  | { ok: true; value: RedactionResult }
  | { ok: false; error: string };

export interface RedactionOptions {
  /** The secret. Also the seed of every pseudonym, so a pair stays coherent. */
  scale: string;
  /** Blanks a complement this script does not understand instead of refusing. */
  allowUnknownComplement?: boolean;
}

function failure(error: string): RedactionOutcome {
  return { ok: false, error };
}

interface Edit {
  start: number;
  end: number;
  text: string;
}

interface Scaling {
  current: Map<Attribute, Decimal>;
  amountCount: number;
  warnings: string[];
  error?: string;
}

interface Plan {
  changes: Change[];
  edits: Edit[];
  freeTextKept: TextEntry[];
  unscaledDecimals: TextEntry[];
  error?: string;
}

/**
 * Every complement in the document that this script has never read.
 *
 * A carta porte or an addenda carries names, addresses and phone numbers under
 * attribute names nothing here knows, so it is named and handed back rather than
 * rewritten by guesswork.
 */
function unknownComplementsOf(root: XmlElement): string[] {
  const unknown: string[] = [];
  const complemento = childNamed(root, "Complemento", CFDI_NAMESPACE);
  for (const child of complemento?.children ?? []) {
    if (
      child.namespace !== PAGOS_NAMESPACE &&
      child.namespace !== TFD_NAMESPACE
    ) {
      unknown.push(child.name);
    }
  }
  if (childNamed(root, "Addenda", CFDI_NAMESPACE) !== undefined) {
    unknown.push("cfdi:Addenda");
  }
  return unknown;
}

/** Every attribute under a complement we do not read, to be emptied. */
function attributesToBlank(root: Element): Set<Attribute> {
  const blanked = new Set<Attribute>();
  const collect = (node: Element): void => {
    walk(node, (child) => {
      for (const entry of child.attributes) {
        blanked.add(entry);
      }
    });
  };
  for (const child of childOf(root, "Complemento")?.children ?? []) {
    if (
      child.localName !== "Pagos" &&
      child.localName !== "TimbreFiscalDigital"
    ) {
      collect(child);
    }
  }
  const addenda = childOf(root, "Addenda");
  if (addenda !== undefined) {
    collect(addenda);
  }
  return blanked;
}

/** Multiplies every amount by the factor, at the precision it was written in. */
function scaleAmounts(
  root: Element,
  originals: Map<Attribute, Decimal>,
  factor: Decimal,
  blanked: ReadonlySet<Attribute>,
): Scaling {
  const scaling: Scaling = {
    current: new Map(originals),
    amountCount: 0,
    warnings: [],
  };
  walk(root, (node) => {
    for (const entry of node.attributes) {
      if (classify(entry) !== "amount" || blanked.has(entry)) {
        continue;
      }
      const original = originals.get(entry);
      if (original === undefined) {
        scaling.warnings.push(
          `${pathOf(node)}/@${entry.name} is an amount that is not a decimal, left untouched`,
        );
        continue;
      }
      scaling.amountCount += 1;
      const scaled = rescale(multiplyDecimal(original, factor), original.scale);
      if (!isZeroDecimal(original) && isZeroDecimal(scaled)) {
        scaling.error ??= `${pathOf(node)}/@${entry.name} rounds to zero at this factor, pick a larger ${SCALE_VARIABLE}`;
      }
      scaling.current.set(entry, scaled);
    }
  });
  return scaling;
}

/**
 * Recomputes every value the document derived from another one, and only those.
 *
 * A relation that did not hold before the scaling is left alone and reported, so
 * a document that never added up is not quietly corrected into one that does.
 */
function restoreArithmetic(
  root: Element,
  documentType: DocumentType,
  originals: Map<Attribute, Decimal>,
  current: Map<Attribute, Decimal>,
): { preserved: string[]; skipped: string[] } {
  const status = relationStatus(root, documentType);
  const read: Reader = (entry) => current.get(entry);
  const preserved: string[] = [];
  const skipped: string[] = [];
  for (const relation of relationsFor(root, documentType)) {
    const held = status.get(relation.label);
    if (held !== true) {
      if (held === false) {
        skipped.push(relation.label);
      }
      continue;
    }
    const recomputed = relation.compute(read);
    const target = originals.get(relation.target);
    if (recomputed === undefined || target === undefined) {
      continue;
    }
    current.set(relation.target, rescale(recomputed, target.scale));
    preserved.push(relation.label);
  }
  return { preserved, skipped };
}

/**
 * Decides the new value of every attribute, and where it goes in the source.
 *
 * Nothing is rewritten here. The result is a list of spans and the text to put
 * in them, which is also the change map, so what the operator reads afterwards
 * is the same list the file was built from.
 */
function planChanges(
  root: Element,
  originals: Map<Attribute, Decimal>,
  current: Map<Attribute, Decimal>,
  blanked: ReadonlySet<Attribute>,
  registry: Registry,
): Plan {
  const plan: Plan = {
    changes: [],
    edits: [],
    freeTextKept: [],
    unscaledDecimals: [],
  };
  walk(root, (node) => {
    for (const entry of node.attributes) {
      if (
        entry.name === "xmlns" ||
        entry.name.startsWith("xmlns:") ||
        entry.localName === "schemaLocation"
      ) {
        continue;
      }
      const kind = blanked.has(entry) ? "blank" : classify(entry);
      if (kind === undefined) {
        if (FREE_TEXT_ATTRIBUTES.has(entry.localName) && entry.value !== "") {
          plan.freeTextKept.push({
            element: pathOf(node),
            attribute: entry.name,
            value: entry.value,
          });
        }
        const decimal = originals.get(entry);
        if (
          decimal !== undefined &&
          !isZeroDecimal(decimal) &&
          !KNOWN_NON_AMOUNTS.has(entry.localName)
        ) {
          plan.unscaledDecimals.push({
            element: pathOf(node),
            attribute: entry.name,
            value: entry.value,
          });
        }
        continue;
      }
      let replacement: string;
      try {
        replacement = replacementFor(kind, node, entry, current, registry);
      } catch (error) {
        plan.error ??= error instanceof Error ? error.message : String(error);
        continue;
      }
      if (replacement === entry.value) {
        continue;
      }
      plan.changes.push({
        kind,
        element: pathOf(node),
        attribute: entry.name,
        original: entry.value,
        replacement,
      });
      plan.edits.push({
        start: entry.start,
        end: entry.end,
        text: escapeXmlAttribute(replacement),
      });
    }
  });
  return plan;
}

/** Applies the spans from the end, so no offset moves under another one. */
function applyEdits(source: string, edits: readonly Edit[]): string {
  const ordered = [...edits].sort((left, right) => right.start - left.start);
  let xml = source;
  for (const edit of ordered) {
    xml = `${xml.slice(0, edit.start)}${edit.text}${xml.slice(edit.end)}`;
  }
  return xml;
}

/**
 * Turns one real document into a committable one.
 *
 * Nothing is written here. The caller gets the redacted XML, the list of every
 * value that changed and the two verifications already run, so the same function
 * serves the command and the test without the test needing a filesystem.
 */
export function redactCfdi(
  source: string,
  options: RedactionOptions,
): RedactionOutcome {
  const scale = parseScale(options.scale);
  if (!scale.ok) {
    return failure(scale.error);
  }
  const secret = scale.value;
  const factor = parseDecimal(secret);
  if (factor === undefined) {
    return failure("the factor is not a decimal");
  }

  const document = parseXml(source);
  if (!document.ok) {
    return failure(
      `the document did not parse, ${document.error.code}: ${document.error.message}`,
    );
  }
  const satRoot = document.value;
  if (satRoot.localName !== "Comprobante") {
    return failure("the root element is not a cfdi:Comprobante");
  }
  const kind = satAttribute(satRoot, "TipoDeComprobante");
  if (kind !== "I" && kind !== "P") {
    return failure(
      "only a CFDI de ingreso (I) or a complemento de pagos (P) can be imported",
    );
  }
  const documentType: DocumentType = kind === "I" ? "ingreso" : "pagos";

  // The engine reads it first. A document our own parser refuses is not a
  // document worth committing as proof that our own parser reads real ones.
  const before =
    documentType === "ingreso"
      ? parseCfdi(source, { synthetic: false })
      : parsePaymentComplement(source, { synthetic: false });
  if (!before.ok) {
    return failure(
      `the engine refused the document, ${before.error.code}: ${before.error.message}`,
    );
  }

  const unknownComplements = unknownComplementsOf(satRoot);
  if (
    unknownComplements.length > 0 &&
    options.allowUnknownComplement !== true
  ) {
    return failure(
      `the document carries ${unknownComplements.join(", ")}, which this script does not understand. Rewriting attributes it has never seen is how a real name survives into a fixture. Re-run with --allow-unknown-complement to blank those subtrees whole, or import a document without them`,
    );
  }

  const root = scan(source);
  if (root === undefined) {
    return failure(
      "the offset scanner disagreed with the parser about the XML",
    );
  }

  const blanked = attributesToBlank(root);
  const originals = decimalsOf(root);

  const scaling = scaleAmounts(root, originals, factor, blanked);
  if (scaling.error !== undefined) {
    return failure(scaling.error);
  }
  const relations = restoreArithmetic(
    root,
    documentType,
    originals,
    scaling.current,
  );

  const plan = planChanges(
    root,
    originals,
    scaling.current,
    blanked,
    createRegistry(secret),
  );
  if (plan.error !== undefined) {
    return failure(plan.error);
  }
  const xml = withProvenance(applyEdits(source, plan.edits));

  // Verified before anyone can write it to a file. Nothing that was replaced
  // survives, and the document still says what it said, scaled.
  const leaks = findSurvivingValues(xml, plan.changes);
  if (leaks.length > 0) {
    return failure(
      `redaction incomplete, these values are still in the output: ${leaks.join(", ")}`,
    );
  }
  const redactedRoot = scan(xml);
  if (redactedRoot === undefined) {
    return failure("the redacted document no longer scans as XML");
  }
  const redactedStatus = relationStatus(redactedRoot, documentType);
  const broken = relations.preserved.filter(
    (label) => redactedStatus.get(label) !== true,
  );
  if (broken.length > 0) {
    return failure(
      `the scaling broke arithmetic the original satisfied: ${broken.join("; ")}`,
    );
  }
  const problems = comparePasses(
    documentType,
    before.value,
    xml,
    factor,
    scaling.amountCount,
  );
  if (problems.length > 0) {
    return failure(
      `the redacted document does not hold up: ${problems.join("; ")}`,
    );
  }

  const warnings = [...scaling.warnings];
  if (unknownComplements.length > 0) {
    warnings.push(
      `${unknownComplements.join(", ")} was blanked whole, the fixture no longer carries it`,
    );
  }
  if (plan.freeTextKept.length > 0) {
    warnings.push(
      "free text was kept verbatim, read it before committing (listed below)",
    );
  }
  const newUuid = plan.changes.find(
    (change) => change.kind === "uuid",
  )?.replacement;

  return {
    ok: true,
    value: {
      xml,
      documentType,
      scale: secret,
      shortId: (newUuid ?? "0000")
        .replace(/-/g, "")
        .slice(0, SHORT_ID_LENGTH)
        .toLowerCase(),
      changes: plan.changes,
      relationsPreserved: relations.preserved,
      relationsSkipped: relations.skipped,
      freeTextKept: plan.freeTextKept,
      unscaledDecimals: plan.unscaledDecimals,
      warnings,
    },
  };
}

function replacementFor(
  kind: ChangeKind,
  node: Element,
  entry: Attribute,
  current: Map<Attribute, Decimal>,
  registry: Registry,
): string {
  const value = entry.value;
  switch (kind) {
    case "amount": {
      const scaled = current.get(entry);
      const original = parseDecimal(value);
      if (scaled === undefined || original === undefined) {
        return value;
      }
      return formatDecimal(scaled, original.scale);
    }
    case "rfc": {
      const upper = value.trim().toUpperCase();
      return registry.map("rfc", upper, (bytes) =>
        syntheticRfc(bytes, upper.length),
      );
    }
    case "name": {
      const rfc = attributeOf(node, "Rfc")?.value.trim() ?? "";
      const person = rfc.length >= PERSONA_FISICA_RFC_LENGTH;
      return registry.map("name", value, (bytes) =>
        person
          ? syntheticPersonName(bytes)
          : syntheticCompanyName(bytes, value),
      );
    }
    case "uuid": {
      const upper = value.trim().toUpperCase();
      const lowercase = value.trim() === value.trim().toLowerCase();
      return registry.map("uuid", upper, (bytes) =>
        syntheticUuid(bytes, lowercase),
      );
    }
    case "account":
      return registry.map("account", value, (bytes) =>
        syntheticClabe(bytes, value),
      );
    case "curp":
      return registry.map("curp", value, (bytes) => syntheticCurp(bytes));
    case "signature":
      return SIGNATURE_PLACEHOLDER;
    case "certificate":
      return CERTIFICATE_PLACEHOLDER;
    case "address":
      return POSTAL_ATTRIBUTES.has(entry.localName)
        ? SYNTHETIC_POSTAL_CODE
        : "";
    case "contact":
    case "blank":
      return "";
    default:
      return registry.map(kind, value, (bytes) => maskToken(bytes, value));
  }
}

function withProvenance(xml: string): string {
  const declaration = xml.indexOf("?>");
  if (xml.trimStart().startsWith("<?xml") && declaration !== -1) {
    const cut = declaration + 2;
    return `${xml.slice(0, cut)}\n${PROVENANCE_COMMENT}${xml.slice(cut)}`;
  }
  return `${PROVENANCE_COMMENT}\n${xml}`;
}

// ---------------------------------------------------------------------------
// Verification
// ---------------------------------------------------------------------------

/** Shorter than this and a value is not identifying, it is a catalogue code. */
const MIN_SECRET_LENGTH = 3;
const RFC_SHAPE = /(?<![A-Z0-9])[A-Z&Ñ]{3,4}\d{6}[A-Z0-9]{3}(?![A-Z0-9])/g;
const CURP_SHAPE =
  /(?<![A-Z0-9])[A-Z]{4}\d{6}[HM][A-Z]{5}[A-Z0-9]\d(?![A-Z0-9])/g;
const LONG_DIGITS_SHAPE = /(?<!\d)\d{18}(?!\d)/g;

function isWordCharacter(character: string): boolean {
  return (
    (character >= "A" && character <= "Z") ||
    (character >= "0" && character <= "9")
  );
}

/**
 * Whether the output carries this value as a value, and not as digits inside a
 * longer one.
 *
 * A folio of 318 is three characters and lands inside any scaled amount that
 * happens to read 72613.18, so a plain substring search reports a leak on a
 * document that is perfectly redacted. The boundary check is what makes the
 * verification usable: a match counts only when neither neighbour is part of the
 * same word, which is exactly the case of a value sitting between two quotes.
 */
function containsToken(haystack: string, needle: string): boolean {
  if (needle === "") {
    return false;
  }
  let from = 0;
  for (;;) {
    const at = haystack.indexOf(needle, from);
    if (at === -1) {
      return false;
    }
    const before = at === 0 ? "" : haystack[at - 1];
    const after = haystack[at + needle.length] ?? "";
    if (!isWordCharacter(before) && !isWordCharacter(after)) {
      return true;
    }
    from = at + 1;
  }
}

/**
 * Everything that must not be in the output, and is.
 *
 * Two passes, because they fail differently. The first looks for each value that
 * was replaced, which catches a value repeated somewhere the rewriter did not
 * reach. The second looks for the shapes themselves, which is what catches an
 * RFC or a CLABE typed into a free text description by whoever issued the
 * invoice, a place no attribute level rule would ever have looked.
 */
export function findSurvivingValues(xml: string, changes: Change[]): string[] {
  const haystack = xml.toUpperCase();
  const produced = new Set(
    changes.map((change) => change.replacement.toUpperCase()),
  );
  const leaks: string[] = [];

  for (const change of changes) {
    const original = change.original.trim();
    if (original === "" || original.length < MIN_SECRET_LENGTH) {
      continue;
    }
    if (change.kind === "amount") {
      const parsed = parseDecimal(original);
      if (parsed === undefined || isZeroDecimal(parsed)) {
        continue;
      }
    }
    const needle = original.toUpperCase();
    const escaped = escapeXmlAttribute(original).toUpperCase();
    if (containsToken(haystack, needle) || containsToken(haystack, escaped)) {
      leaks.push(`${change.kind} ${change.attribute} ${original}`);
    }
  }

  for (const match of haystack.matchAll(RFC_SHAPE)) {
    if (!match[0].startsWith(SYNTHETIC_RFC_PREFIX) && !produced.has(match[0])) {
      leaks.push(`an RFC shaped value survived: ${match[0]}`);
    }
  }
  for (const match of haystack.matchAll(CURP_SHAPE)) {
    if (!produced.has(match[0])) {
      leaks.push(`a CURP shaped value survived: ${match[0]}`);
    }
  }
  for (const match of haystack.matchAll(LONG_DIGITS_SHAPE)) {
    if (!produced.has(match[0])) {
      leaks.push(`an account shaped value survived: ${match[0]}`);
    }
  }

  return [...new Set(leaks)];
}

const CENT = 0.01;
/** One part in ten thousand. See the comment on `comparePasses`. */
const RELATIVE_TOLERANCE = 0.000_1;

function withinTolerance(
  redacted: number,
  original: number,
  factor: number,
  floor: number,
): boolean {
  const expected = original * factor;
  const tolerance = Math.max(floor, Math.abs(expected) * RELATIVE_TOLERANCE);
  return Math.abs(redacted - expected) <= tolerance;
}

/**
 * Reads the redacted document with the same parser and compares the two records.
 *
 * This is a coarse check on purpose, and the tolerance says why. A line whose
 * `Importe` is `Cantidad` times `ValorUnitario` is recomputed from the scaled
 * unit price, so half a cent of rounding on that price becomes half a cent times
 * the quantity on the line, and the total of a document with a thousand pieces
 * on it lands legitimately a few pesos away from the total multiplied by the
 * factor. What the redaction actually guarantees is exact and is checked
 * elsewhere: every identity the original document satisfied is recomputed and
 * reverified on the output. This pass only answers a blunter question, which is
 * whether the whole document moved by roughly the factor, and it catches the
 * failures that matter here, a factor that was not applied, applied twice, or
 * applied to the wrong attributes.
 */
function comparePasses(
  documentType: DocumentType,
  before: Cfdi | PaymentComplement[],
  xml: string,
  factor: Decimal,
  amountCount: number,
): string[] {
  const problems: string[] = [];
  const scale = toNumber(factor);
  const floor = Math.max(2 * CENT, amountCount * CENT);

  if (documentType === "ingreso") {
    const after = parseCfdi(xml, { synthetic: true });
    if (!after.ok) {
      return [`the redacted invoice no longer parses, ${after.error.code}`];
    }
    const original = before as Cfdi;
    const redacted = after.value;
    if (redacted.uuid === original.uuid) {
      problems.push("the UUID did not change");
    }
    if (!redacted.issuerRfc.startsWith(SYNTHETIC_RFC_PREFIX)) {
      problems.push("the issuer RFC is not synthetic");
    }
    if (!redacted.receiverRfc.startsWith(SYNTHETIC_RFC_PREFIX)) {
      problems.push("the receiver RFC is not synthetic");
    }
    if (
      redacted.issuerName === original.issuerName &&
      original.issuerName !== ""
    ) {
      problems.push("the issuer name did not change");
    }
    if (redacted.issuedAt !== original.issuedAt) {
      problems.push("the issue date moved");
    }
    if (redacted.paymentMethod !== original.paymentMethod) {
      problems.push("MetodoPago moved");
    }
    if (original.folio !== undefined && redacted.folio === original.folio) {
      problems.push("the folio did not change");
    }
    if (!withinTolerance(redacted.total, original.total, scale, floor)) {
      problems.push("the total is not the original scaled by the factor");
    }
    if (!withinTolerance(redacted.subtotal, original.subtotal, scale, floor)) {
      problems.push("the subtotal is not the original scaled by the factor");
    }
    if (!withinTolerance(redacted.iva, original.iva, scale, floor)) {
      problems.push("the IVA is not the original scaled by the factor");
    }
    return problems;
  }

  const after = parsePaymentComplement(xml, { synthetic: true });
  if (!after.ok) {
    return [`the redacted complement no longer parses, ${after.error.code}`];
  }
  const original = before as PaymentComplement[];
  const redacted = after.value;
  if (redacted.length !== original.length) {
    return ["the complement settles a different number of documents"];
  }
  for (let index = 0; index < redacted.length; index += 1) {
    const left = redacted[index];
    const right = original[index];
    if (left.uuid === right.uuid) {
      problems.push("the UUID did not change");
    }
    if (left.relatedCfdiUuid === right.relatedCfdiUuid) {
      problems.push("a related document UUID did not change");
    }
    if (left.paidAt !== right.paidAt) {
      problems.push("a payment date moved");
    }
    if (!withinTolerance(left.paidAmount, right.paidAmount, scale, floor)) {
      problems.push("a paid amount is not the original scaled by the factor");
    }
    if (
      right.beneficiaryAccount !== undefined &&
      left.beneficiaryAccount === right.beneficiaryAccount
    ) {
      problems.push("the beneficiary account did not change");
    }
  }
  return [...new Set(problems)];
}

// ---------------------------------------------------------------------------
// The command
// ---------------------------------------------------------------------------

const USAGE = `usage: bun run scripts/import-real-cfdi.ts <path/to/real.xml> [flags]

  --name=<slug>               output basename, default <type>-<4 hex chars>
  --scale=<factor>            same as ${SCALE_VARIABLE}, for one run
  --dry-run                   print everything, write nothing
  --force                     overwrite an existing fixture
  --allow-unknown-complement  blank a complement this script does not read

Put the real file outside the repository or under .seed/, which is gitignored.
Export ${SCALE_VARIABLE} to import an invoice and its complement as one story.`;

const NAME_PATTERN = /^[a-z0-9][a-z0-9-]{0,48}$/;

interface Cli {
  input: string | undefined;
  name: string | undefined;
  scale: string | undefined;
  dryRun: boolean;
  force: boolean;
  allowUnknownComplement: boolean;
}

function readCli(argv: readonly string[]): Cli {
  const flags = new Set(
    argv.filter((arg) => arg.startsWith("--") && !arg.includes("=")),
  );
  const options = new Map(
    argv
      .filter((arg) => arg.startsWith("--") && arg.includes("="))
      .map((arg) => [
        arg.slice(2, arg.indexOf("=")),
        arg.slice(arg.indexOf("=") + 1),
      ]),
  );
  return {
    input: argv.find((arg) => !arg.startsWith("--")),
    name: options.get("name"),
    scale: options.get("scale"),
    dryRun: flags.has("--dry-run"),
    force: flags.has("--force"),
    allowUnknownComplement: flags.has("--allow-unknown-complement"),
  };
}

/**
 * The change map holds the originals, so it is the one file in this flow that
 * must never be committed. Rather than trusting that, the command reads
 * .gitignore and refuses to write it if the rule is not there.
 */
function seedIsIgnored(): boolean {
  const ignoreFile = `${ROOT}/.gitignore`;
  if (!existsSync(ignoreFile)) {
    return false;
  }
  return readFileSync(ignoreFile, "utf8")
    .split("\n")
    .map((line) => line.trim())
    .some(
      (line) => line === ".seed/" || line === "/.seed/" || line === ".seed",
    );
}

function countByKind(changes: readonly Change[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const change of changes) {
    counts.set(change.kind, (counts.get(change.kind) ?? 0) + 1);
  }
  return counts;
}

function report(result: RedactionResult, generated: boolean): void {
  console.log(`document      ${result.documentType}`);
  console.log(
    `factor        ${result.scale}${generated ? " (generated for this run)" : ` (from ${SCALE_VARIABLE})`}`,
  );
  if (generated) {
    console.log(
      `              export ${SCALE_VARIABLE}=${result.scale} before importing the matching document, then unset it`,
    );
  }
  const counts = [...countByKind(result.changes)]
    .sort((left, right) => left[0].localeCompare(right[0]))
    .map(([kind, count]) => `${kind} ${count}`)
    .join(", ");
  console.log(`replaced      ${counts === "" ? "nothing" : counts}`);
  console.log(
    `arithmetic    ${result.relationsPreserved.length} identities preserved, ${result.relationsSkipped.length} the original did not satisfy`,
  );
  for (const warning of result.warnings) {
    console.log(`warning       ${warning}`);
  }
  for (const entry of result.freeTextKept) {
    console.log(`  free text   ${entry.attribute} = ${entry.value}`);
  }
  for (const entry of result.unscaledDecimals) {
    console.log(`  not scaled  ${entry.attribute} = ${entry.value}`);
  }
}

function main(): number {
  const cli = readCli(Bun.argv.slice(2));
  if (cli.input === undefined) {
    console.log(USAGE);
    return 1;
  }
  const input = resolve(cli.input);
  if (!existsSync(input)) {
    console.error(`no file at ${input}`);
    return 1;
  }

  const chosen = cli.scale ?? Bun.env[SCALE_VARIABLE];
  const scale = chosen ?? generateScale();
  const outcome = redactCfdi(readFileSync(input, "utf8"), {
    scale,
    allowUnknownComplement: cli.allowUnknownComplement,
  });
  if (!outcome.ok) {
    console.error(`refused: ${outcome.error}`);
    return 1;
  }
  const result = outcome.value;

  const name = cli.name ?? `${result.documentType}-${result.shortId}`;
  if (!NAME_PATTERN.test(name)) {
    console.error(
      `--name has to be lower case letters, digits and hyphens, got ${name}`,
    );
    return 1;
  }
  const fixturePath = `${FIXTURE_DIRECTORY}/${name}${FIXTURE_SUFFIX}`;
  const mapPath = `${MAP_DIRECTORY}/${name}${MAP_SUFFIX}`;
  if (existsSync(fixturePath) && !cli.force) {
    console.error(`${fixturePath} already exists, pass --force to replace it`);
    return 1;
  }
  if (!seedIsIgnored()) {
    console.error(
      ".seed/ is not in .gitignore, so the change map would be committable. Refusing to write anything",
    );
    return 1;
  }

  report(result, chosen === undefined);

  if (cli.dryRun) {
    console.log("dry run, nothing was written");
    return 0;
  }

  mkdirSync(FIXTURE_DIRECTORY, { recursive: true });
  writeFileSync(fixturePath, result.xml, "utf8");
  mkdirSync(MAP_DIRECTORY, { recursive: true });
  writeFileSync(
    mapPath,
    `${JSON.stringify(
      {
        warning:
          "This file is the only way back to the real document. It is gitignored. Never commit it, never paste it into an issue or a pull request.",
        generatedAt: new Date().toISOString(),
        source: input,
        fixture: fixturePath.slice(ROOT.length + 1),
        documentType: result.documentType,
        scale: result.scale,
        scaleSource: chosen === undefined ? "generated" : SCALE_VARIABLE,
        changes: result.changes,
        relationsPreserved: result.relationsPreserved,
        relationsSkipped: result.relationsSkipped,
        freeTextKept: result.freeTextKept,
        unscaledDecimals: result.unscaledDecimals,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  console.log(`fixture       ${fixturePath.slice(ROOT.length + 1)}`);
  console.log(
    `change map    ${mapPath.slice(ROOT.length + 1)} (gitignored, never commit it)`,
  );
  console.log(
    "next          bun test packages/core/src/cfdi-real.test.ts, then read the fixture once with your own eyes",
  );
  return 0;
}

if (import.meta.main) {
  process.exit(main());
}
