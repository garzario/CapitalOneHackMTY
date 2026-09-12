# 04. Market, competitors and sizing

Worth 20 points across two sub-criteria: competitive differentiation (10) and market size (5),
plus it feeds the market-gap row (10). Every number below carries a numbered source at the end of
the file, with the access date.

Owner: Fabricio (`FabriBanda`). Due M2.

Extended on 2026-09-12 in the afternoon, after three Capital One judges asked the same three
questions at the table: how many people have this problem in Mexico and is there demand, who is
already doing it here and what problems do they face, and who exactly is the target user. Those
three answers now open the file, ahead of the sizing, because that is the order they were asked in.
Sources 1 to 12 are unchanged, 13 belongs to `docs/05-business-model.md` which numbers into this
list, and everything from 14 on was added in that pass.

## Demand: how many have the problem and how we know

Two losses, not one, measured by two different institutions, arriving through the same payment. A
misdirected SPEI is a fraud loss and INEGI, Condusef and KPMG count it. A toxic supplier invoice is
a fiscal loss and the SAT counts it. Nobody counts the intersection, which is the first thing to say
out loud rather than the last.

### The fraud side

| Number | What it counts | Source |
|---|---|---|
| **49.0 percent of medium-sized and 40.7 percent of small** economic units were victims of at least one crime during 2023, against 47.3 percent of large and 26.3 percent of micro, on a national average of 27.2 percent | INEGI's victimisation survey of businesses, prevalence by size. Medium-sized units are the most victimised band in the country, ahead of even large firms, and small units are third | [14] |
| **1.3 million establishments** victimised in 2023, at a total cost of **MXN 124.3 thousand million**, 0.51 percent of GDP, averaging MXN 54,451 per economic unit | The same release: the denominator and the money, across all crime types | [14] |
| **8.5 percent of the 2.9 million crimes** against economic units in 2023 were fraud, a rate of **522 per 10,000 units**, at **MXN 18,370** each | The same survey, incidence and cost by crime type. 8.5 percent of 2.9 million is roughly 247,000 fraud events in one year, which is arithmetic on two published figures and not a third published figure | [15] |
| **24 percent** of the cyberattacks reported by surveyed companies were **impersonation of a supplier or of staff by email**, tied second with corporate identity impersonation on social media, behind phishing at 59 percent and ahead of illicit network access at 17 percent | KPMG Mexico, the only Mexican measurement we found that names this exact attack. In the same study 45 percent of surveyed companies reported an attempted or materialised fraud, identity theft is the second most recurrent type at 44 percent, and only 43 percent use supplier and staff due diligence as a preventive control | [16] |
| **5,213,358 possible-fraud claims** against Mexican banks in full-year 2025, 72 percent of 7,235,597 total claims and up 8.7 percent, for **MXN 22,341 million** claimed | Condusef's Buro de Entidades Financieras, reported by El Universal. Total claimed fell 35.6 percent to MXN 31,419 million | [17] |
| Banks refunded **MXN 1,265 million of the MXN 5,201 million** claimed for fraud in the first quarter of 2026, **24.3 percent**, on 1,515,000 fraud claims, up 31.5 percent year on year | The same register one quarter later. This is the thesis in one official ratio: once the money is gone, about one peso in four comes back | [18] |

Four limits on those six rows, stated here so they are ours and not a judge's. The victimisation
survey classifies units only as micro, pequena, mediana and grande and the release publishes no
employee thresholds, so reading an 11-to-250 band onto pequena plus mediana is our approximation and
not INEGI's; by frequency the ranking reverses, with large units averaging 4.1 crimes per victimised
unit against 3.0 for medium and small [14]. Its `Fraude` category is neither defined nor broken down
in the presentation, so bank fraud is not explicitly named and a supplier-impersonation subcategory
does not exist, and the MXN 18,370 is in constant pesos at prices of the second half of July 2018
[15]. KPMG surveyed more than 100 organisational leaders across 15 states in August 2024, so 45
percent is 45 percent of respondents and not of Mexican companies [16]. Condusef's register counts
claims by users of banks and does not separate personas morales from consumers, so not one of those
5.2 million claims can be attributed to a company [17] [18].

The reason a judge has never heard of this problem is in the same release: **90.3 percent of the
crimes committed against economic units in 2023, 2.6 million of them, produced no complaint or no
investigation file, and only 12.2 percent were reported** [14]. That is also why there is no Mexican
court case with an amount anywhere in this document.

### The fiscal side

| Number | What it counts | Source |
|---|---|---|
| **About 2,000 audits of the persons who bought false invoices**, alongside more than 3,000 factureras published in the DOF and more than 38,000 companies blocked, between October 2024 and August 2026 | The head of the SAT, Antonio Martinez Dagnino, reported three days before this hackathon. It is the only public count of enforcement aimed at the buyer rather than the issuer. In the same remarks, false invoices can represent up to 10 percent of the expenses of companies that pay less ISR or report tax losses | [20] |
| **903 EFOS published in 2026** to the close of 12 June, and the digital seal restricted for **7,300 taxpayers** beyond the published factureras | Gari Flores Hernandez, administrador general de Recaudacion of the SAT, at a press conference with the IMCP. Expansion adds, on its own records, that EFOS publications did not pass 500 a year from 2021 | [21] |
| **Thirty natural days** from the DOF publication to reverse the fiscal effect through a complementary return, or the authority temporarily restricts the digital seal certificate and the company can no longer issue CFDI. The SAT has **45 business days** from the notification of its resolution to publish, and the express visit itself is capped at 24 business days | Codigo Fiscal de la Federacion article 49 Bis, added by the decree published in the DOF on 7 November 2025 and in force since 1 January 2026 | [4] |
| **Two to nine years of prison** for whoever, directly or through an intermediary, buys, acquires or gives fiscal effect to a false invoice | CFF article 113 Bis. The two-to-nine range has covered the buyer since the 2019 reform, in force from 1 January 2020; the paragraph that adds giving `efectos fiscales` to false invoices arrived with the same 2025 decree | [4] |
| The third of the three numbered sections of the **Plan Maestro 2026** is "Combate a quienes venden y compran facturas falsas", and it states the thirty days and the suspension of invoicing in plain language | The SAT's own published strategy for the current fiscal year | [22] |
| **86.3 percent of pymes**, which is INEGI's own label for the 11-to-250 band, used accounting systems or paid for external accounting in 2023, up 18.9 points from 2018, against 26.0 percent of micro units | INEGI CE 2024. The CFDI XML this product reads already exists and is already in somebody's hands, and the 11-employee floor is a published discontinuity rather than a round number we liked | [24] |
| **8,204 EFOS**, **8,827,390 false invoices**, about **MXN 1.6 billones** of face value and **MXN 354,512 million** of implied evasion, 1.4 percent of GDP, from 2014 to June 2019. 60 percent of definitive EFOS sat in nine states, led by Mexico City, Jalisco and **Nuevo Leon** | SAT press release. The same release records 23 criminal complaints filed in one month against companies that had deducted simulated operations, so buyer-side enforcement is not a 2026 invention | [23] |

