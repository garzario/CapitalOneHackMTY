/**
 * A PDF writer in one file, with no dependency and no headless browser.
 *
 * The constancia is the artifact the accountant keeps, so it has to be a real
 * file that opens in Preview, Acrobat and a browser, and it has to be produced
 * on a server that is a Hono app on the Node runtime. Chromium is not an option
 * there: it is 300 MB, it needs a sandbox, and a demo that shells out to a
 * browser to make a receipt is a demo that fails at the table.
 *
 * The scope is exactly what the document needs and nothing else: one page size,
 * the two base-14 Helvetica faces, text, horizontal rules and filled
 * rectangles. That is a few hundred lines of a format written down in ISO
 * 32000-1, and it is far less risk than a dependency added at 4 in the morning.
 *
 * Three decisions worth knowing before reading:
 *
 * 1. **Base-14 fonts, so nothing is embedded.** Helvetica and Helvetica-Bold
 *    are guaranteed by every reader, so the file carries no font program and
 *    stays a few kilobytes. The price is that we need the widths ourselves to
 *    wrap text, which is what `HELVETICA_WIDTHS` is.
 * 2. **WinAnsiEncoding, and the bytes are Latin-1.** Every character the
 *    document uses, accents and `Ñ` included, is one byte in that encoding, so
 *    the content stream is written with one byte per character and the offsets
 *    in the cross-reference table are exact. A character outside it is replaced
 *    rather than silently dropped, because a constancia with a hole in a legal
 *    name is worse than one with a question mark a human can see.
 * 3. **No compression.** An uncompressed content stream is readable with `less`
 *    and diffable in a test, and the whole document is under 10 KB. Flate would
 *    save nothing anybody can measure and would cost the one property that
 *    makes this file reviewable.
 */

/** A4 in PostScript points, which is the unit the whole format works in. */
export const A4_WIDTH = 595.28;
export const A4_HEIGHT = 841.89;

export type FontName = "Helvetica" | "Helvetica-Bold";

export interface TextOptions {
  font?: FontName;
  size?: number;
  /** Grey level, 0 black and 1 white. The document is deliberately monochrome. */
  grey?: number;
}

export interface RuleOptions {
  width?: number;
  grey?: number;
}

/** Advance widths per 1000 units, for the printable ASCII range. */
const HELVETICA_REGULAR: Readonly<Record<string, number>> = widths(
  "278 278 355 556 556 889 667 191 333 333 389 584 278 333 278 278 " +
    "556 556 556 556 556 556 556 556 556 556 278 278 584 584 584 556 " +
    "1015 667 667 722 722 667 611 778 722 278 500 667 556 833 722 778 " +
    "667 778 722 667 611 722 667 944 667 667 611 278 278 278 469 556 " +
    "333 556 556 500 556 556 278 556 556 222 222 500 222 833 556 556 " +
    "556 556 333 500 278 556 500 722 500 500 500 334 260 334 584",
);

const HELVETICA_BOLD: Readonly<Record<string, number>> = widths(
  "278 333 474 556 556 889 722 238 333 333 389 584 278 333 278 278 " +
    "556 556 556 556 556 556 556 556 556 556 333 333 584 584 584 611 " +
    "975 722 722 722 722 667 611 778 722 278 556 722 611 833 722 778 " +
    "667 778 722 667 611 722 667 944 667 667 611 333 278 333 584 556 " +
    "333 556 611 556 611 556 333 611 611 278 278 556 278 889 611 611 " +
    "611 611 389 556 333 611 556 778 556 556 500 389 280 389 584",
);

/** Maps the space-separated table onto code points 32 upwards. */
function widths(table: string): Record<string, number> {
  const values = table.split(" ").filter((value) => value !== "");
  const map: Record<string, number> = {};
  values.forEach((value, index) => {
    map[String.fromCharCode(32 + index)] = Number(value);
  });
  return map;
}

/**
 * Accented characters fold to their base letter for measurement.
 *
 * In Helvetica an accented glyph has the same advance width as the letter under
 * it, which is a property of the face and not an approximation: the accent is
 * drawn above the letter box.
 */
