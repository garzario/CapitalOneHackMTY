/**
 * bun run offline
 *
 * The rehearsal nobody wants to improvise: the whole demo path with every
 * outward call closed.
 *
 * Conference Wi-Fi dying is the expected case and not the unlucky one, and the
 * failure it produces is not the one a missing key produces. A server with no
 * `GEMINI_API_KEY` refuses politely in a code path we wrote. A server whose
 * uplink is gone has a key, tries, and waits for a socket that never answers.
 * Only the second one happens at Arena Borregos, so the keys stay in `.env` and
 * the network is what goes away.
 *
 * It does not go away by guessing which hosts to close. The first version of
 * this script pointed the outward base URLs at a closed port and was green for
 * a reason that had nothing to do with the network: `NESSIE_BASE_URL` is a
 * constant in `packages/nessie/src/client.ts` and not an environment variable,
 * so setting it did nothing at all. A list of hosts somebody remembered can
 * only ever prove the hosts on the list.
 *
 * So `scripts/offline-guard.ts` is preloaded into the run and replaces `fetch`
 * with one that refuses anything that is not loopback. Nothing is assumed and
 * nothing is listed: a call that leaves the machine throws with its URL in the
 * message, which is the failure and the diagnosis at once. The local Postgres
 * keeps working, because it speaks its own protocol over a socket and not
 * `fetch`, and that is the point rather than an exception.
 *
 * The honest limit, and the reason the checklist still says to turn the Wi-Fi
 * off once before the room fills up: a dependency that opens a raw socket walks
 * straight past this.
 *
 * Exit code 0 when the offline path is ready. Anything else is a night's work
 * found early rather than at minute two of four.
 */

import { spawn } from "node:child_process";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dir, "..");

/** The preload that turns every non-loopback `fetch` into a thrown error. */
export const GUARD = "scripts/offline-guard.ts";

/**
 * Switches that let a code path reach outward at all.
 *
 * Emptied as well as guarded, because a path that is switched off never reaches
 * the guard, and a rehearsal should exercise the configuration the demo will
 * actually run under: `ALLOW_CONSORTIUM` unset is the state `docs/10` calls
 * green, with the network reading as not consulted.
 */
export const OUTWARD_SWITCHES = [
  "ALLOW_CEP_FETCH",
  "ALLOW_CONSORTIUM",
] as const;

interface Step {
  name: string;
  command: readonly string[];
  /**
   * A line the step must print to count as having run.
   *
   * Exit code alone is not enough and this is not hypothetical: an earlier
   * version of this file invoked the demo as `bun run scripts/demo.ts`, bun
   * read it as a package script it did not have, printed its own help and
   * exited 0, and the rehearsal reported green without running a single beat.
   * A false green here is worse than no rehearsal.
   */
  expect: string;
  /** Printed when the step fails, to say what to do rather than what broke. */
  remedy: string;
}

const STEPS: readonly Step[] = [
  {
    name: "doctor",
    // Not guarded. Doctor's job is to report what it can and cannot reach, and
    // a thrown fetch would turn a diagnosis into a crash.
    command: ["bun", "run", "scripts/doctor.ts"],
    expect: "offline demo:",
    remedy:
      "read the lines it printed: the database, the migrations and the seed are the three that stop an offline demo",
  },
  {
    name: "demo",
    command: ["bun", "--preload", `./${GUARD}`, "scripts/demo.ts"],
    expect: "demo path is green",
    remedy:
      "the beat that failed is the beat that will fail in front of the room. An OfflineViolation names the host something reached for",
  },
];

export function offlineEnv(
  from: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  const env = { ...from };
  for (const name of OUTWARD_SWITCHES) {
    env[name] = "";
  }
  return env;
}

function run(step: Step, env: NodeJS.ProcessEnv): Promise<boolean> {
  return new Promise((done) => {
    const [command, ...args] = step.command;
    const child = spawn(command as string, args, {
      cwd: ROOT,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    const lines: string[] = [];
    const keep = (chunk: Buffer) => lines.push(chunk.toString());
    child.stdout.on("data", keep);
    child.stderr.on("data", keep);

    child.on("close", (code) => {
      const output = lines.join("");
      // The whole output, not a summary. A rehearsal that hides the thing that
      // degraded is a rehearsal of a demo nobody is going to give.
      console.log(output.trimEnd());
      done(code === 0 && output.includes(step.expect));
    });
  });
}

async function main(): Promise<void> {
  console.log("offline rehearsal: every fetch that is not loopback throws");
  console.log(`  preload ${GUARD}`);
  console.log(`  ${OUTWARD_SWITCHES.join(", ")} -> empty`);
  console.log(
    "  the keys stay in .env on purpose: a dead uplink is not a missing key",
  );
  console.log(
    "  the local Postgres keeps working: it is a socket, not a fetch",
  );
  console.log("");

  const env = offlineEnv();
  const failed: Step[] = [];

  for (const step of STEPS) {
    console.log(`--- ${step.name}`);
    const ran = await run(step, env);
    console.log("");
    if (!ran) {
      failed.push(step);
    }
  }

  if (failed.length > 0) {
    for (const step of failed) {
      console.log(`offline rehearsal FAILED at ${step.name}: ${step.remedy}`);
    }
    process.exit(1);
  }

  console.log(
    "offline rehearsal green: the demo path made no call off this machine.",
  );
  console.log(
    "Once, before the room fills up, turn the Wi-Fi off and run it again: this",
  );
  console.log(
    "guard replaces fetch, and a dependency that opens a raw socket walks past it.",
  );
}

if (import.meta.main) {
  await main();
}
