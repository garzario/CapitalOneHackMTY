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
  ActionProposal,
  Actor,
  ActorRole,
  AssistantAuthor,
  AssistantMessage,
  AssistantSession,
  AssistantTool,
  AssistantToolCall,
  AssistantUsage,
  Cep,
  Cfdi,
  Confidence,
  ConfidenceRule,
  Decision,
  EvidenceValue,
  Finding,
  HoldWindow,
  KnownAccount,
  LedgerEvent,
  Metrics,
  NameMatch,
  NetworkSignal,
  PaymentComplement,
  PaymentInstruction,
  ProposalKind,
  ProposalValue,
  RailId,
  SatListEntry,
  SealState,
  Supplier,
  SweepResult,
  TransactionState,
  TransactionStateRule,
  VerificationOutcome,
  VerificationState,
  VerificationStateName,
  VerificationTurn,
} from "@hackmty/core";
import { ACTOR_NAME_MAX_LENGTH, ACTOR_ROLES } from "@hackmty/core";
import {
  CENT_AMOUNT,
  CLAVE_RASTREO_MAX_LENGTH,
  CLAVE_RASTREO_PATTERN,
} from "@hackmty/rail";
import { normalizeRfc } from "@hackmty/sat";
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

/**
 * A clave de rastreo, the SPEI field the CEP is filed under: letters and digits,
 * up to 30. The pattern is `@hackmty/rail`'s, so the shape the rails mint and the
 * shape the API accepts are one definition.
 */
export const claveRastreoSchema = z
  .string()
  .max(CLAVE_RASTREO_MAX_LENGTH)
  .regex(CLAVE_RASTREO_PATTERN, "clave de rastreo");

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
  /**
   * CFDI 4.0 LugarExpedicion, five digits. Validated as a postal code here and
   * not just as a string, because control 2 maps it to a state and a place that
   * cannot be read has to be refused at the edge rather than silently ignored
   * inside the engine.
   */
  issuePlace: z
    .string()
    .regex(/^\d{5}$/, "issuePlace is a five-digit postal code")
    .optional(),
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
  audioRef: z.string().min(1).optional(),
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

/** How close the CEP holder name is to the legal name on the CFDI. */
export const nameMatchSchema = z.enum([
  "match",
  "partial",
  "mismatch",
]) satisfies z.ZodType<NameMatch>;

/** The rails the cent can leave on. Nessie is the mirror, STP is production. */
export const railIdSchema = z.enum([
  "nessie",
  "stp",
]) satisfies z.ZodType<RailId>;

/**
 * What can be proven about the Banxico seal. `valid` is only ever the answer when
 * a configured certificate verified it; `not_checked` is the UI's "firma no
 * verificada" and is never rendered or described as valid.
 */
export const sealStateSchema = z.enum([
  "valid",
  "not_checked",
  "invalid",
]) satisfies z.ZodType<SealState>;

export const detectorSchema = z.enum([
  "sat_69b",
  "clabe_forensics",
  "duplicate_invoice",
  "supplier_behaviour",
  "beneficiary_cep",
  "bank_reconciliation",
]);

export const severitySchema = z.enum(["info", "warning", "critical"]);

/**
 * What the consortium holds for the account an instruction pays, from the local
 * snapshot. Issue #164, and `packages/consortium/README.md` says what is and is
 * not in it.
 *
 * `source` is the field the rest of the product branches on, so it is an enum and
 * not a string: `not_consulted` means the network was not read at all and the
 * decision is the pre-consortium one, and `snapshot` with `tenants: 0` means the
 * network was read and has never seen this account. Nothing in this object could
 * identify a company, a supplier, a person or an amount.
 */
export const networkSignalSchema = z.object({
  source: z.enum(["snapshot", "not_consulted"]),
  tenants: z.number().int().nonnegative(),
  firstSeen: daySchema.optional(),
  lastSeen: daySchema.optional(),
  fraudReports: z.number().int().nonnegative(),
  otherAccounts: z.number().int().nonnegative(),
  pulledAt: instantSchema.optional(),
}) satisfies z.ZodType<NetworkSignal>;

/**
 * A value a finding carries as evidence: a primitive, or the one compound value
 * the product has.
 *
 * The network signal travels as an object rather than as seven sibling keys
 * because `source` is what keeps a network nobody read from rendering as a clean
 * one, and splitting it would let a screen show the counts without it.
 */
export const evidenceValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  networkSignalSchema,
]) satisfies z.ZodType<EvidenceValue>;

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
  evidence: z.record(z.string(), evidenceValueSchema),
  createdAt: instantSchema,
}) satisfies z.ZodType<Finding>;

