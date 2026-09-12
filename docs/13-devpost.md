# 13. Devpost submission copy

Written at M3 while awake, pasted at M5. Submission goes to hackmty-26.devpost.com.

**A draft is submitted at M4 and edited until the deadline.** That is the cheapest disaster
insurance available and it removes the 07:50 panic entirely.

Owner: Patricio (`garzario`), drafted for the team to validate. Reviewer: Fabricio
(`FabriBanda`). Issues #56 and #76. Due M3, draft submitted at M4.

Everything below is submission copy, ready to paste. Each narrative field carries an English block
and then a Spanish block, which is how a bilingual Devpost entry is normally written and what the
judges at a Monterrey event will actually read. **Cells marked `TODO` are submitted as a TODO rather
than as a guess**, and nothing here claims a partner, a statistic or an integration this repository
cannot back with a file.

The Spanish here is written with accents, because it is prose on a public page. The spoken pitch in
`docs/11-pitch.md` is ASCII with no accents, which is the convention every Spanish string inside
this repository follows. Both are deliberate.

## Project name and tagline

**Name:** SentryOne

**Tagline, English (76 characters):**

> Stop a fiscally toxic or misdirected supplier payment before the SPEI leaves

**Tagline, Spanish (97 characters):**

> El último control antes de un SPEI irreversible: lista 69-B, CLABE y CEP al momento de pagar

## Elevator pitch, the short field

**EN**

> SentryOne is the check that runs in the minutes before a Mexican SMB pays its suppliers. It joins
> three things nobody joins at that moment: the company's own CFDI invoice ledger, the SAT's
> official Article 69-B list, and the receipt Banxico signs for every SPEI. Each payment comes back
> hold, verify or release, with the evidence on screen and a person deciding. Six deterministic
> controls, no language model in the decision, and the whole engine runs offline in a unit test.

**ES**

> SentryOne es el control que corre en los minutos antes de que una PyME mexicana le pague a sus
> proveedores. Une tres cosas que nadie une en ese momento: el catálogo de CFDI de la propia
> empresa, la lista oficial del artículo 69-B del SAT y el comprobante que Banxico firma por cada
> SPEI. Cada pago regresa como retener, verificar o liberar, con la evidencia en pantalla y con una
> persona decidiendo. Seis controles deterministas, ningún modelo de lenguaje en la decisión, y todo
> el motor corre sin red dentro de una prueba unitaria.

## Inspiration

**EN**

> Two things are true about paying a supplier in Mexico, and neither of them can be undone.
>
> If the SAT publishes that supplier on the Article 69-B list, the operations covered by its
> invoices "no producen ni produjeron efecto fiscal alguno". The past tense is the whole problem:
> deductions and credited IVA you already took are undone, not merely blocked going forward, and you
> get thirty days from the publication to prove the operation was real or file a corrective return.
> The exposure is created by a publication that happens after the money is gone. The list moved
> thirty-three times in the twelve months to July 2026, about once every eleven days.
>
> And if the destination account is wrong, there is nothing to reverse: an accepted transfer order
> is firme, irrevocable, exigible y oponible frente a terceros under article 11 of the Ley de
> Sistemas de Pagos. A SPEI is not a card payment. There is no chargeback.
>
> The person who lives with both is not a fraud analyst. She is the only administrative clerk at a
> 28-person metalworking shop in Apodaca, Nuevo Leon, who on Thursday sends between seventy and a
> hundred and ten transfers before the bank cutoff with a spreadsheet, WhatsApp and the bank portal.
> No ERP, so no supplier validation module, no maker-checker, no second pair of eyes.
>
> The Article 69-B check is public, free and takes a minute. Nobody in that profile runs it weekly,
> because the cadence is the hard part and not the check.

**ES**

> Dos cosas son ciertas cuando le pagas a un proveedor en México, y ninguna se deshace.
>
> Si el SAT publica a ese proveedor en la lista del artículo 69-B, las operaciones amparadas por sus
> comprobantes "no producen ni produjeron efecto fiscal alguno". El tiempo pasado es todo el
> problema: las deducciones y el IVA acreditado que ya tomaste se anulan, no se bloquean hacia
> adelante, y tienes treinta días desde la publicación para demostrar que la operación existió o
> corregir con declaraciones complementarias. La exposición la crea una publicación que ocurre
> después de que el dinero ya salió. La lista cambió treinta y tres veces en los doce meses a julio
> de 2026, alrededor de una cada once días.
>
> Y si la cuenta destino está mal, no hay nada que revertir: una orden de transferencia aceptada es
> firme, irrevocable, exigible y oponible frente a terceros, según el artículo 11 de la Ley de
> Sistemas de Pagos. Un SPEI no es un pago con tarjeta. No hay contracargo.
>
> Quien vive con las dos no es una analista de fraude. Es la única persona de administración de un
> taller metalmecánico de veintiocho empleados en Apodaca, Nuevo León, que los jueves manda entre
> setenta y ciento diez transferencias antes del corte del banco con una hoja de cálculo, WhatsApp y
> el portal bancario. Sin ERP, así que no hay módulo de validación de proveedores, no hay doble
> firma y no hay segundo par de ojos.
>
> La consulta del 69-B es pública, gratuita y toma un minuto. Nadie con ese perfil la corre cada
> semana, porque la parte difícil es la cadencia, no la consulta.

