/**
 * One published version of the Article 69-B list, turned into `SatListEntry[]`.
 *
 * The shape of the published file, confirmed against the snapshot committed in
 * `snapshot/official-2026-09-12.csv` and written down in `snapshot/README.md`:
 *
 * - Two preamble lines (a legal notice and a title), then the header on line 3.
 * - Twenty columns. Four of them describe the taxpayer, and the other sixteen
 *   are four blocks of four, one block per situation: the oficio, the date it
 *   went up on the SAT portal, the oficio again for the DOF, and the date it was
 *   published in the DOF.
 * - One row therefore carries a HISTORY, not a state. A taxpayer who was
 *   presumed in 2018, listed definitively later that year and cleared by a court
 *   in 2019 is one row with three dates, and this loader turns it into three
 *   entries. That is what makes "was this supplier listed on the day we deducted
 *   the invoice" answerable, and it is why the key in `0003_sentryone.sql` is
 *   `(list_version, rfc, status)`.
 *
 * Two behaviours are deliberate and both are tested:
 *
 * 1. **Columns are resolved by name, never by position.** The SAT reorders and
 *    respells; a position is a silent corruption and a name is a loud failure.
 * 2. **Nothing is dropped in silence.** A row the parser refuses comes back in
 *    `rejected` with its line number, its reason and an excerpt, so the accepted
 *    count plus the rejected count is the row count in the file and the total can
 *    be reconciled against what the portal claims.
 */

import type { SatListEntry, SatListStatus } from "@hackmty/core";
import { type CsvRow, decodeSnapshot, foldHeader, parseCsvRows } from "./csv";
import { parseDofDate, parseUpdatedAsOf } from "./dates";
import { isRfcShaped, normalizeRfc } from "./rfc";
import { parseSatStatus, SAT_STATUSES } from "./status";

/**
 * Where a snapshot comes from. `text` and `bytes` are the offline paths, used by
 * the tests and by the committed download; `url` is the live path a judge can
 * watch run.
 *
 * `listVersion` is supplied by the caller and not sniffed from the file: the SAT
 * puts no version id inside the document, so the date the download is current to
 * is the identifier, and inventing one from the contents would be a lie with a
 * date attached. `publishedAt` defaults to the date the file states in its own
 * preamble, which is a sentence the SAT wrote and not a guess we made.
 */
export type SnapshotSource =
  | {
      kind: "text";
      csv: string;
      listVersion: string;
      publishedAt?: string;
      source?: string;
    }
  | {
      kind: "bytes";
      bytes: Uint8Array;
      listVersion: string;
      publishedAt?: string;
      source?: string;
    }
  | {
      kind: "url";
      url: string;
      listVersion: string;
      publishedAt?: string;
      source?: string;
      /** Injected so a test can serve the fixture without a network. */
      fetch?: SnapshotFetch;
    };

/**
 * Only what the loader calls. Narrower than `typeof fetch` on purpose: the
 * loader passes a URL string and reads the body, so a fake in a test is a
 * three-line function rather than a reimplementation of the platform.
 */
export type SnapshotFetch = (url: string) => Promise<Response>;

export type RejectionReason =
  | "short_row"
  | "rfc_missing"
  | "rfc_shape"
  | "no_dated_situation";

/**
 * A row that produced no entry at all, kept so the count can be reconciled with
 * the portal: accepted rows plus `rejected.length` is `rows`, always.
 */
export interface RejectedRow {
  /** 1-based line number in the source file, header included. */
  line: number;
  reason: RejectionReason;
  raw: string;
}

/**
 * A row that produced entries but lost one of them: the SAT's own situation
 * column names a status whose date columns are both unreadable, so the row is on
 * the list under a situation this package cannot place in time. It is separate
 * from `rejected` because the row is still matched, and it is reported at all
 * because a taxpayer the SAT calls definitivo who reads as presunto here is a
 * false negative on a fiscal blacklist, which is the one bug this package must
 * not have in silence.
 */
export interface SnapshotWarning {
  line: number;
  reason: "situation_undated";
  status: SatListStatus;
  raw: string;
}

export interface SatSnapshot {
  listVersion: string;
  /** The day this version is current to, "YYYY-MM-DD". */
  publishedAt: string;
  source: string;
  loadedAt: string;
  /** Which decoder read the bytes. Absent when the caller supplied text. */
  encoding?: string;
  /** Data rows read from the file, accepted and rejected together. */
  rows: number;
  entries: SatListEntry[];
  rejected: RejectedRow[];
  warnings: SnapshotWarning[];
}

export interface LoadOptions {
  /** Injected so the snapshot's `loadedAt` is fixed in a test. */
  now?: string;
}

/** How many lines to search for the header before giving up. */
const HEADER_SEARCH_LIMIT = 12;

