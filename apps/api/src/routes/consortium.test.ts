/**
 * `GET /api/v1/consortium/signal`, on both stores.
 *
 * The first block runs against `MemoryRepository` and is what CI exercises. The
 * second runs the identical assertions against Postgres when `TEST_DATABASE_URL`
 * points at a database this suite may write to, with the same guard as
 * `postgres-repo.test.ts`: a snapshot the engine reads out of one store and not
 * the other would be two products, and the second one is discovered on stage.
 *
 * The three statuses are the whole contract of this endpoint, and each of them is
 * a different claim: 503 is "this server will not", 404 is "the network does not
 * know this account, or has never been pulled", and 200 is the signal. Collapsing
 * any two of them would let a screen say something the data does not support.
 */

import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { hashPair } from "@hackmty/consortium";
import type { ConsortiumSnapshotRow } from "@hackmty/core";
import { createSql, type Sql } from "@hackmty/db";
import { migrate } from "../../../../packages/db/src/migrate";
import { createApp } from "../app";
import { acceptOnlyCepSource } from "../cep";
import { createConsortiumSource } from "../consortium";
import { createDeps } from "../deps";
import { UNAVAILABLE_EXTRACTOR } from "../extraction";
import { PostgresRepository } from "../postgres-repo";
import { MemoryRepository, type Repository } from "../repo";
import { consortiumSignalResponseSchema } from "../schemas";
import { createTestClock } from "../test-app";

const SUPPLIER_RFC = "SYN070707GGG";
const PAID_CLABE = "012180005544332215";
const FRESH_CLABE = "012180101391764613";
const OTHER_SUPPLIER_RFC = "SYN030303CCC";
const PULLED_AT = "2026-09-12T03:00:00.000Z";

/** The two rows the network holds in these tests, hashed the way the pull does. */
function rows(): ConsortiumSnapshotRow[] {
  const paid = hashPair({ rfc: SUPPLIER_RFC, clabe: PAID_CLABE });
  const reported = hashPair({
    rfc: OTHER_SUPPLIER_RFC,
    clabe: "072580000456123788",
  });

  return [
    {
      ...paid,
      tenants: 37,
      firstSeen: "2024-03-04",
      lastSeen: "2026-09-02",
      fraudReports: 0,
      otherAccounts: 0,
    },
    {
      ...reported,
      tenants: 2,
      firstSeen: "2026-07-11",
      lastSeen: "2026-08-30",
      fraudReports: 2,
      otherAccounts: 0,
    },
  ];
}

type ErrorBody = { error: { code: string; message: string } };

function appFor(repo: Repository, allowed: boolean) {
  return createApp(
    createDeps({
      repo,
      clock: createTestClock(),
      allowSeed: false,
      extractor: UNAVAILABLE_EXTRACTOR,
      cep: acceptOnlyCepSource(),
      consortium: createConsortiumSource(repo, { allowed }),
    }),
  );
}

function signalPath(rfc: string, clabe: string): string {
  return `/api/v1/consortium/signal?rfc=${encodeURIComponent(rfc)}&clabe=${clabe}`;
}

/**
 * Every assertion about the endpoint, parameterised over a repository.
 *
 * Written once and run twice on purpose: the memory store and Postgres answer the
 * same three states or the signal the engine reads depends on which one booted.
 */
