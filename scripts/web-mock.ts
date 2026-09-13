/**
 * bun run web:mock
 *
 * Writes `apps/web/src/lib/mock-data.ts`, the offline fallback of the web app,
 * out of the same seeded company the API serves in the demo.
 *
 * Why this script exists: there used to be two datasets. The API booted on the
 * generated company from `@hackmty/seed` and `apps/web/src/lib/mock.ts` carried
 * a hand-written run of eight suppliers, and the two disagreed about the legal
 * name of every RFC they shared. Issue 125 is that bug, reported from the
 * supplier drawer, where the table row renders from the run payload and the
 * drawer fetches `/api/v1/suppliers/:rfc` separately: when one of the two calls
 * fell back and the other did not, one RFC carried two company names on screen
 * at the same time. The expensive version of the same bug is the API dropping
 * mid-demo, when every name on the projector changes at once.
 *
 * So there is one dataset now, and this is the seam. The web bundle cannot
 * import `@hackmty/seed`: the generator pulls in `@hackmty/sat`, which reads the
 * committed 69-B snapshot off the disk with `node:fs`, and `@hackmty/consortium`
 * hashes with `node:crypto`. A build-time import would therefore either break
 * the browser build or force a dependency `apps/web` must not have, so the data
 * is generated here, ahead of time, and committed. `web-mock.test.ts` fails when
 * the committed file and this generator's output stop agreeing, which is what
 * keeps "generated" from quietly becoming "hand-edited".
 *
 * Everything in the output comes from one of four places, and nothing is written
 * by hand:
 *
 * 1. `loadSentryOne` at seed 69 for the week of 2026-09-07: the company, the 44
 *    suppliers, the 92 instructions, and the CFDIs and payment complements of
 *    the run out of the company's 4103 and 3801.
 *    The week is pinned rather than read off the clock, because the offline file
 *    is committed and a file that regenerated itself every Monday could never be
 *    checked by a test. It is also the run `docs/10-demo-script.md`,
 *    `docs/11-pitch.md` and `docs/12-judge-qa.md` quote.
 * 2. `assessRun` from `apps/api/src/assess.ts`, at `runInstant(runDay)`: the
 *    findings and the decisions, from the same six controls the API runs over the
 *    same company at boot. Byte for byte the API's own answer, which is the point.
 * 3. `MemoryRepository` over that dataset, for the answers the repository
 *    composes rather than stores: the run totals through `runMoney`, the SAT
 *    version summaries, the blind holdout metrics, and the paid invoices the
 *    retroactive sweep prices.
 * 4. The three things the run itself does not carry, each built with the
 *    package that owns it and each marked in the output: the consortium signal
 *    (`@hackmty/consortium` plus `apps/api/src/consortium.ts`), the CEP of a
 *    one-cent probe (`@hackmty/cep`), and the one-cent verification states the
 *    API folds out of its ledger (`@hackmty/engine` plus `decide`).
 *
 * What is deliberately NOT one for one with the API, in all three cases because
 * the browser would download rows no screen of it can reach:
 *
 * - The invoices are the ones a screen can reach: the ones this run settles, the
 *   ones the retroactive sweep prices and the ones a finding names. That is 156
 *   of the 4103, 8.8 KB gzipped against 208 KB for the whole history, and the
 *   history is eight months of a company nobody opens in a five-minute demo.
 *   `GET /api/v1/suppliers/:rfc` still answers with every invoice an issuer ever
 *   sent, so the count in the supplier drawer is the API's whenever the API
 *   answered, and the drawer says which invoices it is listing when it fell back
 *   instead of presenting a narrower number under the same label. The difference
 *   is written down in `docs/07-architecture.md`.
 * - The payment complements are narrowed the same way, to the ones that settle
 *   those invoices. All 3801 of them are another 221 KB gzipped and
 *   `SupplierDetail.complements` is read by no component in `apps/web`.
 * - The verified-beneficiary registry starts empty, which is what
 *   `sentryoneDataset` gives the API: a row appears when a one-cent probe is
 *   verified, and a browser with no API has verified nothing.
 *
 * Flags:
 *   --check   do not write, exit 1 when the committed file is stale
 *   --seed=N  another company, for trying one out. The committed file is seed 69
 *   --week=YYYY-MM-DD  another payment-run week. The committed file is 2026-09-07
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { assessRun } from "../apps/api/src/assess.ts";
import { createConsortiumSource } from "../apps/api/src/consortium.ts";
import { MemoryRepository } from "../apps/api/src/repo.ts";
import { runInstant } from "../apps/api/src/sentryone.ts";
import type { SyntheticDataset } from "../apps/api/src/synthetic.ts";
import { nameMatch, syntheticCepFor } from "../packages/cep/src/index.ts";
import {
  aggregateNetwork,
  DEMO_CONSORTIUM_SALT,
  syntheticNetwork,
} from "../packages/consortium/src/index.ts";
import type {
  Cep,
  Cfdi,
  Decision,
  Finding,
  Metrics,
  NetworkSignal,
  PaymentComplement,
  PaymentInstruction,
  Supplier,
  SweepResult,
  VerificationState,
  VerificationStateName,
} from "../packages/core/src/index.ts";
import {
  decide,
  lookupInstitution,
  supplierModelOf,
} from "../packages/core/src/index.ts";
import { runControls, sealStateOf } from "../packages/engine/src/index.ts";
import { claveRastreoFrom } from "../packages/rail/src/index.ts";
import { priceSweep } from "../packages/sat/src/index.ts";
import { DEMO_COMPANY, loadSentryOne } from "../packages/seed/src/index.ts";

const ROOT = resolve(import.meta.dir, "..");
const TARGET = resolve(ROOT, "apps/web/src/lib/mock-data.ts");

/** The company the committed file carries, and the run the documents cite. */
export const MOCK_SEED = 69;
export const MOCK_WEEK_OF = "2026-09-07";

