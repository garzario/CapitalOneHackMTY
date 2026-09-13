/**
 * The HTTP half of the payment execution: five status codes, one stream, one receipt.
 *
 * The selection rule is asserted in `packages/core/src/execution.test.ts` and the
 * pipeline in `src/execution.test.ts`. What is asserted here is the contract in
 * docs/09-api.md, and the four assertions worth reading twice are the ones about what
 * does NOT happen: a request with no `X-Actor` appends nothing, a server with no rail
 * appends nothing, a second call sends nothing new, and a request naming a held line
 * is refused with the line named rather than quietly dropped.
 */

import { describe, expect, it } from "bun:test";
import { FakeRail } from "@hackmty/rail";
import {
  paymentExecutionSchema,
  paymentReceiptSchema,
  skippedLineSchema,
} from "../schemas";
import { RUN_ID } from "../synthetic";
import { createTestApp, TEST_NOW } from "../test-app";

const ACTOR = "role=clerk; name=Lupita Elizondo";

/**
 * The three lines of the fixture run that may go out, and why they are three and not
 * five.
 *
 * Five carry a `release`, and two of those (03 and 09) already have a `payment_sent`
 * in the seeded ledger, from the week the company paid them out of its own banking
 * portal. The execution reads that and offers neither to a rail, which is the single
 * most important thing this endpoint does not do.
 */
const SENDABLE = ["ins-2026w37-06", "ins-2026w37-07", "ins-2026w37-10"];

/** Pesos of those three, exact to the centavo: 51230.25 + 78000 + 208350. */
const SENDABLE_AMOUNT = 337580.25;

/** The nine lines the run leaves alone: seven stopped and the two already paid. */
const SKIPPED_LINES = 9;

type ErrorBody = {
  error: { code: string; message: string; requestId: string };
};

function withRail(options: { refuse?: Record<string, string> } = {}) {
  return createTestApp({
    rail: async () => ({
      ok: true,
      rail: new FakeRail({
        now: () => TEST_NOW,
        ...(options.refuse === undefined ? {} : { refuse: options.refuse }),
      }),
    }),
  });
}

/** `null` means the request carries no `X-Actor` at all, which is its own case. */
function execute(
  app: ReturnType<typeof withRail>["app"],
  body: unknown,
  actor: string | null = ACTOR,
) {
  return app.request("/api/v1/run/current/execute", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(actor === null ? {} : { "x-actor": actor }),
    },
    body: JSON.stringify(body),
  });
}

/**
 * The `done` frame, which is the `PaymentExecution` itself, and the `skipped` frames
 * next to it. `apps/web/src/lib/api.ts` reads exactly this shape.
 */
function doneOf(rows: readonly Frame[]) {
  return paymentExecutionSchema.parse(
    rows.find((row) => row.event === "done")?.data,
  );
}

function skippedOf(rows: readonly Frame[]) {
  return rows
    .filter((row) => row.event === "skipped")
    .map((row) => skippedLineSchema.parse(row.data));
}

/** One SSE frame, as the client reads them. */
interface Frame {
  event: string;
  data: unknown;
}

async function frames(response: Response): Promise<Frame[]> {
  const text = await response.text();
  const rows: Frame[] = [];
  for (const block of text.split("\n\n")) {
    const event = /^event:\s*(.+)$/m.exec(block)?.[1]?.trim();
    const data = /^data:\s*(.+)$/m.exec(block)?.[1];
    if (event === undefined || data === undefined) {
      continue;
    }
    rows.push({ event, data: JSON.parse(data) });
  }
  return rows;
}

