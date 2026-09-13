/**
 * bun run eval:assistant
 *
 * Twenty golden questions, the read each one has to reach for, and what the twenty
 * cost in pesos.
 *
 * The panel is the one part of this product with a language model in it, so it is the
 * one part whose behaviour a unit test cannot finish proving. What the unit tests do
 * prove is everything around the model: the nine reads, the masking, the proposals,
 * the ledger rows and the cost arithmetic. What this script adds is the question
 * nobody else answers, which is whether the model routes a clerk's own sentence to
 * the read that can answer it.
 *
 * Two modes, and the difference is printed rather than hidden:
 *
 * - **live**, the default when `GEMINI_API_KEY` is in the environment, or forced with
 *   `--live`. Every question goes to the configured model through the real turn loop,
 *   against a freshly seeded in-memory API, and the script checks which read it
 *   reached for first and which action it offered. The tokens and the pesos are read
 *   back off the ledger, so the figure on the table is the row an auditor would sum.
 * - **offline**, with no key or with `--offline`. The model is replaced by the
 *   recorded plan each case carries, which drives the whole turn with no network: the
 *   read runs, the mask runs, the proposal is built, the ledger rows are written and
 *   the cost is computed. It says plainly that the routing was NOT measured, because
 *   a green line that proved nothing is worse than a red one.
 *
 * No id is hard coded. The hero lines are found in the seeded run the same way
 * `scripts/demo.ts` finds them, so a change to the generator moves the questions with
 * it instead of breaking them.
 *
 * Flags:
 *   --live          force the live mode, and fail if no key is configured
 *   --offline       force the offline mode even with a key
 *   --only=<id>     run one case, for debugging a prompt
 *   --json          print the result as JSON
 *
 * Exit code: 0 when every case routed to its expected read and offered the expected
 * action.
 */

import { createApp } from "../apps/api/src/app.ts";
import {
  formatMxn,
  formatMxnPrecise,
  MXN_PER_USD,
  MXN_PER_USD_AT,
} from "../apps/api/src/assistant/cost.ts";
import {
  type AssistantModel,
  createAssistantModel,
  type ModelToolCall,
  scriptedModel,
} from "../apps/api/src/assistant/model.ts";
import { createDeps } from "../apps/api/src/deps.ts";
import { UNAVAILABLE_EXTRACTOR } from "../apps/api/src/extraction.ts";
import { MemoryRepository } from "../apps/api/src/repo.ts";
import type { PaymentRun } from "../apps/api/src/schemas.ts";
import { sentryoneDataset } from "../apps/api/src/sentryone.ts";
import type {
  AssistantTool,
  ProposalKind,
} from "../packages/core/src/index.ts";

/* -------------------------------------------------------------------------- */
/* The lines the questions are about                                           */
/* -------------------------------------------------------------------------- */

/**
 * The four lines of the seeded run a judge would actually ask about, found rather
 * than named: the account with no history, the supplier the SAT published, the
 * duplicate, and a line nothing is stopping.
 */
export interface HeroLines {
  newAccountId: string;
  newAccountRfc: string;
  newAccountClabe: string;
  listedRfc: string;
  duplicateId: string;
  cleanId: string;
}

export function heroLinesFrom(run: PaymentRun): HeroLines {
  const byDetector = (detector: string) =>
    run.items.find((item) =>
      item.findings.some((finding) => finding.detector === detector),
    );

  const clabe = byDetector("clabe_forensics");
  const listed = byDetector("sat_69b");
  const duplicate = byDetector("duplicate_invoice");
  const clean = run.items.find(
    (item) => item.findings.length === 0 && item.decision !== null,
  );

  if (clabe === undefined || listed === undefined) {
    throw new Error(
      "the seeded run carries no clabe_forensics or no sat_69b finding, so the golden questions have nothing to ask about",
    );
  }

  return {
    newAccountId: clabe.instruction.id,
    newAccountRfc: clabe.instruction.supplierRfc,
    newAccountClabe: clabe.instruction.clabe,
    listedRfc: listed.instruction.supplierRfc,
    /* The duplicate and the clean line are nice to have and not load bearing: if the
       generator stops producing one, the question falls back to the CLABE line rather
       than failing the whole eval over a case that is about phrasing. */
    duplicateId: duplicate?.instruction.id ?? clabe.instruction.id,
    cleanId: clean?.instruction.id ?? clabe.instruction.id,
  };
}

