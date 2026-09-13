import { describe, expect, it } from "bun:test";
import type { Detector, LedgerEvent } from "@hackmty/core";
import { readAudioPayload, readImagePayload } from "@hackmty/extract";
import { createSatIndex, type SatIndex } from "@hackmty/sat";
import type { IntakeExtractor } from "../extraction";
import { runControlsFor } from "../pipeline";
import {
  decideResponseSchema,
  instructionDetailResponseSchema,
  instructionDetailSchema,
  intakeResponseSchema,
  ledgerResponseSchema,
  paymentRunSchema,
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

  it("says how long the payment is held and what to do next", async () => {
    /* The judges' question on 2026-09-12: what happens if it is urgent. A held
       payment with no deadline and no way out is a control the clerk bypasses
       outside the product, where nothing is recorded. */
    const { app } = createTestApp();
    const res = await app.request(`/api/v1/instructions/${SEEDED_ID}`);
    const detail = instructionDetailResponseSchema.parse(await res.json());

    expect(detail.hold?.action).toBe("hold");
    expect(detail.hold?.days).toBe(3);
    expect(detail.hold?.nextSteps).toEqual([
      "call_supplier",
      "one_cent_cep",
      "release_with_reason",
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

/**
 * The hero instruction of the demo, and the reason issue #106 exists.
 *
 * Before this, three of the six controls were wired and three were not, and the
 * payment run said nothing about the difference. So these tests assert two
 * things rather than one: the findings the evidence justifies, and an explicit
 * outcome for every single control, so a control that stops being called fails a
 * test instead of quietly returning an empty rail.
 *
 * `SYN020202BBB` is on the Article 69-B list as presunto since 2026-08-29, and
 * this CLABE is two digits away from the account it has been paid on 11 times
 * with a valid check digit, which is a changed account and not a typo.
 */
describe("POST /api/v1/instructions, the six controls", () => {
  const HERO = {
    supplierRfc: "SYN020202BBB",
    amount: 96450.8,
    clabe: "012580000987654126",
    cfdiUuids: ["A0000002-0000-4000-8000-000000000002"],
    source: "whatsapp",
    text: "Les paso la cuenta nueva para el pago de esta semana.",
  };

  /** Every control and what it did: a finding, silence, or a named skip. */
  async function outcomes(): Promise<Record<Detector, string>> {
    const { app, deps } = createTestApp();
    const intake = intakeResponseSchema.parse(
      await (await app.request("/api/v1/instructions", json(HERO))).json(),
    );
    const detail = await deps.repo.instructionDetail(intake.instruction.id);
    if (detail === undefined) {
      throw new Error("the instruction was not stored");
    }

    const report = await runControlsFor(
      deps.repo,
      detail.instruction,
      TEST_NOW,
    );
    const table = {} as Record<Detector, string>;
    for (const detector of report.ran) {
      const found = report.findings.filter(
        (finding) => finding.detector === detector,
      ).length;
      table[detector] = found === 0 ? "ran, nothing found" : `${found} finding`;
    }
    for (const row of report.skipped) {
      table[row.detector] = `skipped: ${row.reason}`;
    }
    return table;
  }

  it("accounts for every one of the six controls, with no silent slot", async () => {
    expect(await outcomes()).toEqual({
      // The fiscal hook of ADR-0002 and the changed account, on one payment.
      sat_69b: "1 finding",
      clabe_forensics: "1 finding",
      // Ran and stayed quiet, each for a reason a person can state: this
      // invoice is settled by nothing else, eleven invoices is not enough
      // history to test a behaviour change, and the payment has not been sent
      // so the bank statement cannot contradict it yet.
      duplicate_invoice: "ran, nothing found",
      supplier_behaviour: "ran, nothing found",
      bank_reconciliation: "ran, nothing found",
      // The one control that is genuinely not armed here, and it says so.
      beneficiary_cep: "skipped: no_cep",
    });
  });

  it("returns both findings and asks for verification before the SPEI leaves", async () => {
    const { app } = createTestApp();
    const res = await app.request("/api/v1/instructions", json(HERO));

    expect(res.status).toBe(201);
    const intake = intakeResponseSchema.parse(await res.json());

    expect(intake.findings.map((finding) => finding.detector).sort()).toEqual([
      "clabe_forensics",
      "sat_69b",
    ]);
    for (const finding of intake.findings) {
      expect(finding.severity).toBe("critical");
      expect(finding.state).toBe("requiere_verificacion");
    }

    // Nothing is auto-released while a critical finding stands, and nothing is
    // held either: neither finding is provable from the documents alone.
    expect(intake.decision.action).toBe("verify");
    expect(intake.decision.findings).toHaveLength(2);
  });

  it("names the list version and the account the 69-B and CLABE findings rest on", async () => {
    const { app } = createTestApp();
    const intake = intakeResponseSchema.parse(
      await (await app.request("/api/v1/instructions", json(HERO))).json(),
    );
    const evidence = Object.fromEntries(
      intake.findings.map((finding) => [finding.detector, finding.evidence]),
    );

    expect(evidence.sat_69b?.status).toBe("presunto");
    expect(evidence.sat_69b?.listVersion).toBe("2026-08-29");
    expect(evidence.clabe_forensics?.nearestKnownAccount).toBe(
      "012580000987654320",
    );
    expect(evidence.clabe_forensics?.editOperations).toBe(2);
    // A changed account with a valid check digit is not a typo, and the finding
    // says so rather than letting the clerk assume somebody fat-fingered it.
    expect(evidence.clabe_forensics?.checkDigit).toBe("valid");
  });

  it("arms the CEP control on an account a one-cent probe already verified", async () => {
    const { app, deps } = createTestApp();
    const intake = intakeResponseSchema.parse(
      await (
        await app.request(
          "/api/v1/instructions",
          json({
            supplierRfc: "SYN070707GGG",
            amount: 78000,
            clabe: "030580000999000119",
            cfdiUuids: ["A0000007-0000-4000-8000-000000000007"],
            source: "manual",
          }),
        )
      ).json(),
    );
    const detail = await deps.repo.instructionDetail(intake.instruction.id);
    const report = await runControlsFor(
      deps.repo,
      // biome-ignore lint/style/noNonNullAssertion: the intake above stored it.
      detail!.instruction,
      TEST_NOW,
    );

    expect(report.skipped).toEqual([]);
    expect(report.ran).toHaveLength(6);

    const cep = intake.findings.find(
      (finding) => finding.detector === "beneficiary_cep",
    );
    // Good news, and only info: the holder on the Banxico CEP is the company
    // that issued the invoice, so this can never move an action by itself.
    expect(cep?.severity).toBe("info");
    expect(cep?.amountAtRisk).toBe(0);
    expect(cep?.evidence.nameMatch).toBe("match");
    expect(intake.decision.action).toBe("release");
  });

  it("prices the delay from the supplier record, not from a constant", async () => {
    const { app } = createTestApp();
    const priced = intakeResponseSchema.parse(
      await (
        await app.request(
          "/api/v1/instructions",
          json({
            supplierRfc: "SYN030303CCC",
            amount: 208350,
            clabe: "072580000456123788",
            source: "portal",
          }),
        )
      ).json(),
    );
    const unpriced = intakeResponseSchema.parse(
      await (
        await app.request(
          "/api/v1/instructions",
          json({
            supplierRfc: "SYN010101AAA",
            amount: 67450,
            clabe: "058580000123456715",
            source: "portal",
          }),
        )
      ).json(),
    );

    expect(priced.decision.delayCostPerDay).toBe(1800);
    // Absent on the record reads as zero, the documented default, and the
    // engine then releases only what is clean.
    expect(unpriced.decision.delayCostPerDay).toBe(0);
  });
});

/**
 * The 69-B control reads two lists: the versions this instance was posted, and
 * the committed download of the official SAT list that `GET /api/v1/sat/lookup`
 * answers from. Without the second one the control knows strictly less than the
 * lookup box on the next screen.
 *
 * The stub here carries a synthetic RFC on purpose. ADR-0002 forbids a real RFC
 * standing next to fabricated evidence, and a fixture is fabricated evidence.
 * The real snapshot is exercised in `packages/sat`, where nothing is joined to
 * an invoice.
 */
describe("POST /api/v1/instructions and the official 69-B list", () => {
  const CLEAN = {
    supplierRfc: "SYN010101AAA",
    amount: 67450,
    clabe: "058580000123456715",
    source: "portal",
  };

  function listedElsewhere(): () => Promise<SatIndex> {
    const index = createSatIndex([
      {
        rfc: "SYN010101AAA",
        name: "Aceros y Perfiles del Norte SA de CV",
        status: "definitivo",
        publishedAt: "2026-07-30",
        listVersion: "official-test",
      },
    ]);
    return async () => index;
  }

  it("fires on a supplier the official list carries and this instance never published", async () => {
    const { app } = createTestApp({ satList: listedElsewhere() });
    const intake = intakeResponseSchema.parse(
      await (await app.request("/api/v1/instructions", json(CLEAN))).json(),
    );
    const sat = intake.findings.find(
      (finding) => finding.detector === "sat_69b",
    );

    expect(sat?.evidence.status).toBe("definitivo");
    expect(sat?.evidence.listVersion).toBe("official-test");
    // Definitivo is provable from a published list, so the payment stops here
    // and no person has to go and check anything first.
    expect(intake.decision.action).toBe("hold");
  });

  it("says nothing when the same payment meets a list that does not carry it", async () => {
    const { app } = createTestApp();
    const intake = intakeResponseSchema.parse(
      await (await app.request("/api/v1/instructions", json(CLEAN))).json(),
    );

    expect(intake.findings).toEqual([]);
    expect(intake.decision.action).toBe("release");
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

  it("records the reason a person wrote and states the pesos at risk", async () => {
    const { app, deps } = createTestApp();
    const seen: LedgerEvent[] = [];
    deps.events.subscribe((event) => seen.push(event));

    const res = await app.request(
      `/api/v1/instructions/${SEEDED_ID}/decide`,
      json({
        action: "release",
        decidedBy: "clerk-synthetic",
        reason:
          "el proveedor confirmo la cuenta por telefono y la nomina sale hoy",
      }),
    );
    const body = decideResponseSchema.parse(await res.json());

    expect(body.decision.reason).toContain("la nomina sale hoy");
    expect(body.amountAtRisk).toBeGreaterThan(0);
    /* A release stops nothing, so there is no window and no next step. */
    expect(body.hold).toBeNull();

    /* The argument travels on the append-only event, not only in the response:
       a release nobody can explain later is not a thing this product allows. */
    const [event] = seen;
    expect(event?.type).toBe("decision_made");
    expect(
      event?.type === "decision_made" ? event.decision.reason : undefined,
    ).toContain("la nomina sale hoy");

    const detail = instructionDetailResponseSchema.parse(
      await (await app.request(`/api/v1/instructions/${SEEDED_ID}`)).json(),
    );
    expect(detail.decision?.reason).toContain("la nomina sale hoy");
  });

  it("carries no reason when nobody wrote one, rather than the last one", async () => {
    const { app } = createTestApp();

    await app.request(
      `/api/v1/instructions/${SEEDED_ID}/decide`,
      json({
        action: "release",
        decidedBy: "clerk-synthetic",
        reason: "urgente",
      }),
    );
    const res = await app.request(
      `/api/v1/instructions/${SEEDED_ID}/decide`,
      json({ action: "hold", decidedBy: "clerk-synthetic" }),
    );
    const body = decideResponseSchema.parse(await res.json());

    expect(body.decision.reason).toBeUndefined();
    expect(body.hold?.deadline).toBe("2026-09-15T03:00:00.000Z");
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

/**
 * Issue #204: a definitive SAT listing cancels the line, and only a named owner
 * reopens it with a written reason.
 *
 * The listing is made definitive through `POST /api/v1/sat/publish`, which is how
 * it happens on stage, rather than by writing a finding into the store. A test that
 * hand-built the evidence would pass with the engine unplugged.
 */
describe("reopening a line a definitive SAT listing cancelled", () => {
  /** The fixture line whose supplier the seeded 69-B list names. */
  const LISTED_ID = "ins-2026w37-02";

  async function withDefinitiveListing() {
    const harness = createTestApp();
    const detail = instructionDetailResponseSchema.parse(
      await (
        await harness.app.request(`/api/v1/instructions/${LISTED_ID}`)
      ).json(),
    );
    expect(detail.instruction.supplierRfc).toBe("SYN020202BBB");

    const published = await harness.app.request(
      "/api/v1/sat/publish",
      json({
        simulate: true,
        rfcs: [detail.instruction.supplierRfc],
        status: "definitivo",
      }),
    );
    expect(published.status).toBe(200);
    return harness;
  }

  it("reads cancelado on the line, with the rule that cancelled it", async () => {
    const { app } = await withDefinitiveListing();
    const detail = instructionDetailResponseSchema.parse(
      await (await app.request(`/api/v1/instructions/${LISTED_ID}`)).json(),
    );

    expect(detail.confidence).toBe("alerta");
    expect(detail.confidenceRule).toBe("sat_definitive");
    expect(detail.state).toBe("cancelado");
    expect(detail.stateRule).toBe("sat_definitive");
  });

  it("appends the cancellation to the ledger, with the article in the sentence", async () => {
    const { app, deps } = createTestApp();
    const seen: LedgerEvent[] = [];
    deps.events.subscribe((event) => seen.push(event));

    await app.request(
      "/api/v1/sat/publish",
      json({
        simulate: true,
        rfcs: ["SYN020202BBB"],
        status: "definitivo",
      }),
    );

    const cancelled = seen.filter(
      (event) => event.type === "payment_cancelled",
    );
    expect(cancelled.length).toBeGreaterThan(0);
    for (const event of cancelled) {
      if (event.type !== "payment_cancelled") {
        throw new Error("unreachable");
      }
      expect(event.reason).toContain("articulo 69-B");
      expect(event.reason).toContain("Solo el propietario puede reabrirla");
      /* No actor: nobody dropped the line by hand, the evidence cancelled it. */
      expect(event.actor).toBeUndefined();
    }
  });

  it("refuses a release with no X-Actor, and names the header", async () => {
    const { app } = await withDefinitiveListing();
    const res = await app.request(
      `/api/v1/instructions/${LISTED_ID}/decide`,
      json({
        action: "release",
        decidedBy: "Mariana Trevino",
        reason: "El proveedor impugno la resolucion y entrego el acuse.",
      }),
    );
    const body = (await res.json()) as ErrorBody;

    /* 400 and not 403: nothing about the caller was rejected, the request did not
       say who was acting. */
    expect(res.status).toBe(400);
    expect(body.error.code).toBe("bad_request");
    expect(body.error.message).toContain("x-actor");
  });

  it("refuses a release signed by a clerk, because this is the owner's exception", async () => {
    const { app } = await withDefinitiveListing();
    const res = await app.request(`/api/v1/instructions/${LISTED_ID}/decide`, {
      ...json({
        action: "release",
        decidedBy: "Lupita Elizondo",
        reason: "El proveedor impugno la resolucion y entrego el acuse.",
      }),
      headers: {
        "content-type": "application/json",
        "x-actor": "role=clerk; name=Lupita Elizondo",
      },
    });
    const body = (await res.json()) as ErrorBody;

    expect(res.status).toBe(403);
    expect(body.error.code).toBe("forbidden");
    expect(body.error.message).toContain("propietario");
  });

  it("refuses an owner whose name disagrees with the signature in the body", async () => {
    const { app } = await withDefinitiveListing();
    const res = await app.request(`/api/v1/instructions/${LISTED_ID}/decide`, {
      ...json({
        action: "release",
        decidedBy: "Lupita Elizondo",
        reason: "El proveedor impugno la resolucion y entrego el acuse.",
      }),
      headers: {
        "content-type": "application/json",
        "x-actor": "role=owner; name=Mariana Trevino",
      },
    });

    expect(res.status).toBe(400);
    expect(((await res.json()) as ErrorBody).error.message).toContain(
      "coincidir",
    );
  });

  it("refuses an owner who writes no reason", async () => {
    const { app } = await withDefinitiveListing();
    const res = await app.request(`/api/v1/instructions/${LISTED_ID}/decide`, {
      ...json({ action: "release", decidedBy: "Mariana Trevino" }),
      headers: {
        "content-type": "application/json",
        "x-actor": "role=owner; name=Mariana Trevino",
      },
    });
    const body = (await res.json()) as ErrorBody;

    expect(res.status).toBe(422);
    expect(body.error.code).toBe("unprocessable");
    expect(body.error.message).toContain("motivo escrito");
  });

  it("lets a named owner with a reason reopen it, and the line reads liberado", async () => {
    const { app } = await withDefinitiveListing();
    const res = await app.request(`/api/v1/instructions/${LISTED_ID}/decide`, {
      ...json({
        action: "release",
        decidedBy: "Mariana Trevino",
        reason: "El proveedor impugno la resolucion y entrego el acuse.",
      }),
      headers: {
        "content-type": "application/json",
        "x-actor": "role=owner; name=Mariana Trevino",
      },
    });

    expect(res.status).toBe(200);
    const detail = instructionDetailResponseSchema.parse(
      await (await app.request(`/api/v1/instructions/${LISTED_ID}`)).json(),
    );

    /* The signature outranks the listing, which is ADR-0002 refusing to overrule a
       person in either direction. The level does not move: the listing is still on
       the line and the letter still names the article. */
    expect(detail.state).toBe("liberado");
    expect(detail.stateRule).toBe("released");
    expect(detail.confidence).toBe("alerta");
    expect(detail.decision?.reason).toContain("impugno la resolucion");
  });

  it("leaves a hold on the same line alone, because only a release reopens", async () => {
    const { app } = await withDefinitiveListing();
    const res = await app.request(
      `/api/v1/instructions/${LISTED_ID}/decide`,
      json({ action: "hold", decidedBy: "Lupita Elizondo" }),
    );

    expect(res.status).toBe(200);
    const detail = instructionDetailResponseSchema.parse(
      await (await app.request(`/api/v1/instructions/${LISTED_ID}`)).json(),
    );
    expect(detail.state).toBe("cancelado");
  });

  it("leaves every other line's release alone, header or no header", async () => {
    /* The narrow check of this issue, stated as a test so it cannot widen by
       accident: making every write carry `X-Actor` is issue #199, and a release on
       a line with no definitive listing still goes through with no header. */
    const { app } = createTestApp();
    const res = await app.request(
      `/api/v1/instructions/${SEEDED_ID}/decide`,
      json({ action: "release", decidedBy: "clerk-synthetic" }),
    );

    expect(res.status).toBe(200);
  });
});

describe("the level and the state on the instruction detail", () => {
  it("are the same two words the run carries for that line", async () => {
    const { app } = createTestApp();
    const run = paymentRunSchema.parse(
      await (await app.request("/api/v1/run/current")).json(),
    );

    for (const item of run.items) {
      const detail = instructionDetailResponseSchema.parse(
        await (
          await app.request(`/api/v1/instructions/${item.instruction.id}`)
        ).json(),
      );

      expect(detail.confidence).toBe(item.confidence);
      expect(detail.confidenceRule).toBe(item.confidenceRule);
      expect(detail.confidenceFindingIds).toEqual(item.confidenceFindingIds);
      expect(detail.state).toBe(item.state);
      expect(detail.stateRule).toBe(item.stateRule);
    }
  });
});
