/**
 * SentryOne domain contract. Every package and app codes against these types.
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
  /**
   * Pesos this company loses for every day a payment to this supplier is late:
   * late-payment interest, the early-payment discount that expires, the line
   * that stops. It is the only number the expected-loss engine weighs the pesos
   * at risk against, so it belongs on the supplier record and not in a caller's
   * constant.
   *
   * Absent means the relationship has not been priced yet, and
   * `supplierModelOf` reads that as zero. Zero is conservative rather than
   * neutral: with no delay cost the engine verifies anything that carries a
   * positive expected loss and releases only what is clean, which is the
   * reading that never moves money on a guess.
   */
  delayCostPerDay?: number;
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

/**
 * How the SAT notified the resolution behind a 49 Bis publication, as the Anexo
 * of the published oficio states it. Two columns, and the one that carries a
 * date is the one that applies.
 */
export type Sat49BisNotice = "buzon_tributario" | "estrados";

/**
 * One taxpayer published under Article 49 Bis, fraccion X of the CFF: the SAT
 * carried out the express visit of article 42, fraccion V, inciso g), resolved
 * that the taxpayer did not rebut the presumption that its CFDI are false, and
 * published the name and the RFC.
 *
 * This is NOT a `SatListEntry` with another status, and the difference is the
 * statute rather than a modelling preference. Article 69-B publishes four
 * situations and corrects itself in both directions, which is why a 69-B row
 * carries a `SatListStatus` and a history. Article 49 Bis fraccion X orders the
 * publication of exactly one outcome, the resolution of fraccion VIII inciso b)
 * (or of fraccion III, second paragraph, when the visit could not be carried
 * out), and provides for no published clearing at all: the other outcome, inciso
 * a), lifts the suspension of the taxpayer's own invoicing and is not published.
 * So presence on this list IS the state, a row is never superseded by a later
 * row, and nothing in this product may infer that a 49 Bis taxpayer was cleared.
 *
 * `publishedAt` is the DOF date of the oficio, and it is load bearing: the thirty
 * natural days a buyer has to reverse the fiscal effect run from it, and so does
 * the restriction of the buyer's own digital seal under article 17-H Bis,
 * fraccion XIV when they do not.
 */
export interface Sat49BisEntry {
  rfc: Rfc;
  name: string;
  /** DOF publication date of the oficio, `YYYY-MM-DD`. The buyer clock starts here. */
  publishedAt: string;
  /** The resolution oficio, verbatim, e.g. `500-05-00-00-00-2026-24472`. */
  oficio: string;
  /**
   * Which of the two notice columns carried a readable date. Absent when neither
   * did, which is reported as a warning rather than guessed at: the taxpayer is
   * published either way, and the row must not be lost over a missing date.
   */
  notifiedBy?: Sat49BisNotice;
  /** The day the notification took effect, when the Anexo states a readable one. */
  noticeEffectiveAt?: string;
  /** Identifier of the publication this row came from, for the retroactive sweep. */
  listVersion: string;
}

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

/**
 * Result of the retroactive sweep after a 49 Bis publication.
 *
 * The same arithmetic as `SweepResult`, priced by the same function, plus the one
 * field 69-B has no equivalent of: the last day the buyer can still file the
 * complementary return. Article 69-B gives thirty days from the publication to
 * prove the operation happened OR to correct; article 49 Bis, fraccion X gives
 * thirty natural days to correct, full stop, and then restricts the seal.
 */
