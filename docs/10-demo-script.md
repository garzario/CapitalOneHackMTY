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
| 0:00 to 0:55 | **1. The payment run** | Tab 1, already loaded: the payment-run screen | This week's run, its totals, rows sorted with the alert rail on the right by pesos at risk, seven findings on 92 instructions, six lines and 785,289.86 MXN that are not leaving, the `datos sinteticos` watermark | "This is Thursday for the person who pays the suppliers of a 28-person metalworking shop in Apodaca. Ninety two transfers in one sitting, and all of this data is synthetic. SentryOne has already read every invoice, so the run arrives sorted by how much money is at risk instead of alphabetically." | Local instance on the second port, same screen, same data |
| 0:55 to 1:50 | **2. The SAT publication replay, and a real RFC** | Click `Simular publicacion 69-B`. Then go back to tab 1 for five seconds, and then hand the judge the lookup box and let them type a real RFC | Seven months of ledger replay in under three seconds, newly listed suppliers lighting up, the exposure counters climbing (deducted base 878,592.59, ISR 263,577.78, IVA 140,574.81), a constancia PDF to download. Back on the run screen `INS-2026-09-07-070` has moved from `Verificar` to `Retener` on its own, 2 held and 4 to verify have become 3 and 3, the money held has gone from 592,592.38 to 676,112.38 MXN, and the alert rail has gained the `definitivo` row at 487,672.59 MXN at risk, second only to the largest hold. The lookup box answers from the official list | "Here is the part nobody instruments. When the SAT publishes a new Article 69-B list, everything you already paid and already deducted to a supplier on it is exposed retroactively. We replay the ledger, quantify it, and then look what happens on the run: that payment re-decided itself while we were on the other tab, because the publication is new evidence and the same engine scored it again. The list is the real one, and this box is separate from the simulation on purpose: real RFCs never touch our synthetic invoices." | The lookup box alone, offline from the committed list snapshot. If the replay stalls, the recorded video cued to this beat. If the run screen has not moved, say the stream dropped and reload tab 1 once: the totals are stored, not streamed |
| 1:50 to 2:35 | **3. An instruction arriving by QR** | Judge scans the QR on the printed card, photographs the CLABE printed on it, submits | The intake page accepts it, the big screen gains a row within two seconds over SSE, with the finding and the two digits that differ from the account we have paid 52 times, the plaza sentence naming both places, `580 (APODACA, NL)` against `180 (DISTRITO FEDERAL, DF)`, and the network chip next to it: the SentryOne network holds two fraud reports from other companies on this exact account, and months of payments to the account this supplier has always been paid on | "Send it yourself. That instruction went from your phone to the engine and back to this screen without a reload, and the reason it is flagged is on the chip: this account differs in two digits from the one we have paid this supplier on 52 times, and one of those two digits is the plaza. That is the fourth to sixth digit of any CLABE and it is where the account was opened, so this one was opened in Mexico City while the account we have always paid is in Monterrey. The seeded line adds the other half, which you cannot see on the row you just sent because the row you just sent names no invoice: on that one the engine also compares the plaza against the postal code the invoices were issued from, 64000, Nuevo Leon. The second chip is the part no Mexican tool has. Two other companies in the network have already reported this exact account as fraud, and the account this supplier has always been paid on is paid by many of them, for months. The network is synthetic, generated for this demo, and the warehouse behind it is real Snowflake." | Type the CLABE instead of photographing it. If the judge's phone fails, do it from our second phone. If SSE drops, reload once and say the stream dropped |
| 2:35 to 3:20 | **4. The cent inside the run, and the CEP** | Open the CEP tab with the hero already in it, `#/cep?instruction=INS-2026-09-07-047`, and press **Verificar cuenta** once. Then put `INS-2026-09-07-035` in the box, press **Ver el estado**, and press **Verificar cuenta** once | The panel walks itself: `CENTAVO ENVIADO` with the clave de rastreo the rail answered, then `CEP FIRMADO POR BANXICO` with the holder name beside the CFDI legal name, the seal exactly as reported (`SELLO NO VERIFICADO` on this build), and the end state. `-047` ends `PAGO LIBERADO`, `-035` ends `PAGO BLOQUEADO` on a holder that is not the supplier, both decided by the engine and signed `system`. Nothing is typed after the click | "Mexico has no confirmation-of-payee API, so the only document that says who held an account is the receipt the central bank signs for a SPEI. So one cent travels inside the same run. The clave de rastreo comes back from the bank instead of from a keyboard, and with the CEP in hand the engine released this payment and blocked that one. Two things to separate: the cent is recorded on our Nessie bank mirror, which is a sandbox and not a bank, and the CEP is Banxico's. The seal says not verified because this server holds no Banxico certificate, and not verified is not the same claim as invalid." | The same screen with `?data=mock`, which carries one instruction per state and needs no API. Never say a seal was validated while the screen says `SELLO NO VERIFICADO`, and never press the button twice: a settled payment answers 409 and the panel says so |
| 3:20 to 4:00 | **5. The metrics page, and the business line** | Open the metrics page. For an engineer judge, open the detector beside its test file instead and run `bun test` | Precision, recall and false-positive rate with the case count next to them, per control, plus the note naming anything we measured and refused to ship. 35 labelled holdout cases: 0.87 precision, 0.83 recall, 0.016 false positive rate, and the level matrix underneath, where 12 of 12 lines that should read confiable do | "No case in that folder was edited to make a control pass, and the four labels that still disagree with the engine are counted against us. Read it the way the clerk does: of twelve payments that should have come out trustworthy, twelve did. Nothing here is a language model: the decision is deterministic and you can read it." | `bun test` output already captured in the terminal, or the metrics JSON from `GET /api/v1/metrics` |

