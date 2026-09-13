# 14. How we worked

The rubric has no row for engineering process and the judges ask about it anyway, usually as "walk me
through how you worked". Twenty minutes of linking real artifacts answers it without improvising.

Owner: Patricio (`garzario`). Due M3, linked from the README at M5.

## Team and ownership

| Person | Handle | Role | Owns | The judge question they answer |
|---|---|---|---|---|
| Patricio Garza | `garzario` | Lead, intelligence, architecture | `packages/core`, `packages/db`, the ADRs, CI, `docs/07`, `docs/08`, all merges | How does the algorithm work, and why is that the right model |
| Fabian | `fabbyyyy` | Data platform, API, deploy | `apps/api`, `packages/nessie`, `packages/seed`, the database, `scripts/`, `docs/09` | Where does the data come from, and what happens at ten times the volume |
| Adan | `Apanawa` | Frontend with Fabricio, evaluation harness | `apps/web` (QR intake, SAT replay, CEP viewer, metrics, motion), `packages/seed/src/holdout`, constancia PDF, `docs/06` | Walk me through what the user sees, and how you measured the detectors |
| Fabricio | `FabriBanda` | UI/UX design and screens | brand and design system, `apps/web` (payment run, finding panel), `docs/02`, `docs/03`, `docs/10`, `docs/12`, judge card | Why does the screen look like this, and what does the clerk feel at each step |

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
- One review from a different role owner, per the rotation below. Since 03:30 on the 12th that
  review is post-merge rather than blocking, which is build night mode in point 7 of the review flow.
- Few, meaningful commits. One logical commit per PR. Of the 45 merged so far, 42 went into `dev`
  and 3 were release PRs into `main`.
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

7. **Build night mode, and what it actually cost us.** Between 2026-09-12 03:30 and the morning
   standup the approval gate is off: a PR merges when CI is green and the body is complete.
   The trade was made on purpose. Four people running assistants in parallel on a shared monorepo
   produce PRs faster than four people can read them, and a PR waiting three hours for an approval
   at 04:00 blocks the branch behind it rather than improving it. What we bought is throughput:
   45 merged PRs, zero direct pushes to `main` or `dev`, and no branch stranded overnight.

   What it cost is visible and we state it rather than dress it up: **as of this writing no merged
   PR carries a post-merge review thread.** The rotation below is owed on every one of them and the
   debt is real. What stands in for it in the meantime is the PR body itself, which the template
   makes mandatory: what changed, how, the evidence, one thing deliberately not done, and a
   "For the reviewer" section that names the risky part and asks a real question. PR #117, #118 and
   #119 above are what that looks like when it works.
8. Quality target by M5: every merged PR has one post-merge review with at least two substantive
   comments or a recorded stall-rule note, zero direct pushes to `main` or `dev`, and
   `git log dev --oneline` reads as a legible story. The first of those three is the one at risk.

## The board

<https://github.com/users/garzario/projects/5>, "HackMTY 2026, Capital One". Every issue carries a
status, an owner, a milestone, an epic parent and a `rubric/*` label, so the board answers "what is
left" and "what is it worth" in the same read.

Nine views, because four people at 03:00 need a different slice each:

| # | View | What it is for |
|---|---|---|
| 2 | Tablero de trabajo | The working kanban: Backlog, In Progress, In Review, Done |
| 3 | Todo el backlog | Everything, flat, for triage |
| 4 | Epicas | The five epics with their sub-issues underneath |
| 5 | Demo-critical | Only `P0-demo-blocker`. This is the view the 04:00 gate is decided from |
| 6 to 9 | Patricio, Fabian, Fabri, Adan | One per person, so nobody has to filter to find their own queue |
| 10 | Done | The closed pile, which is where the cut list below was read from |

The five epics, each with every related issue linked as a sub-issue:

