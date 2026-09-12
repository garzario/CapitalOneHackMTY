# Print artifacts

Issue #74. These files are dependency-free and use system fonts so they can be printed from any
current browser without a build step.

## Files

- `judge-card.html`: two A5 landscape pages, front and back. Print duplex and flip on the short
  edge.
- `one-pager.html`: one A4 portrait page. Print 10 copies for the table.
- `repo-qr.png`: QR code for `https://github.com/garzario/CapitalOneHackMTY`, generated and decoded
  locally before commit.
- `print.css`: shared print styles with exact physical page dimensions.

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
  final HTTPS URL.
- `TODO(fabbyyyy): REAL_CEP_CLAVE_RASTREO`, copied exactly from the team's real one-cent CEP and
  checked at `https://www.banxico.org.mx/cep/`.

Never substitute a synthetic tracking key for the missing real CEP. The card is stronger with an
obvious TODO than with evidence a judge cannot reproduce.
