# @hackmty/rail

The only place in SentryOne that moves money. Two things leave through it and nothing
else: the 0.01 MXN verification probe, and one line of one payment instruction for
exactly that instruction's amount to exactly the account it names.

The probe exists to make Banxico state, in a document it signs, who holds the account
the company is about to pay. The payment run leaves here because of ADR-0008: if the
SPEI leaves somewhere else, nothing forces the instruction to exist in SentryOne, and
a control nobody has to pass is a control that gets skipped on the Thursday it matters.

Read this before quoting any of it in the pitch. The table says which rail has run
against a live API and which has not, and that line is the whole point of the file.

| Rail | What it is | Status |
|---|---|---|
| `NessieRail` | Outflows on the company's bank mirror, written with our own team key: the 0.01 probe and one withdrawal per line of the run | Verified against `https://api.nessieisreal.com` on 2026-09-12 for the probe and on 2026-09-13 for the run (86 lines, 1,388,920.90 MXN, counts below). Nessie is a sandbox, not a bank: no pesos move, no CEP is produced, and the balance does not change |
| `StpRail` | `registraOrden` at STP, the SPEI participant a small company can contract. This is the rail that produces a Banxico-signed CEP | Written, unit tested on our side of the wire, NEVER run live. We hold no `empresa` contract, so the constructor refuses on every machine |
| `LayoutRail` | The dispersal file a bank portal takes, plus the reader of the response file it hands back. No API, no key: the rail a PyME actually has today | The file and the reader are unit tested byte for byte. No real bank portal has been handed one, because we have no account at one, and nothing here claims a named bank's exact column order |
| `FakeRail` | In process, nothing leaves. Used by `bun test` and `bun run demo` | Every event it produces carries `simulated: true` |

## What a rail is asked for

Two methods and one of them is new. `sendCent(request)` is the probe. `send(order)` is
one line of the payment run, and `PaymentOrder` is ADR-0008 expressed as a type: the
instruction this product already holds, its own amount, and the account that
instruction names. There is no shape of that object that expresses an amount the
instruction did not carry or an account it did not name, which is the point.

`PaymentSent.state` is the rail's own claim and the API never upgrades it: `queued` is
a line written into a file nobody has uploaded yet, `sent` is a line the rail took, and
`settled` is a rail saying the movement is on the account. `confirm` asks the second
question separately, and a rail that cannot be asked does not implement it, which is
not the same as a rail that answers no.

## Why a cent at all

Mexico has no confirmation-of-payee API. The only way to learn who holds a CLABE is
to send a transfer to it and read the CEP that Banxico publishes for it: the document
names the account holder, and the central bank signs it. One centavo is the smallest
amount SPEI moves, which is what makes this affordable to do on every new account.

## What a rail may and may not do

- **The probe or an instruction's own amount, and nothing else.** `CENT_AMOUNT` is the
  probe and it is the only constant amount here; a payment's amount arrives on
  `PaymentOrder` from the instruction. ADR-0008 made that rule narrower than it sounds
  rather than looser: every peso that leaves has a CFDI, a decision and a name behind
  it in the ledger.
- **It names nobody.** A rail is handed the account and the amount. The description it
  writes is `CENT_DESCRIPTION` or `PAYMENT_DESCRIPTION`, and `assertNoIdentity` fails
  the send if a description ever carries a long digit run, which is how a CLABE ends up
  in somebody else's system. The one exception is `LayoutRail`, which writes a file the
  company itself uploads to its own bank and whose header says so.
- **The clave de rastreo comes back from the rail.** It is the string the CEP is
  filed under at Banxico, so only whoever sent the transfer can know it. That is the
  difference between this and the manual procedure it replaces: the clave arrives
  from the bank and not from a keyboard.
- **A rail that cannot run refuses at construction**, never on the first cent.

## The clave de rastreo

Up to 30 characters, letters and digits. Both live rails mint it from their own
identifier for the row they created, with a three-character prefix that says which
rail minted it:

- `NessieRail`: `NSS` plus the Nessie object id, letters and digits only, upper
  cased, cut to 30. A Nessie `_id` is a 24-character ObjectId or a 36-character
  UUID, and a UUID does not fit under 30 with a prefix, so the head of it is kept.
  The row is still findable: `GET /accounts/{id}/withdrawals` with our key.
- `StpRail`: `STP` plus the instruction and the numeric reference of the order.
- `LayoutRail`: none of its own. A dispersal file carries a numeric reference per line
  and the clave de rastreo comes back in the response file the portal hands over, hours
  later. `readLayoutResponse` recovers it, so the rule still holds: the clave arrives
  from the bank and never from a keyboard. A row the portal reports as paid with no
  clave on it is dropped rather than recorded, because a settled payment nobody can look
  up is a receipt with nothing behind it.

## Verified against Nessie on 2026-09-12

