# The SAT snapshots

This folder holds the SAT lists the product matches supplier RFCs against: the real
Article 69-B listing as the SAT publishes it, committed, plus the synthetic fixtures the
tests read.

```
src/snapshot/
  README.md                  this file
  official-2026-09-12.csv    the real 69-B list, downloaded 2026-09-12, committed as is
  synthetic.ts               20 invented 69-B rows, for tests. Never for a screen
  art49bis-fixture.csv       6 invented 49 Bis rows in the published Anexo layout.
                             NOT the SAT file: there is none, see the last sections
  official/                  scratch downloads. Git-ignored on purpose
```

Two lists, one committed file. Article 69-B is published as a 4.5 MB CSV and it is here;
article 49 Bis is published one oficio at a time as a DOF note and nothing about it can
honestly be committed as a listing, which is what the last two sections of this file are
about.

## Provenance of `official-2026-09-12.csv`

| | |
|---|---|
| Source | `http://omawww.sat.gob.mx/cifras_sat/Documents/Listado_Completo_69-B.csv` |
| Publisher | Servicio de Administracion Tributaria, listado completo del articulo 69-B del CFF |
| Retrieved | 2026-09-12, 03:48 local (UTC-6) |
| Data current to | 2025-12-31, stated by the file in its own first line |
| `Last-Modified` on the server | 2026-01-22 |
| Bytes | 4566277, committed unmodified |
| `sha256` | `54b95d41c9ca0ea1296f2885d1234e58a562620e76ac2437d2521fc2bbf36685` |
| Encoding | ISO-8859-1, read with the WHATWG `windows-1252` decoder |
| Line endings | CRLF |
| Rows | 14234 data rows on 14247 physical lines |
| `listVersion` | `2025-12-31`, the date the file states it is current to |

**Re-verified on 2026-09-12 at 18:07 local (UTC-6)**, which is the whole point of having
a digest here. The file was downloaded again from the URL above and compared against the
committed one: same 4566277 bytes, same `sha256`, same `Last-Modified` of 2026-01-22,
byte for byte identical. So the counts `official.test.ts` asserts, 14234 rows, 91
unreadable and 28935 situations, are counts of the file the SAT is serving right now and
not of a file that drifted after it was committed. One command repeats the check:

```
curl -s http://omawww.sat.gob.mx/cifras_sat/Documents/Listado_Completo_69-B.csv \
  | shasum -a 256
```

The file is public data. Its own first line says so: the listings are of
`caracter publico` and are consultable on the SAT portal, and the oficios behind
them are signed with SIFEN and published in the DOF. It carries taxpayer names
and RFCs of taxpayers the SAT has published, and no data of ours.

### Three things confirmed against the download, not assumed

- **The URL answers over HTTP and not over HTTPS.** A TLS connection to
  `omawww.sat.gob.mx` times out (verified 2026-09-12). That is the reason the
  committed file is the default path and the live fetch is the option: nothing in
  the demo depends on an unauthenticated fetch over a conference network.
- **It is not UTF-8.** `Publicacion` is spelled with a single `0xF3` byte. A
  UTF-8 decode throws, and a lenient one produces replacement characters that
  silently break every legal-name comparison downstream. `decodeSnapshot` tries
  UTF-8 in fatal mode and falls back, so a future UTF-8 export needs no change.
- **The row count and the line count differ.** Two rows carry a bare newline
  inside a quoted legal name. A line-based parser reports 14247 rows and shifts
  two of them by a column.

### Why it is committed

The earlier note in this folder said the real list should stay out of the
repository. That was reversed deliberately, and the reason is the demo:
`GET /api/v1/sat/lookup` exists so a judge can type an RFC they choose and see the
product answer from the real SAT list. A control that only works when the SAT
portal is reachable is a control that does not work, and 4.5 MB of public
government data is a cheap price for a lookup that cannot fail on stage.

ADR-0002 still binds what may be done with these rows. They answer a lookup. They
are never joined to a synthetic invoice, a synthetic finding or a sweep. The
publication the demo shows is built by `simulatePublication` over the company's
own synthetic suppliers, and the only real RFCs the product ever shows are the
ones a person typed into the lookup box themselves.

## What the list is

Article 69-B of the Codigo Fiscal de la Federacion lets the SAT presume that a
taxpayer issued invoices for operations that never happened. The SAT publishes the
taxpayers it has presumed, and publishes the outcome of each case afterwards. Paying
an invoice from a taxpayer who ends up on the definitive list means the deduction and
the credited IVA are void, retroactively, for invoices that were already filed.

