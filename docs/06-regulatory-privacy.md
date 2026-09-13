# 06. Regulatory posture, privacy and the LLM boundary

Worth 5 points directly (regulatory and operational feasibility) and it is the section the product
judge probes hardest, because almost no hackathon team writes it.

**This is a framework map, not legal advice.** It lists which Mexican regimes attach to which part
of SentryOne and what obligation each one creates, so that an engineer or a product person can
check that we thought about the right things. It is not an opinion on compliance and it was not
written by counsel. Any production deployment needs a licensed review.

Every legal claim below was read in the primary source on 2026-09-12 and the source is named in
section 9. Where a source contradicted something we had assumed, the assumption was changed and the
change is flagged. Nothing here is quoted from memory.

Owner: Fabricio (`FabriBanda`), with the lead on the LLM boundary. Due M2.

## 1. Our legal position

Stated first, because stating it first is what separates a team that thought about this from a team
that did not.

- **We are payer-side software.** SentryOne sits between the company's own documents and the
  company's own bank portal. It reads the CFDI ledger, the payment instructions that arrived by
  email or WhatsApp, the public SAT list and the CEP of the company's own payments, and it ranks
  what the clerk should look at before pressing send.
- **We move no money.** No funds are held, no electronic payment funds are issued, administered,
  redeemed or transmitted, no credit is originated, no transfer is executed. The one-cent probe in
  control 5 is sent by a person from the company's own bank, not by us.
- **No licence under the Ley para Regular las Instituciones de Tecnología Financiera.** That law
  reserves two activities. Article 15 reserves putting the public in contact so that financing is
  granted between them (IFC). Article 22 reserves the issuance, administration, redemption and
  transmission of electronic payment funds, which "solo podrán prestarse por las personas morales
  autorizadas por la CNBV" as IFPE. We perform neither, so no authorisation attaches. This is a
  statement about two named articles, not a general claim that fintech law does not reach us.
- **We are not a credit bureau.** We do not consult and we do not report. We produce no score about
  a person or a company, and no finding, explanation or decision leaves the client that paid for it.
  ADR-0006 adds one shared table and it is deliberately not a registry about anyone: salted hashes of
  a supplier and an account, a bank code, one of four outcomes and a date, with no name, no amount
  and no identity of the company that wrote the row. Nothing in it is a rating, is derived from a
  rating, or can be read back as one. Section 8 lists what leaves and what never does. The verified
  beneficiary registry itself, with its names and its CEPs, stays inside the company that built it.
- **We are not an Institución Financiera for CONDUSEF purposes.** Article 2, fracción IV of the Ley
  de Protección y Defensa al Usuario de Servicios Financieros enumerates what counts as one, and
  software sold to a payer is not on the list. The complaint path about a transfer stays with the
  user's bank.
- **We are not an insurer and we do not intermediate insurance.** The make-whole and the delay credit
  proposed in `docs/05-business-model.md#when-a-released-payment-is-fraud-what-the-client-gets` are
  capped against our own fees, never indemnity of the client's loss, and the insurance layer above
  them is written by an authorised insurer. Section 2.2 carries the four articles that make that
  distinction the whole design rather than a preference.
- **No automated adverse action.** Nothing declines, blocks, scores down or reports anyone without a
  person deciding. That one design rule removes most of the regime we would otherwise be inside, and
  section 5 shows it is enforced by the domain types rather than by a promise.

ADR-0002 fixes the day-one path: payer-side software sold to the company, or to the accounting firm
that holds the XML of thirty companies. The white-label path, where an institution embeds SentryOne
inside its own perimeter and its own authorisation, is still open as headline or year-two expansion
in the `TODO(garzario)` in `docs/05-business-model.md`. Both paths are compatible with everything
below, because in the second one the institution's obligations are added to ours, not substituted
for them.

## 2. Framework map, Mexico

| Regime | What it governs | Does it attach to us | Obligation it creates, and who carries it |
|---|---|---|---|
| Ley para Regular las Instituciones de Tecnología Financiera (DOF 09-03-2018, last reform DOF 14-11-2025) | The two reserved ITF activities: crowdfunding (art. 15) and electronic payment funds (art. 22) | No, as built. We neither intermediate financing nor issue, administer, redeem or transmit electronic payment funds | If a future version ever holds a balance for a client, art. 22 turns on and the answer changes. Record the trigger, do not cross it in a prototype |
| CNBV and Banco de México supervision (art. 3 of the same law) | Authorisation and supervision of ITFs, each within its own scope | Not directly. We supervise nobody's money because we hold nobody's money | In the white-label path the supervised perimeter is the institution's, and our obligation is contractual to them |
| Open finance, arts. 76 and 77 of the same law | Standardised APIs over three data classes: datos financieros abiertos, datos agregados and datos transaccionales | Only as a possible future consumer. Art. 76 lists the obligated entities and we are not one | Datos transaccionales are, in the law's own words, personal data of the client and "solo podrán compartirse con la previa autorización expresa de éstos". Today we read documents the client already holds and hands us, which needs no API at all |
| Banco de México, SPEI and the CEP | The interbank payment system and the public receipt of an accepted transfer order | Indirectly and centrally. The whole product lives in the window before the transfer is instructed | We never instruct a transfer. We inform before the step the client cannot take back. The CEP is consulted only for the client's own payments, see section 4.3 |
| CONDUSEF, Ley de Protección y Defensa al Usuario de Servicios Financieros (DOF 18-01-1999, last reform DOF 14-11-2025) | Protection of users of financial services, transparency, and the complaint process | Not as built. Art. 2, fr. IV does not list software vendors among Instituciones Financieras | Clear terms, no misleading claims, and a named path for a user who disagrees. The disclaimer in the README and the UI footer carries this in the prototype |
| LFPDPPP (nueva ley DOF 20-03-2025, last reform DOF 14-11-2025) | Personal data held by private parties: aviso de privacidad, consent, purpose limitation, retention, ARCO, transfers | Yes, in production. Not in the prototype, which holds no real personal data | The whole of section 4. Note the regulator changed: art. 2, fr. XV defines Secretaría as the Secretaría Anticorrupción y Buen Gobierno, not INAI |
| Ley para Regular las Sociedades de Información Crediticia | Consultation and reporting of credit behaviour, and the consent a consultation needs | No. We are not a SIC, we consult none and we report to none | If a lending partner ever consults a bureau, the consent and the decision are theirs, and that boundary is written into the referral flow rather than assumed |
| Ley de Instituciones de Seguros y de Fianzas (nueva ley DOF 04-04-2013, last reform DOF 14-11-2025) | Who may underwrite insurance in Mexico, who may intermediate it, and what counts as an operación activa de seguros | Not as built, and it would the moment we promised money on an uncertain event. The commitment in `docs/05` is a credit and a refund of our own fees, and the loss layer belongs to an authorised insurer | Art. 20 reserves the practice to authorised Instituciones and Sociedades Mutualistas, art. 23 also prohibits offering or intermediating one, art. 93 makes an intermediary need a CNSF authorisation, and art. 495 fr. I attaches three to fifteen years of prison. Section 2.2 |
| Código Fiscal de la Federación, arts. 69, 69-B and 69-B Bis (last reform DOF 09-04-2026) | Fiscal confidentiality and its exceptions, presumption of non-existent operations, and improper transfer of tax losses | Yes, as the data source and as the risk we quantify | Sections 2.1 and 3. The list is published by order of the statute, which is what makes reading it lawful and what makes the exposure real |
| Código Fiscal de la Federación, arts. 49 Bis, 17-H Bis fr. XIV, 29-A fr. IX and 113 Bis, all added or reformed by the decree DOF 07-11-2025 and in force from 1 January 2026 | The express visit that determines a taxpayer's CFDI are false, the publication of that taxpayer, the buyer's thirty natural days to correct, the restriction of the buyer's own digital seal when they do not, and the two-to-nine-year penalty for giving fiscal effect to a false CFDI | Yes, as a second data source and a second clock | Section 3.3. It is the newest half of the fiscal hook and the one that points at our own user rather than at the supplier |
| PCI DSS | Card data handling | Not applicable as built, and we behave as if it were | Never store a PAN. Nessie's `account_number` is synthetic and is still treated as sensitive: never logged, never in a screenshot, never in an issue |

**What we have not mapped.** Anti-money-laundering obligations under the Ley Federal para la
Prevención e Identificación de Operaciones con Recursos de Procedencia Ilícita. We believe no
vulnerable activity is performed, because we neither receive nor transmit resources, but we did not
read that statute today and we will not assert a conclusion we did not verify.
`TODO(FabriBanda)`: read it, or hand it to counsel, before any pilot with real money behind it.

