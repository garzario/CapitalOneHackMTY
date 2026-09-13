# @hackmty/consortium

The cross-tenant beneficiary network. One table and one view on Snowflake, a
local snapshot on Postgres, and a rule in `packages/core/src/network.ts` that
turns the snapshot into an input to the expected-loss decision.

Read this file before quoting the consortium in the pitch. Two of the sentences
below are the difference between a differentiator and a claim a judge can take
apart in thirty seconds.

## What the network is, and what it is not

It **is** a shared store of anonymised beneficiary outcomes: for one hashed
(supplier RFC, CLABE) pair, how many tenants have paid it, since when, until
when, and whether any of them reported it as fraud.

It **is not** real. SentryOne has one tenant, so there are no other companies to
aggregate. The network in this repository is generated deterministically from
seed 69 by `synthetic.ts`, every row carries `synthetic = TRUE` in the warehouse,
and that is said out loud on stage and in `docs/13-devpost.md` rather than left
for somebody to ask about. What is real is the mechanism: the hashing, the
warehouse, the aggregate, the pull and the arithmetic all run for real against a
real Snowflake account.

It **is not** on the hot path either. `packages/engine` reads a local snapshot
table filled by `bun run consortium:pull`, never the warehouse, so a payment
decision never waits on Snowflake and the demo works with the network unplugged.
That is also why the local snapshot carries `pulled_at`: a signal is only as
fresh as its last pull, and the screen says so.

## What leaves the tenant

Per event: a tenant hash, an RFC hash, a CLABE hash, the three-digit bank code
the CLABE already carries in public, one of `verified`, `paid`, `mismatch` or
`fraud_reported`, a calendar day, and the synthetic flag.

Never: a legal name, an amount, an invoice UUID, a clave de rastreo, a raw RFC or
a raw CLABE. `sync.test.ts` serialises the push payload and the SQL it becomes
and fails if any of those strings is in it, because that is the product claim and
a comment is not a test.

## The honest limitation of the hashing

The hashes are HMAC-SHA256 under one network-wide salt. The salt is what makes
them one way: a plain digest of an eighteen-digit CLABE is enumerable on a laptop
and would be a reversible encoding rather than a protection.

One salt for the whole network is not an accident. Two tenants can only agree
that they are paying the same account if their hashes agree, so a per-tenant salt
would make every row unjoinable and the consortium pointless. The cost is stated
here: whoever holds the salt and a candidate list of RFCs or CLABEs can confirm a
guess. The salt therefore belongs to the network operator, never to a tenant, and
the constant in `hash.ts` is a documented demo value. A production network
replaces it, rotates it, and a rotation invalidates every stored hash on purpose.
A deployment that needed to remove even that would use a two-party protocol
instead of a salt, which is the Cenote idea ADR-0002 rejected for this weekend.

## The Snowflake details, verified

Against the official docs on 2026-09-12:

- `POST https://<account>.snowflakecomputing.com/api/v2/statements`, with
  `Authorization: Bearer <jwt>` and
  `X-Snowflake-Authorization-Token-Type: KEYPAIR_JWT`. Without the second header
  the bearer is read as an OAuth token and refused.
- `200` carries `resultSetMetaData` and `data`; `202` carries `statementHandle`
  and is polled at `GET /api/v2/statements/<handle>`.
- The JWT is RS256 with `iss = <ACCOUNT>.<USER>.SHA256:<base64 of the SHA-256 of
  the public key DER>` and `sub = <ACCOUNT>.<USER>`, both upper case, dots in the
  account identifier replaced with hyphens, and an hour of life at most.
- Every value in `data` is a string or null, numbers included, so `sync.ts`
  parses rather than casts.

No SDK, no JWT library. RS256 and HMAC are `node:crypto`, which
`packages/cep` already imports, and `fetch` is injectable so the whole test suite
runs offline.

## Commands

```
bun run consortium:seed            # database, schema, table, view, and the synthetic network
bun run consortium:push            # this tenant's own outcomes, hashed
bun run consortium:pull            # fills consortium_snapshot from the warehouse
bun run consortium:pull --offline  # fills it from the deterministic synthetic network, no Snowflake
```

All four refuse unless `ALLOW_CONSORTIUM=1`. The first three also need
`SNOWFLAKE_ACCOUNT`, `SNOWFLAKE_USER` and `SNOWFLAKE_PRIVATE_KEY_PATH`, and they
say which one is missing rather than failing on a 401.