## What it does

**EN**

> - **Turns the weekly payment run into a triaged list.** Every instruction comes back hold, verify
>   or release, sorted by pesos at risk instead of alphabetically, with the worst finding named on
>   the screen.
> - **Runs six independent controls on every payment**, and accounts for all six: the Article 69-B
>   cross-check with a retroactive sweep, CLABE forensics, duplicate invoices, supplier behaviour
>   drift, beneficiary verification against a Banxico-signed CEP, and reconciliation against the
>   bank mirror. A control that did not run says what was missing, so silence can never be read as a
>   clean payment.
> - **Quantifies the retroactive fiscal exposure when the SAT publishes a new list version**, by
>   replaying the company's own append-only event ledger: which invoices were already paid, the
>   deducted base, and the ISR and IVA at risk per newly listed supplier.
> - **Establishes that a bank account really belongs to a supplier before the first payment.** A
>   person sends a one-cent SPEI from the company's own bank, and SentryOne reads the receipt Banxico
>   signs for it, keeps the XML byte-exact, and compares the account holder name with the legal name
>   on the invoice being settled.
> - **Calls the supplier when a new account needs confirming.** A Spanish-speaking voice agent rings
>   them through the telephone network, speaks only the last four digits of the account, promises
>   nothing, accuses nobody, asks for no data, and returns a transcript that a deterministic parser
>   turns into confirmed, denied, no answer or unclear. The call never releases a payment.
> - **Accepts an instruction the way it actually arrives**, as a photograph of a handwritten note or
>   a voice note, and reads the eighteen digits out of it, then puts that reading straight back
>   through the check digit and the supplier's own payment history.
> - **Explains every finding in plain Spanish with its evidence**, including which digit positions
>   of an account differ from the one that supplier has actually been paid on.
> - **Reports its own accuracy on labelled cases the detector author never read**, per detector,
>   with the case count next to every rate.

**ES**

> - **Convierte la corrida de pagos semanal en una lista triada.** Cada instrucción regresa como
>   retener, verificar o liberar, ordenada por pesos en riesgo y no por orden alfabético, con el peor
>   hallazgo nombrado en pantalla.
> - **Corre seis controles independientes en cada pago**, y responde por los seis: cruce contra el
>   artículo 69-B con barrido retroactivo, forense de CLABE, facturas duplicadas, cambio de
>   comportamiento del proveedor, verificación del beneficiario contra un CEP firmado por Banxico y
>   conciliación contra el espejo bancario. Un control que no corrió dice qué le faltó, para que el
>   silencio nunca se lea como un pago limpio.
> - **Cuantifica la exposición fiscal retroactiva cuando el SAT publica una versión nueva de la
>   lista**, reproduciendo la bitácora de eventos de la propia empresa: qué facturas ya se pagaron,
>   la base deducida, y el ISR y el IVA en riesgo por proveedor recién listado.
> - **Comprueba que una cuenta bancaria de verdad es del proveedor antes del primer pago.** Una
>   persona manda un SPEI de un centavo desde el banco de la empresa, y SentryOne lee el comprobante
>   que Banxico firma, guarda el XML tal cual llegó y compara el nombre del titular contra la razón
>   social de la factura que se está pagando.
> - **Le llama al proveedor cuando hay que confirmar una cuenta nueva.** Un agente de voz en español
>   marca por teléfono, dice solamente los últimos cuatro dígitos de la cuenta, no promete nada, no
>   acusa a nadie, no pide ningún dato, y devuelve una transcripción que un analizador determinista
>   convierte en confirmado, negado, sin respuesta o poco claro. La llamada nunca libera un pago.
> - **Acepta la instrucción como de verdad llega**, como foto de una nota escrita a mano o como nota
>   de voz, le saca los dieciocho dígitos y vuelve a pasar esa lectura por el dígito verificador y
>   por el historial de pagos del proveedor.
> - **Explica cada hallazgo en español claro y con su evidencia**, incluyendo en qué posiciones
>   difieren los dígitos de la cuenta contra aquella en la que sí le hemos pagado a ese proveedor.
> - **Reporta su propia exactitud sobre casos etiquetados que quien escribió los detectores nunca
>   leyó**, detector por detector, con el número de casos junto a cada tasa.

## How we built it

**EN**

