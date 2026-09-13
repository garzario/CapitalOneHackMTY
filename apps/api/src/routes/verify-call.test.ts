/**
 * The verification call endpoint, driven end to end with no network and no key.
 *
 * Every case passes a stub `http`, so nothing here reaches api.elevenlabs.io and
 * no telephone rings. The configuration itself is injected too: a teammate with
 * real ElevenLabs keys in their `.env` gets exactly the results CI gets.
 */

import { describe, expect, it } from "bun:test";
import type { Actor, LedgerEvent } from "@hackmty/core";
import { CONVERSATION_PAYLOAD, TRANSCRIPT_DENIED } from "@hackmty/voice";
import {
  verifyCallResponseSchema,
  verifyCallScriptResponseSchema,
} from "../schemas";
import { createTestApp, TEST_CLERK, TEST_NOW, writeHeaders } from "../test-app";
import type { VoiceDeps } from "./verify-call";

/** Instruction 1 of the synthetic run: the CLABE one digit off a known one. */
const INSTRUCTION = "ins-2026w37-01";
const SUPPLIER = "SYN010101AAA";
const CLABE = "058580000123456812";

const CONFIG = {
  apiKey: "test-key",
  agentId: "agent-1",
  phoneNumberId: "phnum-1",
};

interface Seen {
  url: string;
  body: unknown;
}

/** Voice deps that answer from a literal and record what was asked. */
function voice(answer: { status?: number; body: unknown }): {
  deps: VoiceDeps;
  seen: Seen[];
} {
  const seen: Seen[] = [];

  return {
    seen,
    deps: {
      readConfig: () => CONFIG,
      http: async (url, init) => {
        seen.push({
          url,
          body:
            typeof init?.body === "string" ? JSON.parse(init.body) : undefined,
        });

        return new Response(JSON.stringify(answer.body), {
          status: answer.status ?? 200,
        });
      },
    },
  };
}

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

function path(id = INSTRUCTION): string {
  return `/api/v1/instructions/${id}/verify-call`;
}

type ErrorBody = {
  error: { code: string; message: string };
  script?: { firstMessage: string; question: string; clabeLast4: string };
};

describe("GET /api/v1/instructions/:id/verify-call", () => {
  it("hands back the script without ringing anybody", async () => {
    const { deps: voiceDeps, seen } = voice({ body: {} });
    const { app, deps } = createTestApp({}, voiceDeps);
    const events: LedgerEvent[] = [];
    deps.events.subscribe((event) => events.push(event));

    const res = await app.request(path());

    expect(res.status).toBe(200);
    const body = verifyCallScriptResponseSchema.parse(await res.json());

    expect(body.script.clabeLast4).toBe("6812");
    expect(body.script.question).toContain("184,300.00");
    expect(body.voiceConfigured).toBe(true);
    expect(body.releasesPayment).toBe(false);
    /* Side effect free: no request to the provider and nothing on the ledger. */
    expect(seen).toHaveLength(0);
    expect(events).toHaveLength(0);
  });

  it("says the voice integration is absent when the keys are", async () => {
    const { app } = createTestApp();
    const res = await app.request(path());
    const body = verifyCallScriptResponseSchema.parse(await res.json());

    expect(body.voiceConfigured).toBe(false);
  });

  it("answers 404 for an instruction that does not exist", async () => {
    const { app } = createTestApp();

    expect((await app.request(path("ins-nope"))).status).toBe(404);
  });
});

