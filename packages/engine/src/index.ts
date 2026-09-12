/**
 * @hackmty/engine is where the six controls of ADR-0002 become one call.
 *
 * It exists because of a dependency direction, not because of taste.
 * `@hackmty/core` holds the algorithms and carries zero runtime dependencies by
 * rule, and both `@hackmty/sat` and `@hackmty/cep` already depend on it. Core
 * therefore cannot import them without a cycle, so the two adapters that need
 * them live here, this package depends on all three, and `apps/api` depends on
 * this one.
 *
 * Nothing in here is an algorithm. `sat69bAdapter` and `beneficiaryCepAdapter`
 * are argument shaping over `matchRfc`, `nameMatch` and `Cep.signatureValid`;
 * the other four adapters come straight from core. If a rule ever needs to be
 * decided in this package, it belongs in core instead.
 */

import type {
  ComposeInput,
  CompositionReport,
  DetectorAdapter,
  Finding,
} from "@hackmty/core";
import {
  bankReconciliationAdapter,
  clabeForensicsAdapter,
  composeFindingsReport,
  duplicateInvoiceAdapter,
  supplierBehaviourAdapter,
} from "@hackmty/core";
import { beneficiaryCepAdapter } from "./beneficiary";
import { sat69bAdapter } from "./sat69b";

export * from "./beneficiary";
export * from "./sat69b";

/**
 * The six controls, in the order `Detector` declares them in the domain
 * contract, so the report reads the way the docs and the UI list them.
 *
 * This array is the whole answer to issue #106. There is no discovery, no
 * dynamic import and no guessing of argument tuples: adding a seventh control
 * means writing an adapter and putting it in this list, and removing one is a
 * visible deletion rather than a module that quietly stopped resolving.
 */
export const CEPTINELA_DETECTORS: readonly DetectorAdapter[] = [
  sat69bAdapter,
  clabeForensicsAdapter,
  duplicateInvoiceAdapter,
  supplierBehaviourAdapter,
  beneficiaryCepAdapter,
  bankReconciliationAdapter,
];

/**
 * Runs all six controls over one payment instruction.
 *
 * This is the entry point `apps/api` calls. The report says which controls ran
 * and, for the ones that did not, exactly what was missing, so a screen can tell
 * the clerk that the CEP control is not armed on this payment instead of showing
 * an empty panel that reads as "verificado".
 *
 * Pure and synchronous: every control is a pure function of `ComposeInput`, so
 * there is nothing to await and the same input gives the same report.
 */
export function runControls(input: ComposeInput): CompositionReport {
  return composeFindingsReport(input, CEPTINELA_DETECTORS);
}

/** `runControls` when the caller only wants the alert rail. */
export function findingsFor(input: ComposeInput): Finding[] {
  return runControls(input).findings;
}
