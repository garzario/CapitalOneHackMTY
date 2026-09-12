# @hackmty/extract

The only package in this repository that sends anything to a language model, and
the only one that is allowed to. It transcribes. It decides nothing.

A payment instruction does not always arrive as a row in a system. At a Mexican
SMB it arrives as a photograph of a handwritten note, a screenshot of a WhatsApp
message, or a voice note from the supplier's accountant. Somebody then types
eighteen digits into the bank portal from that. This package is the part that
reads the digits, so that the six controls in
[ADR-0002](../../docs/adr/0002-track-and-thesis.md) can run on an instruction
that started life as a photo.

| Function | Takes | Gives back |
|---|---|---|
| `extractFromImage(bytes, mime, options)` | a photo or a screenshot | `{ clabe?, amount?, supplierHint?, rawText, confidence, reading }` |
| `extractFromAudio(bytes, mime, options)` | a voice note | `{ transcript, clabe?, amount?, confidence, reading }` |
| `readClabeFromText(text, claimed?, clarity?)` | any text | `ClabeReading`, pure, no model |
| `sniffMediaType(bytes)` | the first bytes of a file | its media type, or undefined |

Server only, and behind `GEMINI_API_KEY`. `apps/web` never calls it; the browser
reaches it through `POST /api/v1/instructions`, per
[docs/09-api.md](../../docs/09-api.md).

## The boundary

This is the part to read before quoting the package anywhere.
[ADR-0004](../../docs/adr/0004-llm-boundary-and-privacy.md) forbids a model in
the per-transaction decision. Section 6 of
[docs/06-regulatory-privacy.md](../../docs/06-regulatory-privacy.md) states the
same rule in regulatory terms. Here is how the code holds itself to it.

**What is sent.** One instruction string that this repository wrote, and the
bytes of one file that a person chose to send us. That is the complete list. No
supplier, no RFC, no legal name, no CFDI, no known account, no payment history,
no amount already on file, no SAT list, no CEP. `buildRequestBody` in
`src/gemini.ts` is nineteen lines long and it is the whole transfer.

**What comes back.** JSON against a fixed schema with six field names across the
two schemas: `rawText`, `transcript`, `clabe`, `amount`, `supplierHint` and
`clarity`. There is no field a verdict, a score, a ranking or a recommendation
could be written into, which is the strongest form this constraint can take: the
model is not asked to be good, it is given nowhere to put an opinion.

**What the answer is allowed to do.** `clabe` becomes
`PaymentInstruction.clabe` and `confidence` becomes
`PaymentInstruction.ocrConfidence`. From there the deterministic layer takes
over: the check digit, the Banxico participant catalogue and the OCR-aware edit
distance against the accounts this supplier has actually been paid on, all in
`packages/core/src/clabe.ts`, all pure, all unit-tested. `transcript` becomes
`PaymentInstruction.text`, whose contract in `domain.ts` reads "Never used for
decisions, only shown as context".

**Therefore a model error can only add friction.** A misread digit fails the
check digit or lands far from the supplier's known accounts, and either way the
instruction ends up in `requiere_verificacion` and a person reads the original.
A model cannot remove a control, because no control asks it anything. That
asymmetry is the safety argument and it is the reason the boundary is where it
is.

**And it is a test, not a promise.** `src/boundary.test.ts` reads the package's
own source and fails if a shipped module so much as names `decide`, `Finding`,
`Decision`, `Severity`, `detect`, `score`, `recommend` or `risk`, and it asserts
that the only thing imported from `@hackmty/core` is the check digit and the
normaliser. Run `bun test packages/extract` and watch it.

## Confidence, and why it is not the model's number

`confidence` starts at `clarity`, which is the model's own statement about how
legible the digits were. That is a self-report and it is not a calibrated
probability, so it is treated as a ceiling rather than as an answer, and it is
then multiplied by the factors in `PENALTY_FACTORS`, each of which is a fact
about the digits:

| Penalty | Factor | Means |
|---|---|---|
| `check_digit_failed` | 0.25 | The 3-7-1 check digit does not close, so that account cannot exist |
| `ambiguous_candidates` | 0.5 | More than one equally valid account number is on the page |
| `not_in_text` | 0.4 | The digits are in the model's own field but not in what it transcribed |
| `model_disagrees` | 0.5 | The transcription and the model's field name different accounts |

The transcription always wins over the model's `clabe` field, because the
transcription is the thing a clerk can check against the original by eye.

## Reading eighteen digits out of text

`findClabeCandidates` scans for runs of digits that tolerate spaces and hyphens,
the same characters `normalizeClabe` strips, because a handwritten CLABE arrives
as `0585 8000 0723 4567 75` and a dictated one arrives in groups too.

A run of exactly eighteen digits is always reported, valid check digit or not:
"these are the eighteen digits on the paper and the arithmetic fails" is the most
useful single sentence this package can produce. A longer run has several
eighteen-digit windows, and only the windows whose check digit closes are kept,
so an amount sitting on the line above the account resolves to the account and a
phone number followed by a date resolves to nothing.

The check digit itself is imported from `@hackmty/core`. It is not reimplemented
here. There is one definition of what a CLABE is in this repository.

## Tests, fixtures and the network

`bun test packages/extract` opens no socket and needs no key. `http` is
injectable on every call and every test passes a stub, and the provider answers
come from `src/fixtures/`.

Those fixtures are honest about what they are: `generateContent` envelopes
written by hand to the shape the provider documents, carrying synthetic content
invented for this repository. They are not captures of a live call. The header
comment of `src/fixtures.ts` says so and carries the TODO to replace
`image-handwritten.json` with a real captured response once the key is in hand.

The account number in them, `058580000723456775`, is two digits away from
`058580000123456715`, the account the synthetic supplier SYN010101AAA has been
paid on seven times, and both changed digits are a handwritten 1 read as a 7. Its
check digit closes. That is the case the whole product exists for: the arithmetic
says yes, and only the supplier's own history says no.

## Running it against a real file

```
GEMINI_API_KEY=... bun run scripts/extract-demo.ts ./nota.jpg
bun run scripts/extract-demo.ts --fixture          # no key, no network
```

The second form replays a fixture through the same code path, which is what the
rehearsal uses when the venue wifi is gone.

## Cost

Priced per unit of work in section 6.3 of `docs/06-regulatory-privacy.md`,
against the provider's published price list on the date stamped there. The order
of magnitude: fractions of a US cent per photograph, and nothing at all for the
transactions that arrive as data, because those never reach this package.

## What is deliberately not here

- **No retry loop.** A failure is reported to the clerk, who is standing in front
  of the screen and can retake the photo. A silent retry on a paid API is how a
  demo turns into a bill.
- **No Files API.** Everything is inline. A file uploaded to the provider's file
  store is a file the provider holds, and section 6.2 promises it holds nothing.
- **No amount parsing out of text.** The model is asked for a number and anything
  that is not one is dropped. `184,300.00` and `184.300,00` both appear on
  Mexican paperwork, and guessing which separator is decimal is how a payment of
  a hundred and eighty four thousand pesos becomes one of a hundred and eighty
  four.
- **No supplier resolution.** `supplierHint` is the payee as written. Turning a
  name into an RFC is a lookup against the company's own CFDI ledger and it
  belongs on the other side of this boundary.
