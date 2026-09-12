# 02. Persona

Issue #52. Owner: Fabricio (`FabriBanda`). This document defines the narrow user Ceptinela is
designed for. It is a product-design hypothesis, not a report about a real person or company.
The operational figures below come from the deterministic synthetic company in `packages/seed`.
They are not market statistics.

![Illustrated composite portrait of Lupita Elizondo](../assets/persona/lupita-elizondo.png)

The portrait is an illustration of a fictional composite. It does not depict a real person.

## Primary persona: Lupita Elizondo

Lupita is the sole administrative clerk at Metalicos del Norte SA de CV, the synthetic
28-employee metalmecanica in Apodaca, Nuevo Leon, defined in
`packages/seed/src/ceptinela/company.ts`.
She runs the supplier payment run every Thursday. She is not a fraud analyst or a corporate
treasurer. She is the one person who has to turn invoices and payment instructions into correct
transfers while the owner is working elsewhere in the business.

| Dimension | Product definition | Evidence status |
|---|---|---|
| Company | Metalicos del Norte SA de CV, 28 employees, metalworking, Apodaca | Synthetic scenario fixed in `packages/seed/src/ceptinela/company.ts` |
| Workload | 92 payment instructions in the reference Thursday run, settling 129 CFDIs | Seed 69 output for week `2026-09-07` |
| Pesos per run | MXN 2,174,210.76 in that same reference run | Sum of `PaymentInstruction.amount` in `generateCeptinela`, not a real-company statistic |
| Supplier base | 44 active synthetic suppliers | `packages/seed/src/ceptinela/suppliers.ts` |
| Tools today | Email inbox, WhatsApp, spreadsheet, CFDI portal, business bank portal and bank token | Workflow hypothesis to validate at the venue |
| Decision rhythm | Review the run on Thursday, spend attention on exceptions, then send or escalate | Product hypothesis to validate at the venue |

The generator produces 4,103 CFDIs across nine months, about 456 a month, over the synthetic
supplier base. The reference run holds 92 payment instructions rather than 4,103, because an
instruction is created only for the invoices falling due inside that seven-day window, and one
instruction can settle several of them. These numbers keep the demo and this persona consistent.
They do not claim that a typical Mexican SMB has the same volume.

Every figure in this section is asserted against the generator by
`packages/seed/src/ceptinela/documented-figures.test.ts`, so a change to the seed fails the build
instead of quietly making this page false.

## What her job is measured on

Until the venue interviews are complete, these are explicit design hypotheses:

- Pay the correct supplier, to the correct account, for the correct invoice amount.
- Finish the Thursday run in time for the owner to approve exceptions.
- Avoid duplicate payments and supplier interruptions caused by an unjustified hold.
- Leave the external accountant a traceable packet: CFDI, decision, payment evidence and memo.

Ceptinela therefore does not optimize for the number of alerts. It optimizes for a short exception
queue with evidence that Lupita and the owner can act on.

## What she is afraid of

Her feared outcomes map directly to the product controls:

1. A fiscally toxic payment. A supplier appears on the definitive Article 69-B list after invoices
   have already been paid and deducted, and nobody connects the publication to the old ledger.
2. An irreversible mistake. An incorrect CLABE or unverified beneficiary receives a SPEI that
   cannot be pulled back after it leaves.
3. A duplicate. The same obligation is paid twice because the invoice and payment instruction
   were tracked in different places.
4. A false positive with operational cost. A legitimate supplier is held without a clear reason,
   and production waits while Lupita tries to prove that the payment is safe.

The fiscal exposure and SPEI irreversibility are the hook. A changed bank account is one signal
among six, not the product story.

## Jobs to be done

1. When the Thursday run is ready, show me which payments are `comprobable`, which require a human
   verification, and why, so I can focus on the few decisions that matter.
2. Before a SPEI leaves, join the supplier's CFDI history, the current SAT Article 69-B list and
   the Banxico CEP evidence, so I do not have to reconcile three systems by hand.
3. When a new SAT list is published, replay what we already paid and quantify the exposure, so the
   company can act while the evidence is still available.
4. After the decision, keep the memo and verified beneficiary evidence, so next week's legitimate
   payment does not create the same work again.

## The current workaround

| Step today | Tool | Gap at the decision moment |
|---|---|---|
| Receive the CFDI XML | Email or supplier portal | The document is filed, but not joined to a payment decision |
| Assemble what is due | Spreadsheet | Rows are not ranked by expected loss or fiscal exposure |
| Receive or retype the CLABE | WhatsApp, PDF or email | The message is controlled by its sender and has no account history |
| Create the SPEI | Bank portal | The bank displays a beneficiary name, but does not compare it with the CFDI legal name or SAT history |
| Send evidence to accounting | Folder or email | The reason for hold, verify or release is not archived as one traceable decision |

## Anti-persona: corporate treasury with an ERP

Ceptinela is deliberately not for a corporate treasury team whose ERP already maintains a
supplier master, controlled bank-account changes, segregation of duties and a maker-checker
approval flow.

| Boundary | Lupita's company | Anti-persona |
|---|---|---|
| Ownership | One clerk assembles and follows the run | Specialized accounts-payable and treasury teams |
| System | Spreadsheet plus separate portals | ERP, supplier master and treasury module |
| Control | One person gathers evidence and asks the owner for exceptions | Formal maker-checker and role-based approvals |
| Product fit | Add a lightweight decision layer without replacing the bank | Existing controls already cover the workflow; integration and procurement would dominate the value |

Serving corporate treasury would pull Ceptinela toward long integrations and duplicate controls it
already owns. The chosen niche is the SMB with enough supplier volume for a weekly payment run but
without a treasury system or dedicated risk analyst.

## Pending human validation

The acceptance criterion for two venue conversations is intentionally unchecked. No interview,
quote or observed statistic has been invented.

- [ ] Ask one accountant or external accountant who serves Mexican SMBs.
- [ ] Ask one administrative clerk, owner or operations person who has personally paid suppliers
  for a small company.

Ask both people these questions in this order, without showing Ceptinela first:

1. How many supplier invoices do you pay in a normal week, and approximately how many pesos leave
   in one payment run?
2. Which tools do you move between from receiving an XML to sending the transfer?
3. What result are you personally held responsible for when you run supplier payments?
4. Which mistake worries you most before you authorize a SPEI, and why?
5. What do you check when a payment instruction contains an account you have not paid before?
6. Do you compare the beneficiary name shown by the bank with the legal name on the CFDI? What do
   you do when the names only partially match?
7. When and how do you check Article 69-B status, including suppliers paid before a new publication?
8. What evidence do you keep after a payment is verified, and where do you archive the decision?
9. Tell us about the last alert or bank-account change that turned out to be legitimate. What made
   you comfortable releasing it?

Record only the interview date, the respondent category, the ranges they provide and the answer
that changes the product. Do not record names, company names, screens, account data or RFCs. Replace
the synthetic workload assumptions only after both conversations, and mark any disagreement rather
than averaging it away.

## Repository links

- Journey and its three branches: `docs/03-user-journey.md`
- Domain decisions and evidence: `packages/core/src/domain.ts`
- Synthetic scenario and generator: `packages/seed/src/ceptinela/`
- API contract: `docs/09-api.md`
