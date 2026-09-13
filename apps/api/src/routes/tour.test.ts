/**
 * The guided tour, driven end to end with no key, no network and no telephone.
 *
 * Every case here passes a stub `http`, and the configuration and the flag are
 * injected too, so a teammate whose `.env` holds real ElevenLabs keys and
 * `ALLOW_TOUR_CALLS=1` gets exactly what CI gets. A test that reached the
 * provider would ring somebody's telephone, which is the one side effect a suite
 * may never have.
 *
 * The poll is driven by an injected `sleep` that returns immediately, so the
 * whole state machine, the two ledger events and the revert ten minutes later
 * all happen in microseconds and are asserted rather than waited for.
 */

import { describe, expect, it } from "bun:test";
import type { Actor, Decision, LedgerEvent } from "@hackmty/core";
import type { HttpLike } from "@hackmty/voice";
import { OWNER_CONVERSATION_PAYLOAD, OWNER_QUESTION } from "@hackmty/voice";
import { MemoryRepository } from "../repo";
import {
  type TourCallStatus,
  tourCallStartedSchema,
  tourCallStatusSchema,
  tourResponseSchema,
} from "../schemas";
import {
  actorHeader,
  createTestApp,
  TEST_CLERK,
  TEST_NOW,
  TEST_OWNER,
  testTourOptions,
  writeHeaders,
} from "../test-app";
import {
  hashPhone,
  readTourFacts,
  TOUR_HOLD_REASON,
  TOUR_RELEASE_REASON,
  TOUR_REVERT_REASON,
  type TourDeps,
  type TourOptions,
} from "./tour";

/** The hero of the hand-written fixture run: the largest line the run stopped. */
const HERO = "ins-2026w37-01";
const HERO_SUPPLIER = "SYN010101AAA";

const CONVERSATION = OWNER_CONVERSATION_PAYLOAD.conversation_id;

const CONFIG = {
  apiKey: "test-key",
  agentId: "agent-owner-1",
  phoneNumberId: "phnum-1",
};

/** Synthetic and in the block Mexican carriers do not assign. */
const PHONE = "+528112345678";

/** The visitor, as the tour screen sends them. */
const VISITOR: Actor = { role: "owner", name: "Visitante" };

const AGENT_TURNS = OWNER_CONVERSATION_PAYLOAD.transcript.filter(
  (turn) => turn.role === "agent",
);

function conversation(
  status: string,
  transcript: readonly unknown[] = [],
): Record<string, unknown> {
  return {
    ...OWNER_CONVERSATION_PAYLOAD,
    status,
    transcript,
  };
}

const IN_PROGRESS = conversation("in-progress", AGENT_TURNS);
const DONE_HOLD = conversation("done", OWNER_CONVERSATION_PAYLOAD.transcript);
const DONE_RELEASE = conversation("done", [
  ...AGENT_TURNS,
  { role: "user", message: "Libérala, yo la autorizo.", time_in_call_secs: 23 },
]);
const DONE_SILENT = conversation("done", AGENT_TURNS);

interface Seen {
  url: string;
  body: unknown;
}

/**
 * A provider that answers the outbound call and then the conversations in order,
 * repeating the last one forever.
 *
 * Repeating rather than running out is what lets a test hand it
 * `[IN_PROGRESS, DONE_HOLD]` and know the poll sees a call that is still running
 * before it sees one that finished, whatever the deadline allows.
 */
function provider(answers: readonly Record<string, unknown>[]) {
  const seen: Seen[] = [];
  let asked = 0;

  const http: HttpLike = async (url, init) => {
    seen.push({
      url,
      body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined,
    });

    if (url.includes("/outbound-call")) {
      return new Response(
        JSON.stringify({
          success: true,
          message: "call started",
          conversation_id: CONVERSATION,
          callSid: "CA-test",
        }),
        { status: 200 },
      );
    }

    const answer = answers[Math.min(asked, answers.length - 1)] ?? {};
    asked += 1;

    return new Response(JSON.stringify(answer), { status: 200 });
  };

  return { http, seen, asks: () => asked };
}

