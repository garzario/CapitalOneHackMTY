/**
 * The rail a Mexican PyME actually has: a file, a bank portal and a clerk.
 *
 * STP is the production path and it needs a contract. Nessie is a sandbox. What the
 * company in `docs/02-persona.md` has today is a web portal from its own bank and a
 * button that says "dispersion masiva" or "pago por layout": you upload a file with
 * one line per payment, the portal shows you the total, somebody with a token
 * authorises it, and hours later the portal hands back a response file with a clave
 * de rastreo per line. No API, no key, no integration project. That is the rail this
 * file is, and it is the reason SentryOne can be the payment order for a company
 * that will never sign an STP contract.
 *
 * Two halves and they are hours apart.
 *
 * 1. `send` puts one line into the file and answers `queued`. Nothing has left: the
 *    clerk still has to upload it and somebody still has to authorise it, so the line
 *    carries no clave de rastreo and the rail does not pretend otherwise. `file()`
 *    renders what has accumulated.
 * 2. `readLayoutResponse` parses the file the portal hands back and recovers the
 *    clave de rastreo per line. That is where the clave comes from on this rail, and
 *    it still obeys the rule the package is built on: the clave arrives from the bank
 *    and never from a keyboard.
 *
 * **It has no `RailId` and that is the honest answer, not an omission.** The
 * participant that executes this file is the company's own bank, and this product is
 * not it and does not know which one it will be. `PaymentSent.rail` is therefore
 * absent on every line this rail produces, exactly as `payment_sent.rail` is
 * optional on the event. `FakeRail` makes the same argument for taking its rail as a
 * constructor argument: a name in that union is a claim about a participant.
 *
 * **The layout is generic, and the README says so where somebody quoting it will
 * read it.** The five columns below are the ones every portal asks for, in the order
 * a person reads them, with the RFC as a sixth because most portals take it and an
 * accountant wants it. What is NOT claimed anywhere is that this is a named bank's
 * exact file: we have not been handed one, so the mapping to a specific portal is
 * `LAYOUT_COLUMNS` renamed and reordered, which is one function and not a rewrite.
 */

import type { Clabe } from "@hackmty/core";
import {
  assertPaymentAmount,
  type DispersalRail,
  type PaymentOrder,
  type PaymentSent,
  RailConfigError,
} from "./rail";

/**
 * The columns of the dispersal file, in order.
 *
 * Spanish, because the person who opens this file opens it in their bank's portal
 * and in Excel, and a header in English is a header they have to translate before
 * they can check a total. Everything else in this repository is English; a file that
 * leaves for a bank is product copy.
 */
export const LAYOUT_COLUMNS = [
  "clabe",
  "beneficiario",
  "rfc",
  "importe",
  "referencia",
  "concepto",
] as const;

export type LayoutColumn = (typeof LAYOUT_COLUMNS)[number];

/** The separator. A comma, and every field that could hold one is quoted. */
export const LAYOUT_SEPARATOR = ",";

/**
 * CRLF, because the file is opened by a Windows bank portal.
 *
 * It is the line ending the CSV specification names and the one every Mexican
 * portal's own sample file uses, and a bare LF is the kind of thing that makes a
 * portal reject a file at 17:55 with no message worth reading.
 */
export const LAYOUT_NEWLINE = "\r\n";

/** How many characters of `concepto` a portal field holds. */
export const LAYOUT_CONCEPT_MAX = 40;

/** How many digits of `referencia` a portal field holds. */
export const LAYOUT_REFERENCE_MAX = 7;

/**
 * What the concepto says when the order names no invoice.
 *
 * The concepto is the one column a supplier reads on its own statement, so it
 * carries the invoice folio when there is one. With none it says what the movement
 * is and nothing else, which is the same rule `PAYMENT_DESCRIPTION` follows.
 */
export const LAYOUT_CONCEPT_FALLBACK = "Pago de facturas";

export interface LayoutLine {
  instructionId: string;
  clabe: Clabe;
  beneficiario: string;
  rfc: string;
  amount: number;
  /** The numeric reference this line is filed under in the response file. */
  referencia: string;
  concepto: string;
}

export interface LayoutRailOptions {
  /**
   * How the numeric reference of a line is minted. Up to seven digits, unique
   * inside one file, and injected so a test asserts an exact file instead of
   * matching a pattern.
   */
  reference?: (order: PaymentOrder, sequence: number) => string;
  now?: () => string;
}

/**
 * The dispersal file, one line at a time.
 *
 * Holding the lines in memory rather than writing them to a path is deliberate: the
 * caller is an HTTP handler that hands the bytes to a browser, and a rail that wrote
 * to disk would need a directory, a permission and a cleanup nobody owns. `file()`
 * is the whole output.
 */
export class LayoutRail implements DispersalRail {
  readonly describe =
    "bank portal layout, a CSV the clerk uploads to their own bank (nothing leaves until they do)";

