/**
 * The embedded plaza table has to be the committed CSV.
 *
 * `./plazas.ts` is a transcription of `./snapshot/plazas-2026-09-13.csv`, written
 * out as TypeScript because `packages/core` is bundled into a browser and cannot
 * read a file at runtime. A transcription nobody checks is a second dataset, and
 * `scripts/web-mock.test.ts` exists in this repository because a second dataset
 * already cost it a demo once.
 *
 * So this file parses the CSV and compares it row for row, and then pins the
 * counts the provenance README quotes. A re-transcription that drops a row, a
 * state abbreviation that changes spelling, or a hand edit to either side fails
 * here rather than in front of a judge.
 *
 * Reading a committed file is hermetic: no network, no database, no key.
 */

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  BANXICO_PLAZA_NAMES,
  BANXICO_PLAZA_SNAPSHOT,
  lookupPlaza,
  POSTAL_PREFIX_STATES,
  plazaLabel,
  plazaLabels,
  stateOfPostalCode,
} from "./plazas";

const CSV = join(import.meta.dir, BANXICO_PLAZA_SNAPSHOT.file);

interface Row {
  code: string;
  name: string;
}

function parseSnapshot(): Row[] {
  const text = readFileSync(CSV, "utf8");
  const lines = text.split("\n").filter((line) => line.length > 0);
  const header = lines.shift();
  expect(header).toBe("clave,nombre");
  return lines.map((line) => {
    const comma = line.indexOf(",");
    /* The file is allowed no quoting precisely because no value carries a comma,
       so a second one would mean the transcription rules were broken. */
    expect(line.indexOf(",", comma + 1)).toBe(-1);
    return { code: line.slice(0, comma), name: line.slice(comma + 1) };
  });
}

const rows = parseSnapshot();

describe("the committed catalogue", () => {
  test("holds the row count the README states", () => {
    expect(rows).toHaveLength(BANXICO_PLAZA_SNAPSHOT.rows);
    expect(BANXICO_PLAZA_SNAPSHOT.rows).toBe(786);
  });

  test("is three digits and a name on every row", () => {
    for (const row of rows) {
      expect(row.code).toMatch(/^\d{3}$/);
      expect(row.name.length).toBeGreaterThan(0);
      expect(row.name).toBe(row.name.trim());
    }
  });

  test("keeps the one row the catalogue does not write in capitals", () => {
    /* 785 of the 786 names are upper case and `344` is `Ixtlixochitl EDOMEX`,
       exactly as published. It is pinned because it is the cheapest possible
       proof that the transcription copied the catalogue instead of normalising
       it: a tidying pass over this file would turn that row into IXTLIXOCHITL
       and fail here. */
    const mixedCase = rows.filter((row) => row.name !== row.name.toUpperCase());

    expect(mixedCase).toEqual([{ code: "344", name: "Ixtlixochitl EDOMEX" }]);
  });

  test("is strictly increasing and carries no duplicate code", () => {
    const codes = rows.map((row) => Number(row.code));
    expect(codes).toEqual([...codes].sort((left, right) => left - right));
    expect(new Set(codes).size).toBe(codes.length);
    expect(rows[0]?.code).toBe("010");
    expect(rows[rows.length - 1]?.code).toBe("962");
  });

  test("ends every name in a state abbreviation, across 32 states", () => {
    const perState = new Map<string, number>();
    for (const row of rows) {
      const cut = row.name.lastIndexOf(" ");
      expect(cut).toBeGreaterThan(0);
      const state = row.name.slice(cut + 1);
      expect(state).toMatch(/^[A-Z]{2,6}$/);
      perState.set(state, (perState.get(state) ?? 0) + 1);
    }

    /* The table in snapshot/README.md, which is the thing a judge reads. Pinned
       here so the two cannot drift. */
    expect(Object.fromEntries([...perState].sort())).toEqual({
      AGS: 8,
      BCN: 9,
      BCS: 8,
      CAM: 8,
      CHIH: 24,
      CHIS: 40,
      COA: 22,
      COL: 9,
      DF: 1,
      DGO: 13,
      EDOMEX: 45,
      GRO: 23,
      GTO: 40,
      HGO: 25,
      JAL: 96,
      MICH: 68,
      MOR: 13,
      NAY: 18,
      NL: 22,
      OAX: 31,
      PUE: 27,
      QRO: 7,
      QROO: 5,
      SIN: 21,
      SLP: 23,
      SON: 24,
      TAB: 18,
      TAMPS: 18,
      TLAX: 10,
      VER: 67,
      YUC: 11,
      ZAC: 32,
    });
  });
});

describe("the embedded table", () => {
  test("is the committed file, row for row", () => {
    expect(BANXICO_PLAZA_NAMES).toEqual(
      Object.fromEntries(rows.map((row) => [row.code, row.name])),
    );
  });

  test("carries no code the committed file does not", () => {
    expect(Object.keys(BANXICO_PLAZA_NAMES)).toHaveLength(rows.length);
  });
});

