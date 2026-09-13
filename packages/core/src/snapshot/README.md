# The plaza snapshot

This folder holds the plaza catalogue that turns digits 4 to 6 of a CLABE into a place.

```
src/snapshot/
  README.md                  this file
  plazas-2026-09-13.csv      786 plazas, clave and nombre, read 2026-09-13
```

`../plazas.ts` carries the same 786 rows as a TypeScript table, because `packages/core`
is bundled into a browser and cannot read a file at runtime. `../plazas.test.ts` parses
this CSV with `node:fs` and fails when the two stop agreeing, so the committed file is
the source of truth and the table is a build artifact somebody can read.

Two things have to be separated before anything below is quoted, and the second one is
the reason this file is long.

## What a plaza code is, and who defines it

Banco de Mexico says it itself, in its own words, on its own FAQ:

> CODIGO DE PLAZA: Ciudad o region donde el cliente mantiene su cuenta, de acuerdo a la
> definicion de claves de plaza definida para el servicio de cheques. Longitud = 3
> digitos.

| | |
|---|---|
| Source | <https://www.banxico.org.mx/footer-es/preguntas-frecuentes-dudas-ba.html> |
| Publisher | Banco de Mexico, preguntas frecuentes |
| Retrieved | 2026-09-13, 182445 bytes, ISO-8859-1 |

The Asociacion de Bancos de Mexico publishes the same sentence, and the ABM is the body
that assigns the bank code in digits 1 to 3 and approves the plaza catalogue:

> Plaza: Ciudad o region donde el cliente mantiene su cuenta, de acuerdo a la definicion
> de claves de plaza definida para el servicio de cheques. Longitud = 3 digitos.

| | |
|---|---|
| Source | <https://www.abm.org.mx/preguntas-frecuentes/> |
| Publisher | Asociacion de Bancos de Mexico, preguntas frecuentes |
| Retrieved | 2026-09-13, 6872 bytes, UTF-8 |

