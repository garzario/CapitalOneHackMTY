/**
 * The mappers are the part of the database layer a judge can read without a
 * database, and the part where a bug is quietest: a float that drifted, an
 * optional field that came back as `undefined` instead of absent, an instant
 * that shifted a day. Every case here names one of those.
 */

import { describe, expect, it } from "bun:test";
import type {
  Cfdi,
  Finding,
  LedgerEvent,
  PaymentInstruction,
  Supplier,
  SupplierBehaviourInput,
} from "@hackmty/core";
import {
  beneficiaryFromRow,
  cfdiFromRow,
  cfdiToRow,
  complementFromRow,
  complementToRow,
  decisionFromRow,
  decodeBase64,
  encodeBase64,
  findingFromRow,
  findingToRow,
  instructionFromRow,
  instructionToRow,
  ledgerEventFromRow,
  ledgerEventToRow,
  ledgerTxFromRow,
  type SupplierHistory,
  satEntryFromRow,
  satEntryToRow,
  subjectIdForStorage,
  supplierFromRow,
  supplierToRow,
  supplierWeekFromRow,
  toInstant,
  toMoney,
  uuidArrayLiteral,
} from "./rows";

const UUID = "a17e5b83-9c2f-4d60-b4a1-6e8c3f0d9b22";
const OTHER_UUID = "b5d31c07-72ae-4f95-8a3e-1c6b40d8e7f5";

describe("toInstant", () => {
  it("formats a Date the driver returned as UTC ISO 8601", () => {
    expect(toInstant(new Date("2026-09-10T16:45:00.000Z"))).toBe(
      "2026-09-10T16:45:00.000Z",
    );
  });

  it("normalises the offset json_agg renders to UTC", () => {
    // Monterrey is UTC minus 6 all year: the same instant, written two ways.
    expect(toInstant("2026-09-10T10:45:00-06:00")).toBe(
      "2026-09-10T16:45:00.000Z",
    );
    expect(toInstant("2026-09-10T16:45:00+00:00")).toBe(
      "2026-09-10T16:45:00.000Z",
    );
  });

  it("refuses text that is not an instant", () => {
    expect(() => toInstant("yesterday")).toThrow(RangeError);
  });
});

describe("toMoney", () => {
  it("parses the numeric text the driver returns to the cent", () => {
    expect(toMoney("184300.00")).toBe(184300);
    expect(toMoney("96450.80")).toBe(96450.8);
    expect(toMoney("0.01")).toBe(0.01);
  });

  it("accepts the number json_agg renders for the same column", () => {
    expect(toMoney(28740.5)).toBe(28740.5);
  });

  it("refuses text that is not an amount", () => {
    expect(() => toMoney("mucho")).toThrow(RangeError);
  });
});

describe("base64 for the CEP bytes", () => {
  const xml =
    '<SPEI_Tercero Nombre="DISTRIBUIDORA SINTÉTICA DEL PONIENTE SA" Ñ="ñ">\n  <Ordenante />\n</SPEI_Tercero>';

  it("round trips accents and newlines byte for byte", () => {
    expect(decodeBase64(encodeBase64(xml))).toBe(xml);
  });

  it("tolerates the 76-column wrapping Postgres encode() produces", () => {
    const wrapped = encodeBase64(xml).replace(/(.{76})/g, "$1\n");
    expect(decodeBase64(wrapped)).toBe(xml);
  });

  it("refuses bytes that are not UTF-8, rather than substituting characters", () => {
    // 0xff is never valid in UTF-8. Substituting U+FFFD would hand the signature
    // check a document Banxico never signed.
    expect(() => decodeBase64(btoa("ÿ"))).toThrow();
  });

  it("encodes a document longer than one chunk", () => {
    const long = "<a>".repeat(50_000);
    expect(decodeBase64(encodeBase64(long))).toBe(long);
  });
});

