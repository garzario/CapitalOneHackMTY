/**
 * bun run demo
 *
 * Drives the five beats of `docs/10-demo-script.md` headless, plus three that are
 * gates rather than stage beats: the one-cent verification travelling through a
 * rail, the consortium network reaching a decision offline, which is what beat 3
 * says the second chip on the screen is, and the level and the state of every line
 * with the evidence letter of the one a definitive listing cancelled. It asserts
 * the invariants each one rests on. This is the command that runs before every rehearsal and before every
 * judge visit: if it is red, the demo is broken, whatever the screen says.
 *
 * By default it builds a freshly seeded API in memory, with no socket, no
 * database, no browser and no network, so it is the same check on a laptop, in
 * CI and on conference Wi-Fi that has stopped working. `--base <url>` drives the
 * identical beats over HTTP against a running or deployed instance instead,
 * which is how the deployed URL gets checked once issue #44 lands one.
 *
 * Nothing here is a mock. The app is the real `createApp`, the repository holds
 * the generated company from @hackmty/seed, the findings come out of the six
 * controls in @hackmty/engine, and the CEP is the committed fixture parsed by
 * @hackmty/cep. The one dependency deliberately absent is the extraction key:
 * the demo must never depend on a third party answering.
 *
 * Exit code 0 only when every beat passed.
 */

import { createApp } from "../apps/api/src/app.ts";
import { createConsortiumSource } from "../apps/api/src/consortium.ts";
import { createDeps } from "../apps/api/src/deps.ts";
import { UNAVAILABLE_EXTRACTOR } from "../apps/api/src/extraction.ts";
import { MemoryRepository } from "../apps/api/src/repo.ts";
import {
  consortiumSignalResponseSchema,
  intakeResponseSchema,
  metricsSchema,
  type PaymentRunItem,
  paymentRunSchema,
  satPublishResponseSchema,
  verificationStateSchema,
} from "../apps/api/src/schemas.ts";
import {
  sentryoneBootNotes,
  sentryoneDataset,
} from "../apps/api/src/sentryone.ts";
import {
  nameMatch,
  parseCep,
  syntheticCepFor,
  syntheticCepXml,
} from "../packages/cep/src/index.ts";
import {
  aggregateNetwork,
  syntheticNetwork,
} from "../packages/consortium/src/index.ts";
import type {
  Cep,
  EvidenceValue,
  NetworkSignal,
  NetworkVerdict,
} from "../packages/core/src/index.ts";
import {
  assessNetwork,
  formatAmount,
  networkLabel,
  subtractAmounts,
  sumAmounts,
} from "../packages/core/src/index.ts";
import { FakeRail } from "../packages/rail/src/index.ts";
import { loadSentryOne } from "../packages/seed/src/index.ts";

const HTTP_TIMEOUT_MS = 10_000;

/* -------------------------------------------------------------------------- */
/* Transport                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * One shape for both ways of reaching the API, so a beat is written once and
 * proves the same thing in memory and over the wire.
 */
interface Api {
  label: string;
  request(path: string, init?: RequestInit): Promise<Response>;
}

/**
 * The clave de rastreo the demo's rail mints for one instruction.
 *
 * Deterministic, and that is the whole trick of beat 6: the CEP for the probe has
 * to be findable by the clave the rail just answered, so the rail and the document
 * are built from the same string. `SYN` says out loud that nothing about it was
 * filed at Banxico.
 */
function demoClave(instructionId: string): string {
  return `SYNVER${instructionId.replace(/\W/g, "").toUpperCase()}`.slice(0, 30);
}

/**
 * The two CEPs the demo needs, built from the seeded company rather than committed.
 *
 * No committed file can carry them: the accounts and the legal names come out of
 * the generator and move with the seed. They are synthetic documents in the exact
 * sense `packages/cep` means it, participant key 99999 and a sello that is 256
 * deterministic bytes, so the seal can never come back validated and beat 6 says
 * so on the line it prints.
 */
function demoCeps(
  lines: readonly {
    instructionId: string;
    clabe: string;
    holder: string;
    rfc: string;
  }[],
) {
  return lines.map((line) =>
    syntheticCepFor({
      claveRastreo: demoClave(line.instructionId),
      transferredAt: "2026-09-12T09:15:42.000-06:00",
      amount: 0.01,
      senderName: "Metalicos del Norte SA de CV",
      senderBank: "SinteticoDos",
      senderAccount: "012180000123456782",
      senderRfc: "SYN090615C01",
      beneficiaryName: line.holder,
      beneficiaryBank: "SinteticoUno",
      beneficiaryAccount: line.clabe,
      beneficiaryRfc: line.rfc,
      concepto: "Verificacion de cuenta",
    }),
  );
}

/** Built by beat 1 and handed to the in-memory API, so beat 6 needs no network. */
let demoInbox: Cep[] = [];

function inMemoryApi(): Api {
  const app = createApp(
    createDeps({
      repo: new MemoryRepository(0, sentryoneDataset),
      // Seeding is a destructive write and the demo never needs it. The
      // extractor is the one a server with no GEMINI_API_KEY gets, so a key in
      // the environment cannot change what this script reports.
      allowSeed: false,
      extractor: UNAVAILABLE_EXTRACTOR,
      /* The rail is the in-process one: no key, no network, and every `cent_sent`
         it produces carries `simulated: true`, which beat 6 prints. The Nessie
         rail is the one that writes to the sandbox and it is proven in the pull
         request of issue #166, not here, because a demo that depends on a third
         party answering is a demo that fails on venue Wi-Fi. */
      rail: async () => ({
        ok: true,
        rail: new FakeRail({
          mint: (request) => demoClave(request.instructionId),
        }),
      }),
      cepInbox: {
        describe: "synthetic CEPs built for the seeded company",
        byClave: async (clave) =>
          demoInbox.find(
            (cep) => cep.claveRastreo.toUpperCase() === clave.toUpperCase(),
          ),
      },
      /* No background poll: the demo asserts what one call does, and a beat that
         waited on a timer would be a beat that hangs on a laptop. */
      verification: {
        pollIntervalMs: 0,
        pollDeadlineMs: 0,
        sleep: async () => {},
      },
    }),
  );

  return {
    label: "in memory",
    request: (path, init) => app.request(path, init),
  };
}

function remoteApi(base: string): Api {
  const origin = base.replace(/\/+$/, "");

  return {
    label: origin,
    request: (path, init) =>
      fetch(`${origin}${path}`, {
        ...init,
        signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
      }),
  };
}