/** A configured, willing instance whose poll runs in microseconds. */
function tourDeps(
  http: HttpLike,
  options: Partial<TourOptions> = {},
): { deps: TourDeps; settled: () => Promise<void> } {
  const pending: Promise<void>[] = [];

  return {
    deps: {
      readConfig: () => CONFIG,
      allowCalls: () => true,
      http,
      options: testTourOptions({
        pollIntervalMs: 1,
        pollDeadlineMs: 10,
        ...options,
      }),
      watch: (promise) => pending.push(promise),
    },
    settled: async () => {
      await Promise.all(pending);
    },
  };
}

function call(body: unknown, actor = VISITOR): RequestInit {
  return {
    method: "POST",
    headers: writeHeaders(actor),
    body: JSON.stringify(body),
  };
}

type ErrorBody = {
  error: { code: string; message: string };
  script?: { firstMessage: string; question: string; spoken: string[] };
};

function decisionsOf(events: readonly LedgerEvent[]): Decision[] {
  return events
    .filter((event) => event.type === "decision_made")
    .map((event) => (event as { decision: Decision }).decision);
}

/* -------------------------------------------------------------------------- */
/* GET /api/v1/tour                                                            */
/* -------------------------------------------------------------------------- */

describe("GET /api/v1/tour", () => {
  it("derives the line the tour is about from the run", async () => {
    const { app } = createTestApp();

    const res = await app.request("/api/v1/tour");

    expect(res.status).toBe(200);
    const body = tourResponseSchema.parse(await res.json());

    /* The largest payment the run stopped that CLABE forensics stands against,
       and it is derived: nothing in the route names this folio. */
    expect(body.hero.instructionId).toBe(HERO);
    expect(body.hero.supplierRfc).toBe(HERO_SUPPLIER);
    expect(body.hero.amount).toBe(184_300);
    expect(body.hero.accountLast4).toBe("6812");
    /* Four digits and never the account, on any field of this payload. */
    expect(JSON.stringify(body)).not.toContain("058580000123456812");
  });

  it("names the listed supplier and the line only a CEP can speak about", async () => {
    const { app } = createTestApp();
    const body = tourResponseSchema.parse(
      await (await app.request("/api/v1/tour")).json(),
    );

    /* The supplier this run pays that the SAT list names, off the engine's own
       `sat_69b` finding rather than a second lookup. */
    expect(body.listedSupplierRfc).toBe("SYN020202BBB");
    /* And the largest line no control stops at all, which is why the Banxico
       receipt is the only thing that can say anything about it. */
    expect(body.cepInstructionId).toBe("ins-2026w37-10");
  });

  it("says the call is off until the flag and the four variables are both there", async () => {
    const off = createTestApp();
    expect(
      tourResponseSchema.parse(
        await (await off.app.request("/api/v1/tour")).json(),
      ).callsEnabled,
    ).toBe(false);

    const willingOnly = createTestApp({}, undefined, {
      allowCalls: () => true,
      readConfig: () => undefined,
    });
    expect(
      tourResponseSchema.parse(
        await (await willingOnly.app.request("/api/v1/tour")).json(),
      ).callsEnabled,
    ).toBe(false);

    const ableOnly = createTestApp({}, undefined, {
      allowCalls: () => false,
      readConfig: () => CONFIG,
    });
    expect(
      tourResponseSchema.parse(
        await (await ableOnly.app.request("/api/v1/tour")).json(),
      ).callsEnabled,
    ).toBe(false);

    const both = createTestApp({}, undefined, {
      allowCalls: () => true,
      readConfig: () => CONFIG,
    });
    expect(
      tourResponseSchema.parse(
        await (await both.app.request("/api/v1/tour")).json(),
      ).callsEnabled,
    ).toBe(true);
  });

  it("reports the revert window the instance was configured with", async () => {
    const { app } = createTestApp({}, undefined, {
      options: testTourOptions({ revertAfterMs: 600_000 }),
    });
    const body = tourResponseSchema.parse(
      await (await app.request("/api/v1/tour")).json(),
    );

    expect(body.revertAfterMs).toBe(600_000);
  });

  it("is side effect free: no call, nothing on the ledger", async () => {
    const { http, seen } = provider([IN_PROGRESS]);
    const { deps: tour } = tourDeps(http);
    const { app, deps } = createTestApp({}, undefined, tour);
    const events: LedgerEvent[] = [];
    deps.events.subscribe((event) => events.push(event));

    await app.request("/api/v1/tour");

    expect(seen).toHaveLength(0);
    expect(events).toHaveLength(0);
  });
});

