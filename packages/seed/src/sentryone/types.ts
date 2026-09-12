/**
 * The shapes the SentryOne generator passes between its own files.
 *
 * Domain objects are never redefined here: a supplier is `Supplier` from
 * @hackmty/core and an invoice is `Cfdi`, per the rule in docs/09-api.md that the
 * repository never invents a second shape. What is defined here is the scaffolding
 * around them: the plan a case injector can change before anything is drawn, the
 * mutable draft it can change afterwards, and what the dataset reports about itself.
 */

import type {
  Cfdi,
  Clabe,
  LedgerEvent,
  LedgerTx,
  PaymentComplement,
  PaymentInstruction,
  Rfc,
  SatListEntry,
  Supplier,
} from "@hackmty/core";
import type { Rng } from "../rng";
import type { CompanyProfile } from "./company";
import type { SentryOneSupplierSpec } from "./suppliers";

/**
 * A payee as the bank statement names it. Nessie models a payment as a purchase
 * against a merchant, so the mirror carries one merchant per supplier and the
 * `merchantId` on every row points at it. The id is ObjectId-shaped on purpose:
 * Nessie mixes UUIDs and Mongo ObjectIds and nothing downstream may assume either.
 */
export interface SentryOneMerchant {
  id: string;
  rfc: Rfc;
  name: string;
  city: string;
  synthetic: true;
}

/**
 * One SPEI. It is the unit the bank sees and the unit a CEP is issued for, which is
 * why it exists at all: one transfer can settle several invoices, so a mirror row
 * per invoice would make the reconciliation detector report duplicates that never
 * happened.
 */
export interface SyntheticTransfer {
  /** Clave de rastreo. This is how the CEP for this payment is located at Banxico. */
  claveRastreo: string;
  supplierRfc: Rfc;
  beneficiaryAccount: Clabe;
  /** The instant the SPEI left, ISO 8601. */
  sentAt: string;
  /** The day the bank booked it, "YYYY-MM-DD", which is all Nessie would carry. */
  day: string;
  /** Total pesos that left the account in this one transfer. */
  amount: number;
  /** The invoices this transfer settles, in the order the complements were issued. */
  cfdiUuids: string[];
  synthetic: true;
}

/**
 * What a case injector may change BEFORE any object is drawn.
 *
 * Seasonality and a ramping supplier are properties of the cadence, not patches
 * applied to a finished dataset: an injector that appends invoices to a month it did
 * not plan produces folios out of order and complements that settle invoices issued
 * after them. So the plan is the first phase, and `apply` is the second.
 */
export interface GenerationPlan {
  company: CompanyProfile;
  /** Monday of the payment-run week. */
  weekOf: string;
  runDay: string;
  window: { from: string; to: string };
  /** The last day an invoice may be issued on, exclusive. */
  issuedBefore: string;
  /** The catalogue, plus anything an injector appended. Mutable on purpose. */
  specs: SentryOneSupplierSpec[];
  /**
   * Multiplier on a supplier's monthly invoice count, keyed `<rfc>|<YYYY-MM>`.
   * Missing means 1. This is where seasonality and a ramp live.
   */
  cadence: Map<string, number>;
  /**
   * Suppliers a case has already spoken for. A case that adds a supplier reserves it
   * in the plan phase, before any other case can pick it, so the ramping supplier and
   * the listed supplier never end up carrying somebody else's story as well.
   */
  reserved: Set<Rfc>;
}

/** The dataset while it is still being written to. Injectors mutate it in place. */
export interface SentryOneDraft {
  company: CompanyProfile;
  weekOf: string;
  runDay: string;
  window: { from: string; to: string };
  /** Cadence knobs per RFC, including suppliers an injector appended. */
  specs: Map<Rfc, SentryOneSupplierSpec>;
  suppliers: Supplier[];
  cfdis: Cfdi[];
  complements: PaymentComplement[];
  instructions: PaymentInstruction[];
  /** Article 69-B rows the simulated publication will carry. */
  satEntries: SatListEntry[];
  /**
   * Run lines a case has already taken, by identity. Two cases landing on one line
   * would make the demo ambiguous and the outcome notes wrong, and this is cheaper
   * than every injector having to know what the others did.
   */
  claimed: Set<PaymentInstruction>;
  /** Suppliers a case has already spoken for, for the same reason. */
  claimedSuppliers: Set<Rfc>;
}

