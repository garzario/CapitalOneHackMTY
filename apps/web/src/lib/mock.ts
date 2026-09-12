/**
 * The synthetic payment run the app falls back to when the API is not there.
 *
 * Why it exists: the front has to be demonstrable on a phone in a corridor,
 * with no server, no database and no network, and it has to look exactly like
 * the real thing so that what a judge sees offline is what they see online.
 *
 * Three rules, all binding.
 *
 * 1. Every object in this file carries `synthetic: true`, because ADR-0002
 *    makes the watermark a property of the data and not of a screen. The
 *    factories below stamp the flag so it cannot be forgotten, and a test
 *    asserts it over the whole graph.
 * 2. Every RFC is synthetic, of the form SYN<6 digits><3 letters>. A real RFC
 *    only ever appears in the SAT lookup box a judge types into, never next to
 *    fabricated evidence.
 * 3. Nothing here is a measurement. Totals, exposure and metrics are computed
 *    from the rows below, so the arithmetic on screen is always internally
 *    consistent, and the numbers are replaced by the API the moment it answers.
 *
 * TODO(fabbyyyy): keep the identifiers in sync with the seed in packages/seed,
 * so the offline run and the seeded run are the same company and a screenshot
 * taken offline still matches the deployed demo.
 */

import type {
  Cep,
  Cfdi,
  Clabe,
  Decision,
  Detector,
  Finding,
  KnownAccount,
  LedgerEvent,
  Metrics,
  NetworkSignal,
  PaymentComplement,
  PaymentInstruction,
  Rfc,
  SatListEntry,
  Severity,
  Supplier,
  SweepResult,
} from "@hackmty/core";
import type {
  PaymentRun,
  PaymentRunItem,
  PaymentRunTotals,
  SatVersion,
  VerificationState,
  VerifiedBeneficiary,
} from "./contract";
import { notStartedVerification } from "./verification";

/** The company running the payment run. Synthetic, like everything else. */
export const COMPANY_RFC: Rfc = "SYN840101MTY";
export const COMPANY_NAME = "Manufacturas Integrales del Norte SA de CV";

/**
 * What the SentryOne consortium says about the two accounts in this run that have
 * a beneficiary story: the one the supplier has always been paid on, and the one
 * that arrived by WhatsApp this week.
 *
 * Both are synthetic, like the rest of this file, and they are the two shapes the
 * network actually produces. The corroborated one is a `snapshot` with tenants and
 * months; the fresh one is a `snapshot` with zero tenants and the supplier's other
 * accounts, which is the impersonation case and the reason the consortium exists.
 * `pulledAt` is set on both, because a signal with no pull instant is a signal
 * nobody can date.
 */
export const CORROBORATED_NETWORK: NetworkSignal = {
  source: "snapshot",
  tenants: 37,
  firstSeen: "2024-03-04",
  lastSeen: "2026-09-02",
  fraudReports: 0,
  otherAccounts: 1,
  pulledAt: "2026-09-11T06:00:00-06:00",
};

export const FRESH_ACCOUNT_NETWORK: NetworkSignal = {
  source: "snapshot",
  tenants: 0,
  fraudReports: 0,
  otherAccounts: 23,
  pulledAt: "2026-09-11T06:00:00-06:00",
};

/**
 * Display names for the bank code in the first three digits of a CLABE.
 *
 * TODO(fabbyyyy): the authoritative list is the SPEI participant catalogue.
 * Serve it from the API instead of keeping a copy in the client; this subset
 * exists only so the offline run can name the banks it shows.
 */
export const BANK_NAMES: Record<string, string> = {
  "002": "Banamex",
  "012": "BBVA Mexico",
  "014": "Santander",
  "072": "Banorte",
  "646": "STP",
};

export function bankName(clabe: Clabe): string {
  return bankNameFromCode(clabe.slice(0, 3));
}

/**
 * The same catalogue, addressed by the three-digit institution code on its own.
 * The API reports a change of bank as a pair of codes rather than a pair of
 * names, and "012 a 014" is not a sentence a clerk can act on.
 */
export function bankNameFromCode(code: string): string {
  return BANK_NAMES[code] ?? `Banco ${code}`;
}

/* ------------------------------------------------------------------ helpers */

function account(
  clabe: Clabe,
  establishedBy: KnownAccount["establishedBy"],
  establishedAt: string,
  timesPaid: number,
): KnownAccount {
  return { clabe, establishedBy, establishedAt, timesPaid };
}

