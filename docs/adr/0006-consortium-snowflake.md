# ADR-0006: The cross-tenant beneficiary network lives on Snowflake, and the hot path reads a snapshot of it

- **Status:** Proposed
- **Date:** 2026-09-12
- **Deciders:** `garzario`, with `fabbyyyy`
- **Affects:** `packages/consortium`, `packages/engine`, `packages/db`, `apps/api`, `docs/01`,
  `docs/06`, `docs/07`, `docs/08`, `docs/09`, `docs/10`, `docs/13`, `README.md`. Issue #164

## Context

Control 2 of ADR-0002 is the strongest beneficiary signal the product has and it is a comparison
against this company's own payment history: the 3-7-1 check digit, the bank and plaza, and
Damerau-Levenshtein against the accounts this supplier has actually been paid on, each with the
document that established it. That control is at its weakest in exactly the case that loses the most
money. A supplier's first invoice, or a genuine change of bank, arrives with `knownAccounts` empty or
with one entry, and `packages/core` is honest about it: the behaviour control gates on sample size,
so with n at zero or one there is nothing to compare against and the finding has to say so.

The information that would settle it exists, and it is not in this company. A supplier that twenty
other firms have paid on the same account for eleven months is a different proposition from an
account nobody has ever paid, and the difference is knowable without anyone learning who paid whom.
The corporate band of the competitor map in `docs/04-market.md#competitor-map` already sells scale of
roughly that kind to treasuries rather than to a 28-person metalworking shop, and the table further
down says exactly what each of those three claims on its own page, because that is the sentence the
pitch is allowed to use.

Three constraints make this a decision rather than a feature.

1. **The operational ledger is single-tenant by construction.** `0006_company.sql` declares
   `id integer primary key default 1 check (id = 1)`, so a second company row is refused by the
   database. That invariant is what keeps every read on the hot path simple enough to show a judge,
   and a cross-tenant table cannot live behind it without breaking it.
2. **The intelligence lane has no network and no database access.** That rule is the whole
   technical-depth argument of `docs/07-architecture.md` and it is not negotiable for one signal.
3. **The demo happens at 05:00 and again at 09:00 on conference Wi-Fi.** Anything on the decision
   path that needs a third party to be reachable is a single point of failure on the one thing that
   is not recoverable.

## Decision

**The network is a separate cross-tenant warehouse on Snowflake, it holds only salted hashes, and
nothing on the hot path ever queries it.**

Four parts, and the fourth is the one that matters.

1. **`packages/consortium` talks to Snowflake over the SQL REST API and nothing else.**
   `POST /api/v2/statements` with a key-pair JWT, and `GET /api/v2/statements/<handle>` when the
   submission answers `202`, which Snowflake returns when a statement takes longer than 45 seconds or
   was submitted asynchronously. No Snowflake SDK and no new dependency: the RS256 signature is
   `createSign` from `node:crypto`, which `packages/cep` already imports, and the transport is
   `fetch`, so the client is a file an engineer can read end to end.
2. **What leaves the tenant is `BENEFICIARY_EVENTS`, and it is seven narrow columns.** A salted hash of the
   supplier RFC, a salted hash of the destination CLABE, the bank code those three digits already
   state in public, an outcome out of `verified`, `paid`, `mismatch` and `fraud_reported`, a date, and
   the `synthetic` flag. No name, no amount, no raw CLABE, no RFC, no invoice, no tenant identity
   beyond a hash of it. The privacy argument and its limits are in
   `docs/06-regulatory-privacy.md#8-the-consortium-network-what-leaves-the-tenant`.
3. **Reading is an aggregate, never another tenant's row.** The view the pull reads counts distinct
   tenants, first and last sighting, fraud reports for the pair and other accounts seen for the same
   supplier hash. A tenant learns how many companies have paid the pair it is about to pay, itself
   included once `consortium:push` has sent its own outcomes, which is why the number a screen may
   read as corroboration is one higher on a pair this company already pays than the count of other
   companies alone. It cannot learn which ones, and it cannot ask about a pair it does not already
   hold.
