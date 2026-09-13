# Devpost fields, ready to paste

One heading per field of the Devpost submission form, in the order the form asks for them. Inside each
heading is one fenced block: select it, copy it, paste it. Nothing else in the block needs editing
except the three places that say `TODO`, and those are listed again at the end.

Spanish first, then English, inside the same block. The judges and the persona are Mexican, so the
Spanish is what gets read first; the English is there because the submission is also read in English.
Paste the whole block, both halves, into the one field.

The source of this copy, with the reasoning, the category gates and the source of every number, is
[`docs/13-devpost.md`](../13-devpost.md). If the two ever disagree, `docs/13` is right and this file is
stale. The ordered human steps are the comment on issue #76.

---

## Project name

```
SentryOne
```

## Tagline

Paste the Spanish one. It is 92 characters and fits. The English one is here in case the form is
filled in English.

```
El último control antes de un SPEI irreversible: lista 69-B, CLABE y CEP al momento de pagar
```

```
Stop a fiscally toxic or misdirected supplier payment before the SPEI leaves
```

## Elevator pitch

```
SentryOne es el control que corre en los minutos antes de que una PyME mexicana le pague a sus
proveedores. Une tres cosas que no se leen juntas en ese momento: el catálogo de CFDI de la propia
empresa, la lista oficial del artículo 69-B del SAT y el comprobante que Banxico firma por cada SPEI.
Cada línea de la corrida regresa con un nivel, confiable, precaución o alerta, con un estado, y con la
acción que el motor propone: retener, verificar o liberar, siempre con la evidencia en pantalla. Seis
controles deterministas, ningún modelo de lenguaje en la decisión, y todo el motor corre sin red
dentro de una prueba unitaria. Hay un asistente, y lee y propone: ejecuta una persona, con su nombre.

SentryOne is the check that runs in the minutes before a Mexican SMB pays its suppliers. It joins
three things that are not read together at that moment: the company's own CFDI invoice ledger, the
SAT's official Article 69-B list, and the receipt Banxico signs for every SPEI. Every line of the
run comes back with a level, confiable, precaucion or alerta, with a state, and with the action the
engine proposes: hold, verify or release, always with the evidence on screen. Six deterministic
controls, no language model in the decision, and the whole engine runs offline inside a unit test.
There is an assistant, and it reads and proposes: a person executes, with their name on it.
```

## Inspiration

```
Dos cosas son ciertas cuando le pagas a un proveedor en México, y ninguna se deshace.

Si el SAT publica a ese proveedor en la lista del artículo 69-B, las operaciones amparadas por sus
comprobantes no producen ni produjeron efecto fiscal alguno. El tiempo pasado es todo el problema: las
deducciones y el IVA acreditado que ya tomaste se anulan hacia atrás, no se bloquean hacia adelante.
De cada cien mil pesos de subtotal ya deducido se revierten cuarenta y seis mil entre ISR e IVA, y la
exposición la crea una publicación que ocurre después de que el dinero ya salió. La lista se movió en
33 fechas de publicación en los doce meses al 31 de julio de 2026, alrededor de una cada once días,
con 973 contribuyentes que pasaron a definitivo. Desde el 1 de enero de 2026 el artículo 49 Bis
arranca un reloj de treinta días naturales contra el comprador, y el sello digital que se restringe al
final de ese reloj es el del comprador.

Y si la cuenta destino está mal, no hay nada que revertir: una orden de transferencia aceptada es
firme, irrevocable, exigible y oponible frente a terceros, según el artículo 11 de la Ley de Sistemas
de Pagos. Un SPEI no es un pago con tarjeta. No hay contracargo, y de los pesos reclamados por fraude
en el primer trimestre de 2026 los bancos devolvieron el 24.3 por ciento.

Quien vive con las dos no es una analista de fraude. Es la única persona de administración de un taller
metalmecánico de veintiocho empleados en Apodaca, Nuevo León, y arriba de ella no hay tesorería. En la
corrida de referencia de nuestros datos sintéticos son 92 instrucciones de pago que liquidan 129 CFDI
en un jueves, con una hoja de cálculo, WhatsApp y el portal bancario. Sin ERP, así que no hay módulo
de validación de proveedores, no hay doble firma y no hay segundo par de ojos.

La consulta del 69-B es pública, gratuita y toma un minuto. La parte difícil nunca es la consulta: es
la cadencia y el momento. Un control que corre cuando diste de alta al proveedor no protege nada
contra una lista publicada dos años después.

---

Two things are true about paying a supplier in Mexico, and neither of them can be undone.

If the SAT publishes that supplier on the Article 69-B list, the operations covered by its invoices no
producen ni produjeron efecto fiscal alguno. The past tense is the whole problem: deductions and
credited IVA you already took are undone backwards, not merely blocked going forward. For every MXN
100,000 of subtotal already deducted, MXN 46,000 of tax effect reverses between ISR and IVA, and the
exposure is created by a publication that happens after the money is gone. The list moved across 33
publication dates in the twelve months to 31 July 2026, about one every eleven days, with 973
taxpayers moved to definitivo. Since 1 January 2026 article 49 Bis starts a thirty natural-day clock
against the buyer, and the digital seal restricted at the end of that clock is the buyer's own.

And if the destination account is wrong, there is nothing to reverse: an accepted transfer order is
firme, irrevocable, exigible y oponible frente a terceros under article 11 of the Ley de Sistemas de
Pagos. A SPEI is not a card payment. There is no chargeback, and of the pesos claimed for fraud in the
first quarter of 2026 the banks refunded 24.3 percent.

The person who lives with both is not a fraud analyst. She is the only administrative clerk at a
28-person metalworking shop in Apodaca, Nuevo Leon, with no treasury above her. In the reference run
of our synthetic data that is 92 payment instructions settling 129 CFDIs on one Thursday, with a
spreadsheet, WhatsApp and the bank portal. No ERP, so no supplier validation module, no maker-checker,
no second pair of eyes.

The Article 69-B check is public, free and takes a minute. The hard part is never the check: it is the
cadence and the moment. A control that runs when you onboarded the supplier protects nothing against a
list published two years later.
```

## What it does

