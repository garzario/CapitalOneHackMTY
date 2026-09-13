/**
 * Loading, empty and error, as three components instead of three ad hoc blocks
 * per screen, so no screen can blank out on a judge.
 *
 * That every screen renders them is enforced in `screens/states.test.ts` rather
 * than asserted here. A screen that fetches uses `LoadingBlock`; a screen that
 * submits uses `aria-busy` on its control instead, because a form does not need
 * a skeleton, it needs a button that admits it is working. The exemption list
 * for the empty state lives in that test, and each entry carries its reason.
 */

import type { ReactNode } from "react";
import type { EventsStatus } from "../lib/api";

type LoadingProps = {
  /** What is being loaded, so a screen reader says something useful. */
  label: string;
  /** How many skeleton rows to draw, roughly matching the real content. */
  rows?: number;
};

export function LoadingBlock({ label, rows = 4 }: LoadingProps) {
  return (
    <div
      aria-busy="true"
      aria-live="polite"
      className="flex flex-col gap-3 p-5"
    >
      <span className="sr-only">{label}</span>
      {Array.from({ length: rows }, (_, index) => (
        <div
          // biome-ignore lint/suspicious/noArrayIndexKey: skeleton rows have no identity
          key={index}
          className="skeleton"
          style={{ height: "2.25rem", width: index === 0 ? "40%" : "100%" }}
        />
      ))}
    </div>
  );
}

type EmptyProps = {
  title: string;
  description?: string;
  action?: ReactNode;
};

export function EmptyBlock({ title, description, action }: EmptyProps) {
  return (
    <div className="state-block flex flex-col items-start gap-3 p-8">
      <h3 className="t-md">{title}</h3>
      {description ? (
        <p className="muted max-w-prose t-sm">{description}</p>
      ) : null}
      {action}
    </div>
  );
}

type ErrorProps = {
  title?: string;
  message: string;
  onRetry?: () => void;
};

export function ErrorBlock({
  title = "No se pudo cargar",
  message,
  onRetry,
}: ErrorProps) {
  return (
    <div
      role="alert"
      className="state-block flex flex-col items-start gap-3 p-8"
    >
      <h3 className="t-md">{title}</h3>
      <p className="muted max-w-prose t-sm">{message}</p>
      {onRetry ? (
        <button type="button" className="btn" onClick={onRetry}>
          Reintentar
        </button>
      ) : null}
    </div>
  );
}

type NoticeProps = {
  /** Null renders nothing, so a screen can pass the resource notice straight in. */
  notice: string | null;
  /**
   * One line in a header row instead of a full-width sunken bar. The words
   * shrink; the claim does not.
   */
  compact?: boolean;
};

/**
 * Says out loud that what is on screen came from the synthetic run and not from
 * the API. A demo that quietly falls back is a demo that lies.
 *
 * ADR-0002 is why the compact form is a smaller sentence and not a quieter one:
 * the visible words still have to say that the data is synthetic and that the
 * API did not answer, and the whole reason stays reachable through the title
 * and through the text only a screen reader reads.
 */
export function SourceNotice({ notice, compact = false }: NoticeProps) {
  if (!notice) {
    return null;
  }

  if (compact) {
    return (
      <span
        role="status"
        className="status-line status-line-warn"
        title={notice}
      >
        Corrida sintetica, sin API
        <span className="sr-only">. {notice}</span>
      </span>
    );
  }

  return (
    <p role="status" className="panel-sunken muted px-4 py-2 t-sm">
      {notice}
    </p>
  );
}

type StreamProps = {
  status: EventsStatus;
  /**
   * Whether this page load is allowed to open the stream at all.
   *
   * `?data=mock` promises no request leaves the browser, so `useEvents` is never
   * enabled and reports `closed`. Without this fact the header read that as "sin
   * flujo de eventos" and offered a Reconectar button whose only possible
   * outcome was a failure the mode had already ruled out. Defaults to true, so a
   * caller that never had a choice is unaffected.
   */
  allowed?: boolean;
  onReconnect: () => void;
};

/**
 * Whether the ledger stream is attached, in the header row next to everything
 * else that describes the run rather than inside the sentence that names the
 * week. A closed stream is the only one of the four that asks for anything, so
 * it is the only one that carries a control.
 */
export function StreamStatus({
  status,
  allowed = true,
  onReconnect,
}: StreamProps) {
  /* Nothing to say on a browser that never had the stream in the first place:
     a permanent "unsupported" is a line the clerk can do nothing about. */
  if (status === "unsupported") {
    return null;
  }

  /* The offline mode says what it did rather than what failed. No control:
     there is nothing to reconnect to and the mode is the reason. */
  if (!allowed) {
    return (
      <span aria-live="polite" className="inline-flex items-center">
        <span className="status-line">Sin flujo de eventos</span>
      </span>
    );
  }

  return (
    <span
      aria-live="polite"
      className="inline-flex flex-wrap items-center gap-2"
    >
      {status === "open" ? (
        <span className="status-line status-line-ok">En vivo</span>
      ) : null}

      {status === "connecting" ? (
        <span className="status-line">Conectando</span>
      ) : null}

      {status === "closed" ? (
        <>
          <span className="status-line status-line-off">
            Sin flujo de eventos
          </span>
          {/* Outside the line rather than inside it: the phrase is nowrap so
              it never breaks mid-sentence, and on a phone the control has to
              be free to drop to the next row instead of widening the header
              past the screen. */}
          <button
            type="button"
            className="subtle t-sm underline"
            onClick={onReconnect}
          >
            Reconectar
          </button>
        </>
      ) : null}
    </span>
  );
}