4. **The hot path reads a local snapshot.** `consortium:pull` writes
   `consortium_snapshot` into the same Postgres the ledger lives in, the engine receives a
   `NetworkSignal` as an argument like every other input, and `source` is `snapshot` or
   `not_consulted`. The expected-loss decision adjusts deterministically and states the adjustment in
   the evidence. `ALLOW_CONSORTIUM` gates the API and the scripts, and with it unset the product runs
   with the network not consulted rather than degraded.

**The network of other tenants in this repository is synthetic.** There is one tenant. The other
tenants are generated deterministically by `packages/consortium/src/synthetic.ts`, off the same
`packages/seed` generator and the same seed 69 as the demo company, so that the demo's legitimate
supplier accounts carry months of sightings and the hard negatives carry none, every row is written
with `synthetic = true`, and every document and the demo itself say so out loud. Claiming a live
network of real companies would be the one Wizard-of-Oz move in a repository built to survive that
accusation.

### The exact reason the hot path reads a snapshot and never the warehouse

Four reasons, and each one alone is sufficient.

- **Purity.** `packages/core` takes values and returns values. A warehouse call inside a control
  would put a socket in the lane that exists because it has none, and it would end the property that
  a judge can run the engine with the Wi-Fi off. `NetworkSignal` is an argument for the same reason
  `Cep` and the SAT rows are arguments.
- **Determinism.** The same instruction has to score the same twice, in a unit test with no network
  and on a laptop with no key. A live cross-tenant query makes a decision about this company's money
  depend on whether another tenant happened to write a row in the last second, which is not a
  property anyone can test and not one a clerk can be asked to explain.
- **Latency and its billing.** Snowflake bills virtual warehouses per second with a 60-second minimum
  each time the warehouse starts, and an X-Small warehouse is 1 credit per hour. A decision measured
  in microseconds cannot be made to wait on a warehouse resume, and a design that resumes a warehouse
  per instruction would bill 60 seconds for each one. Reading the snapshot is a local index lookup
  and costs nothing.
- **Blast radius.** An API that can query the warehouse per request is an API that can be made to
  enumerate it. Nothing in `apps/api` holds a Snowflake credential on the read path: the only code
  that authenticates to Snowflake is a script a person runs.

The cost of this choice is stated rather than hidden: the signal is as old as the last pull. The
snapshot therefore carries `pulled_at`, the single-row `consortium_pull` records the source and the
row count, and the UI shows the age of the signal the way `docs/06` already requires for a CEP
verdict. A stale number that says when it was taken is usable evidence. A fresh number that arrives
500 ms late inside a decision is a worse product.

### Why Snowflake and not another schema on Tiger Data

We already run managed Timescale and adding a schema to it is the cheaper move, so this needs an
argument rather than a preference.

- **Cross-tenant is a different invariant.** The ledger is single-tenant by a database check
  constraint, and the whole reason that constraint is defensible is that nothing in it is ever read
  across customers. A cross-tenant table in the same database makes every future query one join away
  from another customer's data, and it makes the check constraint a comment rather than a rule.
- **Governed sharing is the product shape this has to grow into.** Snowflake Secure Data Sharing
  states that "no actual data is copied or transferred between accounts", the provider grants and
  revokes privileges on specific objects, and the consumer pays only for the compute it uses to query
  what it was granted. The version of this network that a real participant would accept is a share
  they can audit and have revoked, not a table in our Postgres they have to trust us about. Building
  it anywhere else means building that twice.
- **Separate blast radius, deliberately.** The warehouse holds no names, no amounts and no raw
  account numbers, and it sits behind its own credential, its own role and its own warehouse, in a
  different vendor from the ledger. A compromise of the API instance exposes one company's data and
  no network, and a compromise of the network exposes hashes of pairs and counts. Putting both in one
  Postgres would collapse that into one credential.
