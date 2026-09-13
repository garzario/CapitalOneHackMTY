import { describe, expect, it } from "bun:test";
import { assistantToolSchema } from "../schemas";
import { createTestApp } from "../test-app";
import { carriesFullClabe } from "./mask";
import { type ApiCaller, READ_TOOLS, READ_TOOLS_BY_NAME } from "./tools";

const SEEDED_ID = "ins-2026w37-01";
const SEEDED_RFC = "SYN010101AAA";

/** The in-process caller the app binds at request time, built here by hand. */
function callerFor(app: ReturnType<typeof createTestApp>["app"]): ApiCaller {
  return async (path, init) => app.request(path, init);
}

function harness() {
  const { app, deps } = createTestApp();
  return { app, deps, api: callerFor(app) };
}

describe("the tool catalogue", () => {
  it("is exactly the list the contract declares, and every entry is a read", () => {
    /* The closed list is the boundary. If a tool is added here without the domain
       union learning it, this fails, which is the point: `AssistantTool` is what
       ADR-0007 points at when it says a writing tool is unrepresentable. */
    for (const tool of READ_TOOLS) {
      expect(assistantToolSchema.parse(tool.tool)).toBe(tool.tool);
    }
    expect(READ_TOOLS.length).toBe(assistantToolSchema.options.length);
    expect(new Set(READ_TOOLS.map((tool) => tool.tool)).size).toBe(
      READ_TOOLS.length,
    );
  });

  it("declares a name, a sentence and an object schema for each one", () => {
    for (const tool of READ_TOOLS) {
      expect(tool.declaration.name).toBe(tool.tool);
      expect(tool.declaration.description.length).toBeGreaterThan(40);
      expect(tool.declaration.parameters.type).toBe("OBJECT");
    }
  });
});

describe("get_run", () => {
  it("answers the run totals and the stopped lines with their level", async () => {
    const { api } = harness();
    const outcome = await READ_TOOLS_BY_NAME.get_run!.run({}, api);

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) {
      return;
    }
    expect(outcome.result.runId).toBe("run-2026-w37");
    expect(outcome.result["totals.instructions"]).toBeGreaterThan(0);
    expect(outcome.result.linesStopped).toBeGreaterThan(0);
    expect(outcome.result["line.1.confidence"]).toBeDefined();
    expect(outcome.result["line.1.state"]).toBeDefined();
  });

  it("never puts a full account on the wire", async () => {
    const { api } = harness();
    const outcome = await READ_TOOLS_BY_NAME.get_run!.run({}, api);
    expect(outcome.ok).toBe(true);
    expect(carriesFullClabe(JSON.stringify(outcome))).toBe(false);
  });
});

describe("get_instruction", () => {
  it("answers the level, the rule behind it, the state and every finding", async () => {
    const { api } = harness();
    const outcome = await READ_TOOLS_BY_NAME.get_instruction!.run(
      { instructionId: SEEDED_ID },
      api,
    );

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) {
      return;
    }
    expect(outcome.result.instructionId).toBe(SEEDED_ID);
    expect(outcome.result.confidence).toBe("alerta");
    expect(outcome.result.confidenceRule).toBe("critical_finding");
    expect(outcome.result.state).toBe("rojo");
    expect(outcome.result.action).toBe("hold");
    expect(outcome.result.findings).toBe(1);
    expect(outcome.result["finding.1.detector"]).toBe("clabe_forensics");
    /* The explanation is the engine's own Spanish sentence, so the answer can quote
       it rather than paraphrase a finding into something softer. */
    expect(
      String(outcome.result["finding.1.explanation"]).length,
    ).toBeGreaterThan(20);
  });

  it("sends four digits of the account and never eighteen", async () => {
    const { api } = harness();
    const outcome = await READ_TOOLS_BY_NAME.get_instruction!.run(
      { instructionId: SEEDED_ID },
      api,
    );
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) {
      return;
    }
    expect(outcome.result.clabeLast4).toBe("****6812");
    expect(carriesFullClabe(JSON.stringify(outcome.result))).toBe(false);
  });

  it("reports the 404 as an error on the call instead of throwing", async () => {
    /* A read that answered nothing has to be visible. An assistant that quietly lost
       one would be answering from its own memory. */
    const { api } = harness();
    const outcome = await READ_TOOLS_BY_NAME.get_instruction!.run(
      { instructionId: "ins-nope" },
      api,
    );
    expect(outcome.ok).toBe(false);
    if (outcome.ok) {
      return;
    }
    expect(outcome.error).toContain("ins-nope");
  });

  it("says which argument is missing rather than calling the endpoint", async () => {
    const { api } = harness();
    const outcome = await READ_TOOLS_BY_NAME.get_instruction!.run({}, api);
    expect(outcome).toEqual({
      ok: false,
      error: "instructionId is required and must be a string",
    });
  });
});

