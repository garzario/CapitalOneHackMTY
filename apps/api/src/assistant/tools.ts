/**
 * The nine reads the assistant is allowed to perform, and nothing else.
 *
 * Every one of them is an HTTP GET this API already serves, called in process
 * through the very handler the web app calls over the wire. That is the design
 * decision worth defending: a tool that reached into the repository directly would
 * be a second code path answering the same question, and the panel would be able to
 * tell a clerk something the screen next to it cannot show. Going through
 * `app.request` means the run the assistant quotes is byte for byte the run on the
 * screen, the rate limit on the SAT lookup applies to it, the 404 envelope is the
 * same envelope, and the cost of the whole thing is a function call.
 *
 * Four properties hold, and three of them are structural rather than written down.
 *
 * 1. **Every tool is a GET.** `read` is the only function in this file that issues
 *    a request and it hardcodes the method, so a writing tool cannot be added here
 *    by accident. `AssistantToolCall.readOnly` is the literal `true` in the domain
 *    for the same reason.
 * 2. **The result is evidence, never prose.** A tool answers
 *    `Record<string, EvidenceValue>`, which is the shape the finding panel already
 *    renders as chips, so nothing a model wrote can arrive dressed as a fact and
 *    nothing the engine computed arrives as a paragraph the model paraphrased.
 * 3. **Accounts leave as four digits.** Every projection below goes through
 *    `mask.ts` on its way out. The projections are deliberately narrow as well: a
 *    tool answers the fields the question needs, not the whole payload, because a
 *    smaller result is both a smaller transfer and a cheaper prompt.
 * 4. **A read that failed says so.** `error` on the tool call carries one sentence
 *    and the turn continues. An assistant that silently lost a read would answer
 *    from its own memory, which is the failure ADR-0007 exists to prevent, so the
 *    stream shows the failure and the system prompt tells the model to say it.
 */

import type {
  AssistantTool,
  Confidence,
  Decision,
  EvidenceValue,
  Finding,
  TransactionState,
} from "@hackmty/core";
import { assessConfidence, transactionStateOf } from "@hackmty/core";
import { maskClabe, maskClabesInText, maskDeep, maskEvidence } from "./mask";
import type { ModelFunctionDeclaration } from "./model";

/**
 * One in-process call into this API's own router. `createApp` binds it to the app
 * it just built, and a test can bind it to anything that answers a `Response`.
 */
export type ApiCaller = (path: string, init?: RequestInit) => Promise<Response>;

/** What a tool answers: the evidence, or the sentence that says why it did not. */
export type ToolOutcome =
  | { ok: true; result: Record<string, EvidenceValue> }
  | { ok: false; error: string };

export interface ToolDefinition {
  tool: AssistantTool;
  declaration: ModelFunctionDeclaration;
  run(args: Record<string, unknown>, api: ApiCaller): Promise<ToolOutcome>;
}

/* -------------------------------------------------------------------------- */
/* Reading the API                                                             */
/* -------------------------------------------------------------------------- */

interface ApiError {
  error?: { code?: string; message?: string };
}

/**
 * A GET against our own router, with the failure turned into a sentence.
 *
 * The method is not a parameter. Two endpoints the panel proposes are POSTs and
 * this function being unable to express one is what makes "the tools are reads" a
 * property of the code rather than a promise in a comment.
 */
async function read<T>(
  api: ApiCaller,
  path: string,
): Promise<{ ok: true; body: T } | { ok: false; error: string }> {
  const response = await api(path, { method: "GET" });
  const text = await response.text();

  if (!response.ok) {
    let message = `the read answered ${response.status}`;
    try {
      const envelope = JSON.parse(text) as ApiError;
      if (envelope.error?.message !== undefined) {
        message = envelope.error.message;
      }
    } catch {
      /* A body that is not our envelope is not worth echoing. */
    }
    return { ok: false, error: message };
  }

  try {
    return { ok: true, body: JSON.parse(text) as T };
  } catch {
    return { ok: false, error: "the read answered something that is not JSON" };
  }
}