- **It is the right workload.** The push is an append of one row per registry outcome, the pull is one
  aggregate over every tenant's history, and both are batch, scanned by column, run a handful of
  times a day. That is a warehouse workload and not an OLTP one. The hot path stays on Postgres,
  where a single instruction is read by index in milliseconds, which is the Timescale decision of
  ADR-0003 unchanged.

Stated the other way around: this is not a sponsor costume. The rule in `docs/00-challenge.md` is
that a prize is worth an ADR and never a new infrastructure surface. The surface here exists because
the signal is cross-tenant and the ledger is not, and it would exist with no prize attached.

### What the incumbents actually sell, read on their own pages

Issue #164 frames the cross-company signal as the thing Trustpair and nsKnox sell. Their own public
material, read on 2026-09-12, says something narrower than that, and the narrower version is what
goes in the pitch.

| Who | What their own page says | What that means for us |
|---|---|---|
| Trustpair | "Access the market's most comprehensive network of global banking databases" and "Secure supplier database with continuous monitoring", across 190 countries | The network they sell is access to banking databases plus a per-customer supplier database, not a pooled signal across their customers |
| nsKnox | Validates "out-of-network accounts by going directly to the banking system" | "Out of network" implies an in-network set, and the page does not describe it as a consortium of customer data |
| Eftsure | "over 6 million verified businesses", already quoted with its source in `docs/04-market.md#competitor-map` | This is the closest published thing to a cross-customer register. The source `docs/04-market.md` cites is its Australian site, and it is sold to corporates |

So the defensible claim is this one, and it is the only one that may be said on stage or written in
the submission: a cross-customer register of payee accounts is something the corporate
payee-verification band already sells to treasuries, nobody sells it to a Mexican SMB, and the two
Mexican direct competitors in the same table hold no account data at all, so neither of them could
build one. Trustpair, nsKnox and Eftsure name neither Mexico, CFDI, SAT, SPEI nor CLABE anywhere we
could find on their sites, which is the row `docs/04-market.md` already carries.

## Consequences

- Positive: the n equals one case stops being the product's blind spot. A first payment to an account
  twenty other companies have paid for months reads differently from a first payment to an account
  nobody has seen, and the decision says which one it is.
- Positive: the business model gains the one mechanism it did not have. Every tenant that joins makes
  the signal better for every other tenant, and an accounting firm holding thirty companies joins
  thirty tenants at once, which is the distribution path `docs/05-business-model.md#gtm-who-sells-this-to-whom-and-through-which-channel`
  already sells.
- Positive: the privacy position is stronger than the feature. A network that needs no name, no amount
  and no raw account number to work is a better answer to the product judge than a network with a
  data processing agreement bolted on.
- Positive: the architecture rule survives contact with a cross-tenant feature. The network is in
  lane 2 of `docs/07-architecture.md`, next to the SAT loader and the CEP parser, and lane 3 is
  untouched.
- Negative: the signal is as old as the last pull, and the product has to show that age rather than
  imply freshness.
- Negative: a second vendor, a second credential and a second thing that can be down. Mitigated by the
  fact that nothing on the decision path needs it: `ALLOW_CONSORTIUM` unset means the finding says the
  network was not consulted.
- Negative: the salted hash is pseudonymisation and not anonymisation, and the limits of that are
  written in `docs/06-regulatory-privacy.md#8-the-consortium-network-what-leaves-the-tenant` rather
  than glossed.
- Negative: the network in the demo is synthetic, so the feature demonstrates a mechanism and not an
  installed base. Every document says so, which costs a sentence on stage and buys the credibility
  the rest of the demo runs on.
- Negative, and it cost a broken pull to find: the SQL REST API returns every value as a string
  whatever the column type, and a DATE as the number of days since the epoch rather than as
  `YYYY-MM-DD`. The first live pull therefore rejected all 46 rows and wrote an empty snapshot with
  `source = 'snowflake'`, which is the worst failure this signal has, because an empty snapshot reads
  as a network that was consulted and has never seen any of these accounts. The statement now formats
  both dates with `to_varchar` and the reader also decodes the epoch-day form. Anything added to the
  view later has to answer the same question about its own type.
