/**
 * The page furniture: margins, a cursor that knows when to break, and the four
 * blocks the constancia is built out of.
 *
 * Kept apart from `pdf.ts` on purpose. That file knows the file format and
 * nothing about this document; this one knows the document and nothing about
 * cross-reference tables. The seam is what makes both testable: a layout test
 * asserts how many pages a hundred rows take without parsing a PDF, and a
 * format test asserts the bytes without knowing what a constancia is.
 */

import {
  A4_HEIGHT,
  A4_WIDTH,
  type FontName,
  measure,
  type PdfDocument,
  wrap,
} from "./pdf";

export const MARGIN_X = 56;
export const MARGIN_TOP = 56;
export const MARGIN_BOTTOM = 64;
export const CONTENT_WIDTH = A4_WIDTH - MARGIN_X * 2;

const BODY_SIZE = 9.5;
const BODY_LEADING = 13;
const LABEL_GREY = 0.45;

export interface Column {
  header: string;
  /** Fraction of the content width. The row throws if they do not sum to 1. */
  share: number;
  align?: "left" | "right";
}

/**
 * A cursor over pages.
 *
 * Every block asks `room` for the height it needs before it draws, so a table
 * never splits a row across a page break and a heading never lands alone at the
 * bottom of one.
 */
export class Sheet {
  private page: ReturnType<PdfDocument["addPage"]>;
  private y = A4_HEIGHT - MARGIN_TOP;

  constructor(private readonly doc: PdfDocument) {
    this.page = doc.addPage();
  }

  get cursor(): number {
    return this.y;
  }

  /** Ensures `height` points are available, starting a page if they are not. */
  room(height: number): void {
    if (this.y - height >= MARGIN_BOTTOM) {
      return;
    }
    this.page = this.doc.addPage();
    this.y = A4_HEIGHT - MARGIN_TOP;
  }

  gap(height: number): void {
    this.y -= height;
  }

  /** The document title block, drawn once at the top of the first page. */
  title(text: string, subtitle: string): void {
    this.room(52);
    this.page.text(MARGIN_X, this.y, text, {
      font: "Helvetica-Bold",
      size: 16,
    });
    this.y -= 18;
    this.page.text(MARGIN_X, this.y, subtitle, {
      size: 9.5,
      grey: LABEL_GREY,
    });
    this.y -= 12;
    this.page.rule(MARGIN_X, this.y, A4_WIDTH - MARGIN_X, { grey: 0.2 });
    this.y -= 18;
  }

  heading(text: string): void {
    this.room(30);
    this.page.text(MARGIN_X, this.y, text, {
      font: "Helvetica-Bold",
      size: 11,
    });
    this.y -= 6;
    this.page.rule(MARGIN_X, this.y, A4_WIDTH - MARGIN_X);
    this.y -= 14;
  }

  paragraph(text: string, options: { grey?: number } = {}): void {
    for (const line of wrap(text, "Helvetica", BODY_SIZE, CONTENT_WIDTH)) {
      this.room(BODY_LEADING);
      this.page.text(MARGIN_X, this.y, line, {
        size: BODY_SIZE,
        ...(options.grey === undefined ? {} : { grey: options.grey }),
      });
      this.y -= BODY_LEADING;
    }
  }

  /** A label on the left and a value on the right, wrapped if it is long. */
  field(label: string, value: string): void {
    const labelWidth = 150;
    const valueWidth = CONTENT_WIDTH - labelWidth;
    const lines = wrap(value, "Helvetica", BODY_SIZE, valueWidth);

    this.room(BODY_LEADING * lines.length);
    this.page.text(MARGIN_X, this.y, label, {
      size: BODY_SIZE,
      grey: LABEL_GREY,
    });
    lines.forEach((line, index) => {
      this.page.text(
        MARGIN_X + labelWidth,
        this.y - index * BODY_LEADING,
        line,
        {
          size: BODY_SIZE,
        },
      );
    });
    this.y -= BODY_LEADING * lines.length;
  }

  /** Column headers, with a rule under them. Call `row` after it. */
  tableHead(columns: readonly Column[]): void {
    assertShares(columns);
    this.room(24);
    this.drawCells(
      columns,
      columns.map((column) => column.header),
      "Helvetica-Bold",
      LABEL_GREY,
    );
    this.y -= 4;
    this.page.rule(MARGIN_X, this.y, A4_WIDTH - MARGIN_X);
    this.y -= 12;
  }

  /**
   * One row. Cells are truncated with an ellipsis rather than wrapped, so a
   * table stays a table: a legal name that needs two lines would misalign every
   * column beside it, and the full name is in the document above.
   */
  row(columns: readonly Column[], cells: readonly string[]): void {
    assertShares(columns);
    this.room(BODY_LEADING);
    this.drawCells(columns, cells, "Helvetica", 0);
    this.y -= BODY_LEADING;
  }

  /** A footer note in small grey type, on the current page only. */
  note(text: string): void {
    for (const line of wrap(text, "Helvetica", 8, CONTENT_WIDTH)) {
      this.room(11);
      this.page.text(MARGIN_X, this.y, line, { size: 8, grey: LABEL_GREY });
      this.y -= 11;
    }
  }

  private drawCells(
    columns: readonly Column[],
    cells: readonly string[],
    font: FontName,
    grey: number,
  ): void {
    let x = MARGIN_X;
    columns.forEach((column, index) => {
      const width = CONTENT_WIDTH * column.share;
      const raw = cells[index] ?? "";
      const text = truncate(raw, font, BODY_SIZE, width - 8);
      const offset =
        column.align === "right"
          ? width - 8 - measure(text, font, BODY_SIZE)
          : 0;
      this.page.text(x + offset, this.y, text, {
        font,
        size: BODY_SIZE,
        grey,
      });
      x += width;
    });
  }
}

function assertShares(columns: readonly Column[]): void {
  const total = columns.reduce((sum, column) => sum + column.share, 0);
  if (Math.abs(total - 1) > 0.001) {
    throw new RangeError(`column shares must sum to 1, got ${total}`);
  }
}

/** Cuts a cell to fit, with a single character ellipsis so the cut is visible. */
export function truncate(
  text: string,
  font: FontName,
  size: number,
  maxWidth: number,
): string {
  if (maxWidth <= 0) {
    return "";
  }
  if (measure(text, font, size) <= maxWidth) {
    return text;
  }
  const characters = [...text];
  let out = "";
  for (const character of characters) {
    if (measure(`${out + character}...`, font, size) > maxWidth) {
      break;
    }
    out += character;
  }
  return out === "" ? "" : `${out}...`;
}
