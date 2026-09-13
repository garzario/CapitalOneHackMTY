/**
 * What a run is allowed to send, asserted case by case.
 *
 * Every test here is a thing a judge can ask at the table: what stops a line, what
 * happens when the list lands after the decision, what a second press of the button
 * does, and whether naming a held line can force it through. The last one is the
 * only assertion in this file that is about an attack rather than about an accident.
 */

import { describe, expect, it } from "bun:test";
import type {
  Decision,
  Finding,
  PaymentExecutionLine,
  PaymentInstruction,
  Supplier,
} from "./domain";
import { SYSTEM_DECIDER } from "./domain";
import {
  claveOfReceiptId,
  type ExecutableLine,
  executionTotals,
  planRunExecution,
  receiptFor,
  receiptIdFor,
} from "./execution";

const NOW = "2026-09-12T18:00:00.000Z";

function instruction(
  id: string,
  amount: number,
  overrides: Partial<PaymentInstruction> = {},
): PaymentInstruction {
  return {
    id,
    supplierRfc: "SYN080910HI8",
    cfdiUuids: ["11111111-2222-3333-4444-555555555555"],
    clabe: "012180101391764613",
    amount,
    source: "email",
    receivedAt: NOW,
    synthetic: true,
    ...overrides,
  };
}

function decision(
  action: Decision["action"],
  overrides: Partial<Decision> = {},
): Decision {
  return {
    instructionId: "INS-1",
    action,
    expectedLoss: 0,
    delayCostPerDay: 100,
    findings: [],
    decidedAt: NOW,
    ...overrides,
  };
}

function satFinding(): Finding {
  return {
    id: "sat69b:SYN080910HI8:2026-09-12:definitivo",
    detector: "sat_69b",
    severity: "critical",
    state: "comprobable",
    subject: { kind: "supplier", id: "SYN080910HI8" },
    amountAtRisk: 100,
    explanation: "El SAT publico al proveedor en definitiva.",
    evidence: { status: "definitivo", listedNow: true },
    createdAt: NOW,
  };
}

function line(
  id: string,
  amount: number,
  overrides: Partial<ExecutableLine> = {},
): ExecutableLine {
  return {
    instruction: instruction(id, amount),
    decision: decision("release"),
    findings: [],
    ...overrides,
  };
}

