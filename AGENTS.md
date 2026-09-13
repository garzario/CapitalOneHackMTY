# CapitalOneHackMTY, agent contract

This file is the single source of truth for anyone and anything working in this repo. `AGENTS.md`
is the filename every coding-assistant tool reads natively. Vendor config stays local and gitignored; see `docs/playbooks/agent-setup.md`.

## What this is

HackMTY 2026, Capital One challenge. Arena Borregos, Tec de Monterrey.

- Hacking: 2026-09-11 20:00 to 2026-09-13 08:00 local time, 36 hours.
- Judging starts 2026-09-13 09:00. Closing 13:00.
- Monterrey is UTC-6 year round, no DST. Every time in this repo is local unless it says UTC.
- Submission: hackmty-26.devpost.com.

Challenge overview, verbatim: "How can we leverage real-time financial data and intelligent
automation to build resilient tools that empower individuals, protect businesses, and safeguard
digital capital?"

- Track: 3, Real-Time Anomaly & Security Sentinel. Product: SentryOne (sentryone.tech). Decided in `docs/adr/0002-track-and-thesis.md`, read it first.
- Thesis: the payments clerk of a Mexican SMB can stop a fiscally toxic, duplicated or misdirected SPEI before it leaves, because SentryOne joins at the moment of payment the company's CFDI ledger, the SAT Article 69-B list and the Banxico-signed CEP.
- Product model: six controls (69-B with retroactive sweep, CLABE forensics, duplicates, supplier behaviour change, CEP beneficiary verification, expected-loss decision). Domain types live in `packages/core/src/domain.ts`; the HTTP contract in `docs/09-api.md`. The narrative rules in ADR-0002 are binding: the hook is fiscal (69-B) plus SPEI irreversibility, never "cambiamos de cuenta"; real RFCs never sit next to fabricated evidence; synthetic data is watermarked.

Read `docs/00-challenge.md` next. Before writing code, read "Where things live" and
"Nessie quirks" below. Judging is continuous: 2 to 3 engineers and 1 product person walk up to
the table during the 36 hours and probe logic, architecture and data structures. They are
explicitly looking for prototypes that only pretend to work, so every claim in this repo has to
be backed by a file, a test or a run.

## Non-negotiables

- **bun only.** Never npm, npx, yarn or pnpm. They are denied in the local assistant permission template (`docs/playbooks/assistant-permissions.json`).
- **Pin exact versions. Never `@latest`.** A new dependency must have been published more than
  3 days ago (supply-chain quarantine, enforced by `minimumReleaseAge` in `bunfig.toml`).
  The vetted pin table is in `CONTRIBUTING.md`. Do not edit `minimumReleaseAge`.
- **This is a TEAM repo: never push to `main` or `dev`.** Branch from `dev`, open the PR against
  `dev` (`gh pr create --base dev`), squash merge as soon as CI is green (no approval gate during the build night; reviews happen post-merge and still leave comments). `main` only receives release PRs
  from `dev` (merge commit, tagged). The `pre-push` hook enforces it whatever the refspec. This
  overrides any personal-repo habit of pushing to main.
- **No AI attribution anywhere.** No `Co-Authored-By`, no "Generated with", no tool credit, in
  commits, PR bodies, issues, review comments or docs. attribution is switched off in your local assistant config (see `docs/playbooks/agent-setup.md`) and `.githooks/commit-msg` is the backstop that rejects the commit.
- **Few, meaningful commits.** One logical commit per PR. Granular noise reads as machine output.
- **No em dashes in prose. No emoji in docs, commits, YAML or UI copy.** Plain ASCII punctuation.
- **Three levels and three states, and never a probability.** A screen or a document says
  `confiable`, `precaucion` or `alerta`, always with the findings behind it, and `rojo`, `cancelado`
  or `enviado`. Both are derived by `confidenceOf` and `transactionStateOf` in
  `packages/core/src/levels.ts` and neither is stored. No percentage, no score, and never the word
  "seguro" as a verdict, in any language: a SPEI cannot be recalled and no level is a guarantee.
  ADR-0009 carries the rule table.
- **Never invent data.** No unconfirmed partners, endorsements, roles, prices or statistics.
  Cite the primary source or cut the claim. Use `TODO(<owner>)` for anything not decided yet.
- Whoever adds a dependency commits `bun.lock` in the same PR. Never hand-merge `bun.lock`.
- Synthetic data only. No real PII, ever, including in issues and screenshots. See `SECURITY.md`.