describe("POST /api/v1/instructions/:id/verify-call, without keys", () => {
  it("answers 422 with the script the clerk reads out by hand", async () => {
    const { app } = createTestApp();
    const res = await app.request(path(), json({ toNumber: "+528112345678" }));

    expect(res.status).toBe(422);
    const body = (await res.json()) as ErrorBody;

    expect(body.error.code).toBe("unprocessable");
    expect(body.error.message).toContain("ELEVENLABS_API_KEY");
    expect(body.script?.question).toContain("6812");
    expect(body.script?.firstMessage).toContain(
      "Aceros y Perfiles del Norte SA de CV",
    );
  });

  /** The account is read out four digits at a time, never in full. */
  it("never puts the full CLABE in the script", async () => {
    const { app } = createTestApp();
    const res = await app.request(path(), json({ toNumber: "+528112345678" }));

    expect(JSON.stringify(await res.json())).not.toContain(CLABE);
  });

  it("appends nothing to the ledger when it could not call", async () => {
    const { app, deps } = createTestApp();
    const seen: LedgerEvent[] = [];
    deps.events.subscribe((event) => seen.push(event));

    await app.request(path(), json({ toNumber: "+528112345678" }));

    expect(seen).toHaveLength(0);
  });
});

describe("POST /api/v1/instructions/:id/verify-call, placing the call", () => {
  it("rings the supplier and answers 202 with the conversation id", async () => {
    const { deps: voiceDeps, seen } = voice({
      body: { success: true, message: "ok", conversation_id: "conv-1" },
    });
    const { app } = createTestApp({}, voiceDeps);

    const res = await app.request(path(), json({ toNumber: "+528112345678" }));

    expect(res.status).toBe(202);
    const body = verifyCallResponseSchema.parse(await res.json());

    expect(body.status).toBe("calling");
    expect(body.conversationId).toBe("conv-1");
    expect(body.releasesPayment).toBe(false);
    expect(seen[0]?.url).toContain("/v1/convai/twilio/outbound-call");
    expect(seen[0]?.body).toEqual({
      agent_id: "agent-1",
      agent_phone_number_id: "phnum-1",
      to_number: "+528112345678",
    });
  });

  /**
   * A call that started has proved nothing. An event here would show the clerk
   * an outcome before anybody had picked the telephone up.
   */
  it("appends no ledger event just for starting a call", async () => {
    const { deps: voiceDeps } = voice({
      body: { success: true, message: "ok", conversation_id: "conv-1" },
    });
    const { app, deps } = createTestApp({}, voiceDeps);
    const seen: LedgerEvent[] = [];
    deps.events.subscribe((event) => seen.push(event));

    await app.request(path(), json({ toNumber: "+528112345678" }));

    expect(seen).toHaveLength(0);
  });

  it("rejects a telephone number that is not E.164 before calling out", async () => {
    const { deps: voiceDeps, seen } = voice({ body: {} });
    const { app } = createTestApp({}, voiceDeps);

    const res = await app.request(path(), json({ toNumber: "8112345678" }));

    expect(res.status).toBe(400);
    expect(seen).toHaveLength(0);
  });

  it("reports a refusal the provider answered with a 200", async () => {
    const { deps: voiceDeps } = voice({
      body: { success: false, message: "the number is not verified" },
    });
    const { app } = createTestApp({}, voiceDeps);

    const res = await app.request(path(), json({ toNumber: "+528112345678" }));

    expect(res.status).toBe(422);
    expect(((await res.json()) as ErrorBody).error.message).toContain(
      "not verified",
    );
  });

  /**
   * A dead network throws a TypeError, not a VoiceError. It still has to come
   * back as the 422 that tells the clerk to pick up a telephone.
   */
  it("survives the provider being unreachable", async () => {
    const { app, deps } = createTestApp(
      {},
      {
        readConfig: () => CONFIG,
        http: () => Promise.reject(new TypeError("fetch failed")),
      },
    );
    const events: LedgerEvent[] = [];
    deps.events.subscribe((event) => events.push(event));

    const res = await app.request(path(), json({ toNumber: "+528112345678" }));

    expect(res.status).toBe(422);
    expect(((await res.json()) as ErrorBody).error.message).toContain(
      "read the script",
    );
    expect(events).toHaveLength(0);
  });

  /** Our key is our problem. A clerk must never be told they are signed out. */
  it("turns a provider 401 into a 422 and never into a 401", async () => {
    const { deps: voiceDeps } = voice({ status: 401, body: { detail: "no" } });
    const { app } = createTestApp({}, voiceDeps);

    const res = await app.request(path(), json({ toNumber: "+528112345678" }));

    expect(res.status).toBe(422);
    expect(JSON.stringify(await res.json())).not.toContain("test-key");
  });
});

