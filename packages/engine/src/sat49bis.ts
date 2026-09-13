/**
 * The second half of control 1: Article 49 Bis of the CFF.
 *
 * Control 1 was written against one list and there are two. Article 69-B publishes
 * a taxpayer whose operations the SAT presumes never happened; article 49 Bis,
 * fraccion X publishes a taxpayer whose CFDI the SAT determined are FALSE, after
 * an express home visit it had to finish inside twenty-four business days. The
 * consequence for us is the same sentence in both statutes, that the operations
 * "no producen ni produjeron efecto fiscal alguno", and the difference is the
 * clock: 49 Bis gives the buyer thirty NATURAL days from the DOF publication to
 * file the complementary return, and restricts the buyer's own certificado de
 * sello digital under article 17-H Bis, fraccion XIV when they do not.
 *
 * Three decisions here, each of them deliberate.
 *
 * 1. **Its own finding, not a row inside the 69-B one.** The article, the date,
 *    the deadline and the consequence are different, and a clerk who reads "69-B"
 *    on a 49 Bis publication will look for the supplier in the wrong list. The
 *    explanation names article 49 Bis, the DOF date and the days left.
 * 2. **The same detector id.** `sat_69b` is control 1 and control 1 is the SAT
 *    lists cross-check. The id is persisted in `decision_findings`, constrained by
 *    a CHECK in `0003_sentryone.sql` and counted by the metrics harness, so it
 *    stays what it is: ADR-0002 has six controls, not seven. The evidence carries
 *    `article`, which is what the UI reads to label the row.
 * 3. **`comprobable`, always.** There is no `presunto` here to verify. Fraccion X
 *    publishes one outcome, the resolution of fraccion VIII, inciso b), and it is
 *    already final when it reaches the DOF, so the finding is provable from the
 *    publication and never an accusation of ours.
 */

import type {
  Finding,
  Sat49BisEntry,
  Sat49BisSweepResult,
} from "@hackmty/core";
import { formatAmount, sumAmounts } from "@hackmty/core";
import {
  ART_49BIS_CORRECTION_DAYS,
  ART_49BIS_LABEL,
  correctionWindow,
  match49Bis,
  normalizeRfc,
} from "@hackmty/sat";

/** What a 49 Bis publication already cost us with one supplier, in pesos. */
export interface Swept49BisExposure {
  /** ISR plus IVA at risk on deductions already taken. */
  exposure: number;
  /** How many already paid CFDIs carry it. */
  paidCfdis: number;
  /** Sum of the subtotals already deducted. */
  deductedBase: number;
}

/**
 * The retroactive exposure a 49 Bis publication created for one supplier. Zero
 * when no sweep has been run or when this supplier is not in it, which is the
 * ordinary case.
 */
export function swept49BisExposureFor(
  rfc: string,
  sweep?: Sat49BisSweepResult,
): Swept49BisExposure {
  const wanted = normalizeRfc(rfc);
  const row = sweep?.newlyListed.find(
    (entry) => normalizeRfc(entry.supplier.rfc) === wanted,
  );
  if (row === undefined) {
    return { exposure: 0, paidCfdis: 0, deductedBase: 0 };
  }
  return {
    exposure: sumAmounts([row.isrExposure, row.ivaExposure]),
    paidCfdis: row.paidCfdis.length,
    deductedBase: row.deductedBase,
  };
}

export interface Sat49BisFindingInput {
  entries: readonly Sat49BisEntry[];
  supplierRfc: string;
  instructionAmount: number;
  now: string;
  sweep?: Sat49BisSweepResult;
}

/**
 * The 49 Bis finding for one supplier, or nothing when the supplier is on no
 * publication we hold.
 *
 * Nothing here asks whether the list is LOADED. "Este proveedor no aparece en
 * ninguna publicacion que tenemos" is an answer; whether the 49 Bis list could be
 * loaded at all is a question for `GET /api/v1/sat/lookup`, which answers it with
 * `coverage` rather than with an empty finding list.
 */
export function sat49BisFinding(
  input: Sat49BisFindingInput,
): Finding | undefined {
  const match = match49Bis(input.entries, input.supplierRfc);
  const effective = match.effective;
  if (effective === undefined) {
    return undefined;
  }

  const window = correctionWindow(effective.publishedAt, input.now);
  const swept = swept49BisExposureFor(match.rfc, input.sweep);
  // The pesos about to leave plus the deductions this publication voids. The sum
  // and not the maximum, for the reason `estimateLoss` documents in core: the two
  // are different money, not the same money counted twice.
  const amountAtRisk = sumAmounts([input.instructionAmount, swept.exposure]);

  const evidence: Finding["evidence"] = {
    article: ART_49BIS_LABEL,
    rfc: effective.rfc,
    publishedAt: effective.publishedAt,
    oficio: effective.oficio,
    listVersion: effective.listVersion,
    correctionDays: ART_49BIS_CORRECTION_DAYS,
    publicationsHeld: match.entries.length,
  };
  if (effective.notifiedBy !== undefined) {
    evidence.notifiedBy = effective.notifiedBy;
  }
  if (window !== undefined) {
    evidence.correctBy = window.correctBy;
    evidence.daysLeft = window.daysLeft;
    evidence.windowOpen = window.open;
  }
  if (swept.paidCfdis > 0) {
    evidence.paidCfdis = swept.paidCfdis;
    evidence.deductedBase = swept.deductedBase;
    evidence.retroactiveExposure = swept.exposure;
  }

  return {
    id: `sat49bis:${effective.rfc}:${effective.listVersion}`,
    detector: "sat_69b",
    severity: "critical",
    state: "comprobable",
    subject: { kind: "supplier", id: effective.rfc },
    amountAtRisk,
    explanation: explain(effective, window, swept),
    evidence,
    createdAt: input.now,
  };
}

function explain(
  effective: Sat49BisEntry,
  window: ReturnType<typeof correctionWindow>,
  swept: Swept49BisExposure,
): string {
  const head = `El RFC ${effective.rfc} esta publicado en el listado del articulo 49 Bis del CFF desde el ${effective.publishedAt}: el SAT resolvio que sus comprobantes son falsos con efectos generales y las operaciones no producen ni produjeron efecto fiscal alguno.`;

  const clock =
    window === undefined
      ? `El plazo para revertir el efecto fiscal es de ${String(ART_49BIS_CORRECTION_DAYS)} dias naturales a partir de la publicacion en el DOF.`
      : window.open
        ? `Quedan ${String(window.daysLeft)} dias naturales de los ${String(ART_49BIS_CORRECTION_DAYS)} que da la fraccion X para presentar la declaracion complementaria, a mas tardar el ${window.correctBy}. Si no se presenta, el SAT restringe el sello digital de la empresa conforme al articulo 17-H Bis, fraccion XIV.`
        : `El plazo de ${String(ART_49BIS_CORRECTION_DAYS)} dias naturales para presentar la declaracion complementaria vencio el ${window.correctBy}, por lo que el sello digital de la empresa ya puede quedar restringido conforme al articulo 17-H Bis, fraccion XIV.`;

  if (swept.paidCfdis === 0 || !(swept.exposure > 0)) {
    return `${head} ${clock}`;
  }

  const invoices =
    swept.paidCfdis === 1
      ? "1 factura ya pagada"
      : `${String(swept.paidCfdis)} facturas ya pagadas`;

  return `${head} Hay ${invoices} a este proveedor cuya deduccion queda expuesta por ${formatAmount(swept.exposure)} MXN entre ISR e IVA. ${clock}`;
}