function supplier(
  rfc: Rfc,
  legalName: string,
  firstInvoiceAt: string,
  knownAccounts: KnownAccount[],
): Supplier {
  return { rfc, legalName, knownAccounts, firstInvoiceAt, synthetic: true };
}

function cfdi(
  uuid: string,
  issuer: Supplier,
  issuedAt: string,
  subtotal: number,
  folio: string,
  paymentMethod: Cfdi["paymentMethod"] = "PUE",
): Cfdi {
  const iva = Math.round(subtotal * 0.16 * 100) / 100;

  return {
    uuid,
    serie: "A",
    folio,
    issuedAt,
    issuerRfc: issuer.rfc,
    issuerName: issuer.legalName,
    receiverRfc: COMPANY_RFC,
    subtotal,
    iva,
    total: Math.round((subtotal + iva) * 100) / 100,
    paymentMethod,
    paymentForm: "03",
    synthetic: true,
  };
}

function instruction(
  id: string,
  supplierRfc: Rfc,
  cfdiUuids: string[],
  clabe: Clabe,
  amount: number,
  source: PaymentInstruction["source"],
  receivedAt: string,
  extra: Partial<PaymentInstruction> = {},
): PaymentInstruction {
  return {
    id,
    supplierRfc,
    cfdiUuids,
    clabe,
    amount,
    source,
    receivedAt,
    synthetic: true,
    ...extra,
  };
}

function finding(
  id: string,
  detector: Detector,
  severity: Severity,
  state: Finding["state"],
  subject: Finding["subject"],
  amountAtRisk: number,
  explanation: string,
  evidence: Finding["evidence"],
  createdAt: string,
): Finding {
  return {
    id,
    detector,
    severity,
    state,
    subject,
    amountAtRisk,
    explanation,
    evidence,
    createdAt,
  };
}

function decision(
  instructionId: string,
  action: Decision["action"],
  expectedLoss: number,
  delayCostPerDay: number,
  findings: Finding[],
  decidedAt: string,
  decidedBy?: string,
): Decision {
  return {
    instructionId,
    action,
    expectedLoss,
    delayCostPerDay,
    findings,
    decidedAt,
    ...(decidedBy === undefined ? {} : { decidedBy }),
  };
}

/* ---------------------------------------------------------------- suppliers */

export const SUPPLIERS: Supplier[] = [
  supplier(
    "SYN010101AAA",
    "Refacciones Industriales del Bajio SA de CV",
    "2025-02-11",
    [account("012180009876543215", "payment_complement", "2025-03-04", 11)],
  ),
  supplier(
    "SYN020202BBB",
    "Servicios Logisticos Peninsular SA de CV",
    "2024-08-19",
    [account("012180001234567899", "payment_complement", "2024-09-02", 23)],
  ),
  supplier(
    "SYN030303CCC",
    "Aceros y Laminados del Golfo SA de CV",
    "2023-11-06",
    [account("014180007712345674", "payment_complement", "2023-12-01", 41)],
  ),
  supplier(
    "SYN040404DDD",
    "Empaques Flexibles Monterrey SA de CV",
    "2026-05-21",
    [account("002180003344556672", "instruction", "2026-06-03", 3)],
  ),
  supplier(
    "SYN050505EEE",
    "Mantenimiento Electromecanico Saltillo SA de CV",
    "2024-01-15",
    [account("072580004567123987", "payment_complement", "2024-02-09", 34)],
  ),
  supplier(
    "SYN060606FFF",
    "Transportes Unidos del Noreste SA de CV",
    "2025-07-30",
    [account("646180001122334458", "payment_complement", "2025-08-14", 9)],
  ),
  supplier(
    "SYN070707GGG",
    "Herramentales y Moldes del Norte SA de CV",
    "2022-04-27",
    [
      account("012180005544332215", "cep", "2026-09-02", 1),
      account("012180008899001120", "payment_complement", "2022-05-30", 52),
    ],
  ),
  supplier(
    "SYN080808HHH",
    "Suministros Quimicos Apodaca SA de CV",
    "2025-10-08",
    [account("072180006655443320", "payment_complement", "2025-11-04", 14)],
  ),
];

const byRfc = new Map(SUPPLIERS.map((item) => [item.rfc, item]));

function supplierByRfc(rfc: Rfc): Supplier {
  const found = byRfc.get(rfc);

  if (!found) {
    throw new Error(`Mock data references an unknown supplier: ${rfc}`);
  }

  return found;
}

/* -------------------------------------------------------------------- cfdis */