/** A hard negative looks like fraud and is not. A demo positive is the other way. */
export type CaseKind = "hard_negative" | "demo_positive";

export interface CaseOutcome {
  name: string;
  kind: CaseKind;
  /** One sentence a judge could read off the screen. */
  description: string;
  /**
   * True only when the case is measurably in the dataset. An outcome that says
   * `false` is the honest half of this design: `notes` must never claim a case the
   * data does not contain, because the first judge who asks to see it will look.
   */
  applied: boolean;
  /** What it did, measured from the generated data, or what stopped it. */
  detail: string;
  /** The run line the case lands on, once the run has been numbered. */
  instructionId?: string;
  supplierRfc?: Rfc;
}

export interface CaseResult {
  outcome: CaseOutcome;
  /**
   * The instruction the case lands on. The generator reads its id back AFTER the
   * run is sorted and renumbered, so the id in `notes` is the one the clerk sees on
   * screen rather than the one it had mid-generation.
   */
  instruction?: PaymentInstruction;
}

export interface CaseInjector {
  name: string;
  kind: CaseKind;
  description: string;
  /** Change the cadence before anything is drawn. Optional. */
  plan?(plan: GenerationPlan, rng: Rng): void;
  /** Change the drawn data and report what actually landed. */
  apply(draft: SentryOneDraft, rng: Rng): CaseResult;
}

export interface SentryOneOptions {
  seed?: number;
  /**
   * Any day inside the current payment-run week. The run is built for the Monday of
   * that week. Defaults to today in UTC, which keeps the demo's "this week" honest.
   */
  weekOf?: string;
  months?: number;
  injectors?: readonly CaseInjector[];
  scenarios?: readonly CaseInjector[];
}

export interface SentryOneNotes {
  /**
   * The run lines the demo opens on, in demo order, one per scenario that landed.
   * The generator names WHICH line carries each scenario; it does not rank them.
   * Ranking by pesos at risk is the engine's answer, and a generator that ranked its
   * own cases would be a generator marking its own work.
   */
  heroInstructionIds: string[];
  /** The RFCs `bun run seed` prints, so the demo script can name them out loud. */
  demoRfcs: {
    company: Rfc;
    /** The supplier on the simulated Article 69-B publication. */
    listed: Rfc;
    /** The supplier that legitimately changed bank. */
    bankChange: Rfc;
    /** The supplier that ramped to around 15 per cent of the outflow, legitimately. */
    ramping: Rfc;
  };
  scenarios: CaseOutcome[];
  hardNegatives: CaseOutcome[];
  /** Everything the generator knows it has not done, printed by `bun run seed`. */
  pending: readonly string[];
}

export interface SentryOneDataset {
  seed: number;
  company: CompanyProfile;
  /** The CFDI history window, inclusive of `from`, exclusive of the run week. */
  window: { from: string; to: string };
  /** Monday of the current payment-run week. */
  weekOf: string;
  /** The day the run is prepared, which is the "now" every detector is given. */
  runDay: string;
  /** Stable id of this week's run, the one `GET /api/v1/run/current` reports. */
  runId: string;
  suppliers: Supplier[];
  merchants: SentryOneMerchant[];
  cfdis: Cfdi[];
  complements: PaymentComplement[];
  instructions: PaymentInstruction[];
  /** Every SPEI that has already left, one per clave de rastreo. */
  transfers: SyntheticTransfer[];
  /** The bank mirror: what Nessie would return for the company's account. */
  bankMirror: LedgerTx[];
  satEntries: SatListEntry[];
  /** Every object above, as the append-only event stream, in chronological order. */
  events: LedgerEvent[];
  notes: SentryOneNotes;
}

export interface SentryOneSummary {
  suppliers: number;
  cfdis: number;
  complements: number;
  transfers: number;
  bankMirrorRows: number;
  runSize: number;
  /** Total pesos in this week's run. */
  runAmount: number;
  /** Monthly supplier spend implied by the generated history. */
  monthlySpend: number;
  /** Pesos that have already left the account, from the bank mirror. */
  outflow: number;
  events: number;
  runSizeInBand: boolean;
  heroInstructionIds: string[];
}
