/**
 * The model behind the panel, and the seam that keeps it out of the suite.
 *
 * `AssistantModel` is one method. Everything above it in this folder, the tools,
 * the masking, the proposals, the ledger and the cost arithmetic, is driven through
 * this interface, so `bun test` runs the whole turn against `scriptedModel` with no
 * key and no socket, and `bun run eval:assistant --live` runs the identical code
 * against Gemini. That is the property that makes the assistant testable at all: a
 * panel whose only implementation reaches a third party is a panel nobody can
 * assert on at 04:00.
 *
 * The transport reuses `@hackmty/extract`: the base URL, the model id from
 * `GEMINI_MODEL`, the timeout and the key-redaction discipline all come from the
 * one package in this repository that is allowed to talk to a model. What is new
 * here is function calling, which `generateJson` does not do: that function asks
 * for JSON against a fixed schema because transcription has a fixed shape, and a
 * conversation has round trips instead.
 *
 * Three choices worth defending.
 *
 * **Not a streaming provider call.** The turn streams to the browser, the provider
 * call does not. A function-calling turn is several round trips and the tokens a
 * client cares about are the final answer's, so the loop in `turn.ts` emits the
 * answer in chunks as it writes it out. It is honest in the comment rather than
 * dressed up: the `token` events are our chunking of a complete answer, the
 * `tool_call` and `tool_result` events are live, and `done` is the stored turn.
 *
 * **Temperature zero.** The same question has to give the same tool call on the
 * rehearsal and at the table, and the eval in `scripts/eval-assistant.ts` only
 * means something against a deterministic setting.
 *
 * **No `responseMimeType`.** JSON mode and function calling are mutually exclusive
 * at the provider, and the shape that matters here is the function call, which the
 * provider returns as structure either way.
 */

import {
  GEMINI_BASE_URL,
  GEMINI_MODEL,
  GEMINI_TIMEOUT_MS,
  type HttpLike,
  hasApiKey,
  readEnv,
} from "@hackmty/extract";
import type { TokenCount } from "./cost";

/* -------------------------------------------------------------------------- */
/* The wire shapes                                                             */
/* -------------------------------------------------------------------------- */

/** The slice of the provider's schema dialect a tool declaration needs. */
export interface ModelSchema {
  type: "OBJECT" | "ARRAY" | "STRING" | "NUMBER" | "INTEGER" | "BOOLEAN";
  description?: string;
  properties?: Record<string, ModelSchema>;
  required?: readonly string[];
  items?: ModelSchema;
  enum?: readonly string[];
}

export interface ModelFunctionDeclaration {
  name: string;
  description: string;
  parameters: ModelSchema;
}

/**
 * One part of one turn, and `thoughtSignature` is the field that is easy to miss.
 *
 * Gemini 3 attaches an opaque signature to the parts of a turn that used thinking,
 * and a conversation that replays a `functionCall` without it is refused outright:
 * `400 Function call is missing a thought_signature in functionCall parts`. So the
 * signature is on the type, the reader keeps it, and `turn.ts` replays the model's
 * own parts verbatim rather than rebuilding them. It is opaque to us and it is never
 * shown, logged or stored.
 * https://ai.google.dev/gemini-api/docs/thought-signatures
 */
export type ModelPart =
  | { text: string; thoughtSignature?: string }
  | {
      functionCall: { name: string; args: Record<string, unknown> };
      thoughtSignature?: string;
    }
  | { functionResponse: { name: string; response: Record<string, unknown> } };

export interface ModelContent {
  role: "user" | "model";
  parts: ModelPart[];
}

export interface ModelRequest {
  /** Written by this repository, never by a caller's data. */
  system: string;
  contents: ModelContent[];
  tools: readonly ModelFunctionDeclaration[];
}

export interface ModelToolCall {
  name: string;
  args: Record<string, unknown>;
}

export interface ModelAnswer {
  /** Prose the model wrote this round. Empty on a round that only called tools. */
  text: string;
  /** The tools it asked for. Empty on the round that answers. */
  calls: ModelToolCall[];
  /**
   * The parts exactly as they came back, for the caller to replay on the next round.
   *
   * Replayed rather than rebuilt, because `thoughtSignature` rides on the part and a
   * rebuilt `functionCall` loses it, which the provider refuses with a 400. Keeping
   * the raw parts also means a field the provider adds later survives a round trip
   * with no change here.
   */
  parts: ModelPart[];
  usage: TokenCount;
}

/**
 * What the panel talks to. One method, so a fake is four lines and the real one is
 * the only thing in this folder that knows a network exists.
 */
export interface AssistantModel {
  /** False on a server with no key, which is how the route answers 422. */
  readonly available: boolean;
  /** The model id, for `AssistantUsage.model` and for the 422 message. */
  readonly model: string;
  generate(request: ModelRequest): Promise<ModelAnswer>;
}

export class AssistantModelError extends Error {
  readonly code:
    | "missing_api_key"
    | "http_error"
    | "blocked"
    | "bad_response"
    | "timeout";
  /** Provider response text, truncated and key-redacted. */
  readonly detail: string;

