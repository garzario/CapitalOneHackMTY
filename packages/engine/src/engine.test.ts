/**
 * The test this package exists for.
 *
 * Issue #106 is a bug about silence: the previous registry discovered detectors
 * by dynamic import, guessed their argument tuples, called none of them and
 * reported an empty payment run while every test stayed green. So the assertion
 * that matters here is not "a detector found something", it is that all six
 * controls are accounted for on a real instruction, that the ones that ran
 * really ran, and that every one that did not says what was missing.
 *
 * The fixture is one payment instruction built so that four of the six controls
 * have something true to say and the other two are honestly silent. Every RFC is
 * invented and carries the SYN prefix, per ADR-0002.
 */

import { describe, expect, it } from "bun:test";
import type {
  Cep,
  Cfdi,
  ComposeInput,
  Detector,
  LedgerTx,
  PaymentComplement,
  PaymentInstruction,
  SatListEntry,
  Supplier,
  SweepResult,
} from "@hackmty/core";
import { clabeCheckDigit } from "@hackmty/core";
import { CEPTINELA_DETECTORS, runControls, sweptExposureFor } from "./index";

const NOW = "2026-09-11T16:00:00.000Z";
const SUPPLIER_RFC = "SYN020202BBB";

/** The 18th digit is computed rather than typed, so no fixture CLABE is invalid. */
function clabe(first17: string): string {
  return `${first17}${clabeCheckDigit(first17)}`;
}

/** The account this supplier has always been paid on. */
const KNOWN_ACCOUNT = clabe("01258000098765432");
/** The same account with two digits moved. This is the whole hero story. */
const PROPOSED_ACCOUNT = clabe("01258000098765481");

const SUPPLIER: Supplier = {
  rfc: SUPPLIER_RFC,
  legalName: "Empaques Sinteticos Regios SA de CV",
  knownAccounts: [
    {
      clabe: KNOWN_ACCOUNT,
      establishedBy: "payment_complement",
      establishedAt: "2026-05-14T16:00:00.000Z",
      timesPaid: 11,
    },
  ],
  firstInvoiceAt: "2024-11-05T15:20:00.000Z",
  delayCostPerDay: 1200,
  synthetic: true,
};

function aCfdi(uuid: string, total: number, issuedAt: string): Cfdi {
  return {
    uuid,
    serie: "B",
    folio: uuid.slice(-4),
    issuedAt,
    issuerRfc: SUPPLIER_RFC,
    issuerName: SUPPLIER.legalName,
    receiverRfc: "SYN900101MTY",
    subtotal: total / 1.16,
    iva: total - total / 1.16,
    total,
    paymentMethod: "PUE",
    synthetic: true,
  };
}

const UNDER_REVIEW = "C0000001-0000-4000-8000-000000000001";
/** Same issuer, same amount, two days earlier: the duplicate payable. */
const TWIN = "C0000002-0000-4000-8000-000000000002";

const CFDIS: readonly Cfdi[] = [
  aCfdi(UNDER_REVIEW, 96450.8, "2026-09-09T17:40:00.000Z"),
  aCfdi(TWIN, 96450.8, "2026-09-07T15:10:00.000Z"),
];

const INSTRUCTION: PaymentInstruction = {
  id: "ins-hero",
  supplierRfc: SUPPLIER_RFC,
  cfdiUuids: [UNDER_REVIEW],
  clabe: PROPOSED_ACCOUNT,
  amount: 96450.8,
  source: "whatsapp",
  receivedAt: "2026-09-11T15:03:00.000Z",
  synthetic: true,
};

const SAT_ENTRIES: readonly SatListEntry[] = [
  {
    rfc: SUPPLIER_RFC,
    name: SUPPLIER.legalName,
    status: "presunto",
    publishedAt: "2026-08-29",
    listVersion: "2026-08-29",
  },
];

/** A CEP whose account holder is not the company that issued the invoice. */
const CEP: Cep = {
  claveRastreo: "SYNCEP20260911777",
  transferredAt: "2026-09-11T15:44:12.000Z",
  amount: 0.01,
  senderName: "Ensambles Sinteticos del Poniente SA de CV",
  senderBank: "058",
  beneficiaryName: "Tesoreria Corporativa Delta SA de CV",
  beneficiaryAccount: PROPOSED_ACCOUNT,
  beneficiaryBank: "012",
  signatureValid: true,
  xml: '<SPEI_Tercero sintetico="true" />',
  synthetic: true,
};