describe("supplier rows", () => {
  const supplier: Supplier = {
    rfc: "SYN010101AAA",
    legalName: "Aceros y Perfiles del Norte SA de CV",
    knownAccounts: [
      {
        clabe: "058580000123456715",
        establishedBy: "payment_complement",
        establishedAt: "2026-08-24T17:30:00.000Z",
        timesPaid: 7,
      },
    ],
    firstInvoiceAt: "2025-02-17T16:00:00.000Z",
    delayCostPerDay: 1800,
    synthetic: true,
  };

  it("maps the row the aggregate query returns back to the domain object", () => {
    const mapped = supplierFromRow({
      rfc: supplier.rfc,
      legal_name: supplier.legalName,
      first_invoice_at: new Date(supplier.firstInvoiceAt),
      delay_cost_per_day: "1800.00",
      synthetic: true,
      accounts: [
        {
          clabe: "058580000123456715",
          established_by: "payment_complement",
          established_at: "2026-08-24T17:30:00+00:00",
          times_paid: 7,
        },
      ],
    });

    expect(mapped).toEqual(supplier);
  });

  it("leaves delayCostPerDay absent, not undefined, when the column is null", () => {
    const mapped = supplierFromRow({
      rfc: "SYN020202BBB",
      legal_name: "Empaques Regios SA de CV",
      first_invoice_at: new Date("2024-11-05T15:20:00.000Z"),
      delay_cost_per_day: null,
      synthetic: true,
      accounts: null,
    });

    expect("delayCostPerDay" in mapped).toBe(false);
    expect(mapped.knownAccounts).toEqual([]);
    expect(JSON.parse(JSON.stringify(mapped))).toEqual(mapped);
  });

  it("writes null for an unpriced relationship", () => {
    const { delayCostPerDay: _unused, ...unpriced } = supplier;
    expect(supplierToRow(unpriced).delay_cost_per_day).toBeNull();
    expect(supplierToRow(supplier).delay_cost_per_day).toBe(1800);
  });
});

describe("cfdi and complement rows", () => {
  const cfdi: Cfdi = {
    uuid: UUID,
    serie: "A",
    folio: "1187",
    issuedAt: "2026-09-03T15:12:00.000Z",
    issuerRfc: "SYN010101AAA",
    issuerName: "Aceros y Perfiles del Norte SA de CV",
    receiverRfc: "SYN900101MTY",
    subtotal: 158879.31,
    iva: 25420.69,
    total: 184300,
    paymentMethod: "PPD",
    paymentForm: "03",
    synthetic: true,
  };

  it("round trips a CFDI through its row with the money intact", () => {
    const row = cfdiToRow(cfdi);
    expect(row.subtotal + row.iva).toBeCloseTo(row.total, 2);
    expect(
      cfdiFromRow({
        ...row,
        issued_at: new Date(row.issued_at),
        subtotal: "158879.31",
        iva: "25420.69",
        total: "184300.00",
      }),
    ).toEqual(cfdi);
  });

  it("keeps a missing serie and folio absent, which the duplicate detector relies on", () => {
    const { serie: _serie, folio: _folio, paymentForm: _form, ...bare } = cfdi;
    const row = cfdiToRow(bare);
    expect(row.serie).toBeNull();
    expect(row.folio).toBeNull();
    const back = cfdiFromRow({ ...row, issued_at: new Date(row.issued_at) });
    expect("serie" in back).toBe(false);
    expect("folio" in back).toBe(false);
    expect(back).toEqual(bare);
  });

  it("round trips a complement including the fields 0005 added", () => {
    const complement = {
      uuid: OTHER_UUID,
      relatedCfdiUuid: UUID,
      paidAt: "2026-09-04T17:00:00.000Z",
      paidAmount: 150000,
      paymentTotal: 240000,
      operationNumber: "SYNSPEI20260904001",
      beneficiaryAccount: "014580000777888993",
      beneficiaryBankRfc: "SYN014101BAN",
      synthetic: true,
    };
    const row = complementToRow(complement);
    expect(row.payment_total).toBe(240000);
    expect(
      complementFromRow({
        ...row,
        paid_at: new Date(row.paid_at),
        paid_amount: "150000.00",
        payment_total: "240000.00",
      }),
    ).toEqual(complement);
  });
});

