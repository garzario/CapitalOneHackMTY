/**
 * The fixtures, and the two things they must never stop being: readable by the
 * parser, and unmistakably synthetic.
 *
 * The index by clave de rastreo is what the one-cent pipeline asks before it asks
 * Banxico, so "the committed document for this clave" has to be a lookup somebody
 * can trust: the wrong clave answers nothing, never something close.
 */

import { describe, expect, it } from "bun:test";
import {
  cepByClave,
  committedCeps,
  SYNTHETIC_CERTIFICATE_SERIAL,
  SYNTHETIC_SPEI_KEY,
  type SyntheticCepFields,
  syntheticCep,
  syntheticCepFor,
  syntheticCepXmlFor,
} from "./fixtures";
import { nameMatch } from "./name-match";
import { parseCep } from "./parse";
import { verifySignature } from "./signature";

const FIELDS: SyntheticCepFields = {
  claveRastreo: "SYNVER0000000001",
  transferredAt: "2026-09-12T09:15:42.000-06:00",
  amount: 0.01,
  senderName: "Distribuidora Sintetica del Norte SA de CV",
  senderBank: "SinteticoDos",
  senderAccount: "012180000123456782",
  senderRfc: "SYN090615C01",
  beneficiaryName: "MAQUINADOS INDUSTRIALES REGIOS SA DE CV",
  beneficiaryBank: "SinteticoUno",
  beneficiaryAccount: "012180101391764613",
  beneficiaryRfc: "SYN990202S02",
  concepto: "Verificacion de cuenta",
};

describe("the committed index", () => {
  it("finds the synthetic fixture by its clave de rastreo", () => {
    const fixture = syntheticCep();

    expect(cepByClave(fixture.claveRastreo)?.xml).toBe(fixture.xml);
    expect(cepByClave(fixture.claveRastreo.toLowerCase())?.claveRastreo).toBe(
      fixture.claveRastreo,
    );
  });

  it("answers nothing for a clave we hold no document for", () => {
    expect(cepByClave("SYN00000000000000000")).toBeUndefined();
    expect(cepByClave("")).toBeUndefined();
  });

  it("holds only documents flagged synthetic, which drives the watermark", () => {
    for (const cep of committedCeps()) {
      expect(cep.synthetic).toBe(true);
      // Parsing proves authorship of nothing, and no committed fixture may claim
      // a Banxico signature nobody validated.
      expect(cep.signatureValid).toBe(false);
    }
  });
});

describe("syntheticCepXmlFor", () => {
  it("renders a document the parser reads back field for field", () => {
    const cep = syntheticCepFor(FIELDS);

    expect(cep.claveRastreo).toBe(FIELDS.claveRastreo);
    expect(cep.amount).toBe(0.01);
    expect(cep.beneficiaryName).toBe(FIELDS.beneficiaryName);
    expect(cep.beneficiaryAccount).toBe(FIELDS.beneficiaryAccount);
    expect(cep.beneficiaryBank).toBe(FIELDS.beneficiaryBank);
    expect(cep.senderName).toBe(FIELDS.senderName);
    // A CEP states a day and a wall clock and `parseCep` stamps the Mexico City
    // offset on it, which is where the seconds-precision instant comes from.
    expect(cep.transferredAt).toBe("2026-09-12T09:15:42-06:00");
    expect(cep.synthetic).toBe(true);
  });

  /**
   * The document says what it is even in a screenshot with the watermark cropped
   * off: the participant key is outside the assigned range and the certificate
   * serial is invented.
   */
  it("marks itself synthetic in the document, not only in the flag", () => {
    const xml = syntheticCepXmlFor(FIELDS);

    expect(xml).toContain(`ClaveSPEI="${SYNTHETIC_SPEI_KEY}"`);
    expect(xml).toContain(
      `numeroCertificado="${SYNTHETIC_CERTIFICATE_SERIAL}"`,
    );
  });

  it("is deterministic, so the same fields render the same bytes", () => {
    expect(syntheticCepXmlFor(FIELDS)).toBe(syntheticCepXmlFor(FIELDS));
  });

  it("carries a 256-byte sello that no certificate will ever validate", () => {
    const cep = syntheticCepFor(FIELDS);
    const sello = /sello="([^"]+)"/.exec(cep.xml)?.[1] ?? "";

    expect(Buffer.from(sello, "base64")).toHaveLength(256);
    // It is 256 deterministic bytes and not a signature: the structural half of
    // the check passes and the cryptographic half cannot.
    expect(verifySignature(cep.xml, "not a certificate").valid).toBe(false);
  });

  it("escapes a name that would otherwise break the XML", () => {
    const cep = syntheticCepFor({
      ...FIELDS,
      beneficiaryName: 'GRUPO "SINTETICO" & ASOCIADOS',
    });

    expect(cep.beneficiaryName).toBe('GRUPO "SINTETICO" & ASOCIADOS');
    expect(parseCep(cep.xml).beneficiaryName).toBe(
      'GRUPO "SINTETICO" & ASOCIADOS',
    );
  });

  /**
   * The two outcomes the verification pipeline turns on, built from the same
   * function: a holder who is the supplier and a holder who is somebody else.
   */
  it("can render both sides of the name comparison", () => {
    const legalName = "Maquinados Industriales Regios SA de CV";
    const matching = syntheticCepFor(FIELDS);
    const other = syntheticCepFor({
      ...FIELDS,
      claveRastreo: "SYNVER0000000002",
      beneficiaryName: "COMERCIALIZADORA VERTICE DEL GOLFO SA DE CV",
    });

    expect(nameMatch(matching.beneficiaryName, legalName)).toBe("match");
    expect(nameMatch(other.beneficiaryName, legalName)).toBe("mismatch");
  });
});
