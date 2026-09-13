import { describe, expect, it } from "bun:test";
import type { AssistantMessage, LedgerEvent } from "@hackmty/core";
import { assistantSessionSchema } from "../schemas";
import { assistantMessagesFrom, assistantSessionFrom } from "./session";

const AT = "2026-09-12T03:00:00.000Z";

function message(
  overrides: Partial<AssistantMessage> & Pick<AssistantMessage, "id">,
): AssistantMessage {
  return {
    sessionId: "ses-1",
    author: "clerk",
    text: "por que esta en rojo",
    at: AT,
    ...overrides,
  };
}

function turn(message: AssistantMessage): LedgerEvent {
  return {
    type: "assistant_message",
    at: message.at,
    sessionId: message.sessionId,
    message,
  };
}

describe("assistantMessagesFrom", () => {
  it("takes only the turns of the session it was asked about", () => {
    const events: LedgerEvent[] = [
      { type: "cfdi_received", at: AT, cfdi: {} as never },
      turn(message({ id: "m1" })),
      turn(message({ id: "m2", sessionId: "ses-2" })),
      turn(
        message({ id: "m3", author: "assistant", text: "la cuenta es nueva" }),
      ),
    ];

    expect(assistantMessagesFrom(events, "ses-1").map((m) => m.id)).toEqual([
      "m1",
      "m3",
    ]);
  });

  it("keeps append order, which is the order the panel replays", () => {
    const events = ["m1", "m2", "m3"].map((id) => turn(message({ id })));
    expect(assistantMessagesFrom(events, "ses-1").map((m) => m.id)).toEqual([
      "m1",
      "m2",
      "m3",
    ]);
  });
});

describe("assistantSessionFrom", () => {
  it("projects the conversation with the actor of the person's turn", () => {
    const messages = [
      message({
        id: "m1",
        actor: { name: "Lupita Elizondo", role: "clerk" },
      }),
      message({ id: "m2", author: "assistant", text: "la cuenta es nueva" }),
    ];

    const session = assistantSessionFrom(messages, "ses-1");
    expect(session).toBeDefined();
    const parsed = assistantSessionSchema.parse(session);
    expect(parsed.id).toBe("ses-1");
    expect(parsed.actor).toEqual({ name: "Lupita Elizondo", role: "clerk" });
    expect(parsed.startedAt).toBe(AT);
    expect(parsed.messages.length).toBe(2);
    /* Absent unless something in the conversation actually named a run. A session
       stamped with the current run at read time would claim the conversation was
       about a run it never mentioned. */
    expect(parsed.runId).toBeUndefined();
  });

  it("answers undefined for a session nobody holds, which is the 404", () => {
    expect(assistantSessionFrom([], "ses-nope")).toBeUndefined();
  });

  it("names the run when a proposal named one", () => {
    const messages = [
      message({ id: "m1", actor: { name: "Ana", role: "owner" } }),
      message({
        id: "m2",
        author: "assistant",
        text: "puedes enviar la corrida",
        proposal: {
          kind: "execute_run",
          payload: { confirm: true, runId: "run-2026-w37" },
          requiresRole: "clerk",
          summary: "Enviar la corrida de pagos.",
        },
      }),
    ];

    expect(assistantSessionFrom(messages, "ses-1")?.runId).toBe("run-2026-w37");
  });
});
