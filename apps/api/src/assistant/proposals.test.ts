import { describe, expect, it } from "bun:test";
import type { Actor } from "@hackmty/core";
import { actionProposalSchema, proposalKindSchema } from "../schemas";
import { createTestApp } from "../test-app";
import { carriesFullClabe } from "./mask";
import {
  ACTION_TOOLS,
  buildProposal,
  forbiddenCopyIn,
  PROPOSAL_TOOL_NAMES,
  proposalKindOf,
} from "./proposals";
import type { ApiCaller } from "./tools";

/** The line the fixture holds a critical CLABE finding on. */
const HELD_ID = "ins-2026w37-01";
/** A line with no findings, for the release that does not need the owner. */
const CLEAN_ID = "ins-2026w37-03";

const CLERK: Actor = { name: "Lupita Elizondo", role: "clerk" };

function api(): ApiCaller {
  const { app } = createTestApp();
  return async (path, init) => app.request(path, init);
}

describe("the action tools", () => {
  it("declare one tool per proposal kind and no sixth", () => {
    expect(ACTION_TOOLS.length).toBe(proposalKindSchema.options.length);
    for (const kind of proposalKindSchema.options) {
      expect(PROPOSAL_TOOL_NAMES[kind]).toBe(`propose_${kind}`);
      expect(proposalKindOf(`propose_${kind}`)).toBe(kind);
    }
    expect(proposalKindOf("get_run")).toBeUndefined();
  });

  it("say in the description that nothing runs", () => {
    /* The model is told twice, here and in the system prompt, because a model that
       believes `propose_decide` decided is a model that tells a clerk her payment is
       held when it is not. */
    for (const tool of ACTION_TOOLS) {
      expect(tool.description).toContain("NOT");
    }
  });
});

describe("forbiddenCopyIn", () => {
  it("catches the words and the numbers ADR-0009 forbids", () => {
    expect(forbiddenCopyIn("Este pago es seguro")).toBe("seguro");
    expect(forbiddenCopyIn("La cuenta es segura")).toBe("segura");
    expect(forbiddenCopyIn("this payment is safe")).toBe("safe");
    expect(forbiddenCopyIn("73% de riesgo")).toBe("73%");
    expect(forbiddenCopyIn("probabilidad de fraude")).toBe("probabilidad");
  });

  it("leaves an amount and a level alone", () => {
    expect(
      forbiddenCopyIn("Detener el pago de MXN 184,300.00 a Aceros y Perfiles"),
    ).toBeUndefined();
    expect(forbiddenCopyIn("La línea está en alerta")).toBeUndefined();
    /* "asegurarse" is not "seguro": the rule is a word boundary and not a substring,
       because refusing every word that contains the letters would make the templates
       unwritable. */
    expect(forbiddenCopyIn("hay que asegurarse")).toBeUndefined();
  });
});