```
- Convierte la corrida de pagos semanal en una lista triada. Cada línea trae su nivel, confiable,
  precaución o alerta, su estado, y la acción que el motor propone: retener, verificar o liberar.
  Ordenada por pesos en riesgo y no por orden alfabético, con el peor hallazgo nombrado en pantalla.
  Nunca un porcentaje: el nivel siempre llega con los hallazgos que lo produjeron debajo.
- Corre seis controles independientes en cada pago, y responde por los seis: cruce contra la lista
  oficial del artículo 69-B con todas sus versiones, forense de CLABE con dígito verificador, banco
  y plaza, facturas duplicadas, cambio de comportamiento del proveedor, verificación del
  beneficiario contra un CEP firmado por Banxico, y conciliación contra el espejo bancario. Un
  control que no corrió dice qué le faltó, para que el silencio nunca se lea como un pago limpio.
- Cuantifica la exposición fiscal retroactiva cuando el SAT publica una versión nueva de la lista,
  reproduciendo la bitácora de eventos de la propia empresa: qué facturas ya se pagaron, la base
  deducida, y el ISR y el IVA en riesgo. En la corrida de referencia el barrido llega a 878,592.59
  pesos de base y 404,152.59 de exposición, y vuelve a calificar las líneas pendientes que la
  publicación alcanza, así que una de ellas se mueve sola mientras nadie la está viendo.
- Comprueba que una cuenta bancaria de verdad es del proveedor antes del primer pago. Un centavo viaja
  dentro de la misma corrida, la clave de rastreo regresa del riel y no de un teclado, y SentryOne lee
  el comprobante que Banxico firma, guarda el XML tal cual llegó y compara el nombre del titular
  contra la razón social de la factura que se está pagando. El centavo no es nuestro invento: se vende
  medido y está escrito en las reglas del SPEI. Lo nuestro es la decisión que cuelga de su respuesta.
- Le llama al proveedor cuando hay que confirmar una cuenta nueva. Un agente de voz en español marca
  por teléfono, dice solamente los últimos cuatro dígitos de la cuenta, no promete nada, no acusa a
  nadie, no pide ningún dato, y devuelve una transcripción que un analizador determinista convierte en
  confirmado, negado, sin respuesta o poco claro. La llamada nunca libera un pago.
- Acepta la instrucción como de verdad llega. La auxiliar arrastra al asistente la captura de WhatsApp
  que ya recibió, el único modelo que hay transcribe, y la instrucción queda dada de alta con su nivel
  y su evidencia. Si pregunta por qué una línea está en rojo, el asistente contesta con las lecturas
  que hizo a la vista y termina en una propuesta con el cuerpo exacto de la petición y un botón. Nueve
  herramientas, todas de lectura: una que escriba no existe en el tipo.
- Consulta una red de beneficiarios entre empresas sin aprender de quién. Lo único que sale de una
  empresa es un hash con sal del RFC y de la CLABE, el código de banco, una de cuatro consecuencias y
  una fecha, y lo que regresa son cuentas de empresas y fechas, nunca un renglón de otra. La red que
  trae este repositorio es sintética y cada renglón viaja marcado como sintético.
- Entrega la corrida por un riel, y solo lo que ya tiene. Una persona confirma con su nombre, sale una
  línea por instrucción al monto y a la cuenta que esa instrucción dice, y regresan la clave de
  rastreo, el recibo y una constancia por línea. Lo que el motor detuvo se queda fuera con su razón
  escrita.
- Explica cada hallazgo en español claro y con su evidencia, incluyendo en qué posiciones difieren los
  dígitos de una cuenta contra aquella en la que sí le hemos pagado a ese proveedor, y qué plaza es
  cada una.
- Reporta su propia exactitud sobre casos etiquetados que quien escribió los detectores nunca leyó,
  detector por detector y nivel por nivel, con el número de casos junto a cada tasa.

---

- Turns the weekly payment run into a triaged list. Every line carries its level, confiable,
  precaucion or alerta, its state, and the action the engine proposes: hold, verify or release. Sorted
  by pesos at risk instead of alphabetically, with the worst finding named on the screen. Never a
  percentage: the level always arrives with the findings that produced it underneath.
- Runs six independent controls on every payment, and accounts for all six: the cross-check against
  the official Article 69-B list with all of its versions, CLABE forensics over the check digit, the
  bank and the plaza, duplicate invoices, supplier behaviour drift, beneficiary verification against
  a Banxico-signed CEP, and reconciliation against the bank mirror. A control that did not run says
  what was missing, so silence can never be read as a clean payment.
- Quantifies the retroactive fiscal exposure when the SAT publishes a new list version, by replaying
  the company's own append-only event ledger: which invoices were already paid, the deducted base, and
  the ISR and IVA at risk. On the reference run the sweep reaches MXN 878,592.59 of base and MXN
  404,152.59 of exposure, and it re-scores the pending lines the publication reaches, so one of them
  moves on its own while nobody is looking at it.
- Establishes that a bank account really belongs to a supplier before the first payment. One cent
  travels inside the same run, the clave de rastreo comes back from the rail rather than from a
  keyboard, and SentryOne reads the receipt Banxico signs for it, keeps the XML byte-exact, and
  compares the account holder name with the legal name on the invoice being settled. The cent is not
  our invention: it is sold metered and it is written into the SPEI rules. Ours is the decision hung
  on its answer.
- Calls the supplier when a new account needs confirming. A Spanish-speaking voice agent rings them
  through the telephone network, speaks only the last four digits of the account, promises nothing,
  accuses nobody, asks for no data, and returns a transcript that a deterministic parser turns into
  confirmed, denied, no answer or unclear. The call never releases a payment.
- Accepts an instruction the way it actually arrives. The clerk drags the WhatsApp screenshot she
  already received into the assistant, the only model in the product transcribes it, and the
  instruction lands with its level and its evidence. If she asks why a line is red, the assistant
  answers with the reads it performed in view and ends in a proposal carrying the exact request body
  and a button. Nine tools, all of them reads: a tool that writes does not exist in the type.
- Consults a cross-company beneficiary network without learning who paid whom. All that leaves a
  company is a salted hash of the RFC and of the CLABE, the bank code, one of four outcomes and a
  date, and what comes back are counts of companies and dates, never another company's row. The
  network in this repository is synthetic and every row travels flagged as synthetic.
- Sends the run through a rail, and only what it already holds. A person confirms with their name, one
  line leaves per instruction for exactly that instruction's amount to exactly the account it names,
  and the clave de rastreo, the receipt and a constancia per line come back. What the engine stopped
  stays out with its written reason.
- Explains every finding in plain Spanish with its evidence, including which digit positions of an
  account differ from the one that supplier has actually been paid on, and which plaza each one is.
- Reports its own accuracy on labelled cases the detector author never read, per detector and per
  level, with the case count next to every rate.
```

## How we built it

