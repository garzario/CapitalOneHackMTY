# @hackmty/engine

The six controls of ADR-0002 in one call: `runControls(input)`.

## Why this package exists

`@hackmty/core` carries the algorithms and zero runtime dependencies, and both
`@hackmty/sat` and `@hackmty/cep` already depend on it. Core therefore cannot
import them without a dependency cycle. The two adapters that need them, the
Article 69-B cross-check and the CEP beneficiary check, live here instead, this
package depends on all three, and `apps/api` depends on this one.

```
core  <-  sat  <-  engine  <-  api
  ^-------  cep  ----^
```

## What is in here

| Module | What it does |
|---|---|
| `sat69b.ts` | `sat69bAdapter`, over `matchRfc` plus the `SweepResult` exposure of CFDIs already paid to a newly listed supplier. |
| `beneficiary.ts` | `beneficiaryCepAdapter`, over `nameMatch` and `Cep.signatureValid`. |
| `index.ts` | `SENTRYONE_DETECTORS`, the six adapters in domain order, and `runControls`. |

Nothing in this package is an algorithm. The adapters shape arguments and build
a `Finding`; every rule that decides anything lives in `@hackmty/core`.

## The rule this package enforces

Every one of the six controls appears in exactly one of `report.ran` and
`report.skipped`, so `ran.length + skipped.length` is always six. A control that
produced nothing did so for one of two reasons, and they are different:

- it **ran** and found nothing, which is the usual and good answer, or
- it was **skipped**, and `skipped[i].reason` and `skipped[i].detail` say what
  was missing (no CEP for this account, no bank mirror loaded, a supplier we
  have never paid, a detector that threw).

A payment run that reads "sin hallazgos" because the engine could not call its
own detectors is the one failure this product cannot ship. That is the whole
reason the previous dynamic registry was replaced by this list.

## Working in here

```bash
bun test packages/engine
bun run --filter '@hackmty/engine' typecheck
```

No network, no clock, no database. `ComposeInput.now` is passed in by the caller
and every adapter is a pure function of it.
