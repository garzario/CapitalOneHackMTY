import { describe, expect, it, spyOn } from "bun:test";
import type { LedgerEvent } from "@hackmty/core";
import { createBroadcaster } from "./events";

const EVENT: LedgerEvent = {
  type: "payment_sent",
  at: "2026-09-12T03:05:00.000Z",
  instructionId: "ins-2026w37-03",
};

describe("createBroadcaster", () => {
  it("delivers to every subscriber and counts them", () => {
    const broadcaster = createBroadcaster();
    const first: LedgerEvent[] = [];
    const second: LedgerEvent[] = [];

    broadcaster.subscribe((event) => first.push(event));
    broadcaster.subscribe((event) => second.push(event));

    expect(broadcaster.subscribers).toBe(2);
    broadcaster.publish(EVENT);

    expect(first).toEqual([EVENT]);
    expect(second).toEqual([EVENT]);
  });

  it("stops delivering after unsubscribe, and unsubscribing twice is safe", () => {
    const broadcaster = createBroadcaster();
    const seen: LedgerEvent[] = [];
    const unsubscribe = broadcaster.subscribe((event) => seen.push(event));

    unsubscribe();
    unsubscribe();
    broadcaster.publish(EVENT);

    expect(seen).toEqual([]);
    expect(broadcaster.subscribers).toBe(0);
  });

  it("keeps delivering when one subscriber throws", () => {
    const broadcaster = createBroadcaster();
    const seen: LedgerEvent[] = [];
    // The failure is logged on purpose, so the log is captured rather than
    // printed into the middle of a green test run.
    const logged = spyOn(console, "error").mockImplementation(() => {});

    broadcaster.subscribe(() => {
      throw new Error("a closed stream");
    });
    broadcaster.subscribe((event) => seen.push(event));

    expect(() => broadcaster.publish(EVENT)).not.toThrow();
    expect(seen).toEqual([EVENT]);
    expect(logged).toHaveBeenCalledTimes(1);

    logged.mockRestore();
  });

  it("lets a subscriber unsubscribe itself during a publish", () => {
    const broadcaster = createBroadcaster();
    const seen: LedgerEvent[] = [];

    const unsubscribe = broadcaster.subscribe(() => unsubscribe());
    broadcaster.subscribe((event) => seen.push(event));

    broadcaster.publish(EVENT);

    // The second listener still ran: iterating a copy is what makes that true.
    expect(seen).toEqual([EVENT]);
    expect(broadcaster.subscribers).toBe(1);
  });
});
