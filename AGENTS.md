# CapitalOneHackMTY, agent contract

This file is the single source of truth for anyone and anything working in this repo. `AGENTS.md`
is the filename every coding-assistant tool reads natively, and `CLAUDE.md` is a single import line
pointing here, so there is one file to maintain, nothing to synchronize and nothing that can drift.

## What this is

HackMTY 2026, Capital One challenge. Arena Borregos, Tec de Monterrey.

- Hacking: 2026-09-11 20:00 to 2026-09-13 08:00 local time, 36 hours.
- Judging starts 2026-09-13 09:00. Closing 13:00.
- Monterrey is UTC-6 year round, no DST. Every time in this repo is local unless it says UTC.
- Submission: hackmty-26.devpost.com.

Challenge overview, verbatim: "How can we leverage real-time financial data and intelligent
automation to build resilient tools that empower individuals, protect businesses, and safeguard
digital capital?"

- Track: TODO(product), one of the three, decided in `docs/adr/0002-track-and-thesis.md`.
- Thesis, one sentence: TODO(product) <who> can <outcome> because we <mechanism nobody else has>.

Read `docs/00-challenge.md` next. Before writing code, read "Where things live" and
"Nessie quirks" below. Judging is continuous: 2 to 3 engineers and 1 product person walk up to
the table during the 36 hours and probe logic, architecture and data structures. They are
explicitly looking for prototypes that only pretend to work, so every claim in this repo has to
be backed by a file, a test or a run.

## Non-negotiables

- **bun only.** Never npm, npx, yarn or pnpm. They are denied in `.claude/settings.json`.
- **Pin exact versions. Never `@latest`.** A new dependency must have been published more than
  3 days ago (supply-chain quarantine, enforced by `minimumReleaseAge` in `bunfig.toml`).
  The vetted pin table is in `CONTRIBUTING.md`. Do not edit `minimumReleaseAge`.
- **This is a TEAM repo: never push to `main` or `dev`.** Branch from `dev`, open the PR against
  `dev` (`gh pr create --base dev`), one approval, squash merge. `main` only receives release PRs
  from `dev` (merge commit, tagged). The `pre-push` hook enforces it whatever the refspec. This
  overrides any personal-repo habit of pushing to main.
- **No AI attribution anywhere.** No `Co-Authored-By`, no "Generated with", no tool credit, in
  commits, PR bodies, issues, review comments or docs. `.claude/settings.json` sets
  `includeCoAuthoredBy` to false and `.githooks/commit-msg` is the backstop that rejects the commit.
- **Few, meaningful commits.** One logical commit per PR. Granular noise reads as machine output.
- **No em dashes in prose. No emoji in docs, commits, YAML or UI copy.** Plain ASCII punctuation.
- **Never invent data.** No unconfirmed partners, endorsements, roles, prices or statistics.
  Cite the primary source or cut the claim. Use `TODO(<owner>)` for anything not decided yet.
- Whoever adds a dependency commits `bun.lock` in the same PR. Never hand-merge `bun.lock`.
- Synthetic data only. No real PII, ever, including in issues and screenshots. See `SECURITY.md`.

## Deploy target (ADR-0005)

Default, unless `docs/adr/0005-deploy-target.md` says otherwise: `apps/web` is a static build on
Vercel, and `apps/api` is a Hono app on the **Node runtime**.

Consequence, and it is a hard one: **`apps/api` may import no `bun:*` modules at all.** Do not
reach for `bun:sqlite`, `bun:ffi` or `Bun.serve` specifics in that workspace. Bun remains the
local runtime, the test runner, the package manager and the script runner everywhere else.
If the ADR is changed, change this section in the same PR.

## Where things live

- `packages/core`, **the intelligence**. Pure functions, zero dependencies, unit-tested.
  New algorithmic logic goes here, never in a route handler. This is the file an engineer opens
  when they ask how it works, so it has to read well.
- `packages/nessie`, the only place that talks to Nessie. Read "Nessie quirks" before touching it.
  Tests run against recorded fixtures in `src/fixtures/`, with no network.
- `packages/seed`, deterministic synthetic Mexican transaction generator, fixed RNG seed.
- `packages/db`, schema, migrations and SQL. Raw SQL through `postgres`, no ORM. Postgres only,
  no SQLite. `0001_init.sql` runs on any Postgres 16+. `0002_timescale.sql` is applied only when
  the `timescaledb` extension exists, so a plain local Postgres 18 works as the offline fallback.
- `apps/api`, thin Hono transport: HTTP, validation, streaming. No business logic.
- `apps/web`, the judge-facing UI. Vite, React, Tailwind, motion.
- `scripts/`, `doctor`, `migrate`, `seed`, `reset`, `demo`.
- `docs/`, 00 to 14, the judged narrative. `docs/01-rubric-mapping.md` is the traceability matrix
  and it is the first doc to update when new evidence lands.
