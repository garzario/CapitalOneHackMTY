/**
 * Pure projections for the SAT screen.
 *
 * The view does not decide whether a payment is cancelled. It adds the
 * definitive publication to the evidence already carried by the synthetic
 * line, then asks `transactionStateOf`, the same rule used by the engine, API
 * and generated mock. Live data is refreshed from the API instead.
 */

import {
  type Finding,
  type LedgerEvent,
  type SweepResult,
  type TransactionState,
  transactionStateOf,
} from "@hackmty/core";
import type { ApiFailure } from "./api";
import type { PaymentRunItem } from "./contract";
import { SAT_COPY, SAT_SENTENCE } from "./labels";

export function satLookupFailure(error: ApiFailure): string {
  if (error.status === 429) {
    return SAT_SENTENCE.rateLimited(error.retryAfterSeconds);
  }

  return `${error.message} ${SAT_COPY.lookupNeedsApi}`;
}

export function satEventChangesRun(event: LedgerEvent): boolean {
  return (
    event.type === "sat_list_published" ||
    event.type === "decision_made" ||
    event.type === "payment_cancelled"
  );
}

/** The offline button simulates the same definitive status posted by the API. */
export function definitiveSimulationSweep(sweep: SweepResult): SweepResult {
  return {
    ...sweep,
    newlyListed: sweep.newlyListed.map((entry) => ({
      ...entry,
      status: "definitivo",
    })),
  };
}

function findingsAfterSweep(
  item: PaymentRunItem,
  sweep?: SweepResult | null,
): Finding[] {
  if (sweep === undefined || sweep === null) {
    return item.findings;
  }

  const published = sweep.newlyListed.find(
    (entry) =>
      entry.supplier.rfc === item.instruction.supplierRfc &&
      entry.status === "definitivo",
  );

  if (published === undefined) {
    return item.findings;
  }

  return item.findings.map((finding) =>
    finding.detector === "sat_69b"
      ? {
          ...finding,
          evidence: {
            ...finding.evidence,
            status: published.status,
            listedNow: true,
            listVersion: sweep.listVersion,
          },
        }
      : finding,
  );
}

/** State of a run line, including the browser-only replay of a synthetic sweep. */
export function satLineState(
  item: PaymentRunItem,
  sweep?: SweepResult | null,
): TransactionState {
  /* An executed line stays executed. A later list cannot un-send it, and the
     API state already includes the execution input this screen does not load. */
  if (item.state === "enviado") {
    return item.state;
  }
  if ((sweep === undefined || sweep === null) && item.state !== undefined) {
    return item.state;
  }

  const findings = findingsAfterSweep(item, sweep);
  return transactionStateOf({ ...item.decision, findings });
}

/** The rows relevant to the simulated publication before and after it runs. */
export function satRunLines(
  items: PaymentRunItem[],
  sweep?: SweepResult | null,
): PaymentRunItem[] {
  const rfcs =
    sweep === undefined || sweep === null
      ? new Set(
          items
            .filter((item) =>
              item.findings.some((finding) => finding.detector === "sat_69b"),
            )
            .map((item) => item.instruction.supplierRfc),
        )
      : new Set(sweep.newlyListed.map((entry) => entry.supplier.rfc));

  return items.filter((item) => rfcs.has(item.instruction.supplierRfc));
}
