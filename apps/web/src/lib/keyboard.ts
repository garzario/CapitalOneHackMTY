/**
 * Moving between the rows of a list with the arrow keys, as arithmetic.
 *
 * It is a module with tests rather than four lines inside a key handler because
 * the interesting part is the ends, and the ends are what a handler written at
 * 04:00 gets wrong: an off-by-one that wraps from the last row to the first is
 * invisible on a run of seven rows and disorienting on a run of ninety-two,
 * where the table scrolls back to the top under somebody who was reading the
 * bottom of it.
 *
 * `null` means this key moves nothing here, and the caller then leaves the event
 * alone rather than swallowing it. That is the same answer for a key the list
 * does not use, for an empty list, and for the two ends: pressing the down arrow
 * on the last row should scroll the page the way it always does, not consume the
 * keystroke to put focus back where it already was.
 *
 * `current` is -1 when nothing in the list has focus, which is what a fresh
 * table renders as. From there the down arrow enters the list at the top and the
 * up arrow does nothing, because there is no bottom to enter from: the list is
 * below the thing that had focus, not above it.
 *
 * No wrap, in either direction. A list of payments is not a carousel.
 */

/** The index focus should move to for this key, or null when it moves nothing. */
export function nextRowIndex(
  key: string,
  current: number,
  count: number,
): number | null {
  if (count <= 0) {
    return null;
  }

  switch (key) {
    case "ArrowDown":
      return current < 0 ? 0 : insideList(current + 1, count);
    case "ArrowUp":
      return current < 0 ? null : insideList(current - 1, count);
    case "Home":
      return 0;
    case "End":
      return count - 1;
    default:
      return null;
  }
}

/** The target, unless it fell off an end, in which case nothing moves. */
function insideList(target: number, count: number): number | null {
  return target < 0 || target > count - 1 ? null : target;
}
