/**
 * The transport half of the extraction boundary: one POST to the Gemini REST
 * endpoint `generateContent`, with the file inline and a response schema.
 *
 * This is the only file in the repository that sends anything to a model. It is
 * deliberately small and deliberately dumb, because everything a judge is
 * entitled to check about the LLM boundary is checked by reading it:
 *
 * - It sends exactly two things: one instruction string that this repo wrote,
 *   and the bytes of one file a human chose to send us. No ledger, no supplier,
 *   no CFDI, no history, no account the company has ever paid.
 * - It asks for JSON against a fixed schema, so what comes back is a
 *   transcription and not an opinion. There is no field in any schema in
 *   `extract.ts` that could carry a judgment, a score or a recommendation.
 * - `http` is injectable and defaults to the platform `fetch`. Every test in
 *   this package passes a stub, so `bun test` never opens a socket and never
 *   needs a key.
 *
 * Thinking is switched off (`thinkingBudget: 0`). Transcription needs none, it
 * doubles the latency of the intake screen, and on a small output budget the
 * thinking tokens can consume the whole allowance and return an empty answer,
 * which is the worst possible failure mode at a demo table.
 */

import { Buffer } from "node:buffer";

/** Generative Language REST API, v1beta. */
export const GEMINI_BASE_URL =
  "https://generativelanguage.googleapis.com/v1beta";

/** The model this package is written against. */
/** Default model. gemini-2.5-flash is no longer offered to new projects; GEMINI_MODEL overrides. */
export const GEMINI_MODEL = process.env.GEMINI_MODEL ?? "gemini-3.6-flash";

/** Per-request timeout. A clerk is standing at the screen; do not hang. */
export const GEMINI_TIMEOUT_MS = 20_000;

/**
 * Largest file this module will inline in a request. Inline data travels inside
 * the JSON body and base64 inflates it by a third, so this keeps the request
 * comfortably inside the provider's request ceiling. Anything larger belongs in
 * the provider's Files API, which this product deliberately does not use: a file
 * uploaded there is stored by the provider, and section 6.2 of
 * docs/06-regulatory-privacy.md promises that nothing is stored.
 */
export const MAX_INLINE_BYTES = 7_000_000;

/** How much of a provider error body is carried into an exception. */
export const MAX_DETAIL = 400;

/** Only the part of `fetch` this module uses, so a test stub is three lines. */
export type HttpLike = (input: string, init?: RequestInit) => Promise<Response>;

export type ExtractErrorCode =
  /** No `GEMINI_API_KEY` in the environment and none passed in. */
  | "missing_api_key"
  /** Zero bytes. Nothing to read. */
  | "empty_input"
  /** Larger than `MAX_INLINE_BYTES`. */
  | "too_large"
  /** A media type this module will not send. */
  | "unsupported_mime"
  /** The provider answered with a status we cannot act on. */
  | "http_error"
  /** The provider refused to read the file. */
  | "blocked"
  /** The provider answered with something that is not the JSON we asked for. */
  | "bad_response";

export class ExtractError extends Error {
  readonly code: ExtractErrorCode;
  /** Provider response text, truncated and key-redacted. */
  readonly detail: string;

  constructor(code: ExtractErrorCode, message: string, detail = "") {
    super(message);
    this.name = "ExtractError";
    this.code = code;
    this.detail = detail;
  }
}

/* -------------------------------------------------------------------------- */
/* Media types                                                                 */
/* -------------------------------------------------------------------------- */

/** Image types this module will inline. */
export const IMAGE_MIME_TYPES: readonly string[] = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/heic",
  "image/heif",
];

/**
 * Audio types this module will inline.
 *
 * The first six are the ones the provider's audio guide lists. `audio/webm` and
 * `audio/mp4` are what a browser recorder and an iPhone actually produce, and
 * they are accepted so the QR intake page does not have to transcode a voice
 * note before it can send it.
 *
 * TODO(garzario): with the key in hand, send one file of each of those last two
 * and keep them here only if the provider accepts them. If it refuses, transcode
 * to `audio/ogg` in the browser instead of silently failing at the table.
 */