### Does it fit in four minutes

Counted rather than guessed, on 2026-09-13. The spoken lines above are 405 words. At 150 words a
minute, which is an ordinary presenting pace and slower than conversation, the talking alone is
2:42 of the 4:00.

| Beat | Allotted | Words | Talking at 150 wpm | Slack for the clicking |
|---|---|---|---|---|
| 1. The payment run | 55 s | 51 | 20 s | 35 s |
| 2. The SAT replay and a real RFC | 55 s | 91 | 36 s | 19 s |
| 3. An instruction by QR | 45 s | 105 | 42 s | 3 s |
| 4. The cent and the CEP | 45 s | 110 | 44 s | 1 s |
| 5. The metrics page | 40 s | 48 | 19 s | 21 s |

The words fit. Beats 3 and 4 do not, and that is the finding: both have under five seconds of room
and both are the beats that need a human to physically do something. Beat 3 waits on a judge
unlocking a phone, framing a QR, photographing a CLABE and pressing send. Beat 4 presses a button
and waits for a panel to walk itself through four states twice.

So the rehearsal target is not the whole script, it is those two beats with a stopwatch. If either
overruns, the line to cut is in beat 4: the second half of its sentence, from "Two things to
separate", is a caveat that can be given as an answer if it is asked instead of volunteered up
front. Never cut beat 3.

Beat 1 and beat 3 are stage 3 of `docs/03-user-journey.md`, the moment that is the product. Beat 3
is the one to protect if time is lost, because a judge who sent the instruction themselves does not
need to be convinced that the product runs.

`bun run demo` checks eight things rather than these five, and none of the extra three is a beat
this sheet is missing. It asserts the CEP parser and the name comparison on their own before it runs
the cent through the pipeline, because a document that fails to parse and an account that fails to
match are two different failures and the headless check says which, while on stage they are one
screen; it puts the consortium network into a decision offline, which on stage is the chip inside
beat 3 rather than a stop of its own; and it reads the level and the state of every line of the run
after beat 3 has published the list, which on stage is the colour of the chips in beats 1 and 2. That
last one also prints the evidence letter of the line the publication cancelled and checks it is one
page, because the letter is a link on the instruction panel rather than a stop on the walkthrough.

Its rows are worth reading out if a judge asks how the engine decides. On seed 69 three lines of one
run carry three different state rules: `INS-2026-09-07-047` is `liberado` on a release, the line whose
CEP named somebody else is `cancelado` through `verification_blocked`, and `INS-2026-09-07-070` is
`cancelado` through `sat_definitive` once the publication lands. One vocabulary, three reasons, and
each reason is a row of the ADR-0009 table.

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
| Hero instruction | `INS-2026-09-07-047` | The CLABE two digits off (positions 4 and 9), 38,417.48 MXN, verificar. Position 4 is inside the plaza, so one of the two digits moves the account from `580 (APODACA, NL)` to `180 (DISTRITO FEDERAL, DF)`. Beat 4 sends the cent on this one and the CEP names the supplier, so it ends `PAGO LIBERADO` |
| The line the CEP blocks | `INS-2026-09-07-035` | 235,452.07 MXN, the largest line no other control stops, which is why the CEP is the only thing that can. The holder on its CEP is another company, so beat 4 ends it `PAGO BLOQUEADO` and the engine's action moves from `release` to `verify` |
| Hero supplier RFC | `SYN990202S02` Maquinados Industriales Regios SA de CV | Synthetic, `SYN` prefixed, paid 52 times on `012580100091764611` |
| Hero account on the instruction | `012180102091764611` | Valid check digit, so it is a changed account and not a typo. This is the CLABE on the printed card |
| Plaza on the hero line | `580` to `180` | The only one of the 92 lines whose account sits outside Nuevo Leon. The other 91 are in `580` or `598`, so a judge who asks "does this fire on everything" can be shown the answer on the same screen |
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

