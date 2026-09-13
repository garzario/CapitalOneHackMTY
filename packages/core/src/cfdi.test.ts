/**
 * Every case here runs on a string. No network, no filesystem, no clock, so the
 * suite is the same on a laptop at 04:00 and in CI.
 *
 * The three realistic documents live in ./fixtures and are read as a whole. The
 * one-off documents below are deliberately tiny: when a test fails, the reason is
 * visible in the ten lines above the assertion.
 */

import { describe, expect, it } from "bun:test";
import {
  attribute,
  childNamed,
  childrenNamed,
  MAX_INPUT_LENGTH,
  type ParseFailure,
  type ParseResult,
  parseCfdi,
  parsePaymentComplement,
  parseSatAmount,
  parseXml,
  toInstant,
} from "./cfdi";
import {
  CFDI_INGRESO_PPD_XML,
  CFDI_INGRESO_PUE_XML,
  PAGO_COMPLEMENTO_XML,
  SYNTHETIC_PARSE_OPTIONS,
} from "./fixtures";

function expectOk<T>(result: ParseResult<T>): T {
  if (!result.ok) {
    throw new Error(
      `expected a parsed document, got ${result.error.code}: ${result.error.message}`,
    );
  }
  return result.value;
}

function expectFailure<T>(result: ParseResult<T>): ParseFailure {
  if (result.ok) {
    throw new Error("expected a parse failure, got a parsed document");
  }
  return result.error;
}

const NAMESPACES = [
  'xmlns:cfdi="http://www.sat.gob.mx/cfd/4"',
  'xmlns:pago20="http://www.sat.gob.mx/Pagos20"',
  'xmlns:tfd="http://www.sat.gob.mx/TimbreFiscalDigital"',
].join(" ");

const TIMBRE = `<cfdi:Complemento>
    <tfd:TimbreFiscalDigital Version="1.1" UUID="a1b2c3d4-0001-4a2b-9c3d-000000009999" FechaTimbrado="2026-09-01T10:16:05"/>
  </cfdi:Complemento>`;

const INGRESO_ATTRIBUTES = [
  'Version="4.0"',
  'Fecha="2026-09-01T10:14:32"',
  'TipoDeComprobante="I"',
  'MetodoPago="PUE"',
  'FormaPago="03"',
  'SubTotal="100.00"',
  'Moneda="MXN"',
  'Total="116.00"',
].join(" ");

/** A minimal comprobante. Both arguments are raw XML so a case can break one. */
function comprobante(rootAttributes: string, body: string = TIMBRE): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<cfdi:Comprobante ${NAMESPACES} ${rootAttributes}>
  <cfdi:Emisor Rfc="SYN010101AAA" Nombre="SINTETICO SA DE CV" RegimenFiscal="601"/>
  <cfdi:Receptor Rfc="SYN950505BB2" Nombre="COMPRADOR SINTETICO SA DE CV" RegimenFiscalReceptor="601" UsoCFDI="G03"/>
  ${body}
</cfdi:Comprobante>`;
}

const PAGO_ATTRIBUTES = [
  'FechaPago="2026-09-08T12:00:00"',
  'FormaDePagoP="03"',
  'MonedaP="MXN"',
  'TipoCambioP="1"',
  'Monto="1160.00"',
].join(" ");

/** A minimal payment complement. `pagosBody` carries the pago20:Pago nodes. */
function complemento(
  pagosBody: string,
  pagosVersion = '  Version="2.0"',
): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<cfdi:Comprobante ${NAMESPACES} Version="4.0" Fecha="2026-09-09T11:05:00" TipoDeComprobante="P" SubTotal="0" Moneda="XXX" Total="0">
  <cfdi:Emisor Rfc="SYN010101AAA" Nombre="SINTETICO SA DE CV" RegimenFiscal="601"/>
  <cfdi:Receptor Rfc="SYN950505BB2" Nombre="COMPRADOR SINTETICO SA DE CV" RegimenFiscalReceptor="601" UsoCFDI="CP01"/>
  <cfdi:Complemento>
    <pago20:Pagos${pagosVersion}>${pagosBody}</pago20:Pagos>
    <tfd:TimbreFiscalDigital Version="1.1" UUID="B7E6D5C4-0002-4F1A-8B2C-000000000318" FechaTimbrado="2026-09-09T11:07:19"/>
  </cfdi:Complemento>
</cfdi:Comprobante>`;
}