> A bun and TypeScript workspace monorepo, one runtime for the API, the tests, the seeder and the
> migrations.
>
> **The intelligence is `packages/core`**: the detectors and the expected-loss decision engine as
> pure, dependency-free functions over a single domain contract, with no network and no database
> access. That is why the whole engine runs in unit tests offline, and why a judge can read a
> detector beside its test file at the table. `packages/engine` holds the two adapters core cannot
> hold without a dependency cycle, and it exposes the six controls as one call that always accounts
> for every one of them in `ran` or in `skipped` with a named reason.
>
> **`packages/sat` is the Article 69-B half.** It parses the SAT's published listing by column name,
> keeps every dated situation of every taxpayer instead of one state each, and prices a publication
> by folding over the event ledger. The real list is committed: 14,234 rows, downloaded 2026-09-12,
> current to 2025-12-31, with its provenance in the adjacent README, because a control that only
> works while the SAT portal is reachable is a control that does not work.
>
> **`packages/cep` reads the Banxico receipt.** It parses the `SPEI_Tercero` document by child name,
> keeps the XML byte-exact, compares legal names with Mexican societary-type normalisation, and is
> deliberately honest about the signature: Banxico publishes no signing specification, so we run a
> candidate matrix and report `unconfirmed_scheme` rather than claim a seal we cannot prove.
>
> **`packages/extract` is the only package allowed to reach a model**, and it may only transcribe.
> **`packages/voice`** is the verification call: the script, the client and a deterministic outcome
> parser. **`packages/seed`** is one deterministic synthetic company from a committed seed.
>
> **`packages/consortium` is the only package that leaves the tenant.** It speaks the Snowflake SQL
> REST API with a key-pair JWT and no SDK, and what it sends is a salted hash of a supplier, a salted
> hash of an account, a bank code and one of four outcomes: no name, no amount, no account number. It
> reads back how many other tenants have paid the same pair and when it was first seen, and a script
> lands that aggregate in Postgres, so the decision reads a local snapshot and never the warehouse.
> The other tenants are synthetic, from the same committed seed, and every row says so.
>
> **`apps/api` is a thin Hono transport** with zod schemas derived from the domain types and no
> business logic in it. The spine is an append-only event ledger in Postgres, which is what makes the
> retroactive sweep a replay instead of a recomputation, and Timescale turns that ledger into a
> hypertable with a continuous aggregate while a plain Postgres 18 runs the identical SQL against the
> base table. **`apps/web`** is a static React build that reads the documented HTTP contract and
> updates from a Server-Sent Events stream, so an instruction sent from a judge's phone appears on
> the main screen without a reload.
>
> **The evaluation runs the same entry point intake runs.** Thirty labelled holdout cases go through
> `runControls`, `bun run eval` prints the confusion matrix per control and `GET /api/v1/metrics`
> serves the identical numbers, so the metrics screen is a report and not a claim.
>
> As of 2026-09-12 the suite is 1,039 tests across 60 files, and none of them opens a socket.

**ES**

> Un monorepo de workspaces en bun y TypeScript, con un solo runtime para la API, las pruebas, el
> generador de datos y las migraciones.
>
> **La inteligencia vive en `packages/core`**: los detectores y el motor de decisión por pérdida
> esperada como funciones puras, sin dependencias, sobre un único contrato de dominio, sin red y sin
> base de datos. Por eso todo el motor corre sin conexión dentro de pruebas unitarias, y por eso un
> juez puede leer un detector junto a su archivo de pruebas en la mesa. `packages/engine` guarda los
> dos adaptadores que core no puede tener sin crear un ciclo, y expone los seis controles en una sola
> llamada que siempre responde por todos: corrieron, o dicen exactamente qué les faltó.
>
> **`packages/sat` es la mitad del artículo 69-B.** Interpreta el listado publicado por nombre de
> columna, conserva cada situación fechada de cada contribuyente en lugar de un solo estado, y le
> pone precio a una publicación reproduciendo la bitácora de eventos. La lista real está en el
> repositorio: 14,234 registros, descargados el 2026-09-12, con información al 2025-12-31 y con su
> procedencia documentada, porque un control que solo funciona mientras el portal del SAT responde es
> un control que no funciona.
>
> **`packages/cep` lee el comprobante de Banxico.** Interpreta el documento `SPEI_Tercero` por nombre
> de nodo, conserva el XML byte por byte, compara razones sociales normalizando los tipos
> societarios mexicanos, y es deliberadamente honesto con la firma: Banxico no publica la
> especificación del sello, así que probamos una matriz de candidatos y reportamos
> `unconfirmed_scheme` en vez de afirmar una firma que no podemos demostrar.
>
> **`packages/extract` es el único paquete que puede llamar a un modelo**, y solo puede transcribir.
> **`packages/voice`** es la llamada de verificación: el guion, el cliente y un analizador
> determinista del resultado. **`packages/seed`** es una empresa sintética determinista desde una
> semilla fija.
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
> sin lógica de negocio adentro. La columna vertebral es una bitácora de eventos append-only en
> Postgres, que es lo que vuelve al barrido retroactivo una reproducción y no un recálculo, y
> Timescale convierte esa bitácora en hypertable con un agregado continuo, mientras que un Postgres
> 18 simple corre el mismo SQL contra la tabla base. **`apps/web`** es una build estática de React
> que lee el contrato HTTP documentado y se actualiza por Server-Sent Events, así que una instrucción
> enviada desde el teléfono de un juez aparece en la pantalla principal sin recargar.
>
> **La evaluación corre por el mismo punto de entrada que la captura.** Treinta casos etiquetados
> pasan por `runControls`, `bun run eval` imprime la matriz de confusión por control y
> `GET /api/v1/metrics` sirve los mismos números, así que la pantalla de métricas es un reporte y no
> una afirmación.
>
> Al 2026-09-12 la suite son 1,039 pruebas en 60 archivos, y ninguna abre un socket.

## Challenges we ran into

**EN**

