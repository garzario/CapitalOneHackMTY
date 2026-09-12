/**
 * bun run demo
 *
 * Drives the five beats of `docs/10-demo-script.md` headless and asserts the
 * invariants each one rests on. This is the command that runs before every
 * rehearsal and before every judge visit: if it is red, the demo is broken,
 * whatever the screen says.
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
import { createDeps } from "../apps/api/src/deps.ts";
import { UNAVAILABLE_EXTRACTOR } from "../apps/api/src/extraction.ts";
import { MemoryRepository } from "../apps/api/src/repo.ts";
import {
  intakeResponseSchema,
  metricsSchema,
  paymentRunSchema,
  sweepResultSchema,
} from "../apps/api/src/schemas.ts";
import {
  sentryoneBootNotes,
  sentryoneDataset,
} from "../apps/api/src/sentryone.ts";
import {
  nameMatch,
  parseCep,
  syntheticCepXml,
} from "../packages/cep/src/index.ts";
import { formatAmount } from "../packages/core/src/index.ts";

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

function inMemoryApi(): Api {
  const app = createApp(
    createDeps({
      repo: new MemoryRepository(0, sentryoneDataset),
      // Seeding is a destructive write and the demo never needs it. The
      // extractor is the one a server with no GEMINI_API_KEY gets, so a key in
      // the environment cannot change what this script reports.
      allowSeed: false,
      extractor: UNAVAILABLE_EXTRACTOR,
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

function post(body: unknown): RequestInit {
  return {
    method: "POST",
    headers: { "content-type": "application/json" },
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

/** What beat 1 learns and the later beats reuse, so no id is hard coded. */
interface Hero {
  clabeInstructionId: string;
  clabeSupplierRfc: string;
  clabeAccount: string;
  clabeAmount: number;
  listedSupplierRfc: string;
}

let hero: Hero | undefined;

/* -------------------------------------------------------------------------- */
/* The five beats                                                              */
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

  hero = {
    clabeInstructionId: clabe.instruction.id,
    clabeSupplierRfc: clabe.instruction.supplierRfc,
    clabeAccount: clabe.instruction.clabe,
    clabeAmount: clabe.instruction.amount,
    listedSupplierRfc: listed.instruction.supplierRfc,
  };

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
      `  ${item.instruction.id} ${String(item.decision?.action).padEnd(7)} ${formatAmount(item.instruction.amount).padStart(12)} MXN  ${item.findings.map((finding) => finding.detector).join(", ")}`,
    );
  }
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
 * Beat 3. A simulated 69-B publication, priced against what is already deducted.
 *
 * ADR-0002 binds this to synthetic RFCs, and both the request schema and
 * `simulatePublication` refuse anything else, so the publication that meets an
 * invoice can never carry a real taxpayer. The exposure is computed over the
 * seeded ledger: the CFDIs of that supplier that a payment complement or a
 * `payment_sent` event says we already paid.
 */
async function beatSweep(api: Api, say: Say): Promise<void> {
  need(
    hero !== undefined,
    "beat 1 did not run, so there is no listed supplier",
  );
  const rfc = hero.listedSupplierRfc;

  const sweep = sweepResultSchema.parse(
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
await beat("5. the metrics endpoint answers", (say) => beatMetrics(api, say));

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
