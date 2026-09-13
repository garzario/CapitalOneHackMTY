import { describe, expect, it } from "bun:test";
import {
  carriesFullClabe,
  clabeLast4,
  DROPPED_KEYS,
  maskClabe,
  maskClabesInText,
  maskDeep,
  maskEvidence,
} from "./mask";

const CLABE = "012580000987654320";

describe("maskClabe", () => {
  it("keeps the last four digits and nothing else", () => {
    expect(maskClabe(CLABE)).toBe("****4320");
    expect(clabeLast4(CLABE)).toBe("4320");
  });

  it("leaves anything that is not eighteen digits alone", () => {
    /* A mask that rewrote an RFC or a clave de rastreo would be worse than one that
       did nothing, because it would hide which field it damaged. */
    expect(maskClabe("SYN010101AAA")).toBe("SYN010101AAA");
    expect(maskClabe("12345")).toBe("12345");
    expect(maskClabe("0125800009876543201")).toBe("0125800009876543201");
  });
});

describe("maskClabesInText", () => {
  it("masks an account written inside a sentence", () => {
    const masked = maskClabesInText(
      `La cuenta ${CLABE} no tiene historial con este proveedor.`,
    );
    expect(masked).toContain("****4320");
    expect(carriesFullClabe(masked)).toBe(false);
  });

  it("masks every account in the same sentence", () => {
    const masked = maskClabesInText(`${CLABE} y 058580000123456812`);
    expect(masked).toBe("****4320 y ****6812");
  });
});

describe("maskEvidence", () => {
  it("masks an account and passes numbers and booleans through", () => {
    const masked = maskEvidence({
      clabe: CLABE,
      amountAtRisk: 96450.8,
      ocrChannel: true,
      institutionName: "BBVA Mexico",
    });
    expect(masked.clabe).toBe("****4320");
    expect(masked.amountAtRisk).toBe(96450.8);
    expect(masked.ocrChannel).toBe(true);
    expect(masked.institutionName).toBe("BBVA Mexico");
  });

  it("drops the keys that never leave, matched on the key and not the value", () => {
    const masked = maskEvidence({
      xml: "<cfdi:Comprobante>...</cfdi:Comprobante>",
      sello: "abc",
      rawText: "CLABE: 0125 8000 0987 6543 20",
      clabe: CLABE,
    });
    expect(Object.keys(masked)).toEqual(["clabe"]);
  });

  it("lists the document fields a CFDI or a CEP would arrive in", () => {
    /* The list is asserted on so that removing one of them is a deliberate edit with
       a failing test against it rather than a silent widening of the transfer. */
    expect(DROPPED_KEYS).toContain("xml");
    expect(DROPPED_KEYS).toContain("sello");
    expect(DROPPED_KEYS).toContain("certificate");
    expect(DROPPED_KEYS).toContain("knownAccounts");
  });
});

describe("maskDeep", () => {
  it("walks objects and arrays to the bottom", () => {
    const masked = maskDeep({
      lines: [{ clabe: CLABE, amount: 10 }, { note: `pago a ${CLABE}` }],
      nested: { deeper: { clabe: CLABE } },
    }) as {
      lines: Array<{ clabe?: string; note?: string }>;
      nested: { deeper: { clabe: string } };
    };

    expect(masked.lines[0]?.clabe).toBe("****4320");
    expect(masked.lines[1]?.note).toBe("pago a ****4320");
    expect(masked.nested.deeper.clabe).toBe("****4320");
  });

  it("leaves no eighteen-digit run anywhere in the serialised result", () => {
    /* This is the assertion the privacy claim rests on: one predicate over the whole
       body, so a field added to a tool tomorrow is covered without anybody
       remembering to mask it. */
    const body = JSON.stringify(
      maskDeep({
        a: CLABE,
        b: [CLABE, { c: `${CLABE} y ${CLABE}` }],
        xml: CLABE,
      }),
    );
    expect(carriesFullClabe(body)).toBe(false);
    expect(body).not.toContain(CLABE);
  });

  it("keeps null and a number as they are", () => {
    expect(maskDeep({ a: null, b: 3, c: false })).toEqual({
      a: null,
      b: 3,
      c: false,
    });
  });
});
