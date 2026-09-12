# 06. Regulatory posture, privacy and the LLM boundary

Worth 5 points directly (regulatory and operational feasibility) and it is the section the product
judge probes hardest, because almost no hackathon team writes it.

**This is a framework map, not legal advice.** It lists which Mexican regimes attach to which part
of the product and what obligation each one creates, so that an engineer or a product person can
check that we thought about the right things. It is not an opinion on compliance and it was not
written by counsel. Any production deployment needs a licensed review.

Owner: Fabricio (`FabriBanda`), with the lead on the LLM boundary. Due M2.

## 1. Our legal position

Stated first, because stating it first is what separates a team that thought about this from a team
that did not.

- **We are not a regulated financial entity.** We do not hold client funds, we do not issue
  electronic payment funds, we do not originate credit, and we do not execute transfers.
- **The prototype is a decision-support layer.** It reads transaction and invoice data the client
  already owns, computes over it, and shows a ranked answer with the reason. The human acts.
- **Two viable production paths.** Either the product is licensed to an institution that already
  holds an ITF or banking authorisation and runs inside their perimeter, or it operates under an
  existing ITF's authorisation as a technology provider. Both are named in
  `docs/05-business-model.md`.
- **No automated adverse action.** Nothing in the product declines, blocks, scores down or reports
  anyone without a human in the loop. That one design rule removes most of the regime we would
  otherwise be inside.

TODO(FabriBanda): once ADR-0002 closes, add one sentence naming which of the two production paths
is the headline, because the answer changes which rows below are ours and which are the
institution's.

## 2. Framework map, Mexico

| Regime | What it governs | Does it attach to us | Obligation it creates |
|---|---|---|---|
| Ley para Regular las Instituciones de Tecnología Financiera (Ley Fintech, 2018) | The two ITF figures: IFPE, electronic payment funds institutions, and IFC, crowdfunding institutions | Not as built. We are neither an IFPE nor an IFC, because we neither hold nor transmit funds nor intermediate financing | If a future version holds balances it becomes an IFPE question. Record the trigger, do not cross it in a prototype |
| CNBV supervision, including the open-finance and standardized-API provisions derived from the Ley Fintech | Authorisation and supervision of ITFs and banks, and the rules for standardized APIs for data sharing | Indirectly. Our data access is client-consented and client-owned, not an open-finance licence | Aggregated data access at scale is the provision to read before production. Consent and purpose must be documented per client |
| Banxico, SPEI, CoDi, DiMo | Payment system rules, participation, and the irrevocability of an executed SPEI transfer | Indirectly and importantly. Any "check before you pay" feature lives entirely in the window before execution | We never execute. We inform before the irrevocable step. Stating that SPEI is instant and irrevocable is the reason the product exists in that window |
| CONDUSEF | Consumer protection, transparency of terms, and the complaint process for users of financial services | If we ever face the end consumer under a financial brand | Clear terms, no misleading claims, a named complaint path. In the prototype, the disclaimer in the README carries this |
| LFPDPPP, federal personal data protection law | Personal data held by private parties: notice, consent, ARCO rights, purpose limitation and transfers to third parties | Yes, in production. Not in the prototype, which holds no personal data | Aviso de privacidad, express consent for financial data, ARCO request handling, purpose limitation, and an explicit transfer clause covering any third-party processor |
| Credit information rules, credit bureau | Consultation and reporting of credit behaviour, and the consent required for a consultation | Only if we touch scoring or report behaviour | We do not consult or report. If a lending partner does, the consent and the decision are theirs, and that boundary is written into the referral flow |
| PCI DSS posture | Card data handling | Not applicable as built, and we still act as if it were | Never store a PAN. Nessie's `account_number` is synthetic and we still treat it as sensitive: never logged, never in a screenshot, never in an issue |
| SAT fiscal documents, where the product reads CFDI | The validity and content of fiscal documents | Depends on ADR-0002 | Read-only use of documents the client already holds, with the client's consent. We do not issue, stamp or cancel anything |