That retroactivity is the whole reason this package exists, and it is the reason the
loader keeps every situation of every row instead of one state per taxpayer: "is this
supplier listed today" and "was this supplier listed on the day we deducted their
invoice" are different questions, and only the second one sizes the exposure.

### The four situations

| In the file | In `SatListStatus` | Means | Rows in the snapshot |
|---|---|---|---|
| Presunto | `presunto` | published as presumed, the taxpayer still has time to answer | 986 |
| Desvirtuado | `desvirtuado` | the taxpayer answered and the SAT accepted. Not listed | 340 |
| Definitivo | `definitivo` | no answer, or the answer was rejected. Invoices have no fiscal effect | 11270 |
| Sentencia favorable | `sentencia_favorable` | a court ruled for the taxpayer. Not listed | 1638 |

The counts above are the `Situacion del contribuyente` column, which is one value
per taxpayer. The loader produces 28935 entries from those 14234 rows, because it
also reads the dated history behind each one.

`parseSatStatus` in `../status.ts` folds accents and whitespace before matching, so
`"Sentencia  Favorable"` and `"SENTENCIA FAVORABLE"` both land on the same value. A
row whose situation does not parse is **rejected and reported**, never guessed at and
never dropped: a row silently lost from a fiscal blacklist is the worst bug this
package can have.

## The published layout

Twenty columns: four describing the taxpayer, then four blocks of four, one block
per situation.

```
No, RFC, Nombre del Contribuyente, Situacion del contribuyente,
  <oficio> presuncion SAT, Publicacion pagina SAT presuntos,
  <oficio> presuncion DOF, Publicacion DOF presuntos,
  <oficio> desvirtuaron SAT, Publicacion pagina SAT desvirtuados,
  <oficio> desvirtuaron DOF, Publicacion DOF desvirtuados,
  <oficio> definitivos SAT, Publicacion pagina SAT definitivos,
  <oficio> definitivos DOF, Publicacion DOF definitivos,
  <oficio> sentencia favorable SAT, Publicacion pagina SAT sentencia favorable,
  <oficio> sentencia favorable DOF, Publicacion DOF sentencia favorable
```

The loader resolves every column **by name**, never by position, because the SAT
reorders and respells and a position is a silent corruption where a name is a loud
failure. One row becomes one `SatListEntry` per dated situation, which is why the
key in `packages/db/migrations/0003_sentryone.sql` is `(list_version, rfc, status)`.

### What the loader had to be taught, with counts

| Observed in the file | Rows or cells | What the loader does |
|---|---|---|
| `DD/MM/YYYY` DOF dates | 28623 situations | reads them |
| DOF cell empty, a pair of dates, or a spreadsheet serial, with a readable SAT portal date on the same row | 483 situations | falls back to the portal date, which is the SAT's own publication of the same oficio |
| Two dates in one cell, `20/06/2022 - 13/05/2021` | 93 cells | keeps the earliest, because the first publication is the day the taxpayer became public |
| Two-digit year, `30/10/18` | in those cells | reads it as 20YY; the list begins in 2014 |
| A bare spreadsheet serial, `44014` | 1 cell | refuses it; the portal-date fallback covers that row |
| RFC redacted as `XXXXXXXXXXXX` by court order | 91 rows | rejects the row with its line number and reason, never matches it, never drops it in silence |
| A legal name carrying a comma | many | RFC 4180 quoting |
| A legal name carrying a bare newline | 2 rows | records span lines; the reported line number is where the record starts |

After all of that, every taxpayer row that is not redacted carries at least one
dated situation, and `snapshot.warnings` is empty: there is no row whose declared
situation this package cannot place in time. `official.test.ts` asserts all of it,
so a future download that changes any of these numbers fails a test instead of
quietly changing what the product tells a clerk.

## Refreshing the snapshot

1. Download the file:
   `curl -sL -o packages/sat/src/snapshot/official-<today>.csv http://omawww.sat.gob.mx/cifras_sat/Documents/Listado_Completo_69-B.csv`
2. Point `OFFICIAL_SNAPSHOT_FILENAME`, `OFFICIAL_SNAPSHOT_RETRIEVED_AT` and
   `OFFICIAL_SNAPSHOT_LIST_VERSION` in `../official.ts` at it. The list version is
   the date the file states it is current to, and the loader reads that sentence
   back out of the file, so a wrong constant fails a test rather than shipping.