/**
 * The institution that opens an account, by the first three digits of its CLABE.
 *
 * The Banxico participant catalogue in `@hackmty/core` is the same table the
 * CLABE control names a bank from, so a CEP built here names the institution the
 * account really sits at rather than a placeholder. A code outside the snapshot
 * is reported and never guessed: see `clabe-institutions.ts`.
 */
function bankOf(clabe: string): string {
  return (
    lookupInstitution(clabe.slice(0, 3))?.name ?? `BANCO ${clabe.slice(0, 3)}`
  );
}

/** The widest holder field a bank in this dataset is assumed to print. */
const TRUNCATION_WIDTH = 30;

export interface WebMockOptions {
  seed?: number;
  weekOf?: string;
}

/* -------------------------------------------------------------------------- */
/* The dataset, exactly as the API boots it                                    */
/* -------------------------------------------------------------------------- */

/**
 * The seeded company plus the engine's answer over it.
 *
 * This is `sentryoneDataset` from `apps/api/src/sentryone.ts` with the week
 * pinned. It is not imported from there because that function reads the week off
 * the clock, and a generated file has to be the same file tomorrow.
 */
export function datasetFor(options: WebMockOptions): {
  dataset: SyntheticDataset;
  runDay: string;
  heroInstructionIds: string[];
} {
  const snapshot = loadSentryOne({
    seed: options.seed ?? MOCK_SEED,
    weekOf: options.weekOf ?? MOCK_WEEK_OF,
  });
  const assessed = assessRun({
    suppliers: snapshot.suppliers,
    cfdis: snapshot.cfdis,
    complements: snapshot.complements,
    instructions: snapshot.instructions,
    satEntries: snapshot.satEntries,
    bankMirror: snapshot.bankMirror,
    now: runInstant(snapshot.runDay),
  });

  return {
    dataset: {
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
    },
    runDay: snapshot.runDay,
    heroInstructionIds: snapshot.heroInstructionIds,
  };
}

/**
 * The same dataset, for a caller that wants only the store.
 *
 * `web-mock.test.ts` boots a `MemoryRepository` on it and asks the API's own
 * questions, so the assertion that the two sides agree is made against the store
 * the API serves rather than against a second copy of the expectation.
 */
export function datasetForWeek(options: WebMockOptions = {}): SyntheticDataset {
  return datasetFor(options).dataset;
}

/* -------------------------------------------------------------------------- */
/* The consortium                                                              */
/* -------------------------------------------------------------------------- */

