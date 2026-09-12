# Redacted real documents

Everything in this folder is a copy of a document a PAC actually stamped, with
every identifier and every amount replaced before it reached the repository. It
exists for one claim, and the claim is only worth making if it is literally true:
the parser in `packages/core/src/cfdi.ts` has been run against a real CFDI.

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
before importing the payment complement that settles the same invoice, so both
documents keep pointing at each other, and then forget it. It is the secret that
makes the amounts unreadable, and it is never written to a file that is
committed.

The change map, which is the only way back to the original, is written to
`.seed/real/<name>.map.json`. That path is gitignored. Never commit it, never
paste it into an issue and never put it in a screenshot.

Full explanation, including what is replaced, what is deliberately kept and what
the residual risks are, in `docs/08-data-model.md`, section "Real document
validation".

## What reads this folder

`packages/core/src/cfdi-real.test.ts` parses every file here, and asserts again,
over the committed bytes, that every RFC is synthetic and that no stamp or
certificate survived. With the folder empty the suite skips with a message
instead of failing, so the repository is green before the first document arrives.