describe("planRunExecution", () => {
  it("sends the released lines and leaves the stopped ones alone", () => {
    const plan = planRunExecution({
      lines: [
        line("INS-1", 42180.5),
        line("INS-2", 1000, { decision: decision("hold") }),
        line("INS-3", 2000, { decision: decision("verify") }),
        line("INS-4", 3000, { decision: null }),
      ],
    });

    expect(plan.send.map((row) => row.instructionId)).toEqual(["INS-1"]);
    expect(plan.cancel).toEqual([]);
    expect(plan.skip.map((row) => [row.instructionId, row.state])).toEqual([
      ["INS-2", "rojo"],
      ["INS-3", "rojo"],
      ["INS-4", "pendiente"],
    ]);
    // Every skipped line carries a sentence. A line that vanished out of a run with
    // no reason against it is a line nobody can answer for.
    expect(plan.skip.every((row) => (row.reason ?? "") !== "")).toBe(true);
  });

  it("cancels a released line a definitive SAT listing reached first", () => {
    const findings = [satFinding()];
    const plan = planRunExecution({
      lines: [
        line("INS-1", 5000, {
          decision: decision("release", {
            decidedBy: SYSTEM_DECIDER,
            findings,
          }),
          findings,
        }),
      ],
    });

    expect(plan.send).toEqual([]);
    expect(plan.cancel).toHaveLength(1);
    expect(plan.cancel[0]?.state).toBe("cancelado");
    expect(plan.cancel[0]?.rule).toBe("sat_definitive");
    expect(plan.cancel[0]?.reason).toContain("lista definitiva del SAT");
  });

  it("sends the same line when a person signed the release with their name", () => {
    const findings = [satFinding()];
    const plan = planRunExecution({
      lines: [
        line("INS-1", 5000, {
          decision: decision("release", {
            decidedBy: "Lupita Elizondo",
            findings,
          }),
          findings,
        }),
      ],
    });

    expect(plan.send.map((row) => row.instructionId)).toEqual(["INS-1"]);
    expect(plan.cancel).toEqual([]);
  });

  /**
   * A second press of the button must not append a second `payment_cancelled` for a
   * line the run already dropped. Two of those would read as two runs dropping one
   * payment, and it is the bug that made a second execute answer `202`.
   */
  it("does not cancel a line the run already cancelled", () => {
    const findings = [satFinding()];
    const plan = planRunExecution({
      lines: [
        line("INS-1", 5000, {
          decision: decision("release", {
            decidedBy: SYSTEM_DECIDER,
            findings,
          }),
          findings,
          execution: { state: "cancelled" },
        }),
      ],
    });

    expect(plan.cancel).toEqual([]);
    expect(plan.send).toEqual([]);
    expect(plan.skip[0]?.rule).toBe("execution_cancelled");
  });

  it("cancels a line whose beneficiary verification came back blocked", () => {
    const plan = planRunExecution({
      lines: [line("INS-1", 5000, { verification: { state: "blocked" } })],
    });

    expect(plan.cancel[0]?.rule).toBe("verification_blocked");
    expect(plan.send).toEqual([]);
  });

  it("plans nothing for a line the rail already carried", () => {
    const plan = planRunExecution({
      lines: [
        line("INS-1", 5000, { execution: { state: "settled" } }),
        line("INS-2", 6000, { execution: { state: "sent" } }),
        line("INS-3", 7000),
      ],
    });

    expect(plan.send.map((row) => row.instructionId)).toEqual(["INS-3"]);
    expect(plan.skip.map((row) => [row.instructionId, row.rule])).toEqual([
      ["INS-1", "executed"],
      ["INS-2", "executed"],
    ]);
  });

  /**
   * The case that predates this endpoint: every SPEI used to leave from the company's
   * own banking portal, and the ledger holds a `payment_sent` for it with no run on
   * it. Sending one of those again is the worst bug this endpoint could have.
   */
  it("plans nothing for a line the ledger already says was paid elsewhere", () => {
    const plan = planRunExecution({
      lines: [
        {
          instruction: instruction("INS-1", 5000, {
            sentAt: "2026-09-11T18:00:00.000Z",
          }),
          decision: decision("release"),
          findings: [],
        },
      ],
    });

    expect(plan.send).toEqual([]);
    expect(plan.skip[0]?.rule).toBe("executed");
    expect(plan.skip[0]?.state).toBe("enviado");
  });

  it("narrows to the named lines and refuses a named line nothing may send", () => {
    const plan = planRunExecution({
      lines: [
        line("INS-1", 1000),
        line("INS-2", 2000, { decision: decision("hold") }),
        line("INS-3", 3000),
      ],
      only: ["INS-1", "INS-2", "INS-9"],
    });

    expect(plan.send.map((row) => row.instructionId)).toEqual(["INS-1"]);
    expect(plan.refused.map((row) => row.instructionId)).toEqual(["INS-2"]);
    expect(plan.unknown).toEqual(["INS-9"]);
    // INS-3 was not named, so the run left it exactly as it was.
    expect(plan.skip.map((row) => row.instructionId)).toEqual(["INS-3"]);
    // And nothing was cancelled on a narrowed request: a filter is not a decision.
    expect(plan.cancel).toEqual([]);
  });

  it("keeps the order of the run", () => {
    const plan = planRunExecution({
      lines: [line("INS-9", 1), line("INS-1", 2), line("INS-5", 3)],
    });

    expect(plan.send.map((row) => row.instructionId)).toEqual([
      "INS-9",
      "INS-1",
      "INS-5",
    ]);
  });
});

