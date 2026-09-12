/**
 * Runs the six controls over a whole payment run at once.
 *
 * `pipeline.ts` assesses one instruction as it arrives, reading the evidence out
 * of the repository. This file does the same thing for a run that is already
 * there: the generated company in `@hackmty/seed` ships 92 instructions and no
 * findings, on purpose, because a generator that shipped its own findings would
 * be answering the question the detectors exist to answer. So the engine is run
 * over it here, at boot, and the payment-run screen opens on real detector
 * output instead of an empty alert rail.
 *
 * Both paths build the same `ComposeInput` and call the same `runControls`, so
 * a control that changes its evidence breaks the build in both places rather
 * than only in the one somebody remembered.
 *
 * One difference, and it is deliberate. The intake path also asks the committed
 * official 69-B snapshot about the RFC on the instruction; this one reads only
 * the versions the dataset carries, because it is synchronous and the snapshot
 * is read from disk. The two cannot disagree on this data: every supplier in
 * the generated company is synthetic and a synthetic RFC is on no real list, so
 * the official snapshot has nothing to add to any of them.
 *
 * Nothing here decides anything either: `decide` is the sixth control and it
 * lives in @hackmty/core. The decisions this returns carry no `decidedBy`,
 * because nobody has pressed a button yet.
 */

import type {
  Cfdi,
  Decision,
  Finding,
  LedgerTx,
  PaymentComplement,
  PaymentInstruction,
  SatListEntry,
  Supplier,
} from "@hackmty/core";
import { decide, supplierModelOf } from "@hackmty/core";
import { runControls } from "@hackmty/engine";

/** Everything the controls read, for every instruction of one run. */
export interface RunEvidence {
  suppliers: readonly Supplier[];
  cfdis: readonly Cfdi[];
  complements: readonly PaymentComplement[];
  instructions: readonly PaymentInstruction[];
  /** Every 69-B row this company holds, across versions. Narrowed per RFC. */
  satEntries: readonly SatListEntry[];
  /** The bank mirror, for `bank_reconciliation`. Empty means not imported. */
  bankMirror: readonly LedgerTx[];
  /** The instant the run is assessed at. The seed carries the run day. */
  now: string;
}

/** What the repository stores: the rail, the index into it, and the actions. */
export interface AssessedRun {
  /** Deduplicated by id, because one supplier finding can reach two lines. */
  findings: Finding[];
  /** Finding ids per instruction id, which is how the run screen indexes them. */
  findingsByInstruction: Record<string, string[]>;
  decisions: Decision[];
}

export function assessRun(evidence: RunEvidence): AssessedRun {
  const suppliers = new Map(
    evidence.suppliers.map((supplier) => [supplier.rfc, supplier]),
  );
  const satByRfc = new Map<string, SatListEntry[]>();
  for (const entry of evidence.satEntries) {
    const rows = satByRfc.get(entry.rfc);
    if (rows === undefined) {
      satByRfc.set(entry.rfc, [entry]);
    } else {
      rows.push(entry);
    }
  }

  const findings = new Map<string, Finding>();
  const findingsByInstruction: Record<string, string[]> = {};
  const decisions: Decision[] = [];

  for (const instruction of evidence.instructions) {
    const supplier = suppliers.get(instruction.supplierRfc);
    const report = runControls({
      instruction,
      ...(supplier === undefined ? {} : { supplier }),
      // Company wide, not per supplier: the concentration signal of
      // `supplier_behaviour` needs the whole ledger as its denominator.
      cfdis: evidence.cfdis,
      complements: evidence.complements,
      satEntries: satByRfc.get(instruction.supplierRfc) ?? [],
      bankMirror: evidence.bankMirror,
      now: evidence.now,
      // No `cep`: the verified-beneficiary registry starts empty and fills up
      // when a one-cent probe is verified, so the control reports itself as not
      // armed rather than as verified.
    });

    for (const finding of report.findings) {
      findings.set(finding.id, finding);
    }
    findingsByInstruction[instruction.id] = report.findings.map(
      (finding) => finding.id,
    );
    decisions.push(
      decide(instruction, report.findings, supplierModelOf(supplier), {
        now: evidence.now,
      }),
    );
  }

  return {
    findings: [...findings.values()],
    findingsByInstruction,
    decisions,
  };
}
