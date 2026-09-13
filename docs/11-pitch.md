# 11. Pitch

Worth 6 points. Three timed variants in the actual words, the six controls as they are said out
loud, the real data behind each claim, and the eight hardest questions with the answer given in one
breath. The 90-second version is the one to memorise, because continuous evaluation means many
walk-ups and one stage slot.

Owner: Patricio (`garzario`), drafted for the team to validate. Issue #56. Due M3.

**Language.** The spoken text is Spanish, because the judges and the persona are Mexican. It is
written in ASCII with no accents and no inverted question marks, which is the convention every
Spanish string in this repository already follows (`packages/voice/README.md` states it); the words
are pronounced with their natural accents. The scaffolding around the scripts is English, because
the repository is English. If a judge opens in English, the same beats are in
`docs/12-judge-qa.md`, already in English, and the hook is the one sentence not to improvise:
*"Paying a supplier the SAT has listed under Article 69-B voids the deductions you already took,
retroactively. And once a SPEI is sent, it is final."*

## The hook, and why it is binding

Every version opens with the fiscal hook, per the narrative rules in
`docs/adr/0002-track-and-thesis.md`. We never open with "they changed their bank account on me".
That is one signal out of six and it is the story every anti-fraud demo tells.

Both halves are verified at their primary sources. The draft of this file carried a
`TODO(garzario)` to do that; it is closed, and these are the citations to name if a judge asks.

| Half of the hook | What the source says | Source |
|---|---|---|
| The deductions are voided retroactively | Publication has effects `con efectos generales`: the operations covered by that taxpayer's comprobantes `no producen ni produjeron efecto fiscal alguno`. Past tense, so deductions and acreditamiento already taken are undone, not merely blocked. Anyone who gave them fiscal effect has **thirty days from the publication** to prove the operation was real or correct through complementary returns | Codigo Fiscal de la Federacion, article 69-B, texto vigente, last reform DOF 09-04-2026. Read out paragraph by paragraph in `docs/06-regulatory-privacy.md` section 3.1, source [4] in `docs/04-market.md` |
| A SPEI never comes back | An accepted transfer order is `firme, irrevocable, exigible y oponible frente a terceros` | Ley de Sistemas de Pagos, article 11, last reform DOF 14-11-2025. Source [2] in `docs/04-market.md` |

One consequence worth saying unprompted, because it is the sentence that makes the product obvious:
**the exposure is created by the publication, not by the payment.** A check run once when the
supplier was onboarded protects nothing against a list published two years later.

## What is true right now, and what is gated

Do not say a line whose gate has not been ticked. A volunteered gap reads as engineering maturity;
a discovered one reads as a Wizard of Oz, and Capital One said out loud that is what they hunt for.
Refresh this table at every milestone.

| Line on stage | Backed by, today | Gate before saying it |
|---|---|---|
| "The SAT list is real, type an RFC yourself" | `packages/sat/src/snapshot/official-2026-09-12.csv`, committed, 14,234 rows, and `GET /api/v1/sat/lookup` | Ticked. It answers with no network |
| "Six controls, all six accounted for" | `runControls` in `packages/engine`, every control in `ran` or `skipped` with a reason | Ticked |
| "There is no model in the decision" | `packages/extract/src/boundary.test.ts`, ADR-0004, `docs/06` section 6 | Ticked |
| "The retroactive sweep replays the ledger" | `sweep` in `packages/sat/src/sweep.ts`, `POST /api/v1/sat/publish`, and the 7,997 events the committed seed produces | Ticked |
| "The verification call rings the supplier through ElevenLabs and Twilio" | `packages/voice`, `POST /api/v1/instructions/:id/verify-call`, and two real outbound calls placed on 2026-09-12, `conv_6401m2ah87gnffctr757c34b5mdg` and `conv_2301m2ah9vnee2h8d14gpf1rb3rz` | Ticked, code path and live call, with the ids in `docs/14-process.md#live-integrations-verified`. Say who was dialled: a teammate's own phone, never a supplier |
| "This CEP is real, re-verify the clave de rastreo on your phone" | `packages/cep` reads, checks and compares a CEP; the committed fixture is synthetic | **Not ticked.** Issue #57 supplies the real one-cent CEP. Until it lands, say what the parser does and that the CEP on screen is the synthetic fixture |
| "Precision, recall and false-positive rate, blind" | Thirty labelled cases in `packages/seed/src/holdout/cases`, scored through `runControls` by `bun run eval` and served by `GET /api/v1/metrics` | Ticked. Re-run `bun run eval` before every rehearsal and read the numbers off that output, because they move with every merge |
| "It is deployed, open it on your phone" | Vercel for `apps/web`, Vultr for `apps/api`, per the ADR-0005 amendment | **Not ticked.** Issue #44. Until then the demo runs local and we say so |
| "A held payment carries a deadline and a way out" | `holdWindow` in `packages/core/src/hold.ts`, on `GET /api/v1/instructions/:id` and on a recorded `verify-call`; the reason and the name on `POST /api/v1/instructions/:id/decide` | Ticked in the engine and the API. **Not on screen yet**, issue #174, so say "la API lo contesta y la pantalla lo muestra para el demo" and show it with `curl` if pushed |
| "The run answers in pesos, not in minutes" | `runMoney` in `packages/core/src/exposure.ts`, on the `totals` of `GET /api/v1/run/current` | Ticked for the money that is stopped, released and at risk. The retroactive 69-B pair reads zero until a sweep prices a supplier in the run, issue #175 |
| "The decision weighs the pesos at risk against what a day of delay costs" | `decide` in `packages/core/src/decision.ts`, `EXPECTED_DELAY_DAYS`, and the `Costo de retrasar un dia` field on the instruction screen | **Ticked in the engine, flat in the demo data.** The generator prices no `Supplier.delayCostPerDay`, so all 92 decisions carry zero and the field reads MXN 0.00, issue #182. Say the mechanism, never point at the number |