describe("parseXml", () => {
  it("reads a self-closing element and its attributes", () => {
    const root = expectOk(
      parseXml('<Pago Monto="1160.00" FormaDePagoP="03"/>'),
    );

    expect(root.name).toBe("Pago");
    expect(root.children).toEqual([]);
    expect(root.attributes).toEqual({
      Monto: "1160.00",
      FormaDePagoP: "03",
    });
  });

  it("keeps children in document order", () => {
    const root = expectOk(
      parseXml("<Pagos><Pago Id='1'/><Pago Id='2'/><Totales/></Pagos>"),
    );

    expect(root.children.map((child) => child.name)).toEqual([
      "Pago",
      "Pago",
      "Totales",
    ]);
    expect(childrenNamed(root, "Pago")).toHaveLength(2);
    expect(attribute(childNamed(root, "Pago"), "Id")).toBe("1");
  });

  it("resolves a prefix to the namespace its declaration bound", () => {
    const root = expectOk(
      parseXml(
        '<cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4"><cfdi:Emisor/></cfdi:Comprobante>',
      ),
    );

    expect(root.prefix).toBe("cfdi");
    expect(root.localName).toBe("Comprobante");
    expect(root.namespace).toBe("http://www.sat.gob.mx/cfd/4");
    expect(root.children[0].namespace).toBe("http://www.sat.gob.mx/cfd/4");
  });

  it("scopes a declaration to the element that made it", () => {
    const root = expectOk(
      parseXml(
        '<Root><tfd:Timbre xmlns:tfd="http://www.sat.gob.mx/TimbreFiscalDigital"/><tfd:Other/></Root>',
      ),
    );

    expect(root.children[0].namespace).toBe(
      "http://www.sat.gob.mx/TimbreFiscalDigital",
    );
    expect(root.children[1].namespace).toBe("");
  });

  it("applies a default namespace to unprefixed elements", () => {
    const root = expectOk(
      parseXml(
        '<Comprobante xmlns="http://www.sat.gob.mx/cfd/4"><Emisor/></Comprobante>',
      ),
    );

    expect(root.namespace).toBe("http://www.sat.gob.mx/cfd/4");
    expect(root.children[0].namespace).toBe("http://www.sat.gob.mx/cfd/4");
  });

  it("skips the declaration, a comment, a doctype and a CDATA section", () => {
    const root = expectOk(
      parseXml(
        `<?xml version="1.0"?><!DOCTYPE Root><!-- <Pago Monto="1"/> --><Root><![CDATA[ <Pago/> ]]><Real/></Root>`,
      ),
    );

    expect(root.children.map((child) => child.name)).toEqual(["Real"]);
  });

  it("decodes the five predefined entities and numeric references", () => {
    const root = expectOk(
      parseXml(
        `<E Nombre="ACEROS &amp; PERFILES" Nota="&lt;a&gt; &quot;b&quot; &apos;c&apos; &#38; &#x26;"/>`,
      ),
    );

    expect(root.attributes.Nombre).toBe("ACEROS & PERFILES");
    expect(root.attributes.Nota).toBe(`<a> "b" 'c' & &`);
  });

  it("leaves an unknown entity verbatim instead of resolving a DTD", () => {
    const root = expectOk(parseXml('<E Nombre="&bomba;"/>'));

    expect(root.attributes.Nombre).toBe("&bomba;");
  });

  it("keeps the first spelling of a repeated attribute", () => {
    const root = expectOk(parseXml('<Pago Monto="1160.00" Monto="1.00"/>'));

    expect(root.attributes.Monto).toBe("1160.00");
  });

  it("ignores text content, which SAT documents never carry", () => {
    const root = expectOk(
      parseXml("<Root>  texto suelto  <Hijo/>y mas</Root>"),
    );

    expect(root.children.map((child) => child.name)).toEqual(["Hijo"]);
  });

  it("refuses an empty document", () => {
    expect(expectFailure(parseXml("   \n  ")).code).toBe("empty_input");
  });

  it("refuses a document past the size cap", () => {
    const oversized = `<Root>${"x".repeat(MAX_INPUT_LENGTH)}</Root>`;

    expect(expectFailure(parseXml(oversized)).code).toBe("input_too_large");
  });

  it("refuses a tag that is never closed", () => {
    expect(expectFailure(parseXml('<Root><Pago Monto="1"')).code).toBe(
      "malformed_xml",
    );
  });

  it("refuses an element that is never closed", () => {
    expect(expectFailure(parseXml("<Root><Pago></Root>")).code).toBe(
      "malformed_xml",
    );
  });

  it("refuses a closing tag that does not match", () => {
    expect(expectFailure(parseXml("<Root><Pago/></Pagos>")).code).toBe(
      "malformed_xml",
    );
  });

  it("refuses an attribute value that is not quoted", () => {
    expect(expectFailure(parseXml("<Pago Monto=1160.00/>")).code).toBe(
      "malformed_xml",
    );
  });

  it("refuses an attribute with no value", () => {
    expect(expectFailure(parseXml("<Pago Monto/>")).code).toBe("malformed_xml");
  });

  it("refuses two root elements", () => {
    expect(expectFailure(parseXml("<A/><B/>")).code).toBe("malformed_xml");
  });

  it("refuses a document nested past the depth cap", () => {
    const deep = `${"<a>".repeat(80)}${"</a>".repeat(80)}`;

    expect(expectFailure(parseXml(deep)).code).toBe("malformed_xml");
  });

  it("refuses prose that only looks like markup", () => {
    expect(expectFailure(parseXml("pago de 5 < 7 pesos")).code).toBe(
      "malformed_xml",
    );
  });

  it("refuses a JSON body sent to the wrong endpoint", () => {
    expect(expectFailure(parseXml('{"uuid":"nope"}')).code).toBe(
      "malformed_xml",
    );
  });
});

