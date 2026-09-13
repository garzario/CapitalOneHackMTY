/**
 * The overlay the last stop of the recorrido needs, tested as arithmetic over
 * the run rather than as a screen.
 *
 * The stop rings the visitor as the owner and spotlights the one figure of the
 * payment run, "No sale todavia", because a released line walks out of the slice
 * the table is showing while the figure is always there to move. It did not
 * move: the card printed "el dueno la libero bajo su nombre" over a figure that
 * read the same string before and after the press, because nothing on the page
 * asked the run anything again. So the two things worth a test here are that a
 * release moves that figure and that a run nothing applies to comes back
 * untouched, object for object.
 */

import { describe, expect, test } from "bun:test";
import { mockRun } from "./mock";
import { type LocalDecision, withLocalDecisions } from "./run-local";
import { lineLevels, runVerdict } from "./run-view";
import { heroOf } from "./tour";

const run = mockRun();
const hero = heroOf(run);

const released: LocalDecision = {
  instructionId: hero?.instructionId ?? "",
  action: "release",
  decidedBy: "Visitante",
};

describe("a decision applied in this browser", () => {
  test("nothing applied is the same run, the same object", () => {
    /* Identity and not equality, because the run screen memoises on it and
       `diffRuns` reports a change on any run it has not seen before: a new
       object every render would light every row of the table for nothing. */
    expect(withLocalDecisions(run, [])).toBe(run);
  });

  test("a decision that changes nothing is the same run too", () => {
    /* The hero is held, so an owner who holds it on the telephone has changed
       nothing about the payment and the figure must not so much as flicker. */
    expect(withLocalDecisions(run, [{ ...released, action: "hold" }])).toBe(
      run,
    );
  });

  test("a release takes the line out of the figure the stop rings", () => {
    const before = runVerdict(run);
    const after = runVerdict(withLocalDecisions(run, [released]));

    /* The whole point of the stop, as a number. The line was held, so it was in
       the stopped figure, and after the owner releases it neither the pesos nor
       the count can be what they were. */
    expect(before.stoppedCount).toBeGreaterThan(0);
    expect(after.stoppedCount).toBe(before.stoppedCount - 1);
    expect(after.releasedCount).toBe(before.releasedCount + 1);
    expect(after.stoppedAmount).toBeLessThan(before.stoppedAmount);
    /* And the run is still the same run: nothing left it. */
    expect(after.totalCount).toBe(before.totalCount);
    expect(after.totalAmount).toBeCloseTo(before.totalAmount, 2);
  });

  test("the totals travel with the items, so the payload stays consistent", () => {
    const moved = withLocalDecisions(run, [released]);

    expect(moved.totals.released).toBe(run.totals.released + 1);
    expect(moved.totals.held).toBe(run.totals.held - 1);
    expect(moved.totals.instructions).toBe(run.totals.instructions);
  });

  test("it is the decision and nothing else", () => {
    /* The six controls found what they found and a person overriding the call
       does not unfind it, so the findings and the evidence under them are the
       same objects. The name on the line is the one that answered the
       telephone. */
    const moved = withLocalDecisions(run, [released]);
    const line = moved.items.find(
      (item) => item.instruction.id === released.instructionId,
    );
    const original = run.items.find(
      (item) => item.instruction.id === released.instructionId,
    );

    expect(line?.findings).toBe(
      original?.findings as NonNullable<typeof line>["findings"],
    );
    expect(line?.instruction).toBe(original?.instruction);
    expect(line?.decision.action).toBe("release");
    expect(line?.decision.decidedBy).toBe("Visitante");
    expect(line?.decision.expectedLoss).toBe(
      original?.decision.expectedLoss as number,
    );
  });

  test("the level and the state are derived again over the new decision", () => {
    /* Both were computed before this decision, so a line that moved drops the
       pair the API attached and `lineLevels` falls back to the same two
       functions in `packages/core` the API itself calls. Two readings of one
       line disagreeing on screen is what ADR-0009 exists to prevent. */
    const moved = withLocalDecisions(run, [released]);
    const line = moved.items.find(
      (item) => item.instruction.id === released.instructionId,
    );

    expect(line?.confidence).toBeUndefined();
    expect(line?.state).toBeUndefined();
    expect(lineLevels(line as NonNullable<typeof line>).state).toBe("liberado");
  });

  test("a second answer on one line replaces the first", () => {
    const moved = withLocalDecisions(run, [
      released,
      { ...released, action: "hold" },
    ]);

    expect(
      moved.items.find((item) => item.instruction.id === released.instructionId)
        ?.decision.action,
    ).toBe("hold");
  });

  test("a folio this run does not carry changes nothing", () => {
    expect(
      withLocalDecisions(run, [{ ...released, instructionId: "INS-nope" }]),
    ).toBe(run);
  });
});
