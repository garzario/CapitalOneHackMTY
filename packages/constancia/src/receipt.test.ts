/**
 * The receipt, asserted on what it says and on what it refuses to say.
 *
 * Three of these tests are about honesty rather than layout: a seal nobody checked
 * reads "firma no verificada" and never as valid, the account is four digits and the
 * other fourteen are nowhere in the file, and the page says out loud that it is not a
 * CFDI. Each one is a thing an accountant or a judge would catch in seconds.
 */

import { describe, expect, it } from "bun:test";
import type { LedgerEvent, PaymentReceipt, SealState } from "@hackmty/core";
import { paymentReceipt, receiptFilename } from "./receipt";

const ISSUED_AT = "2026-09-13T02:00:00.000Z";

const COMPANY = {
  rfc: "SYN090615C01",
  legalName: "Distribuidora Sintetica del Norte SA de CV",
};

const LEDGER: LedgerEvent[] = [
  {
    type: "payment_sent",
    at: "2026-09-13T01:00:00.000Z",
    instructionId: "INS-1",
    claveRastreo: "NSS19D6B4B45F944DD2",
    runId: "run-2026-w37",
    rail: "nessie",
    actor: { name: "Lupita Elizondo", role: "clerk" },
  },
];

function receipt(overrides: Partial<PaymentReceipt> = {}): PaymentReceipt {
  return {
    id: "rcp-NSS19D6B4B45F944DD2",
    runId: "run-2026-w37",
    instructionId: "INS-1",
    claveRastreo: "NSS19D6B4B45F944DD2",
    rail: "nessie",
    amount: 42180.5,
    sentAt: "2026-09-13T01:00:00.000Z",
    supplierRfc: "SYN080910HI8",
    beneficiaryName: "Aceros y Laminas del Norte SA de CV",
    beneficiaryAccountLast4: "4613",
    beneficiaryBank: "BBVA MEXICO",
    cfdiUuids: ["a1b2c3d4-1111-2222-3333-444455556666"],
    sealState: "not_checked",
    executedBy: { name: "Lupita Elizondo", role: "clerk" },
    synthetic: true,
    ...overrides,
  };
}

function input(overrides: Partial<PaymentReceipt> = {}) {
  return {
    company: COMPANY,
    issuedAt: ISSUED_AT,
    ledger: LEDGER,
    synthetic: true,
    receipt: receipt(overrides),
  };
}

function text(bytes: Uint8Array): string {
  return new TextDecoder("latin1").decode(bytes);
}

describe("paymentReceipt", () => {
  it("is a real PDF and names the amount, the clave and the run", () => {
    const bytes = paymentReceipt(input());
    const pdf = text(bytes);

    expect(text(bytes.slice(0, 5))).toBe("%PDF-");
    expect(pdf).toContain("(42,180.50) Tj");
    expect(pdf).toContain("(NSS19D6B4B45F944DD2) Tj");
    expect(pdf).toContain("(run-2026-w37) Tj");
    expect(pdf).toContain("(Comprobante de pago) Tj");
  });

  it("prints four digits of the account and never the other fourteen", () => {
    const pdf = text(paymentReceipt(input()));

    expect(pdf).toContain("4613");
    expect(pdf).not.toContain("012180101391764613");
  });

  it("reads firma no verificada when nobody checked the seal", () => {
    const pdf = text(paymentReceipt(input({ sealState: "not_checked" })));

    expect(pdf).toContain("Firma no verificada");
    // And it says why, so the state is never read as an accusation.
    expect(pdf).toContain("no quiere decir que sea invalido");
  });

  it("reads valid only when a certificate actually validated the sello", () => {
    for (const [state, expected] of [
      ["valid", "Verificada contra el certificado de Banxico"],
      ["not_checked", "Firma no verificada"],
      ["invalid", "Invalida"],
    ] as [SealState, string][]) {
      expect(text(paymentReceipt(input({ sealState: state })))).toContain(
        expected,
      );
    }
  });

  /**
   * "We asked" and "the rail says it happened" are two claims, and the page keeps
   * them apart: the acuse is pending until the rail acknowledged the movement.
   */
  it("says the acuse is pending while the rail has not acknowledged it", () => {
    const pdf = text(paymentReceipt(input()));

    expect(pdf).toContain("Pendiente: el riel todavia no confirma");
  });

  it("prints the settlement instant once the rail acknowledged it", () => {
    const pdf = text(
      paymentReceipt(input({ settledAt: "2026-09-13T03:30:05.000Z" })),
    );

    expect(pdf).not.toContain("Pendiente: el riel todavia no confirma");
    expect(pdf).toContain("(2026-09-12 21:30 hrs");
  });

  it("names who executed the run, because nothing here happens without a person", () => {
    const pdf = text(paymentReceipt(input()));

    expect(pdf).toContain("(Lupita Elizondo) Tj");
    expect(pdf).toContain("capturista");
  });

  it("says it is not a CFDI, which is the mistake it is most likely to invite", () => {
    expect(text(paymentReceipt(input()))).toContain("no es un CFDI");
  });

  it("carries the synthetic band and the huella that is not a signature", () => {
    const pdf = text(paymentReceipt(input()));

    expect(pdf).toContain("DATOS SINTETICOS");
    expect(pdf).toContain("(Huella) Tj");
    expect(pdf).toContain("no una firma electronica");
  });

  it("produces the same bytes twice, which is what makes the digest worth printing", () => {
    expect(paymentReceipt(input())).toEqual(paymentReceipt(input()));
  });
});

describe("receiptFilename", () => {
  it("is something a person can find again in a folder", () => {
    expect(receiptFilename("rcp-NSSABC123")).toBe(
      "comprobante-rcp-NSSABC123.pdf",
    );
    expect(receiptFilename("rcp/../etc")).toBe("comprobante-rcp-..-etc.pdf");
  });
});
