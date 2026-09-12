/**
 * Every case here was observed in the real download and would be a silent
 * corruption under `text.split("\n").map((l) => l.split(","))`.
 */

import { describe, expect, it } from "bun:test";
import { decodeSnapshot, foldHeader, parseCsv, parseCsvRows } from "./csv";

function bytesOf(...values: number[]): Uint8Array {
  return Uint8Array.from(values);
}

describe("decodeSnapshot", () => {
  it("reads the ISO-8859-1 the SAT actually publishes", () => {
    // 0xF3 is a lone byte. As UTF-8 it is the start of a 4-byte sequence that
    // never arrives, so a UTF-8 decoder turns the name into replacement
    // characters and the CEP holder-name comparison silently stops matching.
    const decoded = decodeSnapshot(
      bytesOf(0x50, 0x55, 0x42, 0x4c, 0x49, 0x43, 0x41, 0x43, 0x49, 0xd3, 0x4e),
    );

    expect(decoded.encoding).toBe("windows-1252");
    expect(decoded.text).toBe("PUBLICACIÓN");
  });

  it("prefers UTF-8 when the bytes are valid UTF-8", () => {
    const decoded = decodeSnapshot(new TextEncoder().encode("AVALÚOS"));

    expect(decoded.encoding).toBe("utf-8");
    expect(decoded.text).toBe("AVALÚOS");
  });

  it("strips a UTF-8 byte order mark and says it saw one", () => {
    const decoded = decodeSnapshot(
      bytesOf(0xef, 0xbb, 0xbf, 0x4e, 0x6f, 0x2c, 0x52, 0x46, 0x43),
    );

    expect(decoded.hadByteOrderMark).toBe(true);
    // Left in place, the mark makes the first header cell "﻿No", which
    // resolves no column by name and empties the list.
    expect(decoded.text).toBe("No,RFC");
    expect(parseCsv(decoded.text)[0]?.[0]).toBe("No");
  });

  it("decodes nothing as nothing rather than throwing", () => {
    expect(decodeSnapshot(bytesOf()).text).toBe("");
  });
});

describe("parseCsv", () => {
  it("keeps a comma inside a quoted legal name", () => {
    const rows = parseCsv(
      '1,AAA010101AAA,"IMPORTACIONES, S.A. DE C.V.",Definitivo',
    );

    expect(rows[0]).toEqual([
      "1",
      "AAA010101AAA",
      "IMPORTACIONES, S.A. DE C.V.",
      "Definitivo",
    ]);
  });

  it("unescapes a doubled quote", () => {
    expect(parseCsv('"GRUPO ""ALFA"" SA"')[0]?.[0]).toBe('GRUPO "ALFA" SA');
  });

  it("keeps a record that spans lines as one record", () => {
    // Two of the 14234 rows in the committed snapshot carry a bare newline
    // inside the legal name, which is why the row count and the line count of
    // the file are different numbers.
    const rows = parseCsv(
      '1,"RAZON\nSOCIAL",Definitivo\r\n2,OTRA,Presunto\r\n',
    );

    expect(rows).toHaveLength(2);
    expect(rows[0]?.[1]).toBe("RAZON\nSOCIAL");
    expect(rows[1]?.[0]).toBe("2");
  });

  it("reads CRLF and LF the same way", () => {
    expect(parseCsv("a,b\r\nc,d")).toEqual(parseCsv("a,b\nc,d"));
  });

  it("does not invent a row after a trailing newline", () => {
    expect(parseCsv("a,b\r\n")).toHaveLength(1);
  });

  it("keeps an empty trailing field", () => {
    expect(parseCsv("a,b,")[0]).toEqual(["a", "b", ""]);
  });

  it("absorbs text that follows a closing quote instead of splitting the row", () => {
    // An export that writes "NOMBRE" SA de CV is malformed under RFC 4180. A
    // parser that stops at the closing quote reads the rest as a new record and
    // shifts every column after it.
    const rows = parseCsv('1,"NOMBRE" SA de CV,Presunto');

    expect(rows).toHaveLength(1);
    expect(rows[0]?.[1]).toBe("NOMBRE SA de CV");
    expect(rows[0]?.[2]).toBe("Presunto");
  });

  it("takes the rest of the file when a quote is never closed", () => {
    // Losing every row after a stray quote is the failure this tolerance exists
    // to avoid: the caller gets a rejected row, not a truncated blacklist.
    const rows = parseCsv('1,ok,Presunto\r\n2,"never closed,Definitivo');

    expect(rows).toHaveLength(2);
    expect(rows[1]?.[1]).toBe("never closed,Definitivo");
  });
});

describe("parseCsvRows", () => {
  it("reports the line a record starts on, not the line it ends on", () => {
    const rows = parseCsvRows('h1,h2\r\n1,"A\nB"\r\n3,C\r\n');

    expect(rows.map((row) => row.line)).toEqual([1, 2, 4]);
  });

  it("hands back the exact source span of a record", () => {
    const input = "a,b\r\nc,d\r\n";
    const second = parseCsvRows(input)[1];

    expect(input.slice(second?.start ?? 0, second?.end ?? 0)).toBe("c,d");
  });
});

describe("foldHeader", () => {
  it("folds the accents and the spacing the published header carries", () => {
    expect(foldHeader("  Publicación   DOF  presuntos ")).toBe(
      "publicacion dof presuntos",
    );
  });
});
