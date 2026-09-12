# @hackmty/cep

The Banxico CEP, read and checked.

A CEP (Comprobante Electronico de Pago) is the receipt Banxico issues for a SPEI
transfer. It names the account holder who actually received the money. Control 5
in ADR-0002 uses that: a one-cent SPEI probe is sent by a person from the
company's own bank, the CEP for it is retrieved, and the holder name on it is
compared with the legal name on the supplier's CFDI before the real payment
leaves. A SPEI is irrevocable, so this check happens before, or it does not
matter.

Four functions, in the order the product calls them.

| Function | Does |
|---|---|
| `fetchCep(params, http)` | Posts the public Banxico portal form and downloads the XML |
| `parseCep(xml)` | Turns the XML into the `Cep` type from `packages/core/src/domain.ts` |
| `verifySignature(xml, certificatePem)` | Says what we can and cannot prove about the Banxico seal |
| `nameMatch(cepName, legalName)` | `match`, `partial` or `mismatch`, with Mexican legal-name normalisation |

Server only. `verifySignature` imports `node:crypto`, so this package must not be
pulled into the browser bundle. `apps/web` reaches it through
`POST /api/v1/cep/verify`, per `docs/09-api.md`.

## What is verified

Everything in this section was checked against a published schema and then seen
on a production CEP. Sources are at the bottom.

**The document shape.** Root `SPEI_Tercero` with attributes `FechaOperacion`,
`Hora`, `ClaveSPEI`, `sello`, `numeroCertificado`, `cadenaCDA` and
`claveRastreo`, holding two empty children: `Beneficiario` with `BancoReceptor`,
`Nombre`, `TipoCuenta`, `Cuenta`, `RFC`, `Concepto`, `IVA` and `MontoPago`, and
`Ordenante` with `BancoEmisor`, `Nombre`, `TipoCuenta`, `Cuenta` and `RFC`. Every
one of these names comes from the SAT `Complemento_SPEI` schema and appears on the
production CEP we inspected.

**Child order is not stable.** The SAT sample documents write `Ordenante` first
and the production Banxico service writes `Beneficiario` first. A reader that
indexes children by position swaps the sender and the beneficiary on real data,
which is the one mistake this module cannot afford, so children are found by name.
Covered by a test.

**`Nombre` is capped at 40 characters** by the schema. Long razones sociales are
therefore truncated by the producer, which is why `nameMatch` treats a long prefix
agreement as a match rather than as a difference.

**The seal is RSA-2048.** On the production CEP, `sello` is base64 that decodes to
exactly 256 bytes, and `numeroCertificado` is a 20-digit serial.

**`cadenaCDA` ends with its own seal.** Its last two pipe-separated fields are the
certificate serial and the seal itself. A signature cannot cover itself, so the
signed string is at most `cadenaCDA` with that trailing `||<sello>` removed. That
is structure we can see, not a claim about the algorithm.

**The portal is a two-step form.** `POST /cep/valida.do` with the fields
`tipoCriterio`, `captcha`, `tipoConsulta`, `fecha` (DD-MM-YYYY), `criterio`,
`emisor`, `receptor`, `cuenta`, `monto`, `receptorParticipante`, then
`GET /cep/descarga.do?formato=XML` on the same session cookie. It answers failures
as Spanish sentences inside an HTTP 200 page, not as status codes, so
`classifyPortalResponse` maps the four known sentences to error codes.

## What is NOT verified, and what this package does about it

**The signature scheme.** Banxico publishes no specification of which hash is
used, which byte encoding the signed string is hashed in, whether the signed
string is exactly the truncated `cadenaCDA`, or which padding the signature uses.
The CEP portal and the CEP validator carry no technical annex, and no public
implementation we found verifies the seal; they parse around it.

So `verifySignature` does not claim a valid signature. It runs a candidate matrix
of three hashes (sha256, sha1, sha512) by two cadena variants (`without_sello`,
`full`) by two encodings (utf8, latin1) with `node:crypto`, reports per candidate
whether RSA verification succeeded, and returns
`{ valid: false, reason: "unconfirmed_scheme" }`. The UI renders that as "firma no
verificada" and the finding is `requiere_verificacion`. It is never rendered as
"firma invalida", because those are two different claims and only one of them is
ours to make.

Structural failures are reported separately and honestly, because they are
confirmable whatever the scheme is: `malformed_xml`, `missing_sello`,
`malformed_sello` (not base64, or not 256 bytes), `missing_cadena`,
`invalid_certificate`.

The crypto path is exercised for real. `signature.test.ts` generates an RSA
keypair, signs a CEP-shaped document, and asserts that exactly the one candidate
that produced the signature comes back `matched: true`, including distinguishing
utf8 from latin1 on an accented name. No key material is committed.

**The `cadenaCDA` field layout.** We can see where it starts and ends but we do
not decode its interior, so nothing in this package reads a field out of it.

**Whether `FechaOperacion` plus `Hora` is the operation instant or the credit
instant.** The schema documents `Hora` as the hour of the credit. On the
production CEP the credit date inside `cadenaCDA` equals `FechaOperacion`, so the
two coincide there. `parseCep` combines them and the caveat is recorded here.

