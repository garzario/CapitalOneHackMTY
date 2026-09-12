/**
 * The date shapes below were counted in the 2026-09-12 download, not imagined.
 * 28623 of the 29106 dated situations are plain DD/MM/YYYY; these are the rest.
 */

import { describe, expect, it } from "bun:test";
import { parseDofDate, parseDofDates, parseUpdatedAsOf } from "./dates";

describe("parseDofDate", () => {
  it("reads the ordinary DD/MM/YYYY", () => {
    expect(parseDofDate("28/06/2018")).toBe("2018-06-28");
  });

  it("reads a single-digit day and month", () => {
    expect(parseDofDate("5/3/2019")).toBe("2019-03-05");
  });

  it("expands a two-digit year into this century", () => {
    // "30/10/18" appears in the file. The list begins in 2014 and the SAT cannot
    // publish a future oficio, so there is no century to guess at.
    expect(parseDofDate("30/10/18")).toBe("2018-10-30");
  });

  it("takes the earliest when one cell names two publications", () => {
    // The question this package answers is whether a deduction we already took
    // was covered on the day we took it, so the first publication is the one
    // that decides.
    expect(parseDofDate("20/06/2022 - 13/05/2021")).toBe("2021-05-13");
    expect(parseDofDates("20/06/2022 - 13/05/2021")).toEqual([
      "2021-05-13",
      "2022-06-20",
    ]);
  });

  it("refuses a bare spreadsheet serial", () => {
    // One cell in the committed snapshot holds 44014. There is no date visible
    // in it, the loader has a documented fallback column for that row, and
    // converting an Excel epoch nobody on the team can check against the DOF is
    // not a number this product is willing to put on a screen.
    expect(parseDofDate("44014")).toBeUndefined();
  });

  it("refuses a day that does not exist", () => {
    // 31/02/2020 would otherwise roll forward into 2020-03-02, a date the DOF
    // never published.
    expect(parseDofDate("31/02/2020")).toBeUndefined();
    expect(parseDofDate("00/01/2020")).toBeUndefined();
    expect(parseDofDate("01/13/2020")).toBeUndefined();
  });

  it("reads an empty or wordy cell as no date at all", () => {
    expect(parseDofDate("")).toBeUndefined();
    expect(parseDofDate("   ")).toBeUndefined();
    expect(parseDofDate("500-05-2018-16632")).toBeUndefined();
  });

  it("reads back an ISO day it wrote itself", () => {
    // The hyphen in 2025-12-31 is also the separator between two dates in one
    // cell, so the whole cell is tried before it is split.
    expect(parseDofDate("2025-12-31")).toBe("2025-12-31");
  });
});

describe("parseUpdatedAsOf", () => {
  it("reads the currency date out of the file's own preamble", () => {
    expect(
      parseUpdatedAsOf(
        "Información actualizada al 31 de diciembre de 2025; los listados a que se hace mención",
      ),
    ).toBe("2025-12-31");
  });

  it("does not care about accents or case", () => {
    expect(
      parseUpdatedAsOf("INFORMACION ACTUALIZADA AL 1 DE ENERO DE 2026"),
    ).toBe("2026-01-01");
  });

  it("returns undefined rather than guessing a version date", () => {
    expect(
      parseUpdatedAsOf("Listado completo de contribuyentes"),
    ).toBeUndefined();
    expect(
      parseUpdatedAsOf("actualizada al 31 de brumario de 2025"),
    ).toBeUndefined();
  });
});
