/**
 * The assistant panel's half of ADR-0007, in the one file that can enforce it.
 *
 * The panel is a language model inside a payments product, which is the exact
 * architecture ADR-0004 refused to put in the decision path, so the boundary is
 * code here rather than a paragraph somewhere. Three properties, and each one is a
 * function below that a test drives with no network.
 *
 * 1. **A tool call that writes cannot reach the screen.** `decodeToolCall` refuses
 *    any frame whose `tool` is not one of the seven reads in `AssistantTool` and
 *    any frame whose `readOnly` is not the literal `true`. The domain makes the
 *    shape unrepresentable in TypeScript; this makes it unrenderable at runtime,
 *    which is the half that matters when the bytes come off a socket.
 * 2. **No verdict a model wrote reaches the screen.** `forbiddenVerdict` reads the
 *    sentence for the word "seguro" in either language and for a probability, a
 *    percentage or a score, which ADR-0009 forbids on any screen of this product.
 *    A turn that carries one is dropped and counted rather than rendered, and the
 *    panel says how many it dropped: an assistant that quietly lost a frame would
 *    be answering from its own memory.
 * 3. **Nothing executes itself.** `confirmProposal` is the only function here that
 *    writes, it is called from a click handler and from nowhere else, and it sends
 *    `X-Actor`. The body it posts is the proposal's own `payload`, field for field,
 *    with one substitution: where the endpoint names a person (`decidedBy`,
 *    `recordedBy`) the name is taken from the actor who pressed the button, because
 *    docs/09-api.md refuses a body and a header that disagree about who acted, and
 *    a decision signed by one name under another is a record nobody can rely on.
 *
 * What is deliberately not here: `execute_run`. The payment run leaves through
 * `POST /api/v1/run/:id/execute`, which answers its own stream of one event per
 * payment, and the screen that follows that stream is the payment run. A second
 * client for it inside the drawer would be two places that know how money leaves,
 * so the panel shows the proposal and hands off to that screen. `proposalHandoff`
 * is that decision, stated once.
 */

import type {
  ActionProposal,
  Actor,
  AssistantTool,
  AssistantToolCall,
  EvidenceValue,
  ProposalKind,
  ProposalValue,
} from "@hackmty/core";
import {
  type ApiResult,
  ASSISTANT_MESSAGES_PATH,
  createInstruction,
  decideInstruction,
  type RequestOptions,
  streamSse,
  verifyAccount,
  verifyCall,
} from "./api";
import type {
  AssistantImage,
  AssistantMessage,
  AssistantStreamEvent,
  AssistantTurnBody,
  DecideResult,
  InstructionDetail,
  VerificationState,
  VerifyCallBody,
  VerifyCallResult,
} from "./contract";
import { EVIDENCE_LABELS } from "./evidence";
import { formatDecimal } from "./format";
import type { SseFrame } from "./sse";

/* ------------------------------------------------------------------ the copy */

/**
 * The questions the clerk actually asks, as buttons.
 *
 * They are here and not in the component because they are the product's opinion
 * about what this panel is for: why a line is red, what to tell the owner about
 * the week, and what we have paid this supplier before. `docs/02-persona.md` has
 * all three as sentences Lupita says out loud.
 *
 * The first one carries no folio. The panel appends the one that is open, so the
 * button reads the same on every line and the turn names the line it is about,
 * which is what the API needs to read the right instruction.
 */
export const QUICK_PROMPTS: readonly string[] = [
  "Por que esta en rojo",
  "Resumen de la semana para el dueno",
  "Historial con este proveedor",
];

/** The label a turn with no folio of its own gets in the conversation. */
export const IMAGE_TURN_TEXT =
  "Te paso la captura que me llego. Que dice de la cuenta?";

/* ------------------------------------------------------- the vocabulary rule */

const FORBIDDEN_WORDS: readonly string[] = ["seguro", "segura", "safe"];

