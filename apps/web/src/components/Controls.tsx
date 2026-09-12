/**
 * The six controls, all six, every time.
 *
 * This panel replaced a column that listed the run's findings a second time,
 * sorted the same way the table beside it was already sorted. Repeating the
 * table is not a second opinion; it is the same opinion in a different shape,
 * and it cost the screen a third of its width.
 *
 * What was missing instead was the thing the product actually claims: that six
 * named controls run over every instruction, and that a control which found
 * nothing says so rather than going quiet. A panel that only lists hits cannot
 * be told apart from a panel whose checks never ran. This one always renders
 * six rows in the order of `DETECTOR_ORDER`, so "Sin hallazgos" is a result and
 * not an absence.
 *
 * It is derived from the findings on the run, never from a hardcoded list, so a
 * seventh detector in `packages/core` shows up here the day it lands.
 */

import type { Detector } from "@hackmty/core";
import type { PaymentRunItem } from "../lib/contract";
import { formatPlural } from "../lib/format";
import { DETECTOR_LABEL, DETECTOR_ORDER } from "../lib/labels";
import { Amount } from "./Primitives";

type ControlSummary = {
  detector: Detector;
  /** Instructions this control raised at least one finding on. */
  instructions: number;
  amountAtRisk: number;
};

export function summariseControls(
  items: readonly PaymentRunItem[],
): ControlSummary[] {
  return DETECTOR_ORDER.map((detector) => {
    let instructions = 0;
    let amountAtRisk = 0;

    for (const item of items) {
      const hits = item.findings.filter(
        (finding) => finding.detector === detector,
      );

      if (hits.length === 0) continue;

      /* Counted once per instruction, not once per finding: two findings from
         the same control on the same payment is one payment to look at. */
      instructions += 1;
      for (const hit of hits) amountAtRisk += hit.amountAtRisk;
    }

    return { detector, instructions, amountAtRisk };
  });
}

export function ControlsPanel({ items }: { items: readonly PaymentRunItem[] }) {
  const controls = summariseControls(items);

  return (
    <section className="panel" aria-labelledby="controls-heading">
      <div className="card-head">
        <h2 id="controls-heading" className="eyebrow">
          Controles
        </h2>
        <span className="card-note">
          {formatPlural(items.length, "instruccion")} revisadas
        </span>
      </div>

      {controls.map(({ detector, instructions, amountAtRisk }) => (
        <div className="control-row" key={detector}>
          <span
            className={
              instructions > 0 ? "control-dot control-dot-hit" : "control-dot"
            }
          />
          <span className="flex min-w-0 flex-col">
            <span className="t-sm font-medium">{DETECTOR_LABEL[detector]}</span>
            <span className="subtle t-xs">
              {instructions === 0 ? (
                "Sin hallazgos"
              ) : (
                <>
                  {formatPlural(instructions, "instruccion")} ·{" "}
                  <Amount value={amountAtRisk} size="sm" />
                </>
              )}
            </span>
          </span>
        </div>
      ))}
    </section>
  );
}
