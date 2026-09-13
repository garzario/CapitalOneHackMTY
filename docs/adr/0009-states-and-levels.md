# ADR-0009: Three levels and three states, derived and never stored

- **Status:** Accepted
- **Date:** 2026-09-12
- **Deciders:** the team meeting of 2026-09-12, recorded in issues #195 and #196; written up by `garzario`
- **Affects:** `packages/core/src/levels.ts`, `packages/core/src/domain.ts`, `docs/09-api.md`, `apps/api`, `apps/web`, `scripts/web-mock.ts`, every screen and every document

## Context

Two panels and one meeting on 2026-09-12 produced a list, and two items on it are about vocabulary:
three transaction states (`rojo`, `cancelado`, `enviado`) instead of the engine's internal actions,
and three confidence levels instead of a probability. Both exist because of what the product cannot
honestly claim. `estimateLoss` in `packages/core/src/decision.ts` says in its own comment that its
figure is an upper bound on the evidence and not a calibrated probability, because the noisy-OR
assumes independence between detectors that is only approximately true; printing 0.73 next to a
supplier's name would be a precision nobody earned, and it invites the one question the engine cannot
answer.

The second force is duplication. By the time this was written the same question was answered in four
places: the engine knew the severity of its findings, `apps/api` knew the action, `apps/web` knew
which colour the chip was, and the offline fallback knew a hand-written guess. Issue #125 is what that
costs: two datasets disagreed about a supplier's legal name and a judge saw both on one screen at
once. A level computed in four places is the same bug with a slower fuse.

## Decision

**One level and one state per payment, each derived by one pure function in `packages/core`, shared
by the engine, the API, the screens and the generated mock.**

`confidenceOf(findings, decision)` answers `confiable`, `precaucion` or `alerta`.
`transactionStateOf(decision, verification, execution)` answers `rojo`, `cancelado` or `enviado`, plus
the two states the run has always counted internally, `pendiente` and `liberado`. Both live in
`packages/core/src/levels.ts`, both are pure, and `assessConfidence` and `assessTransactionState`
answer the same thing with the rule that fired and the findings behind it, because a level with no
evidence under it is not something this product shows.

Neither is stored. `0012_assistant_and_payment_events.sql` deliberately adds no column for either,
for the reason `holdWindow` already gave about the deadline it never stores: a stored level can
disagree with the findings it was computed from, and a derived one cannot.

**Never a probability on a screen or in a document, and never the word "seguro", in any language.**
`confiable` is a statement about the evidence we hold. "Safe" would be a guarantee about a transfer
that cannot be recalled, and nobody can give one.

**What that forbids, precisely, because the product does show three percentages.** The rule is about
the risk of a payment: no probability, percentage or score may stand for the level of a line, for the
chance that a payment is fraud, or next to a supplier's name as a verdict. It is not a ban on
arithmetic a reader can check. Three numbers on the screens are the other kind and each one is
reported with what it divides:

| Where | Number | Why it is not a verdict |
|---|---|---|
| The run screen's composition | 27, 9 and 64 per cent of the run's own money | A share of one total, printed next to the peso amount and the instruction count it comes from, and the three add to 100. It says how the week splits, not how likely a payment is to be fraud |
| The metrics screen | precision, recall and the false-positive rate | A measurement of the detectors against the labelled blind holdout, which is the evidence for "does this work at all". It is about the engine and never about one line |
| The instruction panel | `ocrConfidence` | How much of a CLABE the transcription read, from `packages/extract`, about an image and not about a beneficiary. A typed CLABE always wins over one a model read |

The boundary holds where it matters: none of the three is ever on a document that leaves the
building. `docs/09-api.md` makes the evidence letter say so in those words, and the expected loss,
the delay cost and the transcription confidence are all absent from the letter and from both
constancias for exactly this reason.

### The confidence table

First match wins. The order only decides which reason is reported, because every rule of one level
answers that level.

| # | Rule | Level | Why it is where it is |
|---|---|---|---|
| 1 | a definitive SAT listing, article 69-B `definitivo` still listed, or any article 49 Bis row | `alerta` | the most specific thing this product can say: the comprobantes have no fiscal effect and no delay cost is worth paying against that |
| 2 | any `critical` finding | `alerta` | the documents already prove a problem |
| 3 | an account with no payment history behind it (`new_supplier` or `first_time_seen`, or zero known accounts) | `precaucion` | the most common shape of the fraud this product stops, and it is a fact about the beneficiary rather than a loudness |
| 4 | a pending verification: the decision asks to `verify`, or a finding is `requiere_verificacion` | `precaucion` | somebody has to check, and nothing has been checked yet |
| 5 | any `warning` finding | `precaucion` | |
| 6 | nothing of the above | `confiable` | the documents we hold agree and nothing is open |

