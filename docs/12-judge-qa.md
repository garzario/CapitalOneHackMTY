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

## Table feedback of 12 September and the answers

Three Capital One judges, two engineers and one product person, came to the table on the afternoon of
2026-09-12 and the table went badly. What follows is what they said and the answer to give next time,
each one in about thirty seconds. Every sentence here is checked against the code, and the file or the
endpoint it rests on is named once. Issue #171.

The rule that produced this section, and it is the rule for adding to it: **an answer that is not true
in the repository today is written as "today X, and by the demo Y", with the issue number that makes it
Y.** A judge who finds the gap costs more than the gap.

### 1. "Do you know who your competition is?" We could not answer

> Si. Dos directos mexicanos, tres plataformas globales, y el statu quo. Los mexicanos corren sobre
> una lista: 69b.mx monitorea RFCs por ciento noventa y nueve pesos al mes, y Tesio cruza los CFDI que
> ya descargaste contra la lista actualizada desde cuatrocientos noventa y nueve. Ninguno de los dos ve
> nunca la cuenta a la que esta por salir el dinero. Las tres globales de verificacion de beneficiario,
> Trustpair, nsKnox y Eftsure, si ven la cuenta y no mencionan Mexico, ni CFDI, ni SAT, ni SPEI en nada
> de su material publico que hayamos encontrado. Y el statu quo es el contador con una hoja de calculo
> y WhatsApp. Nosotros somos el unico que junta las tres cosas en el momento del pago.

Rests on: `docs/04-market.md#competitor-map`, where every company named is named with its own published
material and its access date. The market, the gap and the sizing are issue #169 and land in `docs/04`,
`docs/02` and the sections above.

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
demo company is 28 employees with 44 suppliers over eight months of history, printed by `bun run seed`.

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
> corrida contesta en pesos y no en minutos: cuanto se detuvo, cuanto se libero, y cuanto de lo que ya
> pagamos y ya dedujimos quedo expuesto. De un subtotal rechazado se revierte el cuarenta y seis por
> ciento entre ISR e IVA, asi que una factura de cien mil pesos de subtotal detenida paga cincuenta y
> un meses de suscripcion, y un SPEI mal dirigido del mismo monto paga ciento once, porque ahi no hay
> nada que revertir. No decimos con que frecuencia pasa. Eso es justo lo que mide el barrido gratuito.

