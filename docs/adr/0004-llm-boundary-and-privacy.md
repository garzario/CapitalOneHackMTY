# ADR-0004: No LLM in the per-transaction hot path

- **Status:** Proposed
- **Date:** 2026-09-11
- **Deciders:** `garzario`, with `FabriBanda`
- **Affects:** `packages/core`, `apps/api`, `docs/06-regulatory-privacy.md`, `docs/05-business-model.md`

## Context

Capital One confirmed that third-party LLMs are allowed, with explicit awareness of data privacy,
banking regulation, ethical and reputational risk, and cost per transaction. That phrasing is an
invitation to be asked about all four, and the product judge will ask.

A large share of hackathon submissions in this space put a model call in the decision path, which
creates four problems at once: per-transaction cost that scales with volume, latency measured in
hundreds of milliseconds, non-determinism that cannot be unit-tested, and a data transfer to a third
party that under LFPDPPP requires express consent and purpose limitation for financial data.

## Decision

**No LLM in the per-transaction hot path.** Every transaction is scored by deterministic rules and
statistics in `packages/core`. Marginal cost is approximately zero, latency is in microseconds, the
result is fully auditable, reproducible in a test, and explainable to a regulator.

The LLM is used in exactly two places, both outside the decision:

1. A **natural-language explanation on user demand**, generated from an already-computed deterministic
   result.
2. A **batched periodic summary**, one per cycle rather than one per event.

Cost model, filled with live prices at M3 and stamped with the date:

```
cost/user/month = explanations_per_user * (tok_in  * price_in + tok_out  * price_out)
                + summaries_per_user    * (tok_in_s * price_in + tok_out_s * price_out)

deterministic scoring: zero marginal cost
```

Never quote a model price from memory. Read it from the provider's official pricing page and stamp
`prices as of <date>` next to the table in `docs/06-regulatory-privacy.md`.

## Consequences

- Positive: a tenfold usage spike costs approximately nothing, because cost scales with explanations
  requested by humans and not with transaction volume.
- Positive: zero customer financial data needs to leave the perimeter for the scoring that matters,
  which is the part LFPDPPP constrains hardest.
- Positive: the engine is unit-testable, so "is this a wrapper around a language model" is answered by
  running `bun test` rather than by arguing.
- Positive: the next cost step is a smaller or on-device model for the explanation layer, not a cheaper
  per-transaction model, because there is no per-transaction model.
- Negative: the product cannot use a model's judgment inside a decision, so anything that genuinely
  needs semantic understanding in the loop has to be expressed as a deterministic feature first. That
  constraint is accepted and it improves the algorithmic-logic score.
- Now forbidden: a model call inside a request handler that returns a score, a flag, or a ranking.

## Ethical and reputational position

No automated adverse action without a human in the loop. A false positive delays a supplier who needs
the money, so the product shows a ranked reason and a confidence, never a verdict. We do not score
people and we do not consult or report to a credit bureau. The product gives information, not
financial advice, and that sentence appears in the README, in the UI footer and in the demo.

## Alternatives considered

| Alternative | Why not |
|---|---|
| A model call per transaction | Cost scales with volume, latency is hundreds of milliseconds, non-deterministic so untestable, and it is the exact architecture the judges are probing for |
| No LLM at all | Loses a genuinely useful explanation layer that costs almost nothing when it is on demand |
| A local small model in the hot path | Still non-deterministic and still not the right tool for arithmetic on a ledger. Revisit for the explanation layer only |

## Revisit if

A feature genuinely requires semantic judgment inside the decision, in which case it gets its own ADR
with a measured cost per call and a stated consent and transfer position before any code ships.