export interface Sat49BisSweepResult {
  listVersion: string;
  /** DOF date of the publication being swept, `YYYY-MM-DD`. */
  publishedAt: string;
  /** Last day of the thirty natural days, `YYYY-MM-DD`. */
  correctBy: string;
  newlyListed: Array<{
    supplier: Supplier;
    entry: Sat49BisEntry;
    paidCfdis: Cfdi[];
    /** Sum of subtotals already deducted. */
    deductedBase: number;
    isrExposure: number;
    ivaExposure: number;
  }>;
  totalExposure: number;
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

/**
 * How the account holder name on a CEP compares with the legal name on the CFDI.
 *
 * Three states and never two: `partial` is deliberately over-inclusive, because
 * Mexican banks abbreviate and truncate a razon social routinely, so "share a
 * word" is a question a clerk answers in a second and not an accusation.
 * `nameMatch` in `@hackmty/cep` is the comparison and this is its vocabulary; the
 * package re-exports this type rather than declaring a second one.
 */
export type NameMatch = "match" | "partial" | "mismatch";

/**
 * What can be proven about the Banxico seal on a CEP.
 *
 * `valid` is only ever set when the sello actually validated against a configured
 * Banxico certificate. Everything that means "we could not check it" is
 * `not_checked`, which the UI renders as "firma no verificada": the reasons behind
 * it (`not_checked` from the parser, `unconfirmed_scheme`, `invalid_certificate`)
 * are facts about our configuration, not about the document. Only a defect in the
 * document itself is `invalid`. Collapsing the middle state into either of the
 * others is how a demo becomes a lie, so it is a state of its own here, in
 * `UNPROVEN_SEAL_REASONS` in `@hackmty/engine`, and in the badge the web renders.
 */
export type SealState = "valid" | "not_checked" | "invalid";

/**
 * The rails the one-cent verification can leave on.
 *
 * `nessie` is the company's bank mirror, which is a sandbox and not a bank: it
 * proves the flow and produces no CEP. `stp` is the SPEI participant a small
 * company can contract, which is the rail that produces a Banxico-signed CEP.
 * `@hackmty/rail` holds both adapters and says which one has run live.
 */
export type RailId = "nessie" | "stp";

/**
 * Where one instruction stands in the beneficiary verification.
 *
 * The order is the order it happens in: nothing yet, the cent has left, Banxico has
 * published no CEP for its clave yet, the CEP is in hand, and then the two ends. A
 * state machine and not a pair of booleans, because the clerk watching the screen
 * needs to know which of "no lo hemos mandado" and "ya salio y estamos esperando"
 * is true, and those are the two that a boolean would fold together.
 *
 * `released` and `blocked` are what the engine did with the CEP in hand.
 * `cep_signed` is where an instruction stays when the CEP arrived and the payment
 * is held for some other reason. Neither `released` nor `blocked` ever means
 * SentryOne moved money: the SPEI still leaves from the company's own portal.
 */
export type VerificationStateName =
  | "not_started"
  | "cent_sent"
  | "awaiting_cep"
  | "cep_signed"
  | "released"
  | "blocked";

/**
 * The verification of one instruction, folded out of the event ledger.
 *
 * It is a projection and never a stored row: every field comes from a `cent_sent`,
 * `cep_awaited`, `cep_verified` or `decision_made` event, so the screen and the
 * constancia read the same history and there is no second copy of the truth to
 * drift. `GET /api/v1/instructions/:id/verification` answers exactly this.
 */
export interface VerificationState {
  instructionId: string;
  state: VerificationStateName;
  /** Which rail sent the cent. Null until one has. */
  rail: RailId | null;
  /** The clave de rastreo the rail filed the transfer under. */
  claveRastreo: string | null;
  centSentAt: string | null;
  /** When the CEP for this account was read and stored. */
  cepAt: string | null;
  sealState: SealState | null;
  /** Account holder as the CEP reports it. */
  holderName: string | null;
  /** Legal name on the supplier's CFDI, the other side of the comparison. */
  legalName: string | null;
  nameMatch: NameMatch | null;
  /** The engine's decision once the CEP was in hand. */
  decision: Decision | null;
  /** Instant of the newest event behind this state, or when it was asked. */
  updatedAt: string;
}

export type Detector =
  | "sat_69b"
  | "clabe_forensics"
  | "duplicate_invoice"
  | "supplier_behaviour"
  | "beneficiary_cep"
  | "bank_reconciliation";

export type Severity = "info" | "warning" | "critical";

/**
 * What the SentryOne consortium knows about one (supplier RFC, account) pair,
 * read from the LOCAL snapshot and never from the warehouse at decision time.
 *
 * The network is a cross-tenant corroboration signal and nothing more: other
 * companies have paid this exact account for this exact supplier, for this long,
 * and none of them has reported it. Nothing personal is in it. The warehouse
 * holds salted hashes of the RFC and the CLABE, a bank code, dates, counts and
 * an outcome, so this object can be computed without anybody's name, amount or
 * account number leaving the tenant that owns it. `packages/consortium/README.md`
 * holds the privacy argument in full.
 *
 * `source` is the honest part. `not_consulted` means the network was not read at
 * all, because the flag is off or nothing has been pulled yet, and then the
 * decision is exactly the decision this product made before the network
 * existed. `snapshot` means the local snapshot answered, and `tenants: 0` on a
 * `snapshot` is itself an answer: the network has never seen this account.
 */
export interface NetworkSignal {
  source: "snapshot" | "not_consulted";
  /** Distinct tenants that paid this exact pair. Zero is a real answer. */
  tenants: number;
  /** Oldest event date the network holds for the pair, ISO YYYY-MM-DD. */
  firstSeen?: string;
  /** Newest event date the network holds for the pair, ISO YYYY-MM-DD. */
  lastSeen?: string;
  /** Tenants that reported this pair as fraud. Any of them is disqualifying. */
  fraudReports: number;
  /**
   * Other accounts the network holds for this supplier, this one excluded. A
   * supplier that forty companies pay on a different account is the
   * impersonation case, and this is the number that says so.
   */
  otherAccounts: number;
  /** When the local snapshot was filled. Absent while nothing was pulled. */
  pulledAt?: string;
}

/**
 * One row of the LOCAL consortium snapshot: everything the network holds about
 * one hashed beneficiary pair, as the warehouse aggregated it.
 *
 * It is the only shape that crosses from `@hackmty/consortium` into
 * `@hackmty/db`, so it lives here with the rest of the contract rather than in
 * either of them. Hashes are lower-case hex; `firstSeen` and `lastSeen` are ISO
 * YYYY-MM-DD, because a day is all the network keeps.
 */
export interface ConsortiumSnapshotRow {
  rfcHash: string;
  clabeHash: string;
  /** The three digits a CLABE carries in public. Not a secret, and not a name. */
  bankCode: string;
  tenants: number;
  firstSeen: string;
  lastSeen: string;
  fraudReports: number;
  otherAccounts: number;
}

/**
 * What filled the local snapshot, one row per instance.
 *
 * `source` is load bearing rather than decorative: `snowflake` means the rows
 * came from the warehouse, `synthetic` means they were generated on this laptop
 * for an offline rehearsal, and a screen or a document that says "red SentryOne"
 * over synthetic rows has to be able to say which one it is looking at.
 */
export interface ConsortiumPull {
  pulledAt: string;
  source: "snowflake" | "synthetic";
  rows: number;
}

/**
 * A value a finding may carry as evidence.
 *
 * Primitives, plus the one compound value the product has: the network signal.
 * Flattening that into seven sibling keys would lose the thing that makes it one
 * fact, and `NetworkSignal.source` is the field that keeps a network nobody read
 * from reading as a clean one, so it has to travel with the rest of it.
 */
export type EvidenceValue = string | number | boolean | NetworkSignal;

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
  evidence: Record<string, EvidenceValue>;
  createdAt: string;
}

