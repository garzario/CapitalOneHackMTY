/**
 * @hackmty/cep is the only place that reads, retrieves or checks a Banxico CEP.
 *
 * Four pieces, in the order the product uses them: `fetchCep` gets the document,
 * `parseCep` turns it into the domain `Cep`, `verifySignature` says what we can
 * and cannot prove about the Banxico seal, and `nameMatch` compares the account
 * holder against the legal name on the CFDI.
 *
 * Server only, because `verifySignature` imports `node:crypto`. `apps/web` goes
 * through POST /api/v1/cep/verify. What is verified and what is still pending the
 * real CEP golden file is written out in README.md in this folder; read it before
 * quoting this package in the pitch.
 */

export * from "./fetch";
export * from "./fixtures";
export * from "./name-match";
export * from "./parse";
export * from "./signature";
export * from "./xml";