### 2.1 Why the SAT list is public information we may read

The chain is four steps and every step is in a statute.

1. Article 69, first paragraph of the CFF imposes "absoluta reserva" on SAT personnel over taxpayer
   declarations and data, and then says that reserve "no comprenderá los casos que señalen las leyes
   fiscales".
2. Article 69-B is exactly such a case. Its fourth paragraph orders the SAT to publish "un listado
   en el Diario Oficial de la Federación y en la página de Internet del Servicio de Administración
   Tributaria" of the taxpayers who did not rebut the presumption, and its sixth paragraph orders a
   further list, published quarterly, of those who did rebut it and those who obtained a firm
   resolution or judgment leaving the original resolution without effect.
3. Article 2, fracción X of the LFPDPPP defines a fuente de acceso público as a database, system or
   archive that "por disposición de ley puedan ser consultadas públicamente". A list the CFF orders
   published in the Diario Oficial de la Federación is that.
4. Article 9, fracción II of the LFPDPPP says consent is not required when the personal data
   "figuren en fuentes de acceso público".

So checking a supplier RFC against the 69-B list needs no consent from the supplier. What that chain
does not authorise is anything else: it is a licence to read a published fact, not a licence to
publish a conclusion about the person named in it. Section 7 is the operational consequence.

### 2.2 What we may promise when a released payment turns out to be fraud

A second Capital One panel asked on the evening of 2026-09-12 whether the subscription should include
an insurance policy covering losses up to an amount per tier. The commercial answer, in four layers,
is in `docs/05-business-model.md#when-a-released-payment-is-fraud-what-the-client-gets`, the fourth of
them for the opposite error, a legitimate payment the product held. This is the
legal half of it, read in the Ley de Instituciones de Seguros y de Fianzas, texto vigente, nueva ley
DOF 04-04-2013, last reform DOF 14-11-2025, on 2026-09-12. The articles are the statute's own
numbering.

**Only an authorised insurer may underwrite.** Article 20, first paragraph: "Se prohíbe a toda persona
física o moral distinta a las Instituciones de Seguros y Sociedades Mutualistas autorizadas en los
términos de esta Ley, la práctica de cualquier operación activa de seguros en territorio nacional."
That authorisation comes from the Federal Government and article 11 gives it to the Comisión to grant
discretionally, with prior agreement of its Junta de Gobierno, and says the authorisations are
intransmissible. Article 2, fracción VI defines Comisión as the Comisión Nacional de Seguros y
Fianzas. So there is no version of this where we borrow, rent or buy somebody's authorisation.

**What counts as the reserved activity, which is the sentence that shapes our commitment.** Article
20, second paragraph: "se considera que se realiza una operación activa de seguros cuando, en caso de
que se presente un acontecimiento futuro e incierto previsto por las partes, una persona, contra el
pago de una cantidad de dinero, se obliga a resarcir a otra un daño, de manera directa o indirecta o a
pagar una suma de dinero." Read that against a subscription that pays out when a released payment
turns out to be fraud and the resemblance is the point rather than a technicality. The third paragraph
carves out selling goods or services forward, but only "cuando el cumplimiento de la obligación
convenida, no obstante que dependa de la realización de un acontecimiento futuro e incierto, se
satisfaga con recursos e instalaciones propias de quien ofrece el bien o el servicio y sin que se
comprometa a resarcir algún daño o a pagar una prestación en dinero". The exception therefore holds
while we stay inside our own service and stops the moment we commit to indemnify a damage or to pay a
sum of money.

**The product rule that follows, and it is a design rule and not a disclaimer.** The early-phase
commitment is written as shadow mode, a service credit and a refund capped at the fees the client
actually paid us, because returning our own consideration is a price remedy. It is never written as a
payment sized to the client's loss. The difference is not cosmetic: article 24 says contracts
concluded against article 20 "no producirán efecto legal alguno", so a guarantee drafted the wrong way
is worth nothing to the client who relied on it, and article 495, fracción I punishes practising an
operación activa de seguros, or acting as an intermediary in one, with "prisión de tres a quince años
y multa de 5,000 a 20,000 Días de Salario". A promise that voids itself and criminalises the promiser
is not a commercial risk we are willing to run for a nicer slide.

**The same boundary draws the credit for a delay we caused.** The fourth layer in `docs/05` pays a
service credit when the product held a payment that was fine, and it is written the same way round for
the same reason. The credit is the days the payment sat times a price we published ourselves,
`Supplier.delayCostPerDay`, capped at the subscription, and it is applied against the next invoice
rather than paid out. No proof of loss is asked, and that is a legal design choice before it is a
commercial courtesy: asking the client to evidence a lost sale and then paying against that evidence is
resarcir un daño, which is the verb article 20 uses, and it would turn a discount on our own price into
the reserved activity. The third paragraph of article 20 holds while the obligation is satisfied "con
recursos e instalaciones propias de quien ofrece el bien o el servicio", and a credit against our own
invoice is exactly that.

**The question is answerable rather than a matter of opinion, and the statute says who answers it.**
Article 20, last paragraph: "La Secretaría, oyendo la opinión de la Comisión, podrá establecer
criterios de aplicación general conforme a los cuales se precise si una operación, para efectos de
este artículo, se considera operación activa de seguros, y deberá resolver las consultas que al efecto
se le formulen." `TODO(FabriBanda)`: the make-whole is labelled a proposal in `docs/05` precisely
because this consultation has not been filed and counsel has not reviewed the wording. Neither the
cap nor the word guarantee goes into a contract, a price list or the UI before both have happened.

**Intermediating somebody else's policy is also reserved.** Article 91, second paragraph, reserves the
intermediation of insurance contracts that are not contratos de adhesión "exclusivamente a los agentes
de seguros", and article 93 requires the Comisión's authorisation to act as one, intransferible by its
own terms. So SentryOne cannot sell, quote or advise on a policy either.

**The one lawful channel, and it comes with a filing and a supervisor.** Article 102 allows insurance
formalised through contratos de adhesión, other than social-security pensions and caución, to be
contracted "a través de una persona moral, sin la intervención de un agente de seguros". The insurer
may pay that persona moral for services other than the ones the law reserves to agents, the text of
that service contract must be registered with the Comisión beforehand, which has fifteen business days
to refuse it and may order corrections, and the persona moral is then "sujeta a la inspección y
vigilancia de la Comisión" for those operations. That is the shape of the year-two insurance layer:
an authorised insurer underwrites, SentryOne's evidence is the underwriting input, the distribution
contract is registered with the CNSF, and we accept being inspected for that part. It is a real path,
it is not a hackathon path, and saying so is the honest version of the answer.

**What we did not verify.** Whether any Mexican insurer underwrites the specific loss, a transfer the
client's own clerk authorised from the client's own banking portal to an account that turned out to
belong to somebody else. The three Mexican wordings we opened are listed in `docs/05`, and the one
that comes closest excludes both halves of it. We also did not read the Ley sobre el Contrato de
Seguro today, so nothing here is asserted about what may be insured or about the insurable interest.
`TODO(FabriBanda)`: read it with counsel in the same session as the article 20 consultation.

## 3. What Articles 69-B, 69-B Bis and 49 Bis actually say

Read in the Código Fiscal de la Federación, texto vigente, last reform published DOF 09-04-2026.
Paragraph numbers are the article's own.

### 3.1 Article 69-B, the article the product is built on

- **The presumption.** When the authority detects that a taxpayer has been issuing comprobantes
  "sin contar con los activos, personal, infraestructura o capacidad material, directa o
  indirectamente" to deliver what those comprobantes cover, or that the taxpayer is not locatable,
  "se presumirá la inexistencia de las operaciones amparadas en tales comprobantes". A tenth
  paragraph added in 2021 extends the presumption to a taxpayer issuing comprobantes that back
  another taxpayer's operations while that other taxpayer's certificado de sello digital was
  cancelled or restricted under arts. 17-H and 17-H Bis.
- **Notice and rebuttal.** The SAT notifies through the buzón tributario, its own website and the
  Diario Oficial de la Federación. The taxpayer has **fifteen days** from the last notice to present
  evidence, plus one **five-day** extension requested through the buzón, which is granted without
  the authority having to say anything.
- **Resolution.** The authority has **fifty days** to weigh the evidence and notify. Within the first
  twenty of those it may request more information, which suspends the clock for the ten days the
  taxpayer has to answer. If it does not notify within the fifty days, the presumption is void.