export const CFDIS: Cfdi[] = [
  cfdi(
    "a1b2c3d4-0001-4000-8000-000000000001",
    supplierByRfc("SYN010101AAA"),
    "2026-08-28",
    158879.31,
    "4417",
  ),
  cfdi(
    "a1b2c3d4-0001-4000-8000-000000000002",
    supplierByRfc("SYN010101AAA"),
    "2026-06-12",
    214300.0,
    "4102",
  ),
  cfdi(
    "a1b2c3d4-0001-4000-8000-000000000003",
    supplierByRfc("SYN010101AAA"),
    "2026-04-03",
    369700.0,
    "3980",
  ),
  cfdi(
    "a1b2c3d4-0002-4000-8000-000000000000",
    supplierByRfc("SYN020202BBB"),
    "2026-06-20",
    61551.72,
    "0840",
    "PPD",
  ),
  cfdi(
    "a1b2c3d4-0002-4000-8000-000000000001",
    supplierByRfc("SYN020202BBB"),
    "2026-09-01",
    83121.12,
    "0912",
  ),
  cfdi(
    "a1b2c3d4-0003-4000-8000-000000000001",
    supplierByRfc("SYN030303CCC"),
    "2026-08-25",
    355926.72,
    "7781",
    "PPD",
  ),
  cfdi(
    "a1b2c3d4-0003-4000-8000-000000000002",
    supplierByRfc("SYN030303CCC"),
    "2026-08-26",
    355926.72,
    "7788",
    "PPD",
  ),
  cfdi(
    "a1b2c3d4-0004-4000-8000-000000000001",
    supplierByRfc("SYN040404DDD"),
    "2026-09-03",
    50853.45,
    "0221",
  ),
  cfdi(
    "a1b2c3d4-0005-4000-8000-000000000001",
    supplierByRfc("SYN050505EEE"),
    "2026-09-04",
    19957.54,
    "5540",
  ),
  cfdi(
    "a1b2c3d4-0007-4000-8000-000000000000",
    supplierByRfc("SYN070707GGG"),
    "2026-07-25",
    163793.1,
    "8866",
    "PPD",
  ),
  cfdi(
    "a1b2c3d4-0007-4000-8000-000000000001",
    supplierByRfc("SYN070707GGG"),
    "2026-08-31",
    231379.31,
    "9012",
  ),
  cfdi(
    "a1b2c3d4-0008-4000-8000-000000000001",
    supplierByRfc("SYN080808HHH"),
    "2026-09-05",
    27569.31,
    "1180",
  ),
];

/**
 * Payment complements from earlier months. They matter because a complement is
 * where a known account comes from: the supplier itself states, in a stamped
 * document, the account on which it received the money.
 */
export const COMPLEMENTS: PaymentComplement[] = [
  {
    uuid: "b7c8d9e0-0002-4000-8000-000000000001",
    relatedCfdiUuid: "a1b2c3d4-0002-4000-8000-000000000000",
    paidAt: "2026-07-04",
    paidAmount: 71400.0,
    beneficiaryAccount: "012180001234567899",
    beneficiaryBankRfc: "SYN991231BBV",
    synthetic: true,
  },
  {
    uuid: "b7c8d9e0-0007-4000-8000-000000000001",
    relatedCfdiUuid: "a1b2c3d4-0007-4000-8000-000000000000",
    paidAt: "2026-08-06",
    paidAmount: 190000.0,
    beneficiaryAccount: "012180008899001120",
    beneficiaryBankRfc: "SYN991231BBV",
    synthetic: true,
  },
];

/* ------------------------------------------------------------------- run --- */

const WEEK_OF = "2026-09-07";

/**
 * One row per detector, plus two clean payments so the screen is not a wall of
 * alerts. A run where everything is flagged teaches a clerk to ignore the tool.
 *
 * TODO(garzario): `expectedLoss` and `delayCostPerDay` are shaped like the
 * output of the decision model, not computed by it. The real values come from
 * packages/core weighing the amount at risk against the cost of holding the
 * payment one more day.
 */