/* -------------------------------------------------------------------------- */
/* The golden questions                                                        */
/* -------------------------------------------------------------------------- */

/**
 * One golden question.
 *
 * `expect` is the read the FIRST round has to reach for, because what is being
 * measured is routing: a model that reads the whole run to answer a question about
 * one line is answering the right question the expensive way, and a model that reads
 * nothing is answering from its own memory. Where a second read is equally
 * defensible, `alsoAccept` names it. `"none"` means the question has to be answered
 * with no read at all, which is the right answer for a question about the product
 * itself and for one this product cannot answer.
 *
 * `expectProposal` is checked in one direction only, and that is deliberate. When a
 * question asks for an action, the turn has to offer that action and offering another
 * is a miss. When a question asks nothing, a card the panel volunteers is not a
 * failure: the system prompt allows one, offering the one-cent check next to a line
 * with no history is the product working, and a judge pressing nothing loses nothing.
 * So an unexpected offer is printed and counted, and it does not fail the run.
 *
 * `plan` is what the offline mode replays. It is recorded rather than generated, so
 * an offline run exercises the reads, the proposals and the arithmetic without
 * pretending to have measured the model.
 */
export interface GoldenCase {
  id: string;
  /** What the clerk types, in her own words, missing accents included. */
  question: string;
  expect: AssistantTool | "none";
  alsoAccept?: AssistantTool[];
  /** The action the turn has to end with, when the question asks for one. */
  expectProposal?: ProposalKind;
  plan: ModelToolCall[];
  /** The Spanish sentence the offline mode answers with. */
  answer: string;
}

