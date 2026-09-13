import { describe, expect, it } from "bun:test";
import { EXPECTED_DELAY_DAYS } from "./decision";
import type { Decision, VerificationOutcome } from "./domain";
import {
  HOLD_WINDOW_DAYS,
  type HoldNextStep,
  holdDeadlineOf,
  holdWindow,
  nextStepsFor,
} from "./hold";

const DECIDED_AT = "2026-09-10T15:00:00.000Z";

function decision(
  action: Decision["action"],
  decidedAt = DECIDED_AT,
): Pick<Decision, "action" | "decidedAt"> {
  return { action, decidedAt };
}

describe("HOLD_WINDOW_DAYS", () => {
  it("is the same table the expected-loss arithmetic charged for", () => {
    /* Not a copy with the same numbers: the same object. A second table could
       drift, and then the decision would have priced one delay while the screen
       promised another. */
    expect(HOLD_WINDOW_DAYS).toBe(EXPECTED_DELAY_DAYS);
  });
});

describe("holdDeadlineOf", () => {
  it("gives a hold three days, the delay `decide` weighed against it", () => {
    expect(holdDeadlineOf(decision("hold"))).toBe("2026-09-13T15:00:00.000Z");
  });

  it("gives a verification one day", () => {
    expect(holdDeadlineOf(decision("verify"))).toBe("2026-09-11T15:00:00.000Z");
  });

  it("gives a release no deadline at all, because it holds no money", () => {
    expect(holdDeadlineOf(decision("release"))).toBeNull();
  });

  it("names the field when the instant cannot be read", () => {
    expect(() => holdDeadlineOf(decision("hold", "el jueves"))).toThrow(
      /decidedAt/,
    );
  });
});

describe("holdWindow", () => {
  it("counts the whole hours left and is not expired inside the window", () => {
    const window = holdWindow(decision("hold"), {
      now: "2026-09-11T15:00:00.000Z",
    });

    expect(window).not.toBeNull();
    expect(window?.days).toBe(3);
    expect(window?.hoursLeft).toBe(48);
    expect(window?.expired).toBe(false);
  });

  it("floors the hours left rather than rounding up", () => {
    const window = holdWindow(decision("verify"), {
      now: "2026-09-10T15:30:00.000Z",
    });

    expect(window?.hoursLeft).toBe(23);
  });

  it("expires exactly at the deadline and never reports negative hours", () => {
    const window = holdWindow(decision("verify"), {
      now: "2026-09-11T15:00:00.000Z",
    });

    expect(window?.expired).toBe(true);
    expect(window?.hoursLeft).toBe(0);
  });

  it("still reports zero hours and no negative number long after the deadline", () => {
    const window = holdWindow(decision("hold"), {
      now: "2026-10-01T00:00:00.000Z",
    });

    expect(window?.hoursLeft).toBe(0);
    expect(window?.expired).toBe(true);
  });

  it("answers null for a released payment instead of an expired window", () => {
    /* A payment that was let go is not a hold that ran out. Rendering one as the
       other would tell a clerk that money they released is still waiting. */
    expect(
      holdWindow(decision("release"), { now: "2026-09-11T15:00:00.000Z" }),
    ).toBeNull();
  });

  it("offers the call first when nobody has verified anything yet", () => {
    const window = holdWindow(decision("verify"), { now: DECIDED_AT });

    expect(window?.nextSteps).toEqual([
      "call_supplier",
      "one_cent_cep",
      "release_with_reason",
    ]);
    expect(window?.outcome).toBeUndefined();
  });

  it("keeps the recorded outcome on the window", () => {
    const window = holdWindow(decision("verify"), {
      now: DECIDED_AT,
      outcome: "no_answer",
    });

    expect(window?.outcome).toBe("no_answer");
  });

  it("names the field when `now` cannot be read", () => {
    expect(() => holdWindow(decision("hold"), { now: "ahorita" })).toThrow(
      /now/,
    );
  });
});

describe("nextStepsFor", () => {
  const cases: Array<[VerificationOutcome, HoldNextStep[]]> = [
    ["no_answer", ["retry_call", "one_cent_cep", "release_with_reason"]],
    ["unclear", ["retry_call", "one_cent_cep", "release_with_reason"]],
    ["confirmed", ["one_cent_cep", "release_with_reason"]],
    ["denied", ["keep_held"]],
  ];

  for (const [outcome, expected] of cases) {
    it(`offers ${expected.join(", ")} after ${outcome}`, () => {
      expect(nextStepsFor(outcome)).toEqual(expected);
    });
  }

  it("offers the one-cent CEP on every outcome that is not a denial", () => {
    /* The whole answer to "what if nobody ever answers the telephone": the CEP
       path needs no supplier on the other end of a call. */
    for (const outcome of ["no_answer", "unclear", "confirmed"] as const) {
      expect(nextStepsFor(outcome)).toContain("one_cent_cep");
    }
  });

  it("offers no release after a denial", () => {
    /* The supplier said the account is not theirs. Suggesting "release anyway"
       next to that would be the product arguing against its own finding. */
    expect(nextStepsFor("denied")).not.toContain("release_with_reason");
  });

  it("never hands back an empty list of steps", () => {
    for (const outcome of [
      undefined,
      "confirmed",
      "denied",
      "no_answer",
      "unclear",
    ] as const) {
      expect(nextStepsFor(outcome).length).toBeGreaterThan(0);
    }
  });
});
