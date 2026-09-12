# 06. Regulatory posture, privacy and the LLM boundary

Worth 5 points directly (regulatory and operational feasibility) and it is the section the product
judge probes hardest, because almost no hackathon team writes it.

**This is a framework map, not legal advice.** It lists which Mexican regimes attach to which part
of Ceptinela and what obligation each one creates, so that an engineer or a product person can
check that we thought about the right things. It is not an opinion on compliance and it was not
written by counsel. Any production deployment needs a licensed review.

Every legal claim below was read in the primary source on 2026-09-12 and the source is named in
section 8. Where a source contradicted something we had assumed, the assumption was changed and the
change is flagged. Nothing here is quoted from memory.

Owner: Fabricio (`FabriBanda`), with the lead on the LLM boundary. Due M2.

## 1. Our legal position

Stated first, because stating it first is what separates a team that thought about this from a team
that did not.

- **We are payer-side software.** Ceptinela sits between the company's own documents and the
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
  a person or a company, we write to no shared registry, and nothing we compute leaves the client
  that paid for it. The verified beneficiary registry is per company and lives inside that company's
  own data, never pooled across clients.
- **We are not an Institución Financiera for CONDUSEF purposes.** Article 2, fracción IV of the Ley
  de Protección y Defensa al Usuario de Servicios Financieros enumerates what counts as one, and
  software sold to a payer is not on the list. The complaint path about a transfer stays with the
  user's bank.
- **No automated adverse action.** Nothing declines, blocks, scores down or reports anyone without a
  person deciding. That one design rule removes most of the regime we would otherwise be inside, and
  section 5 shows it is enforced by the domain types rather than by a promise.

ADR-0002 fixes the day-one path: payer-side software sold to the company, or to the accounting firm
that holds the XML of thirty companies. The white-label path, where an institution embeds Ceptinela
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
| Código Fiscal de la Federación, arts. 69, 69-B and 69-B Bis (last reform DOF 09-04-2026) | Fiscal confidentiality and its exceptions, presumption of non-existent operations, and improper transfer of tax losses | Yes, as the data source and as the risk we quantify | Sections 2.1 and 3. The list is published by order of the statute, which is what makes reading it lawful and what makes the exposure real |
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

## 3. What Articles 69-B and 69-B Bis actually say

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
exists to prevent. `TODO(FabriBanda)`: if a future version ever surfaces it, it is a separate
control with its own copy, never a row inside the 69-B detector.

## 4. Personal data, under the LFPDPPP in force

The applicable statute is the **new** Ley Federal de Protección de Datos Personales en Posesión de
los Particulares, published DOF 20-03-2025, last reform DOF 14-11-2025. It replaced the 2010 law and
it moved the authority: art. 2, fr. XV defines Secretaría as the Secretaría Anticorrupción y Buen
Gobierno. Article 2, fr. VIII also defines Días as días hábiles, so every deadline below is in
business days.

### 4.1 What personal data Ceptinela would touch in production

| Data | Where it comes from | Why it is personal data |
|---|---|---|
| Beneficiary account holder name on a CEP | The receiving institution's Confirmación de Abono, retrieved for the client's own payment | It names whoever received the money. When the beneficiary is a persona física con actividad empresarial it is plainly personal data |
| Supplier legal name, RFC and contact | The client's own CFDI ledger and payment instructions | An RFC of a persona física identifies that person directly |
| The clerk's identity | `Decision.decidedBy` | It records who authorised a payment, which is data about an employee |
| Voice notes and photographs of payment instructions | WhatsApp and email intake | A voice is biometric-adjacent, and an image of a document may carry a signature or a phone number |

We treat all four as personal data and apply the law to all four. Whether a persona moral is a
titular under art. 2, fr. XVIII of the new law is a genuine question and we do not resolve it by
assumption. Treating supplier records as protected costs us nothing and is the only safe default.
`TODO(FabriBanda)`: one question for counsel, phrased exactly that way.

### 4.2 The obligations that attach, and how the product satisfies them

- **Purpose limitation, art. 11.** Treatment is limited to the purposes stated in the aviso de
  privacidad, and a different purpose requires consent again. Our stated purpose is one sentence:
  screening this company's own outgoing payments before they leave. That sentence forbids selling
  aggregated supplier behaviour, training a shared model on client ledgers, and pooling verified
  beneficiaries across clients. All three are attractive and all three are out.
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
   institutions, the beneficiary account and the exact amount. **Product rule: Ceptinela retrieves a
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
> `packages/core`. A model is used in exactly two places, both of them transcription of something a
> human already sent us: **OCR of a CLABE that arrived as an image**, and **transcription of a voice
> note**. The model reads characters. It never judges, never scores, never ranks and never decides.

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

## 8. Sources

All read on 2026-09-12. Statutes are the texto vigente published by the Cámara de Diputados.

| Source | Used for |
|---|---|
| Código Fiscal de la Federación, texto vigente, last reform DOF 09-04-2026, arts. 69, 69-B, 69-B Bis | Sections 2.1 and 3 |
| Ley Federal de Protección de Datos Personales en Posesión de los Particulares, nueva ley DOF 20-03-2025, last reform DOF 14-11-2025, arts. 2, 5 to 12, 15, 21 to 33, 35, 36 | Sections 2, 2.1 and 4 |
| Ley para Regular las Instituciones de Tecnología Financiera, DOF 09-03-2018, last reform DOF 14-11-2025, arts. 1, 3, 15, 22, 76, 77 | Sections 1 and 2 |
| Ley de Protección y Defensa al Usuario de Servicios Financieros, DOF 18-01-1999, last reform DOF 14-11-2025, art. 2 | Sections 1 and 2 |
| Banco de México, CEP consultation portal, `https://www.banxico.org.mx/cep/`, including its exención de responsabilidad and its consultation hours | Section 4.3 |
| Banco de México, CEP validator, `https://www.banxico.org.mx/validador-cep-spei/`, including the 45 business day validation window | Section 4.3 |
| Gemini API pricing, paid tier, `https://ai.google.dev/gemini-api/docs/pricing` | Section 6.3 |
| Gemini API token counting, `https://ai.google.dev/gemini-api/docs/tokens` | Section 6.3 |

If a judge disputes a line in this document, open the source next to them. That is the point of the
table.
