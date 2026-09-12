/**
 * The importer, exercised on the synthetic fixtures.
 *
 * No real CFDI can live in this repository, so the three committed synthetic
 * documents stand in for one: they are CFDI 4.0 de ingreso and a complemento de
 * pagos 2.0, with the same namespaces, the same tax breakdown and the same
 * arithmetic a PAC produces. Redacting an already synthetic document is not the
 * point of the script, but it is the only way to prove the machinery before the
 * real file arrives, and it makes the interesting properties testable: the
 * output is the input with values replaced, an invoice and its complement stay
 * one story, and nothing that was replaced survives.
 *
 * Hermetic on purpose: the factor is passed in, never read from the environment,
 * and nothing here touches the filesystem or the clock.
 */

import { describe, expect, it } from "bun:test";
import {
  CFDI_INGRESO_PPD_XML,
  CFDI_INGRESO_PUE_XML,
  PAGO_COMPLEMENTO_XML,
} from "../packages/core/src/fixtures/index.ts";
import {
  parseCfdi,
  parsePaymentComplement,
} from "../packages/core/src/index.ts";
import {
  type Change,
  findSurvivingValues,
  generateScale,
  hasValidRfcCheckDigit,
  parseScale,
  type RedactionResult,
  redactCfdi,
} from "./import-real-cfdi.ts";

const SCALE = "0.6137";
const OTHER_SCALE = "2.5";
const CENT = 0.01;

function redacted(source: string, scale: string = SCALE): RedactionResult {
  const outcome = redactCfdi(source, { scale });
  if (!outcome.ok) {
    throw new Error(`expected a redaction, got: ${outcome.error}`);
  }
  return outcome.value;
}

function refusal(source: string, scale: string = SCALE): string {
  const outcome = redactCfdi(source, { scale });
  if (outcome.ok) {
    throw new Error("expected a refusal, got a redacted document");
  }
  return outcome.error;
}

/**
 * The document with every attribute value and every comment removed.
 *
 * What is left is the shape: the elements, their order, their nesting, their
 * namespaces and their attribute names. The redaction is allowed to change every
 * value and to add its provenance comment. It is allowed to change nothing else,
 * and this is how that is asserted rather than promised.
 */
function skeleton(xml: string): string {
  return xml
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/="[^"]*"/g, '=""')
    .split("\n")
    .filter((line) => line.trim() !== "")
    .join("\n");
}

function invoice(xml: string) {
  const parsed = parseCfdi(xml, { synthetic: true });
  if (!parsed.ok) {
    throw new Error(`the invoice did not parse: ${parsed.error.code}`);
  }
  return parsed.value;
}

function complement(xml: string) {
  const parsed = parsePaymentComplement(xml, { synthetic: true });
  if (!parsed.ok) {
    throw new Error(`the complement did not parse: ${parsed.error.code}`);
  }
  return parsed.value;
}

function changed(result: RedactionResult, kind: Change["kind"]): Change[] {
  return result.changes.filter((change) => change.kind === kind);
}

describe("parseScale", () => {
  it("takes a factor that actually hides an amount", () => {
    expect(parseScale("0.6137")).toEqual({ ok: true, value: "0.6137" });
    expect(parseScale(" 2.5 ")).toEqual({ ok: true, value: "2.5" });
  });

  it("refuses a factor that leaves the amounts recognisable", () => {
    for (const value of ["1", "1.02", "0.97"]) {
      const outcome = parseScale(value);
      expect(outcome.ok).toBe(false);
    }
  });

  it("refuses anything that is not a positive decimal", () => {
    for (const value of ["", "abc", "-2", "0", "0.1234567", "1e3"]) {
      expect(parseScale(value).ok).toBe(false);
    }
  });

  it("generates a factor that is itself acceptable", () => {
    for (let attempt = 0; attempt < 50; attempt += 1) {
      const generated = generateScale();
      expect(parseScale(generated)).toEqual({ ok: true, value: generated });
    }
  });
});

