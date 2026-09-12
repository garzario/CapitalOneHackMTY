# @hackmty/sat

The Article 69-B half of Ceptinela. Load a published version of the SAT list, match a
supplier RFC against it, and replay the event ledger to price what a new publication
just did to invoices we already deducted.

```
src/
  index.ts              the package surface, re-exporting the files below
  csv.ts                bytes to rows: encoding detection and RFC 4180
  dates.ts              DOF publication dates, including the shapes the file gets wrong
  loader.ts             loadSnapshot: one published version into SatListEntry[]
  match.ts              matchRfc, matchRfcAsOf, statusHistory, createSatIndex
  sweep.ts              sweep, priceSweep, paidCfdisOf, simulatePublication, the rates
  official.ts           the committed real download and its provenance
  rfc.ts                normalizeRfc, isRfcShaped, the SYN prefix rule
  status.ts             the four situations and how the published file spells them
  snapshot/
    README.md              provenance of the committed download, and how to refresh it
    official-2026-09-12.csv the real SAT list, 14234 rows, committed as downloaded
    synthetic.ts            20 invented rows for tests. Never for a screen
    official/               scratch downloads. Git-ignored
```

## What it does

```ts
// The real list, parsed once, from the committed file. No network.
const index = await officialSatIndex();
index.match("AAA080808HL8").listed; // false: a court ruled for this taxpayer

// A demo publication over the company's own synthetic suppliers, and what it costs.
const publication = simulatePublication(["SYN010101AAA"], {
  now,
  status: "definitivo",
});
sweep(ledger, {
  listVersion: publication.listVersion,
  entries: publication.entries,
}).totalExposure;
```

`apps/api` wires exactly two endpoints to this: `GET /api/v1/sat/lookup` reads the
official list, and `POST /api/v1/sat/publish` builds a simulated publication and
prices it. They are separate on purpose, and the separation is ADR-0002.

## The committed snapshot

`snapshot/official-2026-09-12.csv` is the SAT's complete Article 69-B listing,
downloaded on 2026-09-12, current to 2025-12-31, committed byte for byte. It is
public data and the full provenance is in `snapshot/README.md`, together with what
the parser had to be taught and why: the file is ISO-8859-1, its rows and its lines
are different counts, 91 of its RFCs are redacted by court order, and 483 of its DOF
date cells are unreadable and have a usable portal date next to them.

It is committed because `GET /api/v1/sat/lookup` is the endpoint a judge types their
own RFC into, and a control that only works while the SAT portal is reachable is a
control that does not work.

## Three constraints

1. **Runtime neutral.** `apps/api` runs on the Node runtime per ADR-0005, so nothing
   here imports `bun:*` or touches a Bun global. `loadSnapshot` takes text, bytes or
   a URL, and the URL form accepts an injected fetch so a test never opens a socket.
   The one filesystem read is `loadOfficialSnapshot`, and it imports
   `node:fs/promises` dynamically so a bundle that never calls it never pulls it in.
2. **Pure.** `matchRfc`, `sweep`, `priceSweep` and `simulatePublication` are
   functions of their arguments. `sweep` is a fold over `LedgerEvent[]` with no
   clock, no database and no network, which is what makes the retroactive exposure
   figure reproducible while a judge is watching.
3. **Nothing is dropped silently.** A row the loader cannot read comes back in
   `rejected` with its line number and a reason, and a row whose declared situation
   has no readable date comes back in `warnings`. A fiscal blacklist that quietly
   loses rows is worse than no blacklist, so the loader never throws on one bad row
   and never skips one either. It does throw when the file is not the listing at
   all, because an empty list reads as "nobody is listed" to every caller.

## The two rates

`sweep` reports the tax that has to be returned when a supplier we already paid is
published: the deduction taken against the invoice base, and the IVA credited
against it.

- **ISR at 30 percent** of the base already deducted. The ordinary corporate rate
  under article 9 of the LISR, and an ASSUMPTION about the company being protected
  rather than a computation. It is a parameter, it is exported as `DEFAULT_ISR_RATE`,
  and the screen states it next to the figure.
- **IVA is summed, not multiplied.** `DEFAULT_IVA_RATE` is exported and documented as
  the general rate under article 1 of the LIVA, and the sweep does not apply it: it
  adds up the IVA each CFDI actually carries, because one invoice can mix rates and a
  zero-rated line would be overstated by a flat 16 percent.

The reasoning is written out at the top of `src/sweep.ts`, which is where a reviewer
will look for it.

## Why every version is kept

"Is this supplier listed today" and "was this supplier listed on the day we deducted
their invoice" are different questions, and only the second one sizes the exposure.
One row of the published file carries a dated history and becomes one entry per
situation; `sat_list_entries` in `packages/db/migrations/0003_ceptinela.sql` is keyed
by `(list_version, rfc, status)` for that reason, and a corrected download is a new
version rather than an edit to an old one. `matchRfcAsOf` is the function that asks
the second question.

## ADR-0002, in code

A real RFC may appear in the read-only lookup and nowhere else. Two mechanisms hold
that up rather than a convention someone remembers:

- `simulatePublication` throws `SyntheticOnlyError` on any RFC without the `SYN`
  prefix, so the only publication that can ever meet an invoice is a fabricated one.
- `official.test.ts` is the only file in the repository that names real RFCs, and it
  only looks them up.

## What is deliberately not here

The `sat_69b` detector. All six detectors live in `packages/core` and consume what
this package returns, per the "where things live" section of `AGENTS.md`: new
algorithmic logic never goes in a route handler, and it does not go in an integration
package either.
