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
import { decide, supplierModelOf } from "@hackmty/core";
import { runControls } from "@hackmty/engine";
import { priceSweep } from "@hackmty/sat";
import { type IntakeExtractor, UNAVAILABLE_EXTRACTOR } from "./extraction";
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
 * Runs one instruction through intake.
 *
 * `extractor` is issue #97, wired here and implemented in `@hackmty/extract`.
 * The model is boxed to transcription: it receives the file the clerk sent and
 * returns digits, words and a confidence, it never sees the supplier, the
 * history or the ledger, and it never decides anything. `src/extraction.ts`
 * holds the adapter and `packages/extract/src/boundary.test.ts` holds the test
 * that fails if the boundary ever moves. A server with no `GEMINI_API_KEY` gets
 * `UNAVAILABLE_EXTRACTOR`, which refuses with a message rather than inventing a
 * CLABE nobody read.
 */
export async function runIntake(
  repo: Repository,
  clock: PipelineClock,
  body: CreateInstructionBody,
  extractor: IntakeExtractor = UNAVAILABLE_EXTRACTOR,
): Promise<IntakeOutcome> {
  const now = clock.now();
  const id = clock.newId("ins");

  let clabe = body.clabe;
  let ocrConfidence: number | undefined;
  let imageRef: string | undefined;
  let audioRef: string | undefined;
  let transcript: string | undefined;

  if (body.image !== undefined) {
    // TODO(fabbyyyy): store the bytes in blob storage and keep the reference.
    // The API must not hold a base64 image in memory past this function.
    imageRef = `intake/${id}/image`;
    const read = await extractor.image(body.image);
    if (!read.ok) {
      return { ok: false, reason: "unreadable_image", message: read.message };
    }
    // A CLABE the clerk typed wins over one a model read, always.
    if (clabe === undefined && read.value.clabe !== undefined) {
      clabe = read.value.clabe;
      ocrConfidence = read.value.confidence;
    }
  }

  if (body.audio !== undefined) {
    audioRef = `intake/${id}/audio`;
    const heard = await extractor.audio(body.audio);
    if (!heard.ok) {
      return { ok: false, reason: "unreadable_image", message: heard.message };
    }
    transcript = heard.value.transcript;
    if (clabe === undefined && heard.value.clabe !== undefined) {
      clabe = heard.value.clabe;
      ocrConfidence = heard.value.confidence;
    }
  }

  if (clabe === undefined) {
    return {
      ok: false,
      reason: "unreadable_image",
      message:
        "The CLABE could not be read from the file. Send it as text in `clabe`.",
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
  // The transcript of a voice note is context for the clerk and nothing else.
  // `PaymentInstruction.text` says so in domain.ts and no detector reads it.
  const text = body.text ?? transcript;
  if (text !== undefined) {
    instruction.text = text;
  }
  if (imageRef !== undefined) {
    instruction.imageRef = imageRef;
  }
  if (audioRef !== undefined) {
    instruction.audioRef = audioRef;
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
    // The list versions this instance holds, and deliberately NOT the
    // committed download of the real SAT list that `GET /sat/lookup` reads.
    // ADR-0002: every instruction here carries a synthetic RFC, so joining
    // the real list to one is exactly what the ADR forbids. Real rows answer
    // the read-only lookup a person typed into, and nothing else.
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
 * A pass through to `priceSweep` in @hackmty/sat, which owns the arithmetic and
 * the two rates: ISR at 30 percent applied to the base already deducted, and IVA
 * summed from what the CFDIs actually carry rather than multiplied out of a
 * rate. Both are documented as assumptions at the top of
 * `packages/sat/src/sweep.ts`, which is where they belong: a rate a route
 * handler owns is a rate nobody reviews.
 *
 * The subjects come from the repository rather than from a ledger replay,
 * because the repository is what this API stores. `sweep` in the same package is
 * the fold over `LedgerEvent[]` and gives the same numbers for the same
 * invoices, which is what keeps the Postgres implementation honest when it
 * lands.
 */
export async function runRetroactiveSweep(
  listVersion: string,
  subjects: SweepSubject[],
): Promise<SweepResult> {
  return priceSweep(subjects, { listVersion });
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