Rests on: `GET /api/v1/run/current`, whose `totals` now carry `heldAmount`, `toVerifyAmount`,
`releasedAmount`, `stoppedAmount`, `amountAtRisk`, `retroactive69bBase` and `retroactive69bExposure`,
from `runMoney` in `packages/core/src/exposure.ts`. The two 69-B fields are what the run's own findings
price, and they read zero until a sweep has priced a supplier this run pays; the whole-ledger figure for
one publication is `SweepResult.totalExposure` on `POST /api/v1/sat/publish` and on the sweep
constancia. Today the run screen shows the pesos it stopped and not the retroactive pair, and by the
demo it shows both (#174); folding the newest sweep into the run counter so it climbs on stage is #175.

### 5a. "What if the person does not answer the call?"

> Nadie contestando es una respuesta, no un hueco. El lector de la llamada la clasifica como no_answer,
> que incluye el buzon de voz, y eso queda en la bitacora con la frase que se escucho. El pago sigue
> detenido: la llamada no libera nada, nunca. Y en la misma respuesta viene el plazo y los siguientes
> pasos: volver a llamar, verificar la cuenta con un centavo, que no necesita que nadie conteste nada,
> o liberar con nombre y con razon escrita. La retencion trae fecha limite, tres dias, y el reintento se
> acota con esa fecha y no con un contador.

Rests on: `parseVerificationOutcome` in `packages/voice/src/outcome.ts` for the four outcomes, and
`POST /api/v1/instructions/:id/verify-call`, whose recorded response carries `hold` with the deadline
and the ordered `nextSteps` from `holdWindow` in `packages/core/src/hold.ts`. Two properties worth
volunteering: `releasesPayment: false` is on every response of that endpoint, and after a `denied` the
only step offered is `keep_held`, because suggesting "libera de todos modos" next to the supplier's own
denial would be the product arguing against its own finding. Today the deadline and the steps are in
the API and not yet on the screen, and by the demo they are on the instruction detail (#174).

### 5b. "What if it is urgent and nobody answers?"

> Se libera, y se libera bien. Hay salida y esta dentro del producto, porque una retencion sin salida
> se brinca por fuera, donde no queda registro de nada. El pago se libera con el nombre de quien lo
> decide y con la razon escrita, y en la pantalla en ese momento estan los pesos en riesgo, la perdida
> esperada y lo que cuesta retrasar ese pago un dia. Queda como evento decision_made en una bitacora
> que solo crece.

Rests on: `POST /api/v1/instructions/:id/decide`, which takes `decidedBy` and `reason` and answers
`amountAtRisk` next to the decision; the argument is stored on `decisions.reason`
(`packages/db/migrations/0009_decision_reason.sql`) and travels on the `decision_made` event. The
expected loss and the delay cost are already on the instruction screen beside the three buttons, in
`apps/web/src/screens/InstructionScreen.tsx`. Honest gap: that screen still sends a fixed `clerk@demo`
and does not ask for the reason before an override, so today the reason is recorded when it is sent and
by the demo the screen asks for it under the person's own name (#174). The API deliberately does not
refuse a release with no prose, because an API that did would be refused by the clerk instead, outside
the product.

### 5c. "What if the calculation is wrong? How sure are you about the percentages?"

> Los dos errores no cuestan lo mismo, y el producto esta escrito alrededor de eso. Un falso positivo
> cuesta un retraso, y el retraso esta acotado por la fecha limite de la retencion y valuado en pesos
> por dia dentro de la decision misma. Un falso negativo cuesta el monto completo y es irrevocable.
> Ademas ningun hallazgo es una acusacion: cada uno trae su evidencia en pantalla y decide una persona.
> Y dos de los seis controles no son estimaciones, son hechos: que un RFC este en la lista del 69-B, y
> que el titular de la cuenta en un comprobante que firma Banxico sea o no la razon social del CFDI que
> estamos pagando.
>
> De los numeros: treinta casos etiquetados por quien no escribe los detectores, ochenta y cinco por
> ciento de precision, ochenta y uno de recall, uno punto nueve por ciento de falsos positivos, y el
> motor eligio la accion etiquetada en veintiocho de treinta. Son casos sinteticos y lo decimos. La
> calibracion de verdad es despues del hackathon: modo sombra con un socio de diseno, sobre corridas
> reales, y si despues de doscientos barridos menos del cinco por ciento destapa algo, paramos.

Rests on: the asymmetry is `decide` in `packages/core/src/decision.ts`, whose header says the tie goes
to paying and why; the deadline is `holdWindow`, built on the same `EXPECTED_DELAY_DAYS` table the
expected loss was weighed against, so the arithmetic and the promise on screen cannot drift apart. The
numbers come from `scripts/eval.ts` over the thirty cases in `packages/seed/src/holdout/cases`, served
by `GET /api/v1/metrics`, and they were re-run on this branch before this section was written. Read them
off a fresh run, never from memory.

One thing to volunteer rather than defend: **the loss probability per severity is a prior, not a
measurement.** `LOSS_PROBABILITY_BY_SEVERITY` in `decision.ts` carries three numbers with a `TODO` on
top saying exactly that, and the UI says so too. What is not a prior is the amount at risk: it is the
instruction's own pesos plus, for a listed supplier, the ISR and IVA that reverse on the subtotal
already deducted, at the published rates. The shape of the table is the argument, the values are the
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
first, every time. The honest gap to volunteer in the same breath: we have no frequency figure for how
often this bites a company of this size, and the free supplier-register sweep in the go-to-market is
the thing that measures it.

## Rules for this sheet

- The honest gap is mandatory and it is the highest-value line here. A volunteered gap reads as
  engineering maturity. A discovered one reads as a Wizard of Oz.
- Never invent a number at the table. "I do not have that number, it is derived in `docs/04`" is a
  fine answer and a much cheaper one than being corrected.
- If two people would answer differently, the answer is not written yet.
- Every path named in this file has to exist when it is named. Check the paths at each milestone.