### The network line, and what it must never claim

The consortium signal appears on stage once, in beat 3, as the second chip on the hero instruction. It
is the only place in the demo where data from outside this company reaches a decision, so it carries
the highest risk of a sentence we cannot back. The mechanism is ADR-0006 and the privacy half is
`docs/06-regulatory-privacy.md#8-the-consortium-network-what-leaves-the-tenant`.

**Where it shows up, and where it does not.** The chip is on the finding of an instruction that went
through intake, which is beat 3, and the same numbers are readable through
`GET /api/v1/consortium/signal?rfc=&clabe=`. It is not on the lines of the run the screen opens with:
that run is assessed once at boot, before anything is pulled, so its stored findings carry no network
and `apps/api/src/assess.ts` is deliberately unchanged. Post the instruction and the chip appears.
Three shapes exist and beat 7 of `bun run demo` prints one of each, which is how this paragraph gets
checked before a rehearsal.

| What the network says | Which line it is on | What the chip reads |
|---|---|---|
| Two other companies reported this exact account as fraud | The hero account of `SYN990202S02`, posted through intake in beat 3 | `Red SentryOne 2 reportes de fraude`, and the finding is `critical` whatever the CEP says |
| The network has never seen this account and does hold another one for the supplier | The largest stopped line of the run, posted through intake | `Red SentryOne sin registro de esta cuenta, 1 otra cuenta del proveedor` |
| Many companies have paid this exact account for months | A released line, for the judge who asks why something with no history here was released anyway | `Red SentryOne pagada por N empresas desde <month>` |

**Say this, in this order, and do not compress it.**

1. "Two other companies in the network have already reported this exact account as fraud, and the
   account this supplier has always been paid on is paid by many of them, for months."
2. "The network is synthetic. It is a network of other tenants we generated for this demo, from the
   same committed seed as everything else on this screen."
3. "The warehouse is real. That is Snowflake, those are rows we wrote, and what leaves a company is
   a salted hash of the supplier and the account, a bank code and one of four outcomes. No name, no
   amount, no account number."

**Never claim, in any form.** That real companies are on the network. That the counts come from real
firms or real payments. That there is an installed base, a pilot, a partner or a participant. That the
engine queried Snowflake to produce the chip, because it did not: it read a local snapshot and the
`pulled_at` on it is visible. Every one of those is a sentence a judge can falsify in one question,
and the cost of being caught on this chip is the credibility of the other four beats.

**If a judge asks how many companies are on it**, the answer is one, ours, and the rest are synthetic,
said in that order and without softening. Then offer the mechanism: the same three commands run the
same way against a second real tenant, and the table has nowhere to put a name.

**Never run `bun run consortium:pull` during the demo.** It needs `ALLOW_CONSORTIUM`, it resumes a
warehouse that Snowflake bills with a 60-second minimum, and it moves `pulled_at` under the judges'
feet. Pull before the rehearsal, demo off the snapshot. On a laptop with no account, or with no
uplink, `bun run consortium:pull --offline` fills the same table from the deterministic generator and
records `source = 'synthetic'`, which is the path beat 7 of `bun run demo` exercises.

### The line that carries a finding and is released anyway

On the run the screen opens with, seven lines carry a finding and only six of them are stopped.
`INS-2026-09-07-032` shows a duplicate-invoice warning worth 2,088.00 MXN of expected loss and the
engine released it, because one day of delay with that supplier costs 4,611.27 MXN. It is the only
line on the run where the second half of the decision changes the answer, so it is the line a judge
who reads the screen carefully will point at.

