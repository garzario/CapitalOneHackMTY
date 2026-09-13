import { describe, expect, it } from "bun:test";
import { assistantSessionSchema } from "../schemas";
import { createTestApp } from "../test-app";
import { scriptedModel } from "./model";
import { ASSISTANT_TURN_LIMIT } from "./routes";

type ErrorBody = {
  error: { code: string; message: string; requestId: string };
};

const HELD_ID = "ins-2026w37-01";
const ACTOR_HEADER = "role=clerk; name=Lupita Elizondo";

/** One parsed SSE frame: the event name and its data, already JSON parsed. */
interface Frame {
  event: string;
  data: Record<string, unknown>;
}

/** Reads a whole `text/event-stream` body into frames. */
async function frames(response: Response): Promise<Frame[]> {
  const body = await response.text();
  const parsed: Frame[] = [];
  for (const block of body.split("\n\n")) {
    const lines = block.split("\n");
    const event = lines
      .find((line) => line.startsWith("event: "))
      ?.slice("event: ".length);
    const data = lines
      .find((line) => line.startsWith("data: "))
      ?.slice("data: ".length);
    if (event !== undefined && data !== undefined) {
      parsed.push({ event, data: JSON.parse(data) as Record<string, unknown> });
    }
  }
  return parsed;
}

function turn(body: unknown, header = ACTOR_HEADER): RequestInit {
  return {
    method: "POST",
    headers: { "content-type": "application/json", "x-actor": header },
    body: JSON.stringify(body),
  };
}

