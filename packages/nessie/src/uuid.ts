/**
 * Deterministic identifiers for imported rows.
 *
 * The implementation moved to `packages/core/src/ids.ts` when the payment execution
 * of issue #198 became its second caller: the rail writes the outflow of a sent line
 * to the bank mirror keyed on the clave de rastreo, `LedgerTx.id` is a uuid, and two
 * derivations of one key shape is what `packages/core/src/exposure.ts` exists to
 * prevent. The type it exists for lives in core too.
 *
 * This file stays as the import path the importer already uses, so nothing in this
 * package had to move. The argument for a version 8 uuid, and the guarantee it makes,
 * are written out where the function is.
 */

export { looksLikeUuid, stableUuid } from "@hackmty/core";
