# 10. Demo script

Four minutes. Every beat has an expected on-screen result and a fallback. Drift between this file
and the product is how demos die, so whoever changes the demo path updates this file in the same PR.

Owner: Fabricio (`FabriBanda`), verified by whoever is presenting. Due M3.
Presenter: TODO(garzario). Backup presenter: TODO(garzario).

## Beat sheet

TODO(FabriBanda): fill the click, result and sentence columns once the screens exist. Keep five
beats. The third beat is the one from `docs/03-user-journey.md` that is the product, and it gets the
most time.

| Time | Who speaks | Exact click or command | Expected on screen | The one sentence said over it | Fallback if it breaks |
|---|---|---|---|---|---|
| 0:00 to 0:35 | | nothing, talking | the persona slide | the persona's ten-second problem, in their words | skip to the product, the problem survives without a slide |
| 0:35 to 1:10 | | open the live URL, already loaded in tab 1 | the landing state with real seeded data | what they are looking at, and that the data is synthetic | local instance on the second port |
| 1:10 to 2:30 | | the key interaction | **the moment that is the product** | the mechanism in one sentence, not the feature list | the recorded video, cued to this beat |
| 2:30 to 3:15 | | open `packages/core/src/<algo>.ts` beside its test file | the function and the test names | why it is deterministic, testable and auditable | `bun test` output captured in the terminal already |
| 3:15 to 4:00 | | back to tab 1 | the outcome state | the business line and the ask | nothing to break |

## Seeded IDs used in the demo

Printed by `bun run seed`. These must match `docs/09-api.md` exactly.

| Thing | ID | Note |
|---|---|---|
| Hero account | TODO(fabbyyyy) | The one the whole demo runs on |
| Secondary account | TODO(fabbyyyy) | For the comparison beat |
| Date range | TODO(fabbyyyy) | Must include the seeded seasonality |
| Seed value | TODO(fabbyyyy) | Committed, so the IDs are stable |

## Pre-demo checklist

Run this before every rehearsal and before every judge walk-up. It takes ninety seconds and it is
the difference between looking real and looking like a prototype.

- [ ] `bun run demo` is green on this machine, right now
- [ ] `bun run seed` has run and printed the expected counts and IDs
- [ ] `curl /api/health` returns `ok` and names the live database path
- [ ] One browser window, demo tabs in order, every other window closed
- [ ] Notifications off, Do Not Disturb on
- [ ] Browser zoom at 100 percent, or a deliberate larger value that is the same every time
- [ ] The local fallback instance is already running on a second port
- [ ] Battery above 50 percent or plugged in
- [ ] The recorded video is on the laptop and on a phone, playable with no network
- [ ] `docs/12-judge-qa.md` open on a phone

## Offline fallback

Two layers, in this order.

1. **Local mode.** A second instance already running against the local Postgres 18 on 5432, seeded,
   on a second port. Conference Wi-Fi dying is the expected case, not the unlucky one.
2. **Recorded video.** The backup demo video, on the laptop and on a phone, playable with no
   network. Capital One confirmed a backup video is allowed.

If both fail, the honest move is to open `packages/core` and its tests and walk the algorithm. That
is still a demo of the thing they are actually grading, and it is better than apologising.

## Rules

- Nothing in the demo is faked. If a piece is stubbed, say so out loud before they ask. Capital One
  said explicitly that they are looking for Wizard-of-Oz prototypes, and a volunteered caveat buys
  more credibility than it costs.
- The demo runs on seeded synthetic data and we say that sentence every single time.
- Never demo from a branch. Always from what is deployed, or from `main`.
