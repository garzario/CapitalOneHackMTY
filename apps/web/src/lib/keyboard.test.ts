/**
 * The arrow keys over a list of rows, one test per edge.
 *
 * Every one of these is an end or an empty, because the middle of the list is
 * the case that works in every implementation and the ends are the ones that
 * send a judge's cursor back to the top of a ninety-two row table.
 */

import { describe, expect, test } from "bun:test";
import { nextRowIndex } from "./keyboard";

describe("nextRowIndex", () => {
  test("moves down one row", () => {
    expect(nextRowIndex("ArrowDown", 0, 7)).toBe(1);
  });

  test("moves up one row", () => {
    expect(nextRowIndex("ArrowUp", 3, 7)).toBe(2);
  });

  test("does not wrap off the bottom", () => {
    /* The edge that matters on the real run: the last of ninety-two rows. A
       wrap here scrolls the table back to the top under somebody who was
       reading the bottom of it. */
    expect(nextRowIndex("ArrowDown", 6, 7)).toBeNull();
  });

  test("does not wrap off the top", () => {
    expect(nextRowIndex("ArrowUp", 0, 7)).toBeNull();
  });

  test("enters the list from nothing with the down arrow", () => {
    /* -1 is what a table renders as before anybody has focused a row. */
    expect(nextRowIndex("ArrowDown", -1, 7)).toBe(0);
  });

  test("does not enter the list from nothing with the up arrow", () => {
    /* There is no bottom to come in from: the list is below whatever had
       focus, not above it. */
    expect(nextRowIndex("ArrowUp", -1, 7)).toBeNull();
  });

  test("Home goes to the first row and End to the last", () => {
    expect(nextRowIndex("Home", 5, 7)).toBe(0);
    expect(nextRowIndex("End", 5, 7)).toBe(6);
  });

  test("Home and End work from nothing focused", () => {
    expect(nextRowIndex("Home", -1, 7)).toBe(0);
    expect(nextRowIndex("End", -1, 7)).toBe(6);
  });

  test("any other key moves nothing", () => {
    /* Null and not the current index, because the caller reads null as "leave
       this keystroke alone": a table that swallowed Tab or the space bar would
       be a table a keyboard cannot leave. */
    expect(nextRowIndex("Tab", 2, 7)).toBeNull();
    expect(nextRowIndex(" ", 2, 7)).toBeNull();
    expect(nextRowIndex("Enter", 2, 7)).toBeNull();
    expect(nextRowIndex("ArrowLeft", 2, 7)).toBeNull();
  });

  test("an empty list has nowhere to go, whatever the key", () => {
    /* The facets can filter the table down to nothing, and the key handler is
       still on the page while that empty state renders. */
    for (const key of ["ArrowDown", "ArrowUp", "Home", "End"]) {
      expect([key, nextRowIndex(key, -1, 0)]).toEqual([key, null]);
    }
  });

  test("a single row is both ends at once", () => {
    expect(nextRowIndex("ArrowDown", 0, 1)).toBeNull();
    expect(nextRowIndex("ArrowUp", 0, 1)).toBeNull();
    expect(nextRowIndex("Home", 0, 1)).toBe(0);
    expect(nextRowIndex("End", 0, 1)).toBe(0);
  });

  test("an index left over from a longer list falls off the end", () => {
    /* A facet change shortens the table while row 40 has focus. The next
       arrow press must not answer 41 for a list of three. */
    expect(nextRowIndex("ArrowDown", 40, 3)).toBeNull();
    expect(nextRowIndex("End", 40, 3)).toBe(2);
  });
});