## Deploy target (ADR-0005, as amended 2026-09-12 03:10)

`apps/web` is a static build on Vercel. `apps/api` runs on a **Vultr instance**, in docker compose
behind Caddy, because the payment-run screen reads a Server-Sent Events stream and SSE needs a
long-lived process: a function runtime with a request timeout either drops the stream or forces a
polling fallback. The amendment is written into `docs/adr/0005-deploy-target.md` itself and tracked in
#44, and `deploy/` holds the compose file, the Caddyfile and the cloud-init script. Live pair:
<https://sentryone-one.vercel.app> over <https://api.104.238.147.69.sslip.io>.

Consequence, and it is a hard one that survived the move: **`apps/api` may import no `bun:*` modules
at all.** Do not reach for `bun:sqlite`, `bun:ffi` or `Bun.serve` specifics in that workspace. It
costs nothing on a box we control and it keeps the function runtime available as a fallback if the
instance dies at 05:00, which is why a constraint that buys a fallback for free is kept. Bun remains
the local runtime, the test runner, the package manager and the script runner everywhere else.
If the ADR is changed, change this section in the same PR.

## Where things live

- `packages/core`, **the intelligence**. Pure functions, zero dependencies, unit-tested.
  New algorithmic logic goes here, never in a route handler. This is the file an engineer opens
  when they ask how it works, so it has to read well. `src/domain.ts` is the contract every package
  and app codes against, `src/decision.ts` is the sixth control, and `src/levels.ts` is the one
  place a confidence level and a transaction state are derived: `confidenceOf` and
  `transactionStateOf`, shared by the engine, the API, the screens and the generated mock so the
  four cannot disagree about a line (ADR-0009). `src/snapshot/` holds the plaza catalogue and its
  README holds the rule that goes with it: that catalogue may put a NAME on three digits and nothing
  else. It never raises a finding, never changes a severity, and a code it does not carry yields no
  name and no claim, because it is not Banxico's file and the README says so in its first paragraph.
  Read it before any screen, doc or finding quotes a plaza.
- `packages/engine`, the six controls of ADR-0002 as one call, `runControls`. It exists only
  because `packages/sat` and `packages/cep` already depend on `packages/core`, so core cannot
  import them back. Adapters only: every rule lives in core.
- `packages/nessie`, the only place that talks to Nessie. Read "Nessie quirks" before touching it.
  Tests run against recorded fixtures in `src/fixtures/`, with no network.
- `packages/rail`, the only place that sends money, and it sends two things: the 0.01 MXN
  verification probe and one line of one payment instruction for exactly that instruction's own
  amount to exactly the account it names (ADR-0008), which is why the instruction has to exist here
  before money moves. `NessieRail` writes both to the company's bank mirror (the probe verified live
  on 2026-09-12, the run on 2026-09-13 with 86 lines), `StpRail` is the documented production path
  that refuses to run without `STP_*`, `LayoutRail` writes the dispersal file a bank portal takes and
  reads the response file it hands back, and `FakeRail` is the in-process one the suite and
  `bun run demo` use. Read `README.md` in that folder before quoting any of it: it says which rail
  has run live and which has not, and it carries the counts.
- `packages/consortium`, the only place that talks to the cross-tenant network on Snowflake: the
  hashing that is the privacy boundary, the key-pair JWT, the SQL REST API with an injectable
  `fetch`, the DDL, the push and the pull, and the deterministic synthetic network the demo reads.
  Server only (`node:crypto`), never on the hot path: the engine reads the local
  `consortium_snapshot` table and a decision never waits on a warehouse. Read its README before
  quoting the consortium anywhere, because the network in this repository is synthetic and every
  claim about it has to say so.
- `packages/sat`, the two SAT lists: the loader and the version index over the committed official
  Article 69-B snapshot, `matchRfc`, the retroactive `sweep` and `priceSweep`, and article 49 Bis,
  whose listing the SAT publishes one DOF oficio at a time with no machine-readable file, so the
  lookup answers `answered: false` with the counts and the URL instead of implying a check.
- `packages/cep`, the Banxico receipt: `parseCep`, XMLDSig against the Banxico certificate byte for
  byte, and `nameMatch`. It reports `unconfirmed_scheme` rather than claiming a seal it cannot prove,
  which is why a screen may say "firma no verificada" and may never say "firma invalida".
