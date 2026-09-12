/**
 * The synthetic payment run the API serves until Postgres and the detectors are
 * wired in. One company, eight suppliers, fifteen CFDI, twelve instructions,
 * and the findings and decisions the payment-run screen needs in order to be
 * built today.
 *
 * Three things are deliberate and a reviewer should hold us to them.
 *
 * 1. **Everything is flagged.** Every supplier, CFDI, complement, instruction
 *    and CEP carries `synthetic: true`, and every RFC starts with SYN. ADR-0002
 *    forbids a real RFC standing next to fabricated evidence, so there is not
 *    one in this file. The only real RFCs in the product arrive through
 *    `GET /api/v1/sat/lookup`, which reads the official list and fabricates
 *    nothing.
 * 2. **The findings here are examples of the shape, not detector output.** They
 *    were written by hand so the alert rail has something to render. The real
 *    ones come from @hackmty/core, which is why `pipeline.ts` feature-detects
 *    `composeFindings` instead of importing a placeholder.
 * 3. **The labelled cases are not flattering, on purpose.** Four true
 *    positives, three false positives and one miss. A fixture that scores 1.0
 *    teaches the UI nothing and would be the first number a judge disbelieves.
 *
 * Amounts are MXN major units. CFDI totals split at 16 percent IVA and the two
 * halves add back to the total to the cent. CLABEs carry a valid check digit
 * under the 3-7-1 mod 10 rule, including the fraudulent one in instruction 01:
 * a swapped account that fails the check digit is a typo, and a typo is not the
 * attack we are defending against.
 */

import type {
  Cep,
  Cfdi,
  Decision,
  Detector,
  Finding,
  LedgerEvent,
  PaymentComplement,
  PaymentInstruction,
  SatListEntry,
  Supplier,
} from "@hackmty/core";
import { fromCents, toCents } from "@hackmty/core";
import type { VerifiedBeneficiary } from "./schemas";

export const COMPANY_RFC = "SYN900101MTY";
export const COMPANY_NAME = "Ensambles del Poniente SA de CV";
export const RUN_ID = "run-2026-w37";
export const WEEK_OF = "2026-09-07";

/** Institution codes rather than brand names, so no bank is named in fixtures. */
const BANK_OWN = "058";

function cfdiUuid(n: number): string {
  return `A${String(n).padStart(7, "0")}-0000-4000-8000-${String(n).padStart(12, "0")}`;
}

function complementUuid(n: number): string {
  return `B${String(n).padStart(7, "0")}-0000-4000-8000-${String(n).padStart(12, "0")}`;
}

function instructionId(n: number): string {
  return `ins-2026w37-${String(n).padStart(2, "0")}`;
}

/* -------------------------------------------------------------------------- */
/* Suppliers                                                                   */
/* -------------------------------------------------------------------------- */

const SUPPLIERS: readonly Supplier[] = [
  {
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
    synthetic: true,
  },
  {
    rfc: "SYN020202BBB",
    legalName: "Empaques Regios SA de CV",
    knownAccounts: [
      {
        clabe: "012580000987654320",
        establishedBy: "instruction",
        establishedAt: "2026-05-14T16:00:00.000Z",
        timesPaid: 11,
      },
    ],
    firstInvoiceAt: "2024-11-05T15:20:00.000Z",
    synthetic: true,
  },
  {
    rfc: "SYN030303CCC",
    legalName: "Transportes Cumbres SA de CV",
    knownAccounts: [
      {
        clabe: "072580000456123788",
        establishedBy: "payment_complement",
        establishedAt: "2026-03-02T18:10:00.000Z",
        timesPaid: 19,
      },
    ],
    firstInvoiceAt: "2024-06-11T17:45:00.000Z",
    synthetic: true,
  },
  {
    rfc: "SYN040404DDD",
    legalName: "Tornillos y Sujetadores del Bajio SA de CV",
    knownAccounts: [
      {
        clabe: "002180000333444552",
        establishedBy: "instruction",
        establishedAt: "2026-06-19T15:40:00.000Z",
        timesPaid: 5,
      },
    ],
    firstInvoiceAt: "2026-01-23T16:30:00.000Z",
    synthetic: true,
  },
  {
    rfc: "SYN050505EEE",
    legalName: "Servicios Industriales Topo Chico SA de CV",
    knownAccounts: [
      {
        clabe: "014580000777888993",
        establishedBy: "payment_complement",
        establishedAt: "2026-02-11T19:20:00.000Z",
        timesPaid: 23,
      },
    ],
    firstInvoiceAt: "2024-03-08T18:00:00.000Z",
    synthetic: true,
  },
  {
    rfc: "SYN060606FFF",
    legalName: "Plasticos San Nicolas SA de CV",
    knownAccounts: [
      {
        clabe: "044580000111222334",
        establishedBy: "instruction",
        establishedAt: "2026-07-01T16:05:00.000Z",
        timesPaid: 4,
      },
    ],
    firstInvoiceAt: "2026-04-30T15:10:00.000Z",
    synthetic: true,
  },
  {
    rfc: "SYN070707GGG",
    legalName: "Consultoria Fiscal Anahuac SC",
    knownAccounts: [
      {
        clabe: "030580000999000119",
        establishedBy: "cep",
        establishedAt: "2026-09-10T16:45:00.000Z",
        timesPaid: 2,
      },
    ],
    firstInvoiceAt: "2026-07-14T17:00:00.000Z",
    synthetic: true,
  },
  {
    rfc: "SYN080808HHH",
    legalName: "Herramientas Guadalupe SA de CV",
    knownAccounts: [
      {
        clabe: "127580000222333440",
        establishedBy: "payment_complement",
        establishedAt: "2026-08-31T18:30:00.000Z",
        timesPaid: 9,
      },
    ],
    firstInvoiceAt: "2025-09-19T16:40:00.000Z",
    synthetic: true,
  },
];

