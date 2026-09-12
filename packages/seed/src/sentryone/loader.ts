/**
 * The loader the API calls at boot, and the only thing outside this package that has
 * to know the SentryOne dataset exists.
 *
 * `apps/api` sets `SEED=sentryone` and gets this snapshot instead of the hand-written
 * fixture in `apps/api/src/synthetic.ts`. Everything in it is a domain type from
 * @hackmty/core, so the repository stores it without translating anything, and the
 * route handlers cannot tell the difference between a company that came from here and
 * one that came from Postgres.
 *
 * What is deliberately NOT in the snapshot: findings, decisions, verified
 * beneficiaries and labelled cases. A finding is the engine's output and a generator
 * that shipped its own findings would be a generator answering the question the
 * detectors exist to answer. The API runs the detectors over this data instead.
 */

import type {
  Cfdi,
  LedgerEvent,
  LedgerTx,
  PaymentComplement,
  PaymentInstruction,
  Rfc,
  SatListEntry,
  Supplier,
} from "@hackmty/core";
import { generateSentryOne } from "./generator";
import type { SentryOneOptions } from "./types";

/** The environment value that switches the API onto this dataset. */
export const SENTRYONE_SEED_NAME = "sentryone";

export interface SentryOneSnapshot {
  seed: number;
  companyRfc: Rfc;
  companyName: string;
  runId: string;
  /** Monday of the payment-run week. */
  weekOf: string;
  /** The day the run is prepared, which is the "now" the detectors are given. */
  runDay: string;
  suppliers: Supplier[];
  cfdis: Cfdi[];
  complements: PaymentComplement[];
  instructions: PaymentInstruction[];
  satEntries: SatListEntry[];
  ledger: LedgerEvent[];
  /** The bank mirror, for `bank_reconciliation`. */
  bankMirror: LedgerTx[];
  /** The run lines the demo opens on, in demo order. */
  heroInstructionIds: string[];
  /** Company first, then the suppliers the demo names out loud. */
  demoRfcs: Rfc[];
}

/**
 * Builds the snapshot. Deterministic for a given seed and week: two laptops asking
 * for the same seed serve byte-identical data, which is what makes a rehearsal
 * reproducible and a screenshot still true an hour later.
 */
export function loadSentryOne(
  options: SentryOneOptions = {},
): SentryOneSnapshot {
  const dataset = generateSentryOne(options);
  const { demoRfcs } = dataset.notes;

  return {
    seed: dataset.seed,
    companyRfc: dataset.company.rfc,
    companyName: dataset.company.legalName,
    runId: dataset.runId,
    weekOf: dataset.weekOf,
    runDay: dataset.runDay,
    suppliers: dataset.suppliers,
    cfdis: dataset.cfdis,
    complements: dataset.complements,
    instructions: dataset.instructions,
    satEntries: dataset.satEntries,
    ledger: dataset.events,
    bankMirror: dataset.bankMirror,
    heroInstructionIds: [...dataset.notes.heroInstructionIds],
    demoRfcs: [
      demoRfcs.company,
      demoRfcs.listed,
      demoRfcs.bankChange,
      demoRfcs.ramping,
    ].filter((rfc) => rfc !== ""),
  };
}