const RAW_ITEMS: Array<{
  instruction: PaymentInstruction;
  findings: Finding[];
  decision: Decision;
}> = (() => {
  const i1 = instruction(
    "ins-2026w37-001",
    "SYN010101AAA",
    ["a1b2c3d4-0001-4000-8000-000000000001"],
    "012180009876543215",
    184300.0,
    "email",
    "2026-09-08T09:14:00-06:00",
    { text: "Adjunto factura 4417 para pago de esta semana." },
  );
  const f1 = finding(
    "fnd-001",
    "sat_69b",
    "critical",
    "comprobable",
    { kind: "supplier", id: "SYN010101AAA" },
    184300.0,
    "El proveedor aparece como definitivo en la lista del articulo 69-B publicada el 28 de agosto de 2026. Pagar esta factura no es deducible y las deducciones anteriores quedan sin efecto.",
    {
      rfc: "SYN010101AAA",
      estado: "definitivo",
      version_lista: "2026-08-28",
      publicado_en_dof: "2026-08-28",
      cfdis_ya_deducidos: 2,
      base_deducida: 584000.0,
    },
    "2026-09-08T09:14:06-06:00",
  );
  const d1 = decision(
    "ins-2026w37-001",
    "hold",
    184300.0,
    420.0,
    [f1],
    "2026-09-08T09:14:06-06:00",
  );

  const i2 = instruction(
    "ins-2026w37-002",
    "SYN020202BBB",
    ["a1b2c3d4-0002-4000-8000-000000000001"],
    "012180101234567799",
    96420.5,
    "whatsapp",
    "2026-09-09T18:41:00-06:00",
    {
      text: "Buenas tardes, cambiamos de cuenta. Favor de depositar a la CLABE 0121 8010 1234 5677 99.",
    },
  );
  const f2 = finding(
    "fnd-002",
    "clabe_forensics",
    "critical",
    "requiere_verificacion",
    { kind: "instruction", id: "ins-2026w37-002" },
    96420.5,
    "La CLABE no es la que este proveedor ha cobrado 23 veces. Cambian dos digitos, el digito de control es valido y la cuenta no tiene historial de pago. Confirmar por telefono con un numero que ya teniamos, no con el del mensaje.",
    {
      clabe_propuesta: "012180101234567799",
      clabe_conocida: "012180001234567899",
      digitos_distintos: 2,
      posiciones: "7, 16",
      mismo_banco: true,
      digito_control_valido: true,
      pagos_previos_a_esta_cuenta: 0,
      canal: "whatsapp",
      /* The account that arrived by message is not in the network either, while the
         supplier's own accounts are. That is the sentence that makes this finding
         land: other companies pay this supplier, none of them pays it here. */
      network: FRESH_ACCOUNT_NETWORK,
    },
    "2026-09-09T18:41:03-06:00",
  );
  const d2 = decision(
    "ins-2026w37-002",
    "verify",
    28926.15,
    260.0,
    [f2],
    "2026-09-09T18:41:03-06:00",
  );

  const i3 = instruction(
    "ins-2026w37-003",
    "SYN030303CCC",
    ["a1b2c3d4-0003-4000-8000-000000000002"],
    "014180007712345674",
    412875.0,
    "portal",
    "2026-09-09T11:02:00-06:00",
  );
  const f3 = finding(
    "fnd-003",
    "duplicate_invoice",
    "critical",
    "comprobable",
    { kind: "cfdi", id: "a1b2c3d4-0003-4000-8000-000000000002" },
    412875.0,
    "Mismo emisor, mismo importe y un dia de diferencia contra la factura 7781, que ya esta programada en esta corrida. Los folios son distintos, los conceptos son identicos.",
    {
      uuid: "a1b2c3d4-0003-4000-8000-000000000002",
      uuid_original: "a1b2c3d4-0003-4000-8000-000000000001",
      folio: "7788",
      folio_original: "7781",
      diferencia_dias: 1,
      importe: 412875.0,
      conceptos_identicos: true,
    },
    "2026-09-09T11:02:02-06:00",
  );
  const d3 = decision(
    "ins-2026w37-003",
    "hold",
    412875.0,
    180.0,
    [f3],
    "2026-09-09T11:02:02-06:00",
  );

  const i4 = instruction(
    "ins-2026w37-004",
    "SYN040404DDD",
    ["a1b2c3d4-0004-4000-8000-000000000001"],
    "002180003344556672",
    58990.0,
    "pdf",
    "2026-09-10T08:26:00-06:00",
    { imageRef: "img-ins-004", ocrConfidence: 0.93 },
  );
  const f4 = finding(
    "fnd-004",
    "supplier_behaviour",
    "warning",
    "requiere_verificacion",
    { kind: "supplier", id: "SYN040404DDD" },
    58990.0,
    "El proveedor facturaba 12 mil pesos al mes desde mayo y este mes factura 59 mil. Son cuatro meses de historia, muy poco para concluir algo: se marca para revisar, no para retener.",
    {
      meses_de_historia: 4,
      promedio_mensual: 12480.0,
      importe_actual: 58990.0,
      veces_el_promedio: 4.7,
      muestra_suficiente: false,
    },
    "2026-09-10T08:26:04-06:00",
  );
  const d4 = decision(
    "ins-2026w37-004",
    "verify",
    5899.0,
    140.0,
    [f4],
    "2026-09-10T08:26:04-06:00",
  );

  const i5 = instruction(
    "ins-2026w37-005",
    "SYN050505EEE",
    ["a1b2c3d4-0005-4000-8000-000000000001"],
    "072580004567123987",
    23150.75,
    "portal",
    "2026-09-10T10:05:00-06:00",
  );
  const d5 = decision(
    "ins-2026w37-005",
    "release",
    0,
    95.0,
    [],
    "2026-09-10T10:05:01-06:00",
    "clerk@demo",
  );

  const i6 = instruction(
    "ins-2026w37-006",
    "SYN060606FFF",
    [],
    "646180001122334458",
    76500.0,
    "manual",
    "2026-09-10T16:48:00-06:00",
  );
  const f6 = finding(
    "fnd-006",
    "bank_reconciliation",
    "warning",
    "requiere_verificacion",
    { kind: "instruction", id: "ins-2026w37-006" },
    76500.0,
    "La instruccion no trae ningun CFDI detras y el banco ya registra dos salidas a esta cuenta este mes sin factura asociada. Puede ser un anticipo legitimo, hay que documentarlo antes de pagar.",
    {
      cfdis_relacionados: 0,
      salidas_sin_documento_mes: 2,
      importe_sin_documento: 153000.0,
      origen: "captura manual",
    },
    "2026-09-10T16:48:05-06:00",
  );
  const d6 = decision(
    "ins-2026w37-006",
    "verify",
    15300.0,
    210.0,
    [f6],
    "2026-09-10T16:48:05-06:00",
  );

  const i7 = instruction(
    "ins-2026w37-007",
    "SYN070707GGG",
    ["a1b2c3d4-0007-4000-8000-000000000001"],
    "012180005544332215",
    268400.0,
    "email",
    "2026-09-11T09:33:00-06:00",
  );
  const f7 = finding(
    "fnd-007",
    "beneficiary_cep",
    "info",
    "comprobable",
    { kind: "instruction", id: "ins-2026w37-007" },
    0,
    "La cuenta es nueva, pero ya se verifico con un SPEI de un centavo el 2 de septiembre: el CEP que firma Banxico trae el mismo titular que la razon social del CFDI.",
    {
      clave_rastreo: "CEP20260902SYN0707",
      firma_valida: true,
      comparacion_nombre: "match",
      titular_cep: "Herramentales y Moldes del Norte SA de CV",
      razon_social_cfdi: "Herramentales y Moldes del Norte SA de CV",
      verificado_el: "2026-09-02",
      /* The corroborated case, so the offline run shows the consortium line the
         way the API's own findings carry it. The network in the demo is synthetic
         and `packages/consortium/README.md` says so. */
      network: CORROBORATED_NETWORK,
    },
    "2026-09-11T09:33:02-06:00",
  );
  const d7 = decision(
    "ins-2026w37-007",
    "release",
    0,
    640.0,
    [f7],
    "2026-09-11T09:33:02-06:00",
    "clerk@demo",
  );

  const i8 = instruction(
    "ins-2026w37-008",
    "SYN080808HHH",
    ["a1b2c3d4-0008-4000-8000-000000000001"],
    "072180006655443320",
    31980.4,
    "portal",
    "2026-09-11T12:19:00-06:00",
  );
  const d8 = decision(
    "ins-2026w37-008",
    "release",
    0,
    110.0,
    [],
    "2026-09-11T12:19:01-06:00",
  );

  return [
    { instruction: i1, findings: [f1], decision: d1 },
    { instruction: i2, findings: [f2], decision: d2 },
    { instruction: i3, findings: [f3], decision: d3 },
    { instruction: i4, findings: [f4], decision: d4 },
    { instruction: i5, findings: [], decision: d5 },
    { instruction: i6, findings: [f6], decision: d6 },
    { instruction: i7, findings: [f7], decision: d7 },
    { instruction: i8, findings: [], decision: d8 },
  ];
})();