describe("redactCfdi over an invoice", () => {
  const original = invoice(CFDI_INGRESO_PUE_XML);
  const result = redacted(CFDI_INGRESO_PUE_XML);
  const document = invoice(result.xml);

  it("keeps the document shape byte for byte", () => {
    expect(skeleton(result.xml)).toBe(skeleton(CFDI_INGRESO_PUE_XML));
  });

  it("keeps the dates, the method and the currency", () => {
    expect(document.issuedAt).toBe(original.issuedAt);
    expect(document.paymentMethod).toBe(original.paymentMethod);
    expect(result.xml).toContain('Moneda="MXN"');
  });

  it("scales every amount by the factor", () => {
    const factor = Number(SCALE);
    expect(document.subtotal).toBeCloseTo(original.subtotal * factor, 0);
    expect(document.total).toBeCloseTo(original.total * factor, 0);
    expect(document.iva).toBeCloseTo(original.iva * factor, 0);
    expect(document.total).not.toBe(original.total);
  });

  it("keeps the tax breakdown adding up", () => {
    expect(document.subtotal + document.iva).toBeCloseTo(document.total, 2);
    expect(result.relationsPreserved.length).toBeGreaterThan(0);
    expect(result.relationsSkipped).toEqual([]);
  });

  it("replaces every RFC with a synthetic one whose check digit is right", () => {
    const rfcs = changed(result, "rfc");
    expect(rfcs.length).toBeGreaterThanOrEqual(2);
    for (const change of rfcs) {
      expect(change.replacement.startsWith("SYN")).toBe(true);
      expect(change.replacement).toHaveLength(change.original.length);
      expect(hasValidRfcCheckDigit(change.replacement)).toBe(true);
    }
    expect(document.issuerRfc.startsWith("SYN")).toBe(true);
    expect(document.receiverRfc.startsWith("SYN")).toBe(true);
  });

  it("replaces the legal names and keeps the legal form", () => {
    const names = changed(result, "name");
    expect(names.length).toBeGreaterThanOrEqual(2);
    for (const change of names) {
      expect(change.replacement).toContain("DEMO");
      expect(change.replacement.endsWith("SA DE CV")).toBe(true);
    }
    expect(document.issuerName).not.toBe(original.issuerName);
  });

  it("regenerates the UUID and the folio", () => {
    expect(document.uuid).not.toBe(original.uuid);
    expect(document.folio).not.toBe(original.folio);
    expect(document.folio).toHaveLength(original.folio?.length ?? 0);
  });

  it("leaves no stamp and no certificate behind", () => {
    expect(result.xml).not.toContain("SYNTHETIC-SELLO-NOT-A-SIGNATURE");
    expect(result.xml).toContain("REDACTED-SELLO-NOT-A-SIGNATURE");
    expect(result.xml).toContain("REDACTED-CERTIFICADO-NOT-A-CERTIFICATE");
  });

  it("says out loud what it kept", () => {
    const kept = result.freeTextKept.map((entry) => entry.attribute);
    expect(kept).toContain("Descripcion");
    expect(result.unscaledDecimals).toEqual([]);
  });

  it("leaks nothing it replaced", () => {
    expect(findSurvivingValues(result.xml, result.changes)).toEqual([]);
    expect(result.xml).not.toContain(original.issuerRfc);
    expect(result.xml).not.toContain(original.issuerName);
    expect(result.xml).not.toContain(original.uuid);
    expect(result.xml).not.toContain(original.total.toFixed(2));
    expect(result.xml).not.toContain(original.subtotal.toFixed(2));
  });

  it("is the same document twice for one factor and a different one for another", () => {
    expect(redacted(CFDI_INGRESO_PUE_XML).xml).toBe(result.xml);
    expect(redacted(CFDI_INGRESO_PUE_XML, OTHER_SCALE).xml).not.toBe(
      result.xml,
    );
  });
});

describe("redactCfdi over a payment complement", () => {
  const original = complement(PAGO_COMPLEMENTO_XML);
  const result = redacted(PAGO_COMPLEMENTO_XML);
  const rows = complement(result.xml);

  it("keeps the document shape byte for byte", () => {
    expect(skeleton(result.xml)).toBe(skeleton(PAGO_COMPLEMENTO_XML));
  });

  it("settles the same documents for the same scaled amounts", () => {
    const factor = Number(SCALE);
    expect(rows).toHaveLength(original.length);
    for (let index = 0; index < rows.length; index += 1) {
      expect(rows[index].paidAt).toBe(original[index].paidAt);
      expect(rows[index].paidAmount).toBeCloseTo(
        original[index].paidAmount * factor,
        1,
      );
      expect(rows[index].relatedCfdiUuid).not.toBe(
        original[index].relatedCfdiUuid,
      );
    }
  });

  it("keeps the payment equal to the sum of what it settled", () => {
    const settled = rows.reduce((total, row) => total + row.paidAmount, 0);
    expect(Math.abs(settled - rows[0].paymentTotal)).toBeLessThanOrEqual(CENT);
  });

  it("replaces the beneficiary account with a valid synthetic CLABE", () => {
    const accounts = changed(result, "account");
    expect(accounts).toHaveLength(2);
    for (const change of accounts) {
      expect(change.replacement).toHaveLength(18);
      expect(change.replacement.slice(0, 3)).toBe(change.original.slice(0, 3));
      expect(change.replacement).not.toBe(change.original);
    }
    expect(rows[0].beneficiaryAccount).not.toBe(original[0].beneficiaryAccount);
  });

  it("replaces the operation number the bank assigned", () => {
    expect(changed(result, "operation")).toHaveLength(1);
    expect(rows[0].operationNumber).not.toBe(original[0].operationNumber);
  });

  it("leaks nothing it replaced", () => {
    expect(findSurvivingValues(result.xml, result.changes)).toEqual([]);
  });
});

