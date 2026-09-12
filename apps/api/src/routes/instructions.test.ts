import { describe, expect, it } from "bun:test";
import type { LedgerEvent } from "@hackmty/core";
import {
  decideResponseSchema,
  instructionDetailSchema,
  intakeResponseSchema,
  ledgerResponseSchema,
} from "../schemas";
import { createTestApp, TEST_NOW } from "../test-app";

type ErrorBody = {
  error: { code: string; message: string; requestId: string };
};

const SEEDED_ID = "ins-2026w37-01";
const KNOWN_CFDI = "A0000003-0000-4000-8000-000000000003";

function json(body: unknown): RequestInit {
  return {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  };
}

describe("GET /api/v1/instructions/:id", () => {
  it("returns the instruction, its decision and its findings", async () => {
    const { app } = createTestApp();
    const res = await app.request(`/api/v1/instructions/${SEEDED_ID}`);

    expect(res.status).toBe(200);
    const detail = instructionDetailSchema.parse(await res.json());

    expect(detail.instruction.id).toBe(SEEDED_ID);
    expect(detail.supplier?.rfc).toBe("SYN010101AAA");
    expect(detail.decision?.action).toBe("hold");
    expect(detail.findings.map((finding) => finding.detector)).toEqual([
      "clabe_forensics",
    ]);
  });

  it("returns the error envelope for an unknown id", async () => {
    const { app } = createTestApp();
    const res = await app.request("/api/v1/instructions/ins-does-not-exist");
    const body = (await res.json()) as ErrorBody;

    expect(res.status).toBe(404);
    expect(body.error.code).toBe("not_found");
    expect(typeof body.error.requestId).toBe("string");
  });
});

describe("POST /api/v1/instructions", () => {
  it("runs the detectors and answers with the findings and the decision", async () => {
    const { app } = createTestApp();
    // SYN010101AAA has only ever been paid on a BANREGIO account. This CLABE is
    // a BBVA one, which is the bank-change case the CLABE detector exists for.
    const res = await app.request(
      "/api/v1/instructions",
      json({
        supplierRfc: "SYN010101AAA",
        amount: 184300,
        clabe: "012180001234567899",
        source: "whatsapp",
      }),
    );

    expect(res.status).toBe(201);
    const intake = intakeResponseSchema.parse(await res.json());

    expect(intake.instruction.supplierRfc).toBe("SYN010101AAA");
    expect(intake.instruction.receivedAt).toBe(TEST_NOW);

    expect(intake.findings.map((finding) => finding.detector)).toEqual([
      "clabe_forensics",
    ]);
    const [finding] = intake.findings;
    expect(finding?.state).toBe("requiere_verificacion");
    expect(finding?.amountAtRisk).toBe(184300);

    // A finding that is not provable asks for a check, it never accuses and it
    // never releases by itself. The expected loss is the engine's, not a guess
    // made here, so the assertion is that there is one rather than its value.
    expect(intake.decision.action).toBe("verify");
    expect(intake.decision.expectedLoss).toBeGreaterThan(0);
    expect(intake.decision.findings).toHaveLength(1);

    const stored = await app.request(
      `/api/v1/instructions/${intake.instruction.id}`,
    );
    expect(stored.status).toBe(200);
  });

  it("releases an instruction that pays an account the supplier is known on", async () => {
    const { app } = createTestApp();
    const res = await app.request(
      "/api/v1/instructions",
      json({
        supplierRfc: "SYN030303CCC",
        amount: 1000,
        clabe: "072580000456123788",
        source: "portal",
      }),
    );

    expect(res.status).toBe(201);
    const intake = intakeResponseSchema.parse(await res.json());

    expect(intake.findings).toEqual([]);
    expect(intake.decision.action).toBe("release");
    expect(intake.decision.expectedLoss).toBe(0);
  });

  it("appends instruction_received and decision_made to the ledger", async () => {
    const { app, deps } = createTestApp();
    const seen: LedgerEvent[] = [];
    deps.events.subscribe((event) => seen.push(event));

    await app.request(
      "/api/v1/instructions",
      json({
        supplierRfc: "SYN030303CCC",
        amount: 1000,
        clabe: "072580000456123788",
        source: "portal",
      }),
    );

    expect(seen.map((event) => event.type)).toEqual([
      "instruction_received",
      "decision_made",
    ]);

    const ledger = ledgerResponseSchema.parse(
      await (
        await app.request("/api/v1/ledger?since=2026-09-11T23:00:00Z")
      ).json(),
    );
    expect(ledger.events.map((event) => event.type)).toEqual([
      "instruction_received",
      "decision_made",
    ]);
  });

  it("attaches the instruction to a supplier through the CFDI when the RFC is missing", async () => {
    const { app } = createTestApp();
    const res = await app.request(
      "/api/v1/instructions",
      json({
        cfdiUuids: [KNOWN_CFDI],
        amount: 42180,
        clabe: "072580000456123788",
        source: "email",
      }),
    );

    expect(res.status).toBe(201);
    const intake = intakeResponseSchema.parse(await res.json());
    expect(intake.instruction.supplierRfc).toBe("SYN030303CCC");
  });

  it("refuses an instruction it cannot attach to a supplier", async () => {
    const { app } = createTestApp();
    const res = await app.request(
      "/api/v1/instructions",
      json({ amount: 1000, clabe: "072580000456123788", source: "email" }),
    );
    const body = (await res.json()) as ErrorBody;

    expect(res.status).toBe(422);
    expect(body.error.code).toBe("unprocessable");
    expect(body.error.message).toContain("supplierRfc");
  });

  it("refuses an image-only instruction while OCR is not wired in", async () => {
    const { app } = createTestApp();
    const res = await app.request(
      "/api/v1/instructions",
      json({
        supplierRfc: "SYN010101AAA",
        amount: 1000,
        source: "pdf",
        image: "aGVsbG8gd29ybGQ=",
      }),
    );
    const body = (await res.json()) as ErrorBody;

    expect(res.status).toBe(422);
    expect(body.error.code).toBe("unprocessable");
    expect(body.error.message).toContain("CLABE");
  });

  it("rejects a body with neither a clabe nor an image", async () => {
    const { app } = createTestApp();
    const res = await app.request(
      "/api/v1/instructions",
      json({ supplierRfc: "SYN010101AAA", amount: 1000, source: "email" }),
    );
    const body = (await res.json()) as ErrorBody;

    expect(res.status).toBe(400);
    expect(body.error.code).toBe("bad_request");
    expect(body.error.message).toContain("clabe");
  });

  it("rejects a CLABE that is not 18 digits", async () => {
    const { app } = createTestApp();
    const res = await app.request(
      "/api/v1/instructions",
      json({
        supplierRfc: "SYN010101AAA",
        amount: 1000,
        clabe: "12345",
        source: "email",
      }),
    );

    expect(res.status).toBe(400);
  });
});

