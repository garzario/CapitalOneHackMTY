/**
 * Article 49 Bis of the CFF: the second list the SAT publishes against a
 * supplier, and the one this product could not read until now.
 *
 * ## The statute, read today
 *
 * Article 49 Bis was added by the decree published in the DOF on 7 November 2025
 * and is in force from 1 January 2026 (Transitorio Primero of that decree). It is
 * the procedure for the express home visit of article 42, fraccion V, inciso g):
 * the authority states in the order why it presumes the taxpayer's CFDI are
 * false, suspends the taxpayer's own invoicing from the moment the order is
 * delivered (fraccion I), and must finish the whole procedure within
 * twenty-four business days (fraccion IX). The taxpayer has five business days to
 * offer evidence (fraccion V) and the authority fifteen business days to resolve
 * (fraccion VIII). Inciso b) of that fraccion is the outcome that reaches us: the
 * taxpayer did not rebut, the CFDI "se consideran falsos con efectos generales" for
 * failing article 29-A, fraccion IX, and "las operaciones contenidas en los mismos
 * no producen ni produjeron efecto fiscal alguno".
 *
 * Fraccion X is why this file exists, and it is a clock:
 *
 * - The SAT publishes the name and the RFC in the DOF and on its portal within
 *   forty-five business days of the notification of that resolution taking
 *   effect. Between the resolution and the publication the supplier is already
 *   condemned and on no list, which is exactly the gap the CLABE and behaviour
 *   controls have to carry on their own.
 * - The third parties who received those CFDI have **thirty natural days from the
 *   DOF publication** to reverse the fiscal effect through a complementary
 *   return.
 * - If they do not, the authority temporarily restricts THEIR OWN certificado de
 *   sello digital under article 17-H Bis, fraccion XIV, and they stop being able
 *   to invoice.
 *
 * Fraccion XI refers the matter to the Ministerio Publico under article 113 Bis,
 * whose second paragraph, added by the same decree, covers whoever "expida,
 * enajene, compre, adquiera o de efectos fiscales a comprobantes fiscales
 * falsos", with two to nine years of prison.
 *
 * Source, opened 2026-09-12: Codigo Fiscal de la Federacion, texto vigente, last
 * reform DOF 9 April 2026, <https://www.diputados.gob.mx/LeyesBiblio/pdf/CFF.pdf>,
 * articles 49 Bis, 17-H Bis fraccion XIV, 29-A fraccion IX and 113 Bis.
 *
 * ## What the SAT actually publishes, and why nothing here is loaded
 *
 * Verified on 2026-09-12 and written down in `snapshot/README.md`: the SAT
 * publishes this list **one oficio at a time as a DOF note**, each with an
 * "Anexo 1" HTML table of the seven columns `ANEXO_COLUMNS` names, and there is
 * no machine-readable listing. The SAT's own open-data catalogue carries article
 * 69, article 69-B and article 69-B Bis and nothing for 49 Bis. Fourteen oficios
 * naming fourteen taxpayers had been published by that date, the first on
 * 2026-07-10.
 *
 * So this module ships a loader and no data. `official49BisListing()` answers
 * `loaded: false` with the counts above and the URL to check them, which is the
 * honest shape of a control that is written and not armed, and the alternative
 * would be a screen implying coverage the SAT does not publish. The loader reads
 * the published Anexo layout, the fixture that exercises it is synthetic and says
 * so in its first line, and the manual steps to turn a DOF note into a file this
 * loader accepts are in `snapshot/README.md`.
 *
 * ## Why this is not a `SatListEntry` with a fifth status
 *
 * Article 69-B publishes four situations and corrects itself in both directions,
 * so a 69-B row carries a status and a dated history. Article 49 Bis, fraccion X
 * orders the publication of one outcome and provides for no published clearing:
 * the other outcome of fraccion VIII, inciso a), lifts the suspension of the
 * taxpayer's own invoicing and is never published. Presence on this list IS the
 * state. Nothing here may report a 49 Bis taxpayer as cleared, and a fifth
 * `SatListStatus` would have invited exactly that.
 */

