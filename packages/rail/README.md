# @hackmty/rail

The only place in SentryOne that sends money. It sends exactly one amount, 0.01 MXN,
and it sends it for exactly one reason: to make Banxico state, in a document it
signs, who holds the account the company is about to pay.

Read this before quoting any of it in the pitch. The table says which rail has run
against a live API and which has not, and that line is the whole point of the file.

| Rail | What it is | Status |
|---|---|---|
| `NessieRail` | A 0.01 outflow on the company's bank mirror, written with our own team key | Verified against `https://api.nessieisreal.com` on 2026-09-12. Nessie is a sandbox, not a bank: no pesos move and no CEP is produced |
| `StpRail` | `registraOrden` at STP, the SPEI participant a small company can contract. This is the rail that produces a Banxico-signed CEP | Written, unit tested on our side of the wire, NEVER run live. We hold no `empresa` contract, so the constructor refuses on every machine |
| `FakeRail` | In process, nothing leaves. Used by `bun test` and `bun run demo` | Every `cent_sent` it produces carries `simulated: true` |

## Why a cent at all

Mexico has no confirmation-of-payee API. The only way to learn who holds a CLABE is
to send a transfer to it and read the CEP that Banxico publishes for it: the document
names the account holder, and the central bank signs it. One centavo is the smallest
amount SPEI moves, which is what makes this affordable to do on every new account.

## What a rail may and may not do

- **0.01 MXN and nothing else.** `CENT_AMOUNT` is the only amount in this package.
- **It names nobody.** A rail is handed the account and the amount. The description
  it writes is `CENT_DESCRIPTION`, and `assertNoIdentity` fails the send if a
  description ever carries a long digit run, which is how a CLABE ends up in
  somebody else's system.
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
  pushed under two customers). `GET /accounts` answers them in a stable order with
  the one carrying the mirror purchases first, so `pickMirrorAccount` takes the
  first rather than calling it ambiguous. No customer and no account is ever created
  by this package.

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
