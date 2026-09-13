/**
 * bun run scrub
 *
 * The pre-submission secret scrub. It runs one set of rules over three
 * surfaces, because a repository can be clean in all three ways that matter
 * separately and still leak:
 *
 *   1. the working tree, every file git tracks right now,
 *   2. the history, every blob reachable from every ref including branches
 *      nobody merged, because this repository is public and a deleted branch
 *      is not a deleted object,
 *   3. the commit messages, which no diff scan ever reads.
 *
 * A history hit is reported as `dev/main` or as `branch`, because that is what
 * decides the remediation: a branch nobody merged is fixed with an amend and a
 * force-push by its author, and `dev` or `main` is the "If a key leaks" path in
 * SECURITY.md. A `branch` hit has one trap worth knowing before acting on it,
 * printed with the finding: `git rev-list --all` walks remote-tracking refs, so a
 * branch that was merged and deleted on the remote keeps answering out of a clone
 * that has not run `git fetch --prune`, and there is no branch left to amend.
 *
 * It reads blobs through `git cat-file --batch` rather than `git log -p` on
 * purpose. `git log -p` calls the committed SAT list binary, because the file
 * is ISO-8859-1, and prints "Binary files differ" instead of its 4.5 MB of
 * content. A scrub that silently skips the largest file in the repository is
 * worse than no scrub, so this one decides what is binary itself, by looking
 * for a NUL byte.
 *
 * Nothing it prints is the secret it found. A scrub is run under time pressure
 * on a screen that is often being recorded, so every hit is reported as its
 * rule, its location and a masked preview.
 *
 * Exit code contract: 0 only when no rule hit anything that the allow list in
 * this file does not explain. Anything else is a failure, and the first step
 * after a failure is always "revoke and rotate at the provider", never
 * "rewrite history". See SECURITY.md.
 */

import { resolve } from "node:path";

const ROOT = resolve(import.meta.dir, "..");

/** Bytes of a file we look at before deciding it is binary. */
const BINARY_SNIFF_BYTES = 8192;

interface Rule {
  /** Identifiers (not credentials) are checked in the working tree only: history cannot be rewritten during the event and rotation does not apply. */
  treeOnly?: boolean;
  id: string;
  /** What the pattern is looking for, in the words of a person who is tired. */
  what: string;
  pattern: RegExp;
}

interface Allow {
  /** Rule id this entry forgives. */
  rule: string;
  /** The matched text it forgives. Absent means any match. */
  match?: RegExp;
  /** Where it is forgiven. Absent means anywhere. */
  path?: RegExp;
  /** Why this is not a secret. Every entry needs one. */
  why: string;
}

interface Hit {
  rule: string;
  surface: string;
  where: string;
  line: number;
  preview: string;
}

/**
 * The rules.
 *
 * Every pattern here is written so that it does not match its own source, which
 * is why the key shapes are spelled as character classes rather than examples.
 * A rule that flags this file is a rule nobody can keep.
 */