```
Un monorepo de workspaces en bun y TypeScript, con un solo runtime para la API, las pruebas, el
generador de datos y las migraciones. Doce paquetes y dos aplicaciones.

La inteligencia vive en packages/core: los detectores, el motor de decisión por pérdida esperada y las
dos funciones puras que derivan el nivel y el estado, sobre un único contrato de dominio, sin red y
sin base de datos. Por eso todo el motor corre sin conexión dentro de pruebas unitarias, y por eso un
juez puede leer un detector junto a su archivo de pruebas en la mesa. Ni el nivel ni el estado se
guardan en ninguna columna: un nivel almacenado puede contradecir a los hallazgos de los que salió, y
uno derivado no.

packages/sat es la mitad fiscal. Interpreta el listado publicado por nombre de columna, conserva cada
situación fechada de cada contribuyente en lugar de un solo estado, y le pone precio a una publicación
reproduciendo la bitácora. La lista real está en el repositorio: 14,234 registros, descargados el
2026-09-12, con información al 2025-12-31 y con su procedencia documentada, porque un control que solo
funciona mientras el portal del SAT responde es un control que no funciona. La segunda lista, la del
artículo 49 Bis, tiene su cargador y su ventana de treinta días escritos, y no barremos esa lista: el
SAT la publica como oficios del DOF y no como archivo, así que la consulta contesta que no está
cargada, con las cuentas y la liga, en vez de insinuar que revisó algo.

packages/cep lee el comprobante de Banxico. Interpreta el documento SPEI_Tercero por nombre de nodo,
conserva el XML byte por byte, compara razones sociales normalizando los tipos societarios mexicanos,
y es deliberadamente honesto con la firma: Banxico no publica la especificación del sello, así que
probamos una matriz de candidatos y reportamos que el esquema no está confirmado en vez de afirmar una
firma que no podemos demostrar.

packages/rail mueve dinero y nada más que lo que SentryOne ya tiene: el centavo de la prueba de
beneficiario, o el monto exacto de una instrucción que vive aquí, a la cuenta que esa instrucción
nombra. Tres rieles, y cada uno dice qué demuestra. packages/consortium habla con Snowflake por la API
REST de SQL y por nada más, y nunca desde la ruta caliente. packages/extract es el único paquete que
puede llamar a un modelo, y solo puede transcribir. packages/voice es la llamada de verificación: el
guion, el cliente y un analizador determinista del resultado. packages/constancia escribe el PDF a
mano, sin dependencia y sin navegador. packages/seed es una empresa sintética determinista desde una
semilla fija.

apps/api es transporte delgado en Hono, con esquemas zod derivados de los tipos de dominio y sin
lógica de negocio adentro. La columna vertebral es una bitácora append-only en Postgres, que es lo que
vuelve al barrido retroactivo una reproducción y no un recálculo, y Tiger Data convierte esa bitácora
en hypertable con un agregado continuo, mientras que un Postgres 18 simple corre el mismo SQL contra
la tabla base. Cada escritura lleva X-Actor, el nombre de quien la hizo. apps/web es una build
estática de React que lee el contrato HTTP documentado y se actualiza por Server-Sent Events, así que
una instrucción enviada desde el teléfono de un juez aparece en la pantalla principal sin recargar.

El asistente es lector y proponente. Nueve herramientas, todas GET, readOnly es el literal true y no
un booleano, así que una llamada que escriba no se puede construir. Ningún nivel, ninguna acción y
ningún número salen del modelo. Termina un turno con una propuesta como máximo, y la propuesta trae
campo por campo el cuerpo del endpoint que se va a llamar, así que la pantalla muestra lo que va a
pasar con las palabras de la petición.

La evaluación corre por el mismo punto de entrada que la captura. Los casos etiquetados pasan por
runControls, bun run eval imprime la matriz de confusión por control y por nivel, y GET
/api/v1/metrics sirve los mismos números, así que la pantalla de métricas es un reporte y no una
afirmación.

Al 2026-09-13 la suite son 2,912 pruebas en 150 archivos: 2,794 pasando, 118 saltadas y 0 fallando,
y ninguna abre un socket.

---

A bun and TypeScript workspace monorepo, one runtime for the API, the tests, the seeder and the
migrations. Twelve packages and two applications.

The intelligence is packages/core: the detectors, the expected-loss decision engine and the two pure
functions that derive the level and the state, over a single domain contract, with no network and no
database access. That is why the whole engine runs in unit tests offline, and why a judge can read a
detector beside its test file at the table. Neither the level nor the state is stored in any column: a
stored level can disagree with the findings it was computed from, and a derived one cannot.

packages/sat is the fiscal half. It parses the published listing by column name, keeps every dated
situation of every taxpayer instead of one state each, and prices a publication by folding over the
ledger. The real list is committed: 14,234 rows, downloaded 2026-09-12, current to 2025-12-31, with
its provenance in the adjacent README, because a control that only works while the SAT portal is
reachable is a control that does not work. The second list, article 49 Bis, has its loader and its
thirty-day window written, and we do not sweep that list: the SAT publishes it as DOF oficios rather
than as a file, so the lookup answers that it is not loaded, with the counts and the URL, instead of
implying it checked something.

packages/cep reads the Banxico receipt. It parses the SPEI_Tercero document by child name, keeps the
XML byte-exact, compares legal names with Mexican societary-type normalisation, and is deliberately
honest about the signature: Banxico publishes no signing specification, so we run a candidate matrix
and report that the scheme is unconfirmed rather than claim a seal we cannot prove.

packages/rail moves money and nothing but what SentryOne already holds: the cent of the beneficiary
probe, or the exact amount of an instruction that lives here, to the account that instruction names.
Three rails, and each one states what it proves. packages/consortium talks to Snowflake over the SQL
REST API and nothing else, and never from the hot path. packages/extract is the only package allowed
to reach a model, and it may only transcribe. packages/voice is the verification call: the script, the
client and a deterministic outcome parser. packages/constancia writes the PDF by hand, with no
dependency and no browser. packages/seed is one deterministic synthetic company from a committed seed.

apps/api is a thin Hono transport with zod schemas derived from the domain types and no business logic
in it. The spine is an append-only ledger in Postgres, which is what makes the retroactive sweep a
replay instead of a recomputation, and Tiger Data turns that ledger into a hypertable with a
continuous aggregate while a plain Postgres 18 runs the identical SQL against the base table. Every
write carries X-Actor, the name of whoever made it. apps/web is a static React build that reads the
documented HTTP contract and updates from a Server-Sent Events stream, so an instruction sent from a
judge's phone appears on the main screen without a reload.

The assistant is a reader and a proposer. Nine tools, all GET, readOnly is the literal true rather
than a boolean, so a tool call that writes cannot be constructed. No level, no action and no number
comes from the model. It ends a turn with at most one proposal, and the proposal carries field for
field the body of the endpoint that will be called, so the screen shows what is about to happen in the
words of the request itself.

The evaluation runs the same entry point intake runs. The labelled cases go through runControls, bun
run eval prints the confusion matrix per control and per level, and GET /api/v1/metrics serves the
identical numbers, so the metrics screen is a report and not a claim.

As of 2026-09-13 the suite is 2,912 tests across 150 files: 2,794 passing, 118 skipped and 0
failing, and none of them opens a socket.
```

## Challenges we ran into

