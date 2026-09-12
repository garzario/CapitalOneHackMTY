/**
 * bun run doctor
 *
 * Answers, in under five seconds, the four questions that cost a team twenty minutes
 * each at the start of a hackathon: am I on the right bun, are my environment
 * variables there, can I reach the database, and can I reach Nessie.
 *
 * Exit code contract: a bun version mismatch is the only failure. Everything else is
 * a warning, because a teammate writing documentation on a train legitimately has no
 * database and no key, and a doctor that fails for them is a doctor nobody runs.
 */

import { resolve } from "node:path";

const ROOT = resolve(import.meta.dir, "..");
const DB_TIMEOUT_MS = 2000;
const NESSIE_TIMEOUT_MS = 4000;

type Status = "ok" | "warn" | "fail";

interface Check {
  name: string;
  status: Status;
  detail: string;
}

const checks: Check[] = [];

function add(name: string, status: Status, detail: string): void {
  checks.push({ name, status, detail });
}

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

async function readText(path: string): Promise<string | undefined> {
  const file = Bun.file(path);
  return (await file.exists()) ? file.text() : undefined;
}

/** Keeps a password out of the terminal and out of a screen recording. */
function redactUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const database = parsed.pathname.replace(/^\//, "");
    return `${parsed.protocol}//${parsed.hostname}:${parsed.port || "5432"}/${database}`;
  } catch {
    return "unparsable DATABASE_URL";
  }
}

// 1. bun version, the only check that can fail the command.
let bunMismatch = false;
const pinned = (await readText(`${ROOT}/.bun-version`))?.trim();
if (pinned === undefined) {
  add(
    "bun version",
    "warn",
    `.bun-version is missing, running bun ${Bun.version}`,
  );
} else if (pinned === Bun.version) {
  add("bun version", "ok", `bun ${Bun.version} matches .bun-version`);
} else {
  bunMismatch = true;
  add(
    "bun version",
    "fail",
    `bun ${Bun.version} but .bun-version pins ${pinned}. Fix it with: curl -fsSL https://bun.sh/install | bash -s "bun-v${pinned}"`,
  );
}

// 2. environment, read from .env.example so this list never drifts.
const template = await readText(`${ROOT}/.env.example`);
if (template === undefined) {
  add(
    "env template",
    "warn",
    ".env.example is missing, cannot tell which variables matter",
  );
} else {
  const hasEnvFile = await Bun.file(`${ROOT}/.env`).exists();
  add(
    ".env",
    hasEnvFile ? "ok" : "warn",
    hasEnvFile
      ? "present, bun loads it automatically"
      : "missing, run: cp .env.example .env",
  );

  const keys = template
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "" && !line.startsWith("#"))
    .map((line) => line.split("=")[0]?.trim() ?? "")
    .filter((key) => key !== "");

  for (const key of keys) {
    const value = Bun.env[key];
    const present = value !== undefined && value !== "";
    add(
      `env ${key}`,
      present ? "ok" : "warn",
      present
        ? `set, ${value.length} characters`
        : "empty, needed only if that integration is in play",
    );
  }
}

// 3. database, with a hard timeout so a dead host cannot hang the command.
const databaseUrl = Bun.env.DATABASE_URL;
if (databaseUrl === undefined || databaseUrl === "") {
  add("database", "warn", "DATABASE_URL is not set, skipped");
} else {
  try {
    const db = await import("../packages/db/src/index.ts");
    const sql = db.createSql(databaseUrl);
    try {
      const probe = await db.probe(sql, DB_TIMEOUT_MS);
      if (probe.ok) {
        add(
          "database",
          "ok",
          `${redactUrl(databaseUrl)} answered in ${probe.ms}ms`,
        );

        const timescale = await db.hasTimescale(sql);
        if (timescale) {
          const hypertable = await db.isHypertable(sql);
          add(
            "timeseries path",
            "ok",
            hypertable
              ? "timescaledb installed and ledger_tx is a hypertable"
              : "timescaledb available but ledger_tx is a plain table, run: bun run migrate",
          );
        } else {
          add(
            "timeseries path",
            "ok",
            "plain Postgres, the offline fallback path is live",
          );
        }

        try {
          const queries = await import("../packages/db/src/queries.ts");
          const rows = await queries.countLedgerTx(sql);
          const latest = await queries.latestOccurredAt(sql);
          add(
            "ledger_tx",
            rows > 0 ? "ok" : "warn",
            rows > 0
              ? `${rows} rows, newest ${latest ?? "unknown"}`
              : "empty, run: bun run seed",
          );
        } catch (cause) {
          add(
            "ledger_tx",
            "warn",
            `not queryable yet (${cause instanceof Error ? cause.message : String(cause)}), run: bun run migrate`,
          );
        }
      } else {
        add(
          "database",
          "warn",
          `unreachable: ${probe.error ?? "unknown error"}`,
        );
      }
    } finally {
      await sql.end({ timeout: 1 });
    }
  } catch (cause) {
    add(
      "database",
      "warn",
      cause instanceof Error ? cause.message : String(cause),
    );
  }
}

// 4. Nessie, through the one client that is allowed to call it.
const nessieKey = Bun.env.NESSIE_API_KEY;
if (nessieKey === undefined || nessieKey === "") {
  add("nessie", "warn", "NESSIE_API_KEY is not set, skipped");
} else {
  const { NessieClient, NessiePathError } = await import(
    "../packages/nessie/src/client.ts"
  );
  const client = new NessieClient({
    apiKey: nessieKey,
    timeoutMs: NESSIE_TIMEOUT_MS,
    maxRetries: 0,
  });
  const started = Date.now();
  try {
    const accounts = await client.listAccounts();
    add(
      "nessie",
      "ok",
      `GET /accounts returned ${accounts.length} accounts in ${Date.now() - started}ms`,
    );
  } catch (cause) {
    if (cause instanceof NessiePathError) {
      add(
        "nessie",
        "warn",
        "403 Missing Authentication Token, which means a wrong path, not a bad key",
      );
    } else {
      add(
        "nessie",
        "warn",
        cause instanceof Error ? cause.message : String(cause),
      );
    }
  }
}

// 5. seed state, so nobody rehearses against an empty screen.
const seedFile = `${ROOT}/.seed/ids.json`;
if (await Bun.file(seedFile).exists()) {
  try {
    const state = (await Bun.file(seedFile).json()) as {
      heroAccountId?: string;
      window?: unknown;
    };
    add(
      "seed",
      "ok",
      `.seed/ids.json present, hero account ${state.heroAccountId ?? "unknown"}`,
    );
  } catch {
    add(
      "seed",
      "warn",
      ".seed/ids.json is unreadable, run: bun run seed --force",
    );
  }
} else {
  add("seed", "warn", "no .seed/ids.json yet, run: bun run seed");
}

// Report.
const width = checks.reduce(
  (longest, check) => Math.max(longest, check.name.length),
  0,
);
console.log(`doctor: bun ${Bun.version} in ${ROOT}`);
console.log("");
for (const check of checks) {
  console.log(
    `[${check.status.padEnd(4)}] ${check.name.padEnd(width)}  ${check.detail}`,
  );
}
const warnings = checks.filter((check) => check.status === "warn").length;
console.log("");
console.log(
  bunMismatch
    ? "FAIL: bun version mismatch. Nothing else in this list can fail the command."
    : `OK: ${plural(checks.length - warnings, "check")} clean, ${plural(warnings, "warning")}. Only a bun mismatch fails.`,
);

process.exit(bunMismatch ? 1 : 0);
