import { describe, expect, it } from "bun:test";
import type { LedgerEvent } from "@hackmty/core";
import { readImagePayload } from "@hackmty/extract";
import type { IntakeExtractor } from "../extraction";
import { assistantMessageSchema, ledgerEventSchema } from "../schemas";
import { createTestApp } from "../test-app";
import { carriesFullClabe } from "./mask";
import { scriptedModel } from "./model";
import type { ApiCaller } from "./tools";
import { chunkText, runTurn, SYSTEM_PROMPT, type TurnEvent } from "./turn";

const HELD_ID = "ins-2026w37-01";
/** The account Empaques Regios has been paid on eleven times, in the fixture. */
const KNOWN_ACCOUNT = "012580000987654320";
const ACTOR = { name: "Lupita Elizondo", role: "clerk" as const };

/** A one-pixel PNG, so the bytes are real and the reading is ours. */
const PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==";

/**
 * An extractor that answers from a payload through the real post-processor in
 * `@hackmty/extract`, so the confidence arithmetic under test is the shipped one
 * and no key and no socket are involved.
 */
function stubExtractor(
  payload: Parameters<typeof readImagePayload>[0],
): IntakeExtractor {
  return {
    available: true,
    image: async () => ({ ok: true, value: readImagePayload(payload) }),
    audio: async () => ({ ok: false, message: "not under test" }),
  };
}

interface Harness {
  events: LedgerEvent[];
  stream: TurnEvent[];
  api: ApiCaller;
  deps: ReturnType<typeof createTestApp>["deps"];
}

/**
 * A harness that watches the broadcaster rather than wrapping `emit`.
 *
 * It matters: the instruction a screenshot becomes is created by the ordinary intake
 * route, so `instruction_received` is appended by that handler and not by the turn.
 * Subscribing to the one broadcaster both paths publish on is what lets a test assert
 * on everything the turn caused, including what it caused through this API.
 */
function harness(overrides: Parameters<typeof createTestApp>[0] = {}): Harness {
  const { app, deps } = createTestApp(overrides);
  const events: LedgerEvent[] = [];
  deps.events.subscribe((event) => {
    events.push(event);
  });
  return {
    events,
    stream: [],
    deps,
    api: async (path, init) => app.request(path, init),
  };
}

function collector(harness: Harness) {
  return {
    clock: harness.deps.clock,
    extractor: harness.deps.extractor,
    api: harness.api,
    emit: harness.deps.emit,
  };
}

describe("the system prompt", () => {
  it("forbids the vocabulary the product forbids, and names the three levels", () => {
    expect(SYSTEM_PROMPT).toContain("confiable");
    expect(SYSTEM_PROMPT).toContain("precaucion");
    expect(SYSTEM_PROMPT).toContain("alerta");
    expect(SYSTEM_PROMPT).toContain("Answer in Spanish");
    expect(SYSTEM_PROMPT).toContain("Never say that a payment is");
    expect(SYSTEM_PROMPT).toContain("Never state a probability");
    expect(SYSTEM_PROMPT).toContain("No language model is in that decision");
  });
});

describe("chunkText", () => {
  it("splits at word boundaries and loses nothing", () => {
    const text =
      "La cuenta terminada en 6812 no tiene historial con este proveedor.";
    const chunks = chunkText(text, 20);
    expect(chunks.join("")).toBe(text);
    expect(chunks.length).toBeGreaterThan(1);
  });

  it("answers an empty list for an empty answer", () => {
    expect(chunkText("")).toEqual([]);
  });
});