/* -------------------------------------------------------------------------- */
/* The refusals                                                                */
/* -------------------------------------------------------------------------- */

describe("POST /api/v1/tour/call, what it refuses", () => {
  it("refuses what is not an E.164 number, and nothing else about the number", async () => {
    const { http } = provider([IN_PROGRESS]);
    const { deps: tour } = tourDeps(http);
    const { app } = createTestApp({}, undefined, tour);

    /* No plus, too short to be a telephone number, and a country code that
       starts with a zero. The shape is the whole rule now. */
    for (const phone of ["8112345678", "+5281123", "+0528112345678"]) {
      const res = await app.request(
        "/api/v1/tour/call",
        call({ phone, consent: true }),
      );

      expect([phone, res.status]).toEqual([phone, 400]);
    }
  });

  it("dials any country, because the visitor's telephone is theirs", async () => {
    /* The rule this replaced was Mexican mobiles only, behind a flag nobody sets
       at a stand, so a judge whose telephone is not on a Mexican network typed
       their own number and was refused by their own country code. */
    const { deps: tour } = tourDeps(provider([IN_PROGRESS, DONE_SILENT]).http);
    const { app } = createTestApp({}, undefined, tour);

    for (const phone of ["+14155550123", "+5218112345678", "+34600123456"]) {
      const res = await app.request(
        "/api/v1/tour/call",
        call({ phone, consent: true }),
      );

      expect([phone, res.status]).toEqual([phone, 202]);
    }
  });

  it("refuses a call nobody consented to", async () => {
    const { http } = provider([IN_PROGRESS]);
    const { deps: tour } = tourDeps(http);
    const { app } = createTestApp({}, undefined, tour);

    for (const body of [
      { phone: PHONE, consent: false },
      { phone: PHONE },
      { phone: PHONE, consent: "true" },
    ]) {
      const res = await app.request("/api/v1/tour/call", call(body));

      expect(res.status).toBe(400);
    }
  });

  /**
   * Half of what this call asks is whether to release a payment something stands
   * against, and only an owner may answer that. `400` and not `403`, because
   * `403` on this endpoint means the instance rings no telephones at all and a
   * screen has to be able to tell the two apart.
   */
  it("refuses a clerk, because a clerk cannot release what this asks about", async () => {
    const { http, seen } = provider([IN_PROGRESS]);
    const { deps: tour } = tourDeps(http);
    const { app } = createTestApp({}, undefined, tour);

    const res = await app.request(
      "/api/v1/tour/call",
      call({ phone: PHONE, consent: true }, TEST_CLERK),
    );

    expect(res.status).toBe(400);
    expect(seen).toHaveLength(0);
  });

  it("refuses a write with no name against it at all", async () => {
    const { http } = provider([IN_PROGRESS]);
    const { deps: tour } = tourDeps(http);
    const { app } = createTestApp({}, undefined, tour);

    const res = await app.request("/api/v1/tour/call", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ phone: PHONE, consent: true }),
    });

    expect(res.status).toBe(400);
  });

  it("answers 403 when this instance does not place calls", async () => {
    const { http, seen } = provider([IN_PROGRESS]);
    const { deps: tour } = tourDeps(http);
    const { app } = createTestApp({}, undefined, {
      ...tour,
      allowCalls: () => false,
    });

    const res = await app.request(
      "/api/v1/tour/call",
      call({ phone: PHONE, consent: true }),
    );

    expect(res.status).toBe(403);
    const body = (await res.json()) as ErrorBody;
    expect(body.error.code).toBe("forbidden");
    expect(body.error.message).toContain("ALLOW_TOUR_CALLS");
    expect(seen).toHaveLength(0);
  });

  /**
   * The same degradation as `/verify-call`: an instance with no telephony still
   * hands over the words, so the tour runs with somebody reading them out.
   */
  it("answers 422 with the script when the voice is not configured", async () => {
    const { http, seen } = provider([IN_PROGRESS]);
    const { deps: tour } = tourDeps(http);
    const { app, deps } = createTestApp({}, undefined, {
      ...tour,
      readConfig: () => undefined,
    });
    const events: LedgerEvent[] = [];
    deps.events.subscribe((event) => events.push(event));

    const res = await app.request(
      "/api/v1/tour/call",
      call({ phone: PHONE, consent: true }),
    );

    expect(res.status).toBe(422);
    const body = (await res.json()) as ErrorBody;
    expect(body.error.code).toBe("unprocessable");
    expect(body.error.message).toContain("ELEVENLABS_OWNER_AGENT_ID");
    expect(body.script?.question).toBe(OWNER_QUESTION);
    expect(body.script?.firstMessage).toContain("línea automática");
    /* No telephone rang and nothing was recorded. */
    expect(seen).toHaveLength(0);
    expect(events).toHaveLength(0);
  });

  it("answers 422 with the script when the provider refuses the call", async () => {
    const http: HttpLike = async () =>
      new Response(JSON.stringify({ detail: "no" }), { status: 500 });
    const { deps: tour } = tourDeps(http);
    const { app } = createTestApp({}, undefined, tour);

    const res = await app.request(
      "/api/v1/tour/call",
      call({ phone: PHONE, consent: true }),
    );

    expect(res.status).toBe(422);
    const body = (await res.json()) as ErrorBody;
    expect(body.script?.question).toBe(OWNER_QUESTION);
  });

  it("answers 404 on a store with no stopped line to be about", async () => {
    const empty = new MemoryRepository();
    const run = await empty.currentRun();
    /* Every line released, which is a store where the tour has nothing to show
       rather than a store that is broken. */
    for (const item of run.items) {
      await empty.recordDecision(
        item.instruction.id,
        "release",
        TEST_OWNER,
        TEST_NOW,
        "nada que revisar",
      );
    }
    const { app } = createTestApp({ repo: empty });

    expect((await app.request("/api/v1/tour")).status).toBe(404);
  });
});

