/**
 * The committed offline dataset has to be the one the generator writes.
 *
 * This is the test that makes "generated" mean something. `apps/web/src/lib/
 * mock-data.ts` is committed, because the web bundle cannot import
 * `@hackmty/seed` and generating at build time would mean shipping `node:fs` and
 * `node:crypto` to a browser. A committed generated file is a file somebody can
 * edit by hand, and a hand-edited one is exactly the second dataset issue 125
 * exists to remove: one legal name changed in place and the API and the offline
 * run disagree again, silently, until a judge opens a drawer.
 *
 * So the generator is run here and its output is compared byte for byte with what
 * is on disk. Three things break this test, and all three should:
 *
 * - somebody edited the generated file instead of the generator
 * - the seed changed, and the documented figures in docs/10, 11 and 12 moved with
 *   it, which is what `packages/seed/src/sentryone/documented-figures.test.ts`
 *   says out loud
 * - a control changed its output, so the findings or the decisions on the offline
 *   run are no longer the ones the API answers with
 *
 * The fix is never to edit the expectation. It is `bun run web:mock`, then read
 * the diff and check that the demo script still quotes numbers the screen shows.
 */

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { MemoryRepository } from "../apps/api/src/repo.ts";
import {
  CFDIS,
  COMPLEMENTS,
  MOCK_METRICS,
  MOCK_RUN,
  mockSupplierDetail,
  mockSweep,
  SAT_VERSIONS,
  SUPPLIERS,
} from "../apps/web/src/lib/mock.ts";
/* The generated file itself, for the blocks `mock.ts` does not re-export. This is
   the file under test, so reading it directly is the point rather than a shortcut. */
import {
  ACTOR,
  ASSISTANT_SESSION,
  EXECUTION,
  INTAKE_EXAMPLE,
  LEVELS_BY_INSTRUCTION,
  RECEIPTS,
  VERIFICATIONS,
} from "../apps/web/src/lib/mock-data.ts";
import {
  confidenceOf,
  executionLineOf,
  sumAmounts,
  transactionStateOf,
} from "../packages/core/src/index.ts";
import {
  datasetForWeek,
  MOCK_SEED,
  MOCK_WEEK_OF,
  renderWebMock,
} from "./web-mock.ts";

const REPO_ROOT = join(import.meta.dir, "..");
const TARGET = join(REPO_ROOT, "apps", "web", "src", "lib", "mock-data.ts");

const committed = readFileSync(TARGET, "utf8");

/** The API, on the company `SEED=sentryone` serves for the demo week. */
const api = new MemoryRepository(0, () => datasetForWeek());

describe("apps/web/src/lib/mock-data.ts", () => {
  test("is what bun run web:mock writes", async () => {
    const { source } = await renderWebMock();

    if (source !== committed) {
      /* A byte-for-byte diff of five thousand generated lines is unreadable, so
         the failure names the first line that moved and what to run. */
      const wanted = source.split("\n");
      const found = committed.split("\n");
      const at = wanted.findIndex((line, index) => line !== found[index]);

      throw new Error(
        [
          "apps/web/src/lib/mock-data.ts is stale. Run: bun run web:mock",
          `first difference at line ${at + 1}`,
          `generator: ${wanted[at]?.slice(0, 200) ?? "(end of file)"}`,
          `committed: ${found[at]?.slice(0, 200) ?? "(end of file)"}`,
        ].join("\n"),
      );
    }

    expect(source).toBe(committed);
  });

  test("was written from the seed and the week the documents cite", () => {
    /* The run `docs/10-demo-script.md`, `docs/11-pitch.md` and
       `docs/12-judge-qa.md` quote. The week is pinned rather than read off the
       clock: a file that regenerated itself every Monday is a file no test can
       check, and the seed is the company the API serves. */
    expect(committed).toContain(`export const SEED = ${MOCK_SEED};`);
    expect(committed).toContain(
      `export const WEEK_OF = ${JSON.stringify(MOCK_WEEK_OF)};`,
    );
  });

  test("says it is generated, at the top, where an editor will see it", () => {
    expect(committed.startsWith("/**\n * GENERATED FILE.")).toBe(true);
  });

  test("imports nothing a browser cannot load", () => {
    /* The whole reason the data is generated ahead of time. `@hackmty/seed`
       reaches `node:fs` through `@hackmty/sat` and `@hackmty/consortium` reaches
       `node:crypto`, and `apps/web` declares neither as a dependency. */
    const imports = [...committed.matchAll(/\bfrom "(.+?)";$/gm)].map(
      (match) => match[1],
    );

    expect(imports.length).toBeGreaterThan(0);
    expect(imports.sort()).toEqual(["./contract", "@hackmty/core"]);
  });
});