/**
 * The network signal for one beneficiary pair, through the API's own path.
 *
 * The rows come from `syntheticNetwork` and `aggregateNetwork`, which is what
 * `bun run consortium:pull --offline` writes and what beat 7 of `bun run demo`
 * asserts against. The lookup goes through `createConsortiumSource`, so the RFC
 * and the CLABE are hashed by the one file allowed to see them and the three-state
 * answer is the same one a request would get with `ALLOW_CONSORTIUM=1`.
 *
 * `pulledAt` is the instant the run is assessed rather than the wall clock: a
 * generated file cannot carry "now".
 */
async function networkFor(
  dataset: SyntheticDataset,
  pulledAt: string,
  pair: { rfc: string; clabe: string },
): Promise<NetworkSignal> {
  const repo = new MemoryRepository(0, () => dataset);
  const { events } = syntheticNetwork({
    suppliers: dataset.suppliers,
    instructions: dataset.instructions,
    runDay: pulledAt.slice(0, 10),
    /* Passed rather than read off the environment. A generated file that changed
       because this laptop exports CONSORTIUM_SALT would be a file no test could
       check, and the demo salt is the documented one. */
    salt: DEMO_CONSORTIUM_SALT,
  });

  await repo.replaceConsortiumSnapshot({
    rows: aggregateNetwork(events),
    pulledAt,
    source: "synthetic",
  });

  const source = createConsortiumSource(repo, {
    allowed: true,
    salt: DEMO_CONSORTIUM_SALT,
  });
  const answer = await source.lookup(pair);

  return answer.signal;
}

/* -------------------------------------------------------------------------- */
/* The one-cent verification                                                   */
/* -------------------------------------------------------------------------- */

/** The clave the demo's rail mints for one instruction. Same prefix, same rule. */
function claveFor(instructionId: string): string {
  return claveRastreoFrom("SYNVER", instructionId);
}

/**
 * An instant moved forward by whole minutes, as ISO 8601 in UTC.
 *
 * UTC because the seed is: an offset invented here would be one the rest of the
 * dataset does not carry, and the screens format with the browser's own zone.
 */
function shift(at: string, minutes: number): string {
  return new Date(Date.parse(at) + minutes * 60_000).toISOString();
}

/**
 * The legal name as a bank field truncates it, which is the `partial` case.
 *
 * The width is searched rather than fixed, because `nameMatch` in `@hackmty/cep`
 * treats three tokens of prefix agreement as a full match on purpose: a CEP
 * `Nombre` is capped at 40 characters and a razon social that simply stops is
 * still the same company. So a cut that only lost the societary type, or the last
 * word of a long name, reads as `match` and would leave the offline panel with two
 * of those and no question anywhere. The longest cut that the comparison itself
 * calls partial is the one a bank with a short field actually produces, mid-word
 * and all, and it throws rather than settle for something weaker.
 */
function truncatedHolder(legalName: string): string {
  const upper = legalName.toUpperCase();

  for (let width = TRUNCATION_WIDTH; width >= 6; width -= 1) {
    const candidate = upper.slice(0, width).trim();
    if (nameMatch(candidate, legalName) === "partial") {
      return candidate;
    }
  }

  throw new Error(
    `no truncation of "${legalName}" reads as a partial match, so the offline verification panel would lose that state`,
  );
}

/**
 * The company a mismatching CEP names, which is the impersonation case.
 *
 * Another supplier of this same dataset, because the case is an account that
 * belongs to somebody else and a company invented for it would be invented
 * evidence. It has to be one whose name `nameMatch` reads as a mismatch and not
 * merely as a partial: that comparison is deliberately over-inclusive and two
 * synthetic metalworking suppliers share words often, so "the first other
 * supplier" was not enough and the search is for the first that actually reads as
 * a different company.
 */
function impersonatingHolder(
  supplier: Supplier,
  suppliers: readonly Supplier[],
): string {
  const found = suppliers.find(
    (candidate) =>
      candidate.rfc !== supplier.rfc &&
      nameMatch(candidate.legalName, supplier.legalName) === "mismatch",
  );

  if (found === undefined) {
    throw new Error(
      `no other supplier reads as a different company from "${supplier.legalName}", so the offline verification panel would lose the blocked state`,
    );
  }

  return found.legalName;
}

