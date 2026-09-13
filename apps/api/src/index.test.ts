import { describe, expect, it } from "bun:test";
import { GEMINI_TIMEOUT_MS } from "@hackmty/extract";
import { HEARTBEAT_MS } from "./events";
import server, { IDLE_TIMEOUT_SECONDS } from "./index";

/**
 * The entry point holds one number that is not a preference, and this file is
 * why it is a number and not a default.
 *
 * Two responses of this API are silent for longer than a runtime's ordinary
 * idle timeout, and under the default of ten seconds both were cut with no
 * error anywhere: `GET /api/v1/events` sends nothing between its `ready` event
 * and its first heartbeat, and an assistant turn carrying a screenshot sends
 * nothing until the extractor and then the model have answered. Neither failure
 * is visible in a unit test of the route, because neither route is wrong: the
 * socket was closed under them. So the guard is here, on the arithmetic, and it
 * fails if somebody lengthens the heartbeat or the model timeout without
 * revisiting this.
 */
describe("the server the entry point exports", () => {
  it("outlives the heartbeat of the ledger stream", () => {
    expect(IDLE_TIMEOUT_SECONDS * 1000).toBeGreaterThan(HEARTBEAT_MS);
  });

  /**
   * An assistant turn with an image is silent for one extraction and then one
   * model round trip, each bounded by the same timeout, and the first event it
   * writes comes after both.
   */
  it("outlives the longest silence of an assistant turn", () => {
    expect(IDLE_TIMEOUT_SECONDS * 1000).toBeGreaterThan(GEMINI_TIMEOUT_MS * 2);
  });

  it("carries the timeout on the object the runtime serves", () => {
    expect(server.idleTimeout).toBe(IDLE_TIMEOUT_SECONDS);
    expect(typeof server.fetch).toBe("function");
  });
});
