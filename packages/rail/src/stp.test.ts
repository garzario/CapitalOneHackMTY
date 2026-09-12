/**
 * `StpRail`, the production path, tested for the half that is ours.
 *
 * The field order of the cadena original and the host come from STP's integration
 * documentation and are NOT verified against a live account: we hold no `empresa`
 * contract, and `stp.ts` says so at the top rather than implying a run that never
 * happened. What these tests prove is everything on our side of the wire and it is
 * worth proving, because it is the part that cannot be checked by reading:
 *
 * - the constructor refuses without configuration, so the rail can never pretend;
 * - the cadena original is `||` plus the 34 fields joined by `|` plus `||`, in the
 *   documented order, with an empty string for every field the order omits;
 * - `firma` is RSA with SHA-256 over exactly those bytes, which is asserted by
 *   verifying it with the public half of a key this test generates;
 * - the order carries no beneficiary name, because the name is the answer the
 *   probe exists to ask for.
 */

import { describe, expect, it } from "bun:test";
import { generateKeyPairSync, verify } from "node:crypto";
import {
  CADENA_ORIGINAL_FIELDS,
  RailConfigError,
  RailSendError,
  STP_NOT_CONFIGURED,
  STP_SANDBOX_BASE_URL,
  STP_SPEI_KEY,
  type StpConfig,
  StpRail,
  speiKeyOfClabe,
} from "./index";

const CLABE = "012180101391764613";

const { privateKey, publicKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
});

function config(overrides: Partial<StpConfig> = {}): StpConfig {
  return {
    baseUrl: STP_SANDBOX_BASE_URL,
    empresa: "SINTETICA",
    clabeOrdenante: "646180000000000001",
    privateKeyPem: privateKey.export({
      type: "pkcs8",
      format: "pem",
    }) as string,
    nombreOrdenante: "Distribuidora Sintetica del Norte SA de CV",
    rfcOrdenante: "SYN090615C01",
    ...overrides,
  };
}

function rail(handler: (body: unknown) => Response = () => ok()): {
  rail: StpRail;
  bodies: unknown[];
  urls: string[];
} {
  const bodies: unknown[] = [];
  const urls: string[] = [];
  const instance = new StpRail({
    config: config(),
    now: () => "2026-09-12T03:00:00.000Z",
    reference: () => 1234567,
    http: async (url, init) => {
      urls.push(url);
      const body =
        typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
      bodies.push(body);
      return handler(body);
    },
  });
  return { rail: instance, bodies, urls };
}