/** One row of the offline verification panel, before the engine is run over it. */
interface VerificationPlan {
  instruction: PaymentInstruction;
  /** What the panel has to show. Asserted against what the engine answers. */
  want: VerificationStateName;
  /** Absent on the two states that hold no document yet. */
  holder?: "match" | "partial" | "mismatch";
}

/**
 * Which line of the run carries which state.
 *
 * All five reachable states are on the run, on five different lines, because the
 * panel that renders them has to be demonstrable with no API behind it and a
 * fixture carrying only the happy ending proves nothing about the other four.
 * `not_started` is the sixth and it is every other line of the run, answered by
 * `mockVerification` rather than stored.
 *
 * The choice of line is positional, so it survives a reseed, and it is not
 * arbitrary. The first line the engine asked to verify takes `cent_sent`, because
 * that is the line a clerk probes first. The largest hold takes `awaiting_cep`,
 * which is what a clerk sees while Banxico has published nothing yet. The three
 * states that turn on a document sit on the three largest RELEASED lines, for a
 * reason that decides whether they work at all: a line that already carries a
 * critical finding of its own would have its verdict set by that finding rather
 * than by the CEP, and the panel is about what the CEP said. On a clean line the
 * comparison is the only thing deciding, which is also the honest story: the cent
 * goes out before the large payment, and on one of the three the account turns
 * out to belong to somebody else.
 */
function verificationPlans(
  instructions: readonly PaymentInstruction[],
  decisions: readonly Decision[],
): VerificationPlan[] {
  const actionOf = new Map(
    decisions.map((decision) => [decision.instructionId, decision.action]),
  );
  const linesFor = (action: string) =>
    instructions.filter((row) => actionOf.get(row.id) === action);
  const largestFirst = (rows: readonly PaymentInstruction[]) =>
    [...rows].sort((left, right) => right.amount - left.amount);

  const verify = linesFor("verify");
  const holds = largestFirst(linesFor("hold"));
  const released = largestFirst(linesFor("release"));

  const wanted: VerificationPlan[] = [];
  const push = (
    instruction: PaymentInstruction | undefined,
    want: VerificationStateName,
    holder?: "match" | "partial" | "mismatch",
  ) => {
    if (instruction === undefined) {
      return;
    }
    wanted.push({
      instruction,
      want,
      ...(holder === undefined ? {} : { holder }),
    });
  };

  push(verify[0], "cent_sent");
  push(holds[0], "awaiting_cep");
  push(released[0], "cep_signed", "partial");
  push(released[1], "blocked", "mismatch");
  push(released[2], "released", "match");

  return wanted;
}

/**
 * The state the API would report for one planned row.
 *
 * Nothing about the three CEP states is written here. The document is rendered
 * and parsed by `@hackmty/cep`, the seal is whatever `sealStateOf` makes of it,
 * the comparison is `nameMatch`, the findings come from the same six controls,
 * the decision is `decide`, and the state is the rule `foldVerification` applies
 * in `apps/api/src/verification.ts`: a critical `beneficiary_cep` finding blocks,
 * an action to release releases, anything else stays on `cep_signed`. So the
 * offline panel shows what the API shows rather than a shape somebody typed, and
 * the assertion at the end fails the generator when a control changes its mind
 * and a state quietly disappears from the offline run.
 */