- **The definitive list.** The SAT publishes in the DOF and on its website the taxpayers who did not
  rebut, never before **thirty days** after the resolution was notified.
- **The effect, and it is retroactive.** Publication means, "con efectos generales", that the
  operations in that taxpayer's comprobantes "no producen ni produjeron efecto fiscal alguno". The
  past tense is the entire reason control 1 replays the ledger: deductions and acreditamiento
  already taken are undone, not merely blocked going forward.
- **The buyer's clock.** Anyone who gave any fiscal effect to those comprobantes has **thirty days
  from the publication** either to prove they really acquired the goods or received the services, or
  to correct their situation through complementary returns. This window is the product. A sweep that
  surfaces the exposure on day 2 of 30 is worth something a sweep on day 45 is not.
- **What happens after the clock.** The authority determines the créditos fiscales, and the
  operations "se considerarán como actos o contratos simulados para efecto de los delitos previstos
  en este Código".
- **And the buyer gets listed too.** Article 69, twelfth paragraph, fracción IX removes the
  confidentiality of the name and RFC of anyone who used, for fiscal purposes, comprobantes covering
  non-existent operations and did not demonstrate materialisation within the article 69-B
  eighth-paragraph window, unless they corrected in time. The SAT publishes those names on its
  website. The clerk's downside is not only a tax bill, it is their own employer's name on a public
  list, with an aclaración procedure the authority resolves in three days.

This is why `SatListStatus` in `packages/core/src/domain.ts` has exactly four values. `presunto`,
`desvirtuado`, `definitivo` and `sentencia_favorable` are not product vocabulary, they are the four
states the statute creates, and `SatListEntry.publishedAt` plus `listVersion` exist because the
thirty-day clock runs from a publication date and because the sixth paragraph means the list is
corrected over time in both directions.

### 3.2 Article 69-B Bis, and why we deliberately do not use it

Article 69-B Bis is about something else entirely: the presumption that the right to reduce tax
losses was improperly transferred, when a taxpayer holding that right was part of a restructuring,
spin-off, merger or change of shareholders and consequently left the group it belonged to, and one
of six listed situations applies. The six are losses above assets in the first three years with more
than half of deductions from related parties, a later loss driven by related-party deductions that
grew more than 50 percent, a drop of more than half in material capacity after transferring assets,
segregation of property rights ignored in the cost basis, a change in the investment deduction
treatment before half of it was taken, and deductions settled by a means of payment the income tax
law does not admit.

The procedure is its own: notice by buzón tributario, **twenty days** to answer, one **ten-day**
extension, up to **six months** for the authority to resolve, recurso de revocación against the
resolution, and a list published in the DOF and on the SAT site of those who did not rebut, again
never before thirty days after the resolution. Correcting within thirty days of that publication
gets the recargos por prórroga rate. After that, facultades de comprobación under art. 42, fr. IX,
and the transfer counts as a simulated act for the crimes in the Code.

**It is a different list about a different risk and we do not wire it into supplier screening.**
Appearing in the 69-B Bis list says nothing about whether a supplier's invoice to us is real. Using
it as a supplier red flag would be exactly the kind of plausible, wrong inference this document
exists to prevent.

That was an open question until 2026-09-12 and it is now closed, in the negative, and with the file
in hand rather than on principle alone. The 69-B Bis listing is published as open data, three CSV
files next to the 69-B ones, and the complete one holds **three taxpayers** at a cut-off of 5 June
2026: two `Definitivo` and one `Sentencia Favorable`. So the question was never whether we could load
it. We do not, because a supplier's name on a list about loss transfers is not evidence about the
invoice in front of the clerk, and because three taxpayers nationally would not be a screening signal
even if it were. If a future version ever surfaces it, it is a separate control with its own copy,
never a row inside the SAT lists control. `packages/sat/src/snapshot/README.md` records the file, its
size and its cut-off so the decision can be re-examined against data rather than memory.

### 3.3 Article 49 Bis, the newest list, and the clock that points at our own user

Article 49 Bis did not exist when this product's thesis was written. It was added by the decree
published in the DOF on 7 November 2025 and is in force from 1 January 2026 by that decree's
Transitorio Primero, and it changes who carries the risk.

- **A different procedure and a much faster one.** It governs the express home visit of art. 42, fr.
  V, inciso g). The order itself states why the authority presumes the taxpayer's CFDI are false and
  **suspends that taxpayer's invoicing from the moment it is delivered**, with art. 17-H Bis
  expressly not applying (fr. I). The taxpayer has **five business days** to offer evidence (fr. V),
  the authority **fifteen business days** to resolve (fr. VIII), and the whole procedure closes
  within **twenty-four business days** (fr. IX). Article 69-B runs on fifteen days plus fifty; this
  one runs in under a month.
- **A different finding.** Inciso b) of fr. VIII: the taxpayer did not rebut, so the CFDI "se
  consideran falsos con efectos generales" for failing art. 29-A, fr. IX, which the same decree added
  and which reads, in full, "Amparar operaciones existentes, verdaderas o actos jurídicos reales", and
  the operations "no producen ni produjeron efecto fiscal alguno". Same retroactivity as 69-B, in the
  same past tense, for a different reason: not that the operation never happened, but that the
  document is false.
- **The publication, and the gap before it.** Fr. X: the name and the RFC are published in the DOF
  and on the SAT portal **within forty-five business days** of the notification of the resolution
  taking effect. Between the resolution and the publication the supplier is already condemned and on
  no list anybody can read, which is precisely the window where controls 2 and 4, the CLABE forensics
  and the change in supplier behaviour, have to carry the decision alone.
- **Thirty natural days, and then our own user's seal.** Still fr. X: the third parties who received
  those CFDI must reverse the fiscal effect through a complementary return within **thirty natural
  days of the DOF publication**, and if they do not, the authority **temporarily restricts their own
  certificado de sello digital** under art. 17-H Bis, fr. XIV, which the same decree added. Natural
  days, so weekends count. This is the single most important sentence in this section: the sanction
  for missing the window is not a tax bill, it is that the clerk's own company cannot invoice.
- **And the criminal exposure moved to the buyer.** Fr. XI: the SHCP "procederá penalmente contra
  cualquier actividad relacionada con comprobantes fiscales falsos", in the terms of art. 113 Bis,
  whose second paragraph, added by the same decree, now covers whoever "expida, enajene, compre,
  adquiera o **dé efectos fiscales** a comprobantes fiscales falsos", two to nine years. A third
  paragraph, also new, says the offence is investigated independently of the state of the
  administrative procedure, and the article still requires a querella from the SHCP to prosecute.
  It names no other body, so neither do we: the fraccion does not mention the Ministerio Público
  and an earlier version of this section said it did.

**What we do with it, stated exactly.** `packages/sat/src/art49bis.ts` holds the loader for the
published layout, the thirty day window and a retroactive sweep that prices already deducted invoices
with the same arithmetic as the 69-B one; `packages/engine/src/sat49bis.ts` produces its own finding,
in Spanish, naming the article, the publication date, the days left and the seal restriction that
follows. The finding is always `comprobable` and never `requiere_verificacion`, because unlike
`presunto` there is no rebuttal period left to wait out: fr. X publishes a resolution that is already
final.

**What we deliberately do not claim.** The SAT publishes this list **one oficio at a time as a DOF
note** and ships no machine-readable file: its open-data catalogue carries arts. 69, 69-B and 69-B Bis
and nothing for 49 Bis, and on 2026-09-12 the DOF held fourteen such oficios naming fourteen
taxpayers, from 10 July to 28 August 2026. So `GET /api/v1/sat/lookup` answers for that list with
`answered: false` and `coverage: "not_published_machine_readable"`, carrying those counts and the URL
to check them, and no screen in this product says a supplier is clear of the 49 Bis list. The
provenance, the column layout of the `Anexo 1` table, all fourteen note ids and the manual steps to
load a new publication are in `packages/sat/src/snapshot/README.md`, and `docs/04-market.md` carries
the same statement where it is a competitive claim rather than a legal one.

One consequence for this document's own subject matter. A 49 Bis publication is public data of the
supplier, exactly like a 69-B one, so section 2.1 covers reading it unchanged. What is NEW is that
the thirty day clock makes a date on our screen operative: a wrong deadline would push a client past
fr. X. That is why `correctionDeadline` counts the publication day as day one, which is the reading
that errs early rather than late, and why the code says in as many words that it is a reading and not
a holding. Article 12 of the CFF settles how days are counted, not when a plazo "a partir de la
publicación" begins, and we did not find a rule that settles the latter today.