What changed on 1 January 2026 is the "why now", and it is two sentences. The downside for the
person who authorised the payment is no longer a reversed deduction plus 30 percent ISR [5] and 16
percent IVA [6]; it is a criminal exposure of two to nine years for giving fiscal effect to the
invoice [4]. And the 45 business days the SAT has to publish after resolving [4] define a window in
which a supplier is already condemned and not yet on any list, which is exactly where CLABE
forensics and a change in supplier behaviour have to carry the decision on their own.

### How much money goes through the door we are standing in

SPEI moved **more than 7,300 million transfers in 2025, up 36.8 percent on 2024, and 94 percent of
them were for 1,500 UDIs or less, about MXN 13,200**, per the Governor of Banco de Mexico before the
Senate Hacienda committee [19]. The residual six percent, on the order of 440 million transfers a
year by arithmetic on those same two figures, is where a supplier invoice lives. This product is not
aimed at 7,300 million retail transfers, and the risk surface is compounding at 36.8 percent a year.

Nothing on the rail is watching that residual. Regla 12a of the SPEI rules makes the 18-digit CLABE
and the amount the only data a bank must require in order to process a transfer, and puts the
beneficiary's name in the optional block the payer merely "decida especificar" [29]. Regla 25a then
requires the bank to show that name back to the payer exactly as the payer typed it, "seguido de la
siguiente frase: (Dato no verificado por esta institucion)" [29]. Regla 18a makes the order "firmes,
irrevocables, exigibles y oponibles frente a terceros" the moment the Administrador liquidates it
and publishes the Avisos de Liquidacion [29], which on a 24/7 SPEI is seconds after the click. A
supplier-impersonation payment is therefore not an exception in SPEI. It is the design: the CLABE is
the only field that routes money, and it is the one field a fraudulent invoice changes.

The reform that is arriving does not close it. Banxico's mandatory user-experience guidelines for
mobile transfers, version 1.1, published 28 August 2026 and in force 14 December 2026 under Circular
9/2026, say of the confirmation screen that the beneficiary's name "podra mostrarse enmascarado" and
that "cuando el usuario haya ingresado este dato manualmente, podra senalarse que el nombre no es
validado por la Entidad" [30]. For the CLABE flow the rules require a lookup of the receiving
institution and never of the account holder. Two caveats we volunteer: that wording is carried over
from version 1.0 of 16 June 2026 rather than new, and the phone-number flow does mandate a looked-up
masked name. The scope line matters more than either, because the guidelines apply to mobile
applications used by personas fisicas [30], so the corporate web portal and the uploaded payment
file, which is how a company of 11 to 250 people actually pays suppliers, are out of scope entirely.

### What is not known, and we say it before a judge finds it

- **No Mexican peso figure for supplier impersonation, business email compromise or CLABE-change
  losses.** Condusef, the CNBV, Banxico, the Guardia Nacional and the FGR publish none that we could
  open. KPMG gives the share of the attack, 24 percent [16], and no pesos anywhere.
- **No split of Condusef's claims between companies and consumers.** The 5.2 million possible-fraud
  claims of 2025 [17] and the 1.5 million of the first quarter of 2026 [18] cannot be attributed to
  businesses, and we never present them as business losses.
- **No cross of fraud against company size.** The victimisation survey publishes prevalence by size
  and incidence by crime type as separate charts [14] [15]. The cross needs the tabulados or the
  microdata, which we did not open.
- **No business-to-business share of SPEI.** Neither Banxico nor the ABM publishes it. Banxico SIE
  table CF891, *Numero de operaciones tercero a tercero en SPEI*, daily since 2009, is the primary
  series and we could not read it: the page renders through JavaScript, the CSV, XLS and IQY export
  endpoints return the page shell, and the REST API needs a token. So the 7,300 million rests on the
  Governor's Senate remarks as reported [19] and not on a series we summed.
  <https://www.banxico.org.mx/SieInternet/consultarDirectorioInternetAction.do?sector=12&accion=consultarCuadro&idCuadro=CF891&locale=es>
- **No SAT count of the standing EDOS population.** There is no buyer-side list; the SAT publishes
  issuers. The roughly 2,000 audits [20] and the 23 complaints [23] are enforcement flows, not a
  census, and any standing number would have to be modelled from them and labelled as modelled.
- **No SAT figure for pesos of simulated operations actually deducted by buyers.** The MXN 1.6
  billones is invoice face value and the MXN 354,512 million is estimated evasion [23]. Neither is a
  buyer loss pool and neither is presented as one.
- **No court judgment, tesis or FGR file** naming a Mexican SMB, an amount and a supplier
  impersonation. Expected, given the 90.3 percent of crimes against economic units that produced no
  complaint or file [14], and worth saying out loud for exactly that reason.
- **No survey of how many Mexican SMBs check the 69-B list, or how often.** Nothing published, from
  INEGI, Condusef, the IMCP or anyone private. `docs/05-business-model.md` measures it with the free
  supplier-register sweep and carries a stop condition on the result, instead of asserting a rate.

## Problem sizing

About **246,000 firms in Mexico employ between 11 and 250 people**: INEGI counted 5,468,180
economic units in the private sector and state enterprises in 2023, and 4.5 percent of them sit in
that band [1]. The ones that pay suppliers by SPEI are doing something irreversible: an accepted
transfer order is **firme, irrevocable, exigible y oponible frente a terceros** by law [2] and by
the SPEI rules themselves [29], so a payment run is a one-way door.

The frequency is set by the SAT, not by the payer. In the twelve months to 31 July 2026 the
Article 69-B list moved **973 taxpayers to `definitivo`** and added **1,226 new `presuntos`**,
across **33 distinct publication dates**, roughly one change every eleven days [3]. Publication has
general effect: the invoices those taxpayers issued "no producen ni produjeron efecto fiscal
alguno", retroactively, and any buyer that gave them fiscal effect has **thirty days** from the
publication to prove the operation was real or file a corrective return [4]. Since 1 January 2026
that deadline has a named consequence in the same code, the temporary restriction of the digital
seal certificate, and a criminal penalty behind it [4], and the SAT's own annual strategy puts the
buyer in the title of one of its three sections [22].

The cost of one occurrence is arithmetic on published rates: for every **MXN 100,000** of subtotal
deducted from a supplier later declared `definitivo`, **MXN 46,000** of tax effect reverses, 30
percent ISR [5] plus 16 percent IVA [6], before surcharges and fines. A misdirected SPEI costs the
full amount, because there is nothing to reverse and, on the regulator's own numbers, about one peso
in four comes back from the bank [18].

**What we did not verify:** how many of those 973 appear as suppliers inside a typical SMB ledger.
We measure that instead of asserting it, which is why `docs/05-business-model.md` carries a stop
condition tied to the observed hit rate.

### Where the segment actually is