const SUPPLIER_NAME_BY_RFC = new Map(
  SUPPLIERS.map((supplier) => [supplier.rfc, supplier.legalName]),
);

/* -------------------------------------------------------------------------- */
/* CFDI                                                                        */
/* -------------------------------------------------------------------------- */

type CfdiRow = {
  n: number;
  issuerRfc: string;
  total: number;
  issuedAt: string;
  serie: string;
  folio: string;
  paymentMethod: "PUE" | "PPD";
};

/** IVA general rate. It is not a border-region fixture. */
const IVA_RATE = 0.16;

/**
 * Splits a CFDI total into base and IVA through cents, so the two halves add
 * back to the total exactly. Writing both halves by hand in the table below is
 * how a fixture ends up with an invoice whose subtotal plus IVA is off by a cent.
 */
function splitIva(total: number): { subtotal: number; iva: number } {
  const totalCents = toCents(total);
  const subtotalCents = Math.round(totalCents / (1 + IVA_RATE));
  return {
    subtotal: fromCents(subtotalCents),
    iva: fromCents(totalCents - subtotalCents),
  };
}

const CFDI_ROWS: readonly CfdiRow[] = [
  {
    n: 1,
    issuerRfc: "SYN010101AAA",
    total: 184300,
    issuedAt: "2026-09-03T15:12:00.000Z",
    serie: "A",
    folio: "1187",
    paymentMethod: "PPD",
  },
  {
    n: 2,
    issuerRfc: "SYN020202BBB",
    total: 96450.8,
    issuedAt: "2026-09-02T17:40:00.000Z",
    serie: "B",
    folio: "903",
    paymentMethod: "PUE",
  },
  {
    n: 3,
    issuerRfc: "SYN030303CCC",
    total: 42180,
    issuedAt: "2026-09-04T14:05:00.000Z",
    serie: "TC",
    folio: "5521",
    paymentMethod: "PUE",
  },
  {
    n: 4,
    issuerRfc: "SYN040404DDD",
    total: 28740.5,
    issuedAt: "2026-09-01T16:20:00.000Z",
    serie: "F",
    folio: "2210",
    paymentMethod: "PUE",
  },
  {
    n: 5,
    issuerRfc: "SYN050505EEE",
    total: 315600,
    issuedAt: "2026-08-31T18:02:00.000Z",
    serie: "SI",
    folio: "771",
    paymentMethod: "PPD",
  },
  {
    n: 6,
    issuerRfc: "SYN060606FFF",
    total: 51230.25,
    issuedAt: "2026-09-05T15:48:00.000Z",
    serie: "P",
    folio: "4460",
    paymentMethod: "PUE",
  },
  {
    n: 7,
    issuerRfc: "SYN070707GGG",
    total: 78000,
    issuedAt: "2026-09-07T16:30:00.000Z",
    serie: "CF",
    folio: "318",
    paymentMethod: "PUE",
  },
  {
    n: 8,
    issuerRfc: "SYN080808HHH",
    total: 132900,
    issuedAt: "2026-09-04T19:15:00.000Z",
    serie: "H",
    folio: "6032",
    paymentMethod: "PPD",
  },
  {
    n: 9,
    issuerRfc: "SYN010101AAA",
    total: 67450,
    issuedAt: "2026-09-08T14:55:00.000Z",
    serie: "A",
    folio: "1203",
    paymentMethod: "PUE",
  },
  {
    n: 10,
    issuerRfc: "SYN030303CCC",
    total: 208350,
    issuedAt: "2026-09-08T20:10:00.000Z",
    serie: "TC",
    folio: "5588",
    paymentMethod: "PPD",
  },
  {
    n: 11,
    issuerRfc: "SYN020202BBB",
    total: 44900,
    issuedAt: "2026-09-09T15:25:00.000Z",
    serie: "B",
    folio: "931",
    paymentMethod: "PUE",
  },
  {
    n: 12,
    issuerRfc: "SYN060606FFF",
    total: 119800,
    issuedAt: "2026-09-09T18:44:00.000Z",
    serie: "P",
    folio: "4502",
    paymentMethod: "PPD",
  },
  // 13 is the duplicate pair of 4: same issuer, same amount, two days apart.
  {
    n: 13,
    issuerRfc: "SYN040404DDD",
    total: 28740.5,
    issuedAt: "2026-09-03T16:22:00.000Z",
    serie: "F",
    folio: "2231",
    paymentMethod: "PUE",
  },
  // 14 and 15 are already paid and exist so the complements have a parent.
  {
    n: 14,
    issuerRfc: "SYN080808HHH",
    total: 89600,
    issuedAt: "2026-08-27T17:05:00.000Z",
    serie: "H",
    folio: "5904",
    paymentMethod: "PUE",
  },
  {
    n: 15,
    issuerRfc: "SYN010101AAA",
    total: 54200,
    issuedAt: "2026-08-20T16:15:00.000Z",
    serie: "A",
    folio: "1154",
    paymentMethod: "PUE",
  },
];

