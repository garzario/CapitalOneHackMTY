import { describe, expect, it } from "bun:test";
import { FakeRail, NO_RAIL, unknownRail } from "@hackmty/rail";
import {
  DEPENDENCY_NAMES,
  DEPENDENCY_PROBE_TIMEOUT_MS,
  type Dependency,
  type DependencyName,
  dependencyReport,
  emptyDependencyConfig,
  railFactsOf,
  readDependencies,
  readDependencyConfig,
  staticDependencySource,
} from "./dependencies";

/**
 * The report is pure over its inputs, so every case here is a value in and a value
 * out: no socket, no database and no environment. The two cases that matter most are
 * the last two describes, because they are the rules that would cost us something if
 * they broke: a secret on the wire, and a driver message on the wire.
 */

const CHECKED_AT = "2026-09-13T06:00:00.000Z";

function report(
  config = emptyDependencyConfig(),
  extra: Partial<Parameters<typeof dependencyReport>[0]> = {},
): Dependency[] {
  return dependencyReport({
    config,
    rail: { active: null, message: NO_RAIL },
    checkedAt: CHECKED_AT,
    ...extra,
  });
}

function row(rows: Dependency[], name: DependencyName): Dependency {
  const found = rows.find((dependency) => dependency.name === name);
  if (found === undefined) {
    throw new Error(`no ${name} row`);
  }
  return found;
}

describe("the shape of the report", () => {
  it("answers one row per capability, in the documented order", () => {
    expect(report().map((dependency) => dependency.name)).toEqual([
      ...DEPENDENCY_NAMES,
    ]);
  });

  it("stamps the same checkedAt on every row", () => {
    for (const dependency of report()) {
      expect(dependency.checkedAt).toBe(CHECKED_AT);
    }
  });

  it("gives every row a detail, so no line is a colour with no sentence", () => {
    for (const dependency of report()) {
      expect(dependency.detail.length).toBeGreaterThan(20);
    }
  });
});

describe("the database, the one dependency that is probed", () => {
  it("reports not_configured with no DATABASE_URL, which is not a failure", () => {
    const database = row(report(), "database");

    expect(database.state).toBe("not_configured");
    expect(database.configured).toBe(false);
    expect(database.detail).toContain("DATABASE_URL");
  });

  it("reports up with the round trip when the select 1 answered", () => {
    const rows = report(
      { ...emptyDependencyConfig(), database: true },
      { database: { ok: true, ms: 42 } },
    );

    expect(row(rows, "database").state).toBe("up");
    expect(row(rows, "database").detail).toContain("42 ms");
  });

  it("names the timeout rather than the driver when the host went quiet", () => {
    const rows = report(
      { ...emptyDependencyConfig(), database: true },
      { database: { ok: false, ms: 2001, error: "no answer in 2000ms" } },
    );

    expect(row(rows, "database").state).toBe("down");
    expect(row(rows, "database").detail).toContain(
      String(DEPENDENCY_PROBE_TIMEOUT_MS),
    );
  });

  it("classifies a refused connection, a bad name and a refused password", () => {
    const cases: [string, string][] = [
      ["connect ECONNREFUSED 10.0.0.1:5432", "refused the connection"],
      ["getaddrinfo ENOTFOUND db.example", "did not resolve"],
      ["password authentication failed for user", "refused the credentials"],
    ];

    for (const [error, expected] of cases) {
      const rows = report(
        { ...emptyDependencyConfig(), database: true },
        { database: { ok: false, ms: 10, error } },
      );
      expect(row(rows, "database").detail).toContain(expected);
    }
  });

  it("sends an unclassified failure to the log and not to the caller", () => {
    const rows = report(
      { ...emptyDependencyConfig(), database: true },
      {
        database: {
          ok: false,
          ms: 10,
          error: 'relation "ledger_events" does not exist at 10.0.0.1',
        },
      },
    );
    const database = row(rows, "database");

    expect(database.state).toBe("down");
    expect(database.detail).toContain("server log");
    expect(database.detail).not.toContain("ledger_events");
    expect(database.detail).not.toContain("10.0.0.1");
  });
});

