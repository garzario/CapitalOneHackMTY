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
hide it. What the firm buys is not coverage, it is not having the conversation where a client
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
- **The holder name when we obtained it, and the word `not_checked` when we did not.** `nameMatch`
  answers `match`, `partial` or `mismatch` against the legal name on the CFDI, and `SealState` is
  `valid`, `not_checked` or `invalid`, where `not_checked` means the check could not be made and is
  never dressed up as a pass.
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

## GTM in three steps

1. **Beachhead: accounting firms serving 11 to 250 person companies in Monterrey and its industrial
   corridor.** Them first because one firm holds the CFDI XML of twenty client companies and files
   the corrective return when the thirty-day clock in article 69-B starts [4], so the pain lands on
   their desk, not the client's. We reach the first ten with a **free supplier-register sweep**: the
   firm uploads a client's supplier list or CFDI folder and gets back which RFCs are on the SAT
   list, which already-deducted invoices are affected, and how many days remain in the window. Both
   direct competitors open with a free single-RFC check [7] [8]. Ours answers the question the firm
   actually has, which is how exposed this client is right now.
2. **Expansion: the client companies behind those firms.** The sweep names the company whose payment
   run is exposed, and that company buys the direct plan. The firm is the introduction, the
   payment-run screen is the product.
3. **Channel: vertical software vendors whose customers are already our persona**, meaning CFDI
   download and administration tools and small-ERP resellers. They get a payment-time control they
   do not have to build and a reason to touch the client on the day money moves. Category named, no
   company named, because nobody has agreed to anything.

## Twelve months after the hackathon

- **Product.** CEP retrieval, signature validation and holder-name comparison running unattended for
  every verified beneficiary, with the verified-beneficiary registry as the durable asset.
- **Customers.** 25 accounting firms and 400 paying companies, a fifth of the firms and an eighth of
  the companies in the 36-month SOM in `docs/04-market.md#sizing`.
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

References [2], [3], [4], [7], [8], [12], [35] and [36] are the numbered list in
`docs/04-market.md#sources`, all opened on 2026-09-12. Eleven more are owned by this file, and they
continue that same numbering so that one number means one document across both files:

13. CONASAMI, *Tabla de Salarios Mínimos 2026*, in force from 1 January 2026. General zone MXN
    315.04 per day, northern border free zone MXN 440.87, profession 51 `Secretario(a) auxiliar` MXN
    374.60 and MXN 440.87. Accessed 2026-09-12:
    <https://www.gob.mx/cms/uploads/attachment/file/1041076/Tabla_de_Salarios_M_nimos_2026.pdf>

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
cell instead of with the method. The three-layer guarantee is the newest of those decisions and the
only one with a legal question still open on it, which is why every part of it says out loud which
stage it is at.
