# 04. Market, competitors and sizing

Worth 20 points across two sub-criteria: competitive differentiation (10) and market size (5),
plus it feeds the market-gap row (10). Every number below carries a numbered source at the end of
the file, with the access date.

Owner: Fabricio (`FabriBanda`). Due M2.

## Problem sizing

About **246,000 firms in Mexico employ between 11 and 250 people**: INEGI counted 5,468,180
economic units in the private sector and state enterprises in 2023, and 4.5 percent of them sit in
that band [1]. The ones that pay suppliers by SPEI are doing something irreversible: an accepted
transfer order is **firme, irrevocable, exigible y oponible frente a terceros** by law [2], so a
payment run is a one-way door.

The frequency is set by the SAT, not by the payer. In the twelve months to 31 July 2026 the
Article 69-B list moved **973 taxpayers to `definitivo`** and added **1,226 new `presuntos`**,
across **33 distinct publication dates**, roughly one change every eleven days [3]. Publication has
general effect: the invoices those taxpayers issued "no producen ni produjeron efecto fiscal
alguno", retroactively, and any buyer that gave them fiscal effect has **thirty days** from the
publication to prove the operation was real or file a corrective return [4].

The cost of one occurrence is arithmetic on published rates: for every **MXN 100,000** of subtotal
deducted from a supplier later declared `definitivo`, **MXN 46,000** of tax effect reverses, 30
percent ISR [5] plus 16 percent IVA [6], before surcharges and fines. A misdirected SPEI costs the
full amount, because there is nothing to reverse.

**What we did not verify:** how many of those 973 appear as suppliers inside a typical SMB ledger.
We measure that instead of asserting it, which is why `docs/05-business-model.md` carries a stop
condition tied to the observed hit rate.

## Competitor map

| Band | Who | What they do | What they structurally cannot do |
|---|---|---|---|
| Direct | 69b.mx [7] | One RFC against five SAT publications, daily, with a certificate of consultation. Published: free, `Smart` MXN 199 per month for 30 monitored RFCs, `Corporativo` MXN 1,999 | Runs on a list, not on a payment. No CFDI, no CLABE, no CEP, no arithmetic on the thirty-day window a publication opens |
| Direct | Tesio [8] | Free single-RFC check, plus a paid plan that cross-references downloaded CFDIs against the updated list with same-day alerts, sold to accounting firms. Published: from MXN 499 per month, unlimited RFCs | Stops at the tax ledger. It never sees the account the money is about to leave for, so it cannot catch a changed CLABE or verify who holds it |
| Adjacent | Trustpair [9], nsKnox [10], Eftsure [11] | Corporate payee verification before an accounts-payable run. Trustpair, "Best-in-Class Fraud Prevention and Account Validation Platform", 190 countries. nsKnox, "End-to-end B2B payment fraud protection for Corporates and Banks". Eftsure, "over 6 million verified businesses" | None of the three mentions Mexico, CFDI, SAT, SPEI or CLABE anywhere we could find on its site. They verify the account and ignore the counterparty's fiscal status, which is the larger Mexican loss |
| Adjacent | Online banking apps | Show a beneficiary name when the account is registered, then execute | The holder name that counts is the one Banxico signs, and Banxico publishes it in the CEP only after the transfer is irrevocable [12]. TODO(garzario) verify what each portal renders at registration |
| Status quo | The accountant, a spreadsheet and WhatsApp | A handful of RFCs checked by hand, once a month at best, against a list downloaded whenever someone remembers | Cannot see across counterparties, cannot run in the minutes before the money is irrevocable, and leaves no evidence the check happened |

Only companies that exist are named, and only what their own public material says is described.

## The gap

The three facts that decide whether a payment is safe are all public, all current, and never read
together at the moment that matters. The SAT rewrites the 69-B list every eleven days [3]. The CFDI
ledger naming the supplier sits in the company's own downloads. Banxico signs a CEP naming the
account holder for every SPEI, and publishes it after the transfer is irrevocable [12]. Each belongs
to a different tool and a different person: the list to a compliance product, the CFDI to the
accountant, the CEP to a post-mortem. The only window where joining them is worth anything is the
few minutes between approving a payment run and sending it, and nothing sits in that window. The gap
stays open because it is nobody's product surface, not because the data is missing.

The obvious adjacent product does not close it. Corporate payee verification [9] [10] [11] answers
"does this account belong to the payee", the right control where the loss is fraud. In Mexico the
larger and more frequent loss arrives from the counterparty's fiscal status, is retroactive, and is
invisible to a platform that reads neither the SAT list nor a CFDI.

## Sizing

Bottom-up. Entities times annual price. Price from `docs/05-business-model.md`: MXN 899 per company
per month direct (MXN 10,788 per year), MXN 195 per company per month through an accounting firm
(MXN 2,340 per year).

