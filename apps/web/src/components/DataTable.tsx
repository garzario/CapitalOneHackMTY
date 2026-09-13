/**
 * The table, as a column list instead of hand-written `thead` and `tbody`.
 *
 * A financial table is the screen this product is judged on, and the parts that
 * are easy to get wrong are the parts nobody looks at: the caption a screen
 * reader needs, `scope="col"` on every header, the right alignment on the money
 * column so a column of pesos is comparable by eye, the horizontal scroll
 * container that keeps a five column table from making the whole page scroll
 * sideways on a phone, and a row header so "what row am I in" has an answer.
 * Describing the columns instead of writing the markup is what makes those the
 * default rather than a thing each screen remembers.
 *
 * It stays a plain `<table>`: no sorting, no virtualisation, no generic cell
 * renderer registry. Those are the features that turn a table component into a
 * framework, and the run is 92 rows.
 *
 * `loading` draws skeleton rows the width of the real columns rather than a
 * spinner over an empty box, so the layout does not jump when the data lands.
 * `empty` is required when the collection can be empty, because "the good
 * outcome looks like a bug" is what an empty table with no sentence in it does.
 */

import type { ReactNode } from "react";

export type Column<Row> = {
  /** Stable key for React, and the column's identity in the caller. */
  key: string;
  header: ReactNode;
  cell: (row: Row) => ReactNode;
  /** Money and counts are right aligned, so the digits line up. */
  align?: "end";
  /** Extra classes on the cell, for `.code`, `.cell-supplier`, `.cell-actions`. */
  cellClass?: string;
  /**
   * This column names the row. Exactly one column should say so: it becomes a
   * `th scope="row"`, which is what lets a screen reader answer "which payment
   * is this cell about" without the user counting columns.
   */
  rowHeader?: boolean;
};

type Props<Row> = {
  /**
   * What the table is, in a sentence. Visually hidden by default because the
   * panel around it already carries a heading, and a second visible title is
   * noise; it is never omitted, because a table with no caption is a grid of
   * numbers with no subject.
   */
  caption: ReactNode;
  /** Shows the caption above the table instead of only to a screen reader. */
  captionVisible?: boolean;
  columns: ReadonlyArray<Column<Row>>;
  rows: readonly Row[];
  rowKey: (row: Row) => string;
  /** Classes for one row, for the left edge that carries its decision. */
  rowClass?: (row: Row) => string | undefined;
  /** Drawn in place of the body while the data is in flight. */
  loading?: boolean;
  loadingRows?: number;
  /** Drawn in place of the table when there are no rows. */
  empty?: ReactNode;
};

export function DataTable<Row>({
  caption,
  captionVisible = false,
  columns,
  rows,
  rowKey,
  rowClass,
  loading = false,
  loadingRows = 4,
  empty,
}: Props<Row>) {
  if (!loading && rows.length === 0 && empty !== undefined) {
    return <>{empty}</>;
  }

  return (
    <div className="table-scroll">
      {/* `aria-busy` on the table and not `aria-hidden` on the skeleton rows:
          the table is the thing that is loading, and a row hidden from the
          accessibility tree inside a table that still reports a row count tells
          a screen reader two different stories. */}
      <table className="data-table" aria-busy={loading || undefined}>
        <caption className={captionVisible ? undefined : "sr-only"}>
          {caption}
        </caption>
        <thead>
          <tr>
            {columns.map((column) => (
              <th
                key={column.key}
                scope="col"
                className={column.align === "end" ? "align-end" : undefined}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading
            ? Array.from({ length: loadingRows }, (_, index) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: skeleton rows have no identity
                <tr key={index}>
                  {columns.map((column) => (
                    <td key={column.key}>
                      <span className="skeleton skeleton-line block" />
                    </td>
                  ))}
                </tr>
              ))
            : rows.map((row) => (
                <tr key={rowKey(row)} className={rowClass?.(row)}>
                  {columns.map((column) => {
                    const classes = [
                      column.align === "end" ? "align-end" : "",
                      column.cellClass ?? "",
                    ]
                      .filter((part) => part !== "")
                      .join(" ");

                    return column.rowHeader ? (
                      <th
                        key={column.key}
                        scope="row"
                        className={classes === "" ? undefined : classes}
                      >
                        {column.cell(row)}
                      </th>
                    ) : (
                      <td
                        key={column.key}
                        className={classes === "" ? undefined : classes}
                      >
                        {column.cell(row)}
                      </td>
                    );
                  })}
                </tr>
              ))}
        </tbody>
      </table>
    </div>
  );
}