- Follow-on work this creates: the aviso de privacidad has to name the consortium purpose before any
  pilot, the retention schedule has to cover `BENEFICIARY_EVENTS`, and `CONSORTIUM_SALT` has to stop
  being a documented constant the moment a second real tenant exists.
- What is now forbidden because of this: a Snowflake call from `apps/api` on a read path or from
  anything inside `packages/core` or `packages/engine`; a row written to `BENEFICIARY_EVENTS`
  carrying a name, an amount, a raw RFC or a raw CLABE; any claim, on stage, in the README, in the
  submission or in a screenshot, that the other tenants are real.

## Alternatives considered

| Alternative | Why not |
|---|---|
| A `consortium` schema in the same Tiger Data Postgres | Puts cross-tenant rows behind the single-tenant check constraint that makes every hot-path read safe, collapses two credentials into one, and still has to be rebuilt as a governed share the first time a real participant asks what we can see |
| A live Snowflake query inside the beneficiary control | Ends the no-IO property of `packages/core`, makes a decision non-deterministic and untestable, waits on a warehouse resume billed with a 60-second minimum, and hands the API a credential that can enumerate the network |
| The Snowflake Node SDK | A new dependency with a transitive tree, inside a three-day quarantine window, for an HTTP call Bun already makes. The JWT is `node:crypto` and the transport is `fetch` |
| A real multi-tenant network for the demo | There is one tenant and 36 hours. Inventing other companies' data and presenting it as real is the failure mode the judges said they are hunting. Synthetic and labelled is the honest version of the same mechanism |
| Private set intersection between tenants, the Cenote design | ADR-0002 already rejected it for this event: invisible cryptography, a three-institution cold start and an unproven three-party protocol under time pressure. It remains the right answer for a version where the operator must not see the pairs at all |
| MongoDB Atlas for the network | Named rather than skipped, like the row in `docs/07-architecture.md#deliberately-not-in-this-tree`. The pull is one columnar aggregate over append-only events, which is a warehouse shape, and adopting a document store for a second prize would be the costume we refused there |
| No network at all | Leaves the first payment to a new account scored on this company's history alone, which is the case the product most needs to get right |

## Revisit if

A second real tenant exists. At that point the salt stops being a constant in a document, the push
needs a per-tenant credential rather than one shared role, the read path becomes a Snowflake share
per participant rather than our own pull, and the consent position in
`docs/06-regulatory-privacy.md` stops being a `TODO` for counsel and becomes a signed agreement.

## Sources

Read on 2026-09-12.

| Source | Used for |
|---|---|
| Snowflake, SQL REST API overview and request handling, `https://docs.snowflake.com/en/developer-guide/sql-api/intro` and `/handling-responses` | The `/api/v2/statements` endpoint, the `202` plus polling behaviour, and that the result set is "encoded in JSON expressed as strings, regardless of the Snowflake data type of the column" with a DATE as an "Integer value (in a string) of the number of days since the epoch" |
| Snowflake, Virtual warehouses, `https://docs.snowflake.com/en/user-guide/warehouses-overview` | Per-second billing with a 60-second minimum each time a warehouse starts, and 1 credit per hour for an X-Small |
| Snowflake, Introduction to Secure Data Sharing, `https://docs.snowflake.com/en/user-guide/data-sharing-intro` | "no actual data is copied or transferred between accounts", provider-controlled grants, consumer pays compute only |
| Snowflake, Supported cloud regions, `https://docs.snowflake.com/en/user-guide/intro-regions` | An account is hosted in a single region, data stays in it, and a Mexico Central region exists |
| Trustpair, `https://trustpair.com/`, and nsKnox, `https://www.nsknox.net/` | The incumbent table above, quoted from their own pages |
