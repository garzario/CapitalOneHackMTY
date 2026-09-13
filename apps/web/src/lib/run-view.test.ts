/**
 * Tests for the two answers the payment run gives before anyone reads a row.
 *
 * Both are load-bearing for the ten-second read, and both have a failure mode
 * that looks fine on a laptop and costs the demo: an order that changes
 * between renders, and a headline number that stops matching the table the
 * moment a clerk presses Retener with no API behind the page.
 */

import { describe, expect, test } from "bun:test";
import type { Action, Finding } from "@hackmty/core";
import type { PaymentRun, PaymentRunItem } from "./contract";
import { countsFor, matchesFilter, orderItems, runVerdict } from "./run-view";

let seq = 0;

function finding(amountAtRisk: number): Finding {
  seq += 1;

  return {
    id: `f-${seq}`,
    detector: "duplicate_invoice",
    severity: "critical",
    state: "comprobable",
    subject: { kind: "instruction", id: `ins-${seq}` },
    amountAtRisk,
    explanation: "Hallazgo sintetico para la prueba.",
    evidence: {},
    createdAt: "2026-09-10T10:00:00.000Z",
  };
}

function item(
  id: string,
  action: Action,
  amount: number,
  findings: Finding[] = [],
): PaymentRunItem {
  return {
    instruction: {
      id,
      supplierRfc: "SYN010101AAA",
      cfdiUuids: [],
      clabe: "012180001234567899",
      amount,
      source: "email",
      receivedAt: "2026-09-08",
      synthetic: true,
    },
    supplier: {
      rfc: "SYN010101AAA",
      legalName: "Proveedor Sintetico SA de CV",
      knownAccounts: [],
      firstInvoiceAt: "2025-01-15",
      synthetic: true,
    },
    decision: {
      instructionId: id,
      action,
      expectedLoss: 0,
      delayCostPerDay: 0,
      findings,
      decidedAt: "2026-09-10T10:00:00.000Z",
    },
    findings,
  };
}

function run(items: PaymentRunItem[]): PaymentRun {
  return {
    id: "run-2026w37",
    weekOf: "2026-09-07",
    /* Deliberately wrong. Nothing under test may read these, because the API
       totals go stale the moment a decision is applied without the API. */
    totals: {
      instructions: 999,
      amount: 999,
      held: 999,
      toVerify: 999,
      released: 999,
      heldAmount: 999,
      toVerifyAmount: 999,
      releasedAmount: 999,
      stoppedAmount: 999,
      amountAtRisk: 999,
      retroactive69bBase: 999,
      retroactive69bExposure: 999,
      confiable: 999,
      precaucion: 999,
      alerta: 999,
      rojo: 999,
      cancelado: 999,
      enviado: 999,
      pendiente: 999,
      liberado: 999,
    },
    items,
  };
}

describe("orderItems", () => {
  test("puts what is stopped before what is leaving", () => {
    const ordered = orderItems([
      item("a", "release", 100),
      item("b", "verify", 100),
      item("c", "hold", 100),
    ]);

    expect(ordered.map((row) => row.instruction.id)).toEqual(["c", "b", "a"]);
  });

  test("puts the largest amount first inside one state", () => {
    const ordered = orderItems([
      item("small", "hold", 1_000),
      item("large", "hold", 900_000),
      item("mid", "hold", 50_000),
    ]);

    expect(ordered.map((row) => row.instruction.id)).toEqual([
      "large",
      "mid",
      "small",
    ]);
  });

  test("keeps the input order when the state and the amount tie", () => {
    /* The edge case: two rows for the same amount must not swap between
       renders. A table that reshuffles under the cursor while a clerk is
       reaching for Retener is worse than a table in the wrong order. */
    const ordered = orderItems([
      item("first", "hold", 184_300),
      item("second", "hold", 184_300),
      item("third", "hold", 184_300),
    ]);

    expect(ordered.map((row) => row.instruction.id)).toEqual([
      "first",
      "second",
      "third",
    ]);
  });

  test("does not reorder the array it was given", () => {
    /* The run object lives in the resource cache and is shared with the alert
       rail and the drawer. Sorting in place would reorder their copy too. */
    const input = [item("a", "release", 1), item("b", "hold", 2)];
    const snapshot = input.map((row) => row.instruction.id);

    orderItems(input);

    expect(input.map((row) => row.instruction.id)).toEqual(snapshot);
  });

  test("survives an empty run", () => {
    expect(orderItems([])).toEqual([]);
  });
});

