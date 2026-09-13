/**
 * The payment run's filter: what is not leaving, what is, and everything.
 *
 * The reasoning for defaulting to the exceptions, and the logic that decides
 * which rows belong to which bucket, live in `lib/run-view.ts` next to the rest
 * of the run's view logic, where they are unit-tested. This file is the control
 * and nothing else -- which is also what keeps Fast Refresh working, since a
 * module that exports both a component and plain functions cannot be swapped.
 *
 * It is built on real radio inputs rather than buttons with ARIA. A radio group
 * is what this is -- pick exactly one -- and the browser then gives us arrow-key
 * navigation, roving focus and the correct announcement for free. Every version
 * of that reimplemented by hand is a version that gets it slightly wrong.
 */

import { motion, useReducedMotion } from "motion/react";
import { formatCount } from "../lib/format";
import type { RunCounts, RunFilter } from "../lib/run-view";

const OPTIONS: Array<{
  value: RunFilter;
  label: string;
  key: keyof RunCounts;
}> = [
  { value: "stopped", label: "No salen", key: "stopped" },
  { value: "released", label: "Liberadas", key: "released" },
  { value: "all", label: "Todas", key: "all" },
];

export function RunFilterControl({
  value,
  counts,
  onChange,
}: {
  value: RunFilter;
  counts: RunCounts;
  onChange: (next: RunFilter) => void;
}) {
  const reduceMotion = useReducedMotion();

  return (
    <div
      className="segmented"
      role="radiogroup"
      aria-label="Filtrar la corrida"
    >
      {OPTIONS.map((option) => (
        <label className="segment" key={option.value}>
          <input
            type="radio"
            name="run-filter"
            value={option.value}
            checked={value === option.value}
            onChange={() => onChange(option.value)}
          />
          {/* The pill the selected option sits on, rendered only under the
              option that owns it. Sharing one layoutId across the three makes
              a filter change a move rather than a disappearance and a birth,
              so the thumb travels to the word you picked and the eye follows
              it instead of looking for it. */}
          {value === option.value ? (
            <motion.span
              aria-hidden="true"
              layoutId="run-filter-thumb"
              className="segment-thumb"
              transition={{
                duration: reduceMotion ? 0 : 0.16,
                ease: [0.2, 0.8, 0.2, 1],
              }}
            />
          ) : null}
          <span className="segment-face">
            {option.label}
            <span className="segment-count">
              {formatCount(counts[option.key])}
            </span>
          </span>
        </label>
      ))}
    </div>
  );
}