const FOLD: Readonly<Record<string, string>> = {
  á: "a",
  é: "e",
  í: "i",
  ó: "o",
  ú: "u",
  ü: "u",
  ñ: "n",
  Á: "A",
  É: "E",
  Í: "I",
  Ó: "O",
  Ú: "U",
  Ü: "U",
  Ñ: "N",
};

const FALLBACK_WIDTH = 556;
const PER_EM = 1000;

/** Width of one string at one size, in points. */
export function measure(text: string, font: FontName, size: number): number {
  const table = font === "Helvetica-Bold" ? HELVETICA_BOLD : HELVETICA_REGULAR;
  let units = 0;
  for (const character of text) {
    const key = FOLD[character] ?? character;
    units += table[key] ?? FALLBACK_WIDTH;
  }
  return (units * size) / PER_EM;
}

/**
 * Greedy wrap at a width in points. Words longer than the line are broken, so a
 * 40 character UUID cannot run off the page and out of the document.
 */
export function wrap(
  text: string,
  font: FontName,
  size: number,
  maxWidth: number,
): string[] {
  const lines: string[] = [];
  let line = "";

  for (const word of text.split(/\s+/).filter((value) => value !== "")) {
    const candidate = line === "" ? word : `${line} ${word}`;
    if (measure(candidate, font, size) <= maxWidth) {
      line = candidate;
      continue;
    }
    if (line !== "") {
      lines.push(line);
    }
    if (measure(word, font, size) <= maxWidth) {
      line = word;
      continue;
    }
    line = "";
    for (const character of word) {
      if (measure(line + character, font, size) > maxWidth && line !== "") {
        lines.push(line);
        line = "";
      }
      line += character;
    }
  }

  if (line !== "") {
    lines.push(line);
  }
  return lines.length === 0 ? [""] : lines;
}

/**
 * Latin-1 is WinAnsi for everything this document writes. Anything outside it
 * becomes a question mark, which is visible, rather than a dropped byte, which
 * is not.
 */
function toWinAnsi(text: string): string {
  let out = "";
  for (const character of text) {
    const code = character.codePointAt(0) ?? 63;
    out += code <= 0xff ? character : "?";
  }
  return out;
}

/** PDF string escaping: the three characters that would end the literal early. */
function escapeText(text: string): string {
  return toWinAnsi(text)
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

/** Points are written with two decimals, which is finer than any printer. */
function pt(value: number): string {
  return value.toFixed(2);
}

class Page {
  readonly operations: string[] = [];

  text(x: number, y: number, value: string, options: TextOptions = {}): void {
    const font = options.font ?? "Helvetica";
    const size = options.size ?? 10;
    const grey = options.grey ?? 0;
    const resource = font === "Helvetica-Bold" ? "/F2" : "/F1";

    this.operations.push(
      "BT",
      `${pt(grey)} g`,
      `${resource} ${pt(size)} Tf`,
      `1 0 0 1 ${pt(x)} ${pt(y)} Tm`,
      `(${escapeText(value)}) Tj`,
      "ET",
    );
  }

  rule(x1: number, y: number, x2: number, options: RuleOptions = {}): void {
    this.operations.push(
      `${pt(options.grey ?? 0.75)} G`,
      `${pt(options.width ?? 0.5)} w`,
      `${pt(x1)} ${pt(y)} m ${pt(x2)} ${pt(y)} l S`,
    );
  }

  rectangle(
    x: number,
    y: number,
    width: number,
    height: number,
    grey: number,
  ): void {
    this.operations.push(
      `${pt(grey)} g`,
      `${pt(x)} ${pt(y)} ${pt(width)} ${pt(height)} re f`,
    );
  }

  get content(): string {
    return this.operations.join("\n");
  }
}

export interface PdfMetadata {
  title: string;
  /** Producer string. Never a vendor name, per the repository rules. */
  producer?: string;
  /** Creation instant, passed in so the same input produces the same bytes. */
  createdAt: string;
}

/**
 * `D:YYYYMMDDHHmmSS` plus the offset, which is the date format the format
 * defines. Monterrey is UTC minus 6 all year, so there is no summer branch.
 */
function pdfDate(iso: string): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) {
    throw new RangeError(`createdAt is not an instant: ${iso}`);
  }
  const pad = (value: number) => String(value).padStart(2, "0");
  return (
    `D:${at.getUTCFullYear()}${pad(at.getUTCMonth() + 1)}${pad(at.getUTCDate())}` +
    `${pad(at.getUTCHours())}${pad(at.getUTCMinutes())}${pad(at.getUTCSeconds())}Z`
  );
}

