/**
 * The intake pipeline: what happens between a payment instruction arriving and
 * the clerk seeing a hold, a verify or a release.
 *
 * The pipeline is the seam between transport and intelligence, and it is
 * deliberately the only file in this workspace that knows both sides. It
 * gathers the evidence the controls need, hands it to @hackmty/engine, and
 * shapes what comes back. It decides nothing itself.
 *
 * There is no detector wiring here any more, and that is the point of issue
 * #106. `runControls` takes one typed `ComposeInput` and runs all six adapters;
 * this file's whole job is to fill that object from the repository. A control
 * that produces nothing comes back either as "ran and found nothing" or as a
 * named skip with the reason, so silence can never be mistaken for a clean
 * payment.
 */

import { nameMatch } from "@hackmty/cep";
import type {
  ComposeInput,
  CompositionReport,
  PaymentInstruction,
  SweepResult,
} from "@hackmty/core";
import { decide, sumAmounts, supplierModelOf } from "@hackmty/core";
import { runControls } from "@hackmty/engine";
import type { IntakeRecord, Repository, SweepSubject } from "./repo";
import type { CreateInstructionBody, NameMatch } from "./schemas";

/* -------------------------------------------------------------------------- */
/* Clock and identifiers                                                       */
/* -------------------------------------------------------------------------- */

export interface PipelineClock {
  now(): string;
  newId(prefix: string): string;
}

export function createClock(): PipelineClock {
  return {
    now: () => new Date().toISOString(),
    newId: (prefix) => `${prefix}-${crypto.randomUUID()}`,
  };
}

/* -------------------------------------------------------------------------- */
/* Intake                                                                      */
/* -------------------------------------------------------------------------- */

export type IntakeFailure =
  | "unknown_supplier"
  | "unreadable_image"
  | "unknown_cfdi";

export type IntakeOutcome =
  | { ok: true; record: IntakeRecord }
  | { ok: false; reason: IntakeFailure; message: string };

/**
 * Reads a CLABE out of a photographed or scanned instruction.
 *
 * TODO(garzario): this is issue #97. The model is boxed to OCR: it receives the
 * image and returns digits and a confidence, it never sees the supplier, the
 * amount or the history, and it never decides anything. That boundary is what
 * docs/06-regulatory-privacy.md promises, so it has to hold in the code and not
 * only in the prose. Until it exists, an image-only instruction is refused with
 * a message that says so rather than a CLABE nobody read.
 */
async function extractClabeFromImage(
  _image: string,
): Promise<{ clabe: string; confidence: number } | undefined> {
  return undefined;
}

export async function runIntake(
  repo: Repository,
  clock: PipelineClock,
  body: CreateInstructionBody,
): Promise<IntakeOutcome> {
  const now = clock.now();
  const id = clock.newId("ins");

  let clabe = body.clabe;
  let ocrConfidence: number | undefined;
  let imageRef: string | undefined;

  if (body.image !== undefined) {
    // TODO(fabbyyyy): store the bytes in blob storage and keep the reference.
    // The API must not hold a base64 image in memory past this function.
    imageRef = `intake/${id}`;
    const read = await extractClabeFromImage(body.image);
    if (read !== undefined) {
      clabe = read.clabe;
      ocrConfidence = read.confidence;
    }
  }

  if (clabe === undefined) {
    return {
      ok: false,
      reason: "unreadable_image",
      message:
        "The CLABE could not be read from the image. Send it as text in `clabe`.",
    };
  }

  const supplierRfc = await resolveSupplierRfc(repo, body);
  if (supplierRfc === undefined) {
    return {
      ok: false,
      reason: "unknown_supplier",
      message:
        "Send `supplierRfc`, or `cfdiUuids` of a CFDI we already hold, so the instruction can be attached to a supplier.",
    };
  }

  const instruction: PaymentInstruction = {
    id,
    supplierRfc,
    cfdiUuids: body.cfdiUuids ?? [],
    clabe,
    amount: body.amount,
    source: body.source,
    receivedAt: now,
    // The repository decides what synthetic means: MemoryRepository is the
    // synthetic store, Postgres is not.
    synthetic: true,
  };
  if (body.text !== undefined) {
    instruction.text = body.text;
  }
  if (imageRef !== undefined) {
    instruction.imageRef = imageRef;
  }
  if (ocrConfidence !== undefined) {
    instruction.ocrConfidence = ocrConfidence;
  }

  const input = await composeInputFor(repo, instruction, now);
  const report = runControls(input);
  // The cost of delaying this payment comes off the supplier record, so the
  // engine weighs the expected loss against a number somebody can point at
  // instead of the zero this file used to invent.
  const decision = decide(
    instruction,
    report.findings,
    supplierModelOf(input.supplier),
    { now },
  );

  return {
    ok: true,
    record: { instruction, findings: report.findings, decision },
  };
}

