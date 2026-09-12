# 09. API contract

Base path `/api/v1`. JSON in and out. Errors use one envelope: `{ "error": { "code": string, "message": string, "requestId": string } }`.
Codes: `bad_request` 400, `forbidden` 403, `not_found` 404, `unprocessable` 422, `rate_limited` 429, `internal_error` 500, `service_unavailable` 503.
`service_unavailable` is a capability this instance was not configured with rather than a request that is wrong, and it is distinct from `forbidden`, which is about who is asking. Only the consortium answers it today, when `ALLOW_CONSORTIUM` is unset.
All amounts in MXN. All timestamps ISO 8601. Every synthetic object carries `synthetic: true`.
Types are the ones in `packages/core/src/domain.ts`; the API never invents a second shape.

## Read

| Method | Path | Returns | Notes |
|---|---|---|---|
| GET | `/health` | `{ ok, service, version }` | liveness |
| GET | `/api/v1/run/current` | `PaymentRun` | this week's payment run: instructions, their decisions and findings, totals. Under `SEED=sentryone` the six controls are run over the generated company at boot, so the findings and the proposed actions on this payload are the engine's own output and not fixture rows. `Decision.decidedBy` stays absent on every line until a person confirms one |
| GET | `/api/v1/instructions/:id` | `{ instruction, decision, findings, supplier }` | detail panel |
| GET | `/api/v1/suppliers/:rfc` | `{ supplier, cfdis, complements, findings, verifiedBeneficiaries }` | supplier drawer |
| GET | `/api/v1/sat/lookup?rfc=` | `{ rfc, entries: SatListEntry[], listed, effective?, source }` | the judge types a real RFC here; read-only over the official list merged with any version this instance was posted. Rate limited per client |
| GET | `/api/v1/sat/versions` | `{ versions: [{ listVersion, publishedAt, rows }] }` | loaded list versions |
| GET | `/api/v1/beneficiaries` | `{ items: [{ supplierRfc, clabe, cep, verifiedAt }] }` | verified beneficiary registry |
| GET | `/api/v1/consortium/signal?rfc=&clabe=` | `{ rfc, clabe, network: NetworkSignal }` | what the SentryOne consortium holds for one beneficiary pair, read from the LOCAL snapshot and never from Snowflake. Both halves of the pair are required. `503 service_unavailable` when `ALLOW_CONSORTIUM` is unset, `404 not_found` when the network has never seen the pair or when nothing has been pulled. See "The consortium, and what the network can say" below |
| GET | `/api/v1/metrics` | `Metrics` | blind evaluation, recomputed on demand |
| GET | `/api/v1/ledger?since=` | `{ events: LedgerEvent[] }` | append-only ledger, for the timeline |
| GET | `/api/v1/sat/constancia?listVersion=` | `application/pdf` | constancia of the retroactive sweep for one loaded list version |
| GET | `/api/v1/run/:id/constancia` | `application/pdf` | constancia of one weekly payment run. `current` is accepted as the id |
| GET | `/api/v1/instructions/:id/verify-call` | `{ script, voiceConfigured, releasesPayment: false }` | the words the voice agent reads, or the clerk does. Side effect free: no call is placed and nothing is appended |

`PaymentRun` = `{ id, weekOf, totals: { instructions, amount, held, toVerify, released }, items: Array<{ instruction, supplier, decision, findings }> }`.

### The lookup box, in detail

`GET /api/v1/sat/lookup?rfc=` is the only endpoint that reads real data, so it is specified here rather than left to the table.

- The RFC is normalised before validation: upper-cased and stripped of spaces, dots, slashes, underscores and hyphens. `&` and `Ñ` are kept, because both are legitimate in the name portion of a moral person's RFC. `rfc` in the response is the normalised form, so the screen echoes what was searched.
- `listed` is true only when the newest situation is `presunto` or `definitivo`. A taxpayer who was published and then cleared their name is not listed, and `entries` still carries the whole history so a clerk can see both rows.
- `effective` is the newest row, absent when the RFC appears on no version we hold.
- `source` names the snapshot that answered: `{ listVersion, retrievedAt, url, taxpayers, rows }`. It is present on an empty answer too, so "not listed" can never be read as "no list was loaded".
- Rate limited per client: 30 requests per minute, answered with `429 rate_limited` plus `Retry-After`. Every response carries `RateLimit-Limit`, `RateLimit-Remaining` and `RateLimit-Reset`. The counter is per process and keyed on the forwarded client address, which is caller-controlled: it stops one machine enumerating the list, and it is not a defence against a distributed client.
- Nothing on this path touches a synthetic invoice. ADR-0002 keeps a real RFC to this box and to nothing else.

