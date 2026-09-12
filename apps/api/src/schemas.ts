/**
 * Every request and every response of the API, as zod schemas.
 *
 * Two rules hold this file together:
 *
 * 1. **The domain types are the source of truth.** Each schema that mirrors a
 *    type from `packages/core/src/domain.ts` carries
 *    `satisfies z.ZodType<TheDomainType>`. If somebody adds a field to the
 *    domain and forgets the API, `bun run typecheck` fails here instead of the
 *    web app discovering it at 03:00.
 * 2. **The API never invents a second shape.** The only types declared in this
 *    file that are not in the domain are the compositions docs/09-api.md
 *    names: `PaymentRun`, the instruction detail, the supplier drawer, the SAT
 *    version summary, the verified-beneficiary row and the CEP verification
 *    result. Each is a container of domain objects, never a reshaping of one.
 *
 * Money stays a plain number in MXN major units on the wire. The rounding rules
 * live in @hackmty/core and the storage type is numeric(14,2) in Postgres, so
 * nothing here is allowed to do arithmetic.
 */

import type {
  Cep,
  Cfdi,
  Decision,
  Finding,
  KnownAccount,
  LedgerEvent,
  Metrics,
  PaymentComplement,
  PaymentInstruction,
  SatListEntry,
  Supplier,
  SweepResult,
} from "@hackmty/core";
import { z } from "zod";

/* -------------------------------------------------------------------------- */
/* Primitives                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Moral persons carry three letters, physical persons four, then six digits of
 * date and three characters of homoclave. Synthetic RFCs in this repo start
 * with SYN (for example SYN010101AAA) and match the same shape on purpose, so
 * the validation path a judge exercises is the real one.
 */
export const RFC_PATTERN = /^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/;
export const rfcSchema = z.string().regex(RFC_PATTERN, "RFC shape");

/** 18 digits. The check digit itself is verified by the detector, not here. */
export const CLABE_PATTERN = /^\d{18}$/;
export const clabeSchema = z.string().regex(CLABE_PATTERN, "18-digit CLABE");

/** CFDI folios fiscales are UUIDs, written uppercase by the PAC. */
export const UUID_PATTERN =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
export const uuidSchema = z.string().regex(UUID_PATTERN, "CFDI UUID");

/** An instant. Nessie has none of these, which is why our ledger exists. */
export const instantSchema = z.iso.datetime({ offset: true });

/** A calendar day, for a DOF publication or the week a payment run belongs to. */
export const daySchema = z.iso.date();

/** DOF publications are announced by day; some feeds carry the full instant. */
export const publicationDateSchema = z.union([daySchema, instantSchema]);

/** Always positive and in MXN major units. The sign lives in the direction. */
export const amountSchema = z.number().positive().finite();

/* -------------------------------------------------------------------------- */
/* Domain mirrors                                                              */
/* -------------------------------------------------------------------------- */

export const knownAccountSchema = z.object({
  clabe: clabeSchema,
  establishedBy: z.enum(["payment_complement", "instruction", "cep"]),
  establishedAt: instantSchema,
  timesPaid: z.number().int().nonnegative(),
}) satisfies z.ZodType<KnownAccount>;

export const supplierSchema = z.object({
  rfc: rfcSchema,
  legalName: z.string().min(1),
  knownAccounts: z.array(knownAccountSchema),
  firstInvoiceAt: instantSchema,
  /** Absent means the relationship has not been priced. See `supplierModelOf`. */
  delayCostPerDay: z.number().nonnegative().optional(),
  synthetic: z.boolean(),
}) satisfies z.ZodType<Supplier>;

export const cfdiSchema = z.object({
  uuid: uuidSchema,
  serie: z.string().min(1).optional(),
  folio: z.string().min(1).optional(),
  issuedAt: instantSchema,
  issuerRfc: rfcSchema,
  issuerName: z.string().min(1),
  receiverRfc: rfcSchema,
  subtotal: z.number().nonnegative(),
  iva: z.number().nonnegative(),
  total: amountSchema,
  paymentMethod: z.enum(["PUE", "PPD"]),
  paymentForm: z.string().min(1).optional(),
  synthetic: z.boolean(),
}) satisfies z.ZodType<Cfdi>;