## 4. Personal data, under the LFPDPPP in force

The applicable statute is the **new** Ley Federal de Protección de Datos Personales en Posesión de
los Particulares, published DOF 20-03-2025, last reform DOF 14-11-2025. It replaced the 2010 law and
it moved the authority: art. 2, fr. XV defines Secretaría as the Secretaría Anticorrupción y Buen
Gobierno. Article 2, fr. VIII also defines Días as días hábiles, so every deadline below is in
business days.

### 4.1 What personal data SentryOne would touch in production

| Data | Where it comes from | Why it is personal data |
|---|---|---|
| Beneficiary account holder name on a CEP | The receiving institution's Confirmación de Abono, retrieved for the client's own payment | It names whoever received the money. When the beneficiary is a persona física con actividad empresarial it is plainly personal data |
| Supplier legal name, RFC and contact | The client's own CFDI ledger and payment instructions | An RFC of a persona física identifies that person directly |
| The clerk's identity | The `X-Actor` header, stored as `Decision.decidedBy` plus `decidedByRole` and as `actor` on the ledger events a person caused | It records who authorised a payment and in what capacity, which is data about an employee. See 4.4 for why the header is not authentication |
| Voice notes and photographs of payment instructions | WhatsApp and email intake | A voice is biometric-adjacent, and an image of a document may carry a signature or a phone number |

We treat all four as personal data and apply the law to all four. Whether a persona moral is a
titular under art. 2, fr. XVIII of the new law is a genuine question and we do not resolve it by
assumption. Treating supplier records as protected costs us nothing and is the only safe default.
`TODO(FabriBanda)`: one question for counsel, phrased exactly that way.

### 4.2 The obligations that attach, and how the product satisfies them

- **Purpose limitation, art. 11.** Treatment is limited to the purposes stated in the aviso de
  privacidad, and a different purpose requires consent again. Our stated purpose is one sentence:
  screening this company's own outgoing payments before they leave. That sentence forbids selling
  aggregated supplier behaviour, training a shared model on client ledgers, and pooling the verified
  beneficiary registry across clients. All three are attractive and all three are out.
  **Changed on 2026-09-12, and flagged rather than quietly rewritten.** An earlier version of this
  bullet forbade pooling across clients in general. ADR-0006 adds a cross-tenant network that pools
  four facts and no registry: two salted hashes, a public bank code and an outcome, described in
  section 8. That is narrower than what this bullet ruled out and it is still a second purpose, so it
  needs the aviso to name it and it is opt-in per tenant rather than on by default. The registry
  itself, with its names, its CEPs and its amounts, stays inside one tenant and is still out.
- **Proportionality, art. 12.** Treatment must be necessary, adequate and relevant to that purpose.
  This is the reason `Cep` stores the beneficiary name rather than a full statement, and the reason
  the OCR path keeps the CLABE and the confidence rather than the whole photograph once extraction
  succeeded.
- **Consent, art. 7.** Consent may be tacit as a general rule, but the fifth paragraph is explicit:
  "Los datos financieros o patrimoniales requerirán el consentimiento expreso de la persona
  titular", subject to arts. 9 and 36. Two of the art. 9 exceptions carry most of our weight,
  fr. II for the SAT list as a fuente de acceso público, and fr. IV for data required to exercise a
  right or comply with obligations arising from a legal relationship between the titular and the
  responsable, which is what a supplier relationship is. Consent is revocable at any time and the
  aviso must say how.
- **Retention, art. 10.** Once data stop being necessary for the stated purposes they "deberán ser
  suprimidos previo bloqueo", after the retention period ends. Bloqueo is defined in art. 2, fr. III
  as keeping the data, untreatable, for the sole purpose of determining possible responsibility,
  until the legal or contractual prescription period runs out. The same article imposes a hard
  **seventy-two month** limit on data about breach of contractual obligations. Our retention
  schedule therefore has to be written per data class rather than as one number.
  `TODO(FabriBanda)`: write that schedule as a table before any pilot, with the fiscal retention
  period as the floor for CFDI-derived records.
- **ARCO, arts. 21 to 33.** Any titular may request access, rectification, cancellation or
  opposition. Article 31 gives the responsable **twenty days** to communicate the determination and
  **fifteen days** after that to make it effective, each extendable once. Article 33 permits refusal
  when a third party's rights would be harmed, which is the article that governs a supplier asking
  for the client's internal findings about them. The answer to such a request is the data we hold
  about them, not our client's decision record.
- **Transfers, arts. 35 and 36.** A transfer is defined in art. 2, fr. XX as communication of
  personal data to someone other than the titular, the responsable **or the encargado**. A processor
  acting on our behalf under art. 2, fr. XII is an encargado, so routing data to one is not a
  transfer. That distinction is what section 6.2 turns on, and it holds only if the contract
  genuinely makes the provider an encargado with no use of the data for its own purposes.
  `TODO(FabriBanda)`: read the model provider's data processing terms and record the verdict here
  before any real client data exists.

### 4.3 The CEP, read against its own terms of use

Banco de México's CEP portal is a public verification instrument and it is the strongest external
evidence in the product, but its own page sets three limits that change the design. All three were
read on the portal on 2026-09-12.

1. **It is not an oracle over other people's payments.** The portal states that CEPs "se emiten con
   fines informativos y están dirigidos únicamente a los usuarios del Sistema de Pagos Electrónicos
   Interbancarios (SPEI) relacionados con la Orden de Transferencia Aceptada correspondiente", and
   that obtaining one requires the user to supply confidential information previously agreed with
   the institution. Retrieval needs the date, the clave de rastreo or the número de referencia, both
   institutions, the beneficiary account and the exact amount. **Product rule: SentryOne retrieves a
   CEP only for a payment the client itself made.** `POST /api/v1/cep/verify` must never become a
   general lookup, and the demo must not imply that it is one.
2. **Banxico is the publisher, the receiving bank is the author.** The portal states that CEPs "se
   generan con base en la información proporcionada por las entidades receptoras de los pagos
   (Participantes Emisores de las Confirmaciones de Abono) bajo su responsabilidad exclusiva" and
   that Banco de México "no tiene responsabilidad alguna sobre tal información". The accurate claim,
   and the one the pitch has to make, is that the CEP is the receiving institution's own confirmation
   of who was credited, published through a Banco de México channel anyone can check. Saying that
   Banxico certifies the beneficiary name overstates it, and a judge who opens that page will see it.
   `TODO(FabriBanda)`: align the wording in ADR-0002 and `docs/11-pitch.md` with this.
3. **Validation expires.** The separate CEP validator accepts the receipt in XML and states that it
   "solo puede validar comprobantes electrónicos de pago emitidos en los últimos 45 días hábiles",
   for CEPs issued from 16 March 2018 onward, up to five at a time. The consultation portal itself is
   open 09:30 to 23:00 every day of the week. **Architectural consequence: the verified beneficiary
   registry has to store the validation verdict and the byte-exact XML at the moment of
   verification**, because after 45 business days the verdict can no longer be reproduced.
   `domain.ts` already keeps `Cep.signatureValid` and `Cep.xml` for exactly this reason.
   `TODO(garzario)`: add `validatedAt` to `Cep` so a stored verdict carries the date it was obtained,
   and make the UI show the age of a verification instead of presenting it as timeless.

### 4.4 The identity selector is a demo affordance, not authentication

Every write endpoint requires an `X-Actor` header carrying a name and a role, the API records it on
the append-only ledger, and the browser sends it from `apps/web/src/lib/actor.ts`, which holds the two
people of the synthetic company and remembers the choice in `localStorage`. **None of that is
authentication and this page says so rather than letting a reader assume it.** The header is chosen by
the caller, nothing verifies it, there is no password, no session and no account, and a `curl` can
claim to be the owner as easily as the browser can.

Since issue #215 that choice is on a screen: **Entrada y ajustes** at `#/entrada` lists the two people
of the synthetic company, switching one changes the header every subsequent write carries, and the
capability list under it is run through the same `decideRequirement` the API enforces, so the screen
cannot offer something the API would answer `403` to. **It is still a selector and not a login**, and
the screen says that on the screen rather than leaving it to this file, because a judge who assumes a
login exists has been misled by the absence of the sentence.

What the header is for is the thing ADR-0002 does demand: that every action on somebody's money has
a person's name against it in a record nobody can rewrite. That is an accountability requirement and
it is satisfied by recording the identity. It is not an access-control requirement, and we do not
claim to satisfy one.

Why it is built this way rather than with a login:

- The product is opened in the middle of a payment run by one clerk who is already authenticated into
  her bank and her CFDI portal. A registration step in front of "stop this payment" is the step that
  makes somebody pay first and check later, which is the failure this product exists to prevent.
- The 36 hours are better spent on the six controls than on a session store. An authentication
  system built in a hackathon is the worst of both worlds: it looks like a control and it is not one.
- The boundary is honest in the code. `ACTOR_HEADER` in `apps/api/src/middleware/actor.ts` carries
  this paragraph in its own comment, `docs/09-api.md` says the header is caller-controlled, and
  `apps/web/src/lib/actor.ts` says it in the data layer the selector reads.

What production needs, and none of it is in this repository:

| Need | What it means here |
|---|---|
| Authentication in front of the API | An identity provider the client's company already runs, terminating at the edge. The API keeps reading the same header, now written by something that verified who the caller is rather than by the caller |
| A verified subject, not a typed name | The header value becomes a claim from a signed token, so `Actor.name` is what the provider asserts and not what a request said |
| Authorisation that survives a replay | The role rule in `packages/core/src/actor.ts` stays exactly as it is, because it is a product rule about exceptions. What changes is that the role is taken from the token rather than from the request |
| Per-company tenancy | SentryOne in production is multi tenant and the ledger is per company. Nothing in this repository enforces a tenant boundary on a write, because this repository holds one synthetic company |
| A session record | Who logged in, from where and when, which is a different log from the ledger of what was done. The LFPDPPP obligations in 4.2 attach to both |

The clerk's identity is personal data about an employee, which is why it is in the table in 4.1 and
why it is treated under the same obligations as everything else on this page: it is recorded because
the product has to be able to answer who released a payment, it is kept for the retention period of
the ledger it belongs to, and it is never sent to a language model. `TODO(garzario)`: when the
authentication sits in front of the API, state in this section which provider terminates it and what
the token carries.

## 5. Ethics: nothing here accuses anyone

- **No automated adverse action.** Nothing is declined, blocked, reported or scored by the system
  alone. `Action` is `hold`, `verify` or `release`, and all three are instructions to a person about
  the client's own money. None of them does anything to the supplier.
- **The domain types carry the rule.** `FindingState` is `comprobable` or `requiere_verificacion`.
  There is deliberately no third value meaning fraudulent. The product cannot express an accusation
  because the domain has no word for one. `Decision.decidedBy` is optional and absent until a person
  confirms, so a machine suggestion and a human decision are structurally distinguishable and the UI
  can never render one as the other.
- **Copy rule: state what is provable, never what it implies.** A finding says that this CLABE has
  never appeared in a payment complement from this supplier, and that the check digit is valid but
  the plaza does not match the supplier's history. It does not say that someone is impersonating the
  supplier. The first is a fact about our documents. The second is an allegation about a person, and
  we are not in a position to make it.
- **`presunto` is not a verdict, and the statute agrees.** A supplier newly on the list has fifteen
  days plus five to rebut, and the SAT publishes quarterly the list of those who succeed. So the UI
  shows the status and the publication date, treats `desvirtuado` and `sentencia_favorable` as
  clearing, and never renders a presumption as a finding of fact. A supplier that clears has to clear
  inside our product too, on the next list version, without anyone having to ask.
- **Both errors are real and they are not the same kind of harm.** A false positive delays a supplier
  who needs the money, which is a real harm to a third party who did nothing wrong. A false negative
  loses the client's money and can put the client's own name on a SAT list under art. 69, fr. IX.
  That is why `Metrics` reports `falsePositiveRate` next to precision and recall, and why ADR-0002
  requires the generator and the labelled holdout to be written by different people from the
  detectors, so the numbers are blind rather than flattering.
- **The one outcome that outlives the run is a fact, not an allegation.** `fraud_reported` is the
  only value in the consortium vocabulary that carries anything adverse about a counterparty, and
  three things hold it in place. It exists only because a person in some tenant decided it, since
  outcomes come from the registry a clerk signs and not from a detector. It names nobody: what the
  network holds is a count of reports against a hashed pair. And it is read as what it is, a number of
  other companies that reported this pair, never as a verdict about a supplier. Section 8.3 carries
  the retention consequence, because this is the data class art. 10 caps at seventy-two months.
- **We do not score people.** No function in `packages/core` produces a rating about a person or a
  company that outlives the payment run it was computed for. If a future version ever informs a
  lending decision, the features used and their distributions have to be auditable before it ships,
  and that is a precondition, not a backlog item.
- **Explainability is a product feature, not a compliance chore.** Every `Finding` carries
  `explanation` in plain Spanish and `evidence` as machine-readable values, which is also why the
  engine is deterministic. A reason the clerk can repeat to their boss is the same artifact a
  regulator would ask for.
- **This product gives information, not financial advice, and it is not a fiscal opinion.** Stated in
  the README, in the UI footer, and out loud in the demo.

## 6. The LLM boundary and its unit economics

Capital One allows third-party LLMs with explicit awareness of privacy, regulation, ethics and cost
per transaction. Here is all four in one rule.

> **No LLM in the decision.** Every control is computed by deterministic rules and statistics in
> `packages/core`. A model is used in exactly three places and none of them is the decision. Two are
> transcription of something a human already sent us: **OCR of a CLABE that arrived as an image**,
> and **transcription of a voice note**. The third is the **assistant panel**, which reads what the
> engine already computed, answers in Spanish and offers a card a person presses (ADR-0007, section
> 6.4 below). The model reads characters, it reads evidence, and it writes sentences. It never
> judges, never scores, never ranks and never decides.

Recorded as `docs/adr/0004-llm-boundary-and-privacy.md`.

### 6.1 Why transcription is not a decision, and how that is enforced

The sharpest question a judge can ask is that the OCR result becomes `PaymentInstruction.clabe`,
which then feeds CLABE forensics, so surely the model is in the loop. The answer is a design rule
that is testable.

- The model returns a string. The decision is made afterwards by the check digit, the bank and plaza
  lookup, and the edit distance against `Supplier.knownAccounts`, all of them pure functions.
- `PaymentInstruction.ocrConfidence` exists so the deterministic layer can gate on transcription
  uncertainty. **A CLABE that arrived by OCR can never produce a `release`.** Below the confidence
  threshold, or when the transcribed account is not byte-identical to a known account, the
  instruction goes to `requiere_verificacion` and a person reads the digits off the original image.
- Therefore a model error can only ever add friction. It cannot remove a control. That asymmetry is
  the whole safety argument, and it is a unit test rather than a promise.
- For voice notes the guarantee is already written into the domain. The comment on
  `PaymentInstruction.text` reads "Never used for decisions, only shown as context." The transcript
  is displayed to the clerk. Nothing reads it.

`TODO(garzario)`: name the two tests that pin this down, one for low `ocrConfidence` forcing
`requiere_verificacion` and one asserting that no detector reads `text`, and link them from here
once they exist.

### 6.2 Privacy consequence of putting the boundary there

- **The whole decision runs inside the perimeter.** The six controls need no third party. The ledger,
  the SAT list and the CEP evidence never leave.
- **What does cross is one image or one audio file**, carrying an account number and, in a voice
  note, possibly a person's voice. Under section 4.2 that is a remisión to an encargado rather than a
  transferencia, provided the contract makes the provider an encargado. That is a contract question
  we have flagged, not a fact we have assumed.
- **The cheapest privacy control is not sending it at all.** Intake through the portal or by manual
  entry never calls a model. Only a `source` of `whatsapp` or `pdf` carrying an attachment does, and
  a client can turn even that off and type the CLABE, losing convenience and no control.
- **Retention at the provider is not ours to promise.** `TODO(FabriBanda)`: record the provider's
  retention setting and whether zero retention is available on the plan we would actually buy.

### 6.2.1 How the boundary is implemented