```
- Un registro de detectores que no llamaba a ninguno. La primera versión descubría los módulos por
  importación dinámica y adivinaba los argumentos de cada uno por su aridad. Cuando llegaron los
  detectores de verdad no llamaba a ninguno, y las pruebas seguían en verde porque afirmaban sobre un
  arreglo vacío. Una corrida que dice sin hallazgos porque el motor no alcanzó a sus propios
  detectores es la peor falla posible de este producto. Lo reemplazamos por una lista explícita y
  tipada, y ahora cada control cae en corrió o en no corrió con su razón: el silencio tiene que
  explicarse.
- El archivo del SAT no es el CSV que cualquiera espera. Es ISO-8859-1 y no UTF-8, así que una
  decodificación estricta truena y una permisiva corrompe en silencio toda comparación de razones
  sociales. Su número de filas y su número de líneas no coinciden, porque dos registros traen un salto
  de línea dentro de un nombre entrecomillado. 483 fechas de publicación son ilegibles en la columna
  del DOF y traen al lado una fecha de portal usable, 93 celdas cargan dos fechas en un solo campo, y
  91 RFC están tachados por orden judicial. Resolvemos columnas por nombre y no por posición,
  reportamos cada fila ilegible con su número de línea, y nos negamos a tirar una sola, porque una
  fila perdida en silencio de una lista negra fiscal es el peor error imaginable.
- Una respuesta vacía de una red no es no consultada. La API REST de SQL de Snowflake devuelve todo
  como cadena, y una fecha como días desde la época y no como YYYY-MM-DD. El primer consortium:pull
  real leyó los 46 renglones y se saltó los 46, y escribió una foto vacía marcada como que la red sí
  había contestado. Eso es peor que no preguntar: todas las pantallas habrían dicho que la red nunca
  vio ninguna de esas cuentas, en una corrida donde 45 de los 46 pares están corroborados. Ahora la
  consulta formatea las dos fechas dentro del SQL, donde un revisor las ve, y el lector además
  entiende la forma de días desde la época. Las dos tienen prueba que falla sin el arreglo.
- Un nivel calculado en cuatro lugares es el mismo error con mecha más larga. El motor sabía la
  gravedad, la API sabía la acción, la web sabía el color y el respaldo sin conexión sabía una
  adivinanza escrita a mano. Cuando dos de esos orígenes discreparon sobre la razón social de un
  proveedor, un juez vio las dos en una sola pantalla. Ahora hay una sola función pura por cada valor
  y ninguna columna que lo guarde, y una prueba recorre todo apps/web/src para que el siguiente
  componente que salga a la red sin consultar el modo falle una prueba y no un demo.
- Un XML firmado es byte por byte, y Banxico no documenta el esquema de firma. El comprobante se
  guarda exactamente como llegó y nunca se recodifica. Para el sello podíamos afirmar una verificación
  que no podemos demostrar, o construir una matriz de candidatos sobre hashes, variantes de cadena y
  codificaciones y reportar con honestidad que el esquema no está confirmado. Elegimos lo segundo, y
  la interfaz dice sello no verificado y nunca sello inválido, porque son dos afirmaciones distintas y
  solo una nos toca a nosotros.
- Usar un modelo sin dejarlo decidir nada. El esquema de respuesta del extractor tiene seis campos y
  ninguno donde quepa un veredicto, una calificación o una recomendación: al modelo no se le pide ser
  bueno, se le quita dónde poner una opinión. Una prueba lee el código fuente del propio paquete y
  falla si un módulo publicado siquiera menciona decide, score o recommend. Y cuando llegó el
  asistente, la misma pregunta volvió más grande: la respuesta fue que las nueve herramientas son GET,
  que readOnly es el literal true, y que una propuesta se ejecuta con un clic de una persona y con su
  nombre en la bitácora.
- Un sí pelón no es una confirmación. En una llamada de verificación el agente pregunta primero si
  está hablando con el proveedor, así que el sí que contesta eso jamás puede contar como acuerdo sobre
  una cuenta bancaria. La coma también carga peso: no, es correcta y no es correcta significan cosas
  opuestas. El analizador califica cláusulas, solo de los turnos del proveedor, y ordena negación
  sobre duda sobre confirmación, porque una confirmación falsa libera dinero que no regresa y una
  negación falsa cuesta una llamada.
- Server-Sent Events necesita un proceso vivo, lo que contradijo nuestra decisión de despliegue y
  obligó a una enmienda escrita: el cliente web se queda estático en Vercel y la API se mudó a una
  instancia de Vultr junto a la base de datos, detrás de Caddy con TLS. Mantuvimos la restricción de
  que la API no importa módulos específicos de runtime. Y Tiger Data tiene dos reglas que se aprenden
  por las malas: un agregado continuo no se puede crear dentro de una transacción, y los índices
  únicos de una hypertable tienen que incluir la columna de particionado, lo cual decidió nuestras
  llaves primarias una migración antes.
- El sandbox de Nessie tiene una forma que hay que descubrir. Fechas sin hora, así que el orden
  intradía vive en nuestra propia bitácora. Subcolecciones vacías que contestan 200 con arreglo vacío
  o un 404 con un string pelón. Montos que mezclan enteros y flotantes, identificadores que mezclan
  UUID con ObjectId, y un 403 que significa ruta equivocada y no llave inválida. El pool empresarial
  compartido está contaminado por otros equipos, así que nunca calculamos sobre él.

---

- A detector registry that silently called nothing. The first version discovered detector modules by
  dynamic import and guessed each one's argument tuple from its arity. Once the real detectors landed
  it called none of them, and the tests stayed green because they asserted on an empty array. A
  payment run that reads sin hallazgos because the engine could not reach its own detectors is the
  single worst failure this product can have. We replaced it with an explicit, typed list, and now
  every control lands in ran or in skipped with a reason, so silence has to explain itself.
- The SAT file is not the CSV anyone expects. It is ISO-8859-1, not UTF-8, so a strict decode throws
  and a lenient one silently corrupts every legal-name comparison downstream. Its row count and its
  line count differ, because two records carry a bare newline inside a quoted name. 483 publication
  dates are unreadable in the DOF column and have a usable portal date beside them, 93 cells carry two
  dates in one field, and 91 RFCs are redacted by court order. We resolve columns by name rather than
  position, report every unreadable row with its line number, and refuse to drop one, because a row
  silently lost from a fiscal blacklist is the worst possible bug.
- An empty answer from a network is not not consulted. Snowflake's SQL REST API returns every value as
  a string, and a DATE as days since the epoch rather than as YYYY-MM-DD. The first real
  consortium:pull read all 46 rows and skipped all 46, then wrote an empty snapshot flagged as a
  network that had answered. That is worse than not asking: every screen would have said the network
  has never seen any of those accounts, on a run where 45 of the 46 pairs are corroborated. The query
  now formats both dates inside the SQL, where a reviewer sees them, and the reader also understands
  the epoch-day form. Both have a test that fails without the fix.
- A level computed in four places is the same bug with a longer fuse. The engine knew the severity,
  the API knew the action, the web knew the colour, and the offline fallback knew a hand-written
  guess. When two of those sources disagreed about a supplier's legal name, a judge saw both on one
  screen. There is now one pure function per value and no column that stores either, and a test walks
  every source file in apps/web/src so the next component that reaches the network without consulting
  the mode fails a test rather than a demo.
- A signed XML is byte-exact, and Banxico documents no signing scheme. The receipt is stored exactly
  as served and never re-encoded. For the seal we could either claim a verification we cannot prove,
  or build a candidate matrix over hashes, cadena variants and encodings and report honestly that the
  scheme is unconfirmed. We chose the second, and the UI renders sello no verificado, never sello
  invalido, because those are two different claims and only one of them is ours to make.
- Using a model without letting it decide anything. The extractor's response schema has six field
  names and no field a verdict, a score or a recommendation could be written into: the model is not
  asked to be good, it is given nowhere to put an opinion. A test reads the package's own source and
  fails if a shipped module so much as names decide, score or recommend. And when the assistant
  arrived the same question came back larger: the answer was that all nine tools are GETs, that
  readOnly is the literal true, and that a proposal executes on a person's click with their name in
  the ledger.
- A bare si is not a confirmation. On a verification call the agent first asks whether it is even
  speaking to the supplier, so a si that answers that question must never count as agreement about a
  bank account. The comma is load bearing too: no, es correcta and no es correcta mean opposite
  things. The parser scores clauses, only the supplier's turns, and ranks denial over uncertainty over
  confirmation, because a false confirmation releases money that never comes back and a false denial
  costs one telephone call.
- Server-Sent Events need a long-lived process, which contradicted our deploy decision and forced a
  written amendment: the web client stays a static build on Vercel and the API moved to a Vultr
  instance next to the database, behind Caddy with TLS. We kept the constraint that the API imports no
  runtime-specific modules. And Tiger Data has two rules you meet the hard way: a continuous aggregate
  cannot be created inside a transaction, and a hypertable's unique indexes must include the
  partitioning column, which decided our primary keys one migration earlier.
- The Nessie sandbox has a shape you have to discover. Dates with no time component, so intraday
  ordering lives in our own ledger. Empty sub-collections that answer either 200 with an empty array
  or a 404 with a bare string body. Amounts mixing integers and floats, identifiers mixing UUIDs with
  ObjectIds, and a 403 that means the wrong path rather than a bad key. The shared enterprise pool is
  contaminated by other teams, so we never compute on it.
```