Citibanamex, a member bank, spells out the ABM's role on its own CLABE sheet
(<https://www.banamex.com/resources/pdf/es/personas/cuentas/clave_nuevo.pdf>): the plaza
code is the city or region "de acuerdo con el catalogo de plazas aprobado por la
Asociacion de Banqueros de Mexico".

So the definition is primary and settled: three digits, a cheque-service plaza key, a
catalogue the ABM approves.

## Where the rows came from, which is NOT Banxico

**Neither Banco de Mexico nor the ABM publishes the catalogue itself.** That is a claim
about an absence, so here are the five checks behind it, each one repeatable in under a
minute on 2026-09-13.

| Check | Command or URL | Answer |
|---|---|---|
| Is there a plaza endpoint beside the participant one that does exist? | `curl -s -o /dev/null -w '%{http_code}' https://www.banxico.org.mx/cep/plazas.do` and the same for `/cep-scl/listaPlazas.do` | `302` to the error page, both. `cep/instituciones.do?fecha=13-09-2026` answers `200` with JSON, so the app is reachable and the plaza endpoint is absent rather than blocked |
| Does the CEP app reference one? | `curl -s https://www.banxico.org.mx/cep/ \| grep -oE '[A-Za-z0-9_./-]+\.do'` | `valida.do` only |
| Has banxico.org.mx ever served a URL with "plaza" in it? | Internet Archive CDX, `http://web.archive.org/cdx/search/cdx?url=banxico.org.mx*&fl=original&collapse=urlkey&filter=original:.*[Pp]laza.*` | zero rows. The same query for `abm.org.mx*` returns exactly one, `http://www.abm.org.mx/sucursal/plazas_descargar_menu.htm`, and the capture records it answering `404` in 2004 |
| Is it in the normativa? | `pdftotext -layout` over Circular 3/2012, the transfer-of-funds circular, 313 pages, and over Circular 2019/95 | neither contains "catalogo de plazas", "clave de plaza" or a plaza table. Circular 3/2012 mentions the CLABE nine times and never decomposes it |
| Was it ever published in the DOF? | `curl -sG --data-urlencode 'textobusqueda=catálogo de plazas' --data-urlencode 'vienede=' https://dof.gob.mx/busqueda_detalle.php` | `cantidadTotalResultados` is `0`. Spell the phrase with its accents: the DOF search is accent sensitive, which `packages/sat/src/snapshot/README.md` documents at length |

What is published is the table a SPEI participant operates against. These 786 rows were
read off the article `Catalogo de Plazas` in the public help centre of **STP, Sistema de
Transferencias y Pagos**, the participant `packages/rail/README.md` names as the
production rail:

| | |
|---|---|
| Article | <https://stpmex.zendesk.com/hc/es/articles/360041114372-Catalogo-de-Plazas> |
| Publisher | STP, Sistema de Transferencias y Pagos SA de CV SOFOM ER, SPEI participant |
| State of that URL on 2026-09-13 | answers a login page. The help centre was public when the article was written and is gated now, so the rows were read from a public copy of the same page instead |
| Copy read | <https://raw.githubusercontent.com/testtament/HelixPay/main/STP%20Docs/Catalogo%20de%20Plazas%20%E2%80%93%20STP.html> |
| Bytes of that copy | 186525 |
| `sha256` of that copy | `72fb8566a95993590e71aae0fe593e1d4b305b8c8d8987187407c118acaa1e90` |
| Retrieved | 2026-09-13 |

The chain therefore stops at a participant and not at the central bank, and it runs
through a mirror rather than the publisher's own server. Both of those are written here
because the next person to ask "is this Banxico's file?" deserves the answer "no" in the
first paragraph rather than in a commit message.

## The committed file is a transcription, and what that allows

`plazas-2026-09-13.csv` is not a byte copy of anything: the published artifact is an HTML
page whose copy already had its asset links rewritten by whoever saved it. So the CSV is
a transcription of the two-column table inside it, and the rules were:

- two columns, `clave` and `nombre`, the header spelled as the page spells it
- every `clave` verbatim, zero padded, three digits
- every `nombre` verbatim, cased as published, including the state abbreviation the page
  puts at the end of the name. 785 of the 786 are upper case and `344` is
  `Ixtlixochitl EDOMEX`, which is how the catalogue writes it. That row is pinned by a
  test, because it is the cheapest proof the transcription copied the catalogue rather
  than tidying it
- no row added, no row dropped, no row renamed, no row reordered
- 786 rows, `010` to `962`, strictly increasing, no duplicate code
- no value contains a comma, so the file needs no quoting

| | |
|---|---|
| Rows | 786 data rows on 787 physical lines |
| Bytes | 16291 |
| `sha256` | `41c43de09bab1f58519b4c4267103ff20b0c855888da8521c92d2fb9bc01fe06` |
| Encoding | UTF-8 |
| Line endings | LF |

`../plazas.test.ts` asserts the row count, the 32 state abbreviations and the number of
plazas in each of them, so a future re-transcription that differs anywhere fails a test
instead of quietly changing what the product tells a clerk.

## What the catalogue is allowed to do, and it is one thing

The provenance above is good enough to put a **name** on a code and nothing else. So the
code is built so that is all it can do.

- `lookupPlaza` answers a `Plaza` or `undefined`. A code the snapshot does not carry
  produces no name, no signal and no claim.
- The snapshot never raises a finding, never drops one and never changes a severity. The
  `plaza_changed` signal in `../clabe.ts` is raised by comparing three digits against the
  three digits of the accounts the supplier has actually been paid on, which is
  arithmetic over this company's own ledger and needs no catalogue at all. The snapshot
  is read afterwards, to write the sentence a clerk reads.
- Every sentence that names a plaza prints the three digits beside the name, so a reader
  can check the name against this file without trusting the code.

That is the same shape `../clabe-institutions.ts` states for the participant table: the
half that can go stale is only ever allowed to ask a question. Here it is weaker still,
because it is not even allowed to ask one.

## The thirty-two state abbreviations

The page abbreviates the state at the end of each name, and the abbreviations are its
own rather than ISO 3166-2:MX: `EDOMEX` for the State of Mexico, `DF` for Mexico City,
`TAMPS`, `CHIH`, `QROO`. `Plaza.state` carries them exactly as published, which is why
its doc comment in `../domain.ts` does not promise two letters.

| | | | |
|---|---|---|---|
| AGS 8 | BCN 9 | BCS 8 | CAM 8 |
| CHIH 24 | CHIS 40 | COA 22 | COL 9 |
| DF 1 | DGO 13 | EDOMEX 45 | GRO 23 |
| GTO 40 | HGO 25 | JAL 96 | MICH 68 |
| MOR 13 | NAY 18 | NL 22 | OAX 31 |
| PUE 27 | QRO 7 | QROO 5 | SIN 21 |
| SLP 23 | SON 24 | TAB 18 | TAMPS 18 |
| TLAX 10 | VER 67 | YUC 11 | ZAC 32 |

Two readings of that table matter to this product and both are observations of the file
rather than inferences about banking.

- **A metropolitan area is one plaza.** `180` is the only `DF` row and it is named
  `DISTRITO FEDERAL`. Nuevo Leon has 22 rows: `580 APODACA NL` and then `581` to `601`
  in strict alphabetical order, a run that contains Linares, Montemorelos, Pesqueria and
  Sabinas Hidalgo and contains no Monterrey, Guadalupe, San Nicolas, Santa Catarina,
  Escobedo, Garcia, Juarez or San Pedro. So the municipalities of the Monterrey
  metropolitan area have no plaza of their own in this catalogue and `580` is the only
  Nuevo Leon plaza that can hold them. `MTY_METRO_PLAZA_CODE` in `@hackmty/seed` is `580`
  for that reason, and `Pesqueria` is `598` because the catalogue gives it one.
- **The first code of a state block is not alphabetical.** Coahuila opens at `060
  TORREON` and then runs `061 ABASOLO` to `081 ZARAGOZA` alphabetically, with Saltillo at
  `078`. The same shape repeats in every state. Nothing in this repository depends on it;
  it is recorded so a maintainer who expects alphabetical order does not conclude the
  file is corrupt.

## Refreshing the snapshot

1. Try the publisher first. If `https://stpmex.zendesk.com/hc/es/articles/360041114372-Catalogo-de-Plazas`
   answers the article rather than a login page, read the table from there and say so in
   the table above, which removes the mirror from the chain.
2. Re-run the five checks in the second section. If Banxico or the ABM has started
   publishing the catalogue, throw this transcription away, commit their file unmodified,
   and write the provenance the way `packages/sat/src/snapshot/README.md` does for the
   69-B list: URL, retrieval time, byte count, `sha256`, row count.
3. Write the new CSV next to this one, point `PLAZA_SNAPSHOT_FILE` in `../plazas.ts` at
   it, regenerate the table, and run `bun test packages/core`. The counts in
   `../plazas.test.ts` will fail. Update them, and check the difference is a difference
   in the catalogue and not a regression in the transcription.
4. Delete the previous snapshot in the same commit. One committed catalogue at a time.

## What this folder does not hold

The postal-code side of control 2 is not here. `../plazas.ts` maps a CFDI
`LugarExpedicion` to a state from a deliberately tiny table of two-digit postal prefixes,
which covers the states this repository's synthetic dataset uses and nothing else, and a
prefix it does not carry produces no claim. The national source is the SAT's
`c_CodigoPostal` catalogue, it is primary and downloadable, and importing it is a
follow-on rather than something this snapshot quietly stands in for. The doc comment on
`POSTAL_PREFIX_STATES` says the same thing where a reader of the code will see it.