| Cut | Count | What the instrument counts | Source |
|---|---|---|---|
| Nuevo Leon, the venue | **about 18,500** economic units at 11 to 250 people, 10.2 percent of the state's 181,791, and that band employs 35.6 percent of its 1,925,137 workers, roughly 685,000 people | INEGI CE 2024 definitive for the state. Micro units are 89.3 percent of units and 21.7 percent of employment; large units are 0.6 percent of units, 42.7 percent of employment and 55.7 percent of value added. The percentages are published to one decimal, so the count is 18,452 to 18,634 and the absolutes are ours, not INEGI's | [25] |
| The four sectors with the longest supplier lists | **89,523 establishments** at 11 to 250 people nationally: manufacturing 34,697, wholesale trade 27,786, transport and warehousing 16,531, construction 10,509. **54,555 of them, 60.9 percent, sit in the 11-to-30 sub-band** | DENUE, counted by us from the bulk sector files by filtering the personal-ocupado strata. Reproducible in one command, and the sub-band is the product point: too small for an ERP payment module, large enough for a weekly run | [26] |
| The channel | **16,356** accounting and audit units nationally, SCIAN 541211, **737 in Nuevo Leon**, and 12,130 of the 16,356 employ five people or fewer | DENUE, same method. The 120 firms in the SOM below are 0.7 percent of that denominator, which is why the channel plan is an ask rather than an assertion | [26] |

DENUE counts establishments and carries no formality flag, while the Censos Economicos count
economic units, so 89,523 and 246,068 come from different instruments and do not add. Neither can be
crossed with formality either: CE 2024 publishes size and formality as separate charts and never
crosses them, which is why the SAM filter below stays a blunt national rate.

**What we did not verify:** the municipality-level DENUE count for Apodaca, where the synthetic
company in `packages/seed` sits, and any count of firms in this band from the ENAFIN frame, whose
tabulados render as a JavaScript shell. TODO(FabriBanda) before the pitch, or drop both from the
narrative.

### Two SAT files, and the one the product ships

The SAT publishes the 69-B listing through two endpoints, and on any given day they are not the same
file. This repository reads both, for two different purposes, and a judge who downloads one of them
will count a number that is not in the other. So both are stated here with their date.

| | The committed snapshot | The open-data export |
|---|---|---|
| File | `packages/sat/src/snapshot/official-2026-09-12.csv`, 4,566,277 bytes, committed unmodified | Source [3] below |
| Endpoint | `omawww.sat.gob.mx/cifras_sat`, which answers over HTTP and not over HTTPS | `wu1agsprosta001.blob.core.windows.net`, linked from the SAT open-data page |
| Current to | **2025-12-31**, stated by the file in its own first line | **2026-07-31**, stated by its own header |
| Retrieved | 2026-09-12 03:48 local, `Last-Modified` on the server 2026-01-22 | 2026-09-12 |
| Rows | **14,234** data rows on 14,247 physical lines, which the loader turns into 28,935 dated situations | **14,761** rows, 14,439 distinct RFCs |
| What it is used for | Everything the product answers: `GET /api/v1/sat/lookup`, the `sat_69b` control and the retroactive sweep, with no network | The frequency counts in this file: 973 moved to `definitivo`, 1,226 new `presuntos`, 33 publication dates |

**The product ships the committed snapshot.** It is the file the lookup box answers from when a judge
types an RFC, because a control that only works while the SAT portal is reachable is a control that
does not work, and that endpoint is plain HTTP over a conference network. The 527-row and seven-month
gap between the two is vintage and nothing else: same listing, same columns, different cut-off dates,
so neither count is evidence against the other. The provenance of the committed file, down to the
encoding and the two rows that span physical lines, is in `packages/sat/src/snapshot/README.md`, and
refreshing it is four steps at the end of that file, one of which is that the counts asserted in
`official.test.ts` must be updated by hand so a change in the list cannot pass as a change in the
parser.

One scope correction that came out of the competitor research and belongs here: 69-B is no longer the
only list the SAT publishes against suppliers. Article 49 Bis, in force since 1 January 2026, creates
its own publication [4], and two incumbents already monitor it by name, one of them shipping support
in July 2026 [31] [33]. TODO(garzario): decide before M4 whether `packages/sat` adds 49 Bis and 69-B
Bis, or whether the docs state plainly that the sweep covers 69-B only. Sweeping one list while a
competitor sweeps four is a question we would rather answer than be asked.

## Competitor map

Only companies that exist are named, and only what their own public material says is described.

**The honest headline first, because it is the one a judge can break.** Checking a supplier against
the 69-B list before paying is not our invention, and holding a payment on it is already sold in
Mexico [31] [32]. Neither is the one-cent SPEI with a CEP read-back, which is sold as a metered API
at MXN 8.93 to 17.85 per call [36] and is written into the SPEI rules as something Banco de Mexico
itself does [29]. The Mexican market has split this product's thesis in two: one camp owns the
fiscal half and some of it already holds payments, the other camp sells the account-holder primitive.
We found nobody selling both halves joined, and nobody selling the account-change history at all.
That join is the claim. "We invented checking 69-B before paying" is not, and it is not made here or
at the table.

### The fiscal camp, who already holds a payment on a SAT list