const RULES: Rule[] = [
  {
    id: "private-key",
    what: "a PEM private key block",
    pattern: /-----BEGIN (?:[A-Z]+ )*PRIVATE KEY-----/g,
  },
  {
    id: "sk-token",
    what: "an sk-prefixed API key, the shape ElevenLabs and Stripe issue",
    pattern: /\bsk_[A-Za-z0-9]{16,}/g,
  },
  {
    id: "google-key",
    what: "a Google API key, the shape a Gemini key has",
    pattern: /\bAIza[0-9A-Za-z_-]{30,}/g,
  },
  {
    id: "aq-token",
    what: "a long AQ-prefixed opaque token",
    pattern: /\bAQ[A-Za-z0-9_-]{20,}/g,
  },
  {
    id: "twilio-sid",
    what: "a Twilio account SID, AC followed by 32 hex digits",
    pattern: /\bAC[0-9a-fA-F]{32}\b/g,
  },
  {
    id: "hex32",
    what: "a bare 32 hex digit token, the shape of a Nessie key",
    pattern: /\b[0-9a-f]{32}\b/g,
  },
  {
    id: "bearer",
    what: "an Authorization bearer token",
    pattern: /\bBearer[ \t]+[A-Za-z0-9._~+/=-]{12,}/g,
  },
  {
    id: "assigned-secret",
    what: "a secret-shaped name assigned a long literal",
    pattern:
      /\b(?:api[_-]?key|apikey|secret|token|password|passwd|credential)\b["'`]?\s*[:=]\s*["'`][^"'`\n]{16,}["'`]/gi,
  },
  {
    id: "mx-phone",
    what: "a Mexican telephone number",
    treeOnly: true,
    pattern: /\+52[ ]?1?[ ]?\d[\d .-]{8,}\d/g,
  },
  {
    id: "attribution",
    what: "AI attribution, which this repository does not carry anywhere",
    pattern: /^[ \t]*co-authored-by:.*(claude|anthropic|openai|chatgpt|codex|copilot|cursor|gemini|devin|\[bot\]|noreply@anthropic)|generated with \[/gim,
  },
];

/**
 * The allow list. Each entry is a claim that a match is not a secret, and the
 * claim is checkable: open the path and read it.
 */
const ALLOW: Allow[] = [
  {
    rule: "mx-phone",
    match: /^\+528112345678$/,
    why: "the sequential fixture number the voice tests dial, digits 1 to 8, dialled by nobody",
  },
  {
    rule: "mx-phone",
    match: /^\+528100000000$/,
    why: "the all-zero fixture number the ElevenLabs client tests read back",
  },
  {
    rule: "mx-phone",
    match: /^\+52 81 1234 5678$/,
    why: "the same sequential fixture written with spaces, the case that proves isE164 rejects it",
  },
  {
    rule: "attribution",
    path: /^(?:\.githooks\/commit-msg|scripts\/scrub\.ts|SECURITY\.md|AGENTS\.md|CONTRIBUTING\.md|docs\/playbooks\/[a-z-]+\.md|\.claude\/skills\/[a-z-]+\/SKILL\.md)$/,
    why: "the files that state and enforce the no-attribution rule have to name the trailer they block, including the playbook copies that PR #61 moved out of .claude",
  },
  {
    rule: "hex32",
    /* Spelled with a trailing character class rather than as the literal id, for the
       reason the rules above are: an allow entry written out in full is 32 hex digits
       in this file, and the rule would then flag its own allow list. */
    match: /^056f69366b5345a386bb8149f1700c1[0-9a-f]$/,
    path: /^docs\/05-business-model\.md$/,
    why: "the document id of the SAP Business One Service Layer API Reference on help.sap.com, inside the citation URL of source 97 of docs/05. A public documentation address anybody can open, and the rule fires on it only because a Nessie key is also 32 hex digits",
  },
  {
    rule: "assigned-secret",
    match: /"test-key-not-a-real-one"$/,
    why: "the extractor unit tests name their placeholder key in the value itself, and the tests reach no socket",
  },
  {
    rule: "assigned-secret",
    match: /"fixture-run-no-key-needed"$/,
    why: "scripts/extract-demo.ts replays a recorded fixture with the http client replaced, so the field is filled only to satisfy the type",
  },
];

function allowed(rule: string, path: string, match: string): Allow | undefined {
  return ALLOW.find(
    (entry) =>
      entry.rule === rule &&
      (entry.match === undefined || entry.match.test(match)) &&
      (entry.path === undefined || entry.path.test(path)),
  );
}

/** Never print what was found. Four characters and a length is enough to act. */
function mask(match: string): string {
  const head = match.slice(0, 4);
  return `${head}... ${match.length} characters`;
}

function lineOf(text: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index; i++) {
    if (text.charCodeAt(i) === 10) line++;
  }
  return line;
}

const hits: Hit[] = [];
const suppressed: Allow[] = [];

function scan(surface: string, where: string, path: string, text: string) {
  for (const rule of RULES) {
    if (rule.treeOnly && surface !== "tree") continue;
    rule.pattern.lastIndex = 0;
    let match: RegExpExecArray | null = rule.pattern.exec(text);
    while (match !== null) {
      const found = match[0];
      const excuse = allowed(rule.id, path, found);
      if (excuse === undefined) {
        hits.push({
          rule: rule.id,
          surface,
          where,
          line: lineOf(text, match.index),
          preview: mask(found),
        });
      } else {
        suppressed.push(excuse);
      }
      match = rule.pattern.exec(text);
    }
  }
}