export const RUN_ITEMS: PaymentRunItem[] = RAW_ITEMS.map((raw) => ({
  instruction: raw.instruction,
  supplier: supplierByRfc(raw.instruction.supplierRfc),
  decision: raw.decision,
  findings: raw.findings,
}));

/**
 * Totals are derived, never typed in. A total that disagrees with the rows
 * under it is the fastest way to lose a judge, and deriving it removes the
 * possibility.
 */
export function totalsFor(items: PaymentRunItem[]): PaymentRunTotals {
  const sumWhere = (action: Decision["action"]) =>
    items
      .filter((item) => item.decision.action === action)
      .reduce((total, item) => total + item.instruction.amount, 0);

  return {
    instructions: items.length,
    amount: items.reduce((total, item) => total + item.instruction.amount, 0),
    held: sumWhere("hold"),
    toVerify: sumWhere("verify"),
    released: sumWhere("release"),
  };
}

export const MOCK_RUN: PaymentRun = {
  id: "run-2026-w37",
  weekOf: WEEK_OF,
  totals: totalsFor(RUN_ITEMS),
  items: RUN_ITEMS,
};

export function mockRun(): PaymentRun {
  return MOCK_RUN;
}

export function mockInstruction(id: string): PaymentRunItem | null {
  return RUN_ITEMS.find((item) => item.instruction.id === id) ?? null;
}

