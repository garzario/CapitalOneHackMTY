/**
 * The Article 49 Bis half of control 1.
 *
 * What is asserted here is the copy as much as the arithmetic, because the copy is
 * the product: a clerk reading this row has thirty natural days to file a
 * complementary return and has to be told which article, which date and how many
 * days are left. Every RFC is invented and carries the SYN prefix, per ADR-0002.
 */

import { describe, expect, it } from "bun:test";
import type {
  Cfdi,
  ComposeInput,
  PaymentInstruction,
  Sat49BisEntry,
  Sat49BisSweepResult,
  Supplier,
} from "@hackmty/core";
import { runControls } from "./index";
import { sat49BisFinding } from "./sat49bis";

const NOW = "2026-09-12T16:00:00.000Z";
const SUPPLIER_RFC = "SYN050505EE5";

const SUPPLIER: Supplier = {
  rfc: SUPPLIER_RFC,
  legalName: "Refacciones Sinteticas del Golfo SA de CV",
  knownAccounts: [],
  firstInvoiceAt: "2026-02-03T15:00:00.000Z",
  synthetic: true,
};

const INSTRUCTION: PaymentInstruction = {
  id: "ins-49bis-01",
  supplierRfc: SUPPLIER_RFC,
  cfdiUuids: [],
  clabe: "058580000123456715",
  amount: 42000,
  source: "email",
  receivedAt: NOW,
  synthetic: true,
};

/** Published on 28 August 2026, so at NOW there are 14 of the 30 days left. */
const PUBLISHED: Sat49BisEntry = {
  rfc: SUPPLIER_RFC,
  name: SUPPLIER.legalName,
  publishedAt: "2026-08-28",
  oficio: "SIM-500-05-00-00-00-2026-90001 del 7 de agosto de 2026",
  notifiedBy: "buzon_tributario",
  noticeEffectiveAt: "2026-08-07",
  listVersion: "2026-08-28",
};

function anInput(overrides: Partial<ComposeInput> = {}): ComposeInput {
  return {
    instruction: INSTRUCTION,
    supplier: SUPPLIER,
    cfdis: [],
    complements: [],
    satEntries: [],
    bankMirror: [],
    now: NOW,
    ...overrides,
  };
}

function finding(input: ComposeInput) {
  return runControls(input).findings.find((row) =>
    row.id.startsWith("sat49bis:"),
  );
}