export function goldenCases(hero: HeroLines): readonly GoldenCase[] {
  return [
    {
      id: "why-red",
      question: `por que esta en rojo ${hero.newAccountId}`,
      expect: "get_instruction",
      plan: [
        { name: "get_instruction", args: { instructionId: hero.newAccountId } },
      ],
      answer:
        "Está en alerta porque la cuenta que trae no tiene historial con ese proveedor.",
    },
    {
      id: "prove-the-account",
      question: `${hero.newAccountId} esta detenida, como compruebo la cuenta`,
      expect: "get_instruction",
      alsoAccept: ["get_verification"],
      expectProposal: "verify_account",
      plan: [
        { name: "get_instruction", args: { instructionId: hero.newAccountId } },
        {
          name: "propose_verify_account",
          args: { instructionId: hero.newAccountId },
        },
      ],
      answer:
        "Te dejo la prueba del centavo: sale 0.01 y leemos el CEP que firme Banxico.",
    },
    {
      id: "run-held-total",
      question: "cuanto traigo detenido en la corrida de esta semana",
      expect: "get_run",
      plan: [{ name: "get_run", args: {} }],
      answer: "La corrida trae líneas detenidas y ese es el total en pesos.",
    },
    {
      id: "run-what-is-left",
      question: "que me falta revisar antes de pagar",
      expect: "get_run",
      plan: [{ name: "get_run", args: {} }],
      answer: "Te faltan las líneas detenidas y las que esperan verificación.",
    },
    {
      id: "run-send",
      question: "ya quiero enviar la corrida",
      expect: "get_run",
      expectProposal: "execute_run",
      plan: [
        { name: "get_run", args: {} },
        { name: "propose_execute_run", args: {} },
      ],
      answer:
        "Te dejo la tarjeta para enviar la corrida. Las líneas detenidas no salen.",
    },
    {
      id: "supplier-since",
      question: `desde cuando le compramos a ${hero.newAccountRfc}`,
      expect: "get_supplier",
      plan: [{ name: "get_supplier", args: { rfc: hero.newAccountRfc } }],
      answer:
        "La relación con ese proveedor empieza en la fecha de su primer CFDI.",
    },
    {
      id: "supplier-accounts",
      question: `en que cuentas le hemos pagado a ${hero.newAccountRfc}`,
      expect: "get_supplier",
      plan: [{ name: "get_supplier", args: { rfc: hero.newAccountRfc } }],
      answer: "Le hemos pagado en las cuentas que terminan en esos dígitos.",
    },
    {
      id: "supplier-amount",
      question: `cuanto le pagamos al año a ${hero.newAccountRfc}`,
      expect: "get_supplier",
      plan: [{ name: "get_supplier", args: { rfc: hero.newAccountRfc } }],
      answer: "Esos son los CFDI que tenemos de ese proveedor y sus importes.",
    },
    {
      id: "sat-listed",
      question: `${hero.listedRfc} esta en la lista del sat`,
      expect: "sat_lookup",
      plan: [{ name: "sat_lookup", args: { rfc: hero.listedRfc } }],
      answer: "Aparece en la lista del artículo 69-B con esa situación.",
    },
    {
      id: "sat-other-list",
      question: `y en la lista del 49 bis, ahi aparece ${hero.listedRfc}`,
      expect: "sat_lookup",
      plan: [{ name: "sat_lookup", args: { rfc: hero.listedRfc } }],
      answer:
        "La lista del 49 Bis no está cargada en este servidor, así que no puedo decir que no esté listado.",
    },
    {
      id: "sat-consequence",
      question: `que pasa con lo que ya le pague a ${hero.listedRfc}`,
      expect: "get_supplier",
      alsoAccept: ["sat_lookup", "get_run"],
      plan: [{ name: "get_supplier", args: { rfc: hero.listedRfc } }],
      answer:
        "Las facturas que ya dedujiste pierden el efecto fiscal, y eso es lo que mide el barrido retroactivo.",
    },
    {
      id: "duplicate",
      question: `${hero.duplicateId} se me hace que ya la pague, que trae`,
      expect: "get_instruction",
      plan: [
        { name: "get_instruction", args: { instructionId: hero.duplicateId } },
      ],
      answer:
        "El control de duplicados encontró un pago equivalente ya registrado.",
    },
    {
      id: "verification-state",
      question: `ya salio el centavo de ${hero.newAccountId}`,
      expect: "get_verification",
      plan: [
        {
          name: "get_verification",
          args: { instructionId: hero.newAccountId },
        },
      ],
      answer: "Todavía no sale el centavo de esa línea.",
    },
    {
      id: "call-the-supplier",
      question: `no tengo papeles para comprobar la cuenta de ${hero.newAccountId}`,
      expect: "get_instruction",
      alsoAccept: ["get_verification"],
      expectProposal: "verify_call",
      plan: [
        { name: "get_instruction", args: { instructionId: hero.newAccountId } },
        {
          name: "propose_verify_call",
          args: { instructionId: hero.newAccountId },
        },
      ],
      answer:
        "Te dejo la llamada al proveedor. Solo se leen los últimos cuatro dígitos y no libera el pago.",
    },
    {
      id: "hold-deadline",
      question: `hasta cuando puedo dejar detenida ${hero.newAccountId}`,
      expect: "get_instruction",
      plan: [
        { name: "get_instruction", args: { instructionId: hero.newAccountId } },
      ],
      answer:
        "La detención tiene fecha límite y el siguiente paso está en la tarjeta.",
    },
    {
      id: "urgent-release",
      question: `ya confirme por telefono con el proveedor, quiero liberar ${hero.newAccountId} hoy`,
      expect: "get_instruction",
      expectProposal: "decide",
      plan: [
        { name: "get_instruction", args: { instructionId: hero.newAccountId } },
        {
          name: "propose_decide",
          args: { instructionId: hero.newAccountId, action: "release" },
        },
      ],
      answer:
        "Te dejo la tarjeta para liberarla. La autoriza el dueño y queda su nombre y su razón en el registro.",
    },
    {
      id: "hold-it",
      question: `deten ${hero.duplicateId} mientras reviso`,
      expect: "get_instruction",
      expectProposal: "decide",
      plan: [
        { name: "get_instruction", args: { instructionId: hero.duplicateId } },
        {
          name: "propose_decide",
          args: { instructionId: hero.duplicateId, action: "hold" },
        },
      ],
      answer: "Te dejo la tarjeta para detenerla a tu nombre.",
    },
    {
      id: "metrics",
      question: "que tan bien funcionan los controles, como los midieron",
      expect: "get_metrics",
      plan: [{ name: "get_metrics", args: {} }],
      answer:
        "Se midieron contra casos etiquetados a ciegas, y esos son los números.",
    },
    {
      id: "consortium",
      question: `otra empresa de la red ya le ha pagado a la cuenta de ${hero.newAccountId}`,
      expect: "consortium_signal",
      alsoAccept: ["get_instruction"],
      plan: [
        {
          name: "consortium_signal",
          args: { instructionId: hero.newAccountId },
        },
      ],
      answer:
        "La red del consorcio no está configurada en este servidor, así que no puedo decir qué ha visto.",
    },
    {
      id: "who-decides",
      question: "quien decide si un pago sale, tu o yo",
      expect: "none",
      plan: [],
      answer:
        "Tú decides. Yo leo lo que ya calcularon los seis controles y te propongo la acción; el registro queda a tu nombre.",
    },
  ];
}