**The live call happened, so the row above is ticked.** Two outbound calls went out on 2026-09-12
through the imported Twilio number to a teammate's own mobile, the first of them 18 seconds and
ended by the remote party, with the transcript captured. The conversation ids, the agent id and the
cost are in `docs/14-process.md#live-integrations-verified`, which is the line issue #60 asked for.
"Ya llamamos" may now be said. What may never be said is that we called a supplier, because we did
not and will not: the only number this product has ever dialled is one of ours.

## The numbers you are allowed to say

Nothing else. If it is not in this table, it is not on screen and it is not cited, the answer is
"no traigo ese numero, se deriva en `docs/04-market.md`", which costs nothing and is much cheaper
than being corrected.

| Number | Value | Where it comes from |
|---|---|---|
| Rows in the committed SAT list | 14,234, current to 2025-12-31, downloaded 2026-09-12 | `packages/sat/src/snapshot/README.md`, asserted in `official.test.ts` |
| What is behind those rows | The current situation of each taxpayer: 11,270 definitivo, 1,638 sentencia favorable, 986 presunto, 340 desvirtuado. The loader reads the dated history behind each one and produces 28,935 entries, because "listed today" and "listed the day we deducted this invoice" are different questions | same file, same test |
| Rows the SAT redacted by court order | 91, reported with their line numbers, never matched, never dropped | same |
| How often the list changes | 33 publication dates in the twelve months to 2026-07-31, about one every eleven days, 973 taxpayers moved to definitivo and 1,226 new presuntos | `docs/04-market.md` source [3], counted from the file |
| What one listing costs | For every MXN 100,000 of deducted subtotal, MXN 46,000 of tax effect reverses: 30 percent ISR plus 16 percent IVA | `docs/04-market.md`, sources [5] and [6] |
| The buyer's window | 30 days from the publication | CFF article 69-B, `docs/06` section 3.1 |
| How long a payment stays stopped | 3 days for a hold, 1 day for a verification, measured from the decision | `EXPECTED_DELAY_DAYS` in `packages/core/src/decision.ts`, reused by `holdWindow` in `hold.ts` so the delay the arithmetic charged for and the deadline on screen are one number |
| Firms in the target band | About 246,000 Mexican firms of 11 to 250 people | INEGI CE 2024, `docs/04-market.md` source [1] |
| TAM, SAM, SOM | MXN 2,655 million, MXN 948 million, MXN 12.1 million per year | `docs/04-market.md#sizing`, bottom-up, entities times price |
| Our price | MXN 899 per company per month; MXN 3,900 per month for an accounting firm with up to 20 client companies, MXN 195 each | `docs/05-business-model.md` |
| The price anchor on the list side | 69b.mx `Smart` at MXN 199 per month for 30 monitored RFCs, and Tesio from MXN 499 per month | `docs/04-market.md` sources [7] and [8] |
| The price anchor on the account side | Verificamex's one-cent test, MXN 17.85 down to MXN 8.93 plus IVA per verification depending on the token tier. Say "de nueve a dieciocho pesos"; it is also our build-versus-buy answer and our COGS anchor, never called our competitor | `docs/04-market.md` source [36] |
| What has no published price | ValidX and Portal de Proveedores, both quote-only, so no number is said about either | `docs/04-market.md#what-we-could-not-verify-about-the-competition` |
| Break-even | One stopped invoice of MXN 23,452 of subtotal per year | `docs/05-business-model.md` |
| Avoided loss | One held invoice of MXN 100,000 of subtotal pays 51 months of subscription; one misdirected SPEI of the same amount pays 111 months | `docs/05-business-model.md` |
| The demo company | 28 employees, Apodaca, 44 suppliers, 8 months of history (2026-01-07 to 2026-09-07), 4,103 CFDIs, 3,801 complements, 7,997 ledger events, seed 69 | `packages/seed/src/sentryone`. `bun run seed` prints the suppliers, the CFDIs, the complements and the run; the headcount and the city are in `company.ts` and the event count is the ledger row of `docs/08-data-model.md` |
| This week's run | 92 payment instructions, MXN 2,174,210.76 | same, `summarizeSentryOne` |
| This week's run in pesos | MXN 885,658.73 stopped (MXN 592,592.38 held plus MXN 293,066.35 to verify), MXN 1,288,552.03 released, MXN 799,209.86 at risk | `totals` of `GET /api/v1/run/current`, from `runMoney`. The two `retroactive69b` fields on the same object read zero on this run, and #175 is why |
| The listed-supplier scenario | MXN 878,592.59 of base already deducted and MXN 404,152.59 of exposure (MXN 263,577.78 ISR plus MXN 140,574.81 IVA), across 24 of the 31 invoices to the supplier the simulated publication names. The base is the settled ones only, because an invoice nobody has paid yet was not deducted yet | same, `notes.scenarios`, and `bun run demo` beat 3 prints the same pair |
| The blind evaluation | 30 labelled cases and 21 labelled expectations over six detectors, scored as 183 counts. Precision 85.0 percent, recall 81.0 percent, false-positive rate 1.9 percent, and the engine chose the labelled action on 28 of the 30 | `bun run eval`, re-read on 2026-09-12. **Re-run it before quoting it.** Say 30 cases, never a pair count: six detectors on thirty cases looks like 180 slots, and the matrix sums to 183 because a detector that fires with the wrong severity on a case that expected it is counted twice, once as a miss and once as a false positive |
| Tests | 1,829 tests across 99 files on 2026-09-12: 1,718 passing, 111 skipped, 0 failing | `bun test`, re-read on this branch after merging `origin/dev`. Say passing and skipped, because a judge who runs it sees both, and re-read it after every merge |

The reference run amount in `docs/02-persona.md` is MXN 2,174,210.76, the same figure this table
carries, so the pitch and the persona doc agree in front of a judge who reads both. That cell used to
read MXN 673,460.27 and it was refreshed; re-check it whenever the generator changes.