describe("instruction rows", () => {
  const instruction: PaymentInstruction = {
    id: "ins-2026w37-12",
    supplierRfc: "SYN060606FFF",
    cfdiUuids: [UUID, OTHER_UUID],
    clabe: "021180000555666775",
    amount: 119800,
    source: "pdf",
    receivedAt: "2026-09-11T15:55:00.000Z",
    imageRef: "synthetic/instruction-12.png",
    ocrConfidence: 0.82,
    synthetic: true,
  };

  it("writes the CFDI list as a Postgres array literal", () => {
    expect(uuidArrayLiteral([UUID, OTHER_UUID])).toBe(
      `{${UUID},${OTHER_UUID}}`,
    );
    expect(uuidArrayLiteral([])).toBe("{}");
  });

  it("refuses to build an array literal out of something that is not a uuid", () => {
    expect(() => uuidArrayLiteral(["1,2}"])).toThrow(RangeError);
  });

  it("round trips through the row, keeping text under message_text", () => {
    const withText = { ...instruction, text: "Cuenta nueva, favor de pagar." };
    const row = instructionToRow(withText);
    expect(row.message_text).toBe("Cuenta nueva, favor de pagar.");
    expect(row.audio_ref).toBeNull();
    expect(
      instructionFromRow({
        ...row,
        cfdi_uuids: [UUID, OTHER_UUID],
        amount: "119800.00",
        received_at: new Date(row.received_at),
        ocr_confidence: "0.820",
      }),
    ).toEqual(withText);
  });

  it("keeps sentAt absent until a payment_sent event projects it", () => {
    const row = instructionToRow(instruction);
    const back = instructionFromRow({
      ...row,
      cfdi_uuids: [],
      received_at: new Date(row.received_at),
    });
    expect("sentAt" in back).toBe(false);
    expect("audioRef" in back).toBe(false);
    expect("text" in back).toBe(false);
  });

  it("refuses a row with no supplier rather than inventing an RFC", () => {
    const row = instructionToRow(instruction);
    expect(() =>
      instructionFromRow({
        ...row,
        supplier_rfc: null,
        cfdi_uuids: [],
        received_at: new Date(row.received_at),
      }),
    ).toThrow(/supplier_rfc/);
  });
});

describe("finding and decision rows", () => {
  const finding: Finding = {
    id: "fnd-0006",
    detector: "bank_reconciliation",
    severity: "warning",
    state: "requiere_verificacion",
    subject: { kind: "ledger_tx", id: "tx-2026w37-06" },
    amountAtRisk: 18400,
    explanation: "Salida bancaria sin documento.",
    evidence: { outflowAmount: 18400, matchedDocuments: 0, unbacked: true },
    createdAt: "2026-09-11T16:20:00.000Z",
  };

  it("keeps the evidence chips as they were: numbers, booleans and strings", () => {
    const row = findingToRow(finding);
    expect(row.evidence).toEqual(finding.evidence);
    expect(row.evidence).not.toBe(finding.evidence);
    expect(
      findingFromRow({
        ...row,
        amount_at_risk: "18400.00",
        created_at: new Date(row.created_at),
      }),
    ).toEqual(finding);
  });

  it("carries ledger_tx as a subject, the kind 0003 refused", () => {
    expect(findingToRow(finding).subject_kind).toBe("ledger_tx");
  });

  it("stores a CFDI subject id lowercase, the form the uuid column compares in", () => {
    // packages/core uppercases the folio fiscal the way the SAT prints it. The
    // uuid column renders lowercase, so the subject id is stored to match it.
    const onCfdi: Finding = {
      ...finding,
      detector: "duplicate_invoice",
      subject: { kind: "cfdi", id: UUID.toUpperCase() },
    };
    expect(findingToRow(onCfdi).subject_id).toBe(UUID);
    // Every other kind is plain text on both sides and is left alone.
    expect(findingToRow(finding).subject_id).toBe("tx-2026w37-06");
    expect(subjectIdForStorage("instruction", "INS-Abc")).toBe("INS-Abc");
  });

  it("rehydrates a decision with the findings json_agg attached to it", () => {
    const decision = decisionFromRow({
      id: "42",
      instruction_id: "ins-2026w37-08",
      action: "verify",
      expected_loss: "43300.00",
      delay_cost_per_day: "665.00",
      decided_at: new Date("2026-09-11T16:30:00.000Z"),
      decided_by: null,
      reason: null,
      findings: [
        {
          id: finding.id,
          detector: finding.detector,
          severity: finding.severity,
          state: finding.state,
          subject_kind: "ledger_tx",
          subject_id: finding.subject.id,
          amount_at_risk: 18400,
          explanation: finding.explanation,
          evidence: finding.evidence,
          created_at: "2026-09-11T16:20:00+00:00",
        },
      ],
    });

    expect(decision).toEqual({
      instructionId: "ins-2026w37-08",
      action: "verify",
      expectedLoss: 43300,
      delayCostPerDay: 665,
      findings: [finding],
      decidedAt: "2026-09-11T16:30:00.000Z",
    });
    // Nobody has signed it yet, so the key is absent, not null.
    expect("decidedBy" in decision).toBe(false);
  });
});