## Accomplishments that we are proud of

```
- La lista real del artículo 69-B funciona sin red. Un juez escribe el RFC que quiera en el buscador y
  la respuesta sale del archivo de 14,234 registros que está en el repositorio, leído por un cargador
  que reporta lo que no puede interpretar en lugar de tirarlo.
- Cada uno de los seis controles tiene que responder por sí mismo. Corrió más no corrió siempre da
  seis, y un control saltado dice qué le faltó. Encontramos el error donde eso no era cierto, y lo
  encontramos antes del demo y no durante.
- No hay modelo de lenguaje en la decisión, y eso es una prueba y no una promesa. El único paquete que
  puede llamar a un modelo solo puede transcribir, y una prueba lee su código para demostrarlo. El
  asistente que sí habla con un modelo tiene nueve herramientas de lectura y ninguna forma de
  escribir, y ninguna propuesta se ejecuta sin el clic y el nombre de una persona.
- Un nivel que nunca se despega de su evidencia. Tres niveles y tres estados, cada uno derivado por
  una función pura con una prueba por renglón de la tabla de reglas, y ninguna columna que los guarde.
  Sin porcentajes y sin calificaciones, porque nadie puede garantizar una transferencia que no se
  puede recuperar.
- Cinco integraciones corrieron contra el proveedor de verdad, no contra un doble. Cinco llamadas
  telefónicas de verificación con sus identificadores de conversación, una imagen por Gemini, una
  escritura en el espejo bancario, la prueba de un centavo sobre ese mismo espejo, y una corrida
  completa de 86 líneas por 1,388,920.90 pesos entregada en el espejo el 2026-09-13, con 6 líneas que
  no se movieron porque el motor las tiene detenidas y nadie firmó una liberación.
- La red entre empresas se sembró, se empujó y se leyó contra una cuenta real de Snowflake, con 46
  pares hasheados en la foto local, y la decisión la sigue leyendo sin tocar el almacén. Sin la
  bandera prendida el producto dice que la red no fue consultada, y no se degrada en silencio.
- La evaluación no se editó para que nos diera la razón, y publicamos las partes en las que no nos
  la da. Ningún caso del conjunto etiquetado se cambió para que un control pasara, y las etiquetas
  salen de nuestro registro de decisiones y de los tipos del dominio y no de leer el código de los
  controles, que es más débil que escribirlas a ciegas y es lo que de verdad ocurrió. Sobre treinta
  y cinco casos etiquetados el motor saca 87.0 por ciento de precisión, 83.3 por ciento de recall y
  1.6 por ciento de falsos positivos, elige la acción etiquetada en 33 de los 35, y leído como lo
  lee una auxiliar en pantalla, los doce pagos que debían salir confiables salieron confiables. Cada
  desacuerdo de esa tabla es uno de cuatro desacuerdos documentados sobre qué tan grave es un
  hallazgo o sobre si es comprobable, y no un control que se haya callado ni uno que haya disparado
  sobre un pago limpio. Los desacuerdos se quedan en la tabla con los dos argumentos escritos,
  porque un conjunto de casos editado hasta que coincide no mide nada.
- Lo real y lo sintético nunca se tocan. Los RFC reales solo viven en una consulta de solo lectura, y
  la publicación simulada truena con cualquier RFC que no tenga el prefijo sintético. Esa regla de
  nuestro propio registro de decisiones está impuesta en el código y no en una convención que alguien
  recuerde.
- Cada pantalla tiene sus cuatro estados, y una prueba lo verifica. Carga, vacío, error y contenido
  están diseñados y no descubiertos, un pago que pasa los seis controles lo dice en voz alta en lugar
  de mostrar una insignia pelona, y la build falla cuando una pantalla se publica con el camino feliz
  y nada más.

---

- The real SAT Article 69-B list works with no network. A judge types any RFC they like into the
  lookup box and the answer comes from the committed 14,234-row file, parsed by a loader that reports
  what it cannot read instead of dropping it.
- Every one of the six controls has to account for itself. Ran plus skipped always equals six, and a
  skip names what was missing. We found the bug where that was not true, and we found it before the
  demo instead of during it.
- There is no language model in the decision, and it is a test rather than a promise. The only package
  allowed to reach a model may only transcribe, and a test reads its source to prove it. The assistant
  that does talk to a model has nine read tools and no way to write, and no proposal executes without
  a person's click and a person's name.
- A level that never comes unstuck from its evidence. Three levels and three states, each derived by a
  pure function with a test per row of the rule table, and no column that stores either. No
  percentages and no scores, because nobody can guarantee a transfer that cannot be recalled.
- Five integrations ran against the real provider, not against a double. Five outbound verification
  calls with their conversation ids, one image through Gemini, a write on the bank mirror, the one-cent
  probe on that same mirror, and one complete run of 86 lines for MXN 1,388,920.90 executed on the
  mirror on 2026-09-13, with 6 lines that did not move because the engine is holding them and nobody
  signed a release.
- The cross-company network was seeded, pushed and read against a real Snowflake account, with 46
  hashed pairs landing in the local snapshot, and the decision still reads it without touching the
  warehouse. With the flag off the product says the network was not consulted rather than degrading
  silently.
- The evaluation was not edited until it agreed with us, and we published the parts that disagree.
  No case in the labelled set was changed to make a control pass, and the labels come from our own
  decision record and the domain types rather than from reading the control source, which is weaker
  than writing them blind and is what actually happened. On thirty-five labelled cases the engine
  scores 87.0 percent precision, 83.3 percent recall and a 1.6 percent false-positive rate, chooses
  the labelled action on 33 of the 35, and read the way a clerk reads the screen, twelve of the
  twelve payments that should have come out confiable did. Every mismatch in that table is one of
  four documented disagreements about how severe a finding is or whether it is provable, not a
  control that failed to fire and not a control that fired on a clean payment. The disagreements are
  left in the table with both arguments written down, because a case set edited until it agrees
  measures nothing.
- Real and synthetic never touch. Real RFCs live only in a read-only lookup; the simulated publication
  throws on any RFC without the synthetic prefix. That rule from our own architecture decision record
  is enforced in code, not in a convention someone remembers.
- Every screen has all four of its states, and a test says so. Loading, empty, error and content are
  designed rather than discovered, a payment that passes all six controls says that out loud instead
  of showing a bare badge, and the build fails when a screen ships with a happy path and nothing else.
```