/* -------------------------------------------------------------------------- */
/* Calling the same number again                                               */
/* -------------------------------------------------------------------------- */

describe("the same number, again", () => {
  /**
   * There is no rate limit on this route and this is the test that says so.
   *
   * It used to ring one number once per ten minutes and stop at twenty calls an
   * hour from the instance, both `429` with `Retry-After`. Both were written for
   * a stand this product never had: the same four people rehearse this call all
   * day, a judge who did not hear their telephone asks for it again, and the
   * second attempt was answered with a sentence about a call the visitor had
   * already had. What protects a stranger's telephone is the box they tick, the
   * owner role and `ALLOW_TOUR_CALLS`, and none of those is a counter.
   */
  it("rings the same number as many times as somebody asks", async () => {
    const { http } = provider([IN_PROGRESS, DONE_SILENT]);
    const { deps: tour } = tourDeps(http);
    const { app } = createTestApp({}, undefined, tour);

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const res = await app.request(
        "/api/v1/tour/call",
        call({ phone: PHONE, consent: true }),
      );

      expect([attempt, res.status]).toEqual([attempt, 202]);
    }
  });

  it("a call the provider refused can be tried again immediately", async () => {
    /* The booth case: one provider hiccup must not cost a visitor their turn.
       It answered `429` on the retry once, about a telephone that never rang. */
    let placed = 0;
    const http: HttpLike = async (url) => {
      if (url.includes("/outbound-call")) {
        placed += 1;

        return placed === 1
          ? new Response(JSON.stringify({ detail: "no" }), { status: 500 })
          : new Response(
              JSON.stringify({
                success: true,
                message: "call started",
                conversation_id: CONVERSATION,
                callSid: "CA-test",
              }),
              { status: 200 },
            );
      }

      return new Response(JSON.stringify(DONE_SILENT), { status: 200 });
    };
    const { deps: tour, settled } = tourDeps(http);
    const { app } = createTestApp({}, undefined, tour);

    const refused = await app.request(
      "/api/v1/tour/call",
      call({ phone: PHONE, consent: true }),
    );
    expect(refused.status).toBe(422);

    const again = await app.request(
      "/api/v1/tour/call",
      call({ phone: PHONE, consent: true }),
    );

    expect(again.status).toBe(202);
    expect(placed).toBe(2);

    await settled();
  });
});