describe("runTurn", () => {
  it("reads an instruction and answers from its evidence, proposing nothing", async () => {
    const model = scriptedModel([
      {
        calls: [{ name: "get_instruction", args: { instructionId: HELD_ID } }],
        usage: { promptTokens: 1200, outputTokens: 30 },
      },
      {
        text: "Está en alerta porque la cuenta terminada en 6812 no tiene historial con Aceros y Perfiles del Norte.",
        usage: { promptTokens: 2400, outputTokens: 60 },
      },
    ]);
    const h = harness({ model });

    const { message, usage } = await runTurn(
      { ...collector(h), model },
      {
        sessionId: "ses-1",
        text: `por que esta en rojo ${HELD_ID}`,
        images: [],
        actor: ACTOR,
        history: [],
      },
      async (event) => {
        h.stream.push(event);
      },
    );

    expect(message.author).toBe("assistant");
    expect(message.toolCalls?.length).toBe(1);
    expect(message.toolCalls?.[0]?.tool).toBe("get_instruction");
    expect(message.toolCalls?.[0]?.readOnly).toBe(true);
    expect(message.toolCalls?.[0]?.result?.confidence).toBe("alerta");
    expect(message.proposal).toBeUndefined();
    expect(message.instructionId).toBe(HELD_ID);
    /* Tokens are summed across the round trips, because the evidence of round one
       is the prompt of round two and that is where the cost of a tool actually
       lands. */
    expect(usage.promptTokens).toBe(3600);
    expect(usage.outputTokens).toBe(90);
    expect(usage.rounds).toBe(2);
    expect(usage.costMxn).toBeGreaterThan(0);
    assistantMessageSchema.parse(message);
  });

  it("streams the contract's five events, with the session id on each one", async () => {
    const model = scriptedModel([
      { calls: [{ name: "get_run", args: {} }] },
      {
        text: "Tienes tres líneas detenidas.",
        calls: [{ name: "propose_execute_run", args: {} }],
      },
    ]);
    const h = harness({ model });

    await runTurn(
      { ...collector(h), model },
      {
        sessionId: "ses-7",
        text: "ya puedo pagar",
        images: [],
        actor: ACTOR,
        history: [],
      },
      async (event) => {
        h.stream.push(event);
      },
    );

    const names = h.stream.map((event) => event.event);
    expect(names).toContain("tool_call");
    expect(names).toContain("tool_result");
    expect(names).toContain("token");
    expect(names).toContain("proposal");
    expect(names.at(-1)).toBe("done");
    /* The minted session id has to reach the client on the first event, and the five
       event names are the contract's, so it rides on the data of every one of them. */
    for (const event of h.stream) {
      expect(JSON.stringify(event.data)).toContain("ses-7");
    }
    const first = h.stream[0];
    expect(first?.event).toBe("tool_call");
    if (first?.event === "tool_call") {
      expect(first.data.result).toBeUndefined();
    }
  });

  it("writes the question and the answer to the ledger, with the cost on the answer", async () => {
    const model = scriptedModel([
      {
        text: "La corrida trae doce líneas.",
        usage: { promptTokens: 900, outputTokens: 20 },
      },
    ]);
    const h = harness({ model });

    await runTurn(
      { ...collector(h), model },
      {
        sessionId: "ses-2",
        text: "cuantas lineas trae la corrida",
        images: [],
        actor: ACTOR,
        history: [],
      },
      async () => {},
    );

    const turns = h.events.filter(
      (event) => event.type === "assistant_message",
    );
    expect(turns.length).toBe(2);
    for (const event of turns) {
      ledgerEventSchema.parse(event);
    }
    const [question, answer] = turns;
    if (
      question?.type !== "assistant_message" ||
      answer?.type !== "assistant_message"
    ) {
      throw new Error("expected two assistant_message events");
    }
    expect(question.message.author).toBe("clerk");
    expect(question.message.actor).toEqual(ACTOR);
    /* Typing a question costs nothing, so the person's turn carries no usage. */
    expect(question.usage).toBeUndefined();
    expect(answer.message.author).toBe("assistant");
    expect(answer.usage?.promptTokens).toBe(900);
    expect(answer.usage?.costMxn).toBeGreaterThan(0);
    expect(answer.usage?.model.length).toBeGreaterThan(0);
  });

  it("never appends a decision, a cent or a payment", async () => {
    /* The whole boundary in one assertion. The model asks for a release and the turn
       still writes nothing but the conversation. */
    const model = scriptedModel([
      {
        calls: [
          {
            name: "propose_decide",
            args: { instructionId: HELD_ID, action: "release" },
          },
        ],
      },
      { text: "Te dejo la tarjeta para liberarlo." },
    ]);
    const h = harness({ model });

    const { message } = await runTurn(
      { ...collector(h), model },
      {
        sessionId: "ses-3",
        text: "liberalo",
        images: [],
        actor: ACTOR,
        history: [],
      },
      async () => {},
    );

    expect(message.proposal?.kind).toBe("decide");
    expect(message.proposal?.requiresRole).toBe("owner");
    const kinds = h.events.map((event) => event.type);
    expect(kinds).not.toContain("decision_made");
    expect(kinds).not.toContain("cent_sent");
    expect(kinds).not.toContain("payment_sent");
  });

  it("offers one action and refuses the second in the same turn", async () => {
    const model = scriptedModel([
      {
        calls: [
          { name: "propose_verify_account", args: { instructionId: HELD_ID } },
          {
            name: "propose_decide",
            args: { instructionId: HELD_ID, action: "hold" },
          },
        ],
      },
      { text: "Te propongo el centavo." },
    ]);
    const h = harness({ model });

    const { message } = await runTurn(
      { ...collector(h), model },
      {
        sessionId: "ses-4",
        text: "que hago",
        images: [],
        actor: ACTOR,
        history: [],
      },
      async (event) => {
        h.stream.push(event);
      },
    );

    expect(message.proposal?.kind).toBe("verify_account");
    expect(h.stream.filter((event) => event.event === "proposal").length).toBe(
      1,
    );
    /* The model is told the second one was refused rather than silently dropped, so
       it does not write a sentence about two cards. */
    const second = model.requests.at(-1);
    expect(JSON.stringify(second)).toContain("only one action");
  });

  it("carries a failed read to the clerk instead of filling it in", async () => {
    const model = scriptedModel([
      {
        calls: [
          { name: "get_instruction", args: { instructionId: "ins-nope" } },
        ],
      },
      { text: "No tengo esa instrucción." },
    ]);
    const h = harness({ model });

    const { message } = await runTurn(
      { ...collector(h), model },
      {
        sessionId: "ses-5",
        text: "por que esta en rojo ins-nope",
        images: [],
        actor: ACTOR,
        history: [],
      },
      async (event) => {
        h.stream.push(event);
      },
    );

    expect(message.toolCalls?.[0]?.error).toContain("ins-nope");
    expect(message.toolCalls?.[0]?.result).toBeUndefined();
    const lastRequest = model.requests.at(-1);
    expect(JSON.stringify(lastRequest)).toContain("error");
  });

  it("answers, stores and bills nothing when the provider fails", async () => {
    const model = {
      available: true,
      model: "gemini-test",
      generate: async () => {
        throw new Error("socket hung up");
      },
    };
    const h = harness({ model });

    const { message, usage } = await runTurn(
      { ...collector(h), model },
      {
        sessionId: "ses-6",
        text: "por que esta en rojo",
        images: [],
        actor: ACTOR,
        history: [],
      },
      async () => {},
    );

    /* A provider outage is not the product failing. The question is still on the
       ledger, the answer says what happened, and the cost is zero. */
    expect(message.text).toContain("No pude consultar al modelo");
    expect(usage.costMxn).toBe(0);
    expect(
      h.events.filter((event) => event.type === "assistant_message").length,
    ).toBe(2);
  });

  it("refuses a tool this product does not have", async () => {
    const model = scriptedModel([
      { calls: [{ name: "send_payment", args: { amount: 1 } }] },
      { text: "No puedo hacer eso." },
    ]);
    const h = harness({ model });

    const { message } = await runTurn(
      { ...collector(h), model },
      {
        sessionId: "ses-8",
        text: "paga todo",
        images: [],
        actor: ACTOR,
        history: [],
      },
      async () => {},
    );

    expect(message.toolCalls ?? []).toEqual([]);
    expect(JSON.stringify(model.requests.at(-1))).toContain(
      "is not a tool this product has",
    );
  });

  it("sends the clerk's sentence and never an eighteen-digit account", async () => {
    const model = scriptedModel([{ text: "Listo." }]);
    const h = harness({ model });

    await runTurn(
      { ...collector(h), model },
      {
        sessionId: "ses-9",
        text: `me pasaron la cuenta ${KNOWN_ACCOUNT}, la pago?`,
        images: [],
        actor: ACTOR,
        history: [],
      },
      async () => {},
    );

    const sent = JSON.stringify(model.requests[0]);
    expect(carriesFullClabe(sent)).toBe(false);
    expect(sent).toContain("****4320");
    /* The actor's own name is not on the list of what ADR-0007 lets leave, so it
       does not leave. `decidedBy` is filled in on our side. */
    expect(sent).not.toContain("Lupita");
  });

  it("replays the conversation without re-sending the evidence of old turns", async () => {
    const model = scriptedModel([{ text: "Sí, la misma línea." }]);
    const h = harness({ model });

    await runTurn(
      { ...collector(h), model },
      {
        sessionId: "ses-10",
        text: "y la otra linea",
        images: [],
        actor: ACTOR,
        history: [
          {
            id: "m1",
            sessionId: "ses-10",
            author: "clerk",
            text: "por que esta en rojo",
            at: "2026-09-12T02:00:00.000Z",
          },
          {
            id: "m2",
            sessionId: "ses-10",
            author: "assistant",
            text: "la cuenta es nueva",
            at: "2026-09-12T02:00:01.000Z",
            toolCalls: [
              {
                id: "tc1",
                tool: "get_instruction",
                arguments: { instructionId: HELD_ID },
                at: "2026-09-12T02:00:01.000Z",
                readOnly: true,
                result: { confidence: "alerta" },
              },
            ],
          },
        ],
      },
      async () => {},
    );

    const contents = model.requests[0]?.contents ?? [];
    expect(contents.length).toBe(3);
    expect(contents[0]?.role).toBe("user");
    expect(contents[1]?.role).toBe("model");
    /* The old tool result is deliberately absent: it was evidence about a moment, and
       re-sending it would let a stale reading answer today's question. */
    expect(JSON.stringify(contents)).not.toContain("tc1");
  });
});

