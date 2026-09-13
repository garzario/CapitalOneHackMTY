/**
 * The execution projection, and the two things it refuses to round.
 *
 * `foldExecution` is pure, so it is asserted directly: hand it events and it says what
 * the screen will show, with no repository, no clock and no rail. The assertions worth
 * reading are the precedence ones, because every argument about this fold is an
 * argument about which event wins: a settlement against a later `payment_sent`, and a
 * failure recorded against a line that already left.
 */

import { describe, expect, it } from "bun:test";
import type { Actor, LedgerEvent } from "@hackmty/core";
import { bankOf, foldExecution, UNRECORDED_ACTOR } from "./execution";

const RUN = "run-2026-w37";
const NOW = "2026-09-13T02:00:00.000Z";
const ACTOR: Actor = { name: "Lupita Elizondo", role: "clerk" };

const AMOUNTS = new Map([
  ["INS-1", 42180.5],
  ["INS-2", 1234.57],
  ["INS-3", 9.99],
]);

function sent(
  instructionId: string,
  at: string,
  claveRastreo?: string,
): LedgerEvent {
  return {
    type: "payment_sent",
    at,
    instructionId,
    ...(claveRastreo === undefined ? {} : { claveRastreo }),
    runId: RUN,
    rail: "nessie",
    actor: ACTOR,
  };
}

describe("foldExecution", () => {
  it("answers an empty execution for a run nobody executed", () => {
    const execution = foldExecution(RUN, [], AMOUNTS, NOW);

    expect(execution.lines).toEqual([]);
    expect(execution.totals.lines).toBe(0);
    expect(execution.startedBy).toBeUndefined();
    expect(execution.updatedAt).toBe(NOW);
  });

  it("builds a sent line with its clave, its rail, its receipt and its pesos", () => {
    const execution = foldExecution(
      RUN,
      [sent("INS-1", "2026-09-13T01:00:00.000Z", "NSSABC123")],
      AMOUNTS,
      NOW,
    );

    expect(execution.lines).toEqual([
      {
        instructionId: "INS-1",
        state: "sent",
        amount: 42180.5,
        claveRastreo: "NSSABC123",
        receiptId: "rcp-NSSABC123",
        rail: "nessie",
        sentAt: "2026-09-13T01:00:00.000Z",
      },
    ]);
    expect(execution.totals.sentAmount).toBe(42180.5);
    expect(execution.startedBy).toEqual(ACTOR);
    expect(execution.startedAt).toBe("2026-09-13T01:00:00.000Z");
    // The newest event behind the projection, not the clock.
    expect(execution.updatedAt).toBe("2026-09-13T01:00:00.000Z");
  });

  it("settles a line on the acknowledgement and carries the receipt the event names", () => {
    const execution = foldExecution(
      RUN,
      [
        sent("INS-1", "2026-09-13T01:00:00.000Z", "NSSABC123"),
        {
          type: "payment_settled",
          at: "2026-09-13T01:00:05.000Z",
          instructionId: "INS-1",
          claveRastreo: "NSSABC123",
          receiptId: "rcp-NSSABC123",
          runId: RUN,
        },
      ],
      AMOUNTS,
      NOW,
    );

    expect(execution.lines[0]?.state).toBe("settled");
    expect(execution.totals.settled).toBe(1);
    expect(execution.totals.sent).toBe(0);
    expect(execution.totals.settledAmount).toBe(42180.5);
  });

  /**
   * The ledger is append-ordered by instant and a late event is legal, so a
   * `payment_sent` stamped after the settlement it belongs to must not un-settle the
   * line. Same argument `atLeast` makes in the verification fold.
   */
  it("never walks a settled line back to sent", () => {
    const execution = foldExecution(
      RUN,
      [
        {
          type: "payment_settled",
          at: "2026-09-13T01:00:05.000Z",
          instructionId: "INS-1",
          claveRastreo: "NSSABC123",
          receiptId: "rcp-NSSABC123",
          runId: RUN,
        },
        sent("INS-1", "2026-09-13T01:00:09.000Z", "NSSABC123"),
      ],
      AMOUNTS,
      NOW,
    );

    expect(execution.lines[0]?.state).toBe("settled");
  });

  it("records a failure and a cancellation with the sentence behind each", () => {
    const execution = foldExecution(
      RUN,
      [
        {
          type: "payment_failed",
          at: "2026-09-13T01:00:00.000Z",
          instructionId: "INS-2",
          reason: "la cuenta CLABE no existe en el banco receptor",
          runId: RUN,
        },
        {
          type: "payment_cancelled",
          at: "2026-09-13T01:00:01.000Z",
          instructionId: "INS-3",
          reason: "el proveedor esta en la lista definitiva del SAT",
          runId: RUN,
        },
      ],
      AMOUNTS,
      NOW,
    );

    expect(execution.totals.failed).toBe(1);
    expect(execution.totals.cancelled).toBe(1);
    expect(execution.totals.failedAmount).toBe(1234.57);
    expect(execution.totals.cancelledAmount).toBe(9.99);
    for (const line of execution.lines) {
      expect(line.reason ?? "").not.toBe("");
    }
    // Nobody dropped the cancelled line by hand, so no actor is recorded for it.
    expect(execution.startedBy).toBeUndefined();
  });

  /** Money that left is the one fact nothing else overrides, including a retry. */
  it("keeps a line that left when a failure is recorded against it afterwards", () => {
    const execution = foldExecution(
      RUN,
      [
        sent("INS-1", "2026-09-13T01:00:00.000Z", "NSSABC123"),
        {
          type: "payment_failed",
          at: "2026-09-13T01:05:00.000Z",
          instructionId: "INS-1",
          reason: "el reintento fue rechazado",
          runId: RUN,
        },
      ],
      AMOUNTS,
      NOW,
    );

    expect(execution.lines[0]?.state).toBe("sent");
    expect(execution.totals.failed).toBe(0);
  });

  it("builds a line with no clave, which is what the portal path looks like", () => {
    const execution = foldExecution(
      RUN,
      [sent("INS-1", "2026-09-13T01:00:00.000Z")],
      AMOUNTS,
      NOW,
    );

    expect(execution.lines[0]?.claveRastreo).toBeUndefined();
    expect(execution.lines[0]?.receiptId).toBeUndefined();
    expect(execution.lines[0]?.state).toBe("sent");
  });

  it("reads zero pesos for an instruction the run does not hold", () => {
    /* A `payment_sent` the run has no line for is a payment of another week that
       somehow carries this run id. Zero rather than a guess: the amount of a line is
       the instruction's and there is exactly one place it lives. */
    const execution = foldExecution(
      RUN,
      [sent("INS-9", "2026-09-13T01:00:00.000Z", "NSSABC999")],
      AMOUNTS,
      NOW,
    );

    expect(execution.lines[0]?.amount).toBe(0);
  });
});

describe("bankOf", () => {
  it("names the institution from the Banxico snapshot in core", () => {
    expect(bankOf("012180101391764613")).toBe("BBVA MEXICO");
    expect(bankOf("072580000456123788")).toBe("BANORTE");
  });

  it("says which code it could not name rather than inventing a bank", () => {
    expect(bankOf("999180000000000000")).toBe("institucion 999");
  });
});

describe("UNRECORDED_ACTOR", () => {
  it("says nobody is recorded rather than naming somebody the ledger does not hold", () => {
    /* Every execution through the endpoint records an actor, because the route
       requires the header. What does not is a `payment_sent` the seed wrote for a SPEI
       the company made from its own banking portal. */
    expect(UNRECORDED_ACTOR.name).toContain("sin registro");
  });
});
