/**
 * `PostgresRepository` against a real Postgres.
 *
 * The heart of this file is the parity suite: the same seeded company is loaded
 * into `MemoryRepository` and into Postgres, and the two are asserted against
 * each other. That is the only assertion that means anything here. A Postgres
 * repository that answers its own queries correctly and disagrees with the store
 * the screens were built against is two products, and the second one is
 * discovered on stage.
 *
 * It runs only when TEST_DATABASE_URL points at a database this suite may empty,
 * with the same guard as `packages/db/src/queries.test.ts`: DATABASE_URL is
 * deliberately not a fallback, because bun loads `.env` into every test run and a
 * fallback would wipe the demo database the moment somebody ran `bun test` on a
 * laptop configured for a rehearsal.
 *
 * This is the one file in the workspace that reaches the bun-only migration
 * runner, which is allowed because a test is not what ships.
 */

import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { syntheticCepFor, syntheticCepXml } from "@hackmty/cep";
import type { Actor, Cep, LedgerEvent } from "@hackmty/core";
import { SYSTEM_DECIDER } from "@hackmty/core";
import { createSql, type Sql } from "@hackmty/db";
import { FakeRail } from "@hackmty/rail";
import { RUN_SIZE_MAX, RUN_SIZE_MIN } from "@hackmty/seed";
import { migrate } from "../../../packages/db/src/migrate";
import { staticCepInbox } from "./cep";
import { PostgresRepository } from "./postgres-repo";
import { MemoryRepository } from "./repo";
import {
  beneficiariesResponseSchema,
  cepVerifyResponseSchema,
  decideResponseSchema,
  instructionDetailSchema,
  intakeResponseSchema,
  ledgerResponseSchema,
  metricsSchema,
  paymentRunSchema,
  satPublishResponseSchema,
  satVersionsResponseSchema,
  seedResponseSchema,
  supplierDetailSchema,
  sweepResultSchema,
  verificationStateSchema,
} from "./schemas";
import { sentryoneDataset } from "./sentryone";
import {
  actorHeader,
  createTestApp,
  flush,
  TEST_CLERK,
  TEST_NOW,
  TEST_OWNER,
  writeHeaders,
} from "./test-app";

const url = process.env.TEST_DATABASE_URL;
const enabled =
  url !== undefined &&
  url.trim() !== "" &&
  url.trim() !== (process.env.DATABASE_URL ?? "").trim();

const SEED = 69;
/** The supplier the simulated 69-B publication names in docs/10-demo-script.md. */
const LISTED_RFC = "SYN080910HI8";

/**
 * Loading eight months of documents over the network takes longer than bun's
 * five second default, and the managed Timescale service is on the other side of
 * an internet connection rather than on 5432. The number is a network allowance,
 * not a performance target: against the local Postgres the same load is seconds.
 */
const REMOTE_TIMEOUT_MS = 180_000;

type ErrorBody = { error: { code: string; message: string } };

/**
 * A JSON write, with the actor every write endpoint requires.
 *
 * The header is the default clerk unless a test names somebody else, so a test
 * about a role says which role it is about and every other test reads as it did
 * before the header existed.
 */
function json(body: unknown, actor: Actor = TEST_CLERK): RequestInit {
  return {
    method: "POST",
    headers: writeHeaders(actor),
    body: JSON.stringify(body),
  };
}

/** Detector names of a finding list, sorted, so order is never the assertion. */
function detectorsOf(findings: readonly { detector: string }[]): string[] {
  return findings.map((finding) => finding.detector).sort();
}

function lowerSet(values: readonly string[]): string[] {
  return [...values].map((value) => value.toLowerCase()).sort();
}

