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

## Our track and thesis

Status: **pending ADR-0002**, decided by the team vote at M0 (2026-09-11 22:00).

TODO(garzario): once the vote closes, fill these four lines and merge
`docs/adr/0002-track-and-thesis.md` in the same PR.

- Track chosen: `<1 | 2 | 3>`
- Thesis, one sentence: `<who>` can `<outcome>` because we `<mechanism nobody else has>`.
- Why this track, sentence 1, the persona: TODO(FabriBanda)
- Why this track, sentence 2, the mechanism: TODO(garzario)
- Why this track, sentence 3, why the other two tracks are a worse fit for it: TODO(garzario)

## Candidate ideas under evaluation

Seven finalists from internal scoring. The decision is pending ADR-0002. Nothing here is built
yet and nothing here is committed to.

| Candidate | Track | One line |
|---|---|---|
| Eslabon | 2, B2B | Multilateral debt netting over the CFDI obligation graph of a construction cluster, solved as a min-cost circulation and decomposed into explainable settlement cycles. |
| TIMBRE | 3, Risk | Supplier payment-run sentinel over an event-sourced CFDI ledger, with independently explainable detectors including CLABE forensics and a SAT Article 69-B state machine. |
| Anaquel | 2, B2B | Inventory working capital read out of CFDI line items, using the fiscal ledger as the ERP a small retailer never had. |
| Cuadre | 2, B2B | Retailer deduction reconciliation, rebuilding each deposit line by line against the published deduction reason codes. |
| Tracto | 2, B2B | Load selection for one-to-five-unit carriers under a cash constraint, telling the owner which load to reject because diesel and tolls are paid on day 0 and the invoice at 45 to 120 days. |
| UMBRAL | 1, B2C | Gig-driver platform allocation against the IMSS single-platform income threshold, because income is not summed between platforms. |
| CEPTINELA | 3, Risk | CLABE and beneficiary verification before an irrevocable SPEI transfer, against the supplier-account-change scam. |

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
