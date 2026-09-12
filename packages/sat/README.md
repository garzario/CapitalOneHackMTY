# @hackmty/sat

The Article 69-B half of Ceptinela. Load a published version of the SAT list, match a
supplier RFC against it, and replay the event ledger to price what a new publication
just did to invoices we already deducted.

```
src/
  index.ts              loadSnapshot, matchRfc, sweep. The package surface
  rfc.ts                normalizeRfc, isRfcShaped, the SYN prefix rule
  status.ts             the four situations and how the published file spells them
  snapshot/
    README.md           how to download the real list, and what to confirm
    synthetic.ts        20 invented rows for tests. Never for a screen
    official/           where a real download goes. Git-ignored
  sat.test.ts           the fixture invariants and the normalisation tests
```

## State

`rfc.ts` and `status.ts` are finished and tested. `loadSnapshot`, `matchRfc` and
`sweep` are typed signatures with the method written out above each one and a
`TODO(Apanawa)` body, because the parser has to be written against a real download
rather than against the fixture. Issue #35 is the one that fills them in.

Calling a stub throws with the function name and the issue number, so a half-wired
call path fails loudly instead of returning an empty list that looks like a clean
supplier.

## Three constraints

1. **Runtime neutral.** `apps/api` runs on the Node runtime per ADR-0005, so nothing
   here imports `bun:*` or touches a Bun global. Reading a file is the caller's job:
   `loadSnapshot` takes text or a URL, and the URL form accepts an injected `fetch`
   so a test never opens a socket.
2. **Pure.** `matchRfc` and `sweep` are functions of their arguments. `sweep` is a
   fold over `LedgerEvent[]` with no clock and no database, which is what makes the
   retroactive exposure figure reproducible while a judge is watching.
3. **Nothing is dropped silently.** A row the loader cannot read comes back in
   `rejected` with its line number and a reason. A fiscal blacklist that quietly
   loses rows is worse than no blacklist, so the loader never throws on one bad row
   and never skips one either.

## Why every version is kept

"Is this supplier listed today" and "was this supplier listed on the day we deducted
their invoice" are different questions, and only the second one sizes the exposure.
`sat_list_entries` in `packages/db/migrations/0003_ceptinela.sql` is keyed by
`(list_version, rfc, status)` for that reason, and a corrected download is a new
version rather than an edit to an old one.

## What is deliberately not here

The `sat_69b` detector. All six detectors live in `packages/core` and consume what
this package returns, per the "where things live" section of `AGENTS.md`: new
algorithmic logic never goes in a route handler, and it does not go in an integration
package either.