**The time zone.** A CEP states a wall-clock time with no offset. It is written as
`-06:00`, which AGENTS.md already fixes for the whole repo and which has been
Mexico City's year-round offset since daylight saving was repealed in October
2022. A CEP issued in the summer before that repeal is stamped one hour late. The
product only reads CEPs from the payment run in front of the clerk, so this is
recorded rather than handled.

**Whether the portal keeps accepting a placeholder in the `captcha` field.** It
does today. It is undocumented behaviour of a public service and can stop at any
time, which is why the product's primary path is the clerk pasting the XML their
own bank gave them and `fetchCep` is the convenience path. The portal also
rate-limits by address; `fetchCep` reports `rate_limited` and deliberately does
not retry into it.

## Pending the real CEP golden file, issue #57

Issue #57 supplies a real CEP XML plus the Banxico certificate matching its
`numeroCertificado`. With those in hand:

1. Run `verifySignature(goldenXml, banxicoCertificatePem)`. Whichever attempt
   returns `matched: true` names the scheme.
2. Record that attempt in this README and flip
   `CEP_SIGNATURE_SCHEME_CONFIRMED` in `src/signature.ts`, in the same commit.
3. If no attempt matches, widen the matrix rather than widening the claim. The
   function keeps returning `unconfirmed_scheme` until one does.
4. Confirm the `cadenaCDA` field layout against the golden file, and whether the
   credit date can differ from `FechaOperacion`.

The golden file must be redacted before it enters the repo, per `SECURITY.md`.

## The synthetic fixture

`src/fixtures/synthetic-cep.xml` is invented end to end: names, RFCs, CLABEs, the
participant key 99999 (outside the assigned range), the certificate serial, and a
`sello` that is 256 deterministic bytes rather than anyone's signature. It parses
to `synthetic: true`, and the UI watermark is driven by that flag and not by
anyone recognising the names. No real CEP, no real name and no real RFC is in this
repo or in its tests.

The fixture's beneficiary is named for a reason. Its CFDI legal name is
`Distribuidora Sintetica del Poniente, S.A. de C.V.`, 44 characters with accents,
and the CEP carries `DISTRIBUIDORA SINTETICA DEL PONIENTE SA`, cut at the
40-character field cap. The two strings differ and describe one company, which is
the case `nameMatch` exists for.

## Name matching

Three results, asymmetric on purpose.

- `match`: the two names agree after folding accents, case, punctuation, the
  ampersand and the societary type (`SA DE CV`, `S DE RL DE CV`, `SAPI DE CV`,
  `SC`, `AC`, `SOFOM ENR` and the spaced and dotted spellings of each); or the
  shorter is a leading prefix of the longer and the agreement is strong enough to
  be truncation rather than coincidence.
- `partial`: they share at least one significant word. Deliberately
  over-inclusive. Two suppliers sharing a head word, or two people sharing a
  surname, land here on purpose: the cost of a false `partial` is a clerk
  glancing at a screen and the cost of a false `match` is money that never comes
  back.
- `mismatch`: they share no significant word, or one side carries no name at all
  (empty, or the `NA` and `ND` placeholders banks send).

`mismatch` means "no supporting evidence", not an accusation. Per ADR-0002 the
caller maps it to `requiere_verificacion` and a person decides.

The answer does not depend on which argument is the CEP name.

## Tests

`bun test packages/cep`. Nothing in the suite touches the network: `fetchCep`
takes `http` as a parameter and every case passes a stub, so the Banxico portal is
never contacted from CI. Hammering a public service with a rate limit from a test
runner is both rude and flaky.

## Sources

All retrieved 2026-09-12.

- SAT `Complemento_SPEI` XML schema, namespace `http://www.sat.gob.mx/spei`,
  conventionally published at
  `http://www.sat.gob.mx/sitio_internet/cfd/spei/spei.xsd`. Read from a public
  mirror at `github.com/GrupoCorasa/factura-electronica`, path
  `src/main/resources/xsd/common/spei/spei.xsd`. This is where every attribute
  name, its required flag and its length limit come from.
- Banxico CEP portal, `https://www.banxico.org.mx/cep/`. The consultation form and
  its fields.
- Banxico CEP validator, `https://www.banxico.org.mx/validador-cep-spei/`,
  version 2.2.5. Checked for a technical annex on the seal. There is none, which
  is the basis for the "not verified" section above.
- A production CEP XML dated 2024-11-08, recorded as an HTTP fixture in
  `github.com/cuenca-mx/cep-python`, path
  `tests/cassettes/test_validar_transferencia_tipo_3.yaml`. Used only to confirm
  attribute presence, child ordering and the shape of `sello`,
  `numeroCertificado` and `cadenaCDA`. It carries real third-party data, so
  nothing from it was copied into this repo.
- Two independent open-source clients, read for the endpoints and form field
  names: `github.com/cuenca-mx/cep-python` (`cep/transferencia.py`,
  `cep/cuenta.py`) and `github.com/AlbertoJALJ/cep-nodejs` (`src/transferencia.js`,
  `src/client.js`). They agree on `valida.do`, `descarga.do?formato=XML` and every
  form field name, which is why those are listed as verified.
- Two CEP XML samples for the document shape:
  `github.com/SAT-CFDI/python-satcfdi`, paths `tests/spei_ejemplos/cep.xml` and
  `tests/test_contabilidad/cep.xml.xml`. These are the ones that write `Ordenante`
  before `Beneficiario`.