/**
 * The one sentence this product may not say, whoever wrote it.
 *
 * Returns what was found, so the panel and the test can both name it. The word
 * boundary matters: "aseguro" and "asegurado" are ordinary Spanish and not a
 * verdict, so the check is on the word and not on the substring, which is the
 * bug the first version of this had. A hyphen counts as part of the word for the
 * same reason in the other direction: `env(safe-area-inset-bottom)` is the CSS
 * that keeps a button off the home indicator of an iPhone, and a guard that read
 * it as a promise about a transfer would be a guard nobody could keep.
 *
 * The numeric half is ADR-0009 too: a percentage, a `0.73` style probability or
 * the word itself next to a payment is a precision nobody earned, because the
 * expected-loss arithmetic says in its own comment that it is an upper bound on
 * the evidence and not a calibrated probability. A peso amount is not a score and
 * is not matched: `38,417.48 MXN` is a fact on an invoice.
 */
export function forbiddenVerdict(text: string): string | null {
  const lowered = text.toLowerCase();

  for (const word of FORBIDDEN_WORDS) {
    if (new RegExp(`(^|[^a-zñáéíóú-])${word}($|[^a-zñáéíóú-])`).test(lowered)) {
      return word;
    }
  }

  if (/\d\s?%/.test(lowered)) {
    return "un porcentaje";
  }

  if (/probabilidad|probability/.test(lowered)) {
    return "una probabilidad";
  }

  return null;
}

/* ---------------------------------------------------------------- decoding */

const TOOLS: readonly AssistantTool[] = [
  "get_run",
  "get_instruction",
  "get_verification",
  "get_execution",
  "get_receipt",
  "sat_lookup",
  "consortium_signal",
];