describe("POST /api/v1/run/:id/execute", () => {
  it("sends the released lines, streams one event each and folds the execution", async () => {
    const { app } = withRail();

    const response = await execute(app, { confirm: true });
    expect(response.status).toBe(202);
    expect(response.headers.get("content-type")).toContain("text/event-stream");

    const rows = await frames(response);
    const lines = rows.filter((row) => row.event === "line");
    const execution = doneOf(rows);

    // The three lines nothing stops, and only those.
    expect(execution.lines.map((line) => line.instructionId)).toEqual(SENDABLE);
    expect(execution.totals.settled).toBe(3);
    expect(execution.totals.sent).toBe(0);
    expect(execution.totals.failed).toBe(0);
    expect(execution.totals.lines).toBe(3);
    expect(execution.totals.amount).toBe(SENDABLE_AMOUNT);
    expect(lines.length).toBeGreaterThanOrEqual(3);

    // Every sent line carries a clave de rastreo and a receipt.
    for (const line of execution.lines) {
      expect(line.claveRastreo).toBeDefined();
      expect(line.receiptId).toBeDefined();
    }

    // The pesos decompose exactly, which is the check a judge does with a calculator.
    expect(execution.totals.settledAmount).toBe(execution.totals.amount);
    expect(execution.startedBy).toEqual({
      name: "Lupita Elizondo",
      role: "clerk",
    });
  });

  it("leaves the held lines out and says why, without appending anything for them", async () => {
    const { app } = withRail();

    const rows = await frames(await execute(app, { confirm: true }));
    const execution = doneOf(rows);
    const skipped = skippedOf(rows);

    // Nine lines left alone, each with a sentence a clerk can act on.
    expect(skipped).toHaveLength(SKIPPED_LINES);
    for (const line of skipped) {
      expect(["rojo", "enviado"]).toContain(line.state);
      expect(line.reason ?? "").not.toBe("");
    }
    /* And the two the company paid from its own banking portal are named as already
       sent rather than offered to a rail a second time. */
    expect(
      skipped
        .filter((line) => line.rule === "executed")
        .map((line) => line.instructionId),
    ).toEqual(["ins-2026w37-03", "ins-2026w37-09"]);
    // And none of them is in the execution, because a held line was never released.
    const sent = new Set(execution.lines.map((line) => line.instructionId));
    for (const line of skipped) {
      expect(sent.has(line.instructionId)).toBe(false);
    }
  });

  it("refuses without an X-Actor and appends nothing", async () => {
    const { app, deps } = withRail();

    const response = await execute(app, { confirm: true }, null);
    const body = (await response.json()) as ErrorBody;

    expect(response.status).toBe(400);
    expect(body.error.code).toBe("bad_request");
    expect(body.error.message).toContain("X-Actor");

    const execution = await (
      await app.request("/api/v1/run/current/execution")
    ).json();
    expect(paymentExecutionSchema.parse(execution).lines).toEqual([]);
    expect((await deps.repo.paymentEvents({ runId: RUN_ID })).length).toBe(0);
  });

  it("refuses an actor whose name carries a semicolon rather than truncating it", async () => {
    const { app } = withRail();

    const response = await execute(
      app,
      { confirm: true },
      "role=clerk; name=Lupita; Elizondo",
    );

    expect(response.status).toBe(400);
  });

  it("refuses without confirm: true", async () => {
    const { app } = withRail();

    const response = await execute(app, {});
    const body = (await response.json()) as ErrorBody;

    expect(response.status).toBe(400);
    expect(body.error.code).toBe("bad_request");
  });

  it("answers 503 and appends nothing when this server has no rail", async () => {
    /* The default test app has no rail, which is the documented state of a server
       that was never configured with one. Nothing is appended, because a
       `payment_sent` for a payment that never left is the one entry this ledger must
       not hold. */
    const { app, deps } = createTestApp();

    const response = await execute(app, { confirm: true });
    const body = (await response.json()) as ErrorBody;

    expect(response.status).toBe(503);
    expect(body.error.code).toBe("service_unavailable");
    expect(body.error.message).toContain("RAIL=");
    expect((await deps.repo.paymentEvents({ runId: RUN_ID })).length).toBe(0);
  });

  it("sends nothing new on a second call", async () => {
    const { app, deps } = withRail();

    const first = doneOf(await frames(await execute(app, { confirm: true })));
    const second = await execute(app, { confirm: true });
    const body = (await second.json()) as ErrorBody;

    expect(second.status).toBe(409);
    expect(body.error.code).toBe("conflict");
    expect(body.error.message).toContain("ya se ejecuto");

    // And the ledger holds exactly what the first call put there.
    const events = await deps.repo.paymentEvents({ runId: RUN_ID });
    expect(
      events.filter((event) => event.type === "payment_sent"),
    ).toHaveLength(first.totals.lines);
  });

  it("refuses a request that names a line the decisions stop, and names it", async () => {
    const { app, deps } = withRail();

    const response = await execute(app, {
      confirm: true,
      instructionIds: ["ins-2026w37-01"],
    });
    const body = (await response.json()) as ErrorBody;

    expect(response.status).toBe(409);
    expect(body.error.message).toContain("ins-2026w37-01");
    expect((await deps.repo.paymentEvents({ runId: RUN_ID })).length).toBe(0);
  });

  it("refuses a request that names an instruction the run does not hold", async () => {
    const { app } = withRail();

    const response = await execute(app, {
      confirm: true,
      instructionIds: ["ins-does-not-exist"],
    });
    const body = (await response.json()) as ErrorBody;

    expect(response.status).toBe(409);
    expect(body.error.message).toContain("ins-does-not-exist");
  });

  it("narrows to the lines the caller named", async () => {
    const { app } = withRail();

    const rows = await frames(
      await execute(app, {
        confirm: true,
        instructionIds: [SENDABLE[0] as string],
      }),
    );
    const execution = doneOf(rows);

    expect(execution.lines).toHaveLength(1);
    expect(execution.lines[0]?.instructionId).toBe(SENDABLE[0]);
  });

  /**
   * A line the company already paid elsewhere cannot be forced through by naming it,
   * which is the attack this assertion is about rather than an accident.
   */
  it("refuses a named line the ledger already says was paid", async () => {
    const { app, deps } = withRail();

    const response = await execute(app, {
      confirm: true,
      instructionIds: ["ins-2026w37-03"],
    });
    const body = (await response.json()) as ErrorBody;

    expect(response.status).toBe(409);
    expect(body.error.message).toContain("ins-2026w37-03");
    expect((await deps.repo.paymentEvents({ runId: RUN_ID })).length).toBe(0);
  });

  it("records a line the rail refused, with the sentence the rail wrote", async () => {
    const refused = SENDABLE[0] as string;
    const { app: failing } = withRail({
      refuse: { [refused]: "la cuenta CLABE no existe en el banco receptor" },
    });
    const execution = doneOf(
      await frames(await execute(failing, { confirm: true })),
    );

    const line = execution.lines.find((row) => row.instructionId === refused);
    expect(line?.state).toBe("failed");
    expect(line?.reason).toContain("CLABE no existe");
    expect(line?.claveRastreo).toBeUndefined();
    expect(execution.totals.failed).toBe(1);
    expect(execution.totals.settled).toBe(2);
  });

  it("writes the outflows to the bank mirror so control 6 reads them back", async () => {
    const { app, deps } = withRail();
    const before = (await deps.repo.bankMirror()).length;

    await frames(await execute(app, { confirm: true }));

    const after = await deps.repo.bankMirror();
    expect(after.length).toBe(before + 3);
    const added = after.slice(before);
    for (const row of added) {
      expect(row.direction).toBe("debit");
      // The mirror row names no payee, exactly like the rail's own row.
      expect(JSON.stringify(row)).not.toContain("Aceros");
    }
  });
});

