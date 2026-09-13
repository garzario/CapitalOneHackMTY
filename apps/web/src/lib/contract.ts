/**
 * The HTTP contract, typed. Every shape here is a composition of the domain
 * types in packages/core/src/domain.ts and mirrors a row of the table in
 * docs/09-api.md. Nothing in this file invents a field: if the API needs a
 * shape the domain does not have, the domain gets it first.
 *
 * TODO(garzario): once apps/api implements these routes, promote this file
 * into packages/core so the client and the server import one definition
 * instead of two that drift. It lives here for now because the API scaffold
 * lands in a separate pull request and neither side should block the other.
 */

import type {
  Action,
  ActionProposal,
  Actor,
  ActorRole,
  AssistantAuthor,
  AssistantMessage,
  AssistantSession,
  AssistantTool,
  AssistantToolCall,
  Cep,
  Cfdi,
  Clabe,
  Confidence,
  ConfidenceRule,
  Decision,
  VerificationState as DomainVerificationState,
  VerificationStateName as DomainVerificationStateName,
  EvidenceValue,
  Finding,
  InstructionSource,
  LedgerEvent,
  Metrics,
  PaymentComplement,
  PaymentInstruction,
  ProposalKind,
  ProposalValue,
  RailId,
  Rfc,
  SatListEntry,
  SatListStatus,
  SealState,
  Supplier,
  SweepResult,
  TransactionState,
  TransactionStateRule,
  VerificationOutcome,
  VerificationTurn,
} from "@hackmty/core";

/** `GET /health`. */
export interface Health {
  ok: boolean;
  service: string;
  version: string;
}

/**
 * Totals of one payment run, as `GET /api/v1/run/current` answers them.
 *
 * The three bare names are COUNTS of lines and the three `Amount` ones are
 * pesos. That was a TODO here and it was guessed the other way round: this
 * interface read `held` as a peso sum, which is what a clerk needs to see, and
 * `paymentRunTotalsSchema` in `apps/api/src/schemas.ts` has answered a count all
 * along. Nothing rendered it, so nothing was visibly wrong, and the offline run
 * still filled the field with money while the API filled it with a count. Issue
 * 125 is the same bug in the rows, so it is fixed here too.
 *
 * The pesos come from `runMoney` in `@hackmty/core`, which is also what the
 * constancia prices, so the screen and the document read one arithmetic.
 *
 * Screens read the ITEMS rather than these, per the rule in `run-view.ts`: the
 * totals come from the API and go stale the moment a decision is applied
 * locally, which is exactly what the offline path does.
 */
export interface PaymentRunTotals {
  instructions: number;
  /** The sum of the run in MXN. */
  amount: number;
  /** Lines the engine proposes to hold. */
  held: number;
  toVerify: number;
  released: number;
  heldAmount: number;
  toVerifyAmount: number;
  releasedAmount: number;
  /** `heldAmount` plus `toVerifyAmount`: the pesos that have not left. */
  stoppedAmount: number;
  /** The largest single amount at risk on each line, added across lines. */
  amountAtRisk: number;
  /** Subtotal already deducted to the suppliers a 69-B finding names. */
  retroactive69bBase: number;
  /** ISR plus IVA that reverses on that subtotal. No fraud is needed for it. */
  retroactive69bExposure: number;
  /*
   * The run counted by level and by state, from `runLevels` in `@hackmty/core`.
   * Counts and never an average: the mean of three words is not a word, and a run
   * reported as `precaucion` as a whole would hide the one `alerta` line the clerk
   * opened the screen for. ADR-0009 carries the rule table.
   *
   * Both producers answer them: the API through `runLevels` over its own run, and
   * `totalsFor` below through the same function over the offline rows, so the
   * stored totals and the ones a screen recomputes after a local decision cannot
   * disagree about how many lines are on alert.
   */
  confiable: number;
  precaucion: number;
  alerta: number;
  rojo: number;
  cancelado: number;
  enviado: number;
  pendiente: number;
  liberado: number;
}

