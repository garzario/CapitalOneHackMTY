/**
 * These tests prove two separate things and it matters that they stay separate.
 *
 * One: the crypto plumbing is real. A CEP-shaped document signed with a key we
 * generate here is reported as cryptographically matching, for exactly the one
 * candidate that produced it. That is what makes the candidate matrix worth
 * running against the golden file from issue #57.
 *
 * Two: we still do not claim a valid CEP signature. Even on the document we
 * signed ourselves, `valid` is false and the reason is `unconfirmed_scheme`,
 * because what is unconfirmed is Banxico's scheme, not our RSA call.
 *
 * No key material is committed. The keypair is generated inside the test.
 */

import { describe, expect, it } from "bun:test";
import { createSign, generateKeyPairSync } from "node:crypto";
import { syntheticCepXml } from "./fixtures";
import {
  CEP_SIGNATURE_SCHEME_CONFIRMED,
  cadenaWithoutSello,
  verifySignature,
} from "./signature";

const { privateKey, publicKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
});
const publicKeyPem = publicKey.export({
  type: "spki",
  format: "pem",
}) as string;

/**
 * The accent is load-bearing: it is the only reason the utf8 and latin1
 * candidates produce different bytes, so exactly one of them can match.
 */
const CADENA_HEAD =
  "||3|11092026|11092026|164207|99999|SinteticoDos|GRUPO MU\u00d1OZ|40|012180000123456782|00000100000100099999";

