/**
 * @hackmty/sat is the Article 69-B half of Ceptinela: load a published version of
 * the SAT list, match a supplier RFC against it, and replay the event ledger to
 * price what a new publication just did to invoices we already deducted.
 *
 * Three constraints shape this package.
 *
 * 1. **Runtime neutral.** `apps/api` runs on the Node runtime per ADR-0005, so
 *    nothing here imports `bun:*` or reaches for a Bun global. `loadSnapshot`
 *    takes text, bytes or a URL, and the URL path takes an injectable `fetch`,
 *    so a test never touches the network. The one filesystem read in the package
 *    is `loadOfficialSnapshot`, and it imports `node:fs/promises` dynamically so
 *    that a browser bundle that never calls it never pulls it in.
 * 2. **Pure.** `matchRfc`, `sweep`, `priceSweep` and `simulatePublication` are
 *    functions of their arguments. `sweep` in particular is a fold over
 *    `LedgerEvent[]` and nothing else, which is what makes the retroactive
 *    exposure number reproducible in front of a judge.
 * 3. **Nothing is dropped silently.** A row the loader cannot read comes back in
 *    `rejected` with the line number and the reason, and a row whose declared
 *    situation has no readable date comes back in `warnings`. A fiscal blacklist
 *    that quietly loses rows is worse than no blacklist.
 *
 * The detectors are NOT here. `sat_69b` lives in `packages/core` with the other
 * five and consumes what this package returns.
 *
 * ```
 * src/
 *   csv.ts          bytes to rows: encoding detection and RFC 4180
 *   dates.ts        DOF publication dates, including the shapes the file gets wrong
 *   loader.ts       loadSnapshot: one published version into SatListEntry[]
 *   match.ts        matchRfc, matchRfcAsOf, statusHistory, createSatIndex
 *   sweep.ts        sweep, priceSweep, paidCfdisOf, simulatePublication, the rates
 *   official.ts     the committed real download and its provenance
 *   rfc.ts          normalizeRfc, isRfcShaped, the SYN prefix rule
 *   status.ts       the four situations and how the published file spells them
 *   snapshot/       the committed CSV, its README, and the synthetic fixture
 * ```
 */

export * from "./csv";
export * from "./dates";
export * from "./loader";
export * from "./match";
export * from "./official";
export * from "./rfc";
export * from "./snapshot/synthetic";
export * from "./status";
export * from "./sweep";
