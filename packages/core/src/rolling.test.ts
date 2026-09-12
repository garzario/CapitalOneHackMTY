import { describe, expect, it } from "bun:test";
import {
  dailyBuckets,
  dayKeyOf,
  isParsableInstant,
  maxRollingWindow,
  nextDayKey,
  prepareTimeline,
  rollingWindowSum,
  toDayKey,
} from "./rolling";
import type { Direction, LedgerTx } from "./types";
import { MONTERREY_UTC_OFFSET_MINUTES } from "./types";

function makeTx(
  id: string,
  occurredAt: string,
  amount: number,
  direction: Direction = "debit",
): LedgerTx {
  return {
    id,
    accountId: "acct-hero",
    occurredAt,
    amount,
    direction,
    source: "test",
    raw: {},
  };
}

describe("rollingWindowSum", () => {
  it("returns nothing for an empty ledger", () => {
    expect(rollingWindowSum([], { windowDays: 7 })).toEqual([]);
  });

  it("sorts out-of-order input instead of trusting it", () => {
    const txs = [
      makeTx("c", "2026-09-10T12:00:00.000Z", 10),
      makeTx("a", "2026-09-08T12:00:00.000Z", 10),
      makeTx("b", "2026-09-09T12:00:00.000Z", 10),
    ];

    const points = rollingWindowSum(txs, { windowDays: 7 });

    expect(points.map((point) => point.at)).toEqual([
      "2026-09-08T12:00:00.000Z",
      "2026-09-09T12:00:00.000Z",
      "2026-09-10T12:00:00.000Z",
    ]);
    expect(points.map((point) => point.totalCents)).toEqual([1000, 2000, 3000]);
  });

  it("does not mutate the caller's array", () => {
    const txs = [
      makeTx("c", "2026-09-10T12:00:00.000Z", 10),
      makeTx("a", "2026-09-08T12:00:00.000Z", 10),
    ];

    rollingWindowSum(txs, { windowDays: 7 });

    expect(txs.map((tx) => tx.id)).toEqual(["c", "a"]);
  });

  it("adds integer and float amounts in cents, with no drift", () => {
    const txs = [
      makeTx("1", "2026-09-01T12:00:00.000Z", 46),
      makeTx("2", "2026-09-01T13:00:00.000Z", 450.0),
      makeTx("3", "2026-09-01T14:00:00.000Z", 0.1),
      makeTx("4", "2026-09-01T15:00:00.000Z", 0.2),
    ];

    const points = rollingWindowSum(txs, { windowDays: 7 });
    const last = points[points.length - 1];

    expect(last.totalCents).toBe(49630);
    expect(last.total).toBe(496.3);
    expect(last.count).toBe(4);
  });

  it("drops a transaction that is exactly one window old", () => {
    const txs = [
      makeTx("old", "2026-09-01T12:00:00.000Z", 100),
      makeTx("new", "2026-09-08T12:00:00.000Z", 25),
    ];

    const points = rollingWindowSum(txs, { windowDays: 7 });

    expect(points[1].totalCents).toBe(2500);
    expect(points[1].count).toBe(1);
    expect(points[1].windowStart).toBe("2026-09-01T12:00:00.000Z");
  });

  it("keeps a transaction just inside the window", () => {
    const txs = [
      makeTx("old", "2026-09-01T12:00:00.000Z", 100),
      makeTx("new", "2026-09-08T11:59:59.000Z", 25),
    ];

    const points = rollingWindowSum(txs, { windowDays: 7 });

    expect(points[1].totalCents).toBe(12500);
    expect(points[1].count).toBe(2);
  });

  it("sums debits by default and credits on request", () => {
    const txs = [
      makeTx("spend", "2026-09-02T12:00:00.000Z", 300),
      makeTx("pay", "2026-09-03T12:00:00.000Z", 9000, "credit"),
    ];

    const debits = rollingWindowSum(txs, { windowDays: 30 });
    const credits = rollingWindowSum(txs, {
      windowDays: 30,
      direction: "credit",
    });

    expect(debits).toHaveLength(1);
    expect(debits[0].totalCents).toBe(30000);
    expect(credits).toHaveLength(1);
    expect(credits[0].totalCents).toBe(900000);
  });

  it("skips dirty rows instead of throwing", () => {
    const txs = [
      makeTx("good", "2026-09-02T12:00:00.000Z", 100),
      makeTx("no-date", "manana", 100),
      makeTx("nan-amount", "2026-09-03T12:00:00.000Z", Number.NaN),
    ];

    const points = rollingWindowSum(txs, { windowDays: 7 });

    expect(points).toHaveLength(1);
    expect(points[0].totalCents).toBe(10000);
    expect(prepareTimeline(txs)).toHaveLength(1);
  });

  it("breaks ties on id, so two runs produce the same series", () => {
    const txs = [
      makeTx("b", "2026-09-02T12:00:00.000Z", 1),
      makeTx("a", "2026-09-02T12:00:00.000Z", 2),
    ];

    expect(prepareTimeline(txs).map((row) => row.tx.id)).toEqual(["a", "b"]);
  });

  it("refuses a window that is not a positive number", () => {
    expect(() => rollingWindowSum([], { windowDays: 0 })).toThrow(RangeError);
    expect(() => rollingWindowSum([], { windowDays: -7 })).toThrow(RangeError);
    expect(() => rollingWindowSum([], { windowDays: Number.NaN })).toThrow(
      RangeError,
    );
  });
});

