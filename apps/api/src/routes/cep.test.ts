import { describe, expect, it } from "bun:test";
import { generateKeyPairSync } from "node:crypto";
import { syntheticCepXml } from "@hackmty/cep";
import type { LedgerEvent } from "@hackmty/core";
import { acceptOnlyCepSource, createCepSource } from "../cep";
import { cepVerifyResponseSchema } from "../schemas";
import { createTestApp, TEST_NOW } from "../test-app";

type ErrorBody = { error: { code: string; message: string } };

/** The supplier the hand-written fixture has already probed with one cent. */
const SUPPLIER = "SYN070707GGG";
const ACCOUNT = "030580000999000119";
const CLAVE = "SYNCEP20260910001";
/** The line of the payment run that pays `ACCOUNT`. */
const INSTRUCTION = "ins-2026w37-07";

/** A supplier the fixture holds with no probe and no pending payment to it. */
const UNPROBED_SUPPLIER = "SYN040404DDD";

function json(body: unknown): RequestInit {
  return {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  };
}

const BY_CLAVE = {
  claveRastreo: CLAVE,
  date: "2026-09-10",
  amount: 0.01,
  senderBank: "058",
  beneficiaryBank: "030",
  beneficiaryAccount: ACCOUNT,
  supplierRfc: SUPPLIER,
};

/**
 * A real RSA public key that signed nothing in this repository.
 *
 * It is generated per test rather than committed, because the point of the
 * assertion is that the crypto ran at all: `verifySignature` reports
 * `unconfirmed_scheme` whatever the key says, since Banxico publishes no
 * specification of the scheme. See CEP_SIGNATURE_SCHEME_CONFIRMED.
 */
function aPublicKeyPem(): string {
  return generateKeyPairSync("rsa", { modulusLength: 2048 })
    .publicKey.export({ type: "spki", format: "pem" })
    .toString();
}

/** A portal that answers the two-step form with the committed fixture. */
function portalServing(xml: string): (input: string) => Promise<Response> {
  return async (input) =>
    new Response(
      input.includes("descarga.do") ? xml : "<html>consulta valida</html>",
      { status: 200, headers: { "set-cookie": "JSESSIONID=test; Path=/" } },
    );
}

describe("POST /api/v1/cep/verify, from the registry", () => {
  it("returns the CEP and the name comparison", async () => {
    const { app } = createTestApp();
    const res = await app.request("/api/v1/cep/verify", json(BY_CLAVE));

    expect(res.status).toBe(200);
    const body = cepVerifyResponseSchema.parse(await res.json());

    expect(body.cep.claveRastreo).toBe(CLAVE);
    expect(body.cep.amount).toBe(0.01);
    expect(body.nameMatch).toBe("match");
  });

  /**
   * The finding is the engine's, and this asserts it by its identity rather than
   * by its text: `beneficiary_cep` is control 5 in `packages/engine`, the id is
   * the one that adapter mints, and the subject is the instruction the CEP is
   * evidence about. An API that authored its own version of this finding would
   * be a second product.
   */
  it("answers with the engine's finding, on the line that pays the account", async () => {
    const { app } = createTestApp();
    const res = await app.request("/api/v1/cep/verify", json(BY_CLAVE));
    const body = cepVerifyResponseSchema.parse(await res.json());

    expect(body.finding).not.toBeNull();
    expect(body.finding?.detector).toBe("beneficiary_cep");
    expect(body.finding?.id).toBe(`cep:${CLAVE}:${SUPPLIER}`);
    expect(body.finding?.subject).toEqual({
      kind: "instruction",
      id: INSTRUCTION,
    });
    expect(body.finding?.evidence.nameMatch).toBe("match");
  });

  it("records the account in the registry and appends cep_verified", async () => {
    const { app, deps } = createTestApp();
    const seen: LedgerEvent[] = [];
    deps.events.subscribe((event) => seen.push(event));

    await app.request("/api/v1/cep/verify", json(BY_CLAVE));

    expect(seen.map((event) => event.type)).toEqual(["cep_verified"]);
    expect(seen[0]?.at).toBe(TEST_NOW);
  });
});