- `docs/adr/`, the decisions. ADRs are the cheapest high-credibility artifact in this repo.

## Commands

```
bun run doctor                    # versions, env vars, DB reachability
bun install --frozen-lockfile     # never plain bun install in CI
bun run dev | bun test | bun run typecheck | bun run build
bun run migrate                   # 0001 always, 0002 only if timescaledb is available
bun run seed                      # idempotent, prints the demo IDs
bun run demo                      # drives the demo path headless, green before any rehearsal
```

Every workspace `package.json` must define `typecheck` as `tsc --noEmit` and a `build`
(`echo ok` is fine for `packages/*`), otherwise the root `--filter '*'` scripts skip it silently
and CI goes green having checked nothing.

## Nessie quirks (verified, do not rediscover)

- HTTPS only. `http://` is refused at the connection level.
- Auth is `?key=<NESSIE_API_KEY>` in the query string. No headers.
- `403 {"message":"Missing Authentication Token"}` means WRONG PATH, not a bad key.
  Do not regenerate the key.
- Sub-collections live under `/accounts/{id}/{purchases,bills,deposits,withdrawals,loans,transfers}`.
  There is no top-level `/bills`, `/loans`, `/purchases` or `/withdrawals`.
- Empty sub-collections are inconsistent: some return `200 []`, `/transfers` returns 404 with a
  bare JSON string. Map 404 to `[]` and tolerate string bodies.
- Dates are `YYYY-MM-DD` with NO time. Intraday velocity is impossible from Nessie fields.
  Our own ledger holds `timestamptz`.
- `amount` mixes int and float. `_id` mixes UUID and ObjectId. Never validate the shape.
- `status` is observed as `"completed"` and `"pending"`. Treat it as an open string set.
- `/enterprise/*` is a GLOBAL pool shared with every other team and it is contaminated.
  Never compute on it. Read only our own key's data. Never POST anything identifying there.

## Rubric (CONFIRMED, sums to 100)

| Criterion | Points | Sub-criteria |
|---|---|---|
| Originality | 30 | Substantiated competitive differentiation 10, Identification of market gap 10, Non trivial solution 10 |
| Technical Depth | 25 | Data foundation 6, Algorithmic logic and intelligence 9, System design 5, Quality and functional demo 5 |
| Impact and Feasibility | 25 | Substantiated business model 10, Market size TAM/SAM/SOM 5, Regulatory and operational feasibility 5, Adoption strategy GTM 5 |
| Design and Experience | 20 | Specific user persona 7, Structured user journey map 7, Pitch 6 |

The most common past failure, stated by Capital One, is repetition. Winners had a clear
differentiator, a very specific audience and a niche problem. Originality is the single heaviest
weight, so a generic idea cannot be recovered by engineering later.

Third-party LLMs are allowed, with explicit awareness of data privacy, banking regulation,
ethical and reputational risk, and cost per transaction. The architectural rule that follows from
that is in `docs/06-regulatory-privacy.md`: no LLM in the per-transaction hot path.

Every change should survive "why?" asked three times. `docs/12-judge-qa.md` is the answer sheet.

## Definition of done

- `bun run typecheck` and `bun test` pass.
- Evidence is attached to the PR: a screenshot, a terminal capture, a test name or a CI run link.
- `CHANGELOG.md` `[Unreleased]` is updated in the same commit.
- `docs/01-rubric-mapping.md` is updated if this is new rubric evidence.
- The demo script in `docs/10-demo-script.md` is still true. If the path changed, regenerate it.

## Team and ownership

| Person | Handle | Owns | The judge question they answer |
|---|---|---|---|
| Patricio Garza | `garzario` | Lead, intelligence, architecture: `packages/core`, `packages/db`, ADRs, CI, `docs/07`, `docs/08`, all merges | How does the algorithm work, and why is that the right model? |
| Fabian | `fabbyyyy` | Data platform, API, deploy: `apps/api`, `packages/nessie`, `packages/seed`, `scripts/`, `docs/09` | Where does the data come from, and what happens at ten times the volume? |
| Adan | `Apanawa` | Frontend, UX, motion: `apps/web`, the design system, `assets/` | Walk me through what the user actually sees. |
| Fabricio | `FabriBanda` | Narrative, docs, market, pitch: `docs/00` to `06`, `10`, `11`, `13`, `14`, README, Devpost, video | Who is this for, how big is it, and how do you make money? |

