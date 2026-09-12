import { describe, expect, it } from "bun:test";
import {
  decodeXmlEntities,
  readElementAttributes,
  readRootElement,
} from "./xml";

describe("decodeXmlEntities", () => {
  it("decodes the five predefined entities", () => {
    expect(
      decodeXmlEntities("A &amp; B &lt;C&gt; &quot;D&quot; &apos;E&apos;"),
    ).toBe(`A & B <C> "D" 'E'`);
  });

  it("decodes the decimal reference banks use for N tilde", () => {
    expect(decodeXmlEntities("MU&#209;OZ")).toBe("MU\u00d1OZ");
  });

  it("decodes a hexadecimal reference", () => {
    expect(decodeXmlEntities("PE&#xD1;A")).toBe("PE\u00d1A");
  });

  it("leaves an unknown entity alone rather than deleting part of a name", () => {
    expect(decodeXmlEntities("ACME &nbsp; SA")).toBe("ACME &nbsp; SA");
  });

  it("leaves an out-of-range numeric reference alone", () => {
    expect(decodeXmlEntities("X&#1114112;Y")).toBe("X&#1114112;Y");
  });
});

describe("readRootElement", () => {
  it("skips the XML declaration, a BOM and leading whitespace", () => {
    const root = readRootElement(
      '\ufeff<?xml version="1.0" encoding="UTF-8"?>\r\n  <SPEI_Tercero a="1"/>',
    );
    expect(root?.name).toBe("SPEI_Tercero");
    expect(root?.attributes.a).toBe("1");
  });

  it("reads namespace-prefixed attributes without choking", () => {
    const root = readRootElement(
      '<SPEI_Tercero xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="" sello="abc"/>',
    );
    expect(root?.attributes.sello).toBe("abc");
    expect(root?.attributes["xsi:schemaLocation"]).toBe("");
  });

  it("reads single-quoted attribute values", () => {
    const root = readRootElement("<SPEI_Tercero sello='a\"b'/>");
    expect(root?.attributes.sello).toBe('a"b');
  });

  it("returns undefined when the input opens no element", () => {
    expect(readRootElement("not xml at all")).toBeUndefined();
  });
});

describe("readElementAttributes", () => {
  it("finds a child wherever it sits, because producers disagree on order", () => {
    const beneficiarioFirst =
      '<SPEI_Tercero><Beneficiario Nombre="B"/><Ordenante Nombre="O"/></SPEI_Tercero>';
    const ordenanteFirst =
      '<SPEI_Tercero><Ordenante Nombre="O"/><Beneficiario Nombre="B"/></SPEI_Tercero>';
    for (const xml of [beneficiarioFirst, ordenanteFirst]) {
      expect(readElementAttributes(xml, "Beneficiario")?.Nombre).toBe("B");
      expect(readElementAttributes(xml, "Ordenante")?.Nombre).toBe("O");
    }
  });

  it("returns undefined for an element that is not there", () => {
    expect(
      readElementAttributes("<SPEI_Tercero/>", "Ordenante"),
    ).toBeUndefined();
  });
});