export function mockSupplierDetail(rfc: Rfc) {
  const found = byRfc.get(rfc);

  if (!found) {
    return null;
  }

  return {
    supplier: found,
    cfdis: CFDIS.filter((item) => item.issuerRfc === rfc),
    complements: COMPLEMENTS.filter((complement) =>
      CFDIS.some(
        (item) =>
          item.uuid === complement.relatedCfdiUuid && item.issuerRfc === rfc,
      ),
    ),
    findings: RUN_ITEMS.flatMap((item) =>
      item.supplier.rfc === rfc ? item.findings : [],
    ),
    verifiedBeneficiaries: BENEFICIARIES.filter(
      (entry) => entry.supplierRfc === rfc,
    ),
  };
}

/* ---------------------------------------------------------------------- sat */

export const SAT_VERSIONS: SatVersion[] = [
  { listVersion: "2026-02-14", publishedAt: "2026-02-14", rows: 12480 },
  { listVersion: "2026-05-09", publishedAt: "2026-05-09", rows: 12744 },
  { listVersion: "2026-08-28", publishedAt: "2026-08-28", rows: 12961 },
];

export const SAT_ENTRIES: SatListEntry[] = [
  {
    rfc: "SYN010101AAA",
    name: "Refacciones Industriales del Bajio SA de CV",
    status: "presunto",
    publishedAt: "2026-05-09",
    listVersion: "2026-05-09",
  },
  {
    rfc: "SYN010101AAA",
    name: "Refacciones Industriales del Bajio SA de CV",
    status: "definitivo",
    publishedAt: "2026-08-28",
    listVersion: "2026-08-28",
  },
];

/** Statutory rates, used only to show what a sweep computes offline. */
const ISR_RATE = 0.3;
const IVA_RATE = 0.16;

/**
 * The retroactive sweep for the synthetic supplier that turned definitivo.
 * Exposure is computed from the CFDIs above so the three numbers on screen
 * always add up to the rows behind them.
 *
 * TODO(garzario): the real SweepResult comes from the replay in packages/core
 * over the ledger, not from this arithmetic.
 */
export function mockSweep(listVersion = "2026-08-28"): SweepResult {
  const listed = supplierByRfc("SYN010101AAA");
  const paidCfdis = CFDIS.filter(
    (item) => item.issuerRfc === listed.rfc && item.issuedAt < "2026-08-01",
  );
  const deductedBase = paidCfdis.reduce(
    (total, item) => total + item.subtotal,
    0,
  );
  const isrExposure = Math.round(deductedBase * ISR_RATE * 100) / 100;
  const ivaExposure = Math.round(deductedBase * IVA_RATE * 100) / 100;

  return {
    listVersion,
    newlyListed: [
      {
        supplier: listed,
        status: "definitivo",
        paidCfdis,
        deductedBase,
        isrExposure,
        ivaExposure,
      },
    ],
    totalExposure: Math.round((isrExposure + ivaExposure) * 100) / 100,
  };
}

/* ---------------------------------------------------------------------- cep */

