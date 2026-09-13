/**
 * Toasts: what the app says after a write.
 *
 * This app moves money, so the thing it says after a write matters more than it
 * would anywhere else. `RunScreen` carried the gap as a `TODO`: a clerk pressed
 * Retener, the row changed colour, and nothing confirmed that the decision had
 * been recorded rather than merely painted. A toast is the receipt for the
 * action, and for the one that failed it is the only place the reason appears.
 *
 * Four decisions are worth reading before using it.
 *
 * **One region, one live announcement.** Two writes a second apart stack in the
 * same corner instead of replacing each other, and the region is a single
 * `aria-live="polite"` so a screen reader is told once per toast and not once
 * per render. A `role="alert"` per toast inside a live region announces twice.
 *
 * **An error does not disappear.** `stop` toasts have no timer at all: the line
 * that says why a payment was refused stays until somebody dismisses it. The
 * rest clear themselves after `DEFAULT_MS`, which is long enough to read two
 * lines out loud at a table.
 *
 * **Text, not icons.** Every toast has a title in words; the tone is a 3 px rule
 * down its left edge, so the colour is the second channel and never the first.
 *
 * **No dependency.** The entrance is a `data-enter` attribute removed on the next
 * frame, and the transition duration is a motion token, so reduced motion
 * switches it off with everything else in the app.
 */

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

/** `ok` confirms, `warn` qualifies, `stop` reports a refusal, `info` states a fact. */
export type ToastTone = "ok" | "warn" | "stop" | "info";

export type Toast = {
  id: string;
  tone: ToastTone;
  title: string;
  /** One more line: the reason, the folio, the clave de rastreo. */
  detail?: string;
};

type ToastInput = Omit<Toast, "id">;

type ToastApi = {
  /** Queues a toast and answers its id, so a caller can dismiss it early. */
  show: (toast: ToastInput) => string;
  dismiss: (id: string) => void;
};

const TONE_CLASS: Record<ToastTone, string> = {
  ok: "toast-ok",
  warn: "toast-warn",
  stop: "toast-stop",
  info: "toast-info",
};

/** Long enough to read two lines at a table, short enough not to pile up. */
const DEFAULT_MS = 6000;

/**
 * The fallback is deliberately a pair of no-ops rather than a throw.
 *
 * `AppShell` mounts the provider, so in the app there is always one. A component
 * rendered on its own, in a test or in the token sheet, should not crash for the
 * want of a confirmation message: a missing toast is a missing confirmation, and
 * a thrown error in the middle of the payment run is a lost demo.
 */
const ToastContext = createContext<ToastApi>({
  show: () => "",
  dismiss: () => {},
});

export function useToasts(): ToastApi {
  return useContext(ToastContext);
}

let counter = 0;

function nextId(): string {
  counter += 1;

  return `toast-${counter}`;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: string) => {
    const timer = timers.current.get(id);

    if (timer !== undefined) {
      clearTimeout(timer);
      timers.current.delete(id);
    }

    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const show = useCallback(
    (input: ToastInput) => {
      const id = nextId();

      setToasts((current) => [...current, { ...input, id }]);

      /* A refusal has no timer. Everything else clears itself. */
      if (input.tone !== "stop") {
        timers.current.set(
          id,
          setTimeout(() => dismiss(id), DEFAULT_MS),
        );
      }

      return id;
    },
    [dismiss],
  );

  /* A timer that fires after the tree is gone sets state on nothing. */
  useEffect(
    () => () => {
      for (const timer of timers.current.values()) clearTimeout(timer);
      timers.current.clear();
    },
    [],
  );

  const api = useMemo(() => ({ show, dismiss }), [show, dismiss]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <ToastRegion toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

function ToastRegion({
  toasts,
  onDismiss,
}: {
  toasts: Toast[];
  onDismiss: (id: string) => void;
}) {
  /* An empty region still has to exist in the document: a live region inserted
     at the same time as its first message is not reliably announced. */
  return (
    <div className="toast-region" role="status" aria-live="polite">
      {toasts.map((toast) => (
        <ToastCard key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </div>
  );
}

function ToastCard({
  toast,
  onDismiss,
}: {
  toast: Toast;
  onDismiss: (id: string) => void;
}) {
  const [entering, setEntering] = useState(true);

  /* Off on the next frame, so the browser paints the entry state once and then
     transitions out of it. The duration is a token, so reduced motion makes
     this a no-op rather than a special case here. */
  useEffect(() => {
    const frame = requestAnimationFrame(() => setEntering(false));

    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <div
      className={`toast ${TONE_CLASS[toast.tone]}`}
      data-enter={entering ? "true" : "false"}
    >
      <div className="toast-body">
        <span className="toast-title">{toast.title}</span>
        {toast.detail ? (
          <span className="toast-detail">{toast.detail}</span>
        ) : null}
      </div>
      <button
        type="button"
        className="btn btn-sm"
        onClick={() => onDismiss(toast.id)}
      >
        Cerrar
      </button>
    </div>
  );
}
