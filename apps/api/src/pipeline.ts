/**
 * The intake pipeline: what happens between a payment instruction arriving and
 * the clerk seeing a hold, a verify or a release.
 *
 * The pipeline is the seam between transport and intelligence, and it is
 * deliberately the only file in this workspace that knows both sides. It
 * gathers the evidence a detector needs, hands it to @hackmty/core, and shapes
 * what comes back. It decides nothing itself.
 *
 * The detectors do not exist yet, so every call into core is feature-detected
 * rather than imported by name. That is not politeness: importing
 * `composeFindings` before it is written breaks `bun run typecheck` for the
 * whole team, and stubbing it locally means two implementations racing to be
 * the real one. Feature detection lets the API ship today and pick the
 * detectors up the moment they land, with no change on this side.
 *
 * TODO(garzario): implement and export from @hackmty/core
 *   - composeFindings(input: DetectorInput): Finding[]      issues #34 #36 #39 #38
 *   - decide(input: DecisionInput): Decision                issue #38
 *   - sweepExposure(subjects): per-supplier ISR and IVA     issue #35
 *   - compareLegalNames(a, b): match, partial or mismatch    issue #37
 * The shapes below are the API's proposal, not a contract: if core wants a
 * different input, this file adapts and nothing else moves.
 */

import type {
  Cfdi,
  Decision,
  Finding,
  PaymentInstruction,
  SatListEntry,
  Supplier,
  SweepResult,
} from "@hackmty/core";
import * as core from "@hackmty/core";
import { sumAmounts } from "@hackmty/core";
import type { IntakeRecord, Repository, SweepSubject } from "./repo";
import type {
  CreateInstructionBody,
  NameMatch,
  VerifiedBeneficiary,
} from "./schemas";

/* -------------------------------------------------------------------------- */
/* Feature detection                                                           */
/* -------------------------------------------------------------------------- */

/** Everything the detectors need about one instruction, gathered once. */
export interface DetectorInput {
  instruction: PaymentInstruction;
  supplier?: Supplier;
  /** Every CFDI we hold from this supplier, not only the ones being settled. */
  cfdis: Cfdi[];
  satEntries: SatListEntry[];
  verifiedBeneficiaries: VerifiedBeneficiary[];
  now: string;
}

export interface DecisionInput {
  instruction: PaymentInstruction;
  findings: Finding[];
  now: string;
}

type ComposeFindings = (input: DetectorInput) => Finding[] | Promise<Finding[]>;
type Decide = (input: DecisionInput) => Decision | Promise<Decision>;
type CompareLegalNames = (left: string, right: string) => NameMatch;

/**
 * Reads a named function off @hackmty/core without importing it, so a missing
 * export is a runtime `undefined` rather than a compile error for everybody.
 */
function coreFunction<F>(name: string): F | undefined {
  const candidate = (core as unknown as Record<string, unknown>)[name];
  return typeof candidate === "function" ? (candidate as F) : undefined;
}

/** True once the detectors land. The health payload and the demo script read it. */
export function detectorsAvailable(): boolean {
  return coreFunction<ComposeFindings>("composeFindings") !== undefined;
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

  const findings = await composeFindings(repo, instruction, now);
  const decision = await decide({ instruction, findings, now });

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
 * Gathers the evidence and delegates. Until `composeFindings` exists in core
 * the answer is an empty list, which is the honest answer: no detector ran, so
 * nothing was found. It is never a fabricated finding, because a screenshot of
 * a fake alert is exactly the Wizard-of-Oz prototype the judges are hunting.
 */
async function composeFindings(
  repo: Repository,
  instruction: PaymentInstruction,
  now: string,
): Promise<Finding[]> {
  const compose = coreFunction<ComposeFindings>("composeFindings");
  if (compose === undefined) {
    // TODO(garzario): remove this branch once the detectors land (issues #34 #36 #39).
    return [];
  }

  const supplier = await repo.findSupplier(instruction.supplierRfc);
  const detail =
    supplier === undefined
      ? undefined
      : await repo.supplierDetail(instruction.supplierRfc);

  const input: DetectorInput = {
    instruction,
    cfdis: detail?.cfdis ?? [],
    satEntries: await repo.satLookup(instruction.supplierRfc),
    verifiedBeneficiaries: detail?.verifiedBeneficiaries ?? [],
    now,
  };
  if (supplier !== undefined) {
    input.supplier = supplier;
  }

  return compose(input);
}

/**
 * The expected-loss decision. Without core's model the fallback is `verify` for
 * anything flagged and `release` for anything clean, and the money numbers stay
 * at zero rather than being guessed. `verify` is the safe default: it costs one
 * phone call and it moves no money.
 */
async function decide(input: DecisionInput): Promise<Decision> {
  const model = coreFunction<Decide>("decide");
  if (model !== undefined) {
    return model(input);
  }

  // TODO(garzario): issue #38, the expected-loss model in core, which is
  // the one place allowed to weigh amountAtRisk against delayCostPerDay.
  return {
    instructionId: input.instruction.id,
    action: input.findings.length === 0 ? "release" : "verify",
    expectedLoss: 0,
    delayCostPerDay: 0,
    findings: input.findings,
    decidedAt: input.now,
  };
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