export const MOCK_CEP: Cep = {
  claveRastreo: "CEP20260902SYN0707",
  transferredAt: "2026-09-02T11:14:27-06:00",
  amount: 0.01,
  senderName: COMPANY_NAME,
  senderBank: "BBVA Mexico",
  beneficiaryName: "Herramentales y Moldes del Norte SA de CV",
  beneficiaryAccount: "012180005544332215",
  beneficiaryBank: "BBVA Mexico",
  signatureValid: true,
  xml: '<?xml version="1.0" encoding="UTF-8"?><SPEI_Tercero xmlns="http://www.banxico.org.mx/comprobante" synthetic="true"><!-- TODO(fabbyyyy): the real CEP XML is served byte exact by the API, because XMLDSig validates the bytes and not a re-serialisation. --></SPEI_Tercero>',
  synthetic: true,
};

export const BENEFICIARIES: VerifiedBeneficiary[] = [
  {
    supplierRfc: "SYN070707GGG",
    clabe: "012180005544332215",
    cep: MOCK_CEP,
    verifiedAt: "2026-09-02T11:16:03-06:00",
  },
];

/* --------------------------------------------------- one-cent verification */

/**
 * The one-cent verification, one instruction per state.
 *
 * All six states are here, on six different rows, because the screen that
 * renders them has to be demonstrable with no API behind it and a fixture that
 * only carries the happy ending proves nothing about the other five. A test in
 * `verification.test.ts` fails when a state loses its row.
 *
 * The names are the interesting part. `-004` is the partial match a bank
 * produces by truncating a legal name, which is a question and not an
 * accusation, and its seal is `not_checked` because a deployment with no
 * Banxico certificate verified nothing: that row is the one that proves the
 * screen never prints "valido" for a seal nobody checked. `-006` is the
 * mismatch. `-007` is the account the registry above already holds, so the
 * verified beneficiary, the CEP and the finding in the run all tell one story.
 */
export const VERIFICATIONS: Record<string, VerificationState> = {
  "ins-2026w37-002": {
    instructionId: "ins-2026w37-002",
    state: "cent_sent",
    rail: "nessie",
    claveRastreo: "SYN20260909MTY00412",
    centSentAt: "2026-09-09T18:44:12-06:00",
    cepAt: null,
    sealState: null,
    holderName: null,
    legalName: "Servicios Logisticos Peninsular SA de CV",
    nameMatch: null,
    decision: null,
    updatedAt: "2026-09-09T18:44:12-06:00",
  },
  "ins-2026w37-003": {
    instructionId: "ins-2026w37-003",
    state: "awaiting_cep",
    rail: "nessie",
    claveRastreo: "SYN20260909MTY00417",
    centSentAt: "2026-09-09T11:05:40-06:00",
    cepAt: null,
    sealState: null,
    holderName: null,
    legalName: "Aceros y Laminados del Golfo SA de CV",
    nameMatch: null,
    decision: null,
    updatedAt: "2026-09-09T11:06:10-06:00",
  },
  "ins-2026w37-004": {
    instructionId: "ins-2026w37-004",
    state: "cep_signed",
    rail: "nessie",
    claveRastreo: "SYN20260910MTY00423",
    centSentAt: "2026-09-10T08:29:02-06:00",
    cepAt: "2026-09-10T09:14:55-06:00",
    sealState: "not_checked",
    holderName: "EMPAQUES FLEXIBLES MTY SA DE C",
    legalName: "Empaques Flexibles Monterrey SA de CV",
    nameMatch: "partial",
    decision: null,
    updatedAt: "2026-09-10T09:14:55-06:00",
  },
  "ins-2026w37-006": {
    instructionId: "ins-2026w37-006",
    state: "blocked",
    rail: "nessie",
    claveRastreo: "SYN20260910MTY00431",
    centSentAt: "2026-09-10T16:52:20-06:00",
    cepAt: "2026-09-10T17:31:09-06:00",
    sealState: "valid",
    holderName: "Comercializadora Sintetica del Valle SA de CV",
    legalName: "Transportes Unidos del Noreste SA de CV",
    nameMatch: "mismatch",
    decision: decision(
      "ins-2026w37-006",
      "hold",
      76500.0,
      210.0,
      [],
      "2026-09-10T17:31:09-06:00",
      "system",
    ),
    updatedAt: "2026-09-10T17:31:09-06:00",
  },
  "ins-2026w37-007": {
    instructionId: "ins-2026w37-007",
    state: "released",
    rail: "nessie",
    claveRastreo: MOCK_CEP.claveRastreo,
    centSentAt: MOCK_CEP.transferredAt,
    cepAt: "2026-09-02T11:16:03-06:00",
    sealState: "valid",
    holderName: MOCK_CEP.beneficiaryName,
    legalName: "Herramentales y Moldes del Norte SA de CV",
    nameMatch: "match",
    decision: decision(
      "ins-2026w37-007",
      "release",
      0,
      640.0,
      [],
      "2026-09-11T09:33:02-06:00",
      "system",
    ),
    updatedAt: "2026-09-11T09:33:02-06:00",
  },
};

