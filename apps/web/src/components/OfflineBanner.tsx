/**
 * One line across every screen when the API is not answering.
 *
 * It is in the frame and not on a screen because it is a fact about the whole
 * page load: the run, the instruction, the 69-B lookup and the payments screen
 * each report their own fallback, and none of them can say the thing a person at
 * the table needs first, which is that the server is not there at all. Issue #71
 * rehearsed the demo with the uplink gone and the screens held; what was missing
 * was the sentence that says so before somebody asks why a figure looks old.
 *
 * It renders nothing in three of the four states, and that is deliberate. A
 * banner that is always on screen is furniture nobody reads, so there is no "API
 * en linea" bar: the status card on the payment run answers that question in
 * full, out of the same store, and this appears only when the answer is no.
 * `?data=mock` never shows it either, because in that mode nothing was asked and
 * a failure nobody looked for is not a failure. The rail's foot already says
 * which mode the page is in.
 */

import {
  apiStatusDetail,
  apiUnreachableSentence,
  isApiUnreachable,
  useApiStatus,
} from "../lib/api-status";
import { dataMode } from "../lib/resource";
import { href, PATHS } from "../lib/router";

export function OfflineBanner() {
  const { status, checking, recheck } = useApiStatus();

  if (!isApiUnreachable(status)) {
    return null;
  }

  return (
    /* `role="status"` and not `alert`: the page is working, on data it is
       labelling honestly, so this is news rather than an emergency and it must
       not interrupt whatever a screen reader is already reading. */
    <div
      role="status"
      className="panel-sunken flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2"
    >
      <span className="status-line status-line-warn">La API no responde</span>
      <p className="muted m-0 min-w-0 t-sm">
        {apiUnreachableSentence(dataMode())}{" "}
        <span className="subtle">{apiStatusDetail(status)}</span>
      </p>
      <span className="ms-auto flex flex-wrap items-center gap-3">
        <a className="t-sm underline" href={href(PATHS.entry)}>
          Ver el estado y los ajustes
        </a>
        <button
          type="button"
          aria-busy={checking}
          className="btn btn-pill btn-sm"
          onClick={recheck}
        >
          {checking ? "Consultando" : "Consultar de nuevo"}
        </button>
      </span>
    </div>
  );
}