async function git(args: string[], stdin?: string): Promise<Uint8Array> {
  const proc = Bun.spawn(["git", ...args], {
    cwd: ROOT,
    stdin: stdin === undefined ? "ignore" : new TextEncoder().encode(stdin),
    stdout: "pipe",
    stderr: "pipe",
  });
  const out = new Uint8Array(await new Response(proc.stdout).arrayBuffer());
  const code = await proc.exited;
  if (code !== 0) {
    const err = await new Response(proc.stderr).text();
    throw new Error(`git ${args[0]} exited ${code}: ${err.trim()}`);
  }
  return out;
}

async function gitText(args: string[], stdin?: string): Promise<string> {
  return new TextDecoder().decode(await git(args, stdin));
}

/**
 * Latin-1, so every byte becomes exactly one character. The rules are ASCII,
 * and this way the ISO-8859-1 SAT snapshot is scanned as itself rather than as
 * a field of replacement characters.
 */
const bytes = new TextDecoder("latin1");

function isBinary(body: Uint8Array): boolean {
  const end = Math.min(body.length, BINARY_SNIFF_BYTES);
  for (let i = 0; i < end; i++) {
    if (body[i] === 0) return true;
  }
  return false;
}

/** A path that is an environment file, whatever directory it sits in. */
function isEnvFile(path: string): boolean {
  const name = path.split("/").pop() ?? "";
  return name.startsWith(".env") && name !== ".env.example";
}

// ---------------------------------------------------------------------------
// Surface 1, the working tree.
// ---------------------------------------------------------------------------

const tracked = (await gitText(["ls-files", "-z"]))
  .split("\0")
  .filter((path) => path !== "");

let treeFiles = 0;
let treeSkipped = 0;
for (const path of tracked) {
  const body = new Uint8Array(await Bun.file(`${ROOT}/${path}`).arrayBuffer());
  if (isBinary(body)) {
    treeSkipped++;
    continue;
  }
  treeFiles++;
  scan("tree", path, path, bytes.decode(body));
}

// ---------------------------------------------------------------------------
// Surface 2, every blob in the history, each one read once.
// ---------------------------------------------------------------------------

/**
 * The blobs reachable from the two long-lived branches.
 *
 * This is the difference between the two remediations and it is the first thing
 * the reader of a hit needs. A hit only on an unmerged branch is fixed with an
 * amend and a force-push on that branch, tonight, by its author. A hit on `dev`
 * or `main` is the "If a key leaks" path in SECURITY.md: revoke at the provider
 * first, and rewriting history is a separate decision made afterwards.
 */
const MAINLINE = ["dev", "main", "origin/dev", "origin/main"];
const mainline = new Set<string>();
for (const ref of MAINLINE) {
  const exists = Bun.spawnSync(
    ["git", "rev-parse", "--verify", "--quiet", ref],
    {
      cwd: ROOT,
    },
  );
  if (exists.exitCode !== 0) continue;
  for (const line of (await gitText(["rev-list", "--objects", ref])).split(
    "\n",
  )) {
    const space = line.indexOf(" ");
    mainline.add(space === -1 ? line : line.slice(0, space));
  }
}

const paths = new Map<string, Set<string>>();
for (const line of (await gitText(["rev-list", "--objects", "--all"])).split(
  "\n",
)) {
  const space = line.indexOf(" ");
  if (space === -1) continue;
  const sha = line.slice(0, space);
  const path = line.slice(space + 1);
  const seen = paths.get(sha) ?? new Set<string>();
  seen.add(path);
  paths.set(sha, seen);
}

const blobs: string[] = [];
if (paths.size > 0) {
  const check = await gitText(
    ["cat-file", "--batch-check=%(objectname) %(objecttype)"],
    `${[...paths.keys()].join("\n")}\n`,
  );
  for (const line of check.split("\n")) {
    const [sha, type] = line.split(" ");
    if (type === "blob" && sha !== undefined) blobs.push(sha);
  }
}

