# apps/api

The Hono transport for SentryOne. It reads a request, validates it, delegates, and
shapes a response. Nothing in here decides anything.

The contract is `docs/09-api.md` and the types are
`packages/core/src/domain.ts`. Those two files win every argument: if a shape in
this workspace disagrees with them, this workspace is wrong.

## Layout

```
src/
  index.ts                 entry point, { port, fetch }, nothing testable
  app.ts                   createApp(deps), the route tree, the error envelope
  deps.ts                  ApiDeps: repository, broadcaster, clock, emit()
  http.ts                  the one error envelope and the zod rejection hook
  schemas.ts               every request and response as a zod schema
  repo.ts                  Repository interface and MemoryRepository
  postgres-repo.ts         the same interface over @hackmty/db, live on DATABASE_URL
  sentryone.ts             the generated demo company, for the in-memory path
  assess.ts                the six controls over a whole run, at boot and at load
  synthetic.ts             the seeded payment run the UI is built against
  pipeline.ts              intake, the retroactive sweep, calls into core
  extraction.ts            the seam to @hackmty/extract, refuses without a key
  cep.ts                   the seam to @hackmty/cep: accept, retrieve, check the seal,
                           and the inbox that finds a CEP by clave de rastreo
  verification.ts          the one-cent pipeline: rail, CEP, engine, and the
                           VerificationState folded out of the ledger
  events.ts                the SSE broadcaster (fan-out, not the route)
  middleware/request-id.ts correlation id on every response
  middleware/rate-limit.ts per-client budget, only on GET /sat/lookup
  routes/
    health.ts              GET /health
    run.ts                 GET /api/v1/run/current
    instructions.ts        GET :id, POST /, POST :id/decide
    verify-call.ts         GET and POST :id/verify-call, the voice agent
    verify-account.ts      POST :id/verify-account and GET :id/verification,
                           the one-cent verification
    suppliers.ts           GET /api/v1/suppliers/:rfc
    sat.ts                 GET lookup, GET versions, POST publish
    cep.ts                 POST /api/v1/cep/verify
    beneficiaries.ts       GET /api/v1/beneficiaries
    metrics.ts             GET /api/v1/metrics
    ledger.ts              GET /api/v1/ledger
    events.ts              GET /api/v1/events, Server-Sent Events
    constancia.ts          GET sat/constancia and run/:id/constancia, both PDF
    seed.ts                POST /api/v1/seed, guarded by ALLOW_SEED=1
  test-app.ts              test wiring, imported only by *.test.ts
```

One file per route group, and each group is a factory that takes `ApiDeps`. There
is no module-level singleton, which is why a test can build an app with its own
repository and two tests never see each other's writes.

## The two repositories

`bootRepository()` in `deps.ts` picks one and the boot log says which.

- **`DATABASE_URL` set**: `PostgresRepository` over the query layer in
  `packages/db`. Every endpoint in `docs/09-api.md` is then answered out of the
  event ledger, the hypertables and the continuous aggregates, and `bun run seed`
  is what wrote them. Not one file in `src/routes` changed to get there, which is
  what the `Repository` interface existed to prove.
- **no database**: `MemoryRepository`, on the generated demo company under
  `SEED=sentryone` and on the hand-written fixture otherwise.

The two are asserted against each other in `postgres-repo.test.ts`, on the same
seed: same run id, same week, same totals, same ordered lines, same findings and
the same action per line. That suite runs only when `TEST_DATABASE_URL` names a
database it may empty, and it has been run against the local PostgreSQL 18 on
5432 and against the managed TimescaleDB 2.30 service on Tiger Data, which is the
pair ADR-0003 names.

## The four rules this workspace lives under

1. **No `bun:*` import outside a test.** ADR-0005 puts the API on the Vercel Node
   runtime. `bun:sqlite`, `bun:ffi` and `Bun.serve` specifics are not available
   there. Bun stays the package manager, the script runner and the test runner.
2. **No business logic.** Anything that weighs evidence or prices risk belongs in
   `packages/core`. Money arithmetic goes through core's cent-safe helpers, never
   through `+` on a float.
