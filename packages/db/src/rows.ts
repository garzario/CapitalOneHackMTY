/**
 * The row shapes of the Ceptinela tables and the mappers between them and the
 * domain types in packages/core/src/domain.ts.
 *
 * Pure: no SQL and no driver, so every mapper is unit tested without a database
 * and the SQL in queries.ts stays about filtering and grouping. Three rules the
 * mappers enforce, because the driver will not:
 *
 * 1. **Money arrives as text and leaves as a number.** postgres.js returns
 *    numeric(14,2) as a string on purpose, and json_agg renders the same column
 *    as a JSON number, so `toMoney` accepts both and the rest of the file never
 *    has to know which path a value took.
 * 2. **Instants arrive as Date or as text and leave as ISO 8601 in UTC.** A
 *    timestamptz read directly is a Date; the same column inside json_agg is a
 *    string with an offset. Both become the one shape the domain uses.
 * 3. **Optional fields are absent, never present with undefined.** A domain
 *    object built here has to `toEqual` the one the generator produced, and it
 *    has to survive JSON.stringify without a key that disappears on the wire.
 */

import type {
  Cep,
  Cfdi,
  Decision,
  Finding,
  KnownAccount,
  LedgerEvent,
  LedgerTx,
  PaymentComplement,
  PaymentInstruction,
  SatListEntry,
  Supplier,
} from "@hackmty/core";

/** A timestamptz as the driver hands it back, directly or through json_agg. */
export type SqlInstant = Date | string;

/** A numeric as the driver hands it back, directly (text) or through json_agg. */
export type SqlNumeric = string | number;

export function toInstant(value: SqlInstant): string {
  if (value instanceof Date) {
    return value.toISOString();
  }
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    throw new RangeError(`not an instant: ${JSON.stringify(value)}`);
  }
  return new Date(parsed).toISOString();
}

export function toMoney(value: SqlNumeric): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) {
    throw new RangeError(`not an amount: ${JSON.stringify(value)}`);
  }
  return parsed;
}

/** `null` from the database means the domain field is absent. */
function optionalMoney(value: SqlNumeric | null): number | undefined {
  return value === null ? undefined : toMoney(value);
}

function optionalText(value: string | null): string | undefined {
  return value === null ? undefined : value;
}

function optionalInstant(value: SqlInstant | null): string | undefined {
  return value === null ? undefined : toInstant(value);
}

/** Sets a key only when the value is there, so optional fields stay absent. */
function assign<T extends object, K extends keyof T>(
  target: T,
  key: K,
  value: T[K] | undefined,
): void {
  if (value !== undefined) {
    target[key] = value;
  }
}

/* -------------------------------------------------------------------------- */
/* Base64, for the CEP bytes                                                   */
/* -------------------------------------------------------------------------- */

const BASE64_CHUNK = 0x8000;

/**
 * UTF-8 bytes of a string as base64, with no dependency on `Buffer`, so this
 * package stays importable wherever ADR-0005 puts the API.
 */
export function encodeBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (let start = 0; start < bytes.length; start += BASE64_CHUNK) {
    binary += String.fromCharCode(
      ...bytes.subarray(start, start + BASE64_CHUNK),
    );
  }
  return btoa(binary);
}

/**
 * The inverse. Postgres `encode(bytea, 'base64')` wraps its output every 76
 * characters, so whitespace is stripped first rather than trusting `atob` to be
 * forgiving on every runtime.
 */