## What we learned

```
- Mantener la inteligencia libre de entrada y salida no es una preferencia de estilo. Es lo que hizo
  que el barrido retroactivo, la evaluación ciega y un demo sin red fueran el mismo código.
- La parte difícil de un control de cumplimiento nunca es la consulta. Es la cadencia y el momento. Un
  control que corre al dar de alta al proveedor no protege nada contra una lista publicada dos años
  después, y un control que corre después de la liquidación es una autopsia.
- El silencio es la falla peligrosa, y una respuesta vacía es un silencio disfrazado. Una lista de
  hallazgos vacía y un pago limpio se ven igual en pantalla; una red que contestó cero y una red que
  no se consultó también. El motor se rehizo hasta que pudo distinguir los dos pares en voz alta.
- Un nivel sin evidencia debajo no es algo que este producto muestre. Y una cifra que no está
  calibrada no se imprime junto al nombre de un proveedor, porque invita la única pregunta que el
  motor no puede contestar.
- Decir lo que no puedes demostrar. Reportar sello no verificado en vez de afirmar un sello válido nos
  costó una frase y nos compró lo único que importa cuando quien lee es técnico.
- Lo que vale no son los minutos, es la pérdida que no ocurrió. Se lo dijimos a tres jueces en minutos
  y no les importó, con razón: el valor de este producto se dice en pesos que no salieron.
- Las decisiones escritas le ganan a las conversaciones de las 3 de la mañana. Cuatro personas
  construyendo en paralelo sobre un repositorio no terminaron con cuatro productos distintos porque
  las decisiones estaban en archivos que cada persona lee antes de tocar nada.

---

- Keeping the intelligence free of IO is not a style preference. It is what made the retroactive
  sweep, the blind evaluation and an offline demo the same code path.
- The hard part of a compliance check is never the check. It is the cadence and the moment. A control
  that runs at supplier onboarding protects nothing against a list published two years later, and a
  control that runs after settlement is a post-mortem.
- Silence is the dangerous failure, and an empty answer is silence in disguise. An empty findings list
  and a clean payment look identical on a screen; so do a network that answered zero and a network
  nobody asked. The engine was rebuilt until it could tell both pairs apart out loud.
- A level with no evidence under it is not something this product shows. And an uncalibrated figure
  does not get printed next to a supplier's name, because it invites the one question the engine
  cannot answer.
- Say what you cannot prove. Reporting sello no verificado instead of claiming a valid seal cost us a
  sentence and bought the only thing that matters when someone technical is reading.
- The value is not the minutes, it is the loss that did not happen. We said it in minutes to three
  judges and they did not care, and they were right: the value of this product is said in pesos that
  did not leave.
- Written decisions beat conversations at 03:00. Four people building in parallel on one repository
  did not end up with four different products because the decisions were in files that every person
  reads before touching anything.
```

## What is next for SentryOne

```
- Medir la tasa de falsos positivos contra corridas de pago reales en empresas reales, en lugar de
  contra nuestros propios negativos difíciles. Ese es el número que decide si una auxiliar deja el
  producto encendido, y es el número que estamos pidiendo. Diez corridas en modo sombra, sin cobrar.
- Entregar la vista para despachos contables: una pantalla, treinta empresas, porque el despacho ya
  tiene el XML de CFDI de cada cliente y es quien presenta la complementaria cuando se abre la ventana
  de treinta días. Es también el canal: 143 de las 737 unidades de contabilidad y auditoría de Nuevo
  León emplean de 11 a 250 personas.
- Seguir las listas en vez de fotografiarlas. Actualizar desde los datos abiertos del SAT de forma
  programada, comparar versiones, y disparar el barrido retroactivo sobre la diferencia y no sobre un
  botón. Y cargar la lista del artículo 49 Bis el día que el SAT la publique como archivo.
- Abrir la red a empresas reales. Hoy el otro lado de la red es sintético y lo decimos en cada
  pantalla. El siguiente paso es el primer tenant que no somos nosotros, con el mismo payload de siete
  columnas hasheadas y la misma regla de que la ruta caliente lee una foto local.
- El riel de producción. StpRail está escrito y nunca ha corrido: hace falta el contrato de
  participante, y hasta entonces el constructor se niega en cualquier máquina.
- Transcripción en el dispositivo, que elimina al mismo tiempo el único costo que escala con el uso y
  la única transferencia de datos fuera del perímetro.

---

- Measure the false-positive rate against real payment runs in real companies, instead of against our
  own hard negatives. That is the number that decides whether a clerk keeps the product switched on,
  and it is the number we are asking for. Ten runs in shadow mode, at no charge.
- Ship the accounting-firm view: one screen, thirty companies, because the firm already holds every
  client's CFDI XML and files the corrective return when the thirty-day window opens. It is also the
  channel: 143 of the 737 accounting and audit units in Nuevo Leon employ 11 to 250 people.
- Track the lists instead of snapshotting them. Refresh from the SAT open-data endpoint on a schedule,
  diff versions, and let the retroactive sweep fire on the difference rather than on a button. And
  load the article 49 Bis list the day the SAT publishes it as a file.
- Open the network to real companies. Today the other side of the network is synthetic and we say so
  on every screen. The next step is the first tenant that is not us, with the same seven-column hashed
  payload and the same rule that the hot path reads a local snapshot.
- The production rail. StpRail is written and has never run: it needs the participant contract, and
  until then the constructor refuses on every machine.
- On-device transcription, which removes the only cost that scales with usage and the only data
  transfer outside the perimeter at the same time.
```

