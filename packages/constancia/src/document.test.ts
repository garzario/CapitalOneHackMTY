import { describe, expect, it } from "bun:test";
import type {
  Cfdi,
  Finding,
  LedgerEvent,
  PaymentInstruction,
  Supplier,
  SweepResult,
} from "@hackmty/core";
import {
  constanciaFilename,
  type RunConstanciaItem,
  runConstancia,
  sweepConstancia,
} from "./document";

const ISSUED_AT = "2026-09-12T15:00:00.000Z";

const COMPANY = {
  rfc: "SYN090615C01",
  legalName: "Distribuidora Sintetica del Norte SA de CV",
};

const LEDGER: LedgerEvent[] = [
  {
    type: "payment_sent",
    at: "2026-09-08T15:00:00.000Z",
    instructionId: "ins-1",
  },
];

function supplier(rfc: string, legalName: string): Supplier {
  return {
    rfc,
    legalName,
    knownAccounts: [],
    firstInvoiceAt: "2024-01-01T15:00:00.000Z",
    synthetic: true,
  };
}

function cfdi(uuid: string, subtotal: number): Cfdi {
  return {
    uuid,
    issuedAt: "2026-08-01T15:00:00.000Z",
    issuerRfc: "SYN980101S01",
    issuerName: "Aceros y Laminas del Norte SA de CV",
    receiverRfc: COMPANY.rfc,
    subtotal,
    iva: subtotal * 0.16,
    total: subtotal * 1.16,
    paymentMethod: "PPD",
    synthetic: true,
  };
}

function sweep(rows: number): SweepResult {
  return {
    listVersion: "2026-09-04",
    newlyListed: Array.from({ length: rows }, (_, index) => ({
      supplier: supplier(
        `SYN98010${index % 10}S0${index % 10}`,
        `Proveedor Sintetico Numero ${index}`,
      ),
      status: "definitivo" as const,
      paidCfdis: [cfdi(`uuid-${index}`, 100000)],
      deductedBase: 100000,
      isrExposure: 30000,
      ivaExposure: 16000,
    })),
    totalExposure: rows * 46000,
  };
}

function sweepInput(rows: number) {
  return {
    company: COMPANY,
    issuedAt: ISSUED_AT,
    ledger: LEDGER,
    synthetic: true,
    sweep: sweep(rows),
    publishedAt: "2026-09-04",
    source: "DOF 2026-09-04",
    suppliersChecked: 12,
  };
}

function text(bytes: Uint8Array): string {
  return new TextDecoder("latin1").decode(bytes);
}

function pageCount(bytes: Uint8Array): number {
  return Number(/\/Type \/Pages \/Count (\d+)/.exec(text(bytes))?.[1]);
}

describe("sweepConstancia", () => {
  it("names the version, the DOF date and how many suppliers were cotejados", () => {
    const pdf = text(sweepConstancia(sweepInput(1)));

    expect(pdf).toContain("(2026-09-04) Tj");
    expect(pdf).toContain("(Publicacion en el DOF) Tj");
    // The denominator is the point: one supplier listed out of how many.
    expect(pdf).toContain("(Proveedores cotejados) Tj");
    expect(pdf).toContain("(12) Tj");
  });

  it("says so plainly when nothing was found, instead of printing an empty table", () => {
    const pdf = text(sweepConstancia(sweepInput(0)));

    expect(pdf).toContain("Ninguno de los proveedores cotejados");
    expect(pdf).not.toContain("(Base deducida) Tj");
  });

  it("carries the synthetic band when the figures are generated", () => {
    expect(text(sweepConstancia(sweepInput(1)))).toContain("DATOS SINTETICOS");
  });

  it("leaves the band off when the figures are not", () => {
    const pdf = text(sweepConstancia({ ...sweepInput(1), synthetic: false }));

    expect(pdf).not.toContain("DATOS SINTETICOS");
  });

  it("prints the digest and calls it a huella, never a firma", () => {
    const pdf = text(sweepConstancia(sweepInput(1)));

    expect(pdf).toContain("(Huella) Tj");
    expect(pdf).toContain("no una firma electronica");
  });

  it("flows onto more pages rather than off the bottom of one", () => {
    expect(pageCount(sweepConstancia(sweepInput(80)))).toBeGreaterThan(1);
  });

  it("produces the same bytes twice, which is what makes the digest worth printing", () => {
    expect(sweepConstancia(sweepInput(3))).toEqual(
      sweepConstancia(sweepInput(3)),
    );
  });
});

function instruction(id: string, amount: number): PaymentInstruction {
  return {
    id,
    supplierRfc: "SYN980101S01",
    cfdiUuids: [],
    clabe: "072180100000000007",
    amount,
    source: "email",
    receivedAt: "2026-09-08T15:00:00.000Z",
    synthetic: true,
  };
}

function finding(): Finding {
  return {
    id: "f-1",
    detector: "sat_69b",
    severity: "critical",
    state: "comprobable",
    subject: { kind: "instruction", id: "ins-1" },
    amountAtRisk: 214600,
    explanation: "El proveedor aparece como definitivo en la lista del 69-B.",
    evidence: {},
    createdAt: "2026-09-08T15:00:00.000Z",
  };
}

function runInput(items: RunConstanciaItem[]) {
  return {
    company: COMPANY,
    issuedAt: ISSUED_AT,
    ledger: LEDGER,
    synthetic: true,
    runId: "run-2026-w37",
    weekOf: "2026-09-07",
    items,
  };
}