describe.skipIf(!enabled)("PostgresRepository", () => {
  let sql: Sql;
  let pg: PostgresRepository;
  let memory: MemoryRepository;

  beforeAll(async () => {
    sql = createSql(url);
    await migrate(sql);
    pg = new PostgresRepository(sql);
    await pg.load({ seed: SEED });
    memory = new MemoryRepository(SEED, sentryoneDataset);
  }, REMOTE_TIMEOUT_MS);

  afterAll(async () => {
    await sql?.end({ timeout: 5 });
  });

  /**
   * One app per test, all of them on the same Postgres, with ids that keep
   * counting across the file.
   *
   * `createTestApp` restarts its id counter for every app, which is right for a
   * store that is thrown away with the test and wrong for one that is not: two
   * tests would both mint `ins-test-0001`, the second insert would be skipped by
   * `on conflict (id) do nothing`, and the assertion about how many decision rows
   * an instruction carries would quietly be about the wrong instruction.
   */
  let mintedIds = 0;
  function harness(now: string = TEST_NOW, allowSeed = false) {
    return createTestApp({
      repo: pg,
      allowSeed,
      clock: {
        now: () => now,
        newId: (prefix) =>
          `${prefix}-pg-${String(++mintedIds).padStart(4, "0")}`,
      },
    });
  }

  describe("parity with MemoryRepository on the same seeded company", () => {
    it("answers the same payment run, line for line", async () => {
      const fromMemory = await memory.currentRun();
      const fromPostgres = await pg.currentRun();

      expect(fromPostgres.id).toBe(fromMemory.id);
      expect(fromPostgres.weekOf).toBe(fromMemory.weekOf);
      expect(fromPostgres.totals).toEqual(fromMemory.totals);
      expect(fromPostgres.items.map((item) => item.instruction.id)).toEqual(
        fromMemory.items.map((item) => item.instruction.id),
      );

      for (const [index, item] of fromPostgres.items.entries()) {
        const expected = fromMemory.items[index];
        expect(item.instruction.supplierRfc).toBe(
          expected?.instruction.supplierRfc ?? "",
        );
        expect(item.decision?.action).toBe(expected?.decision?.action);
        expect(detectorsOf(item.findings)).toEqual(
          detectorsOf(expected?.findings ?? []),
        );
      }
    });

    it("answers the same run through the id the generator prints", async () => {
      const current = await pg.currentRun();

      expect((await pg.run("current"))?.id).toBe(current.id);
      expect((await pg.run(current.id))?.weekOf).toBe(current.weekOf);
      expect(await pg.run("run-1999-01-04")).toBeUndefined();
    });

    it("answers the same detail panel for a hero line", async () => {
      const heroId = (await memory.currentRun()).items[0]?.instruction.id ?? "";
      const fromMemory = await memory.instructionDetail(heroId);
      const fromPostgres = await pg.instructionDetail(heroId);

      expect(fromPostgres?.instruction.id).toBe(heroId);
      expect(fromPostgres?.decision?.action).toBe(fromMemory?.decision?.action);
      expect(detectorsOf(fromPostgres?.findings ?? [])).toEqual(
        detectorsOf(fromMemory?.findings ?? []),
      );
      expect(await pg.instructionDetail("INS-nothing")).toBeUndefined();
    });

    it("answers the same supplier drawer", async () => {
      const rfc =
        (await memory.currentRun()).items[0]?.instruction.supplierRfc ?? "";
      const fromMemory = await memory.supplierDetail(rfc);
      const fromPostgres = await pg.supplierDetail(rfc);

      expect(fromPostgres?.supplier.legalName).toBe(
        fromMemory?.supplier.legalName,
      );
      // Postgres renders a uuid lowercase and the SAT prints a folio fiscal
      // uppercase. They are the same invoice, so the set is compared in one case.
      expect(
        lowerSet((fromPostgres?.cfdis ?? []).map((row) => row.uuid)),
      ).toEqual(lowerSet((fromMemory?.cfdis ?? []).map((row) => row.uuid)));
      expect(
        lowerSet((fromPostgres?.complements ?? []).map((row) => row.uuid)),
      ).toEqual(
        lowerSet((fromMemory?.complements ?? []).map((row) => row.uuid)),
      );
      expect(detectorsOf(fromPostgres?.findings ?? [])).toEqual(
        detectorsOf(fromMemory?.findings ?? []),
      );
      expect(await pg.supplierDetail("SYN010101AAA")).toBeUndefined();
    });

    it("holds the same list versions, ledger depth, metrics and company", async () => {
      expect(await pg.satVersions()).toEqual(await memory.satVersions());
      expect((await pg.ledger({ limit: 1000 })).length).toBe(
        (await memory.ledger({ limit: 1000 })).length,
      );
      expect(await pg.metrics()).toEqual(await memory.metrics());

      const company = await pg.company();
      const expected = await memory.company();
      expect(company.rfc).toBe(expected.rfc);
      expect(company.legalName).toBe(expected.legalName);
    });

    it("mirrors the company's own bank account and nobody else's", async () => {
      const mirror = await pg.bankMirror();
      const company = await pg.company();

      expect(mirror.length).toBe((await memory.bankMirror()).length);
      expect(company.rfc).not.toBe("");
      expect(new Set(mirror.map((row) => row.accountId)).size).toBe(1);
    });
  });

  describe("the endpoints of docs/09-api.md, served from Postgres", () => {
    it("GET /api/v1/run/current parses and is the size the screen was built for", async () => {
      const { app } = harness();
      const res = await app.request("/api/v1/run/current");

      expect(res.status).toBe(200);
      const run = paymentRunSchema.parse(await res.json());
      expect(run.items.length).toBeGreaterThanOrEqual(RUN_SIZE_MIN);
      expect(run.items.length).toBeLessThanOrEqual(RUN_SIZE_MAX);
      expect(run.totals.instructions).toBe(run.items.length);
    });

    it("GET /api/v1/instructions/:id answers the line, and 404s an id it never held", async () => {
      const { app } = harness();
      const run = paymentRunSchema.parse(
        await (await app.request("/api/v1/run/current")).json(),
      );
      const id = run.items[0]?.instruction.id ?? "";

      const res = await app.request(`/api/v1/instructions/${id}`);
      expect(res.status).toBe(200);
      expect(
        instructionDetailSchema.parse(await res.json()).instruction.id,
      ).toBe(id);

      const missing = await app.request("/api/v1/instructions/INS-nothing");
      expect(missing.status).toBe(404);
      expect(((await missing.json()) as ErrorBody).error.code).toBe(
        "not_found",
      );
    });

    it("GET /api/v1/suppliers/:rfc accepts a typed lower case RFC, and 404s an unknown one", async () => {
      const { app } = harness();
      const res = await app.request(
        `/api/v1/suppliers/${LISTED_RFC.toLowerCase()}`,
      );

      expect(res.status).toBe(200);
      expect(supplierDetailSchema.parse(await res.json()).supplier.rfc).toBe(
        LISTED_RFC,
      );

      const missing = await app.request("/api/v1/suppliers/SYN010101AAA");
      expect(missing.status).toBe(404);
    });

    it("POST /api/v1/instructions stores the line, appends two events and serves it back", async () => {
      const { app, deps } = harness();
      const seen: LedgerEvent[] = [];
      deps.events.subscribe((event) => seen.push(event));

      const res = await app.request(
        "/api/v1/instructions",
        json({
          supplierRfc: LISTED_RFC,
          amount: 38417.48,
          clabe: "012180101391764613",
          source: "whatsapp",
        }),
      );

      expect(res.status).toBe(201);
      const intake = intakeResponseSchema.parse(await res.json());
      expect(seen.map((event) => event.type)).toEqual([
        "instruction_received",
        "decision_made",
      ]);

      const detail = instructionDetailSchema.parse(
        await (
          await app.request(`/api/v1/instructions/${intake.instruction.id}`)
        ).json(),
      );
      expect(detail.instruction.clabe).toBe("012180101391764613");
      expect(detail.decision?.action).toBe(intake.decision.action);
      expect(detectorsOf(detail.findings)).toEqual(
        detectorsOf(intake.findings),
      );
    });

    it("POST /api/v1/instructions/:id/decide keeps the old row and answers the new one", async () => {
      const { app } = harness();
      const created = intakeResponseSchema.parse(
        await (
          await app.request(
            "/api/v1/instructions",
            json({
              supplierRfc: LISTED_RFC,
              amount: 12500.5,
              clabe: "012180101391764613",
              source: "email",
            }),
          )
        ).json(),
      );
      const id = created.instruction.id;

      const res = await app.request(
        `/api/v1/instructions/${id}/decide`,
        json(
          {
            action: "release",
            decidedBy: TEST_OWNER.name,
            reason: "El proveedor confirmo la cuenta y la nomina sale hoy.",
          },
          TEST_OWNER,
        ),
      );

      expect(res.status).toBe(200);
      const body = decideResponseSchema.parse(await res.json());
      expect(body.decision.action).toBe("release");
      expect(body.decision.decidedBy).toBe(TEST_OWNER.name);
      /* The name, the capacity and the argument, all three through the normalised
         projection: `decided_by`, `decided_by_role` from 0013 and `reason` from
         0011. A store that answered two of the three would print a constancia the
         memory store cannot. */
      expect(body.decision.decidedByRole).toBe("owner");
      expect(body.decision.reason).toContain("la nomina sale hoy");
      // The engine's own decision is still there: a clerk who holds on Thursday
      // and releases on Friday leaves two rows, and the constancia needs both.
      const rows = await sql<{ count: number }[]>`
        select count(*)::int as count from decisions where instruction_id = ${id}
      `;
      expect(rows[0]?.count).toBe(2);
      expect(
        instructionDetailSchema.parse(
          await (await app.request(`/api/v1/instructions/${id}`)).json(),
        ).decision?.action,
      ).toBe("release");
    });

    it("POST /api/v1/instructions/:id/decide wins on a clock earlier than the run instant", async () => {
      // The engine stamps the seeded decisions at the instant the run was
      // prepared, which is ahead of the clerk's wall clock whenever the run day
      // is ahead of today. The newest decision is therefore the newest ROW, and
      // a store that ordered by decided_at would keep answering with the
      // engine's action after a person already overrode it.
      // From the memory run, so the line is one the seed wrote and its decision
      // carries the engine's run instant rather than a test clock.
      const seeded = (await memory.currentRun()).items.at(-1);
      const id = seeded?.instruction.id ?? "";
      const engineAt = seeded?.decision?.decidedAt ?? "";
      expect(id).not.toBe("");
      expect(engineAt).not.toBe("");

      const clerkAt = new Date(Date.parse(engineAt) - 3_600_000).toISOString();
      expect(Date.parse(clerkAt)).toBeLessThan(Date.parse(engineAt));
      const action =
        seeded?.decision?.action === "hold" ? "release" : ("hold" as const);

      const { app } = harness(clerkAt);
      const res = await app.request(
        `/api/v1/instructions/${id}/decide`,
        json(
          {
            action,
            decidedBy: TEST_OWNER.name,
            reason: "Revisado con el proveedor antes de la corrida.",
          },
          TEST_OWNER,
        ),
      );

      expect(res.status).toBe(200);
      const body = decideResponseSchema.parse(await res.json());
      expect(body.decision.decidedAt).toBe(clerkAt);

      const detail = instructionDetailSchema.parse(
        await (await app.request(`/api/v1/instructions/${id}`)).json(),
      );
      expect(detail.decision?.action).toBe(action);
      expect(detail.decision?.decidedBy).toBe(TEST_OWNER.name);
      expect(detail.decision?.decidedByRole).toBe("owner");
    });

    it("refuses the clerk the exception on Postgres too, and stores nothing", async () => {
      /* The role rule is the route's and the store is not supposed to matter, so
         it is asserted on both: a 403 that appended a decision row here and not
         there would be two products again. */
      const { app } = harness();
      const created = intakeResponseSchema.parse(
        await (
          await app.request(
            "/api/v1/instructions",
            json({
              supplierRfc: LISTED_RFC,
              amount: 9900.25,
              clabe: "012180101391764613",
              source: "email",
            }),
          )
        ).json(),
      );
      const id = created.instruction.id;
      const before = await sql<{ count: number }[]>`
        select count(*)::int as count from decisions where instruction_id = ${id}
      `;

      const res = await app.request(
        `/api/v1/instructions/${id}/decide`,
        json({
          action: "release",
          decidedBy: TEST_CLERK.name,
          reason: "urge",
        }),
      );
      expect(res.status).toBe(403);
      expect(((await res.json()) as ErrorBody).error.code).toBe("forbidden");

      const after = await sql<{ count: number }[]>`
        select count(*)::int as count from decisions where instruction_id = ${id}
      `;
      expect(after[0]?.count).toBe(before[0]?.count ?? 0);
    });

    it("reads the cancellation of a line off the ledger, like the memory store", async () => {
      const { app, deps } = harness();
      const created = intakeResponseSchema.parse(
        await (
          await app.request(
            "/api/v1/instructions",
            json({
              supplierRfc: LISTED_RFC,
              amount: 7310.1,
              clabe: "012180101391764613",
              source: "email",
            }),
          )
        ).json(),
      );
      const id = created.instruction.id;

      expect(await pg.cancellation(id)).toBeUndefined();

      await deps.repo.appendEvent({
        type: "payment_cancelled",
        at: TEST_NOW,
        instructionId: id,
        reason: "La corrida se cerro sin este pago.",
        actor: TEST_CLERK,
      });

      /* Both halves of the projection survive the jsonb round trip, which is the
         part that could quietly differ: the reason and the actor live in the
         payload and no column was added for either. */
      expect(await pg.cancellation(id)).toEqual({
        at: TEST_NOW,
        reason: "La corrida se cerro sin este pago.",
        actor: TEST_CLERK,
      });

      /* And the route refuses the clerk a decision on it, on this store too. */
      const res = await app.request(
        `/api/v1/instructions/${id}/decide`,
        json({
          action: "hold",
          decidedBy: TEST_CLERK.name,
          reason: "otra vez",
        }),
      );
      expect(res.status).toBe(403);
      expect(((await res.json()) as ErrorBody).error.message).toContain(
        "cancelled",
      );
    });

    it("reads who published a list version off the ledger, like the memory store", async () => {
      const { app } = harness();
      const published = satPublishResponseSchema.parse(
        await (
          await app.request(
            "/api/v1/sat/publish",
            json(
              { simulate: true, rfcs: [LISTED_RFC], status: "presunto" },
              TEST_OWNER,
            ),
          )
        ).json(),
      );

      expect(await pg.publisher(published.listVersion)).toEqual(TEST_OWNER);
      /* A version nobody posted here answers undefined rather than a name, which
         is what makes the sweep constancia able to say so. */
      expect(await pg.publisher("1999-01-01")).toBeUndefined();
    });

    it("GET /api/v1/ledger honours the limit and treats since as exclusive", async () => {
      const { app } = harness();
      const first = ledgerResponseSchema.parse(
        await (await app.request("/api/v1/ledger?limit=3")).json(),
      );
      expect(first.events).toHaveLength(3);

      const since = first.events[0]?.at ?? "";
      const after = ledgerResponseSchema.parse(
        await (
          await app.request(
            `/api/v1/ledger?since=${encodeURIComponent(since)}&limit=5`,
          )
        ).json(),
      );
      for (const event of after.events) {
        expect(Date.parse(event.at)).toBeGreaterThan(Date.parse(since));
      }
    });

    it("POST /api/v1/sat/publish prices the sweep, and the version shows up and prints", async () => {
      const { app } = harness();
      const res = await app.request(
        "/api/v1/sat/publish",
        json({ simulate: true, rfcs: [LISTED_RFC], status: "definitivo" }),
      );

      expect(res.status).toBe(200);
      const sweep = sweepResultSchema.parse(await res.json());
      expect(sweep.newlyListed).toHaveLength(1);
      expect(sweep.newlyListed[0]?.paidCfdis.length).toBeGreaterThan(0);
      expect(sweep.totalExposure).toBeGreaterThan(0);

      const versions = satVersionsResponseSchema.parse(
        await (await app.request("/api/v1/sat/versions")).json(),
      );
      expect(versions.versions.map((version) => version.listVersion)).toContain(
        sweep.listVersion,
      );

      const pdf = await app.request(
        `/api/v1/sat/constancia?listVersion=${encodeURIComponent(sweep.listVersion)}`,
      );
      expect(pdf.status).toBe(200);
      expect(pdf.headers.get("content-type")).toBe("application/pdf");
      expect((await pdf.arrayBuffer()).byteLength).toBeGreaterThan(0);
    });

    /**
     * Issue #175 on the store that is not the one the screens were built against.
     *
     * The re-score writes findings and a decision through `recordEngineDecision`,
     * which is one statement on the memory path and a transaction over two inserts
     * here, so "the run counter climbs" has to be asserted on Postgres and not only
     * in a route test. It is checked against `MemoryRepository` given the same
     * publication, because a Postgres run that agreed with itself and disagreed
     * with the store the screenshots came from is the second product this suite
     * exists to refuse.
     */
    it(
      "POST /api/v1/sat/publish re-scores the run, and both stores read the same pair",
      async () => {
        const listVersion = "2026-09-19-rescore";
        const entries = [
          {
            rfc: LISTED_RFC,
            name: "MATERIALES SINTETICOS OCHO SA DE CV",
            status: "definitivo" as const,
            publishedAt: "2026-09-19",
            listVersion,
          },
        ];

        const onPostgres = harness().app;
        const onMemory = createTestApp({
          repo: new MemoryRepository(SEED, sentryoneDataset),
        }).app;

        const published = await Promise.all(
          [onPostgres, onMemory].map(async (app) =>
            satPublishResponseSchema.parse(
              await (
                await app.request(
                  "/api/v1/sat/publish",
                  json({ listVersion, entries }),
                )
              ).json(),
            ),
          ),
        );
        const runs = await Promise.all(
          [onPostgres, onMemory].map(async (app) =>
            paymentRunSchema.parse(
              await (await app.request("/api/v1/run/current")).json(),
            ),
          ),
        );

        const [fromPostgres, fromMemory] = published;
        const [runFromPostgres, runFromMemory] = runs;

        /* The seeded line that pays this supplier is re-scored on both stores and
           reaches the same action. Two things are deliberately NOT compared, and
           both are artefacts of this file sharing one database rather than parity
           failures: the lists of ids, because earlier tests post intakes for the
           same RFC onto Postgres, and `before`, because on Postgres the earlier
           publication already moved this line to `hold` and signed it `system`,
           which is exactly the state a second publication is allowed to re-score. */
        const seeded = (row?: (typeof published)[number]) =>
          row?.rescored.find(
            (line) => line.instructionId === "INS-2026-09-07-070",
          );
        expect(seeded(fromPostgres)?.decision.action).toBe(
          seeded(fromMemory)?.decision.action,
        );
        expect(seeded(fromPostgres)?.decision.action).toBe("hold");
        expect(seeded(fromMemory)?.before).toBe("verify");

        /* The identity the acceptance of #175 is written as: the run-level pair is
           the part of the whole-ledger sweep that belongs to the suppliers the
           re-score touched, on both stores, to the centavo. */
        const subject = fromPostgres?.newlyListed[0];
        expect(runFromPostgres?.totals.retroactive69bBase).toBe(
          subject?.deductedBase,
        );
        expect(runFromPostgres?.totals.retroactive69bExposure).toBe(
          fromPostgres?.totalExposure,
        );
        expect(runFromPostgres?.totals.retroactive69bBase).toBe(
          runFromMemory?.totals.retroactive69bBase,
        );
        expect(runFromPostgres?.totals.retroactive69bExposure).toBe(
          runFromMemory?.totals.retroactive69bExposure,
        );

        /* The findings were stored and not only returned: a second reader of the
           same database has to see the priced evidence on the line. */
        const line = await pg.instructionDetail("INS-2026-09-07-070");
        const priced = line?.findings.find(
          (finding) =>
            finding.detector === "sat_69b" &&
            finding.evidence.listVersion === listVersion,
        );
        expect(priced?.evidence.deductedBase).toBe(subject?.deductedBase);
        expect(priced?.evidence.retroactiveExposure).toBe(
          fromPostgres?.totalExposure,
        );
        expect(line?.decision?.decidedBy).toBe(SYSTEM_DECIDER);
      },
      REMOTE_TIMEOUT_MS,
    );

    it("POST /api/v1/cep/verify answers from the registry the repository stored", async () => {
      const { app, deps } = harness();
      const supplier = await pg.findSupplier(LISTED_RFC);
      const cep = syntheticCep(supplier?.legalName ?? LISTED_RFC);

      await deps.repo.saveVerifiedBeneficiary({
        supplierRfc: LISTED_RFC,
        clabe: cep.beneficiaryAccount,
        cep,
        verifiedAt: "2026-09-11T16:45:00.000Z",
      });

      const res = await app.request(
        "/api/v1/cep/verify",
        json({
          claveRastreo: cep.claveRastreo,
          date: "2026-09-11",
          amount: cep.amount,
          senderBank: cep.senderBank,
          beneficiaryBank: cep.beneficiaryBank,
          beneficiaryAccount: cep.beneficiaryAccount,
          supplierRfc: LISTED_RFC,
        }),
      );

      expect(res.status).toBe(200);
      const body = cepVerifyResponseSchema.parse(await res.json());
      expect(body.cep.claveRastreo).toBe(cep.claveRastreo);
      expect(body.nameMatch).toBe("match");

      const registry = beneficiariesResponseSchema.parse(
        await (await app.request("/api/v1/beneficiaries")).json(),
      );
      expect(
        registry.items.some((row) => row.clabe === cep.beneficiaryAccount),
      ).toBe(true);
      // The CEP is evidence for the account, so the supplier now holds it.
      expect(
        (await pg.findSupplier(LISTED_RFC))?.knownAccounts.some(
          (account) =>
            account.clabe === cep.beneficiaryAccount &&
            account.establishedBy === "cep",
        ),
      ).toBe(true);
    });

    /**
     * The pasted-XML half of the endpoint, which needs no registry row and no
     * network: `parseCep` reads the document and the row it produces has to land
     * in Postgres the same way the `claveRastreo` form's does.
     */
    it("POST /api/v1/cep/verify parses a pasted CEP and stores it", async () => {
      const { app } = harness();
      const res = await app.request(
        "/api/v1/cep/verify",
        json({ xml: syntheticCepXml(), supplierRfc: LISTED_RFC }),
      );

      expect(res.status).toBe(200);
      const body = cepVerifyResponseSchema.parse(await res.json());
      expect(body.cep.claveRastreo).toBe("SYN20260912000000001");
      // Nobody checked the seal, and the product says that rather than guessing.
      expect(body.cep.signatureValid).toBe(false);
      expect(body.cep.signatureReason).toBe("not_checked");
      expect(body.nameMatch).toBe("mismatch");

      const registry = beneficiariesResponseSchema.parse(
        await (await app.request("/api/v1/beneficiaries")).json(),
      );
      expect(
        registry.items.some((row) => row.clabe === body.cep.beneficiaryAccount),
      ).toBe(true);
    });

    /**
     * The verification call on the Postgres path.
     *
     * The hand-recorded form is the one that needs no telephony, which is what
     * makes it the right one to assert the storage with: the event has to reach
     * `ledger_event` and it must not drag a `decision_made` along with it. The
     * clerk's release stays a separate call that a person signs.
     */
    it("POST /api/v1/instructions/:id/verify-call appends the call and no decision", async () => {
      /* Its own instant, so the ledger window below holds what this test wrote
         and nothing another test in this file wrote at TEST_NOW. `ledger` reads
         oldest first under a limit, so slicing the tail would read the seeded
         company's first page rather than the newest events. */
      const CALLED_AT = "2026-09-12T04:30:00.000Z";
      const SINCE = "2026-09-12T04:29:59.999Z";
      const { app } = harness(CALLED_AT);
      const run = paymentRunSchema.parse(
        await (await app.request("/api/v1/run/current")).json(),
      );
      const line = run.items[0];
      if (line === undefined) {
        throw new Error("the seeded run carried no instructions");
      }
      const id = line.instruction.id;

      const res = await app.request(
        `/api/v1/instructions/${id}/verify-call`,
        json({
          outcome: "denied",
          evidence: "Esa cuenta no es nuestra.",
          recordedBy: TEST_CLERK.name,
        }),
      );

      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        status: string;
        releasesPayment: boolean;
        outcome: string;
      };
      expect(body.status).toBe("recorded");
      expect(body.releasesPayment).toBe(false);
      expect(body.outcome).toBe("denied");

      const appended = await pg.ledger({ since: SINCE, limit: 1000 });
      expect(appended.map((event) => event.type)).toEqual([
        "verification_call",
      ]);

      const call = appended[0];
      if (call?.type !== "verification_call") {
        throw new Error("the appended event was not a verification_call");
      }
      expect(call.at).toBe(CALLED_AT);
      expect(call.instructionId).toBe(id);
      expect(call.outcome).toBe("denied");
      expect(call.manual).toBe(true);
      // Four digits on the event, never the CLABE.
      expect(call.clabeLast4).toBe(line.instruction.clabe.slice(-4));
      expect(JSON.stringify(call)).not.toContain(line.instruction.clabe);
    });

    it("GET /api/v1/metrics recomputes the blind evaluation", async () => {
      const { app } = harness();
      const res = await app.request("/api/v1/metrics");

      expect(res.status).toBe(200);
      const metrics = metricsSchema.parse(await res.json());
      expect(metrics.cases).toBeGreaterThan(0);
    });

    it("GET /api/v1/events streams an event appended through the repository", async () => {
      const { app, deps } = harness();
      const run = paymentRunSchema.parse(
        await (await app.request("/api/v1/run/current")).json(),
      );
      const instructionId = run.items[0]?.instruction.id ?? "";

      const controller = new AbortController();
      const res = await app.request("/api/v1/events", {
        signal: controller.signal,
      });
      const body = res.body;
      if (body === null) {
        throw new Error("the SSE response carried no body");
      }
      const reader = body.getReader();
      const decoder = new TextDecoder();
      // The ready frame, which the route sends before anything is appended.
      await reader.read();

      await deps.emit({
        type: "payment_sent",
        at: "2026-09-11T17:05:00.000Z",
        instructionId,
        claveRastreo: "SYNSPEI20260911777",
      });
      const chunk = await reader.read();
      expect(decoder.decode(chunk.value)).toContain("event: ledger");

      controller.abort();
      await reader.cancel();
      await flush();

      // The event is the record and the column is the projection of it.
      const stored = await pg.instructionDetail(instructionId);
      expect(stored?.instruction.sentAt).toBe("2026-09-11T17:05:00.000Z");
    });
  });

  /**
   * The one-cent verification over Postgres, which is where the two stores could
   * most easily stop agreeing: `readVerificationEvents` reads `instructionId` out
   * of the payload with jsonb operators, and the memory store reads it off the
   * object. A typo in either path would show up as a state machine stuck on
   * `cent_sent` while the ledger holds the CEP, and only on the store the demo
   * runs on.
   */
  describe("the one-cent verification, served from Postgres", () => {
    /**
     * The line a CEP can actually clear: stopped by the CLABE control, and stopped
     * on a signal a person has to check rather than one provable from the documents.
     * A CLABE whose check digit cannot exist stays critical whoever holds the
     * account, so a CEP does not release that one and the test would be asserting
     * the wrong thing about the engine.
     */
    async function clearableLine() {
      const run = await pg.currentRun();
      const line = run.items.find(
        (item) =>
          item.decision?.action !== "release" &&
          item.findings.some(
            (finding) =>
              finding.detector === "clabe_forensics" &&
              finding.state === "requiere_verificacion",
          ),
      );
      if (line === undefined) {
        throw new Error(
          "the seeded run holds no line the CLABE control stopped on a checkable signal",
        );
      }
      return line;
    }

    /**
     * A line nothing has touched yet, one per test that asks.
     *
     * Every test in this describe writes to the same Postgres, and the endpoint
     * answers `409` on a line that is already resolved, so two tests sharing an
     * instruction would make the second one assert against a refusal. Findings-free
     * lines are the ones the other tests have no reason to want.
     */
    const usedLines = new Set<string>();
    async function freshLine() {
      const run = await pg.currentRun();
      const line = run.items.find(
        (item) =>
          item.findings.length === 0 && !usedLines.has(item.instruction.id),
      );
      if (line === undefined) {
        throw new Error("the seeded run holds no untouched line left");
      }
      usedLines.add(line.instruction.id);
      return line;
    }

    it(
      "appends and folds the whole machine, from the cent to the release",
      async () => {
        const line = await clearableLine();
        const clave = `SYNVERPG${String(++mintedIds).padStart(6, "0")}`;
        const cep = syntheticCepFor({
          claveRastreo: clave,
          transferredAt: "2026-09-12T09:15:42.000-06:00",
          amount: 0.01,
          senderName: "Metalicos del Norte SA de CV",
          senderBank: "SinteticoDos",
          senderAccount: "012180000123456782",
          senderRfc: "SYN090615C01",
          beneficiaryName: line.supplier.legalName.toUpperCase(),
          beneficiaryBank: "SinteticoUno",
          beneficiaryAccount: line.instruction.clabe,
          beneficiaryRfc: line.instruction.supplierRfc,
          concepto: "Verificacion de cuenta",
        });
        const { app } = createTestApp({
          repo: pg,
          clock: {
            now: () => TEST_NOW,
            newId: (prefix) =>
              `${prefix}-pg-${String(++mintedIds).padStart(4, "0")}`,
          },
          rail: async () => ({
            ok: true,
            rail: new FakeRail({ now: () => TEST_NOW, mint: () => clave }),
          }),
          cepInbox: staticCepInbox([cep], "test CEP index"),
        });

        const response = await app.request(
          `/api/v1/instructions/${encodeURIComponent(line.instruction.id)}/verify-account`,
          { method: "POST", headers: { "x-actor": actorHeader() } },
        );
        expect(response.status).toBe(202);
        const state = verificationStateSchema.parse(await response.json());

        expect(state.state).toBe("released");
        expect(state.claveRastreo).toBe(clave);
        expect(state.nameMatch).toBe("match");
        // Never valid without a certificate, on either store.
        expect(state.sealState).toBe("not_checked");
        expect(state.decision?.decidedBy).toBe("system");

        // The read endpoint answers the same state out of the ledger.
        const read = verificationStateSchema.parse(
          await (
            await app.request(
              `/api/v1/instructions/${encodeURIComponent(line.instruction.id)}/verification`,
            )
          ).json(),
        );
        expect(read.state).toBe("released");
        expect(read.cepAt).toBe(TEST_NOW);

        // And the stored decision is the engine's own, not the one the run opened
        // with, so the screen and the constancia agree with the ledger.
        const stored = await pg.instructionDetail(line.instruction.id);
        expect(stored?.decision?.action).toBe("release");
        expect(stored?.decision?.decidedBy).toBe("system");
        expect(
          (stored?.findings ?? []).some(
            (finding) => finding.detector === "beneficiary_cep",
          ),
        ).toBe(true);
      },
      REMOTE_TIMEOUT_MS,
    );

    it(
      "reads the two new event kinds back out of the ledger",
      async () => {
        const line = await freshLine();
        const clave = `SYNVERPG${String(++mintedIds).padStart(6, "0")}`;
        const { app } = createTestApp({
          repo: pg,
          clock: {
            now: () => TEST_NOW,
            newId: (prefix) =>
              `${prefix}-pg-${String(++mintedIds).padStart(4, "0")}`,
          },
          rail: async () => ({
            ok: true,
            rail: new FakeRail({ now: () => TEST_NOW, mint: () => clave }),
          }),
          // Nothing filed under that clave, so the machine stops on awaiting_cep and
          // both new event kinds have to survive the round trip through jsonb.
          cepInbox: staticCepInbox([], "empty CEP index"),
        });

        await app.request(
          `/api/v1/instructions/${encodeURIComponent(line.instruction.id)}/verify-account`,
          { method: "POST", headers: { "x-actor": actorHeader() } },
        );

        const events = await pg.verificationEvents(
          line.instruction.id,
          line.instruction.clabe,
        );
        const sent = events.find(
          (event) => event.type === "cent_sent" && event.claveRastreo === clave,
        );
        const awaited = events.find(
          (event) =>
            event.type === "cep_awaited" && event.claveRastreo === clave,
        );

        expect(sent?.type).toBe("cent_sent");
        if (sent?.type === "cent_sent") {
          expect(sent.claveRastreo).toBe(clave);
          expect(sent.rail).toBe("nessie");
          expect(sent.amount).toBe(0.01);
          expect(sent.simulated).toBe(true);
        }
        expect(awaited?.type).toBe("cep_awaited");
        if (awaited?.type === "cep_awaited") {
          expect(awaited.attempts).toBe(1);
        }
      },
      REMOTE_TIMEOUT_MS,
    );

    /**
     * The parity assertion that matters here: the same ledger, folded by the same
     * projection, read through two repositories. It runs the memory store over the
     * events Postgres answered rather than re-sending the cent, because the point
     * is the read and not the write.
     */
    it(
      "answers the same events as the memory store for the same writes",
      async () => {
        const line = await freshLine();
        const clave = `SYNVERPG${String(++mintedIds).padStart(6, "0")}`;
        const event: LedgerEvent = {
          type: "cent_sent",
          at: "2026-09-12T05:00:00.000Z",
          instructionId: line.instruction.id,
          rail: "nessie",
          claveRastreo: clave,
          amount: 0.01,
          clabeLast4: line.instruction.clabe.slice(-4),
          simulated: true,
        };

        await pg.appendEvent(event);
        await memory.appendEvent(event);

        const fromPostgres = await pg.verificationEvents(
          line.instruction.id,
          line.instruction.clabe,
        );
        const fromMemory = await memory.verificationEvents(
          line.instruction.id,
          line.instruction.clabe,
        );

        /* Compared on the event this test wrote rather than on every cent the line
         carries: the two stores hold different histories here, because Postgres is
         shared across this file and the memory store is not. What has to agree is
         the row, field for field, after a round trip through jsonb. */
        const mine = (rows: readonly LedgerEvent[]) =>
          rows.filter(
            (row) => row.type === "cent_sent" && row.claveRastreo === clave,
          );

        expect(mine(fromPostgres)).toEqual([event]);
        expect(mine(fromMemory)).toEqual(mine(fromPostgres));
        // And a different instruction's cent is not in either answer.
        expect(
          (
            await pg.verificationEvents("ins-nothing", line.instruction.clabe)
          ).some((row) => row.type === "cent_sent"),
        ).toBe(false);
      },
      REMOTE_TIMEOUT_MS,
    );

    it(
      "answers 503 when the server has no rail, on this store too",
      async () => {
        const line = await freshLine();
        const { app } = harness();

        const response = await app.request(
          `/api/v1/instructions/${encodeURIComponent(line.instruction.id)}/verify-account`,
          { method: "POST", headers: { "x-actor": actorHeader() } },
        );

        expect(response.status).toBe(503);
      },
      REMOTE_TIMEOUT_MS,
    );
  });

  describe("reseeding", () => {
    it(
      "is idempotent: the same seed twice gives the same run",
      async () => {
        const first = await pg.reset(SEED);
        const runAfterFirst = await pg.currentRun();
        const second = await pg.reset(SEED);
        const runAfterSecond = await pg.currentRun();

        expect(second).toEqual(first);
        expect(runAfterSecond.id).toBe(runAfterFirst.id);
        expect(runAfterSecond.totals).toEqual(runAfterFirst.totals);
        expect(runAfterSecond.items.map((item) => item.instruction.id)).toEqual(
          runAfterFirst.items.map((item) => item.instruction.id),
        );
      },
      REMOTE_TIMEOUT_MS,
    );

    it(
      "adds an intake received in a later week to the open run, never moves it",
      async () => {
        await pg.reset(SEED);
        const before = await pg.currentRun();
        expect(before.id).toBe("run-2026-09-07");
        expect(before.items.length).toBe(
          (await new MemoryRepository(SEED, sentryoneDataset).currentRun())
            .items.length,
        );

        // Wednesday of the following week. `MemoryRepository` holds one list, so
        // the line joins the run the clerk has open; the run anchor on the
        // company row is what makes Postgres answer the same way instead of
        // re-deriving a later week and hiding every seeded line behind it.
        const { app } = harness("2026-09-16T15:00:00.000Z");
        const created = intakeResponseSchema.parse(
          await (
            await app.request(
              "/api/v1/instructions",
              json({
                supplierRfc: LISTED_RFC,
                amount: 9100.25,
                clabe: "012180101391764613",
                source: "email",
              }),
            )
          ).json(),
        );
        expect(created.instruction.receivedAt).toBe("2026-09-16T15:00:00.000Z");

        const run = paymentRunSchema.parse(
          await (await app.request("/api/v1/run/current")).json(),
        );
        expect(run.id).toBe("run-2026-09-07");
        expect(run.weekOf).toBe("2026-09-07");
        expect(run.items.length).toBe(before.items.length + 1);
        expect(run.totals.instructions).toBe(before.items.length + 1);
        expect(run.items.map((item) => item.instruction.id)).toContain(
          created.instruction.id,
        );
      },
      REMOTE_TIMEOUT_MS,
    );

    it(
      "answers POST /api/v1/seed with exactly the summary docs/09-api.md promises",
      async () => {
        const { app } = harness(TEST_NOW, true);
        const res = await app.request("/api/v1/seed", json({}));

        expect(res.status).toBe(200);
        // `.strict()` is the assertion: the endpoint promises four keys, and the
        // whole SentryOneLoadResult leaking through would be a second shape the
        // web app never agreed to.
        const summary = seedResponseSchema.strict().parse(await res.json());

        const fromMemory = new MemoryRepository(0, sentryoneDataset);
        const fromMemorySummary = await fromMemory.reset(0);
        expect(summary.suppliers).toBe(fromMemorySummary.suppliers);
        expect(summary.instructions).toBe(fromMemorySummary.instructions);
        expect(summary.events).toBe(fromMemorySummary.events);

        const expected = await fromMemory.currentRun();
        const run = await pg.currentRun();
        expect(run.id).toBe(expected.id);
        expect(run.weekOf).toBe(expected.weekOf);
        expect(run.totals).toEqual(expected.totals);
        expect(run.items.map((item) => item.instruction.id)).toEqual(
          expected.items.map((item) => item.instruction.id),
        );
      },
      REMOTE_TIMEOUT_MS,
    );

    it(
      "maps seed 0 to the default company, exactly as MemoryRepository does",
      async () => {
        // `loadSentryOne(0)` is a different company from `loadSentryOne()`, and
        // the memory store has always read 0 as "no seed given". Passing the
        // literal 0 through to the generator made the two stores answer
        // `POST /api/v1/seed` with two different runs.
        const byDefault = await pg.reset(0);
        const bySeed = await pg.reset(SEED);
        // Same company, and the argument is echoed rather than the seed the
        // generator resolved it to, exactly as the memory store answers.
        expect(byDefault).toEqual({ ...bySeed, seed: 0 });
      },
      REMOTE_TIMEOUT_MS,
    );
  });
});

/**
 * A CEP the registry can hold. Built here rather than fetched, because nothing in
 * this suite reaches Banxico: `signatureValid` is false with the reason the
 * product prints, which is "not verified" and never "invalid".
 */
function syntheticCep(beneficiaryName: string): Cep {
  return {
    claveRastreo: "SYNCEP20260911041",
    transferredAt: "2026-09-11T16:44:12.000Z",
    amount: 0.01,
    senderName: "Metalicos del Norte SA de CV",
    senderBank: "058",
    beneficiaryName,
    beneficiaryAccount: "030580000999000041",
    beneficiaryBank: "030",
    beneficiaryRfc: "NA",
    numeroCertificado: "00001000000504465028",
    signatureValid: false,
    signatureReason: "unconfirmed_scheme",
    xml: '<SPEI_Tercero claveRastreo="SYNCEP20260911041" sintetico="true" />',
    synthetic: true,
  };
}