## Write

| Method | Path | Body | Effect |
|---|---|---|---|
| POST | `/api/v1/instructions` | `{ supplierRfc?, cfdiUuids?, clabe?, amount, source, text?, image? (base64), audio? (base64) }` | intake from the QR page. Runs all detectors, stores the instruction, findings and decision, returns them. If `image` or `audio` is present the CLABE is extracted first and `ocrConfidence` set, and a voice-note transcript lands in `text`; a typed `clabe` always wins over one a model read. Extraction is transcription only (`packages/extract`, docs/06 section 6.2.1). A server with no `GEMINI_API_KEY` answers 422 `unprocessable` and says so. |
| POST | `/api/v1/instructions/:id/decide` | `{ action: "hold" \| "verify" \| "release", decidedBy }` | a person confirms. Appends `decision_made`. |
| POST | `/api/v1/sat/publish` | `{ listVersion, entries: SatListEntry[] }` or `{ simulate: true, rfcs: string[], status? }` | loads a list version (or simulates one for the demo, synthetic RFCs only) and runs the retroactive sweep over everything the ledger says is already paid. `status` is one of the four `SatListStatus` values and defaults to `presunto`; the demo publishes `definitivo`, which is the status that voids the deductions. Returns `SweepResult`. |
| POST | `/api/v1/cep/verify` | `{ claveRastreo, date, amount, senderBank, beneficiaryBank, beneficiaryAccount, supplierRfc }` or `{ xml, supplierRfc }` | retrieves or accepts the CEP, checks the Banxico seal, compares the holder name with the supplier legal name, stores the evidence. Returns `{ cep, nameMatch: "match" \| "partial" \| "mismatch", finding }`, where `finding` is the `beneficiary_cep` finding `packages/engine` authors, or `null` when no pending payment goes to that account. See "The CEP, and what verify can prove" below. |
| POST | `/api/v1/instructions/:id/verify-call` | `{ toNumber }` or `{ conversationId }` or `{ outcome, evidence?, recordedBy }` | the verification call to the supplier. `toNumber` rings them through the voice agent and answers `202 { status: "calling", conversationId, script }`; `conversationId` collects a finished call, parses the transcript and appends `verification_call`; `outcome` records a call a person made by hand. Never releases a payment: the response always carries `releasesPayment: false` and no `decision_made` is ever appended. When `ELEVENLABS_API_KEY`, `ELEVENLABS_AGENT_ID` or `ELEVENLABS_PHONE_NUMBER_ID` is missing it answers `422` with the usual error envelope **plus** a `script` key, so the clerk reads it on their own telephone. |
| POST | `/api/v1/seed` | `{ seed?: number, reset?: boolean }` | regenerates the demo company from `seed`, on either store. Dev only, guarded by `ALLOW_SEED=1`, and a 403 rather than a 404 when it is off, because hiding a destructive endpoint makes it harder to notice when a deployment enables it. There is no way to add to the company without replacing it, so `reset: false` is answered `422` rather than ignored: wiping a store for a caller who asked us not to is the one thing here nobody could undo. |

### The CEP, and what verify can prove

`POST /api/v1/cep/verify` is the endpoint most able to make a claim it has not earned, so the three
ways into it and the one thing it refuses to say are written out here rather than left to the table.
All four steps live in `packages/cep` and the finding comes from `packages/engine`; `apps/api` only
decides which way applies. `src/cep.ts` holds that wiring.

- **A pasted CEP is always accepted.** `{ xml, supplierRfc }` is parsed by `parseCep` and needs no
  key, no certificate and no network, so it works on a laptop with an empty `.env`. This is the
  primary path and the one the demo uses: a clerk downloads the XML their own bank or
  banxico.org.mx/cep handed them and pastes it. The registry is not consulted, because a person
  pasting a document is handing us evidence rather than asking what we already hold.
