/**
 * The one control that opens the assistant, and the reason it is a dock rather
 * than a seventh item in the navigation.
 *
 * The panel is not a screen. It is a thing a clerk opens on top of the line she is
 * already looking at, and it reads that line: asking "por que esta en rojo" while
 * the instruction is open should need no folio typed in, which only works if the
 * route underneath does not change when the panel opens. A nav item would replace
 * the screen and the question would lose its subject.
 *
 * It sits above the page and below the scrim, so the open drawer covers it, and it
 * clears the home indicator on a telephone, where a control flush with the bottom
 * edge is a control that swipes the app away instead of pressing.
 */

import { useState } from "react";
import { AssistantPanel } from "./AssistantPanel";

export function AssistantDock() {
  const [open, setOpen] = useState(false);

  return (
    <>
      {open ? null : (
        <button
          type="button"
          className="btn btn-accent btn-lg"
          aria-haspopup="dialog"
          onClick={() => setOpen(true)}
          style={{
            position: "fixed",
            right: "var(--space-4)",
            bottom: "calc(var(--space-4) + env(safe-area-inset-bottom, 0px))",
            zIndex: "var(--z-header)",
            boxShadow: "var(--shadow-2)",
          }}
        >
          Preguntar al asistente
        </button>
      )}

      {open ? <AssistantPanel onClose={() => setOpen(false)} /> : null}
    </>
  );
}
