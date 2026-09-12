# Print artifacts

Issue #74. These files are dependency-free and use system fonts so they can be printed from any
current browser without a build step.

## Files

- `judge-card.html`: two A5 landscape pages, front and back. Print duplex and flip on the short
  edge.
- `one-pager.html`: one A4 portrait page. Print 10 copies for the table.
- `team-card.html`: one A4 portrait page, in Spanish, for the four of us and not for a judge. The
  problem, the user, the five competitors, the model, and the six objections of 2026-09-12 with the
  answer to each. Print four copies and carry one each. Issue #171.
- `repo-qr.png`: QR code for `https://github.com/garzario/CapitalOneHackMTY`, generated and decoded
  locally before commit.
- `print.css`: shared print styles with exact physical page dimensions.

## What may go on the team card

Every number on `team-card.html` comes from `docs/04-market.md`, `docs/05-business-model.md` or
`docs/11-pitch.md`, and nothing else. If a number is not in one of those three, it does not go on the
card and it is not said at the table. The full answers, each with the file or the endpoint that holds it
up, are the "Table feedback of 12 September" section of `docs/12-judge-qa.md`, and that file wins if the
two ever disagree.

## Print settings

1. Open the HTML file in a current browser.
2. Select 100 percent scale, zero browser margins and background graphics on.
3. Print one test copy and scan the repository QR from a different phone.
4. For the judge card, confirm that the front and back share the same orientation before printing
   the final copies.

## Blocked inputs

Do not send either artifact to print until both placeholders below are replaced and scanned from a
printed test copy:

- `TODO(fabbyyyy): LIVE_APP_URL`, then replace the dashed live-app QR block with a QR made from the
  final HTTPS URL. There are two of them, one on the card and one in the hero slot of the one-pager.
- `TODO(fabbyyyy): REAL_CEP_CLAVE_RASTREO`, copied exactly from the team's real one-cent CEP and
  checked at `https://www.banxico.org.mx/cep/`.

Never substitute a synthetic tracking key for the missing real CEP. The card is stronger with an
obvious TODO than with evidence a judge cannot reproduce.
