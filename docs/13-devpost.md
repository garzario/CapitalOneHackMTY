# 13. Devpost submission copy, final

This is the copy that goes into the submission, field by field in the order Devpost asks for it. The
draft that used to live here was written at M3; this is the M5 rewrite, against the build that is
deployed and against the numbers that are in the repository on 2026-09-13.

Owner: Patricio (`garzario`). Reviewer: Fabricio (`FabriBanda`). Issues #56 and #76.

**A person pastes this, not a script.** The ready-to-paste blocks, with no markdown around them, are
in [`docs/print/devpost-fields.md`](print/devpost-fields.md), one block per Devpost field. This file
is the source and carries the reasoning, the gates and the evidence; that file is what gets copied
into the form. The human steps that remain are listed on issue #76 and nowhere else, so there is one
place to look at 07:00.

**Spanish first, then English, in both files.** The judges and the persona are Mexican, so the first
block of every field is the one they read. The Spanish here is written with accents, because it is
prose on a public page; the spoken pitch in [`docs/11-pitch.md`](11-pitch.md) is ASCII with no
accents, which is the convention every Spanish string inside this repository follows. Both are
deliberate.

**What is still a `TODO` is submitted as a `TODO` and never as a guess.** Three things in this file
are not ours to fill in yet: the demo video link (issue #73), `sentryone.tech` (issue #59) and the
four Devpost handles. Nothing else here claims a partner, a statistic or an integration this
repository cannot back with a file.

**The binding rules this copy obeys.** No language model in the decision. The assistant reads and
proposes; a person executes. Never a probability, a percentage or a score as a verdict on a payment,
and never a word that promises a transfer cannot go wrong. The three levels are `confiable`,
`precaucion` and `alerta`, the three public states are `rojo`, `cancelado` and `enviado`, and both
are derived by one pure function per [ADR-0009](adr/0009-states-and-levels.md). Everything synthetic
is labelled synthetic in the same sentence. Every number carries a source, and the table at the end
of this file is where each one comes from.

---

## Field 1, project name

```
SentryOne
```

## Field 2, tagline

**ES, 92 characters:**

> El último control antes de un SPEI irreversible: lista 69-B, CLABE y CEP al momento de pagar

**EN, 76 characters:**

> Stop a fiscally toxic or misdirected supplier payment before the SPEI leaves

## Field 3, elevator pitch

**ES**

> SentryOne es el control que corre en los minutos antes de que una PyME mexicana le pague a sus
> proveedores. Une tres cosas que no se leen juntas en ese momento: el catálogo de CFDI de la propia
> empresa, la lista oficial del artículo 69-B del SAT y el comprobante que Banxico firma por cada
> SPEI. Cada línea de la corrida regresa con un nivel, confiable, precaución o alerta, con un estado,
> y con la acción que el motor propone: retener, verificar o liberar, siempre con la evidencia en
> pantalla. Seis controles deterministas, ningún modelo de lenguaje en la decisión, y todo el motor
> corre sin red dentro de una prueba unitaria. Hay un asistente, y lee y propone: ejecuta una
> persona, con su nombre.

**EN**

> SentryOne is the check that runs in the minutes before a Mexican SMB pays its suppliers. It joins
> three things that are not read together at that moment: the company's own CFDI invoice ledger, the
> SAT's official Article 69-B list, and the receipt Banxico signs for every SPEI. Every line of the run
> comes back with a level, `confiable`, `precaucion` or `alerta`, with a state, and with the action
> the engine proposes: hold, verify or release, always with the evidence on screen. Six deterministic
> controls, no language model in the decision, and the whole engine runs offline inside a unit test.
> There is an assistant, and it reads and proposes: a person executes, with their name on it.

## Field 4, inspiration

**ES**

> Dos cosas son ciertas cuando le pagas a un proveedor en México, y ninguna se deshace.
>
> Si el SAT publica a ese proveedor en la lista del artículo 69-B, las operaciones amparadas por sus
> comprobantes "no producen ni produjeron efecto fiscal alguno". El tiempo pasado es todo el
> problema: las deducciones y el IVA acreditado que ya tomaste se anulan hacia atrás, no se bloquean
> hacia adelante. De cada cien mil pesos de subtotal ya deducido se revierten cuarenta y seis mil
> entre ISR e IVA, y la exposición la crea una publicación que ocurre después de que el dinero ya
> salió. La lista se movió en 33 fechas de publicación en los doce meses al 31 de julio de 2026,
> alrededor de una cada once días, con 973 contribuyentes que pasaron a definitivo. Desde el 1 de
> enero de 2026 el artículo 49 Bis arranca un reloj de treinta días naturales contra el comprador, y
> el sello digital que se restringe al final de ese reloj es el del comprador.
>
> Y si la cuenta destino está mal, no hay nada que revertir: una orden de transferencia aceptada es
> firme, irrevocable, exigible y oponible frente a terceros, según el artículo 11 de la Ley de
> Sistemas de Pagos. Un SPEI no es un pago con tarjeta. No hay contracargo, y de los pesos
> reclamados por fraude en el primer trimestre de 2026 los bancos devolvieron el 24.3 por ciento.
>
> Quien vive con las dos no es una analista de fraude. Es la única persona de administración de un
> taller metalmecánico de veintiocho empleados en Apodaca, Nuevo León, y arriba de ella no hay
> tesorería. En la corrida de referencia de nuestros datos sintéticos son 92 instrucciones de pago
> que liquidan 129 CFDI en un jueves, con una hoja de cálculo, WhatsApp y el portal bancario. Sin
> ERP, así que no hay módulo de validación de proveedores, no hay doble firma y no hay segundo par de
> ojos.
>
> La consulta del 69-B es pública, gratuita y toma un minuto. La parte difícil nunca es la consulta:
> es la cadencia y el momento. Un control que corre cuando diste de alta al proveedor no protege
> nada contra una lista publicada dos años después.

**EN**

> Two things are true about paying a supplier in Mexico, and neither of them can be undone.
>
> If the SAT publishes that supplier on the Article 69-B list, the operations covered by its invoices
> "no producen ni produjeron efecto fiscal alguno". The past tense is the whole problem: deductions
> and credited IVA you already took are undone backwards, not merely blocked going forward. For every
> MXN 100,000 of subtotal already deducted, MXN 46,000 of tax effect reverses between ISR and IVA,
> and the exposure is created by a publication that happens after the money is gone. The list moved
> across 33 publication dates in the twelve months to 31 July 2026, about one every eleven days, with
> 973 taxpayers moved to `definitivo`. Since 1 January 2026 article 49 Bis starts a thirty
> natural-day clock against the buyer, and the digital seal restricted at the end of that clock is
> the buyer's own.
>
> And if the destination account is wrong, there is nothing to reverse: an accepted transfer order is
> firme, irrevocable, exigible y oponible frente a terceros under article 11 of the Ley de Sistemas
> de Pagos. A SPEI is not a card payment. There is no chargeback, and of the pesos claimed for fraud
> in the first quarter of 2026 the banks refunded 24.3 percent.
>
> The person who lives with both is not a fraud analyst. She is the only administrative clerk at a
> 28-person metalworking shop in Apodaca, Nuevo Leon, with no treasury above her. In the reference
> run of our synthetic data that is 92 payment instructions settling 129 CFDIs on one Thursday, with
> a spreadsheet, WhatsApp and the bank portal. No ERP, so no supplier validation module, no
> maker-checker, no second pair of eyes.
>
> The Article 69-B check is public, free and takes a minute. The hard part is never the check: it is
> the cadence and the moment. A control that runs when you onboarded the supplier protects nothing
> against a list published two years later.

## Field 5, what it does

**ES**

> - **Convierte la corrida de pagos semanal en una lista triada.** Cada línea trae su nivel,
>   confiable, precaución o alerta, su estado, y la acción que el motor propone: retener, verificar o
>   liberar. Ordenada por pesos en riesgo y no por orden alfabético, con el peor hallazgo nombrado en
>   pantalla. Nunca un porcentaje: el nivel siempre llega con los hallazgos que lo produjeron
>   debajo.
> - **Corre seis controles independientes en cada pago, y responde por los seis:** cruce contra la
>   lista oficial del artículo 69-B con todas sus versiones, forense de CLABE con dígito
>   verificador, banco y plaza, facturas duplicadas, cambio de comportamiento del proveedor,
>   verificación del beneficiario contra un CEP firmado por Banxico, y conciliación contra el espejo
>   bancario. Un control que no corrió dice qué le faltó, para que el silencio nunca se lea como un
>   pago limpio.
> - **Cuantifica la exposición fiscal retroactiva cuando el SAT publica una versión nueva de la
>   lista**, reproduciendo la bitácora de eventos de la propia empresa: qué facturas ya se pagaron, la
>   base deducida, y el ISR y el IVA en riesgo. En la corrida de referencia el barrido llega a MXN
>   878,592.59 de base y MXN 404,152.59 de exposición, y vuelve a calificar las líneas pendientes que
>   la publicación alcanza, así que una de ellas se mueve sola mientras nadie la está viendo.
> - **Comprueba que una cuenta bancaria de verdad es del proveedor antes del primer pago.** Un
>   centavo viaja dentro de la misma corrida, la clave de rastreo regresa del riel y no de un teclado,
>   y SentryOne lee el comprobante que Banxico firma, guarda el XML tal cual llegó y compara el nombre
>   del titular contra la razón social de la factura que se está pagando. El centavo no es nuestro
>   invento: se vende medido y está escrito en las reglas del SPEI. Lo nuestro es la decisión que
>   cuelga de su respuesta.
> - **Le llama al proveedor cuando hay que confirmar una cuenta nueva.** Un agente de voz en español
>   marca por teléfono, dice solamente los últimos cuatro dígitos de la cuenta, no promete nada, no
>   acusa a nadie, no pide ningún dato, y devuelve una transcripción que un analizador determinista
>   convierte en confirmado, negado, sin respuesta o poco claro. La llamada nunca libera un pago.
> - **Acepta la instrucción como de verdad llega.** La auxiliar arrastra al asistente la captura de
>   WhatsApp que ya recibió, el único modelo que hay transcribe, y la instrucción queda dada de alta
>   con su nivel y su evidencia. Si pregunta por qué una línea está en rojo, el asistente contesta con
>   las lecturas que hizo a la vista y termina en una propuesta con el cuerpo exacto de la petición y
>   un botón. Nueve herramientas, todas de lectura: una que escriba no existe en el tipo.
> - **Consulta una red de beneficiarios entre empresas sin aprender de quién.** Lo único que sale de
>   una empresa es un hash con sal del RFC y de la CLABE, el código de banco, una de cuatro
>   consecuencias y una fecha, y lo que regresa son cuentas de empresas y fechas, nunca un renglón de
>   otra. La red que trae este repositorio es sintética y cada renglón viaja marcado como sintético.
> - **Entrega la corrida por un riel, y solo lo que ya tiene.** Una persona confirma con su nombre,
>   sale una línea por instrucción al monto y a la cuenta que esa instrucción dice, y regresan la
>   clave de rastreo, el recibo y una constancia por línea. Lo que el motor detuvo se queda fuera con
>   su razón escrita.
> - **Explica cada hallazgo en español claro y con su evidencia**, incluyendo en qué posiciones
>   difieren los dígitos de una cuenta contra aquella en la que sí le hemos pagado a ese proveedor, y
>   qué plaza es cada una.
> - **Reporta su propia exactitud sobre casos etiquetados que quien escribió los detectores nunca
>   leyó**, detector por detector y nivel por nivel, con el número de casos junto a cada tasa.

**EN**

> - **Turns the weekly payment run into a triaged list.** Every line carries its level, `confiable`,
>   `precaucion` or `alerta`, its state, and the action the engine proposes: hold, verify or release.
>   Sorted by pesos at risk instead of alphabetically, with the worst finding named on the screen.
>   Never a percentage: the level always arrives with the findings that produced it underneath.
> - **Runs six independent controls on every payment, and accounts for all six:** the cross-check
>   against the official Article 69-B list with all of its versions, CLABE forensics over the check
>   digit, the bank and the plaza, duplicate invoices, supplier behaviour drift, beneficiary
>   verification against a Banxico-signed CEP, and reconciliation against the bank mirror. A control
>   that did not run says what was missing, so silence can never be read as a clean payment.
> - **Quantifies the retroactive fiscal exposure when the SAT publishes a new list version**, by
>   replaying the company's own append-only event ledger: which invoices were already paid, the
>   deducted base, and the ISR and IVA at risk. On the reference run the sweep reaches MXN 878,592.59
>   of base and MXN 404,152.59 of exposure, and it re-scores the pending lines the publication
>   reaches, so one of them moves on its own while nobody is looking at it.
> - **Establishes that a bank account really belongs to a supplier before the first payment.** One
>   cent travels inside the same run, the clave de rastreo comes back from the rail rather than from a
>   keyboard, and SentryOne reads the receipt Banxico signs for it, keeps the XML byte-exact, and
>   compares the account holder name with the legal name on the invoice being settled. The cent is
>   not our invention: it is sold metered and it is written into the SPEI rules. Ours is the decision
>   hung on its answer.
> - **Calls the supplier when a new account needs confirming.** A Spanish-speaking voice agent rings
>   them through the telephone network, speaks only the last four digits of the account, promises
>   nothing, accuses nobody, asks for no data, and returns a transcript that a deterministic parser
>   turns into confirmed, denied, no answer or unclear. The call never releases a payment.
> - **Accepts an instruction the way it actually arrives.** The clerk drags the WhatsApp screenshot
>   she already received into the assistant, the only model in the product transcribes it, and the
>   instruction lands with its level and its evidence. If she asks why a line is red, the assistant
>   answers with the reads it performed in view and ends in a proposal carrying the exact request body
>   and a button. Nine tools, all of them reads: a tool that writes does not exist in the type.
> - **Consults a cross-company beneficiary network without learning who paid whom.** All that leaves
>   a company is a salted hash of the RFC and of the CLABE, the bank code, one of four outcomes and a
>   date, and what comes back are counts of companies and dates, never another company's row. The
>   network in this repository is synthetic and every row travels flagged as synthetic.
> - **Sends the run through a rail, and only what it already holds.** A person confirms with their
>   name, one line leaves per instruction for exactly that instruction's amount to exactly the account
>   it names, and the clave de rastreo, the receipt and a constancia per line come back. What the
>   engine stopped stays out with its written reason.
> - **Explains every finding in plain Spanish with its evidence**, including which digit positions of
>   an account differ from the one that supplier has actually been paid on, and which plaza each one
>   is.
> - **Reports its own accuracy on labelled cases the detector author never read**, per detector and
>   per level, with the case count next to every rate.

## Field 6, how we built it

**ES**

> Un monorepo de workspaces en bun y TypeScript, con un solo runtime para la API, las pruebas, el
> generador de datos y las migraciones. Doce paquetes y dos aplicaciones.
>
> **La inteligencia vive en `packages/core`**: los detectores, el motor de decisión por pérdida
> esperada y las dos funciones puras de ADR-0009 que derivan el nivel y el estado, sobre un único
> contrato de dominio, sin red y sin base de datos. Por eso todo el motor corre sin conexión dentro de
> pruebas unitarias, y por eso un juez puede leer un detector junto a su archivo de pruebas en la
> mesa. Ni el nivel ni el estado se guardan en ninguna columna: un nivel almacenado puede contradecir
> a los hallazgos de los que salió, y uno derivado no.
>
> **`packages/sat` es la mitad fiscal.** Interpreta el listado publicado por nombre de columna,
> conserva cada situación fechada de cada contribuyente en lugar de un solo estado, y le pone precio a
> una publicación reproduciendo la bitácora. La lista real está en el repositorio: 14,234 registros,
> descargados el 2026-09-12, con información al 2025-12-31 y con su procedencia documentada, porque un
> control que solo funciona mientras el portal del SAT responde es un control que no funciona. La
> segunda lista, la del artículo 49 Bis, tiene su cargador y su ventana de treinta días escritos, y
> **no barremos esa lista**: el SAT la publica como oficios del DOF y no como archivo, así que la
> consulta contesta que no está cargada, con las cuentas y la liga, en vez de insinuar que revisó algo.
>
> **`packages/cep` lee el comprobante de Banxico.** Interpreta el documento `SPEI_Tercero` por nombre
> de nodo, conserva el XML byte por byte, compara razones sociales normalizando los tipos societarios
> mexicanos, y es deliberadamente honesto con la firma: Banxico no publica la especificación del
> sello, así que probamos una matriz de candidatos y reportamos que el esquema no está confirmado en
> vez de afirmar una firma que no podemos demostrar.
>
> **`packages/rail` mueve dinero y nada más que lo que SentryOne ya tiene:** el centavo de la prueba
> de beneficiario, o el monto exacto de una instrucción que vive aquí, a la cuenta que esa instrucción
> nombra. Tres rieles, y cada uno dice qué demuestra. **`packages/extract` es el único paquete que
> puede llamar a un modelo**, y solo puede transcribir. **`packages/voice`** es la llamada de
> verificación: el guion, el cliente y un analizador determinista del resultado.
> **`packages/constancia`** escribe el PDF a mano, sin dependencia y sin navegador.
> **`packages/seed`** es una empresa sintética determinista desde una semilla fija.
>
> **`packages/consortium` es el único paquete que sale de la empresa.** Habla con la SQL REST API de
> Snowflake con un JWT de par de llaves y sin SDK, y lo que envía es un hash con sal de un proveedor,
> un hash con sal de una cuenta, un código de banco y uno de cuatro desenlaces: ningún nombre, ningún
> monto, ningún número de cuenta. Lee de vuelta cuántas otras empresas han pagado ese mismo par y
> desde cuándo, y un script deja ese agregado en Postgres, así que la decisión lee una foto local y
> nunca el almacén. Las demás empresas son sintéticas, desde la misma semilla comprometida, y cada
> renglón lo dice.
>
> **`apps/api` es transporte delgado en Hono**, con esquemas zod derivados de los tipos de dominio y
> sin lógica de negocio adentro. La columna vertebral es una bitácora append-only en Postgres, que es
> lo que vuelve al barrido retroactivo una reproducción y no un recálculo, y Tiger Data convierte esa
> bitácora en hypertable con un agregado continuo, mientras que un Postgres 18 simple corre el mismo
> SQL contra la tabla base. Cada escritura lleva `X-Actor`, el nombre de quien la hizo.
> **`apps/web`** es una build estática de React que lee el contrato HTTP documentado y se actualiza
> por Server-Sent Events, así que una instrucción enviada desde el teléfono de un juez aparece en la
> pantalla principal sin recargar.
>
> **El asistente es lector y proponente.** Nueve herramientas, todas GET, `readOnly` es el literal
> `true` y no un booleano, así que una llamada que escriba no se puede construir. Ningún nivel,
> ninguna acción y ningún número salen del modelo. Termina un turno con una propuesta como máximo, y
> la propuesta trae campo por campo el cuerpo del endpoint que se va a llamar, así que la pantalla
> muestra lo que va a pasar con las palabras de la petición.
>
> **La evaluación corre por el mismo punto de entrada que la captura.** Los casos etiquetados pasan
> por `runControls`, `bun run eval` imprime la matriz de confusión por control y por nivel, y
> `GET /api/v1/metrics` sirve los mismos números, así que la pantalla de métricas es un reporte y no
> una afirmación.
>
> Al 2026-09-13 la suite son 2,594 pruebas en 138 archivos: 2,476 pasando, 118 saltadas y 0
> fallando, y ninguna abre un socket.

**EN**

> A bun and TypeScript workspace monorepo, one runtime for the API, the tests, the seeder and the
> migrations. Twelve packages and two applications.
>
> **The intelligence is `packages/core`**: the detectors, the expected-loss decision engine and the
> two pure functions of ADR-0009 that derive the level and the state, over a single domain contract,
> with no network and no database access. That is why the whole engine runs in unit tests offline, and
> why a judge can read a detector beside its test file at the table. Neither the level nor the state
> is stored in any column: a stored level can disagree with the findings it was computed from, and a
> derived one cannot.
>
> **`packages/sat` is the fiscal half.** It parses the published listing by column name, keeps every
> dated situation of every taxpayer instead of one state each, and prices a publication by folding
> over the ledger. The real list is committed: 14,234 rows, downloaded 2026-09-12, current to
> 2025-12-31, with its provenance in the adjacent README, because a control that only works while the
> SAT portal is reachable is a control that does not work. The second list, article 49 Bis, has its
> loader and its thirty-day window written, and **we do not sweep that list**: the SAT publishes it as
> DOF oficios rather than as a file, so the lookup answers that it is not loaded, with the counts and
> the URL, instead of implying it checked something.
>
> **`packages/cep` reads the Banxico receipt.** It parses the `SPEI_Tercero` document by child name,
> keeps the XML byte-exact, compares legal names with Mexican societary-type normalisation, and is
> deliberately honest about the signature: Banxico publishes no signing specification, so we run a
> candidate matrix and report that the scheme is unconfirmed rather than claim a seal we cannot prove.
>
> **`packages/rail` moves money and nothing but what SentryOne already holds:** the cent of the
> beneficiary probe, or the exact amount of an instruction that lives here, to the account that
> instruction names. Three rails, and each one states what it proves. **`packages/extract` is the only
> package allowed to reach a model**, and it may only transcribe. **`packages/voice`** is the
> verification call: the script, the client and a deterministic outcome parser.
> **`packages/constancia`** writes the PDF by hand, with no dependency and no browser.
> **`packages/seed`** is one deterministic synthetic company from a committed seed.
>
> **`packages/consortium` is the only package that leaves the tenant.** It speaks the Snowflake SQL
> REST API with a key-pair JWT and no SDK, and what it sends is a salted hash of a supplier, a salted
> hash of an account, a bank code and one of four outcomes: no name, no amount, no account number. It
> reads back how many other tenants have paid the same pair and when it was first seen, and a script
> lands that aggregate in Postgres, so the decision reads a local snapshot and never the warehouse.
> The other tenants are synthetic, from the same committed seed, and every row says so.
>
> **`apps/api` is a thin Hono transport** with zod schemas derived from the domain types and no
> business logic in it. The spine is an append-only ledger in Postgres, which is what makes the
> retroactive sweep a replay instead of a recomputation, and Tiger Data turns that ledger into a
> hypertable with a continuous aggregate while a plain Postgres 18 runs the identical SQL against the
> base table. Every write carries `X-Actor`, the name of whoever made it. **`apps/web`** is a static
> React build that reads the documented HTTP contract and updates from a Server-Sent Events stream, so
> an instruction sent from a judge's phone appears on the main screen without a reload.
>
> **The assistant is a reader and a proposer.** Nine tools, all GET, `readOnly` is the literal `true`
> rather than a boolean, so a tool call that writes cannot be constructed. No level, no action and no
> number comes from the model. It ends a turn with at most one proposal, and the proposal carries
> field for field the body of the endpoint that will be called, so the screen shows what is about to
> happen in the words of the request itself.
>
> **The evaluation runs the same entry point intake runs.** The labelled cases go through
> `runControls`, `bun run eval` prints the confusion matrix per control and per level, and
> `GET /api/v1/metrics` serves the identical numbers, so the metrics screen is a report and not a
> claim.
>
> As of 2026-09-13 the suite is 2,594 tests across 138 files: 2,476 passing, 118 skipped and 0
> failing, and none of them opens a socket.

## Field 7, challenges we ran into

**ES**

> - **Un registro de detectores que no llamaba a ninguno.** La primera versión descubría los módulos
>   por importación dinámica y adivinaba los argumentos de cada uno por su aridad. Cuando llegaron los
>   detectores de verdad no llamaba a ninguno, y las pruebas seguían en verde porque afirmaban sobre un
>   arreglo vacío. Una corrida que dice "sin hallazgos" porque el motor no alcanzó a sus propios
>   detectores es la peor falla posible de este producto. Lo reemplazamos por una lista explícita y
>   tipada, y ahora cada control cae en corrió o en no corrió con su razón: el silencio tiene que
>   explicarse.
> - **El archivo del SAT no es el CSV que cualquiera espera.** Es ISO-8859-1 y no UTF-8, así que una
>   decodificación estricta truena y una permisiva corrompe en silencio toda comparación de razones
>   sociales. Su número de filas y su número de líneas no coinciden, porque dos registros traen un
>   salto de línea dentro de un nombre entrecomillado. 483 fechas de publicación son ilegibles en la
>   columna del DOF y traen al lado una fecha de portal usable, 93 celdas cargan dos fechas en un solo
>   campo, y 91 RFC están tachados por orden judicial. Resolvemos columnas por nombre y no por
>   posición, reportamos cada fila ilegible con su número de línea, y nos negamos a tirar una sola,
>   porque una fila perdida en silencio de una lista negra fiscal es el peor error imaginable.
> - **Una respuesta vacía de una red no es "no consultada".** La API REST de SQL de Snowflake
>   devuelve todo como cadena, y una fecha como días desde la época y no como `YYYY-MM-DD`. El primer
>   `consortium:pull` real leyó los 46 renglones y se saltó los 46, y escribió una foto vacía marcada
>   como que la red sí había contestado. Eso es peor que no preguntar: todas las pantallas habrían
>   dicho que la red nunca vio ninguna de esas cuentas, en una corrida donde 45 de los 46 pares están
>   corroborados. Ahora la consulta formatea las dos fechas dentro del SQL, donde un revisor las ve, y
>   el lector además entiende la forma de días desde la época. Las dos tienen prueba que falla sin el
>   arreglo.
> - **Un nivel calculado en cuatro lugares es el mismo error con mecha más larga.** El motor sabía la
>   gravedad, la API sabía la acción, la web sabía el color y el respaldo sin conexión sabía una
>   adivinanza escrita a mano. Cuando dos de esos orígenes discreparon sobre la razón social de un
>   proveedor, un juez vio las dos en una sola pantalla. ADR-0009 dejó una sola función pura por cada
>   valor y ninguna columna que lo guarde, y una prueba recorre todo `apps/web/src` para que el
>   siguiente componente que salga a la red sin consultar el modo falle una prueba y no un demo.
> - **Un XML firmado es byte por byte, y Banxico no documenta el esquema de firma.** El comprobante se
>   guarda exactamente como llegó y nunca se recodifica. Para el sello podíamos afirmar una
>   verificación que no podemos demostrar, o construir una matriz de candidatos sobre hashes, variantes
>   de cadena y codificaciones y reportar con honestidad que el esquema no está confirmado. Elegimos lo
>   segundo, y la interfaz dice "sello no verificado" y nunca "sello inválido", porque son dos
>   afirmaciones distintas y solo una nos toca a nosotros.
> - **Usar un modelo sin dejarlo decidir nada.** El esquema de respuesta del extractor tiene seis
>   campos y ninguno donde quepa un veredicto, una calificación o una recomendación: al modelo no se le
>   pide ser bueno, se le quita dónde poner una opinión. Una prueba lee el código fuente del propio
>   paquete y falla si un módulo publicado siquiera menciona `decide`, `score` o `recommend`. Y cuando
>   llegó el asistente, la misma pregunta volvió más grande: la respuesta fue que las nueve
>   herramientas son GET, que `readOnly` es el literal `true`, y que una propuesta se ejecuta con un
>   clic de una persona y con su nombre en la bitácora.
> - **Un "sí" pelón no es una confirmación.** En una llamada de verificación el agente pregunta
>   primero si está hablando con el proveedor, así que el "sí" que contesta eso jamás puede contar como
>   acuerdo sobre una cuenta bancaria. La coma también carga peso: "no, es correcta" y "no es correcta"
>   significan cosas opuestas. El analizador califica cláusulas, solo de los turnos del proveedor, y
>   ordena negación sobre duda sobre confirmación, porque una confirmación falsa libera dinero que no
>   regresa y una negación falsa cuesta una llamada.
> - **Server-Sent Events necesita un proceso vivo**, lo que contradijo nuestra decisión de despliegue
>   y obligó a una enmienda escrita: el cliente web se queda estático en Vercel y la API se mudó a una
>   instancia de Vultr junto a la base de datos, detrás de Caddy con TLS. Mantuvimos la restricción de
>   que la API no importa módulos específicos de runtime. Y Tiger Data tiene dos reglas que se aprenden
>   por las malas: un agregado continuo no se puede crear dentro de una transacción, y los índices
>   únicos de una hypertable tienen que incluir la columna de particionado, lo cual decidió nuestras
>   llaves primarias una migración antes.
> - **El sandbox de Nessie tiene una forma que hay que descubrir.** Fechas sin hora, así que el orden
>   intradía vive en nuestra propia bitácora. Subcolecciones vacías que contestan `200 []` o un 404 con
>   un string pelón. Montos que mezclan enteros y flotantes, identificadores que mezclan UUID con
>   ObjectId, y un 403 que significa ruta equivocada y no llave inválida. El pool empresarial
>   compartido está contaminado por otros equipos, así que nunca calculamos sobre él.

**EN**

> - **A detector registry that silently called nothing.** The first version discovered detector
>   modules by dynamic import and guessed each one's argument tuple from its arity. Once the real
>   detectors landed it called none of them, and the tests stayed green because they asserted on an
>   empty array. A payment run that reads "sin hallazgos" because the engine could not reach its own
>   detectors is the single worst failure this product can have. We replaced it with an explicit, typed
>   list, and now every control lands in ran or in skipped with a reason, so silence has to explain
>   itself.
> - **The SAT file is not the CSV anyone expects.** It is ISO-8859-1, not UTF-8, so a strict decode
>   throws and a lenient one silently corrupts every legal-name comparison downstream. Its row count
>   and its line count differ, because two records carry a bare newline inside a quoted name. 483
>   publication dates are unreadable in the DOF column and have a usable portal date beside them, 93
>   cells carry two dates in one field, and 91 RFCs are redacted by court order. We resolve columns by
>   name rather than position, report every unreadable row with its line number, and refuse to drop
>   one, because a row silently lost from a fiscal blacklist is the worst possible bug.
> - **An empty answer from a network is not "not consulted".** Snowflake's SQL REST API returns every
>   value as a string, and a DATE as days since the epoch rather than as `YYYY-MM-DD`. The first real
>   `consortium:pull` read all 46 rows and skipped all 46, then wrote an empty snapshot flagged as a
>   network that had answered. That is worse than not asking: every screen would have said the network
>   has never seen any of those accounts, on a run where 45 of the 46 pairs are corroborated. The query
>   now formats both dates inside the SQL, where a reviewer sees them, and the reader also understands
>   the epoch-day form. Both have a test that fails without the fix.
> - **A level computed in four places is the same bug with a longer fuse.** The engine knew the
>   severity, the API knew the action, the web knew the colour, and the offline fallback knew a
>   hand-written guess. When two of those sources disagreed about a supplier's legal name, a judge saw
>   both on one screen. ADR-0009 left one pure function per value and no column that stores either, and
>   a test walks every source file in `apps/web/src` so the next component that reaches the network
>   without consulting the mode fails a test rather than a demo.
> - **A signed XML is byte-exact, and Banxico documents no signing scheme.** The receipt is stored
>   exactly as served and never re-encoded. For the seal we could either claim a verification we cannot
>   prove, or build a candidate matrix over hashes, cadena variants and encodings and report honestly
>   that the scheme is unconfirmed. We chose the second, and the UI renders "sello no verificado",
>   never "sello invalido", because those are two different claims and only one of them is ours to
>   make.
> - **Using a model without letting it decide anything.** The extractor's response schema has six
>   field names and no field a verdict, a score or a recommendation could be written into: the model is
>   not asked to be good, it is given nowhere to put an opinion. A test reads the package's own source
>   and fails if a shipped module so much as names `decide`, `score` or `recommend`. And when the
>   assistant arrived the same question came back larger: the answer was that all nine tools are GETs,
>   that `readOnly` is the literal `true`, and that a proposal executes on a person's click with their
>   name in the ledger.
> - **A bare "si" is not a confirmation.** On a verification call the agent first asks whether it is
>   even speaking to the supplier, so a "si" that answers that question must never count as agreement
>   about a bank account. The comma is load bearing too: "no, es correcta" and "no es correcta" mean
>   opposite things. The parser scores clauses, only the supplier's turns, and ranks denial over
>   uncertainty over confirmation, because a false confirmation releases money that never comes back
>   and a false denial costs one telephone call.
> - **Server-Sent Events need a long-lived process**, which contradicted our deploy decision and
>   forced a written amendment: the web client stays a static build on Vercel and the API moved to a
>   Vultr instance next to the database, behind Caddy with TLS. We kept the constraint that the API
>   imports no runtime-specific modules. And Tiger Data has two rules you meet the hard way: a
>   continuous aggregate cannot be created inside a transaction, and a hypertable's unique indexes must
>   include the partitioning column, which decided our primary keys one migration earlier.
> - **The Nessie sandbox has a shape you have to discover.** Dates with no time component, so intraday
>   ordering lives in our own ledger. Empty sub-collections that answer either `200 []` or a 404 with a
>   bare string body. Amounts mixing integers and floats, identifiers mixing UUIDs with ObjectIds, and
>   a 403 that means the wrong path rather than a bad key. The shared enterprise pool is contaminated
>   by other teams, so we never compute on it.

## Field 8, accomplishments that we are proud of

**ES**

> - **La lista real del artículo 69-B funciona sin red.** Un juez escribe el RFC que quiera en el
>   buscador y la respuesta sale del archivo de 14,234 registros que está en el repositorio, leído por
>   un cargador que reporta lo que no puede interpretar en lugar de tirarlo.
> - **Cada uno de los seis controles tiene que responder por sí mismo.** Corrió más no corrió siempre
>   da seis, y un control saltado dice qué le faltó. Encontramos el error donde eso no era cierto, y lo
>   encontramos antes del demo y no durante.
> - **No hay modelo de lenguaje en la decisión, y eso es una prueba y no una promesa.** El único
>   paquete que puede llamar a un modelo solo puede transcribir, y una prueba lee su código para
>   demostrarlo. El asistente que sí habla con un modelo tiene nueve herramientas de lectura y ninguna
>   forma de escribir, y ninguna propuesta se ejecuta sin el clic y el nombre de una persona.
> - **Un nivel que nunca se despega de su evidencia.** Tres niveles y tres estados, cada uno derivado
>   por una función pura con una prueba por renglón de la tabla de reglas, y ninguna columna que los
>   guarde. Sin porcentajes y sin calificaciones, porque nadie puede garantizar una transferencia que
>   no se puede recuperar.
> - **Cinco integraciones corrieron contra el proveedor de verdad, no contra un doble.** Las llamadas
>   telefónicas de verificación, cinco, con sus identificadores de conversación, una imagen por
>   Gemini, una escritura en el espejo bancario, la prueba de un centavo sobre ese mismo espejo, y una
>   corrida completa de 86 líneas por MXN 1,388,920.90 entregada en el espejo el 2026-09-13, con 6
>   líneas que no se movieron porque el motor las tiene detenidas y nadie firmó una liberación.
> - **La red entre empresas se sembró, se empujó y se leyó contra una cuenta real de Snowflake**, con
>   46 pares hasheados en la foto local, y la decisión la sigue leyendo sin tocar el almacén. Sin la
>   bandera prendida el producto dice que la red no fue consultada, y no se degrada en silencio.
> - **La evaluación no se editó para que nos diera la razón, y publicamos las partes en las que no
>   nos la da.** Ningún caso del conjunto etiquetado se cambió para que un control pasara, y las
>   etiquetas salen de ADR-0002 y de los tipos del dominio y no de leer el código de los controles,
>   que es más débil que escribirlas a ciegas y es lo que de verdad ocurrió. Sobre treinta y cinco
>   casos etiquetados el motor saca 87.0 por ciento de precisión, 83.3 por ciento de recall y 1.6
>   por ciento de falsos positivos, elige la acción etiquetada en 33 de los 35, y leído como lo lee
>   una auxiliar en pantalla, los doce pagos que debían salir confiables salieron confiables. Cada
>   desacuerdo de esa tabla es uno de cuatro desacuerdos documentados sobre qué tan grave es un
>   hallazgo o sobre si es comprobable, y no un control que se haya callado ni uno que haya
>   disparado sobre un pago limpio. Los desacuerdos se quedan en la tabla con los dos argumentos
>   escritos, porque un conjunto de casos editado hasta que coincide no mide nada.
> - **Lo real y lo sintético nunca se tocan.** Los RFC reales solo viven en una consulta de solo
>   lectura, y la publicación simulada truena con cualquier RFC que no tenga el prefijo sintético. Esa
>   regla de nuestro propio registro de decisiones está impuesta en el código y no en una convención
>   que alguien recuerde.
> - **Cada pantalla tiene sus cuatro estados, y una prueba lo verifica.** Carga, vacío, error y
>   contenido están diseñados y no descubiertos, un pago que pasa los seis controles lo dice en voz
>   alta en lugar de mostrar una insignia pelona, y la build falla cuando una pantalla se publica con
>   el camino feliz y nada más.

**EN**

> - **The real SAT Article 69-B list works with no network.** A judge types any RFC they like into the
>   lookup box and the answer comes from the committed 14,234-row file, parsed by a loader that reports
>   what it cannot read instead of dropping it.
> - **Every one of the six controls has to account for itself.** Ran plus skipped always equals six,
>   and a skip names what was missing. We found the bug where that was not true, and we found it before
>   the demo instead of during it.
> - **There is no language model in the decision, and it is a test rather than a promise.** The only
>   package allowed to reach a model may only transcribe, and a test reads its source to prove it. The
>   assistant that does talk to a model has nine read tools and no way to write, and no proposal
>   executes without a person's click and a person's name.
> - **A level that never comes unstuck from its evidence.** Three levels and three states, each
>   derived by a pure function with a test per row of the rule table, and no column that stores either.
>   No percentages and no scores, because nobody can guarantee a transfer that cannot be recalled.
> - **Five integrations ran against the real provider, not against a double.** Five outbound
>   verification calls with their conversation ids, one image through Gemini, a write on the bank
>   mirror, the one-cent probe on that same mirror, and one complete run of 86 lines for MXN
>   1,388,920.90 executed on the mirror on 2026-09-13, with 6 lines that did not move because the
>   engine is holding them and nobody signed a release.
> - **The cross-company network was seeded, pushed and read against a real Snowflake account**, with
>   46 hashed pairs landing in the local snapshot, and the decision still reads it without touching the
>   warehouse. With the flag off the product says the network was not consulted rather than degrading
>   silently.
> - **The evaluation was not edited until it agreed with us, and we published the parts that
>   disagree.** No case in the labelled set was changed to make a control pass, and the labels come
>   from ADR-0002 and the domain types rather than from reading the control source, which is weaker
>   than writing them blind and is what actually happened. On thirty-five labelled cases the engine
>   scores 87.0 percent precision, 83.3 percent recall and a 1.6 percent false-positive rate,
>   chooses the labelled action on 33 of the 35, and read the way a clerk reads the screen, twelve
>   of the twelve payments that should have come out `confiable` did. Every mismatch in that table
>   is one of four documented disagreements about how severe a finding is or whether it is provable,
>   not a control that failed to fire and not a control that fired on a clean payment. The
>   disagreements are left in the table with both arguments written down, because a case set edited
>   until it agrees measures nothing.
> - **Real and synthetic never touch.** Real RFCs live only in a read-only lookup; the simulated
>   publication throws on any RFC without the synthetic prefix. That rule from our own architecture
>   decision record is enforced in code, not in a convention someone remembers.
> - **Every screen has all four of its states, and a test says so.** Loading, empty, error and content
>   are designed rather than discovered, a payment that passes all six controls says that out loud
>   instead of showing a bare badge, and the build fails when a screen ships with a happy path and
>   nothing else.

## Field 9, what we learned

**ES**

> - **Mantener la inteligencia libre de entrada y salida no es una preferencia de estilo.** Es lo que
>   hizo que el barrido retroactivo, la evaluación ciega y un demo sin red fueran el mismo código.
> - **La parte difícil de un control de cumplimiento nunca es la consulta.** Es la cadencia y el
>   momento. Un control que corre al dar de alta al proveedor no protege nada contra una lista
>   publicada dos años después, y un control que corre después de la liquidación es una autopsia.
> - **El silencio es la falla peligrosa, y una respuesta vacía es un silencio disfrazado.** Una lista
>   de hallazgos vacía y un pago limpio se ven igual en pantalla; una red que contestó cero y una red
>   que no se consultó también. El motor se rehizo hasta que pudo distinguir los dos pares en voz alta.
> - **Un nivel sin evidencia debajo no es algo que este producto muestre.** Y una cifra que no está
>   calibrada no se imprime junto al nombre de un proveedor, porque invita la única pregunta que el
>   motor no puede contestar.
> - **Decir lo que no puedes demostrar.** Reportar "sello no verificado" en vez de afirmar un sello
>   válido nos costó una frase y nos compró lo único que importa cuando quien lee es técnico.
> - **Lo que vale no son los minutos, es la pérdida que no ocurrió.** Se lo dijimos a tres jueces en
>   minutos y no les importó, con razón: el valor de este producto se dice en pesos que no salieron.
> - **Las decisiones escritas le ganan a las conversaciones de las 3 de la mañana.** Cuatro personas
>   construyendo en paralelo sobre un repositorio no terminaron con cuatro productos distintos porque
>   las decisiones estaban en archivos que cada persona lee antes de tocar nada.

**EN**

> - **Keeping the intelligence free of IO is not a style preference.** It is what made the retroactive
>   sweep, the blind evaluation and an offline demo the same code path.
> - **The hard part of a compliance check is never the check.** It is the cadence and the moment. A
>   control that runs at supplier onboarding protects nothing against a list published two years later,
>   and a control that runs after settlement is a post-mortem.
> - **Silence is the dangerous failure, and an empty answer is silence in disguise.** An empty findings
>   list and a clean payment look identical on a screen; so do a network that answered zero and a
>   network nobody asked. The engine was rebuilt until it could tell both pairs apart out loud.
> - **A level with no evidence under it is not something this product shows.** And an uncalibrated
>   figure does not get printed next to a supplier's name, because it invites the one question the
>   engine cannot answer.
> - **Say what you cannot prove.** Reporting "sello no verificado" instead of claiming a valid seal
>   cost us a sentence and bought the only thing that matters when someone technical is reading.
> - **The value is not the minutes, it is the loss that did not happen.** We said it in minutes to
>   three judges and they did not care, and they were right: the value of this product is said in pesos
>   that did not leave.
> - **Written decisions beat conversations at 03:00.** Four people building in parallel on one
>   repository did not end up with four different products because the decisions were in files that
>   every person reads before touching anything.

## Field 10, what is next

**ES**

> - **Medir la tasa de falsos positivos contra corridas de pago reales en empresas reales**, en lugar
>   de contra nuestros propios negativos difíciles. Ese es el número que decide si una auxiliar deja el
>   producto encendido, y es el número que estamos pidiendo. Diez corridas en modo sombra, sin cobrar.
> - **Entregar la vista para despachos contables**: una pantalla, treinta empresas, porque el despacho
>   ya tiene el XML de CFDI de cada cliente y es quien presenta la complementaria cuando se abre la
>   ventana de treinta días. Es también el canal: 143 de las 737 unidades de contabilidad y auditoría
>   de Nuevo León emplean de 11 a 250 personas.
> - **Seguir las listas en vez de fotografiarlas.** Actualizar desde los datos abiertos del SAT de
>   forma programada, comparar versiones, y disparar el barrido retroactivo sobre la diferencia y no
>   sobre un botón. Y cargar la lista del artículo 49 Bis el día que el SAT la publique como archivo.
> - **Abrir la red a empresas reales.** Hoy el otro lado de la red es sintético y lo decimos en cada
>   pantalla. El siguiente paso es el primer tenant que no somos nosotros, con el mismo payload de
>   siete columnas hasheadas y la misma regla de que la ruta caliente lee una foto local.
> - **El riel de producción.** `StpRail` está escrito y nunca ha corrido: hace falta el contrato de
>   participante, y hasta entonces el constructor se niega en cualquier máquina.
> - **Transcripción en el dispositivo**, que elimina al mismo tiempo el único costo que escala con el
>   uso y la única transferencia de datos fuera del perímetro.

**EN**

> - **Measure the false-positive rate against real payment runs in real companies**, instead of
>   against our own hard negatives. That is the number that decides whether a clerk keeps the product
>   switched on, and it is the number we are asking for. Ten runs in shadow mode, at no charge.
> - **Ship the accounting-firm view**: one screen, thirty companies, because the firm already holds
>   every client's CFDI XML and files the corrective return when the thirty-day window opens. It is
>   also the channel: 143 of the 737 accounting and audit units in Nuevo Leon employ 11 to 250 people.
> - **Track the lists instead of snapshotting them.** Refresh from the SAT open-data endpoint on a
>   schedule, diff versions, and let the retroactive sweep fire on the difference rather than on a
>   button. And load the article 49 Bis list the day the SAT publishes it as a file.
> - **Open the network to real companies.** Today the other side of the network is synthetic and we
>   say so on every screen. The next step is the first tenant that is not us, with the same seven-column
>   hashed payload and the same rule that the hot path reads a local snapshot.
> - **The production rail.** `StpRail` is written and has never run: it needs the participant
>   contract, and until then the constructor refuses on every machine.
> - **On-device transcription**, which removes the only cost that scales with usage and the only data
>   transfer outside the perimeter at the same time.

## Field 11, built with

Paste as tags. Every tag is a dependency, a service or a data source this repository actually uses. A
tag for something that is not in the build is the cheapest lie a judge can catch.

```
bun, typescript, hono, zod, postgres, timescaledb, tiger-data, snowflake, react, vite, tailwindcss,
motion, recharts, biome, server-sent-events, gemini-api, elevenlabs, twilio, nessie-api, vercel,
vultr, caddy, sat-69b, banxico-cep, cfdi, spei
```

Pinned versions, for the record: bun 1.3.11, typescript 5.9.3, hono 4.13.7, zod 4.5.4, postgres
3.4.9, react 19.2.8, vite 8.2.2, tailwindcss 4.3.3, motion 13.2.0, recharts 3.10.1, uqr 0.1.3, biome
2.5.12.

`recharts` was untagged in the M3 draft because nothing imported it. It is now imported by
`apps/web/src/components/RunDonut.tsx` and `Controls.tsx`, so the tag is honest and it is in the list.

## Field 12, business model, if the form asks and for the video description

Devpost does not always give this a field of its own. When it does, or when the video description
needs it, this is the short version. The long one is [`docs/05-business-model.md`](05-business-model.md).

**ES**

> La empresa paga MXN 899 al mes, y el plan para despachos contables es de MXN 3,900 al mes por hasta
> veinte empresas cliente, MXN 195 cada una. Se paga solo con una factura detenida de MXN 23,452 de
> subtotal al año, porque de un subtotal rechazado por el 69-B se revierte el 46 por ciento entre ISR e
> IVA. Una factura de MXN 100,000 de subtotal detenida paga cincuenta y un meses de suscripción; un
> SPEI mal dirigido del mismo monto paga ciento once. El tamaño de mercado, de abajo hacia arriba y
> por entidades por precio, es de MXN 2,655 millones de TAM, MXN 948 millones de SAM y MXN 12.1
> millones de SOM al año.

**EN**

> The company pays MXN 899 per month, and the accounting-firm plan is MXN 3,900 per month for up to
> twenty client companies, MXN 195 each. It pays for itself on one stopped invoice of MXN 23,452 of
> subtotal per year, because 46 percent of a subtotal rejected under 69-B reverses between ISR and
> IVA. One held invoice of MXN 100,000 of subtotal pays for fifty-one months of the subscription; one
> misdirected SPEI of the same amount pays for a hundred and eleven. The market, sized bottom-up as
> entities times price, is MXN 2,655 million of TAM, MXN 948 million of SAM and MXN 12.1 million of
> SOM per year.

## The Capital One challenge track, the statement to paste

Track 3 of three, **Real-Time Anomaly and Security Sentinel**, which the challenge states as
behavioral anomaly detection engines that analyze transaction ledgers in real time to flag unexpected
transfer velocity, suspicious merchant category hops or abnormal account behaviors.

**ES**

> SentryOne es un sentinela de anomalías en tiempo real sobre la bitácora de pagos de una PyME
> mexicana, y el tiempo real que elige es el único que no se puede deshacer: los minutos entre
> aprobar una corrida de pagos y mandarla. Seis controles deterministas leen la bitácora
> append-only de la propia empresa, la lista oficial del artículo 69-B del SAT y el comprobante que
> Banxico firma por cada SPEI, y cada línea sale con su nivel, su estado y la acción propuesta, con
> la evidencia a la vista. La anomalía que nos importa no es un comercio raro: es una CLABE que
> difiere en dos dígitos de la cuenta en la que ya le pagamos 52 veces, un proveedor que el SAT
> acaba de publicar, una factura que se va a pagar dos veces, y un titular de cuenta que resulta ser
> otra empresa. Y porque un SPEI aceptado es firme e irrevocable, detectar después de la liquidación
> es una autopsia: este producto detecta antes y deja la decisión en una persona.

**EN**

> SentryOne is a real-time anomaly sentinel over the payment ledger of a Mexican SMB, and the real
> time it picks is the only one that cannot be undone: the minutes between approving a payment run
> and sending it. Six deterministic controls read the company's own append-only ledger, the two SAT
> Article 69-B list and the receipt Banxico signs for every SPEI, and every line comes out
> with its level, its state and the proposed action, with the evidence in view. The anomaly that
> matters here is not an odd merchant category: it is a CLABE two digits off the account this
> supplier has been paid on 52 times, a supplier the SAT has just published, an invoice about to be
> paid twice, and an account holder who turns out to be a different company. And because an accepted
> SPEI is firme e irrevocable, detecting after settlement is a post-mortem: this product detects
> before, and leaves the decision to a person.

## MLH prize categories, the evidence sentence for each

Never select a category we did not genuinely use. A claim a judge can falsify costs more than the
prize is worth. The evidence sentence is what goes in the submission; the gate is what has to be true
when it is submitted, checked against the deployed build and not against an intention.

### Best Use of Gemini API

**Evidence sentence, ES**

> El asistente de SentryOne llama a Gemini con function calling sobre nuestra propia API, y las nueve
> herramientas son de lectura: `get_run`, `get_instruction`, `get_supplier`, `get_verification`,
> `get_execution`, `get_receipt`, `sat_lookup`, `consortium_signal` y `get_metrics`. `readOnly` es el
> literal `true` y no un booleano, así que una llamada que escriba no se puede construir. Aparte del
> asistente, Gemini hace OCR de la CLABE en la foto de WhatsApp y transcribe la nota de voz, y nada
> más: el esquema de respuesta tiene seis campos y ninguno donde quepa un veredicto. Ningún nivel,
> ninguna acción y ningún número salen del modelo, y una prueba lee el código del paquete y falla si
> un módulo publicado siquiera menciona `decide`, `score` o `recommend`. El turno termina en una
> propuesta con el cuerpo exacto de la petición; ejecuta una persona, con su nombre en la bitácora.

**Evidence sentence, EN**

> SentryOne's assistant calls Gemini with function calling over our own API, and all nine tools are
> reads: `get_run`, `get_instruction`, `get_supplier`, `get_verification`, `get_execution`,
> `get_receipt`, `sat_lookup`, `consortium_signal` and `get_metrics`. `readOnly` is the literal `true`
> rather than a boolean, so a tool call that writes cannot be constructed. Beside the assistant,
> Gemini does OCR of the CLABE in the WhatsApp photograph and transcribes the voice note, and nothing
> else: the response schema has six fields and no field a verdict could be written into. No level, no
> action and no number comes from the model, and a test reads the package source and fails if a
> shipped module so much as names `decide`, `score` or `recommend`. A turn ends in a proposal carrying
> the exact request body; a person executes, with their name in the ledger.

**Gate.** `GEMINI_API_KEY` set on the deployed API, and a judge can drop a screenshot into the
assistant or post a photograph through the QR intake page and watch the CLABE come back. Without the
key the endpoint answers 422 and says which variable is missing, which is honest but is not a
demonstration. Evidence already on file: one handwritten-style image through `packages/extract` on
2026-09-12, in [`docs/14-process.md`](14-process.md#the-extraction-gemini). The measured cost per
turn and per transcription is in
[`docs/06-regulatory-privacy.md`](06-regulatory-privacy.md) section 6.4 and in
`apps/api/src/assistant/cost.ts`.

### Best Use of ElevenLabs

**Evidence sentence, ES**

> Cuando hay que confirmar una cuenta nueva, SentryOne llama al proveedor con un agente de
> Conversational AI de ElevenLabs en español mexicano, marcado por la integración con Twilio. El guion
> se deriva de la instrucción y no se escribe a mano: dice los últimos cuatro dígitos de la cuenta
> separados uno por uno y nunca los dieciocho, no promete ningún pago, no acusa a nadie y no pide
> ningún dato. La transcripción la interpreta un analizador determinista, no un modelo: califica
> cláusulas, solo de los turnos del proveedor, y ordena negación sobre duda sobre confirmación, porque
> un "sí" que contesta "¿hablo con el proveedor?" no es una confirmación de una cuenta bancaria. El
> resultado es confirmado, negado, sin respuesta o poco claro, y ninguno de los cuatro libera un pago
> por sí solo.

**Evidence sentence, EN**

> When a new account needs confirming, SentryOne calls the supplier with an ElevenLabs Conversational
> AI agent speaking Mexican Spanish, placed through the Twilio integration. The script is derived from
> the instruction rather than typed: it speaks the last four digits of the account spaced one by one
> and never the eighteen, promises no payment, accuses nobody and asks for no data. The transcript is
> read by a deterministic parser rather than by a model: it scores clauses, only the supplier's turns,
> and ranks denial over uncertainty over confirmation, because a "si" that answers "am I speaking to
> the supplier?" is not a confirmation about a bank account. The outcome is confirmed, denied, no
> answer or unclear, and none of the four releases a payment on its own.

**Gate.** Passed, eleven times. Two real outbound calls on 2026-09-12, three more on 2026-09-13 for
issue #206 and six more the same day for issue #250, all on agent
`agent_3501m2ah6erkf46rxdmhy4xtsexw`, every conversation id listed in
[`docs/14-process.md`](14-process.md#the-verification-call-elevenlabs-over-twilio), dialled from the
team's own imported number to a teammate's own mobile. No supplier and no real counterparty has ever
been called by this product.

**The three calls of 2026-09-13 are the part worth telling**, because each one found something a stub
could not. One reached a voicemail and the parser read `no_answer` off the greeting, which also
exposed the agent asking "sigue ahi" for the whole duration cap instead of hanging up. One reached a
person, who heard the change question, and exposed the defect that matters: given `4611` the voice said
"cuatro mil seiscientos once", a quantity rather than four digits, so the digits now go out spaced. The
third is the call as it ships: 68 seconds, "termina en cuatro seis uno uno", no other digit of any
account read out, an off-topic request refused with "Mi funcion es unicamente confirmar los datos de
pago", and an outcome of `unclear` because the person answered and then went off script. `unclear` is
the honest reading and it releases nothing.

**The six calls of issue #250 are what made it sound like a line somebody would stay on.** The call
now says what it is in its first sentence, which is also what made it ring: the version that claimed to
be a person came back `call_initialization_error 3000` with the word unsafe and dropped at zero seconds.
The question no longer ends on a two word either-or, the answer is asked for in the supplier's own
words, the agent hangs up itself on one goodbye, and the eighteen reply gaps measured across those six
calls are all between 0 and 3 seconds against 5 and 9 before. The clean confirmation is
`conv_7801m2cw1wxve2kv9yf768p3600f`, read as `confirmed` off "Sí, es mía".

**What is still open, stated rather than hidden.** A live `denied` is covered by the fixtures and by
the unit tests but not yet by a real call: the closest is a "No creo" the agent closed on as a change
that did not come from them and the parser read as `unclear`. Both stop the payment. And the
`verification_call` event reaches the ledger and the stream without being rendered in the instruction
panel yet.

### Best Use of Tiger Data

**Evidence sentence, ES**

> La columna vertebral de SentryOne es una bitácora append-only de eventos de pago en Postgres, y es
> lo que vuelve al barrido retroactivo del 69-B una reproducción de la historia y no un recálculo.
> Tiger Data convierte esa bitácora en hypertable y el resumen diario que lee la línea del tiempo en
> un agregado continuo, aplicado en una migración condicional para que un Postgres 18 simple corra el
> mismo SQL contra la tabla base. Las dos reglas que nos costaron una migración están escritas: un
> agregado continuo no se crea dentro de una transacción, y los índices únicos de una hypertable
> tienen que incluir la columna de particionado, lo cual decidió nuestras llaves primarias antes de
> que existiera la hypertable.

**Evidence sentence, EN**

> SentryOne's spine is an append-only ledger of payment events in Postgres, and it is what makes the
> retroactive 69-B sweep a replay of history rather than a recomputation. Tiger Data turns that ledger
> into a hypertable and the daily rollup the timeline reads into a continuous aggregate, applied in a
> conditional migration so a plain Postgres 18 runs the identical SQL against the base table. The two
> rules that cost us a migration are written down: a continuous aggregate cannot be created inside a
> transaction, and a hypertable's unique indexes must include the partitioning column, which decided
> our primary keys before the hypertable existed.

**Gate.** `0002_timescale.sql` and `0004_timescale_sentryone.sql` applied on the deployed database and
the aggregate actually read. Issue #72 is closed and the two-host topology has been deployed against
Tiger Data since 2026-09-12 15:32 CST. If the instance is running on plain Postgres at submission
time, do not select this category.

### Best Use of Vultr

**Evidence sentence, ES**

> `apps/api` corre en una instancia de Vultr, junto a la base de datos, porque el flujo de
> Server-Sent Events que mantiene la corrida viva en pantalla necesita un proceso de larga vida y eso
> contradijo nuestra decisión de despliegue original, que quedó enmendada por escrito. Caddy termina
> TLS delante de la API en un nombre sslip.io, con `flush_interval -1` para que `event: ready` llegue
> en el instante y no cuando se cierre la conexión, que es exactamente lo que un proxy con búfer se
> lleva. El navegador solo habla con Vercel: `vercel.json` reescribe `/api` y `/health` a la
> instancia, así que no hay historia de CORS ni URL base en el bundle.

**Evidence sentence, EN**

> `apps/api` runs on a Vultr instance, next to the database, because the Server-Sent Events stream
> that keeps the run live on screen needs a long-lived process, and that contradicted our original
> deploy decision, which was amended in writing. Caddy terminates TLS in front of the API on an
> sslip.io name, with `flush_interval -1` so `event: ready` arrives immediately rather than when the
> connection closes, which is exactly what a buffering proxy takes away. The browser only ever talks
> to Vercel: `vercel.json` rewrites `/api` and `/health` to the instance, so there is no CORS story
> and no base URL in the bundle.

**Gate.** Passed at the time of writing. <https://api.104.238.147.69.sslip.io/health> answers
`{"ok":true,"service":"api","version":"0.1.0"}` over HTTPS, and
<https://sentryone-one.vercel.app/api/v1/run/current> answers the same run through the rewrite. Issue
#44 is closed. **The instance is behind `dev` at the time of writing and has to be redeployed before
the submission is final**, because `GET /api/v1/run/current` answers the five-field totals without
`heldAmount`, `toVerifyAmount`, `releasedAmount`, `stoppedAmount` or `amountAtRisk`, and
`GET /api/v1/metrics` answers the older case count with `perLevel` null. Both are on `dev`. Re-check
the two URLs after the redeploy, not before.

### Best Use of Snowflake API

**Evidence sentence, ES**

> El control del beneficiario es más débil exactamente en el caso que más dinero cuesta: la primera
> factura de un proveedor, donde esta empresa no tiene historia que comparar. La información que lo
> resolvería existe y no está en esta empresa. SentryOne la pone en una red entre compañías sobre
> Snowflake, y `packages/consortium` habla con ella por la API REST de SQL y por nada más:
> `POST /api/v2/statements` con un JWT de par de llaves firmado con `node:crypto`, y
> `GET /api/v2/statements/<handle>` cuando la respuesta llega como 202. Sin SDK y sin una dependencia
> nueva, así que el cliente es un archivo que un ingeniero lee de principio a fin. Lo que sale de una
> empresa son siete columnas: un hash con sal del tenant, uno del RFC, uno de la CLABE, el código de
> banco que esos tres dígitos ya dicen en público, una consecuencia de cuatro posibles, una fecha y
> la bandera de sintético. Lo que se lee es un agregado, nunca el renglón de otra empresa, y la ruta
> caliente lee una foto local: el motor recibe la señal de red como argumento, igual que el CEP, así
> que el almacén nunca está en la ruta de una decisión. La red de otras empresas en este repositorio
> es sintética, generada con la misma semilla que la empresa del demo, y cada renglón viaja marcado
> como sintético.

**Evidence sentence, EN**

> The beneficiary control is weakest in exactly the case that costs the most money: a supplier's
> first invoice, where this company has no history to compare against. The information that would
> settle it exists and is not in this company. SentryOne puts it in a cross-company network on
> Snowflake, and `packages/consortium` talks to it over the SQL REST API and nothing else:
> `POST /api/v2/statements` with a key-pair JWT signed by `node:crypto`, and
> `GET /api/v2/statements/<handle>` when the submission answers 202. No SDK and no new dependency, so
> the client is a file an engineer reads end to end. What leaves a company is seven columns: a salted
> hash of the tenant, one of the RFC, one of the CLABE, the bank code those three digits already state
> in public, one of four outcomes, a date, and the synthetic flag. What is read is an aggregate, never
> another company's row, and the hot path reads a local snapshot: the engine receives the network
> signal as an argument, exactly like the CEP, so the warehouse is never on the path of a decision.
> The network of other companies in this repository is synthetic, generated from the same seed as the
> demo company, and every row travels flagged as synthetic.

**Why a warehouse and not another table in ours, which is the question an engineer asks.** The
operational ledger is single-tenant by construction: `0006_company.sql` declares
`id integer primary key default 1 check (id = 1)`, so the database refuses a second company row, and
that invariant is what keeps every read on the hot path simple enough to show a judge. A network of
companies is cross-tenant by design, wants governed sharing the day a real participant asks what we
can see, wants its own credential and its own blast radius, and is a batch columnar workload rather
than an OLTP one. `SENTRYONE.CONSORTIUM.BENEFICIARY_EVENTS` is where all four of those are true at
once.

**Gate.** Passed. Seeded, pushed and pulled against a real Snowflake account on 2026-09-12, landing
46 hashed pairs in the local snapshot, 45 corroborated and 1 with a fraud report. `bun run doctor`
prints the `snowflake` line green. `ALLOW_CONSORTIUM` gates the API and the scripts; with it unset
the finding says the network was not consulted instead of scoring as though it had answered. The
decision and its privacy limits are in [ADR-0006](adr/0006-consortium-snowflake.md) and
[`docs/06-regulatory-privacy.md`](06-regulatory-privacy.md) section 8. Say "the warehouse is real
and the other companies on it are ours, generated" and never "companies are on our network".

### Best .Tech Domain Name

**Evidence sentence, ES**

> `sentryone.tech` es la dirección pública del producto, y el nombre dice lo que hace: un centinela,
> uno, parado en el único momento del pago que no se puede deshacer.

**Evidence sentence, EN**

> `sentryone.tech` is the product's public address, and the name states what it does: one sentry,
> standing at the one moment of a payment that cannot be undone.

**Gate. Not passed yet.** `sentryone.tech` is not registered. Issue #59 is open and the registration
is through the MLH .Tech offer. The Vercel project already carries `sentryone.tech` and
`www.sentryone.tech`, so the domain is one registration and two DNS records away from being the live
URL. **Select this category only after <https://sentryone.tech> loads the app**, and if it does, edit
the live URL field to it and leave the Vercel URL in the README as the fallback. Do not paste an
etymology the team has not agreed: [ADR-0002](adr/0002-track-and-thesis.md) records SENTRYONE as one
of the two merged finalist ideas and does not record how the name was built, so the sentence above
says only what the product does.

## Links

| Field | Value |
|---|---|
| Repository | <https://github.com/garzario/CapitalOneHackMTY> |
| Live URL | <https://sentryone-one.vercel.app> . Replace with <https://sentryone.tech> if and only if issue #59 lands first. `?data=api` forces the deployed backend instead of the offline fallback, `?data=mock` runs the same screens with no network at all |
| API health | <https://api.104.238.147.69.sslip.io/health> |
| Same-origin proof | <https://sentryone-one.vercel.app/api/v1/run/current> |
| Demo video | `TODO(garzario)`, issue #73. Hosted per the event's stated requirement, and it must play from a private browser window before the link is pasted |
| Architecture decisions | <https://github.com/garzario/CapitalOneHackMTY/tree/main/docs/adr> , nine of them |

## Team members to add

Four people, all four added as team members on the submission. The Devpost handles are the only thing
missing and each person supplies their own.

| Name | GitHub | Role on this submission | Devpost handle |
|---|---|---|---|
| Patricio Garza | `garzario` | Lead. `packages/core`, `packages/db`, `packages/sat`, `packages/cep`, `packages/rail`, `packages/consortium`, the ADRs, CI, all merges | `TODO(garzario)` |
| Fabian | `fabbyyyy` | Data platform. `apps/api`, `packages/nessie`, `packages/seed`, the schema, the migrations, the deploy | `TODO(fabbyyyy)` |
| Adan | `Apanawa` | Synthetic data and evaluation. The generator, the labelled holdout, the SAT loader and sweep, the constancia, QR intake, metrics | `TODO(Apanawa)` |
| Fabricio | `FabriBanda` | Product surface and narrative. Brand and design system, the payment run and finding screens, the market and persona docs, the judge card | `TODO(FabriBanda)` |

## Screenshots to attach, and where each capture already is

Devpost takes a gallery. Attach five, in this order, because this is the order the demo walks and the
order a judge reads. Every one of them must show the `datos sinteticos` watermark or the synthetic
label somewhere in frame, and at least one must show it unambiguously.

The wave verifiers already captured most of these and left them on pull requests and issues. The
`Where it already is` column is where to pull the image from rather than re-shooting it; the
`Re-shoot if` column is the only reason to take it again.

| # | Screen and route | What must be visible | Where it already is | Re-shoot if |
|---|---|---|---|---|
| 1 | **The payment run**, `#/run` | `run-2026-09-07`, 92 instructions, MXN 2,174,210.76, the hero figure of MXN 785,289.86 that is not leaving, rows sorted by pesos at risk with the alert rail, the level per line, the synthetic watermark | Committed: `assets/screenshots/run-light.png` and `run-dark.png`. Verifier captures: the `?data=mock` and `?data=api` pair on issue #125, comment of 2026-09-13 04:18Z, and `01-payment-run` on issue #133, comment of 2026-09-12 11:08Z | The redesign of #82 or the level-per-line totals of #208 changed the layout after those captures. Check that the figure on screen is MXN 785,289.86 before attaching |
| 2 | **The finding panel**, one instruction | `INS-2026-09-07-047`, the two digit positions that differ from the account paid 52 times, `580 (APODACA, NL)` against `180 (DISTRITO FEDERAL, DF)`, the evidence chips, the delay cost beside the expected loss, the level with its findings under it | Committed: `assets/screenshots/finding-light.png` and `finding-dark.png`. Verifier captures: the instruction-detail pair on issue #125, same comment | The plaza names of #233 are not in frame. That pair is the sentence an engineer tests |
| 3 | **The 69-B publication and the sweep**, `#/sat` | The counters after `Simular publicacion 69-B`: base MXN 878,592.59, ISR MXN 263,577.78, IVA MXN 140,574.81, exposure MXN 404,152.59, and the real-RFC lookup box with the 14,234-row snapshot behind it | Committed: `assets/screenshots/sat.png`. Verifier capture: `02-sat-sweep` on issue #133, comment of 2026-09-12 11:08Z | The sweep figures in frame are not the four above |
| 4 | **The cent and the CEP**, `#/cep?instruction=INS-2026-09-07-047` | `CENTAVO ENVIADO` with the clave de rastreo the rail answered, the holder name beside the CFDI legal name, `SELLO NO VERIFICADO` exactly as reported and never as invalid, and the end state | Committed: `assets/screenshots/cep.png`. Verifier captures: the three states in the body of PR #170, and the `?data=mock` and `?data=api` CEP pair on issue #125 | A frame shows a seal described as valid. That frame must not be attached at all |
| 5 | **The run leaving**, `#/payments` | 86 of 86 lines answered by the rail, the counters separating sent from settled, the clave de rastreo per line, and the six lines that did not move with the reason the engine wrote | Committed: `assets/screenshots/payments-light.png`, `payments-dark.png`, `payments-phone.png`. Verifier captures: `p212-sent-light` and `p212-sent-dark` on PR #235, comment of 2026-09-13 05:16Z, plus `p212-receipt` and `p212-excluded` in the next comment on the same PR | The counters do not read 86 sent and 6 out |

Three more to attach if the gallery takes more than five, in this order. The first of them exists only
on pull requests, so it is the one that needs pulling down rather than opening a folder.

| # | Screen | What must be visible | Where it already is |
|---|---|---|---|
| 6 | **The assistant drawer** | The dropped screenshot, the read-only tool cards above the answer, the proposal printed as the request body it would send, and the instruction that came back with its level, its state and the CLABE forensics finding | The nine images in the body of PR #228, and the three-image walk on issue #211, comment of 2026-09-13 04:59Z. Nothing of the assistant is committed under `assets/screenshots/` yet, which is the one gap in the capture set |
| 7 | **The blind evaluation**, `#/metrics` | The per-detector and per-level confusion matrix with the case count next to every rate, read off the same numbers `GET /api/v1/metrics` serves | Committed: `assets/screenshots/metrics.png`. Re-shoot this one: the figures moved when the holdout grew, so the committed capture is behind `bun run eval` |
| 8 | **Who signs every write**, `#/entrada` | The person every write will carry and the capability list that changes under your hand when the role changes, through the same rule the API enforces. It is the answer to "could this send a payment on its own" | Committed: `assets/screenshots/entry.png` and `entry-phone.png`. Never captioned as a login: it is a name and a role the ledger records, with no password and no session |

Three rules that override everything in the table. **No real personal data in any frame**, and no
`.env` contents, no keys and no other team's data: scrub every frame before it is attached. **Never
attach a frame that describes a seal as valid** or that shows a percentage next to a supplier's name.
And **the GIF**: `assets/screenshots/tour.gif` exists and `assets/demo.gif` is still
`TODO(Apanawa)`; if the hero loop is not ready, attach stills and say nothing about a GIF.

## Submission checklist, for the person at the keyboard

The ordered human steps are the comment on issue #76. This is the list to re-read after pasting and
before pressing submit.

- [ ] Draft submitted well before the deadline, then edited. A draft is the cheapest disaster
      insurance available
- [ ] All four teammates added, and each one confirmed they can see the submission
- [ ] Every category passed its gate, checked against the deployed build and not against an intention.
      `sentryone.tech` is the one that is not passed yet
- [ ] Track 3 named as the Capital One challenge track, in those words
- [ ] Video plays from the link in a private browser window
- [ ] Live URL loads on a phone on cellular data, and `?data=api` shows the deployed backend answering
- [ ] The API on Vultr was redeployed from `dev`, so `GET /api/v1/run/current` carries the money
      fields of the totals and `GET /api/v1/metrics` carries `perLevel`
- [ ] Repository is public and its README carries the live URL
- [ ] `bun test` re-run and the test count in "how we built it" refreshed, or the sentence cut
- [ ] `bun run eval` re-run and the evaluation numbers refreshed, or the sentence cut. Never a figure
      from memory
- [ ] Every number in this file still matches the table below, including the SAT row count if the
      snapshot was refreshed
- [ ] No real personal data in any screenshot, and the synthetic label is visible in at least one
- [ ] Every mention of the consortium network says the other companies on it are synthetic, in the
      submitted field itself and not only in the repository
- [ ] Screenshot of the submission confirmation saved, and the filename noted on issue #76

## Every number in this copy, and where it comes from

A number with no source does not go in the submission. This is the table to re-check against, and
every row of it is a figure that appears above.

| Number in the copy | Source |
|---|---|
| MXN 46,000 of tax effect per MXN 100,000 of deducted subtotal, 30 percent ISR plus 16 percent IVA | [`docs/04-market.md`](04-market.md) sources [5] and [6], via [`docs/11-pitch.md`](11-pitch.md) |
| 33 publication dates in the twelve months to 2026-07-31, about one every eleven days, 973 taxpayers moved to `definitivo` | [`docs/04-market.md`](04-market.md) source [3], counted from the open-data file, via `docs/11` |
| Thirty natural days, article 49 Bis, in force since 1 January 2026, the buyer's own seal restricted | [`docs/04-market.md`](04-market.md) source [4], CFF article 49 Bis |
| An accepted transfer order is firme, irrevocable, exigible y oponible frente a terceros | Ley de Sistemas de Pagos article 11, cited in `docs/11` and in the README |
| 24.3 percent refunded, MXN 1,265 million of MXN 5,201 million claimed, first quarter of 2026 | [`docs/04-market.md`](04-market.md) source [18]. It is a refund share on disputed pesos and never a loss rate |
| 28 employees, Apodaca, Nuevo Leon; 92 payment instructions settling 129 CFDIs; MXN 2,174,210.76 | [`docs/02-persona.md`](02-persona.md), seed 69 output for week `2026-09-07`. Synthetic, and labelled synthetic wherever it appears |
| MXN 785,289.86 not leaving, of MXN 2,174,210.76 | `totals` of `GET /api/v1/run/current`, from `runMoney`, quoted in `docs/11` and `docs/10` |
| MXN 878,592.59 of base and MXN 404,152.59 of exposure, MXN 263,577.78 ISR plus MXN 140,574.81 IVA | `notes.scenarios` on the run and beat 3 of `bun run demo`, quoted in `docs/11` and `docs/10` |
| 14,234 rows in the committed SAT list, current to 2025-12-31, downloaded 2026-09-12 | `packages/sat/src/snapshot/README.md`, asserted in `official.test.ts` |
| 483 unreadable DOF dates, 93 cells with two dates, 91 RFCs redacted, 2 records spanning lines | The same loader test and PR #119, recorded in [`docs/14-process.md`](14-process.md) |
| Two digits differ, positions 4 and 9, against an account paid 52 times; `580 (APODACA, NL)` against `180 (DISTRITO FEDERAL, DF)` | [`docs/10-demo-script.md`](10-demo-script.md#seeded-ids-used-in-the-demo), seeded hero instruction `INS-2026-09-07-047` |
| 86 lines sent for MXN 1,388,920.90, 6 lines stopped, on Nessie on 2026-09-13 | `packages/rail/README.md`, verified section, and `apps/api/src/routes/execute.test.ts` |
| 46 hashed pairs, 45 corroborated, 1 with a fraud report | `packages/consortium`, the live pull of 2026-09-12 recorded in PR #179 and beat 7 of `bun run demo` |
| Five outbound calls, the agent and every conversation id, the outcomes, USD 0.016 on the first | [`docs/14-process.md`](14-process.md#the-verification-call-elevenlabs-over-twilio) |
| 143 of the 737 accounting and audit units in Nuevo Leon employ 11 to 250 people | [`docs/04-market.md`](04-market.md) source [48], counted from the DENUE Nuevo Leon file |
| MXN 899 per company per month; MXN 3,900 per accounting firm for up to 20 client companies, MXN 195 each | [`docs/05-business-model.md`](05-business-model.md#who-pays-and-why-that-number) |
| Break-even at one stopped invoice of MXN 23,452 of subtotal a year; 51 months and 111 months on MXN 100,000 | [`docs/05-business-model.md`](05-business-model.md), arithmetic on the MXN 46,000 row above |
| TAM MXN 2,655 million, SAM MXN 948 million, SOM MXN 12.1 million a year | [`docs/04-market.md`](04-market.md#sizing), bottom-up, entities times price |
| 2,594 tests across 138 files: 2,476 passing, 118 skipped, 0 failing | `bun test` on this branch, re-read 2026-09-13 |
| 35 labelled cases; precision 87.0 percent, recall 83.3 percent, false-positive rate 1.6 percent, action agreement 33 of 35, and `confiable` 12 of 12 | `bun run eval` on this branch, re-read 2026-09-13, and `GET /api/v1/metrics` |

**Numbers deliberately not in this copy.** No probability and no percentage next to a payment or a
supplier, per ADR-0009. No minutes saved: three Capital One judges heard a minutes claim on
2026-09-12 and told us they did not care, so the value of this product is stated in pesos that did
not leave. No claim that nobody else does this, because one competitor's own landing page is the
counterexample: what we say is that we found nobody selling the fiscal half and the money half joined
in one decision. And no claim that we invented the one-cent probe, because it is sold metered and it
is written into the SPEI rules.