const MIRROR: readonly LedgerTx[] = [
  {
    id: "tx-0001",
    accountId: "acc-synthetic",
    occurredAt: "2026-09-07T00:00:00.000Z",
    amount: 96450.8,
    direction: "debit",
    source: "seed",
    raw: {},
  },
];

const COMPLEMENTS: readonly PaymentComplement[] = [];

function anInput(overrides: Partial<ComposeInput> = {}): ComposeInput {
  return {
    instruction: INSTRUCTION,
    supplier: SUPPLIER,
    cfdis: CFDIS,
    complements: COMPLEMENTS,
    satEntries: SAT_ENTRIES,
    cep: CEP,
    bankMirror: MIRROR,
    now: NOW,
    ...overrides,
  };
}

const ALL_SIX: readonly Detector[] = [
  "sat_69b",
  "clabe_forensics",
  "duplicate_invoice",
  "supplier_behaviour",
  "beneficiary_cep",
  "bank_reconciliation",
];

describe("runControls", () => {
  it("runs every one of the six controls on the fixture instruction", () => {
    const report = runControls(anInput());

    expect(report.ran).toEqual([...ALL_SIX]);
    expect(report.skipped).toEqual([]);
  });

  it("accounts for all six whatever the evidence, and never loses one", () => {
    const degraded: ComposeInput[] = [
      anInput(),
      anInput({ supplier: undefined }),
      anInput({ cep: undefined }),
      anInput({ bankMirror: [] }),
      anInput({ satEntries: [] }),
      anInput({ cfdis: [], complements: [] }),
      anInput({
        supplier: undefined,
        cep: undefined,
        bankMirror: [],
        satEntries: [],
        cfdis: [],
      }),
    ];

    for (const input of degraded) {
      const report = runControls(input);
      const accounted = [
        ...report.ran,
        ...report.skipped.map((row) => row.detector),
      ];

      expect(accounted.length).toBe(ALL_SIX.length);
      expect(new Set(accounted)).toEqual(new Set(ALL_SIX));
      // Never a skip without a reason a person can read. That is the whole bug.
      for (const row of report.skipped) {
        expect(row.detail.length).toBeGreaterThan(0);
      }
    }
  });

  it("produces the findings the fixture actually justifies", () => {
    const report = runControls(anInput());
    const detectors = report.findings.map((finding) => finding.detector);

    expect(new Set(detectors)).toEqual(
      new Set([
        "sat_69b",
        "clabe_forensics",
        "duplicate_invoice",
        "beneficiary_cep",
      ]),
    );
    // The two that ran and stayed silent did so for a reason a person can
    // state: eleven invoices is not enough history to test a behaviour change,
    // and the payment has not been sent, so the mirror cannot contradict it.
    expect(report.ran).toContain("supplier_behaviour");
    expect(report.ran).toContain("bank_reconciliation");
  });

  it("puts the alert rail in order, biggest pesos at risk first", () => {
    const report = runControls(anInput());
    const amounts = report.findings.map((finding) => finding.amountAtRisk);

    expect(amounts).toEqual([...amounts].sort((left, right) => right - left));
  });

  it("names what was missing for each control that could not run", () => {
    const report = runControls(
      anInput({ supplier: undefined, cep: undefined, bankMirror: [] }),
    );
    const reasons = Object.fromEntries(
      report.skipped.map((row) => [row.detector, row.reason]),
    );

    expect(reasons).toEqual({
      supplier_behaviour: "no_supplier",
      beneficiary_cep: "no_cep",
      bank_reconciliation: "no_bank_mirror",
    });
  });

  it("refuses to read a CEP for another account as evidence about this one", () => {
    const report = runControls(
      anInput({ cep: { ...CEP, beneficiaryAccount: KNOWN_ACCOUNT } }),
    );
    const skipped = report.skipped.find(
      (row) => row.detector === "beneficiary_cep",
    );

    expect(skipped?.reason).toBe("cep_other_account");
    expect(skipped?.detail).toContain(KNOWN_ACCOUNT);
  });

  it("offers the six in the order the domain contract declares them", () => {
    expect(CEPTINELA_DETECTORS.map((adapter) => adapter.detector)).toEqual([
      ...ALL_SIX,
    ]);
  });
});