export const actionSchema = z.enum(["hold", "verify", "release"]);

/**
 * Who is acting, the shape the `X-Actor` header parses into and the shape the
 * ledger stores.
 *
 * The roles come from `ACTOR_ROLES` in @hackmty/core rather than from a literal
 * here, so a third role would be a compile error in this file instead of an
 * endpoint that silently refuses it. Same reason the name cap is the constant:
 * the header parser, this schema and `decisions.decided_by` have to agree, or a
 * name the API accepts is a name the ledger truncates.
 */
export const actorRoleSchema = z.enum(
  ACTOR_ROLES as readonly [ActorRole, ...ActorRole[]],
);

export const actorSchema = z.object({
  name: z.string().min(1).max(ACTOR_NAME_MAX_LENGTH),
  role: actorRoleSchema,
}) satisfies z.ZodType<Actor>;

/**
 * Longest reason a person may write on a decision.
 *
 * Long enough for the sentence an auditor needs ("el proveedor confirmo por
 * telefono y la nomina sale hoy"), short enough that the field cannot become a
 * place to paste a document. It is one constant because the request body and the
 * stored decision have to agree: a reason the API accepts and the ledger refuses
 * would be a decision recorded without its argument.
 */
export const REASON_MAX = 400;

export const decisionSchema = z.object({
  instructionId: z.string().min(1),
  action: actionSchema,
  expectedLoss: z.number().nonnegative(),
  delayCostPerDay: z.number().nonnegative(),
  findings: z.array(findingSchema),
  decidedAt: instantSchema,
  decidedBy: z.string().min(1).optional(),
  /** The role that name was acting in. Absent on the engine's own decision. */
  decidedByRole: actorRoleSchema.optional(),
  /** Why the person chose it. Absent on the engine's own proposal. */
  reason: z.string().min(1).max(REASON_MAX).optional(),
}) satisfies z.ZodType<Decision>;

/* -------------------------------------------------------------------------- */
/* The level and the state, which travel with every line                       */
/* -------------------------------------------------------------------------- */

/**
 * The level one payment is read at, and never a number.
 *
 * `metricsSchema` reads it too, because `Metrics.perLevel` of issue #201 reports
 * the blind evaluation the way a clerk reads the screen. One enum for both, so a
 * fourth word could not be added to one of them alone.
 *
 * Three words. ADR-0009 is binding on this and docs/09-api.md says it twice: the
 * expected-loss arithmetic is an upper bound on the evidence and says so in its
 * own comment, so a figure next to a supplier's name would be a precision nobody
 * earned, and the word "seguro" would be a guarantee nobody can give about a
 * transfer that cannot be recalled.
 */
export const confidenceSchema = z.enum([
  "confiable",
  "precaucion",
  "alerta",
]) satisfies z.ZodType<Confidence>;

/** Which rule produced the level, so a panel can show the level with its reason. */
export const confidenceRuleSchema = z.enum([
  "sat_definitive",
  "critical_finding",
  "new_account_without_history",
  "pending_verification",
  "warning_finding",
  "no_open_signal",
]) satisfies z.ZodType<ConfidenceRule>;

/**
 * Where one payment stands. The three the screens show plus the two the run has
 * always counted internally, which is what stops an honest answer being rounded
 * to a colour.
 */
export const transactionStateSchema = z.enum([
  "rojo",
  "cancelado",
  "enviado",
  "pendiente",
  "liberado",
]) satisfies z.ZodType<TransactionState>;

/** Which rule produced the state, in the vocabulary of the ADR-0009 table. */
export const transactionStateRuleSchema = z.enum([
  "executed",
  "execution_cancelled",
  "verification_blocked",
  "sat_definitive",
  "stopped_for_a_person",
  "execution_failed",
  "released",
  "undecided",
]) satisfies z.ZodType<TransactionStateRule>;

/**
 * The five keys the level and the state travel as, on a run line and on the
 * instruction detail.
 *
 * Flat and not nested, because `jq '{confidence, state}'` is the shape
 * docs/09-api.md promises a judge can paste. Every one of them is derived by
 * `assessLine` in `@hackmty/core` and none of them is stored:
 * `0012_assistant_and_payment_events.sql` deliberately adds no column for either,
 * because a stored level can disagree with the findings it was computed from and a
 * derived one cannot.
 *
 * `confidenceFindingIds` is what makes the level showable. A level with no
 * evidence under it is not a thing this product puts on a screen, so the findings
 * that produced it travel with it and the panel renders their evidence chips next
 * to the word.
 */