/** Longest excerpt kept for a rejected row. A blacklist row is not a log line. */
const EXCERPT_LIMIT = 160;

export class SnapshotFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SnapshotFormatError";
  }
}

/**
 * Parses one published version of the list into `SatListEntry` rows.
 *
 * @throws SnapshotFormatError when the header cannot be found or the RFC and
 *   situation columns are not in it. That is not a bad row, it is a different
 *   file, and continuing would produce an empty list that reads as "nobody is
 *   listed" to every caller downstream.
 */
export async function loadSnapshot(
  source: SnapshotSource,
  options: LoadOptions = {},
): Promise<SatSnapshot> {
  const { text, encoding } = await readSource(source);
  const parsed = parseSnapshot(text, {
    listVersion: source.listVersion,
    publishedAt: source.publishedAt,
    source: source.source ?? describeSource(source),
    now: options.now,
  });

  return encoding === undefined ? parsed : { ...parsed, encoding };
}

interface ParseOptions {
  listVersion: string;
  publishedAt?: string;
  source: string;
  now?: string;
}

/** The synchronous half, so a caller that already holds the text skips the IO. */
export function parseSnapshot(
  text: string,
  options: ParseOptions,
): SatSnapshot {
  const rows = parseCsvRows(text);
  const header = findHeader(rows);
  const columns = resolveColumns(header.row.fields);

  const entries: SatListEntry[] = [];
  const rejected: RejectedRow[] = [];
  const warnings: SnapshotWarning[] = [];
  let dataRows = 0;

  for (const row of rows.slice(header.index + 1)) {
    if (isBlank(row)) {
      continue;
    }
    dataRows += 1;
    readRow(row, columns, options.listVersion, entries, rejected, warnings);
  }

  return {
    listVersion: options.listVersion,
    publishedAt:
      options.publishedAt ??
      parseUpdatedAsOf(preambleOf(rows, header.index)) ??
      options.listVersion,
    source: options.source,
    loadedAt: options.now ?? new Date().toISOString(),
    rows: dataRows,
    entries,
    rejected,
    warnings,
  };
}

/* -------------------------------------------------------------------------- */
/* Reading the bytes                                                           */
/* -------------------------------------------------------------------------- */

async function readSource(
  source: SnapshotSource,
): Promise<{ text: string; encoding?: string }> {
  if (source.kind === "text") {
    return { text: source.csv };
  }

  if (source.kind === "bytes") {
    const decoded = decodeSnapshot(source.bytes);
    return { text: decoded.text, encoding: decoded.encoding };
  }

  const request = source.fetch ?? globalThis.fetch;
  const response = await request(source.url);
  if (!response.ok) {
    throw new SnapshotFormatError(
      `the list could not be downloaded: ${String(response.status)} ${response.statusText}`,
    );
  }

  // Decoded from bytes rather than from response.text(), which assumes UTF-8 and
  // turns every accented legal name into replacement characters.
  const decoded = decodeSnapshot(new Uint8Array(await response.arrayBuffer()));
  return { text: decoded.text, encoding: decoded.encoding };
}

function describeSource(source: SnapshotSource): string {
  return source.kind === "url" ? source.url : source.kind;
}

/* -------------------------------------------------------------------------- */
/* Columns                                                                     */
/* -------------------------------------------------------------------------- */

interface SituationColumns {
  status: SatListStatus;
  /** "Publicacion DOF <situacion>", the date that decides. */
  dof: number;
  /** "Publicacion pagina SAT <situacion>", the documented fallback. */
  portal: number;
}

interface Columns {
  rfc: number;
  name: number;
  situation: number;
  situations: SituationColumns[];
  /**
   * Fields a row must have to be a taxpayer row at all. Trailing situation
   * columns may legitimately be missing when an exporter trims empty cells, so
   * the floor is the taxpayer block and not the full header width.
   */
  minimumFields: number;
}

/**
 * Words that identify a situation in a column name. The published header words
 * each situation differently from the value in the situation column itself
 * ("presuncion" against "Presunto", "desvirtuaron" against "Desvirtuado"), which
 * is exactly why this table exists instead of a regular expression over the
 * status value.
 */
const SITUATION_HINTS: Record<SatListStatus, readonly string[]> = {
  presunto: ["presunto", "presuncion"],
  desvirtuado: ["desvirtuad", "desvirtuaron"],
  definitivo: ["definitiv"],
  sentencia_favorable: ["sentencia favorable"],
};

function findHeader(rows: readonly CsvRow[]): { row: CsvRow; index: number } {
  const limit = Math.min(rows.length, HEADER_SEARCH_LIMIT);

  for (let index = 0; index < limit; index += 1) {
    const row = rows[index];
    if (row === undefined) {
      continue;
    }
    const folded = row.fields.map(foldHeader);
    if (
      folded.includes("rfc") &&
      folded.some((cell) => cell.includes("nombre"))
    ) {
      return { row, index };
    }
  }

  throw new SnapshotFormatError(
    `no header row with an RFC column in the first ${String(limit)} lines. This is not the Article 69-B listing.`,
  );
}

