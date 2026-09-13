/**
 * The sentence the run screen prints about the event stream.
 *
 * It sits on the same line as the data-source notice, so the two have to be able
 * to stand next to each other. Under `?data=mock` the stream is never opened,
 * and a stream nobody opened is not a stream that closed: the old wording read
 * "Flujo de eventos cerrado" with a Reconectar button beside a run that said
 * "solo datos sinteticos", which offered a judge with no API a button whose only
 * possible outcome was a failure the mode had already ruled out.
 */

import { describe, expect, test } from "bun:test";
import type { EventsStatus } from "../lib/api";
import { canReconnectStream, streamLabel } from "./RunScreen";

const STATUSES: EventsStatus[] = [
  "connecting",
  "open",
  "closed",
  "unsupported",
];

describe("streamLabel", () => {
  test("says the stream is not opened at all in the offline mode", () => {
    for (const status of STATUSES) {
      expect(streamLabel(false, status)).toBe(
        "Sin conexion: el flujo de eventos no se abre",
      );
    }
  });

  test("never claims a connection the offline mode did not make", () => {
    for (const status of STATUSES) {
      expect(streamLabel(false, status)).not.toContain("conectado");
      expect(streamLabel(false, status)).not.toContain("cerrado");
    }
  });

  test("reports the real status when the stream is allowed", () => {
    expect(streamLabel(true, "open")).toBe("Flujo de eventos conectado");
    expect(streamLabel(true, "connecting")).toBe(
      "Conectando al flujo de eventos",
    );
    expect(streamLabel(true, "closed")).toBe("Flujo de eventos cerrado");
  });

  test("treats a browser with no EventSource as closed rather than as an error", () => {
    /* `unsupported` is a browser fact and not a server fact, and the screen has
       one sentence for it. It must not read as the API being down. */
    expect(streamLabel(true, "unsupported")).toBe("Flujo de eventos cerrado");
  });
});

describe("canReconnectStream", () => {
  test("offers the button only where pressing it can do something", () => {
    expect(canReconnectStream(true, "closed")).toBe(true);
    expect(canReconnectStream(true, "open")).toBe(false);
    expect(canReconnectStream(true, "connecting")).toBe(false);
  });

  test("never offers it in the offline mode", () => {
    for (const status of STATUSES) {
      expect(canReconnectStream(false, status)).toBe(false);
    }
  });
});