describe("runVerdict", () => {
  test("counts verify as money that has not left", () => {
    /* The edge case worth stating out loud: `verify` is not a release. The
       payment is waiting on a callback to a number we already had, so its
       pesos belong in the stopped figure, not in the released one. */
    const verdict = runVerdict(
      run([
        item("h", "hold", 500_000),
        item("v", "verify", 231_910.5),
        item("r", "release", 100_000),
      ]),
    );

    expect(verdict.stoppedCount).toBe(2);
    expect(verdict.stoppedAmount).toBe(731_910.5);
    expect(verdict.heldCount).toBe(1);
    expect(verdict.toVerifyCount).toBe(1);
    expect(verdict.releasedCount).toBe(1);
    expect(verdict.releasedAmount).toBe(100_000);
  });

  test("splits the stopped figure into held and to verify", () => {
    /* The bar under the figure paints these two next to the released amount,
       so a split that does not add back up to `stoppedAmount` would draw a
       bar that contradicts the number above it. */
    const verdict = runVerdict(
      run([
        item("h", "hold", 500_000),
        item("v", "verify", 231_910.5),
        item("r", "release", 100_000),
      ]),
    );

    expect(verdict.heldAmount).toBe(500_000);
    expect(verdict.toVerifyAmount).toBe(231_910.5);
    expect(verdict.heldAmount + verdict.toVerifyAmount).toBe(
      verdict.stoppedAmount,
    );
  });

  test("leaves the verify half at zero when nothing is awaiting a call", () => {
    /* A run of holds alone must not leave an amber segment in the bar, and
       the empty segment is the one that is easy to leave behind when the
       amounts are accumulated in the same loop. */
    const verdict = runVerdict(
      run([
        item("a", "hold", 40),
        item("b", "hold", 2),
        item("c", "release", 9),
      ]),
    );

    expect(verdict.toVerifyAmount).toBe(0);
    expect(verdict.heldAmount).toBe(42);
    expect(verdict.stoppedAmount).toBe(42);
  });

  test("reads the items and never the totals", () => {
    /* The bug this pins: offline, pressing Retener rewrites one item and
       leaves `run.totals` untouched. A headline computed from the totals then
       contradicts the table directly underneath it. */
    const verdict = runVerdict(run([item("only", "hold", 42)]));

    expect(verdict.totalCount).toBe(1);
    expect(verdict.totalAmount).toBe(42);
    expect(verdict.stoppedAmount).toBe(42);
  });

  test("names the finding with the most pesos at risk", () => {
    const verdict = runVerdict(
      run([
        item("a", "hold", 10, [finding(1_000)]),
        item("b", "hold", 10, [finding(412_875), finding(2_000)]),
        item("c", "release", 10, [finding(90)]),
      ]),
    );

    expect(verdict.worst?.finding.amountAtRisk).toBe(412_875);
    expect(verdict.worst?.instructionId).toBe("b");
  });

  test("keeps the first of two findings tied on pesos at risk", () => {
    /* The edge case: a tie must resolve the same way every render, or the
       sentence at the top of the screen changes while a judge is reading it. */
    const tied = run([
      item("first", "hold", 10, [finding(500_000)]),
      item("second", "hold", 10, [finding(500_000)]),
    ]);

    expect(runVerdict(tied).worst?.instructionId).toBe("first");
    expect(runVerdict(tied).worst?.instructionId).toBe("first");
  });

  test("has no worst risk when nothing was found", () => {
    const verdict = runVerdict(run([item("clean", "release", 10)]));

    expect(verdict.worst).toBeNull();
    expect(verdict.stoppedCount).toBe(0);
  });

  test("reports an empty run as zero rather than throwing", () => {
    const verdict = runVerdict(run([]));

    expect(verdict.totalCount).toBe(0);
    expect(verdict.totalAmount).toBe(0);
    expect(verdict.stoppedCount).toBe(0);
    expect(verdict.worst).toBeNull();
  });
});

/**
 * The filter decides what the table shows before anything else does, and it has
 * one failure mode that would be invisible on the demo run and wrong on a real
 * one: disagreeing with `runVerdict` about what "not leaving" means. Both read
 * the same NOT_LEAVING list, and these tests are what keeps a third definition
 * from being written next to a fourth.
 */
describe("the run filter", () => {
  const items = [
    item("a", "hold", 100),
    item("b", "verify", 200),
    item("c", "release", 300),
    item("d", "release", 400),
  ];

  test("stopped is hold and verify, not just hold", () => {
    const kept = items.filter((i) => matchesFilter(i, "stopped"));

    expect(kept.map((i) => i.instruction.id)).toEqual(["a", "b"]);
  });

  test("released is the exact complement of stopped", () => {
    const kept = items.filter((i) => matchesFilter(i, "released"));

    expect(kept.map((i) => i.instruction.id)).toEqual(["c", "d"]);
  });

  test("all keeps everything", () => {
    expect(items.filter((i) => matchesFilter(i, "all"))).toHaveLength(4);
  });

  test("the three buckets never drop or double-count a row", () => {
    const counts = countsFor(items);

    expect(counts).toEqual({ stopped: 2, released: 2, all: 4 });
    expect(counts.stopped + counts.released).toBe(counts.all);
  });

  test("the counts agree with the headline the card prints", () => {
    /* The card says "7 de 92" from runVerdict and the filter says "No salen 7"
       from countsFor. Two numbers on one screen that are supposed to be the
       same number is exactly the kind of thing that drifts. */
    const verdict = runVerdict(run(items));

    expect(countsFor(items).stopped).toBe(verdict.stoppedCount);
    expect(countsFor(items).released).toBe(verdict.releasedCount);
  });

  test("an empty run has three empty buckets", () => {
    expect(countsFor([])).toEqual({ stopped: 0, released: 0, all: 0 });
  });
});