function buildCfdis(): Cfdi[] {
  return CFDI_ROWS.map((row) => ({
    uuid: cfdiUuid(row.n),
    serie: row.serie,
    folio: row.folio,
    issuedAt: row.issuedAt,
    issuerRfc: row.issuerRfc,
    issuerName:
      SUPPLIER_NAME_BY_RFC.get(row.issuerRfc) ?? "Proveedor sintetico",
    receiverRfc: COMPANY_RFC,
    ...splitIva(row.total),
    total: row.total,
    paymentMethod: row.paymentMethod,
    // 03 is transferencia electronica de fondos in the SAT c_FormaPago catalog.
    paymentForm: "03",
    synthetic: true,
  }));
}

/* -------------------------------------------------------------------------- */
/* Payment complements                                                         */
/* -------------------------------------------------------------------------- */

function buildComplements(): PaymentComplement[] {
  return [
    {
      uuid: complementUuid(1),
      relatedCfdiUuid: cfdiUuid(15),
      paidAt: "2026-08-24T17:30:00.000Z",
      paidAmount: 54200,
      beneficiaryAccount: "058580000123456715",
      beneficiaryBankRfc: "SYN580101BAN",
      synthetic: true,
    },
    {
      uuid: complementUuid(2),
      relatedCfdiUuid: cfdiUuid(14),
      paidAt: "2026-08-31T18:30:00.000Z",
      paidAmount: 89600,
      beneficiaryAccount: "127580000222333440",
      beneficiaryBankRfc: "SYN127101BAN",
      synthetic: true,
    },
    {
      // A PPD paid in two exhibitions: this is the first one.
      uuid: complementUuid(3),
      relatedCfdiUuid: cfdiUuid(5),
      paidAt: "2026-09-04T17:00:00.000Z",
      paidAmount: 150000,
      beneficiaryAccount: "014580000777888993",
      beneficiaryBankRfc: "SYN014101BAN",
      synthetic: true,
    },
  ];
}

/* -------------------------------------------------------------------------- */
/* Instructions                                                                */
/* -------------------------------------------------------------------------- */

type InstructionRow = {
  n: number;
  supplierRfc: string;
  cfdi: number;
  clabe: string;
  amount: number;
  source: PaymentInstruction["source"];
  receivedAt: string;
  text?: string;
  imageRef?: string;
  ocrConfidence?: number;
};