export function decodeBase64(encoded: string): string {
  const binary = atob(encoded.replace(/\s+/g, ""));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

/* -------------------------------------------------------------------------- */
/* Suppliers                                                                   */
/* -------------------------------------------------------------------------- */

/** One known account as `json_agg` renders it inside the supplier row. */
export interface KnownAccountJson {
  clabe: string;
  established_by: KnownAccount["establishedBy"];
  established_at: string;
  times_paid: number;
}

export interface SupplierRow {
  rfc: string;
  legal_name: string;
  first_invoice_at: SqlInstant;
  delay_cost_per_day: SqlNumeric | null;
  synthetic: boolean;
  /** Newest first, from the `order by` inside the aggregate. `[]` when none. */
  accounts: KnownAccountJson[] | null;
}

export interface SupplierInsertRow {
  rfc: string;
  legal_name: string;
  first_invoice_at: string;
  delay_cost_per_day: number | null;
  synthetic: boolean;
}

export interface KnownAccountInsertRow {
  supplier_rfc: string;
  clabe: string;
  established_by: KnownAccount["establishedBy"];
  established_at: string;
  times_paid: number;
}

export function knownAccountFromJson(json: KnownAccountJson): KnownAccount {
  return {
    clabe: json.clabe,
    establishedBy: json.established_by,
    establishedAt: toInstant(json.established_at),
    timesPaid: json.times_paid,
  };
}

export function supplierFromRow(row: SupplierRow): Supplier {
  const supplier: Supplier = {
    rfc: row.rfc,
    legalName: row.legal_name,
    knownAccounts: (row.accounts ?? []).map(knownAccountFromJson),
    firstInvoiceAt: toInstant(row.first_invoice_at),
    synthetic: row.synthetic,
  };
  assign(supplier, "delayCostPerDay", optionalMoney(row.delay_cost_per_day));
  return supplier;
}

export function supplierToRow(supplier: Supplier): SupplierInsertRow {
  return {
    rfc: supplier.rfc,
    legal_name: supplier.legalName,
    first_invoice_at: supplier.firstInvoiceAt,
    delay_cost_per_day: supplier.delayCostPerDay ?? null,
    synthetic: supplier.synthetic,
  };
}

export function knownAccountToRow(
  supplierRfc: string,
  account: KnownAccount,
): KnownAccountInsertRow {
  return {
    supplier_rfc: supplierRfc,
    clabe: account.clabe,
    established_by: account.establishedBy,
    established_at: account.establishedAt,
    times_paid: account.timesPaid,
  };
}

/* -------------------------------------------------------------------------- */
/* CFDI and payment complements                                                */
/* -------------------------------------------------------------------------- */

export interface CfdiRow {
  uuid: string;
  serie: string | null;
  folio: string | null;
  issued_at: SqlInstant;
  issuer_rfc: string;
  issuer_name: string;
  receiver_rfc: string;
  subtotal: SqlNumeric;
  iva: SqlNumeric;
  total: SqlNumeric;
  payment_method: Cfdi["paymentMethod"];
  payment_form: string | null;
  synthetic: boolean;
}

export interface CfdiInsertRow {
  uuid: string;
  serie: string | null;
  folio: string | null;
  issued_at: string;
  issuer_rfc: string;
  issuer_name: string;
  receiver_rfc: string;
  subtotal: number;
  iva: number;
  total: number;
  payment_method: Cfdi["paymentMethod"];
  payment_form: string | null;
  synthetic: boolean;
}

export function cfdiFromRow(row: CfdiRow): Cfdi {
  const cfdi: Cfdi = {
    uuid: row.uuid,
    issuedAt: toInstant(row.issued_at),
    issuerRfc: row.issuer_rfc,
    issuerName: row.issuer_name,
    receiverRfc: row.receiver_rfc,
    subtotal: toMoney(row.subtotal),
    iva: toMoney(row.iva),
    total: toMoney(row.total),
    paymentMethod: row.payment_method,
    synthetic: row.synthetic,
  };
  assign(cfdi, "serie", optionalText(row.serie));
  assign(cfdi, "folio", optionalText(row.folio));
  assign(cfdi, "paymentForm", optionalText(row.payment_form));
  return cfdi;
}

export function cfdiToRow(cfdi: Cfdi): CfdiInsertRow {
  return {
    uuid: cfdi.uuid,
    serie: cfdi.serie ?? null,
    folio: cfdi.folio ?? null,
    issued_at: cfdi.issuedAt,
    issuer_rfc: cfdi.issuerRfc,
    issuer_name: cfdi.issuerName,
    receiver_rfc: cfdi.receiverRfc,
    subtotal: cfdi.subtotal,
    iva: cfdi.iva,
    total: cfdi.total,
    payment_method: cfdi.paymentMethod,
    payment_form: cfdi.paymentForm ?? null,
    synthetic: cfdi.synthetic,
  };
}

export interface PaymentComplementRow {
  uuid: string;
  related_cfdi_uuid: string;
  paid_at: SqlInstant;
  paid_amount: SqlNumeric;
  payment_total: SqlNumeric | null;
  operation_number: string | null;
  beneficiary_account: string | null;
  beneficiary_bank_rfc: string | null;
  synthetic: boolean;
}

export interface PaymentComplementInsertRow {
  uuid: string;
  related_cfdi_uuid: string;
  paid_at: string;
  paid_amount: number;
  payment_total: number | null;
  operation_number: string | null;
  beneficiary_account: string | null;
  beneficiary_bank_rfc: string | null;
  synthetic: boolean;
}

export function complementFromRow(
  row: PaymentComplementRow,
): PaymentComplement {
  const complement: PaymentComplement = {
    uuid: row.uuid,
    relatedCfdiUuid: row.related_cfdi_uuid,
    paidAt: toInstant(row.paid_at),
    paidAmount: toMoney(row.paid_amount),
    synthetic: row.synthetic,
  };
  assign(complement, "paymentTotal", optionalMoney(row.payment_total));
  assign(complement, "operationNumber", optionalText(row.operation_number));
  assign(
    complement,
    "beneficiaryAccount",
    optionalText(row.beneficiary_account),
  );
  assign(
    complement,
    "beneficiaryBankRfc",
    optionalText(row.beneficiary_bank_rfc),
  );
  return complement;
}

export function complementToRow(
  complement: PaymentComplement,
): PaymentComplementInsertRow {
  return {
    uuid: complement.uuid,
    related_cfdi_uuid: complement.relatedCfdiUuid,
    paid_at: complement.paidAt,
    paid_amount: complement.paidAmount,
    payment_total: complement.paymentTotal ?? null,
    operation_number: complement.operationNumber ?? null,
    beneficiary_account: complement.beneficiaryAccount ?? null,
    beneficiary_bank_rfc: complement.beneficiaryBankRfc ?? null,
    synthetic: complement.synthetic,
  };
}

/* -------------------------------------------------------------------------- */
/* Instructions                                                                */
/* -------------------------------------------------------------------------- */

export interface InstructionRow {
  id: string;
  supplier_rfc: string | null;
  /** Selected as `cfdi_uuids::text[]`, so the driver hands back strings. */
  cfdi_uuids: string[];
  clabe: string;
  amount: SqlNumeric;
  source: PaymentInstruction["source"];
  received_at: SqlInstant;
  message_text: string | null;
  image_ref: string | null;
  audio_ref: string | null;
  ocr_confidence: SqlNumeric | null;
  sent_at: SqlInstant | null;
  synthetic: boolean;
}

export interface InstructionInsertRow {
  id: string;
  supplier_rfc: string;
  /** A Postgres array literal, `{uuid,uuid}`, cast by the column on the way in. */
  cfdi_uuids: string;
  clabe: string;
  amount: number;
  source: PaymentInstruction["source"];
  received_at: string;
  message_text: string | null;
  image_ref: string | null;
  audio_ref: string | null;
  ocr_confidence: number | null;
  sent_at: string | null;
  synthetic: boolean;
}

/**
 * `{a,b,c}` for a uuid[] column. UUIDs carry no character the literal form
 * would need quoting for, so the join is safe; anything else is refused here
 * rather than corrupting the array.
 */
export function uuidArrayLiteral(uuids: readonly string[]): string {
  for (const uuid of uuids) {
    if (!/^[0-9a-fA-F-]{36}$/.test(uuid)) {
      throw new RangeError(`not a CFDI uuid: ${JSON.stringify(uuid)}`);
    }
  }
  return `{${uuids.join(",")}}`;
}

export function instructionFromRow(row: InstructionRow): PaymentInstruction {
  if (row.supplier_rfc === null) {
    // The domain requires a supplier and the API attaches one before it stores
    // anything, so a null here is a write that bypassed the API. Loud, never
    // an invented RFC.
    throw new RangeError(`instruction ${row.id} carries no supplier_rfc`);
  }
  const instruction: PaymentInstruction = {
    id: row.id,
    supplierRfc: row.supplier_rfc,
    cfdiUuids: [...row.cfdi_uuids],
    clabe: row.clabe,
    amount: toMoney(row.amount),
    source: row.source,
    receivedAt: toInstant(row.received_at),
    synthetic: row.synthetic,
  };
  assign(instruction, "text", optionalText(row.message_text));
  assign(instruction, "imageRef", optionalText(row.image_ref));
  assign(instruction, "audioRef", optionalText(row.audio_ref));
  assign(instruction, "ocrConfidence", optionalMoney(row.ocr_confidence));
  assign(instruction, "sentAt", optionalInstant(row.sent_at));
  return instruction;
}

export function instructionToRow(
  instruction: PaymentInstruction,
): InstructionInsertRow {
  return {
    id: instruction.id,
    supplier_rfc: instruction.supplierRfc,
    cfdi_uuids: uuidArrayLiteral(instruction.cfdiUuids),
    clabe: instruction.clabe,
    amount: instruction.amount,
    source: instruction.source,
    received_at: instruction.receivedAt,
    message_text: instruction.text ?? null,
    image_ref: instruction.imageRef ?? null,
    audio_ref: instruction.audioRef ?? null,
    ocr_confidence: instruction.ocrConfidence ?? null,
    sent_at: instruction.sentAt ?? null,
    synthetic: instruction.synthetic,
  };
}

/* -------------------------------------------------------------------------- */
/* Findings and decisions                                                      */
/* -------------------------------------------------------------------------- */

export interface FindingRow {
  id: string;
  detector: Finding["detector"];
  severity: Finding["severity"];
  state: Finding["state"];
  subject_kind: Finding["subject"]["kind"];
  subject_id: string;
  amount_at_risk: SqlNumeric;
  explanation: string;
  evidence: Finding["evidence"];
  created_at: SqlInstant;
}

export interface FindingInsertRow {
  id: string;
  detector: Finding["detector"];
  severity: Finding["severity"];
  state: Finding["state"];
  subject_kind: Finding["subject"]["kind"];
  subject_id: string;
  amount_at_risk: number;
  explanation: string;
  /**
   * jsonb. Sent as the object itself: postgres.js serialises a parameter bound
   * to a jsonb column with JSON.stringify, so a pre-stringified value would be
   * stored as a JSON string of JSON, which is exactly what happened to the
   * bank mirror's `raw` column before this file existed.
   */
  evidence: Finding["evidence"];
  created_at: string;
}

export function findingFromRow(row: FindingRow): Finding {
  return {
    id: row.id,
    detector: row.detector,
    severity: row.severity,
    state: row.state,
    subject: { kind: row.subject_kind, id: row.subject_id },
    amountAtRisk: toMoney(row.amount_at_risk),
    explanation: row.explanation,
    evidence: { ...row.evidence },
    createdAt: toInstant(row.created_at),
  };
}

/**
 * A subject id as it is stored. A CFDI uuid is lowercased, because that is the
 * form the `uuid` column hands back and the form every comparison against it
 * has to use: packages/core uppercases the folio fiscal the way the SAT prints
 * it, the generator writes it lowercase, and Postgres normalises both to the
 * same lowercase text. Instruction, supplier and bank row ids are stored as they
 * are, since they are plain text on both sides.
 */
export function subjectIdForStorage(
  kind: Finding["subject"]["kind"],
  id: string,
): string {
  return kind === "cfdi" ? id.toLowerCase() : id;
}

export function findingToRow(finding: Finding): FindingInsertRow {
  return {
    id: finding.id,
    detector: finding.detector,
    severity: finding.severity,
    state: finding.state,
    subject_kind: finding.subject.kind,
    subject_id: subjectIdForStorage(finding.subject.kind, finding.subject.id),
    amount_at_risk: finding.amountAtRisk,
    explanation: finding.explanation,
    evidence: { ...finding.evidence },
    created_at: finding.createdAt,
  };
}

export interface DecisionRow {
  /** bigint, which the driver returns as text. */
  id: string | number;
  instruction_id: string;
  action: Decision["action"];
  expected_loss: SqlNumeric;
  delay_cost_per_day: SqlNumeric;
  decided_at: SqlInstant;
  decided_by: string | null;
  /** The findings that justified it, through decision_findings. `[]` when none. */
  findings: FindingRow[] | null;
}

export function decisionFromRow(row: DecisionRow): Decision {
  const decision: Decision = {
    instructionId: row.instruction_id,
    action: row.action,
    expectedLoss: toMoney(row.expected_loss),
    delayCostPerDay: toMoney(row.delay_cost_per_day),
    findings: (row.findings ?? []).map(findingFromRow),
    decidedAt: toInstant(row.decided_at),
  };
  assign(decision, "decidedBy", optionalText(row.decided_by));
  return decision;
}

/* -------------------------------------------------------------------------- */
/* SAT Article 69-B                                                            */
/* -------------------------------------------------------------------------- */

export interface SatListEntryRow {
  list_version: string;
  rfc: string;
  name: string;
  status: SatListEntry["status"];
  /** Selected as `published_at::text`, so a date never crosses a time zone. */
  published_at: string;
}

export function satEntryFromRow(row: SatListEntryRow): SatListEntry {
  return {
    rfc: row.rfc,
    name: row.name,
    status: row.status,
    publishedAt: row.published_at.slice(0, 10),
    listVersion: row.list_version,
  };
}

export function satEntryToRow(entry: SatListEntry): SatListEntryRow {
  return {
    list_version: entry.listVersion,
    rfc: entry.rfc,
    name: entry.name,
    status: entry.status,
    published_at: entry.publishedAt.slice(0, 10),
  };
}

/* -------------------------------------------------------------------------- */
/* Verified beneficiaries                                                      */
/* -------------------------------------------------------------------------- */

export type NameMatchValue = "match" | "partial" | "mismatch";

export interface VerifiedBeneficiaryRow {
  supplier_rfc: string;
  clabe: string;
  clave_rastreo: string;
  transferred_at: SqlInstant;
  amount: SqlNumeric;
  sender_name: string;
  sender_bank: string;
  sender_account: string | null;
  beneficiary_name: string;
  beneficiary_bank: string;
  beneficiary_rfc: string | null;
  concepto: string | null;
  numero_certificado: string | null;
  signature_valid: boolean;
  signature_reason: string | null;
  name_match: NameMatchValue;
  /** `encode(cep_xml, 'base64')`, so the bytes leave the server untouched. */
  cep_xml_b64: string;
  verified_at: SqlInstant;
  synthetic: boolean;
}

export interface VerifiedBeneficiaryRecord {
  supplierRfc: string;
  clabe: string;
  cep: Cep;
  nameMatch: NameMatchValue;
  verifiedAt: string;
}

export function beneficiaryFromRow(
  row: VerifiedBeneficiaryRow,
): VerifiedBeneficiaryRecord {
  const cep: Cep = {
    claveRastreo: row.clave_rastreo,
    transferredAt: toInstant(row.transferred_at),
    amount: toMoney(row.amount),
    senderName: row.sender_name,
    senderBank: row.sender_bank,
    beneficiaryName: row.beneficiary_name,
    beneficiaryAccount: row.clabe,
    beneficiaryBank: row.beneficiary_bank,
    signatureValid: row.signature_valid,
    xml: decodeBase64(row.cep_xml_b64),
    synthetic: row.synthetic,
  };
  assign(cep, "senderAccount", optionalText(row.sender_account));
  assign(cep, "beneficiaryRfc", optionalText(row.beneficiary_rfc));
  assign(cep, "concepto", optionalText(row.concepto));
  assign(cep, "numeroCertificado", optionalText(row.numero_certificado));
  assign(cep, "signatureReason", optionalText(row.signature_reason));
  return {
    supplierRfc: row.supplier_rfc,
    clabe: row.clabe,
    cep,
    nameMatch: row.name_match,
    verifiedAt: toInstant(row.verified_at),
  };
}

/* -------------------------------------------------------------------------- */
/* The event ledger                                                            */
/* -------------------------------------------------------------------------- */

export interface LedgerEventRow {
  at: SqlInstant;
  type: LedgerEvent["type"];
  /** The event without `type` and `at`, which are columns. */
  payload: Record<string, unknown>;
}

export interface LedgerEventInsertRow {
  at: string;
  type: LedgerEvent["type"];
  /** jsonb, as the object. See `FindingInsertRow.evidence` for why not text. */
  payload: Record<string, unknown>;
}

/**
 * Puts the discriminant and the instant back onto the payload. The union is
 * trusted rather than validated here: the writer is `ledgerEventToRow` and the
 * check constraint on `type`, and re-validating every read would mean a second
 * copy of the schema in this package.
 */
export function ledgerEventFromRow(row: LedgerEventRow): LedgerEvent {
  return {
    ...row.payload,
    type: row.type,
    at: toInstant(row.at),
  } as LedgerEvent;
}

export function ledgerEventToRow(event: LedgerEvent): LedgerEventInsertRow {
  const { type, at, ...payload } = event;
  return { at, type, payload };
}

/* -------------------------------------------------------------------------- */
/* The bank mirror, ledger_tx from 0001                                        */
/* -------------------------------------------------------------------------- */

export interface LedgerTxRow {
  id: string;
  account_id: string;
  occurred_at: SqlInstant;
  amount: SqlNumeric;
  direction: LedgerTx["direction"];
  merchant_id: string | null;
  category: string | null;
  source: string;
  raw: Record<string, unknown>;
}

export function ledgerTxFromRow(row: LedgerTxRow): LedgerTx {
  const tx: LedgerTx = {
    id: row.id,
    accountId: row.account_id,
    occurredAt: toInstant(row.occurred_at),
    amount: toMoney(row.amount),
    direction: row.direction,
    source: row.source,
    raw: { ...row.raw },
  };
  assign(tx, "merchantId", optionalText(row.merchant_id));
  assign(tx, "category", optionalText(row.category));
  return tx;
}

/* -------------------------------------------------------------------------- */
/* supplier_weekly_outflow, the behaviour detector feed                        */
/* -------------------------------------------------------------------------- */

/**
 * One bucket of `supplier_weekly_outflow`: the view 0007 defines, and the
 * continuous aggregate 0008 replaces it with on a Timescale server. Both paths
 * return the same five columns, so this mapper is the only place in the codebase
 * that knows their names.
 *
 * `invoices` is a bigint and postgres.js hands a bigint back as a string, the
 * same way it hands back a numeric, which is why it is typed as `SqlNumeric`
 * rather than read as a number.
 */
export interface SupplierWeekRow {
  supplier_rfc: string;
  week: SqlInstant;
  invoices: SqlNumeric;
  outflow: SqlNumeric;
  max_invoice: SqlNumeric;
}

/** One week of what a supplier invoiced this company. */
export interface SupplierWeek {
  /** Monday 00:00 UTC that opens the bucket, ISO 8601. */
  week: string;
  /** Invoices issued inside the bucket. */
  invoices: number;
  /** What they totalled, MXN. */
  outflow: number;
  /** The largest single invoice in the bucket, MXN. */
  maxInvoice: number;
}

export function supplierWeekFromRow(row: SupplierWeekRow): SupplierWeek {
  return {
    week: toInstant(row.week),
    invoices: toCount(row.invoices),
    outflow: toMoney(row.outflow),
    maxInvoice: toMoney(row.max_invoice),
  };
}

/** A count is whole. A fractional one means the column is not the count. */
function toCount(value: SqlNumeric): number {
  const parsed = toMoney(value);
  if (!Number.isInteger(parsed)) {
    throw new RangeError(`not a count: ${JSON.stringify(value)}`);
  }
  return parsed;
}

/**
 * Everything the supplier_behaviour detector reads about one supplier.
 *
 * The first three fields are `SupplierBehaviourInput` in
 * packages/core/src/behaviour.ts, field for field and not an approximation of
 * it: this object is handed to `assessSupplierBehaviour` unchanged. `weeks`
 * rides along for the supplier drawer, so the screen renders the series the
 * detector reasoned over rather than a second one computed its own way.
 */
export interface SupplierHistory {
  supplier: Supplier;
  /**
   * Every CFDI the company received inside the window, from every issuer and not
   * only from this supplier. The concentration signal divides this supplier's
   * invoiced total by the company's, so one issuer's slice would read every
   * supplier as 100 percent of the spend.
   */
  cfdis: Cfdi[];
  /** The instant the window ends, ISO 8601. The detector reads it as `now`. */
  now: string;
  /** The weekly series for this supplier, oldest first. Empty is a real answer. */
  weeks: SupplierWeek[];
}