describe("maxRollingWindow", () => {
  it("finds the heaviest window and prefers the earliest on a tie", () => {
    const txs = [
      makeTx("1", "2026-09-01T12:00:00.000Z", 500),
      makeTx("2", "2026-09-20T12:00:00.000Z", 500),
    ];

    const peak = maxRollingWindow(rollingWindowSum(txs, { windowDays: 3 }));

    expect(peak?.at).toBe("2026-09-01T12:00:00.000Z");
    expect(peak?.totalCents).toBe(50000);
  });

  it("is undefined for an empty series", () => {
    expect(maxRollingWindow([])).toBeUndefined();
  });
});

describe("dailyBuckets", () => {
  it("returns nothing for an empty ledger", () => {
    expect(dailyBuckets([])).toEqual([]);
  });

  it("buckets by the local Monterrey day, not the UTC day", () => {
    // 04:00 UTC is 22:00 the previous day in Monterrey, which is UTC minus 6.
    const txs = [makeTx("late", "2026-09-12T04:00:00.000Z", 120)];

    expect(dailyBuckets(txs)[0].day).toBe("2026-09-11");
    expect(dailyBuckets(txs, { tzOffsetMinutes: 0 })[0].day).toBe("2026-09-12");
  });

  it("separates debits from credits and reports the net", () => {
    const txs = [
      makeTx("spend", "2026-09-10T18:00:00.000Z", 250.5),
      makeTx("pay", "2026-09-10T19:00:00.000Z", 1000, "credit"),
    ];

    const [bucket] = dailyBuckets(txs);

    expect(bucket.debitCents).toBe(25050);
    expect(bucket.creditCents).toBe(100000);
    expect(bucket.netCents).toBe(74950);
    expect(bucket.net).toBe(749.5);
    expect(bucket.count).toBe(2);
  });

  it("orders days oldest first even when the input is shuffled", () => {
    const txs = [
      makeTx("3", "2026-09-12T18:00:00.000Z", 10),
      makeTx("1", "2026-09-10T18:00:00.000Z", 10),
      makeTx("2", "2026-09-11T18:00:00.000Z", 10),
    ];

    expect(dailyBuckets(txs).map((bucket) => bucket.day)).toEqual([
      "2026-09-10",
      "2026-09-11",
      "2026-09-12",
    ]);
  });

  it("fills empty days when asked, so a chart has no holes", () => {
    const txs = [
      makeTx("1", "2026-09-10T18:00:00.000Z", 10),
      makeTx("2", "2026-09-13T18:00:00.000Z", 10),
    ];

    const filled = dailyBuckets(txs, { fill: true });

    expect(filled.map((bucket) => bucket.day)).toEqual([
      "2026-09-10",
      "2026-09-11",
      "2026-09-12",
      "2026-09-13",
    ]);
    expect(filled[1].count).toBe(0);
    expect(filled[1].debitCents).toBe(0);
  });

  it("honours from and to, including across a month boundary", () => {
    const txs = [
      makeTx("before", "2026-09-28T18:00:00.000Z", 10),
      makeTx("inside", "2026-09-30T18:00:00.000Z", 10),
      makeTx("after", "2026-10-03T18:00:00.000Z", 10),
    ];

    const window = dailyBuckets(txs, {
      from: "2026-09-30",
      to: "2026-10-01",
      fill: true,
    });

    expect(window.map((bucket) => bucket.day)).toEqual([
      "2026-09-30",
      "2026-10-01",
    ]);
    expect(window[0].count).toBe(1);
    expect(window[1].count).toBe(0);
  });

  it("accepts an instant as a bound, not just a day", () => {
    const txs = [makeTx("1", "2026-09-10T18:00:00.000Z", 10)];

    expect(
      dailyBuckets(txs, { from: "2026-09-10T00:00:00.000Z" }),
    ).toHaveLength(1);
  });
});

describe("day helpers", () => {
  it("knows the Monterrey offset", () => {
    expect(MONTERREY_UTC_OFFSET_MINUTES).toBe(-360);
    expect(dayKeyOf(Date.parse("2026-09-12T05:59:00.000Z"))).toBe("2026-09-11");
  });

  it("steps across month and year ends", () => {
    expect(nextDayKey("2026-09-30")).toBe("2026-10-01");
    expect(nextDayKey("2026-12-31")).toBe("2027-01-01");
    expect(nextDayKey("2028-02-28")).toBe("2028-02-29");
  });

  it("rejects a bound it cannot read", () => {
    expect(() => toDayKey("manana")).toThrow(RangeError);
    expect(() => nextDayKey("manana")).toThrow(RangeError);
  });

  it("reports whether an instant is parsable at all", () => {
    expect(isParsableInstant("2026-09-11T00:00:00.000Z")).toBe(true);
    expect(isParsableInstant("manana")).toBe(false);
  });
});