**Say this.** "A finding is not an order to stop the payment. The engine weighs what is at risk
against what waiting costs, and on that line waiting costs more than the risk, so it releases and
leaves the finding on screen for the clerk. That is deliberate: an engine that holds everything is
an engine the clerk switches off in week two."

**Then, if they push.** The cost of a day is `Supplier.delayCostPerDay`, priced per supplier from two
things a contract actually carries: moratory interest on the balance we owe them, and the pronto pago
discount that expires the day the payment is late. It is higher for the raw material and the tooling
that stop production than for consumables and services. It is on the instruction screen as "Costo de
retrasar un dia" and the arithmetic is in `packages/seed/src/sentryone/delay-cost.ts`.

**Never say** that the engine released it because the finding was weak, or that a warning is ignored.
The finding stands, the pesos at risk are on screen, and the clerk can hold the payment anyway with
their own name on it. And never say a critical finding could be released this way: rules 1 and 2 of
`decide` return above the branch that weighs anything, so it cannot happen.

### Numbers the screen shows

Say these only while they are on the screen. `bun run demo` prints every one of them from the API
it just drove, so the way to check this table before a rehearsal is to run it and read the output.

Two figures are the exception, and it is worth knowing why, because they are the ones a judge with
`curl` could make disagree with the script. The demo posts its own intake before it publishes the
list and the stage does not, so its run is one line ahead of the screen: the absolute totals after
beat 2, which are the held split and the two pesos-at-risk figures, are read off
`GET /api/v1/run/current` in the stage order instead. What the script asserts is the part that is
identical on both paths and is also the part the claim rests on: the run-level 69-B pair, and that
the pesos at risk climb by exactly the exposure the publication priced.

| Number | Value | Where it comes from |
|---|---|---|
| Run total | 2,174,210.76 MXN over 92 instructions | `GET /api/v1/run/current` |
| Not leaving yet | 785,289.86 MXN, 6 lines of the 7 that carry a finding, 2 held and 4 to verify. After beat 2 the same 785,289.86 is 3 held and 3 to verify, 676,112.38 of it held | The six controls over the seeded run, and the re-score the publication runs |
| What a day of delay costs | 101.98 to 4,611.27 MXN across the 44 suppliers, 1,120.05 MXN on the hero line | `Supplier.delayCostPerDay`, priced per supplier in `packages/seed/src/sentryone/delay-cost.ts` and shown on the instruction screen |
| Retroactive exposure | 404,152.59 MXN: 263,577.78 ISR and 140,574.81 IVA over a deducted base of 878,592.59 | `POST /api/v1/sat/publish` with `simulate` |
| The same exposure on the run | `retroactive69bBase` 878,592.59 and `retroactive69bExposure` 404,152.59 on `totals`, up from zero on both, and the pesos at risk climb by exactly 404,152.59, from 799,209.86 to 1,203,362.45 | `GET /api/v1/run/current` after beat 2. The publication re-scored `INS-2026-09-07-070`, so the figure is the run's own findings and not a second arithmetic. Issue #175 |
| What the re-score moved | One line, `INS-2026-09-07-070`, 83,520.00 MXN: `verify` to `hold`, signed `system`, expected loss 292,603.55 MXN against 760.67 a day of delay. Its new `sat_69b` finding puts 487,672.59 MXN at risk, the instruction plus the voided deductions | `rescored` on the publish response, and `bun run demo` beat 3 prints it |
| Blind evaluation | 35 labelled cases, 0.87 precision, 0.83 recall, 0.016 false positive rate, and 12 of 12 confiable lines right | `GET /api/v1/metrics`, `perDetector` and `perLevel`, over the holdout in `packages/seed/src/holdout/cases` |
| The network, offline | 46 hashed pairs, 45 corroborated, 1 with a fraud report | Beat 7 of `bun run demo`, from the generator at seed 69, `source = 'synthetic'` |
| The network, pulled from Snowflake | The same 46 pairs, and one more tenant per pair this company itself pays | `bun run consortium:pull` after `consortium:push`, because the view counts every tenant that wrote a row and we are one of them |
| The cent | 0.01 MXN per probe, one per instruction | `POST /api/v1/instructions/:id/verify-account`, and the `cent_sent` event carries the amount rather than implying it |
| Expected loss the CEP put on the blocked line | 141,271.24 MXN on `INS-2026-09-07-035`, which showed 0 before the cent | `decide` in `packages/core`, off the `beneficiary_cep` finding the CEP produced |

### Where it is deployed

