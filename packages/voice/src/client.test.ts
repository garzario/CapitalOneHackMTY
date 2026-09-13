/**
 * Nothing in this file touches the network.
 *
 * `VoiceClient` takes `http` as a constructor argument and every case here
 * passes a stub that records the request and answers from a literal, so
 * `bun test` needs no ELEVENLABS_API_KEY and never rings anyone's telephone.
 * That is not only hygiene: this API bills per minute and places real calls to
 * real people, so a test runner that could reach it is a test runner that will
 * eventually reach it at three in the morning.
 */

import { describe, expect, test } from "bun:test";
import type { HttpLike, VoiceError } from "./client";
import { buildAgentBody, isE164, toTranscript, VoiceClient } from "./client";
import { CONVERSATION_PAYLOAD } from "./fixtures";
import {
  buildVerificationScript,
  VERIFICATION_TEMPLATE,
  VERIFICATION_VARIABLE_DEFAULTS,
} from "./script";

interface Recorded {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: unknown;
}

/** A stub `fetch` that records what it was asked and answers what it was told. */
function stub(answer: { status?: number; body: unknown } = { body: {} }): {
  http: HttpLike;
  seen: Recorded[];
} {
  const seen: Recorded[] = [];

  const http: HttpLike = async (url, init) => {
    const headers: Record<string, string> = {};
    for (const [key, value] of Object.entries(
      (init?.headers ?? {}) as Record<string, string>,
    )) {
      headers[key.toLowerCase()] = value;
    }
    seen.push({
      url,
      method: init?.method ?? "GET",
      headers,
      body: typeof init?.body === "string" ? JSON.parse(init.body) : init?.body,
    });

    return new Response(
      typeof answer.body === "string"
        ? answer.body
        : JSON.stringify(answer.body),
      { status: answer.status ?? 200 },
    );
  };

  return { http, seen };
}

/** Runs a call that must fail and hands back the error it threw. */
async function failing(run: () => Promise<unknown>): Promise<VoiceError> {
  try {
    await run();
  } catch (thrown) {
    return thrown as VoiceError;
  }

  throw new Error("the call was expected to fail and it did not");
}

function clientWith(answer: { status?: number; body: unknown }) {
  const { http, seen } = stub(answer);

  return { client: new VoiceClient({ apiKey: "test-key", http }), seen };
}

const SCRIPT = buildVerificationScript({
  supplierLegalName: "Distribuidora Sintetica del Poniente, S.A. de C.V.",
  clabe: "012180001234567899",
  amount: 184_300,
});

describe("isE164", () => {
  test("accepts a Mexican mobile and rejects the ways it is usually typed", () => {
    expect(isE164("+528112345678")).toBe(true);
    expect(isE164("8112345678")).toBe(false);
    expect(isE164("+52 81 1234 5678")).toBe(false);
    expect(isE164("+0528112345678")).toBe(false);
    expect(isE164("")).toBe(false);
  });
});