describe("POST /api/v1/assistant/messages", () => {
  it("streams the turn and answers from the engine's evidence", async () => {
    const model = scriptedModel([
      {
        calls: [{ name: "get_instruction", args: { instructionId: HELD_ID } }],
        usage: { promptTokens: 1100, outputTokens: 25 },
      },
      {
        text: "Está en alerta: la cuenta terminada en 6812 no tiene historial con ese proveedor.",
        calls: [
          { name: "propose_verify_account", args: { instructionId: HELD_ID } },
        ],
        usage: { promptTokens: 2300, outputTokens: 70 },
      },
    ]);
    const { app } = createTestApp({ model });

    const res = await app.request(
      "/api/v1/assistant/messages",
      turn({ text: `por que esta en rojo ${HELD_ID}` }),
    );

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");

    const stream = await frames(res);
    const names = stream.map((frame) => frame.event);
    expect(names[0]).toBe("tool_call");
    expect(names).toContain("tool_result");
    expect(names).toContain("token");
    expect(names).toContain("proposal");
    expect(names.at(-1)).toBe("done");

    /* The session id is minted by the server and reaches the client on the first
       event, which is what the contract promises. */
    const sessionId = stream[0]?.data.sessionId;
    expect(typeof sessionId).toBe("string");

    const proposal = stream.find((frame) => frame.event === "proposal");
    expect(proposal?.data.kind).toBe("verify_account");
    expect(proposal?.data.requiresRole).toBe("clerk");
    /* A proposal is an offer. Nothing about this response executed anything. */
    expect(proposal?.data.payload).toEqual({});

    const done = stream.at(-1);
    expect(done?.data.author).toBe("assistant");
    expect(done?.data.sessionId).toBe(sessionId);
  });

  it("reopens the conversation it wrote, and the session replays it", async () => {
    const model = scriptedModel([
      {
        text: "La cuenta es nueva.",
        usage: { promptTokens: 800, outputTokens: 12 },
      },
      {
        text: "Sigue detenida.",
        usage: { promptTokens: 900, outputTokens: 10 },
      },
    ]);
    const { app } = createTestApp({ model });

    const first = await frames(
      await app.request(
        "/api/v1/assistant/messages",
        turn({ text: "por que esta en rojo" }),
      ),
    );
    const sessionId = String(first[0]?.data.sessionId);

    const second = await app.request(
      "/api/v1/assistant/messages",
      turn({ sessionId, text: "y ahora" }),
    );
    expect(second.status).toBe(200);
    await second.text();

    const read = await app.request(`/api/v1/assistant/sessions/${sessionId}`);
    expect(read.status).toBe(200);
    const session = assistantSessionSchema.parse(await read.json());

    /* Four turns: two questions and two answers, projected from the ledger rows and
       never stored a second time. */
    expect(session.messages.length).toBe(4);
    expect(session.messages.map((message) => message.author)).toEqual([
      "clerk",
      "assistant",
      "clerk",
      "assistant",
    ]);
    expect(session.actor).toEqual({
      name: "Lupita Elizondo",
      role: "clerk",
    });
    /* The second turn saw the first one, which is what session memory is for. */
    const lastRequest = model.requests.at(-1);
    expect(JSON.stringify(lastRequest)).toContain("La cuenta es nueva");
  });

  it("refuses a turn with nobody's name on it", async () => {
    const model = scriptedModel([{ text: "hola" }]);
    const { app } = createTestApp({ model });

    const res = await app.request("/api/v1/assistant/messages", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "hola" }),
    });

    expect(res.status).toBe(400);
    const body = (await res.json()) as ErrorBody;
    expect(body.error.code).toBe("bad_request");
    expect(body.error.message).toContain("x-actor");
  });

  it("refuses an actor header that does not parse", async () => {
    const model = scriptedModel([{ text: "hola" }]);
    const { app } = createTestApp({ model });
    const res = await app.request(
      "/api/v1/assistant/messages",
      turn({ text: "hola" }, "role=auditor; name=Ana"),
    );
    expect(res.status).toBe(400);
  });

  it("refuses a turn with no text and no image", async () => {
    const model = scriptedModel([{ text: "hola" }]);
    const { app } = createTestApp({ model });

    const res = await app.request(
      "/api/v1/assistant/messages",
      turn({ text: "   " }),
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as ErrorBody;
    expect(body.error.message).toContain("Send text, or an image to read");
  });

  it("answers 404 for a session nobody holds, before opening a stream", async () => {
    const model = scriptedModel([{ text: "hola" }]);
    const { app } = createTestApp({ model });

    const res = await app.request(
      "/api/v1/assistant/messages",
      turn({ sessionId: "ses-nope", text: "hola" }),
    );
    expect(res.status).toBe(404);
    expect(res.headers.get("content-type")).toContain("application/json");
  });

  it("answers 422 and names the variable on a server with no model", async () => {
    /* The default test app pins the unavailable model, which is also what a server
       with no `.env` gets. The panel is not the product: every other endpoint still
       answers. */
    const { app } = createTestApp();
    const res = await app.request(
      "/api/v1/assistant/messages",
      turn({ text: "por que esta en rojo" }),
    );

    expect(res.status).toBe(422);
    const body = (await res.json()) as ErrorBody;
    expect(body.error.code).toBe("unprocessable");
    expect(body.error.message).toContain("GEMINI_API_KEY");

    const run = await app.request("/api/v1/run/current");
    expect(run.status).toBe(200);
  });

  it("rate limits a client that loops, and says so", async () => {
    const model = scriptedModel(
      Array.from({ length: ASSISTANT_TURN_LIMIT + 2 }, () => ({
        text: "ok",
      })),
    );
    const { app } = createTestApp({ model });

    let status = 0;
    let retryAfter: string | null = null;
    let message = "";
    for (let attempt = 0; attempt < ASSISTANT_TURN_LIMIT + 1; attempt += 1) {
      const response = await app.request(
        "/api/v1/assistant/messages",
        turn({ text: "hola" }),
      );
      status = response.status;
      retryAfter = response.headers.get("Retry-After");
      const text = await response.text();
      if (status === 429) {
        message = (JSON.parse(text) as ErrorBody).error.message;
      }
    }

    expect(status).toBe(429);
    expect(retryAfter).not.toBeNull();
    /* The counter says turns and not lookups: a clerk reading "too many lookups"
       after typing a question would go looking for a lookup she never made. */
    expect(message).toContain("Too many turns");
  });

  it("reads a screenshot out of a multipart body", async () => {
    const model = scriptedModel([{ text: "No pude leer la imagen." }]);
    const { app } = createTestApp({ model });

    const form = new FormData();
    form.set("text", "me llego esto");
    form.append(
      "images",
      new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], "shot.png", {
        type: "image/png",
      }),
    );

    const res = await app.request("/api/v1/assistant/messages", {
      method: "POST",
      headers: { "x-actor": ACTOR_HEADER },
      body: form,
    });

    expect(res.status).toBe(200);
    const stream = await frames(res);
    expect(stream.at(-1)?.event).toBe("done");
    /* The test app holds no extraction key, so the image cannot be read and the turn
       says so rather than registering an instruction nobody could attribute. */
    expect(String(stream.at(-1)?.data.text).length).toBeGreaterThan(0);
  });

  it("refuses a body that is neither of the two content types", async () => {
    const model = scriptedModel([{ text: "ok" }]);
    const { app } = createTestApp({ model });

    const res = await app.request("/api/v1/assistant/messages", {
      method: "POST",
      headers: { "content-type": "text/plain", "x-actor": ACTOR_HEADER },
      body: "por que esta en rojo",
    });
    expect(res.status).toBe(400);
  });
});

describe("GET /api/v1/assistant/sessions/:id", () => {
  it("answers 404 for a conversation nobody holds", async () => {
    const { app } = createTestApp();
    const res = await app.request("/api/v1/assistant/sessions/ses-nope");

    expect(res.status).toBe(404);
    const body = (await res.json()) as ErrorBody;
    expect(body.error.code).toBe("not_found");
  });
});