const INSTRUCTION_ROWS: readonly InstructionRow[] = [
  {
    n: 1,
    supplierRfc: "SYN010101AAA",
    cfdi: 1,
    // One digit away from the account this supplier has been paid on 7 times.
    clabe: "058580000123456812",
    amount: 184300,
    source: "whatsapp",
    receivedAt: "2026-09-08T15:03:00.000Z",
    text: "Buen dia, les comparto la cuenta actualizada para el pago de esta semana. Cambiamos de banco el mes pasado.",
  },
  {
    n: 2,
    supplierRfc: "SYN020202BBB",
    cfdi: 2,
    clabe: "012580000987654320",
    amount: 96450.8,
    source: "email",
    receivedAt: "2026-09-08T16:20:00.000Z",
  },
  {
    n: 3,
    supplierRfc: "SYN030303CCC",
    cfdi: 3,
    clabe: "072580000456123788",
    amount: 42180,
    source: "portal",
    receivedAt: "2026-09-08T17:44:00.000Z",
  },
  {
    n: 4,
    supplierRfc: "SYN040404DDD",
    cfdi: 4,
    clabe: "002180000333444552",
    amount: 28740.5,
    source: "email",
    receivedAt: "2026-09-09T14:35:00.000Z",
  },
  {
    n: 5,
    supplierRfc: "SYN050505EEE",
    cfdi: 5,
    clabe: "014580000777888993",
    amount: 315600,
    source: "portal",
    receivedAt: "2026-09-09T15:10:00.000Z",
  },
  {
    n: 6,
    supplierRfc: "SYN060606FFF",
    cfdi: 6,
    clabe: "044580000111222334",
    amount: 51230.25,
    source: "email",
    receivedAt: "2026-09-09T16:02:00.000Z",
  },
  {
    n: 7,
    supplierRfc: "SYN070707GGG",
    cfdi: 7,
    clabe: "030580000999000119",
    amount: 78000,
    source: "manual",
    receivedAt: "2026-09-10T15:30:00.000Z",
  },
  {
    n: 8,
    supplierRfc: "SYN080808HHH",
    cfdi: 8,
    clabe: "127580000222333440",
    amount: 132900,
    source: "email",
    receivedAt: "2026-09-10T16:12:00.000Z",
  },
  {
    n: 9,
    supplierRfc: "SYN010101AAA",
    cfdi: 9,
    clabe: "058580000123456715",
    amount: 67450,
    source: "portal",
    receivedAt: "2026-09-10T17:05:00.000Z",
  },
  {
    n: 10,
    supplierRfc: "SYN030303CCC",
    cfdi: 10,
    clabe: "072580000456123788",
    amount: 208350,
    source: "email",
    receivedAt: "2026-09-10T18:20:00.000Z",
  },
  {
    n: 11,
    supplierRfc: "SYN020202BBB",
    cfdi: 11,
    clabe: "012580000987654320",
    amount: 44900,
    source: "whatsapp",
    receivedAt: "2026-09-11T14:40:00.000Z",
  },
  {
    n: 12,
    supplierRfc: "SYN060606FFF",
    cfdi: 12,
    // A new account, photographed, in a different bank from the known one.
    clabe: "021180000555666775",
    amount: 119800,
    source: "pdf",
    receivedAt: "2026-09-11T15:55:00.000Z",
    imageRef: "synthetic/instruction-12.png",
    ocrConfidence: 0.82,
  },
];

function buildInstructions(): PaymentInstruction[] {
  return INSTRUCTION_ROWS.map((row) => {
    const instruction: PaymentInstruction = {
      id: instructionId(row.n),
      supplierRfc: row.supplierRfc,
      cfdiUuids: [cfdiUuid(row.cfdi)],
      clabe: row.clabe,
      amount: row.amount,
      source: row.source,
      receivedAt: row.receivedAt,
      synthetic: true,
    };
    if (row.text !== undefined) {
      instruction.text = row.text;
    }
    if (row.imageRef !== undefined) {
      instruction.imageRef = row.imageRef;
    }
    if (row.ocrConfidence !== undefined) {
      instruction.ocrConfidence = row.ocrConfidence;
    }
    return instruction;
  });
}

/* -------------------------------------------------------------------------- */
/* Findings                                                                    */
/* -------------------------------------------------------------------------- */

const FINDINGS_CREATED_AT = "2026-09-11T16:20:00.000Z";

