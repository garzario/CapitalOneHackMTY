/**
 * Control 1 of ADR-0002, the Article 69-B cross-check, adapted to `ComposeInput`.
 *
 * The control is two questions asked of data somebody else owns: `matchRfc` in
 * `@hackmty/sat` says which situation is in force for this supplier across every
 * list version we hold, and the `SweepResult` of the newest publication says
 * what a newly listed supplier already cost us in deductions we have taken. This
 * file joins the two into one `Finding` and decides nothing else.
 *
 * Two narrative rules from ADR-0002 are enforced here rather than in the UI.
 *
 * 1. A taxpayer who cleared their name is not listed. `desvirtuado` and
 *    `sentencia_favorable` never raise an alert. They still produce an `info`
 *    row, because "estuvo en la lista y la desvirtuo" is context the clerk wants
 *    and an `info` finding is not an alert: it carries no pesos at risk and the
 *    severity table weighs it at almost nothing.
 * 2. Nothing accuses anybody. `definitivo` is `comprobable` because the DOF
 *    published it and the deduction is void by law, not because we decided
 *    anything about the supplier. `presunto` asks for verification, since the
 *    taxpayer's own clock to answer is still running.
 */

import type {
  DetectorAdapter,
  Finding,
  SatListEntry,
  SatListStatus,
  Severity,
  SweepResult,
} from "@hackmty/core";
import { detectorRan, formatAmount, sumAmounts } from "@hackmty/core";
import { matchRfc, normalizeRfc, SAT_STATUS_LABELS } from "@hackmty/sat";

/** How the finding reads for each situation the list can report. */
const SEVERITY_BY_STATUS: Readonly<Record<SatListStatus, Severity>> = {
  // The comprobantes have no fiscal effect, retroactively. No delay cost is
  // worth paying against that, which is why this is the one that holds.
  definitivo: "critical",
  // Published, and the taxpayer still has time to answer. A person checks.
  presunto: "critical",
  desvirtuado: "info",
  sentencia_favorable: "info",
};

const STATE_BY_STATUS: Readonly<Record<SatListStatus, Finding["state"]>> = {
  definitivo: "comprobable",
  presunto: "requiere_verificacion",
  desvirtuado: "comprobable",
  sentencia_favorable: "comprobable",
};

/** What a publication already cost us with one supplier, in pesos. */
export interface SweptExposure {
  /** ISR plus IVA at risk on deductions already taken. */
  exposure: number;
  /** How many already paid CFDIs carry it. */
  paidCfdis: number;
  /** Sum of the subtotals already deducted. */
  deductedBase: number;
}

/**
 * The retroactive exposure a 69-B publication created for one supplier.
 *
 * `SweepResult` prices what was already paid and already deducted, which is
 * money at risk that the instruction's own amount does not describe. Zero when
 * no sweep has been run or when this supplier is not in it, which is the
 * ordinary case.
 */
export function sweptExposureFor(
  rfc: string,
  sweep?: SweepResult,
): SweptExposure {
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

/**
 * Article 69-B, control 1.
 *
 * An RFC on no version we hold produces no finding at all, and that is a result
 * rather than a skip: "este proveedor no aparece en ninguna version que tenemos"
 * is the answer to the question the clerk asked. Whether a list is loaded at all
 * is a different question, and `GET /api/v1/sat/versions` is where it is asked.
 */
export const sat69bAdapter: DetectorAdapter = {
  detector: "sat_69b",
  run: (input) => {
    const match = matchRfc(input.satEntries, input.instruction.supplierRfc);
    const { effective } = match;
    if (effective === undefined) {
      return detectorRan([]);
    }
    return detectorRan([
      buildFinding({
        effective,
        rows: match.entries.length,
        listed: match.listed,
        instructionAmount: input.instruction.amount,
        now: input.now,
        swept: sweptExposureFor(match.rfc, input.sweep),
      }),
    ]);
  },
};

interface FindingInput {
  effective: SatListEntry;
  rows: number;
  listed: boolean;
  instructionAmount: number;
  now: string;
  swept: SweptExposure;
}

function buildFinding(input: FindingInput): Finding {
  const { effective, listed, swept } = input;
  // The pesos about to leave plus the deductions this publication voids. Taking
  // the sum and not the maximum is the one case where an amount at risk
  // legitimately exceeds the instruction, and `estimateLoss` in @hackmty/core
  // documents it: the two are different money, not the same money twice.
  const amountAtRisk = listed
    ? sumAmounts([input.instructionAmount, swept.exposure])
    : 0;

  const evidence: Finding["evidence"] = {
    rfc: effective.rfc,
    status: effective.status,
    statusLabel: SAT_STATUS_LABELS[effective.status],
    publishedAt: effective.publishedAt,
    listVersion: effective.listVersion,
    listedNow: listed,
    rowsHeld: input.rows,
  };
  if (swept.paidCfdis > 0) {
    evidence.paidCfdis = swept.paidCfdis;
    evidence.deductedBase = swept.deductedBase;
    evidence.retroactiveExposure = swept.exposure;
  }

  return {
    id: `sat69b:${effective.rfc}:${effective.listVersion}:${effective.status}`,
    detector: "sat_69b",
    severity: SEVERITY_BY_STATUS[effective.status],
    state: STATE_BY_STATUS[effective.status],
    subject: { kind: "supplier", id: effective.rfc },
    amountAtRisk,
    explanation: explain(effective, listed, swept),
    evidence,
    createdAt: input.now,
  };
}

function explain(
  effective: SatListEntry,
  listed: boolean,
  swept: SweptExposure,
): string {
  if (!listed) {
    const label = SAT_STATUS_LABELS[effective.status].toLowerCase();
    return `El RFC ${effective.rfc} aparecio en la lista del articulo 69-B y quedo como ${label} el ${effective.publishedAt}. Hoy no esta listado y no detiene el pago.`;
  }

  const head =
    effective.status === "definitivo"
      ? `El RFC ${effective.rfc} esta en la lista definitiva del articulo 69-B desde el ${effective.publishedAt}: sus comprobantes no tienen efecto fiscal, de forma retroactiva.`
      : `El RFC ${effective.rfc} esta publicado como presunto en la lista del articulo 69-B desde el ${effective.publishedAt}. El plazo para desvirtuar sigue corriendo.`;

  if (swept.paidCfdis === 0 || !(swept.exposure > 0)) {
    return head;
  }
  const invoices =
    swept.paidCfdis === 1
      ? "1 factura ya pagada"
      : `${swept.paidCfdis} facturas ya pagadas`;
  return `${head} Ademas hay ${invoices} a este proveedor cuya deduccion queda expuesta por ${formatAmount(swept.exposure)} MXN entre ISR e IVA.`;
}