export const lineLevelsSchema = z.object({
  confidence: confidenceSchema,
  confidenceRule: confidenceRuleSchema,
  confidenceFindingIds: z.array(z.string().min(1)),
  state: transactionStateSchema,
  stateRule: transactionStateRuleSchema,
});

/** One turn of a verification call, as the voice provider reported it. */
export const verificationTurnSchema = z.object({
  role: z.enum(["agent", "supplier"]),
  text: z.string().min(1).max(4000),
  atSecond: z.number().nonnegative().optional(),
}) satisfies z.ZodType<VerificationTurn>;

/** None of the four releases a payment. A person still signs the decision. */
export const verificationOutcomeSchema = z.enum([
  "confirmed",
  "denied",
  "no_answer",
  "unclear",
]) satisfies z.ZodType<VerificationOutcome>;

/* -------------------------------------------------------------------------- */
/* The assistant panel                                                         */
/* -------------------------------------------------------------------------- */

/* `actorRoleSchema` and `actorSchema` are above, with the `X-Actor` parser they
   belong to. The panel reuses them rather than declaring a second pair. */

export const assistantAuthorSchema = z.enum([
  "clerk",
  "assistant",
]) satisfies z.ZodType<AssistantAuthor>;

/**
 * The whole list of reads the panel may perform. It is an enum and not a string
 * for the reason ADR-0007 gives: a tool that writes has to be unrepresentable, and
 * the closed list plus `readOnly: true` is what makes it so.
 */
export const assistantToolSchema = z.enum([
  "get_run",
  "get_instruction",
  "get_supplier",
  "get_verification",
  "get_execution",
  "get_receipt",
  "sat_lookup",
  "consortium_signal",
  "get_metrics",
]) satisfies z.ZodType<AssistantTool>;

export const assistantToolCallSchema = z.object({
  id: z.string().min(1),
  tool: assistantToolSchema,
  arguments: z.record(
    z.string(),
    z.union([z.string(), z.number(), z.boolean()]),
  ),
  /** The engine's own evidence, the same chips the finding panel renders. */
  result: z.record(z.string(), evidenceValueSchema).optional(),
  at: instantSchema,
  /** The literal true. A tool call that writes cannot be expressed. */
  readOnly: z.literal(true),
  error: z.string().min(1).max(1000).optional(),
}) satisfies z.ZodType<AssistantToolCall>;

export const proposalKindSchema = z.enum([
  "verify_account",
  "verify_call",
  "decide",
  "execute_run",
  "intake",
]) satisfies z.ZodType<ProposalKind>;

export const proposalValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
]) satisfies z.ZodType<ProposalValue>;

/**
 * An action the panel offers and a person executes.
 *
 * `payload` is the body of the endpoint that would run it, field for field, which
 * is what lets the panel show what is about to happen in the words of the request
 * itself. Primitives only, so it can be rendered without a second viewer.
 */
export const actionProposalSchema = z.object({
  kind: proposalKindSchema,
  instructionId: z.string().min(1).optional(),
  payload: z.record(z.string(), proposalValueSchema),
  requiresRole: actorRoleSchema,
  summary: z.string().min(1).max(600),
}) satisfies z.ZodType<ActionProposal>;

export const assistantMessageSchema = z.object({
  id: z.string().min(1),
  sessionId: z.string().min(1),
  author: assistantAuthorSchema,
  text: z.string().max(8000),
  at: instantSchema,
  actor: actorSchema.optional(),
  instructionId: z.string().min(1).optional(),
  /** References, never bytes. The image itself is on no stored object. */
  imageRefs: z.array(z.string().min(1)).max(10).optional(),
  toolCalls: z.array(assistantToolCallSchema).max(40).optional(),
  proposal: actionProposalSchema.optional(),
}) satisfies z.ZodType<AssistantMessage>;

/**
 * What one turn cost. The rate and its date are in docs/06 section 6.4 and the
 * arithmetic is in `src/assistant/cost.ts`, which is unit tested: a cost on an
 * append-only row has to be reproducible, so it is computed from stamped
 * constants and never read back from the provider.
 */
export const assistantUsageSchema = z.object({
  promptTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  totalTokens: z.number().int().nonnegative(),
  costMxn: z.number().nonnegative(),
  model: z.string().min(1).max(120),
  rounds: z.number().int().nonnegative(),
}) satisfies z.ZodType<AssistantUsage>;