> - **A detector registry that silently called nothing.** The first version discovered detector
>   modules by dynamic import and guessed each one's argument tuple from its arity. Once the real
>   detectors landed it called none of them, and the tests stayed green because they asserted on an
>   empty array. A payment run that reads "sin hallazgos" because the engine could not reach its own
>   detectors is the single worst failure this product can have. We replaced it with an explicit,
>   typed list, and now every control lands in `ran` or in `skipped` with a reason, so silence has to
>   explain itself.
> - **The SAT file is not the CSV anyone expects.** It is ISO-8859-1, not UTF-8, so a strict decode
>   throws and a lenient one silently corrupts every legal-name comparison downstream. Its row count
>   and its line count differ, because two records carry a bare newline inside a quoted name. 483
>   publication dates are unreadable in the DOF column and have a usable portal date beside them, 93
>   cells carry two dates in one field, and 91 RFCs are redacted by court order. We resolve columns
>   by name rather than position, report every unreadable row with its line number, and refuse to
>   drop one, because a row silently lost from a fiscal blacklist is the worst possible bug. The
>   download endpoint also answers over HTTP and times out over TLS, which is why the file is
>   committed and the live fetch is the option rather than the path.
> - **A signed XML is byte-exact, and Banxico documents no signing scheme.** The receipt is stored
>   exactly as served and never re-encoded. For the seal we could either claim a verification we
>   cannot prove, or build a candidate matrix over hashes, cadena variants and encodings and report
>   honestly that the scheme is unconfirmed. We chose the second, and the UI renders "firma no
>   verificada", never "firma inválida", because those are two different claims and only one of them
>   is ours to make.
> - **Server-Sent Events need a long-lived process**, which contradicted our deploy decision and
>   forced a written amendment: the web client stays a static build and the API moved next to the
>   database. We kept the original constraint that the API imports no runtime-specific modules, so
>   the function runtime stays a free fallback.
> - **Timescale has two rules you meet the hard way.** A continuous aggregate cannot be created
>   inside a transaction, so the Timescale DDL is its own conditionally applied migration; and a
>   hypertable's unique indexes must include the partitioning column, which decided our primary keys
>   one migration earlier.
> - **Using a model without letting it decide anything.** The response schema has six field names and
>   no field a verdict, a score or a recommendation could be written into: the model is not asked to
>   be good, it is given nowhere to put an opinion. A test reads the package's own source and fails
>   if a shipped module so much as names `decide`, `score` or `recommend`.
> - **A bare "sí" is not a confirmation.** On a verification call the agent first asks whether it is
>   even speaking to the supplier, so a "sí" that answers that question must never count as agreement
>   about a bank account. The comma is load bearing too: "no, es correcta" and "no es correcta" mean
>   opposite things. The parser scores clauses, only the supplier's turns, and ranks denial over
>   uncertainty over confirmation, because a false confirmation releases money that never comes back
>   and a false denial costs one telephone call.
> - **The Nessie sandbox has a shape you have to discover.** Dates with no time component, so
>   intraday ordering lives in our own ledger. Empty sub-collections that answer either `200 []` or a
>   404 with a bare string body. Amounts mixing integers and floats, identifiers mixing UUIDs with
>   ObjectIds, and a 403 that means the wrong path rather than a bad key. The shared enterprise pool
>   is contaminated by other teams, so we never compute on it.

**ES**

> - **Un registro de detectores que no llamaba a ninguno.** La primera versión descubría los módulos
>   por importación dinámica y adivinaba los argumentos de cada uno por su aridad. Cuando llegaron
>   los detectores de verdad no llamaba a ninguno, y las pruebas seguían en verde porque afirmaban
>   sobre un arreglo vacío. Una corrida que dice "sin hallazgos" porque el motor no alcanzó a sus
>   propios detectores es la peor falla posible de este producto. Lo reemplazamos por una lista
>   explícita y tipada, y ahora cada control cae en `ran` o en `skipped` con su razón: el silencio
>   tiene que explicarse.
> - **El archivo del SAT no es el CSV que cualquiera espera.** Es ISO-8859-1 y no UTF-8, así que una
>   decodificación estricta truena y una permisiva corrompe en silencio toda comparación de razones
>   sociales. Su número de filas y su número de líneas no coinciden, porque dos registros traen un
>   salto de línea dentro de un nombre entrecomillado. 483 fechas de publicación son ilegibles en la
>   columna del DOF y traen al lado una fecha de portal usable, 93 celdas cargan dos fechas en un solo
>   campo, y 91 RFC están tachados por orden judicial. Resolvemos columnas por nombre y no por
>   posición, reportamos cada fila ilegible con su número de línea, y nos negamos a tirar una sola,
>   porque una fila perdida en silencio de una lista negra fiscal es el peor error imaginable. Además
>   el endpoint de descarga responde por HTTP y expira por TLS, que es la razón por la que el archivo
>   está en el repositorio y la descarga en vivo es la opción y no el camino.
> - **Un XML firmado es byte por byte, y Banxico no documenta el esquema de firma.** El comprobante se
>   guarda exactamente como llegó y nunca se recodifica. Para el sello podíamos afirmar una
>   verificación que no podemos demostrar, o construir una matriz de candidatos sobre hashes,
>   variantes de cadena y codificaciones y reportar con honestidad que el esquema no está confirmado.
>   Elegimos lo segundo, y la interfaz dice "firma no verificada" y nunca "firma inválida", porque son
>   dos afirmaciones distintas y solo una nos toca a nosotros.
> - **Server-Sent Events necesita un proceso vivo**, lo que contradijo nuestra decisión de despliegue
>   y obligó a una enmienda escrita: el cliente web se queda estático y la API se mudó junto a la base
>   de datos. Mantuvimos la restricción original de que la API no importa módulos específicos de
>   runtime, así que el runtime de funciones sigue siendo un respaldo gratis.
> - **Timescale tiene dos reglas que se aprenden por las malas.** Un agregado continuo no se puede
>   crear dentro de una transacción, así que el DDL de Timescale es su propia migración condicional; y
>   los índices únicos de una hypertable tienen que incluir la columna de particionado, lo cual
>   decidió nuestras llaves primarias una migración antes.
> - **Usar un modelo sin dejarlo decidir nada.** El esquema de respuesta tiene seis campos y ninguno
>   donde quepa un veredicto, una calificación o una recomendación: al modelo no se le pide ser bueno,
>   se le quita dónde poner una opinión. Una prueba lee el código fuente del propio paquete y falla si
>   un módulo publicado siquiera menciona `decide`, `score` o `recommend`.
> - **Un "sí" pelón no es una confirmación.** En una llamada de verificación el agente pregunta
>   primero si está hablando con el proveedor, así que el "sí" que contesta eso jamás puede contar
>   como acuerdo sobre una cuenta bancaria. La coma también carga peso: "no, es correcta" y "no es
>   correcta" significan cosas opuestas. El analizador califica cláusulas, solo de los turnos del
>   proveedor, y ordena negación sobre duda sobre confirmación, porque una confirmación falsa libera
>   dinero que no regresa y una negación falsa cuesta una llamada.
> - **El sandbox de Nessie tiene una forma que hay que descubrir.** Fechas sin hora, así que el orden
>   intradía vive en nuestra propia bitácora. Subcolecciones vacías que contestan `200 []` o un 404
>   con un string pelón. Montos que mezclan enteros y flotantes, identificadores que mezclan UUID con
>   ObjectId, y un 403 que significa ruta equivocada y no llave inválida. El pool empresarial
>   compartido está contaminado por otros equipos, así que nunca calculamos sobre él.

