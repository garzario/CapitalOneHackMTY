import { describe, expect, it } from "bun:test";
import type { LedgerEvent } from "@hackmty/core";
import { cepVerifyResponseSchema } from "../schemas";
import { createTestApp, TEST_NOW } from "../test-app";

type ErrorBody = { error: { code: string; message: string } };

const SUPPLIER = "SYN070707GGG";
const ACCOUNT = "030580000999000119";
const CLAVE = "SYNCEP20260910001";

function json(body: unknown): RequestInit {
  return {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  };
}

describe("POST /api/v1/cep/verify", () => {
  it("returns the signed CEP and the name comparison", async () => {
    const { app } = createTestApp();
    const res = await app.request(
      "/api/v1/cep/verify",
      json({
        claveRastreo: CLAVE,
        date: "2026-09-10",
        amount: 0.01,
        senderBank: "058",
        beneficiaryBank: "030",
        beneficiaryAccount: ACCOUNT,
        supplierRfc: SUPPLIER,
      }),
    );

    expect(res.status).toBe(200);
    const body = cepVerifyResponseSchema.parse(await res.json());

    expect(body.cep.claveRastreo).toBe(CLAVE);
    expect(body.cep.signatureValid).toBe(true);
    expect(body.cep.amount).toBe(0.01);
    expect(body.nameMatch).toBe("match");
    // TODO(garzario) in pipeline.ts: the finding is authored by the detectors in
    // @hackmty/core, never by the API.
    expect(body.finding).toBeNull();
  });

  it("records the account in the registry and appends cep_verified", async () => {
    const { app, deps } = createTestApp();
    const seen: LedgerEvent[] = [];
    deps.events.subscribe((event) => seen.push(event));

    await app.request(
      "/api/v1/cep/verify",
      json({ xml: "not the signed document", supplierRfc: SUPPLIER }),
    );
    expect(seen).toHaveLength(0);

    await app.request(
      "/api/v1/cep/verify",
      json({
        claveRastreo: CLAVE,
        date: "2026-09-10",
        amount: 0.01,
        senderBank: "058",
        beneficiaryBank: "030",
        beneficiaryAccount: ACCOUNT,
        supplierRfc: SUPPLIER,
      }),
    );

    expect(seen.map((event) => event.type)).toEqual(["cep_verified"]);
    expect(seen[0]?.at).toBe(TEST_NOW);
  });

  it("refuses an account it cannot prove anything about", async () => {
    const { app } = createTestApp();
    const res = await app.request(
      "/api/v1/cep/verify",
      json({
        claveRastreo: "SYNCEP20260912999",
        date: "2026-09-12",
        amount: 0.01,
        senderBank: "058",
        beneficiaryBank: "012",
        beneficiaryAccount: "012580000987654320",
        supplierRfc: SUPPLIER,
      }),
    );
    const body = (await res.json()) as ErrorBody;

    // A signatureValid we never checked would be the most expensive lie in the
    // repo, so the stub refuses instead of answering.
    expect(res.status).toBe(422);
    expect(body.error.code).toBe("unprocessable");
    expect(body.error.message).toContain("packages/cep");
  });

  it("refuses an XML whose signature nobody validated", async () => {
    const { app } = createTestApp();
    const res = await app.request(
      "/api/v1/cep/verify",
      json({ xml: "<SPEI_Tercero />", supplierRfc: SUPPLIER }),
    );

    expect(res.status).toBe(422);
  });

  it("returns 404 when the supplier is unknown", async () => {
    const { app } = createTestApp();
    const res = await app.request(
      "/api/v1/cep/verify",
      json({ xml: "<SPEI_Tercero />", supplierRfc: "SYN999999ZZZ" }),
    );
    const body = (await res.json()) as ErrorBody;

    expect(res.status).toBe(404);
    expect(body.error.code).toBe("not_found");
  });

  it("rejects a body that is neither of the two accepted shapes", async () => {
    const { app } = createTestApp();
    const res = await app.request(
      "/api/v1/cep/verify",
      json({ claveRastreo: CLAVE, supplierRfc: SUPPLIER }),
    );

    expect(res.status).toBe(400);
  });
});