describe("buildProposal", () => {
  it("offers the one-cent check with an empty body and the account as four digits", async () => {
    const built = await buildProposal({
      kind: "verify_account",
      args: { instructionId: HELD_ID },
      actor: CLERK,
      api: api(),
    });

    expect(built.ok).toBe(true);
    if (!built.ok) {
      return;
    }
    const proposal = actionProposalSchema.parse(built.proposal);
    expect(proposal.kind).toBe("verify_account");
    expect(proposal.instructionId).toBe(HELD_ID);
    /* The endpoint takes no body, so the payload is empty. Restating 0.01 here would
       be a second home for the one amount this product must not get wrong. */
    expect(proposal.payload).toEqual({});
    expect(proposal.requiresRole).toBe("clerk");
    expect(proposal.summary).toContain("6812");
    expect(carriesFullClabe(proposal.summary)).toBe(false);
  });

  it("signs a decide with the person at the keyboard and never with an argument", async () => {
    const built = await buildProposal({
      kind: "decide",
      args: {
        instructionId: HELD_ID,
        action: "hold",
        decidedBy: "alguien más",
      },
      actor: CLERK,
      api: api(),
    });

    expect(built.ok).toBe(true);
    if (!built.ok) {
      return;
    }
    /* The model asked for a different name and it is ignored. `decidedBy` comes off
       the actor on the request, which is the whole of the trust this path places in
       its caller. */
    expect(built.proposal.payload).toEqual({
      action: "hold",
      decidedBy: "Lupita Elizondo",
    });
  });

  it("asks for the owner on a release over a line that carries a finding", async () => {
    const built = await buildProposal({
      kind: "decide",
      args: { instructionId: HELD_ID, action: "release" },
      actor: CLERK,
      api: api(),
    });

    expect(built.ok).toBe(true);
    if (!built.ok) {
      return;
    }
    expect(built.proposal.requiresRole).toBe("owner");
    expect(built.proposal.summary).toContain("dueño");
  });

  it("leaves a release on a clean line with the clerk", async () => {
    /* `docs/02-persona.md` puts a maker-checker chain in the anti-persona column, so
       `owner` guards exactly the exception that page says the owner approves and
       nothing else. */
    const built = await buildProposal({
      kind: "decide",
      args: { instructionId: CLEAN_ID, action: "release" },
      actor: CLERK,
      api: api(),
    });

    expect(built.ok).toBe(true);
    if (!built.ok) {
      return;
    }
    expect(built.proposal.requiresRole).toBe("clerk");
  });

  it("refuses an action that is not one of the three", async () => {
    const built = await buildProposal({
      kind: "decide",
      args: { instructionId: HELD_ID, action: "pay" },
      actor: CLERK,
      api: api(),
    });
    expect(built).toEqual({
      ok: false,
      error: "action must be one of hold, verify, release",
    });
  });

  it("refuses a proposal about no instruction at all", async () => {
    const built = await buildProposal({
      kind: "verify_account",
      args: {},
      actor: CLERK,
      api: api(),
    });
    expect(built.ok).toBe(false);
  });

  it("offers the run with confirm true and nothing else", async () => {
    const built = await buildProposal({
      kind: "execute_run",
      args: {},
      actor: CLERK,
      api: api(),
    });

    expect(built.ok).toBe(true);
    if (!built.ok) {
      return;
    }
    /* `instructionIds` is deliberately absent: it can only narrow the set the
       decisions allow, and a proposal that narrowed it silently would hide a line
       from the clerk. */
    expect(built.proposal.payload).toEqual({ confirm: true });
    expect(built.proposal.instructionId).toBeUndefined();
    expect(built.proposal.requiresRole).toBe("clerk");
  });

  it("offers an intake carrying what the image left, and no supplier", async () => {
    const built = await buildProposal({
      kind: "intake",
      args: { clabe: "012580000987654320", amount: 96450.8 },
      actor: CLERK,
      api: api(),
    });

    expect(built.ok).toBe(true);
    if (!built.ok) {
      return;
    }
    expect(built.proposal.payload).toEqual({
      source: "whatsapp",
      clabe: "012580000987654320",
      amount: 96450.8,
    });
    /* The full CLABE is in the payload, which is the body of the endpoint the person
       is about to send from their own browser, and it is four digits in the sentence
       they read. The payload never goes to the model. */
    expect(carriesFullClabe(built.proposal.summary)).toBe(false);
    expect(built.proposal.summary).toContain("4320");
  });

  it("still offers an instruction about a line nobody holds, so the panel can refuse it", async () => {
    /* A proposal is an offer and the route is what checks it. Failing here instead
       would end a stream mid-answer over a line that was simply deleted. */
    const built = await buildProposal({
      kind: "verify_call",
      args: { instructionId: "ins-nope" },
      actor: CLERK,
      api: api(),
    });
    expect(built.ok).toBe(true);
  });

  it("never writes a probability or the word seguro in any summary", async () => {
    const kinds = proposalKindSchema.options;
    for (const kind of kinds) {
      const built = await buildProposal({
        kind,
        args: {
          instructionId: HELD_ID,
          action: "release",
          clabe: "012580000987654320",
        },
        actor: CLERK,
        api: api(),
      });
      if (built.ok) {
        expect(forbiddenCopyIn(built.proposal.summary)).toBeUndefined();
      }
    }
  });
});