- **The `claveRastreo` form reads the registry first and the portal second.** An account a one-cent
  probe already verified is answered from what we hold, so the demo does not depend on a public
  government service being up. Only a miss reaches Banxico.
- **Retrieval from Banxico is opt-in, with `ALLOW_CEP_FETCH=1`.** The portal is an undocumented
  two-step form behind a CAPTCHA and a per-address rate limit (`packages/cep/src/fetch.ts` says so
  at the top), so an API that POSTed to it on every click would be worse for the demo and worse for
  the service. With the flag off, a miss answers `422` naming the flag and telling the clerk to paste
  the XML. With it on, the portal's four known failure sentences come back as `422` with a sentence a
  clerk can act on, and never as a `500`.
- **It is not a lookup over other people's payments**, which is the product rule in
  `docs/06-regulatory-privacy.md` section 6.4. The body the portal needs is the date, the clave de
  rastreo, both participants, the beneficiary account and the exact amount to the centavo, and that
  is confidential information only a party to the transfer holds. The endpoint takes no broader
  query, so there is no shape of request that turns it into a general search.
- **The seal is checked when, and only when, `BANXICO_CEP_CERT_PEM` is configured.** The CEP carries
  the serial of the Banxico certificate and not the certificate itself, so `verifySignature` has to
  be handed one out of band. With none, the document keeps the `signatureValid: false` and
  `signatureReason: "not_checked"` that `parseCep` wrote. What never happens is a
  `signatureValid: true` nobody earned.
- **`not checked` is not `invalid`.** `not_checked`, `unconfirmed_scheme` and `invalid_certificate`
  all mean the seal could not be proven, and the UI renders them as "firma no verificada"; only a
  defect in the document itself (no `sello`, a `sello` that is not base64 or not RSA-2048, no
  `cadenaCDA`) or a `signature_mismatch` reads as invalid. `UNPROVEN_SEAL_REASONS` in
  `packages/engine/src/beneficiary.ts` is where that line is drawn, and the severity of the finding
  follows it: accusing a supplier's document because this server holds no certificate would be our
  mistake printed as their fault.

### The consortium, and what the network can say

`GET /api/v1/consortium/signal?rfc=&clabe=` is the second endpoint able to make a claim it has not
earned, so its three states are written out here rather than left to the table. Everything it
answers comes out of the local `consortium_snapshot` table, filled by `bun run consortium:pull`; the
plumbing lives in `packages/consortium` and its README carries the privacy argument in full.

- **It is never on the hot path.** The engine reads the same snapshot through the repository, so a
  payment decision never waits on a warehouse and the demo works with the network unplugged. That
  is a property a judge can test by unplugging it.
- **`503 service_unavailable` names the flag.** With `ALLOW_CONSORTIUM` unset the route exists and
  this instance will not answer it, which is a different statement from a 404 that pretends the
  endpoint is not there. The message names the variable.
- **`404 not_found` says which of two things happened.** Either nothing has ever been pulled here,
  and the message names `bun run consortium:pull`, or the network was consulted and holds nothing
  for this pair, and the message says that is an answer and not a failure.
- **A `200` with `tenants: 0` is a real answer.** `NetworkSignal.source` separates
  `not_consulted`, which is the network nobody read, from `snapshot`, which is the network that
  answered. Zero tenants on a `snapshot` means the network has never seen this account, and
  `otherAccounts` then says how many accounts it does hold for that supplier, which is the
  impersonation case: forty companies pay this supplier, and none of them pays it here.
- **There is no request shape that lists a supplier's accounts.** Both the RFC and the exact
  eighteen-digit CLABE are required, so only somebody who already holds both can ask, exactly like
  the CEP endpoint. No listing, no prefix match, no "which accounts does this supplier have". The
  rule is `docs/06-regulatory-privacy.md` section 6.4 and a route test asserts all three refusals.
- **Nothing personal is in the answer.** The warehouse holds salted HMAC-SHA256 hashes of the
  normalised RFC and CLABE, a three-digit bank code that is printed on every SPEI receipt, dates,
  counts and one of four outcomes. No name, no amount, no invoice, no clave de rastreo.
