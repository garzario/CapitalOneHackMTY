/**
 * The assistant panel's boundary, tested as a property rather than described in a
 * comment.
 *
 * ADR-0007 says three things about this panel and each of them is checkable with no
 * network and no model: a tool that writes cannot reach the screen, a verdict
 * cannot reach the screen, and nothing executes without a person. The first two are
 * the decoder, the third is the request builder, and the offline conversation is
 * the fourth thing worth testing because it is copy that ships.
 *
 * The last block reads the panel's own sources off disk, the way
 * `design/tokens.test.ts` reads the stylesheet, because the vocabulary rule of
 * ADR-0009 applies to the words a component renders and not only to the words a
 * model sends.
 */

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ActionProposal, Actor } from "@hackmty/core";
import {
  decodeAssistantEvent,
  decodeProposal,
  decodeToolCall,
  forbiddenVerdict,
  needsReason,
  proposalHandoff,
  proposalRequest,
  QUICK_PROMPTS,
  roleAllows,
  signedPayload,
  toolResultChips,
} from "./assistant";
import {
  defaultInstructionId,
  folioIn,
  levelOf,
  MOCK_ACTOR,
  mockAssistantSession,
  offlineConfirm,
  offlineTurn,
  tokenize,
} from "./assistant-mock";
import type { AssistantStreamEvent } from "./contract";
import { MOCK_RUN, mockInstruction } from "./mock";

const CLERK: Actor = { name: "Lupita Elizondo", role: "clerk" };
const OWNER: Actor = { name: "Ramiro Elizondo", role: "owner" };

function frame(event: string, data: unknown) {
  return { event, data: JSON.stringify(data) };
}

const READ = {
  id: "t1",
  tool: "get_instruction",
  arguments: { instructionId: "INS-2026-09-07-047" },
  at: "2026-09-10T15:21:00.000Z",
  readOnly: true,
  result: { clabe: "012180101391764613", nearestTimesPaid: 52 },
};

/* -------------------------------------------------------------- the decoder */

describe("a tool call that writes cannot reach the screen", () => {
  test("the seven reads decode", () => {
    const call = decodeToolCall(READ);

    expect(call?.tool).toBe("get_instruction");
    expect(call?.readOnly).toBe(true);
    expect(call?.result?.nearestTimesPaid).toBe(52);
  });

  test("readOnly that is not the literal true is refused", () => {
    /* The whole boundary in one assertion. The domain makes the shape
       unrepresentable in TypeScript; this is the half that matters when the bytes
       come off a socket. */
    expect(decodeToolCall({ ...READ, readOnly: false })).toBeNull();
    expect(decodeToolCall({ ...READ, readOnly: "true" })).toBeNull();
    expect(decodeToolCall({ ...READ, readOnly: 1 })).toBeNull();
  });

  test("a tool outside the list is refused whatever it claims", () => {
    for (const tool of [
      "decide",
      "hold_payment",
      "execute_run",
      "write_ledger",
    ]) {
      expect([tool, decodeToolCall({ ...READ, tool })]).toEqual([tool, null]);
    }
  });

  test("a result key that is not evidence is dropped, not rendered", () => {
    const call = decodeToolCall({
      ...READ,
      result: { clabe: "012", recommendation: ["pay", "now"] },
    });

    expect(call?.result).toEqual({ clabe: "012" });
  });
});