describe("the rail, the second thing that is actually probed", () => {
  it("reports the rail this process built", () => {
    const rows = report(emptyDependencyConfig(), {
      rail: { active: "nessie" },
    });

    expect(row(rows, "rail").state).toBe("up");
    expect(row(rows, "rail").configured).toBe(true);
    expect(row(rows, "rail").detail).toContain("nessie");
  });

  it("separates a rail nobody named from one that could not be built", () => {
    const none = row(report(emptyDependencyConfig()), "rail");
    const broken = row(
      report(emptyDependencyConfig(), {
        rail: { active: null, message: unknownRail("spei") },
      }),
      "rail",
    );

    /* Nothing named is a deployment choice; a name this build does not have is a
       typo in a `.env` and has to read as a fault or nobody goes looking for it. */
    expect(none.state).toBe("not_configured");
    expect(none.configured).toBe(false);
    expect(broken.state).toBe("down");
    expect(broken.configured).toBe(true);
    expect(broken.detail).toContain("spei");
  });

  it("reads the facts off the resolution and never off the environment", () => {
    /* A `NESSIE_API_KEY` in the runner's `.env` must not be able to change what this
       answers, which is why the facts come off the resolution object and the module
       never reads a variable of its own. */
    const built = railFactsOf({
      ok: true,
      rail: new FakeRail({ rail: "stp" }),
    });

    expect(built).toEqual({ active: "stp" });
    expect(railFactsOf({ ok: false, message: NO_RAIL }).active).toBeNull();
  });
});

describe("the five rows that are configuration and say so", () => {
  it("reports nessie, gemini and the voice ids as not_configured when empty", () => {
    const rows = report();

    for (const name of ["nessie", "extraction", "voice"] as const) {
      expect(row(rows, name).state).toBe("not_configured");
      expect(row(rows, name).configured).toBe(false);
    }
  });

  it("never claims a third party answered, because none is contacted", () => {
    const rows = report({
      ...emptyDependencyConfig(),
      nessie: true,
      gemini: true,
      voice: true,
    });

    for (const name of ["nessie", "extraction", "voice"] as const) {
      expect(row(rows, name).state).toBe("up");
      expect(row(rows, name).detail).toContain("Not probed from here");
    }
  });

  it("names the three voice ids when the call would degrade to the script", () => {
    const voice = row(report(), "voice");

    expect(voice.detail).toContain("ELEVENLABS_API_KEY");
    expect(voice.detail).toContain("ELEVENLABS_AGENT_ID");
    expect(voice.detail).toContain("ELEVENLABS_PHONE_NUMBER_ID");
    expect(voice.detail).toContain("422");
  });

  it("keeps the CEP up with no key, because a pasted one needs none", () => {
    const cep = row(report(), "cep");

    /* The primary path of docs/09-api.md parses a pasted XML with no key, no
       certificate and no network, so `not_configured` would be false. What the two
       flags change is how far the check goes, and the detail is what says so. */
    expect(cep.state).toBe("up");
    expect(cep.detail).toContain("ALLOW_CEP_FETCH");
    expect(cep.detail).toContain("not_checked");
  });

  it("says the seal is checked only when a certificate is configured", () => {
    const configured = row(
      report({ ...emptyDependencyConfig(), cepFetch: true, cepSeal: true }),
      "cep",
    );

    expect(configured.detail).toContain("a certificate is configured");
    expect(configured.detail).not.toContain("not_checked");
  });

  it("separates the consortium flag from holding an account to pull with", () => {
    const readOnly = row(
      report({ ...emptyDependencyConfig(), consortium: true }),
      "consortium",
    );
    const full = row(
      report({
        ...emptyDependencyConfig(),
        consortium: true,
        snowflake: true,
      }),
      "consortium",
    );

    expect(readOnly.detail).toContain("cannot refill it");
    expect(full.detail).toContain("consortium:pull");
  });
});

