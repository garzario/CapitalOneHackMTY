/**
 * Two things are tested here: the normalisation that every comparison in this
 * package runs through, and the invariants of the synthetic fixture.
 *
 * The fixture invariants are not decoration. The fixture is a stand-in for a fiscal
 * blacklist, so "every RFC is invented" and "every name reads as invented" have to be
 * assertions rather than a convention someone remembers. ADR-0002 is the rule they
 * enforce.
 *
 * matchRfc is implemented here because the `sat_69b` adapter in @hackmty/engine is
 * built on it (issue #106). loadSnapshot and sweep are still stubs (issue #35) and
 * are asserted to throw with their own name, so a half-wired call path fails loudly
 * instead of returning an empty list that reads as a clean supplier.
 */

import { describe, expect, it } from "bun:test";
import {
  DEFAULT_IVA_RATE,
  isListed,
  isMoralRfc,
  isRfcShaped,
  isSyntheticRfc,
  loadSnapshot,
  matchRfc,
  normalizeRfc,
  parseSatStatus,
  SAT_STATUS_LABELS,
  SAT_STATUSES,
  SYNTHETIC_LIST_VERSION,
  SYNTHETIC_SNAPSHOT_COLUMNS,
  SYNTHETIC_SNAPSHOT_CSV,
  SYNTHETIC_SNAPSHOT_ENTRIES,
  sweep,
  toOfficialCsv,
} from "./index";

describe("normalizeRfc", () => {
  it("uppercases and drops what a human adds", () => {
    expect(normalizeRfc(" syn010203-ab1 ")).toBe("SYN010203AB1");
    expect(normalizeRfc("syn010203 ab1")).toBe("SYN010203AB1");
    expect(normalizeRfc("SYN.010203.AB1")).toBe("SYN010203AB1");
  });

  it("keeps the characters that change who the taxpayer is", () => {
    // & and N with a tilde are legitimate in the name portion of a moral RFC, so
    // stripping them would turn one taxpayer into a different one.
    expect(normalizeRfc("a&n010203ab1")).toBe("A&N010203AB1");
    expect(normalizeRfc("ñor010203ab1")).toBe("ÑOR010203AB1");
  });
});

describe("isRfcShaped", () => {
  it("accepts both lengths", () => {
    expect(isRfcShaped("SYN010203AB1")).toBe(true);
    expect(isRfcShaped("GOMP850101HX4")).toBe(true);
  });

  it("rejects anything that is not an RFC", () => {
    expect(isRfcShaped("")).toBe(false);
    expect(isRfcShaped("SYN010203")).toBe(false);
    expect(isRfcShaped("SY010203AB1")).toBe(false);
    expect(isRfcShaped("SYNABCDEFAB1")).toBe(false);
    expect(isRfcShaped("SYN010203AB12")).toBe(false);
  });

  it("separates moral from physical by length", () => {
    expect(isMoralRfc("SYN010203AB1")).toBe(true);
    expect(isMoralRfc("GOMP850101HX4")).toBe(false);
  });
});

describe("parseSatStatus", () => {
  it("reads every label the file can carry", () => {
    for (const status of SAT_STATUSES) {
      expect(parseSatStatus(SAT_STATUS_LABELS[status])).toBe(status);
    }
  });

  it("folds accents, case and extra whitespace", () => {
    expect(parseSatStatus("  SENTENCIA   FAVORABLE ")).toBe(
      "sentencia_favorable",
    );
    expect(parseSatStatus("Definitivo")).toBe("definitivo");
  });

  it("returns undefined rather than guessing", () => {
    expect(parseSatStatus("")).toBeUndefined();
    expect(parseSatStatus("en revision")).toBeUndefined();
  });

  it("treats only presunto and definitivo as listed", () => {
    expect(isListed("presunto")).toBe(true);
    expect(isListed("definitivo")).toBe(true);
    expect(isListed("desvirtuado")).toBe(false);
    expect(isListed("sentencia_favorable")).toBe(false);
  });
});