describe("executionTotals", () => {
  function executed(
    state: PaymentExecutionLine["state"],
    amount: number,
  ): PaymentExecutionLine {
    return { instructionId: `INS-${state}-${amount}`, state, amount };
  }

  it("adds the five buckets up to the whole execution, to the centavo", () => {
    const totals = executionTotals([
      executed("sent", 42180.5),
      executed("settled", 1234.57),
      executed("failed", 0.03),
      executed("cancelled", 9.99),
      executed("queued", 0.01),
    ]);

    expect(totals.lines).toBe(5);
    expect(totals.amount).toBe(43425.1);
    expect(
      totals.queuedAmount +
        totals.sentAmount +
        totals.settledAmount +
        totals.failedAmount +
        totals.cancelledAmount,
    ).toBeCloseTo(totals.amount, 10);
    expect(totals.sent).toBe(1);
    expect(totals.settled).toBe(1);
  });

  it("answers zeros for an execution nobody ran", () => {
    const totals = executionTotals([]);
    expect(totals.lines).toBe(0);
    expect(totals.amount).toBe(0);
  });
});

describe("receiptFor", () => {
  const supplier: Supplier = {
    rfc: "SYN080910HI8",
    legalName: "Aceros y Laminas del Norte SA de CV",
    knownAccounts: [],
    firstInvoiceAt: NOW,
    synthetic: true,
  };

  it("prints four digits of the account and never the other fourteen", () => {
    const receipt = receiptFor({
      runId: "run-2026w37",
      line: {
        instructionId: "INS-1",
        state: "sent",
        amount: 42180.5,
        claveRastreo: "NSS19D6B4B45F944DD29C749F",
        rail: "nessie",
        sentAt: NOW,
      },
      instruction: instruction("INS-1", 42180.5),
      supplier,
      beneficiaryBank: "BBVA MEXICO",
      executedBy: { name: "Lupita Elizondo", role: "clerk" },
      sealState: "not_checked",
      rail: "nessie",
      synthetic: true,
    });

    expect(receipt.beneficiaryAccountLast4).toBe("4613");
    expect(JSON.stringify(receipt)).not.toContain("012180101391764613");
    expect(receipt.sealState).toBe("not_checked");
    expect(receipt.settledAt).toBeUndefined();
    expect(receipt.id).toBe(receiptIdFor("NSS19D6B4B45F944DD29C749F"));
    expect(claveOfReceiptId(receipt.id)).toBe("NSS19D6B4B45F944DD29C749F");
  });

  it("refuses to write a receipt for a line with no clave de rastreo", () => {
    expect(() =>
      receiptFor({
        runId: "run-2026w37",
        line: { instructionId: "INS-1", state: "queued", amount: 1 },
        instruction: instruction("INS-1", 1),
        beneficiaryBank: "BBVA MEXICO",
        executedBy: { name: "Lupita Elizondo", role: "clerk" },
        sealState: "not_checked",
        rail: "nessie",
        synthetic: true,
      }),
    ).toThrow(/clave de rastreo/);
  });

  it("carries the settlement instant only when the rail acknowledged it", () => {
    const receipt = receiptFor({
      runId: "run-2026w37",
      line: {
        instructionId: "INS-1",
        state: "settled",
        amount: 1,
        claveRastreo: "SYNPAY0000000001",
        sentAt: NOW,
      },
      instruction: instruction("INS-1", 1),
      beneficiaryBank: "BBVA MEXICO",
      executedBy: { name: "Lupita Elizondo", role: "clerk" },
      sealState: "not_checked",
      settledAt: "2026-09-12T18:00:03.000Z",
      rail: "nessie",
      synthetic: true,
    });

    expect(receipt.settledAt).toBe("2026-09-12T18:00:03.000Z");
    expect(receipt.beneficiaryName).toBe("SYN080910HI8");
  });
});
