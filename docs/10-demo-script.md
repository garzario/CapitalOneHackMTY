# 10. Demo script

Four minutes, five beats. Every beat has an exact click, an expected on-screen result, the one
sentence said over it, and a fallback. Drift between this file and the product is how demos die, so
whoever changes the demo path updates this file in the same pull request.

Owner: Patricio (`garzario`), drafted for the team to validate. Issue #56. Due M3.

Presenter: TODO(garzario) confirm at the first rehearsal. Backup presenter: TODO(garzario).
The spoken lines below are written in English because this repository is in English. Say them in the
language the judge opens with. The Spanish rendering of each line goes on the printed judge card
(#74), not into this file.

## Beat sheet

| Time | Beat | Exact click or command | Expected on screen | The one sentence said over it | Fallback if it breaks |
|---|---|---|---|---|---|
| 0:00 to 0:55 | **1. The payment run** | Tab 1, already loaded: the payment-run screen | This week's run, its totals, rows sorted with the alert rail on the right by pesos at risk, seven findings on 92 instructions, 885,658.73 MXN that is not leaving, the `datos sinteticos` watermark | "This is Thursday for the person who pays the suppliers of a 28-person metalworking shop in Apodaca. Ninety two transfers in one sitting, and all of this data is synthetic. SentryOne has already read every invoice, so the run arrives sorted by how much money is at risk instead of alphabetically." | Local instance on the second port, same screen, same data |
| 0:55 to 1:50 | **2. The SAT publication replay, and a real RFC** | Click `Simular publicacion 69-B`. Then hand the judge the lookup box and let them type a real RFC | Eight months of ledger replay in under three seconds, newly listed suppliers lighting up, the exposure counters climbing (deducted base, ISR, IVA), a constancia PDF to download. The lookup box answers from the official list | "Here is the part nobody instruments. When the SAT publishes a new Article 69-B list, everything you already paid and already deducted to a supplier on it is exposed retroactively. We replay the ledger and quantify it. The list is the real one, and this box is separate from the simulation on purpose: real RFCs never touch our synthetic invoices." | The lookup box alone, offline from the committed list snapshot. If the replay stalls, the recorded video cued to this beat |
| 1:50 to 2:35 | **3. An instruction arriving by QR** | Judge scans the QR on the printed card, photographs the CLABE printed on it, submits | The intake page accepts it, the big screen gains a row within two seconds over SSE, with the finding and the two digits that differ from the account we have paid 52 times | "Send it yourself. That instruction went from your phone to the engine and back to this screen without a reload, and the reason it is flagged is on the chip: this account differs in two digits from the one we have paid this supplier on 52 times." | Type the CLABE instead of photographing it. If the judge's phone fails, do it from our second phone. If SSE drops, reload once and say the stream dropped |
| 2:35 to 3:20 | **4. The CEP and its signature** | Open the CEP viewer | The CEP fields, the clave de rastreo, the holder name next to the CFDI legal name, and the signature status as the parser reports it | "Before we release a payment to a new account, a person sends one cent. Banxico signs a receipt for every SPEI. We fetch it, compare the account holder name with the legal name on the invoice, and keep it as evidence. Say out loud that this one is the synthetic fixture and that the signature is reported as not checked: confirming the Banxico scheme needs the real certificate, which is issue #57." | The stored CEP fixture rendered from disk. Never fabricate a CEP on stage, and never say a signature was validated when it was not |
| 3:20 to 4:00 | **5. The metrics page, and the business line** | Open the metrics page. For an engineer judge, open the detector beside its test file instead and run `bun test` | Precision, recall and false-positive rate with the case count next to them, per detector, plus the note naming anything we measured and refused to ship. 30 labelled holdout cases: 0.85 precision, 0.81 recall, 0.02 false positive rate | "The cases were written and labelled by someone who does not write the detectors, and the detector author does not read that folder until the code is merged, so these numbers are blind. Nothing here is a language model: the decision is deterministic and you can read it." | `bun test` output already captured in the terminal, or the metrics JSON from `GET /api/v1/metrics` |

Beat 1 and beat 3 are stage 3 of `docs/03-user-journey.md`, the moment that is the product. Beat 3
is the one to protect if time is lost, because a judge who sent the instruction themselves does not
need to be convinced that the product runs.

### Walk-up variants, because judging is continuous

| Who walked up | Beats to run | Time |
|---|---|---|
| Engineer | 1, 3, then the detector file beside its test with `bun test` | About 3 minutes |
| Product | 1, 2, then the business line from `docs/11-pitch.md` | About 3 minutes |
| Anyone, and there are two minutes | 1 and 3 only. Finish on the SSE row appearing | 2 minutes |

## Seeded IDs used in the demo

Printed by `bun run demo` and by the API boot line under `SEED=sentryone`. Seed 69, and the seed
is what makes every id below stable on any laptop. These must match `docs/09-api.md` and the
printed card exactly.

| Thing | ID | Note |
|---|---|---|
| Demo company | `SYN090615C01` Metalicos del Norte SA de CV | The metalmecanica from `docs/02-persona.md` |
| Payment run | `run-2026-09-07`, week of 2026-09-07 | 92 instructions, 2,174,210.76 MXN |
| Hero instruction | `INS-2026-09-07-047` | The CLABE two digits off (positions 9 and 10), 38,417.48 MXN, verificar |
| Hero supplier RFC | `SYN990202S02` Maquinados Industriales Regios SA de CV | Synthetic, `SYN` prefixed, paid 52 times on `012180100091764613` |
| Hero account on the instruction | `012180101391764613` | Valid check digit, so it is a changed account and not a typo. This is the CLABE on the printed card |
| Largest hold | `INS-2026-09-07-029` | 537,960.97 MXN, CLABE whose check digit cannot exist, arrived as a photo |
| Supplier for the sweep | `SYN080910HI8` MATERIALES SINTETICOS OCHO SA DE CV | Presunto since 2026-05-22; the simulation turns it definitivo over 24 invoices already paid |
| Real RFC for the lookup box | `AAA080808HL8` | Presunto 2018-06-25, definitivo 2018-10-23, sentencia favorable 2019-04-16, from the committed official list. Never attached to a synthetic invoice |
| Clave de rastreo of the real CEP | TODO(Apanawa) | From issue #57. Goes on the printed card so a judge can re-verify it |
| Seed value | 69 | Committed, so every ID above is stable |
| Instruction count in the run | 92 | What the screen shows. Do not say a number on stage that the screen does not show |

### The bank mirror

The company's bank mirror is also in Nessie, seeded with our own key, and a judge can read it live.
What is up there is one purchase per outflow that has already settled on the company's account,
newest first: 206 of the 2446 the generator built for seed 69, which is the count the curl below
prints. The default push is the newest 200, and the gitignored `.seed/nessie.json` records the
limit the account was actually pushed with, so the reconciliation compares against that set and not
against today's default. Not the payment run on the screen: those instructions are pending and have
not left the account. The account id also comes from that file; the id below is the one it has
right now.

```bash
curl "https://api.nessieisreal.com/accounts/ad2841a5-c274-47e4-84c8-e830667feea6/purchases?key=$NESSIE_API_KEY" | jq length
```

Say this out loud while it is on screen: Nessie carries dates with no time at all, so the day is
the bank's and the intraday order is ours, out of our own ledger. Two more sentences if they push:
every one of those rows is a settled outflow with the payee named, and the POST that created the
customer is what proves the key, because an invalid key answers `200 []` on every read.

### Numbers the screen shows

Say these only while they are on the screen. `bun run demo` prints every one of them from the API
it just drove, so the way to check this table before a rehearsal is to run it and read the output.

| Number | Value | Where it comes from |
|---|---|---|
| Run total | 2,174,210.76 MXN over 92 instructions | `GET /api/v1/run/current` |
| Not leaving yet | 885,658.73 MXN, 7 lines, 2 held and 5 to verify | The six controls over the seeded run |
| Retroactive exposure | 404,152.59 MXN: 263,577.78 ISR and 140,574.81 IVA over a deducted base of 878,592.59 | `POST /api/v1/sat/publish` with `simulate` |
| Blind evaluation | 30 labelled cases, 0.85 precision, 0.81 recall, 0.02 false positive rate | `GET /api/v1/metrics` over the holdout nobody on the detector side wrote |

### Curls a judge can paste

Against a local instance started with `SEED=sentryone bun run dev` in `apps/api`.

```bash
curl -s localhost:3000/api/v1/run/current | jq '.totals'
curl -s localhost:3000/api/v1/instructions/INS-2026-09-07-047 | jq '.findings[0].evidence'
curl -s 'localhost:3000/api/v1/sat/lookup?rfc=AAA080808HL8' | jq
curl -s -X POST localhost:3000/api/v1/sat/publish -H 'content-type: application/json' \
  -d '{"simulate":true,"rfcs":["SYN080910HI8"],"status":"definitivo"}' | jq '.totalExposure'
```

## Pre-demo checklist

Run this before every rehearsal and before every judge walk-up. It takes ninety seconds and it is
the difference between looking real and looking like a prototype.

- [ ] `bun run demo` is green on this machine, right now
- [ ] `bun run seed` has run and printed the expected counts and IDs
- [ ] `curl /health` returns ok, and `bun run doctor` names the live database path
- [ ] The SSE stream is alive: the intake page posts one instruction and the row appears
- [ ] The SAT list snapshot is loaded and its version and publication date are visible
- [ ] The CEP fixture parses and the name comparison answers. TODO(garzario) issue #57: swap in the real CEP and its certificate, and only then say the signature was validated
- [ ] One browser window, demo tabs in order, every other window closed
- [ ] The printed card is on the table: QR code, the CLABE to photograph, the clave de rastreo, the real RFC
- [ ] Notifications off, Do Not Disturb on
- [ ] Browser zoom at 100 percent, or a deliberate larger value that is the same every time
- [ ] The local fallback instance is already running on the second port, seeded
- [ ] Battery above 50 percent or plugged in
- [ ] The recorded video is on the laptop and on a phone, playable with no network
- [ ] `docs/12-judge-qa.md` open on a phone

## Offline fallback

Three layers, in this order. Conference Wi-Fi dying is the expected case, not the unlucky one.

1. **Local mode.** A second instance already running against the local Postgres 18 on 5432, seeded,
   on a second port, with the SAT list snapshot and the CEP fixture on disk. Same SQL, same driver,
   same migrations, per ADR-0003. The only thing that changes is which host the browser points at.
2. **Recorded video.** The backup demo video on the laptop and on a phone, playable with no network.
   Capital One confirmed a backup video is allowed.
3. **The engine itself.** Open a detector next to its test file and run `bun test` with the Wi-Fi
   off. That is a demo of the thing they are actually grading, and it is better than apologising.

If the judge's phone cannot reach the intake page, do beat 3 from our second phone and say why. A
volunteered reason costs nothing; a silent workaround looks like a trick.

## Rules

- Nothing in the demo is faked. If a piece is stubbed, say so out loud before they ask. Capital One
  said explicitly they are hunting for Wizard-of-Oz prototypes, and a volunteered caveat buys more
  credibility than it costs.
- The demo runs on seeded synthetic data, and we say that sentence every single time, in beat 1.
- The only real data on screen is the SAT list in the lookup box and the CEP in beat 4, and we name
  both as real when they appear. Real RFCs never sit next to synthetic invoices, per ADR-0002.
- Never demo from a branch. Always from what is deployed, or from `main`.
- Never start a long agent run or a refactor inside the demo window.
- Never say a number that is not on the screen.
