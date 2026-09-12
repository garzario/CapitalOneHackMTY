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

References [2], [3], [4], [7], [8] and [12] are the numbered list in `docs/04-market.md#sources`,
all opened on 2026-09-12. One source is used only here:

13. CONASAMI, *Tabla de Salarios Mínimos 2026*, in force from 1 January 2026. General zone MXN
    315.04 per day, northern border free zone MXN 440.87, profession 51 `Secretario(a) auxiliar` MXN
    374.60 and MXN 440.87. Accessed 2026-09-12:
    <https://www.gob.mx/cms/uploads/attachment/file/1041076/Tabla_de_Salarios_M_nimos_2026.pdf>

Our own prices, the cost estimates and the channel plan are decisions, not findings. Each one is
labelled above as a price, an estimate or an assumption, so a judge can disagree with a specific
cell instead of with the method.