/** One row of the payment-run table. */
export interface PaymentRunItem {
  instruction: PaymentInstruction;
  supplier: Supplier;
  decision: Decision;
  findings: Finding[];
  /*
   * The level and the state of this line, derived by `assessLine` in
   * `@hackmty/core` and attached by the API to every line of the run and to the
   * instruction detail. Never stored, and never a number: the three words are the
   * whole vocabulary and ADR-0009 forbids a probability on any screen.
   *
   * Optional on this mirror, and that is deliberate rather than sloppy. The API
   * always answers them; offline, `RUN_ITEMS` in `mock.ts` is assembled by hand and
   * `LEVELS_BY_INSTRUCTION` in the generated `mock-data.ts` is where the offline
   * level and state already live, keyed by instruction id, derived from the mock
   * verifications and the mock execution as well as the decision. Writing them onto
   * the row too would be two offline copies of one pair, which is the failure this
   * whole vocabulary exists to prevent. Issue 208 is where the chips pick one.
   */
  confidence?: Confidence;
  confidenceRule?: ConfidenceRule;
  confidenceFindingIds?: string[];
  state?: TransactionState;
  stateRule?: TransactionStateRule;
}

/** `GET /api/v1/run/current`. */
export interface PaymentRun {
  id: string;
  weekOf: string;
  totals: PaymentRunTotals;
  items: PaymentRunItem[];
}

/** `GET /api/v1/instructions/:id`. */
export interface InstructionDetail {
  instruction: PaymentInstruction;
  decision: Decision;
  findings: Finding[];
  supplier: Supplier;
}

/** One entry of the per-company registry of beneficiaries verified by CEP. */
export interface VerifiedBeneficiary {
  supplierRfc: Rfc;
  clabe: Clabe;
  cep: Cep;
  verifiedAt: string;
}

/** `GET /api/v1/suppliers/:rfc`. */
export interface SupplierDetail {
  supplier: Supplier;
  cfdis: Cfdi[];
  complements: PaymentComplement[];
  findings: Finding[];
  verifiedBeneficiaries: VerifiedBeneficiary[];
}

/** Which download of the official list the answer came out of. */
export interface SatLookupSource {
  /** DOF publication date of the snapshot. */
  listVersion: string;
  /** The day we retrieved it, which is what a judge asks next. */
  retrievedAt: string;
  url: string;
  /** Distinct taxpayers in the snapshot. */
  taxpayers: number;
  /** Rows, larger because one taxpayer carries one row per situation. */
  rows: number;
}

/**
 * `GET /api/v1/sat/lookup?rfc=`. The judge types a real RFC into this one.
 *
 * `rfc` comes back normalised, so the screen echoes what was actually searched.
 * `listed` is the newest situation and not "any row exists": a taxpayer who was
 * presunto and is now desvirtuado is not listed. `source` is always present,
 * including on an empty answer, so "not listed" can never be read as "no list
 * was loaded".
 */
export interface SatLookup {
  rfc: Rfc;
  entries: SatListEntry[];
  listed: boolean;
  /** The row that decides, which is the newest one. Absent when not listed at all. */
  effective?: SatListEntry;
  source: SatLookupSource;
}

/** One loaded version of the official Article 69-B list. */
export interface SatVersion {
  listVersion: string;
  publishedAt: string;
  rows: number;
}

/** `GET /api/v1/sat/versions`. */
export interface SatVersions {
  versions: SatVersion[];
}

/** `GET /api/v1/beneficiaries`. */
export interface BeneficiaryRegistry {
  items: VerifiedBeneficiary[];
}

/** `GET /api/v1/ledger?since=`. */
export interface LedgerPage {
  events: LedgerEvent[];
}

/** `POST /api/v1/instructions`. `image` is base64, from the QR intake page. */
export interface CreateInstructionBody {
  supplierRfc?: Rfc;
  cfdiUuids?: string[];
  clabe?: Clabe;
  amount: number;
  source: InstructionSource;
  text?: string;
  image?: string;
}