/**
 * Who is driving the demo.
 *
 * Every write endpoint requires an `X-Actor` and answers 400 naming the header
 * without one, so the beat sheet carries the persona of `docs/02-persona.md`. She
 * is a clerk, which is the point: nothing on this path is the owner's exception,
 * and a demo that had to be the owner to run would be saying the opposite of what
 * `docs/02-persona.md` says about this company.
 */
const DEMO_ACTOR = "role=clerk; name=Lupita Elizondo";

function post(body: unknown): RequestInit {
  return {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-actor": DEMO_ACTOR,
    },
    body: JSON.stringify(body),
  };
}

async function json(
  api: Api,
  path: string,
  init?: RequestInit,
  expect = 200,
): Promise<unknown> {
  const response = await api.request(path, init);
  const body: unknown = await response.json().catch(() => null);

  if (response.status !== expect) {
    throw new Error(
      `${path} answered ${response.status}, expected ${expect}: ${JSON.stringify(body).slice(0, 200)}`,
    );
  }

  return body;
}

/* -------------------------------------------------------------------------- */
/* Beat plumbing                                                               */
/* -------------------------------------------------------------------------- */

interface BeatResult {
  name: string;
  ok: boolean;
  lines: string[];
}

type Say = (line: string) => void;

const results: BeatResult[] = [];

async function beat(name: string, run: (say: Say) => Promise<void>) {
  const lines: string[] = [];
  try {
    await run((line) => lines.push(line));
    results.push({ name, ok: true, lines });
  } catch (error) {
    lines.push(error instanceof Error ? error.message : String(error));
    results.push({ name, ok: false, lines });
  }
}

