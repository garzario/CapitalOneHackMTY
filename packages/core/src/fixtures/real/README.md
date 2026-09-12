# Redacted real documents

Everything in this folder is a copy of a document a PAC actually stamped, with
every identifier and every amount replaced before it reached the repository. It
exists for one claim, and the claim is only worth making if it is literally true:
the parser in `packages/core/src/cfdi.ts` has been run against a real CFDI.

## What is here

Three CFDI 4.0 de ingreso, received by two taxpayers from three issuers and
stamped by two PACs, imported on 2026-09-12 under one shared scale factor.

| File | The document |
|---|---|
| `ingreso-1.redacted.xml` | Industrial supply, no serie and no folio, CRLF line endings |
| `ingreso-2.redacted.xml` | Manufacturing, serie and folio, one single line with no indentation |
| `ingreso-3.redacted.xml` | Weekly commission, IVA and ISR withheld, byte order mark |

They differ from each other on purpose. A parser validated on three documents
that a PAC wrote the same way is validated on one document three times.

## The rule

A real document never enters this folder, and never enters this repository at
all. It is read from outside the repo, or from `.seed/real/`, which is
gitignored, and only the output of the importer is committed here. The nested
`.gitignore` enforces it: nothing but `*.redacted.xml`, this file and itself can
be added.

## Adding one

```
bun run scripts/import-real-cfdi.ts ~/somewhere/outside/the/repo/factura.xml
```

The command prints the scale factor it used. Export it as `REAL_CFDI_SCALE`
before importing the payment complement that settles the same invoice, or any
other document that belongs in the same set, so the amounts stay comparable and
the pseudonyms agree, and then forget it. The three files above were imported
under one factor for that reason. It is the secret that makes the amounts
unreadable, and it is never written to a file that is committed.

The change map, which is the only way back to the original, is written to
`.seed/real/<name>.map.json`. That path is gitignored. Never commit it, never
paste it into an issue and never put it in a screenshot.

Full explanation, including what is replaced, what is deliberately kept and what
the residual risks are, in `docs/08-data-model.md`, section "Real document
validation".

## What reads this folder

`packages/core/src/cfdi-real.test.ts` parses every file here and asserts again,
over the committed bytes, that every RFC is synthetic, that no stamp or
certificate survived, that the totals add up to within a cent, and that none of
the parser's tolerances was needed to read the document. The three names above
are listed in the suite, so deleting one fails instead of quietly shrinking what
is covered. Adding a fourth file needs no change to the test.