/**
 * The acceptance criteria of issue 125, as assertions.
 *
 * The report was a table of four RFCs where `GET /api/v1/suppliers/:rfc` and
 * `apps/web/src/lib/mock.ts` answered two different company names, and the note
 * under it said "four for four, I did not check the remaining RFCs". These check
 * all of them, both ways, by asking the API's own repository and the browser's own
 * fallback the same question and comparing the answers.
 *
 * The API here is `MemoryRepository` over `datasetForWeek()`, which is what
 * `SEED=sentryone` boots on for the demo week. Over HTTP the same payloads come
 * out of the same repository through the route handlers, so this proves the data
 * and not the transport; the transport is `bun run demo`.
 */
describe("the API and the offline fallback", () => {
  test("answer the same legal name for every RFC of the run", async () => {
    const rfcs = [
      ...new Set(MOCK_RUN.items.map((item) => item.instruction.supplierRfc)),
    ];

    expect(rfcs.length).toBeGreaterThan(0);

    for (const rfc of rfcs) {
      const fromApi = await api.supplierDetail(rfc);
      const offline = mockSupplierDetail(rfc);

      expect(fromApi?.supplier.legalName).toBeDefined();
      expect(offline?.supplier.legalName).toBe(
        fromApi?.supplier.legalName ?? "",
      );
    }
  });

  test("answer the same legal name for every supplier the company holds", async () => {
    /* Not only the ones in the run: the drawer is reachable from the CEP screen
       and from a link, and the report said it had not checked the rest. */
    for (const supplier of SUPPLIERS) {
      const fromApi = await api.findSupplier(supplier.rfc);

      expect(fromApi?.legalName).toBe(supplier.legalName);
      expect(fromApi?.knownAccounts).toEqual(supplier.knownAccounts);
    }
  });

  test("answer the same amount and the same CLABE on every line", async () => {
    const run = await api.currentRun();

    expect(run.items.length).toBe(MOCK_RUN.items.length);
    expect(run.id).toBe(MOCK_RUN.id);
    expect(run.weekOf).toBe(MOCK_RUN.weekOf);

    const offline = new Map(
      MOCK_RUN.items.map((item) => [item.instruction.id, item]),
    );

    for (const line of run.items) {
      const here = offline.get(line.instruction.id);

      expect(here).toBeDefined();
      expect(here?.instruction.amount).toBe(line.instruction.amount);
      expect(here?.instruction.clabe).toBe(line.instruction.clabe);
      expect(here?.supplier.legalName).toBe(line.supplier.legalName);
    }
  });

  test("propose the same action and the same findings on every line", async () => {
    const run = await api.currentRun();
    const offline = new Map(
      MOCK_RUN.items.map((item) => [item.instruction.id, item]),
    );

    for (const line of run.items) {
      const here = offline.get(line.instruction.id);

      expect(here?.decision.action).toBe(line.decision.action);
      expect(here?.findings.map((finding) => finding.id)).toEqual(
        line.findings.map((finding) => finding.id),
      );
    }
  });

  test("report the same totals, counts and pesos both", async () => {
    const run = await api.currentRun();

    expect(MOCK_RUN.totals).toEqual(run.totals);
  });

  test("carry the same invoice, row for row, for every invoice offline holds", async () => {
    /* The first of the two narrowings, asserted so it is a decision on the record
       rather than the absence of a test. The offline file carries 156 of the 4103
       invoices, because 8.8 KB gzipped reaches a phone in a corridor and 208 KB
       of an eight-month history a judge never opens does not. What it may never do
       is carry a DIFFERENT invoice: every row here has to be the API's row. */
    const fromApi = await api.allCfdis();
    const byUuid = new Map(fromApi.map((row) => [row.uuid, row]));

    expect(CFDIS.length).toBeLessThan(fromApi.length);
    expect(CFDIS.length).toBeGreaterThan(0);

    for (const cfdi of CFDIS) {
      expect(byUuid.get(cfdi.uuid)).toEqual(cfdi);
    }
  });

  test("carry every invoice a screen can open", async () => {
    /* What the narrowing is allowed to drop: an invoice no screen reaches. An
       invoice the run says it is paying, one the retroactive sweep prices or one a
       finding is about is reachable from the run table, the SAT screen or the
       alert rail, so a missing row there is a hole in a screen and not a saving. */
    const here = new Set(CFDIS.map((cfdi) => cfdi.uuid));
    const run = await api.currentRun();

    for (const item of run.items) {
      for (const uuid of item.instruction.cfdiUuids) {
        expect(here.has(uuid)).toBe(true);
      }
    }

    for (const entry of mockSweep().newlyListed) {
      for (const cfdi of entry.paidCfdis) {
        expect(here.has(cfdi.uuid)).toBe(true);
      }
    }

    for (const item of run.items) {
      for (const finding of item.findings) {
        if (finding.subject.kind === "cfdi") {
          expect(here.has(finding.subject.id)).toBe(true);
        }
      }
    }
  });

  test("answer the same invoices for a supplier, as far as offline goes", async () => {
    /* Per supplier, the drawer's own question. The offline answer is a subset of
       the API's and never a different row, and for every supplier the run names it
       is not empty: that is the drawer a judge actually opens. */
    const runRfcs = new Set(
      MOCK_RUN.items.map((item) => item.instruction.supplierRfc),
    );

    for (const supplier of SUPPLIERS) {
      const fromApi = await api.supplierDetail(supplier.rfc);
      const offline = mockSupplierDetail(supplier.rfc)?.cfdis ?? [];
      const byUuid = new Map(
        (fromApi?.cfdis ?? []).map((row) => [row.uuid, row]),
      );

      expect(offline.length).toBeLessThanOrEqual(fromApi?.cfdis.length ?? 0);

      for (const cfdi of offline) {
        expect(cfdi.issuerRfc).toBe(supplier.rfc);
        expect(byUuid.get(cfdi.uuid)).toEqual(cfdi);
      }

      if (runRfcs.has(supplier.rfc)) {
        expect(offline.length).toBeGreaterThan(0);
      }
    }
  });

  test("differ on the payment complements, the same way and as deliberately", async () => {
    /* The second narrowing, and the stronger case of the two: every complement the
       offline run carries is one the API carries, and there are fewer of them
       because `SupplierDetail.complements` is read by no component in `apps/web`,
       so the whole set is 221 KB gzipped a browser would download to render
       nothing. */
    const fromApi = await api.allComplements();
    const byUuid = new Map(fromApi.map((row) => [row.uuid, row]));

    expect(COMPLEMENTS.length).toBeLessThan(fromApi.length);
    expect(COMPLEMENTS.length).toBeGreaterThan(0);

    for (const complement of COMPLEMENTS) {
      expect(byUuid.get(complement.uuid)).toEqual(complement);
    }
  });

  test("score the blind holdout to the same numbers", async () => {
    expect(MOCK_METRICS).toEqual(await api.metrics());
  });

  test("name the same list versions", async () => {
    expect(SAT_VERSIONS).toEqual(await api.satVersions());
  });
});

