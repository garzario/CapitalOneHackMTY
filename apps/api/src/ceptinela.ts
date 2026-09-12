/**
 * Boots the API on the generated demo company instead of the hand-written fixture.
 *
 * `SEED=ceptinela` switches `createDeps` onto this, and then every endpoint in
 * docs/09-api.md serves 44 suppliers, eight months of CFDIs and complements, and the
 * current week's payment run, all of it deterministic from one seed. Two laptops with
 * the same `SEED_NUMBER` serve byte-identical data, which is what makes a rehearsal
 * reproducible and a screenshot still true an hour later.
 *
 * What deliberately does NOT come across: findings, decisions and labelled cases.
 * A finding is the engine's output, so the generator shipping its own would be the
 * generator answering the question the detectors exist to answer, and `GET
 * /api/v1/metrics` reports zero cases rather than a score nobody earned. The blind
 * holdout owns that number.
 *
 * The bank mirror does not come across either: the repository has no ledger-row read
 * yet, so `bun run seed` writes it into the `ledger_tx` table instead, where
 * `bank_reconciliation` will find it once the Postgres repository lands (issue #40).
 */

import { CEPTINELA_SEED_NAME, loadCeptinela } from "@hackmty/seed";
import type { SyntheticDataset } from "./synthetic";

/** The demo ids `bun run seed` prints and `docs/10-demo-script.md` names. */
export interface CeptinelaBootNotes {
  seed: number;
  weekOf: string;
  runId: string;
  heroInstructionIds: string[];
  demoRfcs: string[];
}

let lastNotes: CeptinelaBootNotes | undefined;

/** What the last `ceptinelaDataset` call loaded, for the boot log. */
export function ceptinelaBootNotes(): CeptinelaBootNotes | undefined {
  return lastNotes;
}

/**
 * Builds the dataset for a seed. `POST /api/v1/seed` passes a different number and
 * gets a different company, which is what that endpoint always claimed to do.
 */
export function ceptinelaDataset(seed: number): SyntheticDataset {
  const snapshot = loadCeptinela(seed === 0 ? {} : { seed });

  lastNotes = {
    seed: snapshot.seed,
    weekOf: snapshot.weekOf,
    runId: snapshot.runId,
    heroInstructionIds: snapshot.heroInstructionIds,
    demoRfcs: snapshot.demoRfcs,
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
    findings: [],
    findingsByInstruction: {},
    decisions: [],
    satEntries: snapshot.satEntries,
    beneficiaries: [],
    ledger: snapshot.ledger,
    labelledCases: [],
  };
}

/** True when the environment asks for the generated company. */
export function wantsCeptinela(seedName: string | undefined): boolean {
  return seedName === CEPTINELA_SEED_NAME;
}