## Accomplishments that we are proud of

**EN**

> - **The real SAT Article 69-B list works with no network.** A judge types any RFC they like into
>   the lookup box and the answer comes from the committed 14,234-row file, parsed by a loader that
>   reports what it cannot read instead of dropping it.
> - **Every one of the six controls has to account for itself.** `ran` plus `skipped` always equals
>   six, and a skip names what was missing. We found the bug where that was not true, and we found it
>   before the demo instead of during it.
> - **There is no language model in the decision, and it is a test rather than a promise.** The only
>   package allowed to reach a model may only transcribe, and a test reads its source to prove it.
> - **A voice agent we would be comfortable having called us.** It speaks four digits of an account
>   and never eighteen, it promises no payment, it accuses nobody, it asks for no data, and no
>   outcome it returns can release money on its own.
> - **The evaluation is blind by construction, and we published the parts that disagree with us.**
>   The person who writes the labelled cases does not write the detectors and does not open that
>   folder until the code is merged, and the git history is the evidence that the separation held. On
>   thirty labelled cases the engine scores 85.0 percent precision, 81.0 percent recall and a 1.9
>   percent false-positive rate, and chooses the labelled action on 28 of the 30. Every mismatch in
>   that table is one of four documented disagreements about how severe a finding is or whether it is
>   provable, not a control that failed to fire and not a control that fired on a clean payment. All
>   four are left in the table with both arguments written down, because a case set edited until it
>   agrees measures nothing.
> - **Real and synthetic never touch.** Real RFCs live only in a read-only lookup; the simulated
>   publication throws on any RFC without the synthetic prefix. That rule from our own architecture
>   decision record is enforced in code, not in a convention someone remembers.
> - **Every screen has all four of its states, and a test says so.** Loading, empty, error and
>   content are designed rather than discovered, a payment that passes all six controls says that
>   out loud instead of showing a bare badge, and the build fails when a screen ships with a happy
>   path and nothing else.

**ES**

> - **La lista real del artículo 69-B funciona sin red.** Un juez escribe el RFC que quiera en el
>   buscador y la respuesta sale del archivo de 14,234 registros que está en el repositorio, leído por
>   un cargador que reporta lo que no puede interpretar en lugar de tirarlo.
> - **Cada uno de los seis controles tiene que responder por sí mismo.** `ran` más `skipped` siempre
>   da seis, y un control saltado dice qué le faltó. Encontramos el error donde eso no era cierto, y
>   lo encontramos antes del demo y no durante.
> - **No hay modelo de lenguaje en la decisión, y eso es una prueba y no una promesa.** El único
>   paquete que puede llamar a un modelo solo puede transcribir, y una prueba lee su código para
>   demostrarlo.
> - **Un agente de voz que nos gustaría que nos hubiera llamado a nosotros.** Dice cuatro dígitos de
>   una cuenta y nunca dieciocho, no promete ningún pago, no acusa a nadie, no pide ningún dato, y
>   ningún resultado suyo libera dinero por sí solo.
> - **La evaluación es ciega por construcción, y publicamos las partes en las que no nos da la
>   razón.** Quien escribe los casos etiquetados no escribe los detectores y no abre esa carpeta hasta
>   que el código está integrado, y el historial de git es la evidencia de que la separación se
>   sostuvo. Sobre treinta casos etiquetados el motor saca 85.0 por ciento de precisión, 81.0 por
>   ciento de recall y 1.9 por ciento de falsos positivos, y elige la acción etiquetada en 28 de los
>   30. Cada desacuerdo de esa tabla es uno de cuatro desacuerdos documentados sobre qué tan grave es
>   un hallazgo o sobre si es comprobable, y no un control que se haya callado ni uno que haya
>   disparado sobre un pago limpio. Los cuatro se quedan en la tabla con los dos argumentos escritos,
>   porque un conjunto de casos editado hasta que coincide no mide nada.
> - **Lo real y lo sintético nunca se tocan.** Los RFC reales solo viven en una consulta de solo
>   lectura, y la publicación simulada truena con cualquier RFC que no tenga el prefijo sintético. Esa
>   regla de nuestro propio registro de decisiones está impuesta en el código y no en una convención
>   que alguien recuerde.
> - **Cada pantalla tiene sus cuatro estados, y una prueba lo verifica.** Carga, vacío, error y
>   contenido están diseñados y no descubiertos, un pago que pasa los seis controles lo dice en voz
>   alta en lugar de mostrar una insignia pelona, y la build falla cuando una pantalla se publica con
>   el camino feliz y nada más.