/* -------------------------------------------------------------------------- */
/* The whole call                                                              */
/* -------------------------------------------------------------------------- */

describe("POST /api/v1/tour/call, the call itself", () => {
  it("answers 202 with the words and nothing on the ledger yet", async () => {
    const { http, seen } = provider([IN_PROGRESS]);
    const { deps: tour } = tourDeps(http, { pollDeadlineMs: 0 });
    const { app, deps } = createTestApp({}, undefined, tour);
    const events: LedgerEvent[] = [];
    deps.events.subscribe((event) => events.push(event));

    const res = await app.request(
      "/api/v1/tour/call",
      call({ phone: PHONE, consent: true }),
    );

    expect(res.status).toBe(202);
    const body = tourCallStartedSchema.parse(await res.json());

    expect(body.conversationId).toBe(CONVERSATION);
    expect(body.instructionId).toBe(HERO);
    expect(body.script.question).toBe(OWNER_QUESTION);
    /* A call that started has proved nothing, so the ledger says nothing. */
    expect(events).toHaveLength(0);

    /* The words of this one call travel as dynamic variables, so the agent the
       provider stores carries no supplier, no amount and no digits. */
    const started = seen.find((row) => row.url.includes("/outbound-call"));
    const sent = started?.body as {
      to_number: string;
      agent_id: string;
      conversation_initiation_client_data?: {
        dynamic_variables: Record<string, string>;
      };
    };
    expect(sent.agent_id).toBe(CONFIG.agentId);
    expect(sent.to_number).toBe(PHONE);
    const variables =
      sent.conversation_initiation_client_data?.dynamic_variables;
    expect(variables?.account_last4).toBe("6 8 1 2");
    expect(variables?.owner).toBe("Visitante");
    expect(JSON.stringify(sent)).not.toContain("058580000123456812");
  });

  /**
   * The call the whole control hopes for: the owner keeps the payment stopped.
   * Two events, in this order, and the decision goes through the same
   * `recordDecision` that `POST /instructions/:id/decide` calls.
   */
  it("records the call and then the hold the owner asked for", async () => {
    const { http, asks } = provider([IN_PROGRESS, DONE_HOLD]);
    const { deps: tour, settled } = tourDeps(http);
    const { app, deps } = createTestApp({}, undefined, tour);
    const events: LedgerEvent[] = [];
    deps.events.subscribe((event) => events.push(event));

    await app.request(
      "/api/v1/tour/call",
      call({ phone: PHONE, consent: true }),
    );
    await settled();

    /* It asked twice: a call still running, and then one that had finished. */
    expect(asks()).toBe(2);
    expect(events.map((event) => event.type)).toEqual([
      "verification_call",
      "decision_made",
    ]);

    const recorded = events[0];
    if (recorded?.type !== "verification_call") {
      throw new Error("the first event was not a verification_call");
    }
    expect(recorded.line).toBe("owner");
    expect(recorded.ownerOutcome).toBe("hold");
    /* Mapped onto the ledger's one verification vocabulary. */
    expect(recorded.outcome).toBe("denied");
    expect(recorded.instructionId).toBe(HERO);
    expect(recorded.question).toBe(OWNER_QUESTION);
    expect(recorded.evidence).toBe(
      "No, reténla hasta que confirmemos con ellos",
    );
    expect(recorded.conversationId).toBe(CONVERSATION);
    expect(recorded.manual).toBe(false);
    expect(recorded.actor).toEqual(VISITOR);
    /* The number is nowhere on the event. Its salted hash is. */
    expect(recorded.phoneHash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(recorded)).not.toContain(PHONE);
    expect(JSON.stringify(recorded)).not.toContain("8112345678");

    const [decision] = decisionsOf(events);
    expect(decision?.action).toBe("hold");
    expect(decision?.reason).toBe(TOUR_HOLD_REASON);
    expect(decision?.decidedBy).toBe(VISITOR.name);
    expect(decision?.decidedByRole).toBe("owner");

    /* And it is on the repository, not only on the stream. */
    const detail = await deps.repo.instructionDetail(HERO);
    expect(detail?.decision?.action).toBe("hold");
    expect(detail?.decision?.reason).toBe(TOUR_HOLD_REASON);
  });

  it("records the release the owner signed, under their own name", async () => {
    const { http } = provider([DONE_RELEASE]);
    const { deps: tour, settled } = tourDeps(http);
    const { app, deps } = createTestApp({}, undefined, tour);
    const events: LedgerEvent[] = [];
    deps.events.subscribe((event) => events.push(event));

    await app.request(
      "/api/v1/tour/call",
      call({ phone: PHONE, consent: true }),
    );
    await settled();

    const recorded = events[0];
    if (recorded?.type !== "verification_call") {
      throw new Error("the first event was not a verification_call");
    }
    expect(recorded.ownerOutcome).toBe("release");
    expect(recorded.outcome).toBe("confirmed");

    const [decision] = decisionsOf(events);
    expect(decision?.action).toBe("release");
    expect(decision?.reason).toBe(TOUR_RELEASE_REASON);

    const detail = await deps.repo.instructionDetail(HERO);
    expect(detail?.decision?.action).toBe("release");
  });

  /**
   * The two answers that are not an instruction. The call is recorded, because
   * it happened; nothing is applied, because the payment stays exactly where the
   * control left it.
   */
  it("records a call nobody answered and applies nothing", async () => {
    const { http } = provider([DONE_SILENT]);
    const { deps: tour, settled } = tourDeps(http);
    const { app, deps } = createTestApp({}, undefined, tour);
    const events: LedgerEvent[] = [];
    deps.events.subscribe((event) => events.push(event));

    await app.request(
      "/api/v1/tour/call",
      call({ phone: PHONE, consent: true }),
    );
    await settled();

    expect(events.map((event) => event.type)).toEqual(["verification_call"]);
    const recorded = events[0];
    if (recorded?.type !== "verification_call") {
      throw new Error("the first event was not a verification_call");
    }
    expect(recorded.ownerOutcome).toBe("no_answer");
    expect(recorded.outcome).toBe("no_answer");

    /* The line is where the run left it: held, with no tour reason on it. */
    const detail = await deps.repo.instructionDetail(HERO);
    expect(detail?.decision?.action).toBe("hold");
    expect(detail?.decision?.reason).toBeUndefined();
  });

  /**
   * The revert, which is what lets the next judge see the run the first one saw.
   * It is a decision and not a deletion, signed `Recorrido`, so the history says
   * the tour put the line back rather than quietly forgetting the release.
   */
  it("puts the line back when the revert window passes", async () => {
    const { http } = provider([DONE_RELEASE]);
    const { deps: tour, settled } = tourDeps(http, { revertAfterMs: 600_000 });
    const { app, deps } = createTestApp({}, undefined, tour);
    const events: LedgerEvent[] = [];
    deps.events.subscribe((event) => events.push(event));

    await app.request(
      "/api/v1/tour/call",
      call({ phone: PHONE, consent: true }),
    );
    await settled();

    expect(events.map((event) => event.type)).toEqual([
      "verification_call",
      "decision_made",
      "decision_made",
    ]);

    const [applied, reverted] = decisionsOf(events);
    expect(applied?.action).toBe("release");
    expect(reverted?.action).toBe("hold");
    expect(reverted?.reason).toBe(TOUR_REVERT_REASON);
    expect(reverted?.decidedBy).toBe("Recorrido");

    const detail = await deps.repo.instructionDetail(HERO);
    expect(detail?.decision?.action).toBe("hold");
  });

  it("reverts nothing when nothing was applied", async () => {
    const { http } = provider([DONE_SILENT]);
    const { deps: tour, settled } = tourDeps(http, { revertAfterMs: 600_000 });
    const { app, deps } = createTestApp({}, undefined, tour);
    const events: LedgerEvent[] = [];
    deps.events.subscribe((event) => events.push(event));

    await app.request(
      "/api/v1/tour/call",
      call({ phone: PHONE, consent: true }),
    );
    await settled();

    expect(events.map((event) => event.type)).toEqual(["verification_call"]);
  });

  it("starts no background work at all when the deadline is zero", async () => {
    const { http, asks } = provider([DONE_HOLD]);
    const { deps: tour, settled } = tourDeps(http, { pollDeadlineMs: 0 });
    const { app, deps } = createTestApp({}, undefined, tour);
    const events: LedgerEvent[] = [];
    deps.events.subscribe((event) => events.push(event));

    await app.request(
      "/api/v1/tour/call",
      call({ phone: PHONE, consent: true }),
    );
    await settled();

    /* Only the outbound call. The conversation was never asked about. */
    expect(asks()).toBe(0);
    expect(events).toHaveLength(0);
  });
});