3. Run `bun test packages/sat`. The counts in `official.test.ts` will fail. Update
   them, update the table above, and check the difference is a difference in the
   list and not a regression in the parser.
4. Delete the previous snapshot in the same commit. One committed list at a time.

The loader also takes the URL directly, `loadSnapshot({ kind: "url", url,
listVersion })`, which exists so a judge can watch the list arrive live. The
committed file exists so the demo survives dead conference Wi-Fi.

## The synthetic fixture

`synthetic.ts` holds twenty invented rows for tests. Two rules that are not
decoration:

- Every RFC starts with `SYN`. None of them exists.
- Every legal name contains SINTETICA or SINTETICO. The supplier catalogue in
  `@hackmty/seed` deliberately does not do this, because a supplier is only invented
  data, whereas a row on a blacklist is an accusation. An invented blacklist entry has
  to read as invented even in a cropped screenshot with the watermark gone.

The rows are the source of truth and `SYNTHETIC_SNAPSHOT_CSV` is rendered from them
by `toOfficialCsv`, so the two cannot drift. The rendered layout is a documented
subset of the published one: `No`, `RFC`, `Nombre del Contribuyente`,
`Situacion del contribuyente`, `Fecha de publicacion (DOF)`. One name carries a comma
so a parser that ignores RFC 4180 quoting fails in a test rather than in front of a
judge.

## The demo publication

The SAT publication the demo shows is not this file and is not the real list. It is
`POST /api/v1/sat/publish` with `{ simulate: true, rfcs: [...] }`, which goes through
`simulatePublication` in `../sweep.ts`: it builds list entries from the company's own
synthetic suppliers, refuses any RFC that is not synthetic, and then replays the
ledger. That is what keeps the rule in ADR-0002 intact.

## The other SAT list: Article 49 Bis

Issue #180. Article 69-B is not the only list the SAT publishes against a supplier, and
this section is the honest statement of what we cover, written from primary sources
opened on 2026-09-12.

### What the statute says

Article 49 Bis of the CFF was added by the decree published in the DOF on 7 November
2025 and is in force from 1 January 2026 by its Transitorio Primero, which also delays
article 30-B to 1 April 2026 and nothing else. It is the procedure for the express home
visit of article 42, fraccion V, inciso g): the order states why the authority presumes
the taxpayer's CFDI are false and suspends that taxpayer's invoicing from the moment it
is delivered (fraccion I, and article 17-H Bis expressly does not apply), the whole
procedure closes within twenty-four business days (fraccion IX), the taxpayer has five
business days to offer evidence (fraccion V) and the authority fifteen business days to
resolve (fraccion VIII).

Inciso b) of fraccion VIII is the outcome that reaches a buyer: the taxpayer did not
rebut, the CFDI "se consideran falsos con efectos generales" for failing article 29-A,
fraccion IX, and "las operaciones contenidas en los mismos no producen ni produjeron
efecto fiscal alguno". Then fraccion X, which is the clock this product cares about:

| What | Who | How long |
|---|---|---|
| Publish the name and the RFC in the DOF and on the SAT portal | SAT | within 45 business days of the notification of the resolution taking effect |
| Reverse the fiscal effect through a complementary return | every third party who received those CFDI | **30 natural days from the DOF publication** |
| Temporarily restrict the third party's own certificado de sello digital when they do not | SAT, under article 17-H Bis, fraccion XIV | after the 30 days |

Fraccion XI says that the Secretaria de Hacienda y Credito Publico "procedera
penalmente contra cualquier actividad relacionada con comprobantes fiscales falsos", in
the terms of article 113 Bis, whose second paragraph, added by the same 7 November 2025
decree, covers whoever "expida, enajene, compre, adquiera o de efectos fiscales a
comprobantes fiscales falsos", with two to nine years of prison. The same article
requires a querella from the SHCP before anybody is prosecuted. Neither the fraccion nor
the article names the Ministerio Publico, and an earlier draft of this file said they
did, which is the kind of plausible addition a judge would be right to catch.

Source: Codigo Fiscal de la Federacion, texto vigente, last reform DOF 9 April 2026,
<https://www.diputados.gob.mx/LeyesBiblio/pdf/CFF.pdf>, retrieved 2026-09-12 at 17:25
local (UTC-6), 3,134,465 bytes, `Last-Modified` 2026-04-18. Articles 49 Bis, 17-H Bis
fraccion XIV, 17-H fraccion XIII, 29-A fraccion IX, 29-A Bis and 113 Bis.

