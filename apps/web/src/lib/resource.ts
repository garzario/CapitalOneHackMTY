/**
 * One loading state machine for every screen.
 *
 * The app has to render on a phone in a corridor with no API behind it, and it
 * has to be obvious on screen which of the two is happening. So a resource
 * resolves to one of three states, and when it falls back to the synthetic run
 * it says so instead of pretending the data came from the server.
 *
 * The data mode is read from the page query string, before the hash:
 *
 *   ?data=auto   API first, synthetic fallback when it fails. The default.
 *   ?data=api    API only. A failure renders the error state, which is how a
 *                judge proves the deployed backend is actually answering.
 *   ?data=mock   Synthetic only. No request leaves the browser.
 */

import { useCallback, useEffect, useState } from "react";
import type { ApiResult } from "./api";

export type DataMode = "auto" | "api" | "mock";
export type DataSource = "api" | "mock";

export type Resource<T> =
  | { status: "loading" }
  | { status: "error"; message: string }
  | {
      status: "ready";
      data: T;
      source: DataSource;
      /** Why the screen is showing synthetic data, when it is. */
      notice: string | null;
    };

export function readDataMode(search: string): DataMode {
  const value = new URLSearchParams(search).get("data");

  return value === "api" || value === "mock" ? value : "auto";
}

/** Evaluated once per page load, so a screen never disagrees with another. */
export function dataMode(): DataMode {
  return typeof window === "undefined"
    ? "auto"
    : readDataMode(window.location.search);
}

/**
 * Whether this page load may open a connection to the API at all.
 *
 * `?data=mock` is documented as "no request leaves the browser", and that has to
 * be true of everything the page opens rather than only of the screens that load
 * through `useResource`. Two things reach the network on their own: the run
 * screen's event stream and the API status card. Both were opening under
 * `?data=mock`, so a run that said "Datos: solo datos sinteticos" said "Flujo de
 * eventos conectado" beside it and the status card reported on a server the page
 * had promised not to ask. On a phone in a corridor with no API those two read
 * as a broken build rather than as the offline mode working.
 *
 * `auto` is deliberately allowed to try and fail: it is API first by definition,
 * and a stream that failed is what the fallback notice is about.
 */
export function reachesApi(mode: DataMode = dataMode()): boolean {
  return mode !== "mock";
}

export type UseResourceOptions<T> = {
  /**
   * The synthetic stand-in. Must be stable across renders: pass a module level
   * function, not an inline closure, or the effect reruns on every render.
   */
  fallback?: () => T | null;
  /** Set false to hold the request, for a form that loads nothing on mount. */
  enabled?: boolean;
};

export type UseResource<T> = {
  resource: Resource<T>;
  /** Re-run the loader, for the retry button on the error state. */
  reload: () => void;
  /** Replace the data in place, after a write that returned the new object. */
  replace: (data: T) => void;
};

/**
 * `load` must be stable too: wrap it in useCallback in the screen, with the
 * identifiers it closes over in the dependency list.
 */
export function useResource<T>(
  load: (signal: AbortSignal) => Promise<ApiResult<T>>,
  options: UseResourceOptions<T> = {},
): UseResource<T> {
  const { fallback, enabled = true } = options;
  const [resource, setResource] = useState<Resource<T>>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);

  const reload = useCallback(() => {
    setAttempt((value) => value + 1);
  }, []);

  const replace = useCallback((data: T) => {
    setResource((current) =>
      current.status === "ready"
        ? { ...current, data }
        : { status: "ready", data, source: "api", notice: null },
    );
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: `attempt` is the retrigger for reload(); it is deliberately unused in the body
  useEffect(() => {
    if (!enabled) {
      return;
    }

    const mode = dataMode();
    const controller = new AbortController();
    let cancelled = false;

    const showFallback = (notice: string | null) => {
      const data = fallback?.() ?? null;

      if (data === null) {
        setResource({
          status: "error",
          message: notice ?? "No hay datos para mostrar.",
        });

        return;
      }

      setResource({ status: "ready", data, source: "mock", notice });
    };

    setResource({ status: "loading" });

    if (mode === "mock") {
      showFallback("Modo sin conexion: la corrida es sintetica.");

      return () => {
        cancelled = true;
        controller.abort();
      };
    }

    void load(controller.signal).then((result) => {
      if (cancelled) {
        return;
      }

      if (result.ok) {
        setResource({
          status: "ready",
          data: result.data,
          source: "api",
          notice: null,
        });

        return;
      }

      if (mode === "api") {
        setResource({ status: "error", message: result.error.message });

        return;
      }

      showFallback(
        `Sin API (${result.error.message}). Se muestra la corrida sintetica.`,
      );
    });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [load, fallback, enabled, attempt]);

  return { resource, reload, replace };
}
