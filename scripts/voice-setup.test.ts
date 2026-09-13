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
 * Nothing here touches the network and nothing needs a key: `buildAgentBody` is
 * a pure function and the config is a file in this repository.
 */

import { describe, expect, test } from "bun:test";
import { resolve } from "node:path";
import {
  buildAgentBody,
  VERIFICATION_TEMPLATE,
  VERIFICATION_VARIABLE_DEFAULTS,
} from "../packages/voice/src/index.ts";

const ROOT = resolve(import.meta.dir, "..");
const CONFIG_PATH = `${ROOT}/scripts/voice-agent.json`;

/** Any run of five or more digits. A CLABE is eighteen, a mobile is twelve. */
const LONG_DIGIT_RUN = /\d{5,}/;

const config = await Bun.file(CONFIG_PATH).json();

/** The body as the script builds it, config and defaults included. */
const body = buildAgentBody({
  name: config.name,
  systemPrompt: VERIFICATION_TEMPLATE.systemPrompt,
  firstMessage: VERIFICATION_TEMPLATE.firstMessage,
  dynamicVariableDefaults: {
    ...VERIFICATION_VARIABLE_DEFAULTS,
    company: config.companyName,
  },
  language: config.language,
  maxDurationSeconds: config.maxDurationSeconds,
});

describe("scripts/voice-agent.json", () => {
  test("carries no account and no long run of digits", () => {
    const raw = JSON.stringify(config);

    expect(raw).not.toMatch(LONG_DIGIT_RUN);
    expect(config).not.toHaveProperty("sample");
  });

  test("still names the company and caps the call", () => {
    expect(config.companyName).toBe("SentryOne");
    expect(config.maxDurationSeconds).toBe(150);
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
    const conversation = body.conversation_config as Record<string, unknown>;
    const agent = conversation.agent as Record<string, unknown>;
    const prompt = agent.prompt as Record<string, unknown>;

    expect(prompt.prompt).toContain("{{question}}");
    expect(prompt.prompt).toContain("{{account_last4}}");
    expect(agent.first_message).toContain("{{supplier}}");
  });

  /** A slot nothing fills would be spoken as the literal text. */
  test("uploads a default for every slot the template carries", () => {
    const conversation = body.conversation_config as Record<string, unknown>;
    const agent = conversation.agent as Record<string, unknown>;
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
});