function ok(id = 9_001): Response {
  return new Response(JSON.stringify({ id }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

describe("configuration", () => {
  it("refuses to exist without the STP variables", () => {
    expect(() => new StpRail({ config: config({ empresa: "" }) })).toThrow(
      RailConfigError,
    );
    expect(() => new StpRail({ config: config({ baseUrl: "" }) })).toThrow(
      STP_NOT_CONFIGURED,
    );
    expect(
      () => new StpRail({ config: config({ privateKeyPem: "" }) }),
    ).toThrow(STP_NOT_CONFIGURED);
  });

  it("names the four variables in the refusal, so nobody hunts for a bug", () => {
    for (const name of [
      "STP_BASE_URL",
      "STP_EMPRESA",
      "STP_CLABE_ORDENANTE",
      "STP_PRIVATE_KEY_PATH",
    ]) {
      expect(STP_NOT_CONFIGURED).toContain(name);
    }
  });
});

describe("the order", () => {
  it("is one centavo to the account, with no beneficiary name on it", () => {
    const order = rail().rail.orderFor(
      { instructionId: "INS-47", beneficiaryAccount: CLABE },
      "2026-09-12T03:00:00.000Z",
    );

    expect(order.monto).toBe(0.01);
    expect(order.cuentaBeneficiario).toBe(CLABE);
    // The whole reason the probe exists is that we do not know who holds the
    // account. Sending the supplier's name would put the answer in the question.
    expect(order.nombreBeneficiario).toBe("");
    expect(order.empresa).toBe("SINTETICA");
    expect(order.institucionOperante).toBe(STP_SPEI_KEY);
    expect(order.institucionContraparte).toBe("40012");
    expect(order.fechaOperacion).toBe("20260912");
    expect(order.conceptoPago).toBe("Verificacion de cuenta SPEI 0.01 MXN");
  });

  it("builds the cadena original as the documented field order, framed by ||", () => {
    const { rail: instance } = rail();
    const order = instance.orderFor(
      { instructionId: "INS-47", beneficiaryAccount: CLABE },
      "2026-09-12T03:00:00.000Z",
    );

    const cadena = instance.cadenaOriginal(order);
    const values = cadena.slice(2, -2).split("|");

    expect(cadena.startsWith("||")).toBe(true);
    expect(cadena.endsWith("||")).toBe(true);
    expect(values).toHaveLength(CADENA_ORIGINAL_FIELDS.length);
    // Position is the contract: a field in the wrong place is a signature STP
    // rejects with no useful message.
    expect(values[CADENA_ORIGINAL_FIELDS.indexOf("empresa")]).toBe("SINTETICA");
    expect(values[CADENA_ORIGINAL_FIELDS.indexOf("claveRastreo")]).toBe(
      order.claveRastreo,
    );
    expect(values[CADENA_ORIGINAL_FIELDS.indexOf("monto")]).toBe("0.01");
    expect(values[CADENA_ORIGINAL_FIELDS.indexOf("cuentaBeneficiario")]).toBe(
      CLABE,
    );
    // Every field the order does not carry is an empty string and not the word
    // undefined, which would be a different cadena and a refused signature.
    expect(values[CADENA_ORIGINAL_FIELDS.indexOf("folioOrigen")]).toBe("");
    expect(cadena).not.toContain("undefined");
  });

  it("signs exactly those bytes, verifiably", () => {
    const { rail: instance } = rail();
    const order = instance.orderFor(
      { instructionId: "INS-47", beneficiaryAccount: CLABE },
      "2026-09-12T03:00:00.000Z",
    );

    const firma = instance.sign(order);

    expect(
      verify(
        "RSA-SHA256",
        Buffer.from(instance.cadenaOriginal(order), "utf8"),
        publicKey,
        Buffer.from(firma, "base64"),
      ),
    ).toBe(true);
    expect(Buffer.from(firma, "base64")).toHaveLength(256);
  });
});

describe("registering it", () => {
  it("PUTs the signed order to registraOrden and answers with the clave", async () => {
    const { rail: instance, bodies, urls } = rail();

    const sent = await instance.sendCent({
      instructionId: "INS-47",
      beneficiaryAccount: CLABE,
    });

    expect(urls[0]).toBe(`${STP_SANDBOX_BASE_URL}/ordenPago/registra`);
    expect(sent.rail).toBe("stp");
    expect(sent.amount).toBe(0.01);
    expect(sent.reference).toBe("9001");
    expect(sent.senderSpeiKey).toBe(STP_SPEI_KEY);
    expect(sent.simulated).toBe(false);
    expect(sent.claveRastreo).toMatch(/^STP[A-Z0-9]+$/);

    const body = bodies[0] as { firma?: string; claveRastreo?: string };
    expect(typeof body.firma).toBe("string");
    expect(body.claveRastreo).toBe(sent.claveRastreo);
  });

  /** STP answers a negative id with a description instead of an HTTP failure. */
  it("reads a negative id as a refusal and says what STP said", async () => {
    const { rail: instance } = rail(
      () =>
        new Response(
          JSON.stringify({ id: -1, descripcionError: "Firma invalida" }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
    );

    const failure = await instance
      .sendCent({ instructionId: "INS-47", beneficiaryAccount: CLABE })
      .catch((cause: unknown) => cause);

    expect(failure).toBeInstanceOf(RailSendError);
    expect((failure as RailSendError).message).toContain("Firma invalida");
  });
});

describe("speiKeyOfClabe", () => {
  it("puts the participant class in front of the institution code", () => {
    expect(speiKeyOfClabe("012180101391764613")).toBe("40012");
    expect(speiKeyOfClabe("646180000000000001")).toBe("90646");
    expect(speiKeyOfClabe("009180000000000004")).toBe("37009");
  });

  /** A participant key we invented would be an order sent to a bank nobody chose. */
  it("refuses an institution the Banxico snapshot does not carry", () => {
    expect(() => speiKeyOfClabe("999180000000000000")).toThrow(RailConfigError);
    expect(() => speiKeyOfClabe("12")).toThrow(RailConfigError);
  });
});