let historyBlobs = 0;
let historySkipped = 0;
if (blobs.length > 0) {
  // The `git cat-file --batch` stream is a header line, then exactly the
  // announced number of bytes, then a newline, repeated. Parsing it by hand is
  // what lets one pass read every version of every file.
  const stream = await git(["cat-file", "--batch"], `${blobs.join("\n")}\n`);
  let cursor = 0;
  while (cursor < stream.length) {
    const newline = stream.indexOf(10, cursor);
    if (newline === -1) break;
    const header = bytes.decode(stream.subarray(cursor, newline));
    const [sha, , sizeText] = header.split(" ");
    const size = Number(sizeText);
    if (sha === undefined || Number.isNaN(size)) {
      cursor = newline + 1;
      continue;
    }
    const body = stream.subarray(newline + 1, newline + 1 + size);
    cursor = newline + 1 + size + 1;
    if (isBinary(body)) {
      historySkipped++;
      continue;
    }
    historyBlobs++;
    const known = [...(paths.get(sha) ?? new Set<string>())].sort();
    const label = known.length === 0 ? sha.slice(0, 8) : known.join(", ");
    const surface = mainline.has(sha) ? "dev/main" : "branch";
    // The allow list keys on one path, so a blob that lived at several paths is
    // forgiven only where every one of them is forgiven.
    for (const path of known.length === 0 ? [""] : known) {
      scan(surface, label, path, bytes.decode(body));
    }
  }
}

// ---------------------------------------------------------------------------
// Surface 3, the commit messages.
// ---------------------------------------------------------------------------

const messages = (
  await gitText(["log", "--all", "--format=%H%x1f%B%x1e"])
).split("\x1e");
let commits = 0;
for (const record of messages) {
  const [sha, body] = record.replace(/^\n/, "").split("\x1f");
  if (sha === undefined || body === undefined || sha === "") continue;
  commits++;
  /* The sha is passed where a file scan passes a path, so an allow entry can name
     one commit. A message already on `dev` cannot be amended and rewriting shared
     history during the build night is the wrong trade, so the only way to record a
     finding nobody can fix is to key it on the commit it is in. It keys on the whole
     sha and not on the short one: an allow list that forgave a prefix would forgive
     whatever else collided with it later. */
  scan("commit", sha.slice(0, 8), sha, body);
}

// ---------------------------------------------------------------------------
// The checks that are not a regular expression.
// ---------------------------------------------------------------------------

interface Check {
  name: string;
  ok: boolean;
  detail: string;
}

const checks: Check[] = [];

// An .env file, in the tree or anywhere in the history. .env.example is the one
// committed environment file and it is the only exception.
const envInTree = tracked.filter(isEnvFile);
const envEverCommitted = [...paths.values()]
  .flatMap((set) => [...set])
  .filter((path) => path !== "" && isEnvFile(path));
const envPaths = [...new Set([...envInTree, ...envEverCommitted])].sort();
checks.push({
  name: "env files",
  ok: envPaths.length === 0,
  detail:
    envPaths.length === 0
      ? "no .env file is tracked and none was ever committed"
      : `committed at some point: ${envPaths.join(", ")}`,
});

// .env.example is a list of names. A value in it is a value someone pasted.
const exampleFile = Bun.file(`${ROOT}/.env.example`);
if (await exampleFile.exists()) {
  const filled = (await exampleFile.text())
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "" && !line.startsWith("#"))
    .filter((line) => {
      const value = line.slice(line.indexOf("=") + 1).trim();
      // A documented non-secret default, such as the model name, is allowed as
      // long as it is not long enough to be a key.
      return value !== "" && value.length > 24;
    });
  checks.push({
    name: ".env.example",
    ok: filled.length === 0,
    detail:
      filled.length === 0
        ? "names only, no value long enough to be a key"
        : `has values: ${filled.map((line) => line.split("=")[0]).join(", ")}`,
  });
}

// The CEP fixtures are the one place in the repository where a real person's
// name could hide behind a plausible document, so they are checked positively:
// every name and every RFC in them has to carry the synthetic marker.
const fixtureFiles = tracked.filter((path) =>
  /^packages\/cep\/src\/fixtures\//.test(path),
);
const unmarked: string[] = [];
for (const path of fixtureFiles) {
  const text = await Bun.file(`${ROOT}/${path}`).text();
  for (const match of text.matchAll(/Nombre="([^"]+)"/g)) {
    const name = (match[1] ?? "").toUpperCase();
    if (!name.includes("SINTETIC") && !name.includes("SINTÉTIC")) {
      unmarked.push(`${path}: a Nombre with no synthetic marker`);
    }
  }
  for (const match of text.matchAll(/RFC="([^"]+)"/g)) {
    if (!(match[1] ?? "").toUpperCase().startsWith("SYN")) {
      unmarked.push(`${path}: an RFC outside the SYN prefix`);
    }
  }
}
checks.push({
  name: "cep fixtures",
  ok: unmarked.length === 0,
  detail:
    unmarked.length === 0
      ? `${fixtureFiles.length} fixture file${fixtureFiles.length === 1 ? "" : "s"}, every name and RFC marked synthetic`
      : unmarked.join("; "),
});