/** Reads one required string argument, or says which one is missing. */
function stringArg(
  args: Record<string, unknown>,
  name: string,
): { ok: true; value: string } | { ok: false; error: string } {
  const value = args[name];
  if (typeof value !== "string" || value.trim() === "") {
    return { ok: false, error: `${name} is required and must be a string` };
  }
  return { ok: true, value: value.trim() };
}

/* -------------------------------------------------------------------------- */
/* Projections                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * One finding as the chips the panel renders, with the account masked.
 *
 * The explanation travels because it is the Spanish sentence the engine wrote and
 * the answer has to be able to quote it rather than invent one. The evidence
 * travels because a level with no evidence under it is not a thing this product
 * shows, and that rule holds for the panel as much as for the screen.
 *
 * The explanation goes through `maskClabesInText` for the reason the structured
 * evidence next to it does, and it is the case the first version of this file got
 * wrong: control 2 writes its sentence with the known account spelled out in it
 * ("difiere en 2 digitos de la cuenta 0125...4611"), so a projection that masked
 * `evidence.clabe` and then passed the prose through sent the full eighteen digits
 * anyway. ADR-0007 and `docs/06-regulatory-privacy.md` section 6.2 allow four
 * digits to leave and the sentence still reads with `****4611` in it.
 */
function findingChips(finding: Finding): Record<string, EvidenceValue> {
  return {
    detector: finding.detector,
    severity: finding.severity,
    state: finding.state,
    amountAtRisk: finding.amountAtRisk,
    explanation: maskClabesInText(finding.explanation),
    ...prefix(`evidence`, maskEvidence(finding.evidence)),
  };
}

/** Flattens a nested map into `parent.key` entries, which chips can carry. */
function prefix(
  parent: string,
  values: Record<string, EvidenceValue>,
): Record<string, EvidenceValue> {
  const flat: Record<string, EvidenceValue> = {};
  for (const [key, value] of Object.entries(values)) {
    flat[`${parent}.${key}`] = value;
  }
  return flat;
}

/** Findings as one numbered block per finding, so the model can cite each one. */
function findingsBlock(
  findings: readonly Finding[],
): Record<string, EvidenceValue> {
  const flat: Record<string, EvidenceValue> = { findings: findings.length };
  findings.forEach((finding, index) => {
    const chips = findingChips(finding);
    for (const [key, value] of Object.entries(chips)) {
      flat[`finding.${index + 1}.${key}`] = value;
    }
  });
  return flat;
}

/**
 * The level and the state of one line, derived here and never read off a payload.
 *
 * `confidenceOf` and `transactionStateOf` are the one place either is computed,
 * which is ADR-0009, and the panel reading them from the same functions as the
 * screen is what stops the assistant and the chip next to it disagreeing about a
 * payment. The rule that produced the level travels too, because the answer has to
 * be able to say why it is that level.
 */
function levelAndState(
  findings: readonly Finding[],
  decision: Decision | null,
): {
  confidence: Confidence;
  rule: string;
  state: TransactionState;
} {
  const assessed = assessConfidence(findings, decision);
  return {
    confidence: assessed.level,
    rule: assessed.rule,
    state: transactionStateOf(decision),
  };
}

/* -------------------------------------------------------------------------- */
/* The tools                                                                   */
/* -------------------------------------------------------------------------- */

interface RunPayload {
  id: string;
  weekOf: string;
  totals: Record<string, number>;
  items: Array<{
    instruction: { id: string; amount: number; supplierRfc: string };
    supplier: { legalName: string };
    decision: Decision | null;
    findings: Finding[];
  }>;
}

interface InstructionPayload {
  instruction: {
    id: string;
    supplierRfc: string;
    clabe: string;
    amount: number;
    receivedAt: string;
    source: string;
    ocrConfidence?: number;
  };
  decision: Decision | null;
  findings: Finding[];
  supplier: { legalName: string; rfc: string; firstInvoiceAt: string } | null;
  hold: {
    action: string;
    days: number;
    deadline: string;
    hoursLeft: number;
    expired: boolean;
    nextSteps: string[];
  } | null;
}

/** How many run lines a single answer may carry. The alert rail is what matters. */
const RUN_LINE_LIMIT = 12;