describe("SAT rows", () => {
  it("keeps a DOF date as a calendar day in both directions", () => {
    const entry = {
      rfc: "SYN020202BBB",
      name: "Empaques Regios SA de CV",
      status: "presunto" as const,
      publishedAt: "2026-08-29",
      listVersion: "2026-08-29",
    };
    const row = satEntryToRow(entry);
    expect(row.published_at).toBe("2026-08-29");
    expect(satEntryFromRow(row)).toEqual(entry);
  });

  it("cuts an instant a feed sent for the publication down to its day", () => {
    expect(
      satEntryToRow({
        rfc: "SYN020202BBB",
        name: "x",
        status: "definitivo",
        publishedAt: "2026-08-29T12:00:00.000Z",
        listVersion: "2026-08-29",
      }).published_at,
    ).toBe("2026-08-29");
  });
});

describe("verified beneficiary rows", () => {
  it("rebuilds the CEP from the columns and the bytes", () => {
    const xml =
      '<SPEI_Tercero claveRastreo="SYNCEP20260910001" sintetico="true" />';
    const record = beneficiaryFromRow({
      supplier_rfc: "SYN070707GGG",
      clabe: "030580000999000119",
      clave_rastreo: "SYNCEP20260910001",
      transferred_at: new Date("2026-09-10T16:44:12.000Z"),
      amount: "0.01",
      sender_name: "Ensambles del Poniente SA de CV",
      sender_bank: "058",
      sender_account: null,
      beneficiary_name: "Consultoria Fiscal Anahuac SC",
      beneficiary_bank: "030",
      beneficiary_rfc: "NA",
      concepto: null,
      numero_certificado: "00001000000504465028",
      signature_valid: false,
      signature_reason: "unconfirmed_scheme",
      name_match: "match",
      cep_xml_b64: encodeBase64(xml),
      verified_at: new Date("2026-09-10T16:45:00.000Z"),
      synthetic: true,
    });

    expect(record.cep.xml).toBe(xml);
    expect(record.cep.beneficiaryAccount).toBe(record.clabe);
    expect(record.cep.signatureReason).toBe("unconfirmed_scheme");
    expect(record.cep.beneficiaryRfc).toBe("NA");
    expect("senderAccount" in record.cep).toBe(false);
    expect("concepto" in record.cep).toBe(false);
    expect(record.verifiedAt).toBe("2026-09-10T16:45:00.000Z");
    expect(record.nameMatch).toBe("match");
  });
});

describe("ledger event rows", () => {
  const event: LedgerEvent = {
    type: "verification_call",
    at: "2026-09-12T03:00:00.000Z",
    instructionId: "ins-2026w37-01",
    supplierRfc: "SYN010101AAA",
    outcome: "unclear",
    clabeLast4: "6812",
    transcript: [{ role: "supplier", text: "Dejeme revisar y le marco." }],
    manual: false,
  };

  it("stores the discriminant and the instant once, as columns", () => {
    const row = ledgerEventToRow(event);
    expect(row.type).toBe("verification_call");
    expect(row.at).toBe(event.at);
    expect("type" in row.payload).toBe(false);
    expect("at" in row.payload).toBe(false);
  });

  it("puts them back so the union round trips", () => {
    const row = ledgerEventToRow(event);
    expect(
      ledgerEventFromRow({
        at: new Date(row.at),
        type: row.type,
        payload: row.payload,
      }),
    ).toEqual(event);
  });
});

