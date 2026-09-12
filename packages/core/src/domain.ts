/**
 * Ceptinela domain contract. Every package and app codes against these types.
 * Pure data, no behaviour. Money is in MXN major units; dates are ISO 8601.
 * Anything that came from a synthetic generator carries `synthetic: true` and the
 * UI renders the watermark from that flag, never from a name.
 */

/** RFC-shaped identifier of a supplier as it appears on its CFDI. */
export type Rfc = string;
/** 18-digit CLABE interbank account number. */
export type Clabe = string;

export interface Supplier {
  rfc: Rfc;
  legalName: string;
  /** Accounts we have paid before, most recent first, with the evidence that established them. */
  knownAccounts: KnownAccount[];
  firstInvoiceAt: string;
  synthetic: boolean;
}

export interface KnownAccount {
  clabe: Clabe;
  /** Where the account came from: a payment complement, a prior instruction, or a verified CEP. */
  establishedBy: "payment_complement" | "instruction" | "cep";
  establishedAt: string;
  timesPaid: number;
}

/** A CFDI 4.0 de ingreso, the invoice the supplier issued to us. */
export interface Cfdi {
  uuid: string;
  serie?: string;
  folio?: string;
  issuedAt: string;
  issuerRfc: Rfc;
  issuerName: string;
  receiverRfc: Rfc;
  subtotal: number;
  iva: number;
  total: number;
  /** PUE paid in one exhibition, PPD paid in instalments (then a complement follows). */
  paymentMethod: "PUE" | "PPD";
  /** SAT c_FormaPago, for example "03" transferencia. */
  paymentForm?: string;
  synthetic: boolean;
}

/** Complemento de recepcion de pagos 2.0, issued by the supplier after it was paid. */
export interface PaymentComplement {
  uuid: string;
  relatedCfdiUuid: string;
  paidAt: string;
  paidAmount: number;
  /**
   * Monto of the Pago node: what left the bank in one transfer. One transfer can
   * settle several invoices, and then `paidAmount` is this row's share of it. The
   * CEP is matched against the transfer, never against the share.
   */
  paymentTotal?: number;
  /**
   * NumOperacion in the complement. For a SPEI this is the clave de rastreo,
   * which is how the CEP for this payment is located at Banxico.
   */
  operationNumber?: string;
  /** CtaBeneficiario in the complement, the account the supplier says it received money on. */
  beneficiaryAccount?: Clabe;
  /** RfcEmisorCtaBen, the bank that holds that account. */
  beneficiaryBankRfc?: Rfc;
  synthetic: boolean;
}

/** How a payment instruction reached the company: this is where a NEW account always arrives. */
export type InstructionSource =
  | "email"
  | "whatsapp"
  | "pdf"
  | "portal"
  | "manual";

export interface PaymentInstruction {
  id: string;
  supplierRfc: Rfc;
  /** The CFDI(s) this instruction claims to settle. */
  cfdiUuids: string[];
  clabe: Clabe;
  amount: number;
  source: InstructionSource;
  receivedAt: string;
  /** Raw message text, if any. Never used for decisions, only shown as context. */
  text?: string;
  /** Reference to an uploaded image (QR intake). OCR result goes into `clabe`. */
  imageRef?: string;
  /** Reference to an uploaded voice note. Its transcript goes into `text`. */
  audioRef?: string;
  /** Confidence of the transcription when the CLABE came from a file, 0 to 1. */
  ocrConfidence?: number;
  /**
   * When the company marked the SPEI as sent, projected from the `payment_sent`
   * ledger event. Absent while the instruction is still pending, which is what
   * separates "not paid yet" from "paid and missing from the bank mirror".
   */
  sentAt?: string;
  synthetic: boolean;
}

export type SatListStatus =
  | "presunto"
  | "desvirtuado"
  | "definitivo"
  | "sentencia_favorable";

/** One row of the official SAT Article 69-B list. */
export interface SatListEntry {
  rfc: Rfc;
  name: string;
  status: SatListStatus;
  /** DOF publication date for this status. */
  publishedAt: string;
  /** Identifier of the list version this row came from, for the retroactive sweep. */
  listVersion: string;
}

