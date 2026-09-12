# The Article 69-B snapshot

This folder holds the SAT list the product matches supplier RFCs against: a
synthetic fixture that is committed, and a real download that is not.

```
src/snapshot/
  README.md        this file
  synthetic.ts     20 invented rows, for tests. Never for a screen.
  official/        where a real download goes. Git-ignored on purpose.
```

## What the list is

Article 69-B of the Codigo Fiscal de la Federacion lets the SAT presume that a
taxpayer issued invoices for operations that never happened. The SAT publishes the
taxpayers it has presumed, and publishes the outcome of each case afterwards. Paying
an invoice from a taxpayer who ends up on the definitive list means the deduction and
the credited IVA are void, retroactively, for invoices that were already filed.

That retroactivity is the whole reason this package exists, and it is the reason the
loader keeps every version instead of overwriting: "is this supplier listed today" and
"was this supplier listed on the day we deducted their invoice" are different
questions, and only the second one sizes the exposure.

### The four situations

| In the file | In `SatListStatus` | Means |
|---|---|---|
| Presunto | `presunto` | published as presumed, the taxpayer still has time to answer |
| Desvirtuado | `desvirtuado` | the taxpayer answered and the SAT accepted. Not listed |
| Definitivo | `definitivo` | no answer, or the answer was rejected. Invoices have no fiscal effect |
| Sentencia favorable | `sentencia_favorable` | a court ruled for the taxpayer. Not listed |

`parseSatStatus` in `../status.ts` folds accents and whitespace before matching, so
`"Sentencia  Favorable"` and `"SENTENCIA FAVORABLE"` both land on the same value. A
row whose situation does not parse is **rejected and reported**, never guessed at and
never dropped: a row silently lost from a fiscal blacklist is the worst bug this
package can have.

Each situation carries its own oficio number and its own DOF publication date, so one
taxpayer can appear with several dates across the columns of a single row. The loader
turns that into one `SatListEntry` per situation, which is why the primary key in
`packages/db/migrations/0003_ceptinela.sql` is `(list_version, rfc, status)`.

## Downloading the real list

1. Go to `sat.gob.mx` and open the Article 69-B listing under the fiscal information
   section. The page publishes the complete listing plus the per-situation ones.
   TODO(Apanawa): paste the exact deep link here once you have downloaded it, because
   the portal reorganises and a stale link at 03:00 is worse than no link.
2. Download the complete listing. It is offered as CSV and as XLSX. Take the CSV:
   the XLSX needs a parser we do not have and are not adding for this.
3. Save it to `official/` named `69b-<DOF date>.csv`, for example
   `official/69b-2026-08-14.csv`. That date is the `listVersion` everywhere else in
   the system, because it is the only version identifier the SAT itself gives out.
4. Load it with `loadSnapshot({ kind: "text", csv, listVersion })`, or point the
   loader straight at the published URL with `{ kind: "url", url, listVersion }`.
   The URL path exists so a judge can watch the list arrive live; the file path
   exists so the demo survives dead conference Wi-Fi.

### What to confirm against the actual file before finishing the parser

TODO(Apanawa): the parser has to be written against a real download, not against the
fixture. Three things to check and write down here when you have it:

- **The header spelling.** Column names carry accents and the situation columns are
  worded per status. Do not hard-code a guess.
- **The encoding.** Legal names carry accents and `Ñ`. If the file is not UTF-8, decode
  it before parsing rather than after, and strip a byte order mark if there is one.
- **The line ending and the row count.** Compare the row count you parsed against the
  count the portal states. If they disagree, the parser is wrong, not the SAT.

`official/` is git-ignored. The real list is public data, but committing a few hundred
thousand real RFCs into a hackathon repository serves no purpose and ADR-0002 keeps
real RFCs to the read-only lookup box.

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
`POST /api/v1/sat/publish` with `{ simulate: true, rfcs: [...] }`, which builds list
entries from the company's own synthetic suppliers and then replays the ledger. That
is what keeps the rule in ADR-0002 intact: a real RFC never appears next to a
fabricated invoice, and the only place a real RFC is ever shown is the lookup box a
judge types into.