export const assistantSessionSchema = z.object({
  id: z.string().min(1),
  actor: actorSchema,
  startedAt: instantSchema,
  runId: z.string().min(1).optional(),
  messages: z.array(assistantMessageSchema),
}) satisfies z.ZodType<AssistantSession>;

/** Largest base64 image one turn may carry, matching the intake contract. */
export const ASSISTANT_IMAGE_MAX = 4_000_000;

/** How many images one turn may carry. A clerk drops one screenshot, sometimes two. */
export const ASSISTANT_IMAGES_MAX = 4;

/**
 * `POST /api/v1/assistant/messages`, as JSON. The same fields arrive as
 * `multipart/form-data` from the panel, which is the form a browser sends a file
 * in; `src/assistant/routes.ts` normalises the two into this shape.
 *
 * An empty `text` with no image is `400`: there is no turn to take. A `text` with
 * no image is ordinary, and an image with no text is the whole point of the panel.
 */
export const assistantMessageBodySchema = z
  .object({
    sessionId: z.string().min(1).max(200).optional(),
    text: z.string().max(4000).default(""),
    images: z
      .array(z.base64().max(ASSISTANT_IMAGE_MAX))
      .max(ASSISTANT_IMAGES_MAX)
      .optional(),
  })
  .refine((body) => body.text.trim() !== "" || (body.images?.length ?? 0) > 0, {
    message: "Send text, or an image to read, or both.",
    path: ["text"],
  });

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
    /** Who posted it. Absent on the rows the generator wrote. */
    actor: actorSchema.optional(),
  }),
  z.object({
    type: z.literal("payment_sent"),
    at: instantSchema,
    instructionId: z.string().min(1),
    claveRastreo: z.string().min(1).optional(),
  }),
  z.object({
    type: z.literal("payment_cancelled"),
    at: instantSchema,
    instructionId: z.string().min(1),
    reason: z.string().min(1).max(1000),
    runId: z.string().min(1).optional(),
    /** Absent exactly when nobody dropped the line by hand. */
    actor: actorSchema.optional(),
  }),
  z.object({
    type: z.literal("sat_list_published"),
    at: instantSchema,
    listVersion: z.string().min(1),
    entries: z.array(satListEntrySchema),
    actor: actorSchema.optional(),
  }),
  z.object({
    type: z.literal("cent_sent"),
    at: instantSchema,
    instructionId: z.string().min(1),
    rail: railIdSchema,
    claveRastreo: claveRastreoSchema,
    /** The probe and nothing else. An amount is the one field nobody takes back. */
    amount: z.literal(CENT_AMOUNT),
    clabeLast4: z.string().regex(/^\d{0,4}$/, "last four digits"),
    simulated: z.boolean(),
    actor: actorSchema.optional(),
  }),
  z.object({
    type: z.literal("cep_awaited"),
    at: instantSchema,
    instructionId: z.string().min(1),
    claveRastreo: claveRastreoSchema,
    attempts: z.number().int().positive(),
    waitedMs: z.number().nonnegative(),
    reason: z.string().min(1).max(1000),
  }),
  z.object({
    type: z.literal("cep_verified"),
    at: instantSchema,
    cep: cepSchema,
    supplierRfc: rfcSchema,
    actor: actorSchema.optional(),
  }),
  z.object({
    type: z.literal("verification_call"),
    at: instantSchema,
    instructionId: z.string().min(1),
    supplierRfc: rfcSchema,
    outcome: verificationOutcomeSchema,
    /** Four digits, because the full CLABE is never spoken and never stored here. */
    clabeLast4: z.string().regex(/^\d{0,4}$/, "last four digits"),
    evidence: z.string().min(1).max(4000).optional(),
    transcript: z.array(verificationTurnSchema).max(200),
    conversationId: z.string().min(1).max(200).optional(),
    manual: z.boolean(),
    /** Who typed the outcome in, on a hand-recorded call. */
    recordedBy: z.string().min(1).max(ACTOR_NAME_MAX_LENGTH).optional(),
    actor: actorSchema.optional(),
  }),
  z.object({
    type: z.literal("decision_made"),
    at: instantSchema,
    decision: decisionSchema,
  }),
  /* One turn of the assistant panel. The conversation is on the same append-only
     ledger as the payments because a proposal somebody acted on is part of the
     history of that payment, and `AssistantSession` is projected from these rows
     rather than stored twice. */
  z.object({
    type: z.literal("assistant_message"),
    at: instantSchema,
    sessionId: z.string().min(1),
    message: assistantMessageSchema,
    usage: assistantUsageSchema.optional(),
  }),
  /* A screenshot reached the product: the reference, who dropped it, and the
     instruction it became. Never the bytes. */
  z.object({
    type: z.literal("intake_image"),
    at: instantSchema,
    imageRef: z.string().min(1),
    actor: actorSchema,
    mediaType: z.string().min(1).max(120).optional(),
    sessionId: z.string().min(1).optional(),
    instructionId: z.string().min(1).optional(),
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

/**
 * What `POST /api/v1/sat/publish` answers: the sweep, plus the lines of the
 * current run the publication re-scored.
 *
 * `rescored` is issue #175 made visible to a judge with `curl`. A publication
 * prices the whole ledger, and the lines of this week's run the engine scored
 * before the list existed have to be scored again, or the run totals keep
 * reporting zero retroactive exposure in the same minute `totalExposure` reports
 * hundreds of thousands of pesos. So the publication states what it moved: one
 * row per line, with the action that stood on it before and the decision the
 * engine reached after.
 *
 * It carries no pesos of its own, on purpose. The retroactive exposure is priced
 * per supplier and one supplier can sit on several lines of the same run, so a
 * figure per line is an invitation to add the same voided deductions twice.
 * `totals.retroactive69bBase` and `totals.retroactive69bExposure` on
 * `GET /api/v1/run/current` are the run-level pair, counted once per RFC by
 * `runMoney`, and `totalExposure` here is the whole-ledger one.
 *
 * An empty array is an ordinary answer and not a failure: a list that names
 * suppliers this week's run does not pay changes nothing about this week's run.
 */
export const satPublishResponseSchema = sweepResultSchema.extend({
  rescored: z.array(
    z.object({
      instructionId: z.string().min(1),
      supplierRfc: rfcSchema,
      /** Null when nothing had decided the line yet. */
      before: actionSchema.nullable(),
      decision: decisionSchema,
    }),
  ),
});

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
  /** The same evaluation read the way a clerk reads the screen, per level. */
  perLevel: z.record(
    confidenceSchema,
    z.object({
      expected: z.number().int().nonnegative(),
      predicted: z.number().int().nonnegative(),
      agreed: z.number().int().nonnegative(),
      precision: z.number().min(0).max(1),
      recall: z.number().min(0).max(1),
    }),
  ),
}) satisfies z.ZodType<Metrics>;