| Layer | Definition | Formula | Number | Source |
|---|---|---|---|---|
| TAM | Every Mexican firm of 11 to 250 people | 246,068 x MXN 10,788 | **MXN 2,655 million per year** | INEGI CE 2024, definitive results [1] |
| SAM | Those that are formal, so they issue and receive CFDI and pay by SPEI | 87,846 x MXN 10,788 | **MXN 948 million per year** | INEGI formality rate 35.7 percent [1] |
| SOM | Winnable in 36 months through accounting firms | (2,400 x MXN 2,340) + (600 x MXN 10,788) | **MXN 12.1 million per year** | Channel plan below |

### Assumptions, one line each

1. **Universe.** 5,468,180 economic units in 2023, 4.5 percent of them at 11 to 250 people [1]. The
   percentage is published rounded to one decimal, so the true count is 243,334 to 248,802. We use
   246,068, and the range moves TAM by about 1 percent.
2. **Annual value per entity.** MXN 899 per month, anchored in `docs/05-business-model.md` against
   two published competitor prices and one published wage floor.
3. **The SAM filter** is formality, at INEGI's all-size rate of 35.7 percent [1], and it excludes
   informal units, which neither issue CFDI nor pay by SPEI. Deliberately conservative: formality
   rises with headcount, INEGI does not publish the rate for this band, and rather than assume a
   higher one we accept a SAM that is almost certainly understated.
4. **The SOM** is a channel count, not a share of SAM: 120 accounting firms signed over 36 months at
   20 client companies each, plus 600 companies sold direct. That is 3,000 companies, 1.2 percent of
   the TAM universe and 3.4 percent of the SAM universe. Both direct competitors [7] [8] already
   sell through that channel behind a free single-RFC check, which is the evidence it exists.
   Neither publishes a customer count, so we quote none.

### Why the arithmetic is the point

One company costs about MXN 64 per month to serve and pays MXN 899 or MXN 195
(`docs/05-business-model.md#unit-economics`). Multiply by whichever layer you believe. A judge who
rejects the 35.7 percent filter changes one cell and recomputes, which is the reason the sizing is
built this way.

## Sources

Every link was opened on **2026-09-12**. Source 3 is reproducible: download the file and count it.

1. INEGI, *Censos Económicos 2024, resultados definitivos*, comunicado de prensa 79/25, 24 July
   2025. Units, size split and formality:
   <https://www.inegi.org.mx/contenidos/saladeprensa/boletines/2025/ce/CE2024_def.pdf>
2. *Ley de Sistemas de Pagos*, article 11, last reform DOF 14 November 2025:
   <https://www.diputados.gob.mx/LeyesBiblio/pdf/LSP.pdf>
3. SAT, *Listado completo de contribuyentes (Artículo 69-B del CFF)*, open data, file header states
   data updated to 31 July 2026. 14,761 rows, 14,439 distinct RFCs, of which 11,917 `definitivo`,
   1,666 `sentencia favorable`, 838 `presunto`, 340 `desvirtuado`. The 973, 1,226 and 33 figures are
   counted from the publication-date columns of the same file:
   <https://wu1agsprosta001.blob.core.windows.net/agsc-publicaciones/Datos_abiertos/Documents_AGAFF/Listado_completo_69-B.csv>,
   linked from <https://www.sat.gob.mx/minisitio/DatosAbiertos/contribuyentes_publicados.html>
4. *Código Fiscal de la Federación*, article 69-B, last reform DOF 9 April 2026:
   <https://www.diputados.gob.mx/LeyesBiblio/pdf/CFF.pdf>
5. *Ley del Impuesto sobre la Renta*, article 9, rate of 30 percent, last reform DOF 1 April 2024:
   <https://www.diputados.gob.mx/LeyesBiblio/pdf/LISR.pdf>
6. *Ley del Impuesto al Valor Agregado*, article 1, rate of 16 percent, last reform DOF 12 November
   2021: <https://www.diputados.gob.mx/LeyesBiblio/pdf/LIVA.pdf>
7. 69b.mx, pricing page: <https://69b.mx/>
8. Tesio, 69-B verifier and pricing line: <https://tesio.com.mx/verificar-69b/>
9. Trustpair: <https://trustpair.com/>
10. nsKnox: <https://www.nsknox.net/>
11. Eftsure: <https://home.eftsure.com.au/payment-fraud>
12. Banxico, *Comprobante Electrónico de Pago*, the public CEP lookup and the CEP XML validator:
    <https://www.banxico.org.mx/cep/>. Background on the SPEI flow and where the CEP is generated:
    Banxico, *Informe Trimestral Enero-Marzo 2018*, recuadro 5:
    <https://www.banxico.org.mx/publicaciones-y-prensa/informes-trimestrales/recuadros/%7BA54ACBE5-9C29-545C-9A39-91131172F167%7D.pdf>

Current SPEI volume, if a judge asks for it live, is Banxico SIE table CF891, *Número de
operaciones tercero a tercero en SPEI*, daily since 2009:
<https://www.banxico.org.mx/SieInternet/consultarDirectorioInternetAction.do?sector=21&idCuadro=CF891&accion=consultarCuadro&locale=es>.
TODO(garzario) verify a specific annual figure at the source before quoting one in the pitch. No
volume number enters this file until it has been read off that table.
