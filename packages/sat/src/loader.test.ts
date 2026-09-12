/**
 * The loader against the published layout, reproduced here at the scale of a
 * handful of rows. `official.test.ts` runs the same code over the real 14234-row
 * download; this file is where each individual behaviour is pinned.
 *
 * Every RFC in this file is synthetic and starts with SYN. ADR-0002 keeps real
 * RFCs to the lookup path, and the only real ones in the test suite are the two
 * looked up in `official.test.ts`.
 */

import { describe, expect, it } from "bun:test";
import { loadSnapshot, parseSnapshot, SnapshotFormatError } from "./loader";

/** The 20 columns the SAT publishes, spelled as the file spells them. */
const HEADER = [
  "No",
  "RFC",
  "Nombre del Contribuyente",
  "Situación del contribuyente",
  "Número y fecha de oficio global de presunción SAT",
  "Publicación página SAT presuntos",
  "Número y fecha de oficio global de presunción DOF",
  "Publicación DOF presuntos",
  "Número y fecha de oficio global de contribuyentes que desvirtuaron SAT",
  "Publicación página SAT desvirtuados",
  "Número y fecha de oficio global de contribuyentes que desvirtuaron DOF",
  "Publicación DOF desvirtuados",
  "Número y fecha de oficio global de definitivos SAT",
  "Publicación página SAT definitivos",
  "Número y fecha de oficio global de definitivos DOF",
  "Publicación DOF definitivos",
  "Número y fecha de oficio global de sentencia favorable SAT",
  "Publicación página SAT sentencia favorable",
  "Número y fecha de oficio global de sentencia favorable DOF",
  "Publicación DOF sentencia favorable",
] as const;

const PREAMBLE =
  '"Información actualizada al 31 de diciembre de 2025; los listados son de carácter público.",,,,,,,,,,,,,,,,,,,';

interface RowSpec {
  no: string;
  rfc: string;
  name: string;
  situation: string;
  /** [portal, dof] per situation, in SAT_STATUSES order. */
  presunto?: [string, string];
  desvirtuado?: [string, string];
  definitivo?: [string, string];
  sentencia?: [string, string];
}

