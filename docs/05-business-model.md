# 05. Business model and go to market

Worth 15 points: substantiated business model (10) and adoption strategy (5). Every price we quote
for someone else is one they publish. Sources and access dates are in
`docs/04-market.md#sources`, cited here by the same numbers.

Owner: Fabricio (`FabriBanda`). Due M2.

## Who pays, and why that number

The company pays **MXN 899 per month**, bought by whoever signs off the payment run. Three anchors
hold that number up.

- **Against published substitutes.** 4.5 times 69b.mx `Smart` at MXN 199 [7] and 1.8 times Tesio's
  entry plan at MXN 499 [8]. Both check a list. We act on a payment.
- **Against the person doing it by hand.** 2.4 days of the legal floor: CONASAMI's 2026 professional
  minimum for `Secretario(a) auxiliar` is MXN 374.60 per day, MXN 440.87 in the northern border zone
  [13], and the real cost of that person is higher.
- **Against the loss.** It breaks even at **one stopped invoice of MXN 23,452 of subtotal per
  year**, because 46 percent of a disallowed subtotal reverses as ISR plus IVA
  (`docs/04-market.md#problem-sizing`) and 10,788 divided by 0.46 is 23,452.

The accounting-firm plan is **MXN 3,900 per month for up to 20 client companies**, MXN 195 each,
then MXN 149. Per company that is more expensive than a list subscription and we say so rather than
hide it. It also has a published substitute of its own, found on 2026-09-12 in the evening and named
here rather than left out: 69b.mx sells a `Corporativo` tier at **MXN 1,999 per month** for "equipos
grandes y despachos", with unlimited RFC monitoring and up to 5 users [7]. Ours is **1.95 times that**,
and the whole argument for the difference is that theirs monitors a list of RFCs while ours decides a
payment. What the firm buys is not coverage, it is not having the conversation where a client
learns that a supplier it paid last year is now `definitivo` and the thirty-day window closed
unwatched [4].

## Revenue lines

| Line | Mechanism | Why it fits | Credibility |
|---|---|---|---|
| **SaaS subscription, the wedge** | MXN 899 per company per month, tiered by payment-run volume | The buyer already pays for list checks, so the budget line exists and the argument is about scope, not about spending | High. Two published competitor prices to anchor against |
| **Accounting-firm plan** | MXN 3,900 per month for 20 client companies | The firm holds every client's CFDI XML and files the corrective return, so distribution and the work live in the same place | High. It is also the GTM channel below, so one motion sells both |
| White-label licence to a financial institution | The institution embeds it for its existing SMB book | Distribution exists and the compliance perimeter is theirs, the path `docs/06-regulatory-privacy.md` calls licensing to a regulated entity | Medium. Real, on a procurement cycle we cannot start from a hackathon |
| Per-transaction basis points | A few bps on value screened | Aligns price with value | Low for us. We never touch the money, and a subscriber would pay twice for one run |
| Lead generation to a regulated lender | Referral of an evidenced financing need | Monetises data we already hold | Rejected. It turns a control into an origination channel and invites the credit regime we stayed outside of |

**Decision on the white-label path:** it is the year-two expansion, not the headline. The headline
is the direct and accounting-firm subscription, because it needs no counterparty to say yes, which
is the same reason ADR-0002 chose a payer-side product with no licence and no cold start.

## Unit economics

At the SOM mix in `docs/04-market.md#sizing` (600 direct companies plus 2,400 through firms),
blended revenue is MXN 335.80 per company per month.

| Line | Per paying company per month | Note |
|---|---|---|
| Revenue | MXN 335.80 | Blended. MXN 899 direct, MXN 195 through a firm |
| Infrastructure cost | MXN 4 | Estimate. One managed Postgres, one Node host, static hosting, about MXN 12,000 per month at 3,000 companies. At 300 companies it is MXN 40, the number that matters in year one |
| LLM cost | MXN 0 on the scoring path | Architectural, not an estimate. ADR-0004 puts no inference in the hot path, so every detector in `packages/core` costs zero per payment. The only inference is OCR, and only when a CLABE arrives as an image. TODO(garzario) verify the per-image price against the stamped table in `docs/06-regulatory-privacy.md#cost-model` before this cell carries pesos |
| Support and ops cost | MXN 60 | Estimate. About 20 minutes of a founder per company per month. The floor wage in [13] values that at MXN 15.61, and we book MXN 60, close to four times the floor, because a founder is not a minimum-wage clerk |
| **Gross margin** | **MXN 271.80, 81 percent** | MXN 835 and 93 percent on a direct company, MXN 131 and 67 percent through a firm |

The claim a judge should test: **a tenfold increase in pesos screened changes no cost line in this
table**, because the detectors are deterministic functions over data the client already holds. Cost
scales with images uploaded and humans supported, never with volume.

### Avoided loss, per company

One held invoice of MXN 100,000 subtotal pays for **51 months** of the subscription (MXN 46,000 of
reversed ISR and IVA, divided by MXN 899). One misdirected SPEI of the same amount pays for **111
months**, because an accepted transfer order is irrevocable [2] and the whole amount is gone. We
claim no frequency for either. Frequency is what the free sweep below measures.

## CAC, LTV, payback

| Metric | Value | How it was derived |
|---|---|---|
| CAC, accounting firm | MXN 90 per company | 6 founder-hours per firm at MXN 300 loaded (estimate), MXN 1,800, spread over 20 client companies |
| CAC, direct company | MXN 900 | 3 founder-hours at the same rate |
| Average contract length | 24 months (assumption) | Annual commitment, monthly billing. Nothing to benchmark against yet, so it is stated as an assumption and the first ten accounts will falsify or confirm it |
| LTV | MXN 3,144 through a firm, MXN 20,040 direct | Gross margin per month times 24 |
| **Payback** | **0.7 months through a firm, 1.1 months direct** | CAC divided by gross margin per month |

Read those ratios honestly: 35x and 22x LTV to CAC are flattering because they contain no paid
acquisition and no salaries. The binding constraint in year one is founder hours, not cash, which is
exactly why the channel below exists.

## When a released payment is fraud: what the client gets

A second Capital One panel asked this on the evening of 2026-09-12, phrased as "you mark a payment as
safe and it turns out to be fraud". The premise has to be corrected before the question is answered,
and then it has to be answered anyway.

**The product never says safe.** `Action` in `packages/core/src/domain.ts` has exactly three values,
`hold`, `verify` and `release`, and there is no fourth one meaning safe. A release is a decision that
nothing stops this payment, carrying the evidence of the six controls, the expected loss it was
weighed against and the cost of one day of delay. The seal on a CEP reads `not_checked` unless it
actually validated against a Banxico certificate, and a person can override any of it with a name in
`Decision.decidedBy` and an argument in `Decision.reason`. So the answer is not that we are never
wrong. It is what the client holds when we are, and it comes in four layers at four different stages
of maturity. Three of them answer the payment we released and should not have. The fourth answers the
opposite error, the payment we held and should not have, which is the one a payables desk meets every
week.

### What the comparables promise, in their own words

