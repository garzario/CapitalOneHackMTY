# 00. Challenge, track and ground rules

The brief, the rubric and the clock. Every other doc in this folder is downstream of this one.
Read it before filing an issue or opening a PR.

## Event, confirmed

| Item | Value |
|---|---|
| Event | HackMTY 2026, Capital One challenge |
| Venue | Arena Borregos, Tec de Monterrey |
| Hacking window | 2026-09-11 20:00 to 2026-09-13 08:00 (36 h) |
| Judging | 2026-09-13 09:00 |
| Closing | 2026-09-13 13:00 |
| Timezone | Monterrey, UTC-6 all year, no DST |
| Submission | hackmty-26.devpost.com |

## Challenge overview, verbatim

> How can we leverage real-time financial data and intelligent automation to build resilient
> tools that empower individuals, protect businesses, and safeguard digital capital?

## The three tracks, verbatim. Choose one

1. **Consumer Financial Autonomy and Credit Building (B2C).** Intelligent agents that transform
   raw transaction streams into active financial well-being: automating micro-savings,
   identifying subscription leaks, or establishing cash-flow-based credit scoring for thin-file
   consumers.
2. **SMB Cash-Flow and Working Capital Intelligence (B2B).** Predictive treasury engines for
   small businesses that aggregate revenue and operational expense streams to forecast 30-day
   liquidity, manage overhead, and recommend timely working capital buffers.
3. **Real-Time Anomaly and Security Sentinel (Risk and Security).** Behavioral anomaly detection
   engines that analyze transaction ledgers in real time to flag unexpected transfer velocity,
   suspicious merchant category hops, or abnormal account behaviors.

## Our track and thesis, decided

Track 3, Real-Time Anomaly & Security Sentinel. Product: Ceptinela. Full reasoning, the six controls,
the narrative rules and the alternatives are in `docs/adr/0002-track-and-thesis.md`.

Thesis: the payments clerk of a Mexican SMB can stop a fiscally toxic, duplicated or misdirected SPEI
before it leaves, because Ceptinela joins, at the moment of payment, the company's own CFDI ledger, the
SAT's official Article 69-B list and the CEP that Banxico signs for every SPEI.

Why this track: the least crowded of the three by expectation, and the only one where we hold two
external, public, verifiable data sources. The hook is fiscal and irreversible, which every accountant
in Mexico recognises.

## Ideas considered and set aside

Twenty-seven ideas were generated and eleven were scored against this rubric by three independent
evaluators each. The runners-up and why they lost are recorded in ADR-0002: Eslabon (legal friction of
multilateral netting), Cenote (invisible cryptography, three-party cold start), Cuadre (synthetic
deduction documents), Tracto (trivial core), UMBRAL (demo arithmetic), Anaquel (no SKU sales data),
Sparring (closed-loop evaluation).

## Rubric, CONFIRMED from the Capital One slides

Sums to 100. Fourteen sub-criteria. The traceability matrix is `docs/01-rubric-mapping.md`.

| Criterion | Pts | Sub-criterion | Pts |
|---|---|---|---|
| Originality | 30 | Substantiated competitive differentiation | 10 |
| | | Identification of market gap | 10 |
| | | Non trivial solution | 10 |
| Technical Depth | 25 | Data foundation | 6 |
| | | Algorithmic logic and intelligence | 9 |
| | | System design | 5 |
| | | Quality and functional demo | 5 |
| Impact and Feasibility | 25 | Substantiated business model | 10 |
| | | Market size, TAM/SAM/SOM | 5 |
| | | Regulatory and operational feasibility | 5 |
| | | Adoption strategy, GTM | 5 |
| Design and Experience | 20 | Specific user persona | 7 |
| | | Structured user journey map | 7 |
| | | Pitch | 6 |

Originality is the heaviest single weight, and 30 of its 30 points are narrative plus
differentiation rather than code. Half the rubric lives in this folder.

## How we are actually evaluated

Confirmed from the Capital One talk.

- **Evaluation is continuous, not a single stage slot.** Two or three engineers plus one product
  person walk up to the table during the 36 hours and probe the logic, the architecture and the
  data structures.
- **They are hunting for Wizard-of-Oz prototypes.** The counter is that the intelligence is pure,
  readable, unit-tested functions in `packages/core`, runnable in front of them with no network.
- **The most common failure in past years is repetition.** Winners had a clear differentiator, a
  very specific audience and a niche problem. Make the persona a niche, not a demographic.
- **Final demo is in person.** A backup video is allowed and we record one anyway.
- **Stack is free, but fit for purpose is graded.** Cloud is optional. Every stack choice needs a
  one-sentence justification tied to this problem, which is what `docs/07-architecture.md` and the
  ADRs are for.
- **Third-party LLMs are allowed** with explicit awareness of data privacy, banking regulation,
  ethical and reputational risk, and cost per transaction. See `docs/06-regulatory-privacy.md`.
