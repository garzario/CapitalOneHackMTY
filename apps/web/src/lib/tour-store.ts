/**
 * Whether the recorrido is open, as a store three unrelated places can write.
 *
 * The overlay is mounted beside the shell and not inside a route, for the same
 * reason the assistant dock is: it drives the app underneath with `navigate`, so
 * opening it must not replace the screen it is about to explain. That leaves the
 * control that opens it and the thing that opens apart from each other -- the
 * button lives in the top bar, the banner lives on the entry screen, and the
 * query `?tour=1` is read in `App.tsx` -- and a prop cannot travel between them
 * without threading state through the shell.
 *
 * So this file is the signal and nothing else. It renders nothing, it holds one
 * boolean, and the step the tour is on stays inside `Tour.tsx`, where it belongs:
 * a step number in a global store would be a second place that knows how many
 * steps there are.
 *
 * It also remembers that somebody has seen it, which is what keeps the entry
 * screen's banner from greeting a judge who already took the tour. That lives in
 * `localStorage` and every read of it is defensive: a private window is allowed
 * to forget, and forgetting must never be the reason a screen fails to render.
 */

import { useSyncExternalStore } from "react";

/** Where the first visit is remembered. Namespaced, the origin is shared. */
export const TOUR_SEEN_KEY = "sentryone:tour-seen";

let open = false;

const listeners = new Set<() => void>();

function publish() {
  for (const listener of listeners) {
    listener();
  }
}

/** True once the tour has been opened on this browser. */
export function tourSeen(): boolean {
  try {
    return window.localStorage.getItem(TOUR_SEEN_KEY) === "1";
  } catch {
    /* Storage is a convenience here: an unreadable one means "not seen". */
    return false;
  }
}

export function markTourSeen() {
  try {
    window.localStorage.setItem(TOUR_SEEN_KEY, "1");
  } catch {
    /* A browser that refuses storage still gets the tour, every time. */
  }
}

/** Opens the recorrido, and remembers that this browser has seen it. */
export function openTour() {
  markTourSeen();

  if (open) {
    return;
  }

  open = true;
  publish();
}

export function closeTour() {
  if (!open) {
    return;
  }

  open = false;
  publish();
}

export function isTourOpen(): boolean {
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

export function useTourOpen(): boolean {
  return useSyncExternalStore(subscribe, isTourOpen, closedOnServer);
}