  private readonly lines: LayoutLine[] = [];
  private readonly reference: (order: PaymentOrder, sequence: number) => string;
  private readonly now: () => string;

  constructor(options: LayoutRailOptions = {}) {
    this.reference = options.reference ?? defaultReference;
    this.now = options.now ?? (() => new Date().toISOString());
  }

  /**
   * Puts one line into the file.
   *
   * `queued` and never `sent`, which is the only honest state available: the file is
   * on the clerk's computer, the portal has not seen it, and nobody has authorised
   * anything. A `payment_sent` for this line would be a claim about a transfer that
   * has not been ordered yet, which is the one entry the ledger must not hold.
   *
   * @throws RailConfigError when the order carries no beneficiary. A portal refuses a
   *   line with no name on it, so refusing here is the same refusal earlier and with
   *   a sentence attached.
   */
  async send(order: PaymentOrder): Promise<PaymentSent> {
    const { beneficiary } = order;
    if (beneficiary === undefined) {
      throw new RailConfigError(
        `the dispersal layout needs the beneficiary of ${order.instructionId}: a bank portal refuses a line with no name against the account, so the order is not written`,
      );
    }

    const amount = assertPaymentAmount(order.amount);
    const referencia = this.reference(order, this.lines.length + 1);
    this.lines.push({
      instructionId: order.instructionId,
      clabe: order.beneficiaryAccount,
      beneficiario: beneficiary.legalName,
      rfc: beneficiary.rfc,
      amount,
      referencia,
      concepto: conceptoFor(beneficiary.cfdiUuids),
    });

    return {
      state: "queued",
      sentAt: this.now(),
      amount,
      instructionId: order.instructionId,
      reference: referencia,
      simulated: false,
    };
  }

  /** The lines written so far, in order. */
  get queued(): readonly LayoutLine[] {
    return this.lines;
  }

  /** The whole file, header included, ready to be handed to a portal. */
  file(): string {
    return layoutFile(this.lines);
  }
}

/** The file for a set of lines, header first. Pure, so a test asserts the bytes. */
export function layoutFile(lines: readonly LayoutLine[]): string {
  const rows = [
    LAYOUT_COLUMNS.join(LAYOUT_SEPARATOR),
    ...lines.map((line) =>
      [
        line.clabe,
        csv(line.beneficiario),
        line.rfc,
        line.amount.toFixed(2),
        line.referencia,
        csv(line.concepto),
      ].join(LAYOUT_SEPARATOR),
    ),
  ];
  // A trailing newline, because a portal that reads the last line only when it ends
  // is a portal that drops the last payment of the week.
  return `${rows.join(LAYOUT_NEWLINE)}${LAYOUT_NEWLINE}`;
}

/**
 * What the portal answers, one row per line of the file.
 *
 * `claveRastreo` is the point of the whole round trip: it is the string Banxico filed
 * the transfer under, it comes from the bank and not from a keyboard, and with it in
 * hand the CEP of a payment is findable exactly like the CEP of the one-cent probe.
 */
export interface LayoutResponseRow {
  /** The reference the file carried, which is how the row joins back to a line. */
  referencia: string;
  /** What the bank says happened. */
  state: "settled" | "failed";
  /** Absent on a refused line, because no transfer was filed. */
  claveRastreo?: string;
  /** Why a refused line was refused, in the portal's own words. */
  reason?: string;
}

/**
 * The header names this parser understands, per column it needs.
 *
 * Every portal spells them differently and none of them is wrong, so the parser reads
 * the header rather than trusting a position. A file with no header at all is read
 * positionally in the order below, which is the order every sample file we have seen
 * uses, and a file whose header names none of these is refused rather than guessed
 * at: a clave de rastreo read out of the wrong column would be a receipt pointing at
 * somebody else's transfer.
 */
const RESPONSE_HEADERS: Readonly<Record<string, string[]>> = {
  referencia: [
    "referencia",
    "referencianumerica",
    "referencia_numerica",
    "ref",
  ],
  claveRastreo: [
    "clavederastreo",
    "clave_rastreo",
    "claverastreo",
    "clave",
    "rastreo",
  ],
  estado: ["estado", "estatus", "status", "resultado"],
  motivo: ["motivo", "causa", "descripcionerror", "error", "observaciones"],
};

/** Words a portal uses for a line it did not pay. */
const REFUSED_WORDS = [
  "rechaz",
  "devuel",
  "cancel",
  "error",
  "fallo",
  "falla",
  "no aplicad",
];

/**
 * Recovers the claves de rastreo from the file the bank portal handed back.
 *
 * Tolerant on purpose and refusing on exactly one thing. Tolerant: the separator may
 * be a comma, a semicolon or a tab, the header may be in any order or absent, the
 * case and the accents of a header do not matter, and a blank line is skipped.
 * Refusing: a row whose state reads as paid and that carries no clave de rastreo is
 * dropped with nothing recorded, because a settled payment with no clave is a receipt
 * nobody can check, and inventing one is the failure this whole package is built to
 * make impossible.
 */