export const AUDIO_MIME_TYPES: readonly string[] = [
  "audio/wav",
  "audio/mp3",
  "audio/aiff",
  "audio/aac",
  "audio/ogg",
  "audio/flac",
  "audio/webm",
  "audio/mp4",
];

/** Spellings that mean one of the accepted types under a different name. */
const MIME_ALIASES: Readonly<Record<string, string>> = {
  "image/jpg": "image/jpeg",
  "image/pjpeg": "image/jpeg",
  "audio/mpeg": "audio/mp3",
  "audio/mpeg3": "audio/mp3",
  "audio/x-mpeg-3": "audio/mp3",
  "audio/x-wav": "audio/wav",
  "audio/wave": "audio/wav",
  "audio/vnd.wave": "audio/wav",
  "audio/x-aiff": "audio/aiff",
  "audio/x-flac": "audio/flac",
  "audio/x-m4a": "audio/mp4",
  "audio/m4a": "audio/mp4",
};

/**
 * Lower-cases, drops the parameters after the semicolon and resolves the
 * aliases, so `Audio/OGG; codecs=opus` and `audio/ogg` are one type.
 */
export function normalizeMime(value: string): string {
  const bare = value.split(";")[0]?.trim().toLowerCase() ?? "";
  return MIME_ALIASES[bare] ?? bare;
}

/**
 * Normalises a media type and refuses the ones this module will not send.
 *
 * @throws ExtractError `unsupported_mime`, naming what is accepted, because the
 *   clerk who took the photo is the one who has to act on the message.
 */
export function requireMime(
  value: string,
  accepted: readonly string[],
  kind: "image" | "audio",
): string {
  const mime = normalizeMime(value);
  if (!accepted.includes(mime)) {
    throw new ExtractError(
      "unsupported_mime",
      `"${value}" is not ${kind} this module can read. Accepted: ${accepted.join(", ")}.`,
    );
  }
  return mime;
}

/**
 * The media type of a file from its first bytes, or undefined when nothing here
 * recognises it.
 *
 * The intake contract in docs/09-api.md carries base64 and no media type, so the
 * type has to come from the bytes. Reading four to twelve bytes of a magic
 * number is deterministic, testable and cannot be spoofed into sending a file
 * the model will refuse: an unrecognised header is an error at our edge rather
 * than a failed call at the provider.
 */
export function sniffMediaType(bytes: Uint8Array): string | undefined {
  const starts = (...prefix: number[]): boolean =>
    prefix.every((byte, index) => bytes[index] === byte);
  const ascii = (offset: number, text: string): boolean =>
    [...text].every(
      (character, index) => bytes[offset + index] === character.charCodeAt(0),
    );

  if (starts(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))
    return "image/png";
  if (starts(0xff, 0xd8, 0xff)) return "image/jpeg";
  if (ascii(0, "RIFF") && ascii(8, "WEBP")) return "image/webp";
  if (ascii(0, "RIFF") && ascii(8, "WAVE")) return "audio/wav";
  if (ascii(4, "ftypheic") || ascii(4, "ftypheix")) return "image/heic";
  if (ascii(4, "ftypmif1") || ascii(4, "ftypheim")) return "image/heif";
  if (ascii(4, "ftyp")) return "audio/mp4";
  if (ascii(0, "OggS")) return "audio/ogg";
  if (ascii(0, "fLaC")) return "audio/flac";
  if (ascii(0, "FORM") && ascii(8, "AIFF")) return "audio/aiff";
  if (ascii(0, "ID3")) return "audio/mp3";
  // MPEG frame sync: eleven set bits. 0xFF 0xFB and 0xFF 0xF3 are the common
  // MPEG-1 layer 3 headers of a file with no ID3 tag in front of it.
  if (bytes[0] === 0xff && (bytes[1] ?? 0) >= 0xe0) return "audio/mp3";
  if (starts(0x1a, 0x45, 0xdf, 0xa3)) return "audio/webm";
  return undefined;
}