/* -------------------------------------------------------------------------- */
/* Compositions named by docs/09-api.md                                        */
/* -------------------------------------------------------------------------- */

/**
 * The run in counts and in pesos.
 *
 * The five original fields are counts, which answer "how many lines". The six
 * that follow answer "how much money", which is the question the product is
 * actually about: its value is the loss it prevents and not the minutes it
 * saves. They come from `runMoney` in `@hackmty/core`, so the screen, the
 * constancia and a judge with `curl` read one arithmetic.
 */
export const paymentRunTotalsSchema = z.object({
  instructions: z.number().int().nonnegative(),
  amount: z.number().nonnegative(),
  held: z.number().int().nonnegative(),
  toVerify: z.number().int().nonnegative(),
  released: z.number().int().nonnegative(),
  heldAmount: z.number().nonnegative(),
  toVerifyAmount: z.number().nonnegative(),
  releasedAmount: z.number().nonnegative(),
  /** `heldAmount` plus `toVerifyAmount`: the pesos that have not left. */
  stoppedAmount: z.number().nonnegative(),
  /** The largest single amount at risk on each line, added across lines. */
  amountAtRisk: z.number().nonnegative(),
  /** Subtotal already deducted to the suppliers a 69-B finding names. */
  retroactive69bBase: z.number().nonnegative(),
  /** ISR plus IVA that reverses on that subtotal. No fraud is needed for it. */
  retroactive69bExposure: z.number().nonnegative(),
  /* The run summarised by level and by state, from `runLevels` in
     `@hackmty/core`. Counts and never an average, for the reason `runMoney` gives
     for never summing an amount at risk inside a line: the mean of three words is
     not a word, and a run reported as `precaucion` as a whole would hide the one
     `alerta` line the clerk opened the screen for. The three levels add up to
     `instructions` and so do the five states, because every line has one of each. */
  confiable: z.number().int().nonnegative(),
  precaucion: z.number().int().nonnegative(),
  alerta: z.number().int().nonnegative(),
  rojo: z.number().int().nonnegative(),
  cancelado: z.number().int().nonnegative(),
  enviado: z.number().int().nonnegative(),
  pendiente: z.number().int().nonnegative(),
  liberado: z.number().int().nonnegative(),
});