import type {
  Cfdi,
  LedgerEvent,
  Rfc,
  Sat49BisEntry,
  Sat49BisNotice,
  Sat49BisSweepResult,
} from "@hackmty/core";
import { sumAmounts } from "@hackmty/core";
import { type CsvRow, decodeSnapshot, foldHeader, parseCsvRows } from "./csv";
import { addNaturalDays, naturalDaysBetween, parseDofDate } from "./dates";
import { isRfcShaped, normalizeRfc } from "./rfc";
import { type PaidLedger, paidLedger, priceCfdis } from "./sweep";

/* -------------------------------------------------------------------------- */
/* The statute, as constants                                                   */
/* -------------------------------------------------------------------------- */

/** How the article is written in every string this product shows a clerk. */
export const ART_49BIS_LABEL = "49 Bis";

/**
 * Article 49 Bis, fraccion X: `treinta dias naturales a partir de la publicacion
 * en el Diario Oficial de la Federacion`. Natural days, so weekends count.
 */
export const ART_49BIS_CORRECTION_DAYS = 30;

/**
 * Where a reader checks the publications for themselves. The DOF full-text search
 * for `fraccion X del articulo 49 Bis` answered fourteen notes on 2026-09-12.
 */
export const ART_49BIS_DOF_SEARCH_URL =
  "https://dof.gob.mx/busqueda_detalle.php";

/** The day the DOF and the SAT open-data catalogue were surveyed for this list. */
export const ART_49BIS_SURVEYED_AT = "2026-09-12";

/** Oficios the DOF had published under fraccion X by `ART_49BIS_SURVEYED_AT`. */
export const ART_49BIS_OFICIOS_PUBLISHED = 14;

/** Taxpayers those oficios name. One each, so far. */
export const ART_49BIS_TAXPAYERS_PUBLISHED = 14;

/** DOF date of the first publication under fraccion X. */
export const ART_49BIS_FIRST_PUBLISHED_AT = "2026-07-10";

/** DOF date of the newest publication at the survey. */
export const ART_49BIS_LAST_PUBLISHED_AT = "2026-08-28";

/**
 * The coverage state of this list in this build.
 *
 * `not_published_machine_readable` is a statement about the SAT and not about us:
 * the list exists, we can read the statute and the DOF notes, and there is no
 * file to load. It is carried into `GET /api/v1/sat/lookup` verbatim so a screen
 * can say which of the two lists answered and which one could not.
 */
export type Sat49BisCoverage = "loaded" | "not_published_machine_readable";

/* -------------------------------------------------------------------------- */
/* The thirty natural days                                                     */
/* -------------------------------------------------------------------------- */

export interface CorrectionWindow {
  /** DOF publication date the clock runs from. */
  publishedAt: string;
  /** Last day the complementary return still avoids the seal restriction. */
  correctBy: string;
  /** Days left at `now`, negative once the window has closed. */
  daysLeft: number;
  /** True while the complementary return is still the cheap way out. */
  open: boolean;
}

/**
 * The last day of the thirty natural days.
 *
 * The article says `a partir de la publicacion` and does not spell out whether the
 * publication day is day one. This function takes the reading that COSTS US LESS
 * TO BE WRONG ABOUT: the publication day counts, so the deadline is the
 * publication date plus twenty-nine days. Being one day early on a screen costs a
 * clerk nothing; being one day late costs them the digital seal under article
 * 17-H Bis, fraccion XIV. It is an assumption and it is stated as one wherever the
 * date is shown, exactly like the ISR rate in `sweep.ts`.
 */
export function correctionDeadline(publishedAt: string): string | undefined {
  return addNaturalDays(publishedAt, ART_49BIS_CORRECTION_DAYS - 1);
}

/** The window as of `now`, undefined when the publication date is unreadable. */
export function correctionWindow(
  publishedAt: string,
  now: string,
): CorrectionWindow | undefined {
  const correctBy = correctionDeadline(publishedAt);
  if (correctBy === undefined) {
    return undefined;
  }

  const daysLeft = naturalDaysBetween(now.slice(0, 10), correctBy);
  if (daysLeft === undefined) {
    return undefined;
  }

  return { publishedAt, correctBy, daysLeft, open: daysLeft >= 0 };
}

/* -------------------------------------------------------------------------- */
/* Looking one taxpayer up                                                     */
/* -------------------------------------------------------------------------- */