export const paymentComplementSchema = z.object({
  uuid: uuidSchema,
  relatedCfdiUuid: uuidSchema,
  paidAt: instantSchema,
  paidAmount: amountSchema,
  /** Monto of the Pago node: what left the bank in one transfer. */
  paymentTotal: amountSchema.optional(),
  /** NumOperacion, the clave de rastreo the CEP is located by. */
  operationNumber: z.string().min(1).optional(),
  beneficiaryAccount: clabeSchema.optional(),
  beneficiaryBankRfc: z.string().min(1).optional(),
  synthetic: z.boolean(),
}) satisfies z.ZodType<PaymentComplement>;

export const instructionSourceSchema = z.enum([
  "email",
  "whatsapp",
  "pdf",
  "portal",
  "manual",
]);

export const paymentInstructionSchema = z.object({
  id: z.string().min(1),
  supplierRfc: rfcSchema,
  cfdiUuids: z.array(uuidSchema),
  clabe: clabeSchema,
  amount: amountSchema,
  source: instructionSourceSchema,
  receivedAt: instantSchema,
  text: z.string().optional(),
  imageRef: z.string().min(1).optional(),
  ocrConfidence: z.number().min(0).max(1).optional(),
  /** Set once the company marked the SPEI as sent. Absent while still pending. */
  sentAt: instantSchema.optional(),
  synthetic: z.boolean(),
}) satisfies z.ZodType<PaymentInstruction>;

export const satListStatusSchema = z.enum([
  "presunto",
  "desvirtuado",
  "definitivo",
  "sentencia_favorable",
]);

export const satListEntrySchema = z.object({
  rfc: rfcSchema,
  name: z.string().min(1),
  status: satListStatusSchema,
  publishedAt: publicationDateSchema,
  listVersion: z.string().min(1),
}) satisfies z.ZodType<SatListEntry>;

export const cepSchema = z.object({
  claveRastreo: z.string().min(1).max(40),
  transferredAt: instantSchema,
  amount: amountSchema,
  senderName: z.string().min(1),
  senderBank: z.string().min(1),
  senderAccount: clabeSchema.optional(),
  beneficiaryName: z.string().min(1),
  beneficiaryAccount: clabeSchema,
  beneficiaryBank: z.string().min(1),
  /** "NA" when the bank sent none, so this is not the RFC shape. */
  beneficiaryRfc: z.string().min(1).optional(),
  concepto: z.string().optional(),
  numeroCertificado: z.string().min(1).optional(),
  signatureValid: z.boolean(),
  /** Why `signatureValid` is what it is. `unconfirmed_scheme` reads as not verified. */
  signatureReason: z.string().min(1).optional(),
  xml: z.string(),
  synthetic: z.boolean(),
}) satisfies z.ZodType<Cep>;

export const detectorSchema = z.enum([
  "sat_69b",
  "clabe_forensics",
  "duplicate_invoice",
  "supplier_behaviour",
  "beneficiary_cep",
  "bank_reconciliation",
]);

export const severitySchema = z.enum(["info", "warning", "critical"]);

/** Never an accusation: a finding is provable, or it needs a human check. */
export const findingStateSchema = z.enum([
  "comprobable",
  "requiere_verificacion",
]);

export const findingSchema = z.object({
  id: z.string().min(1),
  detector: detectorSchema,
  severity: severitySchema,
  state: findingStateSchema,
  subject: z.object({
    /** `ledger_tx` is a row of the bank mirror, used when money left with no document. */
    kind: z.enum(["instruction", "cfdi", "supplier", "ledger_tx"]),
    id: z.string().min(1),
  }),
  amountAtRisk: z.number().nonnegative(),
  explanation: z.string().min(1),
  evidence: z.record(
    z.string(),
    z.union([z.string(), z.number(), z.boolean()]),
  ),
  createdAt: instantSchema,
}) satisfies z.ZodType<Finding>;

export const actionSchema = z.enum(["hold", "verify", "release"]);

export const decisionSchema = z.object({
  instructionId: z.string().min(1),
  action: actionSchema,
  expectedLoss: z.number().nonnegative(),
  delayCostPerDay: z.number().nonnegative(),
  findings: z.array(findingSchema),
  decidedAt: instantSchema,
  decidedBy: z.string().min(1).optional(),
}) satisfies z.ZodType<Decision>;

