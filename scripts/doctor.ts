/**
 * bun run doctor
 *
 * Answers, in a few seconds, the questions that cost a team twenty minutes each
 * at the start of a hackathon and four minutes each in front of a judge: am I on
 * the right bun, are my environment variables there, is the SAT list on this
 * disk, does the CEP fixture still parse, which database is live and what is in
 * it, can I reach Nessie, has this laptop been seeded, and if the conference
 * network dies right now can I still run the demo.
 *
 * The checks themselves are in `doctor/checks.ts`, with tests. This file is the
 * wiring: it reads the world, calls them in order, prints the table and exits.
 *
 * Exit code contract: a bun version mismatch is the only failure. Everything
 * else is a warning, because a teammate writing documentation on a train
 * legitimately has no database and no key, and a doctor that fails for them is a
 * doctor nobody runs. `--strict` inverts that for the release gate and for CI:
 * any warning exits 1.
 */

import { resolve } from "node:path";
import {
  type Check,
  checkBunVersion,
  checkCepFixture,
  checkDatabase,
  checkEnv,
  checkNessie,
  checkOfflineDemo,
  checkRealCep,
  checkSatSnapshot,
  checkSeedState,
  DATABASE_CHECK,
  defaultDatabaseDeps,
  exitCode,
  isReachable,
  offlineSatSnapshot,
  plural,
  type SatSnapshotFacts,
  sentryoneTables,
} from "./doctor/checks.ts";

const ROOT = resolve(import.meta.dir, "..");
const CEP_FIXTURE = `${ROOT}/packages/cep/src/fixtures/synthetic-cep.xml`;
const CEP_REAL_DIR = `${ROOT}/packages/cep/src/fixtures/real`;

const argv = Bun.argv.slice(2);
const strict = argv.includes("--strict");

if (argv.includes("--help") || argv.includes("-h")) {
  console.log(
    [
      "bun run doctor [--strict]",
      "",
      "Checks the bun version, the environment variables, the committed SAT list",
      "snapshot, the CEP fixture, the live database path and its migrations, Nessie",
      "reachability, the seed state, and whether this laptop can demo offline.",
      "",
      "  --strict   exit 1 on any warning, for the release gate and for CI.",
      "             Without it only a bun version mismatch fails.",
      "  --help     this text.",
    ].join("\n"),
  );
  process.exit(0);
}

async function readText(path: string): Promise<string | undefined> {
  const file = Bun.file(path);
  return (await file.exists()) ? file.text() : undefined;
}

/** The snapshot's own metadata, read through @hackmty/sat rather than the CSV. */
async function satSnapshotFacts(): Promise<{
  facts?: SatSnapshotFacts;
  error?: string;
}> {
  try {
    const sat = await import("../packages/sat/src/official.ts");
    const snapshot = await sat.loadOfficialSnapshot();
    return {
      facts: {
        filename: sat.OFFICIAL_SNAPSHOT_FILENAME,
        listVersion: snapshot.listVersion,
        retrievedAt: sat.OFFICIAL_SNAPSHOT_RETRIEVED_AT,
        sourceUrl: sat.OFFICIAL_SNAPSHOT_URL,
        rows: snapshot.rows,
        taxpayers: new Set(snapshot.entries.map((entry) => entry.rfc)).size,
        situations: snapshot.entries.length,
      },
    };
  } catch (cause) {
    return { error: cause instanceof Error ? cause.message : String(cause) };
  }
}

const checks: Check[] = [];

// 1. bun version, the only check that can fail the command.
checks.push(
  checkBunVersion({
    pinned: (await readText(`${ROOT}/.bun-version`))?.trim(),
    running: Bun.version,
  }),
);

// 2. environment, read from .env.example so the list never drifts.
checks.push(
  ...checkEnv({
    template: await readText(`${ROOT}/.env.example`),
    envFilePresent: await Bun.file(`${ROOT}/.env`).exists(),
    env: Bun.env,
  }),
);

// 3. the SAT list the lookup answers from when the SAT portal is unreachable.
const today = new Date().toISOString().slice(0, 10);
const snapshot = await satSnapshotFacts();
checks.push(checkSatSnapshot({ ...snapshot, today }));

// 4. the CEP fixture, and whether a real one has landed yet.
const cepCheck = await checkCepFixture({ path: CEP_FIXTURE });
checks.push(cepCheck, await checkRealCep({ directory: CEP_REAL_DIR }));

// 5. the database: reachable, which path, migrated, and what is in the tables.
const databaseUrl = Bun.env.DATABASE_URL;
const databaseChecks: Check[] =
  databaseUrl === undefined || databaseUrl === ""
    ? [
        {
          name: DATABASE_CHECK,
          status: "warn",
          detail: "DATABASE_URL is not set, skipped",
        },
      ]
    : await checkDatabase(databaseUrl, await defaultDatabaseDeps());
checks.push(...databaseChecks);

// 6. Nessie, through the one client that is allowed to call it.
checks.push(await checkNessie({ apiKey: Bun.env.NESSIE_API_KEY }));

// 7. seed state, so nobody rehearses against an empty screen.
checks.push(...(await checkSeedState({ root: ROOT })));

// 8. the closing question: can this laptop demo with the network unplugged.
// Each input is the fact the question turns on and not the colour of a row: a
// snapshot that is merely old is still readable, and an empty schema and an
// unmigrated one take different commands.
const offline = checkOfflineDemo({
  databaseUrl,
  databaseReachable: isReachable(databaseChecks),
  tables: sentryoneTables(databaseChecks),
  satSnapshot: offlineSatSnapshot({ ...snapshot, today }),
  cepFixture: cepCheck.status === "ok",
});
checks.push(offline);

// Report. The offline line is the conclusion, so it is printed as one, below
// the table it was computed from.
const table = checks.filter((check) => check !== offline);
const width = table.reduce(
  (longest, check) => Math.max(longest, check.name.length),
  0,
);

console.log(`doctor: bun ${Bun.version} in ${ROOT}`);
console.log("");
for (const check of table) {
  console.log(
    `[${check.status.padEnd(4)}] ${check.name.padEnd(width)}  ${check.detail}`,
  );
}
console.log("");
console.log(`offline demo: ${offline.detail}`);

const warnings = checks.filter((check) => check.status === "warn").length;
const failed = checks.filter((check) => check.status === "fail").length;
const code = exitCode(checks, strict);

console.log("");
if (failed > 0) {
  console.log(
    "FAIL: bun version mismatch. Nothing else in this list can fail the command.",
  );
} else if (code === 0) {
  console.log(
    `OK: ${plural(checks.length - warnings, "check")} clean, ${plural(warnings, "warning")}.${strict ? " --strict and nothing warned." : " Only a bun mismatch fails."}`,
  );
} else {
  console.log(
    `FAIL: ${plural(warnings, "warning")} and --strict. Without --strict this run would have exited 0.`,
  );
}

process.exit(code);
