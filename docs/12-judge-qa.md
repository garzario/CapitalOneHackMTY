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

## The three questions the judges actually asked

On 2026-09-12 in the afternoon three Capital One judges came to the table and asked one of these
each. They are now the first thing on this sheet because they were the first thing asked, and because
two of the three were answered badly the first time. Every number below is derived in
`docs/04-market.md` and the bracketed sources are that file's numbered list. Anyone on the team can
give these three. Nothing outside the "allowed to say" rows goes out loud.

### 1. How many people have this problem in Mexico, and is there demand?

**Thirty seconds.** "Two problems and two sets of official numbers. On the fraud side, INEGI's
victimisation survey of businesses makes medium-sized firms the most victimised size band in the
country, 49 percent of them hit by a crime in 2023, more than large firms, and Condusef's own register
shows the banks gave back 24 percent of the pesos claimed for fraud in the first quarter of this year.
That is the whole thesis: once it leaves, one peso in four comes back. On the fiscal side the head of
the SAT said three days ago that it has audited about two thousand buyers of false invoices in the
last twenty-two months, and since January the buyer risks two to nine years of prison and loses the
ability to invoice at all if it misses a thirty-day window. The band is about 246,000 firms. The
number nobody publishes is the intersection of the two, and I will tell you that before you ask."

| Allowed to say | Source |
|---|---|
| 49.0 percent of medium-sized and 40.7 percent of small economic units were crime victims in 2023, against a 27.2 percent national average | [14] |
| 1.3 million establishments victimised, MXN 124.3 thousand million of cost, 0.51 percent of GDP | [14] |
| Fraud is 8.5 percent of 2.9 million crimes, 522 per 10,000 units, MXN 18,370 each | [15] |
| 90.3 percent of crimes against economic units produced no complaint or file, and only 12.2 percent were reported | [14] |
| 24 percent of cyberattacks on surveyed Mexican companies were supplier or staff email impersonation; 45 percent reported a fraud; only 43 percent run supplier due diligence | [16] |
| 5,213,358 possible-fraud bank claims in 2025, 72 percent of all claims, MXN 22,341 million | [17] |
| Banks refunded MXN 1,265 million of MXN 5,201 million claimed for fraud in the first quarter of 2026, 24.3 percent | [18] |
| SPEI moved more than 7,300 million transfers in 2025, up 36.8 percent, and 94 percent were at or below about MXN 13,200 | [19] |
| About 2,000 buyer-side audits, more than 3,000 factureras published and more than 38,000 companies blocked, October 2024 to August 2026 | [20] |
| 903 EFOS published in 2026 to 12 June, and 7,300 digital seals restricted beyond them | [21] |
| Thirty natural days to reverse or lose the digital seal, 45 business days for the SAT to publish, two to nine years of prison for the buyer | [4] |
| 86.3 percent of the 11-to-250 band already runs accounting software or pays an external accountant | [24] |
| About 246,000 Mexican firms at 11 to 250 people, TAM MXN 2,655 million a year | [1] |

**Do not say.** Any peso figure for supplier impersonation or business email compromise in Mexico,
because none is published. Any share of those 5.2 million claims belonging to companies, because
Condusef does not separate personas morales from consumers. Any business-to-business share of SPEI.
Any standing count of buyers currently exposed, because the SAT publishes issuers and never buyers.
The answer when pushed is "that number is not published and I am not going to invent it at this
table, here is the one that is", which is also the answer that buys the most credibility.

### 2. Who is already doing it in Mexico, what are their winning features, and what problems do they face?

**Thirty seconds.** "Two camps, and we are neither. The fiscal camp already holds payments on the SAT
list: ValidX sells exactly 'antes de pagar, si no cumple se retiene y se notifica a Compras', a
Monterrey company called Portal de Proveedores sweeps 69-B daily across twenty thousand suppliers and
holds the payment, and CONTPAQi has the list and the mass-payment button inside the same product. The
money camp moves the pesos and never looks at who receives them: Clara disperses hundreds of SPEI
from a spreadsheet the payer uploads, and Xepelin's own page describes the whole flow in three steps,
none of which is a counterparty check. Even the one-cent probe is a commodity, Verificamex sells it
for nine to eighteen pesos a call. So no, we did not invent checking 69-B before paying. What nobody
sells is the join of both halves in one decision, and what nobody sells at all is the account's own
history."

| Company | Winning feature | The problem, from its own dated material | Source |
|---|---|---|---|
| ValidX | Pre-payment hold plus a daily sweep of four SAT lists, by API | Only the SAT is marked available; IMSS, Buró and every sanctions list are roadmap and "no se pueden consultar hoy". Phased rollout to a reduced client group, no published price, no ERP connector | [31] |
| Portal de Proveedores, Monterrey | Holds payment on an expired document, sweeps 69 and 69-B daily, 125,000 CFDI a month self-reported | A buyer-imposed portal that 14,000 suppliers log into, which a 28-person firm cannot impose. No bank layer at all | [32] |
| CONTPAQi Contabilidad-Bancos | The list and the payment run in one product; added 49 Bis in July 2026 | Its own changelog from 14.2.4 to 19.3.1 has no pre-payment check of the beneficiary against any list. The signal is a retrospective dashboard | [33] |
| Bind ERP | Free EFOS verifier, zero friction | Its help centre says the system "no restringirá" the transaction and only alerts. This is our best single argument for deciding instead of warning | [34] |
| Verificamex | The penny test as a metered API, MXN 8.93 to 17.85 plus IVA, 90+ banks | No 69-B, no CFDI, no duplicates, no decision. One account verified in isolation with no history to compare against | [35] [36] |
| Clara | 40,000 companies, SAT invoice validation, custom approval flows | Batch dispersal from an uploaded .xlsx: invoice-valid plus approver-valid plus beneficiary-unknown | [37] |
| Xepelin | Confirming plus the payment, USD 10 thousand million financed | Three steps, no counterparty verification, and suppliers need not be registered at all | [38] |
| albo empresa | CNBV-authorised IFPE, MXN 71 thousand million a month, 3,000 payments at once | Its published protection is authentication and monitoring of the sender, never the counterparty | [39] |
| Yaydoo inside Paystand | Grew more than 100 percent year on year | Its own chief executive said in March 2026 it is moving from pyme to medianas and grandes. The category leader is leaving our segment | [40] |
| Mendel | USD 35 million Series B, Mercado Libre and FEMSA as customers | Built for "las grandes empresas de Latinoamérica" against SAP Concur. The tier above us is taken, which answers "why not just add this" | [41] |
| HSBC México, HSBCnet | It really does sell beneficiary-name validation | "Únicamente cuentas HSBC", a batch file of up to 5,000 accounts, 07:00 to 22:00, report in up to 20 minutes. A hygiene sweep, never a gate | [42] |
| BBVA México, Net Cash | The largest bank's own corporate flow | The company types the holder's name itself. The only control is a token challenge on the last six digits, which authenticates the employee and not the account holder | [43] |