describe("buildAgentBody", () => {
  test("puts the script where the API documents it", () => {
    const body = buildAgentBody({
      name: "verificacion",
      systemPrompt: SCRIPT.systemPrompt,
      firstMessage: SCRIPT.firstMessage,
    });

    const config = body.conversation_config as Record<string, unknown>;
    const agent = config.agent as Record<string, unknown>;

    expect((agent.prompt as Record<string, unknown>).prompt).toBe(
      SCRIPT.systemPrompt,
    );
    expect(agent.first_message).toBe(SCRIPT.firstMessage);
    expect(agent.language).toBe("es");
  });

  /**
   * An absent key means "your default" to this API and a null means "this
   * value". We have not picked a voice, so the key is absent rather than
   * carrying a voice id nobody in this repo has heard.
   */
  test("omits the voice entirely when none was chosen", () => {
    const body = buildAgentBody({
      name: "verificacion",
      systemPrompt: "p",
      firstMessage: "f",
    });

    expect(body.conversation_config).not.toHaveProperty("tts");
  });

  /**
   * The defaults exist so that an unfilled slot cannot reach a telephone as the
   * literal text "{{supplier}}". Absent when nobody passed any, for the same
   * reason the voice is absent: an empty object is a value, not a default.
   */
  test("puts the slot defaults where the dynamic-variable reference documents them", () => {
    const body = buildAgentBody({
      name: "verificacion",
      systemPrompt: VERIFICATION_TEMPLATE.systemPrompt,
      firstMessage: VERIFICATION_TEMPLATE.firstMessage,
      dynamicVariableDefaults: VERIFICATION_VARIABLE_DEFAULTS,
    });

    const config = body.conversation_config as Record<string, unknown>;
    const agent = config.agent as Record<string, unknown>;

    expect(agent.dynamic_variables).toEqual({
      dynamic_variable_placeholders: VERIFICATION_VARIABLE_DEFAULTS,
    });
  });

  test("omits the slot defaults when there are none", () => {
    const body = buildAgentBody({
      name: "verificacion",
      systemPrompt: "p",
      firstMessage: "f",
      dynamicVariableDefaults: {},
    });

    const config = body.conversation_config as Record<string, unknown>;

    expect(config.agent).not.toHaveProperty("dynamic_variables");
  });

  test("sends the voice and the duration cap when they are given", () => {
    const body = buildAgentBody({
      name: "verificacion",
      systemPrompt: "p",
      firstMessage: "f",
      voiceId: "voice-synthetic-0001",
      ttsModelId: "eleven_flash_v2_5",
      maxDurationSeconds: 120,
    });

    const config = body.conversation_config as Record<string, unknown>;

    expect(config.tts).toEqual({
      voice_id: "voice-synthetic-0001",
      model_id: "eleven_flash_v2_5",
    });
    expect(config.conversation).toEqual({ max_duration_seconds: 120 });
  });

  /**
   * The measured half of issue #250. Every one of these was a field somebody had
   * dragged in a dashboard, which is the same as not having it: the point of the
   * config file is that a rerun of `voice-setup` reproduces the agent that was
   * heard, so each of these has to leave this repository on the wire.
   */
  test("sends the measured delivery and turn settings", () => {
    const body = buildAgentBody({
      name: "verificacion",
      systemPrompt: "p",
      firstMessage: "f",
      ttsModelId: "eleven_flash_v2_5",
      optimizeStreamingLatency: 3,
      stability: 0.55,
      similarityBoost: 0.85,
      speed: 1,
      turnTimeoutSeconds: 3,
      turnEagerness: "normal",
      speculativeTurn: false,
    });

    const config = body.conversation_config as Record<string, unknown>;

    expect(config.tts).toEqual({
      model_id: "eleven_flash_v2_5",
      optimize_streaming_latency: 3,
      stability: 0.55,
      similarity_boost: 0.85,
      speed: 1,
    });
    expect(config.turn).toEqual({
      turn_timeout: 3,
      turn_eagerness: "normal",
      speculative_turn: false,
    });
  });

  /**
   * Rule 8 and the disclosure, as two fields. Without `end_call` the agent says
   * the goodbye and holds the line open to the duration cap; without the
   * interruption lock a supplier who starts talking over the greeting never
   * hears what the call is.
   */
  test("enables the end_call tool and protects the greeting", () => {
    const body = buildAgentBody({
      name: "verificacion",
      systemPrompt: "p",
      firstMessage: "f",
      endCall: true,
      disableFirstMessageInterruptions: true,
      llm: "gemini-2.5-flash-lite",
      temperature: 0.25,
    });

    const config = body.conversation_config as Record<string, unknown>;
    const agent = config.agent as Record<string, unknown>;
    const prompt = agent.prompt as Record<string, unknown>;

    expect(agent.disable_first_message_interruptions).toBe(true);
    expect(prompt.llm).toBe("gemini-2.5-flash-lite");
    expect(prompt.temperature).toBe(0.25);
    expect(prompt.built_in_tools).toEqual({
      end_call: {
        type: "system",
        name: "end_call",
        description: "",
        params: { system_tool_type: "end_call" },
      },
    });
  });

  /** False is a value, not an absence. An omitted flag means "keep yours". */
  test("omits the tool and the lock when nobody asked for them", () => {
    const body = buildAgentBody({
      name: "verificacion",
      systemPrompt: "p",
      firstMessage: "f",
      endCall: false,
    });

    const config = body.conversation_config as Record<string, unknown>;
    const agent = config.agent as Record<string, unknown>;

    expect(agent.prompt).not.toHaveProperty("built_in_tools");
    expect(agent).not.toHaveProperty("disable_first_message_interruptions");
    expect(config).not.toHaveProperty("turn");
  });
});