/**
 * The four blocks issues #195 and #196 added to the offline run.
 *
 * They are asserted against the same sources the generator derived them from, and
 * never against a copy of the expectation: the levels against the two pure functions
 * in `@hackmty/core` over the API's own run, the execution against the decisions and
 * the verifications, the receipts against the lines that left, and the conversation
 * against the vocabulary ADR-0009 makes binding.
 */
describe("the level, the state, the execution and the conversation", () => {
  test("carry the documented persona as the actor, with her role", async () => {
    /* `docs/02-persona.md` names her. A second persona invented here would be a
       name on a ledger event that no document backs. */
    expect(ACTOR).toEqual({ name: "Lupita Elizondo", role: "clerk" });
    expect(EXECUTION.startedBy).toEqual(ACTOR);
    expect(ASSISTANT_SESSION.actor).toEqual(ACTOR);
    for (const receipt of RECEIPTS) {
      expect(receipt.executedBy).toEqual(ACTOR);
    }
  });

  test("read the same level and the same state the API would derive", async () => {
    const run = await api.currentRun();

    expect(Object.keys(LEVELS_BY_INSTRUCTION)).toHaveLength(run.items.length);

    for (const item of run.items) {
      const here = LEVELS_BY_INSTRUCTION[item.instruction.id];

      expect(here?.confidence).toBe(confidenceOf(item.findings, item.decision));
      expect(here?.state).toBe(
        transactionStateOf(
          item.decision,
          VERIFICATIONS.find(
            (row) => row.instructionId === item.instruction.id,
          ),
          executionLineOf(EXECUTION, item.instruction.id),
        ),
      );
    }
  });

  test("never answer a level outside the three ADR-0009 allows", () => {
    for (const level of Object.values(LEVELS_BY_INSTRUCTION)) {
      expect(["confiable", "precaucion", "alerta"]).toContain(level.confidence);
      expect([
        "rojo",
        "cancelado",
        "enviado",
        "pendiente",
        "liberado",
      ]).toContain(level.state);
    }
  });

  test("execute only the lines nothing stopped", async () => {
    /* The rule `POST /api/v1/run/:id/execute` enforces. An offline execution that
       carried a held payment would be a screen the API cannot produce. */
    const run = await api.currentRun();
    const actionOf = new Map(
      run.items.map((item) => [item.instruction.id, item.decision?.action]),
    );

    expect(EXECUTION.runId).toBe(run.id);
    expect(EXECUTION.lines.length).toBeGreaterThan(0);

    for (const line of EXECUTION.lines) {
      expect(actionOf.get(line.instructionId)).toBe("release");
    }
    const executed = new Set(EXECUTION.lines.map((line) => line.instructionId));
    for (const item of run.items) {
      if (item.decision?.action !== "release") {
        expect(executed.has(item.instruction.id)).toBe(false);
      }
    }
  });

  test("add up: the five state buckets decompose the run exactly", () => {
    const { totals, lines } = EXECUTION;

    expect(totals.lines).toBe(lines.length);
    expect(
      sumAmounts([
        totals.queuedAmount,
        totals.sentAmount,
        totals.settledAmount,
        totals.failedAmount,
        totals.cancelledAmount,
      ]),
    ).toBe(totals.amount);
    expect(
      totals.queued +
        totals.sent +
        totals.settled +
        totals.failed +
        totals.cancelled,
    ).toBe(totals.lines);
    expect(totals.amount).toBe(sumAmounts(lines.map((line) => line.amount)));
  });

  test("pay the amount the instruction says, to the account it names", async () => {
    /* ADR-0008: a rail sends what SentryOne already holds and nothing else. The
       amount and the last four digits are the two halves of that claim. */
    const run = await api.currentRun();
    const itemOf = new Map(
      run.items.map((item) => [item.instruction.id, item]),
    );

    for (const line of EXECUTION.lines) {
      expect(line.amount).toBe(
        itemOf.get(line.instructionId)?.instruction.amount,
      );
    }
    for (const receipt of RECEIPTS) {
      const item = itemOf.get(receipt.instructionId);

      expect(receipt.amount).toBe(item?.instruction.amount);
      expect(receipt.beneficiaryAccountLast4).toBe(
        item?.instruction.clabe.slice(-4),
      );
      expect(receipt.beneficiaryName).toBe(item?.supplier.legalName);
      expect(receipt.cfdiUuids).toEqual(item?.instruction.cfdiUuids ?? []);
    }
  });

  test("hold one receipt per line that left, and none for a line that did not", () => {
    const left = EXECUTION.lines.filter(
      (line) => line.state === "sent" || line.state === "settled",
    );
    const byId = new Map(RECEIPTS.map((receipt) => [receipt.id, receipt]));

    expect(RECEIPTS).toHaveLength(left.length);

    for (const line of left) {
      expect(line.receiptId).toBeDefined();
      expect(byId.get(line.receiptId ?? "")?.claveRastreo).toBe(
        line.claveRastreo,
      );
    }
    for (const line of EXECUTION.lines) {
      if (line.state !== "sent" && line.state !== "settled") {
        expect(line.receiptId).toBeUndefined();
        // A line that did not leave says why, in a sentence a clerk can act on.
        expect(line.reason?.length ?? 0).toBeGreaterThan(0);
      }
    }
  });

  test("claim no seal nobody checked, and never eighteen digits", () => {
    /* The mirror publishes no CEP, so there is nothing to verify and the receipt
       says so. `valid` here would be the one lie that costs the most. */
    for (const receipt of RECEIPTS) {
      expect(receipt.sealState).toBe("not_checked");
      expect(receipt.cepAt).toBeUndefined();
      expect(receipt.beneficiaryAccountLast4).toHaveLength(4);
      expect(receipt.synthetic).toBe(true);
    }
  });

  test("hold three turns: a question, a read and a proposal", () => {
    const [question, answer, offer] = ASSISTANT_SESSION.messages;

    expect(ASSISTANT_SESSION.messages).toHaveLength(3);
    expect(question?.author).toBe("clerk");
    expect(question?.actor).toEqual(ACTOR);
    expect(answer?.author).toBe("assistant");
    expect(answer?.toolCalls?.[0]?.readOnly).toBe(true);
    expect(
      Object.keys(answer?.toolCalls?.[0]?.result ?? {}).length,
    ).toBeGreaterThan(0);
    expect(offer?.proposal?.kind).toBe("verify_account");
    expect(offer?.proposal?.requiresRole).toBe("clerk");
  });

  test("quote the engine rather than inventing a reason", async () => {
    /* ADR-0007: the assistant reads and proposes. The answer is the finding's own
       explanation plus the level, so nothing in the panel asserts anything the
       deterministic side did not. */
    const instructionId = ASSISTANT_SESSION.messages[0]?.instructionId ?? "";
    const detail = await api.instructionDetail(instructionId);
    const answer = ASSISTANT_SESSION.messages[1];
    const level = LEVELS_BY_INSTRUCTION[instructionId];

    expect(detail).toBeDefined();
    expect(answer?.text).toContain(INTAKE_EXAMPLE.findings[0]?.explanation);
    expect(answer?.text).toContain(level?.confidence ?? "");
    expect(answer?.toolCalls?.[0]?.result).toEqual(
      INTAKE_EXAMPLE.decision.findings[0]?.evidence ?? {},
    );
  });

  test("say no probability and never the word ADR-0009 forbids", () => {
    const sentences = ASSISTANT_SESSION.messages.flatMap((message) => [
      message.text,
      message.proposal?.summary ?? "",
    ]);

    for (const sentence of sentences) {
      expect(sentence.toLowerCase()).not.toContain("seguro");
      expect(sentence.toLowerCase()).not.toContain("segura");
      expect(sentence).not.toMatch(/\d\s?%/);
      expect(sentence.toLowerCase()).not.toContain("probabilidad");
    }
  });
});
