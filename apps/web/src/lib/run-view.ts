/**
 * How the payment run is read, as pure functions over the contract types.
 *
 * This is view logic, not domain logic, so it lives here and not in
 * `packages/core`: nothing below decides anything about money, it decides what
 * a person sees first. The reason it is a module with tests rather than a few
 * expressions inside the component is that both answers are load-bearing for
 * the ten-second read, and a sort that quietly changes between renders is the
 * kind of bug you only find in front of a judge.
 *
 * One rule runs through all of it: read the items, never the totals. The
 * totals come from the API and go stale the moment a decision is applied
 * locally, which is exactly what happens on the offline demo path.
 */

import type { Action, Finding } from "@hackmty/core";
import type { PaymentRun, PaymentRunItem } from "./contract";

/**
 * Reading order for the table. What is stopped comes before what is leaving,
 * because the clerk's job this Thursday is the exceptions and the releases are
 * already handled.
 */
const ACTION_RANK: Record<Action, number> = {
  hold: 0,
  verify: 1,
  release: 2,
};

/** Actions where the money has not left yet. */
const NOT_LEAVING: readonly Action[] = ["hold", "verify"];

/**
 * Which slice of the run the table is showing.
 *
 * The run is ninety-two instructions and eighty-five of them are releases.
 * Ordered exceptions-first the table was correct and still unusable: the work
 * was the top seven rows and the rest said "this one is fine", eighty-five
 * times, over twelve screens. Eighty-five rows that all say the same thing are
 * not a list, they are a number, and that number is already on the card above
 * the table.
 */
export type RunFilter = "stopped" | "released" | "all";

export function matchesFilter(
  item: PaymentRunItem,
  filter: RunFilter,
): boolean {
  switch (filter) {
    case "stopped":
      return NOT_LEAVING.includes(item.decision.action);
    case "released":
      return !NOT_LEAVING.includes(item.decision.action);
    case "all":
      return true;
  }
}

export interface RunCounts {
  stopped: number;
  released: number;
  all: number;
}

/** The size of each bucket, so the filter can say what it is hiding. */
export function countsFor(items: readonly PaymentRunItem[]): RunCounts {
  let stopped = 0;

  for (const item of items) {
    if (NOT_LEAVING.includes(item.decision.action)) stopped += 1;
  }

  return { stopped, released: items.length - stopped, all: items.length };
}

/**
 * Exceptions first, and inside a state the largest amount first. Returns a new
 * array: the run object belongs to the resource cache and sorting it in place
 * would reorder somebody else's copy.
 */
export function orderItems(items: readonly PaymentRunItem[]): PaymentRunItem[] {
  return [...items].sort((left, right) => {
    const byAction =
      ACTION_RANK[left.decision.action] - ACTION_RANK[right.decision.action];

    if (byAction !== 0) {
      return byAction;
    }

    return right.instruction.amount - left.instruction.amount;
  });
}

/** The single finding that costs the most to get wrong, with its row. */
export interface WorstRisk {
  finding: Finding;
  instructionId: string;
}

/** What the top of the screen says before anyone reads the table. */
export interface RunVerdict {
  /** Instructions whose money has not left: held plus awaiting verification. */
  stoppedCount: number;
  stoppedAmount: number;
  heldCount: number;
  toVerifyCount: number;
  releasedCount: number;
  releasedAmount: number;
  totalCount: number;
  totalAmount: number;
  worst: WorstRisk | null;
}

/**
 * The verdict, computed from the items so it stays true after a decision is
 * applied without the API.
 */
export function runVerdict(run: PaymentRun): RunVerdict {
  const verdict: RunVerdict = {
    stoppedCount: 0,
    stoppedAmount: 0,
    heldCount: 0,
    toVerifyCount: 0,
    releasedCount: 0,
    releasedAmount: 0,
    totalCount: run.items.length,
    totalAmount: 0,
    worst: null,
  };

  for (const item of run.items) {
    const { action } = item.decision;
    const { amount } = item.instruction;

    verdict.totalAmount += amount;

    if (NOT_LEAVING.includes(action)) {
      verdict.stoppedCount += 1;
      verdict.stoppedAmount += amount;
    }

    if (action === "hold") verdict.heldCount += 1;
    if (action === "verify") verdict.toVerifyCount += 1;

    if (action === "release") {
      verdict.releasedCount += 1;
      verdict.releasedAmount += amount;
    }

    for (const finding of item.findings) {
      /* Strictly greater, so the first of two equal findings wins and the
         sentence at the top of the screen does not change between renders. */
      if (
        verdict.worst === null ||
        finding.amountAtRisk > verdict.worst.finding.amountAtRisk
      ) {
        verdict.worst = { finding, instructionId: item.instruction.id };
      }
    }
  }

  return verdict;
}