| Company | What they sell, in their words | Winning feature | The problems they face, from their own dated material | What they cannot do that we do |
|---|---|---|---|---|
| **ValidX** [31] | "Antes de pagar. Semaforo en tu ERP: cada pago consulta el estatus del proveedor; si no cumple, se retiene y se notifica a Compras". Daily re-screening of the SAT 69, 69-B, 69-B Bis and 49-Bis lists "contra todo tu padron, con la fecha de publicacion en el DOF y el estatus exacto" | The closest direct competitor found. A pre-payment hold plus a daily whole-padron sweep of four SAT lists, delivered as a GraphQL API with webhooks, batches to 50,000 records | Its own coverage table marks only the SAT as `Disponible`; Infonavit is `En integracion` and IMSS, STPS/REPSE, Buro de Credito, registros publicos and every OFAC, ONU, UE and PEP list are `En el roadmap` and, per its FAQ, "no se pueden consultar hoy", so "20+ fuentes" is a catalogue count. It also publishes the ceiling it works under, "el SAT permite 2,000 descargas por RFC y por dia" and "su portal devuelve maximo 500 filas por consulta", says it is "abriendo por fases con un grupo reducido de clientes", ships no named ERP connector, and publishes no price | RFC level only. No CFDI XML parsing, no CLABE, no account-change forensics, no one-cent SPEI, no CEP, no duplicate detection, no expected-loss arithmetic. The hold and the notice to Compras execute in the customer's own system, which the customer has to build |
| **Portal de Proveedores**, Bimetrics, by Binaware Solutions, Monterrey [32] | Suppliers upload invoices, payment complements, Carta Porte and cartas de opinion de cumplimiento, and "el portal los valida ante el SAT y detiene el pago cuando un documento vence". It audits suppliers daily against the 69 and 69-B lists and alerts on EFOS or "no localizados" "antes de que pagues una factura que no vas a poder deducir" | Three of our six controls in one product with real published scale, and it holds payment. Self-reported: 125,000+ CFDI validated per month, 20,000+ registered suppliers, 14,000 suppliers in one implementation, 28 years building software in Mexico. A Monterrey company, so judges may know it | Every figure is self-reported on its own marketing site and unaudited. The structural problem is the shape: it is a buyer-imposed enterprise portal where the large corporate makes suppliers log in and upload documents, 14,000 of them in one deployment, which a company of 11 to 250 employees has no leverage to demand | No bank layer at all: no CLABE, no account verification, no CEP, no expected-loss decision. And no supplier onboarding is required by us, because we read the company's own CFDI XML |
| **CONTPAQi Contabilidad-Bancos** [33] | Release notes only. Version 19.2.0, published 14 July 2026, adds the situation "No desvirtuados (49 Bis)" to the existing "EFOS y No localizados" indicator in the tablero fiscal, plus a notification if the open company itself appears on the 49 Bis list | It holds both halves in one product: the fiscal dashboard has consulted EFOS and "No localizados" since 16.1.1, and the same product generates mass payments and connects directly to bank accounts, including Banorte BEM in 19.1.2 on 25 May 2026, with EFOS and EDOS CFDI reports added in 19.0.1 on 17 February 2026 | The market gap stated by an incumbent's own changelog. We call nobody dominant here, because no installed base is published. No carta tecnica summary from 14.2.4 through 19.3.1 describes validating a beneficiary's RFC or bank account against the EFOS, No localizados or 49 Bis lists before a payment goes out. The nearest feature, beneficiary and payer RFC association on unapplied movements in 19.3.1, is after-the-fact bookkeeping | Join the two halves. The fiscal signal lives in a retrospective dashboard over CFDIs already booked; mass payment generation and the bank connection live in the same product, and the two never meet at the moment of payment |
| **Bind ERP** [34] | Its own help centre: "El sistema no restringira la realizacion de recepciones de mercancia ni el registro de ordenes gastos con proveedores incluidos en la Lista de EFOS, pero si te alertara sobre su presencia en esta lista" | Zero-friction adoption, and a free public EFOS verifier for non-customers, which tells you what a 69-B lookup is worth as a product: it is a lead magnet | The warning-fatigue failure mode admitted in one sentence of vendor documentation. A supplier on the list gets a warning icon and a tab, and the transaction goes through. The page does not cite article 69-B by name either | Decide. Hold, verify or release with an amount at risk attached, instead of an icon nobody acts on. This single row is the strongest argument for our decision model |
| **69b.mx** [7] | One RFC against five SAT publications, daily, with a certificate of consultation. Published: free, `Smart` MXN 199 per month for 30 monitored RFCs, `Corporativo` MXN 1,999 | The lowest published subscription price among the named competitors, and the certificate is a real artifact for an audit file | Runs on a list, not on a payment. A per-RFC monitoring quota is the wrong unit when the exposure is created by a publication that lands on a supplier you stopped monitoring | No CFDI, no CLABE, no CEP, and no arithmetic on the thirty-day window a publication opens [4] |
| **Tesio** [8] | Free single-RFC check, plus a paid plan that cross-references downloaded CFDIs against the updated list with same-day alerts, sold to accounting firms. Published: from MXN 499 per month, unlimited RFCs | It already reads the CFDI ledger and it already sells through the accounting-firm channel, which is the evidence that channel exists | Stops at the tax ledger. Same-day alerting on a list is a reporting product, and the money has already moved by the time the report is read | It never sees the account the money is about to leave for, so it cannot catch a changed CLABE, verify who holds it, or price the decision |

### The money camp, who moves the pesos and does not check the counterparty

| Company | What they sell, in their words | Winning feature | The problems they face, from their own dated material | What they cannot do that we do |
|---|---|---|---|---|
| **Verificamex** [35] [36] | "Prueba del Centavo SPEI": send the CLABE or the debit card and "confirmamos que la cuenta existe, esta activa y a nombre de quien esta registrada ante el SPEI". It returns the holder's name and the RFC or CURP it is registered under, plus the CEP, over a catalogue of "mas de 90 bancos y entidades financieras del sistema SPEI" | Our own second control, already commoditised: 20 tokens per penny test, MXN 0.8925 per token at the 1,000-token tier down to MXN 0.4463 at 2,000,000, so **MXN 17.85 down to MXN 8.93 plus IVA per verification**, no contract, no monthly rent, MXN 500 minimum purchase, balance valid twelve months | Positioning. Its whole catalogue is identity and electronic signature, INE Lista Nominal, RENAPO CURP, CFE, biometrics, NOM-151, RFC ante SAT at 2 tokens, with no 69-B, no CFDI and no payment decision anywhere. Its published "por validacion" column is also benchmarked to the 20-token full identity check rather than to the penny test, and it never calls the CEP Banxico-signed | Decide anything. It verifies one account in isolation, with no history to compare it against and no fiscal status beside it. This is our build-versus-buy answer and our hard COGS anchor, not our competitor: MXN 9 to 18 plus one centavo per supplier account |
| **Clara** [37] | "Mas de 40,000 empresas confian en Clara". "Conexion directa con el SAT para validar y organizar tus facturas al instante", plus "flujos de aprobacion personalizados para que nada salga sin tu validacion, manteniendo trazabilidad total de cada movimiento" | Invoice validation and internal approval in one flow, and batch dispersal: "carga un archivo .xlsx con multiples beneficiarios y dispersa cientos de pagos SPEI en un solo paso" | The attack surface in one sentence of their own copy. The invoice is validated with the SAT and the approver is validated internally, and the destination CLABE arrives from a spreadsheet the payer uploads. Its accounts-payable page names no verification of who owns the destination account and no 69-B or EFOS check. Stated precisely: this is what their own material describes, not a denial that other controls exist on a page we did not read | Verify who is being paid. Invoice-valid plus approver-valid plus beneficiary-unknown is the exact combination a supplier impersonation survives |
| **Xepelin** [38] | Confirming for Mexican pymes. "+10Bn USD financiados en los ultimos 3 anos", "+80,000 empresas nos eligen en Mexico y Chile" (the two countries combined), "<24hrs aprobacion y desembolso 100% digital", "+250 operaciones financiadas por dia" | It finances the payment as well as making it, and it reads the SAT connection to pick the invoices, so the CFDI is already in the flow | Its own three-step flow is the finding: verify your credit line, link your SAT account and select invoices, confirm conditions and pay. There is no counterparty or supplier verification step anywhere on the page, and the FAQ confirms suppliers need not be registered with Xepelin at all | The middle step. CFDI in, SPEI out, with nothing between them, at 250 financed operations a day |
| **albo empresa** [39] | A CNBV-authorised IFPE. "+50,000 empresas que confian en albo empresa", "+$71 mil millones MXN en transacciones mensuales", and bulk payments of "hasta 3,000 transacciones de forma simultanea. Dispersa nomina, paga proveedores" | Regulated infrastructure and real throughput, with account opening published at under 48 hours | Its published protection is authentication and monitoring: "tecnologia, autenticacion avanzada y una infraestructura regulada por la CNBV", and "cada movimiento cuenta con mecanismos de autenticacion y monitoreo". Nothing on the page names counterparty verification or the 69-B list, and its only SAT features are tax payments | Answer the other question. Authentication answers "is it really you paying". We answer "is it really them being paid", which is the question every incumbent in this table collapses into the first one |
| **Yaydoo**, now inside **Paystand** [40] | Its founder and chief executive, who is also Paystand's chief product officer, told El Cronista Mexico on 31 March 2026 that Yaydoo has grown more than 100 percent year on year and that its client profile has moved "de atender principalmente al segmento pyme a incorporar cada vez mas medianas y grandes empresas". The article's own framing: "ahora va por las grandes" | Scale. Paystand processes more than USD 20 thousand million a year for more than one million companies, and is bringing its own payment processing directly to Mexico | It is the answer to "who exactly is the target user", given by a competitor about itself. A funded incumbent is leaving the segment we serve, and it said so in a named outlet six months ago | Stay. A product built for medianas and grandes arrives with an implementation, and the 11-to-250 firm has one clerk and a browser |
| **Mendel** [41] | Its own newsroom, 27 March 2025: a USD 35 million Series B led by Base10 Partners, building "la plataforma de gestion de gastos y viajes corporativos pensada para las grandes empresas de Latinoamerica", positioned as "la alternativa moderna a soluciones heredadas como SAP Concur" | Enterprise credibility: "mas de 500 companias ya confian en Mendel, incluyendo a referentes como Mercado Libre, FEMSA, Adecco y Arcos Dorados" | Self-reported on its own newsroom and unaudited. More useful as a boundary than as a competitor: the tier above us is occupied and funded, so the question "why would Mendel not just add this" answers itself. Their named customers are Mercado Libre and FEMSA, whose counterparty process is a procurement department and not one clerk | Nothing, in their segment. They are the anti-persona of `docs/02-persona.md` with a funding round attached, which is why we do not go there |

