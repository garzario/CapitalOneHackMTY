import { describe, expect, it } from "bun:test";
import { beneficiariesResponseSchema } from "../schemas";
import { createTestApp } from "../test-app";

describe("GET /api/v1/beneficiaries", () => {
  it("lists each verified account with the CEP it was proven with", async () => {
    const { app } = createTestApp();
    const res = await app.request("/api/v1/beneficiaries");

    expect(res.status).toBe(200);
    const body = beneficiariesResponseSchema.parse(await res.json());

    expect(body.items).toHaveLength(1);
    const row = body.items[0];
    expect(row?.supplierRfc).toBe("SYN070707GGG");
    expect(row?.clabe).toBe(row?.cep.beneficiaryAccount);
    expect(row?.cep.signatureValid).toBe(true);
    expect(row?.cep.synthetic).toBe(true);
  });

  it("grows when a beneficiary is verified", async () => {
    const { app, deps } = createTestApp();
    await deps.repo.saveVerifiedBeneficiary({
      supplierRfc: "SYN030303CCC",
      clabe: "072580000456123788",
      cep: {
        claveRastreo: "SYNCEP20260912002",
        transferredAt: "2026-09-12T02:00:00.000Z",
        amount: 0.01,
        senderName: "Ensambles del Poniente SA de CV",
        senderBank: "058",
        beneficiaryName: "Transportes Cumbres SA de CV",
        beneficiaryAccount: "072580000456123788",
        beneficiaryBank: "072",
        signatureValid: true,
        xml: '<SPEI_Tercero sintetico="true" />',
        synthetic: true,
      },
      verifiedAt: "2026-09-12T02:00:05.000Z",
    });

    const body = beneficiariesResponseSchema.parse(
      await (await app.request("/api/v1/beneficiaries")).json(),
    );

    expect(body.items).toHaveLength(2);
  });
});