/**
 * What a verification call to the supplier proved. `no_answer` is nobody picked
 * up or a voicemail answered; `unclear` is a person who spoke and did not say
 * either thing, which is a real and common outcome and is never rounded to one
 * of the other three.
 *
 * None of the four releases a payment. A `confirmed` is evidence a clerk weighs,
 * exactly like a CEP, and the release stays a `decision_made` a person signs.
 */
export type VerificationOutcome =
  | "confirmed"
  | "denied"
  | "no_answer"
  | "unclear";

/** One turn of a verification call, in the order it was spoken. */
export interface VerificationTurn {
  /** `supplier` is whoever answered the phone, `agent` is the voice agent. */
  role: "agent" | "supplier";
  text: string;
  /** Seconds from the start of the call, when the provider reports them. */
  atSecond?: number;
}

export type Action = "hold" | "verify" | "release";

/**
 * `Decision.decidedBy` of a decision the engine signed itself.
 *
 * There is exactly one of those: the beneficiary verification, where the CEP
 * arrives from the bank and the expected-loss rule reads it with no person in the
 * loop. It is named rather than left as a bare string so a screen, a constancia and
 * the ledger can all tell an automatic decision from one a clerk signed. It still
 * moves no money: `release` means nothing stops this payment, and the SPEI leaves
 * from the company's own banking portal.
 */
