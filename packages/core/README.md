# @hackmty/core

The intelligence lives here, and nothing else does.

## The rule

**Every algorithm the product is judged on goes in this package, as a pure
function, with a test next to it.** Not in a route handler, not in a React
component, not in a SQL string.

Three consequences that are not negotiable:

1. **Zero runtime dependencies.** `package.json` has no `dependencies` block and
   must not grow one. No Hono, no postgres, no zod, no date library. If a
   function needs a network call, a clock or a connection, the function belongs
   somewhere else and the part that does the thinking belongs here.
2. **Pure functions only.** Same input, same output, every time. No `Date.now()`,
   no `Math.random()`, no reading `process.env`, no mutating an argument. A clock
   or a seed is passed in by the caller, which is why the tests need no mocks.
3. **A test per edge case, named after the case.** `bun test` on this package
   finishes in well under a second, so there is never a reason to skip it.

## Why it is built this way

Judging at this event is continuous: engineers walk up to the table and probe
the architecture, the data structures and the reasoning. The cheapest way to
answer "is this real, or is there a human behind the curtain" is to open
`packages/core/src/<algorithm>.ts` next to `<algorithm>.test.ts` and let them
read the whole thing: deterministic, no mocks, no network. A dependency-free
package is also the only part of the stack that cannot break at 04:00 because a
CDN, a driver or a sandbox API changed.

It also keeps the client decision reversible. The engine does not know whether
it is being called by `apps/api`, by a script, or eventually by a native client,
so the single-platform question answers itself.

## What is in here now

| Module | What it does |
|---|---|
| `types.ts` | `LedgerTx`, the one transaction shape every source normalises into, plus the Monterrey UTC offset. |
| `money.ts` | Cents. `toCents`, `fromCents`, `sumCents`, `compareAmounts`, `formatAmount`. Nothing in this repo compares two floats. |
| `rolling.ts` | `rollingWindowSum` and `dailyBuckets` over a ledger, both pure, both tolerant of dirty rows. |

`rolling.ts` is the seed of the chosen differentiator, not the differentiator
itself. When the algorithm is decided, it lands here as its own module with its
own test file, and `docs/07-architecture.md` gets the three sentences that
explain it.

## Working in here

```bash
bun test packages/core          # the whole package, under a second
bun run --filter '@hackmty/core' typecheck
```

Dirty data is survived, not rejected: a row with an unparseable date or a
non-finite amount is skipped rather than thrown on, because one bad row from an
upstream API must never blank out a screen during a demo. Every skip is covered
by a test so the behaviour is a decision and not an accident.