const GET_RUN: ToolDefinition = {
  tool: "get_run",
  declaration: {
    name: "get_run",
    description:
      "The current payment run: its totals in line counts and in pesos, and the lines that are stopped, with the level and the findings of each one. Use it for any question about the run as a whole, about how much is held, or about which payments need attention.",
    parameters: { type: "OBJECT", properties: {} },
  },
  async run(_args, api) {
    const answer = await read<RunPayload>(api, "/api/v1/run/current");
    if (!answer.ok) {
      return answer;
    }
    const run = answer.body;
    /* The stopped lines first, then the rest, capped. A run is 92 instructions in
       the seeded company and the question is almost always about the ones that are
       not moving, so spending the prompt on the clean lines would be paying for
       tokens that answer nothing. */
    const stopped = run.items.filter(
      (item) => item.decision !== null && item.decision.action !== "release",
    );
    const shown = (stopped.length > 0 ? stopped : run.items).slice(
      0,
      RUN_LINE_LIMIT,
    );

    const result: Record<string, EvidenceValue> = {
      runId: run.id,
      weekOf: run.weekOf,
      lines: run.items.length,
      linesStopped: stopped.length,
      linesShown: shown.length,
    };
    for (const [key, value] of Object.entries(run.totals)) {
      result[`totals.${key}`] = value;
    }
    shown.forEach((item, index) => {
      const tag = `line.${index + 1}`;
      const { confidence, state } = levelAndState(item.findings, item.decision);
      result[`${tag}.instructionId`] = item.instruction.id;
      result[`${tag}.supplier`] = item.supplier.legalName;
      result[`${tag}.supplierRfc`] = item.instruction.supplierRfc;
      result[`${tag}.amount`] = item.instruction.amount;
      result[`${tag}.action`] = item.decision?.action ?? "sin decidir";
      result[`${tag}.confidence`] = confidence;
      result[`${tag}.state`] = state;
      result[`${tag}.findings`] = item.findings.length;
    });
    return { ok: true, result };
  },
};

const GET_INSTRUCTION: ToolDefinition = {
  tool: "get_instruction",
  declaration: {
    name: "get_instruction",
    description:
      "One payment instruction with the evidence behind it: the amount, the supplier, the six controls' findings with their explanations and evidence, the action the engine proposed, the level and the state, and the hold window if the payment is stopped. This is the tool for any question about why one line is the way it is.",
    parameters: {
      type: "OBJECT",
      properties: {
        instructionId: {
          type: "STRING",
          description:
            "The instruction id, for example INS-2026-09-07-029. Copy it exactly as the clerk wrote it.",
        },
      },
      required: ["instructionId"],
    },
  },
  async run(args, api) {
    const id = stringArg(args, "instructionId");
    if (!id.ok) {
      return id;
    }
    const answer = await read<InstructionPayload>(
      api,
      `/api/v1/instructions/${encodeURIComponent(id.value)}`,
    );
    if (!answer.ok) {
      return answer;
    }
    const detail = answer.body;
    const { confidence, rule, state } = levelAndState(
      detail.findings,
      detail.decision,
    );

    const result: Record<string, EvidenceValue> = {
      instructionId: detail.instruction.id,
      amount: detail.instruction.amount,
      supplierRfc: detail.instruction.supplierRfc,
      clabeLast4: maskClabe(detail.instruction.clabe),
      source: detail.instruction.source,
      receivedAt: detail.instruction.receivedAt,
      confidence,
      confidenceRule: rule,
      state,
      action: detail.decision?.action ?? "sin decidir",
      ...findingsBlock(detail.findings),
    };
    if (detail.supplier !== null) {
      result.supplier = detail.supplier.legalName;
      result.supplierSince = detail.supplier.firstInvoiceAt;
    }
    if (detail.decision !== null) {
      result.expectedLoss = detail.decision.expectedLoss;
      result.delayCostPerDay = detail.decision.delayCostPerDay;
      if (detail.decision.decidedBy !== undefined) {
        result.decidedBy = detail.decision.decidedBy;
      }
    }
    if (detail.hold !== null) {
      /* The deadline and the way out, because a hold with neither is a control the
         clerk bypasses outside the product, where nothing is recorded. */
      result.holdDeadline = detail.hold.deadline;
      result.holdHoursLeft = detail.hold.hoursLeft;
      result.holdExpired = detail.hold.expired;
      result.holdNextSteps = detail.hold.nextSteps.join(", ");
    }
    if (detail.instruction.ocrConfidence !== undefined) {
      result.ocrConfidence = detail.instruction.ocrConfidence;
    }
    return { ok: true, result };
  },
};