export function readLayoutResponse(text: string): LayoutResponseRow[] {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== "");
  if (lines.length === 0) {
    return [];
  }

  const separator = pickSeparator(lines[0] as string);
  const first = split(lines[0] as string, separator);
  const header = headerIndex(first);
  const body = header === undefined ? lines : lines.slice(1);
  const index = header ?? {
    referencia: 0,
    claveRastreo: 1,
    estado: 2,
    motivo: 3,
  };

  const rows: LayoutResponseRow[] = [];
  for (const line of body) {
    const cells = split(line, separator);
    const referencia = cell(cells, index.referencia);
    if (referencia === undefined) {
      continue;
    }
    const clave = cell(cells, index.claveRastreo);
    const estado = cell(cells, index.estado) ?? "";
    const motivo = cell(cells, index.motivo);
    const refused = REFUSED_WORDS.some((word) => fold(estado).includes(word));

    if (refused) {
      rows.push({
        referencia,
        state: "failed",
        ...(clave === undefined ? {} : { claveRastreo: clave }),
        reason:
          motivo ??
          `el portal del banco reporto la linea como ${estado === "" ? "rechazada" : estado}`,
      });
      continue;
    }

    if (clave === undefined) {
      /* Reported as paid and with nothing to file the CEP under. Dropped rather
         than recorded: a clave this function invented would be a receipt pointing at
         a transfer that may not exist. */
      continue;
    }

    rows.push({ referencia, state: "settled", claveRastreo: clave });
  }

  return rows;
}

/** Up to seven digits, unique inside one file. Injected in a test. */
function defaultReference(_order: PaymentOrder, sequence: number): string {
  return String(sequence).padStart(LAYOUT_REFERENCE_MAX, "0");
}

/** The invoice this line settles, cut to what a portal field holds. */
function conceptoFor(cfdiUuids: readonly string[]): string {
  if (cfdiUuids.length === 0) {
    return LAYOUT_CONCEPT_FALLBACK;
  }
  /* The first eight characters of a CFDI UUID, which is what an accountant quotes
     when they ask a supplier which invoice a payment was for. The whole uuid does not
     fit in a 40-character field next to the word factura, and a truncated one that
     looked whole would be worse than a short one that does not. */
  const folios = cfdiUuids.map((uuid) => uuid.slice(0, 8).toUpperCase());
  const text = `Facturas ${folios.join(" ")}`;
  return text.length <= LAYOUT_CONCEPT_MAX
    ? text
    : `${text.slice(0, LAYOUT_CONCEPT_MAX - 3)}...`;
}

/** Quotes a field that could hold a separator, a quote or a newline. */
function csv(value: string): string {
  const clean = value.replace(/[\r\n]+/g, " ").trim();
  return /[",;\t]/.test(clean) ? `"${clean.replace(/"/g, '""')}"` : clean;
}

function pickSeparator(line: string): string {
  for (const candidate of [",", ";", "\t"]) {
    if (line.includes(candidate)) {
      return candidate;
    }
  }
  return ",";
}

/** Splits one row, honouring the quoting `csv` writes. */
function split(line: string, separator: string): string[] {
  const cells: string[] = [];
  let current = "";
  let quoted = false;

  for (let at = 0; at < line.length; at += 1) {
    const char = line[at] as string;
    if (quoted) {
      if (char === '"') {
        if (line[at + 1] === '"') {
          current += '"';
          at += 1;
          continue;
        }
        quoted = false;
        continue;
      }
      current += char;
      continue;
    }
    if (char === '"') {
      quoted = true;
      continue;
    }
    if (char === separator) {
      cells.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }
  cells.push(current.trim());
  return cells;
}

interface ResponseIndex {
  referencia: number;
  claveRastreo: number;
  estado: number;
  motivo: number;
}

/** Which column holds what, read off the header, or undefined when this is not one. */
function headerIndex(cells: readonly string[]): ResponseIndex | undefined {
  const found: Partial<ResponseIndex> = {};
  for (const [at, cell] of cells.entries()) {
    const name = fold(cell).replace(/\s+/g, "");
    for (const [key, spellings] of Object.entries(RESPONSE_HEADERS)) {
      if (spellings.includes(name)) {
        found[key as keyof ResponseIndex] ??= at;
      }
    }
  }
  if (found.referencia === undefined || found.claveRastreo === undefined) {
    return undefined;
  }
  return {
    referencia: found.referencia,
    claveRastreo: found.claveRastreo,
    estado: found.estado ?? -1,
    motivo: found.motivo ?? -1,
  };
}

function cell(cells: readonly string[], at: number): string | undefined {
  if (at < 0) {
    return undefined;
  }
  const value = cells[at];
  return value === undefined || value === "" ? undefined : value;
}

/** Lower case with the accents dropped, so a header matches however it is spelled. */
function fold(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}+/gu, "")
    .toLowerCase()
    .trim();
}
