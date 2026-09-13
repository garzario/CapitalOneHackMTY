import { describe, expect, it } from "bun:test";
import { createTestApp, writeHeaders } from "../test-app";
import { ACTOR_HEADER, parseActorHeader } from "./actor";

type ErrorBody = { error: { code: string; message: string } };

/**
 * Every write endpoint in docs/09-api.md, with a body good enough to reach the
 * middleware.
 *
 * The bodies are deliberately thin: `requireActor` runs before the validator on
 * every one of these routes, so the assertion is about the header and not about
 * the payload. A new write endpoint belongs in this list, and a new write
 * endpoint that forgot the middleware fails here instead of appearing on the
 * ledger with nobody's name against it.
 */
const WRITES: readonly { path: string; body: string }[] = [
  { path: "/api/v1/instructions", body: "{}" },
  { path: "/api/v1/instructions/ins-2026w37-01/decide", body: "{}" },
  { path: "/api/v1/instructions/ins-2026w37-01/verify-call", body: "{}" },
  { path: "/api/v1/instructions/ins-2026w37-01/verify-account", body: "" },
  { path: "/api/v1/sat/publish", body: "{}" },
  { path: "/api/v1/cep/verify", body: "{}" },
  { path: "/api/v1/seed", body: "{}" },
];

describe("parseActorHeader", () => {
  it("reads the form docs/09-api.md documents", () => {
    const parsed = parseActorHeader("role=clerk; name=Lupita Elizondo");

    expect(parsed.ok).toBe(true);
    expect(parsed.ok ? parsed.actor : undefined).toEqual({
      name: "Lupita Elizondo",
      role: "clerk",
    });
  });

  it("takes the two pairs in either order and tolerates the spacing", () => {
    const swapped = parseActorHeader("name=Gerardo Villarreal;role=owner");

    expect(swapped.ok ? swapped.actor : undefined).toEqual({
      name: "Gerardo Villarreal",
      role: "owner",
    });
  });

  it("keeps the spaces inside a name, so a real name needs no quoting", () => {
    const parsed = parseActorHeader("role=clerk; name=Ana Maria de la Garza");

    expect(parsed.ok ? parsed.actor.name : undefined).toBe(
      "Ana Maria de la Garza",
    );
  });

  it("reads the keys and the role case-insensitively and the name as typed", () => {
    const parsed = parseActorHeader("ROLE=Owner; Name=Gerardo Villarreal");

    expect(parsed.ok ? parsed.actor : undefined).toEqual({
      name: "Gerardo Villarreal",
      role: "owner",
    });
  });

  it("refuses a missing header, an empty one and half a header", () => {
    for (const raw of [
      undefined,
      null,
      "",
      "   ",
      "role=clerk",
      "name=Lupita Elizondo",
      "Lupita Elizondo",
    ]) {
      expect(parseActorHeader(raw).ok).toBe(false);
    }
  });

  it("refuses a role nobody defined, and an empty name", () => {
    expect(parseActorHeader("role=admin; name=Lupita Elizondo").ok).toBe(false);
    expect(parseActorHeader("role=; name=Lupita Elizondo").ok).toBe(false);
    expect(parseActorHeader("role=clerk; name=").ok).toBe(false);
    expect(parseActorHeader("role=clerk; name=   ").ok).toBe(false);
  });

  it("refuses a name longer than the contract allows rather than truncating it", () => {
    /* A truncated surname on an append-only ledger is worse than a refused
       request: the first one is a signature that does not match itself. */
    const long = "a".repeat(121);

    expect(parseActorHeader(`role=clerk; name=${long}`).ok).toBe(false);
    expect(parseActorHeader(`role=clerk; name=${"a".repeat(120)}`).ok).toBe(
      true,
    );
  });

  it("refuses an unknown key instead of ignoring it", () => {
    /* A caller who sent `rol=owner` and got a 200 as a clerk would have been
       lied to about what the ledger now says. */
    expect(
      parseActorHeader("rol=owner; role=clerk; name=Lupita Elizondo").ok,
    ).toBe(false);
  });

  it("refuses a name carrying the separator, because the half after it is lost", () => {
    const parsed = parseActorHeader("role=clerk; name=Garza; Elizondo");

    expect(parsed.ok).toBe(false);
  });
});

describe("the actor on every write", () => {
  it("refuses every write endpoint with no header, naming the header", async () => {
    const { app } = createTestApp();

    for (const write of WRITES) {
      const res = await app.request(write.path, {
        method: "POST",
        headers: { "content-type": "application/json" },
        ...(write.body === "" ? {} : { body: write.body }),
      });
      const body = (await res.json()) as ErrorBody;

      expect(res.status).toBe(400);
      expect(body.error.code).toBe("bad_request");
      expect(body.error.message).toContain(ACTOR_HEADER);
    }
  });

  it("answers 400 and not 403, because nothing about the caller was rejected", async () => {
    /* The distinction is the whole reason the two codes exist in this API: a 403
       is what /decide answers when it knows who is asking and the answer is no. */
    const { app } = createTestApp();
    const res = await app.request("/api/v1/sat/publish", {
      method: "POST",
      headers: { "content-type": "application/json", "x-actor": "role=admin" },
      body: "{}",
    });
    const body = (await res.json()) as ErrorBody;

    expect(res.status).toBe(400);
    expect(body.error.code).toBe("bad_request");
  });

  it("leaves every read reachable with no header at all", async () => {
    /* Reading is not a write. A clerk who has not picked an identity yet still
       sees the payment run, which is what makes the selector a selector and not a
       login screen. */
    const { app } = createTestApp();

    for (const path of [
      "/health",
      "/api/v1/run/current",
      "/api/v1/instructions/ins-2026w37-01",
      "/api/v1/ledger",
      "/api/v1/metrics",
    ]) {
      expect((await app.request(path)).status).toBe(200);
    }
  });

  it("still answers 404 for a write to a path that does not exist", async () => {
    /* The middleware is mounted per write route and not once over `/api/v1`, so a
       POST to nothing is answered with nothing rather than with a complaint about
       a header it would never have needed. */
    const { app } = createTestApp();
    const res = await app.request("/api/v1/instructions/ins-1/pay-it", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    const body = (await res.json()) as ErrorBody;

    expect(res.status).toBe(404);
    expect(body.error.code).toBe("not_found");
  });

  it("passes the write through once the header says who is acting", async () => {
    const { app } = createTestApp();
    const res = await app.request("/api/v1/seed", {
      method: "POST",
      headers: writeHeaders(),
      body: "{}",
    });
    const body = (await res.json()) as ErrorBody;

    /* 403 about ALLOW_SEED, which is the next refusal down: the header was read
       and the request reached the handler. */
    expect(res.status).toBe(403);
    expect(body.error.message).toContain("ALLOW_SEED");
  });
});