## What we learned

**EN**

> - **Keeping the intelligence free of IO is not a style preference.** It is what made the retroactive
>   sweep, the blind evaluation and an offline demo the same code path.
> - **The hard part of a compliance check is never the check.** It is the cadence and the moment. A
>   control that runs at supplier onboarding protects nothing against a list published two years
>   later, and a control that runs after settlement is a post-mortem.
> - **Silence is the dangerous failure.** An empty findings list and a clean payment look identical on
>   a screen, so the engine had to be rebuilt until it could tell them apart out loud.
> - **Say what you cannot prove.** Reporting "signature not verified" instead of claiming a valid seal
>   cost us a sentence and bought the only thing that matters when someone technical is reading.
> - **Written decisions beat conversations at 03:00.** Four people building in parallel on one
>   repository did not end up with four different products because the decisions were in files that
>   every person and every assistant reads before touching anything.

**ES**

> - **Mantener la inteligencia libre de entrada y salida no es una preferencia de estilo.** Es lo que
>   hizo que el barrido retroactivo, la evaluación ciega y un demo sin red fueran el mismo código.
> - **La parte difícil de un control de cumplimiento nunca es la consulta.** Es la cadencia y el
>   momento. Un control que corre al dar de alta al proveedor no protege nada contra una lista
>   publicada dos años después, y un control que corre después de la liquidación es una autopsia.
> - **El silencio es la falla peligrosa.** Una lista de hallazgos vacía y un pago limpio se ven igual
>   en pantalla, así que el motor se rehizo hasta que pudo distinguirlos en voz alta.
> - **Decir lo que no puedes demostrar.** Reportar "firma no verificada" en vez de afirmar un sello
>   válido nos costó una frase y nos compró lo único que importa cuando quien lee es técnico.
> - **Las decisiones escritas le ganan a las conversaciones de las 3 de la mañana.** Cuatro personas
>   construyendo en paralelo sobre un repositorio no terminaron con cuatro productos distintos porque
>   las decisiones estaban en archivos que cada persona y cada asistente lee antes de tocar nada.

## What is next

**EN**

> - **Measure the false-positive rate against real payment runs in real companies**, instead of
>   against our own hard negatives. That is the number that decides whether a clerk keeps the product
>   switched on, and it is the number we are asking for next.
> - **Ship the accounting-firm view**: one screen, thirty companies, because the firm already holds
>   every client's CFDI XML and files the corrective return when the thirty-day window opens.
> - **Track the list instead of snapshotting it.** Refresh from the SAT open-data endpoint on a
>   schedule, diff versions, and let the retroactive sweep fire on the difference rather than on a
>   button.
> - **Unattended beneficiary verification** for every account in the registry, and the supplier's own
>   side of it, so a verified account is established once and travels with the supplier instead of
>   being re-verified by each of its clients.
> - **On-device transcription**, which removes the only cost that scales with usage and the only data
>   transfer outside the perimeter at the same time.

**ES**

> - **Medir la tasa de falsos positivos contra corridas de pago reales en empresas reales**, en lugar
>   de contra nuestros propios negativos difíciles. Ese es el número que decide si una auxiliar deja
>   el producto encendido, y es el número que estamos pidiendo ahora.
> - **Entregar la vista para despachos contables**: una pantalla, treinta empresas, porque el despacho
>   ya tiene el XML de CFDI de cada cliente y es quien presenta la complementaria cuando se abre la
>   ventana de treinta días.
> - **Seguir la lista en vez de fotografiarla.** Actualizar desde el endpoint de datos abiertos del
>   SAT de forma programada, comparar versiones, y disparar el barrido retroactivo sobre la diferencia
>   y no sobre un botón.
> - **Verificación de beneficiario desatendida** para cada cuenta del registro, y el lado del propio
>   proveedor, para que una cuenta verificada se establezca una vez y viaje con el proveedor en lugar
>   de que cada cliente la vuelva a verificar.
> - **Transcripción en el dispositivo**, que elimina al mismo tiempo el único costo que escala con el
>   uso y la única transferencia de datos fuera del perímetro.

## Built with