interface SupplierPayload {
  supplier: {
    rfc: string;
    legalName: string;
    firstInvoiceAt: string;
    knownAccounts: Array<{
      clabe: string;
      establishedBy: string;
      establishedAt: string;
      timesPaid: number;
    }>;
    delayCostPerDay?: number;
  };
  cfdis: Array<{ uuid: string; issuedAt: string; total: number }>;
  complements: Array<{ paidAt: string; amount: number }>;
  findings: Finding[];
  verifiedBeneficiaries: Array<{ clabe: string; verifiedAt: string }>;
}

/** How many invoices of a supplier's history one answer carries. */
const SUPPLIER_HISTORY_LIMIT = 6;

const GET_SUPPLIER: ToolDefinition = {
  tool: "get_supplier",
  declaration: {
    name: "get_supplier",
    description:
      "The history of one supplier: how long the company has been buying from it, the accounts it has been paid on before with how many times each was used, the most recent invoices and payment complements, and any findings about the supplier itself. Use it for questions about whether an account is new, how much the company pays this supplier, or how long the relationship has existed.",
    parameters: {
      type: "OBJECT",
      properties: {
        rfc: {
          type: "STRING",
          description: "The supplier RFC, for example SYN010101AAA.",
        },
      },
      required: ["rfc"],
    },
  },
  async run(args, api) {
    const rfc = stringArg(args, "rfc");
    if (!rfc.ok) {
      return rfc;
    }
    const answer = await read<SupplierPayload>(
      api,
      `/api/v1/suppliers/${encodeURIComponent(rfc.value)}`,
    );
    if (!answer.ok) {
      return answer;
    }
    const detail = answer.body;
    const result: Record<string, EvidenceValue> = {
      rfc: detail.supplier.rfc,
      legalName: detail.supplier.legalName,
      firstInvoiceAt: detail.supplier.firstInvoiceAt,
      cfdis: detail.cfdis.length,
      complements: detail.complements.length,
      knownAccounts: detail.supplier.knownAccounts.length,
      verifiedBeneficiaries: detail.verifiedBeneficiaries.length,
    };
    if (detail.supplier.delayCostPerDay !== undefined) {
      result.delayCostPerDay = detail.supplier.delayCostPerDay;
    }
    detail.supplier.knownAccounts
      .slice(0, SUPPLIER_HISTORY_LIMIT)
      .forEach((account, index) => {
        const tag = `account.${index + 1}`;
        result[`${tag}.clabeLast4`] = maskClabe(account.clabe);
        result[`${tag}.establishedBy`] = account.establishedBy;
        result[`${tag}.establishedAt`] = account.establishedAt;
        result[`${tag}.timesPaid`] = account.timesPaid;
      });
    detail.cfdis.slice(0, SUPPLIER_HISTORY_LIMIT).forEach((cfdi, index) => {
      result[`cfdi.${index + 1}.issuedAt`] = cfdi.issuedAt;
      result[`cfdi.${index + 1}.total`] = cfdi.total;
    });
    const supplierFindings = detail.findings.filter(
      (finding) => finding.subject.kind === "supplier",
    );
    for (const [key, value] of Object.entries(
      findingsBlock(supplierFindings),
    )) {
      result[key] = value;
    }
    return { ok: true, result };
  },
};

interface VerificationPayload {
  instructionId: string;
  state: string;
  rail: string | null;
  claveRastreo: string | null;
  centSentAt: string | null;
  cepAt: string | null;
  sealState: string | null;
  holderName: string | null;
  legalName: string | null;
  nameMatch: string | null;
  updatedAt: string;
}

