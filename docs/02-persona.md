# 02. Persona

Issue #52. Owner: Fabricio (`FabriBanda`). This document defines the narrow user SentryOne is
designed for. It is a product-design hypothesis, not a report about a real person or company.
The operational figures below come from the deterministic synthetic company in `packages/seed`.
They are not market statistics.

![Illustrated composite portrait of Lupita Elizondo](../assets/persona/lupita-elizondo.png)

The portrait is an illustration of a fictional composite. It does not depict a real person.

## Primary persona: Lupita Elizondo

Lupita is the sole administrative clerk at Metalicos del Norte SA de CV, the synthetic
28-employee metalmecanica in Apodaca, Nuevo Leon, defined in
`packages/seed/src/sentryone/company.ts`.
She runs the supplier payment run every Thursday. She is not a fraud analyst or a corporate
treasurer. She is the one person who has to turn invoices and payment instructions into correct
transfers while the owner is working elsewhere in the business.

| Dimension | Product definition | Evidence status |
|---|---|---|
| Company | Metalicos del Norte SA de CV, 28 employees, metalworking, Apodaca | Synthetic scenario fixed in `packages/seed/src/sentryone/company.ts` |
| Workload | 92 payment instructions in the reference Thursday run, settling 129 CFDIs | Seed 69 output for week `2026-09-07` |
| Pesos per run | MXN 2,174,210.76 in that same reference run | Sum of `PaymentInstruction.amount` in `generateSentryOne`, not a real-company statistic |
| Supplier base | 44 active synthetic suppliers | `packages/seed/src/sentryone/suppliers.ts` |
| Tools today | Email inbox, WhatsApp, spreadsheet, CFDI portal, business bank portal and bank token | Workflow hypothesis to validate at the venue |
| Decision rhythm | Review the run on Thursday, spend attention on exceptions, then send or escalate | Product hypothesis to validate at the venue |

The generator produces 4,103 CFDIs across nine months, about 456 a month, over the synthetic
supplier base. The reference run holds 92 payment instructions rather than 4,103, because an
instruction is created only for the invoices falling due inside that seven-day window, and one
instruction can settle several of them. These numbers keep the demo and this persona consistent.
They do not claim that a typical Mexican SMB has the same volume.

Every figure in this section is asserted against the generator by
`packages/seed/src/sentryone/documented-figures.test.ts`, so a change to the seed fails the build
instead of quietly making this page false.

## What her job is measured on

Until the venue interviews are complete, these are explicit design hypotheses:

- Pay the correct supplier, to the correct account, for the correct invoice amount.
- Finish the Thursday run in time for the owner to approve exceptions.
- Avoid duplicate payments and supplier interruptions caused by an unjustified hold.
- Leave the external accountant a traceable packet: CFDI, decision, payment evidence and memo.

SentryOne therefore does not optimize for the number of alerts. It optimizes for a short exception
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

SentryOne is deliberately not for a corporate treasury team whose ERP already maintains a
supplier master, controlled bank-account changes, segregation of duties and a maker-checker
approval flow.

| Boundary | Lupita's company | Anti-persona |
|---|---|---|
| Ownership | One clerk assembles and follows the run | Specialized accounts-payable and treasury teams |
| System | Spreadsheet plus separate portals | ERP, supplier master and treasury module |
| Control | One person gathers evidence and asks the owner for exceptions | Formal maker-checker and role-based approvals |
| Product fit | Add a lightweight decision layer without replacing the bank | Existing controls already cover the workflow; integration and procurement would dominate the value |

Serving corporate treasury would pull SentryOne toward long integrations and duplicate controls it
already owns. The chosen niche is the SMB with enough supplier volume for a weekly payment run but
without a treasury system or dedicated risk analyst.

## Target user, buyer, channel and anti-user

Added on 2026-09-12 in the afternoon, after three Capital One judges asked at the table who exactly
the user is. Everything above this line is a product-design hypothesis about one fictional person.
Everything in this section is external evidence about the population she is drawn from, and the two
are kept apart deliberately: the evidence sizes the segment and says where it is, it does not
validate Lupita. The interview checklist in the next section stays open and unchecked.

Sources are numbered as in `docs/04-market.md#sources` and are not repeated here.