describe("POST /api/v1/instructions/:id/decide", () => {
  it("records who confirmed the action", async () => {
    const { app } = createTestApp();
    const res = await app.request(
      `/api/v1/instructions/${SEEDED_ID}/decide`,
      json({ action: "release", decidedBy: "clerk-synthetic" }),
    );

    expect(res.status).toBe(200);
    const body = decideResponseSchema.parse(await res.json());

    expect(body.decision.action).toBe("release");
    expect(body.decision.decidedBy).toBe("clerk-synthetic");
    expect(body.decision.decidedAt).toBe(TEST_NOW);

    const detail = instructionDetailSchema.parse(
      await (await app.request(`/api/v1/instructions/${SEEDED_ID}`)).json(),
    );
    expect(detail.decision?.action).toBe("release");
    expect(detail.decision?.decidedBy).toBe("clerk-synthetic");
  });

  it("appends decision_made and never payment_sent, because we move no money", async () => {
    const { app, deps } = createTestApp();
    const seen: LedgerEvent[] = [];
    deps.events.subscribe((event) => seen.push(event));

    await app.request(
      `/api/v1/instructions/${SEEDED_ID}/decide`,
      json({ action: "hold", decidedBy: "clerk-synthetic" }),
    );

    expect(seen.map((event) => event.type)).toEqual(["decision_made"]);
  });

  it("returns 404 for an unknown instruction", async () => {
    const { app } = createTestApp();
    const res = await app.request(
      "/api/v1/instructions/ins-nope/decide",
      json({ action: "hold", decidedBy: "clerk-synthetic" }),
    );

    expect(res.status).toBe(404);
  });

  it("rejects an action outside the three the domain allows", async () => {
    const { app } = createTestApp();
    const res = await app.request(
      `/api/v1/instructions/${SEEDED_ID}/decide`,
      json({ action: "pay-it-anyway", decidedBy: "clerk-synthetic" }),
    );
    const body = (await res.json()) as ErrorBody;

    expect(res.status).toBe(400);
    expect(body.error.message).toContain("action");
  });
});