### What the banks and the rail actually offer today

The question "do the banks not already do this" has a documented answer at two Mexican banks, and it
is no.

| Bank | What its own material shows | Why it does not close the gap |
|---|---|---|
| **HSBC Mexico**, HSBCnet [42] | It does sell beneficiary-name validation: "este servicio le permite verificar si las Cuentas Beneficiarias coinciden con el nombre del Beneficiario destinado" | "Unicamente cuentas HSBC", from a 10-digit account number and not even a CLABE, uploaded as a CSV or TXT file capped at 5,000 accounts, available 07:00 to 22:00 GMT-6 and not on holidays, with the report delivered within a maximum of 20 minutes after approval. A periodic hygiene sweep of an HSBC-only address book, never a gate on an outbound payment. That HSBC built it at all is the evidence corporates ask for this |
| **BBVA Mexico**, Net Cash [43] | In the alta puntual de cuentas flow, the company fills in the beneficiary's name itself: "Titular de la cuenta beneficiaria: nombre completo del titular de la cuenta", and "para las cuentas del mismo banco, no lo solicita". Every field is payer-supplied: "Descripcion: la escribe el usuario", "Cuenta del beneficiario: se digita" | The only control in the flow is a token challenge on the last six digits of the account being registered, which authenticates the employee doing the registration and not the identity of the account holder. A fraudulent CLABE registered by a legitimately authenticated, deceived employee passes every control cleanly. The guide describes no name lookup; that it never performs one is our inference from the document's silence, not a statement BBVA makes |
| **Banco de Mexico**, as the operator | Regla 51a Bis of the SPEI rules has the Administrador, which Regla 2a defines as Banco de Mexico, generate in its own name a transfer order for "un centimo de peso" to verify a beneficiary's account, reading the answer out of the resulting CEP. Regla 72a obliges SPEI participants generally to send "una Orden de Transferencia por el menor monto permitido por el SPEI con el fin de obtener los datos del titular de esa otra Cuenta del Cliente del Comprobante Electronico de Pago" [29] | This retires the question "is your one-cent probe a hack, and is it legal". It is the central bank's own codified procedure, paid for out of dedicated SPEI accounts. Banxico validated the mechanism and scoped it to CoDi enrolment and to linking accounts held in series. Nobody applied it to the moment a company pays a supplier invoice |

### The adjacent international band, as analogy and labelled as such

| Who | What they do | What they structurally cannot do |
|---|---|---|
| Trustpair [9], nsKnox [10], Eftsure [11] | Corporate payee verification before an accounts-payable run. Trustpair, "Best-in-Class Fraud Prevention and Account Validation Platform", 190 countries. nsKnox, "End-to-end B2B payment fraud protection for Corporates and Banks". Eftsure, "over 6 million verified businesses" | None of the three mentions Mexico, CFDI, SAT, SPEI or CLABE anywhere we could find on its site. They verify the account and ignore the counterparty's fiscal status, which is the larger Mexican loss. They are also sold to corporate treasuries, which is the band above ours in every dimension: headcount, ERP and procurement cycle |

### The status quo, which is what we are actually replacing

| Who | What they do | What they structurally cannot do |
|---|---|---|
| The accountant, a spreadsheet and WhatsApp | A handful of RFCs checked by hand, once a month at best, against a list downloaded whenever someone remembers | Cannot see across counterparties, cannot run in the minutes before the money is irrevocable, and leaves no evidence the check happened. 86.3 percent of firms in this band already have an accounting system or an external accountant [24], so the data exists and the cadence does not |

### What we could not verify about the competition

- **Customer evidence.** Capterra and Software Advice refuse automated fetching, so every "problems
  they face" cell above is the vendor's own admitted limitation or a named outlet, never a customer
  review. TODO(FabriBanda): open the Bind ERP and CONTPAQi review pages in a browser before the
  pitch, because a customer complaint is worth more than a vendor footnote.
- **Belvo**, an open-finance API that operates in Mexico, returns HTTP 403 to automated fetching. We
  do not know whether it sells account or beneficiary validation here, and we assert nothing about it.
- **No vendor selling account-change forensics.** We found nobody comparing a new CLABE against that
  supplier's own history of accounts. That is the phrasing: we found no vendor selling this, which is
  weaker evidence than a source and is never said as "nobody does this".
- **No published price** for ValidX, Portal de Proveedores or Syntage, all quote-only. The published
  price points in this file are 69b.mx [7], Tesio [8] and Verificamex [36].
- **No customer count, revenue, headcount or funding** for Verificamex, ValidX or Binaware Solutions,
  and no installed base for CONTPAQi or Siigo Aspel, so neither is called dominant here.
- **No funding or distress datapoint** for Clara, Xepelin or albo beyond each company's own
  announcements. Mendel's Series B [41] and the Yaydoo shift [40] are the two we opened, and they are
  the only two used.
- **Siigo Aspel SAE** appeared to hard-block purchase documents from suppliers on the 69-B list. The
  block is real and configurable with "Presunto y definitivo" as the shipped default, but the daily
  revalidation we believed was there is not on the page we opened, so the row was cut rather than
  shipped half-verified.

## The gap

The three facts that decide whether a payment is safe are all public, all current, and never read
together at the moment that matters. The SAT rewrites the 69-B list every eleven days [3]. The CFDI
ledger naming the supplier sits in the company's own downloads. Banxico signs a CEP naming the
account holder for every SPEI, and publishes it after the transfer is irrevocable [12] [29]. Each
belongs to a different tool and a different person: the list to a compliance product, the CFDI to the
accountant, the CEP to a post-mortem.

