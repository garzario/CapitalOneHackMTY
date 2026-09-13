/**
 * @hackmty/constancia writes the retention artifact: a real PDF, produced on
 * the server with no dependency and no headless browser.
 *
 * Three documents. `sweepConstancia` records what a published version of the SAT
 * Article 69-B list did to deductions the company had already taken, `runConstancia`
 * records one weekly payment run with how each instruction was resolved and what left
 * on the rail, and `paymentReceipt` records one transfer: what left, to whom, under
 * which clave de rastreo and what can be proven about the seal. All three carry a
 * SHA-256 digest of the ledger range they describe, so a reprint can be checked
 * against the original.
 *
 * Everything here is pure. The instant is passed in, so the same input produces
 * byte-identical output, which is what makes the digest worth printing.
 */

export * from "./document";
export * from "./hash";
export * from "./layout";
export * from "./pdf";
export * from "./receipt";
