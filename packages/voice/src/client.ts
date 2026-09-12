/**
 * The only place in this repo that talks to the ElevenLabs Conversational AI
 * API.
 *
 * Four calls, in the order the product uses them:
 *
 * | Method | Endpoint | Used for |
 * |---|---|---|
 * | POST | `/v1/convai/agents/create` | create the verification agent once |
 * | PATCH | `/v1/convai/agents/{agent_id}` | push a new script to that agent |
 * | POST | `/v1/convai/twilio/outbound-call` | ring the supplier |
 * | GET | `/v1/convai/conversations/{conversation_id}` | read the transcript |
 *
 * Plus `GET /v1/convai/phone-numbers`, which `scripts/voice-setup.ts` needs to
 * print the `agent_phone_number_id` that the outbound call takes. Every path,
 * field name and enum value is quoted from the ElevenLabs reference; the exact
 * pages and the date they were read are listed in README.md next to this file.
 *
 * Two boundaries this module keeps:
 *
 * - `http` is injected, exactly like `fetchCep` in packages/cep. The test suite
 *   only ever passes a stub, so `bun test` never reaches api.elevenlabs.io and
 *   never needs a key. A voice API that bills per minute is not something to
 *   call from a test runner.
 * - The key is a constructor argument read from `process.env` by the caller. It
 *   is never logged, never put in a URL and never returned in an error, because
 *   a key in an error body ends up in a screenshot.
 *
 * Server only. It is imported by apps/api and by scripts, never by apps/web: the
 * browser fallback talks to the agent through the public widget, which needs no
 * key at all.
 */

import type { VerificationTurn } from "@hackmty/core";

export const ELEVENLABS_BASE_URL = "https://api.elevenlabs.io";

/** Only the part of `fetch` this module uses, so a test stub is three lines. */
export type HttpLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface VoiceClientOptions {
  apiKey: string;
  http: HttpLike;
  baseUrl?: string;
  /** Per-request timeout in milliseconds. 0 disables it. */
  timeoutMs?: number;
}

export type VoiceErrorCode =
  /** The key was refused. Never retried, and never logged with the key. */
  | "unauthorized"
  /** The agent, the phone number or the conversation does not exist. */
  | "not_found"
  /** The request was rejected by the API as malformed. */
  | "bad_request"
  /** Too many calls. Deliberately not retried inside this module. */
  | "rate_limited"
  /** Any other status we cannot act on. */
  | "http_error"
  /** The API answered with a body that is not the documented shape. */
  | "bad_response";

export class VoiceError extends Error {
  readonly code: VoiceErrorCode;
  readonly status: number;
  /** Response body, truncated. Useful in a PR, useless to a clerk. */
  readonly detail: string;

  constructor(code: VoiceErrorCode, message: string, status = 0, detail = "") {
    super(message);
    this.name = "VoiceError";
    this.code = code;
    this.status = status;
    this.detail = detail;
  }
}

const MAX_DETAIL = 300;

