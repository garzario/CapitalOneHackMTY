# ADR-0002: Track and one-sentence thesis

- **Status:** Pending, decided by the team vote at M0, 2026-09-11 22:00
- **Date:** 2026-09-11
- **Deciders:** all four
- **Affects:** everything. `docs/00` to `06`, `packages/core`, the whole demo

## Context

Originality is 30 of 100 and Capital One named repetition as the most common past failure. Winners
had a clear differentiator, a very specific audience and a niche problem. Seventeen prior-year
winners are listed in `docs/00-challenge.md` and none of them may be restated. The shared Nessie
enterprise pool is full of campus-flavoured merchants and bills created today by other teams, which is
weak but real evidence that the student-budgeting lane is crowded again this year.

This decision is the single highest-leverage one in the repo, and it must close within 45 minutes.

## Decision

**Pending.** The candidates below are the seven finalists from internal scoring.

| Candidate | Track | One line |
|---|---|---|
| Eslabon | 2, B2B | Multilateral debt netting over the CFDI obligation graph of a construction cluster, solved as a min-cost circulation and decomposed into explainable settlement cycles |
| TIMBRE | 3, Risk | Supplier payment-run sentinel over an event-sourced CFDI ledger, with independently explainable detectors including CLABE forensics and a SAT Article 69-B state machine |
| Anaquel | 2, B2B | Inventory working capital read out of CFDI line items, using the fiscal ledger as the ERP a small retailer never had |
| Cuadre | 2, B2B | Retailer deduction reconciliation, rebuilding each deposit line by line against the published deduction reason codes |
| Tracto | 2, B2B | Load selection for one-to-five-unit carriers under a cash constraint, telling the owner which load to reject |
| UMBRAL | 1, B2C | Gig-driver platform allocation against the IMSS single-platform income threshold, because income is not summed between platforms |
| CEPTINELA | 3, Risk | CLABE and beneficiary verification before an irrevocable SPEI transfer, against the supplier-account-change scam |

TODO(garzario): after the vote, rewrite this section as a decision, set the status to Accepted, and
fill the four lines below in the same PR.

- Track chosen:
- Thesis, one sentence: `<who>` can `<outcome>` because we `<mechanism nobody else has>`.
- The niche, stated as a persona and not a demographic:
- The one thing every named competitor structurally cannot do:

## Decision criteria, agreed before the vote

1. **The one-sentence test.** If the thesis needs two sentences, the idea is not sharp enough.
2. **Not on the prior-winners list**, and not a restatement of one with a new name.
3. **The persona is a niche, not a demographic.** "A 28-person metalworking supplier's sole
   administrative assistant" passes. "Mexican SMBs" fails.
4. **The mechanism is non-trivial and provable in 36 hours.** There is a formal problem underneath it
   that fits in `packages/core` with unit tests.
5. **The gap is provable from a primary public source**, ideally one we can show on screen.
6. **The data can be synthesised honestly**, because Nessie has dates without times and a contaminated
   shared pool.

**Default if the 45-minute timebox expires:** take the candidate with the clearest niche persona and
ship it. An unchosen idea at 22:45 costs more than a second-best idea chosen at 22:00.

## Consequences

Once this closes, it propagates immediately into `docs/00-challenge.md`, the persona, the journey, the
market sizing and the algorithm name in `packages/core`. Everything with a TODO marker in `docs/`
unblocks on this ADR.

## Alternatives considered

Recorded after the vote: which candidate was second, and the single reason it lost. That sentence is
worth real points with a judge, because it shows the choice was made rather than defaulted into.

## Revisit if

Never after M1. A track change after the vertical slice exists is fatal to the demo.
