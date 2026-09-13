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
of maturity.

**What the clerk reads instead of a number.** The same panel asked what the screen shows, and the
answer is two words per payment and never a figure. `Confidence` is `confiable`, `precaucion` or
`alerta`, and `TransactionState` is `rojo`, `cancelado` or `enviado` plus the two the run counts
internally. Both are derived by `confidenceOf` and `transactionStateOf` in
`packages/core/src/levels.ts`, neither is stored, and the level always arrives with the findings that
produced it. That is a commercial decision as much as a technical one: the expected-loss arithmetic in
`packages/core/src/decision.ts` says in its own comment that its figure is an upper bound on the
evidence rather than a calibrated probability, so selling 0.73 next to a supplier's name would be
selling a precision nobody measured, and the first client who asked what it meant would be right.
`confiable` is a statement about the documents we hold. ADR-0009 carries the rule table and forbids a
probability, a percentage or a score on any screen or in any document of this product, and it forbids
the word "seguro" as a verdict in any language, because a SPEI cannot be recalled.

**One case is not a hold and the commercial promise has to say so.** When the SAT publishes a supplier
as `definitivo` under article 69-B, or a final resolution under article 49 Bis, the comprobantes have
no fiscal effect at all and retroactively. There is nothing for the clerk to wait out, so the line
reads `cancelado` rather than `rojo`, `POST /api/v1/sat/publish` appends a `payment_cancelled` naming
the article, and the only way back is a release signed by the owner with a written reason through
`POST /api/v1/instructions/:id/decide` with an `X-Actor` carrying `role=owner`. The commitment in
layer 2 does not attach to a payment reopened that way, for the same reason it does not attach to a
release taken against our advice: the record names the person who took it and the argument they wrote,
and `GET /api/v1/instructions/:id/carta` prints both on one page. Three of them answer the payment we released and should not have. The fourth answers the
opposite error, the payment we held and should not have, which is the one a payables desk meets every
week. After the four layers comes the menu the team asked for on the same evening, eight options with
what each one costs us, what it needs legally, whose document is the precedent and where it breaks,
ending with the ones we would defend on stage.

### What the comparables promise, in their own words

| Comparable | What it says about the loss | What its page does not say |
|---|---|---|
| Trustpair | A page titled "Fraud? Covered. Confidence? Guaranteed." says "With Trustpair's Protection, you're indemnified for up to a defined amount in the rare event of payment fraud", and its FAQ says "The liability is available as part of Trustpair's standard Terms of Service" [57] | The amount, the conditions, the exclusions and the price. The buyer it names is "over 400 of the world's largest corporations" and the protection is "designed to support global enterprises" [57], which is not a firm of 28 people |
| nsKnox | The guarantee is about coverage, not about money: "The only solution that guarantees truly global account validation" [58] | Any indemnity. The only agreement we could open is the website Terms of Use, and it caps liability the other way: "IN NO EVENT SHALL THE COMPANY'S CUMULATIVE LIABILITY TO YOU EXCEED AMOUNTS PAID BY YOU TO THE COMPANY FOR USE OF THE SITE" [59]. That is the site's terms and not the service agreement, which nsKnox does not publish |
| Eftsure | A number, and it is the closest thing to a precedent on this page. "Eftsure's Guarantee provides indemnity of up to $1 million against payment fraud losses caused by social engineering fraud", "included with your subscription for all customers who signed a customer agreement after the 10th March 2025", and it attaches only where Eftsure's own engine matched routing number and account number to the vendor's business name and gave the payment a "green thumb" of approval. Its own FAQ calls it "this transfer of liability in our agreements" [79] | The wording. The cap is "Subject to Eftsure's standard terms of service and service addendums" and covers "eligible domestic and international payments" that "meet the criteria" [79], none of which is published, and the page is the US site, so the currency is read as dollars from context rather than stated. The afternoon entry [60] said we could quote Eftsure on nothing, which was true of the client we used and is corrected here rather than defended |
| Verificamex, the Mexican comparable | The opposite of a guarantee, and this is the local baseline. Clause DÉCIMA NOVENA of its terms has the user grant the provider "el más amplio deslinde de responsabilidad que en derecho proceda" and indemnify it, and where the information the user entered is not adequate the terms list among the consequences "daños, pérdidas y/o perjuicios ocasionados al Usuario, los cuales no serán reclamables" [61] | Any liability of its own. The company that sells the penny test in Mexico for MXN 8.93 to 17.85 a call [35] [36] assumes none of the loss |

