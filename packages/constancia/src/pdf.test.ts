import { describe, expect, it } from "bun:test";
import { measure, PdfDocument, wrap } from "./pdf";

const CREATED_AT = "2026-09-12T15:00:00.000Z";

function render(build: (doc: PdfDocument) => void): string {
  const doc = new PdfDocument({ title: "Prueba", createdAt: CREATED_AT });
  build(doc);
  return new TextDecoder("latin1").decode(doc.toBytes());
}

describe("PdfDocument", () => {
  it("writes a header, a cross-reference table and a trailer", () => {
    const pdf = render((doc) => doc.addPage().text(56, 700, "Hola"));

    expect(pdf.startsWith("%PDF-1.4\n")).toBe(true);
    expect(pdf).toContain("/Type /Catalog");
    expect(pdf.trimEnd().endsWith("%%EOF")).toBe(true);
  });

  it("points every cross-reference entry at the object it claims", () => {
    // The failure this catches is the expensive one: an offset off by a byte
    // gives a file some readers repair in silence and others refuse outright.
    const pdf = render((doc) => {
      doc.addPage().text(56, 700, "Primera");
      doc.addPage().text(56, 700, "Segunda");
    });

    const xrefAt = Number(
      pdf
        .slice(pdf.lastIndexOf("startxref") + 9)
        .trim()
        .split("\n")[0],
    );
    expect(pdf.slice(xrefAt, xrefAt + 4)).toBe("xref");

    const table = pdf.slice(pdf.indexOf("xref\n", xrefAt));
    const offsets = [...table.matchAll(/^(\d{10}) 00000 n $/gm)].map((row) =>
      Number(row[1]),
    );

    expect(offsets.length).toBeGreaterThan(0);
    offsets.forEach((offset, index) => {
      expect(pdf.slice(offset, offset + 8)).toContain(`${index + 1} 0 obj`);
    });
  });

  it("declares a stream length that matches the bytes of the stream", () => {
    const pdf = render((doc) => doc.addPage().text(56, 700, "Contenido"));
    const declared = Number(/\/Length (\d+) >>\nstream\n/.exec(pdf)?.[1]);
    const body = pdf.slice(
      pdf.indexOf("stream\n") + "stream\n".length,
      pdf.indexOf("\nendstream"),
    );

    expect(declared).toBe(body.length);
  });

  it("counts an accented character as one byte, so the offsets stay right", () => {
    const pdf = render((doc) =>
      doc.addPage().text(56, 700, "Maquinados Regios, Peña y Compañía"),
    );
    const declared = Number(/\/Length (\d+) >>\nstream\n/.exec(pdf)?.[1]);
    const body = pdf.slice(
      pdf.indexOf("stream\n") + "stream\n".length,
      pdf.indexOf("\nendstream"),
    );

    expect(body).toContain("Peña y Compañía");
    expect(declared).toBe(body.length);
  });

  it("escapes the three characters that would close a string early", () => {
    const pdf = render((doc) =>
      doc.addPage().text(56, 700, "Folio (A) \\ serie B)"),
    );

    expect(pdf).toContain("(Folio \\(A\\) \\\\ serie B\\)) Tj");
  });

  it("replaces a character outside WinAnsi rather than dropping it", () => {
    // Visible beats invisible: a hole in a legal name has to be noticeable.
    const pdf = render((doc) => doc.addPage().text(56, 700, "límite 中文"));

    expect(pdf).toContain("(límite ??) Tj");
  });

  it("produces the same bytes twice for the same input", () => {
    expect(render((doc) => doc.addPage().text(56, 700, "x"))).toBe(
      render((doc) => doc.addPage().text(56, 700, "x")),
    );
  });

  it("refuses a document with no page", () => {
    expect(() =>
      new PdfDocument({ title: "t", createdAt: CREATED_AT }).toBytes(),
    ).toThrow(/at least one page/);
  });

  it("refuses a creation date that is not an instant", () => {
    const doc = new PdfDocument({ title: "t", createdAt: "ayer" });
    doc.addPage();

    expect(() => doc.toBytes()).toThrow(/not an instant/);
  });
});

describe("measure", () => {
  it("gives a bold string more room than the same string regular", () => {
    expect(measure("Proveedor", "Helvetica-Bold", 10)).toBeGreaterThan(
      measure("Proveedor", "Helvetica", 10),
    );
  });

  it("charges an accented letter the same as the letter under it", () => {
    expect(measure("Peña", "Helvetica", 10)).toBeCloseTo(
      measure("Pena", "Helvetica", 10),
      10,
    );
  });

  it("scales linearly with the size", () => {
    expect(measure("abc", "Helvetica", 20)).toBeCloseTo(
      measure("abc", "Helvetica", 10) * 2,
      10,
    );
  });
});

describe("wrap", () => {
  it("keeps every line inside the width", () => {
    const text =
      "La exposicion es el efecto fiscal de los comprobantes ya pagados y ya deducidos de los proveedores listados";

    for (const line of wrap(text, "Helvetica", 9.5, 200)) {
      expect(measure(line, "Helvetica", 9.5)).toBeLessThanOrEqual(200);
    }
  });

  it("breaks a word that cannot fit, so a UUID never runs off the page", () => {
    const uuid = "7f2c1d64-4a1e-4f0b-9d21-2c4a8b6e5f11";
    const lines = wrap(uuid, "Helvetica", 9.5, 40);

    expect(lines.length).toBeGreaterThan(1);
    expect(lines.join("")).toBe(uuid);
  });

  it("answers with one empty line for an empty string", () => {
    expect(wrap("", "Helvetica", 10, 100)).toEqual([""]);
  });
});