Paste as tags. Every tag below is a dependency, a service or a data source this repository actually
uses; a tag for something that is not in the build is the cheapest lie a judge can catch.

`bun` `typescript` `hono` `zod` `postgres` `timescaledb` `react` `vite` `tailwindcss` `motion`
`biome` `server-sent-events` `gemini-api` `elevenlabs` `twilio` `nessie-api` `vercel` `vultr`
`tiger-data` `snowflake` `sat-69b` `banxico-cep` `cfdi`

Pinned versions, for the record: bun 1.3.11, typescript 5.9.3, hono 4.13.7, zod 4.5.4, postgres
3.4.9, react 19.2.8, vite 8.2.2, tailwindcss 4.3.3, motion 13.2.0, biome 2.5.12.

`recharts` is declared in `apps/web/package.json` and imported by nothing, so it is deliberately not
tagged. If the metrics screen starts using it before submission, add the tag then.

Drop `tiger-data` and `vultr` from the tag list if the submission ships on plain Postgres and a
different host. Drop `twilio` if the outbound call is demonstrated only through the browser widget.

## Prize categories to select

Never select a category we did not genuinely use. A claim a judge can falsify costs more than the
prize is worth. Each row carries the gate that has to be true at submission time, checked against
the deployed build and not against an intention.

| Category | Our honest use | Gate before selecting |
|---|---|---|
| Capital One challenge, track 3, Real-Time Anomaly and Security Sentinel | The whole product: anomaly detection over a payment ledger at the moment of an irreversible transfer | Always. This is the submission |
| Best Use of Gemini API | Transcription only, and provably only that: `packages/extract` reads a CLABE off a photograph and transcribes a voice note, sends one instruction string plus one file and no supplier, RFC, ledger or history, gets back a schema with nowhere to put an opinion, and hands the digits straight back to the deterministic check digit and the supplier's own payment record. `packages/extract/src/boundary.test.ts` reads the package source and fails if a shipped module names `decide`, `score` or `recommend` | `GEMINI_API_KEY` is set on the deployed API and a judge can send a photograph through the QR intake page and watch the CLABE come back. Without the key the endpoint answers 422 and says so, which is honest but is not a demonstration |
| Best Use of ElevenLabs | The verification call to the supplier: a Conversational AI agent speaking Mexican Spanish, placed through the Twilio integration, with a script that speaks four digits and never eighteen, promises nothing and accuses nobody, and a deterministic outcome parser that never releases a payment | The agent exists, a telephone number is connected, and one call has been placed and recorded. `TODO(garzario)`: paste the conversation id and the date into `docs/14-process.md`. If no live call has been placed, the browser-widget demonstration is the honest fallback and the copy says "browser agent" |
| Best Use of Tiger Data | The event ledger is a hypertable and the daily rollup the timeline reads is a continuous aggregate, applied conditionally so a plain Postgres runs the identical SQL against the base table | `0002_timescale.sql` and `0004_timescale_sentryone.sql` applied on the deployed database, and the aggregate actually read. If we are running on plain Postgres at submission time, do not select it. Issue #72 |
| Best Use of Snowflake API | The cross-tenant beneficiary network. `packages/consortium` speaks the Snowflake SQL REST API directly, key-pair JWT signed with WebCrypto and no SDK, and `SENTRYONE.CONSORTIUM.BENEFICIARY_EVENTS` holds a salted hash of a supplier, a salted hash of an account, a bank code, one of four outcomes and a date. No name, no amount, no account number. `consortium:pull` lands the aggregate in Postgres, so the decision reads a local snapshot and the warehouse is never on the hot path. The other tenants in the network are synthetic, generated from the committed seed, and every row carries `synthetic = true` | The account exists, `bun run consortium:seed`, `bun run consortium:push` and `bun run consortium:pull` have each run against it, `bun run doctor` prints the `snowflake` line green, and the copy says in its own words that the network of other tenants is synthetic. If the account does not exist at submission time, do not select it. Issue #164 |
| Best Use of Vultr | `apps/api` runs on a Vultr instance because the Server-Sent Events stream needs a long-lived process, with the database next to it | The deployed API URL in the README answers `/health` over HTTPS. Issue #44 |
| Best .Tech Domain Name | `sentryone.tech` is the product's only public address, and the name states what the product does: a centinela standing at the CEP, the receipt Banxico signs for every SPEI | The domain resolves to the production site. Issue #59. `TODO(garzario)`: ADR-0002 records SENTRYONE as one of the two merged finalist ideas and does not record how the name was built, so confirm that etymology line with the team before pasting it |

At M4, walk this table with the deployed build open and tick only what is live.

### Best Use of Snowflake API, the category copy

**EN**