export interface Sat49BisMatch {
  rfc: Rfc;
  /** Every publication naming this RFC, newest DOF date first. */
  entries: Sat49BisEntry[];
  /** The newest publication, absent when the RFC is on none we hold. */
  effective?: Sat49BisEntry;
  /**
   * True when this RFC appears on any publication we hold. There is no
   * `desvirtuado` here: fraccion X publishes one outcome and no clearing, so
   * unlike 69-B the newest row cannot undo an older one.
   */
  listed: boolean;
}

function byRecency(left: Sat49BisEntry, right: Sat49BisEntry): number {
  const published = right.publishedAt.localeCompare(left.publishedAt);
  return published === 0 ? right.oficio.localeCompare(left.oficio) : published;
}

export function match49Bis(
  entries: readonly Sat49BisEntry[],
  rfc: Rfc,
): Sat49BisMatch {
  const wanted = normalizeRfc(rfc);
  const rows = entries
    .filter((entry) => normalizeRfc(entry.rfc) === wanted)
    .sort(byRecency);
  const effective = rows[0];

  return {
    rfc: wanted,
    entries: rows,
    ...(effective === undefined ? {} : { effective }),
    listed: effective !== undefined,
  };
}

export interface Sat49BisIndex {
  lookup(rfc: Rfc): Sat49BisEntry[];
  match(rfc: Rfc): Sat49BisMatch;
  /** Distinct taxpayers. */
  taxpayers: number;
  /** Rows, which is larger when one taxpayer is published more than once. */
  size: number;
}

export function create49BisIndex(
  entries: readonly Sat49BisEntry[],
): Sat49BisIndex {
  const byRfc = new Map<string, Sat49BisEntry[]>();

  for (const entry of entries) {
    const rfc = normalizeRfc(entry.rfc);
    const rows = byRfc.get(rfc);
    if (rows === undefined) {
      byRfc.set(rfc, [entry]);
      continue;
    }
    rows.push(entry);
  }

  for (const rows of byRfc.values()) {
    rows.sort(byRecency);
  }

  return {
    lookup: (rfc) => [...(byRfc.get(normalizeRfc(rfc)) ?? [])],
    match(rfc) {
      const wanted = normalizeRfc(rfc);
      const rows = byRfc.get(wanted) ?? [];
      const effective = rows[0];
      return {
        rfc: wanted,
        entries: [...rows],
        ...(effective === undefined ? {} : { effective }),
        listed: effective !== undefined,
      };
    },
    taxpayers: byRfc.size,
    size: entries.length,
  };
}

/* -------------------------------------------------------------------------- */
/* The listing, and the fact that it is not loaded                             */
/* -------------------------------------------------------------------------- */

/**
 * What this build holds for article 49 Bis.
 *
 * The `loaded: false` shape is deliberate and it is the point of the issue: it
 * carries the counts, the survey date and the URL to check them, so a screen can
 * distinguish "this supplier is on no 49 Bis publication" from "we cannot answer
 * for 49 Bis". A blacklist that answers an empty list where it means "not loaded"
 * is worse than no blacklist.
 */
export type Sat49BisListing =
  | {
      coverage: "loaded";
      index: Sat49BisIndex;
      listVersion: string;
      retrievedAt: string;
      source: string;
    }
  | {
      coverage: "not_published_machine_readable";
      /** Oficios seen in the DOF at `surveyedAt`, each naming one taxpayer. */
      oficiosPublished: number;
      taxpayersPublished: number;
      firstPublishedAt: string;
      lastPublishedAt: string;
      surveyedAt: string;
      /** Where a reader repeats the survey. */
      source: string;
    };

/**
 * The 49 Bis coverage of this build, which is a loader and no data.
 *
 * When the SAT ships a machine-readable listing this becomes the `loaded` arm
 * over `load49BisPublications`, the file is committed with its provenance the way
 * `official-2026-09-12.csv` is, and nothing else in the product changes: the
 * lookup, the control and the sweep already read this shape.
 */
