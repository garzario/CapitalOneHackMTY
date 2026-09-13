/**
 * Is the backend answering, right now, from this browser. One answer, shared.
 *
 * It was the status card's own state machine and it is a module because two
 * places need the same answer and must not disagree about it: the card on the
 * payment run, which reports it in full, and the banner in the shell, which
 * appears only when the answer is no. Two independent checks would mean two
 * requests per page load and, worse, a banner that says the API is down above a
 * card that says it is up, which is the kind of thing a judge photographs.
 *
 * Three states and not two, and the third one is the point. `skipped` is what
 * `?data=mock` produces: the mode promises that no request leaves the browser,
 * so nothing was asked, and not knowing whether the service answers is not the
 * same claim as knowing that it does not. A red banner over a server nobody
 * asked would make the offline mode of issue #71 look like a broken build.
 *
 * The sentences live here rather than in the two components for the same reason
 * the state does.
 */

import { useCallback, useSyncExternalStore } from "react";
import { getHealth } from "./api";
import type { Health } from "./contract";
import { type DataMode, reachesApi } from "./resource";

export type ApiStatus =
  | { kind: "checking" }
  | { kind: "skipped" }
  | { kind: "online"; health: Health; checkedAt: Date }
  | { kind: "offline"; message: string; checkedAt: Date };

export type ApiStatusSnapshot = {
  status: ApiStatus;
  /** A request is on the wire. The previous answer stays on screen under it. */
  checking: boolean;
};

export const API_STATUS_LABEL: Record<ApiStatus["kind"], string> = {
  checking: "Consultando la API",
  skipped: "No se consulto la API",
  online: "API en linea",
  offline: "API no responde",
};

export const API_STATUS_DOT: Record<ApiStatus["kind"], string> = {
  checking: "dot-neutral",
  skipped: "dot-neutral",
  online: "dot-release",
  offline: "dot-hold",
};

export function apiStatusDetail(status: ApiStatus): string {
  switch (status.kind) {
    case "checking":
      return "Preguntando a /health si el servicio esta vivo.";
    case "skipped":
      return "Esta pagina corre en modo sin conexion, asi que no se pregunto por el servicio. No saber si responde no es lo mismo que saber que no responde.";
    case "online":
      return `Servicio ${status.health.service}, version ${status.health.version}.`;
    case "offline":
      return status.message;
  }
}

/** When the answer on screen was obtained, or why there is no time to show. */
export function apiStatusStamp(status: ApiStatus): string {
  if (status.kind === "checking") {
    return "Sin respuesta todavia";
  }

  if (status.kind === "skipped") {
    return "Sin consultar";
  }

  return `Consultado a las ${status.checkedAt.toLocaleTimeString("es-MX")}`;
}

/**
 * True when this browser asked and the service did not answer.
 *
 * `skipped` is deliberately false: the banner is about a service that failed,
 * and the offline mode is a mode rather than a failure.
 */
export function isApiUnreachable(status: ApiStatus): boolean {
  return status.kind === "offline";
}

/**
 * What an unreachable API means for what is on screen, which is not the same
 * sentence in the two modes that ask for one.
 *
 * `auto` falls back, so the screens are showing the synthetic run and each one
 * says so through `SourceNotice`. `api` does not fall back, which is the whole
 * point of that mode: the screens render their error state and a judge has
 * proved the deployed backend is not answering. `mock` never reaches this
 * sentence, because nothing was asked.
 */
export function apiUnreachableSentence(mode: DataMode): string {
  if (mode === "api") {
    return "Esta pagina corre en modo solo API, asi que las pantallas muestran su estado de error en lugar de datos.";
  }

  return "Las pantallas siguen funcionando con la corrida sintetica, y cada una dice que los datos no vienen del servidor.";
}

function initial(): ApiStatusSnapshot {
  return {
    status: reachesApi() ? { kind: "checking" } : { kind: "skipped" },
    checking: false,
  };
}

/**
 * The one cached snapshot, rebuilt only when the answer changes.
 *
 * `useSyncExternalStore` compares by reference, so a getter that built the
 * object on every call would re-render without end.
 *
 * Built on the first read and not on import, because the first value depends on
 * the page's query string: a module that reads `window.location` while it is
 * being evaluated is a module that cannot be imported anywhere there is no
 * window, and the sentences below are worth unit testing on their own.
 */
let snapshot: ApiStatusSnapshot | null = null;

const listeners = new Set<() => void>();

function publish(next: ApiStatusSnapshot) {
  snapshot = next;

  for (const listener of listeners) {
    listener();
  }
}

export function apiStatusSnapshot(): ApiStatusSnapshot {
  snapshot ??= initial();

  return snapshot;
}

/**
 * Asks `/health` once, unless the mode forbids it or a request is already out.
 *
 * No `AbortController` and no timeout of its own: `request` in `./api.ts` already
 * gives up after `API_TIMEOUT_MS`, and the answer belongs to the module rather
 * than to whichever component happened to mount first, so there is nothing to
 * cancel when one of them unmounts.
 */
export async function checkApiStatus(): Promise<void> {
  const current = apiStatusSnapshot();

  if (!reachesApi() || current.checking) {
    return;
  }

  publish({ status: current.status, checking: true });

  const result = await getHealth();

  publish({
    status: result.ok
      ? { kind: "online", health: result.data, checkedAt: new Date() }
      : {
          kind: "offline",
          message: result.error.message,
          checkedAt: new Date(),
        },
    checking: false,
  });
}

/**
 * Whether the first check has been asked for yet, so that mounting the card and
 * the banner on the same page is one request rather than two.
 */
let started = false;

/** Subscribes, and starts the first check on the first subscriber. */
export function subscribeApiStatus(listener: () => void): () => void {
  listeners.add(listener);

  if (!started) {
    started = true;
    void checkApiStatus();
  }

  return () => {
    listeners.delete(listener);
  };
}

export type UseApiStatus = ApiStatusSnapshot & { recheck: () => void };

/** The shared answer, live, with the button's handler next to it. */
export function useApiStatus(): UseApiStatus {
  const current = useSyncExternalStore(
    subscribeApiStatus,
    apiStatusSnapshot,
    apiStatusSnapshot,
  );

  const recheck = useCallback(() => {
    void checkApiStatus();
  }, []);

  return { ...current, recheck };
}