/* -------------------------------------------------------------------------- */
/* The runner                                                                  */
/* -------------------------------------------------------------------------- */

interface CaseResult {
  id: string;
  question: string;
  expected: string;
  called: string[];
  proposal?: string;
  expectedProposal?: string;
  routed: boolean;
  proposed: boolean;
  promptTokens: number;
  outputTokens: number;
  costMxn: number;
  answer: string;
  error?: string;
}

interface Frame {
  event: string;
  data: Record<string, unknown>;
}

const ACTOR_HEADER = "role=clerk; name=Lupita Elizondo";

/** A freshly seeded API, in memory: no database, no rail, no network. */
function buildApp(model: AssistantModel) {
  const deps = createDeps({
    repo: new MemoryRepository(0, sentryoneDataset),
    model,
    /* No extraction key. This script asks questions; the image intake is exercised
       by `apps/api/src/assistant/turn.test.ts` with a stubbed extractor. */
    extractor: UNAVAILABLE_EXTRACTOR,
    allowSeed: false,
    /* The table this script prints is its output, and it asks the API hundreds of
       questions, so the request log goes nowhere while it drives one. */
    log: () => {},
  });
  return { app: createApp(deps), deps };
}

function parseStream(body: string): Frame[] {
  const frames: Frame[] = [];
  for (const block of body.split("\n\n")) {
    const lines = block.split("\n");
    const event = lines
      .find((line) => line.startsWith("event: "))
      ?.slice("event: ".length);
    const data = lines
      .find((line) => line.startsWith("data: "))
      ?.slice("data: ".length);
    if (event === undefined || data === undefined) {
      continue;
    }
    try {
      frames.push({ event, data: JSON.parse(data) as Record<string, unknown> });
    } catch {
      /* A frame that is not JSON is not a frame this script can read. */
    }
  }
  return frames;
}

/**
 * What the turn cost, read back off the ledger rather than off the stream.
 *
 * From the ledger on purpose: the figure this script prints is then the same row an
 * auditor would sum, which is the claim docs/06 section 6.4 makes about the panel.
 */
async function usageOf(
  deps: ReturnType<typeof buildApp>["deps"],
  since: string,
): Promise<{ promptTokens: number; outputTokens: number; costMxn: number }> {
  /* `since` and not a large limit: `ledger` answers the OLDEST page and the seeded
     company's ledger is thousands of events long, so the turn that just happened
     would never be in it. Same reason `verificationEvents` is a targeted read. */
  const events = await deps.repo.ledger({ since, limit: 2000 });
  let promptTokens = 0;
  let outputTokens = 0;
  let costMxn = 0;
  for (const event of events) {
    if (event.type === "assistant_message" && event.usage !== undefined) {
      promptTokens += event.usage.promptTokens;
      outputTokens += event.usage.outputTokens;
      costMxn += event.usage.costMxn;
    }
  }
  return { promptTokens, outputTokens, costMxn };
}