describe("intake by chat", () => {
  it("turns a screenshot into an instruction and streams its card", async () => {
    const model = scriptedModel([
      {
        text: "Registré el pago y quedó en precaución: la cuenta ya tiene historial.",
      },
    ]);
    const h = harness({
      model,
      extractor: stubExtractor({
        rawText: "Empaques Regios, CLABE 0125 8000 0987 6543 20, 12,500.00",
        clabe: KNOWN_ACCOUNT,
        amount: 12_500,
        supplierHint: "Empaques Regios SA de CV",
        clarity: 0.91,
      }),
    });

    const { message } = await runTurn(
      { ...collector(h), model },
      {
        sessionId: "ses-11",
        text: "me llego esto por whatsapp",
        images: [PNG_BASE64],
        actor: ACTOR,
        history: [],
      },
      async (event) => {
        h.stream.push(event);
      },
    );

    /* The instruction exists, it came through the ordinary endpoint, and the card on
       the stream is the engine's own output read back through `GET /instructions/:id`
       rather than a paraphrase of it. */
    const card = message.toolCalls?.[0];
    expect(card?.tool).toBe("get_instruction");
    expect(card?.result?.confidence).toBeDefined();
    expect(card?.result?.state).toBeDefined();
    expect(card?.result?.findings).toBeDefined();
    expect(message.instructionId).toBe(String(card?.result?.instructionId));

    const created = h.events.filter(
      (event) => event.type === "instruction_received",
    );
    expect(created.length).toBe(1);
    const instruction = created[0];
    if (instruction?.type !== "instruction_received") {
      throw new Error("expected an instruction_received event");
    }
    /* The image went through the ordinary endpoint, so the instruction carries the
       reference and the transcription confidence, and the CLABE control can see that
       these digits came off a photograph. An intake that posted the account as text
       would look typed and would quietly weaken that control. */
    expect(instruction.instruction.imageRef).toBeDefined();
    expect(instruction.instruction.ocrConfidence).toBeGreaterThan(0);
    expect(instruction.instruction.source).toBe("whatsapp");
    expect(
      String(card?.result?.["finding.1.evidence.ocrChannel"] ?? true),
    ).toBe("true");

    const dropped = h.events.find((event) => event.type === "intake_image");
    if (dropped?.type !== "intake_image") {
      throw new Error("expected an intake_image event");
    }
    expect(dropped.actor).toEqual(ACTOR);
    expect(dropped.sessionId).toBe("ses-11");
    expect(dropped.instructionId).toBe(message.instructionId);
    /* A reference and never the bytes, and nothing the extraction read beyond the
       CLABE that landed on the instruction. */
    expect(dropped.imageRef).toContain("assistant/ses-11");
    expect(JSON.stringify(dropped)).not.toContain(PNG_BASE64.slice(0, 24));
    ledgerEventSchema.parse(dropped);
  });

  it("never sends the image to the assistant model", async () => {
    const model = scriptedModel([{ text: "Listo." }]);
    const h = harness({
      model,
      extractor: stubExtractor({
        rawText: "CLABE 0125 8000 0987 6543 20",
        clabe: KNOWN_ACCOUNT,
        amount: 12_500,
        supplierHint: "Empaques Regios SA de CV",
        clarity: 0.91,
      }),
    });

    await runTurn(
      { ...collector(h), model },
      {
        sessionId: "ses-12",
        text: "",
        images: [PNG_BASE64],
        actor: ACTOR,
        history: [],
      },
      async () => {},
    );

    /* ADR-0007 allows the image to leave. This implementation does not send it,
       because the only thing the turn needs from the picture is what the extractor
       already read, so the transfer is narrower than the ADR permits. */
    const sent = JSON.stringify(model.requests);
    expect(sent).not.toContain(PNG_BASE64.slice(0, 24));
    expect(sent).not.toContain("inlineData");
    expect(carriesFullClabe(sent)).toBe(false);
  });

  it("offers an intake card instead of guessing the supplier", async () => {
    const model = scriptedModel([
      { text: "No pude saber a quién se le paga." },
    ]);
    const h = harness({
      model,
      extractor: stubExtractor({
        rawText: "CLABE 0585 8000 0999 8887 77 por 4,000.00",
        clabe: "058580000999888777",
        amount: 4000,
        supplierHint: "Un nombre que no existe",
        clarity: 0.8,
      }),
    });

    const { message } = await runTurn(
      { ...collector(h), model },
      {
        sessionId: "ses-13",
        text: "registra esto",
        images: [PNG_BASE64],
        actor: ACTOR,
        history: [],
      },
      async () => {},
    );

    expect(message.proposal?.kind).toBe("intake");
    expect(message.proposal?.payload.clabe).toBe("058580000999888777");
    expect(message.proposal?.payload.amount).toBe(4000);
    /* Nothing was created, and the event says the screenshot arrived with no
       instruction against it. */
    expect(
      h.events.filter((event) => event.type === "instruction_received").length,
    ).toBe(0);
    const dropped = h.events.find((event) => event.type === "intake_image");
    if (dropped?.type !== "intake_image") {
      throw new Error("expected an intake_image event");
    }
    expect(dropped.instructionId).toBeUndefined();
  });

  it("says so when the server holds no extraction key", async () => {
    const model = scriptedModel([{ text: "No puedo leer la imagen." }]);
    const h = harness({ model });

    const { message } = await runTurn(
      { ...collector(h), model },
      {
        sessionId: "ses-14",
        text: "lee esto",
        images: [PNG_BASE64],
        actor: ACTOR,
        history: [],
      },
      async () => {},
    );

    expect(message.proposal).toBeUndefined();
    expect(JSON.stringify(model.requests[0])).toContain("could NOT become");
  });
});
