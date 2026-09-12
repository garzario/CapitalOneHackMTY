# ADR-0002: Track and one-sentence thesis

- **Status:** Accepted, team vote 2026-09-12 02:30 CST
- **Date:** 2026-09-12
- **Deciders:** Patricio, Adan, Fabricio, Fabian
- **Affects:** everything. `docs/00` to `13`, `packages/*`, `apps/*`, the demo and the pitch

## Decision

Track 3, Real-Time Anomaly & Security Sentinel. Product: **SentryOne** (working name, domain
`sentryone.tech`), the merge of the two finalist ideas TIMBRE (payment-run sentinel over CFDI and the
SAT Article 69-B list) and SENTRYONE (beneficiary verification with the Banxico CEP before an
irrevocable SPEI).

**Thesis, one sentence:** the payments clerk of a Mexican SMB can stop a fiscally toxic, duplicated or
misdirected SPEI before it leaves, because SentryOne joins, at the moment of payment, three data sources
nobody else joins: the company's own CFDI ledger, the SAT's official Article 69-B list, and the CEP that
Banxico signs for every SPEI.

## The product in six controls

1. **SAT 69-B cross-check with retroactive sweep.** Every supplier RFC is matched against the official
   SAT list (presunto, desvirtuado, definitivo, sentencia favorable). When a new list is published, the
   event ledger is replayed and the ISR and IVA exposure of everything already paid and deducted to a
   newly listed supplier is quantified.
2. **CLABE forensics.** Check digit (3-7-1 weights, mod 10), bank and plaza consistency, and edit
   distance against the supplier's historical accounts (from prior payment complements and prior
   instructions), OCR-aware when the CLABE arrived as an image.
3. **Duplicate invoices.** Same issuer, amount, date window and folio or UUID collisions.
4. **Supplier behaviour change.** Issuance rate, amount and concentration drift versus the supplier's
   own history, with explicit validity gating on sample size.
5. **Beneficiary verification with the CEP.** A one-cent SPEI probe is sent by a human from the
   company's bank; SentryOne fetches the Banxico CEP, validates the digital signature and compares the
   account holder name with the CFDI legal name. The result is stored as evidence in a per-company
   registry of verified beneficiaries.
6. **Expected-loss decision.** Hold, verify or release, weighing the amount at risk against the real
   cost of delaying the payment. No alert accuses anyone; states are `comprobable` or
   `requiere_verificacion` and a person decides.

## Why this wins under the confirmed rubric

- Real external data a judge can verify on their own phone: the SAT list and a Banxico-signed CEP.
  This is the strongest available answer to the stated hunt for Wizard-of-Oz prototypes.
- Zero regulatory friction: payer-side software, no licence, no bank agreement, no cold start.
- A specific persona (the clerk who runs the Thursday payment run) and a clear buyer (the SMB or the
  accounting firm that holds thirty companies' XML).
- Track 3 is expected to be the least crowded; repetition is the named killer.
- A sellable floor early (parser, CLABE, 69-B, payment-run screen) and everything else stacks on it.

## Narrative rules (binding for the pitch and the UI)

- The hook is fiscal and irreversible: paying a supplier on the definitive 69-B list voids the
  deductions retroactively, and a SPEI never comes back. Do not lead with the "cambiamos de cuenta"
  impersonation story; it is one signal among six, not the headline.
- Never show a real RFC from the SAT list next to fabricated fraud evidence. Real RFCs only appear in
  the lookup box a judge can type into. Every synthetic invoice, CLABE and supplier carries a visible
  `datos sinteticos` watermark and a synthetic RFC.
- Nessie is the company's bank mirror for reconciliation (payments with no CFDI behind them). Say
  unprompted that Nessie carries dates with no time; intraday ordering lives in our ledger.
- "Real time" is stated as interdiction at the moment of the payment decision.

## Alternatives considered

- **Eslabon** (multilateral debt netting over CFDI): highest originality, but cycles of three or more
  firms need a signed multilateral agreement and an operator; the headline number came from our own
  generator. A lawyer flagged the friction.
- **Cenote** (privacy-preserving inter-institution mule graph with PSI): highest ceiling, but invisible
  cryptography, a three-institution cold start and an unproven three-party PSI under time pressure.
- **Cuadre** (retailer deduction reconciliation): provable market gap, but synthetic deduction
  documents and a demo hard to feel for a non-CPG judge. Plan B in the B2B track.
- **Tracto, UMBRAL, Anaquel, Sparring**: rejected for trivial core, weak demo arithmetic, missing SKU
  sales data, and a closed-loop evaluation respectively.

## Consequences

- `packages/core` gains the six detectors as pure functions over the domain types in
  `packages/core/src/domain.ts`; `packages/sat` and `packages/cep` are added.
- `apps/api` implements the contract in `docs/09-api.md`; `apps/web` builds the payment-run screen,
  the QR intake page, the SAT publication simulation, the CEP viewer and the metrics page.
- The generator (owner Fabian) and the labelled holdout cases (owner Fabricio) are written by different
  people from the detectors (owner Patricio), so the reported precision and recall are blind.