function verificationFor(
  plan: VerificationPlan,
  dataset: SyntheticDataset,
  now: string,
): {
  state: VerificationState;
  cep?: Cep;
  /** The sixth control's finding about that document, for the CEP screen. */
  finding?: Finding;
  supplierRfc?: string;
} {
  const { instruction } = plan;
  const supplier = dataset.suppliers.find(
    (row) => row.rfc === instruction.supplierRfc,
  );
  const clave = claveFor(instruction.id);
  /* Three minutes after the instruction arrived: long enough to read as a
     separate instant on screen, short enough to stay inside the run day. */
  const centSentAt = shift(instruction.receivedAt, 3);

  const base: VerificationState = {
    instructionId: instruction.id,
    state: plan.want,
    rail: "nessie",
    claveRastreo: clave,
    centSentAt,
    cepAt: null,
    sealState: null,
    holderName: null,
    /* The name the CEP is compared against, which the API fills in from the
       supplier whether or not a document has arrived. */
    legalName: supplier?.legalName ?? null,
    nameMatch: null,
    decision: null,
    updatedAt: centSentAt,
  };

  if (plan.holder === undefined || supplier === undefined) {
    return { state: base };
  }

  const holderName =
    plan.holder === "match"
      ? supplier.legalName
      : plan.holder === "mismatch"
        ? impersonatingHolder(supplier, dataset.suppliers)
        : truncatedHolder(supplier.legalName);

  const cep = syntheticCepFor({
    claveRastreo: clave,
    transferredAt: centSentAt,
    /* One cent. The probe is the cheapest transfer there is, and the amount is
       what makes it safe to send before the large payment. */
    amount: 0.01,
    senderName: DEMO_COMPANY.legalName,
    senderBank: bankOf(DEMO_COMPANY.clabe),
    senderAccount: DEMO_COMPANY.clabe,
    senderRfc: DEMO_COMPANY.rfc,
    beneficiaryName: holderName,
    beneficiaryBank: bankOf(instruction.clabe),
    beneficiaryAccount: instruction.clabe,
    beneficiaryRfc: supplier.rfc,
    concepto: `Verificacion de cuenta ${instruction.id}`,
  });

  /* Read back off the document rather than kept from the input: `parseCep`
     rebuilds the instant from the day and the time the XML carries, and a row
     that disagreed with its own CEP about when the cent left would be two
     answers to one question. Rendered in UTC like every other instant here. */
  const centSent = shift(cep.transferredAt, 0);
  const cepAt = shift(centSent, 38);

  const report = runControls({
    instruction,
    supplier,
    cfdis: dataset.cfdis,
    complements: dataset.complements,
    satEntries: dataset.satEntries.filter(
      (entry) => entry.rfc === instruction.supplierRfc,
    ),
    bankMirror: dataset.bankMirror,
    cep,
    now,
  });
  const decision = decide(
    instruction,
    report.findings,
    supplierModelOf(supplier),
    { now: cepAt },
  );
  const cepFinding = report.findings.find(
    (finding) => finding.detector === "beneficiary_cep",
  );

  const state: VerificationStateName =
    cepFinding?.severity === "critical"
      ? "blocked"
      : decision.action === "release"
        ? "released"
        : "cep_signed";

  if (state !== plan.want) {
    throw new Error(
      `${instruction.id} was meant to carry ${plan.want} and the controls answered ${state}: the offline verification panel would lose a state`,
    );
  }

  return {
    state: {
      ...base,
      state,
      centSentAt: centSent,
      cepAt,
      sealState: sealStateOf(cep),
      holderName: cep.beneficiaryName,
      nameMatch: nameMatch(cep.beneficiaryName, supplier.legalName),
      updatedAt: cepAt,
      /* Only the two endings carry one. `cep_signed` is a document in and a
         payment still waiting, so a decision there would be a decision nobody
         made, which is exactly what `foldVerification` refuses to invent. */
      decision:
        state === "cep_signed"
          ? null
          : { ...decision, decidedAt: cepAt, decidedBy: "system" },
    },
    cep,
    ...(cepFinding === undefined ? {} : { finding: cepFinding }),
    supplierRfc: supplier.rfc,
  };
}

/* -------------------------------------------------------------------------- */
/* The intake example                                                          */
/* -------------------------------------------------------------------------- */

/**
 * The answer `POST /api/v1/instructions` gives, offline.
 *
 * The intake page shows it to a reviewer working without a backend, so it is the
 * one place the offline app has to carry a finding with the consortium line on
 * it: `composeInputFor` hands the network to the controls on the intake path, and
 * the boot assessment of a whole run does not, so the run's own findings carry
 * none. It is the hero line of the demo, scored again with the signal the network
 * holds for its account, which is what the same POST answers on a server with
 * `ALLOW_CONSORTIUM=1`.
 */