export const SYSTEM_DECIDER = "system";

export interface Decision {
  instructionId: string;
  action: Action;
  expectedLoss: number;
  /** Cost of delaying this payment one day, from the supplier relationship model. */
  delayCostPerDay: number;
  findings: Finding[];
  decidedAt: string;
  /**
   * Who confirmed the action. Absent until a person decides, and `SYSTEM_DECIDER`
   * on the one decision the engine signs itself.
   */
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
  | {
      /**
       * The one-cent probe left the company's account through a payment rail.
       *
       * It is the event that makes the beneficiary control self-serve: the clave de
       * rastreo comes back from the rail rather than from a keyboard, which is also
       * why it is on the event. The account is recorded as four digits, like the
       * verification call: the full CLABE is already on the instruction and does not
       * need a second home in the ledger.
       */
      type: "cent_sent";
      at: string;
      instructionId: string;
      rail: RailId;
      claveRastreo: string;
      /** Always 0.01 MXN. Stored so the ledger states it rather than implying it. */
      amount: number;
      /** Last four digits of the account that was probed. */
      clabeLast4: string;
      /**
       * True when no real rail moved money: the in-process rail of a test or of
       * `bun run demo`. Nothing downstream may read a simulated probe as a transfer
       * that settled, and this is the flag that makes that impossible.
       */
      simulated: boolean;
    }
  | {
      /**
       * The cent is out and no signed CEP has been found for its clave yet.
       *
       * A CEP is published once the transfer settles, so this is the ordinary state
       * for minutes rather than an error. The event exists so the screen can say
       * "ya salio, esperando el CEP" instead of showing nothing, and so the wait is
       * auditable: how long the pipeline looked and how many times it asked.
       */
      type: "cep_awaited";
      at: string;
      instructionId: string;
      claveRastreo: string;
      /** How many times the CEP seam was asked before giving the clave back. */
      attempts: number;
      /** Milliseconds waited across those attempts. */
      waitedMs: number;
      /** Why nothing was found, in one sentence a clerk can act on. */
      reason: string;
    }
  | { type: "cep_verified"; at: string; cep: Cep; supplierRfc: Rfc }
  | {
      /**
       * A verification call was placed to the supplier and it ended. The event
       * records what was said, never what to do about it: the decision that
       * follows is a separate `decision_made` signed by a person.
       */
      type: "verification_call";
      at: string;
      instructionId: string;
      supplierRfc: Rfc;
      outcome: VerificationOutcome;
      /**
       * Last four digits of the account that was read out loud. The full CLABE
       * is never spoken on the call and never stored on this event.
       */
      clabeLast4: string;
      /** The sentence the outcome was read from, quoted from the transcript. */
      evidence?: string;
      transcript: VerificationTurn[];
      /** Conversation id at the voice provider, so the audio can be pulled. */
      conversationId?: string;
      /** True when a person placed the call by hand and typed the outcome in. */
      manual: boolean;
    }
  | { type: "decision_made"; at: string; decision: Decision };

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