### What the SAT actually publishes, and why there is no file here

**There is no machine-readable 49 Bis listing, so this folder commits none.** Two
checks, both repeatable in a minute:

- **The SAT open-data catalogue does not carry it.** `Contribuyentes incumplidos` on
  <https://www.sat.gob.mx/minisitio/DatosAbiertos/contribuyentes_publicados.html>
  (retrieved 2026-09-12 at 17:24 local, 26,334 bytes) has sections for article 69,
  article 69-B (five CSV files) and article 69-B Bis (three CSV files) and none for
  article 49 Bis. The navigation of
  <https://www.sat.gob.mx/minisitio/DatosAbiertos/index.html> lists the same three
  articles.
- **The DOF publishes it one oficio at a time, as an HTML note.** A full-text search
  for the phrase `fracción X del artículo 49 Bis`, **written with its accents**,
  answered **14 notes** on 2026-09-12, each an oficio of the Administracion Central de
  Fiscalizacion Estrategica naming **one taxpayer** in an `Anexo 1` table. The link
  that answers, and the one `ART_49BIS_DOF_SEARCH_URL` carries, is the search with its
  query string:
  <https://dof.gob.mx/busqueda_detalle.php?textobusqueda=fracci%C3%B3n+X+del+art%C3%ADculo+49+Bis&vienede=>

  Two traps in that sentence, both verified on 2026-09-12 and both worth a line here
  because either one silently answers "there is no list":

  - `https://dof.gob.mx/busqueda_detalle.php` on its own answers `302 Found` to
    `/Error_BS.php`. It is not a form you can open and type into, so the query string
    is part of the citation and not decoration.
  - The search is **accent sensitive**. The same phrase spelled `fraccion X del
    articulo 49 Bis` answers **zero results**, and the count comes back in the hidden
    `cantidadTotalResultados` field either way. A maintainer who retypes the phrase
    without the accents will conclude the publications stopped.

| DOF date | Oficios, all prefixed `500-05-00-00-00-2026-` | `nota_detalle.php?codigo=` |
|---|---|---|
| 2026-07-10 | 21468, 21469, 21471 | 5793257, 5793258, 5793259 |
| 2026-08-07 | 21590, 21600, 21601, 24291, 24292 | 5795723, 5795724, 5795725, 5795726, 5795727 |
| 2026-08-14 | 24370, 24371, 24417 | 5796303, 5796304, 5796305 |
| 2026-08-28 | 24472, 24524, 24525 | 5797380, 5797381, 5797382 |

Fourteen oficios, fourteen taxpayers, first publication 2026-07-10, which is six months
after the article came into force. Those counts are the ones `official49BisListing()`
reports and `art49bis.test.ts` asserts, so a stale claim fails a test.

### The published layout, which is what the loader reads

Transcribed from oficio `500-05-00-00-00-2026-24472`, DOF 28 August 2026
(`https://dof.gob.mx/nota_detalle.php?codigo=5797380&fecha=28/08/2026`). The `Anexo 1`
table is seven columns under a two-level header:

```
R.F.C. | Nombre, denominacion o razon social del Contribuyente |
Numero y fecha de oficio de resolucion |
Medio de notificacion al contribuyente
  Notificacion por Buzon Tributario
    Fecha de notificacion | Fecha en que surtio efectos la notificacion
  Estrados de la autoridad
    Fecha de fijacion en los estrados de la Autoridad Fiscal | Fecha en que surtio efectos la notificacion
```

What the loader in `../art49bis.ts` had to be taught, each of it read off the fourteen
notes rather than imagined:

| Observed | Count | What the loader does |
|---|---|---|
| The DOF publication date is nowhere inside the Anexo | all 14 | `publishedAt` is a REQUIRED argument. The 30 natural days run from it and it is the one number here nobody may infer |
| Notification dates written `DD/MM/YYYY` | 7 of 14 | reads them |
| The same dates written `06 de agosto de 2026` | 7 of 14, from oficio 24292 onwards | reads them too, so a future oficio that switches back needs no change |
| `Fecha en que surtio efectos la notificacion` appears twice, once per notice group | all 14 | pairs each one with the nearest notice column to its left, because a flattened export loses the group row |
| The `Estrados de la autoridad` pair empty, buzon tributario dated | all 14 | records `notifiedBy: "buzon_tributario"`; a row with neither dated is kept and reported in `warnings` |
| One taxpayer per oficio | all 14 | nothing, but it is why a publication and a version are the same thing here |

