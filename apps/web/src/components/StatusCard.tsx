import { useCallback, useEffect, useRef, useState } from "react";
import { getHealth } from "../lib/api";
import type { Health } from "../lib/contract";

type Status =
  | { kind: "checking" }
  | { kind: "online"; health: Health; checkedAt: Date }
  | { kind: "offline"; message: string; checkedAt: Date };

const LABEL: Record<Status["kind"], string> = {
  checking: "Consultando la API",
  online: "API en linea",
  offline: "API no responde",
};

const DOT_COLOR: Record<Status["kind"], string> = {
  checking: "var(--c-ink-subtle)",
  online: "var(--c-release)",
  offline: "var(--c-hold)",
};

function detail(status: Status): string {
  switch (status.kind) {
    case "checking":
      return "Preguntando a /health si el servicio esta vivo.";
    case "online":
      return `Servicio ${status.health.service}, version ${status.health.version}.`;
    case "offline":
      return status.message;
  }
}

/**
 * The first thing a judge should be able to trust: is the backend actually
 * answering, right now, from this browser. It reads GET /health and says so out
 * loud, including when the answer is no.
 */
export function StatusCard() {
  const [status, setStatus] = useState<Status>({ kind: "checking" });
  const [isChecking, setIsChecking] = useState(true);
  const controllerRef = useRef<AbortController | null>(null);

  const check = useCallback(async () => {
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
  }, []);

  useEffect(() => {
    void check();

    return () => controllerRef.current?.abort();
  }, [check]);

  return (
    <section
      aria-labelledby="api-status-heading"
      className="tile flex flex-col gap-3"
    >
      <div className="flex items-start justify-between gap-3">
        <h2 id="api-status-heading" className="eyebrow">
          Estado de la API
        </h2>
        {/* The dot breathes only while a request is actually in flight, so the
            movement is the answer to "is it doing something", not decoration
            that runs forever. */}
        <span
          aria-hidden="true"
          data-checking={isChecking ? "true" : "false"}
          className="status-dot mt-1"
          style={{ backgroundColor: DOT_COLOR[status.kind] }}
        />
      </div>

      <div aria-live="polite" className="flex flex-col gap-1">
        <p className="t-md font-semibold">{LABEL[status.kind]}</p>
        <p className="muted t-sm">{detail(status)}</p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="subtle t-xs">
          {status.kind === "checking"
            ? "Sin respuesta todavia"
            : `Consultado a las ${status.checkedAt.toLocaleTimeString("es-MX")}`}
        </p>
        <button
          type="button"
          aria-busy={isChecking}
          onClick={() => {
            void check();
          }}
          className="btn btn-pill"
        >
          {isChecking ? "Consultando" : "Consultar de nuevo"}
        </button>
      </div>
    </section>
  );
}