The two SAT vintages are reconciled in
`docs/04-market.md#two-sat-files-and-the-one-the-product-ships`, with both files, both dates and
both row counts in one table. The short version for the stage: the product answers from the
committed 14,234-row snapshot current to 2025-12-31, and the 14,761-row open-data file current to
2026-07-31 is where the publication-frequency counts come from. Say either number with its date, or
say neither. Never quote 14,761 as the size of the list the lookup box answers from.

## The value is the loss, not the minutes

Three Capital One judges heard "en la vida real esto toma ocho minutos y con nuestro producto toma
segundos" on 2026-09-12 and told us they did not care. They were right, and this section is the
replacement. Issue #171.

**The sentence is banned.** Not softened, banned. It loses twice. It prices the product at the wage of
the person doing the work, which is about MXN 375 a day, so eight minutes is worth centavos and anyone
can do that arithmetic in their head while you are still talking. And it invites the answer the second
engineer gave us, which is that his father talks to his suppliers all day and does not need software to
be quick.

**What replaces it.** The value of this product is the loss that did not happen, so every claim is in
pesos.

> Lo que vale no son los minutos, es la perdida que no ocurrio. De un subtotal rechazado por el
> articulo 69-B se revierte el cuarenta y seis por ciento entre ISR e IVA. Una factura de cien mil
> pesos de subtotal detenida paga cincuenta y un meses de suscripcion. Un SPEI mal dirigido del mismo
> monto paga ciento once, porque ahi no hay nada que revertir. Y se paga completo con una sola factura
> detenida de veintitres mil cuatrocientos cincuenta y dos pesos de subtotal al ano.

Three delivery consequences, all of them checkable on screen.

- **The run answers in pesos.** `GET /api/v1/run/current` reports `heldAmount`, `toVerifyAmount`,
  `releasedAmount`, `stoppedAmount`, `amountAtRisk`, `retroactive69bBase` and
  `retroactive69bExposure` on `totals`, computed by `runMoney` in `packages/core/src/exposure.ts`. The
  hero figure on the run screen is already the money that is not leaving and never the total of the
  run, which is the number that is the same whether the product works or not.
- **The 69-B exposure is the loss that needs no fraud at all.** Nobody stole anything. The SAT
  published a list and deductions already taken were voided. That is the half of the pitch no
  anti-fraud demo has, and it is the half to lead with when a judge doubts the problem is real.
- **Never say the product is fast.** It is not a claim anybody buys, and speed is the one property a
  judge can neither verify nor care about at a table. If a time has to be said, say the window and not
  the saving: the few minutes between approving a payment run and sending it are where nothing else
  sits, which is a statement about the gap and not about our latency.

## The objection about the father's PyME

One of the engineers said his father has a PyME and is in constant contact with his suppliers, and
concluded that he is not our user. He is right, and the answer is not to argue about his father.

The user is not the owner who knows five suppliers by voice. It is the company whose Thursday run pays
dozens of suppliers through one person in administration, who knows none of them by voice and cannot
telephone forty-four of them before the bank cut-off. And the part that turns the objection around:
**the supplier's own WhatsApp and email are the channel the attacker uses.** A payment instruction that
arrives inside a conversation you trust is the whole attack, so trusting the conversation is the failure
mode and not the defence. `PaymentInstruction.text` exists in `packages/core/src/domain.ts` for exactly
this reason, and its comment says it: the message is shown as context and never decides, because a
message is the artefact an attacker controls.

Then the sentence that closes it, because it does not depend on an attacker existing at all: **the
69-B loss needs no fraud.** The supplier is real, the invoice is real, the relationship is twenty years
old, and the SAT publishes a list that voids the deductions already taken on it, retroactively, with
thirty days to answer. Talking to your supplier every day protects you from none of that.

## The competition, and the two sentences that lose the room

The market research of PR #177 rewrote this part of the pitch. Eight paragraphs in this file claimed,
in one form or another, an empty window, an only-ones position, or a competitor picture the research
falsifies: the closing line of the 60-second version, beats 3 and 4 of the 90-second one, the "why
different" and the "market, model and regulation" beats of the 240-second one, hardest questions 1 and
2, and the one that always follows them. They are gone, because a judge who breaks one claim stops
believing the rest. Refs #171 and #169. The roster with one line per company is section 1 of
`docs/12-judge-qa.md#table-feedback-of-12-september-and-the-answers`, and `docs/12` wins if the two
ever disagree.

**The two camps, said in this order.** The fiscal half already holds payments: ValidX retains before
paying and notifies Compras, Portal de Proveedores holds when a document expires and sweeps 69-B
daily, and 69b.mx and Tesio run on the list. None of them sees the account. The money half moves the
pesos without checking who receives them: Clara disperses hundreds of SPEI from a spreadsheet the
payer uploads, Xepelin's own three-step flow contains no counterparty check. CONTPAQi has both halves
inside one product and its own changelog shows they never meet at the moment of payment. Bind ERP
alerts and, in its own help centre's words, "no restringira". HSBCnet really does validate beneficiary
names, "unicamente cuentas HSBC". Trustpair, nsKnox and Eftsure verify accounts for corporate
treasuries abroad and mention neither Mexico nor CFDI, SAT, SPEI or CLABE.

**Our claim is the union**, in one sentence and no wider: the fiscal half and the money half in one
decision, retener, verificar o liberar, with the evidence attached, before the transfer is
irrevocable. Two edges of it are sharper than the join: we found nobody selling the comparison of a
new CLABE against the accounts that supplier has already been paid on, and nobody turning either
signal into a decision with an amount at risk on it.

**The two sentences never to say.** "Nadie hace esto", nobody does this, because ValidX's own landing
page is the counterexample; say "no encontramos a nadie que venda las dos mitades juntas" instead.
And "nosotros inventamos la prueba del centavo", we invented the one-cent test, because Verificamex
sells it metered and Banco de Mexico writes it into Regla 51a Bis of the SPEI rules; say that the
centavo is a commodity primitive and that ours is the decision hung on its answer. Both of these are
also in the delivery rules at the end of this file, because they are the two that cost the room.

## The six controls, in the words used at the table

