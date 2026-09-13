import { describe, expect, it } from "bun:test";
import type { LedgerEvent } from "@hackmty/core";
import { SYSTEM_DECIDER } from "@hackmty/core";
import {
  paymentRunSchema,
  satLookupResponseSchema,
  satPublishResponseSchema,
  satVersionsResponseSchema,
  sweepResultSchema,
} from "../schemas";
import { createTestApp } from "../test-app";

type ErrorBody = { error: { code: string; message: string } };

function json(body: unknown): RequestInit {
  return {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  };
}

describe("GET /api/v1/sat/lookup", () => {
  it("answers with the list rows for a listed RFC", async () => {
    const { app } = createTestApp();
    const res = await app.request("/api/v1/sat/lookup?rfc=SYN020202BBB");

    expect(res.status).toBe(200);
    const body = satLookupResponseSchema.parse(await res.json());

    expect(body.rfc).toBe("SYN020202BBB");
    expect(body.entries).toHaveLength(1);
    expect(body.entries[0]?.status).toBe("presunto");
  });

  it("treats not being on the list as an answer, not as a 404", async () => {
    const { app } = createTestApp();
    const res = await app.request("/api/v1/sat/lookup?rfc=SYN999999ZZZ");

    expect(res.status).toBe(200);
    expect(satLookupResponseSchema.parse(await res.json()).entries).toEqual([]);
  });

  it("upper-cases what the judge typed", async () => {
    const { app } = createTestApp();
    const res = await app.request("/api/v1/sat/lookup?rfc=syn020202bbb");

    expect(res.status).toBe(200);
    expect(satLookupResponseSchema.parse(await res.json()).rfc).toBe(
      "SYN020202BBB",
    );
  });

  it("answers a real RFC from the official list the judge types in", async () => {
    // The one real RFC in the API tests, and it is only ever looked up. ADR-0002
    // keeps real taxpayers to this read-only path and never next to a synthetic
    // invoice, which is why the sweep below publishes SYN RFCs instead.
    const { app } = createTestApp();
    const res = await app.request("/api/v1/sat/lookup?rfc=AAA121206EV5");

    expect(res.status).toBe(200);
    const body = satLookupResponseSchema.parse(await res.json());

    expect(body.entries[0]?.status).toBe("definitivo");
    expect(body.entries[0]?.publishedAt).toBe("2019-11-20");
    // Newest publication first, and the presunto row that preceded it is still
    // there: that is what makes the retroactive question answerable.
    expect(body.entries.map((entry) => entry.status)).toEqual([
      "definitivo",
      "presunto",
    ]);
  });

  it("does not alert on a real taxpayer who won in court", async () => {
    const { app } = createTestApp();
    const res = await app.request("/api/v1/sat/lookup?rfc=AAA080808HL8");
    const body = satLookupResponseSchema.parse(await res.json());

    expect(body.entries[0]?.status).toBe("sentencia_favorable");
  });

  it("rejects a malformed RFC with the shared envelope", async () => {
    const { app } = createTestApp();
    const res = await app.request("/api/v1/sat/lookup?rfc=123");
    const body = (await res.json()) as ErrorBody;

    expect(res.status).toBe(400);
    expect(body.error.code).toBe("bad_request");
  });

  it("strips the separators a human types around the homoclave", async () => {
    const { app } = createTestApp();
    const res = await app.request(
      `/api/v1/sat/lookup?rfc=${encodeURIComponent(" aaa-121206 ev5 ")}`,
    );

    expect(res.status).toBe(200);
    const body = satLookupResponseSchema.parse(await res.json());

    expect(body.rfc).toBe("AAA121206EV5");
    expect(body.entries.length).toBeGreaterThan(0);
  });

  it("says listed for a taxpayer whose newest situation is definitivo", async () => {
    const { app } = createTestApp();
    const body = satLookupResponseSchema.parse(
      await (await app.request("/api/v1/sat/lookup?rfc=AAA121206EV5")).json(),
    );

    expect(body.listed).toBe(true);
    expect(body.effective?.status).toBe("definitivo");
  });

  it("says not listed for a taxpayer who won in court, and still shows the history", async () => {
    const { app } = createTestApp();
    const body = satLookupResponseSchema.parse(
      await (await app.request("/api/v1/sat/lookup?rfc=AAA080808HL8")).json(),
    );

    // The rows are still there. Not listed is about the newest situation, and
    // hiding the earlier ones would remove the answer to "what did we know on
    // the day we paid".
    expect(body.listed).toBe(false);
    expect(body.entries.length).toBeGreaterThan(0);
  });

  it("names the snapshot it searched, including when it found nothing", async () => {
    const { app } = createTestApp();
    const body = satLookupResponseSchema.parse(
      await (await app.request("/api/v1/sat/lookup?rfc=SYN999999ZZZ")).json(),
    );

    // Not listed and no list loaded are different answers. The second one
    // would be a broken deployment and it must never look like the first.
    expect(body.entries).toEqual([]);
    expect(body.listed).toBe(false);
    expect(body.source.taxpayers).toBeGreaterThan(0);
    expect(body.source.retrievedAt).toBe("2026-09-12");
  });
});