describe("an invoice and the complement that settles it", () => {
  const paid = redacted(CFDI_INGRESO_PPD_XML);
  const payment = redacted(PAGO_COMPLEMENTO_XML);

  it("still points at the same invoice after both were redacted", () => {
    const settled = complement(payment.xml).map((row) => row.relatedCfdiUuid);
    expect(settled).toContain(invoice(paid.xml).uuid);
  });

  it("still names the same supplier in both documents", () => {
    expect(payment.xml).toContain(`Rfc="${invoice(paid.xml).issuerRfc}"`);
    const issuerOfInvoice = changed(paid, "rfc")[0];
    const issuerOfPayment = changed(payment, "rfc").find(
      (change) => change.original === issuerOfInvoice.original,
    );
    expect(issuerOfPayment?.replacement).toBe(issuerOfInvoice.replacement);
  });

  it("gives the same folio to the same invoice in both documents", () => {
    const folioOfInvoice = changed(paid, "folio").find(
      (change) => change.original === "1088",
    );
    const folioInPayment = changed(payment, "folio").find(
      (change) => change.original === "1088",
    );
    expect(folioInPayment?.replacement).toBe(folioOfInvoice?.replacement);
  });
});

describe("what redactCfdi refuses", () => {
  it("refuses a factor that hides nothing", () => {
    expect(refusal(CFDI_INGRESO_PUE_XML, "1")).toContain("too close to 1");
  });

  it("refuses anything that is not XML", () => {
    expect(refusal("not a document at all")).toContain("did not parse");
  });

  it("refuses a comprobante that is neither an invoice nor a payment", () => {
    const egreso = CFDI_INGRESO_PUE_XML.replace(
      'TipoDeComprobante="I"',
      'TipoDeComprobante="E"',
    );
    expect(refusal(egreso)).toContain("only a CFDI de ingreso");
  });

  it("refuses a complement it cannot read, and blanks it when told to", () => {
    const withCartaPorte = CFDI_INGRESO_PUE_XML.replace(
      "<cfdi:Complemento>",
      `<cfdi:Complemento>
    <cartaporte31:CartaPorte xmlns:cartaporte31="http://www.sat.gob.mx/CartaPorte31" Version="3.1" IdCCP="CCC1234" NombreRemitente="UNA EMPRESA REAL"/>`,
    );
    expect(refusal(withCartaPorte)).toContain("--allow-unknown-complement");

    const outcome = redactCfdi(withCartaPorte, {
      scale: SCALE,
      allowUnknownComplement: true,
    });
    if (!outcome.ok) {
      throw new Error(`expected a redaction, got: ${outcome.error}`);
    }
    expect(outcome.value.xml).not.toContain("UNA EMPRESA REAL");
    expect(outcome.value.xml).not.toContain("CCC1234");
    expect(outcome.value.xml).toContain("cartaporte31:CartaPorte");
  });
});

describe("findSurvivingValues", () => {
  const changes: Change[] = [
    {
      kind: "rfc",
      element: "cfdi:Emisor",
      attribute: "Rfc",
      original: "AAA010101AAA",
      replacement: "SYN010101AA1",
    },
    {
      kind: "amount",
      element: "cfdi:Comprobante",
      attribute: "Total",
      original: "183280.00",
      replacement: "112479.17",
    },
  ];

  it("finds a value the rewriter did not reach", () => {
    const leaked = '<cfdi:Emisor Rfc="AAA010101AAA" Total="112479.17"/>';
    expect(findSurvivingValues(leaked, changes).join(" ")).toContain(
      "AAA010101AAA",
    );
  });

  it("finds an amount that came back", () => {
    const leaked = '<cfdi:Comprobante Total="183280.00"/>';
    expect(findSurvivingValues(leaked, changes)[0]).toContain("183280.00");
  });

  it("does not call a longer number a leak", () => {
    const clean = '<cfdi:Comprobante Total="9183280.005"/>';
    expect(findSurvivingValues(clean, changes)).toEqual([]);
  });

  it("finds an RFC hiding in a free text description", () => {
    const leaked =
      '<cfdi:Concepto Descripcion="Servicio facturado a VECU901231AB9"/>';
    expect(findSurvivingValues(leaked, [])[0]).toContain("VECU901231AB9");
  });

  it("finds a CLABE hiding in a free text description", () => {
    const leaked =
      '<cfdi:Concepto Descripcion="Deposito a 012580001234567897"/>';
    expect(findSurvivingValues(leaked, [])[0]).toContain("012580001234567897");
  });
});

describe("hasValidRfcCheckDigit", () => {
  it("accepts the RFCs the importer produces", () => {
    const result = redacted(CFDI_INGRESO_PUE_XML);
    for (const change of result.changes.filter(
      (entry) => entry.kind === "rfc",
    )) {
      expect(hasValidRfcCheckDigit(change.replacement)).toBe(true);
    }
  });

  it("rejects an RFC whose last character was edited", () => {
    const result = redacted(CFDI_INGRESO_PUE_XML);
    const rfc = result.changes.find(
      (entry) => entry.kind === "rfc",
    )?.replacement;
    if (rfc === undefined) {
      throw new Error("the invoice carried no RFC");
    }
    const wrong = rfc.endsWith("0")
      ? `${rfc.slice(0, -1)}1`
      : `${rfc.slice(0, -1)}0`;
    expect(hasValidRfcCheckDigit(wrong)).toBe(false);
  });
});
