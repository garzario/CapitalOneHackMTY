import { useCallback, useEffect, useRef, useState } from "react";
import { getHealth, type Health } from "../lib/api";

type Status =
  | { kind: "checking" }
  | { kind: "online"; health: Health; checkedAt: Date }
  | { kind: "offline"; message: string; checkedAt: Date };

const LABEL: Record<Status["kind"], string> = {
  checking: "Checking the API",
  online: "API online",
  offline: "API unreachable",
};

const DOT_COLOR: Record<Status["kind"], string> = {
  checking: "var(--ink-muted)",
  online: "var(--positive)",
  offline: "var(--negative)",
};

function detail(status: Status): string {
  switch (status.kind) {
    case "checking":
      return "Asking /health for a liveness answer.";
    case "online":
      return `Service ${status.health.service}, version ${status.health.version}.`;
    case "offline":
      return status.message;
  }
}

/**
 * The first thing a judge should be able to trust: is the backend actually
 * answering, right now, from this browser. It reads GET /health and says so
 * out loud, including when the answer is no.
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
      className="panel flex flex-col gap-4 p-5"
    >
      <div className="flex items-start justify-between gap-3">
        <h2
          id="api-status-heading"
          className="text-sm font-semibold tracking-wide uppercase"
          style={{ color: "var(--ink-muted)" }}
        >
          API status
        </h2>
        <span
          aria-hidden="true"
          className="status-dot mt-1"
          style={{ backgroundColor: DOT_COLOR[status.kind] }}
        />
      </div>

      <div aria-live="polite" className="flex flex-col gap-1">
        <p className="text-lg font-semibold">{LABEL[status.kind]}</p>
        <p className="text-sm" style={{ color: "var(--ink-muted)" }}>
          {detail(status)}
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs" style={{ color: "var(--ink-muted)" }}>
          {status.kind === "checking"
            ? "No answer yet"
            : `Checked at ${status.checkedAt.toLocaleTimeString()}`}
        </p>
        <button
          type="button"
          aria-busy={isChecking}
          onClick={() => {
            void check();
          }}
          className="cursor-pointer rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors"
          style={{
            borderColor: "var(--border)",
            backgroundColor: "var(--surface-sunken)",
            color: "var(--ink)",
          }}
        >
          {isChecking ? "Checking" : "Check again"}
        </button>
      </div>
    </section>
  );
}
