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

/**
 * The plaza of a CLABE resolved to a place: digits 4 to 6 of the account number,
 * which is the Banxico plaza the branch that opened it belongs to.
 *
 * The plaza is a signal because it moves with the account and not with the
 * supplier: a foundry in Monterrey that has always been paid in plaza 580 and
 * sends a new account in another plaza has changed something a clerk can ask
 * about in one sentence. `detectClabe` in `./clabe.ts` already compares the three
 * digits inside one institution and raises `plaza_changed`, and this type is the
 * row that turns a code into words.
 *
 * `city` and `state` are filled only from a dated snapshot, and that snapshot now
 * exists: `./snapshot/plazas-2026-09-13.csv`, 786 plazas, read through
 * `lookupPlaza` in `./plazas.ts`. Read `./snapshot/README.md` before quoting it
 * anywhere, because its provenance is weaker than the participant table's and the
 * code is built around that. What a plaza code is, is primary: Banco de Mexico and
 * the ABM publish the same sentence. The catalogue itself is published by neither,
 * and the rows come from the plaza table a SPEI participant publishes.
 *
 * The consequence is a rule and not a preference. A code the snapshot does not
 * carry yields no name and no claim, the snapshot never raises a finding or
 * changes a severity, and every sentence that names a plaza prints the three
 * digits beside the name so the reader can check it against the committed file. A
 * city invented next to a real account number is the kind of claim ADR-0002
 * forbids outright, and a city asserted on a catalogue nobody can open is the same
 * claim with extra steps.
 */
export interface Plaza {
  /** The three digits as they appear in the CLABE, zero padded, e.g. "180". */
  code: string;
  /** The place, cased as the catalogue publishes it: "DISTRITO FEDERAL". */
  city: string;
  /**
   * The state, abbreviated as the catalogue abbreviates it: "NL", "DF", "COA",
   * "EDOMEX", "TAMPS". Two to six letters, and never the name spelled out.
   *
   * It used to say two letters. That was written before any catalogue was in
   * hand, and the one that landed abbreviates eleven of the thirty-two states in
   * more than two, so the contract follows the data rather than the other way
   * round. `snapshot/README.md` lists all thirty-two with their plaza counts.
   */
  state: string;
}

/**
 * What a person may be, and it is the only two things this product knows how to
 * be: the clerk who runs the payment run and the owner who answers for the money.
 *
 * The distinction is deliberately narrow. `docs/02-persona.md` puts a formal
 * maker-checker in the ANTI-persona column: the company this product is for has
 * one clerk who assembles the run and an owner who is working elsewhere in the
 * business, and inventing an approval chain it does not have would be a product
 * nobody can use on a Thursday. So `owner` guards exactly one thing, the one thing
 * that page says the owner does, which is approving an exception: a release over a
 * finding. Everything else, the run included, is the clerk's own work.
 */
export type ActorRole = "clerk" | "owner";

/**
 * Who is acting, carried on the `X-Actor` header of every write and stamped on
 * the ledger event that write appends.
 *
 * It is a name and a role and deliberately not a user account: SentryOne holds no
 * credentials, no password and no session, because a payments product that asks a
 * clerk to create an account before it can stop a bad payment does not get used
 * on the Thursday of the payment run. What the header buys is the thing ADR-0002
 * demands, that every execution has a person's name against it in an append-only
 * ledger, and a deployment that needs authentication puts it in front of this API
 * rather than inside the contract.
 */
export interface Actor {
  name: string;
  role: ActorRole;
}

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
  /**
   * CFDI 4.0 `LugarExpedicion`, which the SAT defines as the postal code the
   * invoice was issued from. Five digits, and the only geography a CFDI carries.
   *
   * Control 2 reads it: an account whose plaza sits in another state than the
   * state the supplier invoices from is a question worth one sentence, and it is
   * a question the ledger cannot ask on its own because the plaza lives in the
   * account number and the postal code lives in the invoice. `stateOfPostalCode`
   * in `./plazas.ts` does the mapping and answers `undefined` far more often than
   * it answers a state, which is deliberate.
   *
   * Optional because a CFDI this repository did not parse may not carry it and a
   * missing place must never become a finding.
   */
  issuePlace?: string;
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
 * The level one payment is read at, and the only vocabulary the product uses for
 * how much it trusts a line.
 *
 * Three words and never a number. A probability on screen invites the one
 * question this engine cannot answer honestly, which is what 0.73 means for this
 * supplier, and `estimateLoss` in `./decision.ts` says in its own comment that
 * its figure is an upper bound on the evidence rather than a calibrated
 * probability. So the arithmetic stays inside the engine and the screen gets a
 * level with the findings that produced it.
 *
 * No copy of this product ever says "seguro", in any language, and that is binding
 * under ADR-0002 and written out in ADR-0009: `confiable` is a statement about the
 * evidence we hold, and "safe" would be a guarantee nobody can give about a
 * transfer that cannot be recalled. `confidenceOf` in `./levels.ts` is the only
 * place a level is derived.
 */
