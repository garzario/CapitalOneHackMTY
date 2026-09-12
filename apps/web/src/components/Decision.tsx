/**
 * The three decisions, as one control.
 *
 * ADR-0002 is explicit that the software never decides: it holds, asks for a
 * verification or lets the payment go, and a person confirms. So this is a
 * group of three buttons with the current decision pressed, not a traffic light
 * the clerk watches.
 */

import type { Action } from "@hackmty/core";
import { ACTION_BUTTON, ACTION_HELP, ACTION_LABEL } from "../lib/labels";

const ORDER: Action[] = ["hold", "verify", "release"];

type ActionBarProps = {
  /** The decision the engine proposes, or the one a person already confirmed. */
  current: Action;
  /** The action being written right now, so the row can show it is in flight. */
  pending?: Action | null;
  onDecide: (action: Action) => void;
  disabled?: boolean;
  /** Appended to each button's accessible name, for a row in a long table. */
  context?: string;
  compact?: boolean;
};

export function ActionBar({
  current,
  pending = null,
  onDecide,
  disabled = false,
  context,
  compact = false,
}: ActionBarProps) {
  return (
    /* A fieldset, so a screen reader announces the group before the three
       buttons. Compact lives in a table cell, where wrapping would make the row
       three lines tall and break the ledger rhythm. */
    <fieldset
      className={`m-0 min-w-0 border-0 p-0 ${compact ? "flex flex-nowrap gap-1" : "flex flex-wrap gap-2"}`}
    >
      <legend className="sr-only">
        {context ? `Decision de ${context}` : "Decision"}
      </legend>
      {ORDER.map((action) => {
        const isCurrent = current === action;
        const isPending = pending === action;

        return (
          <button
            key={action}
            type="button"
            aria-pressed={isCurrent}
            aria-busy={isPending}
            aria-label={
              context ? `${ACTION_LABEL[action]}: ${context}` : undefined
            }
            title={ACTION_HELP[action]}
            disabled={disabled || pending !== null}
            onClick={() => onDecide(action)}
            className={`${ACTION_BUTTON[action]} ${compact ? "btn-sm" : "btn-lg"}`}
          >
            {ACTION_LABEL[action]}
          </button>
        );
      })}
    </fieldset>
  );
}
