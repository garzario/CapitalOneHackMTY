import { describe, expect, it } from "bun:test";
import type {
  Cfdi,
  LedgerEvent,
  PaymentComplement,
  PaymentInstruction,
} from "./domain";
import {
  applyPaymentSentEvents,
  detectBankReconciliation,
} from "./reconciliation";
import type { Direction, LedgerTx } from "./types";

/** The clock the caller passes in. This package owns none. */
const NOW = "2026-09-12T09:00:00.000Z";
const SUPPLIER_RFC = "SYN010101AAA";

function makeTx(
  id: string,
  occurredAt: string,
  amount: number,
  direction: Direction = "debit",
): LedgerTx {
  return {
    id,
    accountId: "acct-espejo",
    occurredAt,
    amount,
    direction,
    source: "nessie",
    raw: {},
  };
}

function makeInstruction(
  id: string,
  amount: number,
  receivedAt: string,
  extra: Partial<PaymentInstruction> = {},
): PaymentInstruction {
  return {
    id,
    supplierRfc: SUPPLIER_RFC,
    cfdiUuids: [],
    clabe: "012180001234567895",
    amount,
    source: "whatsapp",
    receivedAt,
    synthetic: true,
    ...extra,
  };
}

function makeCfdi(
  uuid: string,
  total: number,
  issuedAt: string,
  extra: Partial<Cfdi> = {},
): Cfdi {
  const subtotal = Number((total / 1.16).toFixed(2));
  return {
    uuid,
    issuedAt,
    issuerRfc: SUPPLIER_RFC,
    issuerName: "Proveedor Sintetico SA de CV",
    receiverRfc: "SYN020202BBB",
    subtotal,
    iva: Number((total - subtotal).toFixed(2)),
    total,
    paymentMethod: "PUE",
    synthetic: true,
    ...extra,
  };
}

function makeComplement(
  uuid: string,
  relatedCfdiUuid: string,
  paidAmount: number,
  paidAt: string,
): PaymentComplement {
  return { uuid, relatedCfdiUuid, paidAt, paidAmount, synthetic: true };
}

