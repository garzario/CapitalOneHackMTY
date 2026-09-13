/**
 * What `bun run voice-setup` uploads, pinned.
 *
 * Issue #206: the verification call confirms the change and the last four digits
 * of the account, and never the whole CLABE. The half of that rule this file
 * guards is the provider's own copy. `packages/voice` is tested against the
 * strings it returns; here the assertion is over the exact JSON body that leaves
 * this repository and over the committed config that shapes it, because an
 * eighteen-digit placeholder in either is an account number sitting in an
 * ElevenLabs dashboard where anybody with the login can read it.
 *
 * Issue #250 added the second half: the config has to reproduce the agent that
 * was actually heard. Every setting below was measured on a live call, so a value
 * that drifts here is dead air or an interrupted greeting on the next one, and
 * the commit that changed it has to say so.
 *
 * Nothing here touches the network and nothing needs a key: `buildAgentBody` is
 * a pure function and the config is a file in this repository.
 */

import { describe, expect, test } from "bun:test";
import { resolve } from "node:path";
import {
  buildAgentBody,
  OWNER_TEMPLATE,
  OWNER_VARIABLE_DEFAULTS,
  VERIFICATION_TEMPLATE,
  VERIFICATION_VARIABLE_DEFAULTS,
} from "../packages/voice/src/index.ts";

const ROOT = resolve(import.meta.dir, "..");
const CONFIG_PATH = `${ROOT}/scripts/voice-agent.json`;

/** Any run of five or more digits. A CLABE is eighteen, a mobile is twelve. */
const LONG_DIGIT_RUN = /\d{5,}/;

const config = await Bun.file(CONFIG_PATH).json();

/**
 * The body as the script builds it, config and defaults included.
 *
 * The voice id is deliberately absent: it is read from `ELEVENLABS_VOICE_ID` and
 * it is not in this repository, so a test that supplied one would be testing a
 * value nobody ships.
 */
const body = buildAgentBody({
  name: config.name,
  systemPrompt: VERIFICATION_TEMPLATE.systemPrompt,
  firstMessage: VERIFICATION_TEMPLATE.firstMessage,
  dynamicVariableDefaults: {
    ...VERIFICATION_VARIABLE_DEFAULTS,
    company: config.companyName,
    caller: config.callerName,
  },
  language: config.language,
  ttsModelId: config.ttsModelId,
  optimizeStreamingLatency: config.optimizeStreamingLatency,
  stability: config.stability,
  similarityBoost: config.similarityBoost,
  speed: config.speed,
  turnTimeoutSeconds: config.turnTimeoutSeconds,
  turnEagerness: config.turnEagerness,
  speculativeTurn: config.speculativeTurn,
  disableFirstMessageInterruptions: config.disableFirstMessageInterruptions,
  endCall: config.endCall,
  llm: config.llm,
  temperature: config.temperature,
  maxDurationSeconds: config.maxDurationSeconds,
});

const conversation = body.conversation_config as Record<string, unknown>;
const agent = conversation.agent as Record<string, unknown>;
const prompt = agent.prompt as Record<string, unknown>;

describe("scripts/voice-agent.json", () => {
  test("carries no account, no long run of digits and no voice id", () => {
    const raw = JSON.stringify(config);

    expect(raw).not.toMatch(LONG_DIGIT_RUN);
    expect(config).not.toHaveProperty("sample");
    expect(config).not.toHaveProperty("voiceId");
  });

  /**
   * The company is the one that owes the supplier money, never this product. A
   * supplier who has invoiced the same shop for years has never heard of
   * SentryOne, and a stranger telephoning about their bank account is the shape
   * of the fraud this control exists to catch.
   */
  test("names the company the call is placed for, and caps the call", () => {
    expect(config.companyName).toBe("Metálicos del Norte");
    expect(config.companyName).not.toContain("SentryOne");
    expect(config.callerName).toBe("Alejandro");
    expect(config.maxDurationSeconds).toBe(150);
  });

  /**
   * The measured settings of issue #250. `eleven_flash_v2_5` answered its first
   * audio byte in 195 to 266 ms against 3812 to 4962 ms for
   * `eleven_multilingual_v2` on the same sentence, and `turn_timeout` was 7,
   * which is where the dead air came from.
   */
  test("keeps the latency settings that were measured, not the defaults", () => {
    expect(config.ttsModelId).toBe("eleven_flash_v2_5");
    expect(config.optimizeStreamingLatency).toBe(3);
    expect(config.stability).toBe(0.55);
    expect(config.similarityBoost).toBe(0.85);
    expect(config.speed).toBe(1);
    expect(config.turnTimeoutSeconds).toBe(3);
    expect(config.turnEagerness).toBe("normal");
    expect(config.speculativeTurn).toBe(false);
    expect(config.llm).toBe("gemini-2.5-flash-lite");
    expect(config.temperature).toBe(0.25);
  });

  /** The agent hangs up itself, and the greeting cannot be talked over. */
  test("enables the hang up and protects the greeting", () => {
    expect(config.endCall).toBe(true);
    expect(config.disableFirstMessageInterruptions).toBe(true);
  });
});