- **Nessie is optional.** We use it as a system-of-record mirror, not as the analytics store. See
  `docs/09-api.md`.

## Assumptions confirmed at the booth

This table separates facts that were confirmed or exercised from details we did not receive. A
missing answer is not a licence to invent one.

| Question | Confirmed answer and evidence | What we do with it |
|---|---|---|
| Nessie documentation and key | Documentation is at `https://prod.nessieisreal.com/docs`; the HTTPS API base is `https://api.nessieisreal.com`. A team key was supplied outside the repository and `POST /customers` returned `201` on 2026-09-12. The record of that live write is in `docs/09-api.md`. | Keep the key only in each teammate's ignored `.env`; the application never prints it. A read is not proof of a valid key because an invalid key can return `200 []`. |
| Nessie write rate | No numeric write quota is confirmed in our notes or in the documented API surface. | The demo makes no quota claim and does not depend on a bulk write. Network tests use fixtures, while the deliberate `bun run seed --nessie` path caps purchases per account with `--nessie-limit` (default 150), reports every failed push and exits non-zero, so a partial run cannot pass as a clean one. |
| Demo video | Capital One confirmed that a recorded backup video is allowed for the in-person demo. No maximum duration or separate host requirement is recorded. | Record a compact offline copy on the laptop and phone. The final submission target remains `hackmty-26.devpost.com`; do not state a video limit until the organiser supplies one. |
| What judges inspect | Judging is continuous: engineers and a product person can walk up during the event and probe the product's logic, architecture and data structures. | Keep the repository readable and runnable offline, with tests and evidence beside each claim. |

## Milestones and the hard gate

| # | Milestone | Local due (CST) | Exit criteria |
|---|---|---|---|
| 1 | M0 Setup | 11 Sep 22:00 | Repo bootstrapped and public, ADR-0001/0002/0005 merged, all four pass `bun run doctor`, Nessie key in hand |
| 2 | M1 Vertical slice | 12 Sep 04:00 | Seeded data to engine to API to one real screen, deployed and clickable. Ugly is fine, fake is not. |
| 3 | M2 Core intelligence | 12 Sep 13:00 | The differentiating algorithm works on seeded data, with tests proving the named edge cases |
| 4 | M3 Polish and docs | 12 Sep 20:00 | docs 00 to 11 merged, UI presentable, `docs/13-devpost.md` written. FEATURE FREEZE. |
| 5 | M4 Demo-ready | 13 Sep 00:00 | `bun run demo` green, video recorded and uploaded, Devpost draft submitted, two team rehearsals done, `v1.0.0` tagged |
| 6 | M5 Submission | 13 Sep 08:00 | Devpost finalised, README with GIF, `docs/14-process.md` linked, one dry run with all four |

### The M1 04:00 scope-cut rule

**If there is no deployed end-to-end slice by 12 Sep 04:00 CST, cut scope immediately. Do not
debug.** The gate belongs to whoever is awake, which by design is Adan and Fabricio. Waking the
lead is the correct action, not an escalation. Everything else in this plan is recoverable. A
missing vertical slice is not.

## Prior-year winners we are deliberately not rebuilding

Transcribed from the HackMTY 2025 Devpost gallery. If the idea on the table is a restatement of
any of these, it loses the originality block before a judge opens the repo.

Ayuda debo dinero / Smart Wallet (multi-card debt optimizer), Capital Mind, Cyra, FinancIA,
fAInance, UniBank, Cuantum FX, Keyvo, Billy, Asesor PyME Inteligente, ReportMind, AegisFin,
UpScore, SplitPay, ShareBill, ANT-icipa, Mirror Savings.

Two consequences we accept as rules. Generic personal-finance dashboards, subscription-leak
finders and "AI financial advisor chat" are saturated. The shared Nessie enterprise pool is full
of campus-flavoured merchants and bills created today by other teams, which is weak but real
evidence that the student-budgeting lane is crowded this year too.

## MLH sponsor prizes live at this event

Best Use of Gemini API, Best Use of ElevenLabs, Best Use of Solana, Best Use of Tiger Data, Best
Use of Vultr, Best Use of Snowflake API, Best Use of MongoDB Atlas, Best .Tech Domain Name.

Rule: a sponsor prize is worth fifteen minutes at M2 and an ADR, never a new infrastructure
surface. Tiger Data is the only one that is already load-bearing for us, because the ledger
genuinely is a time series. See `docs/adr/0003-datastore-and-timeseries.md`.

TODO(fabbyyyy): at M2, record yes or no per prize in a one-paragraph ADR. No integration without
a genuine use.

## Where to go next

`docs/01-rubric-mapping.md` for what each point depends on.
`docs/adr/` for every decision and the reasoning a judge will probe.
`docs/12-judge-qa.md` before any walk-up.