/* -------------------------------------------------------------------------- */
/* GET /api/v1/tour/call/:conversationId                                       */
/* -------------------------------------------------------------------------- */

describe("GET /api/v1/tour/call/:conversationId", () => {
  it("is the fallback for a browser that cannot hold the stream", async () => {
    const { http } = provider([DONE_HOLD]);
    const { deps: tour, settled } = tourDeps(http, { revertAfterMs: 600_000 });
    const { app } = createTestApp({}, undefined, tour);

    await app.request(
      "/api/v1/tour/call",
      call({ phone: PHONE, consent: true }),
    );
    await settled();

    const res = await app.request(`/api/v1/tour/call/${CONVERSATION}`);

    expect(res.status).toBe(200);
    const body: TourCallStatus = tourCallStatusSchema.parse(await res.json());

    expect(body.status).toBe("done");
    expect(body.ownerOutcome).toBe("hold");
    expect(body.evidence).toBe("No, reténla hasta que confirmemos con ellos");
    expect(body.appliedAt).toBe(TEST_NOW);
    expect(body.revertsAt).toBe("2026-09-12T03:10:00.000Z");
    /* The registry holds the hash and never the number. */
    expect(JSON.stringify(body)).not.toContain("8112345678");
  });

  it("answers 404 for a conversation this process did not start", async () => {
    const { app } = createTestApp();

    const res = await app.request("/api/v1/tour/call/conv_nobody");

    expect(res.status).toBe(404);
  });
});