export function official49BisListing(): Sat49BisListing {
  return {
    coverage: "not_published_machine_readable",
    oficiosPublished: ART_49BIS_OFICIOS_PUBLISHED,
    taxpayersPublished: ART_49BIS_TAXPAYERS_PUBLISHED,
    firstPublishedAt: ART_49BIS_FIRST_PUBLISHED_AT,
    lastPublishedAt: ART_49BIS_LAST_PUBLISHED_AT,
    surveyedAt: ART_49BIS_SURVEYED_AT,
    source: ART_49BIS_DOF_SEARCH_URL,
  };
}

/* -------------------------------------------------------------------------- */
/* The loader                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * The Anexo 1 columns, as the published oficio spells them.
 *
 * Transcribed from oficio 500-05-00-00-00-2026-24472, DOF 28 August 2026. The
 * published header is two levels: `Medio de notificacion al contribuyente` spans
 * a `Notificacion por Buzon Tributario` pair and an `Estrados de la autoridad`
 * pair, and both pairs end in a column called `Fecha en que surtio efectos la
 * notificacion`. A flattened export therefore carries that name twice, which is
 * why the loader pairs each `surtio efectos` column with the nearest dated notice
 * column to its left instead of trusting a position or a spelling somebody
 * invented to disambiguate them.
 */
export const ANEXO_COLUMNS = [
  "R.F.C.",
  "Nombre, denominacion o razon social del Contribuyente",
  "Numero y fecha de oficio de resolucion",
  "Fecha de notificacion",
  "Fecha en que surtio efectos la notificacion",
  "Fecha de fijacion en los estrados de la Autoridad Fiscal",
  "Fecha en que surtio efectos la notificacion",
] as const;

export type Sat49BisRejectionReason =
  | "short_row"
  | "rfc_missing"
  | "rfc_shape"
  | "oficio_missing";

export interface Sat49BisRejectedRow {
  /** 1-based line number in the source file, header included. */
  line: number;
  reason: Sat49BisRejectionReason;
  raw: string;
}

/**
 * A row that produced an entry with something missing from it. Separate from
 * `rejected` because the taxpayer IS published and the row is matched: a
 * publication lost over an unreadable notice date would be a false negative on a
 * fiscal blacklist, which is the one bug this package must not have in silence.
 */
export interface Sat49BisWarning {
  line: number;
  reason: "notice_undated";
  rfc: Rfc;
}

export interface Sat49BisPublication {
  /** The version id, which is the DOF date of the publication. */
  listVersion: string;
  /** DOF publication date, `YYYY-MM-DD`. The buyer's clock runs from it. */
  publishedAt: string;
  /** Last day of the thirty natural days. */
  correctBy: string;
  source: string;
  loadedAt: string;
  /** Which decoder read the bytes. Absent when the caller supplied text. */
  encoding?: string;
  /** Data rows read, accepted and rejected together. */
  rows: number;
  entries: Sat49BisEntry[];
  rejected: Sat49BisRejectedRow[];
  warnings: Sat49BisWarning[];
}

export class Sat49BisFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "Sat49BisFormatError";
  }
}

export interface Parse49BisOptions {
  /**
   * DOF publication date of the oficio, `YYYY-MM-DD`. REQUIRED, and not sniffed
   * from the file: unlike the 69-B listing, the Anexo does not state the day it
   * was published anywhere inside itself, and the day the buyer's thirty natural
   * days run from is the one number here nobody may infer.
   */
  publishedAt: string;
  /** Defaults to `publishedAt`, the way the 69-B list version is its cut-off date. */
  listVersion?: string;
  source?: string;
  /** Injected so `loadedAt` is fixed in a test. */
  now?: string;
}

/** How many lines to search for the header before giving up. */
const HEADER_SEARCH_LIMIT = 12;

/** Longest excerpt kept for a rejected row. A blacklist row is not a log line. */
const EXCERPT_LIMIT = 160;

/**
 * Reads one 49 Bis publication out of a delimited transcription of its Anexo 1.
 *
 * @throws Sat49BisFormatError when `publishedAt` is not a day, or when the header
 *   carries no RFC column and no oficio column. Both are the same class of
 *   failure: continuing would produce an empty publication, and an empty
 *   publication reads as "nobody is published" to every caller downstream.
 */