- **The network in this repository is synthetic and the docs say so.** SentryOne has one tenant, so
  the other tenants are generated deterministically from seed 69 with `synthetic = TRUE` on every
  warehouse row. The mechanism is real, the other companies are not, and `consortium_pull.source`
  says `snowflake` or `synthetic` so no screen can confuse the two.

### The constancias

Two endpoints answer with a PDF rather than JSON, because the accountant files the document and reads it again when the SAT asks. They are the only non-JSON responses in the API.

- `Content-Type: application/pdf`, `Content-Disposition: inline` with a filename, and `Cache-Control: no-store`. A constancia is a statement about a moment, and a cached one would hand back yesterday's exposure after a new list version landed.
- The sweep constancia carries the company, the list version and its DOF publication date, where the snapshot came from, how many suppliers were checked against it, the newly listed suppliers with their deducted base and ISR plus IVA exposure, and the digest of the ledger range.
- The run constancia carries the company, the run and its week, the number of instructions and the amount reviewed, the resolution counts, one row per instruction and the full explanation of every finding, and the same digest block.
- Both print a SHA-256 digest of the canonicalised ledger range they describe. The page calls it a huella and states, on the document, that it is not an electronic signature: it proves two printings of the same range describe the same facts, and it does not prove who produced the file.
- A version or a run this instance never held answers `404 not_found`. A constancia for something that does not exist would be a fabricated document.
- Synthetic figures are watermarked on the page itself, from `synthetic: true` on the record.

## Streaming

`GET /api/v1/events` is Server-Sent Events. Every appended `LedgerEvent` is pushed as `event: ledger`, so the payment-run screen and the sweep animation update without polling.

## Curl a judge can paste

The ids are the seeded ones from `docs/10-demo-script.md`, which `bun run demo` prints. A local
instance is `SEED=sentryone bun run dev` in `apps/api`, which serves the generated company from
memory; with a database it is `bun run migrate && bun run seed` once and then
`DATABASE_URL=postgres://... bun run --filter '@hackmty/api' dev`, which serves the same company
out of Postgres. The boot log says which of the two is live.

```bash
curl -s 'https://<host>/api/v1/sat/lookup?rfc=AAA080808HL8' | jq
curl -s https://<host>/api/v1/instructions/INS-2026-09-07-047 | jq '.findings[0].evidence'
curl -s -X POST https://<host>/api/v1/instructions -H 'content-type: application/json' \
  -d '{"supplierRfc":"SYN990202S02","amount":38417.48,"clabe":"012180101391764613","source":"whatsapp"}' | jq
curl -s -X POST https://<host>/api/v1/sat/publish -H 'content-type: application/json' \
  -d '{"simulate":true,"rfcs":["SYN080910HI8"],"status":"definitivo"}' | jq '.totalExposure'
# The consortium, for one beneficiary pair. Both halves are required, and the answer comes
# out of the local snapshot: this call reaches no warehouse and works with the network down.
curl -s 'https://<host>/api/v1/consortium/signal?rfc=SYN980101S01&clabe=072180100000000007' | jq '.network'
# A CEP the clerk pasted. jq -Rs turns the file into one JSON string, newlines and all,
# because the signature is over bytes and a re-serialised document is a different document.
jq -Rs '{xml: ., supplierRfc: "SYN201123S23"}' packages/cep/src/fixtures/synthetic-cep.xml \
  | curl -s -X POST https://<host>/api/v1/cep/verify -H 'content-type: application/json' \
    --data-binary @- | jq '{nameMatch, seal: .cep.signatureReason, finding: .finding.severity}'
```

## Where the 69-B rows a control sees come from

Two sources, and the difference is binding under ADR-0002. `sat_69b` is handed the versions this
instance has been posted, plus the rows the committed official snapshot holds **for that one RFC**.
Every supplier in the seeded company is synthetic and a synthetic RFC is on no real list, so the
official snapshot contributes nothing to any of them and a real RFC never stands next to a
fabricated invoice. What the second source buys is that an instruction naming an RFC that is on the
official list is caught by the control rather than only by the lookup box.

## Nessie, verified quirks

