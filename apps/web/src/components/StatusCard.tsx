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
 *
 * The state machine and the sentences moved to `lib/api-status.ts` when the shell
 * gained the offline banner, because the two have to give one answer: a banner
 * saying the API is down over a card saying it is up is worse than either of them
 * alone, and one shared store is also one request per page load instead of two.
 */

import {
  API_STATUS_DOT,
  API_STATUS_LABEL,
  apiStatusDetail,
  apiStatusStamp,
  useApiStatus,
} from "../lib/api-status";

export function StatusCard() {
  const { status, checking, recheck } = useApiStatus();

  return (
    <section aria-labelledby="api-status-heading" className="well">
      <div className="well-body flex flex-col gap-3">
        <div className="flex items-start justify-between gap-3">
          <h2 id="api-status-heading" className="eyebrow">
            Estado de la API
          </h2>
          {/* The dot breathes only while a request is actually in flight, so
              the movement is the answer to "is it doing something", not
              decoration that runs forever. */}
          <span
            aria-hidden="true"
            data-checking={checking ? "true" : "false"}
            className={`status-dot mt-1 ${API_STATUS_DOT[status.kind]}`}
          />
        </div>

        <div aria-live="polite" className="flex flex-col gap-1">
          <p className="t-md font-semibold">{API_STATUS_LABEL[status.kind]}</p>
          <p className="muted t-sm">{apiStatusDetail(status)}</p>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="subtle t-xs">{apiStatusStamp(status)}</p>
          {/* No button in the offline mode: the only thing it could do is break
              the promise the mode made. */}
          {status.kind === "skipped" ? null : (
            <button
              type="button"
              aria-busy={checking}
              onClick={recheck}
              className="btn btn-pill"
            >
              {checking ? "Consultando" : "Consultar de nuevo"}
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
