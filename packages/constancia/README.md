# @hackmty/constancia

The retention artifact, as a real PDF, written on the server with no dependency
and no headless browser.

```
src/
  pdf.ts        the file format: objects, cross-reference table, text, rules
  layout.ts     margins, a cursor that breaks pages, and the four blocks
  document.ts   the two constancias
  hash.ts       the SHA-256 digest of a ledger range that goes on the page
```

## Why this exists at all

A constancia is what the accountant files. Eighteen months later the SAT asks
why a deduction was taken, or why a payment was held, and this is the piece of
paper that answers. It has to be a document a person keeps, not a screenshot.

`apps/api` is a Hono app on the Node runtime per ADR-0005, so Chromium is not
available to it: 300 MB, a sandbox to configure, and a demo that shells out to a
browser to make a receipt is a demo that fails at the table. What the document
actually needs is text, rules and two weights of Helvetica, which is a few
hundred lines of a format written down in ISO 32000-1 and far less risk than a
dependency added at four in the morning.

## What the documents say, and what they refuse to say

- **They state what was checked, not only what was found.** "Twelve suppliers
  were matched against version 2025-12-31 and one of them was on it" is an
  answer. "One supplier was on the list" is a claim with no denominator.
- **They name their own sources.** The list version, its DOF publication date,
  where the snapshot came from and when it was retrieved, the ledger range and
  its digest. A number with no provenance on a fiscal document is worth nothing.
- **They accuse nobody.** Same register as `Finding.explanation` in ADR-0002:
  the list says this, the documents say that, a person decided.
- **They watermark synthetic figures on the page.** A demo document that could
  be mistaken for a real one is the single worst thing this repository could
  print, so the band comes from `synthetic: true` on the record and never from
  a name.
- **The digest is called a huella and never a firma.** It is a SHA-256 content
  digest over the canonicalised events of the range. It proves that two
  printings of the same range describe the same facts. It does not prove who
  produced the file, and the page says so in as many words. Claiming otherwise
  would need a key we do not have and a certificate authority we are not.

## Determinism

Everything here is pure and the issue instant is an argument, so the same input
produces byte-identical output. That is not a nicety: it is what makes printing
a digest on the page meaningful, and there is a test for it in each of the three
test files.

## Fonts and encoding

Helvetica and Helvetica-Bold are base-14, so nothing is embedded and the file
stays a few kilobytes. The price is that the widths live here, in
`HELVETICA_WIDTHS`, which is what lets text wrap and cells truncate correctly.
Accented glyphs share the advance width of the letter under them, which is a
property of the face rather than an approximation.

The content is WinAnsi, written one byte per character, so every accent and `Ñ`
survives and the cross-reference offsets stay exact. A character outside that
encoding becomes a question mark, which a human can see, rather than a dropped
byte, which nobody can.

## Reading a generated file

The streams are uncompressed on purpose. `less` on the PDF shows the text
operators, which is what makes a layout bug a two minute problem instead of an
afternoon.