/**
 * One line of the run as a repository joins it: the four objects and no
 * derivation.
 *
 * Split out from `paymentRunItemSchema` so each repository builds the join and
 * hands it to `levelled` in `src/levels.ts`, which is the one place the level and
 * the state are attached. A repository that attached them itself would be the
 * second implementation ADR-0009 exists to remove.
 */
export const paymentRunLineSchema = z.object({
  instruction: paymentInstructionSchema,
  supplier: supplierSchema,
  decision: decisionSchema.nullable(),
  findings: z.array(findingSchema),
});

export const paymentRunItemSchema = paymentRunLineSchema.extend(
  lineLevelsSchema.shape,
);

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

/**
 * How long a payment stays stopped, and what a person does next.
 *
 * `holdWindow` in `@hackmty/core` computes it from the decision and the clock,
 * so it is never stored: a deadline in a column could disagree with the delay
 * the expected-loss arithmetic charged for, and this one cannot.
 */
export const holdWindowSchema = z.object({
  action: z.enum(["hold", "verify"]),
  days: z.number().int().positive(),
  deadline: instantSchema,
  hoursLeft: z.number().int().nonnegative(),
  /** Nothing is released or refused when it passes. A person answers instead. */
  expired: z.boolean(),
  outcome: verificationOutcomeSchema.optional(),
  nextSteps: z
    .array(
      z.enum([
        "call_supplier",
        "retry_call",
        "one_cent_cep",
        "release_with_reason",
        "keep_held",
      ]),
    )
    .min(1)
    .readonly(),
}) satisfies z.ZodType<HoldWindow>;

/**
 * The detail panel, plus the hold window.
 *
 * A separate schema rather than a field on `instructionDetailSchema`, because the
 * repository builds the detail and owns no clock, and the window is a function of
 * the instant it is asked for.
 */
export const instructionDetailResponseSchema = instructionDetailSchema.extend({
  hold: holdWindowSchema.nullable(),
  ...lineLevelsSchema.shape,
});

export const verifiedBeneficiarySchema = z.object({
  supplierRfc: rfcSchema,
  clabe: clabeSchema,
  cep: cepSchema,
  verifiedAt: instantSchema,
});

/** The states of the one-cent verification, in the order they happen. */
export const verificationStateNameSchema = z.enum([
  "not_started",
  "cent_sent",
  "awaiting_cep",
  "cep_signed",
  "released",
  "blocked",
]) satisfies z.ZodType<VerificationStateName>;

/**
 * `GET /api/v1/instructions/:id/verification`, and the body of the `202` the
 * verify-account endpoint answers with.
 *
 * Every field is folded out of the event ledger, so this payload is a view of a
 * history and not a row somebody could update. `sealState` is the one field that
 * carries a claim, and it is `valid` only when a certificate verified the sello.
 */
export const verificationStateSchema = z.object({
  instructionId: z.string().min(1),
  state: verificationStateNameSchema,
  rail: railIdSchema.nullable(),
  claveRastreo: claveRastreoSchema.nullable(),
  centSentAt: instantSchema.nullable(),
  cepAt: instantSchema.nullable(),
  sealState: sealStateSchema.nullable(),
  holderName: z.string().min(1).nullable(),
  legalName: z.string().min(1).nullable(),
  nameMatch: nameMatchSchema.nullable(),
  decision: decisionSchema.nullable(),
  updatedAt: instantSchema,
}) satisfies z.ZodType<VerificationState>;

export const supplierDetailSchema = z.object({
  supplier: supplierSchema,
  cfdis: z.array(cfdiSchema),
  complements: z.array(paymentComplementSchema),
  findings: z.array(findingSchema),
  verifiedBeneficiaries: z.array(verifiedBeneficiarySchema),
});

/** Which download of the official list answered, named even on an empty answer. */
export const satLookupSourceSchema = z.object({
  listVersion: z.string().min(1),
  retrievedAt: publicationDateSchema,
  url: z.string().min(1),
  taxpayers: z.number().int().nonnegative(),
  rows: z.number().int().nonnegative(),
});