### 1. The primary user, the person who presses send

The single administrative or accounting clerk at a formal firm of 11 to 250 people. She is countable.
Data México puts the occupation at **403,000 people nationally** in the first quarter of 2026,
**25,900 of them in Nuevo León**, at MXN 8,640 a month nationally and **MXN 11,900 in Nuevo León**,
**67.1 percent women**, average age 38 [27]. Three things follow. The user is overwhelmingly a woman,
which the portrait above already assumed and now has a source for. MXN 899 a month is 7.6 percent of
one month of her pay in Nuevo León, which bounds what the company will tolerate paying for a tool she
operates. And there are 25,900 of her in the state where this is being judged. One caveat travels
with all three: SINCO 2512 bundles accounting clerks with economists, finance staff and stockbrokers,
so 403,000 is an upper bound by an amount nobody publishes, and the page itself warns that the salary
breakdowns have low statistical precision [27].

There is no treasurer above her, which is what makes this product necessary rather than redundant.
This is the weakest evidence in the section and it is labelled as such: on 2026-09-12 OCC listed 101
openings for `auxiliar contable` in Nuevo León against 3 for `auxiliar de tesorería`, 4 for
`tesorero` and 4 for `gerente de tesorería`, eleven treasury roles in the whole state, while
`auxiliar administrativo` returned 2,145 [44]. A job board is a snapshot of hiring and not a
statistic. The first version of this comparison was also wrong, quoting 146 for `auxiliar
administrativo` and a ratio of 22 clerks per treasury specialist; the corrected figure makes the
point harder rather than softer, and the correction is recorded in the source entry so nobody
rediscovers it.

And the run happens in a browser. ENAFIN 2021 found **60.4 percent** of firms with six or more
employed persons carried out financial operations through the financial institution's web page,
second only to the branch at 78.9 percent, with only 35.0 percent through a mobile app [28]. That is
the surface SentryOne has to sit in front of, and it is also the channel Banxico's December 2026
user-experience guidelines do not reach, because their scope is mobile applications used by personas
físicas (`docs/04-market.md#how-much-money-goes-through-the-door-we-are-standing-in`). Two limits:
the question is multiple response and refers to the moment of the interview, and ENAFIN pools every
firm from six employees upward, so it does not describe a 28-person metalmecanica specifically [28].

### 2. The buyer, the person who pays and who releases a hold

The owner or director general. ENAFIN 2021 puts the firm's principal decision maker at
`Director(a) o gerente` in **61.2 percent** of firms, `Socio(a) o fundador(a)` in 19.9 percent and
`Familiar del propietario(a)` in 10.8 percent [28]. The tempting reading of those three is wrong and
we do not use it: `Director(a) o gerente` is a managerial title that does not establish ownership, so
they do not sum to an owner share, and the survey measures decisions in general rather than the
payment decision. What it does support is the design consequence. In a firm this size the decision
sits with one named person rather than a committee, which is why the hold screen has to be legible to
somebody who is not in the ledger all day, why escalation is a phone call and not a ticket, and why
the sale is one signature rather than a procurement cycle.

