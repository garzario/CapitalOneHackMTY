/**
 * Reading a DOF publication date out of the published file.
 *
 * The date columns are nominally `DD/MM/YYYY`, and 28623 of the 29106 dated
 * situations in the 2026-09-12 snapshot are exactly that. The remainder are the
 * reason this file exists, and every shape below was counted in that download
 * rather than imagined:
 *
 * - A two-digit year, `30/10/18`. Read as 20YY. The list begins in 2014 and the
 *   SAT cannot publish a future oficio, so there is no century to guess at.
 * - Two dates in one cell, `20/06/2022 - 13/05/2021`, when a situation was
 *   published twice. The EARLIEST is kept, because the question this package
 *   answers is whether a deduction we already took was covered on the day we
 *   took it, and the first publication is the day the taxpayer became public.
 * - A bare spreadsheet serial, `44014`. Rejected. It is an Excel artefact with
 *   no visible date in it, and the loader has a documented fallback column for
 *   exactly this row rather than a conversion nobody on the team can check
 *   against the DOF.
 *
 * An unreadable cell returns undefined. Nothing here guesses, and nothing here
 * throws: a rejected date becomes a rejected row the loader reports by line
 * number, which is the only honest way to lose a row off a fiscal blacklist.
 */

/** `D/M/YYYY`, `DD/MM/YY`, and the same with any surrounding whitespace. */
const SLASHED = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/;

/** Our own output, so a snapshot written by this package reloads unchanged. */
const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * What separates two publication dates inside one cell. Written as escapes so
 * this file stays plain ASCII while still splitting on the dashes the file uses.
 */
const DATE_SEPARATORS = /\s*(?:-|\u2013|\u2014|;|\by\b)\s*/;

const TWO_DIGIT_YEAR_CENTURY = 2000;

/**
 * Every calendar day the cell names, in ascending order. Empty when it names
 * none, which is the whole answer for a cell holding a spreadsheet serial or an
 * oficio number that drifted into a date column.
 */
export function parseDofDates(cell: string): string[] {
  // The whole cell first: an ISO day carries the same hyphen the separator
  // splits on, so splitting before trying it would shred 2025-12-31 into three
  // numbers and report the cell as undated.
  const whole = parseOneDay(cell);
  if (whole !== undefined) {
    return [whole];
  }

  const found: string[] = [];

  for (const piece of cell.split(DATE_SEPARATORS)) {
    const day = parseOneDay(piece);
    if (day !== undefined && !found.includes(day)) {
      found.push(day);
    }
  }

  return found.sort();
}

/**
 * The publication date of a situation, as `YYYY-MM-DD`, or undefined when the
 * cell holds no readable date. When the cell names several, the earliest wins.
 */
export function parseDofDate(cell: string): string | undefined {
  return parseDofDates(cell)[0];
}

function parseOneDay(raw: string): string | undefined {
  const trimmed = raw.trim();

  const iso = ISO.exec(trimmed);
  if (iso !== null) {
    return validDay(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  }

  const slashed = SLASHED.exec(trimmed);
  if (slashed === null) {
    return undefined;
  }

  const rawYear = slashed[3] ?? "";
  const year =
    rawYear.length === 2
      ? TWO_DIGIT_YEAR_CENTURY + Number(rawYear)
      : Number(rawYear);

  return validDay(year, Number(slashed[2]), Number(slashed[1]));
}

/**
 * Rejects a day that does not exist. `31/02/2020` parses as three numbers and
 * would otherwise become 2020-03-02, which is a date the DOF never published.
 */
function validDay(
  year: number,
  month: number,
  day: number,
): string | undefined {
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return undefined;
  }

  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return undefined;
  }

  return `${pad(year, 4)}-${pad(month, 2)}-${pad(day, 2)}`;
}

function pad(value: number, width: number): string {
  return String(value).padStart(width, "0");
}

/**
 * The date the file states it is current to, read out of its own preamble:
 * "Informacion actualizada al 31 de diciembre de 2025". The SAT puts no version
 * identifier inside the document, so this sentence is the only statement of
 * currency the file makes about itself, and it is what the loader falls back to
 * when the caller does not supply a publication date.
 */
export function parseUpdatedAsOf(preamble: string): string | undefined {
  const folded = preamble
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  const match =
    /actualizada?\s+al\s+(\d{1,2})\s+de\s+([a-z]+)\s+de\s+(\d{4})/.exec(folded);
  if (match === null) {
    return undefined;
  }

  const month = SPANISH_MONTHS[match[2] ?? ""];
  if (month === undefined) {
    return undefined;
  }

  return validDay(Number(match[3]), month, Number(match[1]));
}

const SPANISH_MONTHS: Record<string, number> = {
  enero: 1,
  febrero: 2,
  marzo: 3,
  abril: 4,
  mayo: 5,
  junio: 6,
  julio: 7,
  agosto: 8,
  septiembre: 9,
  setiembre: 9,
  octubre: 10,
  noviembre: 11,
  diciembre: 12,
};