/* -------------------------------------------------------------------------- */
/* Deriving the line                                                           */
/* -------------------------------------------------------------------------- */

describe("readTourFacts", () => {
  it("says where the account was opened and where the supplier is paid", async () => {
    const facts = await readTourFacts(new MemoryRepository());

    expect(facts?.hero.instructionId).toBe(HERO);
    /* Plain place names, because the call says them out loud. `plazaLabel`
       writes "580 (APODACA, NL)", which is right on a screen and wrong in an
       ear. */
    expect(facts?.hero.plazaNew).not.toContain("(");
    expect(facts?.hero.plazaUsual).not.toContain("(");
  });

  /**
   * The amount is the one long run of digits this payload may carry, and it is a
   * quantity rather than an identifier. The account is the thing that may not be
   * here, in whole or in part beyond its last four.
   */
  it("never puts a whole account in the payload", async () => {
    const facts = await readTourFacts(new MemoryRepository());
    const wire = JSON.stringify(facts?.hero);

    expect(wire).not.toContain(facts?.heroLine.instruction.clabe);
    expect(wire).not.toMatch(/"\d{5,}"/);
    expect(facts?.hero.accountLast4).toHaveLength(4);
  });
});

describe("hashPhone", () => {
  it("is a salted sha-256 and never the number", () => {
    const hash = hashPhone("sentryone-tour", PHONE);

    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toContain("8112345678");
    /* Reproducible on one salt, which is what lets somebody who asks be told
       which hash on the ledger is theirs without this product holding a
       telephone number to compare against. */
    expect(hashPhone("sentryone-tour", PHONE)).toBe(hash);
    expect(hashPhone("otra", PHONE)).not.toBe(hash);
  });
});

/* The header helper is used by the cases above through `writeHeaders`; this is
   the one assertion that the visitor's header is the shape docs/09 documents. */
describe("the visitor's header", () => {
  it("is an owner called Visitante", () => {
    expect(actorHeader(VISITOR)).toBe("role=owner; name=Visitante");
  });
});