describe("parseSatAmount", () => {
  it("rounds to the cent", () => {
    expect(parseSatAmount("158000.004")).toBe(158000);
    expect(parseSatAmount("0.005")).toBe(0.01);
  });

  it("rejects a thousands separator, which Number would read as NaN", () => {
    expect(parseSatAmount("158,000.00")).toBeUndefined();
  });

  it("rejects an empty value instead of reading it as zero", () => {
    expect(parseSatAmount("")).toBeUndefined();
    expect(parseSatAmount(undefined)).toBeUndefined();
  });

  it("rejects a negative amount, which no SAT field may hold", () => {
    expect(parseSatAmount("-1.00")).toBeUndefined();
  });

  it("rejects an amount too large to hold in cents", () => {
    expect(parseSatAmount("999999999999999999")).toBeUndefined();
  });
});

describe("toInstant", () => {
  it("reads a SAT local timestamp as Monterrey time", () => {
    expect(toInstant("2026-09-01T10:14:32")).toBe("2026-09-01T16:14:32.000Z");
  });

  it("honours the offset the caller states", () => {
    expect(toInstant("2026-09-01T10:14:32", -420)).toBe(
      "2026-09-01T17:14:32.000Z",
    );
  });

  it("trusts an offset the document carries", () => {
    expect(toInstant("2026-09-01T10:14:32-05:00")).toBe(
      "2026-09-01T15:14:32.000Z",
    );
  });

  it("rejects a date with no time, which is not a SAT timestamp", () => {
    expect(toInstant("2026-09-01")).toBeUndefined();
  });
});

