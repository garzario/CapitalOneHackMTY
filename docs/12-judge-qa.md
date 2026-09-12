# 12. Judge answer sheet

For walk-ups. Refresh it at every milestone, because the honest-gap line goes stale fastest and it is
the line that buys the most credibility.

Read it on a phone before a judge reaches the table.

## Per person

### Patricio (`garzario`), lead, intelligence and architecture

| Question | Answer |
|---|---|
| What do you own | `packages/core`, `packages/db`, the ADRs, CI, and every merge |
| The one file to open on screen | `packages/core/src/<algo>.ts` beside `<algo>.test.ts`. TODO(garzario) |
| The algorithm in three sentences | TODO(garzario) |
| The current honest gap | TODO(garzario), refresh at every milestone |
| What is next | TODO(garzario) |

### Fabian (`fabbyyyy`), data platform, API and deploy

| Question | Answer |
|---|---|
| What do you own | `apps/api`, `packages/nessie`, `packages/seed`, the database, `scripts/` |
| The one file to open on screen | `packages/seed/src/generator.ts`, or `packages/nessie/src/normalize.ts` for the quirks answer |
| The data in three sentences | Deterministic synthetic Mexican ledger with a fixed seed, quincena income cadence and lognormal amounts, with deliberate dirt that each has a test. Nessie is a sandbox mirror, never the analytics store. The shared enterprise pool is contaminated and we never compute on it |
| The current honest gap | TODO(fabbyyyy) |
| What is next | TODO(fabbyyyy) |

### Adan (`Apanawa`), frontend, UX and motion

| Question | Answer |
|---|---|
| What do you own | `apps/web`, the design system, `assets/` |
| The one screen to show | The key moment from `docs/03-user-journey.md` |
| The experience in three sentences | TODO(Apanawa) |
| The current honest gap | TODO(Apanawa) |
| What is next | TODO(Apanawa) |

### Fabricio (`FabriBanda`), narrative, market and pitch

| Question | Answer |
|---|---|
| What do you own | `docs/00` to `06`, `10`, `11`, `13`, `14`, the README, the Devpost submission |
| The one file to open | `docs/04-market.md`, the sizing table with the formula column |
| The market in three sentences | TODO(FabriBanda) |
| The current honest gap | TODO(FabriBanda) |
| What is next | TODO(FabriBanda) |

## Shared answers, anyone can give these

**Why this track.** TODO(garzario), one sentence tied to the persona, not to the technology. See
`docs/00-challenge.md` and ADR-0002.

**Why this stack.** One runtime for the API, the tests, the seeder and the migrations, native
TypeScript with no build step, and a cold start fast enough to stream. The intelligence is pure
functions with zero dependencies so it is unit-testable and readable at this table. One SQL dialect,
two hosts, so the offline fallback is not a second implementation. Full reasoning in
`docs/07-architecture.md` and ADR-0001.

**What is real versus stubbed right now.** TODO, refresh at every milestone. Name the stub before
they find it.

**Where the data comes from.** A deterministic synthetic generator in `packages/seed` with a
committed seed, plus the Nessie sandbox as a system-of-record mirror. No real personal data anywhere,
including in screenshots and issues. Methodology in `docs/08-data-model.md`.

**What happens at ten times the volume.** The read path is one indexed query per account over a time
window, and on Timescale it is a hypertable with a continuous aggregate doing the daily rollup. The
engine is O(n) over the window with no IO. The hot path contains no inference, so cost does not scale
with volume.

**How this makes money.** TODO(FabriBanda), one sentence plus the payback figure. See
`docs/05-business-model.md`.

**What regulation applies.** We are not a regulated entity. We are a decision-support layer that
either licenses to an institution holding an ITF or banking authorisation, or operates under one.
Ley Fintech, CNBV, Banxico for SPEI, CONDUSEF and LFPDPPP are mapped to concrete obligations in
`docs/06-regulatory-privacy.md`. No automated adverse action, ever.

**What one inference costs.** There is no LLM in the per-transaction hot path. Scoring is
deterministic, so marginal cost is approximately zero and latency is microseconds. The LLM is used
only for an on-demand explanation and a batched summary, and the cost formula with live prices is in
`docs/06-regulatory-privacy.md`.

**What did you cut, and why.** The `cut` label on the issue tracker, with one line of reasoning per
issue, listed in `docs/14-process.md`. Name two specific ones out loud.

**Is this a wrapper around a language model.** No. Open `packages/core`, open the test file, run
`bun test`. Deterministic, no mocks, no network.

## Rules for this sheet

- The honest gap is mandatory and it is the highest-value line here. A volunteered gap reads as
  engineering maturity. A discovered one reads as a Wizard of Oz.
- Never invent a number at the table. "I do not have that number, it is derived in `docs/04`" is a
  fine answer.
- If two people would answer differently, the answer is not written yet.