`packages/extract` is the only module in the repository that reaches a model, and the rule above is
its shape rather than its documentation. It sends one instruction string that this repository wrote
and the bytes of one file a person chose to send us, and that is the entire transfer: no supplier, no
RFC, no legal name, no CFDI, no known account, no payment history, no SAT list and no CEP ever appear
in a request, which is verifiable by reading the nineteen lines of `buildRequestBody` in
`src/gemini.ts`. What comes back is JSON against a fixed schema of six fields, `rawText`,
`transcript`, `clabe`, `amount`, `supplierHint` and `clarity`, so there is nowhere in the response for
a verdict, a score or a recommendation to be written even if a model wanted to offer one. Those
characters then become `PaymentInstruction.clabe`, `ocrConfidence` and `text`, and every control that
follows is a pure function in `packages/core` operating on the digits, which is why a transcription
error can add friction to a payment and can never remove a check from it. Retention on our side is
none: the bytes live in the request and in nothing else, no copy is written to the ledger or to the
database, `imageRef` and `audioRef` hold a reference and not a file, and the product never uses the
provider's Files API precisely because a file uploaded there is a file the provider keeps. The claim
is enforced by `packages/extract/src/boundary.test.ts`, which reads the package's own source and fails
if a shipped module so much as names `decide`, `Finding`, `Decision`, `Severity`, `detect`, `score`,
`recommend` or `risk`, and by `apps/api/src/routes/instructions.test.ts`, where an intake carrying a
photograph on a server with no `GEMINI_API_KEY` is answered with 422 and a sentence rather than with a
CLABE nobody read.

### 6.3 Cost per verification

**Prices as of 2026-09-12**, read from the Gemini API pricing page (paid tier) and the token counting
page on that date. Tokenisation rules used: an image of 384 pixels or less on both sides counts as
258 tokens, and larger images are tiled into 768 by 768 tiles of 258 tokens each; audio counts 32
tokens per second.

Assumptions, stated so they can be attacked. A photo downscaled client-side to 1536 by 2048 gives 6
tiles, so 1,548 image tokens plus a 200-token instruction, returning about 80 output tokens. A
30-second voice note gives 960 audio tokens plus a 150-token instruction, returning about 150 output
tokens.

| Unit of work | Tokens | Gemini 2.5 Flash-Lite (USD 0.10 in text or image, 0.30 in audio, 0.40 out, per 1M) | Gemini 3.1 Flash-Lite (USD 0.25 in text or image, 0.50 in audio, 1.50 out, per 1M) |
|---|---|---|---|
| OCR of one CLABE image | 1,748 in, 80 out | **USD 0.000207** | USD 0.000557 |
| Transcription of one 30 s voice note | 960 audio and 150 text in, 150 out | **USD 0.000363** | USD 0.000743 |
| Worst case single instruction, image and voice note together | both of the above | **USD 0.00057** | USD 0.0013 |
| One payment run of 120 instructions, 20 with an image and 8 with a voice note | | **USD 0.0070** | USD 0.017 |
| One company per month, four runs | | **USD 0.028** | USD 0.068 |
| All six controls on all 120 instructions | 0 | **USD 0.00** | USD 0.00 |

`TODO(FabriBanda)`: convert the monthly figure to MXN at the Banxico FIX of the day you quote it, and
carry the USD figure into the unit economics table in `docs/05-business-model.md`. Do not invent a
rate here.

Three consequences, which are the actual answer to the cost question.

1. **A tenfold spike in transaction volume costs nothing**, because the hot path contains no
   inference. Cost scales with how many instructions arrive as a photo or a voice note, which is a
   function of how the client's suppliers behave and not of how much money moves.
2. **Doubling the model price does not move the business.** The right-hand column is the sensitivity
   test: a model roughly 2.4 times more expensive still leaves the monthly figure under seven US
   cents per company. Nothing in the margin depends on picking the cheap model, which means we can
   pick the accurate one.
3. **The next cost step is a smaller or on-device model for transcription**, not a cheaper
   per-transaction model, because there is no per-transaction model to make cheaper. On-device OCR
   would also delete the transfer question in section 6.2 entirely.

Never quote a model price from memory. Open the provider's pricing page, copy the number, stamp the
date. A wrong price here is worse than an empty cell, because it feeds the margin row in
`docs/05-business-model.md`.

### 6.4 The assistant panel: what leaves, and what a conversation costs

Section 6.3 prices the only model call this product had until 12 September, which is
transcription of a file a person chose to send us. The panel of ADR-0007 adds a second one,
and it is a different shape: a conversation, with the deterministic engine's own output going
up as evidence and a Spanish answer coming back. So it gets its own transfer paragraph and its
own arithmetic.

**What leaves the perimeter, exactly.** Three things and no fourth.

1. **The clerk's own sentence**, with every eighteen-digit run in it rewritten to the last four
   digits before it is sent. She can paste a CLABE into the box; the model never receives one.
2. **The evidence of the reads the turn performed**, which is what the nine tools in
   `apps/api/src/assistant/tools.ts` project out of this API's own GET endpoints: the level, the
   state, the rule behind the level, the findings with the engine's own Spanish explanation and
   their evidence chips, the amounts, the dates, the SAT rows, the counts the consortium
   answers. Every account in it is four digits, because `mask.ts` rewrites the whole payload on
   the way out rather than trusting each tool to remember.
3. **The prose of the earlier turns of the same conversation**, masked the same way.

What never leaves: the image itself, the CFDI ledger, any XML, a CEP seal or certificate, the
bank mirror, the company's account book, another tenant's identity, and the clerk's own name.
The last one is worth stating because it is narrower than ADR-0007 requires: the ADR permits the
image to be sent to the panel's model and this implementation does not send it, because
everything the turn needs from a screenshot is what `packages/extract` already read off it, and
`decidedBy` on a proposal is filled in from the `X-Actor` header on our side rather than by the
model. `DROPPED_KEYS` in `mask.ts` is the list, matched on the key and not on the value, and
`apps/api/src/assistant/mask.test.ts` asserts over a whole serialised request body that no
eighteen-digit run survives.

**Prices, as of 2026-09-12**, read from the Gemini API pricing page for the model
`.env.example` actually configures, `gemini-3.6-flash`, paid tier: **USD 0.75 per 1M input
tokens and USD 3.75 per 1M output tokens** through 31 December 2026, doubling on 1 January 2027.
Converted at the Banco de Mexico FIX published for 11 September 2026, **MXN 16.9707 per USD**.
Both constants live in `apps/api/src/assistant/cost.ts` with their source and their date, the
cost of every turn is computed from them and written onto the `assistant_message` ledger event,
and `cost.test.ts` pins the arithmetic against a worked example. A figure on an append-only row
has to be reproducible five years later, which is why the rate is a stamped constant and not a
live lookup.

**Measured, not estimated.** `bun run eval:assistant` ran the twenty golden questions against
the live model on 2026-09-13, through the real turn loop and the real endpoint:

| Unit of work | Tokens | Cost |
|---|---|---|
| Twenty golden questions, live | 152,971 in, 24,999 out | **MXN 3.54** |
| One question | about 7,650 in, 1,250 out | **MXN 0.177** |
| One transcription of one screenshot | 1,237 in (1,092 image, 145 text), 1,197 out | **MXN 0.092** |
| One screenshot dropped into the panel | two transcriptions plus one turn | **MXN 0.36** |
| All six controls on all 120 instructions of a run | 0 | **MXN 0.00** |

Three things in that table are worth reading twice.

**The output side dominates, and thinking is why.** Output is priced five times higher than
input, and `gemini-3.6-flash` thinks whether or not it is asked to: the transcription above
spent 1,046 of its 1,197 output tokens thinking about a screenshot with six lines of text on it.
That is also the correction to the table in section 6.3, which priced an image at USD 0.000207
on Gemini 2.5 Flash-Lite: on the model this repository configures, the same image is
**MXN 0.092**, about twenty-six times more. The conclusion the section reaches is unchanged and
the number is not, so the number is restated here rather than left to be inferred.

**A screenshot is transcribed twice, on purpose.** Once in the panel, to read the payee and
attribute the supplier deterministically, and once inside `POST /api/v1/instructions`, which is
what puts `imageRef` and `ocrConfidence` on the instruction and arms the `ocrChannel` evidence on
the CLABE control. Posting the account as text would have saved MXN 0.09 and produced an
instruction that looks typed, which weakens a control a clerk relies on; building a second intake
path would have produced two pipelines that can disagree about a payment. Two fifths of a centavo
is the cheaper mistake to not make.

**Volume still costs nothing.** The hot path contains no inference: a tenfold spike in
transaction volume moves none of the figures above, because the six controls are pure functions
and the only model calls are the ones a person started by typing a question or dropping a
photograph. One company on the four-run month of section 6.3, with twenty screenshots a run and
a clerk asking forty questions a month, is **MXN 36** of panel and intake per month against a
subscription of MXN 899. Doubling the price on 1 January 2027 makes it MXN 72, which is the
sensitivity test and not a surprise.

