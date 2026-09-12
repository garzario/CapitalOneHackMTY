# The Article 69-B snapshot

This folder holds the SAT list the product matches supplier RFCs against: the real
listing as the SAT publishes it, committed, plus a synthetic fixture for the tests.

```
src/snapshot/
  README.md                  this file
  official-2026-09-12.csv    the real list, downloaded 2026-09-12, committed as is
  synthetic.ts               20 invented rows, for tests. Never for a screen
  official/                  scratch downloads. Git-ignored on purpose
```

## Provenance of `official-2026-09-12.csv`

| | |
|---|---|
| Source | `http://omawww.sat.gob.mx/cifras_sat/Documents/Listado_Completo_69-B.csv` |
| Publisher | Servicio de Administracion Tributaria, listado completo del articulo 69-B del CFF |
| Retrieved | 2026-09-12, 03:48 local (UTC-6) |
| Data current to | 2025-12-31, stated by the file in its own first line |
| `Last-Modified` on the server | 2026-01-22 |
| Bytes | 4566277, committed unmodified |
| Encoding | ISO-8859-1, read with the WHATWG `windows-1252` decoder |
| Line endings | CRLF |
| Rows | 14234 data rows on 14247 physical lines |
| `listVersion` | `2025-12-31`, the date the file states it is current to |

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
