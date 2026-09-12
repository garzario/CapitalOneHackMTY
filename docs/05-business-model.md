# 05. Business model and go to market

Worth 15 points: substantiated business model (10) and adoption strategy (5). "Substantiated"
means the price is anchored to something the buyer already pays, and the margin is computed, not
asserted.

Owner: Fabricio (`FabriBanda`). Due M2.

## Who pays, and why that number

TODO(FabriBanda): one paragraph. Name the payer, the price, and the substitute spend the price is
anchored against. The anchor is the argument: an hourly cost of the person doing this by hand, a
fee already paid per transaction, a loss already absorbed per cycle, a licence already renewed. A
price with no anchor is a guess and a judge will say so.

Never state a competitor's price unless it is published. Write "not published" instead.

## Revenue lines

Rank by credibility for this team and this product, and say which one is the wedge.

| Line | Mechanism | Why it fits | Credibility |
|---|---|---|---|
| SaaS subscription | Per company per month, tiered by volume | Predictable, simple to explain in a demo | TODO(FabriBanda) |
| Per-transaction basis points | A few bps on value screened, netted or reconciled | Aligns price with value delivered | TODO(FabriBanda) |
| Lead generation to a regulated lender | Qualified, consented referral of a financing need we can already evidence | We never touch the credit decision, so no licence is needed | TODO(FabriBanda) |
| White-label licence to a financial institution | The institution embeds it for its existing SMB book | Distribution already exists, the compliance perimeter is theirs | TODO(FabriBanda) |

TODO(garzario): the B2B2C white-label path is the most defensible of the four for this team,
because the institution already holds the licence and the client relationship. Decide whether it is
the headline model or the year-two expansion, and write one sentence either way.

## Unit economics

TODO(FabriBanda): fill with real numbers at M3, after the LLM cost table in
`docs/06-regulatory-privacy.md` is stamped with live prices. Keep the rows even if a value is an
estimate, and label estimates.

| Line | Per paying account per month | Note |
|---|---|---|
| Revenue | TODO | |
| Infrastructure cost | TODO | Database plus hosting, divided by accounts |
| LLM cost | TODO | From the formula in `docs/06`. The hot path has no inference, so this is explanations plus summaries only |
| Support and ops cost | TODO | Honest even if it is one founder's time |
| **Gross margin** | TODO | Revenue minus the three cost lines, as a percentage |

## CAC, LTV, payback

| Metric | Value | How it was derived |
|---|---|---|
| CAC, channel 1 | TODO(FabriBanda) | |
| CAC, channel 2 | TODO(FabriBanda) | |
| Average contract length | TODO(FabriBanda) | |
| LTV | TODO(FabriBanda) | gross margin per month x expected months |
| Payback | TODO(FabriBanda) | CAC divided by gross margin per month, in months |

A payback figure in months is the single most persuasive number in this document, because it is the
one a product judge checks first.

## GTM in three steps

TODO(FabriBanda): three concrete steps, each with a named beachhead **category** and no invented
partner names. Categories that are real and citable: one chamber of commerce or industrial cluster
association, one Sofipo or regional bank, one university incubator, one vertical software vendor
whose customers are already our persona. Naming a category is credible. Naming a company that has
not agreed to anything is a fabricated endorsement and is banned.

1. **Beachhead.** Which category, why them first, how we reach the first ten.
2. **Expansion.** The adjacent segment the first ten unlock, and the mechanism.
3. **Channel.** The partner category that makes acquisition cheaper than direct sales, and what
   they get out of it.

## Twelve months after the hackathon

TODO(FabriBanda): four bullets. One product milestone, one customer-count milestone, one
compliance or partnership milestone, and the thing that would make us stop. Including a stop
condition reads as judgment, not pessimism.

## Why this wedge and not the obvious one

TODO(FabriBanda): one paragraph. The obvious version of this product is the one four other teams in
the room are building. Say what it is, say why it loses, and say what our wedge has that it does
not. This paragraph is doing double duty, because it also feeds row 1 of
`docs/01-rubric-mapping.md`.