describe("sat69bAdapter", () => {
  function satFinding(input: ComposeInput) {
    return runControls(input).findings.find(
      (finding) => finding.detector === "sat_69b",
    );
  }

  it("asks for verification on a presunto and puts the payment at risk", () => {
    const finding = satFinding(anInput());

    expect(finding?.severity).toBe("critical");
    expect(finding?.state).toBe("requiere_verificacion");
    expect(finding?.amountAtRisk).toBe(INSTRUCTION.amount);
    expect(finding?.subject).toEqual({ kind: "supplier", id: SUPPLIER_RFC });
  });

  it("holds a definitivo, because the deduction is void by law", () => {
    const finding = satFinding(
      anInput({
        satEntries: [{ ...SAT_ENTRIES[0], status: "definitivo" }],
      }),
    );

    expect(finding?.severity).toBe("critical");
    expect(finding?.state).toBe("comprobable");
  });

  it("does not alert on a taxpayer who cleared their name", () => {
    const finding = satFinding(
      anInput({
        satEntries: [
          SAT_ENTRIES[0],
          {
            ...SAT_ENTRIES[0],
            status: "desvirtuado",
            publishedAt: "2026-09-05",
            listVersion: "2026-09-05",
          },
        ],
      }),
    );

    // Still reported, because "estuvo en la lista y la desvirtuo" is context,
    // but as info with no pesos at risk, so it can never move an action.
    expect(finding?.severity).toBe("info");
    expect(finding?.amountAtRisk).toBe(0);
    expect(finding?.evidence.listedNow).toBe(false);
  });

  it("says nothing at all about an RFC no version we hold mentions", () => {
    const report = runControls(anInput({ satEntries: [] }));

    expect(report.ran).toContain("sat_69b");
    expect(satFinding(anInput({ satEntries: [] }))).toBeUndefined();
  });

  it("adds the retroactive exposure of invoices already paid and deducted", () => {
    const sweep: SweepResult = {
      listVersion: "2026-08-29",
      newlyListed: [
        {
          supplier: SUPPLIER,
          status: "presunto",
          paidCfdis: [CFDIS[1]],
          deductedBase: 83147.24,
          isrExposure: 24944.17,
          ivaExposure: 13303.56,
        },
      ],
      totalExposure: 38247.73,
    };
    const finding = satFinding(anInput({ sweep }));

    // The pesos about to leave plus the deductions the publication voids. They
    // are different money, so they add instead of shadowing each other.
    expect(finding?.amountAtRisk).toBe(96450.8 + 24944.17 + 13303.56);
    expect(finding?.evidence.paidCfdis).toBe(1);
    expect(finding?.explanation).toContain("1 factura ya pagada");
  });

  it("prices nothing when the sweep does not mention this supplier", () => {
    expect(sweptExposureFor(SUPPLIER_RFC, undefined)).toEqual({
      exposure: 0,
      paidCfdis: 0,
      deductedBase: 0,
    });
  });
});

describe("beneficiaryCepAdapter", () => {
  function cepFinding(input: ComposeInput) {
    return runControls(input).findings.find(
      (finding) => finding.detector === "beneficiary_cep",
    );
  }

  it("is critical when the account holder is not the company on the invoice", () => {
    const finding = cepFinding(anInput());

    expect(finding?.severity).toBe("critical");
    expect(finding?.evidence.nameMatch).toBe("mismatch");
    expect(finding?.amountAtRisk).toBe(INSTRUCTION.amount);
  });

  it("is good news, and only info, when the holder is the supplier", () => {
    const finding = cepFinding(
      anInput({ cep: { ...CEP, beneficiaryName: SUPPLIER.legalName } }),
    );

    expect(finding?.severity).toBe("info");
    expect(finding?.state).toBe("comprobable");
    expect(finding?.amountAtRisk).toBe(0);
  });

  it("reads an unconfirmed scheme as not verified, never as invalid", () => {
    const finding = cepFinding(
      anInput({
        cep: {
          ...CEP,
          beneficiaryName: SUPPLIER.legalName,
          signatureValid: false,
          signatureReason: "unconfirmed_scheme",
        },
      }),
    );

    expect(finding?.evidence.signatureState).toBe("unconfirmed");
    expect(finding?.severity).toBe("info");
    // Not provable, because nobody validated the seal.
    expect(finding?.state).toBe("requiere_verificacion");
    expect(finding?.explanation).toContain("no se ha podido verificar");
  });

  it("is critical when the seal itself failed, even on a matching name", () => {
    const finding = cepFinding(
      anInput({
        cep: {
          ...CEP,
          beneficiaryName: SUPPLIER.legalName,
          signatureValid: false,
          signatureReason: "digest_mismatch",
        },
      }),
    );

    expect(finding?.severity).toBe("critical");
    expect(finding?.evidence.signatureState).toBe("invalid");
  });
});
