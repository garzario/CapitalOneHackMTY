import { describe, expect, it } from "bun:test";
import type { LedgerEvent } from "@hackmty/core";
import {
  canonicalise,
  eventsInRange,
  fingerprintLedger,
  groupDigest,
} from "./hash";

function paymentSent(at: string, instructionId: string): LedgerEvent {
  return { type: "payment_sent", at, instructionId };
}

const LEDGER: LedgerEvent[] = [
  paymentSent("2026-09-01T15:00:00.000Z", "ins-1"),
  paymentSent("2026-09-05T15:00:00.000Z", "ins-2"),
  paymentSent("2026-09-09T15:00:00.000Z", "ins-3"),
];

describe("canonicalise", () => {
  it("sorts keys at every depth, so two servers serialise the same bytes", () => {
    const left = canonicalise({ b: 1, a: { d: 2, c: 3 } });
    const right = canonicalise({ a: { c: 3, d: 2 }, b: 1 });

    expect(JSON.stringify(left)).toBe(JSON.stringify(right));
  });

  it("leaves array order alone, because in a ledger the order is the meaning", () => {
    expect(JSON.stringify(canonicalise([2, 1]))).toBe("[2,1]");
  });
});

describe("eventsInRange", () => {
  it("includes both bounds", () => {
    const scoped = eventsInRange(LEDGER, {
      from: "2026-09-01T15:00:00.000Z",
      to: "2026-09-05T15:00:00.000Z",
    });

    expect(scoped).toHaveLength(2);
  });

  it("takes the whole ledger when no bound is given", () => {
    expect(eventsInRange(LEDGER)).toHaveLength(3);
  });

  it("drops an event whose instant cannot be read, rather than placing it anywhere", () => {
    const dirty = [...LEDGER, paymentSent("ayer", "ins-4")];

    expect(eventsInRange(dirty)).toHaveLength(3);
  });
});

describe("fingerprintLedger", () => {
  it("gives the same digest for the same range twice", () => {
    expect(fingerprintLedger(LEDGER).digest).toBe(
      fingerprintLedger(LEDGER).digest,
    );
  });

  it("changes when one field of one event changes", () => {
    const edited: LedgerEvent[] = [
      paymentSent("2026-09-01T15:00:00.000Z", "ins-1"),
      paymentSent("2026-09-05T15:00:00.000Z", "ins-9"),
      paymentSent("2026-09-09T15:00:00.000Z", "ins-3"),
    ];

    expect(fingerprintLedger(edited).digest).not.toBe(
      fingerprintLedger(LEDGER).digest,
    );
  });

  it("changes when an event is appended", () => {
    const longer = [
      ...LEDGER,
      paymentSent("2026-09-10T15:00:00.000Z", "ins-4"),
    ];

    expect(fingerprintLedger(longer).digest).not.toBe(
      fingerprintLedger(LEDGER).digest,
    );
  });

  it("does not change when a key is written in a different order", () => {
    const reordered = [
      {
        instructionId: "ins-1",
        at: "2026-09-01T15:00:00.000Z",
        type: "payment_sent",
      },
      {
        at: "2026-09-05T15:00:00.000Z",
        instructionId: "ins-2",
        type: "payment_sent",
      },
      {
        type: "payment_sent",
        instructionId: "ins-3",
        at: "2026-09-09T15:00:00.000Z",
      },
    ] as LedgerEvent[];

    expect(fingerprintLedger(reordered).digest).toBe(
      fingerprintLedger(LEDGER).digest,
    );
  });

  it("cannot be fooled by two events that concatenate into a third", () => {
    // Without a separator between records, ab + c and a + bc hash the same.
    const left = fingerprintLedger([
      paymentSent("2026-09-01T15:00:00.000Z", "ins-1ins"),
      paymentSent("2026-09-02T15:00:00.000Z", "2"),
    ]);
    const right = fingerprintLedger([
      paymentSent("2026-09-01T15:00:00.000Z", "ins-1"),
      paymentSent("2026-09-02T15:00:00.000Z", "ins-2"),
    ]);

    expect(left.digest).not.toBe(right.digest);
  });

  it("hashes an empty range instead of refusing it", () => {
    const empty = fingerprintLedger(LEDGER, {
      from: "2027-01-01T00:00:00.000Z",
    });

    expect(empty.events).toBe(0);
    expect(empty.digest).toHaveLength(64);
    expect(empty.from).toBeUndefined();
  });

  it("reports the first and last instant it actually counted", () => {
    const scoped = fingerprintLedger(LEDGER, {
      from: "2026-09-02T00:00:00.000Z",
    });

    expect(scoped.from).toBe("2026-09-05T15:00:00.000Z");
    expect(scoped.to).toBe("2026-09-09T15:00:00.000Z");
  });
});

describe("groupDigest", () => {
  it("breaks the hex into readable groups without changing it", () => {
    const grouped = groupDigest("0123456789abcdef", 4);

    expect(grouped).toBe("0123 4567 89ab cdef");
    expect(grouped.replace(/ /g, "")).toBe("0123456789abcdef");
  });
});