function suite(name: string, makeRepo: () => Promise<Repository>) {
  describe(name, () => {
    let repo: Repository;

    beforeAll(async () => {
      repo = await makeRepo();
    });

    it("answers 503 and names the flag when the consortium is off", async () => {
      const res = await appFor(repo, false).request(
        signalPath(SUPPLIER_RFC, PAID_CLABE),
      );

      expect(res.status).toBe(503);
      const body = (await res.json()) as ErrorBody;
      expect(body.error.code).toBe("service_unavailable");
      expect(body.error.message).toContain("ALLOW_CONSORTIUM=1");
    });

    it("answers 404 and names the command when nothing has been pulled", async () => {
      /* A store with no pull row at all. The message has to say "run the pull"
         and not "the network does not know this account": they are different
         facts and they take different actions. */
      const empty = new MemoryRepository();
      const res = await appFor(empty, true).request(
        signalPath(SUPPLIER_RFC, PAID_CLABE),
      );

      expect(res.status).toBe(404);
      const body = (await res.json()) as ErrorBody;
      expect(body.error.message).toContain("bun run consortium:pull");
    });

    it("answers the signal for a pair the network corroborates", async () => {
      await repo.replaceConsortiumSnapshot({
        rows: rows(),
        pulledAt: PULLED_AT,
        source: "synthetic",
      });

      const res = await appFor(repo, true).request(
        signalPath(SUPPLIER_RFC, PAID_CLABE),
      );

      expect(res.status).toBe(200);
      const body = consortiumSignalResponseSchema.parse(await res.json());
      expect(body.network).toEqual({
        source: "snapshot",
        tenants: 37,
        firstSeen: "2024-03-04",
        lastSeen: "2026-09-02",
        fraudReports: 0,
        otherAccounts: 0,
        pulledAt: PULLED_AT,
      });
    });

    it("answers the fraud report as the count it is", async () => {
      const res = await appFor(repo, true).request(
        signalPath(OTHER_SUPPLIER_RFC, "072580000456123788"),
      );

      const body = consortiumSignalResponseSchema.parse(await res.json());
      expect(body.network.fraudReports).toBe(2);
      expect(body.network.tenants).toBe(2);
    });

    it("answers 404 for a pair the network has never seen", async () => {
      const res = await appFor(repo, true).request(
        signalPath(SUPPLIER_RFC, FRESH_CLABE),
      );

      expect(res.status).toBe(404);
      const body = (await res.json()) as ErrorBody;
      expect(body.error.message).toContain("never seen");
      /* Not a failure, and the message says so: the network was consulted. */
      expect(body.error.message).toContain("not a failure");
    });

    it("normalises the RFC the way the lookup box does", async () => {
      const res = await appFor(repo, true).request(
        signalPath(" syn-070707-ggg ", PAID_CLABE),
      );

      expect(res.status).toBe(200);
      const body = consortiumSignalResponseSchema.parse(await res.json());
      expect(body.rfc).toBe(SUPPLIER_RFC);
    });

    it("refuses a malformed CLABE with a 400 rather than a 404", async () => {
      /* Seventeen digits is a typo, and answering 404 would tell the clerk the
         network has never seen an account that was never asked about. */
      const res = await appFor(repo, true).request(
        signalPath(SUPPLIER_RFC, "01218000554433221"),
      );

      expect(res.status).toBe(400);
      expect(((await res.json()) as ErrorBody).error.code).toBe("bad_request");
    });

    it("takes no request shape that lists a supplier's accounts", async () => {
      /* The privacy rule of docs/06 section 6.4, as a test: both halves of the
         pair are required, so this endpoint cannot be walked into a directory of
         other companies' banking relationships. */
      for (const path of [
        `/api/v1/consortium/signal?rfc=${SUPPLIER_RFC}`,
        "/api/v1/consortium/signal?clabe=012180005544332215",
        "/api/v1/consortium/signal",
      ]) {
        expect((await appFor(repo, true).request(path)).status).toBe(400);
      }
    });

    it("replaces the snapshot rather than merging into it", async () => {
      /* A pair the network has stopped corroborating must not stay behind: a
         stale corroboration is the one way this signal turns into a false
         release. */
      await repo.replaceConsortiumSnapshot({
        rows: [],
        pulledAt: "2026-09-12T04:00:00.000Z",
        source: "snowflake",
      });

      const res = await appFor(repo, true).request(
        signalPath(SUPPLIER_RFC, PAID_CLABE),
      );

      expect(res.status).toBe(404);
      expect(((await res.json()) as ErrorBody).error.message).toContain(
        "never seen",
      );
    });

    it("stores and returns the network signal as one nested object", async () => {
      /* The signal is the one compound value `Finding.evidence` carries, and both
         stores put evidence in a jsonb column. A store that flattened it, dropped
         it or stringified it would leave the screen unable to tell a network
         nobody read from one that answered, which is the distinction the whole
         `source` field exists for. */
      const network = {
        source: "snapshot" as const,
        tenants: 37,
        firstSeen: "2024-03-04",
        lastSeen: "2026-09-02",
        fraudReports: 0,
        otherAccounts: 2,
        pulledAt: PULLED_AT,
      };
      const id = `ins-network-${Math.random().toString(36).slice(2, 10)}`;
      const instruction = {
        id,
        supplierRfc: SUPPLIER_RFC,
        cfdiUuids: [],
        clabe: PAID_CLABE,
        amount: 128_900,
        source: "whatsapp" as const,
        receivedAt: "2026-09-12T03:00:00.000Z",
        synthetic: true,
      };
      const finding = {
        id: `network:${id}`,
        detector: "beneficiary_cep" as const,
        severity: "info" as const,
        state: "requiere_verificacion" as const,
        subject: { kind: "instruction" as const, id },
        amountAtRisk: 0,
        explanation: "Hallazgo sintetico para la prueba.",
        evidence: { network, networkVerdict: "corroborated" },
        createdAt: "2026-09-12T03:00:01.000Z",
      };

      await repo.saveIntake({
        instruction,
        findings: [finding],
        decision: {
          instructionId: id,
          action: "release",
          expectedLoss: 0,
          delayCostPerDay: 0,
          findings: [finding],
          decidedAt: "2026-09-12T03:00:02.000Z",
        },
      });

      const detail = await repo.instructionDetail(id);
      const stored = detail?.findings.find((row) => row.id === finding.id);

      expect(stored?.evidence.network).toEqual(network);
      expect(stored?.evidence.networkVerdict).toBe("corroborated");
    });
  });
}

suite("on MemoryRepository", async () => new MemoryRepository());

const url = process.env.TEST_DATABASE_URL;
const enabled =
  url !== undefined &&
  url.trim() !== "" &&
  url.trim() !== (process.env.DATABASE_URL ?? "").trim();

describe.skipIf(!enabled)("against Postgres", () => {
  let sql: Sql;

  beforeAll(async () => {
    sql = createSql(url);
    await migrate(sql);
  });

  afterAll(async () => {
    await sql?.end({ timeout: 5 });
  });

  /* The snapshot tables are independent of the seeded company, so this suite
     needs no `load`: it writes its own rows and reads them back, which is exactly
     what `bun run consortium:pull` does. */
  suite("on PostgresRepository", async () => new PostgresRepository(sql));
});
