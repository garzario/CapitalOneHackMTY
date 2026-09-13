/**
 * Which appearance the app is in, and who decided it.
 *
 * The answer is a person, always. This app opens light on every machine, and
 * dark is something somebody asked for in the top bar and this browser
 * remembers. It deliberately does not follow the operating system: the product
 * is demonstrated on borrowed projectors and hotel-desk laptops, and a run
 * screen that opens near-black because a stranger's Mac decided it was night is
 * a first impression nobody chose. `prefers-color-scheme` is the right default
 * for a site somebody lives in and the wrong one for a screen that is walked up
 * to cold.
 *
 * So the switch is one attribute, `data-theme` on the document element, and
 * `design/tokens.css` hangs its whole dark palette off it. This module is that
 * attribute and nothing else: it is data layer and it renders nothing. The
 * button that writes it lives in `components/AppShell.tsx`, beside the rest of
 * the furniture that is on screen at every width.
 *
 * `applyStoredTheme` runs in `main.tsx` before the first render, which is the
 * whole reason it is a plain function and not an effect: an effect paints the
 * light palette first and then swaps it, and the swap is a white flash on a page
 * somebody set to dark on purpose.
 *
 * Every read of storage is defensive, exactly like `lib/actor.ts`: a private
 * window, cleared site data or a half-written value falls back to light rather
 * than throwing, because the appearance must never be the reason a payment run
 * fails to render.
 */

import { useSyncExternalStore } from "react";

export type Theme = "light" | "dark";

/** Where the choice is remembered. Namespaced, because the origin is shared. */
export const THEME_KEY = "sentryone:theme";

/** Light, on every machine, until a person says otherwise. */
export const DEFAULT_THEME: Theme = "light";

/** The word on the button, which is the appearance the press will produce. */
export const THEME_LABEL: Record<Theme, string> = {
  light: "Claro",
  dark: "Oscuro",
};

/** The name the button carries, because the word beside it is hidden on a phone. */
export const THEME_TOGGLE_LABEL = "Cambiar apariencia";

function isTheme(value: unknown): value is Theme {
  return value === "light" || value === "dark";
}

/** The other one. The button offers it, so it is named once rather than inline. */
export function otherTheme(theme: Theme): Theme {
  return theme === "dark" ? "light" : "dark";
}

/**
 * What this browser last chose, off storage.
 *
 * Anything unreadable is light rather than an exception: the appearance is a
 * convenience and never the source of truth.
 */
export function storedTheme(): Theme {
  try {
    const raw = window.localStorage.getItem(THEME_KEY);

    if (isTheme(raw)) {
      return raw;
    }
  } catch {
    /* A private window is allowed to forget which appearance it was in. */
  }

  return DEFAULT_THEME;
}

/**
 * The snapshot `useSyncExternalStore` compares.
 *
 * A string, so comparing by value is comparing by identity and the getter can
 * be handed straight to React without the caching `lib/actor.ts` needs for its
 * object.
 */
let current: Theme | null = null;

const listeners = new Set<() => void>();

function publish() {
  for (const listener of listeners) {
    listener();
  }
}

/**
 * Writes the choice where the stylesheet reads it.
 *
 * Guarded because this module is imported by tests that run with no document,
 * and because a theme that cannot be painted must still be a theme the rest of
 * the app can ask about.
 */
function paint(theme: Theme) {
  try {
    document.documentElement.dataset.theme = theme;
  } catch {
    /* No document. Nothing to paint, and nothing to fail over. */
  }
}

/** The appearance this browser is in. */
export function currentTheme(): Theme {
  current ??= storedTheme();

  return current;
}

/**
 * Reads the stored choice and puts it on the document.
 *
 * Called once, from `main.tsx`, before `createRoot().render`, so the first paint
 * is already in the right palette.
 */
export function applyStoredTheme(): Theme {
  const theme = storedTheme();

  current = theme;
  paint(theme);

  return theme;
}

/** Remembers the choice and paints it. Returns it, so a caller can use it. */
export function setTheme(theme: Theme): Theme {
  current = theme;
  paint(theme);

  try {
    window.localStorage.setItem(THEME_KEY, theme);
  } catch {
    /* A browser that refuses storage still gets the appearance for this tab. */
  }

  publish();

  return theme;
}

/** The press: light becomes dark and dark becomes light. */
export function toggleTheme(): Theme {
  return setTheme(otherTheme(currentTheme()));
}

/**
 * Subscribes to the choice, including the choice made in another tab.
 *
 * The `storage` event fires on every other document of this origin and never on
 * the one that wrote, so this is the half the store cannot see for itself: a
 * judge with the run open on two tabs should not be looking at two appearances.
 */
export function subscribeTheme(listener: () => void): () => void {
  listeners.add(listener);

  const onStorage = (event: StorageEvent) => {
    if (event.key !== null && event.key !== THEME_KEY) {
      return;
    }

    current = null;
    paint(currentTheme());
    publish();
  };

  window.addEventListener("storage", onStorage);

  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

/** Nothing is stored where there is no browser, so light is the answer. */
function themeOnServer(): Theme {
  return DEFAULT_THEME;
}

/** The appearance, live, for a component that has to be drawn in it. */
export function useTheme(): Theme {
  return useSyncExternalStore(subscribeTheme, currentTheme, themeOnServer);
}
