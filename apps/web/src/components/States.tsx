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
    <div className="flex flex-col items-start gap-3 p-8">
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
    <div role="alert" className="flex flex-col items-start gap-3 p-8">
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
};

/**
 * Says out loud that what is on screen came from the synthetic run and not from
 * the API. A demo that quietly falls back is a demo that lies.
 */
export function SourceNotice({ notice }: NoticeProps) {
  if (!notice) {
    return null;
  }

  return (
    <p role="status" className="panel-sunken muted px-4 py-2 t-sm">
      {notice}
    </p>
  );
}