const GET_VERIFICATION: ToolDefinition = {
  tool: "get_verification",
  declaration: {
    name: "get_verification",
    description:
      "Where the one-cent beneficiary verification of an instruction stands: whether the centavo was sent, whether a Banxico CEP has been found for it, whether its seal was checked, and whether the account holder name matches the supplier's legal name. state not_started is a real answer and means the check has not been run yet.",
    parameters: {
      type: "OBJECT",
      properties: {
        instructionId: { type: "STRING", description: "The instruction id." },
      },
      required: ["instructionId"],
    },
  },
  async run(args, api) {
    const id = stringArg(args, "instructionId");
    if (!id.ok) {
      return id;
    }
    const answer = await read<VerificationPayload>(
      api,
      `/api/v1/instructions/${encodeURIComponent(id.value)}/verification`,
    );
    if (!answer.ok) {
      return answer;
    }
    const state = answer.body;
    const result: Record<string, EvidenceValue> = {
      instructionId: state.instructionId,
      state: state.state,
      updatedAt: state.updatedAt,
    };
    /* Nulls are dropped rather than sent as "null": a field that has no value yet
       is one the answer must not describe, and a model reading `sealState: null`
       has been known to write "the seal is null". */
    const optional: Record<string, string | null> = {
      rail: state.rail,
      claveRastreo: state.claveRastreo,
      centSentAt: state.centSentAt,
      cepAt: state.cepAt,
      sealState: state.sealState,
      holderName: state.holderName,
      legalName: state.legalName,
      nameMatch: state.nameMatch,
    };
    for (const [key, value] of Object.entries(optional)) {
      if (value !== null) {
        result[key] = value;
      }
    }
    return { ok: true, result };
  },
};

interface ExecutionPayload {
  runId: string;
  totals: Record<string, number>;
  lines: Array<{
    instructionId: string;
    state: string;
    amount: number;
    claveRastreo?: string;
    reason?: string;
  }>;
}

/** How many execution lines one answer carries. */
const EXECUTION_LINE_LIMIT = 12;

const GET_EXECUTION: ToolDefinition = {
  tool: "get_execution",
  declaration: {
    name: "get_execution",
    description:
      "What a payment run did on the payment rail: how many lines were queued, sent, settled, failed or cancelled, in counts and in pesos, and the clave de rastreo of each line that left. Use the run id, or the word current.",
    parameters: {
      type: "OBJECT",
      properties: {
        runId: {
          type: "STRING",
          description: "The run id, or current for this week's run.",
        },
      },
      required: ["runId"],
    },
  },
  async run(args, api) {
    const runId = stringArg(args, "runId");
    if (!runId.ok) {
      return runId;
    }
    const answer = await read<ExecutionPayload>(
      api,
      `/api/v1/run/${encodeURIComponent(runId.value)}/execution`,
    );
    if (!answer.ok) {
      return answer;
    }
    const execution = answer.body;
    const result: Record<string, EvidenceValue> = {
      runId: execution.runId,
      lines: execution.lines.length,
    };
    for (const [key, value] of Object.entries(execution.totals ?? {})) {
      result[`totals.${key}`] = value;
    }
    execution.lines.slice(0, EXECUTION_LINE_LIMIT).forEach((line, index) => {
      const tag = `line.${index + 1}`;
      result[`${tag}.instructionId`] = line.instructionId;
      result[`${tag}.state`] = line.state;
      result[`${tag}.amount`] = line.amount;
      if (line.claveRastreo !== undefined) {
        result[`${tag}.claveRastreo`] = line.claveRastreo;
      }
      if (line.reason !== undefined) {
        result[`${tag}.reason`] = line.reason;
      }
    });
    return { ok: true, result };
  },
};

interface ReceiptPayload {
  id: string;
  instructionId: string;
  amount: number;
  claveRastreo: string;
  [key: string]: unknown;
}

const GET_RECEIPT: ToolDefinition = {
  tool: "get_receipt",
  declaration: {
    name: "get_receipt",
    description:
      "The receipt of one payment that was sent, by its receipt id. It carries the amount, the clave de rastreo and the evidence the payment produced.",
    parameters: {
      type: "OBJECT",
      properties: {
        receiptId: {
          type: "STRING",
          description:
            "The receipt id, which an execution line carries as receiptId.",
        },
      },
      required: ["receiptId"],
    },
  },
  async run(args, api) {
    const receiptId = stringArg(args, "receiptId");
    if (!receiptId.ok) {
      return receiptId;
    }
    const answer = await read<ReceiptPayload>(
      api,
      `/api/v1/payments/${encodeURIComponent(receiptId.value)}/receipt`,
    );
    if (!answer.ok) {
      return answer;
    }
    /* The receipt is the one payload whose shape is still landing in issue #196,
       so it is masked and flattened generically rather than projected field by
       field: a tool that named fields that do not exist yet would answer nothing
       the day they do. */
    return { ok: true, result: flatten(maskDeep(answer.body)) };
  },
};

