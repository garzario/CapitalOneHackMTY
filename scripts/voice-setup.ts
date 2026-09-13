/**
 * bun run voice-setup [--owner] [--dry-run] [--config scripts/voice-agent.json]
 *
 * Creates the verification agent at the voice provider from a JSON config, or
 * updates it when `ELEVENLABS_AGENT_ID` already names one, then prints the ids
 * to paste into `.env`.
 *
 * **`--owner` is the second line, not a second script.** The guided tour of
 * `apps/api/src/routes/tour.ts` telephones the OWNER of the company and asks
 * what to do with a payment the control held, which is a different script and a
 * different question, so it is a second agent at the provider. It is created and
 * updated from this same file on purpose: one flag decides the name, the prompt
 * and the environment variable, and every other field of the body is the same
 * expression, so the two lines cannot drift apart on a turn timeout or a voice
 * that somebody tuned on a live call. The id it prints goes in
 * `ELEVENLABS_OWNER_AGENT_ID`, and an agent id is not a secret: it names a
 * configuration, it authorises nothing, and the key stays the key.
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
 *
 * **It reads the agent before it writes it.** An update is a `PATCH` carrying
 * only the fields this repository sets, which the API merges into the stored
 * agent, so nothing nobody configured here is clobbered. The `GET` in front of
 * it turns that from a claim into a printed diff: every field the body sets is
 * shown as the live value against the new one, and a rerun that would revert a
 * fix somebody made in the dashboard says so on the terminal before it sends.
 *
 * The voice id is the one value that is not in the config file. It lives in
 * `ELEVENLABS_VOICE_ID`, the way the key does, and it is printed masked, because
 * this script is run under time pressure on a screen that is often recorded.
 */

import { resolve } from "node:path";
import {
  buildAgentBody,
  DEFAULT_OWNER_NAME,
  OWNER_CLOSING_LINE,
  OWNER_TEMPLATE,
  OWNER_VARIABLE_DEFAULTS,
  VERIFICATION_CLOSING_LINE,
  VERIFICATION_TEMPLATE,
  VERIFICATION_VARIABLE_DEFAULTS,
  VoiceClient,
  VoiceError,
} from "../packages/voice/src/index.ts";

const ROOT = resolve(import.meta.dir, "..");
const DEFAULT_CONFIG = `${ROOT}/scripts/voice-agent.json`;

/**
 * The committed half of the agent configuration.
 *
 * Everything here is a setting somebody can read in a pull request. What is
 * deliberately absent is the voice id and the key, which are `.env` only, and
 * anything per-instruction, which travels per call.
 */
