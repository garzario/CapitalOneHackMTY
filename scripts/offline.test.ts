import { describe, expect, test } from "bun:test";
import { OUTWARD_SWITCHES, offlineEnv } from "./offline.ts";
import { isLoopback, OfflineViolation } from "./offline-guard.ts";

/**
 * The guard is the whole claim, so it is tested from both sides: it has to
 * refuse what leaves the machine and it has to let through what does not.
 *
 * A guard that refuses everything would fail the demo for the wrong reason,
 * and a guard that allows everything is the false green this file exists
 * because of. The first version of the rehearsal invoked the demo in a way bun
 * read as a missing package script, printed its own help, exited 0 and reported
 * green without running a beat.
 */
describe("the offline guard", () => {
  test("refuses a host that is not this machine", () => {
    expect(isLoopback("https://api.nessieisreal.com/accounts")).toBe(false);
    expect(isLoopback("https://generativelanguage.googleapis.com/v1beta")).toBe(
      false,
    );
    expect(isLoopback("https://www.banxico.org.mx/cep/valida.do")).toBe(false);
  });

  test("allows loopback, because that is what a laptop with no uplink still has", () => {
    expect(isLoopback("http://127.0.0.1:3000/health")).toBe(true);
    expect(isLoopback("http://localhost:5173/")).toBe(true);
    expect(isLoopback("http://[::1]:3000/health")).toBe(true);
  });

  test("allows a relative URL, which cannot leave the machine anyway", () => {
    // Refusing it would be a failure with no diagnosis behind it.
    expect(isLoopback("/api/v1/run/current")).toBe(true);
  });

  test("names the host in the error, so the failure is also the finding", () => {
    const violation = new OfflineViolation("https://api.nessieisreal.com/x");

    expect(violation.url).toBe("https://api.nessieisreal.com/x");
    expect(violation.message).toContain("api.nessieisreal.com");
    expect(violation.name).toBe("OfflineViolation");
  });

  test("is not fooled by a host that merely contains localhost", () => {
    expect(isLoopback("https://localhost.evil.example/x")).toBe(false);
  });
});

describe("the offline environment", () => {
  test("empties the switches that let a path reach outward at all", () => {
    const env = offlineEnv({ ALLOW_CEP_FETCH: "1", ALLOW_CONSORTIUM: "1" });

    for (const name of OUTWARD_SWITCHES) {
      expect([name, env[name]]).toEqual([name, ""]);
    }
  });

  test("leaves the keys alone, because a dead uplink is not a missing key", () => {
    const env = offlineEnv({
      NESSIE_API_KEY: "a-key",
      GEMINI_API_KEY: "another",
      DATABASE_URL: "postgres://localhost:5432/sentryone",
    });

    expect(env.NESSIE_API_KEY).toBe("a-key");
    expect(env.GEMINI_API_KEY).toBe("another");
    // The database is the reason the demo works offline at all, so it is never
    // touched: Postgres is a socket, not a fetch, and the guard never sees it.
    expect(env.DATABASE_URL).toBe("postgres://localhost:5432/sentryone");
  });

  test("does not mutate the environment it was handed", () => {
    const source = { ALLOW_CONSORTIUM: "1" };
    offlineEnv(source);

    expect(source.ALLOW_CONSORTIUM).toBe("1");
  });
});
