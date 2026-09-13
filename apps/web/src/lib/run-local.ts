/**
 * A decision applied to the run in this browser and nowhere else.
 *
 * It exists for one stop of the recorrido and it is the fix to the thing that
 * stop was pretending to do. The last stop rings the visitor as the owner of the
 * company and spotlights the one figure of the payment run, "No sale todavia",
 * because a released line walks out of the slice the table is showing while the
 * figure is always there to move. Then the card said "el dueno la libero bajo su
 * nombre" next to a figure that read the same string before and after the press:
 * nothing on the page asked the run anything again, so nothing behind the veil
 * could move, with an API or without one.
 *
 * Three rules, and each one is the reason this is forty lines instead of a
 * second copy of the run.
 *
 * **It is the decision and nothing else.** The findings, the evidence and the
 * expected loss are what the six controls found, and a person who overrides the
 * call does not unfind them. `withLocalDecisions` replaces `action` and
 * `decidedBy` on the line it names, recomputes the totals with the same
 * `totalsFor` the offline run is built with, and returns the run it was given,
 * unchanged and identical, when no line moved.
 *
 * **It never pretends to be the ledger.** Nothing here writes, nothing here
 * persists, and a reload is the seeded run again. The card that applies it says
 * so in the sentence under the result, because a simulated answer that looks
 * like a recorded one is the one thing that stop must not do. With an API the
 * call is a real decision on a real ledger and this is only what keeps the
 * figure honest between the press and the next read of the stream.
 *
 * **The run stays the single source of truth.** This is an overlay the run
 * screen folds in while it renders, not a second store of lines to keep in sync:
 * the next read of `GET /api/v1/run/current` carries the API's own answer and
 * this sets the same action over it.
 */

import type { Action } from "@hackmty/core";
import { useSyncExternalStore } from "react";
import type { PaymentRun } from "./contract";
import { totalsFor } from "./mock";

export type LocalDecision = {
  instructionId: string;
  action: Action;
  /** Whose name the line carries afterwards. Never authentication. */
  decidedBy: string;
};

let applied: readonly LocalDecision[] = [];

const listeners = new Set<() => void>();

/** One per instruction: a second answer on one line replaces the first. */
export function applyLocalDecision(decision: LocalDecision) {
  applied = [
    ...applied.filter((one) => one.instructionId !== decision.instructionId),
    decision,
  ];

  for (const listener of listeners) {
    listener();
  }
}

export function clearLocalDecisions() {
  if (applied.length === 0) {
    return;
  }

  applied = [];

  for (const listener of listeners) {
    listener();
  }
}

export function localDecisions(): readonly LocalDecision[] {
  return applied;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}

const NONE: readonly LocalDecision[] = [];

/** Nothing is applied where there is no browser to apply it in. */
function noneOnServer(): readonly LocalDecision[] {
  return NONE;
}

export function useLocalDecisions(): readonly LocalDecision[] {
  return useSyncExternalStore(subscribe, localDecisions, noneOnServer);
}

/**
 * The run as the screen renders it, with those decisions folded in.
 *
 * Pure, and it answers the same object when nothing applies, which is what keeps
 * the memo around it cheap and keeps `diffRuns` from reporting a change on a
 * render that changed nothing.
 *
 * The level and the state the API attached to a line are dropped on a line that
 * moved, because both were derived before this decision: `lineLevels` in
 * `run-view.ts` then falls back to `confidenceOf` and `transactionStateOf` from
 * `packages/core`, which is the same pair the API itself calls. Two readings of
 * one line disagreeing on screen is exactly what ADR-0009 exists to prevent.
 */
export function withLocalDecisions(
  run: PaymentRun,
  decisions: readonly LocalDecision[],
): PaymentRun {
  if (decisions.length === 0) {
    return run;
  }

  const byInstruction = new Map(
    decisions.map((decision) => [decision.instructionId, decision]),
  );

  let moved = false;

  const items = run.items.map((item) => {
    const local = byInstruction.get(item.instruction.id);

    if (local === undefined || local.action === item.decision.action) {
      return item;
    }

    moved = true;

    return {
      ...item,
      decision: {
        ...item.decision,
        action: local.action,
        decidedBy: local.decidedBy,
      },
      confidence: undefined,
      state: undefined,
    };
  });

  return moved ? { ...run, items, totals: totalsFor(items) } : run;
}