| Surface | URL | What it proves |
|---|---|---|
| Web | <https://sentryone-one.vercel.app> | The screens, from Vercel. `?data=api` forces the deployed backend and renders the error state instead of falling back, `?data=mock` runs the same screens with no network |
| API | <https://api.104.238.147.69.sslip.io/health> | The Hono app on Vultr, HTTPS through Caddy on a sslip.io name |
| Same origin | <https://sentryone-one.vercel.app/api/v1/run/current> | The browser only ever talks to Vercel: `vercel.json` rewrites `/api` and `/health` to the instance, so there is no CORS story and no base URL in the bundle |

`sentryone.tech` is not registered yet, issue #59. The URLs above are what goes on the printed card
until it is. Deploy commands and the topology are in `docs/07-architecture.md#deploy-topology-and-commands`.

### Curls a judge can paste

Against the deployed instance. Swap the host for `localhost:3000` after `SEED=sentryone bun run dev`
in `apps/api`, and every line answers the same shapes.

```bash
curl -s https://api.104.238.147.69.sslip.io/api/v1/run/current | jq '.totals'
curl -s https://api.104.238.147.69.sslip.io/api/v1/instructions/INS-2026-09-07-047 | jq '.findings[0].evidence'
curl -s 'https://api.104.238.147.69.sslip.io/api/v1/sat/lookup?rfc=AAA080808HL8' | jq
curl -s -X POST https://api.104.238.147.69.sslip.io/api/v1/sat/publish -H 'content-type: application/json' \
  -d '{"simulate":true,"rfcs":["SYN080910HI8"],"status":"definitivo"}' | jq '{totalExposure, rescored}'
curl -s https://api.104.238.147.69.sslip.io/api/v1/run/current \
  | jq '.totals | {retroactive69bBase, retroactive69bExposure, amountAtRisk}'
curl -sN https://api.104.238.147.69.sslip.io/api/v1/events | head -3
```

The last line is the one worth running in front of an engineer: `event: ready` arrives immediately
rather than when the connection closes, which is what `flush_interval -1` in `deploy/Caddyfile`
buys and what a buffering proxy would take away.

## Pre-demo checklist

Run this before every rehearsal and before every judge walk-up. It takes ninety seconds and it is
the difference between looking real and looking like a prototype.

- [ ] `bun run demo` is green on this machine, right now
- [ ] The deployed pair answers: `bun run deploy:vultr --smoke-only` prints the run id and the total, and <https://sentryone-one.vercel.app/?data=api> shows `Datos: solo API` with the same figures. `bun run demo --base https://api.104.238.147.69.sslip.io` drives the beat sheet over HTTP instead, with beat 7 still in memory because a consortium snapshot is local to a store, and it appends one instruction to the live run, so follow it with `bun run seed` if the printed totals have to match this file exactly. Against `--base` the cent is deliberately not sent either: that beat only reads `GET /api/v1/instructions/:id/verification`, because a deployed instance has a real rail behind it and a pre-rehearsal check has no business spending a centavo and leaving a `cent_sent` on the live ledger every time somebody runs it
- [ ] `bun run seed` has run and printed the expected counts and IDs
- [ ] The API boot line says `repository: memory (sentryone seed 0)` and then the run id. If it says
      `repository: memory (fixture)` the app is serving the twelve-line hand-written fixture and
      every figure in this file is wrong. `SEED` has to reach the API process, and bun reads `.env`
      from the directory a process starts in, not from the repository root: `bun run dev` from the
      root does NOT hand it down. Start it as `SEED=sentryone bun run dev`
- [ ] `curl /health` returns ok, and `bun run doctor` names the live database path
- [ ] The SSE stream is alive: the intake page posts one instruction and the row appears
- [ ] The SAT list snapshot is loaded and its version and publication date are visible
- [ ] `bun run consortium:pull` has run on this machine, `bun run doctor` prints the `snowflake` line
      with the pair count and the `pulled_at` it wrote, and posting the hero account through intake
      renders the network chip. `--offline` is the version that needs no account. Or
      `ALLOW_CONSORTIUM` is unset on purpose and the finding says the network was not consulted, which
      is also green. Never pull inside the demo window