## Built with

Devpost takes these as tags, one at a time. Paste them in this order.

```
bun
typescript
hono
zod
postgres
timescaledb
tiger-data
snowflake
react
vite
tailwindcss
motion
recharts
biome
server-sent-events
gemini-api
elevenlabs
twilio
nessie-api
vercel
vultr
caddy
sat-69b
banxico-cep
cfdi
spei
```

## Business model, if the form asks and for the video description

```
La empresa paga 899 pesos al mes, y el plan para despachos contables es de 3,900 pesos al mes por
hasta veinte empresas cliente, 195 cada una. Se paga solo con una factura detenida de 23,452 pesos de
subtotal al ano, porque de un subtotal rechazado por el 69-B se revierte el 46 por ciento entre ISR e
IVA. Una factura de 100,000 pesos de subtotal detenida paga cincuenta y un meses de suscripcion; un
SPEI mal dirigido del mismo monto paga ciento once. El tamano de mercado, de abajo hacia arriba y por
entidades por precio, es de 2,655 millones de pesos de TAM, 948 millones de SAM y 12.1 millones de SOM
al ano.

The company pays MXN 899 per month, and the accounting-firm plan is MXN 3,900 per month for up to
twenty client companies, MXN 195 each. It pays for itself on one stopped invoice of MXN 23,452 of
subtotal per year, because 46 percent of a subtotal rejected under 69-B reverses between ISR and IVA.
One held invoice of MXN 100,000 of subtotal pays for fifty-one months of the subscription; one
misdirected SPEI of the same amount pays for a hundred and eleven. The market, sized bottom-up as
entities times price, is MXN 2,655 million of TAM, MXN 948 million of SAM and MXN 12.1 million of SOM
per year.
```

## Try it out links

```
https://sentryone-one.vercel.app
https://github.com/garzario/CapitalOneHackMTY
https://api.104.238.147.69.sslip.io/health
```

Replace the first with `https://sentryone.tech` if and only if issue #59 lands before the submission
closes, and keep the Vercel URL in the README as the fallback.

## The Capital One challenge track

Select **Capital One Challenge** and name track 3 in the field that asks which track.

```
Track 3, Real-Time Anomaly and Security Sentinel.

SentryOne es un sentinela de anomalías en tiempo real sobre la bitácora de pagos de una PyME
mexicana, y el tiempo real que elige es el único que no se puede deshacer: los minutos entre aprobar
una corrida de pagos y mandarla. Seis controles deterministas leen la bitácora append-only de la
propia empresa, la lista oficial del artículo 69-B del SAT y el comprobante que Banxico firma por
cada SPEI, y cada línea sale con su nivel, su estado y la acción propuesta, con la evidencia a la
vista. La anomalía que nos importa no es un comercio raro: es una CLABE que difiere en dos dígitos
de la cuenta en la que ya le pagamos 52 veces, un proveedor que el SAT acaba de publicar, una
factura que se va a pagar dos veces, y un titular de cuenta que resulta ser otra empresa. Y porque
un SPEI aceptado es firme e irrevocable, detectar después de la liquidación es una autopsia: este
producto detecta antes y deja la decisión en una persona.

SentryOne is a real-time anomaly sentinel over the payment ledger of a Mexican SMB, and the real time
it picks is the only one that cannot be undone: the minutes between approving a payment run and
sending it. Six deterministic controls read the company's own append-only ledger, the two SAT lists
Article 69-B list and the receipt Banxico signs for every SPEI, and every line comes out with its
level, its state and the proposed action, with the evidence in view. The anomaly that matters here is
not an odd merchant category: it is a CLABE two digits off the account this supplier has been paid on
52 times, a supplier the SAT has just published, an invoice about to be paid twice, and an account
holder who turns out to be a different company. And because an accepted SPEI is firme e irrevocable,
detecting after settlement is a post-mortem: this product detects before, and leaves the decision to a
person.
```

## MLH categories, and the sentence to paste under each

Select five now. The sixth, Best .Tech Domain Name, only if `sentryone.tech` resolves first. The full
gate for each one is in the MLH section of [`docs/13-devpost.md`](../13-devpost.md); do not select a
category whose gate has not been checked against the deployed build.

### Best Use of Gemini API

```
El asistente de SentryOne llama a Gemini con function calling sobre nuestra propia API, y las nueve
herramientas son de lectura: get_run, get_instruction, get_supplier, get_verification, get_execution,
get_receipt, sat_lookup, consortium_signal y get_metrics. readOnly es el literal true y no un
booleano, así que una llamada que escriba no se puede construir. Aparte del asistente, Gemini hace OCR
de la CLABE en la foto de WhatsApp y transcribe la nota de voz, y nada más: el esquema de respuesta
tiene seis campos y ninguno donde quepa un veredicto. Ningún nivel, ninguna acción y ningún número
salen del modelo, y una prueba lee el código del paquete y falla si un módulo publicado siquiera
menciona decide, score o recommend. El turno termina en una propuesta con el cuerpo exacto de la
petición; ejecuta una persona, con su nombre en la bitácora.

SentryOne's assistant calls Gemini with function calling over our own API, and all nine tools are
reads: get_run, get_instruction, get_supplier, get_verification, get_execution, get_receipt,
sat_lookup, consortium_signal and get_metrics. readOnly is the literal true rather than a boolean, so
a tool call that writes cannot be constructed. Beside the assistant, Gemini does OCR of the CLABE in
the WhatsApp photograph and transcribes the voice note, and nothing else: the response schema has six
fields and no field a verdict could be written into. No level, no action and no number comes from the
model, and a test reads the package source and fails if a shipped module so much as names decide,
score or recommend. A turn ends in a proposal carrying the exact request body; a person executes, with
their name in the ledger.
```

### Best Use of ElevenLabs