describe("no verdict reaches the screen", () => {
  test("the word this product never uses, in either language", () => {
    expect(forbiddenVerdict("Esta cuenta es segura")).toBe("segura");
    expect(forbiddenVerdict("El pago es seguro.")).toBe("seguro");
    expect(forbiddenVerdict("This account is safe")).toBe("safe");
  });

  test("ordinary Spanish that merely contains the letters is allowed", () => {
    /* "aseguro" and "asegurado" are a clerk describing what somebody told her,
       not a verdict about a transfer, and a substring check would refuse both. */
    expect(
      forbiddenVerdict("El proveedor me aseguro que cambiaron de banco"),
    ).toBeNull();
    expect(forbiddenVerdict("Quedo asegurado el envio")).toBeNull();

    /* And a hyphenated identifier is not prose: this one is the CSS that keeps the
       dock clear of the home indicator on an iPhone. */
    expect(
      forbiddenVerdict(
        "bottom: calc(var(--space-4) + env(safe-area-inset-bottom))",
      ),
    ).toBeNull();
  });

  test("a probability, a percentage and a score are refused", () => {
    expect(forbiddenVerdict("Confianza del 73 %")).toBe("un porcentaje");
    expect(forbiddenVerdict("Confianza del 73%")).toBe("un porcentaje");
    expect(forbiddenVerdict("La probabilidad de fraude es alta")).toBe(
      "una probabilidad",
    );
  });

  test("a peso amount is a fact and not a score", () => {
    expect(forbiddenVerdict("38,417.48 MXN en riesgo")).toBeNull();
    expect(
      forbiddenVerdict("Difiere en 2 digitos de la cuenta 0121801"),
    ).toBeNull();
  });

  test("a turn carrying one is dropped rather than rendered", () => {
    expect(
      decodeAssistantEvent(frame("token", { text: "La cuenta es segura" })),
    ).toBeNull();
    expect(
      decodeProposal({
        kind: "decide",
        payload: { action: "release" },
        requiresRole: "owner",
        summary: "Liberar porque la cuenta es segura",
      }),
    ).toBeNull();
  });
});

describe("the five events of the stream", () => {
  test("each one decodes into what the panel renders", () => {
    expect(decodeAssistantEvent(frame("token", { text: "hola" }))).toEqual({
      kind: "token",
      text: "hola",
    });

    expect(decodeAssistantEvent(frame("tool_call", READ))?.kind).toBe(
      "tool_call",
    );
    expect(decodeAssistantEvent(frame("tool_result", READ))?.kind).toBe(
      "tool_result",
    );

    const proposal = decodeAssistantEvent(
      frame("proposal", {
        kind: "verify_account",
        instructionId: "INS-2026-09-07-047",
        payload: { instructionId: "INS-2026-09-07-047" },
        requiresRole: "clerk",
        summary: "Enviar 0.01 MXN a la cuenta terminada en 4613.",
      }),
    );

    expect(proposal?.kind).toBe("proposal");

    const done = decodeAssistantEvent(
      frame("done", {
        id: "m1",
        sessionId: "s1",
        author: "assistant",
        text: "Difiere en 2 digitos.",
        at: "2026-09-10T15:21:00.000Z",
        toolCalls: [READ],
      }),
    );

    expect(done?.kind).toBe("done");
  });

  test("an event name the contract does not have is ignored", () => {
    expect(
      decodeAssistantEvent(frame("decision", { action: "hold" })),
    ).toBeNull();
    expect(
      decodeAssistantEvent({ event: "token", data: "not json" }),
    ).toBeNull();
  });

  test("a proposal kind outside the five is refused", () => {
    expect(
      decodeProposal({
        kind: "send_money",
        payload: {},
        requiresRole: "clerk",
        summary: "Mandar el pago",
      }),
    ).toBeNull();
  });
});

/* ------------------------------------------------------------- the proposal */

const PROBE: ActionProposal = {
  kind: "verify_account",
  instructionId: "INS-2026-09-07-047",
  payload: { instructionId: "INS-2026-09-07-047" },
  requiresRole: "clerk",
  summary: "Enviar 0.01 MXN a la cuenta terminada en 4613.",
};

const RELEASE: ActionProposal = {
  kind: "decide",
  instructionId: "INS-2026-09-07-047",
  payload: { action: "release", decidedBy: "quien sea" },
  requiresRole: "owner",
  summary: "Liberar el pago sobre el hallazgo abierto.",
};

