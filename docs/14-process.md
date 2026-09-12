# 14. How we worked

The rubric has no row for engineering process and the judges ask about it anyway, usually as "walk me
through how you worked". Twenty minutes of linking real artifacts answers it without improvising.

Owner: Patricio (`garzario`). Due M3, linked from the README at M5.

## Team and ownership

| Person | Handle | Role | Owns | The judge question they answer |
|---|---|---|---|---|
| Patricio Garza | `garzario` | Lead, intelligence, architecture | `packages/core`, `packages/db`, the ADRs, CI, `docs/07`, `docs/08`, all merges | How does the algorithm work, and why is that the right model |
| Fabian | `fabbyyyy` | Data platform, API, deploy | `apps/api`, `packages/nessie`, `packages/seed`, the database, `scripts/`, `docs/09` | Where does the data come from, and what happens at ten times the volume |
| Adan | `Apanawa` | Frontend, UX, motion | `apps/web`, the design system, `assets/` | Walk me through what the user actually sees |
| Fabricio | `FabriBanda` | Narrative, docs, market, pitch | `docs/00` to `06`, `10`, `11`, `13`, `14`, the README, Devpost | Who is this for, how big is it, how do you make money |

**Narrative is a full seat, not a leftover.** Roughly half the rubric lives in documents and the
pitch: impact and feasibility, design and experience, and the market plus differentiation half of
originality. Most teams staff that at zero and lose it.

## The 36 hours

| Window (CST) | Patricio | Fabian | Adan | Fabricio |
|---|---|---|---|---|
| 20:40 to 22:00, **M0** | Repo bootstrap, `CONTRIBUTING.md`, ADR-0001, ADR-0005 | Nessie key at the booth, confirm the rubric and logistics assumptions, `packages/nessie` skeleton | Scaffold `apps/web`, Tailwind, design tokens | `docs/00`, `docs/02` draft, the originality check on the idea |
| 22:00 to 23:00 | Merge the bootstrap, flip the repo public, ruleset, secret scanning | `bun run doctor` green on all four laptops | First component, first route | ADR-0002 written with Patricio |
| 23:00 to 03:00, **M1** | `packages/core` first algorithm plus tests, `packages/db` schema | Seed generator, database up, migrate, first endpoint | The one real screen, wired to real data | `docs/02` final, `docs/03` journey |
| 03:00 to 07:00 | **sleep** | **sleep** | Deploy the slice, screen 2 | `docs/04` sizing |
| 04:00 gate | Adan and Fabricio hold it: no deployed slice means wake the lead and cut scope | | | |
| 07:00 to 11:00 | Review queue, merges, the differentiating algorithm | Streaming endpoint, dirty-data handling | **sleep** | **sleep** |
| 11:00 to 13:00, **M2** | Edge-case tests, re-score `docs/01`, fix the three lowest rows | Performance, `docs/09` | The key moment, with motion | `docs/05` business model |
| 13:00 to 16:00 | `docs/07`, `docs/08`, ADR-0003, ADR-0004, review every PR | Sponsor integration only if the M2 ADR said yes | Polish, empty, loading and error states | `docs/06` regulatory plus the cost table |
| 16:00 to 20:00, **M3** | **Feature freeze at 20:00**, review, this file | `bun run demo` green, offline fallback tested | Responsive, accessibility, visual freeze | `docs/10`, `docs/11`, `docs/13`, README |
| 20:00 to 22:00 | Evidence capture with Adan, tag `v1.0.0` | Final deploy, final `bun run demo` | Final screenshots and GIF | **Record the video**, upload it |
| 22:00 to 00:00, **M4** | All four: two full timed rehearsals out loud, then the Devpost draft submitted | | | |
| 00:00 to 05:00 | **sleep** | **sleep** | **sleep** | **sleep** |
| 05:00 to 07:00 | Refresh `docs/12`, P0 fixes only | Verify the deploy and the demo path from a cold start | Verify on a phone | Devpost finalised, categories, teammates added |
| 07:00 to 08:00, **M5** | All four: one dry run, `docs/12` read on a phone | | | |
| 08:00 to 09:00 | Buffer. Nothing new ships. Charge everything | | | |

Three rules attached to this table. **The 04:00 gate belongs to whoever is awake**, and waking the
lead is the correct action rather than an escalation. **Feature freeze at 20:00 on the 12th** is the
most important line in it, and after it only P0 demo blockers merge. **Rehearsals are a whole-team
block**, because a rehearsal with one person is a read-through.