/** A failed assertion fails its beat and nothing else; the rest still run. */
function need(condition: boolean, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

/** One line the one-cent verification runs on, as beat 6 needs it. */
interface VerifyLine {
  instructionId: string;
  clabe: string;
  amount: number;
  /** Legal name on the CFDI, the side of the comparison that comes from us. */
  legalName: string;
  rfc: string;
}

/** What beat 1 learns and the later beats reuse, so no id is hard coded. */
interface Hero {
  clabeInstructionId: string;
  clabeSupplierRfc: string;
  clabeAccount: string;
  clabeAmount: number;
  listedSupplierRfc: string;
  /** Held by the CLABE control, and releasable by a CEP that names the supplier. */
  verifyRelease: VerifyLine;
  /** Nothing is stopping it, so the CEP is the only thing that can. */
  verifyBlock: VerifyLine;
}

/**
 * The holder a blocked probe comes back with: a company that is not the one on the
 * invoice. Synthetic, like every other name in the seeded company, and the same one
 * the labelled holdout case for this control uses.
 */
const OTHER_HOLDER = "COMERCIALIZADORA VERTICE DEL GOLFO SA DE CV";

/**
 * A CEP `Nombre` is capped at 40 characters by the schema, and banks print the
 * holder in capitals. Both are what makes the comparison in `@hackmty/cep` the
 * interesting part rather than a string equality.
 */
function bankHolder(legalName: string): string {
  return legalName.toUpperCase().slice(0, 40);
}

let hero: Hero | undefined;

/* -------------------------------------------------------------------------- */
/* The beats                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Beat 1. The payment run opens with the engine's own findings on it.
 *
 * The generator ships no findings, so every one of these came out of the six
 * controls over the seeded company. That is the whole vertical slice, and an
 * empty alert rail here means the run on the screen proves nothing.
 */
async function beatPaymentRun(api: Api, say: Say): Promise<void> {
  const run = paymentRunSchema.parse(await json(api, "/api/v1/run/current"));

  need(run.items.length > 0, "the payment run is empty");
  need(
    run.items.every((item) => item.decision !== null),
    "some lines carry no decision, so the engine did not assess the run",
  );
  need(
    run.items.every((item) => item.decision?.decidedBy === undefined),
    "a decision is already signed, and nobody has pressed a button yet",
  );

  const rail = run.items.flatMap((item) => item.findings);
  need(
    rail.length > 0,
    "the alert rail is empty, so no control found anything",
  );
  need(
    run.totals.held + run.totals.toVerify > 0,
    "every payment was released, so nothing is being stopped",
  );

  /* The other half of the decision, and the one that used to be missing: what a day
     of delay costs this company with this supplier. Priced per supplier by
     @hackmty/seed since #182. At zero the trade-off is not a trade-off and the field
     the instruction screen shows reads MXN 0.00 on every line, so the demo asserts
     the price exists rather than trusting it. */
  need(
    run.items.every((item) => (item.decision?.delayCostPerDay ?? 0) > 0),
    "some decision prices a day of delay at zero, so the expected loss is weighed against nothing",
  );
  /* And the release branch of rule 3 is a real branch: a line may carry a finding a
     person can read and still be released, because waiting costs more than the
     expected loss. What may never happen is a critical finding on a released line. */
  const releasedWithFindings = run.items.filter(
    (item) => item.findings.length > 0 && item.decision?.action === "release",
  );
  need(
    releasedWithFindings.every(
      (item) =>
        item.findings.every((finding) => finding.severity !== "critical") &&
        Math.round((item.decision?.expectedLoss ?? 0) * 100) <=
          Math.round((item.decision?.delayCostPerDay ?? 0) * 100),
    ),
    "a line was released against its own arithmetic: either a critical finding or an expected loss above one day of delay",
  );

  const clabe = run.items.find((item) =>
    item.findings.some(
      (finding) =>
        finding.detector === "clabe_forensics" &&
        finding.evidence.editOperations === 2,
    ),
  );
  const listed = run.items.find((item) =>
    item.findings.some((finding) => finding.detector === "sat_69b"),
  );
  need(clabe !== undefined, "no line carries a two-digit CLABE change");
  need(listed !== undefined, "no line carries a 69-B finding");

  /* The two lines beat 6 runs the cent on. The first is stopped by the CLABE
     control on a signal a person has to check, which is the one a CEP can settle:
     a CLABE whose check digit cannot exist stays critical whoever holds the
     account. The second is the largest line nothing is stopping, so the CEP is the
     only thing that can, which is the half of the story that is about the money
     rather than about the alert rail. */
  const releasable = run.items.find(
    (item) =>
      item.decision?.action !== "release" &&
      item.findings.some(
        (finding) =>
          finding.detector === "clabe_forensics" &&
          finding.state === "requiere_verificacion",
      ),
  );
  const clean = [...run.items]
    .filter(
      (item) =>
        item.findings.length === 0 && item.decision?.action === "release",
    )
    .sort(
      (left, right) => right.instruction.amount - left.instruction.amount,
    )[0];

  need(
    releasable !== undefined,
    "no line is stopped by the CLABE control on a signal a CEP could settle",
  );
  need(clean !== undefined, "every line carries a finding, so none is clean");

  hero = {
    clabeInstructionId: clabe.instruction.id,
    clabeSupplierRfc: clabe.instruction.supplierRfc,
    clabeAccount: clabe.instruction.clabe,
    clabeAmount: clabe.instruction.amount,
    listedSupplierRfc: listed.instruction.supplierRfc,
    verifyRelease: {
      instructionId: releasable.instruction.id,
      clabe: releasable.instruction.clabe,
      amount: releasable.instruction.amount,
      legalName: releasable.supplier.legalName,
      rfc: releasable.instruction.supplierRfc,
    },
    verifyBlock: {
      instructionId: clean.instruction.id,
      clabe: clean.instruction.clabe,
      amount: clean.instruction.amount,
      legalName: clean.supplier.legalName,
      rfc: clean.instruction.supplierRfc,
    },
  };

  /* The CEPs for those two probes, filed under the clave the rail will mint. One
     names the supplier on the invoice and one names somebody else, which is the
     whole difference between a release and a block. */
  demoInbox = demoCeps([
    {
      instructionId: hero.verifyRelease.instructionId,
      clabe: hero.verifyRelease.clabe,
      holder: bankHolder(hero.verifyRelease.legalName),
      rfc: hero.verifyRelease.rfc,
    },
    {
      instructionId: hero.verifyBlock.instructionId,
      clabe: hero.verifyBlock.clabe,
      holder: OTHER_HOLDER,
      /* "ND" is what a participant sends when it discloses no RFC, which is the
         honest field for a holder that is not the supplier: the CEP names who
         holds the account and this repository does not invent a taxpayer for it. */
      rfc: "ND",
    },
  ]);

  // The headline on the screen: what the run would move, and what of it is not
  // moving yet. The screen reads the items rather than the totals, so this does
  // too, and the two cannot disagree.
  const stopped = run.items
    .filter((item) => item.decision?.action !== "release")
    .reduce((total, item) => total + item.instruction.amount, 0);

  say(
    `run ${run.id}, week of ${run.weekOf}, ${run.totals.instructions} instructions for ${formatAmount(run.totals.amount)} MXN`,
  );
  say(
    `${formatAmount(stopped)} MXN is not leaving yet: ${rail.length} findings, ${run.totals.held} held, ${run.totals.toVerify} to verify, ${run.totals.released} released`,
  );
  for (const item of run.items) {
    if (item.findings.length === 0) {
      continue;
    }
    say(
      `  ${item.instruction.id} ${String(item.decision?.action).padEnd(7)} ${formatAmount(item.instruction.amount).padStart(12)} MXN  expected loss ${formatAmount(item.decision?.expectedLoss ?? 0).padStart(10)} against ${formatAmount(item.decision?.delayCostPerDay ?? 0).padStart(8)} a day of delay  ${item.findings.map((finding) => finding.detector).join(", ")}`,
    );
  }
  // The sentence that was not sayable before #182: the trade-off changed an outcome.
  say(
    releasedWithFindings.length === 0
      ? "every line that carries a finding is stopped on this run: no expected loss came out under one day of delay"
      : `${releasedWithFindings.length} line(s) carry a finding and are released anyway, because a day of delay costs more than the expected loss: ${releasedWithFindings.map((item) => item.instruction.id).join(", ")}`,
  );
}

/**
 * Beat 2. The account that changed by two digits is stopped before the SPEI.
 *
 * Asserted twice, because they are two different claims: the seeded line the
 * screen opens on, and the same CLABE posted fresh through the intake endpoint,
 * which is the path a judge exercises from their own phone.
 *
 * "Stopped" is `hold` or `verify` and the difference is not cosmetic. A changed
 * account with a valid check digit is not provable from the documents, so
 * `decide` asks a person to check rather than claiming it is fraud. Only a
 * finding that is provable, like a CLABE whose check digit cannot exist, holds
 * on its own. What the demo promises is that neither is ever released.
 */
async function beatClabeForensics(api: Api, say: Say): Promise<void> {
  need(hero !== undefined, "beat 1 did not run, so there is no hero line");

  const stored = instructionDetail(
    await json(
      api,
      `/api/v1/instructions/${encodeURIComponent(hero.clabeInstructionId)}`,
    ),
  );
  need(
    stored.findings.some((finding) => finding.detector === "clabe_forensics"),
    `${hero.clabeInstructionId} carries no clabe_forensics finding`,
  );
  need(
    stored.action !== "release",
    `${hero.clabeInstructionId} was released with a changed account on it`,
  );

  const intake = intakeResponseSchema.parse(
    await json(
      api,
      "/api/v1/instructions",
      post({
        supplierRfc: hero.clabeSupplierRfc,
        amount: hero.clabeAmount,
        clabe: hero.clabeAccount,
        source: "whatsapp",
      }),
      201,
    ),
  );
  const fresh = intake.findings.find(
    (finding) => finding.detector === "clabe_forensics",
  );

  need(fresh !== undefined, "intake produced no clabe_forensics finding");
  need(
    fresh.evidence.editOperations === 2,
    `intake reported ${String(fresh.evidence.editOperations)} differing digits, expected 2`,
  );
  need(
    typeof fresh.evidence.nearestKnownAccount === "string",
    "the finding does not name the account this supplier has been paid on",
  );
  need(
    intake.decision.action !== "release",
    "the intake released a payment to an account that changed by two digits",
  );

  say(`seeded line ${hero.clabeInstructionId}: ${stored.action}`);
  say(
    `intake ${intake.instruction.id}: ${intake.decision.action}, expected loss ${formatAmount(intake.decision.expectedLoss)} MXN`,
  );
  say(
    `  ${String(fresh.evidence.clabe)} differs in ${String(fresh.evidence.editOperations)} digits (positions ${String(fresh.evidence.differingPositions)}) from ${String(fresh.evidence.nearestKnownAccount)}, paid ${String(fresh.evidence.nearestTimesPaid)} times`,
  );
  say(
    `  check digit ${String(fresh.evidence.checkDigit)}, so this is a changed account and not a typo`,
  );
}

/**
 * Beat 3. A simulated 69-B publication, priced against what is already deducted
 * and folded back into the run it affects.
 *
 * ADR-0002 binds this to synthetic RFCs, and both the request schema and
 * `simulatePublication` refuse anything else, so the publication that meets an
 * invoice can never carry a real taxpayer. The exposure is computed over the
 * seeded ledger: the CFDIs of that supplier that a payment complement or a
 * `payment_sent` event says we already paid.
 *
 * The second half of this beat is issue #175 and it is the one a judge with a
 * calculator checks. The publication re-scores the pending lines of the current
 * run that belong to the suppliers it names, so the run's retroactive pair climbs
 * in the same request. This asserts the identity that makes the two figures one
 * number rather than two: the run-level pair is exactly the part of the sweep that
 * belongs to the suppliers the re-score touched, to the centavo, and it is read
 * back off `GET /api/v1/run/current` rather than recomputed here.
 */
async function beatSweep(api: Api, say: Say): Promise<void> {
  need(
    hero !== undefined,
    "beat 1 did not run, so there is no listed supplier",
  );
  const rfc = hero.listedSupplierRfc;

  const before = paymentRunSchema.parse(
    await json(api, "/api/v1/run/current"),
  ).totals;
  const sweep = satPublishResponseSchema.parse(
    await json(
      api,
      "/api/v1/sat/publish",
      post({ simulate: true, rfcs: [rfc], status: "definitivo" }),
    ),
  );
  const subject = sweep.newlyListed.find((row) => row.supplier.rfc === rfc);

  need(subject !== undefined, `the sweep did not name ${rfc}`);
  need(
    subject.paidCfdis.length > 0,
    `${rfc} has no already-paid CFDI, so there is nothing to expose`,
  );
  need(sweep.totalExposure > 0, "the sweep priced the publication at zero");
  need(
    sweep.newlyListed.every((row) => row.supplier.rfc.startsWith("SYN")),
    "the simulation reached a real RFC, which ADR-0002 forbids",
  );

  say(
    `list version ${sweep.listVersion}, ${sweep.newlyListed.length} newly listed supplier`,
  );
  say(
    `  ${rfc} ${subject.status}: ${subject.paidCfdis.length} invoices already paid, base ${formatAmount(subject.deductedBase)} MXN`,
  );
  say(
    `  ISR ${formatAmount(subject.isrExposure)} MXN, IVA ${formatAmount(subject.ivaExposure)} MXN`,
  );
  say(`  total exposure ${formatAmount(sweep.totalExposure)} MXN`);

  /* The run, read again. `before` was zero on both fields, because nothing had
     priced a supplier this run pays; after the publication it carries the part of
     the sweep that belongs to the lines that were re-scored. */
  const after = paymentRunSchema.parse(
    await json(api, "/api/v1/run/current"),
  ).totals;
  const touched = new Set(sweep.rescored.map((line) => line.supplierRfc));
  const mine = sweep.newlyListed.filter((row) => touched.has(row.supplier.rfc));

  need(
    sweep.rescored.length > 0,
    "the publication re-scored no line, so the run counter cannot have moved",
  );
  need(
    before.retroactive69bExposure === 0,
    "the run already carried retroactive exposure before the publication",
  );
  need(
    after.retroactive69bBase ===
      sumAmounts(mine.map((row) => row.deductedBase)),
    "the run's retroactive base is not the deducted base of the suppliers it re-scored",
  );
  need(
    after.retroactive69bExposure ===
      sumAmounts(mine.flatMap((row) => [row.isrExposure, row.ivaExposure])),
    "the run's retroactive exposure is not the ISR plus IVA of the suppliers it re-scored",
  );
  /* The pesos at risk climb by exactly that exposure, because the finding on the
     line now carries the deductions the publication voided next to the amount about
     to leave. They are different money, which is why one total legitimately exceeds
     the instruction. The stopped money does not have to move at all: a line already
     stopped is already stopped, and what changes there is which column it sits in. */
  const climb = subtractAmounts(after.amountAtRisk, before.amountAtRisk);
  need(
    climb === after.retroactive69bExposure,
    "the pesos at risk did not climb by the retroactive exposure the publication priced",
  );

  for (const line of sweep.rescored) {
    const priced = line.decision.findings.find(
      (finding) => finding.evidence.retroactiveExposure !== undefined,
    );
    say(
      `  re-scored ${line.instructionId}: ${line.before ?? "sin decision"} -> ${line.decision.action}, signed ${line.decision.decidedBy ?? "nobody"}`,
    );
    say(
      `    expected loss ${formatAmount(line.decision.expectedLoss)} MXN against ${formatAmount(line.decision.delayCostPerDay)} a day of delay${priced === undefined ? "" : `, ${formatAmount(priced.amountAtRisk)} MXN at risk on the new finding`}`,
    );
  }
  say(
    `  run totals now: base ${formatAmount(after.retroactive69bBase)} MXN, exposure ${formatAmount(after.retroactive69bExposure)} MXN`,
  );
  /* The delta and not the two absolutes, because this script runs beat 2's intake
     before this beat and the stage does not: the run-level pair and this climb are
     the same on both paths, the absolute at-risk total is not. */
  say(`  pesos at risk climbed by ${formatAmount(climb)} MXN on the same run`);
}

/**
 * Beat 8. The level and the state of every line, and the letter of the one the
 * list cancelled.
 *
 * This is the vocabulary of the whole product on one screen, and it is the beat
 * that proves three things a judge asks about in the same breath.
 *
 * The run answers three words and never a number, which is ADR-0009 and the reason
 * `estimateLoss` keeps its arithmetic inside the engine. The level and the state
 * travel per line and are summarised on the run, and the two triples add up to the
 * lines, so a screen cannot round a line away. And the supplier the publication of
 * beat 3 made definitive reads `cancelado` rather than `rojo`, with a one-page
 * letter naming the article, because comprobantes with no fiscal effect are not a
 * hold somebody waits out.
 *
 * It runs after beat 3 on purpose: before the publication that supplier is
 * presunto, which is a hold a person can answer, and the difference between the two
 * is the point.
 */
async function beatLevels(api: Api, say: Say): Promise<void> {
  need(hero !== undefined, "beat 1 did not run, so there are no hero lines");

  const run = paymentRunSchema.parse(await json(api, "/api/v1/run/current"));
  const { totals } = run;

  need(
    run.items.every(
      (item) => LEVELS.includes(item.confidence) && STATES.includes(item.state),
    ),
    "a line answered a level or a state outside the ones ADR-0009 allows",
  );
  need(
    totals.confiable + totals.precaucion + totals.alerta ===
      totals.instructions,
    "the three levels do not add up to the lines of the run",
  );
  need(
    totals.rojo +
      totals.cancelado +
      totals.enviado +
      totals.pendiente +
      totals.liberado ===
      totals.instructions,
    "the five states do not add up to the lines of the run",
  );

  const listed = run.items.filter(
    (item) => item.instruction.supplierRfc === hero.listedSupplierRfc,
  );
  need(
    listed.length > 0,
    `no line of the run pays ${hero.listedSupplierRfc}, so beat 3 had nothing to cancel`,
  );
  need(
    listed.every(
      (item) => item.state === "cancelado" && item.confidence === "alerta",
    ),
    "the definitively listed supplier's lines are not cancelado at alerta",
  );

  say(
    `${totals.instructions} lines: ${totals.alerta} alerta, ${totals.precaucion} precaucion, ${totals.confiable} confiable`,
  );
  say(
    `  states: ${totals.rojo} rojo, ${totals.cancelado} cancelado, ${totals.enviado} enviado, ${totals.pendiente} pendiente, ${totals.liberado} liberado`,
  );

  /* The hero lines, one row each, which is what the rehearsal reads out loud. The
     cancelled one is in the list because it is the row this beat exists for: three
     different state rules on three lines of one run. */
  const rows = [
    ...heroLineIds(hero),
    ...listed.map((item) => item.instruction.id),
  ];
  for (const id of [...new Set(rows)]) {
    const item = run.items.find((row) => row.instruction.id === id);
    if (item === undefined) {
      continue;
    }
    say(
      `  ${item.instruction.id} ${item.confidence.padEnd(10)} ${item.state.padEnd(10)} ` +
        `${formatAmount(item.instruction.amount).padStart(12)} MXN  ${item.confidenceRule} / ${item.stateRule}`,
    );
  }

  /* And the letter of the cancelled line, which is the page the clerk sends the
     supplier. One page, a real PDF, and it names the article rather than saying
     the payment is held for reasons. */
  const cancelled = listed[0];
  if (cancelled === undefined) {
    throw new Error("unreachable: the listed array was checked above");
  }
  const letter = await api.request(
    `/api/v1/instructions/${cancelled.instruction.id}/carta`,
  );
  need(letter.status === 200, `the evidence letter answered ${letter.status}`);
  need(
    letter.headers.get("content-type") === "application/pdf",
    "the evidence letter is not a PDF",
  );
  const page = latin1(await letter.arrayBuffer());
  need(
    page.includes("/Type /Pages /Count 1"),
    "the evidence letter spilled onto a second page",
  );
  need(
    page.includes("articulo 69-B"),
    "the evidence letter does not name the article that cancelled the line",
  );
  need(
    !page.includes("Tj") || !drawnText(page).toLowerCase().includes("seguro"),
    "the evidence letter used the one word this product may not say",
  );

  say(
    `  carta of ${cancelled.instruction.id}: one page, ${page.length} bytes, names articulo 69-B`,
  );
}

const LEVELS: readonly string[] = ["confiable", "precaucion", "alerta"];
const STATES: readonly string[] = [
  "rojo",
  "cancelado",
  "enviado",
  "pendiente",
  "liberado",
];

/**
 * The lines the rehearsal reads out loud, in the order the script names them.
 *
 * Deduplicated by the caller rather than here, because which of these three is the
 * same line depends on the seed: on seed 69 the CLABE line and the releasable one
 * are the same payment, and on another seed they are not.
 */
function heroLineIds(current: Hero): readonly string[] {
  return [
    current.clabeInstructionId,
    current.verifyRelease.instructionId,
    current.verifyBlock.instructionId,
  ];
}

/**
 * The bytes as latin1, one code unit per byte, which is what a PDF content stream
 * is by the file format. Decoding it as UTF-8 would mangle the Spanish copy.
 */
function latin1(bytes: ArrayBuffer): string {
  let out = "";
  for (const byte of new Uint8Array(bytes)) {
    out += String.fromCharCode(byte);
  }
  return out;
}

/** Only what the page draws, with the PDF scaffolding dropped. */
function drawnText(page: string): string {
  return [...page.matchAll(/\((.*?)\) Tj/g)].map((match) => match[1]).join(" ");
}

/**
 * Beat 4. The CEP fixture, its beneficiary name, and what we refuse to claim.
 *
 * The fixture parses and the holder-name comparison runs, which is the question
 * control 5 actually answers. The signature comes back as not checked rather
 * than as valid, because confirming the Banxico scheme needs a real CEP and the
 * real certificate (issues #37 and #57), and a `signatureValid: true` nobody
 * verified would be the single most expensive lie in this repository. The HTTP
 * endpoint is asked too, and it refuses with the documented envelope instead of
 * synthesising a receipt.
 */
async function beatCep(api: Api, say: Say): Promise<void> {
  need(
    hero !== undefined,
    "beat 1 did not run, so there is no supplier to ask",
  );

  const cep = parseCep(syntheticCepXml(), { synthetic: true });
  need(cep.claveRastreo.length > 0, "the CEP fixture has no clave de rastreo");
  need(cep.amount > 0, "the CEP fixture carries no amount");
  need(cep.synthetic, "the CEP fixture is not flagged synthetic");
  need(
    !cep.signatureValid,
    "the fixture claims a valid Banxico signature, which nobody verified",
  );

  const itself = nameMatch(cep.beneficiaryName, cep.beneficiaryName);
  const other = nameMatch(cep.beneficiaryName, "Otra Empresa SA de CV");
  need(itself === "match", "the comparison does not match a name to itself");
  need(other === "mismatch", "the comparison calls two companies the same");

  const refusal = await api.request(
    "/api/v1/cep/verify",
    post({
      claveRastreo: cep.claveRastreo,
      date: cep.transferredAt.slice(0, 10),
      amount: cep.amount,
      senderBank: cep.senderBank,
      beneficiaryBank: cep.beneficiaryBank,
      beneficiaryAccount: cep.beneficiaryAccount,
      supplierRfc: hero.clabeSupplierRfc,
    }),
  );
  need(
    refusal.status === 422,
    `POST /api/v1/cep/verify answered ${refusal.status} for a transfer with no signed CEP, expected 422`,
  );

  say(
    `clave de rastreo ${cep.claveRastreo}, ${formatAmount(cep.amount)} MXN to ${cep.beneficiaryAccount}`,
  );
  say(`beneficiary on the CEP: ${cep.beneficiaryName}`);
  say(
    `signature: not checked (${cep.signatureReason ?? "no reason given"}). Banxico retrieval is issue #37, the real certificate is issue #57`,
  );
  say(
    `name comparison: against itself ${itself}, against another company ${other}`,
  );
  say(
    "the endpoint refuses a CEP it cannot prove: 422 with the error envelope",
  );
}

/**
 * Beat 6. The cent travels inside the run, and the engine releases or blocks.
 *
 * One POST per line and nothing typed afterwards: the clave de rastreo comes back
 * from the rail, the CEP is resolved by that clave, control 5 compares the account
 * holder with the legal name on the CFDI, and the expected-loss rule releases the
 * payment the CLABE control was holding or blocks the one nothing else stopped.
 *
 * What this beat is honest about, out loud, on the lines it prints. The rail here is
 * the in-process one, so nothing left a bank: the Nessie rail writes a real 0.01
 * outflow on the company's mirror with our own key and is proven in the pull request
 * of issue #166, and the rail that would produce a Banxico CEP is STP, which refuses
 * to run unconfigured. The CEPs are synthetic documents built for the seeded company,
 * so the seal comes back not checked and never valid. What the beat proves is the
 * pipeline: the events, the comparison, and which way the engine went.
 *
 * Against `--base` it reads and does not write. A deployed instance has a real rail
 * behind it, and this script runs before every rehearsal: spending a centavo on the
 * company's mirror and leaving a `cent_sent` on the deployed ledger every time
 * somebody checks the demo path would be a side effect nobody asked for. The read
 * endpoint answering is what proves the feature is deployed.
 */
async function beatVerification(api: Api, say: Say): Promise<void> {
  need(
    hero !== undefined,
    "beat 1 did not run, so there are no lines to verify",
  );
  const { verifyRelease, verifyBlock } = hero;

  if (base !== undefined) {
    const state = verificationStateSchema.parse(
      await json(
        api,
        `/api/v1/instructions/${encodeURIComponent(verifyRelease.instructionId)}/verification`,
      ),
    );
    say(
      `${state.instructionId}: ${state.state} on that instance, which is the read endpoint answering`,
    );
    say(
      "the cent is not sent against a deployed instance from this script: it is a real write on the company mirror and this beat runs before every rehearsal",
    );
    return;
  }

  const released = await verify(api, verifyRelease);
  const blocked = await verify(api, verifyBlock);

  need(
    released.state === "released",
    `${verifyRelease.instructionId} came back ${released.state}, expected released`,
  );
  need(
    blocked.state === "blocked",
    `${verifyBlock.instructionId} came back ${blocked.state}, expected blocked`,
  );
  need(
    released.sealState !== "valid" && blocked.sealState !== "valid",
    "a synthetic CEP reported a validated Banxico seal, which nobody verified",
  );
  need(
    released.nameMatch === "match" && blocked.nameMatch === "mismatch",
    "the name comparison did not separate the supplier from the other company",
  );
  need(
    released.decision?.decidedBy === "system" &&
      blocked.decision?.decidedBy === "system",
    "the decision was not signed by the engine",
  );
  need(
    blocked.decision?.action !== "release",
    "the blocked line was released anyway",
  );

  for (const [line, state] of [
    [verifyRelease, released],
    [verifyBlock, blocked],
  ] as const) {
    say(
      `${state.instructionId} ${formatAmount(line.amount)} MXN: centavo enviado, clave ${state.claveRastreo ?? "none"}`,
    );
    say(
      `  CEP: titular ${state.holderName ?? "none"} contra ${state.legalName ?? "none"} en la factura, coincidencia ${state.nameMatch ?? "none"}, sello ${state.sealState ?? "none"}`,
    );
    say(
      `  ${state.state}: la decision del motor es ${state.decision?.action ?? "none"}, perdida esperada ${formatAmount(state.decision?.expectedLoss ?? 0)} MXN, firmada por ${state.decision?.decidedBy ?? "nadie"}`,
    );
  }
  say(
    "the rail here is the in-process one (cent_sent carries simulated: true) and the CEPs are synthetic, so the seal reads not_checked; the Nessie outflow is in the PR of #166 and the Banxico CEP is issue #57",
  );
}

/** One call, then the state the ledger folds. Nothing is typed in between. */
async function verify(api: Api, line: VerifyLine) {
  const response = await api.request(
    `/api/v1/instructions/${encodeURIComponent(line.instructionId)}/verify-account`,
    { method: "POST", headers: { "x-actor": DEMO_ACTOR } },
  );
  need(
    response.status === 202,
    `verify-account answered ${response.status} for ${line.instructionId}, expected 202`,
  );
  const answered = verificationStateSchema.parse(await response.json());

  // And the read endpoint answers the same thing out of the event ledger, which is
  // what the screen re-reads when the stream names this instruction.
  const read = verificationStateSchema.parse(
    await json(
      api,
      `/api/v1/instructions/${encodeURIComponent(line.instructionId)}/verification`,
    ),
  );
  need(
    read.state === answered.state,
    `${line.instructionId} answered ${answered.state} and the ledger folds to ${read.state}`,
  );

  return read;
}

/** Beat 5. The metrics endpoint answers, and says how many cases it holds. */
async function beatMetrics(api: Api, say: Say): Promise<void> {
  const metrics = metricsSchema.parse(await json(api, "/api/v1/metrics"));
  const detectors = Object.keys(metrics.perDetector).length;

  need(detectors === 6, `metrics reports ${detectors} detectors, expected 6`);

  say(
    `${metrics.cases} labelled cases, precision ${metrics.precision.toFixed(2)}, recall ${metrics.recall.toFixed(2)}, false positive rate ${metrics.falsePositiveRate.toFixed(2)}`,
  );
  if (metrics.cases === 0) {
    say(
      "  zero is the honest answer here: the blind holdout is issue #55 and the seeded run carries no labels",
    );
  }
}

/* -------------------------------------------------------------------------- */
/* Beat 6, the consortium network                                              */
/* -------------------------------------------------------------------------- */

/**
 * One API instance with the consortium on or off, plus the offline pull.
 *
 * The beat builds its own instances, and that is the design rather than a
 * convenience. The consortium snapshot is LOCAL to a store, so the only way to
 * prove what the network does to a decision is to write rows into the store the
 * engine reads. It is the same `createApp` every other beat drives, the rows come
 * out of the same two functions `bun run consortium:pull --offline` calls, and no
 * socket is opened at any point.
 *
 * The main `api` of this script is deliberately left alone. Beats 1 to 5, the run
 * totals `docs/10-demo-script.md` quotes and the boot assessment behind them are
 * therefore identical to a run from before the consortium existed, which is also
 * the property this beat asserts.
 */
interface NetworkInstance extends Api {
  /** Fills the snapshot the way `consortium:pull --offline` does. Returns the rows. */
  pullOffline(): Promise<number>;
}

function networkInstance(allowed: boolean): NetworkInstance {
  const repo = new MemoryRepository(0, sentryoneDataset);
  const app = createApp(
    createDeps({
      repo,
      allowSeed: false,
      extractor: UNAVAILABLE_EXTRACTOR,
      /* Passed explicitly and never read off the environment: a demo whose
         network switched itself on because this laptop happens to export
         ALLOW_CONSORTIUM would prove something different on every machine. */
      consortium: createConsortiumSource(repo, { allowed }),
    }),
  );

  return {
    label: allowed ? "in memory, network on" : "in memory, network off",
    request: (path, init) => app.request(path, init),
    pullOffline: async () => {
      const company = loadSentryOne({});
      const { events } = syntheticNetwork({
        suppliers: company.suppliers,
        instructions: company.instructions,
        runDay: company.runDay,
      });
      const rows = aggregateNetwork(events);
      await repo.replaceConsortiumSnapshot({
        rows,
        pulledAt: new Date().toISOString(),
        /* The same value the script writes, for the same reason: nothing
           downstream may read a rehearsal as a warehouse. */
        source: "synthetic",
      });
      return rows.length;
    },
  };
}

function signalQuery(item: PaymentRunItem): string {
  const rfc = encodeURIComponent(item.instruction.supplierRfc);
  const clabe = encodeURIComponent(item.instruction.clabe);
  return `/api/v1/consortium/signal?rfc=${rfc}&clabe=${clabe}`;
}

/** The message of the one error envelope, for the two refusals this beat asserts. */
function errorMessageOf(body: unknown): string {
  const envelope = body as { error?: { message?: string } };
  return envelope.error?.message ?? "";
}

/** The network signal a finding carries, or undefined when it carries none. */
function networkOf(finding: {
  evidence: Record<string, EvidenceValue>;
}): NetworkSignal | undefined {
  const value = finding.evidence.network;
  return typeof value === "object" ? value : undefined;
}

interface IntakeOutcomeLine {
  action: string;
  expectedLoss: number;
  signal?: NetworkSignal;
  explanation?: string;
  severity?: string;
}

/** Posts one line of the run through intake and reads what the network did to it. */
async function intakeLine(
  instance: Api,
  item: PaymentRunItem,
): Promise<IntakeOutcomeLine> {
  const intake = intakeResponseSchema.parse(
    await json(
      instance,
      "/api/v1/instructions",
      post({
        supplierRfc: item.instruction.supplierRfc,
        amount: item.instruction.amount,
        clabe: item.instruction.clabe,
        source: "whatsapp",
      }),
      201,
    ),
  );
  const finding = intake.findings.find((row) => networkOf(row) !== undefined);

  const outcome: IntakeOutcomeLine = {
    action: intake.decision.action,
    expectedLoss: intake.decision.expectedLoss,
  };
  if (finding !== undefined) {
    const signal = networkOf(finding);
    if (signal !== undefined) {
      outcome.signal = signal;
    }
    outcome.explanation = finding.explanation;
    outcome.severity = finding.severity;
  }
  return outcome;
}

/**
 * Beat 6. The network says something about an account this company has no
 * history with, and it says it offline.
 *
 * Four claims, and each one is the answer to a question a judge asks.
 *
 * 1. **With the flag off nothing happens.** `503` naming `ALLOW_CONSORTIUM`, and
 *    a decision identical to the one the product made before issue #164.
 * 2. **An empty snapshot is not a clean network.** `404` naming the pull, and the
 *    same decision again: `NetworkSignal.source` is `not_consulted` and
 *    `assessNetwork` multiplies the expected loss by exactly 1.
 * 3. **A pulled snapshot reaches the decision.** One released line carries the
 *    corroboration in its evidence and one stopped line carries what the network
 *    holds against the account, both under the `network` key of the beneficiary
 *    finding, and the released one is still released and the stopped one is still
 *    stopped. Corroboration is never a reason to pay and the network never
 *    releases a payment.
 * 4. **Nothing is real except the mechanism.** The rows come from the synthetic
 *    generator at seed 69, `consortium_pull.source` says `synthetic`, and this
 *    beat prints that word rather than letting a rehearsal look like a warehouse.
 *
 * No Snowflake, no socket and no `.env`: this is the offline path of
 * `bun run consortium:pull --offline`, which is why the demo survives conference
 * Wi-Fi that has stopped working.
 */
async function beatNetwork(say: Say): Promise<void> {
  const off = networkInstance(false);
  const empty = networkInstance(true);
  const on = networkInstance(true);

  const run = paymentRunSchema.parse(await json(on, "/api/v1/run/current"));
  const first = run.items[0];
  need(
    first !== undefined,
    "the run is empty, so there is no pair to ask about",
  );

  const refused = await off.request(signalQuery(first));
  need(
    refused.status === 503,
    `with the flag off the signal route answered ${refused.status}, expected 503`,
  );
  need(
    errorMessageOf(await refused.json()).includes("ALLOW_CONSORTIUM"),
    "the 503 does not name ALLOW_CONSORTIUM, so nobody can tell what to set",
  );

  const notPulled = await empty.request(signalQuery(first));
  need(
    notPulled.status === 404,
    `with an empty snapshot the signal route answered ${notPulled.status}, expected 404`,
  );
  need(
    errorMessageOf(await notPulled.json()).includes("consortium:pull"),
    "the 404 on an empty snapshot does not name the pull that fills it",
  );

  const rows = await on.pullOffline();
  need(rows > 0, "the synthetic network generated no rows");

  /* What the network holds for every line of the run, read off the endpoint
     rather than recomputed here: the chip on the screen and this list are then
     the same answer from the same code. A 404 is the network having been
     consulted and holding no row for the pair, which is an answer and not a
     failure, and the finding still reports the accounts it holds for the
     supplier. */
  const reads: { item: PaymentRunItem; corroborated: boolean }[] = [];
  for (const item of run.items) {
    const response = await on.request(signalQuery(item));
    if (response.status === 404) {
      reads.push({ item, corroborated: false });
      continue;
    }
    need(
      response.status === 200,
      `the signal route answered ${response.status} for ${item.instruction.id}`,
    );
    const body = consortiumSignalResponseSchema.parse(await response.json());
    need(
      body.network.source === "snapshot",
      `${item.instruction.id} came back as not consulted from a pulled snapshot`,
    );
    reads.push({
      item,
      corroborated: assessNetwork(body.network).verdict === "corroborated",
    });
  }

  const corroborated = reads.filter((read) => read.corroborated);
  const doubted = reads.filter((read) => !read.corroborated);
  need(
    corroborated.length > 0,
    "the network corroborates no line of the run, so there is nothing to release with a chip",
  );
  need(
    doubted.length > 0,
    "the network doubts no line of the run, so there is nothing to stop with a chip",
  );

  /* The two lines the stage narrative needs: the account the most other
     companies pay, and the largest amount going to an account they do not. */
  const released = [...corroborated].sort(
    (left, right) =>
      right.item.instruction.amount - left.item.instruction.amount,
  )[0] as (typeof corroborated)[number];
  const stopped = [...doubted].sort(
    (left, right) =>
      right.item.instruction.amount - left.item.instruction.amount,
  )[0] as (typeof doubted)[number];

  for (const [name, chosen] of [
    ["released", released],
    ["stopped", stopped],
  ] as const) {
    const pre = await intakeLine(off, chosen.item);
    const unpulled = await intakeLine(empty, chosen.item);
    const post = await intakeLine(on, chosen.item);

    need(
      pre.signal === undefined,
      `the ${name} line carries a network chip with the flag off`,
    );
    need(
      unpulled.signal === undefined,
      `the ${name} line carries a network chip with an empty snapshot`,
    );
    need(
      unpulled.action === pre.action &&
        unpulled.expectedLoss === pre.expectedLoss,
      `an empty snapshot changed the ${name} line from ${pre.action} at ${formatAmount(pre.expectedLoss)} to ${unpulled.action} at ${formatAmount(unpulled.expectedLoss)}`,
    );
    const signal = post.signal;
    need(
      signal !== undefined,
      `the ${name} line carries no network evidence after the pull`,
    );
    need(
      signal.source === "snapshot",
      `the ${name} line reports the network as not consulted after a pull`,
    );
    /* Corroboration is never a reason to pay and the network never releases a
       payment, so neither of these two lines may cross the other's side. */
    need(
      name === "released"
        ? post.action === "release"
        : post.action !== "release",
      `the ${name} line came back as ${post.action} with the network read`,
    );

    /* The verdict the engine used, out of the signal the finding carries, and not
       the one the endpoint probe above inferred: an unknown pair answers 404
       there and still carries the supplier's other accounts here. */
    const verdict: NetworkVerdict = assessNetwork(signal).verdict;
    say(
      `${name} ${chosen.item.instruction.id} ${formatAmount(chosen.item.instruction.amount)} MXN: ${pre.action} without the network, ${post.action} with it, expected loss ${formatAmount(pre.expectedLoss)} then ${formatAmount(post.expectedLoss)} MXN`,
    );
    say(
      `  red SentryOne ${networkLabel(signal)}: ${verdict}, ${signal.tenants} tenants, ${signal.fraudReports} fraud reports, ${signal.otherAccounts} other accounts, pulled_at ${signal.pulledAt ?? "unknown"}`,
    );
    say(`  ${post.explanation ?? ""}`);
  }

  say(
    `${rows} hashed pairs in the snapshot, source synthetic, seed 69: the other tenants are generated and every warehouse row says so`,
  );
  say(
    "no Snowflake was contacted: this is the offline path of bun run consortium:pull --offline",
  );
}

/** Narrows the instruction-detail payload to what beat 2 reads off it. */
function instructionDetail(value: unknown): {
  action: string;
  findings: { detector: string }[];
} {
  const detail = value as {
    decision?: { action?: string } | null;
    findings?: { detector: string }[];
  };

  return {
    action: detail.decision?.action ?? "none",
    findings: detail.findings ?? [],
  };
}

/* -------------------------------------------------------------------------- */
/* Run                                                                         */
/* -------------------------------------------------------------------------- */

function baseFromArgs(argv: readonly string[]): string | undefined {
  const flag = argv.indexOf("--base");
  const next = argv[flag + 1];
  if (flag !== -1 && next !== undefined) {
    return next;
  }
  const inline = argv.find((arg) => arg.startsWith("--base="));
  return inline?.slice("--base=".length) ?? process.env.API_BASE_URL;
}

const base = baseFromArgs(process.argv.slice(2));
const api = base === undefined ? inMemoryApi() : remoteApi(base);
const notes = sentryoneBootNotes();

console.log(`demo: ${api.label}`);
if (notes !== undefined) {
  console.log(
    `seed ${notes.seed}, run ${notes.runId}, week of ${notes.weekOf}, company ${notes.demoRfcs[0]}`,
  );
}
console.log("");

await beat("1. the payment run loads with findings", (say) =>
  beatPaymentRun(api, say),
);
await beat("2. a two-digit CLABE change is stopped before the SPEI", (say) =>
  beatClabeForensics(api, say),
);
await beat("3. the simulated 69-B publication is priced", (say) =>
  beatSweep(api, say),
);
await beat("4. the CEP parses and the name comparison runs", (say) =>
  beatCep(api, say),
);
await beat(
  "5. the cent travels in the run and the engine releases or blocks",
  (say) => beatVerification(api, say),
);
await beat("6. the metrics endpoint answers", (say) => beatMetrics(api, say));
/* The network beat drives its own in-memory instances whatever `--base` says,
   because the consortium snapshot is local to a store and the offline pull is the
   path this repository promises works with the warehouse unplugged. */
await beat(
  "7. the consortium network reaches the decision, offline",
  beatNetwork,
);
/* Last, because it reads the run after beat 3's publication: the level and the
   state of every line, and the letter of the line that list cancelled. */
await beat(
  "8. every line carries a level and a state, and the letter prints",
  (say) => beatLevels(api, say),
);

for (const result of results) {
  console.log(`[${result.ok ? "pass" : "FAIL"}] ${result.name}`);
  for (const line of result.lines) {
    console.log(`       ${line}`);
  }
  console.log("");
}

if (hero !== undefined) {
  console.log("hero ids, for docs/10-demo-script.md and the printed card");
  console.log(`  hero instruction   ${hero.clabeInstructionId}`);
  console.log(`  hero supplier RFC  ${hero.clabeSupplierRfc}`);
  console.log(`  hero account       ${hero.clabeAccount}`);
  console.log(`  supplier for sweep ${hero.listedSupplierRfc}`);
  if (notes !== undefined) {
    console.log(`  company            ${notes.demoRfcs[0]}`);
    console.log(`  seed               ${notes.seed}`);
  }
  console.log("");
}

const failed = results.filter((result) => !result.ok);
console.log(
  failed.length === 0
    ? "demo path is green"
    : `DEMO PATH IS BROKEN in ${failed.length} of ${results.length} beats, do not rehearse on this`,
);

process.exit(failed.length === 0 ? 0 : 1);