/* -------------------------------------------------------------------------- */
/* Request                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * The slice of the OpenAPI dialect the provider accepts in `responseSchema`.
 * Type names are upper case there, which is why this is not a JSON Schema type.
 */
export interface ResponseSchema {
  type: "OBJECT" | "ARRAY" | "STRING" | "NUMBER" | "INTEGER" | "BOOLEAN";
  description?: string;
  nullable?: boolean;
  properties?: Record<string, ResponseSchema>;
  required?: readonly string[];
  propertyOrdering?: readonly string[];
  items?: ResponseSchema;
}

export interface GeminiRequest {
  /** What to transcribe. Written by this repo, never by a caller's data. */
  prompt: string;
  /** Already normalised by `requireMime`. */
  mimeType: string;
  /** The file. The only caller data that leaves the perimeter. */
  data: Uint8Array;
  schema: ResponseSchema;
  maxOutputTokens: number;
}

export interface GeminiOptions {
  /** Defaults to the platform `fetch`. Every test passes a stub. */
  http?: HttpLike;
  /** Defaults to `GEMINI_API_KEY` in the environment. */
  apiKey?: string;
  model?: string;
  baseUrl?: string;
  /** 0 disables the timeout. */
  timeoutMs?: number;
  /** Thinking tokens. 0, the default here, switches thinking off. */
  thinkingBudget?: number;
}

/** Reads an environment variable without assuming a Node global exists. */
export function readEnv(name: string): string | undefined {
  const holder = globalThis as {
    process?: { env?: Record<string, string | undefined> };
  };
  return holder.process?.env?.[name];
}

/** True when this process could call the model at all. */
export function hasApiKey(apiKey?: string): boolean {
  const key = apiKey ?? readEnv("GEMINI_API_KEY");
  return key !== undefined && key.trim() !== "";
}

/** Shape of the response envelope, as much of it as this module reads. */
interface GenerateContentResponse {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
    finishReason?: string;
  }>;
  promptFeedback?: { blockReason?: string };
}

/** Finish reasons that mean the provider declined, rather than answered badly. */
const REFUSAL_REASONS = new Set([
  "SAFETY",
  "RECITATION",
  "BLOCKLIST",
  "PROHIBITED_CONTENT",
  "SPII",
  "IMAGE_SAFETY",
]);

