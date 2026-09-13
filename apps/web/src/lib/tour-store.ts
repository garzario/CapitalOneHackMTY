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
 * It also remembers that somebody has seen it, which is the whole of the
 * first-visit rule: the tour opens itself once, on the first load of this
 * browser, and never again on its own. That lives in `localStorage` and every
 * read and write of it is wrapped, because a private window is allowed to forget
 * and forgetting must never be the reason a screen fails to render. A browser
 * that refuses storage gets the tour on every load, which is the failure worth
 * having: the invitation is repeated instead of the product being unexplained.
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

/**
 * The first visit, and only the first: the tour opens itself.
 *
 * The product opens on ninety-two rows of pesos, and a judge who walks up to an
 * unattended stand has no way to know which of them is the product. An
 * invitation that has to be found is an invitation that is not taken, so this is
 * the one thing in the app that happens without being asked for, once, with
 * `Saltar` and `Ver despues` on the card that appears.
 *
 * It answers whether it opened, so the caller can say nothing rather than guess.
 */
export function openTourOnFirstVisit(): boolean {
  if (tourSeen()) {
    return false;
  }

  openTour();

  return true;
}

/**
 * The control that opens the tour, by id, so closing can hand focus back to it.
 *
 * The launcher is in the top bar and the overlay is mounted beside the shell, so
 * neither holds a ref to the other. An id is the smallest thing that crosses
 * that gap, and a keyboard user who presses `Escape` lands back on the button
 * they pressed rather than at the top of the document.
 */
export const TOUR_LAUNCHER_ID = "tour-launcher";

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
