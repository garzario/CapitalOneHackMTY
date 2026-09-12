/**
 * bun run release-check
 *
 * The one command to run before opening the release pull request from `dev` to
 * `main`. It runs the five gates that decide whether a tag is honest, in the
 * order that fails cheapest first, and stops at the first red one so the output
 * is the failure rather than a wall.
 *
 *   typecheck   every workspace compiles
 *   test        every test passes
 *   build       the web bundle and every package build
 *   demo        the five beats of docs/10-demo-script.md, headless
 *   scrub       no secret in the tree, the history or the commit messages
 *
 * It asserts nothing about the state of the world it cannot see: it does not
 * tag, does not push, does not talk to Vercel and does not talk to GitHub. The
 * commands that do those things are written out in
 * `docs/playbooks/release.md`, to be run by a person who has read this output.
 *
 * The reason it exists at all is that `demo` and `scrub` are the two gates CI
 * does not run, and they are the two that decide whether the submission is
 * presentable and whether it is safe to leave public.
 *
 * Exit code contract: 0 only when all five are green.
 */

import { resolve } from "node:path";

const ROOT = resolve(import.meta.dir, "..");

interface Gate {
  name: string;
  /** Why a release is not a release without it. */
  why: string;
  command: string[];
}

const GATES: Gate[] = [
  {
    name: "typecheck",
    why: "a workspace that does not compile cannot be tagged",
    command: ["bun", "run", "typecheck"],
  },
  {
    name: "test",
    why: "the engine's claims are the tests, so a red test is a false claim",
    command: ["bun", "test", "--pass-with-no-tests"],
  },
  {
    name: "build",
    why: "Vercel builds the same way, so a red build here is a red deploy there",
    command: ["bun", "run", "build"],
  },
  {
    name: "demo",
    why: "the five beats of docs/10-demo-script.md are what the judges see",
    command: ["bun", "run", "demo"],
  },
  {
    name: "scrub",
    why: "this repository is public, and a tag makes the history permanent",
    command: ["bun", "run", "scrub"],
  },
];

interface Result {
  gate: Gate;
  ok: boolean;
  ms: number;
  output: string;
}

/**
 * A failing gate is read, not skimmed, so nothing is cut unless there is a lot
 * of it. Head and tail both, because `bun test` puts the reason at the end and
 * `scrub` puts it at the top, and a tail-only excerpt hides half of them.
 */
function excerpt(output: string): string[] {
  const lines = output.split("\n");
  if (lines.length <= 60) return lines;
  return [
    ...lines.slice(0, 12),
    `... ${lines.length - 52} lines not shown, run the command itself for all of them ...`,
    ...lines.slice(-40),
  ];
}

const verbose = Bun.argv.includes("--verbose");
const results: Result[] = [];

console.log(
  `release-check: ${GATES.length} gates, first red one stops the run`,
);
console.log("");

for (const gate of GATES) {
  // Only on a terminal. Redirected to a file or a CI log, a carriage return
  // leaves the "running" line glued to the result line.
  if (process.stdout.isTTY) {
    process.stdout.write(`[....] ${gate.name.padEnd(9)}  running\r`);
  }
  const started = Date.now();
  const proc = Bun.spawn(gate.command, {
    cwd: ROOT,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  const code = await proc.exited;
  const ms = Date.now() - started;
  const output = `${stdout}${stderr}`.trimEnd();
  const ok = code === 0;
  results.push({ gate, ok, ms, output });

  console.log(
    `[${ok ? "ok  " : "FAIL"}] ${gate.name.padEnd(9)}  ${gate.command.join(" ")}, ${(ms / 1000).toFixed(1)}s`,
  );
  if (verbose && ok) {
    for (const line of output.split("\n")) console.log(`         ${line}`);
  }
  if (!ok) {
    console.log("");
    console.log(`${gate.name} said, with exit code ${code}:`);
    for (const line of excerpt(output)) console.log(`  ${line}`);
    break;
  }
}

console.log("");

const failed = results.find((result) => !result.ok);
if (failed !== undefined) {
  const remaining = GATES.length - results.length;
  console.log(`FAIL: ${failed.gate.name}. ${failed.gate.why}.`);
  if (remaining > 0) {
    console.log(
      `${remaining} gate${remaining === 1 ? "" : "s"} not run. Fix this one and run again.`,
    );
  }
  console.log("Do not open the release pull request, and do not tag.");
  process.exit(1);
}

const seconds = (
  results.reduce((total, result) => total + result.ms, 0) / 1000
).toFixed(1);
console.log(`OK: ${results.length} gates green in ${seconds}s.`);
console.log(
  "Next: docs/playbooks/release.md. Nothing in this command tagged, pushed or deployed anything.",
);
process.exit(0);