export type Confidence = "confiable" | "precaucion" | "alerta";

/**
 * Where one payment of the run stands, as the clerk reads it.
 *
 * Three of these are the states the team meeting of 2026-09-12 settled on and the
 * three a screen shows: `rojo` is stopped and in front of a person, `cancelado` is
 * not going out on this evidence, `enviado` is gone. Two more are the run's own
 * bookkeeping, which existed before the meeting named the other three and is what
 * `totals` has always counted: `pendiente` is a line nothing has decided yet, and
 * `liberado` is a line nothing stops and that has not been executed.
 *
 * Keeping the internal pair separate is what stops the honest answer from being
 * rounded to a colour. A line nobody has looked at is not green, and a line
 * released on Wednesday is not `enviado` until money leaves on Thursday, which is
 * exactly the distinction a judge tests by asking what the screen said before the
 * run was sent. `transactionStateOf` in `./levels.ts` is the only place a state is
 * derived, and `Action` stays what it was: the engine proposes `hold`, `verify` or
 * `release`, and this is how that reads next to what the rail did.
 */
export type TransactionState =
  | "rojo"
  | "cancelado"
  | "enviado"
  | "pendiente"
  | "liberado";

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
  /**
   * Why that person chose this action, in their own words.
   *
   * Absent on the engine's own proposal, because the engine's reasoning is the
   * findings and it is already on the object. The case this field exists for is
   * the urgent payment: a clerk releases something the engine held, and the
   * responsibility has a name in `decidedBy` and an argument here. Both land on
   * the `decision_made` ledger event, so a release nobody can explain later is
   * not a thing this product allows.
   */
  reason?: string;
}

/**
 * Who spoke: the person at the keyboard, or the assistant answering them.
 *
 * `clerk` is the author of anything typed or dropped into the panel whatever the
 * person's role is, because the field answers "which side of the conversation" and
 * `AssistantMessage.actor` answers "who". An owner and a clerk are both `clerk`
 * here and their names and roles are on the actor.
 */
export type AssistantAuthor = "clerk" | "assistant";

/**
 * The reads the assistant is allowed to perform, and the whole list of them.
 *
 * Every one is a read of something this product already computed: the run, one
 * instruction, where its verification stands, what the execution did, the SAT
 * lists, the consortium signal for a pair somebody already holds, a receipt. There
 * is no tool that decides, sends, holds or releases, and that is the boundary
 * ADR-0007 draws: the assistant reads deterministic output and proposes, and a
 * person executes.
 */
export type AssistantTool =
  | "get_run"
  | "get_instruction"
  | "get_verification"
  | "get_execution"
  | "get_receipt"
  | "sat_lookup"
  | "consortium_signal";

/**
 * One read the assistant performed while answering, kept so the answer can be
 * audited against what it actually looked at.
 *
 * `readOnly` is the literal `true` rather than a boolean on purpose: a tool call
 * that writes cannot be expressed in this type at all, so the boundary is
 * structural and not a line in a comment somebody has to remember. The same rule
 * is why `result` is `EvidenceValue` and not free text. What comes back from a
 * tool is the engine's own evidence, rendered as the same chips the finding panel
 * renders, so nothing a model wrote can arrive dressed as a fact.
 */