describe("the synthetic snapshot", () => {
  it("has exactly twenty rows with unique RFCs", () => {
    expect(SYNTHETIC_SNAPSHOT_ENTRIES).toHaveLength(20);
    const rfcs = new Set(SYNTHETIC_SNAPSHOT_ENTRIES.map((row) => row.rfc));
    expect(rfcs.size).toBe(20);
  });

  it("carries no real RFC, which is the ADR-0002 rule", () => {
    for (const row of SYNTHETIC_SNAPSHOT_ENTRIES) {
      expect(isSyntheticRfc(row.rfc)).toBe(true);
      expect(isRfcShaped(row.rfc)).toBe(true);
      expect(normalizeRfc(row.rfc)).toBe(row.rfc);
    }
  });

  it("names every row as invented, because a blacklist row is an accusation", () => {
    for (const row of SYNTHETIC_SNAPSHOT_ENTRIES) {
      expect(row.name).toMatch(/SINTETIC[AO]S?/);
    }
  });

  it("covers all four situations, not just the alarming ones", () => {
    const seen = new Set(SYNTHETIC_SNAPSHOT_ENTRIES.map((row) => row.status));
    expect([...seen].sort()).toEqual([...SAT_STATUSES].sort());

    // The cleared statuses are the ones a false positive hurts most, so there has
    // to be more than a token row of each.
    const cleared = SYNTHETIC_SNAPSHOT_ENTRIES.filter(
      (row) => !isListed(row.status),
    );
    expect(cleared.length).toBeGreaterThanOrEqual(6);
  });

  it("stamps one version and a publication date that precedes it", () => {
    for (const row of SYNTHETIC_SNAPSHOT_ENTRIES) {
      expect(row.listVersion).toBe(SYNTHETIC_LIST_VERSION);
      expect(row.publishedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(row.publishedAt <= SYNTHETIC_LIST_VERSION).toBe(true);
    }
  });
});

describe("toOfficialCsv", () => {
  it("renders a header and one line per row", () => {
    const lines = SYNTHETIC_SNAPSHOT_CSV.split("\r\n");
    expect(lines).toHaveLength(21);
    expect(lines[0]).toBe(SYNTHETIC_SNAPSHOT_COLUMNS.join(","));
  });

  it("quotes the one name that carries a comma", () => {
    // A parser that splits on every comma sees six fields on this line and fails
    // here, in a test, instead of in front of a judge.
    expect(SYNTHETIC_SNAPSHOT_CSV).toContain(
      '"IMPORTACIONES SINTETICAS DIECIOCHO, SA DE CV"',
    );
  });

  it("escapes an embedded quote the way RFC 4180 asks", () => {
    const csv = toOfficialCsv([
      {
        rfc: "SYN010203AB1",
        name: 'COMERCIALIZADORA "SINTETICA" UNO SA DE CV',
        status: "presunto",
        publishedAt: "2026-01-01",
        listVersion: "2026-01-01",
      },
    ]);

    expect(csv).toContain('"COMERCIALIZADORA ""SINTETICA"" UNO SA DE CV"');
  });
});

describe("matchRfc", () => {
  it("reads the situation in force off the newest publication", () => {
    const match = matchRfc(SYNTHETIC_SNAPSHOT_ENTRIES, "SYN010203AB1");

    expect(match.effective?.status).toBe("definitivo");
    expect(match.listed).toBe(true);
  });

  it("does not list a taxpayer who cleared their name afterwards", () => {
    // The same RFC twice: presumed in June, cleared in August. Alerting on the
    // old row is the behaviour ADR-0002 forbids.
    const match = matchRfc(
      [
        {
          rfc: "SYN990909ZZ9",
          name: "PROVEEDORA SINTETICA NOVENTA SA DE CV",
          status: "presunto",
          publishedAt: "2026-06-27",
          listVersion: "2026-06-27",
        },
        {
          rfc: "SYN990909ZZ9",
          name: "PROVEEDORA SINTETICA NOVENTA SA DE CV",
          status: "desvirtuado",
          publishedAt: "2026-08-14",
          listVersion: "2026-08-14",
        },
      ],
      "SYN990909ZZ9",
    );

    expect(match.effective?.status).toBe("desvirtuado");
    expect(match.listed).toBe(false);
    expect(match.entries).toHaveLength(2);
  });

  it("matches an RFC a human typed with spaces and a hyphen", () => {
    expect(matchRfc(SYNTHETIC_SNAPSHOT_ENTRIES, " syn010203-ab1 ").rfc).toBe(
      "SYN010203AB1",
    );
    expect(matchRfc(SYNTHETIC_SNAPSHOT_ENTRIES, " syn010203-ab1 ").listed).toBe(
      true,
    );
  });

  it("answers not listed, with no effective row, for an RFC nobody published", () => {
    const match = matchRfc(SYNTHETIC_SNAPSHOT_ENTRIES, "SYN000000XX0");

    expect(match.entries).toEqual([]);
    expect(match.effective).toBeUndefined();
    expect(match.listed).toBe(false);
  });

  it("does not reorder the caller's array", () => {
    const entries = [...SYNTHETIC_SNAPSHOT_ENTRIES];
    const before = entries.map((entry) => entry.rfc);

    matchRfc(entries, "SYN010203AB1");

    expect(entries.map((entry) => entry.rfc)).toEqual(before);
  });
});

describe("the unimplemented surface", () => {
  it("throws with its own name and its issue number", async () => {
    expect(() => sweep([], { listVersion: SYNTHETIC_LIST_VERSION })).toThrow(
      /sweep.*#35/,
    );
    await expect(
      loadSnapshot({
        kind: "text",
        csv: SYNTHETIC_SNAPSHOT_CSV,
        listVersion: SYNTHETIC_LIST_VERSION,
      }),
    ).rejects.toThrow(/loadSnapshot.*#35/);
  });

  it("states the rates it will apply rather than implying them", () => {
    expect(DEFAULT_IVA_RATE).toBe(0.16);
  });
});
