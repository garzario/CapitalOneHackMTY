/**
 * Whether the assistant drawer is open, lifted out of the dock that used to hold
 * it in `useState`.
 *
 * One step of the recorrido is the capture arriving on WhatsApp, and that step has
 * to open this drawer while the tour's own card stays on screen. The dock is
 * mounted beside the shell, the tour is mounted beside the dock, and neither is a
 * parent of the other, so the only way for the tour to open the panel without a
 * provider around both is a signal they can both read.
 *
 * It holds a boolean and renders nothing, like `lib/tour-store.ts` next to it.
 * Nothing about the panel's behaviour moved: `AssistantDock` still decides what a
 * closed dock looks like, and `AssistantPanel` still owns the conversation, the
 * focus and the keyboard while it is open.
 */

import { useSyncExternalStore } from "react";

let open = false;

const listeners = new Set<() => void>();

function publish() {
  for (const listener of listeners) {
    listener();
  }
}

export function openAssistant() {
  if (open) {
    return;
  }

  open = true;
  publish();
}

export function closeAssistant() {
  if (!open) {
    return;
  }

  open = false;
  publish();
}

export function isAssistantOpen(): boolean {
  return open;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}

/** Nothing is open where there is no browser to open it in. */
function closedOnServer(): boolean {
  return false;
}

export function useAssistantOpen(): boolean {
  return useSyncExternalStore(subscribe, isAssistantOpen, closedOnServer);
}