- `packages/extract`, the only file in the repository that sends anything to a language model, and it
  may only transcribe: read a CLABE off a photo, transcribe a voice note. `src/boundary.test.ts` reads
  the package's own source and fails if it names anything from the decision layer. ADR-0004.
- `packages/voice`, the verification call to the supplier when the decision is `verify`. The agent
  reads a script this repo wrote and the outcome parser is deterministic string work and not a model,
  for the same ADR-0004 reason. None of its four outcomes releases a payment.
- `packages/constancia`, four real PDFs written on the server with no dependency and no headless
  browser: the sweep constancia, the run constancia, the one-page evidence letter of an instruction,
  and the receipt of one payment. All four carry a SHA-256 huella of the ledger range and say on the
  page that it is not an electronic signature. Pure, so the same input is byte-identical output.
- `packages/seed`, deterministic synthetic Mexican transaction generator, fixed RNG seed.
- `packages/db`, schema, migrations and SQL. Raw SQL through `postgres`, no ORM. Postgres only,
  no SQLite. Fourteen migrations, listed as `MIGRATIONS` in `src/migrate.ts` rather than discovered by
  reading the directory. The eleven plain files run on any Postgres 16+; `0002`, `0004` and `0008` are
  applied only when the `timescaledb` extension exists, so a plain local Postgres 18 works as the
  offline fallback. Never edit an applied migration: the checksum in `schema_migrations` reports it and
  the next laptop diverges.
- `apps/api`, thin Hono transport: HTTP, validation, streaming. No business logic. Every write
  carries the `X-Actor` header (`role=clerk|owner; name=...`) and the ledger event it appends
  records that name, because nothing in this product executes without a person. Two shapes need
  `role=owner` and a written reason and `decideRequirement` in `packages/core/src/actor.ts` decides
  which: a release over a line that is not `confiable`, and any decision on a line the run cancelled.
  `src/assistant/` is the panel: Gemini with function calling over nine read-only GETs of this same
  API, called in process, ending a turn with at most one `ActionProposal` that a person executes.
  It writes nothing but the conversation and the intake a screenshot becomes. ADR-0007.
- `apps/web`, the judge-facing UI. Vite, React, Tailwind, motion.
- `scripts/`, `doctor`, `migrate`, `seed`, `reset`, `demo`, `deploy-vultr`, and `web:mock`, which
  writes `apps/web/src/lib/mock-data.ts` out of the same seeded company the API serves. Edit the
  generator and regenerate; never the generated file.
- `deploy/`, what runs on the API instance: the compose file, the Caddyfile and the cloud-init
  script. The image itself is `apps/api/Dockerfile`, whose build context is the repository root.
- `docs/`, 00 to 14, the judged narrative. `docs/01-rubric-mapping.md` is the traceability matrix
  and it is the first doc to update when new evidence lands.
- `docs/adr/`, the decisions. ADRs are the cheapest high-credibility artifact in this repo. The
  three that bind the build of 12 September: 0007 the assistant reads and proposes and a person
  executes, 0008 the run leaves through a rail and only for what SentryOne already holds, 0009 the
  three levels and the three states with their exact rule table.

## Commands

```
bun run doctor                    # versions, env vars, DB reachability
bun install --frozen-lockfile     # never plain bun install in CI
bun run dev | bun test | bun run typecheck | bun run build | bun run lint
bun run eval                      # the six controls against 35 labelled cases, per control and per level
bun run scrub                     # the tree, the history and the commit messages, for secrets
bun run migrate                   # fourteen files in order; 0002, 0004 and 0008 only with timescaledb
bun run seed                      # idempotent, prints the demo IDs
bun run nessie:mirror             # pushes the company bank mirror, validates the key with a write
bun run consortium:seed           # warehouse schema plus the synthetic network, needs ALLOW_CONSORTIUM=1
bun run consortium:push           # this tenant's outcomes, hashed, never a name or an amount
bun run consortium:pull           # fills the local snapshot; --offline needs no Snowflake account
bun run demo                      # drives the demo path headless as nine checks, green before any rehearsal
bun run offline                   # the same path with every outward call closed, the conference Wi-Fi case
```

Every workspace `package.json` must define `typecheck` as `tsc --noEmit` and a `build`
(`echo ok` is fine for `packages/*`), otherwise the root `--filter '*'` scripts skip it silently
and CI goes green having checked nothing.