describe("lookupPlaza", () => {
  test("splits the published name into a city and a state", () => {
    expect(lookupPlaza("180")).toEqual({
      code: "180",
      city: "DISTRITO FEDERAL",
      state: "DF",
    });
    expect(lookupPlaza("078")).toEqual({
      code: "078",
      city: "SALTILLO",
      state: "COA",
    });
  });

  test("keeps a multi-word city whole", () => {
    expect(lookupPlaza("961")).toEqual({
      code: "961",
      city: "VILLA GONZALEZ ORTEGA",
      state: "ZAC",
    });
  });

  test("answers the Monterrey metropolitan plaza and Pesqueria apart", () => {
    /* The two codes `@hackmty/seed` mints on, and the reason the seeded dataset
       is not all one plaza: the catalogue gives Pesqueria its own. */
    expect(lookupPlaza("580")?.city).toBe("APODACA");
    expect(lookupPlaza("580")?.state).toBe("NL");
    expect(lookupPlaza("598")?.city).toBe("PESQUERIA");
  });

  test("names no municipality of the Monterrey metropolitan area", () => {
    /* The observation snapshot/README.md rests on, asserted so a future
       catalogue that adds MONTERREY NL forces the seed to be reconsidered
       instead of silently keeping a plaza that stopped being the right one. */
    const nuevoLeon = rows
      .filter((row) => row.name.endsWith(" NL"))
      .map((row) => row.name);
    expect(nuevoLeon).toHaveLength(22);
    for (const metro of [
      "MONTERREY",
      "GUADALUPE",
      "SAN NICOLAS",
      "SANTA CATARINA",
      "ESCOBEDO",
      "GARCIA",
      "SAN PEDRO",
    ]) {
      expect(nuevoLeon.some((name) => name.startsWith(`${metro} `))).toBe(
        false,
      );
    }
  });

  test("answers undefined for a code the snapshot does not carry", () => {
    /* A stale catalogue has to be silence. Anything else would let the table
       make a claim about an account. */
    expect(lookupPlaza("999")).toBeUndefined();
    expect(lookupPlaza("000")).toBeUndefined();
    expect(lookupPlaza("18")).toBeUndefined();
    expect(lookupPlaza("0180")).toBeUndefined();
    expect(lookupPlaza("")).toBeUndefined();
  });

  test("is not fooled by an inherited property name", () => {
    /* `BANXICO_PLAZA_NAMES` is an object literal, so "constructor" and
       "toString" resolve on the prototype. A lookup that returned a plaza for
       them would put a function body on a screen. */
    expect(lookupPlaza("constructor")).toBeUndefined();
    expect(lookupPlaza("toString")).toBeUndefined();
  });
});

describe("plazaLabel", () => {
  test("prints the code beside the place", () => {
    expect(plazaLabel("180")).toBe("180 (DISTRITO FEDERAL, DF)");
    expect(plazaLabel("580")).toBe("580 (APODACA, NL)");
  });

  test("falls back to the bare code when the snapshot does not know it", () => {
    expect(plazaLabel("999")).toBe("999");
  });

  test("joins several plazas the way Spanish does", () => {
    expect(plazaLabels([])).toBe("");
    expect(plazaLabels(["580"])).toBe("580 (APODACA, NL)");
    expect(plazaLabels(["580", "598"])).toBe(
      "580 (APODACA, NL) y 598 (PESQUERIA, NL)",
    );
    expect(plazaLabels(["580", "598", "180"])).toBe(
      "580 (APODACA, NL), 598 (PESQUERIA, NL) y 180 (DISTRITO FEDERAL, DF)",
    );
  });
});

describe("stateOfPostalCode", () => {
  test("reads the state off the first two digits", () => {
    expect(stateOfPostalCode("64000")).toBe("NL");
    expect(stateOfPostalCode("66600")).toBe("NL");
    expect(stateOfPostalCode("06700")).toBe("DF");
  });

  test("answers undefined for anything that is not five digits", () => {
    expect(stateOfPostalCode("6400")).toBeUndefined();
    expect(stateOfPostalCode("640000")).toBeUndefined();
    expect(stateOfPostalCode("64 00")).toBeUndefined();
    expect(stateOfPostalCode("")).toBeUndefined();
  });

  test("answers undefined for a prefix the bounded table does not carry", () => {
    /* Most of the country. Silence is the designed answer: the table is the
       demo's states and a national mapping needs the SAT catalogue. */
    expect(stateOfPostalCode("44100")).toBeUndefined();
    expect(stateOfPostalCode("25000")).toBeUndefined();
  });

  test("maps only into states the plaza catalogue also uses", () => {
    /* A prefix that resolved to an abbreviation no plaza carries could never
       agree with a plaza, so it would accuse every account in that state. */
    const plazaStates = new Set(
      rows.map((row) => row.name.slice(row.name.lastIndexOf(" ") + 1)),
    );
    for (const state of Object.values(POSTAL_PREFIX_STATES)) {
      expect(plazaStates.has(state)).toBe(true);
    }
  });
});