### Refreshing, which is manual today

There is no `curl` that gets this list as a list. The steps, in full:

1. Open the search WITH its query string, because the bare page redirects to
   `/Error_BS.php`, and spell the phrase WITH its accents, because without them the
   same search answers zero:
   <https://dof.gob.mx/busqueda_detalle.php?textobusqueda=fracci%C3%B3n+X+del+art%C3%ADculo+49+Bis&vienede=>
   Every result is one oficio. The total comes back in the hidden
   `cantidadTotalResultados` field, and the page shows ten at a time, so paginate with
   `actualPage`, `globalPage` and `iniciaMuestra`. `curl -sG --data-urlencode
   'textobusqueda=fracción X del artículo 49 Bis' --data-urlencode 'vienede='
   https://dof.gob.mx/busqueda_detalle.php` is the same request from a terminal.
2. For each note that is newer than the ones in the table above, open
   `https://dof.gob.mx/nota_detalle.php?codigo=<codigo>&fecha=<DD/MM/YYYY>` and copy
   the `Anexo 1` table into a CSV with the seven column names spelled as the note
   spells them. Do not reorder them and do not rename them: `resolveColumns` in
   `../art49bis.ts` matches on the names and refuses a file it cannot recognise, which
   is the behaviour you want when the SAT respells something.
3. Load it with `parse49BisPublication(text, { publishedAt: "<the DOF date>" })`, or
   `load49BisPublication(bytes, ...)` for a file. Check `rejected` and `warnings`
   before believing `entries`.
4. If the SAT ever ships a real file, commit it here **unmodified** with the same
   provenance table the 69-B snapshot has (URL, retrieval time, byte size, row count,
   cut-off date), point `official49BisListing()` at it so `coverage` becomes `loaded`,
   and update the counts asserted in `../art49bis.test.ts` by hand so a change in the
   list cannot pass as a change in the parser.

Until then `GET /api/v1/sat/lookup` answers, for that list, `answered: false` with
`coverage: "not_published_machine_readable"`, the counts above and the URL to check
them. That is not a degraded mode we are hiding: it is what the SAT publishes.

### `art49bis-fixture.csv` is a fixture and not a listing

Six data rows that exercise the loader: both date shapes, a buzon row, an estrados row,
a legal name carrying a comma, an unreadable RFC and a row with no notice date. The
same rules the synthetic 69-B rows follow apply, and for the same reason:

- Every RFC the loader ACCEPTS starts with `SYN` and none of them exists. One row
  carries `XXXXXXXXXXXX` on purpose, the way the SAT redacts an RFC by court order, and
  the loader rejects it with its line number, so it never becomes an entry.
- Every legal name the loader accepts says SINTETICA or SINTETICO, except the one row
  whose name column is deliberately EMPTY, for which the loader falls back to the RFC
  and the name reads `SYN050505EE5`. The test `names nobody real: every RFC it accepted
  is synthetic` asserts exactly that pair of rules, so neither exception is a hole.
- Every oficio number is prefixed `SIM-`, so it cannot be mistaken for one the SAT
  signed.
- The first line of the file says, in Spanish, that it is not the SAT's file.

It is loaded by `loadFixture49BisPublication` and by nothing else. No endpoint, no
screen and no finding reads it.

## Article 69-B Bis, and why it is not loaded either

Different reason, and the decision is deliberate rather than pending. The 69-B Bis
listing DOES exist as open data, three CSV files under
`.../Datos_abiertos/Documents_AGGC/`: `Listado_69_B_Bis_Completo.csv` (1,256 bytes,
`Last-Modified` 2026-08-19, `Informacion actualizada al 05 de junio de 2026`, **three
taxpayers**: two `Definitivo` and one `Sentencia Favorable`), plus a definitivos file
and a sentencias file. Its columns mirror the 69-B ones with two situations instead of
four.

It is not loaded because it is about something else. Article 69-B Bis presumes the
IMPROPER TRANSFER OF TAX LOSSES in a restructuring, spin-off, merger or change of
shareholders. Appearing in it says nothing about whether a supplier's invoice to us is
real, so using it as a supplier red flag would be exactly the kind of plausible, wrong
inference `docs/06-regulatory-privacy.md` section 3.2 exists to prevent. Three
taxpayers nationally is also not a screening signal. If it is ever surfaced it is a
separate control with its own copy, never a row inside the SAT lists control.