function buildFindings(): Finding[] {
  return [
    {
      id: "fnd-0001",
      detector: "clabe_forensics",
      severity: "critical",
      state: "requiere_verificacion",
      subject: { kind: "instruction", id: instructionId(1) },
      amountAtRisk: 184300,
      explanation:
        "La CLABE de esta instruccion difiere en un digito de la cuenta en la que este proveedor ha cobrado 7 veces. El digito verificador de la cuenta nueva es valido, asi que no parece un error de captura.",
      evidence: {
        knownClabe: "058580000123456715",
        proposedClabe: "058580000123456812",
        accountDigitsChanged: 1,
        checkDigitValid: true,
        timesPaidToKnownAccount: 7,
        channel: "whatsapp",
      },
      createdAt: FINDINGS_CREATED_AT,
    },
    {
      id: "fnd-0002",
      detector: "sat_69b",
      severity: "critical",
      state: "comprobable",
      subject: { kind: "supplier", id: "SYN020202BBB" },
      amountAtRisk: 96450.8,
      explanation:
        "El proveedor aparece como presunto en el listado del articulo 69-B de la version 2026-08-29. Pagar y deducir este CFDI pone en riesgo la deduccion del ISR y el acreditamiento del IVA.",
      evidence: {
        rfc: "SYN020202BBB",
        status: "presunto",
        listVersion: "2026-08-29",
        publishedAt: "2026-08-29",
      },
      createdAt: FINDINGS_CREATED_AT,
    },
    {
      id: "fnd-0003",
      detector: "duplicate_invoice",
      severity: "warning",
      state: "comprobable",
      subject: { kind: "cfdi", id: cfdiUuid(4) },
      amountAtRisk: 28740.5,
      explanation:
        "Dos CFDI del mismo emisor por el mismo importe con dos dias de diferencia y folios cercanos. Uno de los dos ya podria estar pagado.",
      evidence: {
        otherUuid: cfdiUuid(13),
        folio: "2210",
        otherFolio: "2231",
        daysApart: 2,
        amount: 28740.5,
      },
      createdAt: FINDINGS_CREATED_AT,
    },
    {
      id: "fnd-0004",
      detector: "supplier_behaviour",
      severity: "warning",
      state: "requiere_verificacion",
      subject: { kind: "supplier", id: "SYN050505EEE" },
      amountAtRisk: 315600,
      explanation:
        "El importe esta muy por encima de lo que este proveedor factura normalmente. La muestra es suficiente para que la desviacion sea significativa, no para afirmar que algo esta mal.",
      evidence: {
        sampleSize: 14,
        windowDays: 180,
        ratioToMedian: 3.1,
        gatedBySampleSize: false,
      },
      createdAt: FINDINGS_CREATED_AT,
    },
    {
      id: "fnd-0005",
      detector: "beneficiary_cep",
      severity: "info",
      state: "comprobable",
      subject: { kind: "instruction", id: instructionId(7) },
      amountAtRisk: 0,
      explanation:
        "La cuenta ya fue verificada con un CEP de Banxico. La firma del XML valida y el titular coincide con la razon social del CFDI.",
      evidence: {
        claveRastreo: "SYNCEP20260910001",
        signatureValid: true,
        nameMatch: "match",
        verifiedAt: "2026-09-10T16:45:00.000Z",
      },
      createdAt: FINDINGS_CREATED_AT,
    },
    {
      id: "fnd-0006",
      detector: "bank_reconciliation",
      severity: "warning",
      state: "requiere_verificacion",
      subject: { kind: "supplier", id: "SYN080808HHH" },
      amountAtRisk: 43300,
      explanation:
        "Hay una salida bancaria sin CFDI ni instruccion que la respalde, hacia una cuenta que no pertenece a ningun proveedor registrado.",
      evidence: {
        outflowAmount: 43300,
        outflowDate: "2026-09-02",
        beneficiaryAccount: "646180000666777886",
        matchedDocuments: 0,
      },
      createdAt: FINDINGS_CREATED_AT,
    },
    {
      id: "fnd-0007",
      detector: "sat_69b",
      severity: "critical",
      state: "comprobable",
      subject: { kind: "instruction", id: instructionId(11) },
      amountAtRisk: 44900,
      explanation:
        "Segunda instruccion de la semana para un proveedor presunto en el listado 69-B. La exposicion se acumula con la del CFDI anterior.",
      evidence: {
        rfc: "SYN020202BBB",
        status: "presunto",
        listVersion: "2026-08-29",
        instructionsThisRun: 2,
      },
      createdAt: FINDINGS_CREATED_AT,
    },
    {
      id: "fnd-0008",
      detector: "clabe_forensics",
      severity: "warning",
      state: "requiere_verificacion",
      subject: { kind: "instruction", id: instructionId(12) },
      amountAtRisk: 119800,
      explanation:
        "La CLABE llego en una imagen y no coincide con ninguna cuenta previa del proveedor. Cambia el banco y cambia la plaza, y la confianza del OCR no es alta.",
      evidence: {
        ocrConfidence: 0.82,
        knownAccounts: 1,
        bankCode: "021",
        previousBankCode: "044",
        source: "pdf",
      },
      createdAt: FINDINGS_CREATED_AT,
    },
  ];
}