/**
 * `POST /api/v1/instructions/:id/decide`. A person always confirms.
 *
 * `decidedBy` has to be the name on the `X-Actor` header of the same request, or
 * the API answers 400: a decision signed by one name under a header carrying
 * another is a record nobody can rely on later. `src/lib/api.ts` attaches the
 * header and `src/lib/actor.ts` holds the identity, so a caller passes the name it
 * reads from there.
 *
 * `reason` is what the person wrote. The API requires it on the two shapes that
 * are the owner's, a release on a line something stands against and a decision on
 * a line the run cancelled, and answers 422 asking for it when it is missing.
 */
export interface DecideBody {
  action: Action;
  decidedBy: string;
  reason?: string;
}

/** `POST /api/v1/sat/publish`. Simulation accepts synthetic RFCs only. */
export type SatPublishBody =
  | { listVersion: string; entries: SatListEntry[] }
  /** `status` defaults to presunto on the server. See docs/09-api.md. */
  | { simulate: true; rfcs: Rfc[]; status?: SatListStatus };

/** `POST /api/v1/cep/verify`, either by tracking key or by pasted signed XML. */
export type CepVerifyBody =
  | {
      claveRastreo: string;
      date: string;
      amount: number;
      senderBank: string;
      beneficiaryBank: string;
      beneficiaryAccount: Clabe;
      supplierRfc: Rfc;
    }
  | { xml: string; supplierRfc: Rfc };

/**
 * How the account holder name on the CEP compares with the legal name on the
 * supplier's CFDI. Never an accusation, only a comparison.
 */
export type NameMatch = "match" | "partial" | "mismatch";

/** Response of `POST /api/v1/cep/verify`. */
export interface CepVerification {
  cep: Cep;
  nameMatch: NameMatch;
  finding: Finding;
}

/**
 * Which rail carried the one-cent probe. `nessie` is the company's bank mirror,
 * which is what the demo runs on; `stp` is the production path and refuses to
 * run without its own configuration. The screen names them apart on purpose:
 * the mirror is ours and the CEP is Banxico's, and a judge is owed the
 * difference.
 */
export type VerificationRail = RailId;

/**
 * How far the one-cent verification of one instruction has got.
 *
 * Six states and not a boolean, because each one is a different thing to tell a
 * clerk: nothing has been sent, the cent left and carries a clave de rastreo,
 * Banxico has not published the CEP yet, the CEP is in and signed, the large
 * payment was released, the large payment was blocked.
 */
export type VerificationStateName = DomainVerificationStateName;

/**
 * What the server is able to say about the Banxico seal on the CEP it holds.
 *
 * `not_checked` is the ordinary case and not an edge one: the CEP carries the
 * serial of the Banxico certificate and not the certificate itself, so a
 * deployment with no `BANXICO_CEP_CERT_PEM` parsed the document and verified
 * nothing. It reads as "no verificado" and never as "valido", which is the one
 * claim this screen is not allowed to make on its own.
 */
export type CepSealState = SealState;

/**
 * `GET /api/v1/instructions/:id/verification`, and the 202 body of
 * `POST /api/v1/instructions/:id/verify-account`.
 *
 * Issue 166 landed the shape in `packages/core/src/domain.ts`, so this is the
 * domain type and not a second declaration of it: the clave the bank answered
 * with, the holder Banxico reports, the legal name it is compared against, the
 * verdict, the seal state, and the decision the engine signed. Three of the four
 * aliases above are the same promotion.
 */
export type VerificationState = DomainVerificationState;

/**
 * `POST /api/v1/instructions/:id/verify-call`, one of three ways.
 *
 * `toNumber` rings the supplier through the voice agent, `conversationId`
 * collects a call that already happened, and `outcome` records one a person
 * made on their own telephone. None of them releases a payment.
 */
export type VerifyCallBody =
  | { toNumber: string }
  | { conversationId: string }
  | { outcome: VerificationOutcome; evidence?: string; recordedBy: string };

/** What the agent says, or what the clerk reads out when there is no telephony. */
export interface VerificationScriptText {
  firstMessage: string;
  question: string;
  /** Four digits. The full CLABE is never spoken and never sent here. */
  clabeLast4: string;
  spoken: string[];
}

