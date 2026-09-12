# 12. Judge answer sheet

For walk-ups. Refresh it at every milestone, because the honest-gap line goes stale fastest and it
is the line that buys the most credibility.

Read it on a phone before a judge reaches the table.

Owner: Patricio (`garzario`), drafted for the team to validate. Issue #56.

**Twenty-second version, if that is all there is.** "SentryOne checks a supplier payment against
three things at the moment you pay it: your own invoice ledger, the SAT's Article 69-B list, and the
receipt Banxico signs for every SPEI. Hold, verify or release, with the reason on screen, and a
person decides."

**Ownership note.** The table in `AGENTS.md` and the issue assignments on the board do not match:
the web screens (#46 to #51) are assigned to `FabriBanda`, and the generator, the holdout cases, the
SAT loader and the CEP evidence (#43, #55, #35, #57) to `Apanawa`. The per-person sections below
follow the board, because that is what a judge will see in the commits. TODO(garzario): reconcile
`AGENTS.md` or the assignments before M4, so that both say the same thing.

## Per person

### Patricio (`garzario`), lead, intelligence and architecture

| Question | Answer |
|---|---|
| What do you own | `packages/core` (the six detectors and the decision engine), `packages/sat`, `packages/cep`, `packages/db`, the ADRs, CI, `docs/07`, `docs/08`, and every merge |
| The one file to open on screen | The CLABE forensics detector beside its test file, from #34. TODO(garzario) confirm the exact path once it merges, and keep this row exact: pointing at a file that does not exist is the worst possible answer at this table |
| The algorithm in three sentences | Six independent detectors each read one kind of document and return findings that carry an amount at risk, a state that is either provable from documents or needs a human check, and the evidence that produced them. One expected-loss decision weighs the amount at risk against the cost of delaying that payment by a day, and returns hold, verify or release. Everything is a pure function over the domain types, so the whole engine runs in a unit test with no network, no database and no model |
| Why that model and not machine learning | The output has to be defensible to a person who is legally responsible for the payment, the inputs are documents rather than behaviour, and the positives are rare enough that a supervised model would be fitting noise. We measure ourselves against labelled cases we did not write, which is the part a model would also need and usually skips |
| The current honest gap | As of 2026-09-12 the detectors, the schema and the API are in flight as separate pull requests, the blind metrics have not been run yet, and the deployed URL is not up. TODO(garzario): rewrite this cell at every milestone with what is merged, what is not, and the one thing most likely to break in the demo |
| What is next | The measured false-positive rate against the hard negatives, and the ADR-0005 amendment that records why the API moved to a long-lived process |

### Fabian (`fabbyyyy`), data platform, API and deploy

| Question | Answer |
|---|---|
| What do you own | `apps/api`, `packages/nessie`, the database schema and migrations (#40), `scripts/`, `docs/09-api.md`, and the deploy (#44) |
| The one file to open on screen | `packages/nessie/src/normalize.ts` for the quirks answer, or `packages/db/migrations/0002_timescale.sql` for the time-series answer |
| The data platform in three sentences | The spine is an append-only event ledger in Postgres, which is why the retroactive sweep is a replay and not a recomputation. Timescale turns that ledger into a hypertable and gives us one continuous aggregate, the weekly outflow per supplier that feeds the behaviour detector, and there is a plain-SQL equivalent so the offline path answers identically. Nessie is the company's bank mirror for reconciliation, never the analytics store, and the shared enterprise pool is contaminated by other teams so we never compute on it |
| The Nessie quirks, unprompted | Dates with no time component, so intraday ordering lives in our ledger. Empty sub-collections that return either `200 []` or a 404 with a bare string. Mixed integer and float amounts. A 403 that means the wrong path rather than a bad key |
| The current honest gap | TODO(fabbyyyy), refresh at every milestone |
| What is next | TODO(fabbyyyy) |

### Adan (`Apanawa`), synthetic data, evaluation and external evidence

| Question | Answer |
|---|---|
| What do you own | The deterministic generator (#43), the labelled holdout cases and the metrics harness (#55), the SAT list loader and the retroactive sweep (#35), the real CEP evidence (#57), and `assets/` |
| The one file to open on screen | A holdout case JSON next to the metrics output, because the pair is the evaluation story |
| The data in three sentences | One fixed seed, byte-identical output asserted in a test, a demo company of 28 employees and about 42 suppliers over eight months, and a watermark flag on every generated object. The labelled cases that measure the detectors are written by me and are not read by the person who writes the detectors until those are merged, so the precision and recall are blind. The hard negatives are deliberate: a legitimate bank change backed by a payment complement, a legitimate new supplier ramping up, a round-number invoice, and a partial legal-name match that is fine |
| Why the labels are separate from the generator | Because a generator that creates both the data and the answer key measures nothing except itself |
| The current honest gap | TODO(Apanawa), refresh at every milestone |
| What is next | TODO(Apanawa) |

### Fabricio (`FabriBanda`), product surface, narrative and market

| Question | Answer |
|---|---|
| What do you own | The web surface (#46 to #51), `docs/00` to `06`, `docs/13`, `docs/14`, the README and the Devpost submission |
| The one screen to show | The payment-run screen with the alert rail, then the finding panel with its evidence chips. That pair is stage 3 of `docs/03-user-journey.md` |
| The experience in three sentences | The run arrives sorted by pesos at risk instead of alphabetically, so attention goes where the money is. Every finding says what produced it in plain Spanish and shows the evidence, including which digits of the account differ from the one we have paid before. Nothing accuses anyone: a finding is either provable from documents or it needs a human check, and a person makes every decision |
| The market in three sentences | TODO(FabriBanda) |
| The current honest gap | TODO(FabriBanda), refresh at every milestone |
| What is next | TODO(FabriBanda) |

## Shared answers, anyone can give these

**Why this track.** Because the persona's worst day is a payment that cannot be undone, and track 3
is the only one of the three where the thing we are protecting is irreversible. See ADR-0002.

**Why this stack.** One runtime for the API, the tests, the seeder and the migrations, native
TypeScript with no build step, and the intelligence as pure functions with zero dependencies so it
is unit-testable and readable at this table. One SQL dialect, two hosts, so the offline fallback is
not a second implementation. The API runs as a long-lived process because the screen is fed by a
Server-Sent Events stream. Full reasoning in `docs/07-architecture.md` and ADR-0001.

**The list is public and free. Why not just check it yourself.** The check is not the hard part, the
cadence is. It has to run against every supplier on every run, and again retroactively over
everything already paid and already deducted each time the SAT publishes a new list version. The
exposure is created by the publication, which happens after the payment, so a check done once at
onboarding does not protect anything. Our sweep is a replay over the event ledger and it quantifies
the deducted base, the ISR and the IVA per newly listed supplier. Evidence: `SweepResult` in
`packages/core/src/domain.ts`, `POST /api/v1/sat/publish`, beat 2 in `docs/10-demo-script.md`.

**The bank already shows the beneficiary name.** It shows a name after you have typed the account,
and it compares that name with nothing, because the bank does not have the invoice. We compare the
holder name on a Banxico-signed receipt against the legal name on the CFDI we are settling, we store
the signed XML byte-exact as evidence, and the result is one of match, partial or mismatch. It is
done once per account and not once per payment, so the registry of verified beneficiaries is an
asset that accumulates. Evidence: `POST /api/v1/cep/verify`, the CEP viewer (#50).

**The one-cent probe needs a person, so it is not automatic.** Correct, and it is the design rather
than a limitation. We hold no funds and we execute no transfer, which is precisely why we need no
licence and have no cold start. A person sends one cent from their own bank, and Banxico signs a
receipt for it that we can verify cryptographically. The automation is everything around that: which
accounts need it, what the receipt has to say, and remembering the answer.

**Why rules and not a model.** Four reasons, all of them graded: cost that scales with transaction
volume, latency in the hundreds of milliseconds, non-determinism that cannot be unit-tested, and a
transfer of financial data to a third party that LFPDPPP constrains. Deterministic scoring is
auditable, reproducible and explainable to a regulator. ADR-0004.

**Is this a wrapper around a language model.** No. Open `packages/core`, open the test file, run
`bun test` with the Wi-Fi off. There is no model call in any path that produces a finding, a
severity, a state or an action. A model is used only to phrase an already-computed finding when a
human asks for it, and that call cannot change the decision.

**What is real and what is synthetic.** Real: the SAT Article 69-B list in the lookup box, and one
CEP with its clave de rastreo, which a judge can re-verify on the Banxico site from their own phone.
Synthetic: every company, supplier, invoice, CLABE and instruction, each carrying `synthetic: true`,
each watermarked on screen from that flag. Real RFCs are never attached to synthetic invoices, which
is a binding rule in ADR-0002 and, once #35 lands, a test rather than a promise.

**What is real versus stubbed in the build.** TODO, refresh at every milestone, and name the stub
before a judge finds it. As of 2026-09-12 the vertical slice, the detectors, the schema and the
deploy are separate open issues (#62, #33 to #39, #40, #44).

**Where the data comes from.** A deterministic synthetic generator in `packages/seed` with a
committed seed, plus the Nessie sandbox as the company's bank mirror for reconciliation. No real
personal data anywhere, including in screenshots and issues. Methodology in `docs/08-data-model.md`.

**How do you know it works.** The metrics page reports precision, recall and false-positive rate per
detector with the case count next to them, computed over labelled cases written by someone who does
not write the detectors, in a folder the detector author does not open until the code is merged. The
git history is the evidence that the separation held. We also state the thresholds we would refuse
to ship at, and we wrote them before the first run.

**What happens at ten times the volume.** The read path is one indexed query per company over a time
window, and on Timescale the ledger is a hypertable with a continuous aggregate doing the weekly
rollup. Each detector is O(n) over that window with no IO. The hot path contains no inference, so
cost does not scale with volume. The first thing that breaks is the fan-out of the SSE stream on one
process, and the fix is to shard by company. The thresholds are in `docs/07-architecture.md`.

**What does one verification cost you.** One cent of principal for the probe, plus a signature check
that is local. Scoring has no marginal cost because there is no inference in it. The only metered
cost in the product is the optional explanation, which is on demand and outside the decision, and
its cost model with live prices is in `docs/06-regulatory-privacy.md`. TODO(FabriBanda) stamp the
prices with a date at M3.

**How this makes money.** TODO(FabriBanda), one sentence plus the payback figure, from
`docs/05-business-model.md`. Until that cell is filled, the honest answer is "the company pays and
the accounting firm holding thirty of them is the channel, and the price is not something I am going
to invent at this table".

**What regulation applies.** We are not a regulated entity: we hold no funds, we execute no
transfer, we originate no credit. We are a decision-support layer over documents the client already
owns, and nothing is declined or reported without a person. Ley Fintech, CNBV, Banxico for SPEI,
CONDUSEF and LFPDPPP are mapped to concrete obligations in `docs/06-regulatory-privacy.md`. No
automated adverse action, ever.

**What about false positives. You are accusing suppliers.** No finding is an accusation. Every
finding is either `comprobable`, meaning it is provable from the documents on screen, or
`requiere_verificacion`, meaning a person has to check. The expected-loss decision weighs the amount
at risk against the cost of delaying that payment by a day, which is why a small payment is not held
for a weak signal. Every override is recorded and goes back into the labelled cases, so the
false-positive rate is a number we track rather than a risk we mention.

**A supplier listed as presunto is not the same as definitivo.** Correct, and the list statuses are
modelled as exactly that: `presunto`, `desvirtuado`, `definitivo` and `sentencia_favorable`, each
with the publication date of that status and the list version it came from. A presunto raises a
different severity from a definitivo, and a desvirtuado clears. That state machine is in
`domain.ts`, not in a comment.

**Why Nessie at all.** As the company's bank mirror, so that the sixth control has something to
reconcile against: outflows that have no instruction and no CFDI behind them. It is not our
analytics store, and we never compute on the shared enterprise pool.

**What did you cut, and why.** The `cut` label on the board, with one line of reasoning per issue,
listed in `docs/14-process.md`. Name two specific ones out loud, including one you wanted.

## Rules for this sheet

- The honest gap is mandatory and it is the highest-value line here. A volunteered gap reads as
  engineering maturity. A discovered one reads as a Wizard of Oz.
- Never invent a number at the table. "I do not have that number, it is derived in `docs/04`" is a
  fine answer and a much cheaper one than being corrected.
- If two people would answer differently, the answer is not written yet.
- Every path named in this file has to exist when it is named. Check the paths at each milestone.