Said in this order, because it is the order `Detector` declares in
`packages/core/src/domain.ts`, the order `SENTRYONE_DETECTORS` runs them and the order the UI lists
them. One sentence each is enough; the evidence column is what you open when they push.

| # | Control | Said out loud | Open this |
|---|---|---|---|
| 1 | `sat_69b` | "Cruzamos cada RFC contra la lista oficial del articulo 69-B, con todas sus versiones, y cuando hay publicacion nueva reproducimos la bitacora para poner precio a lo que ya pagamos y ya dedujimos" | `packages/engine/src/sat69b.ts`, `packages/sat/src/sweep.ts` |
| 2 | `clabe_forensics` | "Revisamos el digito verificador con los pesos 3-7-1, el banco y la plaza, y la distancia contra las cuentas en las que si le hemos pagado a ese proveedor, con las confusiones tipicas de OCR" | `packages/core/src/clabe.ts` |
| 3 | `duplicate_invoice` | "Mismo emisor, mismo monto, misma ventana de fechas, o el mismo folio o UUID dos veces" | `packages/core/src/duplicates.ts` |
| 4 | `supplier_behaviour` | "Cambio de comportamiento del proveedor contra su propia historia, y si no hay muestra suficiente lo decimos en vez de inventar una senal" | `packages/core/src/behaviour.ts` |
| 5 | `beneficiary_cep` | "Comparamos el nombre del titular en el comprobante que firma Banxico contra la razon social del CFDI que estamos pagando, y guardamos el XML firmado tal cual llego" | `packages/cep/src/name-match.ts`, `signature.ts` |
| 6 | `bank_reconciliation` | "Conciliamos contra el espejo bancario: dinero que salio sin instruccion y sin documento atras" | `packages/core/src/reconciliation.ts` |

Then the decision, which is the part engineers ask about: **"seis detectores independientes, cada
hallazgo trae pesos en riesgo, y una sola decision de perdida esperada pesa esos pesos contra lo que
cuesta retrasar ese pago un dia. Retener, verificar o liberar, y firma una persona."**

**Do not open the delay figure to prove it.** The trade-off is in `decide` and in `EXPECTED_DELAY_DAYS`,
but the seeded company prices no supplier relationship, so `Costo de retrasar un dia` renders MXN 0.00
on every instruction and rule 3 never reaches its release branch. If an engineer asks what the delay is
worth here, the answer is "cero en esta empresa, porque el generador no le pone precio a la relacion;
el mecanismo esta en la decision y lo puedes leer", and #182 is what fills it in. Volunteering that is
cheap. Being caught pointing at a zero is not.

And the property that is easy to miss and worth volunteering: **every one of the six lands in `ran`
or in `skipped` with a named reason.** A run that says "sin hallazgos" because the engine could not
call its own detectors is the one failure this product cannot ship, and that is why the report
accounts for all six.

## 60 seconds, the hallway version

About 170 words, counted off this file. Say it and then stop talking.

> Dos cosas son ciertas cuando le pagas a un proveedor en Mexico. Si ese proveedor aparece en la
> lista del articulo 69-B del SAT, las deducciones que ya tomaste sobre sus facturas se anulan de
> forma retroactiva. Y una vez que sale el SPEI, es firme e irrevocable. No hay contracargo.
>
> Quien vive con las dos es la unica persona de administracion de un taller metalmecanico de
> veintiocho empleados en Apodaca. Los jueves manda entre setenta y ciento diez transferencias
> antes del corte del banco, con una hoja de calculo, WhatsApp y el portal del banco.
>
> SentryOne junta tres cosas en el momento en que ella paga: su propio catalogo de facturas, la
> lista oficial del SAT y el comprobante que firma Banxico por cada SPEI. Cada pago regresa como
> retener, verificar o liberar, con la razon en pantalla, y decide una persona.
>
> La consulta es publica y hay quien la vende. No encontramos a nadie que la lea junto a la cuenta a
> la que va el dinero. Ahi decidimos nosotros.

## 90 seconds, a judge walking up

This is the one to memorise. About 280 words, counted off this file, five beats.

> **(20 s, la persona y el momento.)** Jueves por la manana, taller metalmecanico en Apodaca,
> veintiocho empleados. Una sola persona lleva toda la administracion y hoy tiene que mandar entre
> setenta y ciento diez transferencias antes del corte. Tiene una hoja de calculo, WhatsApp y el
> portal del banco. No hay ERP, asi que no hay validacion de proveedores, no hay doble firma y no
> hay quien revise, porque el dueno esta en el piso de produccion.
>
> **(20 s, lo irreversible.)** Dos cosas pueden salir mal y ninguna se deshace. Si el proveedor esta
> en la lista del articulo 69-B, las deducciones que ella ya tomo se anulan de forma retroactiva, y
> la exposicion la crea la publicacion, no el pago. Y si la cuenta esta mal, el SPEI es firme e
> irrevocable. SentryOne vive exactamente en los minutos antes de que ella le de enviar.
>
> **(25 s, el mecanismo.)** Juntamos tres fuentes que hoy viven en tres productos distintos: su
> propio catalogo de CFDI, la lista oficial del SAT con todas sus versiones, y el CEP que firma
> Banxico por cada SPEI. Seis controles independientes y una decision de perdida esperada. Son
> funciones puras, sin red y sin base de datos, y no hay ningun modelo de lenguaje en la decision.
> Los puedes leer, y puedes correr las pruebas en esta laptop.
>
> **(15 s, el diferenciador.)** Hay productos que ya retienen el pago sobre la lista del SAT y nunca
> ven la cuenta, y plataformas que dispersan SPEI sin mirar a quien recibe. Las dos mitades no se
> encuentran en el momento en que el dinero se vuelve irreversible. Ese momento es el producto.
>
> **(10 s, la invitacion.)** Preguntame lo que quieras del algoritmo, de los datos o de la
> regulacion. O manda tu una instruccion de pago desde tu telefono, ahorita.

The invitation sets up `docs/12-judge-qa.md`, and beat 3 of `docs/10-demo-script.md` is the thing it
invites. **On a market number:** this version deliberately carries none. A number a judge can
falsify costs more than the fifteen seconds it buys.