interface SatLookupPayload {
  rfc: string;
  listed: boolean;
  entries: Array<{
    listVersion: string;
    situation: string;
    publishedAt: string;
  }>;
  effective?: { situation: string; publishedAt: string; listVersion: string };
  source: { listVersion: string; retrievedAt: string; taxpayers: number };
  lists?: Array<{
    article: string;
    answered: boolean;
    listed?: boolean;
    coverage?: string;
    note?: string;
    entries: unknown[];
  }>;
}

const SAT_LOOKUP: ToolDefinition = {
  tool: "sat_lookup",
  declaration: {
    name: "sat_lookup",
    description:
      "Looks one RFC up on both SAT lists: article 69-B, which this server holds as a dated download, and article 49 Bis, which the SAT publishes one oficio at a time with no machine-readable file. The answer says which list could answer. An empty answer on 49 Bis is never no esta listado, because nobody loaded that list.",
    parameters: {
      type: "OBJECT",
      properties: {
        rfc: { type: "STRING", description: "The RFC to look up." },
      },
      required: ["rfc"],
    },
  },
  async run(args, api) {
    const rfc = stringArg(args, "rfc");
    if (!rfc.ok) {
      return rfc;
    }
    const answer = await read<SatLookupPayload>(
      api,
      `/api/v1/sat/lookup?rfc=${encodeURIComponent(rfc.value)}`,
    );
    if (!answer.ok) {
      return answer;
    }
    const lookup = answer.body;
    const result: Record<string, EvidenceValue> = {
      rfc: lookup.rfc,
      listed: lookup.listed,
      rows: lookup.entries.length,
      "source.listVersion": lookup.source.listVersion,
      "source.retrievedAt": lookup.source.retrievedAt,
      "source.taxpayers": lookup.source.taxpayers,
    };
    if (lookup.effective !== undefined) {
      result["effective.situation"] = lookup.effective.situation;
      result["effective.publishedAt"] = lookup.effective.publishedAt;
      result["effective.listVersion"] = lookup.effective.listVersion;
    }
    /* Both lists, including the one that cannot answer. `answered: false` is the
       point of that block: an answer that rounded it to "no esta listado" would
       claim a check nobody ran. */
    for (const block of lookup.lists ?? []) {
      const tag = `list.${block.article}`;
      result[`${tag}.answered`] = block.answered;
      result[`${tag}.rows`] = block.entries.length;
      if (block.listed !== undefined) {
        result[`${tag}.listed`] = block.listed;
      }
      if (block.coverage !== undefined) {
        result[`${tag}.coverage`] = block.coverage;
      }
      if (block.note !== undefined) {
        result[`${tag}.note`] = block.note;
      }
    }
    return { ok: true, result };
  },
};

interface ConsortiumPayload {
  rfc: string;
  clabe: string;
  network: Record<string, unknown>;
}

/**
 * The network signal, asked for by instruction and never by account number.
 *
 * The endpoint in docs/09-api.md takes the RFC and the full CLABE, and the model
 * holds neither: every account it has ever seen came back masked to four digits,
 * because that is what `mask.ts` does on the way out. A tool that asked it for
 * eighteen digits would be a tool it could only answer by inventing them, which is
 * the exact failure the mask exists to prevent. So the pair is resolved here, out of
 * the instruction the clerk is asking about, and the account goes from this process
 * to our own endpoint without ever having been outside it.
 */