**The boundary is ADR-0007 and it is checked by running the suite.** No level, no action, no
finding, no amount and no ranking on any screen of this product comes from the model:
`confidenceOf`, `transactionStateOf`, `decide` and the six controls are deterministic and unit
tested. The panel's tools are reads and a writing tool is unrepresentable in the contract. The
proposal a turn ends with is an object the panel renders and a person presses, its payload is
built from the endpoint contract on our side, and its Spanish sentence is checked against a
forbidden-vocabulary list before it leaves, so the one line of copy a model is nearest to writing
still obeys ADR-0009: three levels, never a probability, and never the word "seguro".

## 7. Synthetic data posture

- **One hundred percent synthetic data in this repo.** Generation method and fixed seed are in
  `docs/08-data-model.md`. No real personal data enters the repository, ever, including issues,
  screenshots, PR bodies, the demo and the video.
- **The watermark comes from the flag, not from the name.** Every domain object carries
  `synthetic: true` and the UI renders the `datos sinteticos` mark from that boolean, as the header
  comment in `domain.ts` requires. A record cannot be fabricated and still look real, because the
  only way to hide the watermark is to unset a field the generator always sets.
- **Real RFCs never sit next to fabricated evidence.** This is the rule with a legal reason behind it
  and not a matter of taste. The 69-B list is a fuente de acceso público for the fact of the listing.
  Nothing makes it lawful to attach an invented invoice, an invented CLABE or an invented fraud
  narrative to a real taxpayer's name, and for a persona física that name is personal data being
  treated for a purpose nobody consented to. Real RFCs appear in exactly one place, the read-only
  `GET /api/v1/sat/lookup` box a judge can type into. `POST /api/v1/sat/publish` with
  `simulate: true` accepts synthetic RFCs only, and that restriction belongs in the handler rather
  than in a reviewer's memory.
- **Synthetic suppliers carry synthetic RFCs**, so a screenshot can never collide with a real
  taxpayer by accident.
- **Nessie is a sandbox and `/enterprise/*` is a shared, contaminated pool.** We never compute
  analytics on it and never post anything identifying there. See `docs/09-api.md`.
- **Secrets.** Keys live in `.env` only, never committed. `.env.example` lists every variable with no
  values. Keys are rotated after the event.
- **Tokenisation boundary in production.** `TODO(garzario)`: name the exact fields tokenised before
  anything leaves the client perimeter, which today reads as counterparty tax IDs, counterparty legal
  names and account identifiers, and place the boundary on the diagram in `docs/07-architecture.md`.

## 8. The consortium network: what leaves the tenant

ADR-0006 adds the one thing in this product that crosses a customer boundary, so it gets its own
section rather than a clause inside another one. The mechanism is in
`docs/adr/0006-consortium-snowflake.md` and the data flow is in
`docs/07-architecture.md#the-third-flow-the-consortium-network`. What follows is only the regulatory and
privacy half.

The reason the feature exists is control 2 of ADR-0002 and it is worth one sentence here: a
supplier's first payment has no history in this company and has months of history in every other
company that already pays it, so the case where control 2 is weakest is the case another tenant has
already answered.

### 8.1 What leaves the tenant, and what never does

The whole payload is the seven rows below. The list underneath them is the part a judge should read
first, because what is absent is the argument.

| What leaves | What it is | Why it is the minimum |
|---|---|---|
| `tenant_hash` | A salted hash of the tenant identifier | The network counts distinct companies without naming one. A count of zero and a count of twenty are different facts; which twenty is not a fact the network needs |
| `rfc_hash` | A salted hash of the normalised supplier RFC | The join key for "is this the same supplier". Without it there is no network |
| `clabe_hash` | A salted hash of the normalised 18-digit CLABE | The join key for "is this the same account". The pair is what the signal is about |
| `bank_code` | The first three digits of the CLABE | Already public structure, and it is what makes "this supplier changed bank" visible across tenants. It identifies an institution, never a person |
| `outcome` | One of `verified`, `paid`, `mismatch`, `fraud_reported` | Four values, fixed. It says what happened to a payment, never how much, never to whom, never who decided |
| `event_date` | A calendar date | First and last sighting are the whole point: an account paid for eleven months is different from one first seen yesterday |
| `synthetic` | A boolean | Every row in this repository is `true`. The flag travels with the row so a synthetic network can never be read as a real one |

**What never leaves, stated as a list because a list is checkable.** No supplier legal name. No
company name. No trade name. No amount, subtotal, IVA or total. No CLABE and no RFC in the clear. No
CFDI, no UUID, no folio, no serie. No CEP and no CEP XML. No beneficiary account holder name. No
payment instruction, no photograph, no voice note, no transcription. No `Finding`, no `explanation`,
no `Decision` and no `decidedBy`, so the network never learns what a clerk decided or that a clerk
exists. The API route that reads the snapshot takes an RFC and a CLABE and answers with counts and
dates, and there is no shape of request that returns a row.

**The warehouse is not on the decision path.** `packages/core` and `packages/engine` hold no
Snowflake credential and make no network call of any kind, `apps/api` reads the local
`consortium_snapshot` through the repository, and the only code that authenticates to Snowflake is a
script a person runs. `ALLOW_CONSORTIUM` has to be set for even that, and with it unset the finding
says the network was not consulted instead of silently scoring as if it had been.

### 8.2 The salted hash, and what it does not do

The pair is hashed with HMAC-SHA-256 over the normalised RFC and CLABE, keyed by a network-wide salt
(`CONSORTIUM_SALT`). Network-wide is the requirement: two tenants paying the same account have to
produce the same hash or there is no join. That requirement is also the limit, and the limit is
written here rather than left for a judge to find.

- **It is pseudonymisation, not anonymisation.** An RFC is 12 or 13 structured characters and a CLABE
  is 18 digits whose first six are a bank and a plaza and whose last one is a check digit. That is not
  a high-entropy input. Anyone holding the salt and a candidate pair can confirm membership by
  recomputing the hash, and anyone holding the salt and a supplier list can do it in bulk. So the
  confidentiality of this table rests on the salt, not on the hash.
- **We therefore treat the hashes as personal data** and apply section 4 to them, which is the same
  safe default section 4.1 takes for supplier records. Calling them anonymous would be the convenient
  reading and it is not the defensible one.
- **In this repository the salt is a documented constant**, which means the demo network offers no
  confidentiality at all. It does not need to: every row in it is synthetic and carries
  `synthetic = true`. Saying this out loud is cheaper than being caught assuming it.
- **What production requires**, and it is a precondition rather than a backlog item: a salt held by
  the network operator and never by a tenant or a repository, rotated per period so a leaked salt
  expires, with the rotation documented alongside the retention schedule section 4.2 already owes.
- **Reproducible is a requirement and not a side effect.** The hash has to be recomputable from the
  pair, because that is what makes an ARCO request answerable. See 8.4.

### 8.3 The LFPDPPP argument, and the part that needs counsel

Read against the new law already cited in section 4. Nothing here is a legal opinion.

- **Proportionality, art. 12.** Treatment must be necessary, adequate and relevant to the purpose.
  The seven columns in 8.1 are the whole payload and each one earns its place there. The outcome
  vocabulary is four fixed values rather than free text precisely so that a row cannot grow a
  narrative about a supplier.
- **Purpose limitation, art. 11.** The consortium is a second purpose, so the aviso de privacidad has
  to name it in the terms above and the tenant has to opt in. `ALLOW_CONSORTIUM` is the technical
  expression of that opt-in, and `consortium:push` refuses to run without it.
- **Consent, art. 7 fifth paragraph.** Financial and patrimonial data require express consent, and a
  destination CLABE is patrimonial data about whoever holds the account. The art. 9 exceptions that
  carry our weight inside one tenant, fr. II for the public SAT list and fr. IV for data required by
  the legal relationship between the titular and the responsable, are thinner once the same data
  leaves for a network. `TODO(FabriBanda)`: this is the one question counsel has to answer before any
  pilot, phrased exactly as whether a payer may contribute a keyed hash of its own supplier's account
  to a shared fraud register under fr. IV, or whether express consent in the supplier contract is
  required. The product ships with the feature opt-in and off by default until that answer exists.
- **Transfer or encargado, arts. 35, 36 and 2 fr. XII.** Routing a tenant's own rows to an operator
  acting on that tenant's behalf is not a transfer, because an encargado is excluded from the
  definition in art. 2 fr. XX. The genuine question is the read: the aggregate a tenant receives is
  computed over rows contributed by other responsables. Three design facts narrow it and we do not
  claim they settle it. The aggregate is counts and dates and never a row. It names no other tenant,
  because the tenant identifier is itself hashed and is only ever counted. And it is answerable only
  for a pair the asking tenant already holds, so the network discloses nothing about a supplier the
  asking tenant is not already paying. `TODO(FabriBanda)`: same review, same deadline.