/**
 * Which findings hang off which instruction. A supplier-level finding belongs to
 * every instruction of that supplier in the run, so this cannot be inferred from
 * `subject` alone and the Postgres implementation will need the same join.
 */
const FINDINGS_BY_INSTRUCTION: Readonly<Record<string, readonly string[]>> = {
  [instructionId(1)]: ["fnd-0001"],
  [instructionId(2)]: ["fnd-0002"],
  [instructionId(3)]: [],
  [instructionId(4)]: ["fnd-0003"],
  [instructionId(5)]: ["fnd-0004"],
  [instructionId(6)]: [],
  [instructionId(7)]: ["fnd-0005"],
  [instructionId(8)]: ["fnd-0006"],
  [instructionId(9)]: [],
  [instructionId(10)]: [],
  [instructionId(11)]: ["fnd-0007"],
  [instructionId(12)]: ["fnd-0008"],
};

/* -------------------------------------------------------------------------- */
/* Decisions                                                                   */
/* -------------------------------------------------------------------------- */

type DecisionRow = {
  n: number;
  action: Decision["action"];
  expectedLoss: number;
  delayCostPerDay: number;
  decidedBy?: string;
};

/**
 * `expectedLoss` for a 69-B supplier is the deduction actually at risk: 30
 * percent ISR over the subtotal plus the IVA that stops being creditable. For
 * the account-swap cases it is the whole transfer, because a SPEI does not come
 * back. `delayCostPerDay` is the cost of holding the payment one more day and
 * comes from the supplier relationship model, TODO(garzario) in issue #38.
 */
const DECISION_ROWS: readonly DecisionRow[] = [
  { n: 1, action: "hold", expectedLoss: 184300, delayCostPerDay: 920 },
  { n: 2, action: "hold", expectedLoss: 38247.73, delayCostPerDay: 480 },
  {
    n: 3,
    action: "release",
    expectedLoss: 0,
    delayCostPerDay: 210,
    decidedBy: "clerk-synthetic",
  },
  { n: 4, action: "verify", expectedLoss: 28740.5, delayCostPerDay: 140 },
  { n: 5, action: "verify", expectedLoss: 47340, delayCostPerDay: 1580 },
  { n: 6, action: "release", expectedLoss: 0, delayCostPerDay: 256 },
  { n: 7, action: "release", expectedLoss: 0, delayCostPerDay: 390 },
  { n: 8, action: "verify", expectedLoss: 43300, delayCostPerDay: 665 },
  {
    n: 9,
    action: "release",
    expectedLoss: 0,
    delayCostPerDay: 337,
    decidedBy: "clerk-synthetic",
  },
  { n: 10, action: "release", expectedLoss: 0, delayCostPerDay: 1042 },
  { n: 11, action: "hold", expectedLoss: 17805.17, delayCostPerDay: 225 },
  { n: 12, action: "verify", expectedLoss: 119800, delayCostPerDay: 599 },
];

const DECIDED_AT = "2026-09-11T16:30:00.000Z";

function buildDecisions(findings: readonly Finding[]): Decision[] {
  const byId = new Map(findings.map((finding) => [finding.id, finding]));

  return DECISION_ROWS.map((row) => {
    const id = instructionId(row.n);
    const attached = (FINDINGS_BY_INSTRUCTION[id] ?? [])
      .map((findingId) => byId.get(findingId))
      .filter((finding): finding is Finding => finding !== undefined);

    const decision: Decision = {
      instructionId: id,
      action: row.action,
      expectedLoss: row.expectedLoss,
      delayCostPerDay: row.delayCostPerDay,
      findings: attached,
      decidedAt: DECIDED_AT,
    };
    if (row.decidedBy !== undefined) {
      decision.decidedBy = row.decidedBy;
    }
    return decision;
  });
}