describe("what the button would send", () => {
  test("every kind names an endpoint that already exists", () => {
    expect(proposalRequest(PROBE, CLERK)).toEqual({
      method: "POST",
      path: "/api/v1/instructions/INS-2026-09-07-047/verify-account",
      body: null,
    });

    expect(proposalRequest(RELEASE, OWNER, "urgencia de produccion")).toEqual({
      method: "POST",
      path: "/api/v1/instructions/INS-2026-09-07-047/decide",
      body: {
        action: "release",
        decidedBy: "Ramiro Elizondo",
        reason: "urgencia de produccion",
      },
    });

    expect(
      proposalRequest(
        {
          kind: "intake",
          payload: { amount: 38417.48, source: "whatsapp" },
          requiresRole: "clerk",
          summary: "Dar de alta el pago.",
        },
        CLERK,
      ),
    ).toEqual({
      method: "POST",
      path: "/api/v1/instructions",
      body: { amount: 38417.48, source: "whatsapp" },
    });

    expect(
      proposalRequest(
        {
          kind: "execute_run",
          payload: { runId: "run-2026-09-07" },
          requiresRole: "clerk",
          summary: "Enviar la corrida.",
        },
        CLERK,
      ),
    ).toEqual({
      method: "POST",
      path: "/api/v1/run/run-2026-09-07/execute",
      body: { runId: "run-2026-09-07", confirm: true },
    });
  });

  test("the name on the body is the person who pressed the button", () => {
    /* docs/09-api.md refuses a body and a header that disagree about who acted,
       and a decision signed by one name under another is a record nobody can rely
       on later. So the proposal's own `decidedBy` never survives. */
    const body = signedPayload(RELEASE, OWNER, "urgencia");

    expect(body.decidedBy).toBe("Ramiro Elizondo");
    expect(body.reason).toBe("urgencia");
  });

  test("a release asks for prose, and the clerk cannot sign it", () => {
    expect(needsReason(RELEASE)).toBe(true);
    expect(needsReason(PROBE)).toBe(false);
    expect(roleAllows(RELEASE, CLERK)).toBe(false);
    expect(roleAllows(RELEASE, OWNER)).toBe(true);
    expect(roleAllows(PROBE, CLERK)).toBe(true);
  });

  test("the payment run is handed to the screen that owns it", () => {
    expect(
      proposalHandoff({
        kind: "execute_run",
        payload: {},
        requiresRole: "clerk",
        summary: "Enviar la corrida.",
      }),
    ).toBe(true);
    expect(proposalHandoff(PROBE)).toBe(false);
  });
});

describe("a tool result is rendered as the evidence it is", () => {
  test("the finding dictionary names the keys", () => {
    const chips = toolResultChips({
      nearestTimesPaid: 52,
      ocrChannel: false,
      unknownKeyFromTheFuture: "x",
    });

    const byKey = new Map(chips.map((chip) => [chip.key, chip]));

    expect(byKey.get("nearestTimesPaid")?.label).not.toBe("nearestTimesPaid");
    expect(byKey.get("ocrChannel")?.value).toBe("no");
    /* A key nobody translated is spaced out rather than hidden: a chip reading
       "unknown key from the future" is at least a fact, and a missing chip is
       evidence the screen threw away. */
    expect(byKey.get("unknownKeyFromTheFuture")?.label).toBe(
      "unknown key from the future",
    );
  });

  test("the one compound value is a line of its own, not a chip", () => {
    const chips = toolResultChips({
      clabe: "012",
      network: {
        source: "snapshot",
        tenants: 3,
        firstSeen: "2026-01-01",
        lastSeen: "2026-09-01",
        fraudReports: 0,
        otherAccounts: 1,
      },
    });

    expect(chips.map((chip) => chip.key)).toEqual(["clabe"]);
  });
});

/* --------------------------------------------------------- the offline turn */

const OFFLINE = {
  sessionId: "SES-TEST",
  at: "2026-09-12T20:00:00.000Z",
  seq: 2,
  images: [],
};

function textOf(events: AssistantStreamEvent[]): string {
  return events
    .filter(
      (event): event is { kind: "token"; text: string } =>
        event.kind === "token",
    )
    .map((event) => event.text)
    .join("");
}

function doneOf(events: AssistantStreamEvent[]) {
  const last = events.at(-1);

  if (last?.kind !== "done") {
    throw new Error("the offline turn did not end with a stored message");
  }

  return last.message;
}

