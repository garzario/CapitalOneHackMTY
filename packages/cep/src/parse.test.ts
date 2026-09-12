/**
 * Every case here runs on the synthetic fixture or on a string built in the test.
 * No real CEP, no real name, no network.
 */

import { describe, expect, it } from "bun:test";
import { syntheticCep, syntheticCepXml } from "./fixtures";
import {
  CEP_UTC_OFFSET,
  CepParseError,
  cepAmount,
  cepTimestamp,
  parseCep,
  readCepAttributes,
} from "./parse";

const MINIMAL = `<?xml version="1.0" encoding="UTF-8"?>
<SPEI_Tercero FechaOperacion="2026-09-11" Hora="16:42:07" ClaveSPEI="99999" sello="AA==" numeroCertificado="00000100000100099999" cadenaCDA="||3" claveRastreo="SYN1">
  <Beneficiario BancoReceptor="SinteticoUno" Nombre="ACME SINTETICA" TipoCuenta="40" Cuenta="014180000000123453" RFC="SYN010101AAA" Concepto="PAGO" IVA="0.00" MontoPago="100.00"/>
  <Ordenante BancoEmisor="SinteticoDos" Nombre="PAGADOR SINTETICO" TipoCuenta="40" Cuenta="012180000123456782" RFC="SYN020202BBB"/>
</SPEI_Tercero>`;

function withoutAttribute(xml: string, name: string): string {
  return xml.replace(new RegExp(`\\s${name}="[^"]*"`), "");
}

describe("parseCep on the synthetic fixture", () => {
  const cep = syntheticCep();

  it("reads every field the domain Cep models", () => {
    expect(cep.claveRastreo).toBe("SYN20260912000000001");
    expect(cep.amount).toBe(184300);
    expect(cep.senderBank).toBe("SinteticoDos");
    expect(cep.senderAccount).toBe("012180000123456782");
    expect(cep.beneficiaryName).toBe("DISTRIBUIDORA SINTETICA DEL PONIENTE SA");
    expect(cep.beneficiaryAccount).toBe("014180000000123453");
    expect(cep.beneficiaryBank).toBe("SinteticoUno");
    expect(cep.beneficiaryRfc).toBe("SYN010101AAA");
    expect(cep.concepto).toBe("PAGO FACTURA SYN-1042");
    expect(cep.numeroCertificado).toBe("00000100000100099999");
  });

  it("decodes entities in the sender name, so N tilde and ampersand survive", () => {
    expect(cep.senderName).toBe("GRUPO SINTETICO MU\u00d1OZ & ASOCIADOS");
  });

  it("joins FechaOperacion and Hora into one instant at the fixed Mexico offset", () => {
    expect(cep.transferredAt).toBe(`2026-09-11T16:42:07${CEP_UTC_OFFSET}`);
    expect(new Date(cep.transferredAt).toISOString()).toBe(
      "2026-09-11T22:42:07.000Z",
    );
  });

  it("keeps the XML byte-exact, because the signature is over bytes", () => {
    expect(cep.xml).toBe(syntheticCepXml());
  });

  it("claims nothing about the signature just because parsing worked", () => {
    expect(cep.signatureValid).toBe(false);
    expect(cep.signatureReason).toBe("not_checked");
  });

  it("carries synthetic only when the caller says so, never by inference", () => {
    expect(cep.synthetic).toBe(true);
    expect(parseCep(syntheticCepXml()).synthetic).toBe(false);
  });
});

describe("parseCep tolerates how producers differ", () => {
  it("does not care whether Beneficiario or Ordenante comes first", () => {
    const swapped = `<?xml version="1.0" encoding="UTF-8"?>
<SPEI_Tercero FechaOperacion="2026-09-11" Hora="16:42:07" ClaveSPEI="99999" sello="AA==" numeroCertificado="1" cadenaCDA="||3" claveRastreo="SYN1">
  <Ordenante BancoEmisor="SinteticoDos" Nombre="PAGADOR SINTETICO" TipoCuenta="40" Cuenta="012180000123456782" RFC="SYN020202BBB"/>
  <Beneficiario BancoReceptor="SinteticoUno" Nombre="ACME SINTETICA" TipoCuenta="40" Cuenta="014180000000123453" RFC="SYN010101AAA" Concepto="PAGO" IVA="0.00" MontoPago="100.00"/>
</SPEI_Tercero>`;
    const fromSwapped = parseCep(swapped);
    const fromMinimal = parseCep(MINIMAL);
    expect(fromSwapped.senderName).toBe(fromMinimal.senderName);
    expect(fromSwapped.beneficiaryName).toBe(fromMinimal.beneficiaryName);
  });

  it("accepts a BOM, CRLF line endings and a namespace declaration", () => {
    const messy = `\ufeff${MINIMAL.replace(
      "<SPEI_Tercero ",
      '<SPEI_Tercero xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" ',
    ).replace(/\n/g, "\r\n")}`;
    expect(parseCep(messy).claveRastreo).toBe("SYN1");
  });

  it("treats a missing optional attribute as absent instead of empty string", () => {
    const cep = parseCep(withoutAttribute(MINIMAL, "Concepto"));
    expect(cep.concepto).toBeUndefined();
  });
});