describe("get_supplier", () => {
  it("answers the history, with the accounts as four digits", async () => {
    const { api } = harness();
    const outcome = await READ_TOOLS_BY_NAME.get_supplier!.run(
      { rfc: SEEDED_RFC },
      api,
    );

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) {
      return;
    }
    expect(outcome.result.rfc).toBe(SEEDED_RFC);
    expect(outcome.result.legalName).toBe(
      "Aceros y Perfiles del Norte SA de CV",
    );
    expect(outcome.result.knownAccounts).toBe(1);
    expect(outcome.result["account.1.clabeLast4"]).toBe("****6715");
    expect(outcome.result["account.1.timesPaid"]).toBe(7);
    expect(carriesFullClabe(JSON.stringify(outcome.result))).toBe(false);
  });
});

describe("get_verification", () => {
  it("answers not_started as a real state and drops the empty fields", async () => {
    /* `state: "not_started"` is an answer and it is what lets the panel offer the
       action. A field with no value yet is dropped rather than sent as null, because
       a model handed `sealState: null` writes that the seal is null. */
    const { api } = harness();
    const outcome = await READ_TOOLS_BY_NAME.get_verification!.run(
      { instructionId: SEEDED_ID },
      api,
    );

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) {
      return;
    }
    expect(outcome.result.state).toBe("not_started");
    expect(outcome.result.sealState).toBeUndefined();
    expect(outcome.result.claveRastreo).toBeUndefined();
  });
});

describe("sat_lookup", () => {
  it("answers both lists and says which one could answer", async () => {
    const { api } = harness();
    const outcome = await READ_TOOLS_BY_NAME.sat_lookup!.run(
      { rfc: SEEDED_RFC },
      api,
    );

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) {
      return;
    }
    expect(outcome.result.listed).toBe(false);
    expect(outcome.result["list.69-B.answered"]).toBe(true);
    /* The point of the 49 Bis block: `answered: false` so an empty `entries` can
       never be read as "no esta listado" for a list nobody loaded. */
    expect(outcome.result["list.49 Bis.answered"]).toBe(false);
    expect(outcome.result["list.49 Bis.coverage"]).toBe(
      "not_published_machine_readable",
    );
  });
});

describe("get_metrics", () => {
  it("answers the blind evaluation the product was measured with", async () => {
    const { api } = harness();
    const outcome = await READ_TOOLS_BY_NAME.get_metrics!.run({}, api);

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) {
      return;
    }
    expect(outcome.result.cases).toBeGreaterThan(0);
    expect(outcome.result.precision).toBeGreaterThanOrEqual(0);
    expect(outcome.result.recall).toBeLessThanOrEqual(1);
  });
});

describe("consortium_signal", () => {
  it("is asked by instruction, because the model never holds eighteen digits", async () => {
    /* Every account the model has ever seen came back masked to four digits, so a tool
       that asked it for a full CLABE could only be answered by inventing one. The pair
       is resolved from the instruction instead, inside this process. */
    const declaration = READ_TOOLS_BY_NAME.consortium_signal!.declaration;
    expect(Object.keys(declaration.parameters.properties ?? {})).toEqual([
      "instructionId",
    ]);
  });

  it("reports the server that was not configured for it rather than an empty network", async () => {
    /* 503 is "this instance has no consortium" and it is not the same claim as "the
       network has never seen this pair". The tool carries the difference through. */
    const { api } = harness();
    const outcome = await READ_TOOLS_BY_NAME.consortium_signal!.run(
      { instructionId: SEEDED_ID },
      api,
    );
    expect(outcome.ok).toBe(false);
    if (outcome.ok) {
      return;
    }
    expect(outcome.error.length).toBeGreaterThan(10);
  });

  it("reports the instruction that does not exist, rather than asking the network", async () => {
    const { api } = harness();
    const outcome = await READ_TOOLS_BY_NAME.consortium_signal!.run(
      { instructionId: "ins-nope" },
      api,
    );
    expect(outcome.ok).toBe(false);
    if (outcome.ok) {
      return;
    }
    expect(outcome.error).toContain("ins-nope");
  });
});

describe("the endpoints issue #196 still owns", () => {
  it("reports the execution and the receipt as reads that answered nothing", async () => {
    /* Both are in the contract and neither is built yet. The tool answering with an
       error rather than throwing is what lets the panel ship before they land, and
       the model is told to say so rather than to invent an execution. */
    const { api } = harness();
    const execution = await READ_TOOLS_BY_NAME.get_execution!.run(
      { runId: "current" },
      api,
    );
    const receipt = await READ_TOOLS_BY_NAME.get_receipt!.run(
      { receiptId: "rcp-1" },
      api,
    );
    expect(execution.ok).toBe(false);
    expect(receipt.ok).toBe(false);
  });
});