export function parse49BisPublication(
  text: string,
  options: Parse49BisOptions,
): Sat49BisPublication {
  const publishedAt = parseDofDate(options.publishedAt);
  if (publishedAt === undefined) {
    throw new Sat49BisFormatError(
      `publishedAt must be the DOF date of the oficio and ${options.publishedAt} is not a date. The thirty natural days of article 49 Bis, fraccion X run from it.`,
    );
  }

  const correctBy = correctionDeadline(publishedAt);
  if (correctBy === undefined) {
    throw new Sat49BisFormatError(
      `the thirty day window could not be computed from ${publishedAt}.`,
    );
  }

  const listVersion = options.listVersion ?? publishedAt;
  const rows = parseCsvRows(text);
  const header = findHeader(rows);
  const columns = resolveColumns(header.row.fields);

  const entries: Sat49BisEntry[] = [];
  const rejected: Sat49BisRejectedRow[] = [];
  const warnings: Sat49BisWarning[] = [];
  let dataRows = 0;

  for (const row of rows.slice(header.index + 1)) {
    if (row.fields.every((field) => field.trim() === "")) {
      continue;
    }
    dataRows += 1;
    readRow(
      row,
      columns,
      { listVersion, publishedAt },
      entries,
      rejected,
      warnings,
    );
  }

  return {
    listVersion,
    publishedAt,
    correctBy,
    source: options.source ?? "text",
    loadedAt: options.now ?? new Date().toISOString(),
    rows: dataRows,
    entries,
    rejected,
    warnings,
  };
}

/** `parse49BisPublication` over bytes, so a download is decoded the same way. */
export function load49BisPublication(
  bytes: Uint8Array,
  options: Parse49BisOptions,
): Sat49BisPublication {
  const decoded = decodeSnapshot(bytes);
  return {
    ...parse49BisPublication(decoded.text, options),
    encoding: decoded.encoding,
  };
}

interface NoticeColumns {
  notice: Sat49BisNotice;
  /** The dated notice column. */
  date: number;
  /** The `surtio efectos` column that belongs to it, when the file carries one. */
  effective: number;
}

interface Columns {
  rfc: number;
  name: number;
  oficio: number;
  notices: NoticeColumns[];
  minimumFields: number;
}

/** Dots removed as well, because the published RFC header is `R.F.C.`. */
function foldColumn(raw: string): string {
  return foldHeader(raw).replace(/\./g, "");
}

function findHeader(rows: readonly CsvRow[]): { row: CsvRow; index: number } {
  const limit = Math.min(rows.length, HEADER_SEARCH_LIMIT);

  for (let index = 0; index < limit; index += 1) {
    const row = rows[index];
    if (row === undefined) {
      continue;
    }
    const folded = row.fields.map(foldColumn);
    if (
      folded.includes("rfc") &&
      folded.some((cell) => cell.includes("nombre"))
    ) {
      return { row, index };
    }
  }

  throw new Sat49BisFormatError(
    `no header row with an RFC column in the first ${String(limit)} lines. This is not the Anexo of an article 49 Bis oficio.`,
  );
}

function resolveColumns(header: readonly string[]): Columns {
  const folded = header.map(foldColumn);

  const rfc = folded.indexOf("rfc");
  const name = folded.findIndex((cell) => cell.includes("nombre"));
  const oficio = folded.findIndex(
    (cell) => cell.includes("oficio") && cell.includes("resolucion"),
  );

  if (rfc === -1 || oficio === -1) {
    throw new Sat49BisFormatError(
      "the header has no RFC column or no resolution oficio column.",
    );
  }

  // Named, never positional, and the pairing rule is the one documented on
  // ANEXO_COLUMNS: a `surtio efectos` column belongs to the nearest notice
  // column to its left, because the published header groups them that way and a
  // flattened export loses the group row.
  const notices: NoticeColumns[] = [];
  for (const [index, cell] of folded.entries()) {
    const notice = noticeOf(cell);
    if (notice === undefined) {
      continue;
    }
    notices.push({
      notice,
      date: index,
      effective: effectiveAfter(folded, index),
    });
  }

  return {
    rfc,
    name,
    oficio,
    notices,
    minimumFields: Math.max(rfc, name, oficio) + 1,
  };
}

function noticeOf(folded: string): Sat49BisNotice | undefined {
  if (folded.startsWith("fecha de notificacion")) {
    return "buzon_tributario";
  }
  return folded.startsWith("fecha de fijacion") ? "estrados" : undefined;
}