describe("GET /api/v1/run/:id/execution", () => {
  it("answers 200 with no lines for a run nobody executed", async () => {
    const { app } = createTestApp();

    const response = await app.request("/api/v1/run/current/execution");
    const execution = paymentExecutionSchema.parse(await response.json());

    // "Nothing has been sent" is an answer. A 404 there would read as "no such run".
    expect(response.status).toBe(200);
    expect(execution.lines).toEqual([]);
    expect(execution.totals.amount).toBe(0);
  });

  it("answers 404 for a run nobody holds", async () => {
    const { app } = createTestApp();

    const response = await app.request("/api/v1/run/run-1999w01/execution");

    expect(response.status).toBe(404);
  });

  it("answers the same execution the stream ended with", async () => {
    const { app } = withRail();

    const execution = doneOf(
      await frames(await execute(app, { confirm: true })),
    );
    const read = paymentExecutionSchema.parse(
      await (await app.request("/api/v1/run/current/execution")).json(),
    );

    expect(read).toEqual(execution);
  });
});

describe("GET /api/v1/payments/:id/receipt", () => {
  async function executed() {
    const { app } = withRail();
    const execution = doneOf(
      await frames(await execute(app, { confirm: true })),
    );
    return { app, execution };
  }

  it("answers the receipt of one payment as JSON", async () => {
    const { app, execution } = await executed();
    const receiptId = execution.lines[0]?.receiptId as string;

    const response = await app.request(
      `/api/v1/payments/${encodeURIComponent(receiptId)}/receipt`,
    );
    const receipt = paymentReceiptSchema.parse(await response.json());

    expect(response.status).toBe(200);
    expect(receipt.id).toBe(receiptId);
    expect(receipt.executedBy.name).toBe("Lupita Elizondo");
    // Four digits and never eighteen.
    expect(receipt.beneficiaryAccountLast4).toHaveLength(4);
    // No CEP exists for a payment on this rail, so the seal can never read as valid.
    expect(receipt.sealState).toBe("not_checked");
    expect(receipt.runId).toBe(RUN_ID);
  });

  it("answers the same object as a PDF on Accept: application/pdf", async () => {
    const { app, execution } = await executed();
    const receiptId = execution.lines[0]?.receiptId as string;

    const response = await app.request(
      `/api/v1/payments/${encodeURIComponent(receiptId)}/receipt`,
      { headers: { accept: "application/pdf" } },
    );
    const bytes = new Uint8Array(await response.arrayBuffer());

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/pdf");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
  });

  it("answers 404 for a payment this instance never held", async () => {
    const { app } = withRail();

    const response = await app.request(
      "/api/v1/payments/rcp-NOTATRANSFER/receipt",
    );

    // A receipt for something that does not exist would be a fabricated document.
    expect(response.status).toBe(404);
  });
});