interface AgentFile {
  name?: string;
  /** What the owner agent is called in the dashboard, under `--owner`. */
  ownerAgentName?: string;
  /** Fills the `{{company}}` slot when a call sends no variables of its own. */
  companyName?: string;
  /** Fills the `{{caller}}` slot on the same terms. */
  callerName?: string;
  /** Fills the `{{owner}}` slot of the owner line, on the same terms. */
  ownerName?: string;
  language?: string;
  maxDurationSeconds?: number;
  ttsModelId?: string;
  optimizeStreamingLatency?: number;
  stability?: number;
  similarityBoost?: number;
  speed?: number;
  turnTimeoutSeconds?: number;
  turnEagerness?: string;
  speculativeTurn?: boolean;
  disableFirstMessageInterruptions?: boolean;
  endCall?: boolean;
  llm?: string;
  temperature?: number;
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

/** Four characters and a length. Never the whole id, for the reason above. */
function mask(value: string): string {
  return `${value.slice(0, 4)}... ${value.length} characters`;
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

/**
 * Every leaf of a nested object, keyed by its dotted path.
 *
 * Used on both sides of the diff, so `conversation_config.tts.stability` is
 * compared against the same path of the stored agent rather than by eye. Arrays
 * are compared whole: the only ones here are lists of enum strings, and a diff
 * of their elements would say less than a diff of the list.
 */
function leaves(
  value: unknown,
  prefix = "",
  into: Map<string, unknown> = new Map(),
): Map<string, unknown> {
  if (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.keys(value).length > 0
  ) {
    for (const [key, nested] of Object.entries(value)) {
      leaves(nested, prefix === "" ? key : `${prefix}.${key}`, into);
    }

    return into;
  }

  into.set(prefix, value);

  return into;
}

/** One line per field, so a value that changed is visible without scrolling. */
function printDiff(live: unknown, next: Record<string, unknown>): void {
  const before = leaves(live);
  let changed = 0;

  for (const [path, value] of leaves(next)) {
    /* The prompt and the first message are printed in full above, and a diff of
       four thousand characters on one line is not a diff anybody reads. */
    const shown = path.endsWith("prompt.prompt")
      ? `the prompt, ${String(value).length} characters`
      : JSON.stringify(value);
    const had = before.has(path) ? JSON.stringify(before.get(path)) : "absent";
    const same = had === JSON.stringify(value);

    if (!same) {
      changed++;
    }
    console.log(
      `  ${same ? "same" : "CHANGE"}  ${path}`,
      same ? "" : `\n          was ${had}\n          now ${shown}`,
    );
  }

  console.log("");
  console.log(
    changed === 0
      ? "Nothing would change. Every field this config sets already matches the live agent."
      : `${changed} field${changed === 1 ? "" : "s"} would change. Every other field of the live agent is left alone: the PATCH carries only what is listed above.`,
  );
  console.log("");
}

const configPath = option("config") ?? DEFAULT_CONFIG;
const config = await readConfig(configPath);
const dryRun = flag("dry-run");
const owner = flag("owner");
const voiceId = env("ELEVENLABS_VOICE_ID");

/** The company name every slot default shares, when the config names one. */
const companyName =
  config.companyName === undefined || config.companyName === ""
    ? undefined
    : config.companyName;

/**
 * Which of the two lines this run configures.
 *
 * Everything that differs between the supplier line and the owner line is in
 * this one object, and everything that does not is the same expression below. A
 * second script would have been a second place to forget a turn timeout.
 */
const line = owner
  ? {
      what: "owner" as const,
      /** The variable the id goes into. Named here so it is printed correctly. */
      idVariable: "ELEVENLABS_OWNER_AGENT_ID",
      name: config.ownerAgentName ?? "SentryOne dueño",
      template: OWNER_TEMPLATE,
      closingLine: OWNER_CLOSING_LINE,
      defaults: {
        ...OWNER_VARIABLE_DEFAULTS,
        ...(companyName === undefined ? {} : { company: companyName }),
        owner:
          config.ownerName === undefined || config.ownerName === ""
            ? DEFAULT_OWNER_NAME
            : config.ownerName,
      } as Record<string, string>,
    }
  : {
      what: "supplier" as const,
      idVariable: "ELEVENLABS_AGENT_ID",
      name: config.name ?? "SentryOne, verificacion de cuenta",
      template: VERIFICATION_TEMPLATE,
      closingLine: VERIFICATION_CLOSING_LINE,
      defaults: {
        ...VERIFICATION_VARIABLE_DEFAULTS,
        ...(companyName === undefined ? {} : { company: companyName }),
        ...(config.callerName === undefined || config.callerName === ""
          ? {}
          : { caller: config.callerName }),
      } as Record<string, string>,
    };

const defaults = line.defaults;

/** Present keys only, so an absent setting stays absent in the body. */
function set<T>(value: T | undefined, key: string): Record<string, T> {
  return value === undefined ? {} : ({ [key]: value } as Record<string, T>);
}

const agentConfig = {
  name: line.name,
  systemPrompt: line.template.systemPrompt,
  firstMessage: line.template.firstMessage,
  dynamicVariableDefaults: defaults,
  ...set(config.language, "language"),
  ...set(voiceId, "voiceId"),
  ...set(config.ttsModelId, "ttsModelId"),
  ...set(config.optimizeStreamingLatency, "optimizeStreamingLatency"),
  ...set(config.stability, "stability"),
  ...set(config.similarityBoost, "similarityBoost"),
  ...set(config.speed, "speed"),
  ...set(config.turnTimeoutSeconds, "turnTimeoutSeconds"),
  ...set(config.turnEagerness, "turnEagerness"),
  ...set(config.speculativeTurn, "speculativeTurn"),
  ...set(
    config.disableFirstMessageInterruptions,
    "disableFirstMessageInterruptions",
  ),
  ...set(config.endCall, "endCall"),
  ...set(config.llm, "llm"),
  ...set(config.temperature, "temperature"),
  ...set(config.maxDurationSeconds, "maxDurationSeconds"),
};

console.log(`config      ${configPath}`);
console.log(
  `line        ${line.what === "owner" ? "the owner call of the guided tour" : "the verification call to the supplier"}`,
);
console.log(
  `voice       ${voiceId === undefined ? "not set. ELEVENLABS_VOICE_ID is empty, so the provider default is used" : mask(voiceId)}`,
);
console.log("");
console.log("The agent is stored with the slots empty:");
console.log(`  ${line.template.firstMessage}`);
console.log("");
console.log("And it hangs up on this line, every time:");
console.log(`  ${line.closingLine}`);
console.log("");
console.log("With these values for a call that sends none of its own:");
for (const [name, value] of Object.entries(defaults)) {
  console.log(`  {{${name}}} ${value}`);
}
console.log("");

/** The body, with the voice id masked. What is printed is never the id. */
function printable(body: Record<string, unknown>): string {
  const json = JSON.stringify(body, null, 2);

  return voiceId === undefined ? json : json.replaceAll(voiceId, mask(voiceId));
}

if (dryRun) {
  console.log("--dry-run, nothing was sent. The body would be:");
  console.log(printable(buildAgentBody(agentConfig)));
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
const existing = env(line.idVariable);

try {
  if (existing !== undefined) {
    /* Read before write. Printed as a diff, so an update that would revert a
       live fix is visible on the terminal that is about to send it. */
    const live = await client.getAgent(existing);

    console.log("The live agent, against what this config would send:");
    printDiff(live, buildAgentBody(agentConfig));
  }

  const { agentId } =
    existing === undefined
      ? await client.createAgent(agentConfig)
      : await client.updateAgent(existing, agentConfig);

  console.log(existing === undefined ? "agent created" : "agent updated");
  console.log("");
  console.log("Put these in .env:");
  console.log(`${line.idVariable}=${agentId}`);

  /* The owner line dials from the number the supplier line already uses, so
     there is nothing new to print and listing them again would read as a second
     number to connect. */
  if (line.what === "owner") {
    console.log("");
    console.log(
      "The owner call dials from ELEVENLABS_PHONE_NUMBER_ID, the same number the verification call uses. With ALLOW_TOUR_CALLS=1 as well, POST /api/v1/tour/call rings a visitor.",
    );
    process.exit(0);
  }

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
        `ELEVENLABS_PHONE_NUMBER_ID=${number.phoneNumberId}  # ${number.provider} ${number.label}`,
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