// ---------------------------------------------------------------------------
// Report.
// ---------------------------------------------------------------------------

console.log(
  `scrub: ${treeFiles} tracked text files, ${historyBlobs} history blobs, ${commits} commit messages`,
);
console.log(
  `       skipped as binary: ${treeSkipped} in the tree, ${historySkipped} in the history`,
);
console.log("");

const width = Math.max(
  ...checks.map((check) => check.name.length),
  ...RULES.map((rule) => rule.id.length),
);

for (const check of checks) {
  console.log(
    `[${check.ok ? "ok  " : "HIT "}] ${check.name.padEnd(width)}  ${check.detail}`,
  );
}

for (const rule of RULES) {
  const found = hits.filter((hit) => hit.rule === rule.id);
  if (found.length === 0) {
    console.log(
      `[ok  ] ${rule.id.padEnd(width)}  clean, looked for ${rule.what}`,
    );
    continue;
  }
  console.log(
    `[HIT ] ${rule.id.padEnd(width)}  ${found.length} match${found.length === 1 ? "" : "es"} of ${rule.what}`,
  );
  for (const hit of found.slice(0, 10)) {
    console.log(
      `         ${hit.surface.padEnd(8)} ${hit.where}:${hit.line}  ${hit.preview}`,
    );
  }
  if (found.length > 10) {
    console.log(`         and ${found.length - 10} more`);
  }
}

console.log("");
if (suppressed.length > 0) {
  const reasons = [...new Set(suppressed.map((entry) => entry.why))];
  console.log(`${suppressed.length} matches allowed by name:`);
  for (const reason of reasons) console.log(`  - ${reason}`);
  console.log("");
}

const failedChecks = checks.filter((check) => !check.ok).length;
const total = hits.length + failedChecks;
if (total === 0) {
  console.log(
    "OK: nothing to revoke. Rotation after the ceremony is still due, see SECURITY.md.",
  );
  process.exit(0);
}

console.log(
  `FAIL: ${total} finding${total === 1 ? "" : "s"}. Revoke and rotate at the provider first, then tell the lead. SECURITY.md, "If a key leaks".`,
);

// The second column of a hit is the remediation, so it is spelled out rather
// than left as a label nobody decodes at 03:00.
const onBranch = hits.some((hit) => hit.surface === "branch");
const onMainline = hits.some((hit) => hit.surface === "dev/main");
if (hits.some((hit) => hit.surface === "tree")) {
  console.log(
    "  tree      in the working tree right now. Fix the file before anything else.",
  );
}
if (onBranch) {
  console.log(
    "  branch    on a side branch, not on dev or main. Its author amends and force-pushes that branch. No history rewrite.",
  );
  console.log(
    "            Check the branch still exists first. `git rev-list --all` walks remote-tracking refs, so a branch that was",
  );
  console.log(
    "            merged and deleted on the remote keeps answering here until somebody prunes, and then there is nothing to amend:",
  );
  console.log(
    "            `git branch -r --contains <sha>` names it, `git ls-remote --heads origin <branch>` says whether it is still there,",
  );
  console.log(
    "            and `git fetch --prune` is the fix, in every clone. It happened on 2026-09-12, which is why it is printed here.",
  );
}
if (onMainline) {
  console.log(
    "  dev/main  reachable from a long-lived branch. Rotating the value is the fix. Rewriting history is a separate decision, and during the event it is usually the wrong one.",
  );
}
if (hits.some((hit) => hit.surface === "commit")) {
  console.log(
    "  commit    in a commit message, which no diff scan reads and no file edit removes. `git log -1 <sha>` shows it. A message",
  );
  console.log(
    "            already on dev or main cannot be amended, so rotate the value; one on a side branch is amended with that branch.",
  );
}
process.exit(1);
