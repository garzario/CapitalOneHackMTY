# 01. Rubric traceability matrix

One row per confirmed sub-criterion, plus one row for engineering process, which the rubric does
not score directly and the judges ask about anyway.

**Rules for this table.** Every evidence cell is a path, a PR number or a test name. Never prose.
A red row is an open issue. Re-score the whole table at every milestone and fix the three lowest
rows first, not the easiest ones.

Status legend: **G** claim written and evidence exists, **Y** evidence partially exists,
**R** not built yet.

| # | Sub-criterion (pts) | Our claim, one line | Evidence in this repo | Status |
|---|---|---|---|---|
| 1 | Substantiated competitive differentiation (10) | TODO(FabriBanda): the one thing every named competitor structurally cannot do, in one sentence | `docs/04-market.md#competitor-map`, `docs/00-challenge.md#prior-year-winners-we-are-deliberately-not-rebuilding` | R |
| 2 | Identification of market gap (10) | TODO(FabriBanda): the gap, stated as a fact about the world and not as a missing feature | `docs/04-market.md#the-gap` | R |
| 3 | Non trivial solution (10) | TODO(garzario): the algorithm in one sentence, naming the formal problem it solves | `packages/core/src/`, the adjacent `*.test.ts` files | R |
| 4 | Data foundation (6) | Deterministic synthetic Mexican ledger, fixed seed, with deliberate dirt we handle in tests | `packages/seed/src/generator.ts`, `docs/08-data-model.md#synthetic-data-methodology` | R |
| 5 | Algorithmic logic and intelligence (9) | The intelligence is pure, dependency-free, unit-tested TypeScript a judge can read at the table | `packages/core/src/`, `bun test` output, `docs/07-architecture.md#the-most-important-flow` | R |
| 6 | System design (5) | One runtime, one SQL dialect, two hosts, explicit boundaries, every choice recorded as an ADR | `docs/07-architecture.md`, `docs/adr/` | R |
| 7 | Quality and functional demo (5) | `bun run demo` drives the whole demo path headless and must be green before any judge visit | `scripts/demo.ts`, `.github/workflows/ci.yml`, latest CI run link in `docs/14-process.md` | R |
| 8 | Substantiated business model (10) | TODO(FabriBanda): who pays, how much, and the substitute spend that number is anchored to | `docs/05-business-model.md`, `docs/05-business-model.md#unit-economics` | R |
| 9 | Market size, TAM/SAM/SOM (5) | Bottom-up only, entities times price, every input cited to a named public series | `docs/04-market.md#sizing` | R |
| 10 | Regulatory and operational feasibility (5) | We are not a regulated entity, we license to or operate under one, and the framework map says which obligations attach | `docs/06-regulatory-privacy.md#1-our-legal-position`, `docs/06-regulatory-privacy.md#2-framework-map-mexico` | R |
| 11 | Adoption strategy, GTM (5) | TODO(FabriBanda): three concrete steps with a named beachhead category, no invented partners | `docs/05-business-model.md#gtm-in-three-steps` | R |
| 12 | Specific user persona (7) | One named, quantified composite plus a corporate-treasury anti-persona, with venue validation explicitly pending | `docs/02-persona.md`, `assets/persona/lupita-elizondo.png` | Y |
| 13 | Structured user journey map (7) | Journey from XML receipt to archived evidence, with emotion, exact screens and three human-decision branches | `docs/03-user-journey.md`, `apps/web/src/screens/` | Y |
| 14 | Pitch (6) | Three timed variants written in the actual words, plus the eight hardest questions answered | `docs/11-pitch.md`, `docs/12-judge-qa.md`, rehearsal log in `docs/14-process.md` | R |
| plus | Engineering process (not scored directly) | Real PRs with real review threads, a board, ADRs, and a written list of what we cut | `docs/14-process.md`, `docs/adr/`, the project board | R |

## How to use this at a walk-up

An engineer asking "what is actually real right now" is asking for column four. Open this file,
read the row, open the path. That is the whole answer and it takes fifteen seconds.

## Scoring discipline

- A row is only **G** when the evidence path exists on `main` and the claim sentence is written.
  An empty claim with a real file is still **R**, because the judge needs the sentence.
- Score at M1, M2, M3, M4. Four data points is enough to see which criterion is being neglected.
- Link this file from the README. The matrix itself reads as unusual rigor, independently of the
  scores in it.

TODO(garzario): at each milestone, replace the status letters and record the total in
`docs/14-process.md` so the trend is visible.