describe("POST /api/v1/cep/verify, a pasted CEP", () => {
  it("parses the signed XML the clerk pasted", async () => {
    const { app } = createTestApp();
    const res = await app.request(
      "/api/v1/cep/verify",
      json({ xml: syntheticCepXml(), supplierRfc: UNPROBED_SUPPLIER }),
    );

    expect(res.status).toBe(200);
    const body = cepVerifyResponseSchema.parse(await res.json());

    expect(body.cep.claveRastreo).toBe("SYN20260912000000001");
    expect(body.cep.beneficiaryAccount).toBe("014180000000123453");
    expect(body.cep.beneficiaryName).toBe(
      "DISTRIBUIDORA SINTETICA DEL PONIENTE SA",
    );
    // The holder is not the company on the invoice. That is the whole control.
    expect(body.nameMatch).toBe("mismatch");
  });

  /**
   * The most important assertion in this file. A `signatureValid: true` nobody
   * earned is the single most expensive lie this repository could tell, so a
   * server with no Banxico certificate answers "not checked" and says so.
   */
  it("never claims a seal this server has not checked", async () => {
    const { app } = createTestApp();
    const res = await app.request(
      "/api/v1/cep/verify",
      json({ xml: syntheticCepXml(), supplierRfc: UNPROBED_SUPPLIER }),
    );
    const body = cepVerifyResponseSchema.parse(await res.json());

    expect(body.cep.signatureValid).toBe(false);
    expect(body.cep.signatureReason).toBe("not_checked");
  });

  it("checks the seal when the server holds a certificate", async () => {
    const { app } = createTestApp({
      cep: acceptOnlyCepSource(aPublicKeyPem()),
    });
    const res = await app.request(
      "/api/v1/cep/verify",
      json({ xml: syntheticCepXml(), supplierRfc: UNPROBED_SUPPLIER }),
    );
    const body = cepVerifyResponseSchema.parse(await res.json());

    // The crypto ran. It still cannot say "valid", because the scheme Banxico
    // uses is unpublished, and "no verificada" is not "invalida".
    expect(body.cep.signatureReason).toBe("unconfirmed_scheme");
    expect(body.cep.signatureValid).toBe(false);
    expect(body.cep.numeroCertificado).toBe("00000100000100099999");
  });

  it("stores the pasted CEP in the registry of verified beneficiaries", async () => {
    const { app, deps } = createTestApp();
    await app.request(
      "/api/v1/cep/verify",
      json({ xml: syntheticCepXml(), supplierRfc: UNPROBED_SUPPLIER }),
    );

    const rows = await deps.repo.beneficiaries();
    expect(
      rows.some(
        (row) =>
          row.supplierRfc === UNPROBED_SUPPLIER &&
          row.clabe === "014180000000123453",
      ),
    ).toBe(true);
  });

  /**
   * A verification run ahead of any instruction puts no pesos at risk, so there
   * is nothing for a finding to be about. The registry row is the lasting record.
   */
  it("answers a null finding when no pending payment goes to that account", async () => {
    const { app } = createTestApp();
    const res = await app.request(
      "/api/v1/cep/verify",
      json({ xml: syntheticCepXml(), supplierRfc: UNPROBED_SUPPLIER }),
    );
    const body = cepVerifyResponseSchema.parse(await res.json());

    expect(body.finding).toBeNull();
  });

  it("refuses a document that is not a CEP, and appends nothing", async () => {
    const { app, deps } = createTestApp();
    const seen: LedgerEvent[] = [];
    deps.events.subscribe((event) => seen.push(event));

    const res = await app.request(
      "/api/v1/cep/verify",
      json({ xml: "not the signed document", supplierRfc: SUPPLIER }),
    );
    const body = (await res.json()) as ErrorBody;

    expect(res.status).toBe(422);
    expect(body.error.code).toBe("unprocessable");
    expect(seen).toHaveLength(0);
  });

  it("refuses a CEP-shaped document with none of the fields", async () => {
    const { app } = createTestApp();
    const res = await app.request(
      "/api/v1/cep/verify",
      json({ xml: "<SPEI_Tercero />", supplierRfc: SUPPLIER }),
    );

    expect(res.status).toBe(422);
  });
});