export const satLookupResponseSchema = z.object({
  rfc: rfcSchema,
  entries: z.array(satListEntrySchema),
  /** The newest situation is presunto or definitivo. Not "any row exists". */
  listed: z.boolean(),
  effective: satListEntrySchema.optional(),
  source: satLookupSourceSchema,
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

/**
 * What `POST /api/v1/instructions/:id/decide` answers.
 *
 * `amountAtRisk` is stated rather than left to be re-derived from the findings.
 * The pesos a person accepted responsibility for are the point of the record,
 * and a number every caller has to compute for itself is a number two callers
 * compute differently. `hold` says how long the payment stays stopped, and it is
 * null exactly when the action is `release`.
 */
export const decideResponseSchema = z.object({
  instruction: paymentInstructionSchema,
  decision: decisionSchema,
  amountAtRisk: z.number().nonnegative(),
  hold: holdWindowSchema.nullable(),
});

/**
 * The script the agent reads, or the clerk reads when telephony is not there.
 * It carries four digits of the account and never the whole of it.
 */
export const verificationScriptSchema = z.object({
  firstMessage: z.string().min(1),
  question: z.string().min(1),
  clabeLast4: z.string().regex(/^\d{0,4}$/, "last four digits"),
  spoken: z.array(z.string().min(1)),
});

/**
 * Three answers, one shape. `calling` means the telephone is ringing and the
 * transcript is not there yet; `recorded` means an outcome reached the ledger.
 * `outcome` is never an instruction to release: the decision stays a separate
 * `POST /api/v1/instructions/:id/decide` that a person signs.
 */
export const verifyCallResponseSchema = z.object({
  status: z.enum(["calling", "recorded"]),
  script: verificationScriptSchema,
  conversationId: z.string().min(1).optional(),
  outcome: verificationOutcomeSchema.optional(),
  evidence: z.string().min(1).optional(),
  transcript: z.array(verificationTurnSchema).optional(),
  /** Always present so the UI never has to infer it from the absence of a call. */
  releasesPayment: z.literal(false),
  /**
   * The hold window with the next step, present once an outcome was recorded.
   *
   * This is the answer to "what happens if nobody picks up": the same response
   * that reports `no_answer` says how long the payment stays stopped and what
   * the three ways forward are, one of which needs nobody to answer anything.
   */
  hold: holdWindowSchema.nullable().optional(),
});

/**
 * `GET` on the same path: the script, with nothing done about it. Side effect
 * free on purpose, so the page can show the clerk what will be said without a
 * telephone ringing first.
 */
export const verifyCallScriptResponseSchema = z.object({
  script: verificationScriptSchema,
  /** Whether the three ElevenLabs variables are set on this deployment. */
  voiceConfigured: z.boolean(),
  releasesPayment: z.literal(false),
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
 * Intake from the QR page. `clabe`, `image` and `audio` are all optional in the
 * contract but one of them has to be there, because an instruction with no
 * destination account is not an instruction. The refinement says so once,
 * instead of every handler rediscovering it.
 *
 * `image` and `audio` are read by `@hackmty/extract`, which transcribes and
 * nothing else. A server with no `GEMINI_API_KEY` answers 422 rather than
 * accepting a file it cannot read.
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
    /** Base64 of a voice note. Same cap, same reason. */
    audio: z.base64().max(4_000_000).optional(),
  })
  .refine(
    (body) =>
      body.clabe !== undefined ||
      body.image !== undefined ||
      body.audio !== undefined,
    {
      message: "Send a clabe, or an image or a voice note to read one from.",
      path: ["clabe"],
    },
  );

/**
 * A person confirms an action.
 *
 * `decidedBy` is required, because a decision on money with nobody's name on it
 * is not a decision anybody can be asked about later. `reason` is optional in
 * the contract and asked for by the screen on an override, which is the honest
 * split: an API that refused a release with no prose would be refused by the
 * clerk instead, outside the product, where nothing is recorded at all.
 */
export const decideBodySchema = z.object({
  action: actionSchema,
  decidedBy: z.string().min(1).max(ACTOR_NAME_MAX_LENGTH),
  reason: z.string().min(1).max(REASON_MAX).optional(),
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

/**
 * Three ways to run the verification call, and exactly one of them per request.
 *
 * `toNumber` rings the supplier through the voice provider. `conversationId`
 * collects a call that already happened, which is also how the browser fallback
 * on /verify-call reports itself. `outcome` records a call a person made by
 * hand, which is what the clerk uses when there is no telephony on site at all.
 *
 * The union is ordered so that the hand-recorded variant cannot swallow the
 * other two: each object names a different required key.
 */
export const verifyCallBodySchema = z.union([
  z.object({
    /** E.164. The shape is checked again in @hackmty/voice before any call. */
    toNumber: z
      .string()
      .trim()
      .regex(/^\+[1-9]\d{7,14}$/, "E.164 telephone number"),
  }),
  z.object({
    conversationId: z.string().min(1).max(200),
  }),
  z.object({
    outcome: verificationOutcomeSchema,
    /** What the person heard, quoted. Optional, because silence is an outcome. */
    evidence: z.string().min(1).max(4000).optional(),
    recordedBy: z.string().min(1).max(ACTOR_NAME_MAX_LENGTH),
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

/**
 * A judge types the RFC by hand, so it is normalised before it is validated.
 *
 * `normalizeRfc` from `@hackmty/sat` upper-cases and strips the separators a
 * human or a spreadsheet adds, and it deliberately keeps `&` and `Ñ`, which are
 * legitimate characters in the name portion of a moral person's RFC. Doing it
 * here rather than in the handler means "aaa 010101 aa1" and "AAA010101AA1" are
 * the same request everywhere, including in the 400 the shape check produces.
 */
export const typedRfcSchema = z
  .string()
  .transform((value) => normalizeRfc(value))
  .pipe(rfcSchema);

export const satLookupQuerySchema = z.object({ rfc: typedRfcSchema });

/**
 * `GET /api/v1/consortium/signal?rfc=&clabe=`.
 *
 * The RFC is normalised the same way the lookup box normalises it, because both
 * are typed by hand, and the CLABE is validated to eighteen digits here so a
 * malformed one is a 400 rather than a hash of nothing that answers 404.
 */
export const consortiumQuerySchema = z.object({
  rfc: typedRfcSchema,
  clabe: clabeSchema,
});

/** What that endpoint answers with. The signal, and where it came from. */
export const consortiumSignalResponseSchema = z.object({
  rfc: rfcSchema,
  clabe: clabeSchema,
  network: networkSignalSchema,
});

export const rfcParamSchema = z.object({ rfc: typedRfcSchema });

export const idParamSchema = z.object({ id: z.string().min(1).max(200) });

/** `GET /api/v1/sat/constancia?listVersion=`. */
export const constanciaQuerySchema = z.object({
  listVersion: z.string().min(1).max(200),
});

export const ledgerQuerySchema = z.object({
  since: instantSchema.optional(),
  limit: z.coerce.number().int().min(1).max(1000).optional(),
});

/* -------------------------------------------------------------------------- */
/* Inferred types                                                              */
/* -------------------------------------------------------------------------- */

export type PaymentRunTotals = z.infer<typeof paymentRunTotalsSchema>;
export type PaymentRunLine = z.infer<typeof paymentRunLineSchema>;
export type LineLevels = z.infer<typeof lineLevelsSchema>;
export type PaymentRunItem = z.infer<typeof paymentRunItemSchema>;
export type PaymentRun = z.infer<typeof paymentRunSchema>;
export type InstructionDetail = z.infer<typeof instructionDetailSchema>;
export type InstructionDetailResponse = z.infer<
  typeof instructionDetailResponseSchema
>;
export type DecideResponse = z.infer<typeof decideResponseSchema>;
export type SupplierDetail = z.infer<typeof supplierDetailSchema>;
export type VerifiedBeneficiary = z.infer<typeof verifiedBeneficiarySchema>;
export type SatVersionSummary = z.infer<typeof satVersionSummarySchema>;
/**
 * The name comparison verdict, re-exported from the domain rather than inferred
 * from the schema above. It moved into `packages/core/src/domain.ts` with
 * `VerificationState`, which carries one, and three declarations of the same three
 * words was two too many.
 */
export type { NameMatch };
export type CepVerifyResponse = z.infer<typeof cepVerifyResponseSchema>;
export type IntakeResponse = z.infer<typeof intakeResponseSchema>;
export type CreateInstructionBody = z.infer<typeof createInstructionBodySchema>;
export type DecideBody = z.infer<typeof decideBodySchema>;
export type SatPublishBody = z.infer<typeof satPublishBodySchema>;
export type SatPublishResponse = z.infer<typeof satPublishResponseSchema>;
export type CepVerifyBody = z.infer<typeof cepVerifyBodySchema>;
export type VerifyCallBody = z.infer<typeof verifyCallBodySchema>;
export type VerifyCallResponse = z.infer<typeof verifyCallResponseSchema>;
export type VerifyCallScriptResponse = z.infer<
  typeof verifyCallScriptResponseSchema
>;
export type SeedBody = z.infer<typeof seedBodySchema>;
export type VerificationStateResponse = z.infer<typeof verificationStateSchema>;
export type AssistantMessageBody = z.infer<typeof assistantMessageBodySchema>;
