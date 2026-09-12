# The SentryOne generator

One synthetic company, its suppliers, eight months of CFDIs and payment complements,
the current week's payment run, and the bank mirror of everything that already left
the account.

```
src/sentryone/
  README.md          this file
  company.ts         the demo company and the constants the rest of the repo reads
  suppliers.ts       the 42-supplier catalogue, literals, with valid CLABEs
  clabe.ts           CLABE arithmetic, including the two-digit near miss
  timeline.ts        the calendar and money helpers every phase shares
  build.ts           the object builders: supplier row, CFDI, complements, run line
  types.ts           the plan, the draft, the case and the dataset shapes
  hard-negatives.ts  the four cases that look like fraud and are not
  scenarios.ts       the four cases the demo opens on
  mirror.ts          SPEI transfers and the Nessie-shaped bank mirror
  generator.ts       generateSentryOne and summarizeSentryOne
  loader.ts          loadSentryOne, what the API boots on with SEED=sentryone
  index.ts           the surface
  sentryone.test.ts  the invariants
```

The deterministic RNG is `createRng` from `../rng.ts`: mulberry32, integer maths only,
byte-identical output on every machine. The SentryOne seed is 69 and the consumer
generator's is 86, deliberately different, so a determinism bug in one does not look
like a bug in the other.

## The five phases

1. **Plan.** The catalogue plus whatever a case injector adds, and a cadence map that
   says how many invoices each supplier issues in each month. Seasonality and a
   ramping supplier are decided here, before a single object exists, because they are
   properties of how the company buys rather than patches applied to finished data.
2. **Draw.** Invoices month by month on working days, complements for everything
   already settled, and one run line per supplier per due day.
3. **Inject.** The four hard negatives and the four demo scenarios mutate the draft
   and then MEASURE what landed. `applied` comes from the measurement, never from the
   intention, so `notes` cannot claim a case the data does not contain.
4. **Settle.** Complements are grouped into the SPEI transfers that paid them, each
   transfer gets a clave de rastreo, and the mirror is built from those through
   `normalizePurchase` in @hackmty/nessie, the same function the live import uses.
5. **Replay.** Everything becomes the append-only event stream the retroactive sweep
   folds over.

## The cases

Four hard negatives, all applied, all measured:

| Case | What it is | How it is verified |
|---|---|---|
| `legitimate_bank_change` | A supplier really did move bank, and the complement it issued for the invoice we paid names the new account | The account is on `knownAccounts` with `establishedBy: "payment_complement"`, at a different institution, and this week's lines pay it |
| `ramping_new_supplier` | A supplier that did not exist four months ago now carries a material share of the outflow | The cadence is sized for 15 per cent of the month; the share it actually drew is measured and printed |
| `round_number_invoice` | An invoice for exactly 100,000.00 MXN, because the quote was | `total` is a whole multiple of 10,000 to the cent and `subtotal + iva` still adds back exactly |
| `seasonal_spike` | A shutdown month where consumables double and tooling does not | The peak consumable month is compared against the median month and the ratio is printed |

Four demo scenarios, one per named hero instruction:

| Case | What the clerk sees |
|---|---|
| `clabe_two_digits_off` | A WhatsApp message with a CLABE two digits from the one with a hundred payments behind it, check digit valid |
| `invalid_check_digit` | A photographed PDF whose CLABE fails the 3-7-1 sum, with an OCR confidence attached |
| `duplicate_invoice` | An invoice a complement already settled in full, back on the run |
| `listed_supplier_69b` | A supplier of two years whose RFC is on the simulated Article 69-B publication |

`bun run seed` prints the instruction id of each one and writes them to
`.seed/sentryone.json`.

## Three rules

1. **The labelled positives do not come from here.** The holdout cases in
   `../holdout/` are written by somebody who does not write the detectors, and they
   are the only thing precision and recall may be computed from. The four scenarios
   above are the demo path and are counted towards nothing. A generator that also
   labels its own fraud is a generator marking its own work.
2. **Everything carries `synthetic: true` and a `SYN` RFC**, including the bank RFC on
   a payment complement. The UI watermarks from the flag, never from a name, per
   ADR-0002. The municipalities are real places; the companies are not. The one row on
   the Article 69-B list is taken verbatim from the synthetic snapshot in
   @hackmty/sat, whose name carries SINTETICOS, because a row on a fiscal blacklist is
   an accusation and an invented one has to be unmistakably invented even in a
   screenshot with the watermark cropped off.
3. **Nothing is dated after the run day.** A ledger a judge scrolls through must not
   contain tomorrow, and that is one of the assertions in `sentryone.test.ts`.

## The arithmetic, which is the part that gets asked about

| Figure | Value | Where it comes from |
|---|---|---|
| Suppliers | 44 | the 42-row catalogue, plus the one that ramps and the one the list names |
| Invoices per month | about 500 | the catalogue sums to 439, the two injected suppliers add the rest |
| Payment-run lines | 70 to 110, about 90 | roughly a week of dues, grouped one line per supplier per due day |
| Monthly supplier spend | 5 to 6 million MXN | the generated invoices, not an assumption |
| History | 8 months | `HISTORY_MONTHS` |

The run size is **not padded to a target.** It falls out of the cadence, and
`RUN_SIZE_MIN` and `RUN_SIZE_MAX` are asserted in the test so that editing the
catalogue without noticing what it does to the demo screen fails in CI instead of at
03:00. Three things shape it, and all three are decisions rather than accidents:

- **One line per supplier per due day**, not one per invoice. A company pays a
  supplier once and the SPEI covers whatever came due, which is why
  `PaymentInstruction.cfdiUuids` is an array and why a complement carries a
  `paymentTotal` separate from the share one invoice took. The eight months of history
  are settled the same way, so the run and the mirror agree.
- **The run carries stragglers.** Six per cent of what came due in the previous
  fortnight is still unpaid, because a clerk who has never been behind is not a clerk,
  and a run that is exactly one week of dues is a spreadsheet rather than a payables
  ledger.
- **Invoices are drawn on working days**, not on calendar days rolled forward to the
  next Monday. Rolling puts three times its share of the invoices on Mondays, and then
  three times its share of the due dates lands in one payment run.

## What is deliberately not here

- **`payment_sent` events, and any outflow with no document behind it.** Nothing in
  this week's run has left the bank yet, which is the premise of the product, and the
  eight months of history arrived from the accounting system as invoices and
  complements rather than as instructions this company never recorded. A payment with
  no document behind it is a labelled positive, and those live in `../holdout/`.
- **Findings, decisions and verified beneficiaries.** They are the engine's output.
  The CEP evidence comes from packages/cep and from the real one-cent probe.