export interface AssistantToolCall {
  id: string;
  tool: AssistantTool;
  /** What it was asked for: an instruction id, an RFC, a CLABE, a run id. */
  arguments: Record<string, string | number | boolean>;
  /** What came back, machine readable. Absent while the call is in flight. */
  result?: Record<string, EvidenceValue>;
  at: string;
  /** Always true. Every tool in `AssistantTool` is a read. */
  readOnly: true;
  /**
   * Why the read answered nothing, in one sentence. A tool that could not answer
   * is reported rather than dropped: an assistant that quietly lost a read would
   * be answering from its own memory, which is the failure ADR-0007 exists to
   * prevent.
   */
  error?: string;
}

/**
 * One turn of the assistant panel, stored and replayable.
 *
 * Messages are the conversation and never the decision. A turn may carry the reads
 * behind it and one proposal, and the proposal is an offer: it becomes an action
 * when a person presses the button, which appends the ordinary `decision_made`,
 * `cent_sent` or `payment_sent` event with their name on it. Nothing in this type
 * moves money and nothing in it scores a payment.
 *
 * `imageRefs` are references and never bytes. The screenshots a clerk drops in are
 * the reason the panel exists, the extraction that reads a CLABE off one is
 * transcription only (`packages/extract`, ADR-0004 and docs/06 section 6.2.1), and
 * what the ledger keeps is the reference plus who dropped it.
 */
export interface AssistantMessage {
  id: string;
  sessionId: string;
  author: AssistantAuthor;
  /** What was said, in Spanish, as it is shown. */
  text: string;
  at: string;
  /** Who typed it. Absent on an assistant turn, which nobody signs. */
  actor?: Actor;
  /** The instruction the turn is about, when it is about one. */
  instructionId?: string;
  /** Uploaded images of this turn, by reference. Never the image itself. */
  imageRefs?: string[];
  /** The reads behind the answer, in the order they happened. */
  toolCalls?: AssistantToolCall[];
  /** What the turn offers to do next. A person executes it, or does not. */
  proposal?: ActionProposal;
}

/**
 * One conversation, which is what `GET /api/v1/assistant/sessions/:id` answers.
 *
 * A session belongs to one person: `actor` is who opened it, and every message in
 * it was read by them. It is projected from the `assistant_message` ledger events
 * of that session id rather than stored as a second copy, for the same reason
 * `VerificationState` is a projection: two homes for one history is two histories.
 */
export interface AssistantSession {
  id: string;
  actor: Actor;
  startedAt: string;
  /** The payment run the conversation is about, when it is about one. */
  runId?: string;
  messages: AssistantMessage[];
}

/** What an `ActionProposal` payload may carry. Primitives, so it can be shown. */
export type ProposalValue = string | number | boolean;

/**
 * The five things the assistant can offer, and no sixth.
 *
 * `verify_account` is the one-cent probe, `verify_call` the call to the supplier,
 * `decide` a hold, a verification or a release a person signs, `execute_run` the
 * payment run leaving on the rail, and `intake` turning a dropped screenshot into
 * an instruction. Anything outside this list is not an offer the panel can make.
 */
export type ProposalKind =
  | "verify_account"
  | "verify_call"
  | "decide"
  | "execute_run"
  | "intake";

/**
 * An action the assistant proposes and a person executes.
 *
 * This type is where ADR-0007 is enforced rather than described. The assistant
 * produces this object and nothing else: the payload is exactly the body of the
 * endpoint that would run it, so the panel can show what is about to happen in the
 * words of the request itself, and the only thing that turns it into a write is a
 * click that carries an `X-Actor` header.
 *
 * `requiresRole` is the role that click has to carry. It is `owner` on exactly one
 * shape, a `decide` that releases a payment a finding stopped, because that is the
 * exception `docs/02-persona.md` says the owner approves; everything else,
 * `execute_run` included, is `clerk`, because the same page has the clerk sending
 * the run and a maker-checker chain in the anti-persona column. An API that took
 * the proposal's word for the role would be pointless, so the role on the header is
 * what the route checks and this field is what the panel shows before anybody
 * presses anything.
 *
 * `summary` is one sentence of Spanish a person can hold responsibility for, and
 * it never carries a probability or the word "seguro": ADR-0009 owns that
 * vocabulary and a proposal obeys it like every other piece of copy.
 */