describe("parseCep refuses what it cannot read", () => {
  it("rejects a document that is not XML", () => {
    expect(() => parseCep("no soy un CEP")).toThrow(CepParseError);
    try {
      parseCep("no soy un CEP");
    } catch (error) {
      expect((error as CepParseError).code).toBe("not_xml");
    }
  });

  it("rejects a CFDI, which is XML with the wrong root", () => {
    try {
      parseCep('<cfdi:Comprobante Version="4.0"/>');
      throw new Error("expected a throw");
    } catch (error) {
      expect((error as CepParseError).code).toBe("wrong_root");
    }
  });

  it("rejects a CEP with no Ordenante", () => {
    const xml = MINIMAL.replace(/<Ordenante[^>]*\/>/, "");
    try {
      parseCep(xml);
      throw new Error("expected a throw");
    } catch (error) {
      expect((error as CepParseError).code).toBe("missing_element");
    }
  });

  it("rejects a CEP with no claveRastreo, the key the whole product turns on", () => {
    try {
      parseCep(withoutAttribute(MINIMAL, "claveRastreo"));
      throw new Error("expected a throw");
    } catch (error) {
      expect((error as CepParseError).code).toBe("missing_attribute");
    }
  });
});

describe("cepAmount", () => {
  it("reads a decimal amount in major units", () => {
    expect(cepAmount("184300.00")).toBe(184300);
    expect(cepAmount("1234.56")).toBe(1234.56);
  });

  it("refuses zero instead of defaulting, so no run silently costs nothing", () => {
    expect(() => cepAmount("0.00")).toThrow(CepParseError);
  });

  it("refuses a negative amount and a non-numeric amount", () => {
    expect(() => cepAmount("-1.00")).toThrow(CepParseError);
    expect(() => cepAmount("CIEN PESOS")).toThrow(CepParseError);
  });
});

describe("cepTimestamp", () => {
  it("refuses a date that is not YYYY-MM-DD instead of guessing", () => {
    expect(() => cepTimestamp("11-09-2026", "16:42:07")).toThrow(CepParseError);
  });

  it("refuses a time that is not HH:MM:SS", () => {
    expect(() => cepTimestamp("2026-09-11", "4:42 PM")).toThrow(CepParseError);
  });

  it("refuses a well-shaped date that is not a real day", () => {
    expect(() => cepTimestamp("2026-02-31", "00:00:00")).toThrow(CepParseError);
    expect(() => cepTimestamp("2026-13-01", "00:00:00")).toThrow(CepParseError);
  });

  it("accepts a leap day in a leap year and refuses it in a common one", () => {
    expect(cepTimestamp("2028-02-29", "09:00:00")).toBe(
      `2028-02-29T09:00:00${CEP_UTC_OFFSET}`,
    );
    expect(() => cepTimestamp("2026-02-29", "09:00:00")).toThrow(CepParseError);
  });

  it("refuses a well-shaped time that is not a real time", () => {
    expect(() => cepTimestamp("2026-09-11", "25:00:00")).toThrow(CepParseError);
    expect(() => cepTimestamp("2026-09-11", "16:60:00")).toThrow(CepParseError);
  });

  it("keeps fractional seconds, which the schema allows", () => {
    expect(cepTimestamp("2026-09-11", "16:42:07.250")).toBe(
      `2026-09-11T16:42:07.250${CEP_UTC_OFFSET}`,
    );
  });
});

describe("readCepAttributes", () => {
  it("exposes what the domain Cep does not model, with no second model", () => {
    const { root, beneficiario, ordenante } = readCepAttributes(
      syntheticCepXml(),
    );
    expect(root.ClaveSPEI).toBe("99999");
    expect(root.cadenaCDA?.startsWith("||3|11092026")).toBe(true);
    expect(beneficiario.TipoCuenta).toBe("40");
    expect(beneficiario.IVA).toBe("25420.69");
    expect(ordenante.RFC).toBe("SYN020202BBB");
  });
});
