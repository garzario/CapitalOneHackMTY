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
  Cep,
  Cfdi,
  Clabe,
  Decision,
  Finding,
  InstructionSource,
  LedgerEvent,
  Metrics,
  PaymentComplement,
  PaymentInstruction,
  Rfc,
  SatListEntry,
  Supplier,
  SweepResult,
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
 * Totals of one payment run.
 *
 * `instructions` is a count. `amount` is the sum of the run in MXN.
 *
 * TODO(fabbyyyy): `held`, `toVerify` and `released` are read here as MXN sums,
 * because that is what a clerk needs to see next to `amount`. docs/09-api.md
 * does not say whether they are amounts or counts. Confirm when the route is
 * implemented and, if they turn out to be counts, change this interface rather
 * than dividing the meaning across the two sides.
 */
export interface PaymentRunTotals {
  instructions: number;
  amount: number;
  held: number;
  toVerify: number;
  released: number;
}

/** One row of the payment-run table. */
export interface PaymentRunItem {
  instruction: PaymentInstruction;
  supplier: Supplier;
  decision: Decision;
  findings: Finding[];
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

/** `POST /api/v1/instructions/:id/decide`. A person always confirms. */
export interface DecideBody {
  action: Action;
  decidedBy: string;
}

/** `POST /api/v1/sat/publish`. Simulation accepts synthetic RFCs only. */
export type SatPublishBody =
  | { listVersion: string; entries: SatListEntry[] }
  | { simulate: true; rfcs: Rfc[] };

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