describe("POST /api/v1/instructions/:id/verify-call, collecting the call", () => {
  it("parses the transcript and appends verification_call", async () => {
    const { deps: voiceDeps, seen } = voice({ body: CONVERSATION_PAYLOAD });
    const { app, deps } = createTestApp({}, voiceDeps);
    const events: LedgerEvent[] = [];
    deps.events.subscribe((event) => events.push(event));

    const res = await app.request(
      path(),
      json({ conversationId: "conv_synthetic_0001" }),
    );

    expect(res.status).toBe(200);
    const body = verifyCallResponseSchema.parse(await res.json());

    expect(body.status).toBe("recorded");
    expect(body.outcome).toBe("confirmed");
    expect(body.evidence).toBe(
      "Sí, es correcta, esa cuenta la abrimos en marzo",
    );
    expect(seen[0]?.url).toContain(
      "/v1/convai/conversations/conv_synthetic_0001",
    );

    expect(events).toHaveLength(1);
    const event = events[0];
    if (event?.type !== "verification_call") {
      throw new Error("expected a verification_call event");
    }
    expect(event.at).toBe(TEST_NOW);
    expect(event.instructionId).toBe(INSTRUCTION);
    expect(event.supplierRfc).toBe(SUPPLIER);
    expect(event.outcome).toBe("confirmed");
    expect(event.clabeLast4).toBe("6812");
    expect(event.manual).toBe(false);
    expect(event.transcript).toHaveLength(4);
  });

  /** The event is evidence, not an instruction. Nothing else may move. */
  it("never emits a decision and never changes the decision on record", async () => {
    const { deps: voiceDeps } = voice({ body: CONVERSATION_PAYLOAD });
    const { app, deps } = createTestApp({}, voiceDeps);

    const before = await deps.repo.instructionDetail(INSTRUCTION);
    const events: LedgerEvent[] = [];
    deps.events.subscribe((event) => events.push(event));

    await app.request(path(), json({ conversationId: "conv_synthetic_0001" }));

    const after = await deps.repo.instructionDetail(INSTRUCTION);

    expect(events.map((event) => event.type)).toEqual(["verification_call"]);
    expect(after?.decision?.action).toBe(before?.decision?.action);
    expect(after?.decision?.decidedBy).toBe(before?.decision?.decidedBy);
  });

  it("stores the CLABE nowhere on the event", async () => {
    const { deps: voiceDeps } = voice({ body: CONVERSATION_PAYLOAD });
    const { app, deps } = createTestApp({}, voiceDeps);
    const events: LedgerEvent[] = [];
    deps.events.subscribe((event) => events.push(event));

    await app.request(path(), json({ conversationId: "conv_synthetic_0001" }));

    expect(JSON.stringify(events)).not.toContain(CLABE);
  });

  /** Reading a half-finished call would record an outcome nobody reached. */
  it("refuses a conversation that has not finished", async () => {
    const { deps: voiceDeps } = voice({
      body: { ...CONVERSATION_PAYLOAD, status: "in-progress" },
    });
    const { app, deps } = createTestApp({}, voiceDeps);
    const events: LedgerEvent[] = [];
    deps.events.subscribe((event) => events.push(event));

    const res = await app.request(
      path(),
      json({ conversationId: "conv_synthetic_0001" }),
    );

    expect(res.status).toBe(422);
    expect(events).toHaveLength(0);
  });

  it("answers 404 when the provider has no such conversation", async () => {
    const { deps: voiceDeps } = voice({ status: 404, body: {} });
    const { app } = createTestApp({}, voiceDeps);

    const res = await app.request(path(), json({ conversationId: "nope" }));

    expect(res.status).toBe(404);
  });

  it("records a denial with the sentence it was read from", async () => {
    const { deps: voiceDeps } = voice({
      body: {
        ...CONVERSATION_PAYLOAD,
        transcript: TRANSCRIPT_DENIED.map((turn) => ({
          role: turn.role === "supplier" ? "user" : "agent",
          message: turn.text,
          time_in_call_secs: turn.atSecond ?? 0,
        })),
      },
    });
    const { app } = createTestApp({}, voiceDeps);

    const res = await app.request(
      path(),
      json({ conversationId: "conv_synthetic_0001" }),
    );
    const body = verifyCallResponseSchema.parse(await res.json());

    expect(body.outcome).toBe("denied");
    expect(body.evidence).toBe("No, esa cuenta no es nuestra");
  });
});