const CONSORTIUM_SIGNAL: ToolDefinition = {
  tool: "consortium_signal",
  declaration: {
    name: "consortium_signal",
    description:
      "What the SentryOne consortium holds about the account one instruction pays: how many other companies have paid it, since when, and whether any of them reported it. Read from this tenant's local snapshot and never from the warehouse, and it answers counts and dates about a hashed pair, never a name, an amount or another company's identity. A server without the consortium configured says it is not available, which is not the same as the network having seen nothing.",
    parameters: {
      type: "OBJECT",
      properties: {
        instructionId: {
          type: "STRING",
          description:
            "The instruction whose beneficiary account the network should be asked about. The account is resolved here; never send digits.",
        },
      },
      required: ["instructionId"],
    },
  },
  async run(args, api) {
    const id = stringArg(args, "instructionId");
    if (!id.ok) {
      return id;
    }
    const detail = await read<InstructionPayload>(
      api,
      `/api/v1/instructions/${encodeURIComponent(id.value)}`,
    );
    if (!detail.ok) {
      return detail;
    }
    const { supplierRfc, clabe } = detail.body.instruction;
    const answer = await read<ConsortiumPayload>(
      api,
      `/api/v1/consortium/signal?rfc=${encodeURIComponent(supplierRfc)}&clabe=${encodeURIComponent(clabe)}`,
    );
    if (!answer.ok) {
      return answer;
    }
    return {
      ok: true,
      result: {
        instructionId: id.value,
        rfc: answer.body.rfc,
        clabeLast4: maskClabe(answer.body.clabe),
        ...flatten(maskDeep(answer.body.network), "network"),
      },
    };
  },
};

interface MetricsPayload {
  cases: number;
  truePositives: number;
  falsePositives: number;
  falseNegatives: number;
  precision: number;
  recall: number;
  falsePositiveRate: number;
}

const GET_METRICS: ToolDefinition = {
  tool: "get_metrics",
  declaration: {
    name: "get_metrics",
    description:
      "The blind evaluation of the six controls against labelled cases nobody on the detector side saw: how many cases, precision, recall and the false-positive rate. Use it when the question is how well the controls work or how the product was measured. These are the detectors' numbers and they are never a level or a probability about one payment.",
    parameters: { type: "OBJECT", properties: {} },
  },
  async run(_args, api) {
    const answer = await read<MetricsPayload>(api, "/api/v1/metrics");
    if (!answer.ok) {
      return answer;
    }
    const metrics = answer.body;
    return {
      ok: true,
      result: {
        cases: metrics.cases,
        truePositives: metrics.truePositives,
        falsePositives: metrics.falsePositives,
        falseNegatives: metrics.falseNegatives,
        precision: metrics.precision,
        recall: metrics.recall,
        falsePositiveRate: metrics.falsePositiveRate,
      },
    };
  },
};

/**
 * Flattens an already-masked JSON value into evidence chips.
 *
 * Objects and arrays become dotted keys and anything that is not a primitive is
 * dropped rather than stringified, because a chip holding `[object Object]` is a
 * chip that teaches the model nothing and costs tokens.
 */
function flatten(value: unknown, parent = ""): Record<string, EvidenceValue> {
  const flat: Record<string, EvidenceValue> = {};
  const walk = (node: unknown, path: string): void => {
    if (
      typeof node === "string" ||
      typeof node === "number" ||
      typeof node === "boolean"
    ) {
      flat[path] = node;
      return;
    }
    if (Array.isArray(node)) {
      node.forEach((item, index) => {
        walk(item, `${path}.${index + 1}`);
      });
      return;
    }
    if (node !== null && typeof node === "object") {
      for (const [key, item] of Object.entries(node)) {
        walk(item, path === "" ? key : `${path}.${key}`);
      }
    }
  };
  walk(value, parent);
  return flat;
}

/** Every read tool, in the order the system prompt introduces them. */
export const READ_TOOLS: readonly ToolDefinition[] = [
  GET_RUN,
  GET_INSTRUCTION,
  GET_SUPPLIER,
  GET_VERIFICATION,
  GET_EXECUTION,
  GET_RECEIPT,
  SAT_LOOKUP,
  CONSORTIUM_SIGNAL,
  GET_METRICS,
];

export const READ_TOOLS_BY_NAME: Readonly<Record<string, ToolDefinition>> =
  Object.fromEntries(READ_TOOLS.map((tool) => [tool.declaration.name, tool]));