describe("the lookup rate limit", () => {
  const CLIENT = { headers: { "x-forwarded-for": "203.0.113.7" } };

  async function lookup(
    app: ReturnType<typeof createTestApp>["app"],
    init: RequestInit = CLIENT,
  ) {
    return app.request("/api/v1/sat/lookup?rfc=SYN020202BBB", init);
  }

  it("counts down the remaining budget on every answer", async () => {
    const { app } = createTestApp();

    const first = await lookup(app);
    const second = await lookup(app);

    expect(first.headers.get("RateLimit-Limit")).toBe("30");
    expect(first.headers.get("RateLimit-Remaining")).toBe("29");
    expect(second.headers.get("RateLimit-Remaining")).toBe("28");
  });

  it("refuses the request after the limit with 429 and a Retry-After", async () => {
    const { app } = createTestApp();

    let last = await lookup(app);
    for (let attempt = 1; attempt <= 30; attempt += 1) {
      last = await lookup(app);
    }

    expect(last.status).toBe(429);
    expect(Number(last.headers.get("Retry-After"))).toBeGreaterThan(0);

    const body = (await last.json()) as ErrorBody;
    expect(body.error.code).toBe("rate_limited");
    // The shared envelope, not a second failure shape invented for this path.
    expect(body.error.message).toContain("30");
  });

  it("counts each client separately, so one scraper cannot lock out a judge", async () => {
    const { app } = createTestApp();

    for (let attempt = 0; attempt <= 30; attempt += 1) {
      await lookup(app);
    }

    const other = await lookup(app, {
      headers: { "x-forwarded-for": "198.51.100.4" },
    });

    expect(other.status).toBe(200);
  });

  it("does not throttle the other SAT endpoints", async () => {
    const { app } = createTestApp();

    for (let attempt = 0; attempt <= 30; attempt += 1) {
      await lookup(app);
    }

    const versions = await app.request("/api/v1/sat/versions", CLIENT);
    expect(versions.status).toBe(200);
  });
});

describe("GET /api/v1/sat/versions", () => {
  it("lists the loaded versions newest first with a row count", async () => {
    const { app } = createTestApp();
    const res = await app.request("/api/v1/sat/versions");

    expect(res.status).toBe(200);
    const body = satVersionsResponseSchema.parse(await res.json());

    expect(body.versions.map((version) => version.listVersion)).toEqual([
      "2026-08-29",
      "2026-06-27",
    ]);
    expect(body.versions[0]?.rows).toBe(1);
    expect(body.versions[1]?.rows).toBe(2);
  });
});