describe("POST /api/v1/cep/verify, retrieval from Banxico", () => {
  /** The account nothing in the fixture has probed, so the registry misses. */
  const UNKNOWN_ACCOUNT = {
    claveRastreo: "SYNCEP20260912999",
    date: "2026-09-12",
    amount: 184300,
    senderBank: "058",
    beneficiaryBank: "012",
    beneficiaryAccount: "012580000987654321",
    supplierRfc: SUPPLIER,
  };

  it("is off by default and says how to proceed instead", async () => {
    const { app } = createTestApp();
    const res = await app.request("/api/v1/cep/verify", json(UNKNOWN_ACCOUNT));
    const body = (await res.json()) as ErrorBody;

    expect(res.status).toBe(422);
    expect(body.error.code).toBe("unprocessable");
    expect(body.error.message).toContain("ALLOW_CEP_FETCH");
    expect(body.error.message).toContain("packages/cep");
  });

  it("fetches the CEP through the portal when it is enabled", async () => {
    const { app, deps } = createTestApp({
      cep: createCepSource({
        allowRetrieval: true,
        http: portalServing(syntheticCepXml()),
      }),
    });
    const seen: LedgerEvent[] = [];
    deps.events.subscribe((event) => seen.push(event));

    const res = await app.request("/api/v1/cep/verify", json(UNKNOWN_ACCOUNT));

    expect(res.status).toBe(200);
    const body = cepVerifyResponseSchema.parse(await res.json());
    expect(body.cep.claveRastreo).toBe("SYN20260912000000001");
    expect(body.cep.signatureReason).toBe("not_checked");
    expect(seen.map((event) => event.type)).toEqual(["cep_verified"]);
  });

  it("prefers the registry over the portal for an account already probed", async () => {
    let calls = 0;
    const { app } = createTestApp({
      cep: createCepSource({
        allowRetrieval: true,
        http: async (input) => {
          calls += 1;
          return portalServing(syntheticCepXml())(input);
        },
      }),
    });

    const res = await app.request("/api/v1/cep/verify", json(BY_CLAVE));

    expect(res.status).toBe(200);
    // A public government service is not consulted for something we hold.
    expect(calls).toBe(0);
  });

  it("turns a portal rate limit into a sentence and stores nothing", async () => {
    const { app, deps } = createTestApp({
      cep: createCepSource({
        allowRetrieval: true,
        http: async () =>
          new Response(
            "<html>Ha excedido el número máximo de consultas</html>",
            { status: 200 },
          ),
      }),
    });
    const seen: LedgerEvent[] = [];
    deps.events.subscribe((event) => seen.push(event));

    const res = await app.request("/api/v1/cep/verify", json(UNKNOWN_ACCOUNT));
    const body = (await res.json()) as ErrorBody;

    expect(res.status).toBe(422);
    expect(body.error.message).toContain("banxico.org.mx/cep");
    expect(seen).toHaveLength(0);
  });

  it("survives the portal being unreachable", async () => {
    const { app } = createTestApp({
      cep: createCepSource({
        allowRetrieval: true,
        http: async () => {
          throw new TypeError("fetch failed");
        },
      }),
    });

    const res = await app.request("/api/v1/cep/verify", json(UNKNOWN_ACCOUNT));

    expect(res.status).toBe(422);
  });

  it("reports a transfer Banxico does not know about", async () => {
    const { app } = createTestApp({
      cep: createCepSource({
        allowRetrieval: true,
        http: async () =>
          new Response(
            "<html>No se encontró ningún pago con la información proporcionada</html>",
            { status: 200 },
          ),
      }),
    });

    const res = await app.request("/api/v1/cep/verify", json(UNKNOWN_ACCOUNT));
    const body = (await res.json()) as ErrorBody;

    expect(res.status).toBe(422);
    expect(body.error.message).toContain("clave de rastreo");
  });
});

describe("POST /api/v1/cep/verify, the basics", () => {
  it("returns 404 when the supplier is unknown", async () => {
    const { app } = createTestApp();
    const res = await app.request(
      "/api/v1/cep/verify",
      json({ xml: syntheticCepXml(), supplierRfc: "SYN999999ZZZ" }),
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