## 240 seconds, the stage version

Budget: 60 seconds of setup, 100 seconds of live demo, 60 seconds of how and why, 20 seconds of ask.
About 350 spoken words plus the demo lines, which are in `docs/10-demo-script.md`.

| Block | Clock | What is said |
|---|---|---|
| Hook and persona | 0:00 to 0:40 | The first two paragraphs of the 60-second version, word for word. Do not improvise the hook |
| The product in one line | 0:40 to 1:00 | See below |
| Live demo | 1:00 to 2:40 | Beats 1, 2 and 3 of `docs/10-demo-script.md`. If the room is slow, cut beat 2 and keep beat 3 |
| How it works | 2:40 to 3:05 | The six controls, the expected-loss decision, and why there is no model in that path |
| Why different, and the evidence | 3:05 to 3:25 | The competitor line, then the blind evaluation |
| Market, model and regulation | 3:25 to 3:45 | Three sentences, one each |
| The ask | 3:45 to 4:00 | See below |

**0:40, the product in one line.**

> SentryOne lee las facturas que ella ya tiene y, en el momento de pagar, le dice cuales pagos
> retener, cuales verificar y cuales liberar.

**2:40, how it works.**

> Seis controles independientes sobre tres fuentes: su catalogo de CFDI, la lista del 69-B con sus
> versiones y el CEP firmado por Banxico. La lista con barrido retroactivo, forense de CLABE,
> facturas duplicadas, cambio de comportamiento del proveedor, verificacion del beneficiario contra
> el comprobante firmado, y conciliacion contra el espejo bancario. Los seis siempre quedan
> registrados: o corrieron, o dicen exactamente que les falto. Encima va una sola decision de
> perdida esperada, que pesa los pesos en riesgo contra lo que cuesta retrasar ese pago un dia. No
> hay modelo de lenguaje en ninguna parte de esa ruta: el unico modelo que usamos transcribe una
> foto o una nota de voz, y lo que devuelve vuelve a pasar por el digito verificador y por la
> historia del proveedor antes de tocar nada.

**3:05, why different and how we know.**

> El mercado ya partio esta tesis en dos. ValidX y Portal de Proveedores retienen el pago sobre las
> listas del SAT y nunca ven la cuenta. Clara y Xepelin dispersan cientos de SPEI sin verificar a
> quien recibe. CONTPAQi tiene las dos mitades y no se cruzan en el pago. Lo nuestro es la union, en
> una decision con evidencia. Y nuestros numeros son ciegos: quien etiqueta los casos no escribe los
> detectores y no abre esa carpeta hasta que el codigo ya esta integrado.

If a judge names the one-cent probe here, the answer is one sentence and it is not defensive:
Verificamex sells it metered at MXN 8.93 to 17.85 a call and Banco de Mexico writes it into Regla 51a
Bis of the SPEI rules, so it is a commodity primitive and ours is the decision hung on its answer. The
roster with one line per company is section 1 of `docs/12-judge-qa.md#table-feedback-of-12-september-and-the-answers`.

Optional clause, only if `bun run eval` was run within the hour and the screen is open on it:
"treinta casos etiquetados, uno punto nueve por ciento de falsos positivos, y los cuatro casos que
no coinciden estan en la tabla con su argumento." Cut it if the number on the screen is not the
number in your mouth.

**3:25, market, model and regulation.** One sentence each, from the numbers table above.

> Doscientos cuarenta y seis mil empresas mexicanas de once a doscientos cincuenta personas, y el
> tamano se construye de abajo hacia arriba, entidades por precio, con cada insumo citado. Cobramos
> ochocientos noventa y nueve pesos al mes por empresa, y tres mil novecientos al despacho contable
> que trae veinte; las anclas publicas del mercado son ciento noventa y nueve pesos al mes por
> monitorear una lista y de nueve a dieciocho pesos por verificar una cuenta, y lo que cobramos es la
> decision que junta las dos. Y no somos entidad regulada: no custodiamos fondos, no ejecutamos
> transferencias y nada se rechaza sin que una persona lo decida.

**3:45, the ask.**

> Queremos diez corridas de pago reales enfrente de nosotros la semana que entra, en empresas de
> verdad, para medir la tasa de falsos positivos con datos que no generamos nosotros.

Rehearsed twice, out loud, timed, with all four people present. A rehearsal with one person is a
read-through. The log goes in `docs/14-process.md`, issue #75.

## The real data, and where it stops being real

Say this unprompted in beat 1. It is the cheapest credibility in the room and Capital One told us
they are looking for prototypes that only pretend to work.

- **The SAT Article 69-B list is real.** The complete published listing, 14,234 rows, downloaded on
  2026-09-12 and committed byte for byte with its provenance, because a control that only works
  while the SAT portal is reachable is a control that does not work. The parser resolves columns by
  name, reads the file in its actual ISO-8859-1 encoding, handles records that span lines, keeps
  every dated situation instead of one state per taxpayer, and reports the 91 court-redacted rows
  with their line numbers rather than dropping them. A judge types an RFC into the lookup box and
  the answer comes from that file.
- **The Banxico CEP is real as a document format and as a verification procedure.** We parse the
  `SPEI_Tercero` document by child name, not by position, because the SAT samples and the production
  service order the children differently and a positional reader swaps sender and beneficiary. We
  keep the XML byte-exact, because a signature only verifies against the bytes as served. And we
  refuse to claim a valid seal: Banxico publishes no specification of the signing scheme, so
  `verifySignature` runs a candidate matrix and returns `unconfirmed_scheme`, which the UI renders
  as "firma no verificada" and never as "firma invalida". Those are two different claims and only
  one of them is ours to make. The CEP on screen today is the synthetic fixture; issue #57 brings a
  real one with its clave de rastreo, and only then does the "re-verify it on your phone" line get
  said.
