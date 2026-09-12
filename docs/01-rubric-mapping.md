# 01. Rubric traceability matrix

One row per confirmed sub-criterion, plus one row for engineering process, which the rubric does
not score directly and the judges ask about anyway.

**Rules for this table.** Every evidence cell is a path, a PR number or a test name. Never prose.
A red row is an open issue. Re-score the whole table at every milestone and fix the three lowest
rows first, not the easiest ones.

Status legend: **G** claim written and evidence exists, **Y** evidence partially exists,
**R** not built yet.

Last scored **2026-09-12 04:54 CST**, just past the M1 gate, against `dev` at `8487841`. The
evidence cells were refreshed **2026-09-12 05:30 CST** against `dev` at `4e9e2eb`, after PRs #129,
#131 and #133, with no status letter moved: a refresh is not a re-score, and the next one is M2.

| # | Sub-criterion (pts) | Our claim, one line | Evidence in this repo | Status |
|---|---|---|---|---|
| 1 | Substantiated competitive differentiation (10) | Every named competitor reads one of the three sources, and we are the only one that joins the CFDI ledger, the SAT 69-B list and the Banxico CEP while the payment can still be stopped | `docs/04-market.md#competitor-map`, `docs/00-challenge.md#prior-year-winners-we-are-deliberately-not-rebuilding`, `docs/adr/0002-track-and-thesis.md` (PR #23, PR #93) | G |
| 2 | Identification of market gap (10) | The three facts that decide whether a payment is safe are all public and all current, they belong to three different tools and three different people, and nothing sits in the few minutes between approving a payment run and sending it | `docs/04-market.md#the-gap`, `docs/04-market.md#problem-sizing` (PR #93) | G |
| 3 | Non trivial solution (10) | Six explainable controls over one event log: the 3-7-1 check digit plus OCR-aware Damerau-Levenshtein against the accounts this supplier was actually paid on, XMLDSig verification of a Banxico seal, and a retroactive sweep that is a fold over `LedgerEvent[]` with no clock and no network | `packages/core/src/clabe.ts`, `packages/cep/src/signature.ts`, `packages/sat/src/sweep.ts`, `packages/engine/src/index.ts` (PR #117, PR #119) | G |
| 4 | Data foundation (6) | One synthetic company, eight months of CFDI and payment complements plus a Nessie-shaped bank mirror that reconciles to the cent, deterministic from one seed; the real 4.5 MB SAT listing committed with its provenance; and 30 labelled holdout cases, 11 of them hard negatives, whose labels come from ADR-0002 and the domain types rather than from the control source | `packages/seed/src/ceptinela/`, test `reconciles to the cent against the complements and the transfers`, `packages/sat/src/snapshot/README.md`, test `reconciles: 14234 rows, 91 of them unreadable, 28935 situations`, `packages/seed/src/holdout/cases/`, `packages/seed/src/holdout/README.md` (PR #119, PR #122, PR #123) | G |
| 5 | Algorithmic logic and intelligence (9) | All six controls run over one typed `ComposeInput` and every one lands in `ran` or `skipped` with a named reason, and the same entry point scores 30 labelled cases at 85.0 percent precision, 81.0 percent recall and a 1.9 percent false positive rate, with the four labels that disagree with the engine left in the table rather than edited out | `bun run eval`, `GET /api/v1/metrics`, `packages/seed/src/holdout/engine.ts`, `packages/engine/src/engine.test.ts` test `accounts for all six whatever the evidence, and never loses one`, `apps/api/src/routes/instructions.test.ts` test `accounts for every one of the six controls, with no silent slot`, and the same controls over the seeded payment run in `apps/api/src/assess.ts` (PR #117, PR #122, PR #133) | G |
| 6 | System design (5) | One runtime, one SQL dialect, an explicit dependency direction (`packages/engine` exists so that `packages/core` never imports `sat` or `cep`), every choice recorded as an ADR, and an offline fallback that is the same numbers rather than a degraded mode: `supplier_weekly_outflow` is one name over a plain view and a Timescale continuous aggregate, compared column by column without a database and shown to reach the same 45,003,735.01 pesos through the event ledger and through the projection table | `docs/07-architecture.md`, `docs/adr/`, `packages/engine/README.md`, `docs/08-data-model.md#supplier_weekly_outflow-one-name-over-two-definitions`, `packages/db/src/migrate.test.ts` test `answers with the same five columns in the same order`, `packages/db/src/queries.test.ts` test `totals the same pesos the cfdis table holds, to the cent` (PR #117, PR #154) | Y |
| 7 | Quality and functional demo (5) | `bun run demo` drives the five beats of the demo script headless against a freshly seeded in-memory API, exits non-zero on any of them and prints the hero ids, 1,116 tests across 65 files pass with no network, no database and no key, and each of the three integrations that leave this repository has been run against the real provider: two outbound verification calls, one image through Gemini, and a Nessie write | `scripts/demo.ts`, `docs/10-demo-script.md#numbers-the-screen-shows`, `apps/api/src/ceptinela.test.ts`, `.github/workflows/ci.yml`, `docs/14-process.md#live-integrations-verified` with conversation ids `conv_6401m2ah87gnffctr757c34b5mdg` and `conv_2301m2ah9vnee2h8d14gpf1rb3rz` (PR #133) | Y |
| 8 | Substantiated business model (10) | MXN 899 per company per month, anchored against two published competitor prices and one published wage floor, breaking even at one stopped invoice of MXN 23,452 of subtotal per year | `docs/05-business-model.md#who-pays-and-why-that-number`, `docs/05-business-model.md#unit-economics` (PR #93) | G |
| 9 | Market size, TAM/SAM/SOM (5) | Bottom-up only, entities times price, every input cited to INEGI CE 2024 or to the SAT open-data file a judge can download and count themselves | `docs/04-market.md#sizing`, `docs/04-market.md#sources` (PR #93) | G |
| 10 | Regulatory and operational feasibility (5) | Payer-side software, not a regulated entity, with the framework map, the verified text of CFF 69-B, and the LLM boundary enforced by a test that reads the package's own source | `docs/06-regulatory-privacy.md#1-our-legal-position`, `docs/06-regulatory-privacy.md#2-framework-map-mexico`, `packages/extract/src/boundary.test.ts` test `names nothing from the decision layer in its code` (PR #87, PR #116) | G |
| 11 | Adoption strategy, GTM (5) | Three steps from a named beachhead category, accounting firms serving 11 to 250 person companies in the Monterrey corridor, opened with a free supplier-register sweep, and no company named that has not agreed to anything | `docs/05-business-model.md#gtm-in-three-steps` (PR #93) | G |
| 12 | Specific user persona (7) | One named quantified composite, Lupita Elizondo, plus a corporate-treasury anti-persona, with the two venue interviews carried as open tasks rather than invented quotes | `docs/02-persona.md`, `docs/02-persona.md#pending-human-validation`, `assets/persona/lupita-elizondo.png` (PR #114) | Y |
| 13 | Structured user journey map (7) | Six stages from XML receipt to archived evidence, each mapped to the screen and the ledger event that carry it, with three human-decision branches including the false positive, and every one of those screens designed in four states rather than a happy path | `docs/03-user-journey.md#stage-by-stage-map`, `apps/web/src/screens/`, `apps/web/src/screens/states.test.ts` (PR #114, PR #115, PR #124, PR #127) | Y |
| 14 | Pitch (6) | Three timed variants in Mexican Spanish opening with the fiscal hook cited to CFF 69-B and the Ley de Sistemas de Pagos, the eight hardest questions answered in one breath each, a gate table of which sentences may be spoken today, where the live verification call is ticked against two real outbound calls and the two rows still unticked carry the sentence to say instead, a table of the only numbers we are allowed to say with the source of each, a per-person answer sheet and a printable A5 judge card with a repository QR that was decoded before it was committed | `docs/11-pitch.md#what-is-true-right-now-and-what-is-gated`, `docs/12-judge-qa.md`, `docs/13-devpost.md`, `docs/print/judge-card.html`, `docs/print/README.md` (PR #98, PR #120, PR #131) | Y |
| plus | Engineering process (not scored directly) | 45 merged PRs on a board with nine views, 42 into `dev` and 3 release PRs into `main` with zero direct pushes to either, every PR body naming what it deliberately did not do, five ADRs, and a written cut list where one cut is recorded together with the PR that reversed it | `docs/14-process.md`, `docs/14-process.md#3-deliberate-descopes-each-recorded-in-the-pr-that-made-the-call`, `docs/adr/`, the project board, PR #117, PR #118, PR #119 | Y |

## Why the yellow rows are yellow

Five of the fourteen scored rows, plus the process row. Each one names the single thing that would
turn it green. Nothing else belongs in this list.

| # | What is missing | Tracked in |
|---|---|---|
| 6 | ADR-0003 and ADR-0004 still read `Proposed`, and the two-host topology ADR-0005 decided is not deployed anywhere yet | #44 for the deploy. The two ADR statuses have no issue of their own, which is itself the thing to fix |
| 7 | There is no live URL for a judge to open on their own phone. `bun run demo --base <url>` runs the same five beats against one the moment it exists | #44 |
| 12 | The two venue conversations in `docs/02-persona.md#pending-human-validation` have not happened, so the workload numbers are synthetic and are labelled as such | #52, closed with those two acceptance criteria deliberately left unchecked rather than ticked |
| 13 | The same two conversations, plus the constancia PDF that stage 6 of the journey names | #69 |
| 14 | No rehearsal has been run and no video exists. The market, model and regulation block of the pitch now carries cited numbers instead of the `TODO(FabriBanda)` the slide table used to carry | #73, #75 |
| plus | Build night mode has the approval gate off, so no merged PR carries a post-merge review thread yet. The PR bodies carry the reasoning in the meantime | `docs/14-process.md` |

## Self-score

Under one stated rule, so that the number is reproducible rather than a feeling: **G scores the
full points, Y scores half, R scores zero.** M1, 2026-09-12 04:54 CST:

| Criterion | Available | Ours |
|---|---|---|
| Originality | 30 | 30 |
| Technical Depth | 25 | 20 |
| Impact and Feasibility | 25 | 25 |
| Design and Experience | 20 | 10 |
| **Total** | **100** | **85** |

Read it as what it is: our own score, computed from our own status letters. Its only real use is
the trend and the ranking of what to fix next, which right now is Design and Experience, where ten
of the twenty available points are sitting behind two conversations, one rehearsal and one video,
and none of them behind a line of code.

## How to use this at a walk-up

An engineer asking "what is actually real right now" is asking for column four. Open this file,
read the row, open the path. That is the whole answer and it takes fifteen seconds.

## Scoring discipline

- A row is only **G** when the evidence path exists on `dev` and the claim sentence is written.
  An empty claim with a real file is still **R**, because the judge needs the sentence. `dev` is
  the integration branch, so it is the honest place to check; `main` only receives release PRs.
- Score at M1, M2, M3, M4. Four data points is enough to see which criterion is being neglected.
- Link this file from the README. The matrix itself reads as unusual rigor, independently of the
  scores in it.
- Record every re-score in `docs/14-process.md` under the rubric score trend, so the shape of the
  36 hours is visible and not just the final number.
