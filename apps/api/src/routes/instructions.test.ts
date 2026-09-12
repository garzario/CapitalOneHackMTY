import { describe, expect, it } from "bun:test";
import type { LedgerEvent } from "@hackmty/core";
import { readAudioPayload, readImagePayload } from "@hackmty/extract";
import type { IntakeExtractor } from "../extraction";
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

/** What the synthetic photo and the synthetic voice note both carry. */
const READ_CLABE = "058580000723456775";
const TRANSCRIPT = `La cuenta es 0585 8000 0723 4567 75, son 184,300 pesos.`;

/**
 * An extractor that answers from a payload instead of from a model, through the
 * real post-processor in `@hackmty/extract`. No key, no network, and the
 * confidence arithmetic under test is the shipped one rather than a number
 * typed into this file.
 */
function stubExtractor(): IntakeExtractor {
  return {
    available: true,
    image: async () => ({
      ok: true,
      value: readImagePayload({
        rawText: `CLABE: 0585 8000 0723 4567 75`,
        clabe: READ_CLABE,
        amount: 184300,
        supplierHint: "Aceros y Perfiles del Norte",
        clarity: 0.86,
      }),
    }),
    audio: async () => ({
      ok: true,
      value: readAudioPayload({
        transcript: TRANSCRIPT,
        clabe: READ_CLABE,
        amount: 184300,
        clarity: 0.86,
      }),
    }),
  };
}

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

  it("refuses an image when the server holds no extraction key", async () => {
    // The default extractor is the unavailable one, which is what CI and any
    // deployment without GEMINI_API_KEY run. It says so instead of accepting a
    // file it cannot read.
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
    expect(body.error.message).toContain("GEMINI_API_KEY");
    expect(body.error.message).toContain("CLABE");
  });

  it("refuses a voice note when the server holds no extraction key", async () => {
    const { app } = createTestApp();
    const res = await app.request(
      "/api/v1/instructions",
      json({
        supplierRfc: "SYN010101AAA",
        amount: 1000,
        source: "whatsapp",
        audio: "T2dnUw==",
      }),
    );
    const body = (await res.json()) as ErrorBody;

    expect(res.status).toBe(422);
    expect(body.error.code).toBe("unprocessable");
    expect(body.error.message).toContain("GEMINI_API_KEY");
  });

  it("reads the CLABE off a photo and records the confidence", async () => {
    const { app } = createTestApp({ extractor: stubExtractor() });
    const res = await app.request(
      "/api/v1/instructions",
      json({
        supplierRfc: "SYN010101AAA",
        amount: 184300,
        source: "pdf",
        image: "aGVsbG8gd29ybGQ=",
      }),
    );

    expect(res.status).toBe(201);
    const intake = intakeResponseSchema.parse(await res.json());

    // Two OCR digits away from the account SYN010101AAA has been paid on seven
    // times, with a check digit that closes. The arithmetic says nothing and the
    // history says everything, which is the case the product exists for.
    expect(intake.instruction.clabe).toBe(READ_CLABE);
    expect(intake.instruction.ocrConfidence).toBe(0.86);
    expect(intake.instruction.imageRef).toContain(intake.instruction.id);
    expect(intake.findings.map((finding) => finding.detector)).toEqual([
      "clabe_forensics",
    ]);
    expect(intake.findings[0]?.evidence.ocrConfidence).toBe(0.86);
    expect(intake.decision.action).not.toBe("release");
  });

  it("keeps a typed CLABE over one a model read", async () => {
    const { app } = createTestApp({ extractor: stubExtractor() });
    const res = await app.request(
      "/api/v1/instructions",
      json({
        supplierRfc: "SYN010101AAA",
        amount: 184300,
        clabe: "058580000123456715",
        source: "pdf",
        image: "aGVsbG8gd29ybGQ=",
      }),
    );

    const intake = intakeResponseSchema.parse(await res.json());
    expect(intake.instruction.clabe).toBe("058580000123456715");
    expect(intake.instruction.ocrConfidence).toBeUndefined();
  });

  it("puts the transcript of a voice note in text, where nothing reads it", async () => {
    const { app } = createTestApp({ extractor: stubExtractor() });
    const res = await app.request(
      "/api/v1/instructions",
      json({
        supplierRfc: "SYN010101AAA",
        amount: 184300,
        source: "whatsapp",
        audio: "T2dnUw==",
      }),
    );

    expect(res.status).toBe(201);
    const intake = intakeResponseSchema.parse(await res.json());

    expect(intake.instruction.text).toBe(TRANSCRIPT);
    expect(intake.instruction.clabe).toBe(READ_CLABE);
    expect(intake.instruction.audioRef).toContain(intake.instruction.id);
  });

  it("answers 422 with the reason when the file cannot be read", async () => {
    const { app } = createTestApp({
      extractor: {
        available: true,
        image: async () => ({
          ok: false,
          message: "The image is too blurred.",
        }),
        audio: async () => ({ ok: false, message: "unused" }),
      },
    });
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
    expect(body.error.message).toBe("The image is too blurred.");
  });

  it("rejects a body with neither a clabe nor a file", async () => {
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