- **The verification call is a real telephone call.** When the decision is `verify`, an ElevenLabs
  conversational agent speaking Mexican Spanish rings the supplier through the Twilio integration,
  reads the script built from the instruction, and hands back a transcript that a deterministic
  parser turns into `confirmed`, `denied`, `no_answer` or `unclear` with the sentence it read it
  from. Four rules the script cannot break, each covered by a test: only the last four digits of the
  account are ever spoken, nothing is promised, nobody is accused, and no data is requested. The
  outcome is appended to the ledger as evidence and **it never releases a payment**: every response
  carries `releasesPayment: false`. With no keys the endpoint answers 422 carrying the script, so
  the clerk calls from their own telephone and the control still works, slower. Two of these calls
  were placed for real on 2026-09-12, to a teammate's own phone, and the ids are in
  `docs/14-process.md#live-integrations-verified`.
- **Everything else is synthetic and watermarked.** One deterministic company from seed 69, every
  object carrying `synthetic: true`, every RFC prefixed `SYN`, and the UI watermark driven by the
  flag and never by a name. Real RFCs never sit next to fabricated evidence: `simulatePublication`
  throws on any RFC without the `SYN` prefix, so the only publication that can ever meet one of our
  invoices is an invented one. That is a rule in ADR-0002 and a test, not a promise.

## The blind evaluation

The sentence: **"quien escribe los casos etiquetados no escribe los detectores, y no abre esa
carpeta hasta que el codigo ya esta integrado."**

Why it matters, if they push: a team that writes its own test cases after writing its own detectors
is reporting how well it remembers what it built, and every judge has seen that number before. The
protocol is written down in `packages/seed/src/holdout/README.md`: the unit of account is a case by
detector pair, a zero denominator reports zero and never a silent 1.00, a case is never edited to
make a detector pass, and every case is validated twice so a malformed one throws instead of being
skipped, because a skipped case makes recall look better than it is. The number to defend is
`falsePositiveRate`, not `recall`: a sentinel that holds a legitimate payment twice is a sentinel
the clerk turns off, which is why ten of the thirty cases are hard negatives that look like fraud
and are not, among them a legitimate bank change backed by the supplier's own payment complement, a
new supplier ramping to a material share of the outflow, a round-number retainer, a quarterly
invoice that repeats an amount, a thin history with no baseline to test, and a partial legal-name
match that is fine.

**What the table said at `5d4d506`**, and this is the honest version of it:

```
cases 30            tp 17   fp 3   fn 4   tn 159
precision 85.0%     recall 81.0%          false positive rate 1.9%
action agreement 28 of 30
```

Then the part worth volunteering before anyone finds it, said as one sentence:

> Ninguno de los cuatro es un control que se haya quedado callado en un caso limpio. Los tres falsos
> positivos caen en casos donde la etiqueta si esperaba a ese detector, y en los diez negativos duros no
> disparo ninguno: eso es lo que vale del uno punto nueve por ciento. Los cuatro son desacuerdos sobre la
> severidad o el estado. En tres, el detector disparo con otra severidad. En el cuarto, el del sello del
> CEP, el verificador si produce un renglon pero en info, y la regla del harness cuenta info como
> contexto y no como alerta, asi que no satisface una etiqueta que pedia warning. Los dejamos en la tabla
> con los dos argumentos escritos, porque un conjunto de casos editado hasta que coincide no mide nada.

The four disagreements are in `packages/seed/src/holdout/README.md` with both arguments side by
side: a brand-new account over WhatsApp with nothing behind it (`critical` or `warning`), a supplier
published as presunto (`warning` or `critical`), a CEP naming a different holder (`comprobable` or
`requiere_verificacion`), and a seal we could not check (`warning` or `info`).

Those four are also the entire reason `beneficiary_cep` reads 0.0 percent today, and the honest reading
of that zero is the thing to have ready, because it is the row an engineer opens. Its two expectations
are the two CEP rows above. On the holder-name case the control fires at `requiere_verificacion` against
a label asking for `comprobable`, so the same case is a miss and a false positive at once. On the seal
case the verifier produces an `info` row rather than a `warning`, and `computeMetrics` scores `info` as
context and not as an alert, so the expectation is unsatisfied and nothing is counted as a false positive
either. Neither is the control going silent on a clean payment. `bun run eval --rows` prints both, and
it prints `got -` on the seal case, so know why before a judge asks.

Read precision, recall and the false-positive rate off the screen or off a fresh `bun run eval`,
with the case count next to them. Never from memory: three merges from now this block is stale, which
is why the numbers table says to re-run it.

## No model in the decision

Four reasons, all of them graded against us: cost that scales with volume, latency, non-determinism
that cannot be unit-tested, and financial data leaving the perimeter under LFPDPPP. ADR-0004.

What that means concretely, and it is a stronger claim than it sounds:

- The only package allowed to reach a model is `packages/extract`, and it may only transcribe. It
  sends one instruction string we wrote plus the bytes of one file a person chose to send. No
  supplier, no RFC, no legal name, no CFDI, no known account, no payment history, no SAT list, no
  CEP.
- The response schema has six field names and **no field a verdict, a score or a recommendation
  could be written into**. The model is not asked to be good; it is given nowhere to put an opinion.
- What comes back re-enters the deterministic layer immediately: the check digit, the Banxico
  participant catalogue and the OCR-aware distance against the accounts this supplier has actually
  been paid on. So a model error can only add friction. A misread digit fails the check digit or
  lands far from the known accounts, and either way a person reads the original.
- It is a test, not a promise: `packages/extract/src/boundary.test.ts` reads the package's own
  source and fails if a shipped module so much as names `decide`, `Finding`, `Decision`, `Severity`,
  `detect`, `score`, `recommend` or `risk`.

## Cost per verification

The claim: **"correr los seis controles sobre un pago no cuesta nada marginal, porque no hay
inferencia en esa ruta."** That is architecture, not an estimate, and it is the line in the unit
economics table that a judge should try to break.