| Comparable | What it says about the loss | What its page does not say |
|---|---|---|
| Trustpair | A page titled "Fraud? Covered. Confidence? Guaranteed." says "With Trustpair's Protection, you're indemnified for up to a defined amount in the rare event of payment fraud", and its FAQ says "The liability is available as part of Trustpair's standard Terms of Service" [57] | The amount, the conditions, the exclusions and the price. The buyer it names is "over 400 of the world's largest corporations" and the protection is "designed to support global enterprises" [57], which is not a firm of 28 people |
| nsKnox | The guarantee is about coverage, not about money: "The only solution that guarantees truly global account validation" [58] | Any indemnity. The only agreement we could open is the website Terms of Use, and it caps liability the other way: "IN NO EVENT SHALL THE COMPANY'S CUMULATIVE LIABILITY TO YOU EXCEED AMOUNTS PAID BY YOU TO THE COMPANY FOR USE OF THE SITE" [59]. That is the site's terms and not the service agreement, which nsKnox does not publish |
| Eftsure | Nothing. `www.eftsure.com` answered our request with a redirect loop on 2026-09-12 and no terms page opened, and the page that did answer carries no word about liability, warranty or guarantee [60] | So we quote Eftsure on nothing, rather than describing a guarantee we did not read |
| Verificamex, the Mexican comparable | The opposite of a guarantee, and this is the local baseline. Clause DÉCIMA NOVENA of its terms has the user grant the provider "el más amplio deslinde de responsabilidad que en derecho proceda" and indemnify it, and where the information the user entered is not adequate the terms list among the consequences "daños, pérdidas y/o perjuicios ocasionados al Usuario, los cuales no serán reclamables" [61] | Any liability of its own. The company that sells the penny test in Mexico for MXN 8.93 to 17.85 a call [35] [36] assumes none of the loss |

Read that table as the market it is: the one comparable that indemnifies sells to the largest
corporations in the world and publishes no number, and the Mexican one disclaims everything. A capped
commitment at MXN 899 per month is therefore a differentiator and not table stakes, which is also why
it has to be funded honestly rather than announced.

### Layer 1. What the product guarantees today, which is evidence and not safety

This layer exists now and needs no counsel, no reserve and no partner.

- **Six controls and their evidence on every release.** `runControls` in `packages/engine/src/index.ts`
  returns the finding set of `sat_69b`, `clabe_forensics`, `duplicate_invoice`, `supplier_behaviour`,
  `beneficiary_cep` and `bank_reconciliation`, and each finding carries its own evidence as
  machine-readable values plus an explanation in plain Spanish.
- **Geography, named, on control 2.** Digits 4 to 6 of a CLABE are the plaza the account was opened
  in, and `clabe_forensics` compares that plaza both against the plazas of the accounts the company
  has actually paid that supplier on and against the state of the CFDI `LugarExpedicion`. The
  explanation names both places and prints both codes, "la cuenta conocida esta en la plaza 580
  (APODACA, NL) y esta en la plaza 180 (DISTRITO FEDERAL, DF)", so the question a clerk asks the
  supplier is one sentence they can read off the screen and check against the catalogue committed at
  `packages/core/src/snapshot/`. What it is not is a verdict: the plaza is a `warning`, it never makes
  a line critical on its own, and the catalogue is allowed to put a name on three digits and nothing
  else, because its provenance is a SPEI participant rather than Banco de Mexico and the README in
  that folder says so in its first paragraph.
- **The holder name when we obtained it, and the word `not_checked` when we did not.** `nameMatch`
  answers `match`, `partial` or `mismatch` against the legal name on the CFDI, and `SealState` is
  `valid`, `not_checked` or `invalid`, where `not_checked` means the check could not be made and is
  never dressed up as a pass.
- **Missing information raises the level, and says that is what it is.** An account with no payment
  history behind it is `precaucion` under the rule `new_account_without_history`, whatever the
  severity table says, and the evidence carries the sentence that explains it: "no hay plazas previas
  de este proveedor con las que comparar esta cuenta, asi que el nivel sube por falta de informacion
  y no por una senal en contra". A product that reported silence as calm would be selling the one
  thing this one refuses to sell.
- **An append-only ledger.** `LedgerEvent` in `domain.ts` only grows, the retroactive sweep is a
  replay over it rather than a recomputation, and `decision_made` carries the action, the expected
  loss, the findings, who decided and why. A release cannot be rewritten after the loss, which is the
  property that makes the record worth anything to somebody else.

What that is worth in a bad week is not comfort, it is a file: what was checked, when, against which
list version, and who released it. That file is what a client takes to its bank, to an insurer
underwriting the loss, to its own board, and to the SAT inside the thirty-day window article 69-B
opens [4]. We claim exactly that and not one sentence more.

### Layer 2. The early-phase commercial commitment, which we can fund ourselves

**Proposal, to validate with counsel before it is sold.** The legal reason it is shaped this way is in
`docs/06-regulatory-privacy.md#22-what-we-may-promise-when-a-released-payment-turns-out-to-be-fraud`.

1. **Shadow mode, first four weeks, no charge.** The engine scores the client's real payment runs and
   blocks nothing. The client sees what it would have held and releases everything itself. Nobody pays
   for a decision until they have watched four weeks of them, and the same four weeks are how the hit
   rate gets measured, which is the stop condition below.
2. **Service credit.** If the product was unavailable when a scheduled run needed it, or a release
   went out with a control that could not run at all, that month is refunded. This is a service level,
   it is ours to promise, and it is the cheapest half of this layer.
3. **A capped make-whole, paid from a reserve.** The cap is **the lower of twelve months of the tier's
   subscription and the fees the client actually paid in the preceding twelve months**, one qualifying
   event per company per rolling twelve months. On the direct tier twelve months is 12 x MXN 899 =
   **MXN 10,788**; on the accounting-firm tier 12 x MXN 195 = **MXN 2,340** per client company. A
   client in its third month is capped at 3 x MXN 899 = MXN 2,697, because the cap is a refund of what
   was paid and never more than that.