An `info` finding on its own is `confiable`. A supplier who was published and then cleared their name
is exactly that case: the row stays on the screen as history and it stops nothing.

### The state table

First match wins.

| # | Rule | State |
|---|---|---|
| 1 | the rail sent or settled this line | `enviado` |
| 2 | the execution cancelled the line | `cancelado` |
| 3 | the verification came back `blocked` | `cancelado` |
| 4 | a definitive SAT listing, and no release a named person signed | `cancelado` |
| 5 | the decision is `hold` or `verify` | `rojo` |
| 6 | the rail refused the line | `rojo` |
| 7 | the decision is `release` | `liberado` |
| 8 | nothing has decided it | `pendiente` |

Three of the rows are the arguments worth having, and each one has a test case.

- **Money that left outranks everything**, including a list published afterwards. The retroactive
  sweep prices what a publication costs; it does not un-send a SPEI, and a screen that said
  `cancelado` over a transfer that settled would be lying about the one thing that cannot be taken
  back.
- **A definitive listing outranks a hold**, because it is not a wait that somebody can sit out: the
  invoices have no fiscal effect at all, so `cancelado` and not `rojo`.
- **A person's signature outranks the listing.** A release signed with a name and a written reason
  reads `liberado`, then `enviado` when it leaves. ADR-0002 forbids the product overruling a person in
  either direction, and `SYSTEM_DECIDER` is explicitly not a signature: the engine's own release over
  a definitive listing stays `cancelado`.

The two internal states are what stop an honest answer being rounded to a colour. A line nobody has
looked at is not green, and a release on Wednesday is not `enviado` until money leaves on Thursday,
which is exactly what a judge tests by asking what the screen said before the run was sent.

## Consequences

- Positive: one implementation, so the API, the offline fallback, the constancia and the one-page
  carta cannot disagree about a line. The failure mode of issue #125 is structurally gone for these
  two fields.
- Positive: the rule table is six rows and eight rows of pure function with a test per row, so "how
  do you decide it is `alerta`" is answered by reading one file at the table.
- Positive: `Action` is untouched. The engine still proposes `hold`, `verify` or `release` and nothing
  downstream had to change to gain a level.
- Negative: two vocabularies now describe one line, the action and the state, and somebody will ask
  which is which. The answer is in the types: the action is what the engine proposes, the state is
  what happened, and they are different columns on purpose.
- Negative: a level cannot be filtered in SQL, because it is not a column. Counting by level means
  reading the findings, which the run payload already carries.
- Follow-on: `apps/web` renders the level with its findings and the state as the three public ones;
  `apps/api` puts both on every instruction and on the run; the generated mock carries them per line
  so the offline run reads the same.
- Now forbidden: a probability, a percentage or a score standing for the risk of a payment or for
  the level of a line, on any screen; any of the three on a document that leaves the building, which
  is the evidence letter and both constancias; the word "seguro" as a verdict, in Spanish or in
  English; a second place where either of these two values is computed; a column that stores one.
  The table above says which numbers are arithmetic rather than a verdict and why.

## Alternatives considered

| Alternative | Why not |
|---|---|
| Show the expected loss as a probability | The engine's own comment says the figure is an upper bound on the evidence and not calibrated. A number invites a question it cannot answer, and a judge would be right to ask it |
| Store the level on the decision row | Two sources for one value, which is what `packages/core/src/exposure.ts` exists to prevent. A stored level survives the findings that produced it |
| Let the action be the state | The action says what the engine proposes and says nothing about whether money left. The clerk's question is the second one |
| Three states only, with no internal pair | Then a line nobody has decided is indistinguishable from a clean one, and a release that has not been sent reads as sent. Both are the kind of rounding a judge finds by reloading a page |
| Derive the level in the web, since that is where it is shown | That is the four implementations this ADR removes, and the offline fallback is where the fourth one lived |

## Revisit if

A detector starts producing a finding whose severity does not map onto these three levels, or a real
calibration set exists: with labelled outcomes and a measured reliability curve a probability becomes
a claim somebody can defend, and then it gets its own ADR with the curve in it. Until then the level
is what the evidence supports.
