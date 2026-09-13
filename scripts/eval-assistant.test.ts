/**
 * The golden questions, checked without a model.
 *
 * `bun run eval:assistant` is what measures the model, and it is not a gate: it needs
 * a key and it costs pesos. This file is the gate, and it asserts the two properties
 * that make the eval worth running at all. First, that the twenty questions are
 * twenty, distinct, and ask for reads and actions this product actually has, so a
 * typo in a tool name is caught by `bun test` rather than by a judge watching every
 * case report MISS. Second, that the recorded plan of every case drives a real turn to
 * completion against the seeded API, which exercises the reads, the mask, the
 * proposals and the ledger rows with no network.
 *
 * One seeded company for the whole file, built once. Generating it and running the six
 * controls over its ninety-two instructions costs seconds, and twenty of those is a
 * test file nobody waits for.
 */

import { describe, expect, it } from "bun:test";
import { createApp } from "../apps/api/src/app.ts";
import type { AssistantModel } from "../apps/api/src/assistant/model.ts";
import { createDeps } from "../apps/api/src/deps.ts";
import { UNAVAILABLE_EXTRACTOR } from "../apps/api/src/extraction.ts";
import { MemoryRepository } from "../apps/api/src/repo.ts";
import {
  assistantToolSchema,
  type PaymentRun,
  proposalKindSchema,
} from "../apps/api/src/schemas.ts";
import { sentryoneDataset } from "../apps/api/src/sentryone.ts";
import {
  type GoldenCase,
  goldenCases,
  heroLinesFrom,
  plannedModel,
} from "./eval-assistant.ts";

const ACTOR_HEADER = "role=clerk; name=Lupita Elizondo";

/**
 * One app, one seeded company, and a model that swaps per case.
 *
 * The swap is what lets twenty turns share one expensive dataset: `deps.model` is read
 * on every request, so pointing it at the plan of the case about to run is enough. The
 * rate limit is twenty turns a minute and there are exactly twenty cases, which is
 * deliberate on both sides.
 */
let current: AssistantModel | undefined;
const switching: AssistantModel = {
  available: true,
  model: "planned",
  generate: (request) => {
    if (current === undefined) {
      throw new Error("no plan is loaded for this turn");
    }
    return current.generate(request);
  },
};

const deps = createDeps({
  repo: new MemoryRepository(0, sentryoneDataset),
  model: switching,
  extractor: UNAVAILABLE_EXTRACTOR,
  allowSeed: false,
});
const app = createApp(deps);

const run = (await (
  await app.request("/api/v1/run/current")
).json()) as PaymentRun;
const hero = heroLinesFrom(run);
const cases = goldenCases(hero);

describe("the golden questions", () => {
  it("are twenty, with distinct ids", () => {
    expect(cases.length).toBe(20);
    expect(new Set(cases.map((golden) => golden.id)).size).toBe(20);
  });

  it("only ask for reads and actions this product has", () => {
    for (const golden of cases) {
      if (golden.expect !== "none") {
        expect(assistantToolSchema.parse(golden.expect)).toBe(golden.expect);
      }
      for (const also of golden.alsoAccept ?? []) {
        expect(assistantToolSchema.parse(also)).toBe(also);
      }
      if (golden.expectProposal !== undefined) {
        expect(proposalKindSchema.parse(golden.expectProposal)).toBe(
          golden.expectProposal,
        );
      }
      /* The recorded plan has to name the same tools, or the offline mode would be
         rehearsing a turn the live mode cannot take. */
      for (const call of golden.plan) {
        const known =
          assistantToolSchema.safeParse(call.name).success ||
          call.name.startsWith("propose_");
        expect(known).toBe(true);
      }
    }
  });

  it("name a line the seeded run actually holds", () => {
    const ids = new Set(run.items.map((item) => item.instruction.id));
    const rfcs = new Set(run.items.map((item) => item.instruction.supplierRfc));

    for (const golden of cases) {
      expect(golden.question.length).toBeGreaterThan(10);
      /* A golden question about a line nobody holds is a question whose answer is a
         404, which measures nothing about the model. */
      for (const token of golden.question.split(/\s+/)) {
        if (token.startsWith("ins-")) {
          expect(ids.has(token)).toBe(true);
        }
        if (/^SYN\d{6}[A-Z0-9]{3}$/.test(token)) {
          expect(rfcs.has(token)).toBe(true);
        }
      }
    }
  });

  /** One turn, with the case's recorded plan loaded, and what it left behind. */
  async function take(golden: GoldenCase): Promise<void> {
    current = plannedModel(golden);
    const since = new Date(Date.now() - 1).toISOString();
    const response = await app.request("/api/v1/assistant/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-actor": ACTOR_HEADER },
      body: JSON.stringify({ text: golden.question }),
    });

    expect(response.status).toBe(200);
    const body = await response.text();
    expect(body).toContain("event: done");
    if (golden.expect !== "none") {
      expect(body).toContain(`"tool":"${golden.expect}"`);
    }
    if (golden.expectProposal !== undefined) {
      expect(body).toContain(`"kind":"${golden.expectProposal}"`);
    }

    /* Two rows on the ledger per turn, and the cost on the answer. A case that
       streamed an answer and wrote nothing would be a panel with no audit trail. */
    const events = await deps.repo.ledger({ since, limit: 2000 });
    const turns = events.filter((event) => event.type === "assistant_message");
    expect(turns.length).toBe(2);
    const answer = turns[1];
    if (answer?.type !== "assistant_message") {
      throw new Error("expected the second row to be the answer");
    }
    expect(answer.usage?.costMxn).toBeGreaterThan(0);
  }

  /* One test per case, so a regression names the question that broke. */
  for (const golden of cases) {
    it(`drive the whole turn offline: ${golden.id}`, async () => {
      await take(golden);
    });
  }
});