describe("GET /api/v1/rails", () => {
  it("says which rail is active and which has ever moved money, with no secret", async () => {
    const { app } = withRail();

    const response = await app.request("/api/v1/rails");
    const body = (await response.json()) as {
      active: string | null;
      rails: { id: string; producesCep: boolean; live: boolean }[];
      message?: string;
    };

    expect(response.status).toBe(200);
    expect(body.active).toBe("nessie");
    expect(body.rails.map((rail) => rail.id)).toEqual(["nessie", "stp"]);
    expect(body.rails.find((rail) => rail.id === "stp")?.live).toBe(false);
    expect(body.rails.find((rail) => rail.id === "stp")?.producesCep).toBe(
      true,
    );
    // No key, no account, no fingerprint, on any rail.
    expect(JSON.stringify(body)).not.toMatch(/key|token|secret/i);
  });

  it("carries the message that names the variables when there is no rail", async () => {
    const { app } = createTestApp();

    const body = (await (await app.request("/api/v1/rails")).json()) as {
      active: string | null;
      message?: string;
    };

    expect(body.active).toBeNull();
    expect(body.message).toContain("RAIL=nessie");
  });
});

describe("the dispersal layout", () => {
  it("hands back a CSV of exactly the lines the run would send", async () => {
    const { app } = withRail();

    const response = await app.request("/api/v1/run/current/layout");
    const file = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/csv");
    expect(response.headers.get("x-layout-lines")).toBe("3");
    expect(file.split("\r\n")[0]).toBe(
      "clabe,beneficiario,rfc,importe,referencia,concepto",
    );
    // Four rows: the header and the three lines nothing stops.
    expect(file.trimEnd().split("\r\n")).toHaveLength(4);
  });

  it("records the claves the bank answered and settles those lines", async () => {
    const { app } = withRail();
    const csv = await (await app.request("/api/v1/run/current/layout")).text();
    const references = csv
      .trimEnd()
      .split("\r\n")
      .slice(1)
      .map((row) => row.split(",")[4] as string);

    const file = [
      "referencia,clave de rastreo,estado,motivo",
      `${references[0]},BBVA20260913000001,PAGADO,`,
      `${references[1]},,RECHAZADO,Cuenta CLABE inexistente`,
      "9999999,BBVA20260913000099,PAGADO,",
    ].join("\n");

    const response = await app.request("/api/v1/run/current/layout/response", {
      method: "POST",
      headers: { "content-type": "application/json", "x-actor": ACTOR },
      body: JSON.stringify({ file }),
    });
    const body = (await response.json()) as {
      applied: { instructionId: string; state: string }[];
      unknown: string[];
      execution: unknown;
    };

    expect(response.status).toBe(200);
    expect(body.applied).toHaveLength(2);
    expect(body.applied[0]?.state).toBe("settled");
    expect(body.applied[1]?.state).toBe("failed");
    expect(body.unknown).toEqual(["9999999"]);

    const execution = paymentExecutionSchema.parse(body.execution);
    expect(execution.totals.settled).toBe(1);
    expect(execution.totals.failed).toBe(1);
    const settled = execution.lines.find((line) => line.state === "settled");
    expect(settled?.claveRastreo).toBe("BBVA20260913000001");
  });

  it("refuses a file with no clave de rastreo in it", async () => {
    const { app } = withRail();

    const response = await app.request("/api/v1/run/current/layout/response", {
      method: "POST",
      headers: { "content-type": "application/json", "x-actor": ACTOR },
      body: JSON.stringify({ file: "nada que leer" }),
    });

    expect(response.status).toBe(422);
  });
});