function resolveColumns(header: readonly string[]): Columns {
  const folded = header.map(foldHeader);

  const rfc = folded.indexOf("rfc");
  const name = folded.findIndex((cell) => cell.includes("nombre"));
  const situation = folded.findIndex((cell) => cell.includes("situacion"));

  if (rfc === -1 || name === -1) {
    throw new SnapshotFormatError(
      "the header has no RFC column or no name column.",
    );
  }

  const situations: SituationColumns[] = [];
  for (const status of SAT_STATUSES) {
    const hints = SITUATION_HINTS[status];
    const dof = folded.findIndex(
      (cell) =>
        cell.startsWith("publicacion dof") &&
        hints.some((hint) => cell.includes(hint)),
    );
    const portal = folded.findIndex(
      (cell) =>
        cell.startsWith("publicacion pagina sat") &&
        hints.some((hint) => cell.includes(hint)),
    );
    if (dof === -1 && portal === -1) {
      continue;
    }
    situations.push({ status, dof, portal });
  }

  if (situations.length === 0) {
    throw new SnapshotFormatError(
      "the header carries no publication date column for any of the four situations.",
    );
  }

  return {
    rfc,
    name,
    situation,
    situations,
    minimumFields: Math.max(rfc, name, situation) + 1,
  };
}

/* -------------------------------------------------------------------------- */
/* Rows                                                                        */
/* -------------------------------------------------------------------------- */

function readRow(
  row: CsvRow,
  columns: Columns,
  listVersion: string,
  entries: SatListEntry[],
  rejected: RejectedRow[],
  warnings: SnapshotWarning[],
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
    // Redacted rows exist: 91 of the 14234 in the committed snapshot carry
    // XXXXXXXXXXXX where the RFC belongs. They are reported, never matched.
    rejected.push(reject(row, "rfc_shape"));
    return;
  }

  const name = cell(row, columns.name);
  const declared = parseSatStatus(cell(row, columns.situation));
  const produced: SatListStatus[] = [];

  for (const situation of columns.situations) {
    const publishedAt = situationDate(row, situation);
    if (publishedAt === undefined) {
      continue;
    }
    entries.push({
      rfc,
      name: name === "" ? rfc : name,
      status: situation.status,
      publishedAt,
      listVersion,
    });
    produced.push(situation.status);
  }

  if (produced.length === 0) {
    rejected.push(reject(row, "no_dated_situation"));
    return;
  }

  // The situation column is the SAT's own summary of the row. It is a
  // cross-check and never a fifth entry: every status it can name already has
  // its own dated column, and a status with no readable date is a status this
  // package cannot place in time, which is the only thing the sweep needs.
  if (declared !== undefined && !produced.includes(declared)) {
    warnings.push({
      line: row.line,
      reason: "situation_undated",
      status: declared,
      raw: excerpt(row.fields.join(",")),
    });
  }
}

/**
 * The DOF publication date of one situation, with the SAT portal date as the
 * documented fallback.
 *
 * 483 of the 29106 dated situations in the committed snapshot have an unreadable
 * DOF cell (an empty one, a pair of dates, or a spreadsheet serial) and a
 * perfectly readable portal date on the same row. Falling back to it keeps those
 * 483 situations on the list instead of dropping them, and both columns are the
 * SAT's own publication of the same oficio, so nothing is invented by preferring
 * one over the other. The DOF is tried first because the DOF is what the CFF
 * counts from.
 */
function situationDate(
  row: CsvRow,
  situation: SituationColumns,
): string | undefined {
  const dof =
    situation.dof === -1 ? undefined : parseDofDate(cell(row, situation.dof));
  if (dof !== undefined) {
    return dof;
  }
  return situation.portal === -1
    ? undefined
    : parseDofDate(cell(row, situation.portal));
}

function cell(row: CsvRow, index: number): string {
  return (row.fields[index] ?? "").trim();
}

function isBlank(row: CsvRow): boolean {
  return row.fields.every((field) => field.trim() === "");
}

function reject(row: CsvRow, reason: RejectionReason): RejectedRow {
  return {
    line: row.line,
    reason,
    raw: excerpt(row.fields.join(",")),
  };
}

function excerpt(raw: string): string {
  return raw.length <= EXCERPT_LIMIT
    ? raw
    : `${raw.slice(0, EXCERPT_LIMIT)}...`;
}

function preambleOf(rows: readonly CsvRow[], headerIndex: number): string {
  return rows
    .slice(0, headerIndex)
    .flatMap((row) => row.fields)
    .join(" ");
}