function intakeExampleFor(
  instruction: PaymentInstruction,
  dataset: SyntheticDataset,
  network: NetworkSignal,
  now: string,
): {
  instruction: PaymentInstruction;
  supplier: Supplier;
  decision: Decision;
  findings: Finding[];
} {
  const supplier = dataset.suppliers.find(
    (row) => row.rfc === instruction.supplierRfc,
  );
  if (supplier === undefined) {
    throw new Error(
      `the run names a supplier nobody holds: ${instruction.supplierRfc}`,
    );
  }

  const report = runControls({
    instruction,
    supplier,
    cfdis: dataset.cfdis,
    complements: dataset.complements,
    satEntries: dataset.satEntries.filter(
      (entry) => entry.rfc === instruction.supplierRfc,
    ),
    bankMirror: dataset.bankMirror,
    network,
    now,
  });

  return {
    instruction,
    supplier,
    decision: decide(instruction, report.findings, supplierModelOf(supplier), {
      now,
      network,
    }),
    findings: report.findings,
  };
}

/* -------------------------------------------------------------------------- */
/* Rendering                                                                   */
/* -------------------------------------------------------------------------- */

/** One JSON value per line, so a regeneration diffs row by row. */
function rows(values: readonly unknown[]): string {
  return values.length === 0
    ? "[];"
    : `[\n${values.map((value) => `  ${JSON.stringify(value)},`).join("\n")}\n];`;
}

/** A single value, pretty printed, for the handful that a person reads. */
function block(value: unknown): string {
  return `${JSON.stringify(value, null, 2)};`;
}

export interface WebMockFile {
  source: string;
  /** What the header reports, so the script can print it too. */
  counts: Record<string, number>;
}

