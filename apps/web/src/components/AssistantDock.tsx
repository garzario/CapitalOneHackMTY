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
 *
 * Whether it is open is a store (`lib/assistant-dock.ts`) and not this component's
 * `useState`, for one reason: one stop of the recorrido is the capture arriving on
 * WhatsApp, and that stop has to open this drawer while its own card stays on
 * screen. The tour and the dock are siblings mounted beside the shell, so neither
 * can pass the other a prop. Nothing else changed: the button still belongs to this
 * file and the conversation still belongs to the panel.
 */

import {
  closeAssistant,
  openAssistant,
  useAssistantOpen,
} from "../lib/assistant-dock";
import { AssistantPanel } from "./AssistantPanel";

export function AssistantDock() {
  const open = useAssistantOpen();

  return (
    <>
      {open ? null : (
        <button
          type="button"
          className="btn btn-accent btn-lg"
          aria-haspopup="dialog"
          onClick={openAssistant}
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

      {open ? <AssistantPanel onClose={closeAssistant} /> : null}
    </>
  );
}