**Why twelve months of fees and not a share of the loss.** Two reasons, one arithmetic and one legal.
The arithmetic: MXN 10,788 is the annual contract value the sizing in `docs/04-market.md#sizing`
already uses per direct company, and it is exactly the tax that reverses on the break-even invoice in
[Who pays, and why that number](#who-pays-and-why-that-number), since MXN 23,452 x 0.46 = MXN
10,787.92. One number therefore does three jobs, and a judge can check it with one multiplication. The
legal reason is that a refund of fees paid is a price remedy, while a payment sized to somebody's loss
is what the Ley de Instituciones de Seguros y de Fianzas reserves to authorised insurers, so the cap
is set at the largest number that is still a refund.

**How it is funded, and what breaks it.** Reserve 10 percent of collected subscription revenue in a
segregated balance.

| | Direct company | Through an accounting firm |
|---|---|---|
| Price per company per month | MXN 899 | MXN 195 |
| Cost to serve (`docs/04-market.md#why-the-arithmetic-is-the-point`) | MXN 64 | MXN 64 |
| Reserve at 10 percent of price | MXN 89.90 | MXN 19.50 |
| Gross margin after the reserve | MXN 745.10, 83 percent, from MXN 835 and 93 percent | MXN 111.50, 57 percent, from MXN 131 and 67 percent |
| Reserve accrued per company per year | 12 x MXN 89.90 = MXN 1,078.80 | 12 x MXN 19.50 = MXN 234.00 |
| Full caps the accrual funds | MXN 10,788 / MXN 1,078.80 = **one cap per ten paying companies per year** | MXN 2,340 / MXN 234.00 = **one cap per ten client companies per year** |
| Payback after the reserve | MXN 900 / MXN 745.10 = 1.2 months, from 1.1 | MXN 90 / MXN 111.50 = 0.8 months, from 0.7 |

So the commitment costs ten points of gross margin and about one tenth of a month of payback, and it
stays solvent while qualifying events run at or below **10 percent of accounts per year**. Above that
the reserve empties, which is why the contract has to cap the make-whole by the reserve balance as
well as per company and say so in the same sentence. A promise that only works at a claim rate nobody
has measured is not a promise, it is marketing.

**When it applies, and every condition is checkable over the ledger rather than arguable.**

- All six controls ran on that instruction, none of them skipped.
- The CEP for that beneficiary account was in hand, `SealState` was `valid` and `nameMatch` was
  `match`.
- The decision was `release` and `Decision.decidedBy` was `SYSTEM_DECIDER`, the one decision the engine
  signs itself.
- No person overrode it. If a clerk released what the engine held, the responsibility has a name and a
  written reason on the `decision_made` event, and the commitment does not attach. This is the
  condition that makes the whole thing affordable, and it is also the honest one: we answer for our own
  decisions, not for decisions taken against our advice.

**The honest consequence, volunteered rather than discovered.** Today almost nothing would qualify.
`beneficiary_cep` reads 0.0 percent in the blind evaluation reported in
`docs/12-judge-qa.md#5c-what-if-the-calculation-is-wrong-how-sure-are-you-about-the-percentages`, and
the seal reads `not_checked` because Banxico publishes no specification of its signing scheme, so
`valid` plus `match` is a state the product cannot yet reach at scale. That is deliberate. The
commitment turns on when the evidence is complete and not a day earlier, which is the difference
between a reserve and a wish.

**And what the cap is not.** MXN 10,788 does not make a misdirected SPEI of MXN 100,000 whole, it is
10.8 percent of it, and it is 23.5 percent of the MXN 46,000 of ISR and IVA that reverse on the same
subtotal when the supplier is listed. The gap between those numbers is layer 3, and pretending
otherwise at the table would be the fastest way to lose the room.

### Layer 3. The insurance layer, which only an authorised insurer can write

**We can never underwrite it.** Article 20 of the Ley de Instituciones de Seguros y de Fianzas
prohibits "a toda persona física o moral distinta a las Instituciones de Seguros y Sociedades
Mutualistas autorizadas en los términos de esta Ley, la práctica de cualquier operación activa de
seguros en territorio nacional", article 23 also prohibits offering one "directamente o como
intermediario", and article 495, fracción I punishes doing either with three to fifteen years of
prison and a fine of 5,000 to 20,000 Días de Salario [62]. The full chain, including the one article
that opens a lawful channel, is in `docs/06-regulatory-privacy.md`.

**What we can do is be the underwriting input.** An authorised insurer prices what it can measure, and
what it cannot measure today is whether this company checks its suppliers before it pays them. Layer 1
is that measurement, per company and per payment, in a ledger that only grows: how many runs were
screened, how many releases carried a complete control set, how many CEP holder names matched, how
many overrides happened and who signed them. That is a risk file no Mexican insurer currently receives
from a 28-person firm, and it is the asset in this conversation. Article 102 of the same law is the
channel: for insurance formalised through a contrato de adhesión, the contracting may be done through a
persona moral with no agente de seguros intervening, the insurer may pay that persona moral for
services other than the ones reserved to agents, the text of that service contract is registered with
the CNSF in advance, and the persona moral is then subject to CNSF inspection for those operations
[62]. A filing and a supervisor, in other words, not a handshake.

**What Mexican policies we opened actually cover, and the one that comes closest excludes us twice.**

| Product, opened on 2026-09-12 | What its own page or wording says it covers | Our loss? |
|---|---|---|
| GNP `Cyber Safe` [63] | Basic cover `Datos Seguros`: liability for data security and privacy, remediation services, defence and sanctions, liability for web content, payment-card security standard, cyber extortion, and own damage related to data protection. Additional cover: business interruption, lost income, forensics, dependent business loss. The page carries its own registration numbers, CNSF-S0043-0354-2025 and CONDUSEF-007026-02, which is what a registered Mexican policy looks like | No. Nothing in it is a transfer the company itself sent to the wrong account |
| Chubb México `Cyber Riesgos` [64] | Unavailability of systems, breach of personal or confidential data, data corruption, ransomware, cyber extortion, business interruption, notification costs, data recovery, regulatory defence and reputational harm, for "empresas de cualquier tamaño" | No. Same reason |
| BBVA México `Seguro Cibernético para PyME`, underwritten by BBVA Seguros México, S.A. de C.V. [65] | It does have a `Fraude Digital` cover, and clause 7.2 indemnifies "el daño patrimonial que sufra derivado de transferencias electrónicas no autorizadas por éste, mismas que hayan sido ejecutadas a través de internet (siempre y cuando no provengan del portal de banca por internet de la Entidad Emisora correspondiente)", two events a year, capped at the sum insured, only amounts moved in the 72 hours before the claim, and "Los únicos eventos cubiertos al amparo de esta cobertura son: pharming, phishing, ingeniería social, vulnerabilidad". Its own definition of ingeniería social is the insured compromising data by pharming and then handing OTP values to somebody posing as an executive of the issuing entity | No, and it is excluded twice. Our loss is a transfer the clerk authorised, from the bank's own portal, with no OTP handed to anybody. The cover requires the opposite of both |

**What we do not know and will not imply.** No Mexican insurer page we opened publishes a price, a sum
insured or a wording for supplier-impersonation transfer fraud at this company size. The only AXA cyber
page that opened for us sells "soluciones de seguros de ciberseguridad para empresas y grandes
corporaciones" under AXA XL, names Asia Pacific and Europe as its regional versions and never mentions
Mexico, and AXA Mexico's own business page answered HTTP 500 that evening, so no AXA product is named
here [66]. Zurich and Mapfre Mexico we did not open at all, so they are not named at all. The honest
sentence at the table is that the policy does not exist off the shelf yet, that the wording closest to
it excludes exactly our loss, and that the thing we would bring to the insurer that nobody else brings
is the evidence.

### Layer 4. The other error: what the client gets when we hold a payment that was fine

The panel did not ask this one. It came out of the team's own reading of the answer above on the
evening of 2026-09-12, and it is the error a payables desk meets every week rather than once in a
career: we stop a payment that was fine, the supplier stops shipping, a line waits on material, an
order does not go out. A guarantee that answers only the fraud we missed is written for the rare event
and silent about the frequent one, so this layer answers the frequent one, and it is the answer to
volunteer before a judge asks for it. Three of its four parts exist in the product today and the
fourth is the proposal.

**The delay is bounded, by the same number the decision was priced with.** `HOLD_WINDOW_DAYS` in
`packages/core/src/hold.ts` is `EXPECTED_DELAY_DAYS` from `decision.ts` under the name the screen
uses: three days for a hold, one for a verification, measured from `Decision.decidedAt`. The delay the
expected-loss arithmetic charged for and the deadline the clerk is promised are therefore one number
and cannot drift apart. Then say what the deadline is and nothing more: when it passes nothing is
released and nothing is refused, `expired` turns true and the payment goes back in front of a person,
which is binding under ADR-0002. What the deadline bounds is our own waiting, and what ends the delay
is always somebody deciding.

**The owner ends it whenever they want, under their own name.** `release_with_reason` is one of the
steps `holdWindow` offers from the first screen rather than a hidden escape, and
`POST /api/v1/instructions/:id/decide` takes the required `decidedBy` and the `reason`, appends
`decision_made` and answers the `amountAtRisk` that person accepted. The route refuses neither a
release with no prose nor a release over a critical finding, deliberately, because a hold with no way
out is bypassed outside the product where nothing is recorded at all. The one case where the product
does not offer the way out is after a recorded `denied`: the only next step is `keep_held`, the API
still accepts a release, and the screen simply does not suggest one next to the supplier's own denial.

**A day of delay already has a price, and we computed it before anybody complained.**
`Supplier.delayCostPerDay` is priced per supplier in `packages/seed/src/sentryone/delay-cost.ts` from
moratory interest on the balance outstanding plus the pronto pago discount that expires the day the
payment is late, times 1.5 for the raw material, the tooling and the outside processes whose delay
stops production. Across the 44 suppliers of the demo company it runs from MXN 101.98 to MXN 4,611.27
a day, median MXN 353.13, mean MXN 690.03, and all 92 decisions on the run carry their own. A credit
can be computed off that number instead of negotiated, which is the whole reason this layer can exist
at all.

**The arithmetic that rules out the obvious version of the remedy.** Pay the full priced delay on
every payment we wrongly stop and this is what it costs per direct company. It is a projection over
synthetic data and every row says which synthetic thing it came from.

| Step | Figure | Where it comes from |
|---|---|---|
| Payments a year | 4,784 | 92 instructions on `run-2026-09-07` from `bun run demo`, one run a week, 52 weeks |
| Payments stopped a year | about 312 | 6 of those 92 are stopped, 2 held and 4 to verify, 6.5 percent |
| Of those, wrongly stopped | about 47 | 3 of the 20 findings the blind evaluation raised are false, 15 percent, from `bun run eval` |
| Days of wrong delay a year | about 78 | the run's own mix, two holds at three days and four verifications at one, 1.67 days on average |
| Cost at the median supplier price | about MXN 27,500 | 78 days at MXN 353.13 |
| Cost at the mean supplier price | about MXN 53,800 | 78 days at MXN 690.03 |
| The annual subscription it would come out of | MXN 10,788 | 12 x MXN 899 |

Two and a half to five times the price, so paying the full priced delay is not a commitment, it is an
arithmetic error. The inputs are synthetic, and that is said twice rather than once: the stop rate is
one generated run and the 15 percent is three false findings over thirty labelled cases. Shadow mode
exists to replace both. The table is here because a cap whose arithmetic nobody showed is the kind of
promise that gets believed and then broken.

**The proposal, and it is a proposal.** `TODO(FabriBanda)`: counsel reviews this wording in the same
session as the article 20 consultation in
`docs/06-regulatory-privacy.md#22-what-we-may-promise-when-a-released-payment-turns-out-to-be-fraud`,
and neither the cap nor the word credit reaches a contract, a price list or the UI before that.

A **service credit against the next invoice**, equal to the whole days the payment actually sat times
that supplier's `delayCostPerDay`, capped per event at one month of the tier's subscription and per
rolling twelve months at two. A credit and never cash, and never a figure sized to a loss the client
proves: returning our own consideration is a price remedy, while a payment sized to somebody's damage
on an uncertain event is the operación activa de seguros that article 20 of the Ley de Instituciones
de Seguros y de Fianzas reserves to authorised insurers [62]. No proof of loss is asked for the same
reason, and because a remedy the client has to win is not a remedy.

| | Direct company | Through an accounting firm |
|---|---|---|
| Price per company per month | MXN 899 | MXN 195 |
| Cost to serve (`docs/04-market.md#why-the-arithmetic-is-the-point`) | MXN 64 | MXN 64 |
| Layer 2 reserve at 10 percent of price | MXN 89.90 | MXN 19.50 |
| Cap per event, one month of subscription | MXN 899 | MXN 195 per client company |
| Cap per rolling twelve months, two months | MXN 1,798 | MXN 390 |
| That annual cap spread over twelve months | MXN 149.83 | MXN 32.50 |
| Gross margin after the reserve and this cap | MXN 595.27, 66 percent, from MXN 745.10 and 83 percent | MXN 79.00, 41 percent, from MXN 111.50 and 57 percent |
| Payback | MXN 900 / MXN 595.27 = 1.5 months, from 1.2 | MXN 90 / MXN 79.00 = 1.1 months, from 0.8 |

**Why two months a year and not three, and not one.** Three months would spread to MXN 48.75 a month
on the channel tier and leave it at 32 percent gross margin in the worst case, and a channel we cannot
afford to serve is not a remedy either. One month would make the annual cap equal to the per-event
cap, so a second wrong hold in the same year would be worth nothing and the contract would be read
that way on purpose. Two is the largest cap that keeps both tiers above 40 percent in the worst case,
which is the case a contract has to survive rather than the one we expect.

**What the cap covers, and where it plainly does not reach.** On the median supplier a three-day hold
prices at MXN 1,059.39 and the cap pays MXN 899 of it, 85 percent. On the most expensive line of the
seeded run, `INS-2026-09-07-029` at MXN 3,403.07 a day, three days price at MXN 10,209.21 and the cap
pays 8.8 percent. So the cap binds hardest exactly where the delay hurts most, and a company wrongly
stopped 47 times in one year collects MXN 1,798, about MXN 38 an event. The remedy for being wrong at
volume is therefore not the credit: it is the three-day bound, the release under a name, and an engine
that stops being wrong. What the credit buys is that the first two cost us money when they fail.

**When it applies, and every condition is a predicate over the ledger.**

- All six controls ran on that instruction. A payment delayed because the product was unavailable when
  the run needed it is the service credit in layer 2, which refunds the month, and not this one.
- The stop was the engine's own: `decision_made` carries `hold` or `verify` with `decidedBy` absent or
  `SYSTEM_DECIDER`. A hold a person chose over the engine's release is their decision, the same way
  round as in layer 2.
- The product's own later evidence contradicted the finding: a recorded `verify-call` outcome of
  `confirmed` together with a one-cent CEP whose `nameMatch` was `match`, or a later dated SAT
  publication that does not name the RFC the `sat_69b` finding cited.
- The payment was still stopped when the window closed, `expired` true on `holdWindow` with no release
  before it. If the owner released at hour two the bound did its job, and there is nothing to credit.

**The honest consequences, volunteered rather than discovered.** Two of those conditions cannot be
observed through the product today. The screens send a fixed `clerk@demo` and do not ask for the
reason before an override, so a release under a named person is an API fact and not yet a screen fact
(#174), and nothing carrying a cap is sold before the screen asks for the name and the argument. The
strongest contradiction, a CEP holder name that matched under a seal that validated, is the state
layer 2 is also waiting for: `beneficiary_cep` reads 0.0 percent in the blind evaluation and the seal
reads `not_checked` until the real Banxico certificate lands (#57). And for a duplicate-invoice or a
bank-reconciliation finding the contradiction is a document the client attaches rather than an object
the product produced, so those are reviewed by a person instead of decided by the predicate. That
asymmetry is named here rather than discovered in the first dispute.

### Why any of this is credible at three in the afternoon of a hackathon

- **The evaluation is blind.** Thirty labelled cases written by whoever does not write the detectors,
  85 percent precision, 81 percent recall, 1.9 percent false positives, and the engine chose the
  labelled action in 28 of 30, from `scripts/eval.ts` and `GET /api/v1/metrics` as reported in
  `docs/12-judge-qa.md`. Synthetic cases, and we say so. A commitment priced on numbers the promiser
  also wrote would be worth nothing.
- **There is a stop condition and it is above this section.** If fewer than 5 percent of 200 free
  supplier-register sweeps surface something inside a live window, we stop, and there is nothing to
  guarantee because there is nothing to sell.
- **Shadow mode comes before the money.** Four weeks of the client's own runs, no charge and no block,
  which is the only honest way to price a cap and the only way to find out whether the qualifying
  conditions above ever trigger. It measures both error rates and not one: how often a release was
  wrong, and how often a hold was. The second is what layer 4 is priced on, and today it is one
  synthetic run.
- **The product still never says safe.** Every layer here attaches to `release` plus complete
  evidence, never to a claim of safety, which is why the commitment can be written as a predicate over
  the ledger instead of a paragraph of adjectives.

## GTM: who sells this, to whom, and through which channel

Rewritten on 2026-09-12 in the evening. A second Capital One panel said the project was interesting
and then asked the thing the previous version of this section did not answer literally: narrow the
market, and name exactly who sells it and through which channel. Issue #193. Every count below carries
a numbered source and every rate that is not a count is labelled as an assumption. Two sentences that
used to live here were wrong and are corrected in
`docs/04-market.md#assumptions-one-line-each`: the two published competitors sell *to* accounting
firms, not *through* them, and one of them does publish a customer count.

### The first segment, narrowed until it is a list you could buy

**Formal manufacturers, builders and wholesalers of 11 to 250 people in Nuevo Leon whose payment run
touches 30 or more suppliers a week.** Five filters, and each one is counted, admitted or labelled as
the hypothesis it is:

| Filter | Where it comes from | What it leaves |
|---|---|---|
| 11 to 250 people | DENUE `per_ocu` strata, counted | **24,599** establishments in Nuevo Leon [48] |
| Manufacturing, wholesale trade, construction (SCIAN 31-33, 43, 23) | DENUE `codigo_act`, counted. Transport and warehousing is the fourth sector and waits | **6,476**: manufacturing 3,240, wholesale 2,445, construction 791 [48] |
| Inside the Monterrey metropolitan area, so a founder can drive to the meeting | DENUE `municipio`, counted. The thirteen-municipality grouping is ours | **6,114**, 94.4 percent of the 6,476, led by Monterrey 2,261 and Apodaca 857 [48] |
| Formal, so it issues and receives CFDI and pays by SPEI | **Not counted, and not countable.** DENUE carries no formality field, so we apply INEGI's blunt all-size national rate of 35.7 percent [1]: 6,476 x 0.357 | **about 2,312**, deliberately understated for the same reason as the SAM filter, since formality rises with headcount and INEGI does not publish the rate for this band |
| 30 or more suppliers a week | **Not published anywhere.** DENUE carries no payment data, CE 2024 carries none, and the ENAFIN tabulados render as a JavaScript shell | Unmeasured. It is the filter the free sweep exists to measure, and the only published behaviour that points at it is that 86.3 percent of firms in this band already run an accounting system or pay an external accountant [24] |

So the honest headline is **6,476 establishments published and about 2,312 after a formality rate we
know is too low**, in one metropolitan area, in three sectors, and the supplier-count filter is a
hypothesis with a measurement attached rather than a number we assert.

### Months 1 to 6: the founders sell it, to purchasing and to finance, and the opener is their own XML

**Who sells.** Fabricio (`FabriBanda`) and Patricio (`garzario`) take the meetings together, because
the sweep is run live in the room and someone has to answer the question about the algorithm on the
spot. No salesperson, no reseller, no agency. Founder-led, and the CAC line in the table above is
founder hours because of it.

**Who buys, and it is two functions, neither of them the clerk.** **Purchasing and finance.** The panel
put it as the owner or the CFO, and the team meeting of the same evening sharpened that into two
functions, because a title is something you hope to meet and a function is something you can ask for an
introduction to. Finance owns the loss: 46 percent
of a disallowed subtotal reverses as ISR plus IVA [5] [6], finance files the complementary return inside
the thirty days from the publication [4], and finance signs the run. Purchasing owns the register the
controls read: it is who adds a CLABE, who changes one when a supplier says its account moved, and who
telephones that supplier when a payment is held. Both have to say yes, which is why the sweep is run in
front of the two of them in the same room rather than emailed to one of them.

The evidence that this is the real split is a competitor's own published promise rather than our reading
of an org chart: ValidX sells "si no cumple, se retiene y se notifica a Compras" [31], so the one firm
already selling a pre-payment hold in this country routes its output to purchasing. And in a firm this
size the signature is one named person rather than a committee, which is what ENAFIN 2021 supports with
`Director(a) o gerente` as the principal decision maker in 61.2 percent of firms [28]. That figure is
used for the shape of the sale and for nothing else: it is a managerial title, it does not establish
ownership, and the survey measures decisions in general and not the payment decision.

**The clerk in `docs/02-persona.md` is the user and not the buyer.** She has no budget line, and the one
thing the product does to her Thursday is make it slower on six lines out of ninety-two. Selling a
control to the person it constrains is the mistake this section used to invite. It is also why the demo
is run for purchasing and finance while every screen is designed for her: the person who signs has to
believe the decision, and the person who lives in it has to be able to work.

**The opener.** A free supplier-register sweep, and the stop condition already fixes its volume at
**200 sweeps**. Over six months that is 200 divided by 26 weeks, **about 8 sweeps a week**, which is
an operating rate rather than an ambition. The firm or the company uploads a supplier list or a CFDI
folder and the answer comes back as four numbers: which of their supplier RFCs sit on the 69-B list,
which invoices they already deducted from those RFCs, the peso exposure at 46 percent of the subtotal,
30 percent ISR [5] plus 16 percent IVA [6], and how many of the thirty days from the publication are
left [4]. Both published competitors open with a free check too [7] [8]. Theirs answers whether one
RFC is listed. Ours answers how much money is already on the wrong side of a clock.

**The number of conversations, with the formula.** Two rates, both assumptions with no benchmark
behind them, to be falsified by the first ten accounts the way the 24-month contract length is:

- **1 in 3** companies approached agree to a free sweep, asked of purchasing or of finance. 200 sweeps
  x 3 = **600 conversations** in six months, 600 / 26 = **about 23 a week**, which is **about 5 a
  working day**. Two founders sit in each one, so that is five slots a day out of two of the four
  calendars, on top of building the product. It is the binding constraint of the first six months and
  it is stated as one.
- **1 in 4** sweeps that surface a live exposure becomes a paying company. At the 5 percent hit rate
  of the stop condition, 200 x 0.05 = 10 exposed sweeps and 10 x 0.25 = **2 or 3 paying companies in
  the first six months**. That is the honest output of the direct motion, and it is the reason this
  half of the plan is a measurement instrument and not the revenue plan.
- **What the SOM implies if this were the whole plan.** 600 direct companies over 36 months at those
  two rates is 600 / (1/3 x 1/4) = **7,200 buyer conversations**, 200 a month, **46 a week for three
  years**. Four founders who are also building the product cannot hold 46 conversations a week for
  three years. The channel below is not a growth lever bolted on, it is the arithmetic.

### From month 6: accounting firms as resellers, on the MXN 3,900 plan

**The denominator, counted rather than gestured at.** 737 accounting and audit units in Nuevo Leon,
SCIAN 541211 [26], of which **424 employ five people or fewer and only 143 employ 11 to 250** [48].
The reseller target is those 143 and not the 737, because a two-person despacho does not carry twenty
client companies. **140 of the 143 sit in the metropolitan municipalities** [48]. The year-one target
of 25 firms is **25 of 143, 17.5 percent** of the in-band despachos in one state, which is a claim a
judge can argue with instead of the 0.7 percent of a national denominator this file used to quote.

**The partner economics, both ways, because we do not set the firm's resale price.**

| Line | Per firm | Formula |
|---|---|---|
| What the firm pays us | MXN 3,900 per month, MXN 46,800 a year | Up to 20 client companies, MXN 195 each |
| What the firm can bill, if it resells at our direct price | MXN 14,080 per month, MXN 168,960 a year | (MXN 899 - MXN 195) x 20 clients x 12 |
| The firm's gross margin on that | **78.3 percent** | MXN 168,960 / MXN 215,760 of billing |
| What the firm pays if it bundles it free into its monthly fee | MXN 195 per client per month | 3,900 / 20. It buys the conversation it does not have to have |
| Our revenue, cost and margin per firm | MXN 3,900 revenue, MXN 1,280 to serve, **MXN 2,620 gross, 67.2 percent** | 20 x the MXN 64 cost to serve in the table above. Same cells as the unit economics, so the two agree |
| Our CAC and payback per firm | MXN 1,800, **0.69 months** | 6 founder-hours at MXN 300 loaded; 1,800 / 2,620 |

**Why a firm sells it, stated precisely enough to survive a tax question.** The statutory obligation
is the client's, not the firm's: article 69-B puts the thirty days on whoever gave fiscal effect to the
comprobante [4], and article 69, twelfth paragraph, fracción IX then publishes that buyer's own name
and RFC when it did not demonstrate materialisation in time (`docs/06-regulatory-privacy.md` section
3.1). What the firm carries is the work and the relationship: it is who files the complementary
return, who watches a clock that starts on a publication date nobody told it about, and who takes the
call when a client learns that a supplier it paid last year is now `definitivo` and the window closed
unwatched. That is what the MXN 3,900 removes, and it is why the firm is a reseller rather than a
referral: the thing being resold is the firm's own Monday.

**What is evidenced and what is our bet, kept apart.** Firms of exactly this kind already buy software
of exactly this shape: Tesio calls itself "Software fiscal con IA para contadores y despachos" and
publishes "+2,400 contadores automatizan con Tesio" on its own home page, self-reported and unaudited
[8], and 69b.mx sells a `Corporativo` tier at MXN 1,999 per month "Para equipos grandes y despachos"
[7]. That is the demand, and it also prices the ceiling: our MXN 3,900 has to be worth 1.95 times
69b.mx's despacho tier, and the answer is that theirs monitors a list while ours decides a payment.
**Neither of them publishes a reseller, partner or affiliate programme**, so the firm as a reseller is
our bet and is labelled as one.

**Where the firms are reachable.** The Nuevo Leon college of the IMCP, the Instituto de Contadores
Publicos de Nuevo Leon, publishes **2,000 afiliados** and calls itself the second largest institute in
Mexico on its own home page [49]. We quote no IMCP national figure at all: every fetch of
`imcp.org.mx` answered HTTP 403, and the numbers its own pages show in search results disagree with
each other, so there is nothing here we opened [50].

### The second channel, and the gate that opens it: ERP and PAC integrations after ten paying firms

**The gate is a count, not a date.** Ten paying accounting firms, which is 200 client companies and
MXN 39,000 of monthly recurring revenue, before one engineering hour goes into an integration. Before
that the integration is a way to avoid selling.

**What the two named vendors publish.** CONTPAQi states "Más de 6 mil distribuidores forman parte de
nuestra comunidad" and "Más de 1.2 millones de empresas usuarias" on its own about page, and says its
PAC authorisation is held by MásFacturación, a company of the group; its distributor page publishes
seven reasons to join and **no distributor count and no partner economics at all** [54]. Siigo Aspel
publishes a certified-distributor directory with named tiers, `Experto Elite` and the `Black`
category, and zones, and **no total** [55]. So the channel is large enough to be worth a gate and
neither vendor publishes the terms on which anyone joins it.

**What does not exist, said out loud.** We wanted the size of the SAT's list of proveedores
autorizados de certificacion as the denominator for the PAC half. **It is not published in a form
anyone can count.** The portal page the SAT redirects to answers a 1,477-byte JavaScript shell, the
legacy `terceros_autorizados` PAC page has an empty content block last modified 11 February 2014, and
the SAT's own padron of registered contadores publicos and despachos answered HTTP 500 "Server
Application Error" on 2026-09-12. AMEXIPAC, the association the SAT's own page points at, renders its
member list as a logo carousel with no count [56]. **So we quote no PAC count**, and the PAC half of
this channel is a direction with a gate in front of it and no denominator behind it. 69b.mx's own
`API 69-B` is marked "Próximamente" with a waitlist [7], so nobody in this category has proved the
integration channel yet either.

**The chamber route, which is published and dated.** CAINTRA Nuevo Leon states "+5,000 empresas
afiliadas" on its own site [51], and on 2026-09-10, at Expo Pyme Monterrey 2026, it signed an
agreement with Afirme Banco covering "cerca de 4,500 pequeñas y medianas empresas afiliadas", with
preferential rates, terms to 60 months, leasing to MXN 5 million evaluated on cash flow, factoring
and a 48-hour answer [52]. That is a bank distributing a financial product to precisely our first
segment through a chamber, two days before this was written, and it is the published proof that the
channel shape works. It is credit and not a control, so it is an analogy and not a competitor, and
nobody at CAINTRA has agreed to anything with us. COPARMEX Nuevo Leon publishes only its national
figure of more than 36,000 member companies and no state count, so no COPARMEX number is used here
[53].

### The third route: a bank embeds the control where the payment executes

Gated behind the same ten paying firms as the integrations above, and written down now because the team
meeting of 2026-09-12 in the evening put the question that makes it the most important route rather than
the last one.

**The dilemma, in the form it was asked.** If what we sell is a decision about a payment, then we are
one more intermediary between a company and its bank, and intermediaries are the layer everybody is
trying to remove. The answer is not that we are indispensable. It is about where the control sits:
**SentryOne belongs where the payment executes, and that place is the bank.** Three published facts
carry that, and none of them is ours:

- **The run already happens inside the bank's own surface.** ENAFIN 2021 found 60.4 percent of firms
  with six or more employed persons carried out financial operations through the financial institution's
  web page, against 35.0 percent through a mobile app [28]. A control that lives anywhere else is a
  second screen somebody has to remember on the day money moves.
- **The despacho cannot be the last step.** It holds no credentials for the client's bank portal, which
  is why `docs/02-persona.md` section 3 calls it the distributor and the second pair of eyes and never
  the operator. Any channel that ends at the despacho ends one step before the transfer.
- **The verification primitive is already the rail's own procedure.** Regla 51a Bis of the SPEI rules has
  the Administrador, which Regla 2a defines as Banco de Mexico, generate a one-centavo transfer order in
  its own name to read the account holder out of the resulting CEP, and Regla 72a obliges participants
  generally to do the same [29]. The check we hang a decision on is a central-bank procedure, so the
  question is never whether a bank can do it, only whether anything decides on the answer.

**So the shape is an embed, not a referral.** A bank that puts the six controls inside its
business-banking payment screen is not distributing somebody else's product, it is keeping the payment
it already has and adding the one thing that screen does not do today. The two Mexican banks whose
own documentation we read say exactly how far they go and where they stop. HSBCnet does sell
beneficiary-name validation, and it is scoped to "unicamente cuentas HSBC", from a 10-digit account
number rather than a CLABE, uploaded as a file of up to 5,000 accounts inside a 07:00 to 22:00 window
[42]. BBVA Net Cash has the company type the holder's name itself, with a token challenge on the last
six digits of the account being registered, which authenticates the employee doing the registration and
not the identity of the account holder [43]. Read together those two are the opportunity written by the
banks themselves: the surface is theirs, HSBC having built the feature at all is the demand, and neither
turns it into a hold, verify or release at the moment of payment with the SAT list beside it.

**What the bank gets that we cannot give it from outside.** The payment is already in its rail, so the
decision can sit before the irrevocability of article 11 of the Ley de Sistemas de Pagos [2] rather than
after it; the CEP it would read is its own; and the consortium signal of ADR-0006 gets stronger the more
payers sit behind one deployment, which is the one asset a bank has and a startup does not. What it
costs the bank is the part we do not hide: a data-processing agreement under the LFPDPPP transfer clause
in `docs/06-regulatory-privacy.md`, a security review, and our side of it running inside their
perimeter, which is the year-two white-label path the section below already commits to proving with one
paid pilot rather than asserting.

**Whose name may be said, and how.** The bank of the demo is **Nessie**, Capital One's API sandbox:
`scripts/nessie-mirror.ts` and `packages/nessie/src/mirror.ts` write and read the mirror of the company's
accounts, and the sixth control, `bank_reconciliation`, decides on what that mirror answers or records
`no_bank_mirror` when there is none. So that sentence is a statement about our code and not about a
relationship.
**Capital One is the kind of bank this route is for**, which is a judgement about bank shape, published
API and segment, and it is the reason the ask in `docs/11-pitch.md` at 3:45 is a conversation with
whoever owns business banking. **It is a route we are asking for and not a deal we have: nobody at
Capital One, and nobody at any other bank, has agreed to anything with us.** The closest published
analogy sits two days before this was written and it is credit rather than control, so it proves a
shape and nothing more: Afirme Banco and CAINTRA Nuevo Leon signed an agreement on 2026-09-10 covering
about 4,500 affiliated PyMEs [52]. A bank reaching precisely our segment through a channel works in this
state. That is the whole of what the analogy claims.

**What we did not find, said where it matters.** No published Mexican bank programme for small-business
software partners is cited here, because none was opened on this pass: the bank pages we did read are the
two product documents above [42] [43]. So this is an ask for a conversation and not an application to a
programme that is known to exist, and the distinction is the difference between a plan and a hope.

**Why it is third and not first.** A bank integration is a procurement cycle and a security review
measured in quarters, and the only thing that survives either one is evidence from companies already
running the control. So the order is 200 sweeps, then ten paying firms, then the bank conversation, and
reversing it would mean spending the quarters before we have the evidence that the conversation is
about.

### What the buyer actually buys

Not six controls and not a feature list. **One number, computed from their own XML, next to a
deadline.** On the committed seed that pair reads MXN 878,592.59 of subtotal already deducted and MXN
404,152.59 of exposure, MXN 263,577.78 of ISR plus MXN 140,574.81 of IVA, across 24 of the 31 invoices
to a single supplier, and that company is synthetic and is introduced as synthetic. On a real sweep the
same two cells are theirs.

**And the sentence that has to survive the sale, because the product refuses the easy version of it:
SentryOne never answers that a payment is safe.** It releases with the evidence of six controls, each
one recorded as having run or as skipped with a reason, and an expected-loss decision that weighs the
pesos at risk against what a day of delay costs that supplier. The seal on a CEP reads `not_checked`
unless it was actually verified, and `not_checked` is never rendered as valid. A person can override
any outcome in either direction with their name and a written reason, and both land on the ledger. What
purchasing and finance are buying is not a promise that nothing will go wrong. It is a file of decisions with names
and reasons on them, taken before the transfer became irrevocable [2], which is the only artefact that
is worth anything thirty days later when the SAT publishes.

## Twelve months after the hackathon

- **Product.** CEP retrieval, signature validation and holder-name comparison running unattended for
  every verified beneficiary, with the verified-beneficiary registry as the durable asset.
- **Customers.** 25 accounting firms and 400 paying companies, a fifth of the firms and an eighth of
  the companies in the 36-month SOM in `docs/04-market.md#sizing`. Those two numbers now have to agree
  with the channel above, and they do: 25 firms carry up to 500 client slots, so the 400 companies are
  reachable at **80 percent slot fill** and the direct motion of months 1 to 6 does not have to carry
  them. 25 firms at MXN 3,900 is MXN 97,500 of monthly recurring revenue before a single direct
  company is counted.
- **Compliance.** A data-processing agreement reviewed by counsel covering the LFPDPPP transfer
  clause in `docs/06-regulatory-privacy.md`, plus one paid pilot inside a regulated institution's
  perimeter, which is the year-two white-label path proved rather than asserted.
- **What would make us stop.** If, after 200 free supplier-register sweeps, fewer than 5 percent
  surface a listed RFC or an unverifiable beneficiary inside a live window, the problem is too rare
  in this segment to carry a subscription and we stop. That test runs on the wedge itself, so it
  costs a month, not a year.

## Why this wedge and not the obvious one

The obvious version of this product is an anomaly dashboard over bank transactions that scores
payments and alerts on the strange ones. It loses twice. The data it holds, amount and time and
counterparty, does not contain the fact that makes the loss real: the counterparty's status on a
list the SAT rewrites every eleven days [3], and the holder name Banxico signs on the receiving
account [12]. And it fires after settlement, when the transfer order is already irrevocable [2]. Our
wedge is the join of three public sources in the minutes before the money leaves, the only window in
which any of it is worth anything.

## Sources

References [1], [2], [3], [4], [5], [6], [7], [8], [12], [24], [26], [28], [29], [31], [35], [36],
[42], [43] and [48] are the numbered list in `docs/04-market.md#sources`, all opened on 2026-09-12.
Sources 13 and 49 to 66 are used only here and continue that same numbering, so that one number means
one document across both files:

13. CONASAMI, *Tabla de Salarios Mínimos 2026*, in force from 1 January 2026. General zone MXN
    315.04 per day, northern border free zone MXN 440.87, profession 51 `Secretario(a) auxiliar` MXN
    374.60 and MXN 440.87. Accessed 2026-09-12:
    <https://www.gob.mx/cms/uploads/attachment/file/1041076/Tabla_de_Salarios_M_nimos_2026.pdf>
49. Instituto de Contadores Publicos de Nuevo Leon (ICPNL), home page, read 2026-09-12 in the evening.
    A counter block publishes `2000 Afiliados`, `+360 Eventos al año`, `600 Certificados` and `77 Años
    1° Colegio de Contadores en México`, with the line `2o Instituto más grande en México` beside it,
    and the page describes affiliation as including membership of the IMCP. Every figure is
    self-reported by the institute on its own site and none is dated. The page also links a list of
    members who met the `Norma de DPC 2025`, which is not counted here. Address on the page is Justo
    Sierra 322, Col. San Jemo, Monterrey: <https://www.icpnl.org.mx/home>
50. Instituto Mexicano de Contadores Publicos (IMCP), *Quienes somos*. **Not retrievable on
    2026-09-12:** the URL answered HTTP 403 to three different clients, so nothing from it is quoted
    and no IMCP membership figure or count of federated colleges appears anywhere in this file. Search
    engines show snippets of imcp.org.mx pages carrying 21,000, 22,000, 23,000 and 24,000 members and
    both 60 and 61 federated colleges, which is a second reason to quote none of them:
    <https://imcp.org.mx/quienes_somos/>
51. CAINTRA Nuevo Leon, *Servicios Empresariales*, read 2026-09-12 in the evening. The page states
    "+5,000 empresas afiliadas siendo socias de CAINTRA". Self-reported by the chamber on its own
    site, undated: <https://www.caintra.org.mx/en/servicios-empresariales/>
52. La Prensa de Coahuila, *Afirme Banco y CAINTRA Nuevo León sellan acuerdo para inyectar capital a
    más de 4,500 PyMEs*, 10 September 2026. Signed "En el marco de la Expo Pyme Monterrey 2026" and
    covering "cerca de 4,500 pequeñas y medianas empresas afiliadas al organismo empresarial", with
    commercial credit at preferential rates, terms to 60 months with no opening fee, leasing evaluated
    on cash flow to MXN 5 million, factoring, and a commitment to answer a complete application within
    48 hours. A press report of an agreement and not a document of either party, and labelled as such
    where it is used:
    <https://laprensadecoahuila.com.mx/2026/09/10/afirme-banco-y-caintra-nuevo-leon-sellan-acuerdo-para-inyectar-capital-a-mas-de-4500-pymes/>
53. Coparmex Nuevo Leon, home page, read 2026-09-12 in the evening. The only membership figure on the
    page is national: "Representamos a más de 36,000 empresas a nivel nacional ante los Tribunales del
    Trabajo así como ante dependencias Federales y Locales". **No Nuevo Leon member count is published
    on it**, which is why no COPARMEX number is used in the channel plan:
    <https://coparmexnl.org.mx/>
54. CONTPAQi, *Nosotros* and *Distribuidores*, both read 2026-09-12 in the evening. The about page
    states "Más de 6 mil distribuidores forman parte de nuestra comunidad", "Más de 1.2 millones de
    empresas usuarias están agilizando sus procesos con nuestras soluciones", "Contamos con mas de 40
    años de experiencia" and "Estamos presentes en más de 800 universidades a nivel nacional", and
    footnotes its PAC claim as "Certificación otorgada a MásFacturación, empresa del grupo CONTPAQi®".
    The distributor page carries seven reasons to join, the requirements, and **no distributor count,
    no margin and no partner terms**. All figures are self-reported and undated:
    <https://www.contpaqi.com/nosotros>, <https://www.contpaqi.com/distribuidores>
55. Siigo Aspel, *Localiza a tu distribuidor integral*, read 2026-09-12 in the evening. A directory of
    certified distributors with published tiers, `Experto Elite` as the highest certification and
    `Black` as the highest category, and a `Zona` per entry. **The page publishes no total**, so no
    Aspel distributor count is used. The site also carries a `Programa Partners` aimed at accountants
    under its `Contadores` menu: <https://www.aspel.com.mx/distribuidores>
56. SAT, the list of proveedores autorizados de certificacion, four routes tried on 2026-09-12 in the
    evening and **none of them countable**. The `tramitesyservicios` page is a meta-refresh to the
    portal page, which answers 1,477 bytes of JavaScript shell with no list in the HTML
    (<http://omawww.sat.gob.mx/tramitesyservicios/Paginas/proveedores_autorizados_certificacion.htm>,
    <https://www.sat.gob.mx/portal/public/tramites/lista-de-proveedores-autorizados-de-certificacion-de-cfdi>).
    The legacy `terceros_autorizados` PAC page returns 57,675 bytes of site navigation with an empty
    `Contenido de la página` and the stamp `Última modificación: 11 de febrero de 2014 a las 12:21`
    (<http://omawww.sat.gob.mx/terceros_autorizados/pacs/Paginas/default.aspx>). The SAT's own
    `Padrón de Contadores Públicos y Despachos Registrados` opens, and its `DESPACHOS` search answers
    HTTP 500 `Server Application Error`
    (<https://www.consulta.sat.gob.mx/cprsinternet/>, <https://www.consulta.sat.gob.mx/cprsinternet/cprProcBusD.ASP>).
    AMEXIPAC, the association the SAT's own orientation page names, renders its member list as a logo
    carousel with no count (<https://amexipac.org.mx/lista-de-socios/>). A third-party blog states a
    total of 51 proveedores de certificacion and cites nothing, so it is not used as a source here
57. Trustpair, *Fraud? Covered. Confidence? Guaranteed.*, the guarantee page and the three questions
    in its FAQ. No amount, no condition and no exclusion appears on the page. Accessed 2026-09-12:
    <https://trustpair.com/guarantee/>
58. nsKnox, home page, `Global Account Validation for Banks` block. Accessed 2026-09-12:
    <https://nsknox.net/>
59. nsKnox, *Terms of Use*, sections `Disclaimer and Warranties`, `Limitation of Liability` and
    `Indemnification`. These are the website's terms. nsKnox publishes no service agreement, so the
    cap quoted is the one that governs the site and not the product. Accessed 2026-09-12:
    <https://nsknox.net/terms-of-use/>
60. Eftsure. `https://www.eftsure.com/` answered HTTP 302 to itself until the client gave up after 50
    redirects, on 2026-09-12 at 19:40 local, so no terms page could be opened. The page that did
    answer 200 that day, <https://home.eftsure.com.au/payment-fraud>, contains no occurrence of
    guarantee, warranty, liability or indemnity. Nothing in this file is attributed to Eftsure.
61. Verificamex, *Términos y Condiciones de Uso*, the `Idoneidad de la información` paragraph of
    clause SEXTA and clause DÉCIMA NOVENA `Indemnización`. Accessed 2026-09-12:
    <https://verificamex.com/terminos-y-condiciones>
62. *Ley de Instituciones de Seguros y de Fianzas*, nueva ley DOF 04-04-2013, last reform DOF
    14-11-2025, articles 2 fracción VI, 11, 20, 23, 24, 91, 93, 102 and 495. Accessed 2026-09-12:
    <https://www.diputados.gob.mx/LeyesBiblio/pdf/LISF.pdf>
63. GNP, *Cyber Safe*, product page including its coverage list and the registration numbers
    CNSF-S0043-0354-2025 and CONDUSEF-007026-02 printed under Condiciones Generales. Accessed
    2026-09-12: <https://www.gnp.com.mx/seguro-empresarial-de-danos-ciberneticos>
64. Chubb México, *Seguro Cyber Riesgos*, coverage list and the "Quiénes contratan" block. Accessed
    2026-09-12: <https://www.chubb.com/mx-es/empresas/chubb-cyber-riesgos.html>
65. BBVA México, *Seguro Cibernético para PyME, Condiciones Generales*, wording dated October 2020,
    underwritten by BBVA Seguros México, S.A. de C.V., Grupo Financiero BBVA México. Definition 26
    `Ingeniería social` on page 6, cover 7.2 `Transferencias electrónicas en internet no autorizadas`
    and the exclusions for `Fraude Digital` on page 21. Accessed 2026-09-12:
    <https://www.bbva.mx/content/dam/public-web/mexico/documents/18-sep/empresas/seguros/pyme/seguro-cibernetico-para-pymes/condiciones-generales-seguro-cibernetico-pymes-102020.pdf>
66. AXA, two requests on 2026-09-12. <https://myaxa.com.mx/web/negocios> answered HTTP 500, so nothing
    is quoted from it. AXA XL, *Seguros comerciales para Riesgos Cibernéticos*, opened and describes
    "Soluciones de seguros de ciberseguridad para empresas y grandes corporaciones", lists Asia Pacific
    and Europe as its regional versions, and contains no occurrence of Mexico, PyME or pequeña:
    <https://axaxl.com/es/insurance/product-families/cyber>. Recorded so that the absence of a Mexican
    product page for this cover is a finding with a date on it rather than a silence.

Our own prices, the cost estimates and the channel plan are decisions, not findings. Each one is
labelled above as a price, an estimate or an assumption, so a judge can disagree with a specific
cell instead of with the method. The two conversion rates in the GTM section, 1 in 3 to a sweep and 1
in 4 to a paying company, are the two assumptions with nothing at all behind them. They are the first
two things the first ten accounts will falsify, and the stop condition is deliberately written against
the hit rate rather than against either of them, because the hit rate is the one a month of work can
actually measure. The four-layer guarantee is the newest of these decisions and the only one with a
legal question still open on it, which is why every part of it says out loud which stage it is at.
