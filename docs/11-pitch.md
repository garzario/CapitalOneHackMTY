# 11. Pitch

Worth 6 points. Three timed variants, written in the actual words. The 90-second one is the one we
use most, because continuous evaluation means many walk-ups and one stage slot.

Owner: Patricio (`garzario`), drafted for the team to validate. Issue #56. Due M3.

**Every version opens with the fiscal hook**, per the binding narrative rules in ADR-0002: paying a
supplier the SAT has listed under Article 69-B voids the deductions retroactively, and a SPEI never
comes back. We never open with "they changed their bank account on me". That is one signal out of
six, and it is the story every anti-fraud demo tells.

TODO(garzario) verify both halves of the hook at their primary sources before the first rehearsal:
the retroactive effect and its correction window in the CFF Article 69-B text, and the finality of
an executed SPEI in Banxico's published rules. Write the citations into `docs/04-market.md`. If a
citation is not there by M3, the line stays but it is said as the mechanism rather than as a
quantified claim.

## Slide order, with the actual words

| # | Slide | What is on it | What is said |
|---|---|---|---|
| 1 | Hook | Two lines of text, nothing else | "Two things are true about paying a supplier in Mexico. If that supplier is listed under Article 69-B, the deductions you already took are voided retroactively. And once a SPEI is sent, it is final." |
| 2 | The persona | Lupita, the Thursday run | "This is the person who decides. The only administrative clerk at a 28-person metalworking shop in Apodaca, seventy to a hundred and ten transfers on a Thursday, no ERP, no validation module, no second pair of eyes." |
| 3 | The product | One line, the payment-run screen | "Ceptinela reads the invoices she already has and, at the moment she pays, tells her which payments to hold, which to verify and which to release." |
| 4 | Live demo | The product | `docs/10-demo-script.md` |
| 5 | How it works | The four-lane diagram from `docs/07` | "Three sources nobody joins: her own CFDI ledger, the official SAT list, and the receipt Banxico signs for every SPEI. Six independent detectors, one expected-loss decision, and no model anywhere in that path." |
| 6 | Why us, why different | The competitor row | "The bank knows the account but not the invoice. The accountant knows the invoice but sees it next month. The ERP she does not have would know both and would still not check the list. We are the only thing that joins them before the money is irrevocable." TODO(FabriBanda) confirm this row against the competitor map in `docs/04-market.md` |
| 7 | Market | The sizing table with the formula column | Bottom-up arithmetic, spoken. TODO(FabriBanda) |
| 8 | Business model | Price, anchor, payback | Who pays and why that number. TODO(FabriBanda) |
| 9 | Regulation | The framework map in four lines | "We are not a regulated entity. We hold no funds, we execute no transfer, and nothing is declined without a person. We read documents the client already owns, before an irreversible step." |
| 10 | The ask | One sentence | "We want ten payment runs in front of us next week, in real companies, to measure the false-positive rate on data we did not generate." |

## 60 seconds, the hallway version

> Two things are true about paying a supplier in Mexico. If that supplier ends up on the SAT's
> Article 69-B list, the deductions you already took on its invoices are voided retroactively. And
> once a SPEI leaves, it is final, there is no chargeback.
>
> The person who lives with both of those is the only administrative clerk at a 28-person
> metalworking shop in Apodaca. Thursday, between seventy and a hundred and ten transfers, before
> the bank cutoff, with a spreadsheet, WhatsApp and the bank portal.
>
> Ceptinela joins three things at the moment she pays: her own invoice ledger, the official SAT
> list, and the receipt Banxico signs for every SPEI. Each payment comes back hold, verify or
> release, with the reason on screen, and a person decides.
>
> The check is public and free, and nobody runs it weekly. We run it on every payment, before the
> money is gone.

Then stop talking. About 160 words.

## 90 seconds, a judge walking up

This is the one to memorise.

> **(20 s, persona and trigger.)** Thursday morning, a metalworking shop in Apodaca, 28 employees.
> One person does the whole back office, and today she has to send between seventy and a hundred and
> ten transfers before the bank cutoff. She has a spreadsheet, WhatsApp and the bank portal. No ERP,
> so no supplier validation, no maker-checker, nobody to sign off but the owner, who is on the floor.
>
> **(20 s, the moment.)** Two things can go wrong and neither is recoverable. If a supplier is on the
> SAT's Article 69-B list, the deductions she already took are voided retroactively. And if the
> account is wrong, the SPEI is final. Ceptinela sits exactly in the minutes before she clicks send.
> The run arrives sorted by pesos at risk, and each payment says hold, verify or release with its
> evidence.
>
> **(25 s, the mechanism.)** It joins three sources nobody joins: the company's own CFDI ledger, the
> official SAT list with its publication versions, and the CEP that Banxico signs for every SPEI. Six
> independent detectors: the list with a retroactive sweep, CLABE forensics, duplicate invoices,
> supplier behaviour drift, beneficiary verification against a signed receipt, and bank
> reconciliation. They are pure functions with no network and no database, and there is no language
> model anywhere in the decision. You can read them, and you can run the tests here on this laptop.
>
> **(15 s, the differentiator.)** The bank knows the account and not the invoice. The accountant
> knows the invoice and sees it a month later. Neither of them is in the room at the moment the money
> becomes irreversible. That moment is the whole product.
>
> **(10 s, the invitation.)** Ask me anything about the algorithm, the data or the regulation. Or
> send an instruction yourself, from your phone, right now.