**Do not say.** "Nobody in Mexico checks 69-B before paying", "we invented the penny test", or "the
window is empty". All three are breakable in one search, and the last two are contradicted by Banco
de México's own rules, which have the central bank sending a one-centavo transfer and reading the CEP
[29]. Do not say anything about Belvo either: its site refuses automated fetching and we know nothing
about what it sells here. And do not claim a customer complaint about any competitor, because the
review sites blocked us and every problem in that table is the vendor's own admission or a named
outlet.

### 3. Who exactly is the target user?

**Thirty seconds.** "The one administrative clerk who runs the supplier payment run at a formal firm
of 11 to 250 employees. Not a treasurer, because there is no treasurer: Nuevo León had eleven
treasury vacancies of any kind on the day we looked, against a hundred for accounting clerks. There
are 403,000 people in that occupation nationally and 25,900 in this state, two thirds of them women,
paid about twelve thousand pesos a month here, and 60 percent of firms her size do their banking in a
browser, which is where we sit. The buyer is the owner, who is the single decision maker in six out
of ten firms this size and who is also the person a hold escalates to. The channel is the despacho
contable, and there are 16,356 of them, three quarters with five people or fewer. Who it is not: the
micro firm with no weekly run, the company above 250 that already has an ERP and a treasury team, and
anyone informal, because every control we run reads a CFDI, a CLABE or a CEP."

| Allowed to say | Source |
|---|---|
| 403,000 in the occupation nationally in 2026-T1, 25,900 in Nuevo León, MXN 8,640 a month nationally and MXN 11,900 in Nuevo León, 67.1 percent women, average age 38 | [27] |
| 60.4 percent of firms with six or more employees bank through the institution's web page, against 35.0 percent on a mobile app | [28] |
| The principal decision maker is a director or manager in 61.2 percent of firms, a partner or founder in 19.9 percent | [28] |
| 16,356 accounting and audit units nationally, 737 in Nuevo León, 12,130 of them with five people or fewer | [26] |
| About 18,500 firms at 11 to 250 people in Nuevo León, 10.2 percent of the state's 181,791 units, employing about 685,000 people | [25] |
| 89,523 establishments at 11 to 250 in manufacturing, wholesale, transport and construction, 54,555 of them at 11 to 30 people | [26] |
| Micro units are 89.3 percent of Nuevo León's units and 21.7 percent of its employment; firms above 250 are 0.6 percent of units and 42.7 percent of employment | [25] |
| Eleven treasury vacancies in Nuevo León on 2026-09-12 against 101 for `auxiliar contable`, from a job board and labelled as one | [44] |