describe("the panel with no API", () => {
  test("the session it opens with is the generated conversation", () => {
    const session = mockAssistantSession();

    expect(session.messages.length).toBe(3);
    expect(session.messages[0]?.author).toBe("clerk");
    expect(session.messages.at(-1)?.proposal?.kind).toBe("verify_account");
    expect(MOCK_ACTOR.role).toBe("clerk");
  });

  test("why a line is red answers with the engine's own explanation", () => {
    const id = defaultInstructionId();
    const item = mockInstruction(id);
    const events = offlineTurn({ ...OFFLINE, text: "Por que esta en rojo" });
    const message = doneOf(events);

    expect(item).not.toBeNull();
    expect(message.text).toContain(item?.findings[0]?.explanation ?? "never");
    expect(message.instructionId).toBe(id);

    /* The level and the state are in the sentence, and they are the words of
       ADR-0009 rather than a colour or a number. */
    const level = levelOf(item as NonNullable<typeof item>);
    expect(message.text.toLowerCase()).toContain(level.confidence);
    expect(message.text.toLowerCase()).toContain(level.state);
  });

  test("the reads come before the answer and carry the finding's evidence", () => {
    const events = offlineTurn({ ...OFFLINE, text: "Por que esta en rojo" });
    const kinds = events.map((event) => event.kind);

    expect(kinds[0]).toBe("tool_call");
    expect(kinds[1]).toBe("tool_result");
    expect(kinds.indexOf("token")).toBeGreaterThan(
      kinds.indexOf("tool_result"),
    );

    const call = events[1];

    if (call?.kind !== "tool_result") {
      throw new Error("the second event should be the read answering");
    }

    expect(call.call.readOnly).toBe(true);
    expect(Object.keys(call.call.result ?? {}).length).toBeGreaterThan(0);
  });

  test("the tokens join into the stored answer, exactly", () => {
    const events = offlineTurn({ ...OFFLINE, text: "Por que esta en rojo" });

    expect(textOf(events)).toBe(doneOf(events).text);
  });

  test("at most one proposal per turn, which is the whole of ADR-0007", () => {
    for (const text of [...QUICK_PROMPTS, "como va la verificacion", "hola"]) {
      const events = offlineTurn({ ...OFFLINE, text });
      const proposals = events.filter((event) => event.kind === "proposal");

      expect([text, proposals.length <= 1]).toEqual([text, true]);
    }
  });

  test("the weekly summary is the run's own arithmetic", () => {
    const events = offlineTurn({
      ...OFFLINE,
      text: "Resumen de la semana para el dueno",
    });
    const message = doneOf(events);

    expect(message.text).toContain(String(MOCK_RUN.totals.instructions));
    expect(message.toolCalls?.[0]?.tool).toBe("get_run");
    /* The owner's summary offers nothing: sending the run is the payment-run
       screen's own button, and this panel is not a second way to do it. */
    expect(message.proposal).toBeUndefined();
  });

  test("the supplier history reads the accounts we have actually paid", () => {
    const id = defaultInstructionId();
    const item = mockInstruction(id);
    const message = doneOf(
      offlineTurn({ ...OFFLINE, text: "Historial con este proveedor" }),
    );

    expect(message.text).toContain(item?.supplier.legalName ?? "never");
    expect(message.text).toContain(
      String(item?.supplier.knownAccounts[0]?.timesPaid ?? "never"),
    );
  });

  test("a line whose cent already left is not offered the cent again", () => {
    /* INS-2026-09-07-029 is the folio the API issue names, and in this dataset its
       probe is already in flight. Offering it again would be the panel proposing
       something that is done. */
    const message = doneOf(
      offlineTurn({
        ...OFFLINE,
        text: "Por que esta en rojo INS-2026-09-07-029",
      }),
    );

    expect(message.instructionId).toBe("INS-2026-09-07-029");
    expect(message.proposal).toBeUndefined();
    expect(message.text.toLowerCase()).toContain("cep");
  });

  test("a folio the run does not hold is not believed", () => {
    expect(folioIn("Por que esta en rojo INS-2026-09-07-029")).toBe(
      "INS-2026-09-07-029",
    );
    expect(folioIn("Por que esta en rojo INS-1999-01-01-999")).toBeNull();
  });

  test("a dropped screenshot ends in an intake a person confirms", () => {
    const events = offlineTurn({
      ...OFFLINE,
      text: "Te paso la captura",
      images: [
        {
          file: new File([new Uint8Array([1, 2, 3])], "whatsapp.png", {
            type: "image/png",
          }),
          name: "whatsapp.png",
          mediaType: "image/png",
          bytes: 3,
        },
      ],
    });
    const message = doneOf(events);
    const proposal = message.proposal;

    expect(proposal?.kind).toBe("intake");
    expect(typeof proposal?.payload.clabe).toBe("string");
    expect(typeof proposal?.payload.amount).toBe("number");
    expect(proposal?.requiresRole).toBe("clerk");

    /* And the panel says that offline nothing was read off her file, because the
       extraction runs on the server and there is no model in a browser. */
    expect(message.text.toLowerCase()).toContain("extraccion");

    const confirmation = offlineConfirm(proposal as ActionProposal);

    if (confirmation.kind !== "intake") {
      throw new Error("the offline intake should answer with the instruction");
    }

    expect(confirmation.detail.findings.length).toBeGreaterThan(0);
  });

  test("the same question twice is the same answer", () => {
    const first = offlineTurn({ ...OFFLINE, text: "Por que esta en rojo" });
    const second = offlineTurn({ ...OFFLINE, text: "Por que esta en rojo" });

    expect(first).toEqual(second);
  });

  test("no offline sentence says what this product may not say", () => {
    const texts: string[] = [];

    for (const text of [
      ...QUICK_PROMPTS,
      "como va la verificacion del centavo",
      "quiero liberar esta linea",
      "cualquier otra cosa",
    ]) {
      const message = doneOf(offlineTurn({ ...OFFLINE, text }));
      texts.push(message.text, message.proposal?.summary ?? "");
    }

    for (const message of mockAssistantSession().messages) {
      texts.push(message.text, message.proposal?.summary ?? "");
    }

    for (const sentence of texts) {
      expect([sentence, forbiddenVerdict(sentence)]).toEqual([sentence, null]);
    }
  });

  test("tokens are words and never cut one in half", () => {
    const tokens = tokenize("uno dos tres cuatro cinco seis", 2);

    expect(tokens).toEqual(["uno dos", " tres cuatro", " cinco seis"]);
    expect(tokens.join("")).toBe("uno dos tres cuatro cinco seis");
  });
});