describe("detectBankReconciliation", () => {
  it("finds nothing in an empty ledger with no documents", () => {
    expect(detectBankReconciliation([], [], [], [], { now: NOW })).toEqual([]);
  });

  it("says nothing about an outflow its instruction explains", () => {
    const txs = [makeTx("tx-1", "2026-09-10T18:00:00.000Z", 12000)];
    const instructions = [
      makeInstruction("ins-1", 12000, "2026-09-09T15:00:00.000Z"),
    ];

    expect(
      detectBankReconciliation(txs, instructions, [], [], { now: NOW }),
    ).toEqual([]);
  });

  it("flags an outflow with no instruction and no CFDI behind it", () => {
    const txs = [makeTx("tx-fantasma", "2026-09-11T16:00:00.000Z", 45000)];
    const instructions = [
      makeInstruction("ins-1", 12000, "2026-09-11T15:00:00.000Z"),
    ];

    const findings = detectBankReconciliation(txs, instructions, [], [], {
      now: NOW,
    });

    expect(findings).toHaveLength(1);
    expect(findings[0].id).toBe("recon:unbacked_outflow:tx-fantasma");
    expect(findings[0].detector).toBe("bank_reconciliation");
    expect(findings[0].severity).toBe("warning");
    expect(findings[0].state).toBe("requiere_verificacion");
    expect(findings[0].subject).toEqual({
      kind: "ledger_tx",
      id: "tx-fantasma",
    });
    expect(findings[0].amountAtRisk).toBe(45000);
    expect(findings[0].createdAt).toBe(NOW);
    expect(findings[0].evidence.case).toBe("unbacked_outflow");
    expect(findings[0].evidence.day).toBe("2026-09-11");
    expect(findings[0].evidence.documentsConsidered).toBe(1);
  });

  it("reconciles money leaving the account, never money arriving", () => {
    const txs = [
      makeTx("tx-cobro", "2026-09-11T16:00:00.000Z", 45000, "credit"),
    ];

    expect(detectBankReconciliation(txs, [], [], [], { now: NOW })).toEqual([]);
  });

  it("matches on the calendar day, because Nessie has no time of day", () => {
    // The importer had to invent an hour and chose midnight UTC, which is the
    // evening of the day before in Monterrey. The clerk received the
    // instruction late that evening. It is the same payment.
    const txs = [makeTx("tx-1", "2026-09-10T00:00:00.000Z", 12000)];
    const instructions = [
      makeInstruction("ins-1", 12000, "2026-09-10T23:30:00.000Z"),
    ];

    expect(
      detectBankReconciliation(txs, instructions, [], [], { now: NOW }),
    ).toEqual([]);
  });

  it("takes a bare Nessie date literally instead of shifting it a day back", () => {
    const txs = [makeTx("tx-1", "2026-09-10", 12000)];
    const instructions = [
      makeInstruction("ins-1", 12000, "2026-09-10T23:30:00.000Z"),
    ];

    const findings = detectBankReconciliation(txs, instructions, [], [], {
      now: NOW,
      windowDays: 0,
    });

    expect(findings).toEqual([]);
  });

  it("does not match an outflow that falls outside the day window", () => {
    const txs = [makeTx("tx-1", "2026-09-06T18:00:00.000Z", 12000)];
    const instructions = [
      makeInstruction("ins-1", 12000, "2026-09-01T18:00:00.000Z"),
    ];

    const findings = detectBankReconciliation(txs, instructions, [], [], {
      now: NOW,
    });

    expect(findings.map((finding) => finding.evidence.case)).toEqual([
      "unbacked_outflow",
    ]);
  });

  it("counts the edge of the window as inside it", () => {
    const txs = [makeTx("tx-1", "2026-09-04T18:00:00.000Z", 12000)];
    const instructions = [
      makeInstruction("ins-1", 12000, "2026-09-01T18:00:00.000Z"),
    ];

    expect(
      detectBankReconciliation(txs, instructions, [], [], { now: NOW }),
    ).toEqual([]);
  });

  it("counts the edge of the window on the other side too", () => {
    // The bank posted before the instruction was written down, which happens
    // when a payment is made from the portal first. The window is symmetric, so
    // the same three days have to reach forwards as well as back.
    const txs = [makeTx("tx-1", "2026-09-01T18:00:00.000Z", 12000)];
    const inside = [
      makeInstruction("ins-1", 12000, "2026-09-04T18:00:00.000Z"),
    ];
    const outside = [
      makeInstruction("ins-1", 12000, "2026-09-05T18:00:00.000Z"),
    ];

    expect(detectBankReconciliation(txs, inside, [], [], { now: NOW })).toEqual(
      [],
    );
    expect(
      detectBankReconciliation(txs, outside, [], [], {
        now: NOW,
      }).map((finding) => finding.evidence.case),
    ).toEqual(["unbacked_outflow"]);
  });

  it("absorbs a rounded cent inside the tolerance and nothing beyond it", () => {
    const instructions = [
      makeInstruction("ins-1", 12000, "2026-09-10T15:00:00.000Z"),
    ];
    const rounded = [makeTx("tx-1", "2026-09-10T18:00:00.000Z", 12000.75)];
    const different = [makeTx("tx-2", "2026-09-10T18:00:00.000Z", 12002)];

    expect(
      detectBankReconciliation(rounded, instructions, [], [], { now: NOW }),
    ).toEqual([]);
    expect(
      detectBankReconciliation(different, instructions, [], [], { now: NOW }),
    ).toHaveLength(1);
    expect(
      detectBankReconciliation(rounded, instructions, [], [], {
        now: NOW,
        tolerance: 0,
      }),
    ).toHaveLength(1);
  });

  it("reports a CFDI paid twice once, with the second outflow as the money at risk", () => {
    const cfdis = [makeCfdi("cfdi-1", 18430, "2026-09-08T16:00:00.000Z")];
    const instructions = [
      makeInstruction("ins-1", 18430, "2026-09-09T15:00:00.000Z", {
        cfdiUuids: ["cfdi-1"],
      }),
    ];
    const txs = [
      makeTx("tx-a", "2026-09-10T16:00:00.000Z", 18430),
      makeTx("tx-b", "2026-09-11T16:00:00.000Z", 18430),
    ];

    const findings = detectBankReconciliation(txs, instructions, cfdis, [], {
      now: NOW,
    });

    expect(findings).toHaveLength(1);
    expect(findings[0].id).toBe("recon:cfdi_paid_twice:cfdi-1");
    expect(findings[0].severity).toBe("critical");
    expect(findings[0].state).toBe("comprobable");
    expect(findings[0].subject).toEqual({ kind: "cfdi", id: "cfdi-1" });
    expect(findings[0].amountAtRisk).toBe(18430);
    expect(findings[0].evidence.matchedOutflowId).toBe("tx-a");
    expect(findings[0].evidence.duplicateOutflowIds).toBe("tx-b");
    expect(findings[0].evidence.outflows).toBe(2);
  });

  it("treats an invoice, its instruction and its complement as one expected payment", () => {
    // Three documents describe one movement of money. If they stayed three,
    // the second outflow would find a free document to hide behind and the
    // duplicate would never be reported.
    const cfdis = [makeCfdi("cfdi-2", 18430, "2026-09-08T16:00:00.000Z")];
    const instructions = [
      makeInstruction("ins-2", 18430, "2026-09-09T15:00:00.000Z", {
        cfdiUuids: ["cfdi-2"],
      }),
    ];
    const complements = [
      makeComplement("comp-2", "cfdi-2", 18430, "2026-09-10"),
    ];
    const txs = [
      makeTx("tx-a", "2026-09-10T16:00:00.000Z", 18430),
      makeTx("tx-b", "2026-09-11T16:00:00.000Z", 18430),
    ];

    const findings = detectBankReconciliation(
      txs,
      instructions,
      cfdis,
      complements,
      { now: NOW },
    );

    expect(findings).toHaveLength(1);
    expect(findings[0].evidence.case).toBe("cfdi_paid_twice");
    expect(findings[0].evidence.documentKind).toBe("complement");
    expect(findings[0].evidence.documentId).toBe("comp-2");
  });

  it("does not call a PPD invoice paid in two instalments a duplicate", () => {
    const cfdis = [
      makeCfdi("cfdi-3", 20000, "2026-09-01T16:00:00.000Z", {
        paymentMethod: "PPD",
      }),
    ];
    const complements = [
      makeComplement("comp-a", "cfdi-3", 10000, "2026-09-05"),
      makeComplement("comp-b", "cfdi-3", 10000, "2026-09-07"),
    ];
    const txs = [
      makeTx("tx-a", "2026-09-05T18:00:00.000Z", 10000),
      makeTx("tx-b", "2026-09-07T18:00:00.000Z", 10000),
    ];

    expect(
      detectBankReconciliation(txs, [], cfdis, complements, { now: NOW }),
    ).toEqual([]);
  });

  it("flags an instruction marked as sent that the bank never posted", () => {
    const instructions = [
      makeInstruction("ins-4", 8400, "2026-09-09T15:00:00.000Z", {
        sentAt: "2026-09-10T16:00:00.000Z",
      }),
    ];

    const findings = detectBankReconciliation([], instructions, [], [], {
      now: NOW,
    });

    expect(findings).toHaveLength(1);
    expect(findings[0].id).toBe("recon:payment_not_in_mirror:ins-4");
    expect(findings[0].severity).toBe("warning");
    expect(findings[0].state).toBe("requiere_verificacion");
    expect(findings[0].subject).toEqual({ kind: "instruction", id: "ins-4" });
    expect(findings[0].amountAtRisk).toBe(8400);
    expect(findings[0].evidence.sentDay).toBe("2026-09-10");
    expect(findings[0].evidence.outflowsNearby).toBe(0);
  });

  it("leaves an instruction that was never sent out of the mirror report", () => {
    const instructions = [
      makeInstruction("ins-4", 8400, "2026-09-09T15:00:00.000Z"),
    ];

    expect(
      detectBankReconciliation([], instructions, [], [], { now: NOW }),
    ).toEqual([]);
  });

  it("settles an instruction through the complement of its invoice", () => {
    const cfdis = [makeCfdi("cfdi-5", 9500, "2026-09-08T16:00:00.000Z")];
    const instructions = [
      makeInstruction("ins-5", 9500, "2026-09-09T15:00:00.000Z", {
        cfdiUuids: ["cfdi-5"],
        sentAt: "2026-09-10T16:00:00.000Z",
      }),
    ];
    const complements = [
      makeComplement("comp-5", "cfdi-5", 9500, "2026-09-10"),
    ];
    const txs = [makeTx("tx-a", "2026-09-10T18:00:00.000Z", 9500)];

    expect(
      detectBankReconciliation(txs, instructions, cfdis, complements, {
        now: NOW,
      }),
    ).toEqual([]);
  });

  it("skips a dirty row instead of throwing on it", () => {
    const txs = [
      makeTx("tx-sin-fecha", "ayer", 5000),
      makeTx("tx-sin-monto", "2026-09-10T18:00:00.000Z", Number.NaN),
      makeTx("tx-real", "2026-09-10T18:00:00.000Z", 5000),
    ];
    const instructions = [
      makeInstruction("ins-sucia", 5000, "cuando llegue", {
        sentAt: "algun dia",
      }),
    ];

    const findings = detectBankReconciliation(txs, instructions, [], [], {
      now: NOW,
    });

    expect(findings.map((finding) => finding.subject.id)).toEqual(["tx-real"]);
  });

  it("does not touch the caller's arrays", () => {
    const txs = [
      makeTx("tx-b", "2026-09-11T16:00:00.000Z", 18430),
      makeTx("tx-a", "2026-09-10T16:00:00.000Z", 18430),
    ];
    const instructions = [
      makeInstruction("ins-1", 18430, "2026-09-09T15:00:00.000Z"),
    ];
    const before = structuredClone({ txs, instructions });

    detectBankReconciliation(txs, instructions, [], [], { now: NOW });

    expect({ txs, instructions }).toEqual(before);
  });

  it("hands the findings over sorted by money at risk", () => {
    const txs = [
      makeTx("tx-chica", "2026-09-10T18:00:00.000Z", 500),
      makeTx("tx-grande", "2026-09-11T18:00:00.000Z", 90000),
    ];
    const instructions = [
      makeInstruction("ins-4", 8400, "2026-09-09T15:00:00.000Z", {
        sentAt: "2026-09-10T16:00:00.000Z",
      }),
    ];

    const findings = detectBankReconciliation(txs, instructions, [], [], {
      now: NOW,
    });

    expect(findings.map((finding) => finding.amountAtRisk)).toEqual([
      90000, 8400, 500,
    ]);
  });

  it("returns the same findings on a second run over the same data", () => {
    const txs = [
      makeTx("tx-a", "2026-09-10T16:00:00.000Z", 18430),
      makeTx("tx-b", "2026-09-11T16:00:00.000Z", 18430),
      makeTx("tx-c", "2026-09-11T17:00:00.000Z", 777),
    ];
    const instructions = [
      makeInstruction("ins-1", 18430, "2026-09-09T15:00:00.000Z", {
        cfdiUuids: ["cfdi-1"],
      }),
    ];
    const cfdis = [makeCfdi("cfdi-1", 18430, "2026-09-08T16:00:00.000Z")];

    const first = detectBankReconciliation(txs, instructions, cfdis, [], {
      now: NOW,
    });
    const second = detectBankReconciliation(txs, instructions, cfdis, [], {
      now: NOW,
    });

    expect(first).toEqual(second);
    expect(first.map((finding) => finding.evidence.case)).toEqual([
      "cfdi_paid_twice",
      "unbacked_outflow",
    ]);
  });

  it("refuses a clock, a tolerance or a window it cannot use", () => {
    expect(() =>
      detectBankReconciliation([], [], [], [], { now: "hoy" }),
    ).toThrow(RangeError);
    expect(() =>
      detectBankReconciliation([], [], [], [], { now: NOW, tolerance: -1 }),
    ).toThrow(RangeError);
    expect(() =>
      detectBankReconciliation([], [], [], [], { now: NOW, windowDays: 1.5 }),
    ).toThrow(RangeError);
  });
});