| Unit of work | Cost | Source |
|---|---|---|
| The six controls on one payment instruction | MXN 0.00 marginal | ADR-0004 and `docs/06-regulatory-privacy.md` section 6.3, row "all six controls on all 120 instructions" |
| The one-cent beneficiary probe | MXN 0.01 of the client's own money, sent by a person from the client's own bank, plus a signature check that runs locally | ADR-0002 control 5 |
| Reading a CLABE off a photograph | Fractions of a US cent. USD 0.000207 per image and USD 0.000363 per 30-second voice note on Gemini 2.5 Flash-Lite, priced 2026-09-12 | `docs/06-regulatory-privacy.md` section 6.3 |
| One company, one month, four runs | USD 0.028, and USD 0.068 on a model 2.4 times more expensive | same table, sensitivity column |

Three consequences worth saying: a tenfold spike in pesos screened moves no cost line, because cost
scales with how many instructions arrive as a photograph and not with how much money moves; doubling
the model price still leaves the monthly figure under seven US cents per company, so nothing in the
margin depends on picking the cheap model; and the next cost step is on-device transcription, not a
cheaper per-transaction model, because there is no per-transaction model to make cheaper.

`TODO(garzario)` verify: the table above prices Gemini 2.5 Flash-Lite and 3.1 Flash-Lite, and
`.env.example` now configures `GEMINI_MODEL=gemini-3.6-flash`. Re-price the configured model at the
provider's pricing page, stamp the date, and update `docs/06` section 6.3 before quoting a per-image
figure on stage. Until then say "fracciones de un centavo de dolar por fotografia" and leave it.

`TODO(garzario)` verify: the only figure this repository has for a verification call is the USD 0.016
the provider reported for the two calls of 2026-09-12, recorded in
`docs/14-process.md#live-integrations-verified`. That is one observation, not a price: the ElevenLabs
per-minute rate and the Twilio termination rate to a Mexican mobile are still unread, and a call that
runs longer than 18 seconds costs more. Read both price pages, stamp the date, and add a row before
quoting a per-call cost. Do not say "casi cero" about the call either; the zero-marginal-cost claim is
about the six controls and it should not be stretched.

## The business, in the three sentences that get asked

- **Who pays.** The company, MXN 899 per month, bought by whoever signs off the payment run. The
  accounting firm plan is MXN 3,900 per month for up to 20 client companies, MXN 195 each, which per
  company is more expensive than a list subscription and we say so rather than hide it. What the
  firm buys is not coverage; it is not having the conversation where a client learns that a supplier
  it paid last year is now definitivo and the thirty-day window closed unwatched.
- **Why that number.** It is 4.5 times the published MXN 199 of 69b.mx `Smart` and 1.8 times Tesio's
  MXN 499 entry plan. Both of those check a list. We act on a payment. It is also 2.4 days of the
  legal wage floor for the person doing this by hand, and it breaks even at one stopped invoice of
  MXN 23,452 of subtotal per year.
- **What it avoids.** One held invoice of MXN 100,000 of subtotal pays 51 months of the
  subscription, because 46 percent of a disallowed subtotal reverses as ISR plus IVA. One misdirected
  SPEI of the same amount pays 111 months, because there is nothing to reverse. We claim no frequency
  for either, and the free supplier-register sweep in the go-to-market is the thing that measures it.

The channel is accounting firms serving 11 to 250 person companies in Monterrey and its industrial
corridor, because one firm holds the CFDI XML of twenty client companies and files the corrective
return when the thirty-day clock starts. Category named, no company named, because nobody has agreed
to anything.

## The eight hardest questions

The full answers with their evidence paths are in `docs/12-judge-qa.md`. What follows is the spoken
version: what the presenter says in one breath before opening a file. **If this file and `docs/12`
ever disagree, `docs/12` wins**, and this section gets fixed in the same pull request.

**1. The list is public and free. Why not just check it yourself?**

> Porque la consulta no es la parte dificil, la cadencia si, y la cadencia ya se vende: ValidX y
> Portal de Proveedores barren la lista a diario. Tiene que correr sobre cada proveedor en cada
> corrida, y otra vez hacia atras cada vez que el SAT publica, sobre facturas que ya pagaste y ya
> dedujiste. La lista cambio treinta y tres veces en doce meses, una cada once dias. La exposicion la
> crea la publicacion, no el pago, asi que revisar al dar de alta al proveedor no protege nada.
> Nuestro barrido reproduce la bitacora y pone precio a la base deducida, al ISR y al IVA por
> proveedor recien listado, y lo lee junto a la cuenta a la que esta por salir el dinero.

Open: `SweepResult` in `packages/core/src/domain.ts`, `sweep` in `packages/sat/src/sweep.ts`, beat 2.

**2. The bank already shows the beneficiary name.**

> Un banco si lo vende, HSBCnet, y unicamente para cuentas HSBC, por archivo y en horario: eso es
> higiene de una libreta de direcciones, no una puerta en la salida del pago. En general te lo
> muestra despues de que capturaste la cuenta, y lo compara contra nada, porque el banco no tiene la
> factura. Nosotros comparamos el nombre del titular en un comprobante firmado por Banxico
> contra la razon social del CFDI que estamos pagando, guardamos el XML firmado byte por byte como
> evidencia, y lo hacemos una vez por cuenta en lugar de una vez por pago. El registro de
> beneficiarios verificados es un activo que se acumula.

Open: `packages/cep/src/name-match.ts`, `POST /api/v1/cep/verify`, the CEP viewer.

**3. The one-cent probe needs a human, so it is not automatic.**

> Correcto, y es el diseno, no una limitacion. No custodiamos fondos y no ejecutamos transferencias,
> que es exactamente la razon por la que no necesitamos licencia y no tenemos arranque en frio. Una
> persona manda un centavo desde su propio banco, Banxico firma el comprobante, y esa verificacion
> sobrevive como evidencia. Lo automatizado es todo lo de alrededor: que cuentas lo necesitan, que
> tiene que decir el comprobante, y acordarse de la respuesta.

Open: `docs/06-regulatory-privacy.md` section 1, ADR-0002 control 5.

**4. Why rules and not a model?**