describe("parseCfdi", () => {
  it("parses the PUE fixture into the domain record", () => {
    const cfdi = expectOk(
      parseCfdi(CFDI_INGRESO_PUE_XML, SYNTHETIC_PARSE_OPTIONS),
    );

    expect(cfdi).toEqual({
      uuid: "A1B2C3D4-0001-4A2B-9C3D-000000001042",
      serie: "A",
      folio: "1042",
      issuedAt: "2026-09-01T16:14:32.000Z",
      issuerRfc: "SYN010101AAA",
      issuerName: "ACEROS & PERFILES SINTETICOS SA DE CV",
      receiverRfc: "SYN950505BB2",
      subtotal: 158000,
      iva: 25280,
      total: 183280,
      paymentMethod: "PUE",
      paymentForm: "03",
      issuePlace: "64000",
      synthetic: true,
    });
  });

  it("keeps LugarExpedicion, and only when it is a postal code", () => {
    /* The only geography a CFDI carries, and the invoice side of the plaza
       comparison in `./clabe.ts`. A malformed place has to read as no place at
       all: one that resolved to a state would disagree with every account the
       supplier has ever been paid on. */
    const cfdi = expectOk(
      parseCfdi(CFDI_INGRESO_PUE_XML, SYNTHETIC_PARSE_OPTIONS),
    );
    expect(cfdi.issuePlace).toBe("64000");

    for (const bad of ["", "6400", "640000", "64 00", "NL"]) {
      const mangled = CFDI_INGRESO_PUE_XML.replace(
        'LugarExpedicion="64000"',
        `LugarExpedicion="${bad}"`,
      );

      expect(
        expectOk(parseCfdi(mangled, SYNTHETIC_PARSE_OPTIONS)).issuePlace,
      ).toBeUndefined();
    }
  });

  it("parses the PPD fixture, two concepts and one IVA total", () => {
    const cfdi = expectOk(
      parseCfdi(CFDI_INGRESO_PPD_XML, SYNTHETIC_PARSE_OPTIONS),
    );

    expect(cfdi.uuid).toBe("A1B2C3D4-0001-4A2B-9C3D-000000001088");
    expect(cfdi.paymentMethod).toBe("PPD");
    // PPD forces FormaPago 99, por definir: the invoice cannot say how it will
    // be paid, which is exactly why a complement has to follow it.
    expect(cfdi.paymentForm).toBe("99");
    expect(cfdi.subtotal).toBe(72000);
    expect(cfdi.iva).toBe(11520);
    expect(cfdi.total).toBe(83520);
    expect(cfdi.issuedAt).toBe("2026-09-04T15:02:11.000Z");
  });

  it("counts IVA once, at the document level, and never IEPS", () => {
    const body = `<cfdi:Conceptos>
      <cfdi:Concepto Importe="100.00">
        <cfdi:Impuestos><cfdi:Traslados>
          <cfdi:Traslado Base="100.00" Impuesto="002" TipoFactor="Tasa" Importe="16.00"/>
        </cfdi:Traslados></cfdi:Impuestos>
      </cfdi:Concepto>
    </cfdi:Conceptos>
    <cfdi:Impuestos TotalImpuestosTrasladados="24.00">
      <cfdi:Traslados>
        <cfdi:Traslado Base="100.00" Impuesto="002" TipoFactor="Tasa" Importe="16.00"/>
        <cfdi:Traslado Base="100.00" Impuesto="003" TipoFactor="Tasa" Importe="8.00"/>
      </cfdi:Traslados>
    </cfdi:Impuestos>
    ${TIMBRE}`;

    const cfdi = expectOk(parseCfdi(comprobante(INGRESO_ATTRIBUTES, body)));

    expect(cfdi.iva).toBe(16);
  });

  it("treats an exempt line, which carries no Importe, as zero IVA", () => {
    const body = `<cfdi:Impuestos>
      <cfdi:Traslados>
        <cfdi:Traslado Base="100.00" Impuesto="002" TipoFactor="Exento"/>
      </cfdi:Traslados>
    </cfdi:Impuestos>
    ${TIMBRE}`;

    expect(expectOk(parseCfdi(comprobante(INGRESO_ATTRIBUTES, body))).iva).toBe(
      0,
    );
  });

  it("reads a document whose namespace declarations were stripped", () => {
    const stripped = `<Comprobante ${INGRESO_ATTRIBUTES}>
      <Emisor Rfc="SYN010101AAA" Nombre="SINTETICO SA DE CV"/>
      <Receptor Rfc="SYN950505BB2"/>
      <Complemento>
        <TimbreFiscalDigital UUID="A1B2C3D4-0001-4A2B-9C3D-000000009999"/>
      </Complemento>
    </Comprobante>`;

    expect(expectOk(parseCfdi(stripped)).uuid).toBe(
      "A1B2C3D4-0001-4A2B-9C3D-000000009999",
    );
  });

  it("uppercases the UUID, because the SAT list is uppercase", () => {
    expect(expectOk(parseCfdi(comprobante(INGRESO_ATTRIBUTES))).uuid).toBe(
      "A1B2C3D4-0001-4A2B-9C3D-000000009999",
    );
  });

  it("marks the record synthetic only when the caller says so", () => {
    expect(expectOk(parseCfdi(CFDI_INGRESO_PUE_XML)).synthetic).toBe(false);
    expect(
      expectOk(parseCfdi(CFDI_INGRESO_PUE_XML, { synthetic: true })).synthetic,
    ).toBe(true);
  });

  it("refuses a payment complement handed to the invoice parser", () => {
    expect(expectFailure(parseCfdi(PAGO_COMPLEMENTO_XML)).code).toBe(
      "not_an_income_cfdi",
    );
  });

  it("refuses CFDI 3.3", () => {
    const old = comprobante(INGRESO_ATTRIBUTES.replace('"4.0"', '"3.3"'));

    expect(expectFailure(parseCfdi(old)).code).toBe("unsupported_version");
  });

  it("calls a document in the cfd/3 namespace a version problem, not a wrong document", () => {
    const old = `<cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/3" Version="3.3" TipoDeComprobante="I"/>`;

    expect(expectFailure(parseCfdi(old)).code).toBe("unsupported_version");
  });

  it("refuses a root element that is not a comprobante", () => {
    expect(expectFailure(parseCfdi("<Factura Version='4.0'/>")).code).toBe(
      "not_a_comprobante",
    );
  });

  it("refuses a comprobante that was never stamped", () => {
    expect(
      expectFailure(parseCfdi(comprobante(INGRESO_ATTRIBUTES, ""))).code,
    ).toBe("missing_timbre");
  });

  it("refuses a timbre UUID that is not a UUID", () => {
    const body = `<cfdi:Complemento>
      <tfd:TimbreFiscalDigital UUID="PENDIENTE-DE-TIMBRAR"/>
    </cfdi:Complemento>`;

    expect(
      expectFailure(parseCfdi(comprobante(INGRESO_ATTRIBUTES, body))).code,
    ).toBe("invalid_uuid");
  });

  it("refuses a comprobante with no issuer RFC", () => {
    const withoutIssuer = comprobante(INGRESO_ATTRIBUTES).replace(
      'Rfc="SYN010101AAA" ',
      "",
    );

    expect(expectFailure(parseCfdi(withoutIssuer)).code).toBe("missing_party");
  });

  it("refuses a Total that is not a SAT amount", () => {
    const tampered = comprobante(
      INGRESO_ATTRIBUTES.replace('Total="116.00"', 'Total="116,00"'),
    );

    expect(expectFailure(parseCfdi(tampered)).code).toBe("invalid_amount");
  });

  it("refuses a Fecha that is not a SAT timestamp", () => {
    const tampered = comprobante(
      INGRESO_ATTRIBUTES.replace('Fecha="2026-09-01T10:14:32"', 'Fecha="ayer"'),
    );

    expect(expectFailure(parseCfdi(tampered)).code).toBe("invalid_date");
  });

  it("refuses a MetodoPago that is neither PUE nor PPD", () => {
    const tampered = comprobante(
      INGRESO_ATTRIBUTES.replace('MetodoPago="PUE"', 'MetodoPago="PPX"'),
    );

    expect(expectFailure(parseCfdi(tampered)).code).toBe(
      "invalid_payment_method",
    );
  });

  it("refuses garbage without throwing", () => {
    expect(expectFailure(parseCfdi("no soy un XML")).code).toBe(
      "malformed_xml",
    );
    expect(expectFailure(parseCfdi("")).code).toBe("empty_input");
  });
});