export interface ActionProposal {
  kind: ProposalKind;
  /** The instruction it is about. Absent on `execute_run` and on an `intake`. */
  instructionId?: string;
  /** The body of the endpoint that would execute it, field for field. */
  payload: Record<string, ProposalValue>;
  requiresRole: ActorRole;
  summary: string;
}

/**
 * Where one line of an executed run stands on the rail.
 *
 * Five states and the order is the order money moves in: `queued` is accepted and
 * not yet sent, `sent` is gone, `settled` is acknowledged by the rail, `failed` is
 * refused, `cancelled` is a line the run dropped before sending it. `sent` and
 * `settled` are two different claims and collapsing them would be the demo lying
 * about the one fact the CEP exists to prove: a transfer is acknowledged when the
 * rail says so, not when we asked.
 */
export type PaymentLineState =
  | "queued"
  | "sent"
  | "settled"
  | "failed"
  | "cancelled";

/** One payment of an executed run, as the rail left it. */
export interface PaymentExecutionLine {
  instructionId: string;
  state: PaymentLineState;
  /** Pesos of this line, so the execution adds up without a join back. */
  amount: number;
  /** The clave de rastreo the rail filed it under. Absent while `queued`. */
  claveRastreo?: string;
  /** Which rail carried it. Absent on a line nothing was sent on. */
  rail?: RailId;
  sentAt?: string;
  /** The receipt this line produced, by id. Absent until it was sent. */
  receiptId?: string;
  /**
   * Why a `failed` or a `cancelled` line did not go out, in one sentence a clerk
   * can act on. A failure with no sentence against it is a line nobody can answer
   * for, and this is the one the screen shows next to the state.
   */
  reason?: string;
}

/**
 * Line counts and pesos of one execution. Counts and money, never one of them:
 * the value of this product is the pesos it moved or stopped, and a screen that
 * reports only rows is a screen a clerk has to add up herself.
 *
 * The five pesos buckets are one per `PaymentLineState`, they are disjoint because
 * a line has exactly one state, and they add up to `amount` exactly. That identity
 * is worth keeping: a total that does not decompose is a total nobody can check
 * against the rows under it.
 */
export interface PaymentExecutionTotals {
  lines: number;
  queued: number;
  sent: number;
  settled: number;
  failed: number;
  cancelled: number;
  /** Pesos of the whole execution, exact to the centavo. */
  amount: number;
  queuedAmount: number;
  sentAmount: number;
  settledAmount: number;
  failedAmount: number;
  cancelledAmount: number;
}

/**
 * What one payment run did on the rail, folded out of the event ledger.
 *
 * A projection and never a stored row, like `VerificationState`: every line comes
 * from a `payment_sent`, `payment_settled`, `payment_failed` or
 * `payment_cancelled` event, so the execution screen, the receipt and the run
 * constancia read one history. `GET /api/v1/run/:id/execution` answers exactly
 * this.
 *
 * It is also the answer to what SentryOne does and does not do. Until this type
 * existed the product stopped payments and the SPEI left from the company's own
 * banking portal; an execution means the run leaves through `packages/rail`,
 * every line carries the clave de rastreo the rail filed it under, and a person
 * with the `owner` role pressed the button. Nothing here is automatic and nothing
 * here is undoable, which is why `ActionProposal.requiresRole` for `execute_run`
 * is `owner` and why every one of these events carries an actor.
 */
export interface PaymentExecution {
  runId: string;
  lines: PaymentExecutionLine[];
  totals: PaymentExecutionTotals;
  /** Who pressed the button. The ledger holds the same name per line. */
  startedBy?: Actor;
  startedAt?: string;
  /** Instant of the newest event behind this projection, or when it was asked. */
  updatedAt: string;
}

/**
 * The receipt of one payment: what left, to whom, under which clave de rastreo,
 * and what can be proven about the seal.
 *
 * `GET /api/v1/payments/:id/receipt` answers it as JSON and as a PDF the
 * accountant files. The two are the same object and the PDF adds only the ledger
 * digest every constancia carries.
 *
 * Two honesty rules are in the type. `sealState` is a `SealState` and not a
 * boolean, so a receipt printed on a server with no Banxico certificate reads
 * "firma no verificada" and can never read as valid: a `valid` here means the
 * sello actually validated. And the beneficiary account is four digits, because a
 * document that leaves the building does not need the other fourteen.
 */