  constructor(code: AssistantModelError["code"], message: string, detail = "") {
    super(message);
    this.name = "AssistantModelError";
    this.code = code;
    this.detail = detail;
  }
}

/* -------------------------------------------------------------------------- */
/* The server with no key                                                      */
/* -------------------------------------------------------------------------- */

export const NO_MODEL_KEY =
  "This server holds no GEMINI_API_KEY, so the assistant panel is not available here. Every other endpoint answers normally.";

/**
 * The model a server with no key gets. It refuses, which is the behaviour
 * docs/09-api.md promises with a 422 naming the variable, and the behaviour CI
 * exercises because the test app pins this one.
 */
export const UNAVAILABLE_MODEL: AssistantModel = {
  available: false,
  model: GEMINI_MODEL,
  generate: () => {
    throw new AssistantModelError("missing_api_key", NO_MODEL_KEY);
  },
};

/* -------------------------------------------------------------------------- */
/* The fake, for tests and for the offline eval                                */
/* -------------------------------------------------------------------------- */

/** One round of a scripted conversation: what the model would answer. */
export interface ScriptedRound {
  text?: string;
  calls?: ModelToolCall[];
  usage?: Partial<TokenCount>;
}

export interface ScriptedModel extends AssistantModel {
  /** Every request the turn made, so a test can assert on what left. */
  readonly requests: ModelRequest[];
}

/**
 * A model that answers from a script, in order.
 *
 * It is not a mock of the provider: it is the contract of `AssistantModel` with a
 * recorded plan behind it, which is what lets one test drive a two-round
 * tool-calling turn and then assert on the ledger, the mask and the cost without a
 * network. A script that runs out answers with empty prose rather than throwing, so
 * a turn that loops more than expected fails on the assertion instead of on a stack
 * trace nobody can read.
 */
export function scriptedModel(
  rounds: readonly ScriptedRound[],
  model = GEMINI_MODEL,
): ScriptedModel {
  const requests: ModelRequest[] = [];
  let index = 0;

  return {
    available: true,
    model,
    requests,
    async generate(request) {
      requests.push(request);
      const round = rounds[index++] ?? { text: "" };
      const promptTokens = round.usage?.promptTokens ?? 0;
      const outputTokens = round.usage?.outputTokens ?? 0;
      const calls = round.calls ?? [];
      const text = round.text ?? "";
      return {
        text,
        calls,
        /* The same parts a provider would have sent, so the turn replays the fake
           exactly as it replays the real one. */
        parts: [
          ...(text === "" ? [] : [{ text }]),
          ...calls.map((call) => ({
            functionCall: { name: call.name, args: call.args },
          })),
        ],
        usage: {
          promptTokens,
          outputTokens,
          totalTokens: round.usage?.totalTokens ?? promptTokens + outputTokens,
        },
      };
    },
  };
}

/* -------------------------------------------------------------------------- */
/* Gemini                                                                      */
/* -------------------------------------------------------------------------- */

/** Output budget for one round. Generous: an answer plus a tool call is small. */
export const MAX_OUTPUT_TOKENS = 2048;

/** How much of a provider error body is carried into an exception. */
const MAX_DETAIL = 400;

export interface GeminiAssistantOptions {
  /** Defaults to the platform `fetch`. The tests pass a stub. */
  http?: HttpLike;
  /** Defaults to `GEMINI_API_KEY` in the environment. */
  apiKey?: string;
  model?: string;
  baseUrl?: string;
  /** 0 disables the timeout. */
  timeoutMs?: number;
  maxOutputTokens?: number;
}

interface GenerateContentResponse {
  candidates?: Array<{
    content?: { parts?: ModelPart[] };
    finishReason?: string;
  }>;
  promptFeedback?: { blockReason?: string };
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    thoughtsTokenCount?: number;
    totalTokenCount?: number;
  };
}

const REFUSAL_REASONS = new Set([
  "SAFETY",
  "RECITATION",
  "BLOCKLIST",
  "PROHIBITED_CONTENT",
  "SPII",
  "IMAGE_SAFETY",
]);

/** Never let a key reach a log, an error envelope or a PR body. */
function redact(text: string, apiKey: string): string {
  const clipped = text.slice(0, MAX_DETAIL);
  return apiKey === "" ? clipped : clipped.split(apiKey).join("[redacted]");
}

/**
 * The request body, exported so a test can assert on exactly what leaves without
 * a request going anywhere.
 *
 * This is the assertion the privacy claim rests on, the same way
 * `buildRequestBody` in `@hackmty/extract` carries it for the extraction half.
 * `mask.ts` is what rewrote the values; this function only arranges them.
 */
export function buildAssistantRequestBody(
  request: ModelRequest,
  maxOutputTokens: number,
): Record<string, unknown> {
  return {
    systemInstruction: { parts: [{ text: request.system }] },
    contents: request.contents,
    tools: [{ functionDeclarations: request.tools }],
    toolConfig: { functionCallingConfig: { mode: "AUTO" } },
    generationConfig: {
      /* The same question has to route to the same tool on the rehearsal and at
         the table, which is also the only setting the eval can measure. */
      temperature: 0,
      maxOutputTokens,
    },
  };
}