describe("the 49 Bis finding", () => {
  it("names the article, the publication date and the days left", () => {
    const row = finding(anInput({ sat49BisEntries: [PUBLISHED] }));

    expect(row?.explanation).toContain("articulo 49 Bis del CFF");
    expect(row?.explanation).toContain("2026-08-28");
    expect(row?.explanation).toContain("Quedan 14 dias naturales");
    expect(row?.explanation).toContain("a mas tardar el 2026-09-26");
    // The consequence of missing the window is the company's own seal, and that
    // is the sentence that makes a clerk act on the row.
    expect(row?.explanation).toContain("17-H Bis, fraccion XIV");
  });

  it("is comprobable and critical, because the resolution is already final", () => {
    const row = finding(anInput({ sat49BisEntries: [PUBLISHED] }));

    expect(row?.severity).toBe("critical");
    expect(row?.state).toBe("comprobable");
    expect(row?.detector).toBe("sat_69b");
    expect(row?.subject).toEqual({ kind: "supplier", id: SUPPLIER_RFC });
    expect(row?.amountAtRisk).toBe(INSTRUCTION.amount);
  });

  it("carries the evidence a screen labels the row from", () => {
    const row = finding(anInput({ sat49BisEntries: [PUBLISHED] }));

    expect(row?.evidence).toMatchObject({
      article: "49 Bis",
      rfc: SUPPLIER_RFC,
      publishedAt: "2026-08-28",
      oficio: PUBLISHED.oficio,
      correctionDays: 30,
      correctBy: "2026-09-26",
      daysLeft: 14,
      windowOpen: true,
      notifiedBy: "buzon_tributario",
      publicationsHeld: 1,
    });
  });

  it("says the window has closed once it has, rather than counting down", () => {
    const row = finding(
      anInput({
        sat49BisEntries: [{ ...PUBLISHED, publishedAt: "2026-07-10" }],
      }),
    );

    expect(row?.evidence.windowOpen).toBe(false);
    expect(row?.explanation).toContain("vencio el 2026-08-08");
  });

  it("says nothing about a supplier on no publication we hold", () => {
    const report = runControls(anInput({ sat49BisEntries: [] }));

    // The control still ran. "No aparece en ninguna publicacion" is an answer,
    // and whether the list is loaded at all is the lookup endpoint's question.
    expect(report.ran).toContain("sat_69b");
    expect(finding(anInput({ sat49BisEntries: [] }))).toBeUndefined();
    expect(finding(anInput())).toBeUndefined();
  });

  it("adds the retroactive exposure of invoices already paid and deducted", () => {
    const paid: Cfdi = {
      uuid: "C0000010-0000-4000-8000-000000000010",
      issuedAt: "2026-07-06T15:00:00.000Z",
      issuerRfc: SUPPLIER_RFC,
      issuerName: SUPPLIER.legalName,
      receiverRfc: "SYN900101MTY",
      subtotal: 40000,
      iva: 6400,
      total: 46400,
      paymentMethod: "PUE",
      synthetic: true,
    };
    const sweep: Sat49BisSweepResult = {
      listVersion: "2026-08-28",
      publishedAt: "2026-08-28",
      correctBy: "2026-09-26",
      newlyListed: [
        {
          supplier: SUPPLIER,
          entry: PUBLISHED,
          paidCfdis: [paid],
          deductedBase: 40000,
          isrExposure: 12000,
          ivaExposure: 6400,
        },
      ],
      totalExposure: 18400,
    };

    const row = finding(
      anInput({ sat49BisEntries: [PUBLISHED], sweep49Bis: sweep }),
    );

    // The pesos about to leave plus the deductions the publication voids. Two
    // different sums of money, which is why they add rather than compete.
    expect(row?.amountAtRisk).toBe(INSTRUCTION.amount + 18400);
    expect(row?.evidence.retroactiveExposure).toBe(18400);
    expect(row?.evidence.paidCfdis).toBe(1);
    expect(row?.explanation).toContain("1 factura ya pagada");
  });

  it("holds the finding together with the 69-B one when both lists name the supplier", () => {
    const report = runControls(
      anInput({
        sat49BisEntries: [PUBLISHED],
        satEntries: [
          {
            rfc: SUPPLIER_RFC,
            name: SUPPLIER.legalName,
            status: "definitivo",
            publishedAt: "2026-06-27",
            listVersion: "2026-06-27",
          },
        ],
      }),
    );

    const sat = report.findings.filter((row) => row.detector === "sat_69b");

    // Two statutes voided the same invoices on two different clocks. Collapsing
    // them into one row would hide one of the two complementary returns the
    // clerk has to file.
    expect(sat).toHaveLength(2);
    expect(sat.map((row) => row.id.split(":")[0]).sort()).toEqual([
      "sat49bis",
      "sat69b",
    ]);
    expect(report.ran).toContain("sat_69b");
  });

  it("reports without a window when the publication date is unreadable", () => {
    // A malformed date must not lose the row: the taxpayer is published either
    // way, and the finding says the plazo is thirty days without inventing one.
    const row = sat49BisFinding({
      entries: [{ ...PUBLISHED, publishedAt: "28/08/2026" }],
      supplierRfc: SUPPLIER_RFC,
      instructionAmount: INSTRUCTION.amount,
      now: NOW,
    });

    expect(row?.evidence.correctBy).toBeUndefined();
    expect(row?.explanation).toContain("30 dias naturales");
  });
});
