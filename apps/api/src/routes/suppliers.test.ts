import { describe, expect, it } from "bun:test";
import { supplierDetailSchema } from "../schemas";
import { createTestApp } from "../test-app";

type ErrorBody = { error: { code: string; message: string } };

describe("GET /api/v1/suppliers/:rfc", () => {
  it("returns the documents and the findings for one supplier", async () => {
    const { app } = createTestApp();
    const res = await app.request("/api/v1/suppliers/SYN010101AAA");

    expect(res.status).toBe(200);
    const detail = supplierDetailSchema.parse(await res.json());

    expect(detail.supplier.legalName).toBe(
      "Aceros y Perfiles del Norte SA de CV",
    );
    expect(detail.cfdis.length).toBeGreaterThan(0);
    for (const cfdi of detail.cfdis) {
      expect(cfdi.issuerRfc).toBe("SYN010101AAA");
    }
    expect(detail.findings.map((finding) => finding.detector)).toContain(
      "clabe_forensics",
    );
  });

  it("only returns complements that belong to this supplier's CFDI", async () => {
    const { app } = createTestApp();
    const detail = supplierDetailSchema.parse(
      await (await app.request("/api/v1/suppliers/SYN010101AAA")).json(),
    );

    const uuids = new Set(detail.cfdis.map((cfdi) => cfdi.uuid));
    expect(detail.complements.length).toBeGreaterThan(0);
    for (const complement of detail.complements) {
      expect(uuids.has(complement.relatedCfdiUuid)).toBe(true);
    }
  });

  it("includes the verified beneficiary registry for the supplier", async () => {
    const { app } = createTestApp();
    const detail = supplierDetailSchema.parse(
      await (await app.request("/api/v1/suppliers/SYN070707GGG")).json(),
    );

    expect(detail.verifiedBeneficiaries).toHaveLength(1);
    expect(detail.verifiedBeneficiaries[0]?.cep.signatureValid).toBe(true);
    expect(detail.supplier.knownAccounts[0]?.establishedBy).toBe("cep");
  });

  it("accepts an RFC typed in lower case", async () => {
    const { app } = createTestApp();
    const res = await app.request("/api/v1/suppliers/syn030303ccc");

    expect(res.status).toBe(200);
    const detail = supplierDetailSchema.parse(await res.json());
    expect(detail.supplier.rfc).toBe("SYN030303CCC");
  });

  it("returns 404 for an RFC we hold nothing for", async () => {
    const { app } = createTestApp();
    const res = await app.request("/api/v1/suppliers/SYN999999ZZZ");
    const body = (await res.json()) as ErrorBody;

    expect(res.status).toBe(404);
    expect(body.error.code).toBe("not_found");
  });

  it("rejects something that is not RFC shaped", async () => {
    const { app } = createTestApp();
    const res = await app.request("/api/v1/suppliers/not-an-rfc");
    const body = (await res.json()) as ErrorBody;

    expect(res.status).toBe(400);
    expect(body.error.code).toBe("bad_request");
  });
});
