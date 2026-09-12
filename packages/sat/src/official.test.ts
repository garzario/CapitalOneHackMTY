/**
 * The committed download of the real list.
 *
 * This is the only file in the repository that names real RFCs, and it only ever
 * LOOKS THEM UP. ADR-0002 is the rule: a real RFC may appear in the read-only
 * lookup path and nowhere else, never next to a synthetic invoice, a synthetic
 * finding or a sweep. The two taxpayers below are on a public list the SAT
 * publishes in the DOF, they are read out of the committed file, and nothing in
 * this file joins them to anything.
 *
 * The counts are asserted because they are the reconciliation: if a future
 * download changes them, the numbers quoted in `snapshot/README.md` and in the
 * pitch stop being true, and a test failing is how we find out.
 */

import { describe, expect, it } from "bun:test";
import { createSatIndex } from "./match";
import {
  loadOfficialSnapshot,
  OFFICIAL_SNAPSHOT_FILENAME,
  OFFICIAL_SNAPSHOT_LIST_VERSION,
  OFFICIAL_SNAPSHOT_RETRIEVED_AT,
  OFFICIAL_SNAPSHOT_URL,
  officialSatIndex,
  officialSnapshotFile,
  resetOfficialSatIndex,
} from "./official";
import { isSyntheticRfc } from "./rfc";

/**
 * A taxpayer the SAT published as definitivo. Looked up, never joined to
 * anything. Their name carries an accent and a comma, which is also how this
 * test proves the file was decoded as ISO-8859-1 and quoted per RFC 4180.
 */
const DEFINITIVO = "AAA121206EV5";

/** A taxpayer who won in court. The case a false positive hurts most. */
const CLEARED = "AAA080808HL8";

const snapshot = await loadOfficialSnapshot({
  now: "2026-09-12T09:00:00.000Z",
});
const index = createSatIndex(snapshot.entries);

describe("the committed snapshot", () => {
  it("is the file the constants name", () => {
    expect(officialSnapshotFile().pathname).toEndWith(
      `/snapshot/${OFFICIAL_SNAPSHOT_FILENAME}`,
    );
    expect(OFFICIAL_SNAPSHOT_FILENAME).toContain(
      OFFICIAL_SNAPSHOT_RETRIEVED_AT,
    );
    // The SAT serves it over HTTP only: a TLS connection to the host does not
    // complete, which is why the committed file is the default and the live
    // fetch is the option.
    expect(OFFICIAL_SNAPSHOT_URL).toStartWith("http://omawww.sat.gob.mx/");
  });

  it("states its own currency date, which is the list version", () => {
    // Read out of the file's preamble by the loader, not typed in here. If a
    // future download says something else, this fails instead of shipping a
    // version id that does not match the rows under it.
    expect(snapshot.publishedAt).toBe(OFFICIAL_SNAPSHOT_LIST_VERSION);
    expect(snapshot.listVersion).toBe(OFFICIAL_SNAPSHOT_LIST_VERSION);
    expect(snapshot.source).toContain(OFFICIAL_SNAPSHOT_URL);
  });

  it("is not UTF-8, and is read anyway", () => {
    expect(snapshot.encoding).toBe("windows-1252");
  });

  it("reconciles: 14234 rows, 91 of them unreadable, 28935 situations", () => {
    expect(snapshot.rows).toBe(14234);
    expect(snapshot.entries).toHaveLength(28935);
    expect(index.taxpayers).toBe(14054);
    // 14054 taxpayers plus the 91 rows the SAT redacted is the 14145 distinct
    // rows; the rest are taxpayers the list names twice for two separate cases.
    expect(snapshot.rejected).toHaveLength(91);
    expect(snapshot.warnings).toEqual([]);
  });

  it("reports the redacted rows instead of dropping them", () => {
    // The SAT suppresses a taxpayer's data when a court orders it and leaves the
    // row in place with XXXXXXXXXXXX in the RFC column. They are unreadable, not
    // absent, and a blacklist that loses rows in silence is the worst bug here.
    expect(new Set(snapshot.rejected.map((row) => row.reason))).toEqual(
      new Set(["rfc_shape"]),
    );
    expect(snapshot.rejected[0]?.raw).toContain("XXXXXXXXXXXX");
    expect(snapshot.rejected[0]?.line).toBeGreaterThan(3);
  });

  it("carries no synthetic RFC, which is the other half of the ADR-0002 rule", () => {
    expect(snapshot.entries.some((entry) => isSyntheticRfc(entry.rfc))).toBe(
      false,
    );
  });

  it("dates every situation it accepted", () => {
    expect(
      snapshot.entries.every((entry) =>
        /^\d{4}-\d{2}-\d{2}$/.test(entry.publishedAt),
      ),
    ).toBe(true);
  });
});

describe("looking a real taxpayer up", () => {
  it("answers a taxpayer the SAT listed definitively", () => {
    const match = index.match(DEFINITIVO);

    expect(match.listed).toBe(true);
    expect(match.effective?.status).toBe("definitivo");
    expect(match.effective?.publishedAt).toBe("2019-11-20");
    // Presumed first, listed definitively seven months later. One row in the
    // file, two situations here, which is what makes "were they listed on the
    // day we deducted this invoice" answerable.
    expect(match.entries.map((entry) => entry.status)).toEqual([
      "definitivo",
      "presunto",
    ]);
    expect(match.entries[1]?.publishedAt).toBe("2019-04-26");
  });

  it("keeps the accent in the legal name, which is the decoding proof", () => {
    // Decoded as UTF-8 the accented byte becomes a replacement character and
    // every name comparison downstream silently stops matching.
    expect(index.match(DEFINITIVO).effective?.name).toContain("AMÉRICA");
  });

  it("does not alert on a taxpayer who won in court", () => {
    const match = index.match(CLEARED);

    expect(match.effective?.status).toBe("sentencia_favorable");
    expect(match.listed).toBe(false);
    expect(match.entries).toHaveLength(3);
  });

  it("accepts the RFC the way a judge types it", () => {
    expect(index.match(DEFINITIVO.toLowerCase()).listed).toBe(true);
    expect(index.match(` ${DEFINITIVO} `).listed).toBe(true);
  });

  it("answers an RFC on no row without inventing anything", () => {
    const match = index.match("SYN010203AB1");

    expect(match.entries).toEqual([]);
    expect(match.listed).toBe(false);
  });
});

describe("officialSatIndex", () => {
  it("parses once and hands the same index back", async () => {
    resetOfficialSatIndex();
    const first = await officialSatIndex({ now: "2026-09-12T09:00:00.000Z" });
    const second = await officialSatIndex();

    expect(second).toBe(first);
    expect(first.taxpayers).toBe(index.taxpayers);
  });

  it("does not cache a failure as an empty list", async () => {
    resetOfficialSatIndex();
    await expect(
      officialSatIndex({
        readFile: () => Promise.reject(new Error("disk gone")),
      }),
    ).rejects.toThrow("disk gone");

    // A lookup that cannot read the list has to keep failing. Caching the
    // failure as an empty index would answer "not listed" for every RFC after
    // it, which is the one answer this package must never invent.
    const recovered = await officialSatIndex({
      now: "2026-09-12T09:00:00.000Z",
    });
    expect(recovered.taxpayers).toBe(index.taxpayers);
    resetOfficialSatIndex();
  });
});