**Do not say.** That 403,000 are all accounting clerks, because the occupation code bundles in
economists, finance staff and stockbrokers and the figure is an upper bound. That the 61.2 percent
plus 19.9 percent plus 10.8 percent are "the owner side", because a director or manager may be an
employee and the survey measures decisions in general and not the payment decision. That a job board
is a statistic. And that any of this validates Lupita: it sizes the population she is drawn from, and
`docs/02-persona.md#pending-human-validation` is still two unchecked boxes.

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
| The market in three sentences | TODO(FabriBanda), in your own words. The long version, with the numbers allowed and the three things not to claim, is in [The three questions the judges actually asked](#the-three-questions-the-judges-actually-asked) |
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
cadence is, and the cadence is already sold: ValidX and Portal de Proveedores sweep it daily and
69b.mx sells it by monitored RFC. What none of them does is read it next to the account the money is
about to leave for. It has to run against every supplier on every run, and again retroactively over
everything already paid and already deducted each time the SAT publishes a new list version. The
exposure is created by the publication, which happens after the payment, so a check done once at
onboarding does not protect anything. Our sweep is a replay over the event ledger and it quantifies
the deducted base, the ISR and the IVA per newly listed supplier. Evidence: `SweepResult` in
`packages/core/src/domain.ts`, `POST /api/v1/sat/publish`, beat 2 in `docs/10-demo-script.md`.

**The bank already shows the beneficiary name.** Be precise here, because one bank really does sell
this: HSBCnet validates beneficiary names, "unicamente cuentas HSBC", from a batch file and inside a
service window, which is a hygiene sweep of an address book and not a gate on an outbound payment.
BBVA Net Cash, by contrast, has the company type the holder's name itself. So the general answer is
that a bank shows a name after you have typed the account, and compares that name with nothing,
because the bank does not have the invoice. We compare the holder name on a Banxico-signed receipt
against the legal name on the CFDI we are settling, we store the signed XML byte-exact as evidence,
and the result is one of match, partial or mismatch. It is done once per account and not once per
payment, so the registry of verified beneficiaries is an asset that accumulates. Evidence:
`POST /api/v1/cep/verify`, the CEP viewer (#50), and `docs/04-market.md` sources [42] and [43].

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

## Table feedback of 12 September and the answers

Three Capital One judges, two engineers and one product person, came to the table on the afternoon of
2026-09-12 and the table went badly. What follows is what they said and the answer to give next time,
each one in about thirty seconds. Every sentence here is checked against the code, and the file or the
endpoint it rests on is named once. Issue #171.

The rule that produced this section, and it is the rule for adding to it: **an answer that is not true
in the repository today is written as "today X, and by the demo Y", with the issue number that makes it
Y.** A judge who finds the gap costs more than the gap.

### 1. "Do you know who your competition is?" We could not answer

**This answer was rewritten after the market research of PR #177 landed in `docs/04-market.md`.** The
old one named two Mexican companies that both run on a list, three global platforms and the status
quo, and closed with "nosotros somos el unico que junta las tres cosas en el momento del pago".
Both halves of that are falsifiable in one search, which is the most expensive way to lose a table:
ValidX and Portal de Proveedores already hold a payment on SAT compliance, and the one-centavo probe is
Banco de Mexico's own codified procedure. What follows is the narrower claim, and it survives the
search.

> Si. La mitad fiscal retiene sin ver la cuenta: ValidX, Portal de Proveedores, 69b.mx, Tesio. La del
> dinero dispersa SPEI sin verificar a quien recibe: Clara, Xepelin. El centavo es commodity:
> Verificamex lo vende y Banxico lo manda en la regla 51a Bis. CONTPAQi tiene ambas mitades y no se
> cruzan; Bind ERP avisa y no restringira, lo dice su ayuda; HSBCnet valida nombres solo de cuentas
> HSBC; Trustpair, nsKnox y Eftsure verifican cuentas corporativas afuera. Lo nuestro es la union: una
> decision con evidencia antes de la transferencia.

**One line each, which is the order to say them in if a judge asks about any one of them.** Every cell
is the vendor's own published material with its access date, in `docs/04-market.md#competitor-map`.

| Name | Said out loud, in one line | Source |
|---|---|---|
| ValidX | "Antes de pagar: cada pago consulta el estatus del proveedor; si no cumple, se retiene y se notifica a Compras". Retiene sobre cuatro listas del SAT y nunca ve la cuenta. Anuncia rebarrido diario del 49 Bis, que el SAT no publica como archivo | [31] |
| Portal de Proveedores, Monterrey | Barre 69 y 69-B a diario y detiene el pago cuando un documento vence. Ninguna capa bancaria, y es un portal al que entran catorce mil proveedores | [32] |
| Verificamex | Vende la prueba del centavo con lectura del CEP, de nueve a dieciocho pesos por verificacion. Sin 69-B, sin CFDI, sin decision | [35] [36] |
| Banco de Mexico | La regla 51a Bis del SPEI manda un centimo de peso y lee el titular en el CEP, en nombre del propio Banxico. El centavo no es un truco, y tampoco es nuestro | [29] |
| CONTPAQi Contabilidad-Bancos | Tiene las dos mitades en un solo producto, tablero fiscal y dispersion masiva con conexion al banco, y su propio changelog muestra que no se encuentran en el momento del pago | [33] |
| Bind ERP | Su centro de ayuda: el sistema "no restringira" la operacion con un proveedor en la lista de EFOS, "pero si te alertara". Avisa, no decide | [34] |
| Clara | Cuarenta mil empresas, valida la factura con el SAT, y dispersa cientos de SPEI desde un .xlsx que sube el pagador. Su pagina no nombra ninguna verificacion de quien recibe | [37] |
| Xepelin | Confirming en tres pasos, linea, SAT y pagar, y ninguno de los tres verifica la contraparte. Los proveedores no tienen que estar registrados | [38] |
| HSBCnet | Si vende validacion del nombre del beneficiario, y "unicamente cuentas HSBC", por archivo y en horario. Higiene de una libreta, nunca una puerta en el pago | [42] |
| 69b.mx y Tesio | Corren sobre la lista: monitoreo por RFC con constancia desde MXN 199, y cruce de los CFDI ya descargados desde MXN 499. Ninguno ve la cuenta | [7] [8] |
| Trustpair, nsKnox, Eftsure | Verifican cuentas de beneficiarios para tesorerias corporativas fuera de Mexico, y no mencionan Mexico, CFDI, SAT, SPEI ni CLABE en su material publico | [9] [10] [11] |
| El statu quo | El contador con una hoja de calculo y WhatsApp, unos cuantos RFCs a mano una vez al mes, sin evidencia de que la revision ocurrio | [24] |

**Our claim, in the words that survive the search.** The union of the fiscal half and the money half in
one decision, retener, verificar o liberar, with the evidence attached, before the transfer is
irrevocable. Two edges of that union are sharper than the join itself and are the ones to name second:
we found nobody selling the comparison of a new CLABE against the accounts that supplier has already
been paid on, and nobody turning either signal into a decision with an amount at risk on it.

**The two sentences never to say, in any version, in either language.**

1. **"Nadie hace esto."** Nobody does this is false and ValidX's own landing page is the
   counterexample. What replaces it is "no encontramos a nadie que venda las dos mitades juntas",
   which is what the research supports and is weaker on purpose.
2. **"Nosotros inventamos la prueba del centavo."** We invented the one-cent test is false twice:
   Verificamex sells it metered [36] and Banco de Mexico writes it into Regla 51a Bis of the SPEI
   rules [29]. What replaces it is that the centavo is a commodity primitive and that what is ours is
   the decision we hang on its answer.

Two more things not to say here, for the same reason: nothing about Belvo, whose site refuses automated
fetching and about which we know nothing, and no customer complaint about any competitor, because the
review sites blocked us and every problem in that table is a vendor's own admission or a named outlet.

**Scope, volunteered before it is found.** ValidX advertises daily re-screening of four SAT lists and
CONTPAQi shipped the 49 Bis situation in July 2026, so "you only cover one list" is a question that
comes straight out of the table above. This section was drafted as "today 69-B, and by the demo the 49
Bis list (#180)", the rule this whole section is written under. **#180 landed before this pull request
did, so the answer changed and this is the current one**: both articles are in the lookup, in control
1 and in the retroactive sweep, and `GET /api/v1/sat/lookup` answers a block per list. Say both halves
in one breath:

> Leemos los dos articulos que el SAT publica contra un proveedor, el 69-B y el 49 Bis, en la consulta,
> en el control y en el barrido hacia atras. Y decimos lo segundo: el 69-B contesta desde la lista
> descargada, y el 49 Bis contesta que no hay lista. El SAT no lo publica como archivo, lo publica
> oficio por oficio en el DOF, catorce oficios con catorce contribuyentes entre el diez de julio y el
> veintiocho de agosto de 2026. Por eso nunca decimos que barremos la lista del 49 Bis.

The endpoint says it rather than the presenter: the 49 Bis block carries `answered: false` and
`coverage: "not_published_machine_readable"` with those counts and the URL to check them, and it
deliberately has no `listed` key, because an empty `entries` rendered as "no esta listado" would claim
a check nobody ran. That also answers the competitor: a vendor advertising daily re-screening of 49 Bis
[31] is transcribing or scraping DOF notes, and that is a claim we do not make without the file. 69-B
Bis is out on purpose, because it is about transferred tax losses in a restructuring and its complete
listing holds three taxpayers. All of it is in `docs/04-market.md#what-we-cover-on-49-bis-and-what-nobody-can`
and `docs/09-api.md`.

Rests on: `docs/04-market.md#competitor-map` and `docs/04-market.md#the-gap`, where every company named
is named with its own published material and its access date, and the roster in section 2 of this file,
which carries the winning feature of each one next to its problem. The market, the gap and the sizing
are issue #169 and land in `docs/04`, `docs/02` and the sections above.

### 2. "My father has a PyME and talks to his suppliers constantly. I am not your user"

> Correcto, usted no es el usuario. El usuario no es el dueno que conoce a cinco proveedores por la
> voz. Es la empresa cuya corrida del jueves le paga a decenas de proveedores a traves de una sola
> persona de administracion, que no conoce a ninguno por la voz y que no puede llamarle a cuarenta y
> cuatro. Y hay algo mas importante: el WhatsApp y el correo del proveedor son precisamente el canal
> que usa el atacante. Confiar en la conversacion no es la defensa, es el modo de falla. Y la perdida
> del articulo 69-B no necesita fraude de nadie: nadie le robo nada, el SAT publico una lista, y las
> deducciones que ya tomo se anularon.

Rests on: `docs/02-persona.md` for the person, and the narrative rule in
`docs/adr/0002-track-and-thesis.md` that keeps the hook fiscal instead of "me cambiaron la cuenta". The
demo company is 28 employees with 44 suppliers over eight months of history. `bun run seed` prints the
44 suppliers, the 4,103 CFDIs and the 92 instructions; the headcount and the city are in
`packages/seed/src/sentryone/company.ts`.

### 3. "What is the market, the model, the competition, what are you solving, is it worth anything?"

> Doscientos cuarenta y seis mil empresas mexicanas de once a doscientos cincuenta personas, y el
> tamano se construye de abajo hacia arriba, entidades por precio, con cada insumo citado. Cobramos
> ochocientos noventa y nueve pesos al mes a la empresa y tres mil novecientos al despacho contable que
> trae veinte. Se paga con una sola factura detenida de veintitres mil cuatrocientos cincuenta y dos
> pesos de subtotal al ano. Y si despues de doscientos barridos gratuitos menos del cinco por ciento
> destapa un RFC listado o un beneficiario no verificable, el problema es demasiado raro en este
> segmento y paramos. Esa prueba corre sobre la cuna, cuesta un mes y no un ano.

Rests on: `docs/04-market.md#sizing` and `docs/05-business-model.md`. The stop condition is the last
row of `docs/05`, and volunteering it is the point: a business model with no falsification test is a
pitch.

### 4. "In real life this takes 8 minutes and with your product it takes seconds." They did not care

They were right, and the sentence is out of the pitch.

> Tiene razon, los ocho minutos no valen nada. Lo que vale es la perdida que no ocurrio, y por eso la
> corrida contesta en pesos y no en minutos: cuanto se detuvo, cuanto se libero y cuanto quedo en
> riesgo. Y cuanto de lo que ya pagamos y ya dedujimos quedo expuesto lo pone en precio el barrido, en
> el momento en que el SAT publica. De un subtotal rechazado se revierte el cuarenta y seis por
> ciento entre ISR e IVA, asi que una factura de cien mil pesos de subtotal detenida paga cincuenta y
> un meses de suscripcion, y un SPEI mal dirigido del mismo monto paga ciento once, porque ahi no hay
> nada que revertir. No decimos con que frecuencia pasa. Eso es justo lo que mide el barrido gratuito.

Rests on: `GET /api/v1/run/current`, whose `totals` now carry `heldAmount`, `toVerifyAmount`,
`releasedAmount`, `stoppedAmount`, `amountAtRisk`, `retroactive69bBase` and `retroactive69bExposure`,
from `runMoney` in `packages/core/src/exposure.ts`. On the seeded run `stoppedAmount` is MXN 785,289.86
and `amountAtRisk` is MXN 799,209.86; the first of the two is the hero figure on the run screen. The
second is larger than the first, and that is not a bug: the pesos at risk are counted on every line
that carries a finding, including the one the engine released because waiting costs more than the risk.
Read both off a fresh run, like every other number on this sheet.

The two 69-B fields used to be the honest gap here, because they read zero on stage. Since #175 they do
not: `POST /api/v1/sat/publish` re-scores the pending lines of the run that pay the suppliers it names,
in the same request that prices the ledger, so the run's own findings carry the voided deductions and
the pair climbs while the list publishes. On the seeded run it goes from zero on both to
`retroactive69bBase` MXN 878,592.59 and `retroactive69bExposure` MXN 404,152.59, and `amountAtRisk`
climbs by exactly that exposure, from MXN 799,209.86 to MXN 1,203,362.45. One line moved,
`INS-2026-09-07-070`, from `verify` to `hold`, signed `system`. So this can be pointed at now, and the
sentence to say over it is that the run counter and the sweep are one arithmetic and not two: the
whole-ledger figure is `SweepResult.totalExposure` on that endpoint and on the sweep constancia, and the
run-level pair is the part of it belonging to the suppliers this run pays, counted once per RFC by
`runMoney`. Read all of it off a fresh run.

Two things are still worth volunteering in the same breath. The run screen renders the money that is
stopped and the alert rail, so what a judge watches move there is the line going from `Verificar` to
`Retener`, the held split going from 2 and 4 to 3 and 3 and MXN 676,112.38 held, and the new
`definitivo` row at MXN 487,672.59 at risk; the pair itself is on `totals` and reaches the screen with
#174. And a released line and a line a person decided are deliberately never re-scored, which is why
the pair can be lower than the whole-ledger figure and must never be described as the total cost of a
publication.

### 5a. "What if the person does not answer the call?"

> Nadie contestando es una respuesta, no un hueco. El lector de la llamada la clasifica como no_answer,
> que incluye el buzon de voz, y si se alcanzo a oir algo, la bitacora guarda la frase exacta de la que
> se leyo. El pago sigue detenido: la llamada no libera nada, nunca. Y en la misma respuesta viene el
> plazo y los siguientes pasos: volver a llamar, verificar la cuenta con un centavo, que no necesita que
> nadie conteste nada, o liberar con nombre y con razon escrita. El plazo es el mismo retraso que la
> decision ya cobro, tres dias si el pago esta retenido y un dia si esta por verificar, y el reintento
> se acota con esa fecha y no con un contador.

Rests on: `parseVerificationOutcome` in `packages/voice/src/outcome.ts` for the four outcomes, and
`POST /api/v1/instructions/:id/verify-call`, whose recorded response carries `hold` with the deadline
and the ordered `nextSteps` from `holdWindow` in `packages/core/src/hold.ts`.

**Say the window as two numbers, never as three days.** `HOLD_WINDOW_DAYS` is `EXPECTED_DELAY_DAYS`
under another name, and it is three days for a `hold` and one day for a `verify`. A verification call is
placed on a payment the engine put in `verify`, so the `hold` that comes back on that response says
`days: 1`. Quoting three days there is the kind of thing a judge checks with one `curl` and it is wrong.
The seeded hero instruction is also already past its window, so `expired: true` is what the demo shows;
nothing is released or refused by that, which is the point of `expired`.

Two properties worth volunteering: after a `denied` the only step offered is `keep_held`, because
suggesting "libera de todos modos" next to the supplier's own denial would be the product arguing
against its own finding; and `releasesPayment: false` is on every response of that endpoint that reports
a call, which is the script, the started call, the recorded outcome and the 422 with no telephony. A 404
for an instruction that does not exist carries only the error envelope, so say "en toda respuesta de esa
llamada" rather than "en toda respuesta".

The evidence sentence is conditional and worth being precise about: for a voicemail greeting the event
carries the phrase it was read from, and for a telephone nobody picked up at all there is no phrase and
no transcript, only the `no_answer`. Silence is still an outcome; it is just not a quote.

Today the deadline and the steps are in the API and not yet on the screen, and by the demo they are on
the instruction detail (#174).

### 5b. "What if it is urgent and nobody answers?"

> Se libera, y se libera bien. Hay salida y esta dentro del producto, porque una retencion sin salida
> se brinca por fuera, donde no queda registro de nada. El pago se libera con el nombre de quien lo
> decide y con la razon escrita, y en la pantalla en ese momento estan los pesos en riesgo de cada
> hallazgo, la perdida esperada del pago y lo que cuesta esperar un dia mas con ese proveedor. Queda
> como evento decision_made en una bitacora que solo crece.

Rests on: `POST /api/v1/instructions/:id/decide`, which takes `decidedBy` and `reason` and answers
`amountAtRisk` next to the decision; the argument is stored on `decisions.reason`
(`packages/db/migrations/0011_decision_reason.sql`) and travels on the `decision_made` event. The
expected loss is on the instruction screen and each finding carries its own pesos at risk, in
`apps/web/src/screens/InstructionScreen.tsx` and `apps/web/src/components/Findings.tsx`.

One honest gap worth volunteering before it is found, and one figure that is now worth pointing at
rather than talking around.

- Since #199 the screen sends the identity the header carries rather than a fixed string, and the API
  refuses an override that has no reason with a `422` asking for it, so the prose is no longer optional
  on the one shape where it matters. What the screen still owes is asking for it before the click
  instead of after the refusal, and the identity selector itself (#174).
- The screen carries a third figure, "Costo de retrasar un dia", and since #182 it reads a number on
  every one of the 92 payments: between MXN 101.98 and MXN 4,611.27, MXN 1,120.05 on the hero line.
  `Supplier.delayCostPerDay` is priced per supplier in `packages/seed/src/sentryone/delay-cost.ts` from
  two things a supplier contract actually carries, moratory interest on the balance owed and the pronto
  pago discount that expires the day the payment is late, and it is higher for the raw material and the
  tooling that stop production than for consumables and services. "Valuado en pesos por dia" may now be
  said at the table. What must not be said is that the number is measured: it is priced from the
  catalogue of a synthetic company, so the honest sentence is "asi valuamos la relacion en esta empresa
  sintetica, y en una real el dato sale de sus contratos".

The API refuses a release with no prose on exactly the shape where the prose is the point, and nowhere
else. A release on a line that is not `confiable`, or one the engine was holding, is the owner's
exception: a clerk asking for it is `403` with the sentence that says who can, and the owner asking for
it with no `reason` is `422` asking for the argument. The same two answers guard a decision on a line
the run cancelled. Every other decision still takes no prose, because an API that refused an ordinary
hold for lack of a sentence would be refused by the clerk instead, outside the product, where nothing
is recorded at all. Verified in `apps/api/src/routes/instructions.test.ts`: the tests
`refuses a clerk releasing a payment a finding stopped, and says who can`,
`asks the owner for the argument, and refuses the release without one` and
`releases it for the owner with a reason, and the ledger says who and why`, plus
`carries no reason when nobody wrote one, rather than the last one` for the ordinary case.

### 5c. "What if the calculation is wrong? How sure are you about the percentages?"

> Los dos errores no cuestan lo mismo, y el producto esta escrito alrededor de eso. Un falso positivo
> cuesta un retraso, y ese retraso esta acotado: la retencion trae fecha limite, tres dias, y la
> verificacion uno, que es exactamente el retraso que la decision ya cobro. Un falso negativo cuesta el
> monto completo y es irrevocable. Ademas ningun hallazgo es una acusacion: cada uno trae su evidencia en
> pantalla y decide una persona. Y uno de los seis controles no estima nada, es un hecho documental: que
> un RFC este o no en la lista del 69-B, con la fecha de la publicacion de la que salio.
>
> De los numeros: treinta casos etiquetados por quien no escribe los detectores, ochenta y cinco por
> ciento de precision, ochenta y uno de recall, uno punto nueve por ciento de falsos positivos, y el
> motor eligio la accion etiquetada en veintiocho de treinta. Son casos sinteticos y lo decimos. La
> calibracion de verdad es despues del hackathon: modo sombra con un socio de diseno, sobre corridas
> reales, y si despues de doscientos barridos menos del cinco por ciento destapa algo, paramos.

Rests on: the asymmetry is `decide` in `packages/core/src/decision.ts`, whose header says the tie
goes to paying and why; the deadline is `holdWindow`, built on the same `EXPECTED_DELAY_DAYS` table
the expected loss was weighed against, so the arithmetic and the promise on screen cannot drift
apart. Since #182 the bound on a false positive can be said in pesos as well as in days, because the
delay the decision charged for now has a price: on the hero line one day of verification costs MXN
1,120.05 and three days of hold would cost MXN 3,360.15, against MXN 23,050.49 of expected loss.
That line is stopped by its critical finding rather than by the arithmetic, and the arithmetic
agrees. The line where the arithmetic decides on its own is `INS-2026-09-07-032`, which carries a
duplicate-invoice warning worth MXN 2,088.00 of expected loss and is released, because a day of
delay with that supplier costs MXN 4,611.27. A critical finding can never be released that way, and
that is the shape of `chooseRule` rather than a check bolted on the end. The numbers come from
`scripts/eval.ts` over the thirty cases in `packages/seed/src/holdout/cases`, served by
`GET /api/v1/metrics`, and they were re-run on this branch before this section was written. Read them
off a fresh run, never from memory.

**Why the sentence about facts now names one control and not two.** The 69-B membership is a fact: the
committed list either carries the RFC on a dated publication or it does not. The beneficiary comparison
is not there yet, and claiming it is the thing that gets caught. `nameMatch` in
`packages/cep/src/name-match.ts` answers `match`, `partial` or `mismatch`, and `partial` needs only one
shared word and is over-inclusive on purpose, which is a judgment. The seal on the CEP reads
`not_checked`, because Banxico publishes no specification of its signing scheme, so "un comprobante que
firma Banxico" is a document we have not verified Banxico signed until #57 lands the real one. And
`beneficiary_cep` is the one detector reading 0.0 percent in the blind evaluation. Say what the control
compares and say the seal is unverified, in the same breath.

One thing to volunteer rather than defend: **the loss probability per severity is a prior, not a
measurement.** `LOSS_PROBABILITY_BY_SEVERITY` in `decision.ts` carries three numbers with a `TODO` on
top saying exactly that. The screen does not yet say it: it renders "Perdida esperada" as a peso figure
with no note that the probability behind it is an assumption, so this one is said out loud rather than
pointed at (#174). What is not a prior is the amount at risk: it is the instruction's own pesos plus, for
a listed supplier, the ISR and IVA that reverse on the subtotal already deducted, at the published rates.
That second term used to be a sentence with nothing behind it on stage, because the run-level pair read
zero until a publication had priced a supplier the run pays; since #175 the publication in beat 2 prices
one and the run carries it, so the claim is now a figure on the screen: MXN 487,672.59 at risk on
`INS-2026-09-07-070`, which is its own MXN 83,520.00 plus the MXN 404,152.59 of voided deductions.
The shape of the table is the argument, the values are the
assumption, and they sit in one place so tuning the engine is a one-line diff a reviewer can see.

### 6. "The judges looked uninterested. It did not seem like a real problem"

That is a hook failure and not a product failure, so the fix is the first sentence and not the build.

> Dos cosas son ciertas cuando le pagas a un proveedor en Mexico. Si ese proveedor aparece en la lista
> del articulo 69-B del SAT, las deducciones que ya tomaste sobre sus facturas se anulan de forma
> retroactiva, y tienes treinta dias desde la publicacion para responder. La lista cambio treinta y
> tres veces en doce meses, una cada once dias. Y una vez que sale el SPEI es firme e irrevocable. La
> exposicion la crea la publicacion, no el pago, asi que revisar al proveedor cuando lo diste de alta
> no protege nada. Esto no necesita que nadie te defraude.

Rests on: the hook table at the top of `docs/11-pitch.md`, with both halves cited at their primary
source, Codigo Fiscal de la Federacion article 69-B and Ley de Sistemas de Pagos article 11. Say it
first, every time. The honest gap to volunteer in the same breath: the only published frequency is
national and per company, about 5 of every 100 economic units living a fraud in a year, and nobody
publishes it for this size band or per transfer. Derivation 4 of
`docs/04-market.md#the-rate-on-supplier-transfers-and-how-it-is-derived` scales it to the band under
an assumption it labels as ours, and the free supplier-register sweep in the go-to-market is the thing
that measures the real one.

## Second table of 12 September

A second Capital One panel came to the table on the evening of 2026-09-12. They said the project was
interesting, which the first table had not, and then asked more than one thing. The rule of the
section above applies here unchanged and every answer is written to it: the counts are counted and
reproducible, every rate that is not a count is labelled as an assumption, nothing anybody has not
agreed to is described as agreed, and the honest gap is volunteered in the same breath rather than
defended when it is found. One more rule this round earned, in section 9: **a number said at a table
that no source in this repository holds is written down as banned, with its replacement, in the same
pass that finds it.** A wrong number is cheaper to retract in a file than on stage. The issue number is
on each subsection, and the numbered sources continue one sequence so that one number means one
document everywhere: 1 to 48 and 67 to 74 are owned by `docs/04-market.md#sources`, and 49 to 66 by
`docs/05-business-model.md#sources`.

### 7. "Esta interesante. Ahora acota el mercado, y dinos exactamente quien lo vende y por cual canal"

Issue #193.

**Thirty seconds.**

> Seis mil cuatrocientas setenta y seis empresas de once a doscientos cincuenta personas en Nuevo Leon,
> en manufactura, mayoreo y construccion, contadas una por una en el directorio de unidades economicas
> del INEGI, y seis mil ciento catorce estan en el area metropolitana. Los primeros seis meses lo
> vendemos nosotros, a compras y a finanzas, nunca a la auxiliar: ella lo opera, no lo firma. El canal es
> el despacho contable como revendedor, y son ciento cuarenta y tres de once personas o mas en el estado,
> no setecientos treinta y siete. Y la ruta larga es el banco: que el control viva dentro de la banca
> empresarial, donde el pago ya se ejecuta. Nessie es el banco de nuestra demo, y nadie ha firmado nada.

| Allowed to say | Source |
|---|---|
| 6,476 establishments of 11 to 250 people in Nuevo Leon in manufacturing, wholesale trade and construction: 3,240, 2,445 and 791 | [48] |
| 6,114 of those 6,476, 94.4 percent, in the metropolitan municipalities, led by Monterrey 2,261 and Apodaca 857 | [48] |
| About 2,312 of them formal, after INEGI's blunt all-size national rate of 35.7 percent, which is too low for this band and is used anyway | [1] and [48] |
| 143 of the 737 accounting and audit units in Nuevo Leon employ 11 to 250 people, 140 of them metropolitan, and 424 of the 737 employ five people or fewer | [48] |
| 25 firms in year one is 17.5 percent of those 143, and 25 firms carry 500 client slots against the 400 companies in the plan, 80 percent fill | [48] and `docs/05-business-model.md` |
| 69b.mx sells a `Corporativo` tier at MXN 1,999 a month for "equipos grandes y despachos", and our firm plan at MXN 3,900 is 1.95 times it | [7] |
| Tesio publishes "+2,400 contadores automatizan con Tesio" on its own home page, self-reported and unaudited | [8] |
| 200 free sweeps over six months, about 8 a week, and the stop condition is a 5 percent hit rate | `docs/05-business-model.md` |
| 60.4 percent of firms with six or more employed persons operate through the institution's own web page, against 35.0 percent on a mobile app | [28] |
| HSBCnet sells beneficiary-name validation for "unicamente cuentas HSBC" in files of up to 5,000 accounts, 07:00 to 22:00; BBVA Net Cash has the payer type the holder's name itself | [42] and [43] |
| Banxico's own Regla 51a Bis has the Administrador generate a one-centavo order to read the holder out of the CEP, and Regla 72a obliges participants generally | [29] |

**Do not say.** That a bank, Capital One included, has agreed to anything, is piloting anything or is
talking to us: the bank route is an ask, Nessie is the sandbox our code writes to, and the whole of what
may be said is "es el tipo de banco que lo haria". That despachos resell this already, because neither
published competitor runs a reseller programme and ours is a bet. The 246,000 national figure as the
segment, because the segment is 6,476 and the 246,000 is the TAM; say the small one first. Any number of
Mexican banks, because we did not open the CNBV register. And no share of Tesio's 2,400 as ours.

Rests on: `docs/05-business-model.md#gtm-who-sells-this-to-whom-and-through-which-channel` for all four
routes with their arithmetic, `docs/04-market.md#where-the-segment-actually-is` for the two counts, which
a judge reproduces by downloading the DENUE Nuevo Leon file and filtering four `per_ocu` strata over
SCIAN 31-33, 43 and 23, `docs/02-persona.md` section 3 for why the despacho is the reseller and never the
operator, and
`docs/05-business-model.md#the-third-route-a-bank-embeds-the-control-where-the-payment-executes` for the
intermediation dilemma.

**The honest gap, volunteered in the same breath.** The supplier-count filter that makes this segment the
right one, 30 or more suppliers a week, **is published nowhere**: DENUE carries no payment data and the
ENAFIN tabulados render as a JavaScript shell, so it is a hypothesis with a measurement attached and the
200 sweeps are the measurement. And the two conversion rates in the plan, 1 in 3 owners agreeing to a
sweep and 1 in 4 exposed sweeps becoming a paying company, have no benchmark behind them at all. They are
the first two things the first ten accounts will falsify, which is why the stop condition is written
against the hit rate instead: a month of work can measure that one.

### 8. "You mark a payment as safe and it turns out to be fraud. What does the client get?" (#194)

Asked with a second half: should the subscription include an insurance policy covering losses up to an
amount per tier.

> El producto nunca dice seguro. Retiene, verifica o libera, y cada liberacion lleva la evidencia de
> los seis controles, el nombre de quien decidio y su razon, en una bitacora que solo crece. Eso es lo
> primero que tiene el cliente cuando nos equivocamos, y es el expediente que lleva a su banco, a un
> asegurador o al SAT dentro de los treinta dias del 69-B. Encima va lo que si podemos fondear: cuatro
> semanas en modo sombra sin cobrar, credito de servicio, y un make whole con tope de doce meses de
> suscripcion, 10,788 pesos, nunca mas de lo que nos pago y solo si corrieron los seis controles y la
> liberacion fue del motor. La poliza de verdad la escribe una aseguradora autorizada, porque la ley
> de seguros nos prohibe suscribirla y lo castiga con prision. Nuestro papel ahi es el insumo de
> suscripcion que hoy ninguna aseguradora recibe de una empresa de veintiocho personas.
>
> Y el error contrario, que es el que se siente cada semana: si retenemos un pago bueno, el retraso ya
> esta acotado, tres dias de retencion y uno de verificacion, que es exactamente el retraso que la
> decision cobro. El responsable del pago libera cuando quiera, con su nombre y su razon escrita. Y el
> dia ya tiene precio por proveedor, de 101.98 a 4,611.27 pesos, asi que sobre ese precio proponemos
> credito de servicio con tope de un mes por evento. Las capas dos, tres y cuatro son propuestas por
> validar con abogado. La primera ya existe en el producto.

Correct the premise in one sentence and then answer anyway, because the question under it is real.
`Action` in `packages/core/src/domain.ts` is `hold`, `verify` or `release` and there is no fourth value
meaning safe. The four layers and their arithmetic are in
`docs/05-business-model.md#when-a-released-payment-is-fraud-what-the-client-gets` and the law is in
`docs/06-regulatory-privacy.md#22-what-we-may-promise-when-a-released-payment-turns-out-to-be-fraud`.

Rests on: the evidence layer is `runControls` in `packages/engine/src/index.ts` and the append-only
`LedgerEvent` in `domain.ts`, where `decision_made` carries the action, the expected loss, the
findings, `decidedBy` and `reason`. The prohibition is article 20 of the Ley de Instituciones de
Seguros y de Fianzas, which reserves any operación activa de seguros to authorised insurers, with
article 24 voiding a contract written against it and article 495, fracción I attaching prison, read in
the texto vigente on 2026-09-12. The lawful distribution channel is article 102, a contrato de
adhesión contracted through a persona moral with the service contract registered with the CNSF. The
bound on a false positive is `holdWindow` in `packages/core/src/hold.ts`, whose `HOLD_WINDOW_DAYS` is
the same `EXPECTED_DELAY_DAYS` the expected loss was weighed against, and the way out is
`POST /api/v1/instructions/:id/decide` with `decidedBy` and `reason`. The price of a day is
`Supplier.delayCostPerDay` from `packages/seed/src/sentryone/delay-cost.ts`, MXN 101.98 to MXN
4,611.27 across the 44 suppliers, median MXN 353.13, read off `bun run demo`.

Five gaps to volunteer, in this order, because each one is cheaper said than found.

- **Nothing here has been reviewed by counsel and the statute says who decides the question.** Article
  20, last paragraph, has the Secretaría, hearing the Comisión, resolve consultations on whether an
  operation is an operación activa de seguros. That consultation has not been filed, so the cap and the
  word guarantee stay out of any contract, price list or screen, and every figure is said as a
  proposal. `TODO(FabriBanda)`.
- **Almost nothing would qualify for the make-whole today, and that is deliberate.** It turns on a
  complete control set with a CEP whose holder name matched under a seal that validated, and
  `beneficiary_cep` reads 0.0 percent in the blind evaluation while the seal reads `not_checked` until
  the real Banxico certificate lands (#57). The commitment turns on when the evidence is complete and
  not a day earlier.
- **The market answer is specific and it is not "nobody does this".** Trustpair publishes an indemnity
  with no amount, no condition and no exclusion on the page, and sells it to "over 400 of the world's
  largest corporations" [57]. Verificamex, the Mexican comparable, takes the opposite position and has
  the user grant it "el más amplio deslinde de responsabilidad que en derecho proceda" [61]. A capped
  commitment at this price is therefore a differentiator and not table stakes.
- **No Mexican insurer page we opened prices this loss.** The closest wording, BBVA's `Fraude Digital`
  for PyME, excludes it twice: our loss is a transfer the client's own clerk authorised from the bank's
  own portal with no OTP handed to anybody, and the cover requires the opposite of both [65]. Say the
  policy does not exist off the shelf yet.
- **The false-positive cap is priced on synthetic data and the screen is not ready for it.** Six of 92
  lines stopped on one generated run and three of twenty findings were false over thirty labelled
  cases, which is what shadow mode replaces. The name and the role are enforced on every write since
  issue #199 and an override with no reason is refused, so the release under a named person is no
  longer only an API fact; what the screens still owe is the identity selector and asking for the
  reason before the click rather than after the refusal (#174).

### 9. "What percentage of supplier transfers in Mexico is stolen?" We answered 25.4 percent

Issue #192.

It is in no source this repository has opened. It is the 24.3 percent of `docs/04-market.md` source
[18] misremembered, which is Condusef's refund share on disputed pesos and not a loss rate on
transfers, so as an answer it was wrong by three orders of magnitude. It is now banned in the delivery
rules of `docs/11-pitch.md` and the replacement is this, in about thirty seconds.

> Nadie publica esa tasa. Ni Banxico, ni Condusef, ni el INEGI. Lo que si esta publicado acota la
> respuesta: las reclamaciones por posible fraude ante los bancos en 2025 entre las transferencias
> SPEI del mismo ano dan siete por cada diez mil, y eso es un techo porque el numerador incluye
> tarjetas y cajeros; las transferencias no reconocidas que llegan hasta Condusef entre el mismo
> denominador dan dos por millon, y eso es un piso porque ese registro es unas diecinueve veces mas
> chico que el de los bancos. Entre dos por millon y siete por diez mil. La derivacion completa, con
> formulas y fuentes, esta en `docs/04-market.md`. Y la cifra que si importa para una empresa no es
> por transferencia sino por ano: el INEGI mide cinco fraudes por cada cien unidades economicas al
> ano, y es un piso porque el 93.9 por ciento de esos fraudes nunca se denuncio.

Then the close, which is the part that converts, and it is an admission: **we do not know your rate
and neither does anybody else.** The free supplier-register sweep in `docs/05-business-model.md`
measures it from the company's own CFDI XML, and the same document carries the condition that stops
the product if 200 sweeps come back under a 5 percent hit rate.

If the panel wants one number instead of a bracket, give the refund share, correctly labelled: **MXN
1,265 million came back of MXN 5,201 million claimed for fraud in the first quarter of 2026, 24.3
percent, so 75.7 percent does not.** That is the thesis in one official ratio, prevention before the
SPEI rather than recovery after it, and it is the sentence 25.4 was reaching for.

Rests on: `docs/04-market.md#the-rate-on-supplier-transfers-and-how-it-is-derived`, sources [17],
[18], [19], [69] and [15] there, every formula printed with its inputs. Two sentences already in that
file were corrected in the same pass rather than defended: INEGI's `Fraude` category is defined after
all, by a footnote in the comunicado [14] that the presentation omits, and Banxico's CF891 export
endpoints answer HTTP 400 rather than returning the page shell.

What not to do with this answer: do not volunteer the bracket before the fiscal hook. The 69-B loss
needs no fraud at all, and a panel that hears a rate of two per million first has been handed a reason
to think the fraud half is rare. Lead with the publication, which happens every eleven days whether or
not anybody defrauds you, and keep the bracket for the question that asks for it.

## Rules for this sheet

- The honest gap is mandatory and it is the highest-value line here. A volunteered gap reads as
  engineering maturity. A discovered one reads as a Wizard of Oz.
- Never invent a number at the table. "I do not have that number, it is derived in `docs/04`" is a
  fine answer and a much cheaper one than being corrected.
- **Two sentences are banned outright: "nadie hace esto" and "nosotros inventamos la prueba del
  centavo".** Both break in one search, and the replacements are in section 1 of the table feedback.
  A claim about the competition is written as what we found or did not find, never as what exists.
- **One number is banned outright: 25.4 percent as the rate of fraud on supplier transfers**, and so
  is any other single percentage offered as that rate. Nobody publishes it. The answer is the bracket
  in "Second table of 12 September" and the derivation behind it in `docs/04-market.md`.
- If two people would answer differently, the answer is not written yet.
- Every path named in this file has to exist when it is named. Check the paths at each milestone.
