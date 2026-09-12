# The Ceptinela generator

One synthetic company, its 42 suppliers, eight months of CFDIs and payment complements,
and the current week's payment run.

```
src/ceptinela/
  README.md        this file
  company.ts       the demo company and the constants the rest of the repo reads
  suppliers.ts     the 42-supplier catalogue, literals, with valid CLABEs
  clabe.ts         CLABE arithmetic the generator needs to mint an account
  generator.ts     generateCeptinela and summarizeCeptinela
  index.ts         the surface
  ceptinela.test.ts the invariants
```

The deterministic RNG is `createRng` from `../rng.ts`, already in this package:
mulberry32, integer maths only, byte-identical output on every machine. The Ceptinela
seed is 69 and the consumer generator's is 86, deliberately different, so a determinism
bug in one does not look like a bug in the other.

## What is finished

- **The supplier projection.** 42 suppliers with `firstInvoiceAt` spread by tenure and
  one known account each, established by a payment complement.
- **The CFDI stream.** Cadence and ticket size per supplier, amounts lognormal inside
  the supplier's range, IVA at the general rate, `total = subtotal + iva` to the cent,
  sequential folios per issuer, never issued on a weekend.
- **The complement stream.** One complement per invoice already settled before the run
  window, carrying the account the supplier says it was paid on.
- **The payment run.** One instruction per invoice that came due inside the window and
  has not been settled, numbered in the order the clerk sees them.
- **The event ledger.** Every object above as a `LedgerEvent`, sorted, which is the
  input the retroactive sweep folds over.

## What is not, and where it is marked

Every item below has a named hook in the code and a `TODO(Apanawa)` against issue #43,
and `dataset.notes.pending` lists them so `bun run seed` can print them out loud rather
than letting them be discovered on stage.

- Seasonality, inside `drawInvoiceCount` rather than as a post-processing pass.
- PPD instalments: several partial complements against one CFDI.
- `payment_sent` events and the Nessie mirror of outflows, which is what
  `bank_reconciliation` compares against.
- The four hard negatives in `HARD_NEGATIVE_INJECTORS`.
- `notes.heroInstructionId`, which is the engine's answer and not the generator's.

The injectors are wired, not implemented. Each one returns
`{ applied: false, detail: "TODO(Apanawa)..." }`, so `notes.hardNegatives` never claims
a case the dataset does not contain. That honesty is the point of the scaffold: a note
saying a hard negative is present when it is not would be found by the first judge who
asks to see it.

## The arithmetic, which is the part that gets asked about

| Figure | Value | Where it comes from |
|---|---|---|
| Suppliers | 42 | the catalogue |
| Invoices per month | 439 | the sum of `invoicesPerMonth` |
| Payment-run lines | about 92 to 101 | 439 a month over the seven-day run window |
| Monthly supplier spend | about 4 to 5 million MXN | the generated invoices, not an assumption |
| History | 8 months | `HISTORY_MONTHS` |

The run size is **not padded to a target.** It falls out of the cadence, and
`RUN_SIZE_MIN` and `RUN_SIZE_MAX` are asserted in the test so that editing the catalogue
without noticing what it does to the demo screen fails in CI instead of at 03:00.

The run window is the seven days ending on the Thursday run day, not Monday to
Thursday. A four-day window quietly produces 55 lines and nobody would know why the
screen looked thin, which is exactly the bug the assertion caught while this was being
written.

The shape is a long tail on purpose: the busiest five suppliers carry more than a fifth
of the invoices and the quietest issue one or two a month. A catalogue where every
supplier has the same cadence makes concentration drift undetectable, and detecting it
is one of the six things this product claims to do.

## Two rules

1. **The labelled positives do not come from this file.** They live in `../holdout/`,
   written by somebody else, and the detector author does not read them before the
   detectors merge. A generator that also labels its own fraud is a generator marking
   its own work.
2. **Everything carries `synthetic: true` and a `SYN` RFC.** The UI watermarks from the
   flag and never from a name, per ADR-0002. The municipalities in the catalogue are
   real places; the companies are not.