function effectiveAfter(folded: readonly string[], from: number): number {
  for (let index = from + 1; index < folded.length; index += 1) {
    const cell = folded[index] ?? "";
    if (noticeOf(cell) !== undefined) {
      return -1;
    }
    if (cell.includes("surtio efectos")) {
      return index;
    }
  }
  return -1;
}

function readRow(
  row: CsvRow,
  columns: Columns,
  version: { listVersion: string; publishedAt: string },
  entries: Sat49BisEntry[],
  rejected: Sat49BisRejectedRow[],
  warnings: Sat49BisWarning[],
): void {
  if (row.fields.length < columns.minimumFields) {
    rejected.push(reject(row, "short_row"));
    return;
  }

  const rawRfc = cell(row, columns.rfc);
  if (rawRfc === "") {
    rejected.push(reject(row, "rfc_missing"));
    return;
  }

  const rfc = normalizeRfc(rawRfc);
  if (!isRfcShaped(rfc)) {
    // The 69-B listing redacts an RFC by court order and leaves the row in
    // place. Nothing says the Anexo will not, so an unreadable RFC is reported
    // with its line number and never matched and never dropped in silence.
    rejected.push(reject(row, "rfc_shape"));
    return;
  }

  const oficio = cell(row, columns.oficio);
  if (oficio === "") {
    // The oficio is how a clerk finds the resolution behind the publication. A
    // row without one is an accusation with no reference and is refused.
    rejected.push(reject(row, "oficio_missing"));
    return;
  }

  const name = cell(row, columns.name);
  const notice = readNotice(row, columns);
  if (notice === undefined) {
    warnings.push({ line: row.line, reason: "notice_undated", rfc });
  }

  entries.push({
    rfc,
    name: name === "" ? rfc : name,
    publishedAt: version.publishedAt,
    oficio,
    ...(notice === undefined ? {} : notice),
    listVersion: version.listVersion,
  });
}

function readNotice(
  row: CsvRow,
  columns: Columns,
): { notifiedBy: Sat49BisNotice; noticeEffectiveAt?: string } | undefined {
  for (const column of columns.notices) {
    if (parseDofDate(cell(row, column.date)) === undefined) {
      continue;
    }
    const effective =
      column.effective === -1
        ? undefined
        : parseDofDate(cell(row, column.effective));

    return {
      notifiedBy: column.notice,
      ...(effective === undefined ? {} : { noticeEffectiveAt: effective }),
    };
  }
  return undefined;
}

function cell(row: CsvRow, index: number): string {
  return (row.fields[index] ?? "").trim();
}

function reject(
  row: CsvRow,
  reason: Sat49BisRejectionReason,
): Sat49BisRejectedRow {
  const raw = row.fields.join(",");
  return {
    line: row.line,
    reason,
    raw:
      raw.length <= EXCERPT_LIMIT ? raw : `${raw.slice(0, EXCERPT_LIMIT)}...`,
  };
}

/* -------------------------------------------------------------------------- */
/* The fixture, which is not the listing                                       */
/* -------------------------------------------------------------------------- */

/**
 * The synthetic file that exercises the loader. It is NOT a snapshot of anything.
 *
 * There is no official 49 Bis file to commit, so this repository commits a
 * transcription of the published LAYOUT filled with invented rows: every RFC
 * carries the `SYN` prefix, every legal name says SINTETICA or SINTETICO, every
 * oficio number is prefixed `SIM-`, and the first line of the file says in Spanish
 * that it is not the SAT's file. That is the same rule `snapshot/synthetic.ts`
 * follows for 69-B and it exists for the same reason: a supplier is invented data,
 * whereas a row on a fiscal blacklist is an accusation, and an invented accusation
 * has to read as invented in a cropped screenshot with the watermark gone.
 */
export const ART_49BIS_FIXTURE_FILENAME = "art49bis-fixture.csv";

/** The fixture, resolved relative to this module rather than to a cwd. */
export function art49BisFixtureFile(): URL {
  return new URL(`./snapshot/${ART_49BIS_FIXTURE_FILENAME}`, import.meta.url);
}