What the research changed is the sharpness of that claim, and it is worth being precise, because the
loose version is breakable in one search. The window is not empty. ValidX sells a pre-payment hold on
four SAT lists [31], Portal de Proveedores holds a payment when a document expires and sweeps 69-B
daily [32], and Verificamex sells the account-holder read-back for MXN 8.93 to 17.85 a call [36]. The
gap is the join, and it has four specific edges:

1. **Both halves in one decision.** The fiscal camp holds on an RFC and never sees the account
   [31] [32] [33] [34] [7] [8]. The money camp moves the pesos and never reads the list [35] [37]
   [38] [39]. CONTPAQi owns both halves inside one product and its own release notes show they never
   meet at the moment of payment [33].
2. **The account's own history.** No vendor we found sells the comparison of a new CLABE against the
   accounts this supplier has been paid on before. Verificamex verifies one account in isolation
   [35], which answers "who holds this" and not "why did this change".
3. **A decision instead of a warning.** Bind ERP's documentation is explicit that it alerts and does
   not restrict [34], and ValidX's hold is something the customer wires into its own ERP [31]. An
   amount at risk weighed against the cost of a day of delay is not in any of them.
4. **No supplier onboarding and no ERP.** The one product that holds payments on 69-B at scale does
   it through a portal 14,000 suppliers log into [32], which a 28-person firm cannot impose on
   anybody.

The obvious adjacent product does not close it either. Corporate payee verification [9] [10] [11]
answers "does this account belong to the payee", the right control where the loss is fraud. In Mexico
the larger and more frequent loss arrives from the counterparty's fiscal status, is retroactive, and
is invisible to a platform that reads neither the SAT list nor a CFDI. And the regulator has looked
directly at this screen in 2026 and left the gap open in the channel a company actually pays
through [30].

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
   higher one we accept a SAM that is almost certainly understated. The behavioural cross-check now
   points the same way: 86.3 percent of this band already runs an accounting system or pays an
   external accountant [24], against 26.0 percent of micro units.
4. **The SOM** is a channel count, not a share of SAM: 120 accounting firms signed over 36 months at
   20 client companies each, plus 600 companies sold direct. That is 3,000 companies, 1.2 percent of
   the TAM universe and 3.4 percent of the SAM universe. The channel now has a denominator, 16,356
   accounting and audit units nationally of which 12,130 employ five people or fewer [26], so 120
   firms is 0.7 percent of it. Both direct competitors [7] [8] already sell through that channel
   behind a free single-RFC check, which is the evidence it exists. Neither publishes a customer
   count, so we quote none.
5. **The beachhead is Nuevo Leon**, about 18,500 firms in the band [25], and the order of attack is
   manufacturing, wholesale trade, transport and warehousing, then construction, which hold 89,523
   establishments in the band nationally [26]. Sector order is a judgement about supplier-list length
   and account churn, not a published ranking, and it is labelled as such.

### Why the arithmetic is the point

One company costs about MXN 64 per month to serve and pays MXN 899 or MXN 195
(`docs/05-business-model.md#unit-economics`). Multiply by whichever layer you believe. A judge who
rejects the 35.7 percent filter changes one cell and recomputes, which is the reason the sizing is
built this way. The one number that would change the shape of the business rather than the size of a
cell is the hit rate per supplier register, and that is measured, not assumed.

## Sources

