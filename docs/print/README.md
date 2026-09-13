# Print artifacts

Issue #74. These files are dependency-free and use system fonts so they can be printed from any
current browser without a build step.

## Files

- `judge-card.html`: two A5 landscape pages, front and back. Print duplex and flip on the short
  edge.
- `one-pager.html`: one A4 portrait page. Print 10 copies for the table.
- `team-card.html`: one A4 portrait page, in Spanish, for the four of us and not for a judge. The
  problem, the user, the model, the nine competitor entries `docs/04-market.md` documents with one
  line each, the union claim with the 49 Bis scope, the two sentences never to say, and the six
  objections of 2026-09-12 with the answer to each. Print four copies and carry one each. Issue #171.
- `repo-qr.png`: QR code for `https://github.com/garzario/CapitalOneHackMTY`, generated and decoded
  locally before commit.
- `print.css`: shared print styles with exact physical page dimensions.

## What may go on the team card

Every number on `team-card.html` comes from `docs/04-market.md`, `docs/05-business-model.md` or
`docs/11-pitch.md`, and nothing else. If a number is not in one of those three, it does not go on the
card and it is not said at the table. The full answers, each with the file or the endpoint that holds it
up, are the "Table feedback of 12 September" section of `docs/12-judge-qa.md`, and that file wins if the
two ever disagree.

## Re-measuring the team card after an edit

`.page` is a fixed 297mm box with `overflow: hidden`, so a card that no longer fits still prints as
one page and silently loses the bottom of the last block. Printing to PDF and counting pages does not
catch that. Two checks, both headless, and both required after any edit to that file:

1. Render it and confirm one page of exactly A4: the PDF carries `/Count 1` and a `/MediaBox` of
   `0 0 594.96 841.92`, which is 210 by 297 millimetres.
2. In the same browser, with the page loaded, read `page.scrollHeight - page.clientHeight` on the
   `.page` element. It has to be **0**, and the bottom of `.answer-list` has to sit above
   `clientHeight` minus the 16mm bottom padding the absolutely positioned `.footer-line` sits in.
   At the time of writing that leaves 1041 against a limit of 1062 at 96 dpi, about one line of
   slack, so a block added to that card costs another block somewhere.

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