```
Cuando hay que confirmar una cuenta nueva, SentryOne llama al proveedor con un agente de
Conversational AI de ElevenLabs en español mexicano, marcado por la integración con Twilio. El guion se
deriva de la instrucción y no se escribe a mano: dice los últimos cuatro dígitos de la cuenta separados
uno por uno y nunca los dieciocho, no promete ningún pago, no acusa a nadie y no pide ningún dato. La
transcripción la interpreta un analizador determinista, no un modelo: califica cláusulas, solo de los
turnos del proveedor, y ordena negación sobre duda sobre confirmación, porque un sí que contesta si
hablo con el proveedor no es una confirmación de una cuenta bancaria. El resultado es confirmado,
negado, sin respuesta o poco claro, y ninguno de los cuatro libera un pago por sí solo. Salieron cinco
llamadas reales, dos el 2026-09-12 y tres el 2026-09-13, todas al celular de un miembro del equipo y
nunca a un proveedor, y los identificadores de conversación están en el repositorio. Una cayó en
buzón y el analizador leyó sin respuesta; otra nos enseñó que el agente leía 4611 como una cantidad, y
por eso los cuatro dígitos ahora salen separados; la tercera es la llamada como se entrega, y su
resultado es poco claro porque la persona contestó y luego se salió del guion.

When a new account needs confirming, SentryOne calls the supplier with an ElevenLabs Conversational AI
agent speaking Mexican Spanish, placed through the Twilio integration. The script is derived from the
instruction rather than typed: it speaks the last four digits of the account spaced one by one and
never the eighteen, promises no payment, accuses nobody and asks for no data. The transcript is read by
a deterministic parser rather than by a model: it scores clauses, only the supplier's turns, and ranks
denial over uncertainty over confirmation, because a si that answers am I speaking to the supplier is
not a confirmation about a bank account. The outcome is confirmed, denied, no answer or unclear, and
none of the four releases a payment on its own. Five real calls went out, two on 2026-09-12 and three
on 2026-09-13, all to a teammate's own mobile and never to a supplier, and the conversation ids are in
the repository. One reached a voicemail and the parser read no answer; one taught us that the agent was
reading 4611 as a quantity, which is why the four digits now go out spaced; the third is the call as it
ships, and its outcome is unclear because the person answered and then went off script.
```

### Best Use of Tiger Data

```
La columna vertebral de SentryOne es una bitácora append-only de eventos de pago en Postgres, y es lo
que vuelve al barrido retroactivo del 69-B una reproducción de la historia y no un recálculo. Tiger
Data convierte esa bitácora en hypertable y el resumen diario que lee la línea del tiempo en un
agregado continuo, aplicado en una migración condicional para que un Postgres 18 simple corra el mismo
SQL contra la tabla base. Las dos reglas que nos costaron una migración están escritas: un agregado
continuo no se crea dentro de una transacción, y los índices únicos de una hypertable tienen que
incluir la columna de particionado, lo cual decidió nuestras llaves primarias antes de que existiera
la hypertable.

SentryOne's spine is an append-only ledger of payment events in Postgres, and it is what makes the
retroactive 69-B sweep a replay of history rather than a recomputation. Tiger Data turns that ledger
into a hypertable and the daily rollup the timeline reads into a continuous aggregate, applied in a
conditional migration so a plain Postgres 18 runs the identical SQL against the base table. The two
rules that cost us a migration are written down: a continuous aggregate cannot be created inside a
transaction, and a hypertable's unique indexes must include the partitioning column, which decided our
primary keys before the hypertable existed.
```

### Best Use of Vultr

```
apps/api corre en una instancia de Vultr, junto a la base de datos, porque el flujo de Server-Sent
Events que mantiene la corrida viva en pantalla necesita un proceso de larga vida y eso contradijo
nuestra decisión de despliegue original, que quedó enmendada por escrito. Caddy termina TLS delante de
la API en un nombre sslip.io, con flush_interval -1 para que el evento ready llegue en el instante y
no cuando se cierre la conexión, que es exactamente lo que un proxy con búfer se lleva. El navegador
solo habla con Vercel: vercel.json reescribe /api y /health a la instancia, así que no hay historia de
CORS ni URL base en el bundle.

apps/api runs on a Vultr instance, next to the database, because the Server-Sent Events stream that
keeps the run live on screen needs a long-lived process, and that contradicted our original deploy
decision, which was amended in writing. Caddy terminates TLS in front of the API on an sslip.io name,
with flush_interval -1 so the ready event arrives immediately rather than when the connection closes,
which is exactly what a buffering proxy takes away. The browser only ever talks to Vercel: vercel.json
rewrites /api and /health to the instance, so there is no CORS story and no base URL in the bundle.
```

### Best Use of Snowflake API

```
El control del beneficiario es más débil exactamente en el caso que más dinero cuesta: la primera
factura de un proveedor, donde esta empresa no tiene historia que comparar. La información que lo
resolvería existe y no está en esta empresa. SentryOne la pone en una red entre compañías sobre
Snowflake, y packages/consortium habla con ella por la API REST de SQL y por nada más: POST
/api/v2/statements con un JWT de par de llaves firmado con node:crypto, y GET
/api/v2/statements/handle cuando la respuesta llega como 202. Sin SDK y sin una dependencia nueva, así
que el cliente es un archivo que un ingeniero lee de principio a fin. Lo que sale de una empresa son
siete columnas: un hash con sal del tenant, uno del RFC, uno de la CLABE, el código de banco que esos
tres dígitos ya dicen en público, una consecuencia de cuatro posibles, una fecha y la bandera de
sintético. Lo que se lee es un agregado, nunca el renglón de otra empresa, y la ruta caliente lee una
foto local: el motor recibe la señal de red como argumento, igual que el CEP, así que el almacén nunca
está en la ruta de una decisión. La red de otras empresas en este repositorio es sintética, generada
con la misma semilla que la empresa del demo, y cada renglón viaja marcado como sintético.

The beneficiary control is weakest in exactly the case that costs the most money: a supplier's first
invoice, where this company has no history to compare against. The information that would settle it
exists and is not in this company. SentryOne puts it in a cross-company network on Snowflake, and
packages/consortium talks to it over the SQL REST API and nothing else: POST /api/v2/statements with a
key-pair JWT signed by node:crypto, and GET /api/v2/statements/handle when the submission answers 202.
No SDK and no new dependency, so the client is a file an engineer reads end to end. What leaves a
company is seven columns: a salted hash of the tenant, one of the RFC, one of the CLABE, the bank code
those three digits already state in public, one of four outcomes, a date, and the synthetic flag. What
is read is an aggregate, never another company's row, and the hot path reads a local snapshot: the
engine receives the network signal as an argument, exactly like the CEP, so the warehouse is never on
the path of a decision. The network of other companies in this repository is synthetic, generated from
the same seed as the demo company, and every row travels flagged as synthetic.
```

### Best .Tech Domain Name

Do not select this until <https://sentryone.tech> loads the app. Issue #59.

```
sentryone.tech es la dirección pública del producto, y el nombre dice lo que hace: un centinela, uno,
parado en el único momento del pago que no se puede deshacer.

sentryone.tech is the product's public address, and the name states what it does: one sentry, standing
at the one moment of a payment that cannot be undone.
```

## The three TODOs in this file

Nothing else needs editing. These three are the only values a person has to supply, and each one is a
`TODO` rather than a guess on purpose.

| What | Where | Who unblocks it |
|---|---|---|
| The demo video link | The video field on the submission form | Issue #73 |
| `sentryone.tech` as the live URL, and the sixth category | Try it out links, and the category list | Issue #59 |
| The four Devpost handles | The team members panel, which is not a pasteable field | Each person adds themselves after Patricio invites them |
