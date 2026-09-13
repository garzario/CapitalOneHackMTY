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

References [1], [2], [3], [4], [5], [6], [7], [8], [12], [24], [26], [28], [29], [31], [42], [43] and
[48] are the numbered list in `docs/04-market.md#sources`, all opened on 2026-09-12. Sources 13 and 49
to 56 are used only here and number into that same list:

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

Our own prices, the cost estimates and the channel plan are decisions, not findings. Each one is
labelled above as a price, an estimate or an assumption, so a judge can disagree with a specific
cell instead of with the method. The two conversion rates in the GTM section, 1 in 3 to a sweep and 1
in 4 to a paying company, are the two assumptions with nothing at all behind them. They are the first
two things the first ten accounts will falsify, and the stop condition is deliberately written against
the hit rate rather than against either of them, because the hit rate is the one a month of work can
actually measure.