/** The whole generated module, as a string. */
export async function renderWebMock(
  options: WebMockOptions = {},
): Promise<WebMockFile> {
  const { dataset, runDay, heroInstructionIds } = datasetFor(options);
  const now = runInstant(runDay);
  const repo = new MemoryRepository(0, () => dataset);

  const run = await repo.currentRun();
  const satVersions = await repo.satVersions();
  const metrics: Metrics = await repo.metrics();

  /* The invoices the retroactive sweep prices, and the price, both through the
     repository and `priceSweep`, so the offline sweep and the API's answer for
     the same version are the same three numbers. */
  const listVersion = satVersions[0]?.listVersion ?? "";
  const snapshot = await repo.sweepSnapshot(listVersion);
  const sweep: SweepResult =
    snapshot === undefined
      ? { listVersion, newlyListed: [], totalExposure: 0 }
      : priceSweep(snapshot.subjects, { listVersion });

  const hero = dataset.instructions.find(
    (row) => row.id === heroInstructionIds[0],
  );
  if (hero === undefined) {
    throw new Error("the generator named a hero line the run does not carry");
  }

  const network = await networkFor(dataset, now, {
    rfc: hero.supplierRfc,
    clabe: hero.clabe,
  });
  const intake = intakeExampleFor(hero, dataset, network, now);

  const plans = verificationPlans(dataset.instructions, dataset.decisions);
  const verifications: VerificationState[] = [];
  /* The released line's document, its comparison and the control's finding about
     it: the three fields `POST /api/v1/cep/verify` answers, which is what the CEP
     screen shows before a judge has verified anything themselves. */
  let verified:
    | { cep: Cep; nameMatch: string; finding: Finding; supplierRfc: string }
    | undefined;

  for (const plan of plans) {
    const built = verificationFor(plan, dataset, now);
    verifications.push(built.state);

    if (
      plan.want === "released" &&
      built.cep !== undefined &&
      built.finding !== undefined &&
      built.state.nameMatch !== null &&
      built.supplierRfc !== undefined
    ) {
      verified = {
        cep: built.cep,
        nameMatch: built.state.nameMatch,
        finding: built.finding,
        supplierRfc: built.supplierRfc,
      };
    }
  }

  if (verified === undefined) {
    throw new Error(
      "no released verification produced a CEP for the offline run",
    );
  }

  /* The documents a screen can reach, and nothing else.

     Every uuid a finding points at, by subject or by evidence: a finding about an
     invoice has to be openable from the drawer it is rendered in. */
  const named = new Set<string>();
  for (const finding of dataset.findings) {
    if (finding.subject.kind === "cfdi") {
      named.add(finding.subject.id);
    }
    for (const value of Object.values(finding.evidence)) {
      if (typeof value === "string") {
        named.add(value);
      }
    }
  }
  /* The invoices the run says it is paying. */
  const settled = new Set(
    dataset.instructions.flatMap((instruction) => instruction.cfdiUuids),
  );
  /* The invoices the retroactive sweep prices: the listed supplier's, already
     paid. The sweep carries its own copies of them, and a judge who reads the
     exposure off that screen opens that supplier's drawer next. */
  const swept = new Set(
    sweep.newlyListed.flatMap((entry) =>
      entry.paidCfdis.map((cfdi) => cfdi.uuid),
    ),
  );
  const cfdis: Cfdi[] = dataset.cfdis.filter(
    (cfdi) =>
      settled.has(cfdi.uuid) || swept.has(cfdi.uuid) || named.has(cfdi.uuid),
  );
  const complements: PaymentComplement[] = dataset.complements.filter(
    (complement) =>
      named.has(complement.uuid) ||
      named.has(complement.relatedCfdiUuid) ||
      settled.has(complement.relatedCfdiUuid),
  );

  const counts = {
    suppliers: dataset.suppliers.length,
    instructions: dataset.instructions.length,
    findings: dataset.findings.length,
    decisions: dataset.decisions.length,
    cfdis: cfdis.length,
    complements: complements.length,
    verifications: verifications.length,
  };

  const source = `/**
 * GENERATED FILE. Do not edit: run \`bun run web:mock\` instead.
 *
 * The offline payment run the app falls back to when the API is not there,
 * written out of the same seeded company the API serves in the demo. Seed
 * ${options.seed ?? MOCK_SEED}, week of ${dataset.weekOf}, run \`${dataset.runId}\`. The generator is
 * \`scripts/web-mock.ts\` and its header says where each block comes from and
 * what is deliberately not one for one with the API.
 *
 * ${counts.suppliers} suppliers, ${counts.instructions} instructions, ${counts.findings} findings, and the ${counts.cfdis} invoices of
 * the company's ${dataset.cfdis.length} that a screen of this app can reach.
 *
 * Every object here carries \`synthetic: true\` where the domain has the flag,
 * and every RFC is synthetic, because ADR-0002 makes the watermark a property of
 * the data rather than of a screen. \`mock.test.ts\` asserts both over the whole
 * graph, and \`web-mock.test.ts\` fails when this file stops matching the
 * generator.
 */

import type {
  Cep,
  Cfdi,
  Decision,
  Finding,
  Metrics,
  NameMatch,
  PaymentComplement,
  PaymentInstruction,
  Rfc,
  SatListEntry,
  Supplier,
  SweepResult,
  VerificationState,
} from "@hackmty/core";
import type { PaymentRunTotals, SatVersion } from "./contract";

/** The seed, the week and the run this file was written from. */
export const SEED = ${options.seed ?? MOCK_SEED};
export const WEEK_OF = ${JSON.stringify(dataset.weekOf)};
export const RUN_ID = ${JSON.stringify(dataset.runId)};
/** The day the run is prepared, which is the instant the controls were given. */
export const RUN_DAY = ${JSON.stringify(runDay)};
export const RUN_AT = ${JSON.stringify(now)};

export const COMPANY_RFC: Rfc = ${JSON.stringify(dataset.companyRfc)};
export const COMPANY_NAME = ${JSON.stringify(dataset.companyName)};

/** The run lines the demo opens on, in demo order. */
export const HERO_INSTRUCTION_IDS: readonly string[] = ${JSON.stringify(heroInstructionIds)};

/** The supplier the simulated Article 69-B publication names. */
export const LISTED_SUPPLIER_RFC: Rfc = ${JSON.stringify(dataset.satEntries[0]?.rfc ?? "")};

export const SUPPLIERS: readonly Supplier[] = ${rows(dataset.suppliers)}

export const INSTRUCTIONS: readonly PaymentInstruction[] = ${rows(dataset.instructions)}

export const FINDINGS: readonly Finding[] = ${rows(dataset.findings)}

/** Finding ids per instruction id, which is how the run screen indexes them. */
export const FINDING_IDS_BY_INSTRUCTION: Readonly<
  Record<string, readonly string[]>
> = ${block(dataset.findingsByInstruction)}

export const DECISIONS: readonly Decision[] = ${rows(dataset.decisions)}

/**
 * The totals the API composes, counts and pesos both, from \`runMoney\`.
 *
 * Recomputed in the browser by \`totalsFor\` after a local decision, because the
 * stored totals go stale the moment the offline path applies one.
 */
export const TOTALS: PaymentRunTotals = ${block(run.totals)}

export const SAT_ENTRIES: readonly SatListEntry[] = ${rows(dataset.satEntries)}

export const SAT_VERSIONS: readonly SatVersion[] = ${rows(satVersions)}

/** The blind holdout, scored by the same controls the API scores it with. */
export const METRICS: Metrics = ${block(metrics)}

/** The retroactive sweep of the version this company holds, priced. */
export const SWEEP: SweepResult = ${block(sweep)}

/**
 * What \`POST /api/v1/cep/verify\` answers for the one-cent probe on the released
 * line: the document, the comparison and the sixth control's finding about it.
 *
 * The CEP is synthetic in the exact sense \`packages/cep\` means it: participant
 * key 99999, an invented certificate serial and a sello that is 256 deterministic
 * bytes derived from the clave. So \`signatureValid\` is false with reason
 * \`not_checked\`, which reads as "no verificada" and never as "valida": a seal
 * nobody validated is the one claim this screen may not make.
 */
export const CEP_VERIFICATION: {
  cep: Cep;
  nameMatch: NameMatch;
  finding: Finding;
  /** The supplier the comparison was against, for the screen's heading. */
  supplierRfc: Rfc;
} = ${block(verified)}

/**
 * The one-cent verification, one line of the run per state.
 *
 * Folded the way the API folds it: the CEP is a parsed document, the seal is
 * \`sealStateOf\`, the comparison is \`nameMatch\` and the decision on the two
 * endings is \`decide\` over the sixth control's findings, signed \`system\`.
 */
export const VERIFICATIONS: readonly VerificationState[] = ${rows(verifications)}

/**
 * The answer \`POST /api/v1/instructions\` gives, with the consortium consulted.
 *
 * The only place the offline app carries the network line, for the same reason
 * the API only carries it here: the intake path hands the controls a signal and
 * the boot assessment of a whole run does not.
 */
export const INTAKE_EXAMPLE: {
  instruction: PaymentInstruction;
  supplier: Supplier;
  decision: Decision;
  findings: readonly Finding[];
} = ${block(intake)}

/* ----------------------------------------------------------------- documents */

/**
 * The invoices a screen of this app can reach: the ${counts.cfdis} of the company's
 * ${dataset.cfdis.length} that this run settles, that the retroactive sweep prices, or that a
 * finding names.
 *
 * Narrower than \`GET /api/v1/suppliers/:rfc\`, which answers with every invoice an
 * issuer ever sent, and narrower on purpose: the whole eight-month history is
 * 208 KB gzipped of a bundle a phone downloads in a corridor, and no screen opens
 * an invoice this run never touched. The supplier drawer counts the length of
 * this array, so it reads the count off the API whenever the API answered and
 * names what it is listing when it fell back. See the generator and
 * \`docs/07-architecture.md\`.
 */
export const CFDIS: readonly Cfdi[] = ${rows(cfdis)}

/** The payment complements that settle those invoices. See the generator. */
export const COMPLEMENTS: readonly PaymentComplement[] = ${rows(complements)}
`;

  return { source, counts };
}

/* -------------------------------------------------------------------------- */
/* CLI                                                                        */
/* -------------------------------------------------------------------------- */

function option(name: string): string | undefined {
  const found = process.argv.find((argument) =>
    argument.startsWith(`${name}=`),
  );
  return found?.slice(name.length + 1);
}

if (import.meta.main) {
  const seed = Number(option("--seed"));
  const week = option("--week");
  const { source, counts } = await renderWebMock({
    ...(Number.isInteger(seed) ? { seed } : {}),
    ...(week === undefined ? {} : { weekOf: week }),
  });

  if (process.argv.includes("--check")) {
    const onDisk = readFileSync(TARGET, "utf8");
    if (onDisk === source) {
      console.log("apps/web/src/lib/mock-data.ts is up to date");
    } else {
      console.error(
        "apps/web/src/lib/mock-data.ts is stale. Run: bun run web:mock",
      );
      process.exit(1);
    }
  } else {
    writeFileSync(TARGET, source, "utf8");
    const summary = Object.entries(counts)
      .map(([key, value]) => `${value} ${key}`)
      .join(", ");
    console.log(`wrote apps/web/src/lib/mock-data.ts: ${summary}`);
  }
}
