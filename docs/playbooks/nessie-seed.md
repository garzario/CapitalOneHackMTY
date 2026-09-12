
# nessie-seed

Deterministic synthetic data is the foundation of the technical-depth score in this repository, and
it is also what makes every demo repeatable. Generate it, do not improvise it.

## Procedure

1. Read the Nessie quirks block in `AGENTS.md`. **Do not re-explore the API**, it is already
   mapped, and rediscovering it costs an hour and teaches nothing new.
2. Require `NESSIE_API_KEY` from `.env`. Base URL is `https://api.nessieisreal.com`, HTTPS only,
   because plain HTTP is refused at the connection level. Auth is `?key=` as a query parameter,
   with no headers.
3. Preflight `GET /accounts?key=...`. A `403 {"message":"Missing Authentication Token"}` means a
   wrong path, not a bad key. Never regenerate the key on that signal.
4. Generate with `packages/seed` using a fixed RNG seed, so every teammate and every rerun gets
   byte-identical data. Order: N customers, then accounts, then merchants, then per account the
   purchases, deposits, withdrawals and bills. Mexican realism is the point: quincena income on the
   15th and the last day of the month, lognormal amounts, high-frequency small cash spend,
   recurring utility and telecom bills, a weekend spike, a refund, a duplicate merchant name, and
   one missing category.
5. POST in dependency order, retry 5xx with backoff, and record every returned `_id` to
   `.seed/ids.json`, which is gitignored, plus a human-readable table into
   `docs/10-demo-script.md`.
6. Mirror everything into the local ledger through `packages/db` with real `timestamptz`. Nessie has
   no time component at all, so anything intraday must come from our own store. Say that out loud
   when a judge asks how the real-time part works, because it is the honest and the stronger answer.
7. Seed only through key-scoped endpoints. **Never write anything identifying to `/enterprise/*`**,
   which is a world-readable pool shared with every other team at the event, and never compute on
   it, because it is contaminated with other teams' near-duplicate rows.
8. Be idempotent: detect an existing seed through `.seed/ids.json` and skip, unless `--force` is
   passed.
9. `--reset` uses Nessie's data-reset endpoint plus truncating the local tables. Confirm
   interactively first. It is destructive and there is no undo.
10. Print a summary: counts per entity, the date range covered, the three demo account IDs, and the
    single hero account the demo opens on.
11. Assert the invariants as a test in `packages/seed/src/generator.test.ts`: balances reconcile
    with the transaction sum, there are no future dates, and every referenced `merchant_id` exists.
    A judge asking what happens with dirty data is the easiest question in the world when the answer
    is a test name.

## Failure modes worth recognising immediately

- `403 {"message":"Missing Authentication Token"}` is a wrong path. Check for a top-level `/bills`,
  `/loans`, `/purchases` or `/withdrawals`, none of which exist.
- `/accounts/{id}/transfers` returns 404 with a bare JSON string on an empty collection while
  others return `200 []`. Map 404 to `[]` in `packages/nessie`, never at the call site.
- `amount` mixes int and float, and `_id` mixes UUID and ObjectId. Never compare amounts with
  strict equality and never validate an ID shape.