function csvField(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

function row(spec: RowSpec): string {
  const pair = (dates: [string, string] | undefined): string[] =>
    dates === undefined
      ? ["", "", "", ""]
      : ["oficio", dates[0], "oficio", dates[1]];

  return [
    spec.no,
    spec.rfc,
    spec.name,
    spec.situation,
    ...pair(spec.presunto),
    ...pair(spec.desvirtuado),
    ...pair(spec.definitivo),
    ...pair(spec.sentencia),
  ]
    .map(csvField)
    .join(",");
}

function file(...rows: string[]): string {
  return [
    PREAMBLE,
    "Listado completo de contribuyentes (Artículo 69-B del CFF),,,,,,,,,,,,,,,,,,,",
    HEADER.join(","),
    ...rows,
    "",
  ].join("\r\n");
}

const NOW = "2026-09-12T09:00:00.000Z";

function load(csv: string) {
  return parseSnapshot(csv, {
    listVersion: "2025-12-31",
    source: "test",
    now: NOW,
  });
}

describe("parseSnapshot", () => {
  it("turns one row with a history into one entry per situation", () => {
    // This is the whole point of keeping situations instead of a state: the row
    // says the taxpayer is cleared today, and it also says they were listed
    // definitively between October 2018 and April 2019, which is what decides
    // whether an invoice deducted in November 2018 is still good.
    const snapshot = load(
      file(
        row({
          no: "1",
          rfc: "SYN010203AB1",
          name: "COMERCIALIZADORA SINTETICA UNO SA DE CV",
          situation: "Sentencia Favorable",
          presunto: ["01/06/2018", "25/06/2018"],
          definitivo: ["28/09/2018", "23/10/2018"],
          sentencia: ["05/03/2019", "16/04/2019"],
        }),
      ),
    );

    expect(snapshot.rows).toBe(1);
    expect(snapshot.rejected).toEqual([]);
    expect(snapshot.warnings).toEqual([]);
    expect(
      snapshot.entries.map((entry) => `${entry.status}@${entry.publishedAt}`),
    ).toEqual([
      "presunto@2018-06-25",
      "definitivo@2018-10-23",
      "sentencia_favorable@2019-04-16",
    ]);
    expect(
      snapshot.entries.every((entry) => entry.listVersion === "2025-12-31"),
    ).toBe(true);
  });

  it("prefers the DOF date and falls back to the SAT portal date", () => {
    // 483 situations in the committed snapshot have an unreadable DOF cell and a
    // readable portal date on the same row. Dropping them would take 483 dated
    // situations off a fiscal blacklist to save four lines of code.
    const snapshot = load(
      file(
        row({
          no: "1",
          rfc: "SYN010203AB1",
          name: "SINTETICA UNO",
          situation: "Definitivo",
          presunto: ["12/06/2017", ""],
          definitivo: ["18/03/2019", "44014"],
        }),
      ),
    );

    expect(
      snapshot.entries.map((entry) => `${entry.status}@${entry.publishedAt}`),
    ).toEqual(["presunto@2017-06-12", "definitivo@2019-03-18"]);
  });

  it("resolves columns by name, so a reordered export still loads", () => {
    const reordered = [
      "RFC,Situación del contribuyente,Nombre del Contribuyente,Publicación DOF definitivos",
      "SYN010203AB1,Definitivo,SINTETICA UNO,23/10/2018",
      "",
    ].join("\r\n");

    const snapshot = load(reordered);

    expect(snapshot.entries).toEqual([
      {
        rfc: "SYN010203AB1",
        name: "SINTETICA UNO",
        status: "definitivo",
        publishedAt: "2018-10-23",
        listVersion: "2025-12-31",
      },
    ]);
  });

  it("normalises the RFC the file carries", () => {
    const snapshot = load(
      file(
        row({
          no: "1",
          rfc: " syn010203-ab1 ",
          name: "SINTETICA UNO",
          situation: "Presunto",
          presunto: ["01/06/2018", "25/06/2018"],
        }),
      ),
    );

    expect(snapshot.entries[0]?.rfc).toBe("SYN010203AB1");
  });

  it("reports a redacted RFC instead of matching it or dropping it", () => {
    // 91 rows of the committed snapshot carry XXXXXXXXXXXX where the RFC
    // belongs, because a court ordered the taxpayer's data suppressed. They are
    // real rows of the list and they are reported as unreadable, not skipped.
    const snapshot = load(
      file(
        row({
          no: "1",
          rfc: "XXXXXXXXXXXX",
          name: "Información suprimida",
          situation: "Definitivo",
          definitivo: ["28/09/2018", "23/10/2018"],
        }),
        row({
          no: "2",
          rfc: "SYN020304BC2",
          name: "SINTETICA DOS",
          situation: "Presunto",
          presunto: ["01/06/2018", "25/06/2018"],
        }),
      ),
    );

    expect(snapshot.rows).toBe(2);
    expect(snapshot.entries).toHaveLength(1);
    expect(snapshot.rejected).toHaveLength(1);
    expect(snapshot.rejected[0]?.reason).toBe("rfc_shape");
    // Line 4: two preamble lines, the header, then the first data row.
    expect(snapshot.rejected[0]?.line).toBe(4);
    expect(snapshot.rejected[0]?.raw).toContain("XXXXXXXXXXXX");
  });

  it("reports a row with no readable date anywhere", () => {
    const snapshot = load(
      file(
        row({
          no: "1",
          rfc: "SYN010203AB1",
          name: "SINTETICA UNO",
          situation: "Definitivo",
          definitivo: ["", "44014"],
        }),
      ),
    );

    expect(snapshot.entries).toEqual([]);
    expect(snapshot.rejected[0]?.reason).toBe("no_dated_situation");
  });

  it("warns when the situation the SAT declares has no date of its own", () => {
    // The row is still matched on the situations that do have dates, but the one
    // the SAT calls current cannot be placed in time. A definitivo taxpayer that
    // reads as presunto here is a false negative on a blacklist, so it is
    // reported rather than absorbed.
    const snapshot = load(
      file(
        row({
          no: "1",
          rfc: "SYN010203AB1",
          name: "SINTETICA UNO",
          situation: "Definitivo",
          presunto: ["12/06/2017", "19/01/2017"],
          definitivo: ["", ""],
        }),
      ),
    );

    expect(snapshot.entries).toHaveLength(1);
    expect(snapshot.rejected).toEqual([]);
    expect(snapshot.warnings[0]?.reason).toBe("situation_undated");
    expect(snapshot.warnings[0]?.status).toBe("definitivo");
  });

  it("keeps rows and rejections reconcilable with the portal's count", () => {
    const snapshot = load(
      file(
        row({
          no: "1",
          rfc: "XXXXXXXXXXXX",
          name: "x",
          situation: "Definitivo",
        }),
        row({
          no: "2",
          rfc: "SYN020304BC2",
          name: "SINTETICA DOS",
          situation: "Presunto",
          presunto: ["01/06/2018", "25/06/2018"],
        }),
        row({
          no: "3",
          rfc: "SYN030405CD3",
          name: "SINTETICA TRES",
          situation: "",
        }),
      ),
    );

    const accepted = new Set(snapshot.entries.map((entry) => entry.rfc)).size;
    expect(accepted + snapshot.rejected.length).toBe(snapshot.rows);
  });

  it("reads the currency date out of the preamble instead of guessing one", () => {
    const snapshot = load(
      file(
        row({
          no: "1",
          rfc: "SYN010203AB1",
          name: "SINTETICA UNO",
          situation: "Presunto",
          presunto: ["01/06/2018", "25/06/2018"],
        }),
      ),
    );

    expect(snapshot.publishedAt).toBe("2025-12-31");
    expect(snapshot.loadedAt).toBe(NOW);
  });

  it("refuses a file that is not the listing, instead of returning no rows", () => {
    // An empty list reads as "nobody is listed" to every caller downstream, so a
    // wrong file has to be an exception and never an empty result.
    expect(() => load("hola,mundo\r\n1,2\r\n")).toThrow(SnapshotFormatError);
  });
});

describe("loadSnapshot", () => {
  it("decodes bytes without being told the encoding", async () => {
    const csv = file(
      row({
        no: "1",
        rfc: "SYN010203AB1",
        name: "AVALÚOS SINTETICOS SA DE CV",
        situation: "Presunto",
        presunto: ["01/06/2018", "25/06/2018"],
      }),
    );
    const latin1 = Uint8Array.from(
      csv,
      (character) => character.charCodeAt(0) & 0xff,
    );

    const snapshot = await loadSnapshot(
      { kind: "bytes", bytes: latin1, listVersion: "2025-12-31" },
      { now: NOW },
    );

    expect(snapshot.encoding).toBe("windows-1252");
    expect(snapshot.entries[0]?.name).toBe("AVALÚOS SINTETICOS SA DE CV");
  });

  it("downloads through an injected fetch, so no test touches the network", async () => {
    const csv = file(
      row({
        no: "1",
        rfc: "SYN010203AB1",
        name: "SINTETICA UNO",
        situation: "Presunto",
        presunto: ["01/06/2018", "25/06/2018"],
      }),
    );

    const snapshot = await loadSnapshot({
      kind: "url",
      url: "http://example.invalid/Listado_Completo_69-B.csv",
      listVersion: "2025-12-31",
      fetch: async () => new Response(new TextEncoder().encode(csv)),
    });

    expect(snapshot.entries).toHaveLength(1);
    expect(snapshot.source).toBe(
      "http://example.invalid/Listado_Completo_69-B.csv",
    );
  });

  it("does not treat a 404 page as a list with nobody on it", async () => {
    await expect(
      loadSnapshot({
        kind: "url",
        url: "http://example.invalid/gone.csv",
        listVersion: "2025-12-31",
        fetch: async () =>
          new Response("no", { status: 404, statusText: "Not Found" }),
      }),
    ).rejects.toThrow(SnapshotFormatError);
  });
});