describe("the body voice-setup uploads", () => {
  /**
   * The pin issue #206 asks for. An eighteen-digit placeholder in the stored
   * prompt would be read out loud on every call the agent places.
   */
  test("carries no eighteen-digit placeholder and no full CLABE", () => {
    const raw = JSON.stringify(body);

    expect(raw).not.toMatch(/\d{18}/);
    expect(raw).not.toMatch(LONG_DIGIT_RUN);
    expect(raw).not.toContain("012180001234567899");
  });

  test("uploads the template with its slots still empty", () => {
    expect(prompt.prompt).toContain("{{question}}");
    expect(prompt.prompt).toContain("{{purpose}}");
    expect(prompt.prompt).toContain("{{account_last4}}");
    expect(agent.first_message).toContain("{{supplier}}");
    expect(agent.first_message).toContain("{{caller}}");
  });

  /** A slot nothing fills would be spoken as the literal text. */
  test("uploads a default for every slot the template carries", () => {
    const dynamic = agent.dynamic_variables as Record<string, unknown>;
    const defaults = dynamic.dynamic_variable_placeholders as Record<
      string,
      string
    >;
    const slots = [
      ...`${VERIFICATION_TEMPLATE.systemPrompt}\n${VERIFICATION_TEMPLATE.firstMessage}`.matchAll(
        /\{\{(\w+)\}\}/g,
      ),
    ].map((match) => match[1]);

    expect(slots.length).toBeGreaterThan(0);
    for (const slot of new Set(slots)) {
      expect(defaults[slot as string]).toBeString();
    }
  });

  /**
   * The whole of issue #250 in one assertion block. These are the fields a
   * rerun has to put back, in the shape the API documents, or the agent goes
   * back to waiting seven seconds and never hanging up.
   */
  test("carries the measured configuration onto the wire", () => {
    expect(conversation.tts).toEqual({
      model_id: "eleven_flash_v2_5",
      optimize_streaming_latency: 3,
      stability: 0.55,
      similarity_boost: 0.85,
      speed: 1,
    });
    expect(conversation.turn).toEqual({
      turn_timeout: 3,
      turn_eagerness: "normal",
      speculative_turn: false,
    });
    expect(conversation.conversation).toEqual({ max_duration_seconds: 150 });
    expect(agent.disable_first_message_interruptions).toBe(true);
    expect(agent.language).toBe("es");
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

  /**
   * Everything the PATCH does not carry is a field it cannot clobber, which is
   * how `asr`, the client events and anything a future version of the provider
   * adds survive a rerun. The `GET` in `voice-setup.ts` is what makes the merge
   * reviewable; this is what keeps the body narrow enough for it to matter.
   */
  test("sets only the keys this repository decided on", () => {
    expect(Object.keys(body).sort()).toEqual(["conversation_config", "name"]);
    expect(Object.keys(conversation).sort()).toEqual([
      "agent",
      "conversation",
      "tts",
      "turn",
    ]);
    expect(Object.keys(agent).sort()).toEqual([
      "disable_first_message_interruptions",
      "dynamic_variables",
      "first_message",
      "language",
      "prompt",
    ]);
    expect(Object.keys(prompt).sort()).toEqual([
      "built_in_tools",
      "llm",
      "prompt",
      "temperature",
    ]);
  });
});

/**
 * The second line, uploaded by `bun run voice-setup --owner`.
 *
 * It is the same expression with one flag flipped, so the assertion that matters
 * is that only the prompt, the first message and the name differ: a turn timeout
 * or a voice that drifted between the two agents would be one line that sounds
 * like a person and one that sounds like a recording, on the same stand, ten
 * minutes apart.
 */
const ownerBody = buildAgentBody({
  name: config.ownerAgentName,
  systemPrompt: OWNER_TEMPLATE.systemPrompt,
  firstMessage: OWNER_TEMPLATE.firstMessage,
  dynamicVariableDefaults: {
    ...OWNER_VARIABLE_DEFAULTS,
    company: config.companyName,
    owner: config.ownerName,
  },
  language: config.language,
  ttsModelId: config.ttsModelId,
  optimizeStreamingLatency: config.optimizeStreamingLatency,
  stability: config.stability,
  similarityBoost: config.similarityBoost,
  speed: config.speed,
  turnTimeoutSeconds: config.turnTimeoutSeconds,
  turnEagerness: config.turnEagerness,
  speculativeTurn: config.speculativeTurn,
  disableFirstMessageInterruptions: config.disableFirstMessageInterruptions,
  endCall: config.endCall,
  llm: config.llm,
  temperature: config.temperature,
  maxDurationSeconds: config.maxDurationSeconds,
});

const ownerConversation = ownerBody.conversation_config as Record<
  string,
  unknown
>;
const ownerAgent = ownerConversation.agent as Record<string, unknown>;
const ownerPrompt = ownerAgent.prompt as Record<string, unknown>;

describe("the body voice-setup --owner uploads", () => {
  test("is a second agent with its own name and its own words", () => {
    expect(ownerBody.name).toBe("SentryOne dueño");
    expect(ownerBody.name).not.toBe(body.name);
    expect(ownerAgent.first_message).not.toBe(agent.first_message);
  });

  test("carries no account and no long run of digits either", () => {
    const raw = JSON.stringify(ownerBody);

    expect(raw).not.toMatch(/\d{18}/);
    expect(raw).not.toMatch(LONG_DIGIT_RUN);
  });

  test("uploads the owner template with its slots still empty", () => {
    expect(ownerPrompt.prompt).toContain("{{amount}}");
    expect(ownerPrompt.prompt).toContain("{{account_last4}}");
    expect(ownerPrompt.prompt).toContain("{{plaza_new}}");
    expect(ownerAgent.first_message).toContain("{{owner}}");
    expect(ownerAgent.first_message).toContain("{{company}}");
  });

  test("uploads a default for every slot the owner template carries", () => {
    const dynamic = ownerAgent.dynamic_variables as Record<string, unknown>;
    const defaults = dynamic.dynamic_variable_placeholders as Record<
      string,
      string
    >;
    const slots = [
      ...`${OWNER_TEMPLATE.systemPrompt}\n${OWNER_TEMPLATE.firstMessage}`.matchAll(
        /\{\{(\w+)\}\}/g,
      ),
    ].map((match) => match[1]);

    expect(slots.length).toBeGreaterThan(0);
    for (const slot of new Set(slots)) {
      expect(defaults[slot as string]).toBeString();
    }
    expect(defaults.owner).toBe("Gerardo");
    expect(defaults.company).toBe("Metálicos del Norte");
  });

  /** The whole point of one script instead of two: the lines sound the same. */
  test("keeps the tts, the turn and the conversation settings of the first", () => {
    expect(ownerConversation.tts).toEqual(conversation.tts);
    expect(ownerConversation.turn).toEqual(conversation.turn);
    expect(ownerConversation.conversation).toEqual(conversation.conversation);
    expect(ownerAgent.language).toBe(agent.language);
    expect(ownerAgent.disable_first_message_interruptions).toBe(
      agent.disable_first_message_interruptions,
    );
    expect(ownerPrompt.built_in_tools).toEqual(prompt.built_in_tools);
  });
});