/* -------------------------------------------------------------------------- */
/* SAT list versions                                                           */
/* -------------------------------------------------------------------------- */

function buildSatEntries(): SatListEntry[] {
  return [
    {
      rfc: "SYN020202BBB",
      name: "Empaques Regios SA de CV",
      status: "presunto",
      publishedAt: "2026-08-29",
      listVersion: "2026-08-29",
    },
    {
      rfc: "SYN110202KKK",
      name: "Servicios Corporativos del Valle SA de CV",
      status: "definitivo",
      publishedAt: "2026-06-27",
      listVersion: "2026-06-27",
    },
    {
      rfc: "SYN120303LLL",
      name: "Comercializadora Mitras SA de CV",
      status: "desvirtuado",
      publishedAt: "2026-06-27",
      listVersion: "2026-06-27",
    },
  ];
}

/* -------------------------------------------------------------------------- */
/* Verified beneficiaries                                                      */
/* -------------------------------------------------------------------------- */

const SYNTHETIC_CEP_XML =
  '<SPEI_Tercero xmlns="http://www.banxico.org.mx/cep" sintetico="true" claveRastreo="SYNCEP20260910001" />';

function buildCep(): Cep {
  return {
    claveRastreo: "SYNCEP20260910001",
    transferredAt: "2026-09-10T16:44:12.000Z",
    // The verification probe is one cent, sent by a person from the company bank.
    amount: 0.01,
    senderName: COMPANY_NAME,
    senderBank: BANK_OWN,
    beneficiaryName: "Consultoria Fiscal Anahuac SC",
    beneficiaryAccount: "030580000999000119",
    beneficiaryBank: "030",
    signatureValid: true,
    xml: SYNTHETIC_CEP_XML,
    synthetic: true,
  };
}

function buildBeneficiaries(): VerifiedBeneficiary[] {
  return [
    {
      supplierRfc: "SYN070707GGG",
      clabe: "030580000999000119",
      cep: buildCep(),
      verifiedAt: "2026-09-10T16:45:00.000Z",
    },
  ];
}

/* -------------------------------------------------------------------------- */
/* Labelled cases for the blind evaluation                                     */
/* -------------------------------------------------------------------------- */

/**
 * The label a detector never sees. `firedDetectors` lists only the detectors
 * that raised an alert, which means warning or critical: an `info` finding such
 * as "this beneficiary is already verified" is not an alert and must not count
 * as a false positive.
 *
 * TODO(Apanawa): issue #55 replaces this table with the labelled holdout cases,
 * written by somebody who has not read the detectors, which is the only reason
 * the precision and recall on the metrics screen mean anything.
 */
export interface LabelledCase {
  instructionId: string;
  fraudulent: boolean;
  firedDetectors: Detector[];
  /** Set when the case was toxic and nothing fired, to attribute the miss. */
  expectedDetector?: Detector;
}

function buildLabelledCases(): LabelledCase[] {
  return [
    {
      instructionId: instructionId(1),
      fraudulent: true,
      firedDetectors: ["clabe_forensics"],
    },
    {
      instructionId: instructionId(2),
      fraudulent: true,
      firedDetectors: ["sat_69b"],
    },
    { instructionId: instructionId(3), fraudulent: false, firedDetectors: [] },
    {
      instructionId: instructionId(4),
      fraudulent: false,
      firedDetectors: ["duplicate_invoice"],
    },
    {
      instructionId: instructionId(5),
      fraudulent: false,
      firedDetectors: ["supplier_behaviour"],
    },
    { instructionId: instructionId(6), fraudulent: false, firedDetectors: [] },
    { instructionId: instructionId(7), fraudulent: false, firedDetectors: [] },
    {
      instructionId: instructionId(8),
      fraudulent: true,
      firedDetectors: ["bank_reconciliation"],
    },
    { instructionId: instructionId(9), fraudulent: false, firedDetectors: [] },
    {
      // The miss. The account drifted and nothing caught it, which is why the
      // metrics screen shows a recall below 1.
      instructionId: instructionId(10),
      fraudulent: true,
      firedDetectors: [],
      expectedDetector: "supplier_behaviour",
    },
    {
      instructionId: instructionId(11),
      fraudulent: true,
      firedDetectors: ["sat_69b"],
    },
    {
      instructionId: instructionId(12),
      fraudulent: false,
      firedDetectors: ["clabe_forensics"],
    },
  ];
}