function signedCep(
  hash: "sha256" | "sha1",
  encoding: "utf8" | "latin1",
): { xml: string; sello: string } {
  const signer = createSign(hash);
  signer.update(Buffer.from(CADENA_HEAD, encoding));
  signer.end();
  const sello = signer.sign(privateKey).toString("base64");
  const cadena = `${CADENA_HEAD}||${sello}`;
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<SPEI_Tercero FechaOperacion="2026-09-11" Hora="16:42:07" ClaveSPEI="99999" sello="${sello}" numeroCertificado="00000100000100099999" cadenaCDA="${cadena.replace(/&/g, "&amp;")}" claveRastreo="SYN1">
  <Beneficiario BancoReceptor="SinteticoUno" Nombre="ACME SINTETICA" TipoCuenta="40" Cuenta="014180000000123453" RFC="SYN010101AAA" Concepto="PAGO" IVA="0.00" MontoPago="100.00"/>
  <Ordenante BancoEmisor="SinteticoDos" Nombre="GRUPO MU\u00d1OZ" TipoCuenta="40" Cuenta="012180000123456782" RFC="SYN020202BBB"/>
</SPEI_Tercero>`;
  return { xml, sello };
}

describe("verifySignature runs the candidate matrix for real", () => {
  it("matches exactly the candidate that signed the document", () => {
    const { xml } = signedCep("sha256", "utf8");
    const result = verifySignature(xml, publicKeyPem);
    const matched = result.attempts.filter((attempt) => attempt.matched);
    expect(matched).toEqual([
      {
        hash: "sha256",
        cadena: "without_sello",
        encoding: "utf8",
        matched: true,
      },
    ]);
  });

  it("distinguishes the latin1 candidate from the utf8 one", () => {
    const { xml } = signedCep("sha256", "latin1");
    const matched = verifySignature(xml, publicKeyPem).attempts.filter(
      (attempt) => attempt.matched,
    );
    expect(matched).toEqual([
      {
        hash: "sha256",
        cadena: "without_sello",
        encoding: "latin1",
        matched: true,
      },
    ]);
  });

  it("distinguishes the hash as well as the encoding", () => {
    const { xml } = signedCep("sha1", "utf8");
    const matched = verifySignature(xml, publicKeyPem).attempts.filter(
      (attempt) => attempt.matched,
    );
    expect(matched).toEqual([
      {
        hash: "sha1",
        cadena: "without_sello",
        encoding: "utf8",
        matched: true,
      },
    ]);
  });

  it("tries every hash, cadena variant and encoding when both variants exist", () => {
    const { xml } = signedCep("sha256", "utf8");
    const attempts = verifySignature(xml, publicKeyPem).attempts;
    expect(attempts.length).toBe(12);
    expect(new Set(attempts.map((attempt) => attempt.hash)).size).toBe(3);
  });

  it("matches nothing when the certificate belongs to somebody else", () => {
    const { xml } = signedCep("sha256", "utf8");
    const other = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const otherPem = other.publicKey.export({
      type: "spki",
      format: "pem",
    }) as string;
    const result = verifySignature(xml, otherPem);
    expect(result.attempts.some((attempt) => attempt.matched)).toBe(false);
  });
});

describe("verifySignature never claims a CEP signature is valid", () => {
  it("reports unconfirmed_scheme even on a document we signed ourselves", () => {
    const { xml } = signedCep("sha256", "utf8");
    const result = verifySignature(xml, publicKeyPem);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("unconfirmed_scheme");
    expect(result.numeroCertificado).toBe("00000100000100099999");
  });

  it("keeps the confirmation flag off until the golden file lands", () => {
    expect(CEP_SIGNATURE_SCHEME_CONFIRMED).toBe(false);
  });

  it("reports unconfirmed_scheme on the synthetic fixture, whose sello is noise", () => {
    const result = verifySignature(syntheticCepXml(), publicKeyPem);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("unconfirmed_scheme");
    expect(result.attempts.some((attempt) => attempt.matched)).toBe(false);
  });
});

describe("verifySignature separates structural failures from the scheme", () => {
  it("says malformed_xml for something that is not a CEP", () => {
    const result = verifySignature("no soy un CEP", publicKeyPem);
    expect(result.reason).toBe("malformed_xml");
    expect(result.attempts).toEqual([]);
  });

  it("says missing_sello when the seal attribute is absent", () => {
    const xml = syntheticCepXml().replace(/ sello="[^"]*"/, "");
    expect(verifySignature(xml, publicKeyPem).reason).toBe("missing_sello");
  });

  it("says malformed_sello when the seal is not base64", () => {
    const xml = syntheticCepXml().replace(
      / sello="[^"]*"/,
      ' sello="not base64!"',
    );
    expect(verifySignature(xml, publicKeyPem).reason).toBe("malformed_sello");
  });

  it("says malformed_sello when the seal is base64 of the wrong length", () => {
    const xml = syntheticCepXml().replace(/ sello="[^"]*"/, ' sello="AAAA"');
    const result = verifySignature(xml, publicKeyPem);
    expect(result.reason).toBe("malformed_sello");
    expect(result.detail).toContain("3 bytes");
  });

  it("says missing_cadena when there is nothing to hash", () => {
    const xml = syntheticCepXml().replace(
      / cadenaCDA="[^"]*"/,
      ' cadenaCDA=""',
    );
    expect(verifySignature(xml, publicKeyPem).reason).toBe("missing_cadena");
  });

  it("says invalid_certificate rather than throwing at the caller", () => {
    const result = verifySignature(
      syntheticCepXml(),
      "-----BEGIN CERTIFICATE-----\nnope\n-----END CERTIFICATE-----",
    );
    expect(result.reason).toBe("invalid_certificate");
    expect(result.attempts).toEqual([]);
  });
});

describe("cadenaWithoutSello", () => {
  it("strips the trailing seal, because a signature cannot cover itself", () => {
    expect(cadenaWithoutSello("A|B|00001||ZZZ", "ZZZ")).toBe("A|B|00001");
  });

  it("returns undefined when the seal is not the last field, rather than guessing", () => {
    expect(cadenaWithoutSello("A|ZZZ|B", "ZZZ")).toBeUndefined();
  });

  it("drops the without_sello candidate entirely when it cannot be derived", () => {
    const xml = syntheticCepXml().replace(
      / cadenaCDA="[^"]*"/,
      ' cadenaCDA="||3|no trae el sello al final"',
    );
    const attempts = verifySignature(xml, publicKeyPem).attempts;
    expect(attempts.length).toBe(6);
    expect(attempts.every((attempt) => attempt.cadena === "full")).toBe(true);
  });
});