describe("POST /api/v1/sat/publish", () => {
  it("sweeps what was already paid to a newly listed supplier", async () => {
    const { app } = createTestApp();
    const res = await app.request(
      "/api/v1/sat/publish",
      json({ simulate: true, rfcs: ["SYN010101AAA"] }),
    );

    expect(res.status).toBe(200);
    const sweep = sweepResultSchema.parse(await res.json());

    expect(sweep.newlyListed).toHaveLength(1);
    const row = sweep.newlyListed[0];
    expect(row?.supplier.rfc).toBe("SYN010101AAA");
    expect(row?.status).toBe("presunto");
    // Only the CFDI we actually paid: one settled by a complement and one by a
    // payment that left the bank. The instruction still on hold is not exposure.
    expect(row?.paidCfdis).toHaveLength(2);
    expect(row?.deductedBase).toBe(104870.69);
    expect(row?.ivaExposure).toBe(16779.31);
    // 30 percent of the base already deducted, rounded to the cent. The rate is
    // an assumption about the company and it is documented and overridable in
    // packages/sat/src/sweep.ts, never invented in a route handler.
    expect(row?.isrExposure).toBe(31461.21);
    expect(sweep.totalExposure).toBe(48240.52);
  });

  it("publishes a listed RFC we have never paid without inventing exposure", async () => {
    const { app } = createTestApp();
    const sweep = sweepResultSchema.parse(
      await (
        await app.request(
          "/api/v1/sat/publish",
          json({ simulate: true, rfcs: ["SYN020202BBB"] }),
        )
      ).json(),
    );

    expect(sweep.newlyListed[0]?.paidCfdis).toEqual([]);
    expect(sweep.totalExposure).toBe(0);
  });

  it("refuses to simulate a publication for a real RFC", async () => {
    const { app } = createTestApp();
    const res = await app.request(
      "/api/v1/sat/publish",
      json({ simulate: true, rfcs: ["AAA010101AAA"] }),
    );
    const body = (await res.json()) as ErrorBody;

    // ADR-0002: a real RFC never stands next to fabricated evidence.
    expect(res.status).toBe(400);
    expect(body.error.code).toBe("bad_request");
  });

  it("loads an explicit list version and reports it in the versions list", async () => {
    const { app } = createTestApp();
    const res = await app.request(
      "/api/v1/sat/publish",
      json({
        listVersion: "2026-09-12",
        entries: [
          {
            rfc: "SYN060606FFF",
            name: "Plasticos San Nicolas SA de CV",
            status: "definitivo",
            publishedAt: "2026-09-12",
            listVersion: "2026-09-12",
          },
        ],
      }),
    );

    expect(res.status).toBe(200);
    expect(sweepResultSchema.parse(await res.json()).listVersion).toBe(
      "2026-09-12",
    );

    const versions = satVersionsResponseSchema.parse(
      await (await app.request("/api/v1/sat/versions")).json(),
    );
    expect(versions.versions[0]?.listVersion).toBe("2026-09-12");
  });

  it("appends sat_list_published so the sweep animation can listen", async () => {
    const { app, deps } = createTestApp();
    const seen: LedgerEvent[] = [];
    deps.events.subscribe((event) => seen.push(event));

    await app.request(
      "/api/v1/sat/publish",
      json({ simulate: true, rfcs: ["SYN010101AAA"], status: "definitivo" }),
    );

    const event = seen[0];
    expect(event?.type).toBe("sat_list_published");
    if (event?.type === "sat_list_published") {
      expect(event.entries[0]?.status).toBe("definitivo");
      // The name comes from the supplier we already hold, never from nowhere.
      expect(event.entries[0]?.name).toBe(
        "Aceros y Perfiles del Norte SA de CV",
      );
    }
    /* The publication comes first and its consequences after it, so a replay a
       year later cannot show a payment re-decided by a list nobody had posted. The
       cancellation is the second consequence and it follows the decision: the list
       made this supplier definitive, so the line stops being a hold somebody can
       wait out (issue #204, ADR-0009 row 4). */
    expect(seen.slice(1).map((row) => row.type)).toEqual([
      "decision_made",
      "payment_cancelled",
    ]);
    const cancelled = seen[2];
    if (cancelled?.type !== "payment_cancelled") {
      throw new Error("the publication did not cancel the line it listed");
    }
    expect(cancelled.reason).toContain("articulo 69-B");
    expect(cancelled.reason).toContain("Solo el propietario puede reabrirla");
    /* No actor, because nobody dropped this line by hand. `payment_cancelled`
       documents that field for exactly this case. */
    expect(cancelled.actor).toBeUndefined();
  });
});