The single most important line in this table: **express consent plus purpose limitation under
LFPDPPP is what constrains sending financial data to a third-party processor**, which is exactly
why section 4 exists.

## 3. Data handling in this prototype

- **One hundred percent synthetic data.** Generation method and fixed seed are in
  `docs/08-data-model.md`. No real personal data enters this repo, ever, including in issues,
  screenshots, PR bodies and the demo.
- **Nessie is a sandbox.** Every record is fake. The `/enterprise/*` pool is shared with every
  other team at this event, so we never post anything identifying there and never compute analytics
  on it. See `docs/09-api.md`.
- **Secrets.** API keys live in `.env` only, never committed. `.env.example` lists every variable
  with no values. Keys are rotated after the event.
- **Tokenization boundary in production.** TODO(garzario): name the exact fields that would be
  tokenized before leaving the client perimeter (account identifiers, counterparty tax IDs,
  counterparty names) and where the boundary sits in the diagram in `docs/07-architecture.md`.

## 4. The LLM boundary and its unit economics

This is the section they will actually probe, because Capital One said explicitly that third-party
LLMs are allowed **with** awareness of privacy, regulation, ethics and cost per transaction.

> **Architectural rule: no LLM in the per-transaction hot path.** Every transaction is scored by
> deterministic rules and statistics in `packages/core`. Marginal cost is approximately zero,
> latency is in microseconds, it is fully auditable, reproducible in a test, and explainable to a
> regulator. The LLM is used only for a natural-language explanation on user demand, and for a
> batched periodic summary.

Recorded as `docs/adr/0004-llm-boundary-and-privacy.md`.

### Cost model

```
cost/user/month = explanations_per_user * (tok_in  * price_in + tok_out  * price_out)
                + summaries_per_user    * (tok_in_s * price_in + tok_out_s * price_out)

deterministic scoring: zero marginal cost
```

| Input | Value | Note |
|---|---|---|
| Explanations per user per month | TODO(FabriBanda) | On demand only. Estimate from the journey in `docs/03` |
| Tokens in, out per explanation | TODO(FabriBanda) | Measure, do not guess. One real call, counted |
| Summaries per user per month | TODO(FabriBanda) | Batched, one per cycle |
| Tokens in, out per summary | TODO(FabriBanda) | |
| Price in, price out | TODO(FabriBanda) | Read from the provider's official pricing page at M3 |
| **Cost per user per month** | TODO(FabriBanda) | Stamp the line `prices as of 2026-09-12` |

Never quote a model price from memory. Open the provider's pricing page, copy the number, stamp the
date. A wrong price in this table is worse than an empty one, and it feeds the margin row in
`docs/05-business-model.md`.

### The three consequences, which are the actual answer to the cost question

1. **A tenfold usage spike costs approximately nothing**, because the hot path contains no
   inference. Cost scales with explanations requested by humans, not with transaction volume.
2. **Zero customer financial data needs to leave the perimeter for the scoring that matters.** The
   decision is deterministic and local. Only a redacted, aggregated explanation prompt would ever
   cross a boundary, and under LFPDPPP that transfer is the part that needs consent and purpose
   limitation, which is why it is the part we removed from the critical path.
3. **The next cost step is smaller or on-device models** for the explanation layer, not a cheaper
   per-transaction model, because there is no per-transaction model to make cheaper.

### Ethical and reputational risk

- **False positives have a human cost.** A wrongly flagged payment delays a supplier who needs the
  money. The product shows a ranked reason and a confidence, never a verdict, and the human decides.
- **No automated adverse action.** Nothing is declined, blocked or reported by the system alone.
- **Algorithmic bias exposure** exists in anything credit-adjacent. We do not score people. If a
  future version informs a lending decision, the features used and their distributions have to be
  auditable before that ships, and that is a precondition, not a backlog item.
- **Explainability is a product feature, not a compliance chore.** Every output names the rule or
  the quantity that produced it, which is also why the engine is deterministic.
- **This product gives information, not financial advice.** Stated in the README, in the UI footer,
  and out loud in the demo.