> Cuatro razones y las cuatro se califican: costo que escala con el volumen, latencia, no
> determinismo que no se puede probar unitariamente, y datos financieros saliendo del perimetro. La
> decision es deterministica y las pruebas corren aqui, sin red, enfrente de ti. El unico modelo que
> tocamos transcribe, y tiene prohibido opinar: el esquema de respuesta no tiene ningun campo donde
> quepa un veredicto, y hay una prueba que lee el codigo fuente del paquete y falla si aparece la
> palabra decide, score o recommend.

Open: ADR-0004, `packages/extract/src/boundary.test.ts`, run `bun test`.

**5. What is real and what is synthetic right now?**

> La lista del SAT es real y la puedes consultar tu, con el RFC que quieras: son catorce mil
> doscientos treinta y cuatro registros, descargados el doce de septiembre y guardados tal cual. El
> CEP es un documento real de Banxico y nuestro lector y verificador son reales; el que esta en
> pantalla hoy es el sintetico, y el de un centavo real es la evidencia que sigue. Todo lo demas,
> empresa, proveedores, facturas y CLABEs, es sintetico, marcado como tal en cada objeto y con
> marca de agua en pantalla. Un RFC real nunca aparece junto a evidencia fabricada, y eso lo
> sostiene una excepcion en el codigo, no una buena intencion.

Open: `packages/sat/src/snapshot/README.md`, `simulatePublication`, the watermark.

**6. What does one verification cost you?**

> Los seis controles sobre un pago cuestan cero marginal, porque no hay inferencia en esa ruta: eso
> es arquitectura, no una estimacion. La sonda de un centavo es un centavo del propio cliente mas
> una verificacion de firma local. Lo unico medido es leer una CLABE de una foto, que son fracciones
> de un centavo de dolar, y ni siquiera ocurre cuando la instruccion llega como dato. Diez veces mas
> volumen no mueve ninguna linea de costo.

Open: `docs/06-regulatory-privacy.md` section 6.3, `docs/05-business-model.md#unit-economics`.

**7. How does this scale beyond one platform, and beyond this volume?**

> Escala comercialmente porque el producto vive del lado del pagador: no necesitamos acuerdo con
> ningun banco, ni licencia, ni que nadie mas adopte nada, y los datos que leemos ya son del cliente.
> Tecnicamente, la ruta de lectura es una consulta indexada por empresa sobre una ventana de tiempo;
> sobre Timescale la bitacora es una hypertable con un agregado continuo, y sobre un Postgres normal
> es el mismo SQL contra la tabla base. Cada detector es lineal sobre esa ventana y no hace entrada
> ni salida, y en la ruta caliente no hay inferencia, asi que el costo no escala con el volumen. Lo
> primero que se rompe es el abanico del stream de eventos en un solo proceso, y se arregla
> particionando por empresa.

Open: `docs/07-architecture.md`, `packages/db/migrations/0004_timescale_sentryone.sql`.

**8. What did you cut?**

> Lo que decidimos dejar fuera esta escrito desde antes del primer commit, con su razon: cliente
> nativo de iOS, un sidecar de modelos en Python, proveedores de nube extra, y cualquier integracion
> de patrocinador que no cargue peso de verdad. Cuatro personas no mantienen cuatro superficies de
> infraestructura en treinta y seis horas. Y la regla para cortar tambien estaba escrita antes de
> necesitarla: si a las cuatro de la manana no habia rebanada vertical desplegada, se corta alcance
> y no se depura.

Open: `docs/14-process.md#what-we-cut-and-why`. `TODO(garzario)`: once the `cut` label on the board
is listed in `docs/14-process.md` at M3, name two of those out loud instead, including one you
wanted. Do not call an open issue a cut.

**And the one that always follows: why would this not be a feature inside an accounting product in
six months?**

> Podria serlo, y el camino mas rapido para ellos somos nosotros. De hecho ya hay un incumbente con
> las dos mitades adentro, CONTPAQi: tablero fiscal y dispersion masiva con conexion al banco en el
> mismo producto, y su propio changelog muestra que no se cruzan en el momento del pago. Lo dificil
> de copiar en seis meses no es la consulta a la lista, es el catalogo unido: en que cuentas le hemos
> pagado de verdad a este proveedor, establecidas por que documento, y la bitacora de eventos
> reproducible que hace posible el barrido retroactivo. Las plataformas de verificacion de
> beneficiarios de afuera no mencionan Mexico, ni CFDI, ni SAT, ni SPEI en su material publico, y los
> productos mexicanos que si conocen la lista no ven nunca la cuenta a la que esta por salir el
> dinero.

Open: `docs/04-market.md#competitor-map`, `KnownAccount` in `packages/core/src/domain.ts`.

Questions that are not in this eight and still get asked: what regulation applies, what about false
positives, why Nessie at all, and how do you know it works. All four are in `docs/12`.

## Delivery rules

- One presenter, one backup, both named in `docs/10-demo-script.md`.
- Open with the fiscal hook. Every time. It is the line ADR-0002 made binding.
- Plain words. Say "el comprobante que firma el banco central" once before saying "CEP", and "la
  lista del SAT" before saying "69-B".
- Say the synthetic-data sentence unprompted, in beat 1.
- Never say a number that is not in the numbers table above or on the screen.
- **Never claim the product is faster than doing it by hand.** The value is the loss prevented, in
  pesos. The eight-minutes sentence was said at the table on 2026-09-12 and it cost us the room. See
  "The value is the loss, not the minutes".
- **Never say "nadie hace esto" and never say "nosotros inventamos la prueba del centavo".** Both
  break in one search: ValidX sells a pre-payment hold on four SAT lists, and the one-centavo probe
  is Banco de Mexico's own Regla 51a Bis. Say "no encontramos a nadie que venda las dos mitades
  juntas", and say the centavo is a commodity. See "The competition, and the two sentences that lose
  the room".
- Never say "no nos dio tiempo". Say what we cut and why, which is a judgment story.
- If a gate in the table above is not ticked, say the version of the sentence that is true. The
  product is strong enough without the sentence that is not.