Narrative is a full seat, not a leftover. Roughly half the rubric lives in `docs/` and the pitch:
impact, design, and the market and differentiation half of originality. Do not reassign that seat
to code because code feels more urgent at 03:00.

`.github/CODEOWNERS` encodes this mapping. The last matching rule wins, so the lead's paths are
listed last on purpose. Do not reorder that file.

## Milestones

| # | Milestone | Local due | Exit criteria |
|---|---|---|---|
| 1 | M0 Setup | 11 Sep 22:00 | Repo bootstrapped and public, ADR-0001, 0002 and 0005 merged, all four pass `bun run doctor`, Nessie key in hand |
| 2 | M1 Vertical slice | 12 Sep 04:00 | Seeded data to engine to API to one real screen, deployed and clickable. Ugly is fine, fake is not. **Hard scope-cut gate.** |
| 3 | M2 Core intelligence | 12 Sep 13:00 | The differentiating algorithm works on seeded data, with tests proving the named edge cases |
| 4 | M3 Polish and docs | 12 Sep 20:00 | `docs/00` to `11` merged, UI presentable, rubric self-score at or above 80, `docs/13-devpost.md` written. **FEATURE FREEZE.** |
| 5 | M4 Demo-ready | 13 Sep 00:00 | `bun run demo` green, video recorded and uploaded, Devpost draft submitted, two team rehearsals done, `v1.0.0` tagged |
| 6 | M5 Submission | 13 Sep 08:00 | Devpost finalised, README with the GIF, `docs/14-process.md` linked, one dry run with all four |

Two rules attached to the table. **M1 at 04:00 is the real gate**: if there is no deployed
end-to-end slice by 04:00, cut scope immediately and do not debug. The gate belongs to whoever is
awake, and waking the lead is the correct action rather than an escalation. **After the 20:00
feature freeze on the 12th, only `P0-demo-blocker` issues merge.**

## Review flow and stall rule

1. The author opens the PR through the `pr-flow` skill, with evidence attached and the risky part
   named under "For the reviewer".
2. Automated pass: run `/code-review high --comment` on the PR. Inline findings land as the
   author's own account, with no attribution lines anywhere.
3. Human pass: the CODEOWNERS owner for the touched paths reviews. Target at least two
   substantive comments per PR: a question, a suggestion, or a "this will break when X".
   A bare approve with no comment does not count.
4. The author replies in the thread, pushes a fixup, and resolves the thread saying what changed.
   The resolved conversation is the artifact a judge scrolls, and the best three go into
   `docs/14-process.md`.
5. Merge: squash, by the reviewer or by the lead. Normally never the author.
6. Rotation: Patricio is reviewed by Fabian. Fabian by Patricio, or Adan for API-shape questions.
   Adan by Fabricio, or Patricio for data contracts. Fabricio by Adan, or Patricio for `docs/07`,
   `docs/08` and the ADRs. Nobody reviews the same area twice in a row.
7. **Stall rule, because half the team is asleep by design.** A PR waiting 45 minutes gets pinged
   in the channel. At 90 minutes the lead reviews it regardless of rotation. If nobody with review
   rights is awake, the author merges their own PR, writes `merged unreviewed at <time>, nobody
   awake` in the PR body, and raises it at the next standup. The reviewer then leaves a real review
   comment on the merged PR, which still appears in the history. A stalled PR at hour 20 is worse
   than an imperfect merge.
8. Quality target by M5: every PR has one approval or a recorded stall-rule note, at least two
   review comments, zero direct pushes to `main` or `dev`, and `git log dev --oneline` reads as a story.

## How to work with AI agents here

- **One agent per workstream per person.** Four people running three parallel agents each on a
  shared monorepo at 03:00 produces merge conflicts faster than it produces features. Two agents
  must never hold the same files.
- **Plan mode before any multi-file edit.** Read the plan, cut it, then run it. A plan that
  touches `packages/core` and `apps/api` and `docs/` in one pass is a plan to review three times.
- **Never start a long run right before a rehearsal or a judge visit.** A half-applied refactor at
  minute 30 of a four-minute demo window is an unforced loss. Freeze, demo, then resume.
- **Bounded seats keep context small.** The two Pro-plan seats work one file per session, clear
  context often, and hand the issue to a long-run seat rather than waiting out a rate-limit window.
  The two long-run seats take the multi-file builds: engine, API, seeder, migrations.
- **Research is not evidence.** Any number that reaches `docs/04-market.md` or
  `docs/05-business-model.md` must be verified at the primary source and cited there. A fabricated
  statistic found by a judge costs more than the point it was worth.
- **The agent reads this file, so fix this file.** If an agent keeps making the same wrong choice,
  the bug is a missing line here, not a missing reminder in the prompt.
