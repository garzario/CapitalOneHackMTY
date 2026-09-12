# The blind holdout

```
src/holdout/
  README.md             this file
  case.schema.json      the JSON Schema a labelled case is validated against
  types.ts              the same contract at runtime, plus parseHoldoutCase
  engine.ts             runEngine: the six controls and decide over every case
  metrics.ts            computeMetrics: labels plus predictions gives Metrics
  cases.ts              every case, imported so apps/api can serve them
  cases/*.json          one file per case
  engine.test.ts        what runEngine is allowed to produce
  holdout.test.ts       the harness arithmetic and the schema invariants
```

## The protocol, which is the point

The evaluation set is written by the holdout owner, and the person who writes the
detectors does not read this folder until the detectors are merged. That is the entire
reason the precision and recall in `docs/01-rubric-mapping.md` are worth anything: a
team that writes its own test cases after writing its own detectors is reporting how
well it remembers what it built, and every judge has seen that number before.

Two consequences worth stating out loud when asked:

- The detector author may read `case.schema.json`, `engine.ts` and `metrics.ts`,
  because the shape of the answer is a contract and not a hint. They may not read
  `cases/`.
- A case is never edited to make a detector pass. If a case turns out to be wrong, it
  is wrong in the pull request that says so and explains why, with the diff visible.

### How independent these labels actually are, stated plainly

The controls were merged before this set was written, and the labels were written
against the semantics in ADR-0002 and `packages/core/src/domain.ts` rather than against
the control source. That is weaker than the protocol above describes, and the honest
way to say it to a judge is: the labels were not derived from the implementations, but
the implementations existed. What holds the number up is the second rule, not the
first: no case in this folder has been edited to make a control pass.

Four labels currently disagree with the engine and all four are left in the table,
costing us both a point of precision and a point of recall.

| Case | The label says | The engine says |
|---|---|---|
| `clabe-new-account-unbacked` | `critical`: a brand-new account at a new bank over WhatsApp with nothing behind it | `warning`: `critical` is reserved for a failed check digit or an account within two edits of a known one |
| `sat-69b-presunto-verify` | `warning`: presunto is published and the taxpayer's clock to answer is still running | `critical`: the exposure on a deduction already taken is the same size either way |
| `cep-holder-name-does-not-match-the-cfdi` | `comprobable`: a Banxico-signed document naming a different holder is proof | `requiere_verificacion`: name comparison is a heuristic and a person confirms it |
| `cep-signature-could-not-be-verified` | `warning`: a seal we could not check is missing evidence and the clerk should see it | `info`: our verifier confirms no scheme yet, so warning on it would warn on every CEP |

Every one of the four is arguable and none of them is a bug. They are settled in a
review thread and in a pull request that shows the diff, never by quietly editing the
case.

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

Thirty cases are here and all six controls are exercised, reconciliation included: one
case marks a payment sent and hands the engine a bank statement that does not carry it.
`holdout.test.ts` fails if the set drops below twenty-five cases or if fewer than a
third of them are negatives, and `engine.test.ts` fails if any control ends up armed on
no case at all.

## How the score is computed

The unit of account is a **case by detector pair**. Six controls over thirty cases is
180 pairs, each either expected to fire or expected not to.

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
bun run eval                       # the table, from cases/
bun run eval -- --json             # the same thing as Metrics, for a screenshot
bun run eval -- --rows             # one line per case, for finding what regressed
bun run eval -- --cases=path       # a different directory
```

`GET /api/v1/metrics` serves the same `Metrics` object, computed the same way.

It works with zero cases: an empty directory prints a zeroed table and says so.

Predictions come from `runEngine` in `engine.ts`, which calls `runControls` from
`@hackmty/engine`, the same entry point `apps/api/src/pipeline.ts` uses on intake. There
is no second wiring here that could drift from the one the demo runs. The decision
instant is `instruction.receivedAt`, so the table is identical on every machine and in
CI. `predictNothing` stays in `metrics.ts` as the null model the table is worth reading
against: it scores 0 and 0 by construction, and a control that cannot beat it is not
earning its place in the payment run.

If a control ever ends up armed on no case, the footer names it with the reason
`runControls` gave, so a zero row reads as a gap in the evidence rather than as a
measured result.