export interface LoadFixtureOptions extends Parse49BisOptions {
  /** Injected so a test can hand over bytes without touching the disk. */
  readFile?: (file: URL) => Promise<Uint8Array>;
}

/**
 * Parses the fixture. For tests and for nothing else: it must never reach a
 * screen, an endpoint or a finding, because the rows in it name nobody.
 */
export async function loadFixture49BisPublication(
  options: LoadFixtureOptions,
): Promise<Sat49BisPublication> {
  const read = options.readFile ?? readLocalFile;
  const bytes = await read(art49BisFixtureFile());

  return load49BisPublication(bytes, {
    ...options,
    source:
      options.source ?? `${ART_49BIS_FIXTURE_FILENAME} (synthetic fixture)`,
  });
}

async function readLocalFile(file: URL): Promise<Uint8Array> {
  const { readFile } = await import("node:fs/promises");
  return new Uint8Array(await readFile(file));
}

/* -------------------------------------------------------------------------- */
/* The retroactive sweep                                                       */
/* -------------------------------------------------------------------------- */

export interface Sweep49BisOptions {
  /** The publication being swept. */
  entries: readonly Sat49BisEntry[];
  /** DOF date of that publication, `YYYY-MM-DD`. */
  publishedAt: string;
  /** Defaults to `publishedAt`. */
  listVersion?: string;
  /** Only CFDIs settled at or before this instant count. Defaults to the whole ledger. */
  asOf?: string;
  /** Overrides the 30 percent ISR assumption. See `sweep.ts` for what it is. */
  isrRate?: number;
}

/**
 * What a 49 Bis publication did to invoices we already paid and already deducted.
 *
 * The same shape as the 69-B sweep and, deliberately, the same arithmetic: the
 * money comes from `priceCfdis` in `sweep.ts` and the paid invoices from the same
 * `paidLedger` fold, so "what does this publication cost" has one implementation
 * and cannot answer two different numbers on stage.
 *
 * Two differences from `sweep`, and both are the statute rather than taste.
 *
 * 1. **No prior-version diff.** The 69-B sweep subtracts taxpayers already listed
 *    before this version, because 69-B republishes and corrects. Fraccion X
 *    publishes one outcome once, so every RFC in the publication is newly
 *    published by construction; a republication of the same RFC is the same case
 *    and is deduplicated here rather than priced twice.
 * 2. **A deadline.** `correctBy` is on the result, because the thing a clerk does
 *    with this number is file a complementary return before the thirty natural
 *    days close, and a sweep that reports pesos without the date reports half of
 *    the decision.
 *
 * There is no `sat_49bis_published` ledger event and the publication is an
 * argument. That is the honest shape while the SAT ships no machine-readable
 * listing: nothing in this repository can hold a 49 Bis version it did not
 * transcribe by hand, so nothing pretends to replay one out of the event log.
 */
export function sweep49Bis(
  events: readonly LedgerEvent[],
  options: Sweep49BisOptions,
): Sat49BisSweepResult {
  const ledger: PaidLedger = paidLedger(events);
  const correctBy = correctionDeadline(options.publishedAt);
  if (correctBy === undefined) {
    throw new Sat49BisFormatError(
      `the thirty day window could not be computed from ${options.publishedAt}.`,
    );
  }

  const newlyListed: Sat49BisSweepResult["newlyListed"] = [];
  const seen = new Set<Rfc>();

  for (const entry of options.entries) {
    const rfc = normalizeRfc(entry.rfc);
    if (seen.has(rfc)) {
      continue;
    }
    seen.add(rfc);

    const supplier = ledger.supplier(rfc);
    if (supplier === undefined) {
      // A published RFC we have never invoiced is news, not exposure.
      continue;
    }

    const paid: Cfdi[] = ledger.paidCfdis(rfc, options.asOf);
    newlyListed.push({
      supplier,
      entry,
      ...priceCfdis(paid, options.isrRate),
    });
  }

  return {
    listVersion: options.listVersion ?? options.publishedAt,
    publishedAt: options.publishedAt,
    correctBy,
    newlyListed,
    totalExposure: sumAmounts(
      newlyListed.flatMap((row) => [row.isrExposure, row.ivaExposure]),
    ),
  };
}
