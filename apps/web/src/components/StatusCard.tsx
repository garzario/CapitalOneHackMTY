import { useCallback, useEffect, useRef, useState } from "react";
import { getHealth } from "../lib/api";
import type { Health } from "../lib/contract";
import { reachesApi } from "../lib/resource";

type Status =
  | { kind: "checking" }
  | { kind: "skipped" }
  | { kind: "online"; health: Health; checkedAt: Date }
  | { kind: "offline"; message: string; checkedAt: Date };

const LABEL: Record<Status["kind"], string> = {
  checking: "Consultando la API",
  skipped: "No se consulto la API",
  online: "API en linea",
  offline: "API no responde",
};

const DOT_COLOR: Record<Status["kind"], string> = {
  checking: "var(--c-ink-subtle)",
  skipped: "var(--c-ink-subtle)",
  online: "var(--c-release)",
  offline: "var(--c-hold)",
};

function detail(status: Status): string {
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
function stamp(status: Status): string {
  if (status.kind === "checking") {
    return "Sin respuesta todavia";
  }

  if (status.kind === "skipped") {
    return "Sin consultar";
  }

  return `Consultado a las ${status.checkedAt.toLocaleTimeString("es-MX")}`;
}

/**
 * The first thing a judge should be able to trust: is the backend actually
 * answering, right now, from this browser. It reads GET /health and says so out
 * loud, including when the answer is no.
 *
 * Under `?data=mock` it asks nothing and says that instead. Two reasons, and the
 * second is the one that matters. The mode promises that no request leaves the
 * browser, and this card was the one place on the run screen still making one.
 * And an unanswered /health rendered as "API no responde" in the hold colour,
 * which is a red card reporting a failure of a server nobody asked: the offline
 * mode is a feature of this build, and that made it look like a broken one.
 */
export function StatusCard() {
  const allowed = reachesApi();
  const [status, setStatus] = useState<Status>(
    allowed ? { kind: "checking" } : { kind: "skipped" },
  );
  const [isChecking, setIsChecking] = useState(allowed);
  const controllerRef = useRef<AbortController | null>(null);

  const check = useCallback(async () => {
    if (!allowed) {
      return;
    }

    controllerRef.current?.abort();

    const controller = new AbortController();
    controllerRef.current = controller;
    setIsChecking(true);

    const result = await getHealth({ signal: controller.signal });

    if (controller.signal.aborted) {
      return;
    }

    setStatus(
      result.ok
        ? { kind: "online", health: result.data, checkedAt: new Date() }
        : {
            kind: "offline",
            message: result.error.message,
            checkedAt: new Date(),
          },
    );
    setIsChecking(false);
  }, [allowed]);

  useEffect(() => {
    void check();

    return () => controllerRef.current?.abort();
  }, [check]);

  return (
    <section
      aria-labelledby="api-status-heading"
      className="panel flex flex-col gap-3 p-5"
    >
      <div className="flex items-start justify-between gap-3">
        <h2 id="api-status-heading" className="eyebrow">
          Estado de la API
        </h2>
        <span
          aria-hidden="true"
          className="status-dot mt-1"
          style={{ backgroundColor: DOT_COLOR[status.kind] }}
        />
      </div>

      <div aria-live="polite" className="flex flex-col gap-1">
        <p className="t-md font-semibold">{LABEL[status.kind]}</p>
        <p className="muted t-sm">{detail(status)}</p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="subtle t-xs">{stamp(status)}</p>
        {/* No button in the offline mode: the only thing it could do is break
            the promise the mode made. */}
        {status.kind === "skipped" ? null : (
          <button
            type="button"
            aria-busy={isChecking}
            onClick={() => {
              void check();
            }}
            className="btn"
          >
            {isChecking ? "Consultando" : "Consultar de nuevo"}
          </button>
        )}
      </div>
    </section>
  );
}