describe("applyPaymentSentEvents", () => {
  it("stamps sentAt from the payment_sent event", () => {
    const instructions = [
      makeInstruction("ins-1", 8400, "2026-09-09T15:00:00.000Z"),
    ];
    const events: LedgerEvent[] = [
      {
        type: "payment_sent",
        at: "2026-09-10T16:00:00.000Z",
        instructionId: "ins-1",
        claveRastreo: "SYN2026091012345",
      },
    ];

    expect(applyPaymentSentEvents(instructions, events)[0].sentAt).toBe(
      "2026-09-10T16:00:00.000Z",
    );
  });

  it("keeps the first send when a payment was retried", () => {
    const instructions = [
      makeInstruction("ins-1", 8400, "2026-09-09T15:00:00.000Z"),
    ];
    const events: LedgerEvent[] = [
      {
        type: "payment_sent",
        at: "2026-09-11T16:00:00.000Z",
        instructionId: "ins-1",
      },
      {
        type: "payment_sent",
        at: "2026-09-10T16:00:00.000Z",
        instructionId: "ins-1",
      },
    ];

    expect(applyPaymentSentEvents(instructions, events)[0].sentAt).toBe(
      "2026-09-10T16:00:00.000Z",
    );
  });

  it("leaves an instruction with no event alone and copies rather than mutates", () => {
    const instructions = [
      makeInstruction("ins-1", 8400, "2026-09-09T15:00:00.000Z"),
      makeInstruction("ins-2", 1200, "2026-09-09T15:00:00.000Z"),
    ];
    const events: LedgerEvent[] = [
      {
        type: "payment_sent",
        at: "2026-09-10T16:00:00.000Z",
        instructionId: "ins-2",
      },
      { type: "payment_sent", at: "nunca", instructionId: "ins-1" },
    ];

    const stamped = applyPaymentSentEvents(instructions, events);

    expect(stamped[0].sentAt).toBeUndefined();
    expect(stamped[1].sentAt).toBe("2026-09-10T16:00:00.000Z");
    expect(instructions[1].sentAt).toBeUndefined();
  });
});