Read that table as the market it is. **One vendor publishes a capped, subscription-included indemnity
gated on its own positive verdict, and it is the architecture we would ship** [79]. The other that
indemnifies sells to the largest corporations in the world and publishes no number [57], and the
Mexican comparable disclaims everything [61]. So the claim is not that nobody does this, it is that one
company does it, in dollars, outside Mexico, and that no Mexican provider of this control assumes any
of the loss. A capped commitment at MXN 899 per month is therefore a differentiator here and not table
stakes, which is also why it has to be funded honestly rather than announced. The eight ways of funding
it, with the precedent and the weakness of each, are in
[The options, and the one we would defend](#the-options-and-the-one-we-would-defend) below.

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
- **One page per payment, for the supplier who rings to ask.**
  `GET /api/v1/instructions/:id/carta` prints the seven signals this product read about one payment,
  each of them saying whether it could answer at all: both SAT lists, the account with its plaza, the
  payment history behind it, the CEP and its seal, the verification call, and what the clerk uploaded.
  Under them the level, the state, the action, the person who signed it and their written reason, and
  the SHA-256 huella of the ledger range. It is the document a payables desk sends out instead of the
  sentence "nuestro sistema lo marco", and it costs nothing to produce.

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
| Of those, wrongly stopped | about 41 | 3 of the 23 findings the blind evaluation raised are false, 3 / 23 = 13.0 percent, from `bun run eval` on the thirty-five-case set |
| Days of wrong delay a year | about 68 | the run's own mix, two holds at three days and four verifications at one, 1.67 days on average, 41 x 1.67 = 68.5 |
| Cost at the median supplier price | about MXN 24,000 | 68 days at MXN 353.13 = MXN 24,012.84 |
| Cost at the mean supplier price | about MXN 46,900 | 68 days at MXN 690.03 = MXN 46,922.04 |
| The annual subscription it would come out of | MXN 10,788 | 12 x MXN 899 |

Two and a quarter to four and a quarter times the price, 24,000 / 10,788 = 2.2 and 46,900 / 10,788 =
4.3, so paying the full priced delay is not a commitment, it is an arithmetic error. The inputs are
synthetic, and that is said twice rather than once: the stop rate is one generated run and the 13.0
percent is three false findings over thirty-five labelled cases. Shadow mode exists to replace both.
The table is here because a cap whose arithmetic nobody showed is the kind of promise that gets
believed and then broken. The figures in this row moved when the evaluation grew from thirty cases to
thirty-five (#201), and they are restated here rather than left at the old 15 percent, because a number
the current `bun run eval` contradicts is worse than no number.

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
stopped 41 times in one year collects MXN 1,798, MXN 1,798 / 41 = about MXN 44 an event. The remedy for
being wrong at
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

### The options, and the one we would defend

The four layers above are what we would ship. This subsection is the rest of the menu, written down
because a judge who accepts the four layers will immediately ask what else was on the table and why it
was not chosen, and because three of the eight options below are stronger than anything the previous
version of this file had. Each option carries the same four lines in the same order: what it costs us,
what it needs legally, the precedent with its source, and the honest weakness. The weakness is not a
disclaimer, it is the reason the ranking at the end comes out the way it does.

One correction to make before the menu, because it changes the market claim this section opened with.
The earlier pass of this file said no comparable publishes a number. That was true of what we could
open that afternoon and it is no longer true. **Eftsure publishes a capped vendor-funded indemnity of
up to USD 1 million**, restricted to social engineering fraud losses on payments its own engine
verified and marked with a "green thumb" of approval, "included with your subscription for all
customers who signed a customer agreement after the 10th March 2025", and its own FAQ calls it "this
transfer of liability in our agreements" [79]. The page that answered a redirect loop in the afternoon
opened in the evening through a different client, so source [60] is corrected rather than defended.
Two of its figures are not convertible into our units and we do not convert them: no dated exchange
rate lives in this repository, so USD 1,000,000 and MXN 10,788 are left in the currencies their owners
published them in, and what the precedent establishes is the shape and not the size.

| Option | In one line | Stage |
|---|---|---|
| (a) Guarantee by evidence depth | Cover attaches to the payments that carried the full chain, so the incentive is to use the controls | Shippable now, it is layer 2 with the gate named as the product |
| (b) Parametric trigger on the ledger | The payout condition is machine-checkable, so there is no claims fight | Designable now, and only lawful as a fee credit until (d) exists |
| (c) The reserve, sized | 10 percent of revenue, MXN 10,788 per event, an aggregate cap, and the arithmetic against a published incidence | Shippable now |
| (d) The insurance layer done right | An authorised insurer underwrites, we are the condition precedent and the article 102 channel | Twelve months, needs a counterparty |
| (e) The bank-embedded route | The institution that owns the rail reimburses, as the United Kingdom already made compulsory | A route, needs a bank |
| (f) Claim assistance | The carta and the constancia as the packet for the bank, Condusef and the SAT window | Shippable now, and it promises effort and never recovery |
| (g) Priority verification and the delay credit | The answer to the error a payables desk meets every week | Two of three parts exist, the SLA is the proposal |
| (h) The legal floor | Liability capped at twelve months of fees, the person's decision as the last act | Needs counsel, and it is the floor under all seven |

**(a) Guarantee by evidence depth, not by price.** Coverage attaches to a payment rather than to a
plan: both SAT lists clean at the time of the decision, a CEP in hand whose `SealState` was `valid`
and whose `nameMatch` was `match`, and `decision_made` carrying `release` signed `SYSTEM_DECIDER` with
no override. A client who skips the probe, or releases over a critical finding, is outside the
commitment on that payment and inside it on the next one. The price does not move.

- **What it costs us.** Nothing beyond layer 2's reserve, and it reduces the exposure rather than
  adding to it, because the gate is a conjunction of four conditions and every one of them is a
  predicate over the ledger. It costs product work instead: the screen has to show, before the
  release, which of the four conditions are met, or the gate is a surprise in the first dispute.
- **What it needs legally.** Nothing new. The remedy is still a refund of fees paid, which is the
  price remedy the third paragraph of article 20 of the Ley de Instituciones de Seguros y de Fianzas
  leaves outside the reserved activity, and the carve-out has three requirements and not two: the
  arrangement has to be the forward sale of goods or services, performance has to be satisfied "con
  recursos e instalaciones propias de quien ofrece el bien o el servicio", and the provider must not
  commit "a resarcir algún daño o a pagar una prestación en dinero" [62].
- **The precedent, and it is somebody else's document.** Eftsure gates its indemnity on its own
  positive verdict: it matches routing number and account number to the vendor's business name and
  "When we find a positive match and identify no issues, we provide customers with a 'green thumb' of
  approval. Payments made to suppliers verified by Eftsure are covered by our guarantee" [79]. That is
  the same architecture, including the part that matters most to us, which is that the vendor answers
  for its own verdict and not for payments made around it. The contrast is Ramp, whose own Bill Pay
  Fraud page tells the customer to "double-check with your vendor through a separate communication
  channel", on a channel other than the one the instructions arrived on, and records an audit log
  naming the user who dismissed a high-severity alert [91]. Same evidence, opposite conclusion: Ramp
  uses the log to place the loss on the customer, and (a) uses it to place the loss on us when the log
  says the engine decided.
- **The honest weakness.** Today the gate is almost never satisfied, for the reason layer 2 already
  volunteers: `beneficiary_cep` reads 0.0 percent in the blind evaluation and the seal reads
  `not_checked` until a real Banxico certificate lands (#57). So (a) is a commitment whose conditions
  the product cannot yet reach at scale, and a judge is entitled to read that as a promise with a
  switch that is still off. The answer is that the switch is visible and dated, not that it is on.

**(b) A parametric trigger, and why our own ledger cannot be the index.** The attraction is real:
write the payout condition as a predicate, publish it, and there is no claims investigation and no
argument about proof of loss. The FSI and IAIS paper that sets out the design discipline also kills the
naive version of the idea, and it is worth naming the kill before a judge finds it.

- **What it costs us.** Engineering, and it is the cheapest option on this list to build: the four
  conditions of (a) plus the existence of a bank claim or a Condusef file are already either ledger
  events or one attached document. What it buys is the thing clients actually fear, which is winning
  the argument rather than winning the money.
- **What it needs legally.** This is the option that most resembles the reserved activity, so the
  drafting rule is stricter rather than looser. Article 20's second paragraph defines an operación
  activa de seguros as undertaking, against the payment of a sum of money, to indemnify a loss
  "de manera directa o indirecta" or to pay a sum of money on a future uncertain event foreseen by the
  parties [62]. A parametric payout is that definition read aloud. So until (d) exists, (b) may only be
  the trigger of a **credit or refund of fees the client already paid**, never a payment sized to the
  loss, and the contract has to say so in the clause and not in a footnote. The statute also says who
  settles the question: the Secretaría, hearing the Comisión, **may** issue criteria of general
  application on what counts as an operación activa de seguros and **must** resolve the consultations
  put to it [62]. "Must resolve" is not "answers bindingly", and the article does not describe the
  answer as vinculante, so the consulta is a step that produces a position and not a permit.
  `TODO(FabriBanda)`: file it with counsel, in the same session as the article 20 reading in
  `docs/06-regulatory-privacy.md#22-what-we-may-promise-when-a-released-payment-turns-out-to-be-fraud`.
- **The precedent, and it is somebody else's document.** FSI Insights No 62, written by Bank for
  International Settlements FSI and IAIS Secretariat staff, sets out three design elements, the
  parameter or index, the trigger and the payout structure, and defines the index as an "Objective
  measure that is both reported by an independent third party (neither the insured nor insurer) and
  correlated to the insured financial loss", whose key criteria are that "it is fortuitous; it can be
  readily available from an independent reporting agency; and it can be modelled" [84]. Swiss Re
  Corporate Solutions uses nearly the same words and adds the commercial point, that parametric
  solutions eliminate "all complexity of a loss investigation process" [85]. **So our append-only
  ledger cannot be the index, because we are the insurer-side party and not an independent third
  party.** The Banxico-signed CEP can: it is objective, it is published by somebody who is neither the
  insured nor the promiser, and it is readily available. The defensible design is therefore a two-part
  trigger, a CEP holder mismatch as the index and the ledger as the audit record behind it, and the
  ledger's job is to prove the index was read rather than to be the index.
- **The honest weakness.** Basis risk, and the paper names it first: the most significant limitation of
  parametric cover is "the risk that the payout may not fully match the insured's actual losses" [84].
  Ours is large and in one direction, because the cap is MXN 10,788 and the loss is whatever left the
  account. Two smaller ones to volunteer in the same breath. The paper's two classification criteria,
  insurable interest and genuine risk transfer, plus proof of loss as a third for hybrid products [84],
  are characterisations the authors draw from Sengupta and Kousky (2020) and Swiss Re (2024) and are
  expressly the authors' own views rather than binding BIS or IAIS policy, so they are a design
  discipline and not a rule we can cite at a supervisor. And no Mexican parametric primary source was
  secured at all: the framing above is authoritative and foreign, and a Mexican example on a slide
  would have to be verified first.

**(c) The reserve, sized against the only published incidence.** The reserve is 10 percent of collected
subscription revenue, the per-event cap is twelve months of the tier's fees, and the third number the
earlier pass left implicit is now explicit: **an aggregate annual cap equal to the reserve balance**,
disclosed in the contract and in the same sentence as the per-event cap. Three arithmetic facts, each
with its formula, and the first one is the one that makes this option defensible at any size.

    per-event cap / annual reserve per company  =  (12 x price) / (0.10 x 12 x price)  =  10

The cap is exactly ten times the reserve it is funded from, **at every tier and therefore at every
mix**, because one is twelve months of fees and the other is a tenth of twelve months of fees. So the
reserve funds one full cap per ten paying companies per year whatever the book looks like, and the
break-even claim rate is the same number read as a rate:

    break-even incidence  =  annual reserve per company / blended cap
                          =  MXN 402.96 / MXN 4,029.60  =  0.10  =  10.0 events per 100 companies a year

    where  annual reserve per company  =  0.10 x MXN 335.80 x 12  =  MXN 402.96
    and    blended cap  =  0.2 x MXN 10,788 + 0.8 x MXN 2,340  =  MXN 4,029.60

at the SOM mix of `docs/04-market.md#sizing`, 20 percent direct and 80 percent through a firm. Against
that, the only published incidence of fraud per company per year in Mexico is INEGI's: 522 fraud events
per 10,000 economic units, **5.22 per 100 units a year**, on a category whose own footnote includes
bank fraud, derived in `docs/04-market.md#derivation-3-the-one-a-company-can-act-on-incidence-per-company-per-year`
[14] [15]. The headroom is one division:

    10.0 / 5.22  =  1.92 times the published incidence

Then the same arithmetic at three book sizes, at the SOM mix throughout, and **every event is priced as
if it qualified**, which overstates the demand on purpose. ENVE counts every fraud against an
establishment, not supplier impersonation on a payment our engine released with a matched CEP, and
layer 2's gate would exclude most of them.

| At this many paying companies | 300 | 1,000 | 3,000 |
|---|---|---|---|
| Direct and through a firm, at the SOM mix | 60 and 240 | 200 and 800 | 600 and 2,400 |
| Reserve accrued in the year, MXN | 60 x 1,078.80 + 240 x 234.00 = **120,888** | 200 x 1,078.80 + 800 x 234.00 = **402,960** | 600 x 1,078.80 + 2,400 x 234.00 = **1,208,880** |
| Events at ENVE's 5.22 per 100 | 300 x 0.0522 = **15.66** | 1,000 x 0.0522 = **52.2** | 3,000 x 0.0522 = **156.6** |
| Of those, direct and through a firm | 3.132 and 12.528 | 10.44 and 41.76 | 31.32 and 125.28 |
| Cost if every one paid its tier's full cap, MXN | 3.132 x 10,788 + 12.528 x 2,340 = **63,104** | 10.44 x 10,788 + 41.76 x 2,340 = **210,345** | 31.32 x 10,788 + 125.28 x 2,340 = **631,035** |
| Reserve divided by that cost | 120,888 / 63,104 = **1.92** | 402,960 / 210,345 = **1.92** | 1,208,880 / 631,035 = **1.92** |
| Full direct-tier caps the direct accrual funds | 60 / 10 = 6 | 200 / 10 = 20 | 600 / 10 = 60 |
| Unexpected direct events the reserve absorbs | 6 - 3.132 = **2.87**, so three | 20 - 10.44 = **9.56**, so ten | 60 - 31.32 = **28.68**, so twenty-nine |

- **What it costs us.** Ten points of gross margin and about a tenth of a month of payback, both
  already priced into the layer 2 table. The aggregate cap costs nothing and buys the one thing the
  earlier version lacked, which is a number the client can see before the bad week instead of a
  sentence about the reserve balance.
- **What it needs legally.** Nothing new, and one drafting line. The aggregate cap has to be a cap and
  not a queue that silently discards: if the annual aggregate is exhausted, claims are met in the order
  the ledger digest sealed them and the unmet ones are told so, because an undisclosed exhaustion is
  how a price remedy turns into a complaint about a promise.
- **The precedent, and it is somebody else's document.** The moral hazard objection is the one a judge
  will actually press, and it has been measured at national scale rather than argued. The Payment
  Systems Regulator published Frontier Economics' independent evaluation of the United Kingdom's
  mandatory reimbursement duty on 1 July 2026: reimbursement rates across all claims rose from 54
  percent to 65 percent, firms now reimburse 97 percent of in-scope claims, "APP fraud losses have
  fallen by an estimated £73 million per year and the number of APP scams have fallen by nearly
  35,000", the policy delivers a short-term net benefit of GBP 17 million to GBP 29 million which the
  evaluators "consider a conservative assessment of its overall impact", and there is "no evidence of
  market exits or reckless consumer behaviour, which some had predicted would be a consequence of the
  policy" [78]. A promise to pay, gated on a standard of care, measured as a fraud-reduction
  instrument. And the size of the gate is published too: on the same regulator's dashboard, over the
  eighteen months from 7 October 2024 to 31 March 2026, **3 percent of claims were rejected for the
  customer not taking enough care** [77], which is the direct analogue of our "never after an
  override" condition and says it should exclude a small minority rather than function as a loophole.
- **The honest weakness.** The reserve is frequency-solvent and severity-fragile, and the second half is
  where it breaks. The direct cap is 10,788 / 2,340 = **4.61 times** the channel cap, so an adverse mix
  costs far more than an adverse count. Price every expected event at the direct cap and the break-even
  incidence falls below the published one:

        adverse-mix break-even  =  MXN 402.96 / MXN 10,788  =  0.0374  =  3.74 events per 100 a year

  which is 5.22 / 3.74 = **1.40 times under** ENVE's incidence, an overrun of MXN 48,052 at 300
  companies, MXN 160,174 at 1,000 and MXN 480,521 at 3,000 on the same rows as the table. Two more
  weaknesses, said plainly. The slack grows in absolute terms and not in relative terms, so the small
  book is the fragile one: three unexpected direct events empty it at 300 companies and twenty-nine are
  needed at 3,000, which is why the tail matters in year one and not in year three. And **ENVE is the
  wrong population for this product**, a national average over about 4.8 million economic units that
  are mostly micro [14], used here because it is the only published per-company incidence there is;
  shadow mode replaces it with the client's own rate, and that substitution is the stop condition in
  this file read as a measurement.
- **Where the tail has to go, and the word for it is not reinsurance.** Reinsurance is cover an insurer
  buys, and we are not one and must not describe ourselves as one. What absorbs the overrun above is
  either a stop-loss on our own reserve written by an authorised insurer, or an endorsement on the
  client's own policy, which is option (d). Which of the two, and whether a company in our position may
  buy the first at all, is not answered by anything read for this file. `TODO(FabriBanda)`: counsel, in
  the same session as the article 20 consulta.

**(d) The insurance layer done right, and the product class has a name.** The class is **funds transfer
fraud and social engineering**, sold as endorsements to a crime or cyber policy rather than as a policy
of its own, and the reason this option is the strongest one on the list has nothing to do with the
money. It is that the insurance market already conditions payment on exactly the artefact SentryOne
produces.

- **What it costs us.** A partnership motion and a filing, not a reserve. The work is the underwriting
  file: runs screened, releases carrying a complete control set, CEP holder names matched, overrides
  and who signed them, per company and per payment, which is layer 1 aggregated rather than anything
  new. The cost is calendar, and it is counted in quarters.
- **What it needs legally.** Two sentences, and the first one is the one the team has been saying
  loosely. **We are never the underwriter**: article 20 reserves the practice of any operación activa
  de seguros to authorised insurers, article 23 also prohibits offering one directly or as an
  intermediary, and article 495, fracción I attaches "prisión de tres a quince años y multa de 5,000 a
  20,000 Días de Salario", extended by the same article to "los directores, gerentes, administradores,
  miembros del consejo de administración, funcionarios, empleados y los representantes y agentes en
  general" of a legal entity that habitually carries out the unlawful operations, with the Comisión
  able to intervene administratively once a judicial resolution is firme [62]. That penalty lands on
  founders personally, which is why this is a design rule and not a disclaimer. The second sentence is
  the correction to how this route has been described internally: **we are not a licensed promoter,
  because article 102 is precisely the route that needs no licence.** For insurance formalised through
  a contrato de adhesión, other than social-security pensions and caución, the contracting may be done
  "a través de una persona moral, sin la intervención de un agente de seguros"; the insurer may pay
  that persona moral for services other than the ones the law reserves to agents; the text of that
  services contract must be registered with the Comisión beforehand; and the persona moral is then
  "sujeta a la inspección y vigilancia de la Comisión" for those operations [62]. The licensed route is
  the other one, article 93, whose authorisation the Comisión grants, and which is intransferible and
  suspendable by its own terms [62]. Articles 103 to 105 add the conditions this file will not pretend
  are absent: possible certification of the entity's staff, conflict-of-interest measures, and article
  104 making the insurer liable for damage caused by the entity's conduct, which is a reason an insurer
  may refuse the channel and not a formality.
- **The precedent, and it is somebody else's document.** Three, and together they are the pitch.
  **First, the condition precedent is already in the policies.** In Abraham Linc Corp. v. Spinnaker
  Ins. Co. (N.D. W. Va., 16 July 2024) the policy carried a USD 2,000,000 Computer and Funds Transfer
  Fraud endorsement and a USD 100,000 Social Engineering Incident endorsement, the court concluded
  social engineering alone did not trigger the larger one because the hackers reached the supplier's
  email system and not the insured's, and on the smaller one it sent the parties to discovery on
  whether the insured had met a condition precedent: coverage was premised on the insured following an
  "established and documented verification procedure", and "the policyholder had no documented
  procedure or protocol", only an "unwritten protocol" of email contact, arguing calls were
  impractical across time zones. The case settled months later [80]. **Second, the sublimits and the
  advice.** Counsel writing for buyers reports that "Many social engineering endorsements carry
  sublimits that are far lower than the crime policy's overall limit. Common ranges are between
  $25,000 and $250,000", that some endorsements "condition coverage on the policyholder having followed
  specified verification procedures before processing the transfer", and that "Even if your crime or
  cyber policies' social engineering endorsement does not explicitly require verification procedures,
  implementing them is both a sound business practice and a defense against an insurer's argument that
  the loss was avoidable" [82]; a broker puts the same point harder, that "Coverage is typically
  limited or excluded if a phone call is not made when a policy has such a requirement" [83]. **Third,
  a carrier's own marketing says the control the market demands is spoofable.** Travelers, in its
  Social Engineering Fraud Endorsement coverage highlights, writes that "Some messages even amend phone
  numbers in the email panel, so a call back to a phone number is directed to the fraudster, who will
  of course verify the information", and two of its three claim scenarios are ours, a retailer that
  updated its payment instructions on a hacked supplier's email and a manufacturer employee who wired
  on a CFO-impersonation email, discovered the next day [81]. So the whole market converges on calling
  back a known number, the carrier says in print that the number can be the attacker's, and a
  Banxico-signed CEP naming the holder after a one-centavo probe is the one piece of evidence in this
  chain the attacker cannot author, because the attacker does not hold Banxico's signing key. The line
  that follows is the product: **we do not compete with the endorsement, we are the condition precedent
  that makes the endorsement payable**, and we hand the client the sublimit problem in writing, 100,000
  against 2,000,000 in a real policy, which is 5 percent, so they go and buy a bigger one.
- **What exists in Mexico today, and the honest shape of it.** A broker, not an insurer, is the only
  Mexican page we opened that offers this cover: Howden México's Seguro Contra Crimen lists
  "Fraude de proveedores", "Transferencia de fondos" and "Ingeniería social" among the perils, and says
  the thing this whole document has been saying, that "Muchas pólizas no lo cubrirán porque el pago se
  ha realizado legítimamente: a ojos del banco, es real" [89]. That sentence is the irrevocability
  argument of this product written by somebody selling insurance, which makes it market fact rather
  than our claim. Chubb México's Seguro de Crimen Comercial does list "robo por computadora y fraude en
  la transferencia de fondos" but frames the cover around employee and contracted-third-party
  dishonesty rather than an impersonated external supplier [90]. The three wordings opened earlier in
  the day remain what they were: GNP `Cyber Safe` and Chubb `Cyber Riesgos` do not reach a transfer the
  company itself sent [63] [64], and BBVA's `Fraude Digital` for PyME excludes our loss twice, because
  ours is authorised by the client's own clerk from the bank's own portal with no OTP handed to anybody
  [65].
- **The honest weakness.** Four. **No Mexican insurer's own page sells this endorsement to a company of
  this size**, and that is a search result with a date on it rather than a conclusion: AIG, Zurich,
  Lockton and Marsh México were queried and returned nothing usable, so they are named as unverified in
  both directions and not as absent. **No carrier's own policy form with the verification condition was
  obtained**: the condition wording reached us through a court opinion summarised by defence-side
  counsel [80] and the callback framing through broker guides [82] [83], and the Travelers document is
  a marketing coverage-highlights sheet that states no sublimit and imposes no condition [81], so all
  of it is presented as broker and court characterisation of policy language and never as a published
  form. **The sublimit is the ceiling of the whole option**, USD 25,000 to USD 250,000 on the published
  range [82], so even the grown-up version of this promise is not whole-loss cover. And **article 104
  cuts against us**: an insurer that is liable for our conduct in the channel has a reason to say no,
  and nobody has said yes.

**(e) The bank-embedded route, where the institution that owns the rail reimburses.** This is the
option with the most authority behind it and the least control for us, and it is stated as a route
exactly as `docs/05-business-model.md#the-third-route-a-bank-embeds-the-control-where-the-payment-executes`
states the embed.

- **What it costs us.** Engineering inside somebody else's perimeter, a data-processing agreement under
  the LFPDPPP transfer clause in `docs/06-regulatory-privacy.md`, a security review, and the margin a
  licence fee is instead of a subscription. It costs us the reserve not at all, because the money that
  pays is the institution's.
- **What it needs legally.** From us, nothing new: the evidence is the product and the decision stays
  the payer's. From the institution, everything, because a bank reimbursing its own customer for a
  transfer the customer authorised is a commercial commitment in its own regulated perimeter, and
  nothing read for this file says what a Mexican institution may or may not offer there.
  `TODO(FabriBanda)`: counsel, and only after a bank is in the room.
- **The precedent, and it is somebody else's document.** The United Kingdom made this compulsory. Since
  7 October 2024 the sending payment service provider must reimburse a victim of authorised push
  payment fraud, the receiving provider "must, subject to the limits set out below on page 15 of this
  document, pay sending PSPs 50% of the reimbursement that the sending PSP paid to the consumer", there
  are exactly two exceptions, first-party fraud and gross negligence under what the regime calls the
  consumer standard of caution with four named requirements, reimbursement is due "within five business
  days" with a stop-the-clock, the optional claim excess is capped at GBP 100, there is no minimum
  claim value, the claim window is 13 months, the maximum level of reimbursement is GBP 85,000 for
  both Faster Payments and CHAPS, and "The new reimbursement requirement applies to APP scam payments
  executed by individuals, microenterprises, and charities" [75]. The returns are published: 88
  percent, GBP 316 million, of the money lost in scope reimbursed over eighteen months against the 61
  percent UK Finance reported for 2024, around 438,300 claims reported of which 301,500 were in scope,
  82 percent closed within five business days and 98 percent within 35 [77]. So every design choice in
  layer 2 has a named precedent in a G7 regulator's instrument: a cap, a conditions gate, a deadline
  and an excess. **What a bank like Capital One could offer on top of our evidence is a "pago
  verificado" line in its own business-banking screen**, priced by the bank, gated on the six controls
  and the CEP holder match, and settled from the institution's own balance sheet rather than from a
  startup's reserve. That is a route we would ask for, and the rule of
  `docs/12-judge-qa.md` section 7 applies unchanged: nobody at Capital One or at any other bank has
  agreed to anything, Nessie is the sandbox our code writes to, and the whole of what may be said is
  that it is the kind of bank this route is for.
- **The honest weakness.** Three, and the first one is a scope problem we volunteer before a judge
  finds it. **The United Kingdom's microenterprise is smaller than our persona**: the regime's own
  instrument defines it as fewer than ten employees with turnover or balance sheet not exceeding EUR 2
  million [76], so a company of 11 to 250 people would sit outside UK scope and the precedent is
  directional rather than identical. The regime is also not unconditionally capped and split, since the
  excess and the gross negligence exception must not be applied to vulnerable consumers [75], and the
  definitive obligations live in the regulator's legal instruments rather than in the policy statement
  we quote, which says so itself [75]. **Mexico has no equivalent.** No reimbursement right for
  authorised push payment fraud exists here, and the only adjacent measure that surfaced, the Monto
  Transaccional de Usuario becoming mandatory from January 2026, is a ceiling on transfer amounts
  rather than a right to anything and reached us only through news coverage, so it is not cited until
  the underlying circular is read. And **this route needs a counterparty we do not have**, which is the
  same reason it is third and not first.

**(f) Claim assistance, which promises effort and evidence and never recovery.** When the money is
already gone the client needs a file, fast, and the fastest official channel is legally closed to
exactly this loss. That is the finding that makes this option worth building.

- **What it costs us.** Founder hours on the worst day of a client's month, and an endpoint that
  already exists: `GET /api/v1/instructions/:id/carta` is the one-page evidence letter with the level,
  every finding and its evidence in plain Spanish, the decision, the name that signed it and the reason
  given, and `GET /api/v1/run/:id/constancia` and `GET /api/v1/sat/constancia` are the run and sweep
  documents with the SHA-256 huella of the ledger range (`docs/09-api.md`). The packet is those three
  plus the CEP, and what it costs is the hours, not the code.
- **What it needs legally.** Nothing from the insurance law, because nothing is paid. One boundary
  instead: we prepare and we accompany, we do not represent. A persona moral filing with Condusef must
  prove representation with a notarial instrument [86], which is its own lawyer's job and not ours, and
  the LPDUSF's free legal defence is means-tested, requiring the user to show it lacks the resources to
  hire a lawyer (articles 87 and 88) [87], which a solvent company will not pass.
- **The precedent, and it is somebody else's document.** Two, and the first is the one that makes the
  option urgent. **Condusef's electronic complaint channel is closed to this loss by its own published
  rules.** The portal states it cannot attend requests where "NO se acredite una relación contractual
  con la Institución Financiera" and, separately, that it cannot attend by that route complaints
  involving "más de una Institución Financiera", and that "Las causas anteriores se atenderán de manera
  personal en las Unidades de Atención correspondientes, por lo que es necesario que el Usuario acuda a
  la más cercana, para lo cual deberá programar una cita" [86]. A supplier-payment fraud is both of
  those at once, the payer's bank and the beneficiary's bank with no contract between the payer and the
  receiving institution, so the company discovers on the worst day that it needs an in-person
  appointment and a notarial power. The portal also says registering there "no constituye el inicio de
  procedimiento de conciliación", only a prior action under article 59 Bis 1 LPDUSF [86]. The statutory
  track behind it has procedural deadlines and no deadline to pay anything: eight business days for the
  Comisión to notify the institution (article 67), a conciliation hearing within twenty business days of
  receipt (article 68, fracción I Bis), two years to file (article 65), and a 3 million UDI ceiling on
  conciliation (article 68, fracción I) [87]. **Second, the clawback window is short and measured.**
  Coalition, reporting on its own 100,000-plus policyholders, writes that "When funds are stolen, the
  first 48 hours often determine whether that money is lost forever or successfully recovered in whole
  or in part", and that in 2025 it "successfully recovered $21.8 million in stolen funds on behalf of
  policyholders, with an average recovery of $202,000 per incident", over USD 158 million to date [88].
  So the honest product here is a same-hour clawback packet: the bank needs the receiving institution,
  the account and the holder name to act fast, and the signed CEP plus the timestamped ledger is
  precisely that, produced before the loss rather than reconstructed after it. The two fiscal clocks
  ride along in the same packet, the thirty days article 69-B gives anyone who gave fiscal effect to
  the comprobantes (`docs/06-regulatory-privacy.md#31-article-69-b-the-article-the-product-is-built-on`)
  [4] and the Condusef filing window above.
- **The honest weakness.** The baseline is bad and it is the reason the product exists: banks refunded
  MXN 1,265 million of the MXN 5,201 million claimed for fraud in the first quarter of 2026, **24.3
  percent, about one peso in four** [18]. And **we have no measurement at all of how much better
  evidence makes that ratio.** Nobody publishes a recovery rate conditioned on the quality of the file,
  Condusef publishes no reimbursement timeline, no payment obligation and no outcome statistics
  specific to personas morales, and Coalition's own figures carry a disclaimer on the page that the
  scenarios and outcomes are illustrative and not guarantees. So the promise is file quality and speed
  and it is never a recovery rate, and the sentence to say at the table is that one peso in four comes
  back today and we do not know what our file changes about that. Two more limits on the same page:
  Coalition's numbers are its own policyholders in a different market, and its own report says 20
  percent of funds transfer fraud events came from instructions sent straight to banks with no employee
  interaction and 39 percent happened with no confirmed email compromise [88], which is the honest
  bound on the six controls generally. We answer for the payer-side release decision and not for every
  path the money can take.

**(g) For the opposite error: priority verification, and the credit when we miss it.** Layer 4 bounds
the delay and prices it. The option that goes further is a service level on the beginning of the
verification rather than on its end.

- **The proposal.** A line the payment owner marks urgent jumps the verification queue: the one-centavo
  probe and the supplier call are attempted first, inside a published window measured from the moment
  the mark is set, and if the window passes with neither attempted the month is credited. That is a
  promise about our own work, which is the cheapest kind of promise to keep and the easiest to check.
  It sits on top of the two parts that already exist, the bound and the release: `HOLD_WINDOW_DAYS` in
  `packages/core/src/hold.ts` is `EXPECTED_DELAY_DAYS` from `decision.ts`, three days for a hold and one
  for a verification measured from `Decision.decidedAt`, so the delay the expected-loss arithmetic
  charged for and the deadline the clerk is promised cannot drift apart; and
  `POST /api/v1/instructions/:id/decide` with `decidedBy` and `reason` lets the owner end it at any
  moment under their own name, which `holdWindow` offers from the first screen rather than hiding.
- **What it costs us.** The credit when we miss, capped at one month of the tier's subscription per
  event and two per rolling twelve months, which is the cap layer 4 already priced: MXN 899 and MXN
  1,798 on the direct tier, MXN 195 and MXN 390 through a firm, taking gross margin to MXN 595.27 and
  66 percent direct and MXN 79.00 and 41 percent on the channel in the worst case. The delay credit
  itself is unchanged, the whole days the payment actually sat times that supplier's
  `delayCostPerDay`, priced per supplier in `packages/seed/src/sentryone/delay-cost.ts` from MXN 101.98
  to MXN 4,611.27 across the 44 suppliers of the demo company, median MXN 353.13.
- **What it needs legally.** The same shape as layer 4 and for the same reason: it is a credit against
  our own next invoice, computed from a number we published ourselves, with no proof of loss asked.
  Returning our own consideration is a price remedy, while paying against evidence of a lost sale is
  resarcir un daño, which is the verb article 20 uses [62].
- **The precedent, and it is somebody else's document.** A regulator set exactly this kind of clock on
  the other side of the same transaction and firms meet it: reimbursement within five business days
  under the United Kingdom's requirement [75], with 82 percent of claims actually closed inside it and
  98 percent within 35 business days [77]. A published deadline with a consequence attached is
  therefore an operable design and not an aspiration, which is the only thing this precedent is being
  asked to prove.
- **The honest weakness.** Three, and the first is a product gap. **There is no urgent flag in the
  domain today.** `packages/core/src/domain.ts` and `hold.ts` discuss the urgent payment in their own
  comments and carry no field for it, so the mark this option turns on does not exist and the SLA
  cannot be sold before it does. **The queue behind it is a founder and not a rota**, which is
  honest at 300 companies and not at 3,000, and the support cost line of MXN 60 per company per month
  does not carry a paging rota. And **no SLA can make a supplier answer the telephone**, which is the
  answer already written in `docs/12-judge-qa.md` section 5a: what we can promise is that the cent and
  the call were attempted first and on time, never that somebody picked up.

**(h) The legal floor, which is the only option that is not optional.** Everything above sits on one
contract clause and one product fact.

- **The clause.** Aggregate liability capped at the fees paid in the preceding twelve months, MXN
  10,788 on the direct tier and MXN 2,340 per client company through a firm, stated once and applying
  to every layer above rather than separately inside each.
- **The product fact.** The last act is a person's. `Decision.decidedBy` and `Decision.reason` carry
  the name and the argument, ADR-0002 puts the decision with the payer, and the engine's own signature
  `SYSTEM_DECIDER` is distinguishable in the ledger from a human release, which is what makes the
  override carve-out checkable instead of arguable.
- **What it costs us.** Nothing, and it is what makes the rest affordable.
- **What it needs legally.** Counsel, and a narrower claim than the team has been making. The one
  enforceability fact in hand is the one that cuts against a badly drafted guarantee rather than for a
  well drafted cap: article 24 of the Ley de Instituciones de Seguros y de Fianzas says contracts
  concluded against article 20 "no producirán efecto legal alguno" [62], so a promise written as
  indemnity is worth nothing to the client who relied on it. **What a Mexican court would look at when
  asked to enforce or to set aside a liability cap in a business-to-business contract of adhesion is
  not answered by anything read for this file**, and it is not guessed at here. No civil code, no
  consumer statute and no judicial criterion on limitation-of-liability clauses was opened.
  `TODO(FabriBanda)`: counsel, with the article 20 consulta, and until then the cap is a proposal in a
  document and not a clause in a contract.
- **The precedent, and it is somebody else's document.** The local baseline is lower than our floor,
  which is the useful thing to say. nsKnox's own site terms cap its cumulative liability at "AMOUNTS
  PAID BY YOU TO THE COMPANY FOR USE OF THE SITE" [59], and Verificamex, the Mexican comparable, has
  the user grant it "el más amplio deslinde de responsabilidad que en derecho proceda" and lists among
  the consequences of inadequate information "daños, pérdidas y/o perjuicios ocasionados al Usuario,
  los cuales no serán reclamables" [61]. A cap at twelve months of fees is therefore above the Mexican
  market's own floor rather than a retreat from it.
- **The honest weakness.** A cap is a cap. MXN 10,788 against a misdirected SPEI of MXN 100,000 is
  10.8 percent of it, the arithmetic layer 2 already prints, and no amount of drafting changes that.
  The only thing that closes the gap is (d).

### The one we would defend

**Today, and it is four layers and not one: (a), (b), (c) and (g).** The guarantee attaches by evidence
depth rather than by price, so the gate is the incentive; its trigger is written as a predicate over
the ledger with the Banxico-signed CEP as the index and not our own record; it is funded by a 10
percent reserve whose break-even claim rate is 10.0 events per 100 companies a year against INEGI's
published 5.22, with an aggregate annual cap disclosed in the contract; and the opposite error is
answered in the same breath by the three-day bound, the release under a name, the priority-verification
SLA and the delay credit on `delayCostPerDay`. Add (f) as the thing that ships with it, because the
packet costs us hours rather than pesos and the client needs it on the one day nothing else helps.
Add (h) under all of them, because it is the floor and not a layer.

**Within twelve months of paying customers, (d) as a partnership.** An authorised insurer underwrites
funds transfer fraud and social engineering, SentryOne is the evidence and the article 102 channel with
its services contract registered with the CNSF and its operations under CNSF inspection, and we are
never the underwriter because article 495 puts that on the founders personally. The pitch to the
insurer is not distribution, it is that the condition precedent their own wordings already require, an
"established and documented verification procedure" [80], is a thing we produce automatically per
payment, and a real claim went to discovery because the buyer could not evidence one.

**And (e) as the bank route, asked for and not claimed.** The United Kingdom already made the shape
compulsory, so the argument to an institution is not speculative: a capped reimbursement split between
the sending and receiving firm, gated on a standard of care, with a five business day deadline, has
been in force since 7 October 2024 and an independent evaluation found fraud fell rather than rose
[75] [78]. Mexico has no such duty, which is the gap, and the bank that owns the rail is the only party
that can close it on its own balance sheet.

**Ranked honestly, (d) is the strongest option and (c) is the one we can do this week.** That is the
whole answer to the panel's question, and the reason the menu is in this file rather than in a slide is
that a judge should be able to push on any one of the eight and get arithmetic or a document back.

### Why any of this is credible at three in the afternoon of a hackathon

- **The evaluation is labelled independently of the control source.** Thirty-five labelled cases, 87.0
  percent precision, 83.3 percent recall, 1.6 percent false positives, and the engine chose the labelled
  action in 33 of 35, from `scripts/eval.ts` and `GET /api/v1/metrics` as reported in
  `docs/12-judge-qa.md`. Read the level matrix beside it, because that is the view a clerk gets:
  `confiable` is right on twelve of twelve, which is the row a guarantee actually rides on, since a line
  the product called trustworthy and that was not is the only error this commitment pays for. Synthetic
  cases, and we say so, and `docs/12-judge-qa.md` is precise about how blind it is: the controls were
  merged before the labels were written, and what holds the number up is that no case was edited to make
  a control pass. A commitment priced on numbers the promiser also wrote would be worth nothing.
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

References [1], [2], [3], [4], [5], [6], [7], [8], [12], [14], [15], [18], [24], [26], [28], [29],
[31], [35], [36], [42], [43] and [48] are the numbered list in `docs/04-market.md#sources`, all opened
on 2026-09-12. Sources 13, 49 to 66 and 75 to 91 are used only here and continue that same numbering,
so that one number means one document across both files. The block from 75 is the guarantee menu, read
on 2026-09-12 in the evening, and two of its entries correct earlier ones rather than argue with them:
[79] supersedes the sentence in [60] that said nothing could be attributed to Eftsure, and [89] is the
first Mexican page found that offers cover for this loss, which [63] to [66] could not.

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
60. Eftsure, the afternoon attempt, kept as the record of what failed and **superseded by [79]**.
    `https://www.eftsure.com/` answered HTTP 302 to itself until the client gave up after 50
    redirects, on 2026-09-12 at 19:40 local, so no terms page could be opened. The page that did
    answer 200 that day, <https://home.eftsure.com.au/payment-fraud>, contains no occurrence of
    guarantee, warranty, liability or indemnity. The sentence this entry carried, that nothing in this
    file is attributed to Eftsure, is no longer true: the redirect loop was a region cookie and the
    guarantee page opened later the same day, which is [79]. The failure is left here because a
    retrieval that failed for a fixable reason is a fact about our client and not about the publisher.
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
75. Payment Systems Regulator, *PS25/5 APP scams reimbursement requirement: consolidated policy
    statement*, May 2025, 530,263 bytes. In force since 7 October 2024 (paragraphs 1.1, 3.7 and 3.61,
    CHAPS the same date). Policy 2, the receiving PSP "must, subject to the limits set out below on
    page 15 of this document, pay sending PSPs 50% of the reimbursement that the sending PSP paid to
    the consumer". Policy 3 and paragraph 3.40, two exceptions only, first-party fraud and gross
    negligence, the latter "known as the consumer standard of caution exception", whose four named
    requirements are in paragraphs 3.41 and 3.42, regard to interventions, prompt reporting,
    information sharing and police reporting. Policy 4, five business days with a stop-the-clock.
    Policy 5, optional claim excess capped at GBP 100. Policy 6, "There is no separate minimum value
    threshold". Policy 7, maximum reimbursement GBP 85,000 for Faster Payments and for CHAPS. Policy 8,
    claims no later than 13 months after the final payment. Policy 9, neither the excess nor the gross
    negligence exception may be applied to vulnerable consumers. Paragraph 3.10, the requirement
    "applies to APP scam payments executed by individuals, microenterprises, and charities". Two
    caveats the document states about itself and that are carried wherever it is cited: it is general
    guidance and paragraph 1.3 says "our definitive requirements are set out in our legal instruments
    ... If any of the contents of this document vary ... the latter two prevail", and the obligation
    itself rides on specific directions and requirements plus the Faster Payments and CHAPS
    reimbursement rules rather than on this PDF. Accessed 2026-09-12:
    <https://www.psr.org.uk/media/rhelv4op/ps25-5-app-scams-reimbursement-consolidated-policy-statement-may-2025.pdf>
76. Payment Systems Regulator, *Amended Specific Requirement 1*, July 2024 (corrected). The definition
    of microenterprise the reimbursement requirement uses, fewer than ten employees with annual
    turnover or balance sheet total not exceeding EUR 2 million, which is the reason our 11 to 250
    person persona would sit outside the United Kingdom's scope. Accessed 2026-09-12:
    <https://www.psr.org.uk/media/xenefhgp/amended-specific-requirement-1-july-2024-corrected.pdf>
77. Payment Systems Regulator, *APP scams reimbursement dashboard for Q1 2026*, page updated 30 July
    2026, built on Pay.UK data collected under Specific Direction 20. Over the eighteen months from 7
    October 2024 to 31 March 2026: "88% (£316m) of the money lost to APP scams has been reimbursed to
    victims", against a 61 percent rate the page labels indicative, "Consumers have reported around
    438,300 claims; 301,500 were in scope for reimbursement", "82% of claims were closed within five
    business days - and 98% within 35 business days", and "3% of claims were rejected due to the
    customer not taking enough care over the transaction or their claim". Three scope facts the page
    states about itself: the 88 percent is measured on in-scope claim value and not on all money lost
    to all APP scams, the data covers UK Faster Payments only and excludes "on us" transfers, and the
    UK Finance comparison uses a different definition and scope. The 3 percent is the trailing
    eighteen-month average and Q1 2026 alone was about 2 percent. Accessed 2026-09-12:
    <https://www.psr.org.uk/information-for-consumers/app-scams-reimbursement-dashboard/>
78. Payment Systems Regulator, *Payment fraud falls by £73m following PSR reimbursement scheme*, 1 July
    2026, the regulator's own publication of an independent evaluation by Frontier Economics. "APP
    fraud losses have fallen by an estimated £73 million per year and the number of APP scams have
    fallen by nearly 35,000 due to the policy", "Reimbursement rates for all claims have risen from 54%
    to 65%, and for claims in-scope of the policy, firms are now reimbursing 97%", "the policy is
    delivering a positive short term net benefit of £17m-£29m, which they consider a conservative
    assessment of its overall impact", and "There is no evidence of market exits or reckless consumer
    behaviour, which some had predicted would be a consequence of the policy". The figures originate in
    the Frontier Economics report the page links, and the net benefit is explicitly a short-term figure
    net of increased PSP costs. Accessed 2026-09-12:
    <https://www.psr.org.uk/news-and-updates/latest-news/news/payment-fraud-falls-by-73m-following-psr-reimbursement-scheme/>
79. Eftsure, *Eftsure Guarantee*, the US product page, opened on 2026-09-12 in the evening after the
    region redirect in [60] was passed a `region-redirected=1` cookie, HTTP 200, 321,872 bytes, title
    "Eftsure Guarantee | Eftsure US". "Eftsure's service helps prevent payment fraud through multiple
    verification layers, but even with these layers, absolute zero-risk environments can't be promised.
    Eftsure's Guarantee provides indemnity of up to $1 million against payment fraud losses caused by
    social engineering fraud." The FAQ answers that it is "included with your subscription for all
    customers who signed a customer agreement after the 10th March 2025", that Eftsure matches routing
    number and account number to the vendor's business name and "When we find a positive match and
    identify no issues, we provide customers with a 'green thumb' of approval. Payments made to
    suppliers verified by Eftsure are covered by our guarantee", that the cover is social engineering
    fraud only, and that "By including this transfer of liability in our agreements, we aim to give our
    customers greater peace of mind", citing "over a decade of experience and a proven track record of
    safeguarding $288 billion annually" as grounds for confidence rather than as the basis for sizing
    the cap. A footnote makes it "Subject to Eftsure's standard terms of service and service
    addendums", and the scope is "eligible domestic and international payments" that "meet the
    criteria". Neither figure carries a currency code on the page; it is the US site, with a Dallas
    office listed, so dollars is read from context and no conversion to pesos is made anywhere in this
    file. No terms of service or service addendum was opened, so the conditions and exclusions are
    named as unpublished rather than described:
    <https://www.eftsure.com/guarantee/>
80. Alex Cogbill and Jane Warring, Zelle LLP, *Further Clarity Regarding Coverage for Funds Transfer
    Fraud*, 31 March 2025, on the authoring firm's own site. Reports Abraham Linc Corp. v. Spinnaker
    Ins. Co., 1:23-cv-98, 2024 WL 3433661 (N.D. West Virginia, 16 July 2024): a cyber policy carrying
    "both a $2,000,000 Computer and Funds Transfer Fraud Endorsement and a $100,000 Social Engineering
    Incident Endorsement", losses above the smaller sublimit, the court concluding social engineering
    alone did not trigger the larger endorsement because the hackers reached the supplier's email
    system rather than the insured's and authorised employees made the transfers, and on the smaller
    one requesting discovery on a condition precedent quoted in the article's footnote 4, "As a
    condition precedent to coverage, the Insured's established and documented verification procedure
    must have been followed before acting upon such instruction", where "the policyholder had no
    documented procedure or protocol" and relied on an "unwritten protocol" of email, contending "calls
    were impractical because the vendor worked in a different time zone". The case "settled a few
    months after the court's ruling". This is secondary commentary by defence-side insurance counsel
    quoting the policy and citing the docket, not the opinion itself, and it is cited as a
    characterisation of policy language for that reason. Accessed 2026-09-12:
    <https://www.zellelaw.com/Further_Clarity_Regarding_Coverage_for_Funds_Transfer_Fraud>
81. Travelers Casualty and Surety Company of America, *Social Engineering Fraud Endorsement, Coverage
    Highlights*, CP-8697 Rev.10-16, copyright 2016, 329,661 bytes. "In many cases, the fraudster has
    infiltrated an email conversation and has been able to obtain a copy of a signature section to make
    the fraudulent message appear even more legitimate. Some messages even amend phone numbers in the
    email panel, so a call back to a phone number is directed to the fraudster, who will of course
    verify the information." The document sets out **three** claim scenarios, not two, and the two this
    file uses are the first and the third: a retailer that updated its accounts payable on an email
    purportedly from its supplier providing revised bank account information, the supplier's email
    system having been hacked, and a manufacturer employee who wired funds on a CFO-impersonation email
    and discovered the fraud the next day. The second, between them, is a law-firm attorney wiring
    trust-account funds on a fraudulent email. It is a marketing coverage-highlights sheet: it states
    no sublimit, imposes no verification condition, and never mentions this product. Accessed
    2026-09-12:
    <https://www.travelers.com/iw-documents/professional-liability-insurance/CP-8697-social-engineering-fraud.pdf>
82. Isabelle M. Chammas and Amy H. Wooten, Ward and Smith, P.A., *Social Engineering Fraud and Your
    Crime Policy: Why Your Insurer May Deny the Claim and What You Can Do About It*, 7 July 2026, on
    the authoring firm's own site. "Many social engineering endorsements carry sublimits that are far
    lower than the crime policy's overall limit. Common ranges are between $25,000 and $250,000."
    "Some endorsements condition coverage on the policyholder having followed specified verification
    procedures before processing the transfer, like calling back a known phone number to confirm the
    request, requiring dual authorization for transfers above a specified amount, or verifying changes
    to vendor banking information through an independent channel. If the policyholder did not follow
    these procedures, the insurer may deny the claim." And, under "Implement and Document Verification
    Procedures", "Even if your crime or cyber policies' social engineering endorsement does not
    explicitly require verification procedures, implementing them is both a sound business practice and
    a defense against an insurer's argument that the loss was avoidable." A law firm's characterisation
    of a market, not a carrier's form. Accessed 2026-09-12:
    <https://www.wardandsmith.com/article/social-engineering-fraud-and-your-crime-policy-why-your-insurer-may-deny-the-claim-and-what-you-can-do-about-it>
83. Brown and Brown, *The Ins and Outs of Social Engineering Coverage*, 7 October 2024: "Coverage is
    typically limited or excluded if a phone call is not made when a policy has such a requirement." A
    broker's description of policy behaviour, cited as that. Accessed 2026-09-12:
    <https://us.bbrown.com/blog/the-ins-and-outs-of-social-engineering-coverage>
84. Denise Garcia Ocampo and Carlos Lopez Moreira, *Uncertain waters: can parametric insurance help
    bridge NatCat protection gaps?*, FSI Insights on policy implementation No 62, Bank for
    International Settlements Financial Stability Institute and IAIS Secretariat, December 2024, ISBN
    978-92-9259-804-4, 832 KB, hosted by the IAIS. Paragraph 17 sets out the three design elements, the
    parameter or index, the trigger and the payout structure. Table 1 defines the index as an
    "Objective measure that is both reported by an independent third party (neither the insured nor
    insurer) and correlated to the insured financial loss", whose "key criteria ... are that: it is
    fortuitous; it can be readily available from an independent reporting agency; and it can be
    modelled", and the trigger as the "Index threshold that determines the payout". Paragraph 20 gives
    the two classification criteria, demonstrate insurable interest and prove risk transfer, and
    footnote 25 adds a third for hybrid products, "the requirement to provide a proof of loss".
    Paragraph 27 names the central limitation: "the risk that the payout may not fully match the
    insured's actual losses, a concept known as basis risk". Two things the paper says about itself and
    that are carried wherever it is cited: the views "are solely those of the authors and do not
    necessarily reflect those of the BIS, the IAIS or the Basel-based committees", and the definitions
    are descriptive, drawn from Sengupta and Kousky (2020) and Swiss Re Corporate Solutions (2024),
    rather than supervisory requirements. Accessed 2026-09-12:
    <https://www.iais.org/uploads/2024/12/FSI-IAIS-Insights-on-parametric-insurance.pdf>
85. Swiss Re Corporate Solutions, *What is parametric insurance?*, the same definition of the index as
    "any objective measure that is both reported by an independent third party (neither the insured nor
    insurer)" and the commercial claim that parametric solutions eliminate "all complexity of a loss
    investigation process". Accessed 2026-09-12:
    <https://corporatesolutions.swissre.com/insights/knowledge/what_is_parametric_insurance.html>
86. CONDUSEF, *Portal de Queja Electrónica*, the pre-registration page and the portal's landing page,
    on the Comisión's own domain. The pre-registration page, 176 KB: "Es importante señalar que
    Condusef no podrá atender las solicitudes en las que: ... NO se acredite una relación contractual
    con la Institución Financiera"; "Así mismo, no se podrá atender por este medio, quejas que
    correspondan a productos financieros o situaciones que: Involucren más de una Institución
    Financiera."; "Las causas anteriores se atenderán de manera personal en las Unidades de Atención
    correspondientes, por lo que es necesario que el Usuario acuda a la más cercana, para lo cual
    deberá programar una cita a través del Centro de Contacto y Atención por Medios Remotos CCAMER";
    and, for a company, "Para llevar a cabo una Queja Electrónica como "Persona Moral", deberá de
    acreditar la representación de esta con el instrumento notarial correspondiente". The landing page
    carries the `Fundamento legal` block: registering there "no constituye el inicio de procedimiento
    de conciliación contenido en Título Quinto de la Ley de Protección y Defensa al Usuario de
    Servicios Financieros, sino una acción previa tendiente a resolver la controversia que se plantee",
    under article 59 Bis 1 LPDUSF. The reading that a supplier-payment fraud falls under both
    exclusions at once is ours, applied to the published rules, and is labelled as such where it is
    used. Accessed 2026-09-12: <https://tramites.condusef.gob.mx/QuejaElectronica/registro.php?ban=true>,
    <https://tramites.condusef.gob.mx/QuejaElectronica/index.php>
87. *Ley de Protección y Defensa al Usuario de Servicios Financieros*, articles 59 Bis 1, 65, 67, 68
    fracción I and I Bis, 87 and 88: the prior action the portal in [86] is, two years to file, eight
    business days for the Comisión to notify the institution, a conciliation hearing within twenty
    business days of receipt, a 3 million UDI ceiling on conciliation, and the means test for free
    legal defence under which the user must show it lacks the resources to hire a lawyer. No article of
    it obliges anybody to pay a fraud loss or sets a deadline to do so. Accessed 2026-09-12:
    <https://www.diputados.gob.mx/LeyesBiblio/pdf/LPDUSF.pdf>
88. Robert Jones, Coalition, *5 Essential Insights From Our 2026 Cyber Claims Report*, 5 March 2026,
    the company's own blog announcing its own report, "derived from our analysis of Coalition's
    100,000+ global policyholders and real-world claims". "20% of all funds transfer fraud (FTF) events
    were driven by fraudulent instructions sent directly to banks, bypassing employee interaction
    entirely. Perhaps even more surprising: 39% of FTF events occurred without any confirmed email
    compromise." "When funds are stolen, the first 48 hours often determine whether that money is lost
    forever or successfully recovered in whole or in part. In 2025, Coalition successfully recovered
    $21.8 million in stolen funds on behalf of policyholders, with an average recovery of $202,000 per
    incident", and "we've clawed back over $158 million to date". "In 2025, 64% of closed claims were
    resolved with zero out-of-pocket loss for the policyholder." The page footnotes the 64 percent and
    the USD 158 million as illustrative, not guarantees of future outcomes or coverage determinations.
    The full report PDF was not opened, so no figure from it is used here, including the USD 141,000
    average FTF loss that appears in syndicated coverage. Accessed 2026-09-12:
    <https://www.coalitioninc.com/blog/cyber-insurance/2026-cyber-claims-report>
89. Howden México, *Seguro Contra Crimen*, the broker's own Mexican product page, footer "Copyright
    2026 | Howden México". Under "Proteger contra una amplia variedad de delitos y modus operandi" it
    lists Malversación de fondos, Falsificación, **Fraude de proveedores**, En tránsito, Fraude de
    falsificación de moneda, Fraude con tarjeta de crédito, **Transferencia de fondos**, Robo, Estafas
    en línea/fraude informático, Phishing and **Ingeniería social**. Under the heading "Muchas pólizas
    no incluyen la cobertura de ingeniería social": "Por ejemplo, un delincuente puede utilizar el
    engaño para manipular a un empleado para que realice un pago de tu empresa a una cuenta en un
    paraíso fiscal. Muchos compradores piensan que eso nunca les ocurrirá. Pero ocurre, y con
    frecuencia. Muchas pólizas no lo cubrirán porque el pago se ha realizado legítimamente: a ojos del
    banco, es real. Podemos asegurarnos de que esté cubierto." This is a broker's page and not an
    insurer's, no price, sum insured or wording is published on it, and that distinction is kept
    wherever it is cited. Accessed 2026-09-12:
    <https://www.howdengroup.com/mx-es/seguro/contra-crimen>
90. Chubb México, *Seguro de Crimen Comercial*, a different page from the `Cyber Riesgos` one in [64].
    It does list "robo por computadora y fraude en la transferencia de fondos" among the covers and
    frames the product around the dishonesty of employees and of contracted third parties rather than
    around an impersonated external supplier, which is the distinction that matters to this file.
    Accessed 2026-09-12: <https://www.chubb.com/mx-es/empresas/seguro-de-crimen-comercial.html>
91. Ramp, *Bill Pay Fraud*, the vendor's own support page, read as the counter-example to [79]. It
    instructs the customer to "double-check with your vendor through a separate communication channel",
    on a channel other than the one the instructions arrived on, and records an audit log naming the
    user who dismissed a high-severity alert. Ramp publishes no guarantee or indemnity, and neither do
    Tipalti, Bill.com, Melio or Brex, on anything we could open on 2026-09-12. Medius and nsKnox were
    searched and no guarantee page surfaced, which is recorded as unverified rather than as absent.
    Accessed 2026-09-12: <https://support.ramp.com/bill-pay-fraud>

Our own prices, the cost estimates and the channel plan are decisions, not findings. Each one is
labelled above as a price, an estimate or an assumption, so a judge can disagree with a specific
cell instead of with the method. The two conversion rates in the GTM section, 1 in 3 to a sweep and 1
in 4 to a paying company, are the two assumptions with nothing at all behind them. They are the first
two things the first ten accounts will falsify, and the stop condition is deliberately written against
the hit rate rather than against either of them, because the hit rate is the one a month of work can
actually measure. The four-layer guarantee and the eight-option menu behind it are the newest of these
decisions and the only ones with a legal question still open on them, which is why every part of both
says out loud which stage it is at, and why the menu prints the arithmetic of the reserve rather than
asserting that it holds. Two of those options end in a routed question instead of an answer: whether a
company in our position may buy a stop-loss on its own reserve at all, and what a Mexican court would
look at when asked to enforce or set aside a liability cap in a business-to-business contract of
adhesion. Neither is guessed at here, and both carry `TODO(FabriBanda)` to counsel.