/**
 * The verification of one instruction, offline.
 *
 * An instruction of the run with no row above has simply never been probed, so
 * it answers `not_started` rather than nothing: an empty answer would render as
 * a failure, and "nobody has verified this account" is a state and not an
 * error. A folio this run does not contain answers null, which is what makes a
 * typed-in mistake visible.
 */
export function mockVerification(
  instructionId: string,
): VerificationState | null {
  const carried = VERIFICATIONS[instructionId];

  if (carried !== undefined) {
    return carried;
  }

  return mockInstruction(instructionId) === null
    ? null
    : notStartedVerification(instructionId, `${WEEK_OF}T00:00:00-06:00`);
}

/* ------------------------------------------------------------------ metrics */

/**
 * Placeholder counts, not a measurement. They are shaped like the real thing
 * so the table can be built, and the screen says out loud that the blind
 * evaluation has not run yet whenever it is showing these.
 *
 * TODO(FabriBanda): replace with the labelled holdout result. ADR-0002 gives
 * the cases to a different person from the detectors precisely so the numbers
 * the API returns are blind.
 */
const PLACEHOLDER_COUNTS: Record<
  Detector,
  { tp: number; fp: number; fn: number }
> = {
  sat_69b: { tp: 9, fp: 0, fn: 0 },
  clabe_forensics: { tp: 11, fp: 2, fn: 1 },
  duplicate_invoice: { tp: 8, fp: 1, fn: 1 },
  supplier_behaviour: { tp: 5, fp: 3, fn: 2 },
  beneficiary_cep: { tp: 4, fp: 0, fn: 0 },
  bank_reconciliation: { tp: 4, fp: 1, fn: 1 },
};

export function metricsFrom(
  cases: number,
  perDetector: Record<Detector, { tp: number; fp: number; fn: number }>,
): Metrics {
  const detectors = Object.values(perDetector);
  const truePositives = detectors.reduce((total, item) => total + item.tp, 0);
  const falsePositives = detectors.reduce((total, item) => total + item.fp, 0);
  const falseNegatives = detectors.reduce((total, item) => total + item.fn, 0);
  const positives = truePositives + falseNegatives;
  const negatives = Math.max(cases - positives, 0);
  const ratio = (numerator: number, denominator: number) =>
    denominator === 0 ? 0 : numerator / denominator;

  return {
    cases,
    truePositives,
    falsePositives,
    falseNegatives,
    precision: ratio(truePositives, truePositives + falsePositives),
    recall: ratio(truePositives, positives),
    falsePositiveRate: ratio(falsePositives, negatives),
    perDetector,
  };
}

export const MOCK_METRICS: Metrics = metricsFrom(120, PLACEHOLDER_COUNTS);

/* ------------------------------------------------------------------- ledger */

/**
 * The ledger the timeline replays, derived from the rows above so the events
 * and the table can never tell two different stories.
 */
export function mockLedger(): LedgerEvent[] {
  const events: LedgerEvent[] = [];

  for (const item of RUN_ITEMS) {
    events.push({
      type: "instruction_received",
      at: item.instruction.receivedAt,
      instruction: item.instruction,
    });
  }

  events.push({
    type: "cep_verified",
    at: "2026-09-02T11:16:03-06:00",
    cep: MOCK_CEP,
    supplierRfc: "SYN070707GGG",
  });

  events.push({
    type: "sat_list_published",
    at: "2026-08-28T06:00:00-06:00",
    listVersion: "2026-08-28",
    entries: SAT_ENTRIES.filter((entry) => entry.listVersion === "2026-08-28"),
  });

  for (const item of RUN_ITEMS) {
    events.push({
      type: "decision_made",
      at: item.decision.decidedAt,
      decision: item.decision,
    });
  }

  return events.sort((a, b) => a.at.localeCompare(b.at));
}

/** Every alert in the run, sorted the way the rail shows them. */
export function mockFindings(): Finding[] {
  return RUN_ITEMS.flatMap((item) => item.findings).sort(
    (a, b) => b.amountAtRisk - a.amountAtRisk,
  );
}
