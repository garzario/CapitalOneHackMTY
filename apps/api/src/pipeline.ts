/**
 * The intake pipeline: what happens between a payment instruction arriving and
 * the clerk seeing a hold, a verify or a release.
 *
 * The pipeline is the seam between transport and intelligence, and it is
 * deliberately the only file in this workspace that knows both sides. It
 * gathers the evidence a detector needs, hands it to @hackmty/core, and shapes
 * what comes back. It decides nothing itself.
 *
 * The detectors and the expected-loss engine now live in @hackmty/core, so
 * `composeFindings` and `decide` are imported by name and called with the
 * arguments they actually take, and the detectors are handed in explicitly
 * through `ComposeOptions.detectors`, which is the seam core documents for this
 * caller. Core's dynamic registry is a discovery aid for a half-built package,
 * not a contract: it cannot know that one detector needs `now` and another
 * needs the UUIDs under review, and a detector it cannot call is skipped in
 * silence. Silence that reads as "nothing found" is the one failure this
 * product cannot ship, so the wiring is written down here instead.
 *
 * What is still feature-detected is only what core has not exported yet:
 *
 * TODO(garzario): implement and export from @hackmty/core
 *   - sweepExposure(subjects): per-supplier ISR and IVA     issue #35
 *   - compareLegalNames(a, b): match, partial or mismatch    issue #37
 */

import type {
  Cfdi,
  DetectorModule,
  Finding,
  PaymentInstruction,
  SupplierModel,
  SweepResult,
} from "@hackmty/core";
import * as core from "@hackmty/core";
import {
  composeFindings,
  decide,
  detectClabe,
  detectDuplicateInvoice,
  detectSupplierBehaviour,
  sumAmounts,
} from "@hackmty/core";
import type { IntakeRecord, Repository, SweepSubject } from "./repo";
import type { CreateInstructionBody, NameMatch } from "./schemas";

/* -------------------------------------------------------------------------- */
/* Feature detection                                                           */
/* -------------------------------------------------------------------------- */

type CompareLegalNames = (left: string, right: string) => NameMatch;

/**
 * Reads a named function off @hackmty/core without importing it, so a missing
 * export is a runtime `undefined` rather than a compile error for everybody.
 */
function coreFunction<F>(name: string): F | undefined {
  const candidate = (core as unknown as Record<string, unknown>)[name];
  return typeof candidate === "function" ? (candidate as F) : undefined;
}

/* -------------------------------------------------------------------------- */
/* Detector wiring                                                             */
/* -------------------------------------------------------------------------- */

/**
 * What a day of delay costs with this supplier, which is the only thing `decide`
 * weighs the expected loss against.
 *
 * Nothing in the repository stores that number yet, so this file does not invent
 * one: the cost stays at zero and the weight at one. With a zero delay cost the
 * engine verifies anything that carries a positive expected loss and releases
 * only what is clean, which is the conservative reading of the same rule and the
 * one that never moves money on a guess.
 *
 * TODO(fabbyyyy): the delay cost per day and the relationship weight belong on
 * the supplier record, next to `knownAccounts`. Read them here once they are
 * stored and this constant goes away.
 */
const UNPRICED_SUPPLIER: SupplierModel = {
  delayCostPerDay: 0,
  relationshipWeight: 1,
};

/** A detector that answers with one finding or none, as a list. */
function listOf(finding: Finding | null): Finding[] {
  return finding === null ? [] : [finding];
}

/**
 * The detectors this API can feed, each called with what it actually takes.
 *
 * Three of the six are wired. The other three are named here so that their
 * absence is a decision on the record rather than an oversight:
 *
 * - `bank_reconciliation` compares the bank mirror against payments already
 *   sent. The API holds no bank mirror yet and an instruction that just arrived
 *   has not been sent, so running it at intake would report every new payment as
 *   missing from a statement that does not exist.
 * - `sat_69b` lives in `packages/sat` and `beneficiary_cep` in `packages/cep`.
 *   `apps/api` does not depend on either workspace yet, and @hackmty/core is
 *   forbidden from depending on them, so they reach the engine from here the day
 *   those dependencies are added.
 */
function detectorModules(
  now: string,
  allCfdis: readonly Cfdi[],
): DetectorModule[] {
  return [
    {
      detector: "clabe_forensics",
      run: (context) =>
        listOf(detectClabe(context.instruction, context.supplier)),
    },
    {
      detector: "duplicate_invoice",
      run: (context) =>
        detectDuplicateInvoice({
          cfdis: context.cfdis,
          complements: context.complements,
          // Only what this instruction claims to settle. An instruction that
          // names no CFDI settles nothing, and the ledger-wide sweep that an
          // absent `underReview` would trigger belongs to the nightly replay.
          underReview: context.instruction.cfdiUuids,
          now,
        }),
    },
    {
      detector: "supplier_behaviour",
      run: (context) =>
        context.supplier === undefined
          ? []
          : listOf(
              detectSupplierBehaviour({
                supplier: context.supplier,
                cfdis: allCfdis,
                now,
              }),
            ),
    },
  ];
}

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

  const findings = await detectFindings(repo, instruction, now);
  const decision = decide(instruction, findings, UNPRICED_SUPPLIER, { now });

  return { ok: true, record: { instruction, findings, decision } };
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
 * Gathers the evidence one instruction needs and hands it to core, which runs
 * whichever of the six detectors are built and skips the rest.
 *
 * The CEP is the one already fetched for the account this instruction pays to,
 * if there is one. A CEP verified for a different account proves nothing about
 * this payment, so it is not offered as if it did.
 */
async function detectFindings(
  repo: Repository,
  instruction: PaymentInstruction,
  now: string,
): Promise<Finding[]> {
  const supplier = await repo.findSupplier(instruction.supplierRfc);
  const detail =
    supplier === undefined
      ? undefined
      : await repo.supplierDetail(instruction.supplierRfc);
  const beneficiary = detail?.verifiedBeneficiaries.find(
    (row) => row.clabe === instruction.clabe,
  );

  return composeFindings(
    instruction,
    supplier,
    detail?.cfdis ?? [],
    detail?.complements ?? [],
    await repo.satLookup(instruction.supplierRfc),
    beneficiary?.cep,
    { detectors: detectorModules(now, await repo.allCfdis()) },
  );
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

function normaliseName(value: string): string {
  return value.toUpperCase().replace(/[.,]/g, "").replace(/\s+/g, " ").trim();
}

/**
 * Compares the account holder on the CEP with the legal name on the CFDI.
 *
 * The fallback is deliberately blunt: identical or not. "partial" is the
 * interesting answer and it needs a real name-distance function that knows what
 * "SA de CV" and an abbreviated first surname mean in a Mexican legal name.
 *
 * TODO(garzario): issue #37, export `compareLegalNames` from @hackmty/core so it returns
 * "partial" instead of over-reporting a mismatch.
 */
export function compareBeneficiaryName(
  cepHolder: string,
  legalName: string,
): NameMatch {
  const compare = coreFunction<CompareLegalNames>("compareLegalNames");
  if (compare !== undefined) {
    return compare(cepHolder, legalName);
  }

  return normaliseName(cepHolder) === normaliseName(legalName)
    ? "match"
    : "mismatch";
}
