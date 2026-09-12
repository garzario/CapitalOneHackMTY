/**
 * bun run doctor
 *
 * Answers, in a few seconds, the questions that cost a team twenty minutes each
 * at the start of a hackathon and four minutes each in front of a judge: am I on
 * the right bun, are my environment variables there, is the SAT list on this
 * disk, does the CEP fixture still parse, which database is live and what is in
 * it, can I reach Nessie, does this laptop hold a consortium snapshot to decide
 * from, has it been seeded, and if the conference network dies right now can I
 * still run the demo.
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
import { readConsortiumEnv } from "../packages/consortium/src/index.ts";
import {
  type Check,
  type ConsortiumSnapshotFacts,
  checkBunVersion,
  checkCepFixture,
  checkDatabase,
  checkEnv,
  checkNessie,
  checkOfflineDemo,
  checkRealCep,
  checkSatSnapshot,
  checkSeedState,
  checkSnowflake,
  DATABASE_CHECK,
  defaultDatabaseDeps,
  exitCode,
  isReachable,
  type NessieMirrorState,
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
      "reachability, the consortium snapshot, the seed state, and whether this laptop",
      "can demo offline.",
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

/** True when `SNOWFLAKE_PRIVATE_KEY_PATH` points at a file this laptop can read. */
async function keyFileReadable(path: string): Promise<boolean> {
  if (path.trim() === "") {
    return false;
  }
  try {
    return await Bun.file(path.trim()).exists();
  } catch {
    return false;
  }
}

/**
 * The one row of `consortium_pull`, or undefined.
 *
 * Every failure is undefined on purpose: no database, an unmigrated schema and an
 * empty snapshot all mean "the engine has no network to read", and the check says
 * which one in its own sentence rather than throwing here.
 */
async function consortiumSnapshotFacts(
  url?: string,
): Promise<ConsortiumSnapshotFacts | undefined> {
  if (url === undefined || url === "") {
    return undefined;
  }
  const db = await import("../packages/db/src/index.ts");
  const queries = await import("../packages/db/src/queries.ts");
  const sql = db.createSql(url);
  try {
    const pull = await queries.getConsortiumPull(sql);
    return pull === undefined
      ? undefined
      : { pulledAt: pull.pulledAt, source: pull.source, rows: pull.rows };
  } catch {
    return undefined;
  } finally {
    await sql.end({ timeout: 5 });
  }
}

/** A state file that is missing, or that somebody edited by hand, is not a failure. */
async function readJson(path: string): Promise<unknown> {
  const file = Bun.file(path);
  if (!(await file.exists())) {
    return undefined;
  }
  try {
    return await file.json();
  } catch {
    return undefined;
  }
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

/**
 * What the local consortium snapshot holds, read through the same database the
 * section above just probed.
 *
 * Undefined when there is no database, when the migration has not run, or when
 * nothing has ever been pulled, and the check below says which of those it is. A
 * failure here is never an error: a teammate with no database has no snapshot, and
 * that is a warning and not a broken laptop.
 */
const consortiumSnapshot = await consortiumSnapshotFacts(databaseUrl);

// 6. Nessie: a read for reachability, and the mirror state for the key. The
// write that validates the key belongs to `bun run nessie:mirror`, so the
// doctor reads what it recorded and stays side-effect free.
const mirrorState = (await readJson(`${ROOT}/.seed/nessie.json`)) as
  | NessieMirrorState
  | undefined;
checks.push(
  await checkNessie({
    apiKey: Bun.env.NESSIE_API_KEY,
    ...(mirrorState === undefined ? {} : { mirror: mirrorState }),
  }),
);

// 6b. the consortium: is it on, is there an account, and is there a snapshot this
// laptop can decide from. The snapshot read is folded into the database section's
// connection so the doctor still opens exactly one, and it is skipped with the
// rest when DATABASE_URL is empty.
checks.push(
  checkSnowflake({
    ...readConsortiumEnv(Bun.env),
    keyPresent: await keyFileReadable(Bun.env.SNOWFLAKE_PRIVATE_KEY_PATH ?? ""),
    ...(consortiumSnapshot === undefined
      ? {}
      : { snapshot: consortiumSnapshot }),
  }),
);

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
