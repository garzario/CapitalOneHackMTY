# 11. Pitch

Worth 6 points. Three timed variants in the actual words, the six controls as they are said out
loud, the real data behind each claim, and the eight hardest questions with the answer given in one
breath. The 90-second version is the one to memorise, because continuous evaluation means many
walk-ups; [the stand pitch](#the-stand-pitch-three-to-five-minutes) is the three-to-five-minute
version said on the real app when a panel stays, and it is the one the four of us rehearse together.
There is no stage slot.

Owner: Patricio (`garzario`), drafted for the team to validate. Issues #56 and #75. Due M3.

**Language.** The spoken text is Spanish, because the judges and the persona are Mexican. It is
written in ASCII with no accents and no inverted question marks, which is the convention every
Spanish string in this repository already follows (`packages/voice/README.md` states it); the words
are pronounced with their natural accents. The scaffolding around the scripts is English, because
the repository is English. If a judge opens in English, the same beats are in
`docs/12-judge-qa.md`, already in English, and the hook is the one sentence not to improvise:
*"Paying a supplier the SAT has listed under Article 69-B voids the deductions you already took,
retroactively. And once a SPEI is sent, it is final."*

## The hook, and why it is binding

Every version opens with the fiscal hook, per the narrative rules in
`docs/adr/0002-track-and-thesis.md`. We never open with "they changed their bank account on me".
That is one signal out of six and it is the story every anti-fraud demo tells.

Both halves are verified at their primary sources. The draft of this file carried a
`TODO(garzario)` to do that; it is closed, and these are the citations to name if a judge asks.

| Half of the hook | What the source says | Source |
|---|---|---|
| The deductions are voided retroactively | Publication has effects `con efectos generales`: the operations covered by that taxpayer's comprobantes `no producen ni produjeron efecto fiscal alguno`. Past tense, so deductions and acreditamiento already taken are undone, not merely blocked. Anyone who gave them fiscal effect has **thirty days from the publication** to prove the operation was real or correct through complementary returns | Codigo Fiscal de la Federacion, article 69-B, texto vigente, last reform DOF 09-04-2026. Read out paragraph by paragraph in `docs/06-regulatory-privacy.md` section 3.1, source [4] in `docs/04-market.md` |
| A SPEI never comes back | An accepted transfer order is `firme, irrevocable, exigible y oponible frente a terceros` | Ley de Sistemas de Pagos, article 11, last reform DOF 14-11-2025. Source [2] in `docs/04-market.md` |

One consequence worth saying unprompted, because it is the sentence that makes the product obvious:
**the exposure is created by the publication, not by the payment.** A check run once when the
supplier was onboarded protects nothing against a list published two years later.

## What is true right now, and what is gated

Do not say a line whose gate has not been ticked. A volunteered gap reads as engineering maturity;
a discovered one reads as a Wizard of Oz, and Capital One said out loud that is what they hunt for.
Refresh this table at every milestone.

| Line on stage | Backed by, today | Gate before saying it |
|---|---|---|
| "The SAT list is real, type an RFC yourself" | `packages/sat/src/snapshot/official-2026-09-12.csv`, committed, 14,234 rows, and `GET /api/v1/sat/lookup` | Ticked. It answers with no network |
| "Six controls, all six accounted for" | `runControls` in `packages/engine`, every control in `ran` or `skipped` with a reason | Ticked |
| "There is no model in the decision" | `packages/extract/src/boundary.test.ts`, ADR-0004, `docs/06` section 6 | Ticked |
| "The retroactive sweep replays the ledger" | `sweep` in `packages/sat/src/sweep.ts`, `POST /api/v1/sat/publish`, and the 7,997 events the committed seed produces | Ticked |
| "The verification call rings the supplier through ElevenLabs and Twilio, confirms the account change and the last four digits, and never the whole CLABE" | `packages/voice`, `POST /api/v1/instructions/:id/verify-call`, two real outbound calls placed on 2026-09-12, `conv_6401m2ah87gnffctr757c34b5mdg` and `conv_2301m2ah9vnee2h8d14gpf1rb3rz`, and three on 2026-09-13 for #206, the last of them `conv_0901m2cp6eh3fy4bn7fcsvvyd9d7`, where the agent said "termina en cuatro seis uno uno" and asked whether they changed their account | Ticked, code path and live call, with the ids in `docs/14-process.md#live-integrations-verified`. Say who was dialled: a teammate's own phone, never a supplier. The account the supplier has always been paid on is never read out, not even four digits of it |
| "This CEP is real, re-verify the clave de rastreo on your phone" | `packages/cep` reads, checks and compares a CEP; the committed fixture is synthetic | **Not ticked.** Issue #57 supplies the real one-cent CEP. Until it lands, say what the parser does and that the CEP on screen is the synthetic fixture |
| "Precision, recall and false-positive rate, per control and per level" | Thirty-five labelled cases in `packages/seed/src/holdout/cases`, scored through `runControls` by `bun run eval` and served by `GET /api/v1/metrics` as `perDetector` and `perLevel` | Ticked. Re-run `bun run eval` before every rehearsal and read the numbers off that output, because they move with every merge |
| "It is deployed, open it on your phone" | Vercel for `apps/web`, Vultr for `apps/api`, per the ADR-0005 amendment. The live pair and what each URL proves are in `docs/10-demo-script.md#where-it-is-deployed` | Ticked. Issue #44 is closed. The remaining gate is operational rather than a build: open it on a phone once before the judging window, and then say "abrelo en tu telefono" instead of pre-announcing a local demo, which reads as a gap the judges had not found |
| "The run leaves from our screen, over a rail" | `packages/rail`, ADR-0008, `POST /api/v1/run/:id/execute`, and the `#/payments` screen | Ticked. Issues #198 and #212 are merged, and one whole run has gone out on the company's Nessie mirror for real: 86 lines, MXN 1,388,920.90, 6 held lines left alone with their reasons, 0 failed, and a `409` on the second press, on 2026-09-13, with the counts in `packages/rail/README.md`. Two things are said in these words every time: Nessie is a sandbox and not a bank, so no pesos moved and no CEP was produced; and `StpRail`, the rail that would produce a signed CEP, is written, unit tested on our side of the wire and has never run live, because we hold no `empresa` contract |
| "A payment cannot leave without a person's name on it" | `X-Actor` on every write, `decideRequirement` in `packages/core/src/actor.ts`, `Decision.decidedByRole`, and the append-only ledger | Ticked in the API since #199 and on screen since #215: **Entrada y ajustes** at `#/entrada` names the person every write will carry and switching it changes the capability list under your hand, through the same `decideRequirement` the API enforces. Say what it is and what it is not in the same breath: the header is a name and a role the ledger records, there is no password and no session, nothing verifies it, and a deployment that needs authentication puts that in front of this API. Never call that screen a login |
| "A definitive SAT listing cancels the line, and only the owner reopens it" | `transactionStateOf` rule 4, `definitiveListingReason`, the `payment_cancelled` that carries no actor, and `decideRequirement` answering `reopen_cancelled` | Ticked since #204. Say `cancelado` only while the screen says `cancelado`, and say that nothing is deleted when an owner does reopen a line: the cancellation stays on the ledger beside the decision that carries the name and the written reason |
| "Three levels and three states, and never a probability" | `confidenceOf` and `transactionStateOf` in `packages/core/src/levels.ts`, on every line of the run and every instruction detail, ADR-0009 | Ticked in the engine and the API since #204, and the chips exist since #207. **The count per level is not in the run totals on screen yet**, issue #208, so say the levels out loud off the lines rather than promising a counter |
| "The one-page letter, for the supplier who rings" | `evidenceLetter` in `packages/constancia/src/letter.ts` and `GET /api/v1/instructions/:id/carta` | Ticked since #204. One page is a test and not an intention, the seven signals are never blank, and no number about the risk is on it: no expected loss, no delay cost, no transcription confidence |
| "A screenshot becomes an instruction and the assistant proposes" | `apps/api/src/assistant`, the drawer in `apps/web/src/components/AssistantPanel.tsx`, ADR-0007 | Ticked. Issues #197 and #211 are merged, the panel runs under `?data=mock` as well as against the API, and the QR intake page at `#/intake` is still the fallback. Say the boundary in the same breath: nine tools and all nine are GETs of our own API, a tool that writes cannot be expressed in the type, and the image goes to `packages/extract` and never to this model. A server with no `GEMINI_API_KEY` answers 422 and says so |
| "A held payment carries a deadline and a way out" | `holdWindow` in `packages/core/src/hold.ts`, on `GET /api/v1/instructions/:id` and on a recorded `verify-call`; the reason and the name on `POST /api/v1/instructions/:id/decide` | Ticked in the engine and the API. **Not on screen yet**, issue #174, so say "la API lo contesta y la pantalla lo muestra para el demo" and show it with `curl` if pushed |
| "The run answers in pesos, not in minutes" | `runMoney` in `packages/core/src/exposure.ts`, on the `totals` of `GET /api/v1/run/current` | Ticked for the money that is stopped, released and at risk, and since #175 for the retroactive 69-B pair too: the publication re-scores the pending lines it affects, so the pair climbs in the same request instead of reading zero |
| "The decision weighs the pesos at risk against what a day of delay costs" | `decide` in `packages/core/src/decision.ts`, `EXPECTED_DELAY_DAYS`, `Supplier.delayCostPerDay` priced per supplier in `packages/seed/src/sentryone/delay-cost.ts`, and the `Costo de retrasar un dia` field on the instruction screen | Ticked, and the number is on screen since #182: all 92 decisions carry a price between MXN 101.98 and MXN 4,611.27 a day, and on this run it changes one outcome. Point at `INS-2026-09-07-032`, released with its warning still showing because a day of delay costs MXN 4,611.27 against MXN 2,088.00 of expected loss |

**The live call happened, so the row above is ticked.** Two outbound calls went out on 2026-09-12
through the imported Twilio number to a teammate's own mobile, the first of them 18 seconds and
ended by the remote party, with the transcript captured. The conversation ids, the agent id and the
cost are in `docs/14-process.md#live-integrations-verified`, which is the line issue #60 asked for.
"Ya llamamos" may now be said. What may never be said is that we called a supplier, because we did
not and will not: the only number this product has ever dialled is one of ours.

## The numbers you are allowed to say

Nothing else. If it is not in this table, it is not on screen and it is not cited, the answer is
"no traigo ese numero, se deriva en `docs/04-market.md`", which costs nothing and is much cheaper
than being corrected.

| Number | Value | Where it comes from |
|---|---|---|
| Rows in the committed SAT list | 14,234, current to 2025-12-31, downloaded 2026-09-12 | `packages/sat/src/snapshot/README.md`, asserted in `official.test.ts` |
| What is behind those rows | The current situation of each taxpayer: 11,270 definitivo, 1,638 sentencia favorable, 986 presunto, 340 desvirtuado. The loader reads the dated history behind each one and produces 28,935 entries, because "listed today" and "listed the day we deducted this invoice" are different questions | same file, same test |
| Rows the SAT redacted by court order | 91, reported with their line numbers, never matched, never dropped | same |
| How often the list changes | 33 publication dates in the twelve months to 2026-07-31, about one every eleven days, 973 taxpayers moved to definitivo and 1,226 new presuntos | `docs/04-market.md` source [3], counted from the file |
| What one listing costs | For every MXN 100,000 of deducted subtotal, MXN 46,000 of tax effect reverses: 30 percent ISR plus 16 percent IVA | `docs/04-market.md`, sources [5] and [6] |
| The buyer's window | 30 days from the publication | CFF article 69-B, `docs/06` section 3.1 |
| How long a payment stays stopped | 3 days for a hold, 1 day for a verification, measured from the decision | `EXPECTED_DELAY_DAYS` in `packages/core/src/decision.ts`, reused by `holdWindow` in `hold.ts` so the delay the arithmetic charged for and the deadline on screen are one number |
| Firms in the target band | About 246,000 Mexican firms of 11 to 250 people | INEGI CE 2024, `docs/04-market.md` source [1] |
| The first segment, the one the GTM attacks | **6,476** establishments of 11 to 250 people in Nuevo Leon in manufacturing, wholesale trade and construction, **6,114** of them in the metropolitan municipalities, and **about 2,312** after INEGI's blunt 35.7 percent formality rate. Say the 6,476 before the 246,000, always: the national figure is the TAM | `docs/04-market.md#where-the-segment-actually-is`, source [48], counted by us from the DENUE Nuevo Leon file and reproducible in one filter. The formality rate is source [1] and is deliberately too low |
| The reseller denominator | **143 of the 737** accounting and audit units in Nuevo Leon employ 11 to 250 people, and 140 of the 143 are metropolitan. The year-one target of 25 firms is 17.5 percent of the 143 | `docs/04-market.md` source [48], and `docs/05-business-model.md#from-month-6-accounting-firms-as-resellers-on-the-mxn-3900-plan`. Never quote the 16,356 national units as the target: that denominator makes the plan look like a rounding error |
| The price anchor on the despacho side | 69b.mx `Corporativo` at **MXN 1,999 per month**, "Para equipos grandes y despachos", unlimited monitored RFCs and up to 5 users. Our MXN 3,900 firm plan is **1.95 times** it, and the whole argument for the difference is that theirs monitors a list while ours decides a payment | `docs/04-market.md` source [7], re-read 2026-09-12 in the evening |
| The only customer count either competitor publishes | Tesio, "+2,400 contadores automatizan con Tesio", on its own home page, self-reported and unaudited. It is evidence that despachos buy software of this shape, and it is said as theirs, never as a market size and never as a share we are taking | `docs/04-market.md` source [8]. Neither competitor publishes a reseller, partner or affiliate programme, so say our channel is our bet |
| TAM, SAM, SOM | MXN 2,655 million, MXN 948 million, MXN 12.1 million per year | `docs/04-market.md#sizing`, bottom-up, entities times price |
| Our price | MXN 899 per company per month; MXN 3,900 per month for an accounting firm with up to 20 client companies, MXN 195 each | `docs/05-business-model.md` |
| The price anchor on the list side | 69b.mx `Smart` at MXN 199 per month for 30 monitored RFCs, and Tesio from MXN 499 per month | `docs/04-market.md` sources [7] and [8] |
| The price anchor on the account side | Verificamex's one-cent test, MXN 17.85 down to MXN 8.93 plus IVA per verification depending on the token tier. Say "de nueve a dieciocho pesos"; it is also our build-versus-buy answer and our COGS anchor, never called our competitor | `docs/04-market.md` source [36] |
| What has no published price | ValidX and Portal de Proveedores, both quote-only, so no number is said about either | `docs/04-market.md#what-we-could-not-verify-about-the-competition` |
| Break-even | One stopped invoice of MXN 23,452 of subtotal per year | `docs/05-business-model.md` |
| Avoided loss | One held invoice of MXN 100,000 of subtotal pays 51 months of subscription; one misdirected SPEI of the same amount pays 111 months | `docs/05-business-model.md` |
| The demo company | 28 employees, Apodaca, 44 suppliers, 8 months of history (2026-01-07 to 2026-09-07), 4,103 CFDIs, 3,801 complements, 7,997 ledger events, seed 69 | `packages/seed/src/sentryone`. `bun run seed` prints the suppliers, the CFDIs, the complements and the run; the headcount and the city are in `company.ts` and the event count is the ledger row of `docs/08-data-model.md` |
| This week's run | 92 payment instructions, MXN 2,174,210.76 | same, `summarizeSentryOne` |
| This week's run in pesos | MXN 785,289.86 stopped (MXN 592,592.38 held plus MXN 192,697.48 to verify), MXN 1,388,920.90 released, MXN 799,209.86 at risk | `totals` of `GET /api/v1/run/current`, from `runMoney`. The two `retroactive69b` fields read zero until the list publishes, which is the honest state of a Thursday |
| The same run after the publication | The pair climbs to MXN 878,592.59 of base and MXN 404,152.59 of exposure, at risk climbs by exactly that exposure to MXN 1,203,362.45, and the MXN 785,289.86 that is not leaving becomes MXN 676,112.38 held over 3 lines and MXN 109,177.48 to verify over 3 | same, read again after `POST /api/v1/sat/publish`, which re-scores the pending lines the list affects (#175) |
| What a day of delay costs | MXN 101.98 to MXN 4,611.27 across the 44 suppliers, MXN 1,120.05 on the hero line. Six of the seven lines that carry a finding are stopped; the seventh is released because waiting costs more than the risk | `Supplier.delayCostPerDay` on every decision of `GET /api/v1/run/current`, priced in `packages/seed/src/sentryone/delay-cost.ts` from moratory interest on the balance owed plus the pronto pago discount that expires |
| The listed-supplier scenario | MXN 878,592.59 of base already deducted and MXN 404,152.59 of exposure (MXN 263,577.78 ISR plus MXN 140,574.81 IVA), across 24 of the 31 invoices to the supplier the simulated publication names. The base is the settled ones only, because an invoice nobody has paid yet was not deducted yet | same, `notes.scenarios`, and `bun run demo` beat 3 prints the same pair |
| The blind evaluation | 35 labelled cases and 24 labelled expectations over six controls, scored as 213 counts. Precision 87.0 percent, recall 83.3 percent, false-positive rate 1.6 percent, and the engine chose the labelled action on 33 of the 35 | `bun run eval`, re-read on 2026-09-13. **Re-run it before quoting it.** Say 35 cases, never a pair count: six controls on thirty-five cases looks like 210 slots, and the matrix sums to 213 because a control that fires with the wrong severity on a case that expected it is counted twice, once as a miss and once as a false positive |
| The evaluation per level | Of 35 lines, `confiable` 12 expected and 12 right, `precaucion` 12 and 11, `alerta` 11 and 10. Two lines read one level away from the label and both are the severity arguments already on the table | `bun run eval`, the second table. The row to defend is `confiable` at 100 percent: a line called trustworthy that was not is the mistake this product cannot make twice |
| Tests | 2,586 tests across 138 files on 2026-09-13: 2,468 passing, 118 skipped, 0 failing | `bun test`, re-read on this branch after merging `origin/dev`. Say passing and skipped, because a judge who runs it sees both, and re-read it after every merge. **Not said in the stand pitch at all**, because at least seven pull requests land the night before it and the terminal says it better than a presenter can |
| The buyer's own clock, and it is new | Article 49 Bis, in force since 1 January 2026, orders the SAT to publish the taxpayer whose CFDI it determined false, and every third party who gave those CFDI fiscal effect has **thirty natural days from the DOF publication** to reverse it or the authority restricts **their own** certificado de sello digital under article 17-H Bis, fraccion XIV. So the second retroactive clock points at the buyer | CFF articles 49 Bis and 17-H Bis, `docs/04-market.md` source [4] and `#what-we-cover-on-49-bis-and-what-nobody-can`. Say the clock. **Never say we sweep that list**: the SAT publishes it as 14 DOF notes naming 14 taxpayers between 10 July and 28 August 2026, with no file at all |
| What the rail itself requires, and what it refuses to check | Regla 12a makes the 18-digit CLABE and the amount the only mandatory data and leaves the beneficiary name optional; Regla 25a obliges the bank to show that name back exactly as the payer typed it, followed by "(Dato no verificado por esta institucion)"; Regla 18a makes the order firme e irrevocable at settlement | Reglas del SPEI, `docs/04-market.md` source [29] and `#how-much-money-goes-through-the-door-we-are-standing-in`. This is the gap proved out of the rail operator's own rulebook instead of asserted |
| How big the door is | **More than 7,300 million SPEI transfers in 2025, up 36.8 percent**, and 94 percent of them were for 1,500 UDIS or less, about MXN 13,200, which leaves a residual on the order of **440 million** transfers a year where a supplier invoice lives | Banco de Mexico's Governor before the Senate, `docs/04-market.md` source [19]. The 440 million is our arithmetic on those two published figures and is said as ours |
| That there is nobody above her | **11 treasury vacancies of any kind in Nuevo Leon on 2026-09-12 against 101 for `auxiliar contable`** | `docs/04-market.md` source [44]. Say "es un tablero de empleo, no una estadistica" in the same breath, every time |
| What the make-whole cap is not | MXN 10,788 does not make a misdirected SPEI of MXN 100,000 whole. It is **10.8 percent** of it, and 23.5 percent of the MXN 46,000 of ISR and IVA that reverse on the same subtotal | `docs/05-business-model.md`, layer 2. Say the limit in the same sentence as the cap, before a judge computes it |
| The guarantee precedent, which is somebody else's document | Eftsure publishes an indemnity of **up to USD 1 million** against payment fraud losses caused by social engineering, included in the subscription for customers who signed after 10 March 2025, and it attaches only to payments its own engine approved | `docs/05-business-model.md` source [79]. The precedent is the shape and never the size: no dated exchange rate lives in this repository, so the dollars are never converted and never compared to MXN 10,788 |
| The rate of fraud on supplier transfers | Nobody publishes it. The published evidence brackets it between about **2 per million and 7 per 10,000 transfers**. Say the bracket, never a point inside it | `docs/04-market.md#the-rate-on-supplier-transfers-and-how-it-is-derived`, derivations 1 and 2, formulas and inputs on the page |
| What comes back once the money is gone | **24.3 percent**, MXN 1,265 million refunded of MXN 5,201 million claimed for fraud in the first quarter of 2026, so 75.7 percent does not | `docs/04-market.md` source [18]. This is a refund share on disputed pesos and never a loss rate. It is the number 25.4 was confused with |
| How often a Mexican company lives a fraud | **About 5 in every 100 economic units a year**, 522 fraud events per 10,000 units in 2023, on a category INEGI's own footnote says includes bank fraud | `docs/04-market.md` sources [15] and [14]. 93.9 percent of those frauds produced no complaint and no file, so it is a floor |
| The subscription against what a company this size already spends and loses on crime in a year | **6.9 percent** for a small company, MXN 10,788 against MXN 157,273; **2.1 percent** for a medium one, against MXN 517,203 | `docs/04-market.md#the-sentence-for-the-boss-in-the-bosss-units`, INEGI cost of crime by size, source [15] |
| The monthly price against the run on screen | **4.1 basis points**, MXN 899 against the MXN 2,174,210.76 of one week, and the whole year is 0.50 percent of that week | same section, arithmetic on the `This week's run` row of this table and the MXN 899 price row |
| What supplier impersonation is worth where it is counted | In the United Kingdom in 2025, **GBP 28.0 million on business accounts, 68 percent of invoice and mandate losses**, and **37.0 percent of all business APP losses**. About **7 invoice-fraud payments per 10 million** Faster Payments | `docs/04-market.md` sources [70] and [71]. A foreign analogue, said as a foreign analogue, never as a Mexican number |

The reference run amount in `docs/02-persona.md` is MXN 2,174,210.76, the same figure this table
carries, so the pitch and the persona doc agree in front of a judge who reads both. That cell used to
read MXN 673,460.27 and it was refreshed; re-check it whenever the generator changes.

The two SAT vintages are reconciled in
`docs/04-market.md#two-sat-files-and-the-one-the-product-ships`, with both files, both dates and
both row counts in one table. The short version for the stage: the product answers from the
committed 14,234-row snapshot current to 2025-12-31, and the 14,761-row open-data file current to
2026-07-31 is where the publication-frequency counts come from. Say either number with its date, or
say neither. Never quote 14,761 as the size of the list the lookup box answers from.

## The value is the loss, not the minutes

Three Capital One judges heard "en la vida real esto toma ocho minutos y con nuestro producto toma
segundos" on 2026-09-12 and told us they did not care. They were right, and this section is the
replacement. Issue #171.

**The sentence is banned.** Not softened, banned. It loses twice. It prices the product at the wage of
the person doing the work, which is about MXN 375 a day, so eight minutes is worth centavos and anyone
can do that arithmetic in their head while you are still talking. And it invites the answer the second
engineer gave us, which is that his father talks to his suppliers all day and does not need software to
be quick.

**What replaces it.** The value of this product is the loss that did not happen, so every claim is in
pesos.

> Lo que vale no son los minutos, es la perdida que no ocurrio. De un subtotal rechazado por el
> articulo 69-B se revierte el cuarenta y seis por ciento entre ISR e IVA. Una factura de cien mil
> pesos de subtotal detenida paga cincuenta y un meses de suscripcion. Un SPEI mal dirigido del mismo
> monto paga ciento once, porque ahi no hay nada que revertir. Y se paga completo con una sola factura
> detenida de veintitres mil cuatrocientos cincuenta y dos pesos de subtotal al ano.

Three delivery consequences, all of them checkable on screen.

- **The run answers in pesos.** `GET /api/v1/run/current` reports `heldAmount`, `toVerifyAmount`,
  `releasedAmount`, `stoppedAmount`, `amountAtRisk`, `retroactive69bBase` and
  `retroactive69bExposure` on `totals`, computed by `runMoney` in `packages/core/src/exposure.ts`. The
  hero figure on the run screen is already the money that is not leaving and never the total of the
  run, which is the number that is the same whether the product works or not. The last two climb when
  the list publishes rather than after a reload, because `POST /api/v1/sat/publish` re-scores the
  pending lines the publication affects in the same request (#175), and they are the part of
  `SweepResult.totalExposure` that belongs to the suppliers this run pays, counted once per RFC.
- **The 69-B exposure is the loss that needs no fraud at all.** Nobody stole anything. The SAT
  published a list and deductions already taken were voided. That is the half of the pitch no
  anti-fraud demo has, and it is the half to lead with when a judge doubts the problem is real.
- **Never say the product is fast.** It is not a claim anybody buys, and speed is the one property a
  judge can neither verify nor care about at a table. If a time has to be said, say the window and not
  the saving: the few minutes between approving a payment run and sending it are where nothing else
  sits, which is a statement about the gap and not about our latency.

## The objection about the father's PyME

One of the engineers said his father has a PyME and is in constant contact with his suppliers, and
concluded that he is not our user. He is right, and the answer is not to argue about his father.

The user is not the owner who knows five suppliers by voice. It is the company whose Thursday run pays
dozens of suppliers through one person in administration, who knows none of them by voice and cannot
telephone forty-four of them before the bank cut-off. And the part that turns the objection around:
**the supplier's own WhatsApp and email are the channel the attacker uses.** A payment instruction that
arrives inside a conversation you trust is the whole attack, so trusting the conversation is the failure
mode and not the defence. `PaymentInstruction.text` exists in `packages/core/src/domain.ts` for exactly
this reason, and its comment says it: the message is shown as context and never decides, because a
message is the artefact an attacker controls.

Then the sentence that closes it, because it does not depend on an attacker existing at all: **the
69-B loss needs no fraud.** The supplier is real, the invoice is real, the relationship is twenty years
old, and the SAT publishes a list that voids the deductions already taken on it, retroactively, with
thirty days to answer. Talking to your supplier every day protects you from none of that.

## The competition, and the two sentences that lose the room

The market research of PR #177 rewrote this part of the pitch. Eight paragraphs in this file claimed,
in one form or another, an empty window, an only-ones position, or a competitor picture the research
falsifies: the closing line of the 60-second version, beats 3 and 4 of the 90-second one, the "why
different" and the "market, model and regulation" beats of the 240-second one, hardest questions 1 and
2, and the one that always follows them. They are gone, because a judge who breaks one claim stops
believing the rest. Refs #171 and #169. The roster with one line per company is section 1 of
`docs/12-judge-qa.md#table-feedback-of-12-september-and-the-answers`, and `docs/12` wins if the two
ever disagree.

**The two camps, said in this order.** The fiscal half already holds payments: ValidX retains before
paying and notifies Compras, Portal de Proveedores holds when a document expires and sweeps 69-B
daily, and 69b.mx and Tesio run on the list. None of them sees the account. The money half moves the
pesos without checking who receives them: Clara disperses hundreds of SPEI from a spreadsheet the
payer uploads, Xepelin's own three-step flow contains no counterparty check. CONTPAQi has both halves
inside one product and its own changelog shows they never meet at the moment of payment. Bind ERP
alerts and, in its own help centre's words, "no restringira". HSBCnet really does validate beneficiary
names, "unicamente cuentas HSBC". Trustpair, nsKnox and Eftsure verify accounts for corporate
treasuries abroad and mention neither Mexico nor CFDI, SAT, SPEI or CLABE.

**Our claim is the union**, in one sentence and no wider: the fiscal half and the money half in one
decision, retener, verificar o liberar, with the evidence attached, before the transfer is
irrevocable. Two edges of it are sharper than the join: we found nobody selling the comparison of a
new CLABE against the accounts that supplier has already been paid on, and nobody turning either
signal into a decision with an amount at risk on it.

**The two sentences never to say.** "Nadie hace esto", nobody does this, because ValidX's own landing
page is the counterexample; say "no encontramos a nadie que venda las dos mitades juntas" instead.
And "nosotros inventamos la prueba del centavo", we invented the one-cent test, because Verificamex
sells it metered and Banco de Mexico writes it into Regla 51a Bis of the SPEI rules; say that the
centavo is a commodity primitive and that ours is the decision hung on its answer. Both of these are
also in the delivery rules at the end of this file, because they are the two that cost the room.

## The six controls, in the words used at the table

Said in this order, because it is the order `Detector` declares in
`packages/core/src/domain.ts`, the order `SENTRYONE_DETECTORS` runs them and the order the UI lists
them. One sentence each is enough; the evidence column is what you open when they push.

| # | Control | Said out loud | Open this |
|---|---|---|---|
| 1 | `sat_69b` | "Cruzamos cada RFC contra la lista oficial del articulo 69-B, con todas sus versiones, y cuando hay publicacion nueva reproducimos la bitacora para poner precio a lo que ya pagamos y ya dedujimos" | `packages/engine/src/sat69b.ts`, `packages/sat/src/sweep.ts` |
| 2 | `clabe_forensics` | "Revisamos el digito verificador con los pesos 3-7-1, el banco, la plaza con su ciudad y su estado contra las plazas en las que si le hemos pagado y contra el lugar de expedicion de la factura, y la distancia contra las cuentas en las que si le hemos pagado a ese proveedor, con las confusiones tipicas de OCR" | `packages/core/src/clabe.ts` |
| 3 | `duplicate_invoice` | "Mismo emisor, mismo monto, misma ventana de fechas, o el mismo folio o UUID dos veces" | `packages/core/src/duplicates.ts` |
| 4 | `supplier_behaviour` | "Cambio de comportamiento del proveedor contra su propia historia, y si no hay muestra suficiente lo decimos en vez de inventar una senal" | `packages/core/src/behaviour.ts` |
| 5 | `beneficiary_cep` | "Comparamos el nombre del titular en el comprobante que firma Banxico contra la razon social del CFDI que estamos pagando, y guardamos el XML firmado tal cual llego" | `packages/cep/src/name-match.ts`, `signature.ts` |
| 6 | `bank_reconciliation` | "Conciliamos contra el espejo bancario: dinero que salio sin instruccion y sin documento atras" | `packages/core/src/reconciliation.ts` |

Then the decision, which is the part engineers ask about: **"seis detectores independientes, cada
hallazgo trae pesos en riesgo, y una sola decision de perdida esperada pesa esos pesos contra lo que
cuesta retrasar ese pago un dia. Retener, verificar o liberar, y firma una persona."**

**Open the delay figure, it holds up now.** `Costo de retrasar un dia` carries a number on every one
of the 92 instructions, between MXN 101.98 and MXN 4,611.27, priced per supplier from moratory interest
on the balance we owe them plus the pronto pago discount that expires the day the payment is late, and
higher for the raw material and the tooling that stop production than for consumables and services. On
the hero line it reads MXN 1,120.05 against MXN 23,050.49 of expected loss, and that payment is stopped
by its critical finding anyway, which is what rules 1 and 2 are for. The two lines where the arithmetic
decides on its own are the pair to show an engineer: `INS-2026-09-07-077`, **"cuatrocientos veintisiete
pesos al dia contra dos mil seiscientos diez de perdida esperada, y por eso se verifica"**, and
`INS-2026-09-07-032`, which carries a duplicate-invoice warning of MXN 2,088.00 and is released because
a day of delay with that supplier costs MXN 4,611.27. What must never be said is that a critical finding
could be released that way: rules 1 and 2 of `decide` return above the branch that weighs anything.

And the property that is easy to miss and worth volunteering: **every one of the six lands in `ran`
or in `skipped` with a named reason.** A run that says "sin hallazgos" because the engine could not
call its own detectors is the one failure this product cannot ship, and that is why the report
accounts for all six.

## 60 seconds, the hallway version

About 170 words, counted off this file. Say it and then stop talking.

> Dos cosas son ciertas cuando le pagas a un proveedor en Mexico. Si ese proveedor aparece en la
> lista del articulo 69-B del SAT, las deducciones que ya tomaste sobre sus facturas se anulan de
> forma retroactiva. Y una vez que sale el SPEI, es firme e irrevocable. No hay contracargo.
>
> Quien vive con las dos es la unica persona de administracion de un taller metalmecanico de
> veintiocho empleados en Apodaca. Los jueves manda entre setenta y ciento diez transferencias
> antes del corte del banco, con una hoja de calculo, WhatsApp y el portal del banco.
>
> SentryOne junta tres cosas en el momento en que ella paga: su propio catalogo de facturas, la
> lista oficial del SAT y el comprobante que firma Banxico por cada SPEI. Cada pago regresa como
> retener, verificar o liberar, con la razon en pantalla, y decide una persona.
>
> La consulta es publica y hay quien la vende. No encontramos a nadie que la lea junto a la cuenta a
> la que va el dinero. Ahi decidimos nosotros.

## 90 seconds, a judge walking up

This is the one to memorise. About 280 words, counted off this file, five beats.

> **(20 s, la persona y el momento.)** Jueves por la manana, taller metalmecanico en Apodaca,
> veintiocho empleados. Una sola persona lleva toda la administracion y hoy tiene que mandar entre
> setenta y ciento diez transferencias antes del corte. Tiene una hoja de calculo, WhatsApp y el
> portal del banco. No hay ERP, asi que no hay validacion de proveedores, no hay doble firma y no
> hay quien revise, porque el dueno esta en el piso de produccion.
>
> **(20 s, lo irreversible.)** Dos cosas pueden salir mal y ninguna se deshace. Si el proveedor esta
> en la lista del articulo 69-B, las deducciones que ella ya tomo se anulan de forma retroactiva, y
> la exposicion la crea la publicacion, no el pago. Y si la cuenta esta mal, el SPEI es firme e
> irrevocable. SentryOne vive exactamente en los minutos antes de que ella le de enviar.
>
> **(25 s, el mecanismo.)** Juntamos tres fuentes que hoy viven en tres productos distintos: su
> propio catalogo de CFDI, la lista oficial del SAT con todas sus versiones, y el CEP que firma
> Banxico por cada SPEI. Seis controles independientes y una decision de perdida esperada. Son
> funciones puras, sin red y sin base de datos, y no hay ningun modelo de lenguaje en la decision.
> Los puedes leer, y puedes correr las pruebas en esta laptop.
>
> **(15 s, el diferenciador.)** Hay productos que ya retienen el pago sobre la lista del SAT y nunca
> ven la cuenta, y plataformas que dispersan SPEI sin mirar a quien recibe. Las dos mitades no se
> encuentran en el momento en que el dinero se vuelve irreversible. Ese momento es el producto.
>
> **(10 s, la invitacion.)** Preguntame lo que quieras del algoritmo, de los datos o de la
> regulacion. O manda tu una instruccion de pago desde tu telefono, ahorita.

The invitation sets up `docs/12-judge-qa.md`, and beat 3 of `docs/10-demo-script.md` is the thing it
invites. **On a market number:** this version deliberately carries none. A number a judge can
falsify costs more than the fifteen seconds it buys.

## The stand pitch, three to five minutes

This replaces the 240-second stage version. There is no stage: Capital One said judging is continuous
and the pitch happens standing at the table, two or three judges deep, on the real app with a video
only as backup. Issue #75, storyline chosen by three rubric judges against `docs/00-challenge.md`. The
operating sheet, with the exact click, the dependency and the fallback for each beat, is
`docs/10-demo-script.md#the-stand-pitch-three-to-five-minutes`, and that file wins on anything about
the screen.

**The angle, in one paragraph.** The laptop stays shut for forty-four seconds. Two losses that do not
undo themselves and the money in pesos, with the hands visible and off the trackpad, and then the
screen tells the story while the narration only explains what the screen just did. The order of the
screen is the order of Lupita's Thursday: the run in pesos, the WhatsApp screenshot dragged into the
chat, the proposal a person confirms, the SAT publishing and a line re-deciding itself, the cent and
the CEP in one click, the run leaving with receipts. The numbers, the competition, the model and the
guarantee come afterwards, one breath each, because a number said before the screen is a number a
judge can falsify and a screen that already worked is an argument that cannot be.

**The clock, measured rather than wished.** 786 spoken words, counted off this file. At 150 words a
minute, the rate to rehearse against, that is 5:14 of speech; 4:46 at 165 and 5:37 at 140. Rung 1 of
the cut ladder comes off by default and lands it at 4:59, and the ladder that brings it to 3:25 is
pre-declared in `docs/10-demo-script.md#the-cut-ladder-pre-declared`
and the two timed rehearsals that decide which rung is used are
`docs/14-process.md#the-75-rehearsal-protocol`. **A per-beat second count in this file is arithmetic on
a word count and not a measurement.** The stopwatch is.

| # | Beat | Clock | Who | What the beat has to leave behind |
|---|---|---|---|---|
| 1 | Las dos perdidas, no screen | 0:00 to 0:44 | Patricio | Two irreversibilities, the 46 percent, the thirty days, and that the publication creates the exposure |
| 2 | La corrida en pesos | 0:44 to 1:12 | Fabricio | Who Lupita is, that the data is synthetic, and that the hero figure is the money that is not leaving |
| 3 | La foto de WhatsApp, y la propuesta | 1:12 to 1:55 | Fabian | The product works, the model only transcribes, and a person executes |
| 4 | El SAT publica | 1:55 to 2:20 | Adan | The loss that needs no fraud, priced, and the list is real |
| 5 | El centavo y el CEP | 2:20 to 2:52 | Adan | Nobody can fake this beat, and the sandbox and the unverified seal are said by us |
| 6 | La corrida sale | 2:52 to 3:08 | Fabian | Money leaves with a CFDI, a decision and a name, and we hold no funds |
| 7 | Como decide | 3:08 to 3:37 | Patricio | Six controls, one expected-loss decision, pure functions, no model in that path |
| 8 | La competencia | 3:37 to 4:00 | Fabricio | Four names from us before they ask, and the union claim at its honest width |
| 9 | Mercado y modelo | 4:00 to 4:30 | Fabricio | The segment small first, the price, the break-even and the channel |
| 10 | Cuando nos equivocamos | 4:30 to 4:45 | Fabricio | Three actions and no fourth, four layers, and that no lawyer has read three of them |
| 11 | La peticion | 4:45 to 5:14 | Patricio | Ten real runs, nobody has signed anything, the stop condition, and the loss instead of the minutes |

### The words, in order

Say these and nothing else. Every number in them is in the table above this section or on the screen
while it is said.

> **1, 0:00, no screen, hands visible.** Dos perdidas, y ninguna se deshace. Si el SAT publica a tu
> proveedor en la lista del articulo 69-B, las deducciones que ya tomaste se anulan hacia atras, y
> tienes treinta dias para responder. Desde enero el articulo 49 Bis arranca ese mismo reloj contra el
> comprador, y el sello digital que se restringe es el tuyo. Y una vez que sale el SPEI, es firme e
> irrevocable. De un subtotal rechazado se revierte el cuarenta y seis por ciento entre ISR e IVA. La
> exposicion la crea la publicacion, no el pago: revisar al proveedor cuando lo diste de alta no
> protege nada. Esto no necesita que nadie te defraude.
>
> **2, 0:44, `#/run`.** Jueves. Lupita Elizondo es la unica persona de administracion de un taller de
> veintiocho empleados en Apodaca, y arriba de ella no hay tesoreria. Noventa y dos transferencias
> antes del corte, y todo esto es sintetico. La cifra grande no es el total: son setecientos ochenta y
> cinco mil pesos que no van a salir, ordenados por pesos en riesgo, con su nivel y sus hallazgos
> debajo. Nunca un porcentaje.
>
> **3, 1:12, the assistant panel.** Asi llega un pago: una foto en WhatsApp, y la arrastro al chat. El
> unico modelo aqui transcribe, y sus nueve herramientas son de lectura: una que escriba no existe en
> el tipo. Ya hay instruccion, con nivel y evidencia: difiere en dos digitos de la cuenta en la que le
> hemos pagado cincuenta y dos veces, y uno de esos digitos es la plaza: esta se abrio en la Ciudad de
> Mexico, la de siempre en Apodaca. Pregunto por que esta en rojo y termina en una propuesta, el cuerpo
> exacto de la peticion, con un boton. Lee y propone; ejecuta una persona, con su nombre.
>
> **4, 1:55, `#/sat`.** Reproducimos ocho meses de bitacora en pesos: ochocientos setenta y ocho mil de
> base ya deducida y cuatrocientos cuatro mil de exposicion. Y mira la corrida: esa linea no
> quedo retenida, se cancelo sola mientras estabamos en la otra pestana. Teclea tu un RFC real, la
> lista es la oficial:
> catorce mil doscientos treinta y cuatro renglones, aparte de nuestras facturas sinteticas.
>
> **5, 2:20, `#/cep`.** Mexico no tiene API de confirmacion de beneficiario: el unico documento que
> dice quien tiene una cuenta es el que firma el banco central. Un centavo viaja dentro de la corrida y
> la clave de rastreo regresa del riel, no de un teclado. El motor libero este pago y bloqueo aquel,
> porque el titular es otra empresa. El centavo queda en Nessie, un sandbox y no un banco, y el sello
> dice no verificado porque no tenemos el certificado de Banxico.
>
> **6, 2:52, `#/payments`.** Ahora si sale la corrida, con el nombre de quien la manda: ochenta y seis
> pagos con su clave y su recibo, y las retenidas fuera con su razon. No custodiamos fondos,
> instruimos al participante de la propia empresa.
>
> **7, 3:08, the detector beside its test file.** Seis controles sobre tres fuentes: las facturas de la
> empresa, las dos listas del SAT contra un proveedor y el comprobante de Banxico. Los seis quedan en
> corrio o en no corrio con su razon. Encima, una decision de perdida esperada que pesa los pesos en
> riesgo contra lo que cuesta retrasar ese pago un dia. Son funciones puras, y una prueba lee nuestro
> codigo y falla si aparece la palabra decide.
>
> **8, 3:37, the two-camps sheet.** La competencia la nombramos nosotros: ValidX y Portal de
> Proveedores retienen sobre las listas del SAT y nunca ven la cuenta; Clara dispersa cientos de SPEI
> sin verificar a quien recibe; CONTPAQi tiene las dos mitades y su changelog muestra que no se cruzan
> al pagar. No encontramos a nadie que las venda juntas en una decision.
>
> **9, 4:00, the segment and price sheets.** Seis mil cuatrocientas setenta y seis empresas de once a
> doscientos cincuenta en Nuevo Leon, contadas una por una en el directorio del INEGI; doscientos
> cuarenta y seis mil es el total nacional. Ochocientos noventa y nueve pesos al mes la empresa y tres
> mil novecientos el despacho que trae veinte; se paga con una factura detenida de veintitres mil
> cuatrocientos cincuenta y dos al ano. Vendemos a compras y a finanzas, por despacho contable.
>
> **10, 4:30, the four-layer sheet.** Tiene tres acciones: retener, verificar o liberar, y no hay una
> cuarta. Cuando nos equivocamos hay cuatro capas, y la que existe hoy es el expediente con un nombre.
> Nada de las otras tres lo ha visto un abogado.
>
> **11, 4:45, back on `#/run`.** Una peticion: diez corridas de pago reales en modo sombra, porque la
> tasa de falsos positivos con datos que no generamos nosotros es lo unico que no sabemos. Nadie ha
> firmado nada con nosotros, y si doscientos barridos gratuitos destapan menos del cinco por ciento,
> paramos. El jueves Lupita va a apretar enviar noventa y dos veces. No la hacemos mas rapida: le
> quitamos de encima los seis pagos que no se deshacen.

The closing is the replacement for the banned eight-minutes sentence and it is the line this whole
file's "The value is the loss, not the minutes" section asks for. Do not improvise it and do not soften
it into a claim about speed.

**If a judge interrupts in the first ten seconds**, there is one sentence and it is not improvised,
because an improvised version of it is what the first Capital One table heard: *"SentryOne lee las
facturas que la empresa ya tiene y, en el momento de pagar, dice cuales pagos retener, cuales verificar
y cuales liberar."* Then go back to the **second** loss rather than abandoning the hook.

### The clauses that go back in when the judge stays

Ten single breaths, in order of value, each one also a Q&A card in `docs/12-judge-qa.md#qa-cards`, so
nothing is lost by leaving them out. The text of each one is in
`docs/10-demo-script.md#the-clauses-that-go-back-in-when-the-judge-stays` with its beat and its word
count. The full version is 1,045 words, 6:58 at 150 words a minute, and at that length it is a
conversation and not a pitch.

The first three, because they are the ones worth the most: the one-page letter for the accountant at
the end of beat 6; the labelled evaluation inside beat 7, read off a fresh `bun run eval` and never
from memory; and the four layers in full inside beat 10.

### The stand pitch, per person

Four people, eleven beats, and the rule that costs nothing and buys the room: **two at the laptop, the
owner of the beat speaks, the other two stand one step back, and whoever answers a question is the
owner of that area rather than whoever heard it first.**

| Person | Beats | What they own on the table | What they answer when pushed | What they never say |
|---|---|---|---|---|
| **Patricio** (`garzario`) | 1, 7, 11 | Opens and closes, and owns how it decides. `packages/core`, `packages/sat`, `packages/cep`, the ADRs, CI. Opens the detector beside its test file and runs `bun test` at the table if asked | Why rules and not a model, four reasons all graded, plus the test that reads the package's own source and fails on `decide`, `score` or `recommend`. Why a critical finding cannot be released by arithmetic: rules 1 and 2 of `decide` return above the branch that weighs anything. What today's honest gap is | "IA decide", any probability or percentage of risk on a payment, and any evaluation number from memory |
| **Adan** (`Apanawa`) | 4, 5 | Owns what is real and what is not. The deterministic generator, the 35 labelled cases, the SAT loader and the sweep, the real-CEP evidence (#57) | Three sentences he says unprompted: these data are synthetic from a fixed seed; the seal says not verified because this server holds no Banxico certificate, and not verified is not invalid; the consortium is a network of other companies we generated, the warehouse is real, and what leaves a company is a salted hash, a bank code and one of four outcomes | That a seal was validated, that pesos moved in Nessie, or that real companies are on the network. Asked how many companies are on it, the answer is one, ours, in that order and without softening |
| **Fabricio** (`FabriBanda`) | 2, 8, 9, 10 | Owns the narrative, the market and the persona. `docs/00` to `06`, `docs/13`, `docs/14`, the README, the Devpost | The father's-PyME objection. Who the user is not: the micro firm with no weekly run, the company above 250 that already has an ERP and a treasury, and anyone informal. The number that does not exist, said as "no lo traigo y no lo voy a inventar en esta mesa" | "Nadie hace esto". He says "no encontramos a nadie que venda las dos mitades juntas" |
| **Fabian** (`fabbyyyy`) | 3, 6 | Drives the laptop on the two beats where the screen does something new. `apps/api`, `packages/nessie`, the schema, the migrations, the deploy | What leaves the perimeter towards the model: the clerk's own sentence, the image she dropped and the evidence of that turn's findings, never the CFDI ledger, never a full CLABE, never the bank mirror, never another company's data. The Nessie quirks, unprompted. That `enviado` and `liquidado` are two claims and this API never joins them | That the run moved pesos. And during the judging window he does not touch the server: if the instance is down, Patricio drives the local one and Fabian fixes it away from the demo laptop |

### The guarantee beat, the four layers that exist, and the slot

Beat 10 is sixteen seconds and it has to make the question from the second Capital One panel
unnecessary. The four layers below are what `docs/05-business-model.md#when-a-released-payment-is-fraud-what-the-client-gets`
holds today. Layer 1 exists in the code. Layers 2, 3 and 4 are a proposal no lawyer has read, and that
sentence is said out loud rather than printed small.

| Layer | What it is | Status, said out loud |
|---|---|---|
| 1 | The file: the six controls with their evidence, the name of whoever decided and their written reason, on a ledger that only grows. That is what a client takes to its bank, to an insurer or to the SAT inside the thirty days | **Exists today**, `runControls` and `LedgerEvent` |
| 2 | What we can fund ourselves: four weeks in shadow mode with no charge, a service credit, and a capped make-whole of twelve months of the tier, MXN 10,788 direct and MXN 2,340 through the channel, never more than the client paid | Proposal. Funded by a 10 percent reserve. **Say the limit in the same breath: MXN 10,788 does not make a MXN 100,000 SPEI whole, it is 10.8 percent of it** |
| 3 | The policy, which only an authorised insurer can write, because article 20 of the Ley de Instituciones de Seguros y de Fianzas reserves it and article 495 attaches prison. What we bring is the underwriting input no insurer receives today from a 28-person firm | Proposal. Article 102 is the lawful channel and the consultation article 20 provides for has not been filed |
| 4 | The opposite error: a hold is bounded at three days and a verification at one, the owner releases whenever they like with their name and a written reason, and the day already has a price per supplier | **Exists today**, `holdWindow` and `Supplier.delayCostPerDay` |

**[SLOT: the letter or letters the team chooses from the A to H guarantee menu. One sentence, said
between layer 2 and layer 3, worded as a proposal.]**

The slot is a slot and not a blank. If nobody has chosen before the first walk-up, **beat 10 is said
without the sentence and no new cap is promised**, because the four layers stand on their own and they
already carry the disclosure that no lawyer has read three of them. Nothing is improvised into this
slot at 09:00. The screen for the eight letters, so that the one that gets chosen cannot contradict the
regulatory beat:

| Letter | What it is | Verdict |
|---|---|---|
| F, money back if the sweep finds nothing | A price remedy on our own fees | **Sayable today.** It sits inside layer 2 and needs no counsel |
| G, dual approval | Already in the product as the owner override on a release over a finding | **Sayable today.** It sits inside layer 1 and ADR-0007 |
| H, insurer certification | This **is** layer 3. Say it as a channel and as the floor under the others, never as our policy | Sayable as layer 3, in those words |
| A, a protected-payment fund per transaction | Holding client money | **Banned.** It destroys "no custodiamos fondos", which is half the regulatory answer |
| B, escrow on the rail | Holding client money, plus a rail we do not operate | **Banned**, same reason, and ADR-0008 says the payer stays the company |
| C, supplier self-registration | The buyer-imposed portal model a 28-person firm cannot impose on anybody, and it is a competitor's shape rather than ours | Out of scope, not a guarantee |
| D, recovery in fifteen minutes | Contradicts article 11 of the Ley de Sistemas de Pagos, which this pitch quotes in its own first forty-four seconds | **Banned outright.** It would break the hook |
| E, zero liability with the bank | Route three, and nobody at any bank has agreed to anything | Only as an ask, never as a term |

And one sentence that earns more than any of the eight, because it moves the first question back from
"has anybody ever done this" to "what is the cap": **"Eftsure publica un millon de dolares con la misma
condicion, que su propio motor haya aprobado el pago."** Source [79] through
`docs/05-business-model.md`. The precedent is the shape and never the size: no dated exchange rate
lives in this repository, so the dollars are never converted and MXN 10,788 is never described as
comparable to them.

### Rehearsed, or it is a read-through

Two full timed runs on the real app with all four present, one of them with a teammate playing a
hostile judge off the Q&A cards. The protocol, what gets logged and the cut list if the room is slow
are `docs/14-process.md#the-75-rehearsal-protocol`, issue #75. A rehearsal with one person is a
read-through, and a per-beat second count in this file is arithmetic until a stopwatch has disagreed
with it.

## The real data, and where it stops being real

Say this unprompted in beat 1. It is the cheapest credibility in the room and Capital One told us
they are looking for prototypes that only pretend to work.

- **The SAT Article 69-B list is real.** The complete published listing, 14,234 rows, downloaded on
  2026-09-12 and committed byte for byte with its provenance, because a control that only works
  while the SAT portal is reachable is a control that does not work. The parser resolves columns by
  name, reads the file in its actual ISO-8859-1 encoding, handles records that span lines, keeps
  every dated situation instead of one state per taxpayer, and reports the 91 court-redacted rows
  with their line numbers rather than dropping them. A judge types an RFC into the lookup box and
  the answer comes from that file.
- **The Banxico CEP is real as a document format and as a verification procedure.** We parse the
  `SPEI_Tercero` document by child name, not by position, because the SAT samples and the production
  service order the children differently and a positional reader swaps sender and beneficiary. We
  keep the XML byte-exact, because a signature only verifies against the bytes as served. And we
  refuse to claim a valid seal: Banxico publishes no specification of the signing scheme, so
  `verifySignature` runs a candidate matrix and returns `unconfirmed_scheme`, which the UI renders
  as "firma no verificada" and never as "firma invalida". Those are two different claims and only
  one of them is ours to make. The CEP on screen today is the synthetic fixture; issue #57 brings a
  real one with its clave de rastreo, and only then does the "re-verify it on your phone" line get
  said.
- **The verification call is a real telephone call.** When the decision is `verify`, an ElevenLabs
  conversational agent speaking Mexican Spanish rings the supplier through the Twilio integration,
  reads the script built from the instruction, and hands back a transcript that a deterministic
  parser turns into `confirmed`, `denied`, `no_answer` or `unclear` with the sentence it read it
  from. Four rules the script cannot break, each covered by a test: only the last four digits of the
  account are ever spoken, nothing is promised, nobody is accused, and no data is requested. The
  outcome is appended to the ledger as evidence and **it never releases a payment**: every response
  carries `releasesPayment: false`. With no keys the endpoint answers 422 carrying the script, so
  the clerk calls from their own telephone and the control still works, slower. Two of these calls
  were placed for real on 2026-09-12, to a teammate's own phone, and the ids are in
  `docs/14-process.md#live-integrations-verified`.
- **Everything else is synthetic and watermarked.** One deterministic company from seed 69, every
  object carrying `synthetic: true`, every RFC prefixed `SYN`, and the UI watermark driven by the
  flag and never by a name. Real RFCs never sit next to fabricated evidence: `simulatePublication`
  throws on any RFC without the `SYN` prefix, so the only publication that can ever meet one of our
  invoices is an invented one. That is a rule in ADR-0002 and a test, not a promise.

## The labelled evaluation, and how blind it is not

The sentence: **"ningun caso se edito para que un control pasara, y los que no coinciden siguen
contados en contra."**

**The words "evaluacion ciega" are not said at the table and do not go on a slide.** The protocol did
not deliver what that phrase claims, the repository says so in
`packages/seed/src/holdout/README.md`, and a judge who reads that file after hearing the stronger claim
has found the one thing that costs more than the point it was worth. The sanctioned sentence above says
everything that is true and nothing that is not.

Say it that way and not the older version about who wrote what. The controls were merged before this
set was written, and the labels come from ADR-0002 and the domain types rather than from reading the
control source, which is weaker than the protocol first promised. `packages/seed/src/holdout/README.md`
carries that disclosure in full and a judge who reads it and then hears a stronger claim out loud has
found the one thing that costs more than the point it was worth.

Why the rest of it matters, if they push: a team that writes its own test cases after writing its own
detectors is reporting how well it remembers what it built, and every judge has seen that number
before. The
protocol is written down in `packages/seed/src/holdout/README.md`: the unit of account is a case by
detector pair, a zero denominator reports zero and never a silent 1.00, a case is never edited to
make a detector pass, and every case is validated twice so a malformed one throws instead of being
skipped, because a skipped case makes recall look better than it is. The number to defend is
`falsePositiveRate`, not `recall`: a sentinel that holds a legitimate payment twice is a sentinel
the clerk turns off, which is why twelve of the thirty-five cases are hard negatives that look like fraud
and are not, among them a legitimate bank change backed by the supplier's own payment complement, a
new supplier ramping to a material share of the outflow, a round-number retainer, a quarterly
invoice that repeats an amount, a thin history with no baseline to test, and a partial legal-name
match that is fine.

**What the two tables said on 2026-09-13**, and this is the honest version of them:

```
cases 35            tp 20   fp 3   fn 4   tn 186
precision 87.0%     recall 83.3%          false positive rate 1.6%
action agreement 33 of 35

nivel         esperado  predicho  coincide   precision   recall
confiable           12        12        12      100.0%   100.0%
precaucion          12        12        11       91.7%    91.7%
alerta              11        11        10       90.9%    90.9%
```

The second table is the one to lead with if a judge asks how it feels rather than how it scores. It
reads the same evaluation the way the clerk reads the screen: not "did control 2 fire" but "did this
line come out at the level it should have". A control can be right and the payment still read
`precaucion` when the documents say `alerta`, and no per-control number shows that. The row that
matters is `confiable` at 100 percent both ways: nothing the product called trustworthy turned out
not to be.

Then the part worth volunteering before anyone finds it, said as one sentence:

> Ninguno de los cuatro es un control que se haya quedado callado en un caso limpio. Los tres falsos
> positivos caen en casos donde la etiqueta si esperaba a ese detector, y en los doce negativos duros no
> disparo ninguno: eso es lo que vale del uno punto seis por ciento. Los cuatro son desacuerdos sobre la
> severidad o el estado. En tres, el detector disparo con otra severidad. En el cuarto, el del sello del
> CEP, el verificador si produce un renglon pero en info, y la regla del harness cuenta info como
> contexto y no como alerta, asi que no satisface una etiqueta que pedia warning. Los dejamos en la tabla
> con los dos argumentos escritos, porque un conjunto de casos editado hasta que coincide no mide nada.

The four disagreements are in `packages/seed/src/holdout/README.md` with both arguments side by
side: a brand-new account over WhatsApp with nothing behind it (`critical` or `warning`), a supplier
published as presunto (`warning` or `critical`), a CEP naming a different holder (`comprobable` or
`requiere_verificacion`), and a seal we could not check (`warning` or `info`).

Those four are also the entire reason `beneficiary_cep` reads 0.0 percent today, and the honest reading
of that zero is the thing to have ready, because it is the row an engineer opens. Its two expectations
are the two CEP rows above. On the holder-name case the control fires at `requiere_verificacion` against
a label asking for `comprobable`, so the same case is a miss and a false positive at once. On the seal
case the verifier produces an `info` row rather than a `warning`, and `computeMetrics` scores `info` as
context and not as an alert, so the expectation is unsatisfied and nothing is counted as a false positive
either. Neither is the control going silent on a clean payment. `bun run eval --rows` prints both, and
it prints `got -` on the seal case, so know why before a judge asks.

Read precision, recall and the false-positive rate off the screen or off a fresh `bun run eval`,
with the case count next to them. Never from memory: three merges from now this block is stale, which
is why the numbers table says to re-run it.

## No model in the decision

Four reasons, all of them graded against us: cost that scales with volume, latency, non-determinism
that cannot be unit-tested, and financial data leaving the perimeter under LFPDPPP. ADR-0004.

What that means concretely, and it is a stronger claim than it sounds:

- The only package allowed to reach a model is `packages/extract`, and it may only transcribe. It
  sends one instruction string we wrote plus the bytes of one file a person chose to send. No
  supplier, no RFC, no legal name, no CFDI, no known account, no payment history, no SAT list, no
  CEP.
- The response schema has six field names and **no field a verdict, a score or a recommendation
  could be written into**. The model is not asked to be good; it is given nowhere to put an opinion.
- What comes back re-enters the deterministic layer immediately: the check digit, the Banxico
  participant catalogue and the OCR-aware distance against the accounts this supplier has actually
  been paid on. So a model error can only add friction. A misread digit fails the check digit or
  lands far from the known accounts, and either way a person reads the original.
- It is a test, not a promise: `packages/extract/src/boundary.test.ts` reads the package's own
  source and fails if a shipped module so much as names `decide`, `Finding`, `Decision`, `Severity`,
  `detect`, `score`, `recommend` or `risk`.

## Cost per verification

The claim: **"correr los seis controles sobre un pago no cuesta nada marginal, porque no hay
inferencia en esa ruta."** That is architecture, not an estimate, and it is the line in the unit
economics table that a judge should try to break.

| Unit of work | Cost | Source |
|---|---|---|
| The six controls on one payment instruction | MXN 0.00 marginal | ADR-0004 and `docs/06-regulatory-privacy.md` section 6.3, row "all six controls on all 120 instructions" |
| The one-cent beneficiary probe | MXN 0.01 of the client's own money, sent by a person from the client's own bank, plus a signature check that runs locally | ADR-0002 control 5 |
| Reading a CLABE off a photograph | Fractions of a US cent. USD 0.000207 per image and USD 0.000363 per 30-second voice note on Gemini 2.5 Flash-Lite, priced 2026-09-12 | `docs/06-regulatory-privacy.md` section 6.3 |
| One company, one month, four runs | USD 0.028, and USD 0.068 on a model 2.4 times more expensive | same table, sensitivity column |

Three consequences worth saying: a tenfold spike in pesos screened moves no cost line, because cost
scales with how many instructions arrive as a photograph and not with how much money moves; doubling
the model price still leaves the monthly figure under seven US cents per company, so nothing in the
margin depends on picking the cheap model; and the next cost step is on-device transcription, not a
cheaper per-transaction model, because there is no per-transaction model to make cheaper.

`TODO(garzario)` verify: the table above prices Gemini 2.5 Flash-Lite and 3.1 Flash-Lite, and
`.env.example` now configures `GEMINI_MODEL=gemini-3.6-flash`. Re-price the configured model at the
provider's pricing page, stamp the date, and update `docs/06` section 6.3 before quoting a per-image
figure on stage. Until then say "fracciones de un centavo de dolar por fotografia" and leave it.

`TODO(garzario)` verify: the only figure this repository has for a verification call is the USD 0.016
the provider reported for the two calls of 2026-09-12, recorded in
`docs/14-process.md#live-integrations-verified`. That is one observation, not a price: the ElevenLabs
per-minute rate and the Twilio termination rate to a Mexican mobile are still unread, and a call that
runs longer than 18 seconds costs more. Read both price pages, stamp the date, and add a row before
quoting a per-call cost. Do not say "casi cero" about the call either; the zero-marginal-cost claim is
about the six controls and it should not be stretched.

## The business, in the three sentences that get asked

- **Who pays.** The company, MXN 899 per month, bought by whoever signs off the payment run. The
  accounting firm plan is MXN 3,900 per month for up to 20 client companies, MXN 195 each, which per
  company is more expensive than a list subscription and we say so rather than hide it. What the
  firm buys is not coverage; it is not having the conversation where a client learns that a supplier
  it paid last year is now definitivo and the thirty-day window closed unwatched.
- **Why that number.** It is 4.5 times the published MXN 199 of 69b.mx `Smart` and 1.8 times Tesio's
  MXN 499 entry plan. Both of those check a list. We act on a payment. It is also 2.4 days of the
  legal wage floor for the person doing this by hand, and it breaks even at one stopped invoice of
  MXN 23,452 of subtotal per year.
- **What it avoids.** One held invoice of MXN 100,000 of subtotal pays 51 months of the
  subscription, because 46 percent of a disallowed subtotal reverses as ISR plus IVA. One misdirected
  SPEI of the same amount pays 111 months, because there is nothing to reverse. We claim no frequency
  for either, and the free supplier-register sweep in the go-to-market is the thing that measures it.

**Who sells it, and through which channel**, which is the fourth sentence the second table asked for.
Four motions in one order, and the order is arithmetic rather than preference. For the first six months
two of the four founders sell it, Fabricio and Patricio, and they sell to **purchasing and to finance**,
never to the clerk who operates it: finance carries the disallowed deduction, purchasing owns the
supplier register and makes the call when a payment is held, and the clerk has no budget line. The
opener is the free supplier-register sweep, 200 of them in the stop condition, about eight a week. From
month six the channel is the accounting firm as a reseller on the MXN 3,900 plan, against a counted
denominator of **143** firms of 11 or more people in Nuevo Leon out of the 737 in the state: one firm
holds the CFDI XML of twenty client companies and files the corrective return when the thirty-day clock
starts, and that work is what the plan removes. Third, gated on ten paying firms, ERP and PAC
integrations, which is where CONTPAQi's more than six thousand distributors sit and where no vendor
publishes its partner terms, so the gate is a count and not a date. Fourth, gated on the same ten firms
and with the largest surface and the longest cycle of the four, the control goes inside a bank's own
business banking, because that is where the payment executes and it is the surface the company already
opens on a Thursday. The bank of the demo is Nessie, Capital One's sandbox, which is a fact about our
code and nothing else: **a bank embedding this is a route we are asking for and not a deal we have**, and
nobody at any bank has agreed to anything. Segment, counts, both conversion rates and the two
assumptions behind them are in
`docs/05-business-model.md#gtm-who-sells-this-to-whom-and-through-which-channel`.

## The eight hardest questions

The full answers with their evidence paths are in `docs/12-judge-qa.md`. What follows is the spoken
version: what the presenter says in one breath before opening a file. **If this file and `docs/12`
ever disagree, `docs/12` wins**, and this section gets fixed in the same pull request.

**1. The list is public and free. Why not just check it yourself?**

> Porque la consulta no es la parte dificil, la cadencia si, y la cadencia ya se vende: ValidX y
> Portal de Proveedores barren la lista a diario. Tiene que correr sobre cada proveedor en cada
> corrida, y otra vez hacia atras cada vez que el SAT publica, sobre facturas que ya pagaste y ya
> dedujiste. La lista cambio treinta y tres veces en doce meses, una cada once dias. La exposicion la
> crea la publicacion, no el pago, asi que revisar al dar de alta al proveedor no protege nada.
> Nuestro barrido reproduce la bitacora y pone precio a la base deducida, al ISR y al IVA por
> proveedor recien listado, y lo lee junto a la cuenta a la que esta por salir el dinero.

Open: `SweepResult` in `packages/core/src/domain.ts`, `sweep` in `packages/sat/src/sweep.ts`, beat 2.

**2. The bank already shows the beneficiary name.**

> Un banco si lo vende, HSBCnet, y unicamente para cuentas HSBC, por archivo y en horario: eso es
> higiene de una libreta de direcciones, no una puerta en la salida del pago. En general te lo
> muestra despues de que capturaste la cuenta, y lo compara contra nada, porque el banco no tiene la
> factura. Nosotros comparamos el nombre del titular en un comprobante firmado por Banxico
> contra la razon social del CFDI que estamos pagando, guardamos el XML firmado byte por byte como
> evidencia, y lo hacemos una vez por cuenta en lugar de una vez por pago. El registro de
> beneficiarios verificados es un activo que se acumula.

Open: `packages/cep/src/name-match.ts`, `POST /api/v1/cep/verify`, the CEP viewer.

**3. The one-cent probe needs a human, so it is not automatic.**

> Correcto, y es el diseno, no una limitacion. No custodiamos fondos y no ejecutamos transferencias,
> que es exactamente la razon por la que no necesitamos licencia y no tenemos arranque en frio. Una
> persona manda un centavo desde su propio banco, Banxico firma el comprobante, y esa verificacion
> sobrevive como evidencia. Lo automatizado es todo lo de alrededor: que cuentas lo necesitan, que
> tiene que decir el comprobante, y acordarse de la respuesta.

Open: `docs/06-regulatory-privacy.md` section 1, ADR-0002 control 5.

**4. Why rules and not a model?**

> Cuatro razones y las cuatro se califican: costo que escala con el volumen, latencia, no
> determinismo que no se puede probar unitariamente, y datos financieros saliendo del perimetro. La
> decision es deterministica y las pruebas corren aqui, sin red, enfrente de ti. El unico modelo que
> tocamos transcribe, y tiene prohibido opinar: el esquema de respuesta no tiene ningun campo donde
> quepa un veredicto, y hay una prueba que lee el codigo fuente del paquete y falla si aparece la
> palabra decide, score o recommend.

Open: ADR-0004, `packages/extract/src/boundary.test.ts`, run `bun test`.

**5. What is real and what is synthetic right now?**

> La lista del SAT es real y la puedes consultar tu, con el RFC que quieras: son catorce mil
> doscientos treinta y cuatro registros, descargados el doce de septiembre y guardados tal cual. El
> CEP es un documento real de Banxico y nuestro lector y verificador son reales; el que esta en
> pantalla hoy es el sintetico, y el de un centavo real es la evidencia que sigue. Todo lo demas,
> empresa, proveedores, facturas y CLABEs, es sintetico, marcado como tal en cada objeto y con
> marca de agua en pantalla. Un RFC real nunca aparece junto a evidencia fabricada, y eso lo
> sostiene una excepcion en el codigo, no una buena intencion.

Open: `packages/sat/src/snapshot/README.md`, `simulatePublication`, the watermark.

**6. What does one verification cost you?**

> Los seis controles sobre un pago cuestan cero marginal, porque no hay inferencia en esa ruta: eso
> es arquitectura, no una estimacion. La sonda de un centavo es un centavo del propio cliente mas
> una verificacion de firma local. Lo unico medido es leer una CLABE de una foto, que son fracciones
> de un centavo de dolar, y ni siquiera ocurre cuando la instruccion llega como dato. Diez veces mas
> volumen no mueve ninguna linea de costo.

Open: `docs/06-regulatory-privacy.md` section 6.3, `docs/05-business-model.md#unit-economics`.

**7. How does this scale beyond one platform, and beyond this volume?**

> Escala comercialmente porque el producto vive del lado del pagador: no necesitamos acuerdo con
> ningun banco, ni licencia, ni que nadie mas adopte nada, y los datos que leemos ya son del cliente.
> Tecnicamente, la ruta de lectura es una consulta indexada por empresa sobre una ventana de tiempo;
> sobre Timescale la bitacora es una hypertable con un agregado continuo, y sobre un Postgres normal
> es el mismo SQL contra la tabla base. Cada detector es lineal sobre esa ventana y no hace entrada
> ni salida, y en la ruta caliente no hay inferencia, asi que el costo no escala con el volumen. Lo
> primero que se rompe es el abanico del stream de eventos en un solo proceso, y se arregla
> particionando por empresa.

Open: `docs/07-architecture.md`, `packages/db/migrations/0004_timescale_sentryone.sql`.

**8. What did you cut?**

> Lo que decidimos dejar fuera esta escrito desde antes del primer commit, con su razon: cliente
> nativo de iOS, un sidecar de modelos en Python, proveedores de nube extra, y cualquier integracion
> de patrocinador que no cargue peso de verdad. Cuatro personas no mantienen cuatro superficies de
> infraestructura en treinta y seis horas. Y la regla para cortar tambien estaba escrita antes de
> necesitarla: si a las cuatro de la manana no habia rebanada vertical desplegada, se corta alcance
> y no se depura.

Open: `docs/14-process.md#what-we-cut-and-why`. `TODO(garzario)`: once the `cut` label on the board
is listed in `docs/14-process.md` at M3, name two of those out loud instead, including one you
wanted. Do not call an open issue a cut.

**And the one that always follows: why would this not be a feature inside an accounting product in
six months?**

> Podria serlo, y el camino mas rapido para ellos somos nosotros. De hecho ya hay un incumbente con
> las dos mitades adentro, CONTPAQi: tablero fiscal y dispersion masiva con conexion al banco en el
> mismo producto, y su propio changelog muestra que no se cruzan en el momento del pago. Lo dificil
> de copiar en seis meses no es la consulta a la lista, es el catalogo unido: en que cuentas le hemos
> pagado de verdad a este proveedor, establecidas por que documento, y la bitacora de eventos
> reproducible que hace posible el barrido retroactivo. Las plataformas de verificacion de
> beneficiarios de afuera no mencionan Mexico, ni CFDI, ni SAT, ni SPEI en su material publico, y los
> productos mexicanos que si conocen la lista no ven nunca la cuenta a la que esta por salir el
> dinero.

Open: `docs/04-market.md#competitor-map`, `KnownAccount` in `packages/core/src/domain.ts`.

Questions that are not in this eight and still get asked: what regulation applies, what about false
positives, why Nessie at all, and how do you know it works. All four are in `docs/12`.

## Delivery rules

- Four presenters, one beat each, named in
  [The stand pitch, per person](#the-stand-pitch-per-person) and in `docs/10-demo-script.md`. Two at
  the laptop and never four, and whoever answers a question is the owner of that area rather than
  whoever heard it first.
- Open with the fiscal hook. Every time. It is the line ADR-0002 made binding, and the laptop does not
  open until the hook ends.
- Plain words. Say "el comprobante que firma el banco central" once before saying "CEP", and "la
  lista del SAT" before saying "69-B".
- Say the synthetic-data sentence unprompted, in beat 2.
- **Never say a per-beat second count is a timing.** It is arithmetic on a word count at 150 words a
  minute until a stopwatch has disagreed with it, and the two timed rehearsals of
  `docs/14-process.md#the-75-rehearsal-protocol` are what decide which rung of the cut ladder is used.
- **Never say "evaluacion ciega", and never a number from the old holdout.** The set is 35 labelled
  cases, precision 87.0, recall 83.3, false positives 1.6, the labelled action on 33 of 35, and 12 of
  the 35 are hard negatives. "Treinta casos", "ochenta y cinco de precision", "uno punto nueve" and
  "veintiocho de treinta" are all superseded and therefore banned. Re-run `bun run eval` inside the
  hour and read them off that output.
- **Never say "lo que nadie instrumenta", or any sentence in that family.** It is "nadie hace esto"
  with one word changed and it breaks on the same search. The replacement is "no encontramos a nadie
  que le ponga precio a lo que ya dedujiste cuando el SAT publica".
- **Say `cancelado` only while the screen says `cancelado`.** Since #204 the re-scored line reaches
  that state through `sat_definitive` and not through a hold, which is rule 4 of the ADR-0009 state
  table, so the word is now true on a merged build and it is still the one claim a judge checks with
  one `curl`. On any build whose chip reads `Retener`, say `Retener`.
- **Name only the places the screen names.** Since #233 the seeded hero account is
  `012180102091764611` against the `012580100091764611` it has been paid on, so two digits differ at
  positions 4 and 9 and one of them is the plaza: the screen says `APODACA, NL` and
  `DISTRITO FEDERAL, DF`. Those two, in those words, and never a city the screen did not print.
- **Never say "IA decide", in any form.** The assistant reads and proposes, a person executes, and
  `confidenceOf`, `transactionStateOf`, `decide` and the six controls are deterministic and unit
  tested. ADR-0007.
- **Never improvise a letter into the guarantee slot.** If the team has not chosen, beat 10 is said
  without the sentence and no new cap is promised. The screen for the eight letters is in
  [The guarantee beat](#the-guarantee-beat-the-four-layers-that-exist-and-the-slot).
- Never say a number that is not in the numbers table above or on the screen.
- **Never claim the product is faster than doing it by hand.** The value is the loss prevented, in
  pesos. The eight-minutes sentence was said at the table on 2026-09-12 and it cost us the room. See
  "The value is the loss, not the minutes".
- **Never say "nadie hace esto" and never say "nosotros inventamos la prueba del centavo".** Both
  break in one search: ValidX sells a pre-payment hold on four SAT lists, and the one-centavo probe
  is Banco de Mexico's own Regla 51a Bis. Say "no encontramos a nadie que venda las dos mitades
  juntas", and say the centavo is a commodity. See "The competition, and the two sentences that lose
  the room".
- **Never say 25.4 percent, and never say any single percentage as the rate of fraud on supplier
  transfers.** The number was said to a Capital One panel on the evening of 2026-09-12 and it is in
  no source this repository holds. It is the 24.3 percent of [18] misremembered, which is the share
  of disputed pesos banks gave back and not the share of transfers that leave, and as a loss rate it
  is wrong by three orders of magnitude. The replacement is two sentences, in this order: **"nadie
  publica esa tasa, ni Banxico ni Condusef ni el INEGI; la evidencia publicada la acota entre dos por
  millon y siete por diez mil transferencias, y la derivacion esta en `docs/04-market.md` con las
  formulas"**, and then the number that does convert, **"lo que si esta publicado es que de cada peso
  reclamado por fraude regresa uno de cada cuatro, el 24.3 por ciento, asi que el 75.7 por ciento no
  vuelve"**. If one number has to be said, say the INEGI one, about 5 of every 100 economic units a
  year, and say it is a floor because 93.9 percent of those frauds were never reported. See
  `docs/04-market.md#the-rate-on-supplier-transfers-and-how-it-is-derived`.
- Never say "no nos dio tiempo". Say what we cut and why, which is a judgment story.
- If a gate in the table above is not ticked, say the version of the sentence that is true. The
  product is strong enough without the sentence that is not.