describe("reading the configuration", () => {
  it("reads a flag only on the exact value 1, like every other flag here", () => {
    expect(readDependencyConfig({ ALLOW_CONSORTIUM: "1" }).consortium).toBe(
      true,
    );
    expect(readDependencyConfig({ ALLOW_CONSORTIUM: "true" }).consortium).toBe(
      false,
    );
    expect(readDependencyConfig({ ALLOW_CEP_FETCH: "0" }).cepFetch).toBe(false);
  });

  it("treats an empty string and whitespace as absent", () => {
    expect(readDependencyConfig({ NESSIE_API_KEY: "" }).nessie).toBe(false);
    expect(readDependencyConfig({ NESSIE_API_KEY: "   " }).nessie).toBe(false);
    expect(readDependencyConfig({ NESSIE_API_KEY: "k" }).nessie).toBe(true);
  });

  it("needs all three ids before it calls the voice path configured", () => {
    const two = readDependencyConfig({
      ELEVENLABS_API_KEY: "a",
      ELEVENLABS_AGENT_ID: "b",
    });

    expect(two.voice).toBe(false);
    expect(
      readDependencyConfig({
        ELEVENLABS_API_KEY: "a",
        ELEVENLABS_AGENT_ID: "b",
        ELEVENLABS_PHONE_NUMBER_ID: "c",
      }).voice,
    ).toBe(true);
  });
});

describe("no secret reaches the report", () => {
  /**
   * The assertion this whole module exists to make. An environment full of
   * recognisable values goes in, and every one of them has to be absent from the
   * rendered report, including the connection string a `detail` could easily have
   * quoted while explaining a failure.
   *
   * None of these is shaped like the key it stands in for, deliberately. A fixture
   * written as `sk_...` or `AIza...` is a fixture `bun run scrub` has to report, and a
   * scanner that learns to ignore a shape because a test file uses it is a scanner
   * that stops finding the real thing. The property under test is only that a
   * distinctive string does not come out the other side.
   */
  const SECRETS = {
    DATABASE_URL:
      "postgres://tsdbadmin:NOT-A-PASSWORD-JUST-DISTINCTIVE@db.tigerdata.example:5432/tsdb",
    NESSIE_API_KEY: "nessie-value-that-must-not-appear",
    GEMINI_API_KEY: "gemini-value-that-must-not-appear",
    ELEVENLABS_API_KEY: "elevenlabs-value-that-must-not-appear",
    ELEVENLABS_AGENT_ID: "agent-value-that-must-not-appear",
    ELEVENLABS_PHONE_NUMBER_ID: "phone-value-that-must-not-appear",
    BANXICO_CEP_CERT_PEM: "certificate-value-that-must-not-appear",
    SNOWFLAKE_ACCOUNT: "snowflake-value-that-must-not-appear",
    SNOWFLAKE_PRIVATE_KEY_PATH: "/nowhere/key-path-that-must-not-appear",
    ALLOW_CONSORTIUM: "1",
    ALLOW_CEP_FETCH: "1",
  } as const;

  it("carries no value from the environment, in any row", () => {
    const rendered = JSON.stringify(
      report(readDependencyConfig(SECRETS), {
        database: { ok: true, ms: 7 },
        rail: { active: "nessie" },
      }),
    );

    for (const value of Object.values(SECRETS)) {
      if (value === "1") {
        continue;
      }
      expect(rendered).not.toContain(value);
    }
    expect(rendered).not.toContain("NOT-A-PASSWORD-JUST-DISTINCTIVE");
    expect(rendered).not.toContain("tigerdata.example");
  });

  it("reports configured as a boolean and never a length", () => {
    for (const dependency of report(readDependencyConfig(SECRETS))) {
      expect(typeof dependency.configured).toBe("boolean");
      expect(dependency.detail).not.toMatch(/\d+ characters/);
    }
  });
});

describe("gathering the report", () => {
  it("runs the probe the source offers and reports what it answered", async () => {
    const rows = await readDependencies({
      source: staticDependencySource(
        { ...emptyDependencyConfig(), database: true },
        { ok: true, ms: 3 },
      ),
      rail: { active: "nessie" },
      checkedAt: CHECKED_AT,
    });

    expect(row(rows, "database").state).toBe("up");
    expect(row(rows, "rail").state).toBe("up");
  });

  it("turns a probe that threw into a down row rather than a rejection", async () => {
    const rows = await readDependencies({
      source: {
        config: { ...emptyDependencyConfig(), database: true },
        database: async () => {
          throw new Error("pool exhausted");
        },
      },
      rail: { active: null, message: NO_RAIL },
      checkedAt: CHECKED_AT,
    });

    /* A health check may not throw: the one thing it has to do is answer. */
    expect(row(rows, "database").state).toBe("down");
    expect(row(rows, "database").detail).not.toContain("pool exhausted");
  });
});