describe("runConstancia", () => {
  const held: RunConstanciaItem = {
    instruction: instruction("ins-1", 214600),
    supplier: supplier("SYN980101S01", "Aceros y Laminas del Norte SA de CV"),
    decision: {
      instructionId: "ins-1",
      action: "hold",
      expectedLoss: 128760,
      delayCostPerDay: 0,
      findings: [finding()],
      decidedAt: "2026-09-08T15:05:00.000Z",
    },
    findings: [finding()],
  };

  const clean: RunConstanciaItem = {
    instruction: instruction("ins-2", 31320),
    supplier: supplier(
      "SYN990202S02",
      "Maquinados Industriales Regios SA de CV",
    ),
    decision: {
      instructionId: "ins-2",
      action: "release",
      expectedLoss: 0,
      delayCostPerDay: 0,
      findings: [],
      decidedAt: "2026-09-08T15:06:00.000Z",
    },
    findings: [],
  };

  it("counts the resolutions and the amount reviewed", () => {
    const pdf = text(runConstancia(runInput([held, clean])));

    expect(pdf).toContain("1 detenidas, 0 por verificar, 1 liberadas");
    expect(pdf).toContain("(245,920.00) Tj");
  });

  it("writes the explanation of every finding, in the register a clerk reads", () => {
    const pdf = text(runConstancia(runInput([held, clean])));

    expect(pdf).toContain("definitivo en la lista del 69-B");
  });

  it("says a clean run is clean, rather than leaving the section empty", () => {
    const pdf = text(runConstancia(runInput([clean])));

    expect(pdf).toContain(
      "Ninguna instruccion de esta corrida genero hallazgos",
    );
  });

  it("handles an instruction nobody has resolved yet", () => {
    const pending: RunConstanciaItem = {
      instruction: instruction("ins-3", 1000),
      findings: [],
    };
    const pdf = text(runConstancia(runInput([pending])));

    expect(pdf).toContain("(Sin resolver) Tj");
    // No supplier row, so the RFC stands in. A name we do not hold is not a
    // name we invent, on the one document that gets filed.
    expect(pdf).toContain("(SYN980101S01) Tj");
  });

  it("renders an empty run without throwing", () => {
    const pdf = text(runConstancia(runInput([])));

    expect(pdf).toContain("La corrida no contiene instrucciones");
  });

  /**
   * Since ADR-0008 the run leaves through `packages/rail`, so a constancia that said
   * what was decided and not what left would be half the answer to the only question
   * the SAT asks about a payment.
   */
  it("says nothing has left when the run has not been executed", () => {
    const pdf = text(runConstancia(runInput([held, clean])));

    expect(pdf).toContain("(Lo que salio del banco) Tj");
    expect(pdf).toContain("Todavia no sale nada de esta corrida");
    expect(pdf).not.toContain("(Clave de rastreo) Tj");
  });

  it("lists every line that left, with the clave de rastreo the CEP is filed under", () => {
    const pdf = text(
      runConstancia({
        ...runInput([held, clean]),
        execution: {
          runId: "run-2026-w37",
          lines: [
            {
              instructionId: "ins-2",
              state: "settled",
              amount: 31320,
              claveRastreo: "NSSABC123",
              rail: "nessie",
              sentAt: "2026-09-12T21:00:00.000Z",
              receiptId: "rcp-NSSABC123",
            },
            {
              instructionId: "ins-1",
              state: "cancelled",
              amount: 214600,
              reason:
                "El proveedor esta en la lista definitiva del SAT y nadie firmo una liberacion.",
            },
          ],
          totals: {
            lines: 2,
            queued: 0,
            sent: 0,
            settled: 1,
            failed: 0,
            cancelled: 1,
            amount: 245920,
            queuedAmount: 0,
            sentAmount: 0,
            settledAmount: 31320,
            failedAmount: 0,
            cancelledAmount: 214600,
          },
          startedBy: { name: "Lupita Elizondo", role: "clerk" },
          startedAt: "2026-09-12T21:00:00.000Z",
          updatedAt: "2026-09-12T21:00:01.000Z",
        },
      }),
    );

    expect(pdf).toContain("(Clave de rastreo) Tj");
    expect(pdf).toContain("(NSSABC123) Tj");
    expect(pdf).toContain(
      "1 confirmadas, 0 enviadas, 0 rechazadas, 1 canceladas",
    );
    // The money that left, and not the whole run.
    expect(pdf).toContain("(31,320.00) Tj");
    // Who pressed the button, because nothing here happens without a person.
    expect(pdf).toContain("(Lupita Elizondo \\(responsable de pagos\\)) Tj");
    // And the line that did not leave carries the reason it did not.
    expect(pdf).toContain("(Lineas que no salieron) Tj");
    expect(pdf).toContain("definitiva");
    // Sent and settled are never collapsed, and the page says which is which.
    expect(pdf).toContain("Confirmado quiere decir que el riel");
  });
});

describe("constanciaFilename", () => {
  it("keeps the id readable and strips anything a filesystem would not take", () => {
    expect(constanciaFilename("sweep", "2026-09-04")).toBe(
      "constancia-sweep-2026-09-04.pdf",
    );
    expect(constanciaFilename("run", "run/2026 w37")).toBe(
      "constancia-run-run-2026-w37.pdf",
    );
  });
});