export interface PaymentReceipt {
  id: string;
  runId: string;
  instructionId: string;
  claveRastreo: string;
  rail: RailId;
  /** Pesos that left, exact to the centavo. */
  amount: number;
  sentAt: string;
  /** When the rail acknowledged it. Absent while the line is only `sent`. */
  settledAt?: string;
  supplierRfc: Rfc;
  /** Legal name on the supplier's CFDI, which is the name we paid. */
  beneficiaryName: string;
  /** Last four digits of the account that was paid. Never the whole CLABE. */
  beneficiaryAccountLast4: string;
  beneficiaryBank: string;
  /** The CFDI this payment settles, so the receipt joins to the invoice. */
  cfdiUuids: string[];
  /** What can be proven about the Banxico seal of the CEP for this clave. */
  sealState: SealState;
  /** When the CEP for this clave was read. Absent while none has been. */
  cepAt?: string;
  /** Who executed the run this line belongs to. */
  executedBy: Actor;
  synthetic: boolean;
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
      /**
       * The payment left. Three fields were added when the run started leaving
       * through `packages/rail` instead of through the company's own banking
       * portal, and all three are optional so every writer that predates the
       * execution keeps working: `runId` is what lets `PaymentExecution` be folded
       * out of the ledger without a join, `rail` says which rail carried it, and
       * `actor` is the person who pressed the button. A payment with no name
       * against it is the one row this ledger must not hold once an execution can
       * produce one, so the route requires the header even though the type cannot.
       */
      type: "payment_sent";
      at: string;
      instructionId: string;
      claveRastreo?: string;
      runId?: string;
      rail?: RailId;
      actor?: Actor;
    }
  | {
      /**
       * The rail acknowledged the transfer. Separate from `payment_sent` because
       * "we asked" and "the rail says it happened" are two different claims, and
       * the receipt is only complete on the second one.
       */
      type: "payment_settled";
      at: string;
      instructionId: string;
      claveRastreo: string;
      receiptId: string;
      runId?: string;
    }
  | {
      /**
       * The rail refused the line. `reason` is one sentence a clerk can act on,
       * and it is required: a failure nobody can read is a line that quietly
       * disappears from a run somebody is answering for.
       */
      type: "payment_failed";
      at: string;
      instructionId: string;
      reason: string;
      claveRastreo?: string;
      runId?: string;
    }
  | {
      /**
       * The line was dropped before anything was sent. `actor` is absent exactly
       * when nobody dropped it by hand: a definitive SAT listing that landed while
       * the run was queued cancels the line on the evidence, and the reason says
       * so. Nothing about this event releases or sends anything.
       */
      type: "payment_cancelled";
      at: string;
      instructionId: string;
      reason: string;
      runId?: string;
      actor?: Actor;
    }
  | {
      /**
       * One turn of the assistant panel. The conversation is on the same
       * append-only ledger as the payments because a proposal a person acted on is
       * part of the history of that payment, and `AssistantSession` is projected
       * from these rows rather than stored twice.
       */
      type: "assistant_message";
      at: string;
      sessionId: string;
      message: AssistantMessage;
    }
  | {
      /**
       * A screenshot reached the product. This is the event that makes the intake
       * auditable: the image is held by reference, `actor` is who dropped it, and
       * the instruction it became is named as soon as one exists.
       *
       * What is never on this event is the image itself or anything read out of it
       * beyond the reference. The extraction is transcription only and the CLABE it
       * read lands on the instruction, where a typed CLABE always wins over one a
       * model read.
       */
      type: "intake_image";
      at: string;
      imageRef: string;
      actor: Actor;
      /** Media type as it was uploaded, for example `image/jpeg`. */
      mediaType?: string;
      /** The assistant session it arrived through, when it arrived through one. */
      sessionId?: string;
      /** The instruction it became. Absent until one exists. */
      instructionId?: string;
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
      /**
       * Who typed the outcome in, on a call a person placed by hand.
       *
       * Absent on a call the agent placed, because there the conversation id is
       * the provenance. Present on a manual one, because otherwise the only human
       * action in this product with no name against it would be the fallback path
       * the demo leans on when there is no telephony on site.
       */
      recordedBy?: string;
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
