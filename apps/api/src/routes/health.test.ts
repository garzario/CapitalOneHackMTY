import { describe, expect, it } from "bun:test";
import { NO_RAIL } from "@hackmty/rail";
import { REQUEST_ID_HEADER } from "../app";
import {
  DEPENDENCY_NAMES,
  emptyDependencyConfig,
  staticDependencySource,
} from "../dependencies";
import { createTestApp, TEST_NOW } from "../test-app";
import type { HealthPayload } from "./health";
import { SERVICE_NAME, SERVICE_VERSION } from "./health";

/**
 * `GET /health` is the endpoint a judge reads on their own phone and the one a
 * deploy script waits on, so these tests hold it to the three promises
 * `docs/09-api.md` makes about it: it answers 200 while a dependency is down, it
 * names every capability, and it never opens a socket to a third party.
 *
 * The dependency source is pinned in every case, which is what makes the payload
 * assertable: a laptop with a live `DATABASE_URL` would otherwise query Tiger Data
 * from inside a unit test.
 */

async function health(
  app: ReturnType<typeof createTestApp>["app"],
): Promise<HealthPayload> {
  const res = await app.request("/health");
  expect(res.status).toBe(200);
  return (await res.json()) as HealthPayload;
}

describe("GET /health", () => {
  it("reports the service, the version and one row per dependency", async () => {
    const { app } = createTestApp();
    const body = await health(app);

    expect(body.ok).toBe(true);
    expect(body.service).toBe(SERVICE_NAME);
    expect(body.version).toBe(SERVICE_VERSION);
    expect(body.dependencies.map((row) => row.name)).toEqual([
      ...DEPENDENCY_NAMES,
    ]);
  });

  it("stays 200 with every dependency unconfigured", async () => {
    const { app } = createTestApp();
    const body = await health(app);

    /* `ok` is liveness and nothing else. A load balancer that restarted the
       container because the ledger was slow would take the demo down for a reason
       that has nothing to do with the demo. */
    expect(body.ok).toBe(true);
    expect(
      body.dependencies.filter((row) => row.state === "not_configured").length,
    ).toBeGreaterThan(0);
  });

  it("stays 200 with the ledger down, and says which row is down", async () => {
    const { app } = createTestApp({
      dependencies: staticDependencySource(
        { ...emptyDependencyConfig(), database: true },
        { ok: false, ms: 2001, error: "no answer in 2000ms" },
      ),
    });
    const body = await health(app);

    const database = body.dependencies.find((row) => row.name === "database");
    expect(body.ok).toBe(true);
    expect(database?.state).toBe("down");
    expect(database?.detail).toContain("2000 ms");
  });

  it("reports the rail the process resolved, not the one the environment names", async () => {
    const { app } = createTestApp();
    const body = await health(app);
    const rail = body.dependencies.find((row) => row.name === "rail");

    /* The test app is pinned to no rail, so this is the documented sentence and not
       whatever `NESSIE_API_KEY` happens to be in the runner's `.env`. */
    expect(rail?.state).toBe("not_configured");
    expect(rail?.detail).toBe(NO_RAIL);
  });

  it("stamps the same checkedAt on every row, from the clock", async () => {
    const { app } = createTestApp();

    for (const row of (await health(app)).dependencies) {
      expect(row.checkedAt).toBe(TEST_NOW);
    }
  });

  it("logs the driver's own sentence against the request id, and not on the wire", async () => {
    const lines: string[] = [];
    const { app } = createTestApp({
      log: (line) => lines.push(line),
      dependencies: staticDependencySource(
        { ...emptyDependencyConfig(), database: true },
        {
          ok: false,
          ms: 12,
          error: 'relation "ledger_events" does not exist',
        },
      ),
    });

    const res = await app.request("/health", {
      headers: { [REQUEST_ID_HEADER]: "trace-health" },
    });
    const body = (await res.json()) as HealthPayload;

    expect(JSON.stringify(body)).not.toContain("ledger_events");
    const logged = lines.filter((line) => line.includes("ledger_events"));
    expect(logged.length).toBe(1);
    expect(logged[0]).toContain("[trace-health]");
  });

  it("carries no secret, even with every capability configured", async () => {
    const { app } = createTestApp({
      dependencies: staticDependencySource(
        {
          database: true,
          nessie: true,
          gemini: true,
          voice: true,
          consortium: true,
          snowflake: true,
          cepFetch: true,
          cepSeal: true,
        },
        { ok: true, ms: 5 },
      ),
    });
    const rendered = JSON.stringify(await health(app));

    /* The payload is booleans and sentences about variable names. Nothing in it is
       read out of a variable, which is the property that makes it safe to paste
       into an issue. */
    for (const row of JSON.parse(rendered).dependencies as {
      configured: boolean;
    }[]) {
      expect(typeof row.configured).toBe("boolean");
    }
    expect(rendered).not.toContain("postgres://");
    expect(rendered).not.toContain("BEGIN CERTIFICATE");
  });
});