- [ ] The CEP fixture parses and the name comparison answers. TODO(garzario) issue #57: swap in the real CEP and its certificate, and only then say the signature was validated
- [ ] Beat 4 has not been run yet on the instance the judges will see. The cent is sent once per instruction and a second press answers 409, so `GET /api/v1/instructions/INS-2026-09-07-047/verification` must still say `not_started` when the window opens. Re-seed if it does not
- [ ] One browser window, demo tabs in order, every other window closed
- [ ] The printed card is on the table: QR code, the CLABE to photograph, the clave de rastreo, the real RFC
- [ ] Notifications off, Do Not Disturb on
- [ ] Browser zoom at 100 percent, or a deliberate larger value that is the same every time
- [ ] The local fallback instance is already running on the second port, seeded, and
      `bun run offline` was green on this machine today
- [ ] Battery above 50 percent or plugged in
- [ ] The recorded video is on the laptop and on a phone, playable with no network
- [ ] `docs/12-judge-qa.md` open on a phone

## Offline fallback

Three layers, in this order. Conference Wi-Fi dying is the expected case, not the unlucky one.

**Rehearse it with one command.** `bun run offline` runs `bun run doctor` and then the whole demo
with `fetch` replaced by one that throws on anything that is not loopback. Nothing is guessed and no
host list is maintained: a call that leaves the machine fails with its URL in the message, which is
the failure and the diagnosis at once. The local Postgres keeps working, because it speaks its own
protocol over a socket and never touches `fetch`, and that is the point rather than an exception.

The keys stay in `.env` on purpose. A dead uplink is not a missing key and the two produce different
failures: a server with no `GEMINI_API_KEY` refuses in a path we wrote, a server whose uplink is gone
has a key, tries, and waits for a socket that never answers. Only the second happens at Arena
Borregos.

What it cannot do is unplug the machine, so once, before the room fills up, turn the Wi-Fi off and
run `bun run demo` again. The guard replaces `fetch`, and a dependency that opens a raw socket walks
straight past it.

`bun run doctor` ends with the readiness line, and it is the one to read:
`offline demo: ready, this laptop can run the demo with the network unplugged`. It goes red when
the database is unreachable, the migrations are behind or the SentryOne tables are empty, which are
the three things that actually stop an offline demo.

**From a cold clone, measured on 2026-09-13** on a laptop that already had bun 1.3.11 and
Postgres 18. The repository steps are seconds; the prerequisites are the part that is not, and
neither was measured on a clean machine, so install them the night before rather than in the room.

| Step | Command | Measured |
|---|---|---|
| Clone | `git clone --depth 1 --branch dev` | 2.3 s, 20 MB |
| Install, empty bun cache | `bun install --frozen-lockfile` | 2.9 s, 192 packages |
| Database | `createdb sentryone && bun run migrate` | 0.4 s, 9 of 12 applied, 3 need timescaledb and skip |
| Seed | `bun run seed` | 3.1 s |
| Demo, uplink closed | `bun run demo` | 8.9 s, seven beats green |

Under twenty seconds of machine time end to end, which is what the ten-minute claim in issue #71
rests on. The `.env` needs `DATABASE_URL`, `ALLOW_SEED=1` and `SEED=sentryone` and nothing else for
this path: no key in that file is required to reach `demo path is green`.

1. **Local mode.** A second instance already running against the local Postgres 18 on 5432, seeded,
   on a second port, with the SAT list snapshot and the CEP fixture on disk. Same SQL, same driver,
   same migrations, per ADR-0003. The only thing that changes is which host the browser points at.
   The consortium snapshot is in that database too, because `0009_consortium_snapshot.sql` applies on
   both paths, so the network chip survives a dead uplink. Snowflake is never on the demo path.
   The web has its own layer under this one: `?data=mock` serves the whole app from the generated
   snapshot in `apps/web/src/lib/mock-data.ts` and opens no connection at all, which covers the API
   itself dying rather than the uplink.
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
- The only real data on screen is the SAT list in the lookup box, and we name it as real when it
  appears. Real RFCs never sit next to synthetic invoices, per ADR-0002. The CEP in beat 4 is NOT
  real: every CEP this repository holds is the synthetic fixture or a document built for the seeded
  company, its sello is deterministic bytes and not a signature anybody produced, and the screen
  says `SELLO NO VERIFICADO` for exactly that reason. The real one-cent CEP and the Banxico
  certificate that would let us say anything else are issue #57.
- The consortium network is a synthetic network of other tenants and we say so in the same breath as
  the chip, every time, per the network line above. The warehouse is real and the tenants are not.
- Never demo from a branch. Always from what is deployed, or from `main`.
- Never start a long agent run or a refactor inside the demo window.
- Never say a number that is not on the screen.
