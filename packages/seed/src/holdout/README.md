# The blind holdout

```
src/holdout/
  README.md             this file
  case.schema.json      the JSON Schema a labelled case is validated against
  types.ts              the same contract at runtime, plus parseHoldoutCase
  metrics.ts            computeMetrics: labels plus predictions gives Metrics
  cases.ts              the example cases, imported so apps/api can serve them
  cases/*.json          one file per case
  holdout.test.ts       the harness arithmetic and the schema invariants
```

## The protocol, which is the point

The three cases in `cases/` are **scaffolding**. They show the shape and they exercise
the harness. They are not the evaluation set.

The evaluation set is written by the holdout owner, and the person who writes the
detectors does not read this folder until the detectors are merged. That is the entire
reason the precision and recall in `docs/01-rubric-mapping.md` are worth anything: a
team that writes its own test cases after writing its own detectors is reporting how
well it remembers what it built, and every judge has seen that number before.

Two consequences worth stating out loud when asked:

- The detector author may read `case.schema.json` and `metrics.ts`, because the shape
  of the answer is a contract and not a hint. They may not read `cases/`.
- A case is never edited to make a detector pass. If a case turns out to be wrong, it
  is wrong in the pull request that says so and explains why, with the diff visible.

## What a case is

One payment instruction, everything the engine may read about it, and the label. The
field names are the ones in `packages/core/src/domain.ts`; this folder never introduces
a second shape.

- `kind` is `positive` when at least one detector should fire, `negative` when the case
  looks like fraud and is not. Stated rather than derived, so an empty
  `expectedFindings` cannot be mistaken for a case somebody did not finish.
- `expectedFindings` carries each detector at most once. Matching is by detector,
  narrowed by `state` and `severity` when the label gives them, and the explanation text
  is never compared, because the wording will change twenty times before the demo and a
  test that breaks on copy is a test people delete.
- `because` on each expectation is one sentence saying why this is the right label. It
  is the sentence that gets read out loud when the detector author disputes a case.
- Every RFC matches `^SYN[0-9]{6}[A-Z0-9]{3}$` and every object carries
  `synthetic: true`. ADR-0002 keeps real RFCs to the read-only SAT lookup box, and a
  holdout case is the easiest place in the repository for one to slip in unnoticed, so
  the schema and `parseHoldoutCase` both refuse it.

Validation happens twice on purpose: `case.schema.json` catches it in the editor, and
`parseHoldoutCase` catches it at load. A case that does not parse throws. It is never
skipped, because a skipped case makes recall look better than it is.

## What the coverage has to be

Issue #55 asks for 25 or more cases. The split that matters:

| Group | What it covers |
|---|---|
| True positives, one per detector | listed supplier, CLABE two digits off, invalid check digit, duplicate invoice, behaviour jump, CEP name mismatch |
| Hard negatives | legitimate bank change backed by a complement, legitimate new supplier ramping to 15 per cent of outflow, a round-number invoice, a partial legal-name match that is fine |
| Edge | an OCR-sourced CLABE with low confidence, a supplier with three invoices total so no baseline exists, a status that moved from presunto to desvirtuado before the payment |

The hard negatives are the half that decides whether the product is usable. A sentinel
that holds a legitimate payment twice is a sentinel the clerk turns off, so
`falsePositiveRate` is the number to defend, not `recall`.

TODO(Apanawa), issue #55: write the remaining cases. Three are here as examples and 22
or more are missing.

## How the score is computed

The unit of account is a **case by detector pair**. Six detectors over twenty-five cases
is 150 pairs, each either expected to fire or expected not to.

- `TP`: expected and fired. `FP`: not expected and fired. `FN`: expected and did not
  fire. `TN`: not expected and did not fire.
- `precision = TP / (TP + FP)`, `recall = TP / (TP + FN)`,
  `falsePositiveRate = FP / (FP + TN)`.
- A zero denominator gives 0, never NaN and never a silent 1. Reporting 100 per cent
  precision off a single lucky fire is the kind of number that gets taken apart in ten
  seconds.

The action is scored separately, as plain agreement between `expectedAction` and what
`decide` chose, because `Metrics` in the domain has no field for it and inventing one
would be a second shape.

## Running it

```
bun run scripts/eval.ts              # the table, from cases/
bun run scripts/eval.ts --json       # the same thing as Metrics, for a screenshot
bun run scripts/eval.ts --cases=path # a different directory
```

It works with zero cases: an empty directory prints a zeroed table and says so.

The detectors are not wired in yet. `predictNothing` in `metrics.ts` stands where
`composeFindings` and `decide` will be, so today the table reports recall 0 and states
that nothing is connected. TODO(garzario), issue #55: replace it when the detectors
merge. A harness that invents predictions to make its own table look finished is worse
than an empty table.