3. **One error envelope.** `{ error: { code, message, requestId } }`, built only
   in `http.ts`. No stack trace, no driver message and no path on the wire.
4. **Nothing is invented.** Where a real implementation is missing, the endpoint
   refuses with a message that names what is missing. A fabricated finding or a
   `signatureValid: true` that nobody checked is worth less than a 422.

## The synthetic dataset

`MemoryRepository` is seeded from `synthetic.ts`: one company, 8 suppliers, 15
CFDI, 3 payment complements, 12 payment instructions, 8 findings, 12 decisions, 2
SAT list versions, 1 verified beneficiary and 47 ledger events. Every object
carries `synthetic: true` and every RFC starts with `SYN`, so ADR-0002 holds: no
real RFC ever stands next to fabricated evidence. The only real RFCs in the
product arrive through `GET /api/v1/sat/lookup`, which reads the official list.

The run is deliberately mixed: 3 held, 4 to verify, 5 released, 1,369,901.55 MXN
in total. The labelled cases behind `GET /api/v1/metrics` give 4 true positives, 3
false positives and 1 miss, so precision is 4/7 and recall is 0.8. A fixture that
scored 1.00 would teach the UI nothing and convince no judge.

The findings in the fixture are hand-written examples of the shape. They are not
detector output, which is why `pipeline.ts` feature-detects `composeFindings` in
`@hackmty/core` instead of importing a placeholder that would then race the real
implementation.

## What is deliberately not here

Everything this table used to list as missing has landed: the six detectors and the
expected-loss model (#34, #36, #38, #39), the SAT list loader and sweep (#35), CEP
retrieval, parsing and the seal check (#37), the CLABE read off a photo (#97), the
holdout harness behind `GET /api/v1/metrics` (#55) and the generator behind
`POST /api/v1/seed` (#43). What is genuinely still open is short, and the two
unnumbered rows are deployment concerns rather than product ones.

| Gap | Issue | Owner | Where |
|---|---|---|---|
| The Banxico certificate the CEP seal is checked against, and the signature scheme itself | #57 | `TODO(fabbyyyy)` | `BANXICO_CEP_CERT_PEM`, `CEP_SIGNATURE_SCHEME_CONFIRMED` in `packages/cep` |
| Blob storage for an intake image | | `TODO(fabbyyyy)` | `pipeline.ts` |
| Cross-instance SSE fan-out | | `TODO(fabbyyyy)` | Postgres `LISTEN`/`NOTIFY` in `events.ts` |

The certificate row is the one to read before quoting this API in the pitch. With no
certificate, `POST /api/v1/cep/verify` answers `signatureReason: "not_checked"`, and
even with one `verifySignature` reports `unconfirmed_scheme`, because Banxico
publishes no specification of the scheme. Both render as "firma no verificada" and
neither is ever rendered as "firma invalida".

Swapping the repository is one line in `bootRepository()`. If a detector or a
Postgres query forces a change inside `src/routes`, the `Repository` interface is
wrong and it is cheaper to fix it than to work around it.

## Running it

```
bun install --frozen-lockfile
bun run --filter '@hackmty/api' dev      # http://localhost:3000
bun test                                 # 163 tests, no socket, no database
bun run typecheck

TEST_DATABASE_URL=postgres://localhost:5432/sentryone_test bun test   # and the Postgres suite
```

The route suite drives the app through `app.request()`, including the SSE
stream, so it needs no port and no Postgres. `postgres-repo.test.ts` is the
opt-in half and is skipped unless `TEST_DATABASE_URL` names a database it may
empty; `DATABASE_URL` is deliberately not a fallback, because a run on a laptop
set up for a rehearsal would otherwise wipe the demo company.

```bash
curl -s localhost:3000/api/v1/run/current | jq '.totals'
curl -s 'localhost:3000/api/v1/sat/lookup?rfc=SYN020202BBB' | jq
curl -s -X POST localhost:3000/api/v1/sat/publish \
  -H 'content-type: application/json' \
  -d '{"simulate":true,"rfcs":["SYN010101AAA"]}' | jq '.totalExposure'
curl -N localhost:3000/api/v1/events
```
