/**
 * Matching, and specifically the cases where matching wrong costs money:
 * alerting on a taxpayer who already cleared their name, and forgetting that a
 * taxpayer who is clean today was listed on the day we deducted their invoice.
 *
 * Every RFC here is synthetic. ADR-0002 keeps real RFCs to the lookup path.
 */

import { describe, expect, it } from "bun:test";
import type { SatListEntry } from "@hackmty/core";
import { createSatIndex, matchRfc, matchRfcAsOf, statusHistory } from "./match";

function entry(
  rfc: string,
  status: SatListEntry["status"],
  publishedAt: string,
  listVersion = "2025-12-31",
): SatListEntry {
  return { rfc, name: `SINTETICA ${rfc}`, status, publishedAt, listVersion };
}

/** One taxpayer presumed, listed definitively, then cleared by a court. */
const CLEARED: SatListEntry[] = [
  entry("SYN010203AB1", "presunto", "2018-06-25"),
  entry("SYN010203AB1", "definitivo", "2018-10-23"),
  entry("SYN010203AB1", "sentencia_favorable", "2019-04-16"),
];

const LISTED: SatListEntry[] = [
  entry("SYN020304BC2", "presunto", "2019-04-26"),
  entry("SYN020304BC2", "definitivo", "2019-11-20"),
];

const ALL = [...CLEARED, ...LISTED];

describe("matchRfc", () => {
  it("takes the newest row as the one that decides", () => {
    const match = matchRfc(ALL, "SYN010203AB1");

    expect(match.effective?.status).toBe("sentencia_favorable");
    expect(match.entries.map((row) => row.publishedAt)).toEqual([
      "2019-04-16",
      "2018-10-23",
      "2018-06-25",
    ]);
  });

  it("does not alert on a taxpayer who already cleared their name", () => {
    // A product that keeps firing on the 2018 definitivo row is a product the
    // clerk stops trusting inside a week, and that costs more than the alert.
    expect(matchRfc(ALL, "SYN010203AB1").listed).toBe(false);
    expect(matchRfc(ALL, "SYN020304BC2").listed).toBe(true);
  });

  it("normalises what a judge types into the box", () => {
    const match = matchRfc(ALL, " syn-020304 bc2 ");

    expect(match.rfc).toBe("SYN020304BC2");
    expect(match.listed).toBe(true);
  });

  it("answers an unlisted RFC rather than failing on it", () => {
    const match = matchRfc(ALL, "SYN999999ZZ9");

    expect(match.entries).toEqual([]);
    expect(match.effective).toBeUndefined();
    expect(match.listed).toBe(false);
  });

  it("breaks a same-day tie towards the later situation", () => {
    // When two rows share a date and a version the file cannot say which came
    // last. Reading the clearing as the later one is the error a person catches
    // by looking at the entries; the other error holds a supplier's money.
    const sameDay = [
      entry("SYN030405CD3", "definitivo", "2020-05-01"),
      entry("SYN030405CD3", "sentencia_favorable", "2020-05-01"),
    ];

    expect(matchRfc(sameDay, "SYN030405CD3").effective?.status).toBe(
      "sentencia_favorable",
    );
  });

  it("prefers the newer list version when the publication dates agree", () => {
    const versions = [
      entry("SYN040506DE4", "presunto", "2020-05-01", "2020-06-30"),
      entry("SYN040506DE4", "presunto", "2020-05-01", "2021-06-30"),
    ];

    expect(matchRfc(versions, "SYN040506DE4").effective?.listVersion).toBe(
      "2021-06-30",
    );
  });
});

describe("matchRfcAsOf", () => {
  it("answers what we knew on the day we paid, not what we know now", () => {
    // The taxpayer is clean today. On 2018-11-15, when the invoice was deducted,
    // they were on the definitive list, and that is what sizes the exposure.
    expect(
      matchRfcAsOf(ALL, "SYN010203AB1", "2018-11-15").effective?.status,
    ).toBe("definitivo");
    expect(matchRfcAsOf(ALL, "SYN010203AB1", "2018-11-15").listed).toBe(true);
  });

  it("hides a publication that had not happened yet", () => {
    expect(matchRfcAsOf(ALL, "SYN010203AB1", "2018-01-01").entries).toEqual([]);
  });

  it("includes a publication made on the day itself", () => {
    expect(matchRfcAsOf(ALL, "SYN010203AB1", "2018-06-25").listed).toBe(true);
  });

  it("accepts a full instant, not only a day", () => {
    expect(
      matchRfcAsOf(ALL, "SYN010203AB1", "2018-11-15T21:30:00.000Z").listed,
    ).toBe(true);
  });
});

describe("statusHistory", () => {
  it("reads oldest first, which is the order the taxpayer moved through", () => {
    expect(statusHistory(ALL, "SYN010203AB1")).toEqual([
      "presunto",
      "definitivo",
      "sentencia_favorable",
    ]);
  });

  it("is empty for a taxpayer on no row", () => {
    expect(statusHistory(ALL, "SYN999999ZZ9")).toEqual([]);
  });
});

describe("createSatIndex", () => {
  it("answers the same thing the linear matcher does", () => {
    const index = createSatIndex(ALL);

    for (const rfc of ["SYN010203AB1", "SYN020304BC2", "SYN999999ZZ9"]) {
      expect(index.match(rfc)).toEqual(matchRfc(ALL, rfc));
    }
  });

  it("counts taxpayers and rows separately", () => {
    const index = createSatIndex(ALL);

    // One taxpayer carries one row per situation, so the two numbers differ and
    // reporting rows as "suppliers on the list" would overstate it by 2.4x.
    expect(index.taxpayers).toBe(2);
    expect(index.size).toBe(5);
  });

  it("hands out copies, so a caller cannot edit the list in place", () => {
    const index = createSatIndex(ALL);
    index.lookup("SYN020304BC2").pop();

    expect(index.lookup("SYN020304BC2")).toHaveLength(2);
  });
});