Every link was opened on **2026-09-12**. Source 3 is reproducible: download the file and count it.
So is 26. Sources 27, 28 and 44 are not cited in this file: they carry the segmentation in
`docs/02-persona.md`, which links here rather than duplicating a source list. 13 sits in
`docs/05-business-model.md`, which numbers into this list.

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
   linked from <https://www.sat.gob.mx/minisitio/DatosAbiertos/contribuyentes_publicados.html>.
   This is not the file the product answers from. The committed snapshot, its 14,234 rows and its
   2025-12-31 cut-off are in [wo SAT files, and the one the product
   ships](#two-sat-files-and-the-one-the-product-ships)
4. *Código Fiscal de la Federación*, texto compilado, last reform DOF 9 April 2026:
   <https://www.diputados.gob.mx/LeyesBiblio/pdf/CFF.pdf>. Article 69-B for the listing and the
   thirty-day window. Article 49 Bis, marked `Artículo adicionado DOF 07-11-2025` and in force from
   1 January 2026 per the decree's Transitorio Primero, for the express visit capped at 24 business
   days (fracción IX), the publication within 45 business days of the notification taking effect and
   the thirty natural days for third parties to reverse the fiscal effect or have the digital seal
   restricted under article 17-H Bis fracción XIV (fracción X), and the criminal referral (fracción
   XI). Article 113 Bis for the two-to-nine-year penalty, whose second paragraph extending it to
   giving `efectos fiscales` to false invoices is marked `Párrafo adicionado DOF 07-11-2025`
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
13. CONASAMI, *Tabla de Salarios Mínimos 2026*. Held by `docs/05-business-model.md#sources`, which
    numbers into this list and is the only file that uses it, so the number is not reused here
14. INEGI, *Encuesta Nacional de Victimización de Empresas (ENVE) 2024*, comunicado de prensa 780/24,
    10 December 2024. Prevalence by unit size, the 1.3 million victimised establishments, the MXN
    124.3 thousand million cost at 0.51 percent of GDP, the MXN 54,451 average, the 4.1 against 3.0
    crimes per victimised unit, and the 90.3 percent with no complaint or investigation file against
    12.2 percent reported. Reference year 2023:
    <https://www.inegi.org.mx/contenidos/saladeprensa/boletines/2024/ENVE/ENVE24.pdf>
15. INEGI, *Encuesta Nacional de Victimización de Empresas ENVE 2024*, presentación ejecutiva,
    December 2024. Slide 12 for the 2.9 million crimes, slide 15 for fraud at 8.5 percent and 522 per
    10,000 units against 614 in 2021, slide 27 for MXN 18,370 against MXN 27,244, in constant pesos
    at prices of the second half of July 2018:
    <https://www.inegi.org.mx/contenidos/programas/enve/2024/doc/enve_2024_presentacion_ejecutiva.pdf>
16. KPMG México, *Fraudes afectan a 45% de las organizaciones en México*, press release on the study
    *Impacto de los delitos financieros en México 2024*, 21 October 2024. Survey of more than 100
    organisational leaders across 15 states, fielded August 2024:
    <https://kpmg.com/mx/es/sala-de-prensa/comunicados-de-prensa/2024/10/cp-fraudes-afectan-a-45-porciento-de-las-organizaciones-en-mexico-kpmg.html>
17. El Universal, Antonio Hernández, *Reclamaciones a bancos crecen 10% llegan a 7.2 millones*,
    9 April 2026, citing Condusef's Buró de Entidades Financieras. Full-year 2025:
    <https://www.eluniversal.com.mx/cartera/reclamaciones-a-bancos-crecen-10-llegan-a-72-millones/>
18. El Universal, Antonio Hernández, *Suben quejas por fraudes; bancos devuelven 24%*, 6 July 2026,
    citing the same register. First quarter of 2026, and Condusef's president Óscar Rosado on the
    record on 8 June 2026:
    <https://www.eluniversal.com.mx/cartera/suben-quejas-por-fraudes-bancos-devuelven-24/>
19. Quadratín México, Carlos Cordero, *Transferencias por SPEI crecieron 36.8% durante 2025, registra
    Banxico*, 1 May 2026, reporting the Governor of Banco de México, Victoria Rodríguez Ceja, before
    the Senate's Comisión de Hacienda y Crédito Público. A secondary report of remarks on the record,
    not a Banxico document, and labelled as such wherever it is used:
    <https://mexico.quadratin.com.mx/transferencias-por-spei-crecieron-36-8-durante-2025-registra-banxico/>
20. La Crónica de Hoy, Diana Chávez Zea, *SAT va contra factureras y evasión fiscal con nuevas medidas
    de control*, 9 September 2026, reporting the head of the SAT, Antonio Martínez Dagnino. The
    article does not use the term EDOS; "buyers of those invoices" is its wording rendered into ours:
    <https://www.cronica.com.mx/nacional/2026/09/09/sat-va-contra-factureras-y-evasion-fiscal-con-nuevas-medidas-de-control/>
21. Expansión, Dainzú Patiño, *SAT agrega 903 empresas fantasma a su lista negra en lo que va de
    2026*, 15 June 2026. The 7,300 restricted seals are quoted from Gari Flores Hernández,
    administrador general de Recaudación; the "no pasaban de 500 cada año" comparison is Expansión's
    own framing on its records and figures from Luis Pérez de Acha:
    <https://expansion.mx/economia/2026/06/15/sat-agrega-903-empresas-fantasma-lista-negra-en-2026>
22. SAT, *Plan Maestro 2026*, cover dated January 2026, PDF created 26 January 2026. Three numbered
    sections, the third being "Combate a quienes venden y compran facturas falsas". The document
    numbers its sections rather than calling them ejes:
    <https://www.gob.mx/cms/uploads/attachment/file/1051620/PlanMaestroSAT2026.pdf>
23. SAT, *SAT combate la evasión fiscal por operaciones simuladas*, comunicado, 25 June 2019.
    8,204 EFOS, 8,827,390 invoices, about 1.6 billones de pesos, MXN 354,512 million of evasion at
    1.4 percent of GDP, 23 criminal complaints during June 2019 against companies that deducted
    simulated operations, and 60 percent of definitive EFOS in nine states led by Mexico City,
    Jalisco and Nuevo León:
    <https://www.gob.mx/sat/prensa/sat-combate-la-evasion-fiscal-por-operaciones-simuladas_com035?idiom=es>
24. INEGI, *Censos Económicos 2024*, reporte de resultados 22/25, 24 July 2025, pages 27 and 28 with
    gráfica 28. Pymes defined on the chart as 11 to 250 personas: 86.3 percent in 2023 against 67.4
    percent in 2018, micro (0 to 10) 26.0 percent, grandes (250 y más) 97.3 percent. A footnote
    states the 2018 figures were recalculated for comparability, so the 18.9-point rise is against an
    adjusted base: <https://www.inegi.org.mx/contenidos/saladeprensa/boletines/2025/ce/CE2024_def_RR.pdf>
25. INEGI, *Censos Económicos 2024, resultados definitivos, Nuevo León*, comunicado de prensa 98/25,
    24 July 2025, cifras corregidas. 181,791 economic units in the private sector and parastatal
    enterprises with 1,925,137 people in 2023; gráfica 1 carries the bands Micro (0 a 10), Pymes (11
    a 250) at 10.2 percent of units and 35.6 percent of personal ocupado, and Grandes (más de 250).
    The absolute counts of about 18,500 units and 685,000 workers are ours, derived from those
    rounded percentages: <https://www.inegi.org.mx/contenidos/saladeprensa/boletines/2025/ce/CE_2024_Def_NL.pdf>
26. INEGI, *Directorio Estadístico Nacional de Unidades Económicas (DENUE) 05_2026*, bulk download,
    `Modified: 2026-05-20` per the metadata file inside each archive. Counted by us by filtering the
    `per_ocu` strata `11 a 30`, `31 a 50`, `51 a 100` and `101 a 250`, whose definitions are in
    `denue_diccionario_de_datos.csv`. Manufacturing 34,697 from `denue_00_31-33_csv.zip`, wholesale
    trade 27,786 from `denue_00_43_csv.zip`, transport and warehousing 16,531 from
    `denue_00_48-49_csv.zip`, construction 10,509 from `denue_00_23_csv.zip`, and SCIAN 541211
    "Servicios de contabilidad y auditoría" 16,356 nationally with 737 in Nuevo León from
    `denue_00_54_csv.zip`. DENUE counts establishments and carries no formality field:
    <https://www.inegi.org.mx/contenidos/masiva/denue/denue_00_31-33_csv.zip>,
    <https://www.inegi.org.mx/contenidos/masiva/denue/denue_00_54_csv.zip>
27. Data México, Secretaría de Economía, occupation profile 2512 *Auxiliares en Contabilidad,
    Economía, Finanzas y Agentes de Bolsa*, 2026-T1. 403,000 nationally, MXN 8,640 average monthly
    salary, average age 38, 67.1 percent women at MXN 8,920 against 32.9 percent men at MXN 8,070,
    38.9 hours a week; Nuevo León third by workforce at 25,900 and second by salary at MXN 11,900,
    with the lowest informality for the occupation at 4.48 percent. The page itself warns that the
    salary breakdowns have low statistical precision, and SINCO 2512 bundles accounting clerks with
    economists, finance staff and stockbrokers, so 403,000 is an upper bound:
    <https://www.economia.gob.mx/datamexico/es/profile/occupation/auxiliares-en-contabilidad-economia-finanzas-y-agentes-de-bolsa>
28. INEGI and CNBV, *Encuesta Nacional de Financiamiento de las Empresas (ENAFIN) 2021*, presentación
    de resultados, August 2022. Slide 11 for who principally makes the firm's decisions, slide 26 for
    the channels through which firms carried out financial operations. Unit of observation: the firm
    with 6 or more personas ocupadas, private non-financial industry, commerce and services, in
    localities of 50,000 or more inhabitants, fielded 2 August to 30 September 2021. Slide 26 is a
    multiple-response question, so its percentages do not sum to 100:
    <https://www.inegi.org.mx/contenidos/programas/enafin/2021/doc/Presentacion_ENAFIN.pdf>
29. Banco de México, *Circular 14/2017, Reglas del Sistema de Pagos Electrónicos Interbancarios*,
    texto compilado including modifications through Circular 9/2026, DOF 17 June 2026. Regla 2a
    fracción I defines the Administrador as Banco de México. Regla 12a fracción I for the mandatory
    account identifier and amount and fracción II for the optional beneficiary name. Regla 18a for
    "firmes, irrevocables, exigibles y oponibles frente a terceros", wording as modified by Circular
    1/2022. Regla 25a fracción I inciso e for the "(Dato no verificado por esta institución)" legend.
    Regla 51a Bis for the one-centavo order the Administrador generates to verify a CoDi account
    through the CEP. Regla 72a fracción I Bis inciso a) numeral 3, added by Circular 3/2019, for the
    same probe imposed on SPEI participants for accounts held in series:
    <https://www.banxico.org.mx/marco-normativo/normativa-emitida-por-el-banco-de-mexico/circular-14-2017/%7BA06FBFEE-06BB-F249-32FC-25B334B2A744%7D.pdf>