/**
 * The real model. One POST to `generateContent` per round trip.
 *
 * The key travels in the `x-goog-api-key` header and not in the query string, so
 * it cannot end up in a proxy log or in a screenshot of a URL, which is the rule
 * `packages/extract/src/gemini.ts` already set.
 */
export function geminiAssistantModel(
  options: GeminiAssistantOptions = {},
): AssistantModel {
  const apiKey = options.apiKey ?? readEnv("GEMINI_API_KEY") ?? "";
  const model = options.model ?? GEMINI_MODEL;
  const baseUrl = (options.baseUrl ?? GEMINI_BASE_URL).replace(/\/+$/, "");
  const timeoutMs = options.timeoutMs ?? GEMINI_TIMEOUT_MS;
  const maxOutputTokens = options.maxOutputTokens ?? MAX_OUTPUT_TOKENS;
  const http = options.http ?? fetch;

  return {
    available: hasApiKey(apiKey),
    model,
    async generate(request) {
      if (!hasApiKey(apiKey)) {
        throw new AssistantModelError("missing_api_key", NO_MODEL_KEY);
      }

      const init: RequestInit = {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify(
          buildAssistantRequestBody(request, maxOutputTokens),
        ),
      };
      if (timeoutMs > 0) {
        init.signal = AbortSignal.timeout(timeoutMs);
      }

      let response: Response;
      try {
        response = await http(
          `${baseUrl}/models/${model}:generateContent`,
          init,
        );
      } catch (error) {
        /* A timeout is not a bug in the request, and the clerk is standing at the
           screen: say which one it was so the panel can offer to ask again. */
        const timedOut =
          error instanceof Error &&
          (error.name === "TimeoutError" || error.name === "AbortError");
        throw new AssistantModelError(
          timedOut ? "timeout" : "http_error",
          timedOut
            ? `the model did not answer within ${timeoutMs} ms`
            : "the model API could not be reached",
        );
      }

      const text = await response.text();
      if (!response.ok) {
        throw new AssistantModelError(
          "http_error",
          `the model API answered ${response.status}`,
          redact(text, apiKey),
        );
      }

      return readAnswer(text, apiKey);
    },
  };
}

function readAnswer(text: string, apiKey: string): ModelAnswer {
  let envelope: GenerateContentResponse;
  try {
    envelope = JSON.parse(text) as GenerateContentResponse;
  } catch {
    throw new AssistantModelError(
      "bad_response",
      "the model API answered with something that is not JSON",
      redact(text, apiKey),
    );
  }

  const blockReason = envelope.promptFeedback?.blockReason;
  if (blockReason !== undefined) {
    throw new AssistantModelError(
      "blocked",
      `the model refused to answer: ${blockReason}`,
    );
  }

  const candidate = envelope.candidates?.[0];
  if (candidate === undefined) {
    throw new AssistantModelError(
      "bad_response",
      "the model API answered with no candidate",
      redact(text, apiKey),
    );
  }

  const finishReason = candidate.finishReason ?? "STOP";
  if (REFUSAL_REASONS.has(finishReason)) {
    throw new AssistantModelError(
      "blocked",
      `the model stopped without an answer: ${finishReason}`,
    );
  }

  const parts = candidate.content?.parts ?? [];
  const prose = parts
    .map((part) => ("text" in part ? part.text : ""))
    .join("")
    .trim();
  const calls: ModelToolCall[] = [];
  for (const part of parts) {
    if ("functionCall" in part) {
      calls.push({
        name: part.functionCall.name,
        args: part.functionCall.args ?? {},
      });
    }
  }

  if (prose === "" && calls.length === 0) {
    throw new AssistantModelError(
      "bad_response",
      finishReason === "MAX_TOKENS"
        ? "the output budget ran out before the model wrote anything"
        : "the model returned an empty answer",
      redact(text, apiKey),
    );
  }

  const usage = envelope.usageMetadata ?? {};
  /* Thinking tokens are billed as output, so they are counted as output. A cost
     line that quietly dropped them would understate the panel by the one figure
     the provider charges most for. */
  const outputTokens =
    (usage.candidatesTokenCount ?? 0) + (usage.thoughtsTokenCount ?? 0);

  const promptTokens = usage.promptTokenCount ?? 0;

  return {
    text: prose,
    calls,
    /* Verbatim, signatures included. See the comment on `ModelPart`. */
    parts,
    usage: {
      promptTokens,
      outputTokens,
      totalTokens: usage.totalTokenCount ?? promptTokens + outputTokens,
    },
  };
}

/**
 * The model this process boots with: the real one when a key is configured, the
 * refusing one otherwise.
 *
 * Read once at wiring time, like the extractor, so a request is never the thing
 * that discovers the server is misconfigured.
 */
export function createAssistantModel(
  options: GeminiAssistantOptions = {},
): AssistantModel {
  const apiKey = options.apiKey ?? readEnv("GEMINI_API_KEY");
  if (!hasApiKey(apiKey)) {
    return UNAVAILABLE_MODEL;
  }
  return geminiAssistantModel({ ...options, apiKey });
}