> A supplier's first payment from this company has no history here, and it has months of history in
> every other company that already pays that supplier. That is the one signal a payer-side tool
> cannot get from its own ledger, so we built it as a separate cross-tenant warehouse on Snowflake
> rather than as another table in ours.
>
> `packages/consortium` speaks the SQL REST API directly: `POST /api/v2/statements` with a key-pair
> JWT we sign with WebCrypto, polling `GET /api/v2/statements/<handle>` on a `202`, no SDK and no new
> dependency. What a company contributes is four facts: a salted hash of the supplier RFC, a salted
> hash of the destination CLABE, the bank code those digits already state in public, and one of
> `verified`, `paid`, `mismatch` or `fraud_reported` with a date. No name, no amount, no account
> number, and no identity of the contributing company, because the tenant identifier is hashed too and
> is only ever counted. What a company reads back is an aggregate: how many other tenants have paid
> this exact pair, when it was first and last seen, how many fraud reports it carries. Never a row,
> and never for a pair the asking company does not already hold.
>
> The warehouse is deliberately not on the decision path. `consortium:pull` writes the aggregate into
> the same Postgres the ledger lives in, and the engine reads that snapshot as an argument, which is
> what keeps the decision deterministic, testable offline, and free of a warehouse resume in the
> middle of a clerk's payment run. Snowflake is where a network of companies belongs: cross-tenant by
> design, governed sharing when a real participant asks what we can see, its own credential and its
> own blast radius, and a batch columnar workload instead of an OLTP one.
>
> **One thing we say out loud.** There is one real tenant. The other tenants are synthetic, generated
> deterministically from the same committed seed as the rest of the demo, and every row in the table
> carries `synthetic = true`. The mechanism is real, the rows are real, the companies are not, and we
> would rather say that than let a judge discover it.

**ES**

> El primer pago a un proveedor no tiene historia en esta empresa, y tiene meses de historia en todas
> las demás empresas que ya le pagan. Esa es la única señal que una herramienta del lado del pagador
> no puede sacar de su propia contabilidad, así que la construimos como un almacén separado y
> multiempresa en Snowflake, y no como otra tabla en la nuestra.
>
> `packages/consortium` habla directo con la SQL REST API: `POST /api/v2/statements` con un JWT de par
> de llaves que firmamos con WebCrypto, y `GET /api/v2/statements/<handle>` cuando responde `202`, sin
> SDK y sin una dependencia nueva. Lo que una empresa aporta son cuatro datos: un hash con sal del RFC
> del proveedor, un hash con sal de la CLABE de destino, el código de banco que esos dígitos ya dicen
> en público, y uno de `verified`, `paid`, `mismatch` o `fraud_reported` con su fecha. Ningún nombre,
> ningún monto, ningún número de cuenta, y ninguna identidad de la empresa que escribió el renglón,
> porque el identificador de la empresa también va hasheado y solo se cuenta. Lo que una empresa lee
> de vuelta es un agregado: cuántas otras empresas han pagado exactamente ese par, cuándo se vio por
> primera y por última vez, cuántos reportes de fraude carga. Nunca un renglón, y nunca de un par que
> quien pregunta no tenga ya.
>
> El almacén está deliberadamente fuera de la ruta de la decisión. `consortium:pull` escribe el
> agregado en el mismo Postgres donde vive la bitácora, y el motor lee esa foto como un argumento, que
> es lo que mantiene la decisión determinista, probable sin red, y libre de esperar a que un warehouse
> se encienda en medio de la corrida de pagos de una persona. Snowflake es donde pertenece una red de
> empresas: multiempresa por diseño, con compartición gobernada cuando un participante real pregunte
> qué podemos ver, con su propia credencial y su propio radio de daño, y con una carga de trabajo
> columnar por lotes en lugar de transaccional.
>
> **Una cosa que decimos en voz alta.** Hay una sola empresa real. Las demás son sintéticas, generadas
> de forma determinista desde la misma semilla comprometida que el resto del demo, y cada renglón de
> la tabla lleva `synthetic = true`. El mecanismo es real, los renglones son reales, las empresas no,
> y preferimos decirlo nosotros antes de que un juez lo descubra.

## Links and attachments

| Field | Value |
|---|---|
| Repository | https://github.com/garzario/CapitalOneHackMTY |
| Live URL | `TODO(garzario)` from issues #44 and #59. Must load on a phone on cellular data before it is pasted |
| Demo video | `TODO(garzario)` from issue #73, hosted per the event's stated requirement, playable from a private browser window |
| Screenshots | Three stills from `assets/screenshots/`: the payment run with its verdict and alert rail, the finding panel with its evidence chips, and the sweep with its exposure counters. At least one must show the synthetic watermark |

## Team members to add

| Name | Role on this submission | Devpost handle |
|---|---|---|
| Patricio Garza | Engine, SAT, CEP, voice, architecture, submission | `TODO(garzario)` |
| Fabian | Data platform, API, deploy | `TODO(fabbyyyy)` |
| Adan | Synthetic data, evaluation, external evidence | `TODO(Apanawa)` |
| Fabricio | Product surface, narrative, market | `TODO(FabriBanda)` |

## Submission checklist

- [ ] Draft submitted at M4, not at M5
- [ ] All four teammates added and each confirmed they can see it
- [ ] Every category passed its gate, checked against the deployed build and not against an intention
- [ ] Video plays from the link in a private browser window
- [ ] Live URL loads on a phone on cellular data
- [ ] Repository is public and the README carries the live URL
- [ ] `bun test` re-run and the test count in "How we built it" refreshed, or the sentence cut
- [ ] Every number in this file still matches its source, including the SAT row count if the snapshot
      was refreshed
- [ ] No real personal data in any screenshot, and the synthetic watermark is visible in at least one
- [ ] Every mention of the consortium network says the other tenants are synthetic, in the field
      itself and not only in the repository
- [ ] Screenshot of the submission confirmation saved