export class PdfDocument {
  private readonly pages: Page[] = [];

  constructor(private readonly metadata: PdfMetadata) {}

  addPage(): Page {
    const page = new Page();
    this.pages.push(page);
    return page;
  }

  get pageCount(): number {
    return this.pages.length;
  }

  /**
   * Serialises the whole document.
   *
   * The object numbering is fixed rather than allocated, because it makes the
   * cross-reference table checkable by eye: 1 catalogue, 2 pages, 3 and 4 the
   * two fonts, 5 the metadata, then a page and its content stream in pairs.
   */
  toBytes(): Uint8Array {
    if (this.pages.length === 0) {
      throw new RangeError("a PDF needs at least one page");
    }

    const objects: string[] = [];
    const firstPageObject = 6;
    const pageIds = this.pages.map((_, index) => firstPageObject + index * 2);

    objects.push("<< /Type /Catalog /Pages 2 0 R >>");
    objects.push(
      `<< /Type /Pages /Count ${this.pages.length} ` +
        `/Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] >>`,
    );
    objects.push(
      "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
    );
    objects.push(
      "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>",
    );
    objects.push(
      `<< /Title (${escapeText(this.metadata.title)}) ` +
        `/Producer (${escapeText(this.metadata.producer ?? "SentryOne")}) ` +
        `/CreationDate (${pdfDate(this.metadata.createdAt)}) >>`,
    );

    this.pages.forEach((page, index) => {
      const contentId = pageIds[index] + 1;
      objects.push(
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pt(A4_WIDTH)} ${pt(A4_HEIGHT)}] ` +
          `/Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentId} 0 R >>`,
      );
      const content = page.content;
      objects.push(
        `<< /Length ${latin1Length(content)} >>\nstream\n${content}\nendstream`,
      );
    });

    return assemble(objects);
  }
}

/** Byte length in Latin-1, which is what the stream will actually be written as. */
function latin1Length(text: string): number {
  return toWinAnsi(text).length;
}

/**
 * Header, objects, cross-reference table, trailer.
 *
 * The offsets are counted in bytes of the Latin-1 encoding, which is the whole
 * reason this function builds the string once and measures as it goes: a
 * cross-reference table that is off by one byte produces a file that some
 * readers repair silently and others refuse, and only the second kind tells you.
 */
function assemble(objects: readonly string[]): Uint8Array {
  let out = "%PDF-1.4\n";
  // A comment of high bytes, which is what tells a transfer that the file is
  // binary. Every writer emits it and some readers still check for it.
  out += "%âãÏÓ\n";

  const offsets: number[] = [];
  objects.forEach((body, index) => {
    offsets.push(latin1Length(out));
    out += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });

  const xrefAt = latin1Length(out);
  out += `xref\n0 ${objects.length + 1}\n`;
  out += "0000000000 65535 f \n";
  for (const offset of offsets) {
    out += `${String(offset).padStart(10, "0")} 00000 n \n`;
  }
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info 5 0 R >>\n`;
  out += `startxref\n${xrefAt}\n%%EOF\n`;

  const encoded = toWinAnsi(out);
  const bytes = new Uint8Array(encoded.length);
  for (let index = 0; index < encoded.length; index += 1) {
    bytes[index] = encoded.charCodeAt(index) & 0xff;
  }
  return bytes;
}