describe("parsePaymentComplement", () => {
  it("parses the fixture into one row per related document", () => {
    const rows = expectOk(
      parsePaymentComplement(PAGO_COMPLEMENTO_XML, SYNTHETIC_PARSE_OPTIONS),
    );

    expect(rows).toEqual([
      {
        uuid: "B7E6D5C4-0002-4F1A-8B2C-000000000318",
        relatedCfdiUuid: "A1B2C3D4-0001-4A2B-9C3D-000000001088",
        paidAt: "2026-09-08T18:00:00.000Z",
        paidAmount: 83520,
        paymentTotal: 118320,
        operationNumber: "SYN2026090800012345",
        beneficiaryAccount: "072580000987654328",
        beneficiaryBankRfc: "SYB900202BB2",
        synthetic: true,
      },
      {
        uuid: "B7E6D5C4-0002-4F1A-8B2C-000000000318",
        relatedCfdiUuid: "A1B2C3D4-0001-4A2B-9C3D-000000001095",
        paidAt: "2026-09-08T18:00:00.000Z",
        paidAmount: 34800,
        paymentTotal: 118320,
        operationNumber: "SYN2026090800012345",
        beneficiaryAccount: "072580000987654328",
        beneficiaryBankRfc: "SYB900202BB2",
        synthetic: true,
      },
    ]);
  });

  it("settles the PPD invoice it relates to, to the cent", () => {
    const invoice = expectOk(
      parseCfdi(CFDI_INGRESO_PPD_XML, SYNTHETIC_PARSE_OPTIONS),
    );
    const rows = expectOk(
      parsePaymentComplement(PAGO_COMPLEMENTO_XML, SYNTHETIC_PARSE_OPTIONS),
    );
    const settlement = rows.find((row) => row.relatedCfdiUuid === invoice.uuid);

    expect(settlement?.paidAmount).toBe(invoice.total);
  });

  it("keeps the transfer total apart from the share of each invoice", () => {
    const rows = expectOk(parsePaymentComplement(PAGO_COMPLEMENTO_XML));
    const shares = rows.reduce((total, row) => total + row.paidAmount, 0);

    expect(shares).toBe(118320);
    expect(rows[0].paymentTotal).toBe(118320);
  });

  it("returns no beneficiary account when the payment omits one", () => {
    const body = `<pago20:Pago ${PAGO_ATTRIBUTES}>
      <pago20:DoctoRelacionado IdDocumento="A1B2C3D4-0001-4A2B-9C3D-000000001088" ImpPagado="1160.00"/>
    </pago20:Pago>`;

    const rows = expectOk(parsePaymentComplement(complemento(body)));

    expect(rows).toHaveLength(1);
    expect(rows[0].beneficiaryAccount).toBeUndefined();
    expect(rows[0].beneficiaryBankRfc).toBeUndefined();
    expect(rows[0].operationNumber).toBeUndefined();
    expect(rows[0].paidAmount).toBe(1160);
  });

  it("falls back to Monto when a single related document omits ImpPagado", () => {
    const body = `<pago20:Pago ${PAGO_ATTRIBUTES}>
      <pago20:DoctoRelacionado IdDocumento="A1B2C3D4-0001-4A2B-9C3D-000000001088"/>
    </pago20:Pago>`;

    expect(
      expectOk(parsePaymentComplement(complemento(body)))[0].paidAmount,
    ).toBe(1160);
  });

  it("reads two payments made on different days in one complement", () => {
    const body = `<pago20:Pago ${PAGO_ATTRIBUTES} CtaBeneficiario="072580000987654328">
      <pago20:DoctoRelacionado IdDocumento="A1B2C3D4-0001-4A2B-9C3D-000000001088" ImpPagado="1160.00"/>
    </pago20:Pago>
    <pago20:Pago FechaPago="2026-09-09T09:30:00" FormaDePagoP="03" MonedaP="MXN" Monto="500.00" CtaBeneficiario="012580001234567897">
      <pago20:DoctoRelacionado IdDocumento="A1B2C3D4-0001-4A2B-9C3D-000000001095" ImpPagado="500.00"/>
    </pago20:Pago>`;

    const rows = expectOk(parsePaymentComplement(complemento(body)));

    expect(rows.map((row) => row.paidAt)).toEqual([
      "2026-09-08T18:00:00.000Z",
      "2026-09-09T15:30:00.000Z",
    ]);
    expect(rows.map((row) => row.beneficiaryAccount)).toEqual([
      "072580000987654328",
      "012580001234567897",
    ]);
  });

  it("refuses an invoice handed to the complement parser", () => {
    expect(
      expectFailure(parsePaymentComplement(CFDI_INGRESO_PUE_XML)).code,
    ).toBe("not_a_payment_cfdi");
  });

  it("refuses a type P comprobante with no pagos complement", () => {
    const withoutPagos = complemento("").replace(
      /<pago20:Pagos.*?<\/pago20:Pagos>/s,
      "",
    );

    expect(expectFailure(parsePaymentComplement(withoutPagos)).code).toBe(
      "missing_pagos_complement",
    );
  });

  it("refuses the 1.0 complement, whose fields are not these fields", () => {
    const body = `<pago20:Pago ${PAGO_ATTRIBUTES}>
      <pago20:DoctoRelacionado IdDocumento="A1B2C3D4-0001-4A2B-9C3D-000000001088" ImpPagado="1160.00"/>
    </pago20:Pago>`;

    expect(
      expectFailure(parsePaymentComplement(complemento(body, ' Version="1.0"')))
        .code,
    ).toBe("unsupported_version");
  });

  it("refuses a payment that settles no document", () => {
    const body = `<pago20:Pago ${PAGO_ATTRIBUTES}></pago20:Pago>`;

    expect(expectFailure(parsePaymentComplement(complemento(body))).code).toBe(
      "no_related_documents",
    );
  });

  it("refuses a complement that carries no payment at all", () => {
    expect(expectFailure(parsePaymentComplement(complemento(""))).code).toBe(
      "no_related_documents",
    );
  });

  it("refuses an IdDocumento that is not a UUID", () => {
    const body = `<pago20:Pago ${PAGO_ATTRIBUTES}>
      <pago20:DoctoRelacionado IdDocumento="FACTURA-1088" ImpPagado="1160.00"/>
    </pago20:Pago>`;

    expect(expectFailure(parsePaymentComplement(complemento(body))).code).toBe(
      "invalid_uuid",
    );
  });

  it("refuses a FechaPago that is not a SAT timestamp", () => {
    const body = `<pago20:Pago FechaPago="2026-09-08" Monto="1160.00">
      <pago20:DoctoRelacionado IdDocumento="A1B2C3D4-0001-4A2B-9C3D-000000001088" ImpPagado="1160.00"/>
    </pago20:Pago>`;

    expect(expectFailure(parsePaymentComplement(complemento(body))).code).toBe(
      "invalid_date",
    );
  });

  it("refuses a Monto that is not a SAT amount", () => {
    const body = `<pago20:Pago FechaPago="2026-09-08T12:00:00" Monto="mil ciento sesenta">
      <pago20:DoctoRelacionado IdDocumento="A1B2C3D4-0001-4A2B-9C3D-000000001088" ImpPagado="1160.00"/>
    </pago20:Pago>`;

    expect(expectFailure(parsePaymentComplement(complemento(body))).code).toBe(
      "invalid_amount",
    );
  });

  it("refuses garbage without throwing", () => {
    expect(expectFailure(parsePaymentComplement("<>")).code).toBe(
      "malformed_xml",
    );
    expect(expectFailure(parsePaymentComplement("")).code).toBe("empty_input");
  });
});