export const ledgerEventSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("cfdi_received"),
    at: instantSchema,
    cfdi: cfdiSchema,
  }),
  z.object({
    type: z.literal("complement_received"),
    at: instantSchema,
    complement: paymentComplementSchema,
  }),
  z.object({
    type: z.literal("instruction_received"),
    at: instantSchema,
    instruction: paymentInstructionSchema,
  }),
  z.object({
    type: z.literal("payment_sent"),
    at: instantSchema,
    instructionId: z.string().min(1),
    claveRastreo: z.string().min(1).optional(),
  }),
  z.object({
    type: z.literal("sat_list_published"),
    at: instantSchema,
    listVersion: z.string().min(1),
    entries: z.array(satListEntrySchema),
  }),
  z.object({
    type: z.literal("cep_verified"),
    at: instantSchema,
    cep: cepSchema,
    supplierRfc: rfcSchema,
  }),
  z.object({
    type: z.literal("decision_made"),
    at: instantSchema,
    decision: decisionSchema,
  }),
]) satisfies z.ZodType<LedgerEvent>;

export const sweepResultSchema = z.object({
  listVersion: z.string().min(1),
  newlyListed: z.array(
    z.object({
      supplier: supplierSchema,
      status: satListStatusSchema,
      paidCfdis: z.array(cfdiSchema),
      deductedBase: z.number().nonnegative(),
      isrExposure: z.number().nonnegative(),
      ivaExposure: z.number().nonnegative(),
    }),
  ),
  totalExposure: z.number().nonnegative(),
}) satisfies z.ZodType<SweepResult>;

export const metricsSchema = z.object({
  cases: z.number().int().nonnegative(),
  truePositives: z.number().int().nonnegative(),
  falsePositives: z.number().int().nonnegative(),
  falseNegatives: z.number().int().nonnegative(),
  precision: z.number().min(0).max(1),
  recall: z.number().min(0).max(1),
  falsePositiveRate: z.number().min(0).max(1),
  perDetector: z.record(
    detectorSchema,
    z.object({
      tp: z.number().int().nonnegative(),
      fp: z.number().int().nonnegative(),
      fn: z.number().int().nonnegative(),
    }),
  ),
}) satisfies z.ZodType<Metrics>;

/* -------------------------------------------------------------------------- */
/* Compositions named by docs/09-api.md                                        */
/* -------------------------------------------------------------------------- */

export const paymentRunTotalsSchema = z.object({
  instructions: z.number().int().nonnegative(),
  amount: z.number().nonnegative(),
  held: z.number().int().nonnegative(),
  toVerify: z.number().int().nonnegative(),
  released: z.number().int().nonnegative(),
});

export const paymentRunItemSchema = z.object({
  instruction: paymentInstructionSchema,
  supplier: supplierSchema,
  decision: decisionSchema.nullable(),
  findings: z.array(findingSchema),
});

export const paymentRunSchema = z.object({
  id: z.string().min(1),
  weekOf: daySchema,
  totals: paymentRunTotalsSchema,
  items: z.array(paymentRunItemSchema),
});

export const instructionDetailSchema = z.object({
  instruction: paymentInstructionSchema,
  decision: decisionSchema.nullable(),
  findings: z.array(findingSchema),
  supplier: supplierSchema.nullable(),
});

export const verifiedBeneficiarySchema = z.object({
  supplierRfc: rfcSchema,
  clabe: clabeSchema,
  cep: cepSchema,
  verifiedAt: instantSchema,
});

export const supplierDetailSchema = z.object({
  supplier: supplierSchema,
  cfdis: z.array(cfdiSchema),
  complements: z.array(paymentComplementSchema),
  findings: z.array(findingSchema),
  verifiedBeneficiaries: z.array(verifiedBeneficiarySchema),
});

export const satLookupResponseSchema = z.object({
  rfc: rfcSchema,
  entries: z.array(satListEntrySchema),
});

export const satVersionSummarySchema = z.object({
  listVersion: z.string().min(1),
  publishedAt: publicationDateSchema,
  rows: z.number().int().nonnegative(),
});

export const satVersionsResponseSchema = z.object({
  versions: z.array(satVersionSummarySchema),
});

export const beneficiariesResponseSchema = z.object({
  items: z.array(verifiedBeneficiarySchema),
});

export const ledgerResponseSchema = z.object({
  events: z.array(ledgerEventSchema),
});

/** How close the CEP holder name is to the legal name on the CFDI. */
export const nameMatchSchema = z.enum(["match", "partial", "mismatch"]);

export const cepVerifyResponseSchema = z.object({
  cep: cepSchema,
  nameMatch: nameMatchSchema,
  finding: findingSchema.nullable(),
});

export const intakeResponseSchema = z.object({
  instruction: paymentInstructionSchema,
  findings: z.array(findingSchema),
  decision: decisionSchema,
});

export const decideResponseSchema = z.object({
  instruction: paymentInstructionSchema,
  decision: decisionSchema,
});

