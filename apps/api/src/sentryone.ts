/**
 * Boots the API on the generated demo company instead of the hand-written fixture.
 *
 * `SEED=sentryone` switches `createDeps` onto this, and then every endpoint in
 * docs/09-api.md serves 44 suppliers, eight months of CFDIs and complements, and the
 * current week's payment run, all of it deterministic from one seed. Two laptops with
 * the same `SEED_NUMBER` serve byte-identical data, which is what makes a rehearsal
 * reproducible and a screenshot still true an hour later.
 *
 * What deliberately does NOT come across from the generator: findings, decisions and
 * labelled cases. A finding is the engine's output, so the generator shipping its own
 * would be the generator answering the question the detectors exist to answer, and
 * `GET /api/v1/metrics` reports zero cases rather than a score nobody earned. The
 * blind holdout owns that number.
 *
 * The findings and the decisions on the run are therefore produced here instead, by
 * running the same six controls the intake endpoint runs, over the generated company,
 * at boot. That is the whole vertical slice in one function: seed, engine, repository,
 * screen. A payment run that opened on an empty alert rail would be a screen that
 * proves nothing.
 *
 * The bank mirror does come across, because `bank_reconciliation` reads it: eight
 * months of SPEI, one row per transfer, every one of them backed by the complement
 * that documents it. An outflow with no document behind it is a labelled positive
 * and lives in the holdout, not here.
 */

import { loadSentryOne, SENTRYONE_SEED_NAME } from "@hackmty/seed";
import { assessRun } from "./assess";
import type { SyntheticDataset } from "./synthetic";

/** The demo ids `bun run seed` prints and `docs/10-demo-script.md` names. */
export interface SentryOneBootNotes {
  seed: number;
  weekOf: string;
  runId: string;
  heroInstructionIds: string[];
  demoRfcs: string[];
  /** What the engine found on the run, so the boot log is not a promise. */
  findings: number;
  held: number;
  toVerify: number;
}

/**
 * The instant the controls are given for the seeded run.
 *
 * The generator names the day the run is prepared, and the detectors are handed
 * that day rather than the wall clock, so two laptops that boot the same seed an
 * hour apart still produce the same findings and a screenshot stays true.
 * 09:00 in Monterrey, which is UTC-6 all year.
 *
 * Exported because `PostgresRepository.load` assesses the same run before it
 * stores it. Two copies of this constant would be two companies that disagree
 * about what day it is, and the memory and Postgres runs would stop matching.
 */
export function runInstant(runDay: string): string {
  return `${runDay}T15:00:00.000Z`;
}

let lastNotes: SentryOneBootNotes | undefined;

/** What the last `sentryoneDataset` call loaded, for the boot log. */
export function sentryoneBootNotes(): SentryOneBootNotes | undefined {
  return lastNotes;
}

/**
 * Builds the dataset for a seed. `POST /api/v1/seed` passes a different number and
 * gets a different company, which is what that endpoint always claimed to do.
 */
export function sentryoneDataset(seed: number): SyntheticDataset {
  const snapshot = loadSentryOne(seed === 0 ? {} : { seed });
  const assessed = assessRun({
    suppliers: snapshot.suppliers,
    cfdis: snapshot.cfdis,
    complements: snapshot.complements,
    instructions: snapshot.instructions,
    satEntries: snapshot.satEntries,
    bankMirror: snapshot.bankMirror,
    now: runInstant(snapshot.runDay),
  });

  lastNotes = {
    seed: snapshot.seed,
    weekOf: snapshot.weekOf,
    runId: snapshot.runId,
    heroInstructionIds: snapshot.heroInstructionIds,
    demoRfcs: snapshot.demoRfcs,
    findings: assessed.findings.length,
    held: assessed.decisions.filter((row) => row.action === "hold").length,
    toVerify: assessed.decisions.filter((row) => row.action === "verify")
      .length,
  };

  return {
    companyRfc: snapshot.companyRfc,
    companyName: snapshot.companyName,
    runId: snapshot.runId,
    weekOf: snapshot.weekOf,
    suppliers: snapshot.suppliers,
    cfdis: snapshot.cfdis,
    complements: snapshot.complements,
    instructions: snapshot.instructions,
    findings: assessed.findings,
    findingsByInstruction: assessed.findingsByInstruction,
    decisions: assessed.decisions,
    satEntries: snapshot.satEntries,
    beneficiaries: [],
    bankMirror: snapshot.bankMirror,
    ledger: snapshot.ledger,
  };
}

/** True when the environment asks for the generated company. */
export function wantsSentryOne(seedName: string | undefined): boolean {
  return seedName === SENTRYONE_SEED_NAME;
}
