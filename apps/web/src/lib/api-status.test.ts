/**
 * Three states and not two, and the tests are about the third one.
 *
 * `skipped` is what the offline mode produces, and the whole reason it exists is
 * that it must never be reported as a failure: a red banner over a server nobody
 * asked makes a working build look broken, which is exactly what happened on the
 * run screen before issue #71's mode reached the status card. So what is asserted
 * here is the difference between not knowing and knowing that the answer is no.
 *
 * Nothing here opens a connection. The store's own check is a `getHealth` call
 * and is deliberately not exercised: these are the sentences and the predicate
 * the two components render from.
 */

import { describe, expect, test } from "bun:test";
import {
  API_STATUS_DOT,
  API_STATUS_LABEL,
  type ApiStatus,
  apiStatusDetail,
  apiStatusStamp,
  apiUnreachableSentence,
  isApiUnreachable,
} from "./api-status";

const OFFLINE: ApiStatus = {
  kind: "offline",
  message: "La API no contesto en 6 s.",
  checkedAt: new Date("2026-09-13T10:00:00.000Z"),
};

describe("isApiUnreachable", () => {
  test("is true only when this browser asked and got nothing", () => {
    expect(isApiUnreachable(OFFLINE)).toBe(true);
  });

  test("is false for the offline mode, which asked nothing", () => {
    /* The distinction the whole module exists for: `?data=mock` promises that no
       request leaves the browser, so there is no failure to report. */
    expect(isApiUnreachable({ kind: "skipped" })).toBe(false);
  });

  test("is false while the answer is still in flight, and when it arrives", () => {
    expect(isApiUnreachable({ kind: "checking" })).toBe(false);
    expect(
      isApiUnreachable({
        kind: "online",
        health: { ok: true, service: "sentryone-api", version: "0.1.0" },
        checkedAt: new Date("2026-09-13T10:00:00.000Z"),
      }),
    ).toBe(false);
  });
});

describe("what each state says", () => {
  test("the offline state says what the request said and nothing else", () => {
    expect(apiStatusDetail(OFFLINE)).toBe(OFFLINE.message);
    expect(API_STATUS_LABEL.offline).toBe("API no responde");
    expect(API_STATUS_DOT.offline).toBe("dot-hold");
  });

  test("the skipped state never claims the service failed", () => {
    const detail = apiStatusDetail({ kind: "skipped" });

    expect(detail).toContain("no se pregunto");
    expect(API_STATUS_LABEL.skipped).toBe("No se consulto la API");
    /* Neutral, and not the hold colour: a mode is not a failure. */
    expect(API_STATUS_DOT.skipped).toBe("dot-neutral");
  });

  test("a state with no answer yet has no time to show", () => {
    expect(apiStatusStamp({ kind: "checking" })).toBe("Sin respuesta todavia");
    expect(apiStatusStamp({ kind: "skipped" })).toBe("Sin consultar");
  });
});

describe("apiUnreachableSentence", () => {
  test("says the screens fall back when the mode falls back", () => {
    expect(apiUnreachableSentence("auto")).toContain("sintetica");
  });

  test("says the screens show their error state in the API-only mode", () => {
    /* That is the point of `?data=api`: no fallback, so what is on screen is the
       proof that the deployed backend is not answering. */
    expect(apiUnreachableSentence("api")).toContain("error");
    expect(apiUnreachableSentence("api")).not.toContain("sintetica");
  });
});