async function resolveSupplierRfc(
  repo: Repository,
  body: CreateInstructionBody,
): Promise<string | undefined> {
  if (body.supplierRfc !== undefined) {
    return body.supplierRfc;
  }

  const uuids = body.cfdiUuids ?? [];
  if (uuids.length === 0) {
    return undefined;
  }

  const cfdis = await repo.cfdisByUuid(uuids);
  return cfdis[0]?.issuerRfc;
}

/**
 * Gathers the evidence one instruction needs and runs all six controls over it.
 *
 * Exported because the report is worth asserting on directly: `report.ran` and
 * `report.skipped` together are always the six controls, and a test that only
 * looked at the findings would not notice a control that stopped being called.
 * That is exactly how the bug in issue #106 survived a green suite.
 *
 * The CEP offered is the one already verified for the account this instruction
 * pays to, if there is one. A CEP verified for a different account proves
 * nothing about this payment, so it is not offered as though it did, and the
 * adapter refuses it again on its own side.
 */
export async function runControlsFor(
  repo: Repository,
  instruction: PaymentInstruction,
  now: string,
): Promise<CompositionReport> {
  return runControls(await composeInputFor(repo, instruction, now));
}

/** Everything the six controls read, assembled from the repository. */
async function composeInputFor(
  repo: Repository,
  instruction: PaymentInstruction,
  now: string,
): Promise<ComposeInput> {
  const supplier = await repo.findSupplier(instruction.supplierRfc);
  const detail =
    supplier === undefined
      ? undefined
      : await repo.supplierDetail(instruction.supplierRfc);
  const beneficiary = detail?.verifiedBeneficiaries.find(
    (row) => row.clabe === instruction.clabe,
  );

  const input: ComposeInput = {
    instruction,
    // Company wide, not per supplier: the concentration signal needs the whole
    // ledger as its denominator and the duplicate detector narrows itself.
    cfdis: await repo.allCfdis(),
    complements: await repo.allComplements(),
    satEntries: await repo.satLookup(instruction.supplierRfc),
    bankMirror: await repo.bankMirror(),
    now,
  };
  if (supplier !== undefined) {
    input.supplier = supplier;
  }
  if (beneficiary !== undefined) {
    input.cep = beneficiary.cep;
  }
  return input;
}

/* -------------------------------------------------------------------------- */
/* Retroactive sweep                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Prices a 69-B publication against everything already paid and deducted.
 *
 * `deductedBase` and `ivaExposure` are sums of fields that are already on the
 * documents, so they are computed here with core's cent-safe helpers. The ISR
 * exposure is a model, not a sum, and it stays at zero with a TODO rather than
 * showing a rate this file invented.
 *
 * TODO(garzario): issue #35, export `sweepExposure` from @hackmty/core with the rate
 * and the treatment of partially paid PPD, and this function becomes a pass
 * through.
 */
export async function runRetroactiveSweep(
  listVersion: string,
  subjects: SweepSubject[],
): Promise<SweepResult> {
  const priced = subjects.map((subject) => {
    const deductedBase = sumAmounts(subject.paidCfdis.map((c) => c.subtotal));
    const ivaExposure = sumAmounts(subject.paidCfdis.map((c) => c.iva));

    return {
      supplier: subject.supplier,
      status: subject.status,
      paidCfdis: subject.paidCfdis,
      deductedBase,
      isrExposure: 0,
      ivaExposure,
    };
  });

  return {
    listVersion,
    newlyListed: priced,
    totalExposure: sumAmounts(
      priced.flatMap((row) => [row.isrExposure, row.ivaExposure]),
    ),
  };
}

/* -------------------------------------------------------------------------- */
/* Beneficiary name comparison                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Compares the account holder on the CEP with the legal name on the CFDI.
 *
 * One line, because the comparison is not this workspace's to invent:
 * `nameMatch` in @hackmty/cep knows what "SA de CV" and a bank-truncated
 * corporate name mean in Mexico, and "partial" is the answer that matters.
 */
export function compareBeneficiaryName(
  cepHolder: string,
  legalName: string,
): NameMatch {
  return nameMatch(cepHolder, legalName);
}
