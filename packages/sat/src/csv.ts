/**
 * Bytes to rows. Everything the published file does that a `split(",")` gets
 * wrong is handled here, and each of those behaviours is a named test in
 * `csv.test.ts` because each one was observed in the actual download.
 *
 * What the real file does, verified against the 2026-09-12 snapshot:
 *
 * - It is not UTF-8. Legal names carry accents encoded as single ISO-8859-1
 *   bytes, so `0xF3` is `o` with an acute accent and not the start of a
 *   multi-byte sequence. Decoding it as UTF-8 throws or produces replacement
 *   characters, which turns a taxpayer's name into a different string and
 *   breaks the name comparison the CEP control depends on.
 * - Lines end in CRLF, and two of the 14234 rows carry a bare newline inside a
 *   quoted legal name, so the row count and the line count are not the same
 *   number.
 * - Names carry commas and are quoted for it.
 *
 * The decoder does not trust the file extension or a header: it tries UTF-8
 * strictly and falls back to ISO-8859-1, so both a future UTF-8 export and the
 * file as it is published today parse without a flag to set.
 */

/** U+FEFF, which a spreadsheet export writes at the head of a UTF-8 file. */
const BYTE_ORDER_MARK = "\uFEFF";

const UTF8_BOM = [0xef, 0xbb, 0xbf] as const;

/**
 * The two decoders this package uses.
 *
 * The SAT file is ISO-8859-1. The WHATWG encoding standard maps the label
 * `iso-8859-1` onto the `windows-1252` decoder, which reads every ISO-8859-1
 * byte identically and additionally gives the 0x80 to 0x9F range printable
 * characters instead of controls. That is the decoder used and the name
 * reported: naming a decoder we did not run would be a small lie in the one
 * place a reader goes to check how a taxpayer's name was read.
 */
export type SnapshotEncoding = "utf-8" | "windows-1252";

export interface DecodedSnapshot {
  text: string;
  /** Which decoder produced `text`. Reported so the loader can say so. */
  encoding: SnapshotEncoding;
  /** True when the bytes opened with a UTF-8 byte order mark. */
  hadByteOrderMark: boolean;
}

/**
 * Decodes a downloaded snapshot without being told its encoding.
 *
 * UTF-8 is tried in fatal mode first: a file that is valid UTF-8 is UTF-8, and
 * the only files that survive both decoders unchanged are pure ASCII, where the
 * answer is the same either way. ISO-8859-1 is the fallback because it is what
 * the SAT publishes and because it never throws, which means this function
 * cannot leave the caller with no text at all.
 */
export function decodeSnapshot(bytes: Uint8Array): DecodedSnapshot {
  const hadByteOrderMark =
    bytes.length >= UTF8_BOM.length &&
    UTF8_BOM.every((byte, index) => bytes[index] === byte);

  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return {
      text: stripByteOrderMark(text),
      encoding: "utf-8",
      hadByteOrderMark,
    };
  } catch {
    const text = new TextDecoder("windows-1252").decode(bytes);
    return {
      text: stripByteOrderMark(text),
      encoding: "windows-1252",
      hadByteOrderMark,
    };
  }
}

function stripByteOrderMark(text: string): string {
  return text.startsWith(BYTE_ORDER_MARK) ? text.slice(1) : text;
}

/** One parsed record, with enough provenance to report it as rejected. */
export interface CsvRow {
  /** 1-based line the record starts on, counting every physical line. */
  line: number;
  fields: string[];
  /** Character offsets of the record in the source, for an exact excerpt. */
  start: number;
  end: number;
}

const DELIMITER = ",";
const QUOTE = '"';

/**
 * Reads RFC 4180 with the two tolerances a government export needs: a field may
 * carry text after its closing quote, and the last quoted field may never be
 * closed. Neither throws. A parser that threw on row 9000 of a fiscal blacklist
 * would hand the caller nine thousand rows and call it the list.
 */
export function parseCsvRows(input: string): CsvRow[] {
  const rows: CsvRow[] = [];
  if (input.length === 0) {
    return rows;
  }

  let index = 0;
  // `line` is the physical line the cursor is on; `rowLine` is the line the
  // record being read started on, which is the one a person opening the file in
  // an editor will look at when the record spans several lines.
  let line = 1;
  let rowLine = 1;
  let start = 0;
  let fields: string[] = [];

  for (;;) {
    const field = readField(input, index);
    fields.push(field.value);
    line += field.newlines;
    index = field.next;

    if (index >= input.length) {
      rows.push({ line: rowLine, fields, start, end: index });
      return rows;
    }

    if (input[index] === DELIMITER) {
      index += 1;
      continue;
    }

    const end = index;
    index += input.startsWith("\r\n", index) ? 2 : 1;
    rows.push({ line: rowLine, fields, start, end });
    line += 1;
    rowLine = line;
    fields = [];
    start = index;

    if (index >= input.length) {
      return rows;
    }
  }
}

interface FieldRead {
  value: string;
  next: number;
  /** Line breaks consumed inside a quoted field. */
  newlines: number;
}

function readField(input: string, start: number): FieldRead {
  if (input[start] !== QUOTE) {
    const end = findUnquotedEnd(input, start);
    return { value: input.slice(start, end), next: end, newlines: 0 };
  }

  let value = "";
  let index = start + 1;

  for (;;) {
    const quote = input.indexOf(QUOTE, index);

    if (quote === -1) {
      // Unterminated quote: take the rest of the file as this field rather than
      // dropping every remaining row.
      const whole = value + input.slice(index);
      return {
        value: whole,
        next: input.length,
        newlines: countNewlines(whole),
      };
    }

    value += input.slice(index, quote);

    if (input[quote + 1] === QUOTE) {
      value += QUOTE;
      index = quote + 2;
      continue;
    }

    // Anything between the closing quote and the delimiter belongs to the field.
    const end = findUnquotedEnd(input, quote + 1);
    return {
      value: value + input.slice(quote + 1, end),
      next: end,
      newlines: countNewlines(value),
    };
  }
}

function findUnquotedEnd(input: string, from: number): number {
  let index = from;
  while (index < input.length) {
    const character = input[index];
    if (character === DELIMITER || character === "\n" || character === "\r") {
      return index;
    }
    index += 1;
  }
  return input.length;
}

function countNewlines(text: string): number {
  let count = 0;
  let index = text.indexOf("\n");
  while (index !== -1) {
    count += 1;
    index = text.indexOf("\n", index + 1);
  }
  return count;
}

/** The same reader without the provenance, for a caller that only wants cells. */
export function parseCsv(input: string): string[][] {
  return parseCsvRows(input).map((row) => row.fields);
}

/**
 * Accent-free, case-free, whitespace-collapsed. Header names in the published
 * file carry accents and inconsistent spacing, so every header comparison in the
 * loader goes through this and there is one place to fix when the SAT respells
 * a column.
 */
export function foldHeader(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}