## Nessie quirks (verified, do not rediscover)
- Docs: https://prod.nessieisreal.com/docs. API base: https://api.nessieisreal.com (prod.nessieisreal.com only serves the docs app). The team key lives in each local `.env`, never in the repo or the chat; validated with a write on 2026-09-12.

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
- `amount` mixes int and float on the way OUT, and is stored as a whole number on the way IN:
  a purchase posted at 31320.50 reads back as 31320. Exact centavos live in our ledger, never
  in the mirror. `_id` mixes UUID and ObjectId. Never validate the shape.
- On a CREATE: merchant `category` is a bare string (the array `GET /merchants` returns is
  refused with `400 category str type expected`), and an address `state` is at most two
  characters, so "NL" and never "Nuevo Leon". Verified 2026-09-12 while seeding the mirror.
- `status` is observed as `"completed"` and `"pending"`. Treat it as an open string set, and it is
  OURS on the way in: the value posted is echoed back unchanged, so a status on a row we created is
  never the sandbox acknowledging anything. **Always post one.** A withdrawal created with no
  `status` is accepted and then breaks every read of that collection:
  `GET /accounts/{id}/withdrawals` answers `400 "1 validation error for Withdrawal / status / field
  required"` for the whole account, no route deletes a single withdrawal, and the only way back is
  the bulk `DELETE /data?type=`. Verified 2026-09-13 while closing #198, on
  `3fce172e-1591-43b8-b112-08e4491e3651`, whose withdrawal listing is refused for that reason;
  `packages/rail/README.md` carries the detail.
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

Five epics on GitHub (#80 to #84) with every issue linked as a sub-issue. Everyone builds; docs are spread by front.

| Epic | Lead | Scope |
|---|---|---|
| #80 Engine | Patricio (garzario) | `packages/core`, `packages/cep`, `packages/sat`, `packages/seed`: CFDI and payment-complement parser, CLABE forensics, duplicates and supplier behaviour, CEP signature verification, expected-loss decision, Nessie reconciliation, SAT list loader and retroactive sweep, synthetic company, Gemini extraction (photo and voice note, extraction only), ElevenLabs verification call, the deployed vertical slice |
| #81 Data platform and API | Fabian (fabbyyyy) | `packages/db`, `apps/api`: ledger on Tiger Data with continuous aggregates, read and write endpoints per `docs/09-api.md`, SSE, Nessie mirror, scripts (doctor, demo), architecture and data-model docs |
| #82 UI/UX | Fabricio (FabriBanda) designs, Fabricio and Adan (Apanawa) build | `apps/web`: brand and design system, screen designs and flows, payment run and finding panel (Fabricio), QR intake, SAT replay, CEP viewer, metrics and polish (Adan), persona and journey research, demo script and judge Q&A, printed judge card, blind holdout cases and the metrics harness, constancia PDF (Adan) |
| #83 Infrastructure and release | Fabian (fabbyyyy) | Vercel, Vultr, Tiger Data, sentryone.tech, accounts and keys, offline demo mode, the real one-cent CEP, release to main with v1.0.0, security scrub |
| #84 Narrative and submission | everyone, Patricio closes | market and business model, pitch and Devpost, rubric mapping, process and README, video, rehearsals (Patricio); regulatory and privacy (Adan); architecture and data model (Fabian); persona, journey and demo script (Fabricio) |

Scaffold PRs give every front typed stubs and mock data equal to the API's in-memory repository, so nobody waits to start. "Equal" is now a property somebody checks rather than an intention: `apps/web/src/lib/mock-data.ts` is generated from the seeded company by `bun run web:mock` and `scripts/web-mock.test.ts` fails when the committed file stops matching the generator, or when the API and the offline fallback stop answering the same legal name, amount, CLABE, action or total. It was not equal for a while and issue #125 is what that cost. Reviewers: Patricio reviews Fabian, Fabian reviews Patricio, Fabricio reviews Adan, Adan reviews Fabricio; the lead reviews anything stalled past 90 minutes.

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

## Review flow (build night mode)

The approval gate is off while the four of us run our assistants overnight: a PR merges itself as soon as
`bun run typecheck`, `bun test` and `bun run build` are green and the PR body is filled in. Every merged PR
still gets a real post-merge review from the rotation (Patricio reviews Fabian, Fabian reviews Patricio,
Fabricio reviews Adan, Adan reviews Fabricio) with at least two comments, because the review threads are
part of what Capital One reads. Never push to `main` or `dev` directly; `main` only takes release PRs.

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