/**
 * The offline model for one case: its recorded plan, then its recorded answer.
 *
 * The token counts are the shape of a real turn on this product rather than zeros:
 * about 1,500 prompt tokens for the instruction set and the nine declarations, the
 * evidence of one read on the next round, and a short Spanish answer. They make the
 * offline cost line arithmetic over plausible numbers, and the line says which mode
 * produced it.
 */
export function plannedModel(golden: GoldenCase): AssistantModel {
  if (golden.plan.length === 0) {
    return scriptedModel([
      { text: golden.answer, usage: { promptTokens: 1500, outputTokens: 60 } },
    ]);
  }
  return scriptedModel([
    {
      calls: golden.plan.slice(0, 1),
      usage: { promptTokens: 1500, outputTokens: 20 },
    },
    ...(golden.plan.length > 1
      ? [
          {
            calls: golden.plan.slice(1),
            usage: { promptTokens: 2600, outputTokens: 20 },
          },
        ]
      : []),
    { text: golden.answer, usage: { promptTokens: 2800, outputTokens: 70 } },
  ]);
}

async function runCase(
  golden: GoldenCase,
  model: AssistantModel,
): Promise<CaseResult> {
  const { app, deps } = buildApp(model);
  const base: CaseResult = {
    id: golden.id,
    question: golden.question,
    expected: golden.expect,
    called: [],
    routed: false,
    proposed: false,
    promptTokens: 0,
    outputTokens: 0,
    costMxn: 0,
    answer: "",
  };
  if (golden.expectProposal !== undefined) {
    base.expectedProposal = golden.expectProposal;
  }

  const since = new Date(Date.now() - 1).toISOString();
  const response = await app.request("/api/v1/assistant/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-actor": ACTOR_HEADER },
    body: JSON.stringify({ text: golden.question }),
  });

  if (response.status !== 200) {
    const body = await response.text();
    return { ...base, error: `HTTP ${response.status}: ${body.slice(0, 200)}` };
  }

  const frames = parseStream(await response.text());
  const called = frames
    .filter((frame) => frame.event === "tool_call")
    .map((frame) => String(frame.data.tool));
  const proposal = frames.find((frame) => frame.event === "proposal");
  const done = frames.find((frame) => frame.event === "done");
  const answer = frames
    .filter((frame) => frame.event === "token")
    .map((frame) => String(frame.data.text))
    .join("");
  const accepted = new Set<string>([
    golden.expect,
    ...(golden.alsoAccept ?? []),
  ]);
  const usage = await usageOf(deps, since);

  const result: CaseResult = {
    ...base,
    called,
    routed:
      golden.expect === "none"
        ? called.length === 0
        : accepted.has(called[0] ?? ""),
    proposed:
      golden.expectProposal === undefined
        ? true
        : proposal?.data.kind === golden.expectProposal,
    answer: answer === "" ? String(done?.data.text ?? "") : answer,
    ...usage,
  };
  if (proposal !== undefined) {
    result.proposal = String(proposal.data.kind);
  }
  return result;
}

/* -------------------------------------------------------------------------- */
/* Output                                                                      */
/* -------------------------------------------------------------------------- */