export const seedResponseSchema = z.object({
  seed: z.number().int(),
  suppliers: z.number().int().nonnegative(),
  instructions: z.number().int().nonnegative(),
  events: z.number().int().nonnegative(),
});

/* -------------------------------------------------------------------------- */
/* Requests                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Intake from the QR page. `clabe` and `image` are both optional in the
 * contract but one of them has to be there, because an instruction with no
 * destination account is not an instruction. The refinement says so once,
 * instead of every handler rediscovering it.
 */
export const createInstructionBodySchema = z
  .object({
    supplierRfc: rfcSchema.optional(),
    cfdiUuids: z.array(uuidSchema).max(50).optional(),
    clabe: clabeSchema.optional(),
    amount: amountSchema,
    source: instructionSourceSchema,
    text: z.string().max(4000).optional(),
    /** Base64 of the photographed instruction. Capped so a POST cannot be a DoS. */
    image: z.base64().max(4_000_000).optional(),
  })
  .refine((body) => body.clabe !== undefined || body.image !== undefined, {
    message: "Send a clabe, or an image to read one from.",
    path: ["clabe"],
  });

export const decideBodySchema = z.object({
  action: actionSchema,
  decidedBy: z.string().min(1).max(120),
});

/**
 * Two ways in: a real list version with its rows, or the demo simulation that
 * may only ever name synthetic RFCs. ADR-0002 forbids showing a real RFC next
 * to fabricated evidence, and that rule is enforced here rather than trusted to
 * whoever is driving the demo at 02:00.
 */
export const satPublishBodySchema = z.union([
  z.object({
    listVersion: z.string().min(1).max(64),
    entries: z.array(satListEntrySchema).min(1).max(5000),
  }),
  z.object({
    simulate: z.literal(true),
    rfcs: z
      .array(rfcSchema.regex(/^SYN/, "simulation accepts synthetic RFCs only"))
      .min(1)
      .max(50),
    status: satListStatusSchema.optional(),
  }),
]);

export const cepVerifyBodySchema = z.union([
  z.object({
    claveRastreo: z.string().min(1).max(40),
    date: daySchema,
    amount: amountSchema,
    senderBank: z.string().min(1).max(80),
    beneficiaryBank: z.string().min(1).max(80),
    beneficiaryAccount: clabeSchema,
    supplierRfc: rfcSchema,
  }),
  z.object({
    xml: z.string().min(1).max(200_000),
    supplierRfc: rfcSchema,
  }),
]);

export const seedBodySchema = z.object({
  seed: z
    .number()
    .int()
    .min(0)
    .max(2 ** 31 - 1)
    .optional(),
  reset: z.boolean().optional(),
});

/** A judge types the RFC by hand, so it is trimmed and upper-cased first. */
export const typedRfcSchema = z
  .string()
  .trim()
  .transform((value) => value.toUpperCase())
  .pipe(rfcSchema);

export const satLookupQuerySchema = z.object({ rfc: typedRfcSchema });

export const rfcParamSchema = z.object({ rfc: typedRfcSchema });

export const idParamSchema = z.object({ id: z.string().min(1).max(200) });

export const ledgerQuerySchema = z.object({
  since: instantSchema.optional(),
  limit: z.coerce.number().int().min(1).max(1000).optional(),
});

/* -------------------------------------------------------------------------- */
/* Inferred types                                                              */
/* -------------------------------------------------------------------------- */

export type PaymentRunTotals = z.infer<typeof paymentRunTotalsSchema>;
export type PaymentRunItem = z.infer<typeof paymentRunItemSchema>;
export type PaymentRun = z.infer<typeof paymentRunSchema>;
export type InstructionDetail = z.infer<typeof instructionDetailSchema>;
export type SupplierDetail = z.infer<typeof supplierDetailSchema>;
export type VerifiedBeneficiary = z.infer<typeof verifiedBeneficiarySchema>;
export type SatVersionSummary = z.infer<typeof satVersionSummarySchema>;
export type NameMatch = z.infer<typeof nameMatchSchema>;
export type CepVerifyResponse = z.infer<typeof cepVerifyResponseSchema>;
export type IntakeResponse = z.infer<typeof intakeResponseSchema>;
export type CreateInstructionBody = z.infer<typeof createInstructionBodySchema>;
export type DecideBody = z.infer<typeof decideBodySchema>;
export type SatPublishBody = z.infer<typeof satPublishBodySchema>;
export type CepVerifyBody = z.infer<typeof cepVerifyBodySchema>;
export type SeedBody = z.infer<typeof seedBodySchema>;
