/**
 * The date shapes below were counted in the 2026-09-12 download, not imagined.
 * 28623 of the 29106 dated situations are plain DD/MM/YYYY; these are the rest.
 */

import { describe, expect, it } from "bun:test";
import {
  addNaturalDays,
  naturalDaysBetween,
  parseDofDate,
  parseDofDates,
  parseUpdatedAsOf,
} from "./dates";

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

describe("the Spanish long form, which the 49 Bis oficios use", () => {
  it("reads the shape the Anexo writes", () => {
    // Seven of the fourteen oficios the DOF had published under article 49 Bis,
    // fraccion X by 2026-09-12 write the notification dates this way and seven
    // write them as DD/MM/YYYY, the change falling between oficio
    // 500-05-00-00-00-2026-24291 and 500-05-00-00-00-2026-24292.
    expect(parseDofDate("06 de agosto de 2026")).toBe("2026-08-06");
    expect(parseDofDate("3 de julio de 2026")).toBe("2026-07-03");
  });

  it("does not care about accents, case or doubled spaces", () => {
    expect(parseDofDate("17  DE  JULIO  DE  2026")).toBe("2026-07-17");
  });

  it("refuses a month that does not exist rather than guessing", () => {
    expect(parseDofDate("10 de brumario de 2026")).toBeUndefined();
    expect(parseDofDate("31 de febrero de 2026")).toBeUndefined();
  });
});

describe("addNaturalDays", () => {
  it("adds calendar days, so weekends and month ends count", () => {
    expect(addNaturalDays("2026-08-28", 29)).toBe("2026-09-26");
    expect(addNaturalDays("2026-12-20", 29)).toBe("2027-01-18");
    expect(addNaturalDays("2028-02-10", 29)).toBe("2028-03-10");
  });

  it("goes backwards too, and refuses a day it cannot read", () => {
    expect(addNaturalDays("2026-09-12", -1)).toBe("2026-09-11");
    expect(addNaturalDays("12/09/2026", 1)).toBeUndefined();
  });
});

describe("naturalDaysBetween", () => {
  it("counts whole days, negative when the second date is earlier", () => {
    expect(naturalDaysBetween("2026-09-12", "2026-09-26")).toBe(14);
    expect(naturalDaysBetween("2026-09-12", "2026-09-12")).toBe(0);
    expect(naturalDaysBetween("2026-09-12", "2026-08-08")).toBe(-35);
  });

  it("crosses a daylight-saving boundary in the UTC it computes in", () => {
    // Computed in UTC on purpose: a deadline that moves with the timezone of the
    // process is a fiscal date that is one day wrong on somebody's machine.
    expect(naturalDaysBetween("2026-03-01", "2026-04-01")).toBe(31);
  });
});
