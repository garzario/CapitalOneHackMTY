/**
 * bun run voice-setup [--dry-run] [--config scripts/voice-agent.json]
 *
 * Creates the verification agent at the voice provider from a JSON config, or
 * updates it when `ELEVENLABS_AGENT_ID` already names one, then prints the ids
 * to paste into `.env`.
 *
 * Two reasons this is a script and not a route. The agent is created once per
 * account and lives longer than any process here, so a request handler that
 * could create one is a request handler that will create forty. And the script
 * is where the script text becomes reviewable: `--dry-run` prints the exact
 * `conversation_config` that would be sent, with no key and no network, which
 * is how the team reads the wording before a real supplier hears it.
 *
 * The system prompt is `VERIFICATION_TEMPLATE` in `packages/voice/src/script.ts`
 * with its `{{name}}` slots still empty. No supplier, no amount and no account
 * is ever pushed to the provider: those travel per call as dynamic variables, so
 * what this script uploads is the rules and nothing about anybody's money.
 * `VERIFICATION_VARIABLE_DEFAULTS` goes with it, as the sentence the agent says
 * if a call ever arrives with no variables at all.
 */

import { resolve } from "node:path";
import {
  buildAgentBody,
  VERIFICATION_TEMPLATE,
  VERIFICATION_VARIABLE_DEFAULTS,
  VoiceClient,
  VoiceError,
} from "../packages/voice/src/index.ts";

const ROOT = resolve(import.meta.dir, "..");
const DEFAULT_CONFIG = `${ROOT}/scripts/voice-agent.json`;

interface AgentFile {
  name?: string;
  /** Fills the `{{company}}` slot when a call sends no variables of its own. */
  companyName?: string;
  language?: string;
  maxDurationSeconds?: number;
  voiceId?: string;
  ttsModelId?: string;
}

function flag(name: string): boolean {
  return Bun.argv.includes(`--${name}`);
}

function option(name: string): string | undefined {
  const at = Bun.argv.indexOf(`--${name}`);

  return at === -1 ? undefined : Bun.argv[at + 1];
}

function env(name: string): string | undefined {
  const value = Bun.env[name];

  return value === undefined || value.trim() === "" ? undefined : value.trim();
}

/** Anything absent falls back to a value that is obviously a placeholder. */
async function readConfig(path: string): Promise<AgentFile> {
  const file = Bun.file(path);

  if (!(await file.exists())) {
    console.error(`No config at ${path}. Copy ${DEFAULT_CONFIG} and edit it.`);
    process.exit(1);
  }

  return (await file.json()) as AgentFile;
}

const configPath = option("config") ?? DEFAULT_CONFIG;
const config = await readConfig(configPath);
const dryRun = flag("dry-run");

const defaults = {
  ...VERIFICATION_VARIABLE_DEFAULTS,
  ...(config.companyName === undefined || config.companyName === ""
    ? {}
    : { company: config.companyName }),
};

const agentConfig = {
  name: config.name ?? "SentryOne, verificacion de cuenta",
  systemPrompt: VERIFICATION_TEMPLATE.systemPrompt,
  firstMessage: VERIFICATION_TEMPLATE.firstMessage,
  dynamicVariableDefaults: defaults,
  ...(config.language === undefined ? {} : { language: config.language }),
  ...(config.voiceId === undefined || config.voiceId === ""
    ? {}
    : { voiceId: config.voiceId }),
  ...(config.ttsModelId === undefined || config.ttsModelId === ""
    ? {}
    : { ttsModelId: config.ttsModelId }),
  ...(config.maxDurationSeconds === undefined
    ? {}
    : { maxDurationSeconds: config.maxDurationSeconds }),
};

console.log(`config      ${configPath}`);
console.log("");
console.log("The agent is stored with the slots empty:");
console.log(`  ${VERIFICATION_TEMPLATE.firstMessage}`);
console.log("");
console.log("And with these values for a call that sends none of its own:");
for (const [name, value] of Object.entries(defaults)) {
  console.log(`  {{${name}}} ${value}`);
}
console.log("");

if (dryRun) {
  console.log("--dry-run, nothing was sent. The body would be:");
  console.log(JSON.stringify(buildAgentBody(agentConfig), null, 2));
  process.exit(0);
}

const apiKey = env("ELEVENLABS_API_KEY");
if (apiKey === undefined) {
  console.error(
    "ELEVENLABS_API_KEY is not set. Put it in .env, or run with --dry-run to read the script without an account.",
  );
  process.exit(1);
}

const client = new VoiceClient({ apiKey, http: fetch });
const existing = env("ELEVENLABS_AGENT_ID");

try {
  const { agentId } =
    existing === undefined
      ? await client.createAgent(agentConfig)
      : await client.updateAgent(existing, agentConfig);

  console.log(existing === undefined ? "agent created" : "agent updated");
  console.log("");
  console.log("Put these in .env:");
  console.log(`ELEVENLABS_AGENT_ID=${agentId}`);

  const numbers = await client.listPhoneNumbers();

  if (numbers.length === 0) {
    console.log("ELEVENLABS_PHONE_NUMBER_ID=");
    console.log("");
    console.log(
      "This account has no telephone number yet. Connect one in the ElevenLabs dashboard, or use the browser fallback at /verify-call, which needs no number.",
    );
  } else {
    for (const number of numbers) {
      console.log(
        `ELEVENLABS_PHONE_NUMBER_ID=${number.phoneNumberId}  # ${number.phoneNumber} ${number.provider} ${number.label}`,
      );
    }
  }
} catch (thrown) {
  const error = thrown as VoiceError;

  console.error(
    error instanceof VoiceError
      ? `the voice provider refused: ${error.code}, ${error.message}`
      : `the voice provider could not be reached: ${String(thrown)}`,
  );
  process.exit(1);
}