function codeForStatus(status: number): VoiceErrorCode {
  if (status === 401 || status === 403) {
    return "unauthorized";
  }
  if (status === 404) {
    return "not_found";
  }
  if (status === 422 || status === 400) {
    return "bad_request";
  }
  if (status === 429) {
    return "rate_limited";
  }

  return "http_error";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringAt(record: Record<string, unknown>, key: string): string {
  const value = record[key];

  return typeof value === "string" ? value : "";
}

/* -------------------------------------------------------------------------- */
/* Agent configuration                                                         */
/* -------------------------------------------------------------------------- */

export interface AgentConfigInput {
  /** Shown in the ElevenLabs dashboard. Not spoken. */
  name: string;
  systemPrompt: string;
  firstMessage: string;
  /**
   * BCP-47 language of the conversation. "es" is what the API documents; the
   * Mexican accent is a property of the voice, not of this field.
   */
  language?: string;
  /**
   * The voice. Omitted on purpose when the caller has none: ElevenLabs applies
   * its own default rather than a voice id this repo invented. Put the id of a
   * Mexican Spanish voice in ELEVENLABS_VOICE_ID once the team has picked one.
   */
  voiceId?: string;
  /** Text to speech model. Omitted means the API default. */
  ttsModelId?: string;
  /** Hard stop in seconds, so a call cannot run up a bill unattended. */
  maxDurationSeconds?: number;
}

/**
 * The `conversation_config` body, built in one place so the create and the
 * update calls cannot drift apart.
 *
 * Optional fields are omitted rather than sent as null, because the API reads an
 * absent key as "keep the default" and a present null as a value.
 */
export function buildAgentBody(
  config: AgentConfigInput,
): Record<string, unknown> {
  const agent: Record<string, unknown> = {
    prompt: { prompt: config.systemPrompt },
    first_message: config.firstMessage,
    language: config.language ?? "es",
  };

  const tts: Record<string, unknown> = {};
  if (config.voiceId !== undefined) {
    tts.voice_id = config.voiceId;
  }
  if (config.ttsModelId !== undefined) {
    tts.model_id = config.ttsModelId;
  }

  const conversation: Record<string, unknown> = {};
  if (config.maxDurationSeconds !== undefined) {
    conversation.max_duration_seconds = config.maxDurationSeconds;
  }

  const conversationConfig: Record<string, unknown> = { agent };
  if (Object.keys(tts).length > 0) {
    conversationConfig.tts = tts;
  }
  if (Object.keys(conversation).length > 0) {
    conversationConfig.conversation = conversation;
  }

  return { name: config.name, conversation_config: conversationConfig };
}

/* -------------------------------------------------------------------------- */
/* Responses, in domain shapes                                                 */
/* -------------------------------------------------------------------------- */

export interface OutboundCall {
  /** False means the provider refused the call without an HTTP error. */
  success: boolean;
  message: string;
  /** Absent when the provider refused, which is why it is optional. */
  conversationId?: string;
  callSid?: string;
}

/** The documented lifecycle of a conversation. */
export type ConversationStatus =
  | "initiated"
  | "in-progress"
  | "processing"
  | "done"
  | "failed";

export interface Conversation {
  conversationId: string;
  agentId: string;
  status: ConversationStatus;
  /** Already mapped to the domain: the API says "user", we say "supplier". */
  transcript: VerificationTurn[];
  /** The provider's own view of the call. We never decide from it. */
  callSuccessful?: "success" | "failure" | "unknown";
  durationSeconds?: number;
}

export interface PhoneNumber {
  phoneNumberId: string;
  phoneNumber: string;
  provider: string;
  label: string;
}

const STATUSES: ConversationStatus[] = [
  "initiated",
  "in-progress",
  "processing",
  "done",
  "failed",
];

function statusOf(value: unknown): ConversationStatus {
  return STATUSES.find((status) => status === value) ?? "processing";
}

/**
 * Maps the provider transcript onto the domain turns.
 *
 * `role` is `"user"` or `"agent"` at ElevenLabs. In this product the person on
 * the phone is the supplier, and the parser in outcome.ts only ever scores
 * supplier turns, so the rename happens here once instead of at every call site.
 * Turns with no text at all are dropped: they are silence markers, and a clause
 * parser handed an empty string would count it as a turn that said nothing.
 */
export function toTranscript(raw: unknown): VerificationTurn[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  const turns: VerificationTurn[] = [];

  for (const entry of raw) {
    if (!isRecord(entry)) {
      continue;
    }
    const message = stringAt(entry, "message").trim();
    if (message === "") {
      continue;
    }

    const turn: VerificationTurn = {
      role: entry.role === "agent" ? "agent" : "supplier",
      text: message,
    };
    if (typeof entry.time_in_call_secs === "number") {
      turn.atSecond = entry.time_in_call_secs;
    }
    turns.push(turn);
  }

  return turns;
}

/* -------------------------------------------------------------------------- */
/* The client                                                                  */
/* -------------------------------------------------------------------------- */

export class VoiceClient {
  private readonly apiKey: string;
  private readonly http: HttpLike;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor(options: VoiceClientOptions) {
    if (options.apiKey.trim() === "") {
      throw new VoiceError("unauthorized", "ELEVENLABS_API_KEY is empty");
    }
    this.apiKey = options.apiKey;
    this.http = options.http;
    this.baseUrl = (options.baseUrl ?? ELEVENLABS_BASE_URL).replace(/\/+$/, "");
    this.timeoutMs = options.timeoutMs ?? 15_000;
  }

  /** Creates the verification agent. Returns the id to put in `.env`. */
  async createAgent(config: AgentConfigInput): Promise<{ agentId: string }> {
    const body = await this.sendObject(
      "POST",
      "/v1/convai/agents/create",
      buildAgentBody(config),
    );
    const agentId = stringAt(body, "agent_id");
    if (agentId === "") {
      throw new VoiceError(
        "bad_response",
        "agent creation answered without an agent_id",
      );
    }

    return { agentId };
  }

  /** Pushes a new script onto an agent that already exists. */
  async updateAgent(
    agentId: string,
    config: AgentConfigInput,
  ): Promise<{ agentId: string }> {
    const body = await this.sendObject(
      "PATCH",
      `/v1/convai/agents/${encodeURIComponent(agentId)}`,
      buildAgentBody(config),
    );

    return { agentId: stringAt(body, "agent_id") || agentId };
  }

  /**
   * Rings the supplier through the Twilio integration.
   *
   * The number is E.164 and is validated before the request, because a malformed
   * number is a 422 that costs a round trip in the middle of a demo. Nothing is
   * retried: a retried phone call is a second phone call to a real person.
   */
  async startOutboundCall(params: {
    agentId: string;
    agentPhoneNumberId: string;
    toNumber: string;
  }): Promise<OutboundCall> {
    if (!isE164(params.toNumber)) {
      throw new VoiceError(
        "bad_request",
        "to_number must be E.164, for example +5281XXXXXXXX",
      );
    }

    const body = await this.sendObject(
      "POST",
      "/v1/convai/twilio/outbound-call",
      {
        agent_id: params.agentId,
        agent_phone_number_id: params.agentPhoneNumberId,
        to_number: params.toNumber,
      },
    );

    const call: OutboundCall = {
      success: body.success === true,
      message: stringAt(body, "message"),
    };
    const conversationId = stringAt(body, "conversation_id");
    if (conversationId !== "") {
      call.conversationId = conversationId;
    }
    const callSid = stringAt(body, "callSid");
    if (callSid !== "") {
      call.callSid = callSid;
    }

    return call;
  }

  /** Reads one conversation, with the transcript already in domain shape. */
  async getConversation(conversationId: string): Promise<Conversation> {
    const body = await this.sendObject(
      "GET",
      `/v1/convai/conversations/${encodeURIComponent(conversationId)}`,
    );

    const conversation: Conversation = {
      conversationId: stringAt(body, "conversation_id") || conversationId,
      agentId: stringAt(body, "agent_id"),
      status: statusOf(body.status),
      transcript: toTranscript(body.transcript),
    };

    const analysis = isRecord(body.analysis) ? body.analysis : undefined;
    const successful = analysis?.call_successful;
    if (
      successful === "success" ||
      successful === "failure" ||
      successful === "unknown"
    ) {
      conversation.callSuccessful = successful;
    }

    const metadata = isRecord(body.metadata) ? body.metadata : undefined;
    if (typeof metadata?.call_duration_secs === "number") {
      conversation.durationSeconds = metadata.call_duration_secs;
    }

    return conversation;
  }

  /** The numbers this account can call from, for the setup script. */
  async listPhoneNumbers(): Promise<PhoneNumber[]> {
    const body = await this.send("GET", "/v1/convai/phone-numbers");
    /* The endpoint answers a bare array; a wrapped one is tolerated because an
       API that grows pagination usually grows it as an envelope. */
    const rows = Array.isArray(body)
      ? body
      : isRecord(body)
        ? body.phone_numbers
        : undefined;
    if (!Array.isArray(rows)) {
      return [];
    }

    return rows.filter(isRecord).map((row) => ({
      phoneNumberId: stringAt(row, "phone_number_id"),
      phoneNumber: stringAt(row, "phone_number"),
      provider: stringAt(row, "provider"),
      label: stringAt(row, "label"),
    }));
  }

  /** Every call goes through here, so there is one auth header and one error map. */
  private async send(
    method: "GET" | "POST" | "PATCH",
    path: string,
    body?: unknown,
  ): Promise<unknown> {
    const headers: Record<string, string> = {
      /** The documented auth header. It is never a query parameter. */
      "xi-api-key": this.apiKey,
      accept: "application/json",
    };
    if (body !== undefined) {
      headers["content-type"] = "application/json";
    }

    const init: RequestInit = { method, headers };
    if (body !== undefined) {
      init.body = JSON.stringify(body);
    }
    if (this.timeoutMs > 0) {
      init.signal = AbortSignal.timeout(this.timeoutMs);
    }

    const response = await this.http(`${this.baseUrl}${path}`, init);
    const text = await response.text();

    if (!response.ok) {
      throw new VoiceError(
        codeForStatus(response.status),
        `the voice API answered ${response.status} to ${method} ${path}`,
        response.status,
        text.slice(0, MAX_DETAIL),
      );
    }

    try {
      return JSON.parse(text) as unknown;
    } catch {
      throw new VoiceError(
        "bad_response",
        `${method} ${path} did not answer JSON`,
        response.status,
        text.slice(0, MAX_DETAIL),
      );
    }
  }

  /** The same call, for the endpoints whose body is documented as an object. */
  private async sendObject(
    method: "GET" | "POST" | "PATCH",
    path: string,
    body?: unknown,
  ): Promise<Record<string, unknown>> {
    const parsed = await this.send(method, path, body);
    if (!isRecord(parsed)) {
      throw new VoiceError(
        "bad_response",
        `${method} ${path} answered JSON that is not an object`,
      );
    }

    return parsed;
  }
}

/**
 * E.164: a plus sign, a country code that cannot start with zero, then up to
 * fourteen more digits. A Mexican mobile is +52 followed by ten digits.
 */
export function isE164(value: string): boolean {
  return /^\+[1-9]\d{7,14}$/.test(value.trim());
}