30. Banco de México, *Guías para la homologación de la experiencia de usuario en transferencias
    electrónicas de fondos a través de dispositivos móviles*, versión 1.1, published 28 August 2026,
    in force 14 December 2026, issued under Circular 9/2026. The masked and unvalidated beneficiary
    name is in the confirmation-screen requirements; the CLABE lookup reveals the receiving
    Participante and not the holder. The change log states the only modification against version 1.0
    of 16 June 2026 was adding QR generation, and the Dimo phone-number flow does require a
    looked-up masked name:
    <https://www.banxico.org.mx/marco-normativo/normativa-emitida-por-el-banco-de-mexico/circular-14-2017/%7BFBF220A3-C5B8-268A-C57B-A00CD109BA63%7D.pdf>
31. ValidX, *Validación de proveedores ante SAT, IMSS y Buró*. Site © 2026; the example webhook is
    dated 2026-09-02 and uses the site's own demo RFC, so it is marketing copy and not a customer
    case: <https://validx.com.mx/>
32. Portal de Proveedores, Bimetrics, by Binaware Solutions, Monterrey, Nuevo León. All volumes are
    self-reported on the vendor's own marketing site and unaudited:
    <https://portaldeproveedoresmexico.com/>
33. CONTPAQi, cartas técnicas for CONTPAQi Bancos. Version 19.2.0 published 14 July 2026 for the
    "No desvirtuados (49 Bis)" situation, 19.1.2 published 25 May 2026 for the direct Banorte BEM
    connection, 19.0.1 published 17 February 2026 for the EFOS and EDOS CFDI reports, 18.5.1 for the
    "Generación Masiva de Pagos" improvement, 16.1.1 for EFOS and "No localizados" in the tablero
    fiscal, and 19.3.1 published 5 August 2026 for the beneficiary and payer association on
    unapplied movements. Verified at the summary level of each carta técnica on the index page, not
    in every linked document: <https://contenidos.contpaqi.com/bancos>
34. Bind ERP, *Lista de EFOS en Bind ERP*, Centro de Ayuda, Manual de Usuario, Proveedores. Site
    footer reads Copyright © 2025, Bind ERP: <https://ayuda.bind.com.mx/lista-de-efos>
35. Verificamex, *Prueba del Centavo SPEI*. The page says "transferencia mínima", never one cent, and
    calls the receipt a Comprobante Electrónico de Pago without attributing it to Banxico. Page
    undated: <https://verificamex.com/soluciones/prueba-centavo>
36. Verificamex, *Precios de verificación de identidad*, prepaid tokens. Penny test 20 tokens;
    MXN 0.8925 per token from 1,000 tokens down to MXN 0.4463 at 2,000,000 (a 50 percent discount); minimum
    purchase MXN 500 plus IVA (561 tokens); balance valid twelve months; above 2,000,000 the price is
    negotiated and the page states "desde $7.00 por validación". The "por validación" column is
    benchmarked to the 20-token full identity validation, and transfers to the penny test only
    because that service also costs 20 tokens. Page undated:
    <https://verificamex.com/precios/verificacion-identidad>
37. Clara, *Cuentas por Pagar: SPEI y CFDI Gratis*. Page undated, site © 2026. Clara maintains a
    separate "Seguridad y cumplimiento" page that this row does not summarise, so the absence of a
    beneficiary check is an absence on the accounts-payable product page and not a denial by Clara:
    <https://www.clara.com/es-mx/productos/cuentas-por-pagar>
38. Xepelin, *Confirming para pymes en México, pago a proveedores*. The 80,000 companies are Mexico
    and Chile combined. Site © 2026: <https://xepelin.com.mx/financiamiento-de-pagos>
39. albo empresa, home page. The operating entity named in the footer is Inteligencia en Finanzas,
    S.A.P.I. de C.V., I.F.P.E., described on the page as authorised by the CNBV:
    <https://www.albo.com/empresa/home.html>
40. El Cronista México, Yanin Alfaro, *Paystand activa su red en México y este gigante de Silicon
    Valley va por pagos empresariales por medio de Yaydoo*, updated 31 March 2026. The USD 20
    thousand million and one million companies are stated of Paystand. The quotations are Sergio
    Almaguer, founder and chief executive of Yaydoo and chief product officer of Paystand:
    <https://www.cronista.com/mexico/finanzas-economia/paystand-activa-su-red-en-mexico-y-este-gigante-de-silicon-valley-va-por-pagos-empresariales-por-medio-de-yaydoo/>
41. Mendel, *Mendel cierra su Serie B con 35 millones*, own newsroom, 27 March 2025. Customer count
    and logos are self-reported and unaudited:
    <https://mendel.com/blog/mendel-cierra-su-serie-b-con-35-millones-para-seguir-transformando-las-finanzas-corporativas-en-latinoamerica/>
42. HSBC, *Guía de Usuario, Instrucciones de Implementación de la Validación de Nombre de
    Beneficiarios HSBC México*, HSBCnet, published December 2016. The service window is 07:00 to
    22:00 GMT-6, Monday to Sunday, out of service on holidays. The document says nothing about other
    Mexican banks, so it does not establish that HSBC is the only one selling this:
    <https://www.hsbcnet.com/-/media/hsbcnet/learningcentre/helptext/attachments/user-guide/ug_validacion_nombre_es_mx.pdf>
43. BBVA México, *Mantenimiento de beneficiarias, guía rápida para ejecución de alta puntual de
    cuentas beneficiarias en BBVA Net Cash*, version 3, filename `v3-05-2020`, PDF created April 2020
    and modified 1 June 2020. The quoted field is callout 8 of the eight numbered items in Step 2.
    The guide describes no name lookup; that BBVA never performs one is our inference from the
    document's silence:
    <https://www.bbva.mx/content/dam/public-web/mexico/documents/empresas/servicios-digitales/bbva-net-cash/digitalizacion-2020/mantenimiento-de-beneficiarias-v3-05-2020.pdf>
44. OCC Mundial, job-board result counts for Nuevo León, read on 2026-09-12: `auxiliar contable` 101
    results, `auxiliar de tesorería` 3, `tesorero` 4, `gerente de tesorería` 4, `auxiliar
    administrativo` 2,145. A job board is a snapshot of hiring and not a statistic, and it is used
    in `docs/02-persona.md` only as a direction. A first pass at this comparison quoted 146 for
    `auxiliar administrativo` and a ratio of about 22 clerks per treasury specialist; both were
    wrong, the page returns 2,145, and the corrected ratio is about 204 to 1:
    <https://www.occ.com.mx/empleos/de-auxiliar-contable/en-nuevo-leon>,
    <https://www.occ.com.mx/empleos/de-auxiliar-administrativo/en-nuevo-leon>