**Two functions, and the title is the weaker half of the answer.** Narrowing the channel on 2026-09-12 in
the evening forced this to be said as functions rather than as a job title, because a function is what
you can ask for an introduction to (issue #193). The budget and the loss sit with **finance**, which
files the complementary return inside the thirty days and carries the 46 percent of a disallowed subtotal
that reverses as ISR plus IVA. The register the controls read sits with **purchasing**, which adds a
CLABE, changes one when a supplier says its account moved, and telephones that supplier when a payment is
held. The published evidence that this is the real split is a competitor's own promise and not our
reading of an org chart: ValidX sells "si no cumple, se retiene y se notifica a Compras" [31]. The clerk
above is the user and not the buyer, and what the product does to her Thursday is make it slower on the
lines that carry a finding, which is the reason selling to her would be selling a control to the person it
constrains. The full buying map is in
`docs/05-business-model.md#gtm-who-sells-this-to-whom-and-through-which-channel`.

### 3. The channel, the despacho contable

**16,356** accounting and audit units nationally, SCIAN 541211, **737 in Nuevo León**, and 12,130 of
the 16,356 employ five people or fewer [26]. Narrowed to the firms that could carry twenty client
companies, **143 of the 737 employ 11 to 250 people and 140 of those 143 are metropolitan** [48], which
is the denominator the firm-by-firm plan in `docs/05-business-model.md` works against and the reason the
year-one target of 25 firms reads as 17.5 percent of a state rather than 0.7 percent of a country. Two
consequences. The 120 firms in the 36-month plan are
0.7 percent of that denominator, which makes the channel plan in `docs/05-business-model.md` an ask
instead of an assertion. And three quarters of the channel is a firm of five people, so what it will
accept is a per-client seat with no implementation, which is the shape of the MXN 195 per company
price rather than a coincidence.

One boundary inside the channel, because getting it wrong would cost a whole GTM motion. The despacho
is the distributor and the second pair of eyes, not the operator: the payment run happens inside the
client's own bank portal, and the despacho holds no credentials for it. Selling a despacho a product
that assumes it executes payments would be selling a workflow that does not exist.

### 4. The geography and the order of attack

Nuevo León first: about **18,500** economic units at 11 to 250 people, 10.2 percent of the state's
181,791, and that band employs roughly 685,000 of its 1,925,137 workers [25]. Then, nationally and in
this order, manufacturing 34,697, wholesale trade 27,786, transport and warehousing 16,531 and
construction 10,509 establishments in the band, **89,523** in total, of which **54,555 sit at 11 to
30 people** [26]. Small enough that nobody has an ERP payment module, large enough to have a weekly
run, which is the same pair of conditions the persona above is built on. The sector order is a
judgement about supplier-list length and account churn, not a published ranking, and
`docs/04-market.md#where-the-segment-actually-is` says so. Narrowed to Nuevo León and to the first three
of those sectors, the segment is **6,476** establishments, **6,114** of them metropolitan [48]. The
municipality-level count for Apodaca, where Metalicos del Norte sits, is now verified rather than left
open: **2,511** establishments in the band across all sectors and **857** in those three sectors [48].

### 5. Four anti-users, each for a different reason

The anti-persona above is one of these. The other three are new, and each is excluded for a stated
reason rather than for being out of fashion.

| Anti-user | The evidence | Why the product does not fit |
|---|---|---|
| Micro firms, 0 to 10 employees | 89.3 percent of Nuevo León's units but only 21.7 percent of its employment [25], and 26.0 percent of them use an accounting system or pay an external accountant against 86.3 percent in our band [24] | No weekly payment run, no supplier base worth sweeping, and often no CFDI pipeline to read. The onboarding is not built for them, which is a decision and not an oversight |
| Large firms, above 250 employees | 0.6 percent of Nuevo León's units, 42.7 percent of its employment and 55.7 percent of its gross census value added [25] | ERP, treasury team and a bank relationship manager. This is the anti-persona above, and it is the band the international payee-verification vendors already sell to (`docs/04-market.md#the-adjacent-international-band-as-analogy-and-labelled-as-such`) |
| Informal units | 35.7 percent of Mexican economic units are formal [1], so most are not | They neither issue nor receive CFDI and do not run SPEI dispersions. Every control reads a CFDI, a CLABE or a CEP, so they are outside the product by construction rather than by choice |
| The despacho as operator | It holds no credentials for the client's bank portal, and 60.4 percent of firms carry out financial operations through that portal themselves [28] | It is the channel and the reviewer, never the sender. Point 3 above |

**What this section is not.** None of these figures describes Lupita, her workload, her employer or
her Thursday. They describe how many people hold her job, where they are, who signs above them and
who sells to them. The operational numbers in this document still come from the deterministic
synthetic company in `packages/seed`, and the two conversations below are still the only thing that
can turn the workflow hypothesis into a finding.

## Pending human validation

The acceptance criterion for two venue conversations is intentionally unchecked. No interview,
quote or observed statistic has been invented.

- [ ] Ask one accountant or external accountant who serves Mexican SMBs.
- [ ] Ask one administrative clerk, owner or operations person who has personally paid suppliers
  for a small company.

Ask both people these questions in this order, without showing SentryOne first:

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
- Synthetic scenario and generator: `packages/seed/src/sentryone/`
- API contract: `docs/09-api.md`