describe("POST /api/v1/instructions/:id/verify-call, recorded by hand", () => {
  /**
   * The fallback that needs no keys at all: the clerk dialled the supplier
   * themselves and types in what they heard.
   */
  it("records a hand-made call with no voice provider configured", async () => {
    const { app, deps } = createTestApp();
    const events: LedgerEvent[] = [];
    deps.events.subscribe((event) => events.push(event));

    const res = await app.request(
      path(),
      json({
        outcome: "denied",
        evidence: "Me dijo que esa cuenta no es de ellos",
        recordedBy: TEST_CLERK.name,
      }),
    );

    expect(res.status).toBe(200);
    const body = verifyCallResponseSchema.parse(await res.json());

    expect(body.status).toBe("recorded");
    expect(body.outcome).toBe("denied");

    const event = events[0];
    if (event?.type !== "verification_call") {
      throw new Error("expected a verification_call event");
    }
    expect(event.manual).toBe(true);
    expect(event.transcript).toEqual([]);
    expect(event.evidence).toBe("Me dijo que esa cuenta no es de ellos");
    /* The name is why the schema requires it. A hand-recorded call with nobody
       against it would be the only human action in this product that the ledger
       cannot attribute, on the exact path the demo falls back to. */
    expect(event.recordedBy).toBe(TEST_CLERK.name);
    /* And the actor next to it, which carries the role a bare name cannot. */
    expect(event.actor).toEqual(TEST_CLERK);
  });

  it("refuses a hand-recorded outcome signed by somebody other than the header", async () => {
    const { app, deps } = createTestApp();
    const events: LedgerEvent[] = [];
    deps.events.subscribe((event) => events.push(event));

    const res = await app.request(
      path(),
      json({ outcome: "confirmed", recordedBy: "Alguien Mas" }),
    );

    expect(res.status).toBe(400);
    /* Nothing is appended. A call outcome signed by one name under a header
       carrying another is a record nobody could rely on later. */
    expect(events).toEqual([]);
  });

  it("leaves recordedBy off a call the agent placed, because there the conversation id is the provenance", async () => {
    const { deps: voiceDeps } = voice({ body: CONVERSATION_PAYLOAD });
    const { app, deps } = createTestApp({}, voiceDeps);
    const events: LedgerEvent[] = [];
    deps.events.subscribe((event) => events.push(event));

    const res = await app.request(
      path(),
      json({ conversationId: "conv_synthetic_0001" }),
    );

    expect(res.status).toBe(200);
    const event = events[0];
    if (event?.type !== "verification_call") {
      throw new Error("expected a verification_call event");
    }
    expect(event.manual).toBe(false);
    expect(event.recordedBy).toBeUndefined();
    /* The actor is still there: somebody chose to ring a supplier about a payment,
       and that is a human action whoever placed the call. */
    expect(event.actor).toEqual(TEST_CLERK);
  });

  it("accepts no_answer with no sentence, because silence is an outcome", async () => {
    const { app } = createTestApp();
    const res = await app.request(
      path(),
      json({ outcome: "no_answer", recordedBy: TEST_CLERK.name }),
    );
    const body = verifyCallResponseSchema.parse(await res.json());

    expect(body.outcome).toBe("no_answer");
    expect(body.evidence).toBeUndefined();
  });

  it("answers an unanswered call with the deadline and the way out", async () => {
    /* The judges asked on 2026-09-12 what happens when nobody picks up. The same
       response that reports `no_answer` says how long the payment stays stopped
       and offers the one-cent CEP, which needs nobody to answer anything. */
    const { app } = createTestApp();
    const res = await app.request(
      path(),
      json({ outcome: "no_answer", recordedBy: TEST_CLERK.name }),
    );
    const body = verifyCallResponseSchema.parse(await res.json());

    expect(body.hold?.action).toBe("hold");
    /* Three days from when the payment was stopped, which is the decision's own
       instant and not the instant of the call: the window is the delay the
       expected-loss arithmetic already charged for, and the call does not reset
       it. Confirming the hold does, because then a person looked at it. */
    expect(body.hold?.deadline).toBe("2026-09-14T16:30:00.000Z");
    expect(body.hold?.expired).toBe(false);
    expect(body.hold?.outcome).toBe("no_answer");
    expect(body.hold?.nextSteps).toEqual([
      "retry_call",
      "one_cent_cep",
      "release_with_reason",
    ]);
    /* And it still releases nothing, which is the older promise of this file. */
    expect(body.releasesPayment).toBe(false);
  });

  /**
   * The window on a verification is ONE day, not three.
   *
   * `HOLD_WINDOW_DAYS` is `EXPECTED_DELAY_DAYS`, and a verification call is placed
   * on a payment the engine put in `verify`, so this is the number a judge who
   * curls the endpoint actually sees. `docs/12-judge-qa.md` said three days for
   * both and that was wrong; this test is what keeps the sheet honest, because the
   * instruction the tests above use happens to be on `hold`.
   */
  it("reports one day on a payment the engine put in verify, not three", async () => {
    const { app } = createTestApp();
    const res = await app.request(
      path("ins-2026w37-04"),
      json({ outcome: "no_answer", recordedBy: TEST_CLERK.name }),
    );
    const body = verifyCallResponseSchema.parse(await res.json());

    expect(body.hold?.action).toBe("verify");
    expect(body.hold?.days).toBe(1);
    expect(body.releasesPayment).toBe(false);
  });

  it("offers no release after the supplier denied the account", async () => {
    const { app } = createTestApp();
    const res = await app.request(
      path(),
      json({ outcome: "denied", recordedBy: TEST_CLERK.name }),
    );
    const body = verifyCallResponseSchema.parse(await res.json());

    expect(body.hold?.nextSteps).toEqual(["keep_held"]);
  });

  it("rejects an outcome that is not one of the four", async () => {
    const { app } = createTestApp();
    const res = await app.request(
      path(),
      json({ outcome: "maybe", recordedBy: TEST_CLERK.name }),
    );

    expect(res.status).toBe(400);
  });
});

describe("POST /api/v1/instructions/:id/verify-call, the basics", () => {
  it("answers 404 for an instruction that does not exist", async () => {
    const { app } = createTestApp();
    const res = await app.request(
      path("ins-nope"),
      json({ toNumber: "+528112345678" }),
    );

    expect(res.status).toBe(404);
  });

  it("rejects a body that names none of the three ways in", async () => {
    const { app } = createTestApp();
    const res = await app.request(path(), json({ hello: true }));

    expect(res.status).toBe(400);
  });

  /** Mounting a second router on /instructions must not shadow the first. */
  it("leaves the existing instruction routes reachable", async () => {
    const { app } = createTestApp();

    expect(
      (await app.request(`/api/v1/instructions/${INSTRUCTION}`)).status,
    ).toBe(200);
    expect(
      (
        await app.request(
          `/api/v1/instructions/${INSTRUCTION}/decide`,
          json({ action: "hold", decidedBy: TEST_CLERK.name }),
        )
      ).status,
    ).toBe(200);
  });
});