describe("bank mirror rows", () => {
  it("maps a ledger_tx row into the one shape the engine reads", () => {
    const tx = ledgerTxFromRow({
      id: "8f0f6c56-1b0c-4bd4-9d6c-3a1e8e0b2c11",
      account_id: "acc-synthetic-mtx",
      occurred_at: new Date("2026-09-10T06:00:00.000Z"),
      amount: "18400.00",
      direction: "debit",
      merchant_id: null,
      category: null,
      source: "seed",
      raw: { day: "2026-09-10", synthetic: true },
    });

    expect(tx.amount).toBe(18400);
    expect(tx.occurredAt).toBe("2026-09-10T06:00:00.000Z");
    expect("merchantId" in tx).toBe(false);
    expect("category" in tx).toBe(false);
    expect(tx.raw).toEqual({ day: "2026-09-10", synthetic: true });
  });
});

describe("supplierWeekFromRow", () => {
  it("reads the plain view and the continuous aggregate the same way", () => {
    // The plain view hands a timestamptz back as a Date and numerics as text.
    // The continuous aggregate returns the same five columns, so one mapper
    // covers both paths and neither of them gets a private shape.
    const week = supplierWeekFromRow({
      supplier_rfc: "SYN990202S02",
      week: new Date("2026-08-31T00:00:00.000Z"),
      invoices: "3",
      outflow: "184200.50",
      max_invoice: "98000.00",
    });

    expect(week).toEqual({
      week: "2026-08-31T00:00:00.000Z",
      invoices: 3,
      outflow: 184200.5,
      maxInvoice: 98000,
    });
  });

  it("normalises a bucket the driver rendered with an offset", () => {
    // Monterrey is UTC minus 6 all year. The bucket is cut in UTC on both
    // paths, so the same instant written two ways has to land on one string.
    const week = supplierWeekFromRow({
      supplier_rfc: "SYN990202S02",
      week: "2026-08-30T18:00:00-06:00",
      invoices: 2,
      outflow: 3500.11,
      max_invoice: 2500.1,
    });

    expect(week.week).toBe("2026-08-31T00:00:00.000Z");
    expect(week.invoices).toBe(2);
    // 1000.005 rounded into numeric(14,2) is 1000.01, and the sum is exact.
    expect(week.outflow).toBe(3500.11);
  });

  it("refuses a count that is not whole", () => {
    // count(*) is a bigint. A fraction here means the column moved and the
    // series is being read off something that is not the count.
    expect(() =>
      supplierWeekFromRow({
        supplier_rfc: "SYN990202S02",
        week: "2026-08-31T00:00:00.000Z",
        invoices: "2.5",
        outflow: "100.00",
        max_invoice: "100.00",
      }),
    ).toThrow(RangeError);
  });

  it("refuses an outflow that is not a number", () => {
    expect(() =>
      supplierWeekFromRow({
        supplier_rfc: "SYN990202S02",
        week: "2026-08-31T00:00:00.000Z",
        invoices: "1",
        outflow: "NaN",
        max_invoice: "1.00",
      }),
    ).toThrow(RangeError);
  });
});

describe("SupplierHistory", () => {
  it("is the input the behaviour detector consumes, with no reshaping", () => {
    // The assertion that matters is the type annotation: this only compiles
    // while SupplierHistory stays assignable to SupplierBehaviourInput, so a
    // field renamed on either side fails `bun run typecheck` instead of
    // failing at 03:00 against a database nobody wants to be debugging.
    const history: SupplierHistory = {
      supplier: {
        rfc: "SYN990202S02",
        legalName: "Maquinados Industriales Regios SA de CV",
        knownAccounts: [],
        firstInvoiceAt: "2026-01-05T15:00:00.000Z",
        synthetic: true,
      },
      cfdis: [],
      now: "2026-09-10T22:00:00.000Z",
      weeks: [],
    };
    const detectorInput: SupplierBehaviourInput = history;

    expect(detectorInput.supplier.rfc).toBe("SYN990202S02");
    expect(detectorInput.now).toBe(history.now);
    expect(detectorInput.cfdis).toBe(history.cfdis);
  });
});