const KINDS: readonly ProposalKind[] = [
  "verify_account",
  "verify_call",
  "decide",
  "execute_run",
  "intake",
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isProposalValue(value: unknown): value is ProposalValue {
  return (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  );
}

function isEvidenceValue(value: unknown): value is EvidenceValue {
  return isProposalValue(value) || isRecord(value);
}

/**
 * One read, or nothing.
 *
 * `readOnly !== true` is the line that carries ADR-0007 at runtime. A server that
 * sent a tool call claiming to write would be refused here rather than drawn as a
 * card, and the panel counts the refusal.
 */
export function decodeToolCall(value: unknown): AssistantToolCall | null {
  if (!isRecord(value)) {
    return null;
  }

  const { id, tool, arguments: args, at, readOnly, result, error } = value;

  if (typeof id !== "string" || typeof at !== "string") {
    return null;
  }
  if (typeof tool !== "string" || !TOOLS.includes(tool as AssistantTool)) {
    return null;
  }
  if (readOnly !== true || !isRecord(args)) {
    return null;
  }

  const call: AssistantToolCall = {
    id,
    tool: tool as AssistantTool,
    arguments: Object.fromEntries(
      Object.entries(args).filter(([, entry]) => isProposalValue(entry)),
    ) as Record<string, string | number | boolean>,
    at,
    readOnly: true,
  };

  if (isRecord(result)) {
    call.result = Object.fromEntries(
      Object.entries(result).filter(([, entry]) => isEvidenceValue(entry)),
    ) as Record<string, EvidenceValue>;
  }

  if (typeof error === "string") {
    call.error = error;
  }

  return call;
}

/** One offer, or nothing. A summary carrying a verdict is nothing. */
export function decodeProposal(value: unknown): ActionProposal | null {
  if (!isRecord(value)) {
    return null;
  }

  const { kind, payload, requiresRole, summary, instructionId } = value;

  if (typeof kind !== "string" || !KINDS.includes(kind as ProposalKind)) {
    return null;
  }
  if (typeof summary !== "string" || forbiddenVerdict(summary) !== null) {
    return null;
  }
  if (requiresRole !== "clerk" && requiresRole !== "owner") {
    return null;
  }
  if (!isRecord(payload)) {
    return null;
  }

  const proposal: ActionProposal = {
    kind: kind as ProposalKind,
    payload: Object.fromEntries(
      Object.entries(payload).filter(([, entry]) => isProposalValue(entry)),
    ) as Record<string, ProposalValue>,
    requiresRole,
    summary,
  };

  if (typeof instructionId === "string") {
    proposal.instructionId = instructionId;
  }

  return proposal;
}

function decodeMessage(value: unknown): AssistantMessage | null {
  if (!isRecord(value)) {
    return null;
  }

  const { id, sessionId, author, text, at } = value;

  if (typeof id !== "string" || typeof sessionId !== "string") {
    return null;
  }
  if (author !== "clerk" && author !== "assistant") {
    return null;
  }
  if (typeof text !== "string" || typeof at !== "string") {
    return null;
  }
  if (forbiddenVerdict(text) !== null) {
    return null;
  }

  const message: AssistantMessage = { id, sessionId, author, text, at };
  const calls = Array.isArray(value.toolCalls)
    ? value.toolCalls
        .map(decodeToolCall)
        .filter((call): call is AssistantToolCall => call !== null)
    : [];

  if (calls.length > 0) {
    message.toolCalls = calls;
  }

  const proposal = decodeProposal(value.proposal);
  if (proposal !== null) {
    message.proposal = proposal;
  }

  if (typeof value.instructionId === "string") {
    message.instructionId = value.instructionId;
  }

  if (Array.isArray(value.imageRefs)) {
    message.imageRefs = value.imageRefs.filter(
      (ref): ref is string => typeof ref === "string",
    );
  }

  return message;
}

/**
 * One frame of `POST /api/v1/assistant/messages`, decoded into what the panel
 * renders, or `null` when the frame does not match the contract.
 *
 * `null` is never an exception and never silent: `sendAssistantTurn` counts it and
 * the panel says how many frames it dropped, because the failure mode this guards
 * against is an answer that looks complete and is missing the read it was built
 * from.
 */
export function decodeAssistantEvent(
  frame: SseFrame,
): AssistantStreamEvent | null {
  let data: unknown;

  try {
    data = JSON.parse(frame.data);
  } catch {
    return null;
  }

  switch (frame.event) {
    case "token": {
      if (!isRecord(data) || typeof data.text !== "string") {
        return null;
      }
      if (forbiddenVerdict(data.text) !== null) {
        return null;
      }

      return typeof data.sessionId === "string"
        ? { kind: "token", text: data.text, sessionId: data.sessionId }
        : { kind: "token", text: data.text };
    }
    case "tool_call":
    case "tool_result": {
      const call = decodeToolCall(data);

      return call === null
        ? null
        : {
            kind: frame.event === "tool_call" ? "tool_call" : "tool_result",
            call,
          };
    }
    case "proposal": {
      const proposal = decodeProposal(data);

      return proposal === null ? null : { kind: "proposal", proposal };
    }
    case "done": {
      const message = decodeMessage(data);

      return message === null ? null : { kind: "done", message };
    }
    default:
      return null;
  }
}

/* ----------------------------------------------------------------- the turn */

export type AssistantTurn = {
  /** The stored turn, when the server sent `done`. */
  message: AssistantMessage | null;
  /** Frames the contract check refused. Shown, never swallowed. */
  dropped: number;
};

/**
 * One turn of the panel against the API.
 *
 * Multipart when the clerk dropped an image and JSON when she did not, which are
 * the two forms `docs/09-api.md` documents. Multipart with the `File` itself is
 * the one that matters: a phone screenshot base64 encoded in the browser is a
 * third more bytes and a main-thread stall on the device this is used on.
 */
export async function sendAssistantTurn(
  body: AssistantTurnBody,
  onEvent: (event: AssistantStreamEvent) => void,
  options: RequestOptions = {},
): Promise<ApiResult<AssistantTurn>> {
  const turn: AssistantTurn = { message: null, dropped: 0 };

  const images = body.images ?? [];
  const init =
    images.length === 0
      ? ({
          method: "POST",
          json:
            body.sessionId === undefined
              ? { text: body.text }
              : { text: body.text, sessionId: body.sessionId },
        } as const)
      : ({ method: "POST", body: formDataOf(body, images) } as const);

  const result = await streamSse(
    ASSISTANT_MESSAGES_PATH,
    init,
    (frame) => {
      const event = decodeAssistantEvent(frame);

      if (event === null) {
        turn.dropped += 1;

        return;
      }

      if (event.kind === "done") {
        turn.message = event.message;
      }

      onEvent(event);
    },
    options,
  );

  return result.ok ? { ok: true, data: turn } : result;
}

function formDataOf(
  body: AssistantTurnBody,
  images: readonly AssistantImage[],
): FormData {
  const form = new FormData();

  form.set("text", body.text);

  if (body.sessionId !== undefined) {
    form.set("sessionId", body.sessionId);
  }

  /* Repeated under one name, which is how the contract reads: "zero or more
     `images` parts". */
  for (const image of images) {
    form.append("images", image.file, image.name);
  }

  return form;
}

/* ------------------------------------------------------------- the proposal */

/**
 * The request a confirm would send, in the words of the request itself.
 *
 * The panel prints this above the button. It is the property that makes the
 * proposal honest: what is about to happen is the method and the path of an
 * ordinary endpoint of this API, with a body the clerk can read, and not an
 * instruction to a model.
 */
export interface ProposalRequest {
  method: "POST";
  path: string;
  body: Record<string, ProposalValue> | null;
}

/** The run a proposal to send the run is about. `current` is a valid id. */
function runIdOf(proposal: ActionProposal): string {
  const runId = proposal.payload.runId;

  return typeof runId === "string" && runId !== "" ? runId : "current";
}

function instructionIdOf(proposal: ActionProposal): string | null {
  if (typeof proposal.instructionId === "string") {
    return proposal.instructionId;
  }

  const fromPayload = proposal.payload.instructionId;

  return typeof fromPayload === "string" ? fromPayload : null;
}

/**
 * The body, with the person who pressed the button written into it.
 *
 * `decidedBy` and `recordedBy` are the two places an endpoint of this API names a
 * person in the body, and docs/09-api.md refuses a body that disagrees with the
 * `X-Actor` header. So the name is not taken from the proposal: it is taken from
 * whoever is at the keyboard, which is also the only name that belongs on the
 * ledger event the write appends.
 */
export function signedPayload(
  proposal: ActionProposal,
  actor: Actor,
  reason?: string,
): Record<string, ProposalValue> {
  const payload: Record<string, ProposalValue> = { ...proposal.payload };

  if ("decidedBy" in payload || proposal.kind === "decide") {
    payload.decidedBy = actor.name;
  }

  if ("recordedBy" in payload) {
    payload.recordedBy = actor.name;
  }

  const written = reason?.trim() ?? "";

  if (written !== "") {
    payload.reason = written;
  }

  return payload;
}

export function proposalRequest(
  proposal: ActionProposal,
  actor: Actor,
  reason?: string,
): ProposalRequest | null {
  const payload = signedPayload(proposal, actor, reason);
  const instructionId = instructionIdOf(proposal);

  switch (proposal.kind) {
    case "verify_account":
      return instructionId === null
        ? null
        : {
            method: "POST",
            path: `/api/v1/instructions/${instructionId}/verify-account`,
            body: null,
          };
    case "verify_call":
      return instructionId === null
        ? null
        : {
            method: "POST",
            path: `/api/v1/instructions/${instructionId}/verify-call`,
            body: payload,
          };
    case "decide":
      return instructionId === null
        ? null
        : {
            method: "POST",
            path: `/api/v1/instructions/${instructionId}/decide`,
            body: payload,
          };
    case "intake":
      return { method: "POST", path: "/api/v1/instructions", body: payload };
    case "execute_run":
      return {
        method: "POST",
        path: `/api/v1/run/${runIdOf(proposal)}/execute`,
        body: { ...payload, confirm: true },
      };
  }
}

/**
 * True for the one proposal the panel does not execute itself.
 *
 * The payment run leaves over its own stream and the payment-run screen is what
 * follows it line by line. Two clients for the one endpoint that moves money that
 * is not a cent is one too many, so the drawer shows the proposal and sends the
 * clerk to the screen that owns it.
 */
export function proposalHandoff(proposal: ActionProposal): boolean {
  return proposal.kind === "execute_run";
}

/** Does this person's role satisfy what the proposal says the click needs? */
export function roleAllows(proposal: ActionProposal, actor: Actor): boolean {
  return proposal.requiresRole === "clerk" || actor.role === "owner";
}

/**
 * True when the endpoint will refuse the write without a written reason.
 *
 * A release over a line a finding stopped is the exception the owner approves, and
 * ADR-0007 says the mitigation for a tired clerk confirming a wrong proposal is
 * that the release path demands prose. The contract makes `reason` optional, and
 * the screen is where it is asked for, because an API that refused a release with
 * no sentence would be refused by the clerk instead, outside the product, where
 * nothing is recorded at all.
 */
export function needsReason(proposal: ActionProposal): boolean {
  return proposal.kind === "decide" && proposal.payload.action === "release";
}

export type ProposalOutcome =
  | { kind: "verify_account"; verification: VerificationState }
  | { kind: "verify_call"; call: VerifyCallResult }
  /* The decide route answers `{ instruction, decision, amountAtRisk, hold }`
     and not a whole instruction detail, so this carries the shape the endpoint
     actually sends. The card reads the decision and the folio, which is all of
     it that ever reached the screen. */
  | { kind: "decide"; detail: DecideResult }
  | { kind: "intake"; detail: InstructionDetail };

/**
 * A person pressed the button. This is the only function in the panel that
 * writes, and it carries the name.
 *
 * Every branch calls the endpoint that already existed for that action, with the
 * proposal's own payload as the body: no new route, no assistant-specific write,
 * no second way to hold a payment. That is what makes the panel removable, which
 * is what makes the boundary credible.
 */
export async function confirmProposal(
  proposal: ActionProposal,
  actor: Actor,
  options: { reason?: string; signal?: AbortSignal } = {},
): Promise<ApiResult<ProposalOutcome>> {
  const { reason, signal } = options;
  const request = proposalRequest(proposal, actor, reason);

  if (request === null) {
    return {
      ok: false,
      error: {
        status: 0,
        message: "La propuesta no dice sobre que instruccion es.",
      },
    };
  }

  if (!roleAllows(proposal, actor)) {
    return {
      ok: false,
      error: {
        status: 0,
        message: "Esta excepcion la aprueba el dueno, no la capturista.",
      },
    };
  }

  const instructionId = instructionIdOf(proposal);
  const call: RequestOptions = { actor, ...(signal ? { signal } : {}) };
  const payload = signedPayload(proposal, actor, reason);

  switch (proposal.kind) {
    case "verify_account": {
      if (instructionId === null) {
        break;
      }

      /* The cent is sent by the rail and the CEP is resolved behind it, so the
         six second ceiling of a JSON route is not the right one here. */
      const result = await verifyAccount(instructionId, {
        ...call,
        timeoutMs: 20000,
      });

      return result.ok
        ? {
            ok: true,
            data: { kind: "verify_account", verification: result.data },
          }
        : result;
    }
    case "verify_call": {
      if (instructionId === null) {
        break;
      }

      const body = verifyCallBodyOf(payload);

      if (body === null) {
        return {
          ok: false,
          error: {
            status: 0,
            message:
              "La propuesta de llamada no trae el telefono ni la conversacion.",
          },
        };
      }

      const result = await verifyCall(instructionId, body, call);

      return result.ok
        ? { ok: true, data: { kind: "verify_call", call: result.data } }
        : result;
    }
    case "decide": {
      if (instructionId === null) {
        break;
      }

      const action = payload.action;

      if (action !== "hold" && action !== "verify" && action !== "release") {
        return {
          ok: false,
          error: {
            status: 0,
            message: "La propuesta no dice que decision registrar.",
          },
        };
      }

      const result = await decideInstruction(
        instructionId,
        {
          action,
          decidedBy: actor.name,
          ...(typeof payload.reason === "string"
            ? { reason: payload.reason }
            : {}),
        },
        call,
      );

      return result.ok
        ? { ok: true, data: { kind: "decide", detail: result.data } }
        : result;
    }
    case "intake": {
      const amount = Number(payload.amount);

      if (!Number.isFinite(amount) || amount <= 0) {
        return {
          ok: false,
          error: {
            status: 0,
            message:
              "La propuesta de alta no trae un importe que se pueda pagar.",
          },
        };
      }

      const result = await createInstruction(
        {
          amount,
          source:
            payload.source === "email" ||
            payload.source === "whatsapp" ||
            payload.source === "pdf" ||
            payload.source === "portal"
              ? payload.source
              : "manual",
          ...(typeof payload.clabe === "string"
            ? { clabe: payload.clabe }
            : {}),
          ...(typeof payload.supplierRfc === "string"
            ? { supplierRfc: payload.supplierRfc }
            : {}),
          ...(typeof payload.text === "string" ? { text: payload.text } : {}),
        },
        call,
      );

      return result.ok
        ? { ok: true, data: { kind: "intake", detail: result.data } }
        : result;
    }
    case "execute_run":
      return {
        ok: false,
        error: {
          status: 0,
          message:
            "La corrida se envia desde la pantalla de la corrida, donde se ve linea por linea.",
        },
      };
  }

  return {
    ok: false,
    error: {
      status: 0,
      message: "La propuesta no dice sobre que instruccion es.",
    },
  };
}

/** The three shapes `POST /api/v1/instructions/:id/verify-call` accepts. */
function verifyCallBodyOf(
  payload: Record<string, ProposalValue>,
): VerifyCallBody | null {
  if (typeof payload.toNumber === "string" && payload.toNumber !== "") {
    return { toNumber: payload.toNumber };
  }

  if (
    typeof payload.conversationId === "string" &&
    payload.conversationId !== ""
  ) {
    return { conversationId: payload.conversationId };
  }

  const outcome = payload.outcome;

  if (
    typeof outcome === "string" &&
    typeof payload.recordedBy === "string" &&
    (outcome === "confirmed" ||
      outcome === "denied" ||
      outcome === "no_answer" ||
      outcome === "unclear")
  ) {
    return {
      outcome,
      recordedBy: payload.recordedBy,
      ...(typeof payload.evidence === "string"
        ? { evidence: payload.evidence }
        : {}),
    };
  }

  return null;
}

/* -------------------------------------------------------------- tool result */

export interface ToolChip {
  key: string;
  label: string;
  value: string;
}

/**
 * A tool result, as the chips the finding panel already renders.
 *
 * `AssistantToolCall.result` is `Record<string, EvidenceValue>` and not free text,
 * which is the part of ADR-0007 that stops a model's prose arriving dressed as a
 * fact, so the panel renders it with the same dictionary the findings use:
 * `EVIDENCE_LABELS` in `./evidence.ts`. A key nobody has translated is spaced out
 * rather than hidden, because a chip that says `nearestTimesPaid` is at least a
 * fact, and a chip that is missing is evidence the screen threw away.
 */
export function toolResultChips(
  result: Record<string, EvidenceValue> | undefined,
): ToolChip[] {
  if (result === undefined) {
    return [];
  }

  const chips: ToolChip[] = [];

  for (const [key, value] of Object.entries(result)) {
    if (typeof value === "object") {
      /* The one compound evidence value the domain has is the consortium signal,
         and it is a line of its own in the finding panel rather than a chip. The
         panel shows the tool that answered and the finding carries the line. */
      continue;
    }

    chips.push({
      key,
      label: EVIDENCE_LABELS[key] ?? spacedKey(key),
      value:
        typeof value === "boolean"
          ? value
            ? "si"
            : "no"
          : typeof value === "number"
            ? formatDecimal(value)
            : value,
    });
  }

  return chips;
}

function spacedKey(key: string): string {
  return key
    .replace(/_/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .toLowerCase();
}