- **Retention, art. 10.** The hard seventy-two month limit on data about breach of contractual
  obligations is the one that bites here, because `fraud_reported` is the outcome closest to that
  class. The retention schedule section 4.2 already owes has to carry a row per outcome, not one
  number for the table.

### 8.4 ARCO over a hash, which is why the hash is reproducible

A supplier may ask what the network holds about them. Because the hash is a deterministic function of
the pair, the answer is computable: the titular supplies their own RFC and the account, the operator
recomputes the two hashes and reads back the counts, and a cancellation is a delete of the rows
carrying that pair. Article 31's twenty days to communicate and fifteen to make effective apply
unchanged.

This is the reason to state plainly why the design is not "hash it so hard nobody can ever look it
up". A table nobody can query by subject is a table where ARCO cannot be satisfied, which is a
compliance defect dressed as a privacy feature. What the design removes is the ability to learn a
supplier's identity *from the table*; what it keeps is the ability to answer a person who already
knows their own identity.

### 8.5 Data residency

A Snowflake account is hosted in a single region, and Snowflake's own documentation states that it
"does not move data between accounts, so any data in an account in a region remains in the region
unless users explicitly choose to copy, move, or replicate the data". A Mexico Central region exists
in its commercial list, so the network can be kept in Mexico as a procurement answer.

What that does not do is remove the question in 8.3. The transfer rules in arts. 35 and 36 attach to
communicating personal data to a third party, and where the third party's servers sit does not change
who receives the data. Residency is worth choosing and it is not a compliance argument, so it is not
presented as one here or on stage.

### 8.6 Cost per pull

Snowflake bills virtual warehouses per second with a 60-second minimum each time the warehouse
starts, and an X-Small warehouse is 1 credit per hour. The push and the pull are each one statement
over a table of seven narrow columns, so the runtime is not what is billed: the warehouse start is.

| Unit of work | What it costs | Why |
|---|---|---|
| One `consortium:pull` on a suspended warehouse | 0.017 credits | 60 seconds of an X-Small, the minimum, whatever the statement actually takes |
| One `consortium:push` straight after it, same session | 0 extra credits | The warehouse is already running, so it bills seconds and not a second minimum |
| Push and pull far enough apart to suspend in between | 0.033 credits | Two starts, two minimums |
| One company per month, four payment runs, one push and one pull each | 0.067 credits | Four starts |
| Every instruction in every run scored against the network | 0 credits | The hot path reads `consortium_snapshot` in Postgres. No statement, no warehouse, no round trip |

`TODO(garzario)`: the per-credit price depends on edition and region and Snowflake's pricing page does
not publish a figure without selecting both, so no peso and no dollar amount is written in this table
until it has been read off the consumption table for the account we actually create, stamped with the
date, and carried into `docs/05-business-model.md#unit-economics`. Do not invent a rate here. Storage
is one narrow row per registry outcome and is not the cost driver at any volume this product reaches.

The shape of this is the same as section 6.3 and it is the point. Cost scales with how many payment
runs a company does, which is four a month, and not with how much money moves or how many
instructions each run carries. A tenfold spike in volume costs zero extra credits because the
decision path never touches the warehouse.

### 8.7 The honest scope, in the words we are allowed to use

There is one tenant. The other tenants in this repository are generated deterministically by
`packages/consortium/src/synthetic.ts`, off the same `packages/seed` generator and the same seed 69 as
the demo company, every row carries `synthetic = true`, and the network therefore demonstrates a
mechanism and not an installed base.

- **May be said:** the network is a synthetic network of other tenants, generated for the demo, and
  the table it reads is real Snowflake holding real rows we put there.
- **May not be said, in any form:** that other companies are on it, that the counts come from real
  firms, that any figure on screen reflects a real payment by a real third party, or anything that
  lets a listener infer an installed base. `docs/10-demo-script.md` carries the sentence to say and
  the sentence never to say.

## 9. Sources

All read on 2026-09-12. Statutes are the texto vigente published by the Cámara de Diputados.

| Source | Used for |
|---|---|
| Código Fiscal de la Federación, texto vigente, last reform DOF 09-04-2026, arts. 69, 69-B, 69-B Bis | Sections 2.1 and 3 |
| The same text, arts. 42 fr. V inciso g), 49 Bis, 17-H fr. XIII, 17-H Bis fr. XIV, 29-A fr. IX, 29-A Bis and 113 Bis, each marked as added or reformed by the decree DOF 07-11-2025, whose Transitorio Primero sets 1 January 2026. `https://www.diputados.gob.mx/LeyesBiblio/pdf/CFF.pdf`, retrieved 2026-09-12 at 17:25 local, 3,134,465 bytes | Section 3.3 |
| SAT, Datos Abiertos, contribuyentes publicados, `https://www.sat.gob.mx/minisitio/DatosAbiertos/contribuyentes_publicados.html`, whose only article sections are 69, 69-B and 69-B Bis, and the 69-B Bis complete listing CSV, three taxpayers at a 5 June 2026 cut-off | Sections 3.2 and 3.3 |
| Diario Oficial de la Federación, full-text search for `fracción X del artículo 49 Bis`, **accents included, because the same phrase without them answers zero**, run 2026-09-12: fourteen oficios of the Administración Central de Fiscalización Estratégica, 10 July to 28 August 2026, one taxpayer each. The link that answers carries the query, since the bare page redirects to an error: `https://dof.gob.mx/busqueda_detalle.php?textobusqueda=fracci%C3%B3n+X+del+art%C3%ADculo+49+Bis&vienede=` | Section 3.3 |
| Ley Federal de Protección de Datos Personales en Posesión de los Particulares, nueva ley DOF 20-03-2025, last reform DOF 14-11-2025, arts. 2, 5 to 12, 15, 21 to 33, 35, 36 | Sections 2, 2.1 and 4 |
| Ley para Regular las Instituciones de Tecnología Financiera, DOF 09-03-2018, last reform DOF 14-11-2025, arts. 1, 3, 15, 22, 76, 77 | Sections 1 and 2 |
| Ley de Protección y Defensa al Usuario de Servicios Financieros, DOF 18-01-1999, last reform DOF 14-11-2025, art. 2 | Sections 1 and 2 |
| Ley de Instituciones de Seguros y de Fianzas, nueva ley DOF 04-04-2013, last reform DOF 14-11-2025, arts. 2 fr. VI, 11, 20, 23, 24, 91, 93, 102 and 495. `https://www.diputados.gob.mx/LeyesBiblio/pdf/LISF.pdf`, retrieved 2026-09-12 at 19:38 local, 2,184,319 bytes | Sections 1, 2 and 2.2 |
| Banco de México, CEP consultation portal, `https://www.banxico.org.mx/cep/`, including its exención de responsabilidad and its consultation hours | Section 4.3 |
| Banco de México, CEP validator, `https://www.banxico.org.mx/validador-cep-spei/`, including the 45 business day validation window | Section 4.3 |
| Gemini API pricing, paid tier, `https://ai.google.dev/gemini-api/docs/pricing` | Section 6.3 |
| Gemini API token counting, `https://ai.google.dev/gemini-api/docs/tokens` | Section 6.3 |
| Gemini API pricing, `https://ai.google.dev/gemini-api/docs/pricing`, read 2026-09-12 | Section 6.4, and `apps/api/src/assistant/cost.ts` |
| Banco de Mexico FIX, `https://www.banxico.org.mx/tipcamb/tipCamMIAction.do?idioma=sp`, published 2026-09-11, read 2026-09-12 | Section 6.4, and `apps/api/src/assistant/cost.ts` |
| Snowflake, Virtual warehouses, `https://docs.snowflake.com/en/user-guide/warehouses-overview`, for per-second billing with a 60-second minimum each time a warehouse starts and 1 credit per hour for an X-Small | Section 8.6 |
| Snowflake, Supported cloud regions, `https://docs.snowflake.com/en/user-guide/intro-regions`, including the single-region rule and the Mexico Central region | Section 8.5 |
| Snowflake, Introduction to Secure Data Sharing, `https://docs.snowflake.com/en/user-guide/data-sharing-intro` | Section 8.1 and ADR-0006 |
| Snowflake, pricing options, `https://www.snowflake.com/en/data-cloud/pricing-options/`, which publishes no per-credit figure without selecting a platform and a region | Section 8.6, and the reason its table carries credits rather than pesos |

If a judge disputes a line in this document, open the source next to them. That is the point of the
table.