/**
 * Issue #175. The publication does not only price the ledger, it re-scores the
 * lines of this week's run that belong to the suppliers it names, so the run
 * totals climb in the same request instead of reading zero next to a
 * `totalExposure` in six figures.
 */
describe("the re-score POST /api/v1/sat/publish runs on the current run", () => {
  /** SYN010101AAA is paid by two lines of the fixture: 01 holds, 09 was released. */
  const LISTED = "SYN010101AAA";

  async function publish(app: ReturnType<typeof createTestApp>["app"]) {
    const res = await app.request(
      "/api/v1/sat/publish",
      json({ simulate: true, rfcs: [LISTED], status: "definitivo" }),
    );
    expect(res.status).toBe(200);
    return satPublishResponseSchema.parse(await res.json());
  }

  async function currentRun(app: ReturnType<typeof createTestApp>["app"]) {
    return paymentRunSchema.parse(
      await (await app.request("/api/v1/run/current")).json(),
    );
  }

  it("makes the run's retroactive pair climb to the part of the sweep this run pays", async () => {
    const { app } = createTestApp();

    expect((await currentRun(app)).totals.retroactive69bBase).toBe(0);
    const published = await publish(app);
    const { totals } = await currentRun(app);

    const subject = published.newlyListed.find(
      (row) => row.supplier.rfc === LISTED,
    );
    expect(subject?.deductedBase).toBe(104870.69);
    /* One arithmetic, one source: the run-level pair is the sweep's own figures
       for the suppliers this run pays, not a second computation of them. */
    expect(totals.retroactive69bBase).toBe(subject?.deductedBase ?? 0);
    expect(totals.retroactive69bExposure).toBe(published.totalExposure);
    expect(totals.retroactive69bExposure).toBe(48240.52);
  });

  it("prices a supplier once however many lines of the run pay it", async () => {
    /* A second pending line for the same supplier, so the re-score has two lines
       to write the priced finding onto. `runMoney` keys the pair on the RFC, so
       the voided deductions are added once and not twice. That is the invariant a
       judge's calculator finds, and it is the reason this arithmetic is a function
       in `packages/core` rather than two additions in a route. */
    const { app } = createTestApp();
    const intake = await app.request(
      "/api/v1/instructions",
      json({
        supplierRfc: LISTED,
        amount: 12000,
        clabe: "012180001234567899",
        source: "whatsapp",
      }),
    );
    expect(intake.status).toBe(201);

    const published = await publish(app);
    const run = await currentRun(app);

    const priced = run.items
      .filter((item) => item.instruction.supplierRfc === LISTED)
      .flatMap((item) =>
        item.findings.filter(
          (finding) =>
            finding.detector === "sat_69b" &&
            finding.evidence.deductedBase === 104870.69,
        ),
      );

    expect(published.rescored).toHaveLength(2);
    expect(priced).toHaveLength(2);
    expect(run.totals.retroactive69bBase).toBe(104870.69);
    expect(run.totals.retroactive69bExposure).toBe(48240.52);
  });

  it("re-scores the pending line and leaves the released one alone", async () => {
    const { app } = createTestApp();
    const before = await currentRun(app);
    const published = await publish(app);
    const after = await currentRun(app);

    // ins-2026w37-01 holds on an engine decision; -09 was released by a person.
    expect(published.rescored.map((line) => line.instructionId)).toEqual([
      "ins-2026w37-01",
    ]);
    expect(published.rescored[0]?.before).toBe("hold");
    expect(published.rescored[0]?.decision.action).toBe("hold");

    const released = (id: string) => (run: typeof before) =>
      run.items.find((item) => item.instruction.id === id)?.decision;
    expect(released("ins-2026w37-09")(after)).toEqual(
      released("ins-2026w37-09")(before),
    );
  });

  it("stores the findings it scored, so the line carries the priced evidence", async () => {
    const { app } = createTestApp();
    await publish(app);
    const run = await currentRun(app);

    const line = run.items.find(
      (item) => item.instruction.id === "ins-2026w37-01",
    );
    const priced = line?.findings.find(
      (finding) =>
        finding.detector === "sat_69b" &&
        finding.evidence.status === "definitivo",
    );

    expect(priced?.evidence.deductedBase).toBe(104870.69);
    expect(priced?.evidence.retroactiveExposure).toBe(48240.52);
    /* The pesos about to leave plus the deductions the publication voids. They
       are different money, which is why this one total legitimately exceeds the
       instruction's own amount. */
    expect(priced?.amountAtRisk).toBe(184300 + 48240.52);
  });

  it("announces every re-scored line on the stream, and nothing else", async () => {
    const { app, deps } = createTestApp();
    const seen: LedgerEvent[] = [];
    deps.events.subscribe((event) => seen.push(event));

    const published = await publish(app);
    const decided = seen.filter((event) => event.type === "decision_made");

    expect(decided).toHaveLength(published.rescored.length);
    expect(
      decided.map((event) =>
        event.type === "decision_made" ? event.decision.instructionId : "",
      ),
    ).toEqual(published.rescored.map((line) => line.instructionId));
    for (const event of decided) {
      if (event.type === "decision_made") {
        // The engine reached this, nobody pressed a button. `system`, like the
        // decision the one-cent verification signs.
        expect(event.decision.decidedBy).toBe(SYSTEM_DECIDER);
      }
    }
  });

  it("leaves the run alone when the publication names nobody this run pays", async () => {
    /* SYN110202KKK is on a list version the fixture already holds and no
       instruction of this run pays it, so a re-publication moves nothing. The
       honest zero stays a zero. */
    const { app } = createTestApp();
    const res = await app.request(
      "/api/v1/sat/publish",
      json({ simulate: true, rfcs: ["SYN110202KKK"], status: "definitivo" }),
    );
    const published = satPublishResponseSchema.parse(await res.json());
    const { totals } = await currentRun(app);

    expect(published.rescored).toEqual([]);
    expect(totals.retroactive69bBase).toBe(0);
    expect(totals.retroactive69bExposure).toBe(0);
  });

  it("does not overwrite a decision a person signed", async () => {
    const { app } = createTestApp();
    await app.request(
      "/api/v1/instructions/ins-2026w37-01/decide",
      json({
        action: "verify",
        decidedBy: "ana@ensambles.mx",
        reason: "El proveedor confirmo la cuenta por telefono.",
      }),
    );

    const published = await publish(app);
    const run = await currentRun(app);
    const line = run.items.find(
      (item) => item.instruction.id === "ins-2026w37-01",
    );

    expect(published.rescored).toEqual([]);
    expect(line?.decision?.decidedBy).toBe("ana@ensambles.mx");
    expect(line?.decision?.action).toBe("verify");
    /* And the run totals stay honest about it: nothing re-scored means nothing
       priced, rather than a pair quietly filled in from the sweep behind the
       person's decision. */
    expect(run.totals.retroactive69bExposure).toBe(0);
  });
});
