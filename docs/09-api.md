# 09. API contract

Base path `/api/v1`. JSON in and out. Errors use one envelope: `{ "error": { "code": string, "message": string, "requestId": string } }`.
Codes: `bad_request` 400, `forbidden` 403, `not_found` 404, `unprocessable` 422, `rate_limited` 429, `internal_error` 500.
All amounts in MXN. All timestamps ISO 8601. Every synthetic object carries `synthetic: true`.
Types are the ones in `packages/core/src/domain.ts`; the API never invents a second shape.

## Read

| Method | Path | Returns | Notes |
|---|---|---|---|
| GET | `/health` | `{ ok, service, version }` | liveness |
| GET | `/api/v1/run/current` | `PaymentRun` | this week's payment run: instructions, their decisions and findings, totals |
| GET | `/api/v1/instructions/:id` | `{ instruction, decision, findings, supplier }` | detail panel |
| GET | `/api/v1/suppliers/:rfc` | `{ supplier, cfdis, complements, findings, verifiedBeneficiaries }` | supplier drawer |
| GET | `/api/v1/sat/lookup?rfc=` | `{ rfc, entries: SatListEntry[], listed, effective?, source }` | the judge types a real RFC here; read-only over the official list. Rate limited per client |
| GET | `/api/v1/sat/versions` | `{ versions: [{ listVersion, publishedAt, rows }] }` | loaded list versions |
| GET | `/api/v1/beneficiaries` | `{ items: [{ supplierRfc, clabe, cep, verifiedAt }] }` | verified beneficiary registry |
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
| POST | `/api/v1/sat/publish` | `{ listVersion, entries: SatListEntry[] }` or `{ simulate: true, rfcs: string[] }` | loads a list version (or simulates one for the demo, synthetic RFCs only) and runs the retroactive sweep. Returns `SweepResult`. |
| POST | `/api/v1/cep/verify` | `{ claveRastreo, date, amount, senderBank, beneficiaryBank, beneficiaryAccount, supplierRfc }` or `{ xml, supplierRfc }` | fetches (or accepts) the CEP, validates the Banxico signature, compares the holder name with the supplier legal name, stores the evidence. Returns `{ cep, nameMatch: "match" \| "partial" \| "mismatch", finding }`. |
| POST | `/api/v1/instructions/:id/verify-call` | `{ toNumber }` or `{ conversationId }` or `{ outcome, evidence?, recordedBy }` | the verification call to the supplier. `toNumber` rings them through the voice agent and answers `202 { status: "calling", conversationId, script }`; `conversationId` collects a finished call, parses the transcript and appends `verification_call`; `outcome` records a call a person made by hand. Never releases a payment: the response always carries `releasesPayment: false` and no `decision_made` is ever appended. When `ELEVENLABS_API_KEY`, `ELEVENLABS_AGENT_ID` or `ELEVENLABS_PHONE_NUMBER_ID` is missing it answers `422` with the usual error envelope **plus** a `script` key, so the clerk reads it on their own telephone. |
| POST | `/api/v1/seed` | `{ seed?: number, reset?: boolean }` | regenerates the demo company. Dev only, guarded by `ALLOW_SEED=1`. |

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

```bash
curl -s https://<host>/api/v1/sat/lookup?rfc=<RFC> | jq
curl -s -X POST https://<host>/api/v1/instructions -H 'content-type: application/json' \
  -d '{"supplierRfc":"SYN010101AAA","amount":184300,"clabe":"012180001234567899","source":"whatsapp"}' | jq
curl -s -X POST https://<host>/api/v1/sat/publish -H 'content-type: application/json' \
  -d '{"simulate":true,"rfcs":["SYN010101AAA"]}' | jq
```

## Nessie, verified quirks

HTTPS only. Docs at https://prod.nessieisreal.com/docs, API base https://api.nessieisreal.com. Auth is `?key=` in the query string. Our team key lives in each teammate's local `.env` (never in the repo or the chat); it was validated with a write on 2026-09-12 (POST /customers returned 201). `403 {"message":"Missing Authentication Token"}` means wrong path, not a bad key. An invalid key returns `200 []` on reads and `401` only on writes: validate the key with a write before the demo. Sub-collections live under `/accounts/{id}/{purchases,bills,deposits,withdrawals,loans,transfers}`; there is no top-level `/bills`, `/loans`, `/purchases` or `/withdrawals`. Empty sub-collections are inconsistent (`200 []` or a `404` with a bare string body): map 404 to `[]`. Dates are `YYYY-MM-DD` with no time. `amount` mixes int and float. `_id` mixes UUID and ObjectId. `/enterprise/*` is a shared pool contaminated by other teams: never compute on it. In Ceptinela, Nessie is the company's bank mirror: `bank_reconciliation` compares outflows against instructions and CFDIs and flags payments with no document behind them.