Sleep is two four-hour shifts on night one and three hours for everyone on night two. That is a
deliberate trade: the pitch, the design and the working-demo criteria are roughly a third of the
score and they only exist if the thing works and we can talk about it.

## Branch, commit and merge policy

- Two long-lived branches: `dev` integrates every feature PR by squash merge, `main` only receives
  release PRs from `dev` by merge commit and carries the tags. **Nobody pushes to `main` or `dev`**,
  and a `pre-push` hook enforces it rather than a convention.
- Branches are `feat/<issue#>-<slug>`, `fix/...`, `docs/...`. Merge within four hours or split the
  issue.
- Feature PRs are squash-merged into `dev`. The squash title is `<type>(<scope>): <summary> (#<issue>)`.
- One approval from a different role owner, per the rotation below.
- Few, meaningful commits. One logical commit per PR.
- No required status checks, deliberately. A runner queue must never strand a PR at 04:00. CI is
  advisory and the reviewer reads it.
- Admin bypass is on so the lead can land a P0 fix alone at 05:00, and the PR body records
  `bypassed review: demo blocker, reviewed post-merge by <name>` so the history stays honest.

## Review flow

1. The author opens the PR with evidence attached and names the risky part in "For the reviewer".
2. Automated pass: CI runs typecheck, tests and the linter on the PR. The author fixes what it
   surfaces before requesting review.
3. Human pass: the CODEOWNERS owner for the touched paths reviews. **Target at least two substantive
   comments per PR**: a question, a suggestion, or a "this breaks when X". A bare approval with no
   comment does not count, and `CONTRIBUTING.md` says so.
4. The author replies in the thread, pushes a fixup, and resolves the thread with what changed. The
   resolved conversation is the artifact a judge scrolls.
5. Merge is a squash by the reviewer or the lead, normally never the author.
6. Rotation, so nobody reviews their own area twice in a row:

| Author | Reviewer |
|---|---|
| Patricio | Fabian |
| Fabian | Patricio, or Adan for API-shape questions |
| Adan | Fabricio, or Patricio for data contracts |
| Fabricio | Adan, or Patricio for `docs/07`, `docs/08` and the ADRs |

7. **Stall rule, because half the team is asleep by design.** A PR waiting 45 minutes gets pinged in
   the channel. At 90 minutes the lead reviews it regardless of rotation. If nobody with review
   rights is awake, the author merges their own PR, writes `merged unreviewed at <time>, nobody
   awake` in the PR body, and raises it at the next standup, where the reviewer leaves a real comment
   on the merged PR. A stalled PR at hour 20 is worse than an imperfect merge.
8. Quality target by M5: every PR has one approval or a recorded stall-rule note, at least two review
   comments, zero direct pushes to `main` or `dev`, and `git log dev --oneline` reads as a legible story.

## Artifacts to link at M3

TODO(garzario): fill these in at M3. This is the twenty minutes that answers "how did you work".

| Artifact | Link | Why this one |
|---|---|---|
| Project board | "HackMTY 2026, Capital One" (#5) | Status, owner, milestone and demo-critical for every issue |
| Representative PR 1, engine | TODO | What the review conversation caught |
| Representative PR 2, data or API | TODO | What the review conversation caught |
| Representative PR 3, UI or docs | TODO | What the review conversation caught |
| A CI run | TODO | Typecheck, tests and build, under three minutes |
| Rubric score trend | TODO | The `docs/01` totals at M1, M2, M3, M4 |

## What we cut, and why

Every issue labelled `cut` with one line of reasoning. An issue closed as `cut` with a reason is
evidence of scope judgment, which is exactly what an engineer is fishing for when they ask what we
left out.

TODO(garzario): list them at M3, one line each. Name two out loud in the pitch.

Already decided as out of scope before the first commit, so that four people are not maintaining four
infrastructure surfaces: a native iOS client, a Python model sidecar, extra cloud providers, and any
sponsor integration that is not genuinely load-bearing.

## Decision record index

| ADR | Decision | Status |
|---|---|---|
| [0001](adr/0001-stack-and-runtime.md) | Stack and runtime | Proposed |
| [0002](adr/0002-track-and-thesis.md) | Track and thesis | Pending |
| [0003](adr/0003-datastore-and-timeseries.md) | Datastore and time series | Proposed |
| [0004](adr/0004-llm-boundary-and-privacy.md) | LLM boundary and privacy | Proposed |
| [0005](adr/0005-deploy-target.md) | Deploy target | Proposed |

ADRs are the cheapest, highest-credibility artifact available, because they are written proof of the
reasoning the engineers came to the table to probe.