/* -------------------------------------------------------------------------- */
/* Ledger                                                                      */
/* -------------------------------------------------------------------------- */

function buildLedger(
  cfdis: readonly Cfdi[],
  complements: readonly PaymentComplement[],
  instructions: readonly PaymentInstruction[],
  decisions: readonly Decision[],
  satEntries: readonly SatListEntry[],
  cep: Cep,
): LedgerEvent[] {
  const events: LedgerEvent[] = [];

  for (const cfdi of cfdis) {
    events.push({ type: "cfdi_received", at: cfdi.issuedAt, cfdi });
  }
  for (const complement of complements) {
    events.push({
      type: "complement_received",
      at: complement.paidAt,
      complement,
    });
  }
  for (const listVersion of [
    ...new Set(satEntries.map((e) => e.listVersion)),
  ]) {
    const entries = satEntries.filter((e) => e.listVersion === listVersion);
    events.push({
      type: "sat_list_published",
      at: `${listVersion}T12:00:00.000Z`,
      listVersion,
      entries,
    });
  }
  for (const instruction of instructions) {
    events.push({
      type: "instruction_received",
      at: instruction.receivedAt,
      instruction,
    });
  }
  events.push({
    type: "cep_verified",
    at: "2026-09-10T16:45:00.000Z",
    cep,
    supplierRfc: "SYN070707GGG",
  });
  for (const decision of decisions) {
    events.push({ type: "decision_made", at: decision.decidedAt, decision });
  }
  // Only the two instructions a person confirmed actually left the bank.
  events.push({
    type: "payment_sent",
    at: "2026-09-11T17:10:00.000Z",
    instructionId: instructionId(3),
    claveRastreo: "SYNSPEI20260911003",
  });
  events.push({
    type: "payment_sent",
    at: "2026-09-11T17:10:30.000Z",
    instructionId: instructionId(9),
    claveRastreo: "SYNSPEI20260911009",
  });

  return events.sort(
    (left, right) => Date.parse(left.at) - Date.parse(right.at),
  );
}

/* -------------------------------------------------------------------------- */
/* The dataset                                                                 */
/* -------------------------------------------------------------------------- */

export interface SyntheticDataset {
  companyRfc: string;
  companyName: string;
  runId: string;
  weekOf: string;
  suppliers: Supplier[];
  cfdis: Cfdi[];
  complements: PaymentComplement[];
  instructions: PaymentInstruction[];
  findings: Finding[];
  /** Finding ids per instruction id, including supplier-level findings. */
  findingsByInstruction: Record<string, string[]>;
  decisions: Decision[];
  satEntries: SatListEntry[];
  beneficiaries: VerifiedBeneficiary[];
  ledger: LedgerEvent[];
  labelledCases: LabelledCase[];
}

/**
 * Builds a fresh dataset on every call. Nothing is shared between two
 * repositories, so a test that appends an instruction cannot change what the
 * next test reads.
 */
export function createSyntheticDataset(): SyntheticDataset {
  const suppliers = SUPPLIERS.map((supplier) => ({
    ...supplier,
    knownAccounts: supplier.knownAccounts.map((account) => ({ ...account })),
  }));
  const cfdis = buildCfdis();
  const complements = buildComplements();
  const instructions = buildInstructions();
  const findings = buildFindings();
  const decisions = buildDecisions(findings);
  const satEntries = buildSatEntries();
  const beneficiaries = buildBeneficiaries();
  const ledger = buildLedger(
    cfdis,
    complements,
    instructions,
    decisions,
    satEntries,
    buildCep(),
  );

  const findingsByInstruction: Record<string, string[]> = {};
  for (const [id, ids] of Object.entries(FINDINGS_BY_INSTRUCTION)) {
    findingsByInstruction[id] = [...ids];
  }

  return {
    companyRfc: COMPANY_RFC,
    companyName: COMPANY_NAME,
    runId: RUN_ID,
    weekOf: WEEK_OF,
    suppliers,
    cfdis,
    complements,
    instructions,
    findings,
    findingsByInstruction,
    decisions,
    satEntries,
    beneficiaries,
    ledger,
    labelledCases: buildLabelledCases(),
  };
}