About 240 words. The invitation at the end sets up `docs/12-judge-qa.md`, and beat 3 of the demo is
the thing it invites.

**On the market number.** The 90-second version deliberately does not carry one. If
`docs/04-market.md` has a cited, checkable number by M3, add it to the differentiator block in one
clause. If it does not, say nothing instead. A number a judge can falsify costs more than the
fifteen seconds it buys. TODO(FabriBanda).

## 4 minutes, the stage version

Structure: slides 1 to 3 in 60 seconds, the live demo in 100 seconds, slides 5 to 9 in 60 seconds,
the ask in 20 seconds.

| Block | Time | What is said |
|---|---|---|
| Hook and persona | 0:00 to 0:40 | The first two paragraphs of the 60-second version, unchanged. Do not improvise the hook. It is the sentence the whole pitch hangs from |
| The product in one line | 0:40 to 1:00 | "Ceptinela reads the invoices she already has and tells her, at the moment she pays, which payments to hold, which to verify and which to release." |
| Live demo | 1:00 to 2:40 | Beats 1, 2 and 3 of `docs/10-demo-script.md`. If the room is slow, cut beat 2 and keep beat 3 |
| How it works | 2:40 to 3:05 | The four-lane diagram, the six detectors, the expected-loss decision, and one sentence on why there is no model in the path |
| Why different, and the evidence | 3:05 to 3:25 | The competitor line from slide 6, then: "the numbers on our metrics page are blind, because the person who labelled the cases does not write the detectors" |
| Market, model, regulation | 3:25 to 3:45 | Three sentences, one each. TODO(FabriBanda) for the first two |
| The ask | 3:45 to 4:00 | "Ten real payment runs next week, to measure the false-positive rate on data we did not generate." |

Rehearsed twice, out loud, timed, with all four people present. A rehearsal with one person is a
read-through. The rehearsal log goes in `docs/14-process.md` (issue #75).

## The eight hardest questions

The full answers, with the evidence path for each, are in `docs/12-judge-qa.md`. What follows is the
spoken version: what the presenter says in one breath before opening a file. **If this file and
`docs/12` ever disagree, `docs/12` wins** and this table gets fixed in the same pull request.

| # | Question | The spoken answer |
|---|---|---|
| 1 | What is the actual algorithm, and why is that the right model? | "Six independent detectors produce findings with an amount at risk, and one expected-loss decision weighs that amount against the cost of delaying the payment by a day. It is the right model because the answer has to be auditable to a person who is legally responsible for it, and because every input is a document, not a behaviour we guessed at." |
| 2 | The list is public and free. Why not just check it yourself? | "Because the check is not the hard part, the cadence is. It has to run on every supplier on every run, and again retroactively every time the SAT publishes, against invoices you already paid and already deducted. Nobody does that by hand weekly, and the exposure is created by the publication, not by the payment." |
| 3 | The bank already shows the beneficiary name. | "After you type the account, and it compares it with nothing. We compare the holder name on a Banxico-signed receipt with the legal name on the invoice we are settling, we keep the signed document, and we do it once per account instead of once per payment." |
| 4 | The one-cent probe needs a human, so it is not automatic. | "Correct, and that is the design. We do not hold funds and we do not execute transfers, which is exactly why we need no licence. A person sends one cent from their own bank, we read the receipt Banxico signs for it, and the verification survives as evidence." |
| 5 | Why rules and not a model? | "Cost that scales with volume, latency, non-determinism that cannot be unit-tested, and financial data leaving the perimeter. All four are graded against us. The decision is deterministic and the tests run here, offline, in front of you." |
| 6 | What is real and what is synthetic right now? | "The SAT list is real and you can type an RFC into it. The CEP in beat 4 is real, and its clave de rastreo is on the card so you can re-verify it yourself. Everything else, every company, supplier, invoice and CLABE, is synthetic and watermarked as such." |
| 7 | Why would this not be a feature inside an accounting product in six months? | "It could be, and the fastest way there is us. What is hard to copy in six months is not the list check, it is the joined ledger: which accounts this supplier has actually been paid on, established by which document, and the replayable event log that makes the retroactive sweep possible." TODO(FabriBanda) confirm against the competitor map |
| 8 | Who pays, how much, and what does one verification cost you? | "The company pays, and the accounting firm that holds thirty of them is the channel. A verification costs one cent plus a signature check, and the scoring itself has no marginal cost because there is no inference in it." TODO(FabriBanda) for the price and the anchor, in `docs/05-business-model.md` |

Questions that are not in this eight and still get asked: what happens at ten times the volume, what
regulation applies, what one explanation costs, and what we cut. All four are in `docs/12`.

## Delivery rules

- One presenter, one backup, both named in `docs/10-demo-script.md`.
- Open with the fiscal hook. Every time. It is the line ADR-0002 made binding.
- Plain words. No feature names nobody has heard. Say "the receipt the central bank signs" before
  saying "CEP", once per conversation.
- Say the synthetic-data sentence unprompted, in beat 1.
- Never say "we did not have time". Say what we cut and why, which is a judgment story.
- Never say a number that is not on the screen or cited in `docs/04-market.md`.