/** Comprobante Electronico de Pago issued by Banxico for a SPEI transfer. */
export interface Cep {
  claveRastreo: string;
  transferredAt: string;
  amount: number;
  senderName: string;
  senderBank: string;
  /** Ordenante account the SPEI was charged to, when the CEP states one. */
  senderAccount?: Clabe;
  beneficiaryName: string;
  beneficiaryAccount: Clabe;
  beneficiaryBank: string;
  /** Beneficiary RFC as the CEP reports it. "NA" when the bank sent none. */
  beneficiaryRfc?: Rfc;
  /** Free text the sender typed. Context for the clerk, never used to decide. */
  concepto?: string;
  /** Serial of the Banxico certificate the sello claims. Signature evidence. */
  numeroCertificado?: string;
  /** True only when the XML signature validated against the Banxico certificate. */
  signatureValid: boolean;
  /**
   * Why `signatureValid` is what it is, from `verifySignature` in packages/cep.
   * A false with `unconfirmed_scheme` reads as "not verified" in the UI, never as
   * "invalid": the two are different claims and only one of them is ours to make.
   */
  signatureReason?: string;
  /** The raw signed XML, kept byte-exact because XMLDSig demands it. */
  xml: string;
  synthetic: boolean;
}

export type Detector =
  | "sat_69b"
  | "clabe_forensics"
  | "duplicate_invoice"
  | "supplier_behaviour"
  | "beneficiary_cep"
  | "bank_reconciliation";

export type Severity = "info" | "warning" | "critical";

/** Every finding is either provable from documents or needs a human check. Never an accusation. */
export type FindingState = "comprobable" | "requiere_verificacion";

export interface Finding {
  id: string;
  detector: Detector;
  severity: Severity;
  state: FindingState;
  /**
   * What the finding is attached to. `ledger_tx` is a row of the bank mirror and
   * is used when money left the account with no document to hang the finding on.
   */
  subject: {
    kind: "instruction" | "cfdi" | "supplier" | "ledger_tx";
    id: string;
  };
  /** Pesos at risk in this payment run, the sort key of the alert rail. */
  amountAtRisk: number;
  /** Plain Spanish explanation shown to the clerk. */
  explanation: string;
  /** Machine-readable evidence, rendered as chips. */
  evidence: Record<string, string | number | boolean>;
  createdAt: string;
}

export type Action = "hold" | "verify" | "release";

export interface Decision {
  instructionId: string;
  action: Action;
  expectedLoss: number;
  /** Cost of delaying this payment one day, from the supplier relationship model. */
  delayCostPerDay: number;
  findings: Finding[];
  decidedAt: string;
  /** Who confirmed the action. Absent until a person decides. */
  decidedBy?: string;
}

/** Append-only ledger event. The retroactive sweep is a replay over these. */
export type LedgerEvent =
  | { type: "cfdi_received"; at: string; cfdi: Cfdi }
  | { type: "complement_received"; at: string; complement: PaymentComplement }
  | {
      type: "instruction_received";
      at: string;
      instruction: PaymentInstruction;
    }
  | {
      type: "payment_sent";
      at: string;
      instructionId: string;
      claveRastreo?: string;
    }
  | {
      type: "sat_list_published";
      at: string;
      listVersion: string;
      entries: SatListEntry[];
    }
  | { type: "cep_verified"; at: string; cep: Cep; supplierRfc: Rfc }
  | { type: "decision_made"; at: string; decision: Decision };

/** Result of the retroactive sweep after a SAT publication. */
export interface SweepResult {
  listVersion: string;
  newlyListed: Array<{
    supplier: Supplier;
    status: SatListStatus;
    paidCfdis: Cfdi[];
    /** Sum of subtotals already deducted. */
    deductedBase: number;
    isrExposure: number;
    ivaExposure: number;
  }>;
  totalExposure: number;
}

/** Blind evaluation of the detectors against labelled cases nobody on the detector side saw. */
export interface Metrics {
  cases: number;
  truePositives: number;
  falsePositives: number;
  falseNegatives: number;
  precision: number;
  recall: number;
  falsePositiveRate: number;
  perDetector: Record<Detector, { tp: number; fp: number; fn: number }>;
}