HTTPS only. Docs at https://prod.nessieisreal.com/docs, API base https://api.nessieisreal.com. Auth is `?key=` in the query string. Our team key lives in each teammate's local `.env` (never in the repo or the chat); it was validated with a write on 2026-09-12 (POST /customers returned 201). `403 {"message":"Missing Authentication Token"}` means wrong path, not a bad key. An invalid key returns `200 []` on reads and `401` only on writes: validate the key with a write before the demo. Sub-collections live under `/accounts/{id}/{purchases,bills,deposits,withdrawals,loans,transfers}`; there is no top-level `/bills`, `/loans`, `/purchases` or `/withdrawals`. Empty sub-collections are inconsistent (`200 []` or a `404` with a bare string body): map 404 to `[]`. Dates are `YYYY-MM-DD` with no time. `amount` mixes int and float. `_id` mixes UUID and ObjectId. `/enterprise/*` is a shared pool contaminated by other teams: never compute on it. In SentryOne, Nessie is the company's bank mirror: `bank_reconciliation` compares outflows against instructions and CFDIs and flags payments with no document behind them.

Three more quirks, verified with our own key on 2026-09-12 while seeding that mirror. `POST /merchants` wants `category` as a bare STRING and answers `400 category str type expected` for the array that `GET /merchants` hands back. An address `state` may be at most two characters on a create, so "Nuevo Leon" is refused and "NL" is not. And a purchase `amount` is stored as a whole number: a row posted at 31320.50 reads back as 31320, which is why the reconciliation tolerates a shortfall of under one peso per row, and why the exact centavos live in `ledger_tx` and never in the mirror.

### The bank mirror, pushed with our key

`bun run nessie:mirror` seeds the company's bank mirror into Nessie and reads it back. What goes up is the BANK MIRROR and nothing else: one purchase per outflow that has already settled on the company's account, newest `--limit` first, 200 of 2446 by default on seed 69. Never the pending instructions of the current payment run, which have not left the account and have no business on a bank statement. Around those rows it creates one customer built from the trade name, one Checking account ("Cuenta operativa SPEI", whose 16-digit account number is derived from the CLABE and is deliberately not the CLABE), and one merchant per supplier in the `proveedores` category. Purchases and not bare withdrawals: a purchase carries a payee and a withdrawal does not, and a bank mirror with no payee cannot be reconciled against a supplier. In substance these are the settled withdrawals and transfers of the account, dated, signed outwards, with the beneficiary named, and they are the same shape `packages/seed` already builds, so the read-back runs through the same `normalizePurchase` the live import uses. The mirror is read at `GET /accounts/{id}/purchases`. Every date on it is a Monterrey calendar day with no time, because that is all Nessie can hold; the intraday order is ours.

The POST that creates the customer is what validates the key, since an invalid key answers `200 []` on every read. The instant it was accepted goes to the gitignored `.seed/nessie.json` as `keyValidatedAt`, next to `keyFingerprint`: the first twelve hex characters of SHA-256 over the key that made it, never the key. `bun run doctor` computes the same fingerprint over the key in `.env` and is green only when the two agree, because an instant on its own says that SOME key once wrote, which is not what a teammate holding a rotated key needs to hear. The state file also records the `--limit` the account was pushed with, and the verify pass reconciles against exactly that set: a later run with a narrower default must not report the rest of the account as missing days.

`--import` replaces the generator's `ledger_tx` rows for the company account with the rows Nessie answered, scoped by account and by source, and the delete and the insert run inside one transaction so a failure between them cannot leave the company with a ledger shorter than its bank. It needs `--limit=0`, because the import replaces the mirror rather than adding to it, and the imported rows carry the bank's whole-peso amounts. It refuses outright when the push reported failures, when the read-back threw or was partly rejected, or when the reconciliation reported any differing day: a replacement built on a partial push is a ledger that is quietly short of the bank, and every rolling baseline the engine computes off it moves with it.

A re-seed undoes an import, on purpose and without doubling anything. `bun run seed` loads the company through `PostgresRepository.load`, which deletes the company account's `ledger_tx` rows by account id and writes the generator's mirror back, so after a `bun run seed` the ledger holds the generator's rows with their exact centavos again and `bun run nessie:mirror --import --limit=0` has to run once more to put Nessie's whole-peso rows back. The row count for the account equals the generator's mirror either way.