describe("toTranscript", () => {
  test("renames the provider role to the one the domain uses", () => {
    const turns = toTranscript(CONVERSATION_PAYLOAD.transcript);

    expect(turns.map((turn) => turn.role)).toEqual([
      "agent",
      "supplier",
      "agent",
      "supplier",
    ]);
  });

  test("drops the silence markers the provider sends with no message", () => {
    expect(toTranscript(CONVERSATION_PAYLOAD.transcript)).toHaveLength(4);
    expect(toTranscript([{ role: "user", message: null }])).toEqual([]);
    expect(toTranscript([{ role: "user", message: "   " }])).toEqual([]);
  });

  test("survives a body that is not a transcript at all", () => {
    expect(toTranscript(undefined)).toEqual([]);
    expect(toTranscript("nope")).toEqual([]);
    expect(toTranscript([1, null])).toEqual([]);
  });
});

describe("VoiceClient", () => {
  test("authenticates with the documented header and never with a query", async () => {
    const { client, seen } = clientWith({ body: { agent_id: "agent-1" } });
    await client.createAgent({
      name: "verificacion",
      systemPrompt: SCRIPT.systemPrompt,
      firstMessage: SCRIPT.firstMessage,
    });

    expect(seen[0]?.headers["xi-api-key"]).toBe("test-key");
    expect(seen[0]?.url).toBe(
      "https://api.elevenlabs.io/v1/convai/agents/create",
    );
    expect(seen[0]?.url).not.toContain("test-key");
  });

  /**
   * Read before write, which is acceptance criterion 9 of issue #250. It comes
   * back raw on purpose: the fields worth seeing in a diff are the ones this
   * repository does not model, and a typed shape would hide exactly those.
   */
  test("reads an agent back raw, with GET on its id", async () => {
    const { client, seen } = clientWith({
      body: {
        agent_id: "agent-1",
        conversation_config: { turn: { turn_timeout: 7 } },
      },
    });

    const live = await client.getAgent("agent-1");

    expect(seen[0]?.method).toBe("GET");
    expect(seen[0]?.url).toBe(
      "https://api.elevenlabs.io/v1/convai/agents/agent-1",
    );
    expect(live).toEqual({
      agent_id: "agent-1",
      conversation_config: { turn: { turn_timeout: 7 } },
    });
  });

  test("updates an agent in place, with PATCH on its id", async () => {
    const { client, seen } = clientWith({ body: { agent_id: "agent-1" } });
    const result = await client.updateAgent("agent-1", {
      name: "verificacion",
      systemPrompt: "p",
      firstMessage: "f",
    });

    expect(seen[0]?.method).toBe("PATCH");
    expect(seen[0]?.url).toBe(
      "https://api.elevenlabs.io/v1/convai/agents/agent-1",
    );
    expect(result.agentId).toBe("agent-1");
  });

  test("places the outbound call with the three required fields", async () => {
    const { client, seen } = clientWith({
      body: {
        success: true,
        message: "ok",
        conversation_id: "conv-1",
        callSid: "CA-synthetic",
      },
    });

    const call = await client.startOutboundCall({
      agentId: "agent-1",
      agentPhoneNumberId: "phnum-1",
      toNumber: "+528112345678",
    });

    expect(seen[0]?.url).toBe(
      "https://api.elevenlabs.io/v1/convai/twilio/outbound-call",
    );
    expect(seen[0]?.body).toEqual({
      agent_id: "agent-1",
      agent_phone_number_id: "phnum-1",
      to_number: "+528112345678",
    });
    expect(call).toEqual({
      success: true,
      message: "ok",
      conversationId: "conv-1",
      callSid: "CA-synthetic",
    });
  });

  /**
   * Issue #206. The supplier, the amount and the four digits reach one call as
   * dynamic variables, which is what lets the agent the provider stores carry no
   * account at all. The key is the one the outbound-call reference documents on
   * `conversation_initiation_client_data`.
   */
  test("carries this instruction's words as dynamic variables", async () => {
    const { client, seen } = clientWith({
      body: { success: true, message: "ok", conversation_id: "conv-1" },
    });

    await client.startOutboundCall({
      agentId: "agent-1",
      agentPhoneNumberId: "phnum-1",
      toNumber: "+528112345678",
      dynamicVariables: SCRIPT.variables,
    });

    const body = seen[0]?.body as Record<string, unknown>;

    expect(body.conversation_initiation_client_data).toEqual({
      dynamic_variables: SCRIPT.variables,
    });
    expect(JSON.stringify(body)).not.toContain("012180001234567899");
  });

  test("sends no client data when there are no variables to send", async () => {
    const { client, seen } = clientWith({
      body: { success: true, message: "ok", conversation_id: "conv-1" },
    });

    await client.startOutboundCall({
      agentId: "agent-1",
      agentPhoneNumberId: "phnum-1",
      toNumber: "+528112345678",
      dynamicVariables: {},
    });

    expect(seen[0]?.body).not.toHaveProperty(
      "conversation_initiation_client_data",
    );
  });

  /** A malformed number is caught here so it does not cost a round trip. */
  test("refuses a number that is not E.164 before any request goes out", async () => {
    const { client, seen } = clientWith({ body: {} });

    await expect(
      client.startOutboundCall({
        agentId: "agent-1",
        agentPhoneNumberId: "phnum-1",
        toNumber: "8112345678",
      }),
    ).rejects.toThrow("E.164");
    expect(seen).toHaveLength(0);
  });

  test("reports a refusal the provider answered with a 200", async () => {
    const { client } = clientWith({
      body: { success: false, message: "number is not verified" },
    });

    const call = await client.startOutboundCall({
      agentId: "agent-1",
      agentPhoneNumberId: "phnum-1",
      toNumber: "+528112345678",
    });

    expect(call.success).toBe(false);
    expect(call.conversationId).toBeUndefined();
  });

  test("reads a conversation into the domain transcript", async () => {
    const { client, seen } = clientWith({ body: CONVERSATION_PAYLOAD });
    const conversation = await client.getConversation("conv_synthetic_0001");

    expect(seen[0]?.url).toBe(
      "https://api.elevenlabs.io/v1/convai/conversations/conv_synthetic_0001",
    );
    expect(conversation.status).toBe("done");
    expect(conversation.callSuccessful).toBe("success");
    expect(conversation.durationSeconds).toBe(24);
    expect(conversation.transcript.at(-1)?.text).toBe(
      "Sí, es correcta, esa cuenta la abrimos en marzo.",
    );
  });

  test("maps an unknown status onto processing rather than throwing", async () => {
    const { client } = clientWith({
      body: { conversation_id: "c", agent_id: "a", status: "brand_new" },
    });

    expect((await client.getConversation("c")).status).toBe("processing");
  });

  test("lists the phone numbers the setup script prints", async () => {
    const { client } = clientWith({
      body: [
        {
          phone_number_id: "phnum-1",
          phone_number: "+528100000000",
          provider: "twilio",
          label: "demo",
        },
      ],
    });

    expect(await client.listPhoneNumbers()).toEqual([
      {
        phoneNumberId: "phnum-1",
        phoneNumber: "+528100000000",
        provider: "twilio",
        label: "demo",
      },
    ]);
  });

  test("maps the statuses that matter onto codes a route can act on", async () => {
    const cases: Array<[number, VoiceError["code"]]> = [
      [401, "unauthorized"],
      [404, "not_found"],
      [422, "bad_request"],
      [429, "rate_limited"],
      [500, "http_error"],
    ];

    for (const [status, code] of cases) {
      const { client } = clientWith({ status, body: { detail: "nope" } });
      const error = await failing(() => client.getConversation("c"));

      expect(error.code).toBe(code);
      expect(error.status).toBe(status);
    }
  });

  /** A key in an error body ends up in a screenshot. */
  test("never puts the key in the error it throws", async () => {
    const { client } = clientWith({ status: 401, body: { detail: "nope" } });
    const error = await failing(() => client.getConversation("c"));

    expect(`${error.message}${error.detail}`).not.toContain("test-key");
  });

  test("reports a body that is not JSON instead of crashing on it", async () => {
    const { client } = clientWith({ body: "<html>gateway timeout</html>" });
    const error = await failing(() => client.getConversation("c"));

    expect(error.code).toBe("bad_response");
  });

  test("refuses to be built without a key", () => {
    const { http } = stub();

    expect(() => new VoiceClient({ apiKey: "  ", http })).toThrow(
      "ELEVENLABS_API_KEY",
    );
  });
});