/** Strips a ```json fence, which a model occasionally adds anyway. */
export function stripJsonFence(text: string): string {
  const trimmed = text.trim();
  if (!trimmed.startsWith("```")) {
    return trimmed;
  }
  const withoutOpen = trimmed.replace(/^```[a-zA-Z]*\s*/, "");
  const close = withoutOpen.lastIndexOf("```");
  return (close === -1 ? withoutOpen : withoutOpen.slice(0, close)).trim();
}

/** Never let a key reach a log, an error envelope or a PR body. */
function redact(text: string, apiKey: string): string {
  const clipped = text.slice(0, MAX_DETAIL);
  return apiKey === "" ? clipped : clipped.split(apiKey).join("[redacted]");
}

/**
 * Builds the request body. Exported so a test can assert what we send without a
 * request going anywhere, which is the assertion the privacy claim rests on.
 */
export function buildRequestBody(
  request: GeminiRequest,
  thinkingBudget: number,
): Record<string, unknown> {
  return {
    contents: [
      {
        role: "user",
        parts: [
          { text: request.prompt },
          {
            inlineData: {
              mimeType: request.mimeType,
              data: Buffer.from(request.data).toString("base64"),
            },
          },
        ],
      },
    ],
    generationConfig: {
      // Transcription, not creative writing. The same photo has to give the
      // same digits on the rehearsal and at the table.
      temperature: 0,
      responseMimeType: "application/json",
      responseSchema: request.schema,
      maxOutputTokens: request.maxOutputTokens,
      thinkingConfig: { thinkingBudget },
    },
  };
}

/**
 * One `generateContent` call that answers with parsed JSON.
 *
 * The key travels in the `x-goog-api-key` header rather than in the query
 * string, so it cannot end up in a proxy log or in a screenshot of a URL.
 *
 * @throws ExtractError for every failure. Nothing here throws a bare Error, so a
 *   caller can always tell the clerk what went wrong.
 */
export async function generateJson<T>(
  request: GeminiRequest,
  options: GeminiOptions = {},
): Promise<T> {
  const apiKey = options.apiKey ?? readEnv("GEMINI_API_KEY") ?? "";
  if (apiKey.trim() === "") {
    throw new ExtractError(
      "missing_api_key",
      "GEMINI_API_KEY is not set, so no file can be read. Type the CLABE instead.",
    );
  }
  if (request.data.byteLength === 0) {
    throw new ExtractError("empty_input", "the file is empty");
  }
  if (request.data.byteLength > MAX_INLINE_BYTES) {
    throw new ExtractError(
      "too_large",
      `the file is ${request.data.byteLength} bytes and the limit is ${MAX_INLINE_BYTES}`,
    );
  }

  const http = options.http ?? fetch;
  const baseUrl = (options.baseUrl ?? GEMINI_BASE_URL).replace(/\/+$/, "");
  const model = options.model ?? GEMINI_MODEL;
  const timeoutMs = options.timeoutMs ?? GEMINI_TIMEOUT_MS;
  const body = buildRequestBody(request, options.thinkingBudget ?? 0);

  const init: RequestInit = {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify(body),
  };
  if (timeoutMs > 0) {
    init.signal = AbortSignal.timeout(timeoutMs);
  }

  const response = await http(
    `${baseUrl}/models/${model}:generateContent`,
    init,
  );
  const text = await response.text();
  if (!response.ok) {
    throw new ExtractError(
      "http_error",
      `the model API answered ${response.status}`,
      redact(text, apiKey),
    );
  }

  return readPayload<T>(text, apiKey);
}

/** Turns a response envelope into the parsed JSON payload the schema promised. */
function readPayload<T>(text: string, apiKey: string): T {
  let envelope: GenerateContentResponse;
  try {
    envelope = JSON.parse(text) as GenerateContentResponse;
  } catch {
    throw new ExtractError(
      "bad_response",
      "the model API answered with something that is not JSON",
      redact(text, apiKey),
    );
  }

  const blockReason = envelope.promptFeedback?.blockReason;
  if (blockReason !== undefined) {
    throw new ExtractError(
      "blocked",
      `the model refused to read the file: ${blockReason}`,
    );
  }

  const candidate = envelope.candidates?.[0];
  if (candidate === undefined) {
    throw new ExtractError(
      "bad_response",
      "the model API answered with no candidate",
      redact(text, apiKey),
    );
  }

  const finishReason = candidate.finishReason ?? "STOP";
  if (REFUSAL_REASONS.has(finishReason)) {
    throw new ExtractError(
      "blocked",
      `the model stopped without an answer: ${finishReason}`,
    );
  }

  const joined = (candidate.content?.parts ?? [])
    .map((part) => part.text ?? "")
    .join("");
  if (joined.trim() === "") {
    throw new ExtractError(
      "bad_response",
      finishReason === "MAX_TOKENS"
        ? "the output budget ran out before the model wrote anything"
        : "the model returned an empty answer",
      redact(text, apiKey),
    );
  }

  try {
    return JSON.parse(stripJsonFence(joined)) as T;
  } catch {
    throw new ExtractError(
      "bad_response",
      "the model answer did not parse as JSON",
      redact(joined, apiKey),
    );
  }
}