if (import.meta.main) {
  const args = Bun.argv.slice(2);
  const flags = new Set(args.filter((arg) => !arg.includes("=")));
  const only = args
    .find((arg) => arg.startsWith("--only="))
    ?.slice("--only=".length);

  const liveModel = createAssistantModel();
  const live =
    flags.has("--live") || (!flags.has("--offline") && liveModel.available);

  if (flags.has("--live") && !liveModel.available) {
    console.error(
      "eval:assistant --live needs GEMINI_API_KEY in the environment. Run it without --live for the offline mode.",
    );
    process.exit(1);
  }

  const probe = buildApp(liveModel);
  const run = (await (
    await probe.app.request("/api/v1/run/current")
  ).json()) as PaymentRun;
  const hero = heroLinesFrom(run);
  const cases = goldenCases(hero).filter(
    (golden) => only === undefined || golden.id === only,
  );

  const results: CaseResult[] = [];
  for (const golden of cases) {
    results.push(
      await runCase(golden, live ? liveModel : plannedModel(golden)),
    );
  }

  const totals = results.reduce(
    (sum, result) => ({
      promptTokens: sum.promptTokens + result.promptTokens,
      outputTokens: sum.outputTokens + result.outputTokens,
      costMxn: sum.costMxn + result.costMxn,
    }),
    { promptTokens: 0, outputTokens: 0, costMxn: 0 },
  );
  const routed = results.filter((result) => result.routed).length;
  const proposed = results.filter((result) => result.proposed).length;
  const failed = results.filter(
    (result) =>
      result.error !== undefined || !result.routed || !result.proposed,
  );

  if (flags.has("--json")) {
    console.log(
      JSON.stringify(
        {
          mode: live ? "live" : "offline",
          model: liveModel.model,
          rate: { mxnPerUsd: MXN_PER_USD, at: MXN_PER_USD_AT },
          routed,
          proposed,
          totals,
          cases: results,
        },
        null,
        2,
      ),
    );
  } else {
    console.log(
      `eval:assistant  ${results.length} case(s)  mode ${live ? "live" : "offline"}  model ${liveModel.model}`,
    );
    console.log("");
    for (const result of results) {
      const mark =
        result.error !== undefined
          ? "ERR "
          : result.routed && result.proposed
            ? "ok  "
            : "MISS";
      const proposal =
        result.expectedProposal === undefined
          ? result.proposal === undefined
            ? ""
            : `  offered ${result.proposal}, none expected`
          : `  offered ${result.proposal ?? "-"}, want ${result.expectedProposal}`;
      console.log(
        `[${mark}] ${result.id.padEnd(22)} want ${result.expected.padEnd(18)} got ${(result.called[0] ?? "-").padEnd(18)}${proposal}`,
      );
      if (result.error !== undefined) {
        console.log(`       ${result.error}`);
      } else if (mark === "MISS") {
        console.log(`       every read: ${result.called.join(", ") || "none"}`);
        console.log(`       answer: ${result.answer.slice(0, 160)}`);
      }
    }

    console.log("");
    const asked = results.filter(
      (result) => result.expectedProposal !== undefined,
    ).length;
    const volunteered = results.filter(
      (result) =>
        result.expectedProposal === undefined && result.proposal !== undefined,
    ).length;
    console.log(`routed to the expected read   ${routed} of ${results.length}`);
    console.log(
      `offered the action that was asked for   ${proposed - (results.length - asked)} of ${asked}`,
    );
    console.log(
      `offered a card nobody asked for   ${volunteered} of ${results.length - asked}, which is allowed`,
    );
    console.log(
      `tokens                        ${totals.promptTokens} in, ${totals.outputTokens} out`,
    );
    console.log(
      `cost of the ${String(results.length).padStart(2)} questions       ${formatMxn(totals.costMxn)}  (${formatMxnPrecise(totals.costMxn)})`,
    );
    console.log(
      `per question                  ${formatMxnPrecise(results.length === 0 ? 0 : totals.costMxn / results.length)}`,
    );
    console.log(
      `rate                          MXN ${MXN_PER_USD} per USD, Banxico FIX of ${MXN_PER_USD_AT}; token prices in apps/api/src/assistant/cost.ts`,
    );
    console.log("");
    if (!live) {
      console.log(
        "offline mode: the routing was NOT measured. The reads, the mask, the proposals, the ledger rows and the cost arithmetic ran against a recorded plan. Set GEMINI_API_KEY, or pass --live, to measure the model.",
      );
    }
  }

  process.exit(failed.length === 0 ? 0 : 1);
}
