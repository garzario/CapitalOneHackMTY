# 09. API contract, and the verified Nessie quirks

Two halves. Our own contract, which a judge should be able to curl from their laptop. And the Nessie
behaviour we verified on 2026-09-11, so nobody rediscovers it at 03:00.

Owner: Fabian (`fabbyyyy`). Due M2.

## Our contract

Base URL: TODO(fabbyyyy), the deployed origin from ADR-0005. Local is `http://localhost:3000`.
Auth: none in the prototype, because the data is synthetic. Stated out loud in the demo.
Validation: every request body and query is validated with `zod` through `@hono/zod-validator`, and
the schema is the contract.

### Endpoints

TODO(fabbyyyy): replace these placeholder rows once ADR-0002 closes. Keep the shape: one read
endpoint for the ledger, one compute endpoint that returns ranked results with a reason per item,
one streaming endpoint for the demo's key moment, and one health endpoint.

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/health` | Liveness plus which database path is live, Timescale or plain Postgres |
| GET | `/api/accounts/:id/ledger?from=&to=` | Normalized ledger rows for one account in a window |
| POST | `/api/<compute>` | The engine's ranked output, with a reason per item |
| GET | `/api/<compute>/stream` | The same computation, streamed as results are produced |

### Copy-pasteable examples

Every example in this file must actually run. If it does not, it is a bug in this file.

```bash
curl -s http://localhost:3000/api/health
```

```json
{ "ok": true, "db": "timescale", "migrations": ["0001_init", "0002_timescale"] }
```

```bash
curl -s "http://localhost:3000/api/accounts/TODO_HERO_ACCOUNT_ID/ledger?from=2026-06-01&to=2026-09-01"
```

```json
{
  "account_id": "TODO_HERO_ACCOUNT_ID",
  "count": 0,
  "rows": [
    {
      "id": "00000000-0000-0000-0000-000000000000",
      "occurred_at": "2026-08-30T14:21:00.000Z",
      "amount": 1840.50,
      "direction": "debit",
      "merchant_id": "TODO",
      "category": "TODO",
      "source": "seed"
    }
  ]
}
```

TODO(fabbyyyy): fill the real hero account ID printed by `bun run seed`, and keep it identical to the
one in `docs/10-demo-script.md`. Drift between those two files is how a demo dies.

### Error shape

One shape for every error, so the UI has one branch.

```json
{ "error": { "code": "bad_request", "message": "from must be an ISO date", "field": "from" } }
```

| Status | `code` | When |
|---|---|---|
| 400 | `bad_request` | Validation failed. `field` names the offending input |
| 404 | `not_found` | Unknown account or resource |
| 422 | `insufficient_data` | The account exists but has too few rows for the computation to be meaningful. The engine says so rather than returning a confident number |
| 500 | `internal` | Unexpected. Never leaks a SQL string or a stack trace |

`insufficient_data` is a deliberate product decision, not an error path we forgot. An engine that
returns a forecast from four transactions is the kind of thing the judges are probing for.

## Nessie, verified 2026-09-11

Everything below was probed live. `packages/nessie` is the only code in the repo allowed to call it.

- **HTTPS only.** `http://api.nessieisreal.com` is refused at the connection level.
- **Base URL** is `https://api.nessieisreal.com`. The documentation site is a separate React
  application at `https://nessieisreal.com`.
- **Auth is `?key=<NESSIE_API_KEY>` in the query string.** No headers, no bearer token.
- **`403 {"message":"Missing Authentication Token"}` means the path is wrong, not the key.** It is
  API Gateway's route-not-found. Do not regenerate the key.
- **Key-scoped collections:** `/customers`, `/accounts`, `/merchants`, `/branches`, `/atms`.
- **Sub-collections, which is where the money is:**
  `/accounts/{id}/purchases`, `/bills`, `/deposits`, `/withdrawals`, `/loans`, `/transfers`.
- **There is no top-level `/bills`, `/loans`, `/purchases` or `/withdrawals`.** They all return the
  403 route-not-found.
- **Empty sub-collections are inconsistent.** Some return `200 []`. `/accounts/{id}/transfers`
  returns `404` with a **bare JSON string** body, not an object.
- **Dates are `YYYY-MM-DD` with no time component.** Intraday velocity cannot be computed from
  Nessie-native fields. Our own ledger holds `timestamptz`. This is an architecture consequence, not
  a nuisance.
- **`amount` mixes integers and floats** in the same field, for example `46`, `320`, `450.0`.
- **`_id` mixes UUID and Mongo ObjectId** shapes. Seeded data is UUID, legacy static data is
  ObjectId. Never validate the shape.
- **`status` is observed as `completed` and `pending`**, not the `executed` or `cancelled` of older
  documentation. Treat it as an open string set.
- **`customer.account_ids` back-reference is not maintained.** Do not rely on it.
- **`/enterprise/*` is a global pool shared with every other team at this event and is already
  contaminated.** Observed on 2026-09-11: 65 customers, 126 accounts, 45 merchants of which 41 carry
  the category `food`, 118 bills, 4 transfers, 123 deposits. Never compute analytics on it. Never
  post anything identifying into it. Read only our own key's data.

### Normalization rules the adapter must implement

| Nessie behaviour | Adapter rule |
|---|---|
| `404` on an empty sub-collection | Map to `[]` |
| A bare JSON string as a body | Tolerate it. Parse defensively, never assume an object |
| `amount` as int or float | Parse as a number, store `numeric(14,2)`, compare with a tolerance |
| `_id` of any shape | Carry it as an opaque string. We mint our own `uuid` primary keys |
| Date with no time | Supply the time component from our own ledger, and say so in the demo |
| `status` unknown value | Pass through, do not reject |
| 5xx or a network error | Retry with backoff, bounded, then fail loudly with the URL and the status |
| Unit tests | Run against recorded fixtures in `packages/nessie/src/fixtures/`. **No network in CI**, ever |