/* ------------------------------------------------------------ the copy rule */

describe("the vocabulary of what the panel renders", () => {
  const ROOT = join(import.meta.dir, "..");

  /**
   * `lib/assistant.ts` is excluded because it is the guard: it carries the list of
   * forbidden words as data, so scanning it would only ever find its own rule.
   */
  const FILES = [
    "lib/assistant-mock.ts",
    "components/AssistantPanel.tsx",
    "components/AssistantCards.tsx",
    "components/AssistantDock.tsx",
  ];

  /** Comments argue about the rule; only what ships has to obey it. */
  function withoutComments(source: string): string {
    return source
      .replace(/\/\*[\s\S]*?\*\//g, " ")
      .replace(/^\s*\/\/.*$/gm, " ");
  }

  test("no component of the panel prints a verdict, a percentage or a score", () => {
    const offenders: string[] = [];

    for (const file of FILES) {
      const code = withoutComments(readFileSync(join(ROOT, file), "utf8"));
      const found = forbiddenVerdict(code);

      if (found !== null) {
        offenders.push(`${file}: ${found}`);
      }
    }

    expect(offenders).toEqual([]);
  });

  test("the files the rule covers exist", () => {
    /* A guard on the guard: a renamed component would make the test above pass
       over nothing at all. */
    for (const file of FILES) {
      expect([
        file,
        readFileSync(join(ROOT, file), "utf8").length > 500,
      ]).toEqual([file, true]);
    }
  });
});