- The probe is a WITHDRAWAL and not a purchase. The mirror's settled history is
  pushed as purchases because reconciliation needs a payee; the probe must name
  nobody, and a withdrawal carries no payee at all.
- A Nessie amount is stored as a whole number, so the 0.01 that goes up reads back
  as `0`. The exact centavos live in our own ledger, which is the same reason
  docs/09-api.md gives for the mirror's whole-peso amounts.
- `status` comes back `pending`, the date is the Monterrey calendar day with no time,
  and the description is the fixed sentence with no name and no account in it.
- Our key holds two accounts nicknamed "Cuenta operativa SPEI" (the mirror has been
  pushed under two customers), and through the key they are indistinguishable: same
  nickname, same type, same balance. `pickMirrorAccount` takes the first one
  `GET /accounts` answers, which is deterministic and never alternates between them.
  Re-read on 2026-09-12 while closing issue #165: that first account is
  `3fce172e-1591-43b8-b112-08e4491e3651`, the one abandoned during development
  (issue #45), and not `ad2841a5-c274-47e4-84c8-e830667feea6`, the mirror
  `bun run nessie:mirror` keeps reconciled. So the probe lands on the older
  account and this package does not claim otherwise; `accountId` pins it. No
  customer and no account is ever created here, and the read that confirmed it
  counted 3 customers and 2 accounts, exactly what issue #45 recorded.

## Verified against Nessie on 2026-09-13, the payment run

One real execution of the seeded run, through `POST /api/v1/run/:id/execute` with the
real `NessieRail` and our own team key. The counts, so nothing about this has to be
remembered:

- **86 lines sent, 1,388,920.90 MXN.** Every one of them a withdrawal on the mirror
  account the key answers first, with the clave de rastreo minted from the object id
  Nessie returned. 0 failed, 0 cancelled, 0 queued.
- **6 lines did not move**, all of them `stopped_for_a_person`: the engine is holding
  them and nobody has signed a release, so the run left them exactly where they were
  and reported the reason per line.
- **A second call answered `409`** and the ledger did not move.
- **3 customers and 2 accounts before and after.** Nothing was created.
- **The settle half was proven on the second account**, the one `bun run nessie:mirror`
  keeps reconciled: one line, `settled`, clave `NSS43633C642E8B4EAD833CCA4A94B` from the
  row `43633c64-2e8b-4ead-833c-ca4a94b3c7df`, description `Dispersion SPEI de corrida de
  pagos`, and the sandbox answered the row back on the account. Why it had to be the
  second account is the next section.
- **The amount reads back whole.** 5,353.61 was stored as 5353, like every other Nessie
  amount, and the balance did not move at all. The exact centavos live in our ledger.
- **The receipt of a real line answers**, with `sealState: not_checked` and four digits
  of the account, because there is no Banxico document for a row in a sandbox.

## The quirk that broke a listing, verified 2026-09-13

Nessie accepts a withdrawal with **no `status` field** and then refuses to list the
whole collection, because its own response model requires it:
`GET /accounts/{id}/withdrawals` answers `400 "1 validation error for Withdrawal /
status / field required"` for the account that holds it. One bad row poisons every read
of that account's withdrawals, there is no route that deletes a single one
(`DELETE /withdrawals/{id}` answers the `403 Missing Authentication Token` that Nessie
uses for a wrong path), and the only documented way back is `DELETE /data?type=`, which
is bulk and destructive.

An exploratory probe of issue #198 posted one such row on
`3fce172e-1591-43b8-b112-08e4491e3651` while learning what the API does with `status`,
which is why that account's listing is refused and why the settle half above was proven
on the reconciled mirror instead.

Two consequences are in the code rather than only here. `NessieRail` always posts a
`status`, on the probe and on a payment, so it can never create one of these. And
`confirm` treats a listing that fails as nothing confirmed rather than as a failure: the
lines stay `sent` with the sentence "el espejo no pudo listarse", because a transfer the
rail accepted did not stop existing when a read broke.

## STP, and what is not verified

`STP_SANDBOX_BASE_URL`, `CADENA_ORIGINAL_FIELDS` and the response shape are
transcribed from STP's integration documentation for `registraOrden`. None of it has
been checked against a live STP account from this repository, and `stp.ts` says so
where somebody editing it will read it. What IS proven, in `stp.test.ts`: the cadena
original is assembled in that field order and framed by `||`, the `firma` is RSA with
SHA-256 over exactly those bytes (verified against a key the test generates), the
order carries no beneficiary name, and the constructor refuses without
`STP_BASE_URL`, `STP_EMPRESA`, `STP_CLABE_ORDENANTE` and `STP_PRIVATE_KEY_PATH`.

The private key never enters this repository. `STP_PRIVATE_KEY_PATH` points at a file
on the production host, and `.env.example` documents it as exactly that.