| Epic | Lead | Scope |
|---|---|---|
| [#80](https://github.com/garzario/CapitalOneHackMTY/issues/80) Engine | Patricio | `packages/core`, `packages/cep`, `packages/sat`, `packages/seed`, `packages/engine`, `packages/extract`, `packages/voice` |
| [#81](https://github.com/garzario/CapitalOneHackMTY/issues/81) Data platform and API | Fabian | `packages/db`, `apps/api`, the ledger, SSE, the Nessie mirror, the evaluation harness |
| [#82](https://github.com/garzario/CapitalOneHackMTY/issues/82) UI/UX | Fabricio designs, Fabricio and Adan build | `apps/web`, brand and design system, the six screens, persona and journey, the printed judge card |
| [#83](https://github.com/garzario/CapitalOneHackMTY/issues/83) Infrastructure and release | Fabian | Vercel, Vultr, Tiger Data, `sentryone.tech`, keys, offline demo mode, the real one-cent CEP, the release to `main` |
| [#84](https://github.com/garzario/CapitalOneHackMTY/issues/84) Narrative and submission | everyone, Patricio closes | Market, business model, pitch, Devpost, rubric mapping, this file, the video, the rehearsals |

## Three pull requests worth reading

Picked because the body carries a real argument rather than a summary, not because they are the
largest. Under build night mode the approval gate is off (see the review flow above), so on these
three the PR body is the artifact and the post-merge review is still owed.

| PR | What it is | What the body shows |
|---|---|---|
| [#117](https://github.com/garzario/CapitalOneHackMTY/pull/117) | `fix(core)`: explicit typed detector adapters, all six controls wired | The self-caught failure. The detector registry discovered modules by dynamic import and guessed each one's argument tuple from its arity, so once the real detectors landed it called none of them: the product returned "sin hallazgos" on every payment while the whole suite stayed green. That is exactly the prototype that only pretends to work, found by us rather than by a judge. The fix is typed adapters plus `composeFindingsReport`, which puts every control in `ran` or `skipped` with a named reason, so a silent control is now a test failure. The body also argues two judgement calls against itself and invites the reviewer to overrule them |
| [#119](https://github.com/garzario/CapitalOneHackMTY/pull/119) | `feat(sat)`: official 69-B list loader, matcher and retroactive sweep | The data-reality PR. A table of what the real 4.5 MB SAT file does and what the parser had to be taught, each row with the count that provoked it: ISO-8859-1 rather than UTF-8, 2 records that span physical lines, 483 unreadable DOF cells, 93 cells with two dates, 91 RFCs redacted by court order that are reported rather than dropped. It also states the thing it deliberately did not do, which is feed the detector the real list, because ADR-0002 forbids joining a real RFC to a synthetic invoice |
| [#118](https://github.com/garzario/CapitalOneHackMTY/pull/118) | `feat(voice)`: ElevenLabs verification call to the supplier | The failure-mode PR. Outcome parsing is deterministic and not a model, because ADR-0004 keeps inference out of the decision path and a judge has to be able to predict the answer. The named edge cases are the argument: a bare "si" is not a confirmation, a comma is what separates `No es correcta` from `No, es correcta`, uncertainty is never rounded to a denial, only four digits of the account are ever spoken, and a provider 401 becomes our 422 so a clerk is never told they are signed out. It ships with the telephony-fails path designed in, not bolted on |

## Evidence you can check without us

Counts are a snapshot, taken 2026-09-12 05:30 CST against `dev` at `4e9e2eb`. Re-read them off the
commands rather than off this table if the hour matters.

| Artifact | Where | Why this one |
|---|---|---|
| CI run | Run `34690867244` on `dev`, `verify` green in 36 s | Install with `--frozen-lockfile`, advisory lint, typecheck, tests, build. Docs-only changes are skipped by `paths-ignore`, on purpose |
| Test suite | `bun test`: 1116 pass, 0 fail, 65 files, no network and no key | The number a judge can reproduce on their own laptop in about a second |
| Blind evaluation | `bun run eval`: 35 labelled cases, 87.0 percent precision, 83.3 percent recall, 1.6 percent false positive rate, and 12 of 12 confiable lines right | The number that is worth something because it is not flattering. Four labels disagree with the engine and are left in the table, argued out in `packages/seed/src/holdout/README.md` rather than edited away |
| Rubric score trend | `docs/01-rubric-mapping.md#self-score` | M1, 2026-09-12 04:54 CST: **85 of 100** under the stated G/Y/R rule. M2, M3 and M4 go here as they are scored |
| Changelog | `CHANGELOG.md`, `[Unreleased]` | Appended by whoever merges, in the same commit |

## Live integrations verified

Four parts of this product leave the repository and reach somebody else's production system. Each
was exercised against the real provider, three of them on 2026-09-12 and the payment run on
2026-09-13, and the ids below are what turns "the code path is merged and tested against a stub" into
"we ran it". A judge can ask us to open any of them.

### The verification call, ElevenLabs over Twilio

| | |
|---|---|
| What ran | Two real outbound calls, 2026-09-12 |
| Agent | `agent_3501m2ah6erkf46rxdmhy4xtsexw` |
| Dialled from | The team's own imported Twilio number, the imported Twilio number (Monterrey local, kept out of the repository) |
| Dialled to | A teammate's own mobile, which is the number class issue #60 specifies. No supplier and no real counterparty has ever been called by this product |
| Conversation ids | `conv_6401m2ah87gnffctr757c34b5mdg` and `conv_2301m2ah9vnee2h8d14gpf1rb3rz` |
| The first call | 18 seconds, ended by the remote party, transcript captured |
| Cost | USD 0.016, as the provider reports it |

This is the evidence the gate table in `docs/11-pitch.md` was waiting for, so the live-call row there
is ticked and points at this section: "ya llamamos" is now a sentence about something that happened.
It ticks nothing else. Both open items on this integration are still in the cut list below, the voice
id that is not pinned and the `verification_call` event that reaches the ledger and the SSE stream
without being rendered in the instruction panel.

### The extraction, Gemini

| | |
|---|---|
| What ran | One handwritten-style image of a payment instruction, through `packages/extract`, 2026-09-12 |
| Model | `gemini-3.6-flash`, the default in `packages/extract/src/gemini.ts` and the value `.env.example` configures |
| What came back | The supplier, the amount and the CLABE, in one call, about 1,200 tokens |
| What did not move | The boundary. One instruction string and the bytes of one image is the whole transfer, and `packages/extract/src/boundary.test.ts` fails if a shipped module of that package so much as names `decide`, `Finding` or `score` |

That token count is the measurement to re-price `docs/06-regulatory-privacy.md` section 6.3 with,
because the table there prices two models this product does not configure. Issue #54 carries it.

### The bank mirror, Nessie

| | |
|---|---|
| What ran | `POST /customers` with the team key, answered `201`, 2026-09-12 |
| Why a write and not a read | On Nessie a `403 {"message":"Missing Authentication Token"}` means the path is wrong rather than the key, so a read proves nothing about a key and only a write the API accepts does. That quirk is in `AGENTS.md` because it cost us the guess once |

The key is in each local `.env` and in no file here: `.env` and `.env.*` are ignored and
`.env.example` carries the names with empty values.

### The payment run, Nessie

| | |
|---|---|
| What ran | One whole execution of the seeded run through `POST /api/v1/run/:id/execute` with the real `NessieRail`, 2026-09-13 |
| What left | 86 lines, 1,388,920.90 MXN, one withdrawal per line on the company's bank mirror, each with the clave de rastreo minted from the object id Nessie answered. 0 failed, 0 cancelled |
| What did not | 6 lines the engine is holding and nobody signed a release over. They were reported per line with the reason and nothing was appended for them |
| The second press | `409`, and the ledger did not move |
| What was not created | Nothing. 3 customers and 2 accounts before and after, which is what issue #45 recorded |
| What it proves and what it does not | The flow end to end on a real API with our own key. Nessie is a sandbox and not a bank: no pesos moved, the balance did not change, an amount reads back as a whole number, and no CEP exists, so every receipt from that run says "firma no verificada". `packages/rail/README.md` carries the counts and the quirk a probe of this issue found, which is that a withdrawal posted with no `status` makes Nessie refuse to list that account's withdrawals at all |

The rail that produces a Banxico-signed CEP is `StpRail` and it has never run: we hold no `empresa`
contract, so its constructor refuses on every machine. That line is in `packages/rail/README.md`, in
`GET /api/v1/rails` and in ADR-0008, which is three places on purpose.

## The #75 rehearsal protocol

Issue #75. Two full timed run-throughs of the stand pitch on the real app, with all four present, one
of them against a teammate playing a hostile judge off the cards in
`docs/12-judge-qa.md#qa-cards`. A rehearsal with one person is a read-through, and a rehearsal with no
stopwatch is a reading.

The script is `docs/11-pitch.md#the-stand-pitch-three-to-five-minutes` and the operating sheet is
`docs/10-demo-script.md#the-stand-pitch-three-to-five-minutes`. **Neither file's per-beat seconds are a
measurement.** They are arithmetic on a word count at 150 words a minute, 786 words and 5:14, and the
whole point of this protocol is to replace that arithmetic with two stopwatch readings before anybody
decides what to cut.

### What happens before either run

| # | Step | Owner | Why it is before and not during |
|---|---|---|---|
| 1 | Say out loud which issues are in `dev`, by number, and rewrite the beat sheet to what is merged rather than to what is expected to merge | Fabian | Nine of the eleven beats name a dependency. A beat rehearsed against a branch is a beat that breaks in front of a judge |
| 2 | `bun run demo` green on the demo laptop, right now, and the pre-demo checklist of `docs/10-demo-script.md#pre-demo-checklist` ticked | Fabian | It is ninety seconds and it is the difference between looking real and looking like a prototype |
| 3 | `bun run eval`, and card 9 plus the `+2` clause of beat 7 re-read off that output | Adan | The five evaluation figures move with every merge. A number in a mouth that the screen contradicts costs more than the clause was worth |
| 4 | Open the deployed web on a phone, once | Adan | So that "abrelo en tu telefono" is said as a fact. If it is down, the run uses the local instance and the sentence is not said |
| 5 | `GET /api/v1/instructions/INS-2026-09-07-047/verification` reads `not_started`, or re-seed | Fabian | The cent is sent once per instruction and a second press answers 409. Beat 5 is unrepeatable if a rehearsal spent it |
| 6 | Decide the letter or letters for the guarantee slot, or decide out loud that there is none | Fabricio | `docs/11-pitch.md#the-guarantee-beat-the-four-layers-that-exist-and-the-slot` carries the screen for all eight. If nobody decides, beat 10 is said without the sentence. Nothing is improvised into that slot at 09:00 |

### Run 1, clean

Nobody interrupts. One person holds the stopwatch and says nothing until the end.

- Start the clock on the first word of beat 1 and stop it on the last word of beat 11.
- The stopwatch holder writes one number per beat, not one number for the run, because the cut ladder
  works on beats and a single total hides which one ran long.
- Laptop shut for beat 1, hands visible and off the trackpad. If the laptop opens early, the run is
  restarted: that is the one habit this rehearsal exists to build.
- Two people at the laptop and two a step back, and the handoffs between the four are part of what is
  being timed.

### Run 2, hostile

The fourth person plays the judge with the cards in front of them, on a phone.

- They interrupt **twice**, once inside the first ten seconds and once in the middle of a demo beat,
  because those are the two interruptions that actually happen.
- The second-five interruption is answered with the one product sentence and then the presenter goes
  back to the **second** loss. An improvised version of that sentence is what the first Capital One
  table heard.
- They then pick four cards at random and two on purpose: **2, 6, 10 and 14**, which are the four that
  were answered badly the first time.
- The rule being rehearsed is that **the owner answers**. If the owner is mid-beat, whoever is a step
  back says "te contesta <nombre> en veinte segundos". Two people answering the same question
  differently is the failure the card sheet exists to prevent.
- Anybody may call "eso no lo decimos" mid-answer. A banned sentence caught in rehearsal is free; the
  same sentence in front of a panel costs the room.

### What gets logged, in this file, under "Judge visits"

One row per run, and the log is the deliverable rather than the feeling afterwards.

| Field | Why it is logged |
|---|---|
| Date, time and which run, 1 or 2 | Two runs or it did not happen |
| Seconds per beat, and the total | This is the measurement the beat sheet does not have |
| Which rung of the cut ladder the total implies | Read straight off `docs/10-demo-script.md#the-cut-ladder-pre-declared`. The rung is a consequence of a number, not a preference |
| Which beats fell back, and to what | A fallback used in rehearsal is a dependency that is not ready, which is information for the 07:00 declaration |
| Which cards were asked | **A card asked after the pitch is a defect in the pitch.** The fix goes into `docs/11-pitch.md`, not into a longer answer in `docs/12` |
| Any banned sentence that was said, verbatim | Including who said it. The list in `docs/11-pitch.md#delivery-rules` grows from this column and nowhere else |
| Any number that was said and was not on the screen | The same rule as the sheet: the clause gets cut rather than defended |
| One thing to change before the next run, and only one | A list of eight changes between two rehearsals is a rewrite, and a rewritten pitch has been rehearsed zero times |

### The cut list if the room is slow

The ladder with its measured savings is `docs/10-demo-script.md#the-cut-ladder-pre-declared`, and it is
pre-declared so that nobody chooses in front of a judge. The rule for reading it:

1. Take the total of run 1 in seconds.
2. Subtract 300. If the answer is negative, no rung comes off and the `+` clauses of
   `docs/11-pitch.md#the-clauses-that-go-back-in-when-the-judge-stays` go in from the top of that list
   until the total reaches 290.
3. If it is positive, come down the ladder until the remainder is negative. Rung 1 is beat 10, rung 2 is
   beat 6, and the order does not get reshuffled at the table.
4. Say the chosen rung out loud to all four before the window opens, and whoever is presenting says the
   rung number rather than "nos vamos cortito".

**Three things never come off**, at any rung and at any clock reading. The hook, because it is the one
beat that makes a judge care. The synthetic-data sentence. And beat 3, because a judge who watched their
own screenshot become a payment instruction does not need to be convinced that the product runs.

### The exit criteria for #75

- [ ] Run 1 logged with seconds per beat and a total.
- [ ] Run 2 logged, with the two interruptions, the cards asked and the owner who answered each.
- [ ] The rung chosen, written down, and said out loud to all four.
- [ ] Zero banned sentences in run 2. If one appears, there is a run 3, and that is cheaper than the
      alternative.
- [ ] The guarantee slot decided or explicitly empty.
- [ ] Every number said in run 2 was on the screen or on a card.

## Judge visits, and what each one changed

Judging here is continuous rather than a slot: engineers and a product person walk up to the table
during the 36 hours. Each visit is logged with a date and with the diff it caused, because a visit
that changes nothing was either a perfect answer or a wasted one, and afterwards those two look
identical.

### 2026-09-12, afternoon. Three Capital One judges, one question each

Three judges came to the table separately and each asked a different question. None of the three was
on the answer sheet, and two were answered from memory rather than from a source, which is precisely
the failure the "research is not evidence" rule in `AGENTS.md` exists to prevent.

| What they asked | What we had | What it exposed |
|---|---|---|
| How many people have this problem in Mexico, and is there demand | A firm count, about 246,000 at 11 to 250 people, and a SAT publication frequency | The sizing answered "how many could buy" and nothing answered "how many are hit". No fraud count, no pesos, no SPEI volume |
| Who is already doing it in Mexico, what are their winning features and what problems do they face | Two Mexican competitors, both list checkers, plus three international payee-verification vendors | The map had no Mexican company that already holds a payment, and the gap paragraph claimed the window between approval and send was empty. Both were wrong |
| Who exactly is the target user | One synthetic persona with a synthetic workload | Nothing external at all. No population, no geography, no buyer, no channel, and an anti-persona of one instead of four |

What changed as a result, all of it in the pull request that closes
[#173](https://github.com/garzario/CapitalOneHackMTY/issues/173):

- `docs/04-market.md` gained "Demand: how many have the problem and how we know", split into the fraud
  side, the fiscal side, the SPEI volume and an explicit list of eight things that are not published
  anywhere, plus 31 new numbered sources with access dates. Its competitor map now carries twelve
  companies that sell into Mexico and two Mexican banks, one row each for the winning feature, the
  problems they face from their own dated material, and what they cannot do that we do.
- **The claim that the gap was empty is gone**, and that is the most important line in this entry.
  ValidX sells a pre-payment hold on four SAT lists, Portal de Proveedores in Monterrey holds a
  payment and sweeps 69-B daily across 20,000 suppliers, and Verificamex sells the one-cent probe with
  a CEP read-back for MXN 8.93 to 17.85 a call, a mechanism Banco de México's own SPEI rules have the
  central bank performing. "We invented checking 69-B before paying" is now on the do-not-say list in
  `docs/12-judge-qa.md`, and the gap is restated as the join, with four named edges.
- `docs/02-persona.md` gained "Target user, buyer, channel and anti-user": the population Lupita is
  drawn from rather than a new claim about her, four anti-users instead of one, and the two unchecked
  interview boxes left exactly as they were.
- `docs/12-judge-qa.md` now opens with the three questions, a thirty-second spoken answer each, the
  numbers allowed to be said with their source, and for each one a list of what not to say.
- One scope question arrived with the research and was answered inside the day, in issue #180: 69-B is
  no longer the only SAT list published against suppliers. Article 49 Bis creates its own from 1
  January 2026, and two incumbents already monitor it, one of them having shipped support in July
  2026. The answer came out differently for each of the two lists, which is why it was worth asking at
  the source rather than deciding at the table. **Article 49 Bis** is implemented, loader, thirty day
  window, finding and retroactive sweep, and reported as `not_published_machine_readable`, because the
  SAT publishes that list one oficio at a time as a DOF note and ships no file at all: fourteen
  oficios naming fourteen taxpayers between 10 July and 28 August 2026, counted in the DOF on
  2026-09-12. **Article 69-B Bis** does have a downloadable listing, three taxpayers at a 5 June 2026
  cut-off, and is deliberately not wired in, because it is about the improper transfer of tax losses
  and says nothing about a supplier's invoice. Both statements are in `docs/04-market.md`,
  `docs/06-regulatory-privacy.md` section 3 and `packages/sat/src/snapshot/README.md`, each with the
  URL and the retrieval time.

Two findings from the same pass were retracted, and they are kept here because the retraction is the
process working rather than a blemish on it. A first count of job-board vacancies in Nuevo León was
wrong by an order of magnitude, 146 against an actual 2,145, so the ratio built on it went from 22 to
1 to about 204 to 1; the correction is written into source 44 of `docs/04-market.md` so nobody
rediscovers the wrong number. And a claim that the FBI's annual fraud report makes business email
compromise its largest loss category was simply false, investment fraud is nearly three times larger
in the same table, so the international-analogy line it supported was cut rather than repaired.

## What we cut, and why

An issue closed with a written reason is evidence of scope judgment, which is exactly what an
engineer is fishing for when they ask what we left out. Three kinds of cut, all readable from the
`Done` view of the board.

### 1. A whole backlog, replaced once the track was decided

Issues **#7 to #10, #13, #15 to #22** were the generic plan written before the track vote. ADR-0002
chose SentryOne at 02:30 and made them wrong rather than merely incomplete: "feat: the aha screen"
and "feat: dirty-data resilience" are not scopeable against a product that did not exist yet. All
thirteen were closed with `Superseded by the SentryOne backlog (#33 to #58)` rather than rewritten
in place, so the history shows the pivot instead of hiding it. **#1 to #4, #11, #12 and #14** were
closed as done in the bootstrap or superseded the same way.

### 2. A double-filed backlog

Issues **#24 to #32** were filed at 08:01 and the same nine were filed again at 08:02 as **#33 to
#41**, inside one three-minute batch. The first nine were closed with `Duplicate of the complete
backlog (#33 to #58)`. Not an interesting cut, listed because a board with nine unexplained
closures is worse than a board with nine explained ones.

### 3. Deliberate descopes, each recorded in the PR that made the call

These are the ones worth defending out loud, because each is a thing that would have looked good
and would have cost the demo.

| Cut | Where it is recorded | Why |
|---|---|---|
| The composition report does not reach the HTTP contract | PR #117, "Deliberately not done" | Adding `controls: { ran, skipped }` to the intake response would have changed `docs/09-api.md` and `apps/web` while three people were editing those files. It is additive and it is its own PR |
| The `sat_69b` detector was not fed the real committed SAT list, a cut PR #133 then reversed | PR #119 made the cut, PR #133 undid it, and the reasoning sits in `apps/api/src/pipeline.ts` next to the wiring | ADR-0002 forbids a real RFC sitting next to fabricated evidence, which is why #119 left the real list read-only behind the lookup box. #133 wired it in once the argument was written down: every seeded supplier RFC is synthetic, so a real row cannot meet a fabricated invoice, and what it buys is a control that knows what the lookup box on the next screen knows. `simulatePublication` still refuses any RFC without the `SYN` prefix, so the publication the demo replays stays invented |
| The `verification_call` event is not rendered in the instruction panel | PR #118, "Deliberately not done" | `InstructionScreen.tsx` and `Findings.tsx` belong to the UI front and were being edited at that hour. The event is already on `GET /api/v1/ledger` and on the SSE stream, so the panel needs no API change when it is built |
| No ElevenLabs voice id is pinned | PR #118 | Nobody on the team had listened to a Mexican Spanish voice and chosen one, so `ELEVENLABS_VOICE_ID` is empty and the provider default applies rather than an id this repo invented |
| Per-transaction basis points, and lead generation to a lender | `docs/05-business-model.md#revenue-lines` | The first makes a subscriber pay twice for one payment run. The second turns a control into an origination channel and invites the credit regime ADR-0002 deliberately stayed outside of |
| The white-label licence to a financial institution | `docs/05-business-model.md#revenue-lines` | Real, and on a procurement cycle that cannot start from a hackathon. It is the year-two line, not the headline |

### 4. Decided out of scope before the first commit

Recorded in `docs/07-architecture.md#deliberately-not-in-this-tree`, because git cannot track an
empty directory and a folder that never existed leaves no evidence of the decision.

- **`apps/ios`**, a native client. ADR-0001 says a native app needs a differentiator that is
  inherently on-device, and ours is not. The camera path we do need is a web intake page opened
  from a QR code, which needs no signing and no store.
- **`services/ml`**, a Python sidecar. All six controls are arithmetic, string distance, a state
  machine or a check digit. A readable TypeScript implementation scores higher on algorithmic logic
  than an opaque artifact.
- **A queue or a worker tier.** The sweep is a replay that fits in one request at demo scale. The
  threshold that would create one is written down in `docs/07-architecture.md`.
- **A second database for the SAT list.** A list version is rows in Postgres plus an in-memory map
  keyed by RFC, rebuilt on load.
- **Extra cloud providers, and any sponsor integration that is not genuinely load-bearing.** Four
  people cannot maintain four infrastructure surfaces in 36 hours.

## Decision record index

| ADR | The decision, stated as the decision | Status in the file | Landed in |
|---|---|---|---|
| [0001](adr/0001-stack-and-runtime.md) | Bun and TypeScript monorepo, with the intelligence as a pure package | Accepted, 2026-09-12 02:30. Option A, no Python sidecar | bootstrap |
| [0002](adr/0002-track-and-thesis.md) | Track 3 and the SentryOne thesis, the product as six controls | Accepted, team vote 2026-09-12 02:30 | PR #23 |
| [0003](adr/0003-datastore-and-timeseries.md) | One Postgres dialect, Timescale primary, local Postgres 18 as the offline fallback | Proposed | bootstrap |
| [0004](adr/0004-llm-boundary-and-privacy.md) | No LLM in the per-transaction hot path | Proposed | bootstrap |
| [0005](adr/0005-deploy-target.md) | Static web on Vercel, API on the Node runtime, amended in PR #104 | Accepted, 2026-09-12 02:30. Option 2 | bootstrap |

Two of the five still read `Proposed`, and they are listed that way rather than quietly promoted.
ADR-0004 in particular is already enforced in code by `packages/extract/src/boundary.test.ts`, so
the status line is behind the repository and that is a real gap, tracked in
`docs/01-rubric-mapping.md` on the system-design row.

ADRs are the cheapest, highest-credibility artifact available, because they are written proof of the
reasoning the engineers came to the table to probe. `docs/adr/0000-template.md` is the shape: the
decision as a sentence, the alternatives that lost, and the consequence we accepted.