/** Response of `POST /api/v1/instructions/:id/verify-call`. */
export interface VerifyCallResult {
  /** `calling` means the telephone is ringing and there is no transcript yet. */
  status: "calling" | "recorded";
  script: VerificationScriptText;
  conversationId?: string;
  outcome?: VerificationOutcome;
  evidence?: string;
  transcript?: VerificationTurn[];
  /** Always false. The release stays a decision a person signs. */
  releasesPayment: false;
}

/** Response of `GET /api/v1/instructions/:id/verify-call`. Side effect free. */
export interface VerifyCallScript {
  script: VerificationScriptText;
  /** Whether this deployment can place the call, or only print the script. */
  voiceConfigured: boolean;
  releasesPayment: false;
}

/** The same 422 body, plus the script, when the voice integration is absent. */
export interface VerifyCallUnavailable extends ApiErrorBody {
  script: VerificationScriptText;
}

/** `POST /api/v1/seed`, development only, guarded by ALLOW_SEED=1. */
export interface SeedBody {
  seed?: number;
  reset?: boolean;
}

/** Re-exported so screens import one module, not two. */
export type { Metrics, SweepResult, VerificationOutcome, VerificationTurn };

/** The error envelope every failing route returns, from docs/09-api.md. */
export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    requestId: string;
  };
}

/* ---------------------------------------------------------------- assistant */

/**
 * The assistant panel, typed from the domain rather than from the screen.
 *
 * `AssistantMessage`, `AssistantToolCall`, `ActionProposal` and `AssistantSession`
 * are the shapes `packages/core/src/domain.ts` gained with the contract of issue
 * 221, so nothing here redeclares them: the panel, the API and the ledger read
 * one definition. What this block adds is the two things only a caller needs, the
 * request body of `POST /api/v1/assistant/messages` and the five events its
 * stream carries, both straight out of the table in `docs/09-api.md`.
 *
 * ADR-0007 is what makes the typing worth reading rather than bureaucracy:
 * `AssistantToolCall.readOnly` is the literal `true`, so a tool call that writes
 * cannot be expressed, and `ActionProposal` is the only thing a turn can offer.
 * The panel never turns one into a write on its own. `confirmProposal` in
 * `./assistant.ts` is a person pressing a button, and it carries `X-Actor`.
 */
export type {
  ActionProposal,
  Actor,
  ActorRole,
  AssistantAuthor,
  AssistantMessage,
  AssistantSession,
  AssistantTool,
  AssistantToolCall,
  Confidence,
  EvidenceValue,
  ProposalKind,
  ProposalValue,
  TransactionState,
};

/**
 * One image the clerk dropped or pasted into the panel.
 *
 * The bytes stay a `File`: the turn is posted as `multipart/form-data`, which is
 * the first form `docs/09-api.md` documents, so nothing has to be base64 encoded
 * in a browser on a phone. `name`, `mediaType` and `bytes` are what the card
 * shows, and all three are facts about the file the browser handed us rather
 * than anything a model said about it.
 */
export interface AssistantImage {
  file: File;
  name: string;
  mediaType: string;
  bytes: number;
}

/** `POST /api/v1/assistant/messages`. A new `sessionId` is minted when absent. */
export interface AssistantTurnBody {
  sessionId?: string;
  text: string;
  images?: readonly AssistantImage[];
}

/**
 * The five events of the assistant stream, as the panel consumes them.
 *
 * One for one with the table in `docs/09-api.md`: `token` is the answer as it is
 * written, `tool_call` a read that started, `tool_result` that read answering,
 * `proposal` the one action the turn offers, and `done` the whole stored turn,
 * which is what `GET /api/v1/assistant/sessions/:id` replays.
 */
export type AssistantStreamEvent =
  | { kind: "token"; text: string; sessionId?: string }
  | { kind: "tool_call"; call: AssistantToolCall }
  | { kind: "tool_result"; call: AssistantToolCall }
  | { kind: "proposal"; proposal: ActionProposal }
  | { kind: "done"; message: AssistantMessage };
