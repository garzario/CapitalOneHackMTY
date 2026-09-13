/**
 * Article 49 Bis: the loader, the thirty day window and the sweep.
 *
 * The counterpart of `official.test.ts`, with one difference that is the whole
 * point of issue #180. `official.test.ts` asserts counts read out of the real SAT
 * download, because there is one. There is no real 49 Bis file: the SAT publishes
 * that list one oficio at a time as a DOF note, so the counts below are read by
 * hand out of `snapshot/art49bis-fixture.csv`, which is synthetic, says so in its
 * own first line, and is never presented as the SAT's file.
 *
 * Every RFC here starts with SYN. The sweep is the one place where a published row
 * meets an invoice and ADR-0002 forbids that row being a real one.
 */

import { describe, expect, it } from "bun:test";
import type {
  Cfdi,
  LedgerEvent,
  PaymentComplement,
  Sat49BisEntry,
} from "@hackmty/core";
import {
  ANEXO_COLUMNS,
  ART_49BIS_CORRECTION_DAYS,
  ART_49BIS_DOF_SEARCH_URL,
  ART_49BIS_FIRST_PUBLISHED_AT,
  ART_49BIS_FIXTURE_FILENAME,
  ART_49BIS_OFICIOS_PUBLISHED,
  ART_49BIS_SURVEYED_AT,
  art49BisFixtureFile,
  correctionDeadline,
  correctionWindow,
  create49BisIndex,
  loadFixture49BisPublication,
  match49Bis,
  official49BisListing,
  parse49BisPublication,
  Sat49BisFormatError,
  sweep49Bis,
} from "./art49bis";
import { isSyntheticRfc } from "./rfc";
import { DEFAULT_ISR_RATE } from "./sweep";

/**
 * The DOF date this fixture is loaded under. It is INVENTED, like every row in
 * the file: the SAT published nothing on this day and the constant is here so the
 * assertions below have a clock, not so anybody cites it.
 */
const FIXTURE_DOF_DATE = "2026-09-04";

const publication = await loadFixture49BisPublication({
  publishedAt: FIXTURE_DOF_DATE,
  now: "2026-09-12T09:00:00.000Z",
});

describe("the fixture, and what it is not", () => {
  it("is the file the constant names", () => {
    expect(art49BisFixtureFile().pathname).toEndWith(
      `/snapshot/${ART_49BIS_FIXTURE_FILENAME}`,
    );
    expect(ART_49BIS_FIXTURE_FILENAME).toContain("fixture");
  });

  it("names nobody real: every RFC it accepted is synthetic", () => {
    // The other half of the ADR-0002 rule. `official.test.ts` asserts the real
    // list carries no synthetic RFC; this asserts the invented file carries no
    // real one, so neither can be mistaken for the other.
    expect(
      publication.entries.every((entry) => isSyntheticRfc(entry.rfc)),
    ).toBe(true);
    expect(
      publication.entries.every(
        (entry) =>
          entry.oficio.startsWith("SIM-") &&
          // Either the invented legal name, or the RFC the loader falls back to
          // when the Anexo leaves the name cell empty.
          (/SINTETIC/.test(entry.name) || entry.name === entry.rfc),
      ),
    ).toBe(true);
  });

  it("says in its own first line that it is not the SAT file", () => {
    expect(publication.source).toContain("synthetic fixture");
  });
});

describe("the loader, over the published Anexo layout", () => {
  it("reconciles: 6 rows, 5 accepted, 1 unreadable, 1 undated notice", () => {
    // Counted by hand in snapshot/art49bis-fixture.csv: six data rows under the
    // header, of which one carries XXXXXXXXXXXX where the RFC belongs and one
    // carries no notice date in either of the two column pairs.
    expect(publication.rows).toBe(6);
    expect(publication.entries).toHaveLength(5);
    expect(publication.rejected).toHaveLength(1);
    expect(publication.warnings).toHaveLength(1);
  });

  it("dates every row from the DOF publication and not from the file", () => {
    // The Anexo does not state the day it was published anywhere inside itself,
    // which is why publishedAt is a required argument. Every row of one oficio
    // carries the same DOF date, and the thirty day window runs from it.
    expect(
      publication.entries.every(
        (entry) => entry.publishedAt === FIXTURE_DOF_DATE,
      ),
    ).toBe(true);
    expect(publication.listVersion).toBe(FIXTURE_DOF_DATE);
    expect(publication.correctBy).toBe("2026-10-03");
  });

  it("reads both date shapes the real oficios use", () => {
    // Seven of the fourteen oficios published by 2026-09-12 write the
    // notification dates as DD/MM/YYYY and seven write them as "06 de agosto de
    // 2026". One parser reads both, so a future oficio that switches back needs
    // no change here.
    expect(entryOf("SYN010101AA1").noticeEffectiveAt).toBe("2026-08-07");
    expect(entryOf("SYN020202BB2").noticeEffectiveAt).toBe("2026-08-04");
  });

  it("reports which of the two notice columns carried the date", () => {
    expect(entryOf("SYN010101AA1").notifiedBy).toBe("buzon_tributario");
    expect(entryOf("SYN030303CC3").notifiedBy).toBe("estrados");
    expect(entryOf("SYN030303CC3").noticeEffectiveAt).toBe("2026-08-11");
  });

  it("keeps a row whose notice date is unreadable, and warns", () => {
    // The taxpayer is published either way. Losing the row over a missing date
    // would be a false negative on a fiscal blacklist, which is the one failure
    // this package must not have in silence.
    const undated = entryOf("SYN040404DD4");
    expect(undated.notifiedBy).toBeUndefined();
    expect(undated.noticeEffectiveAt).toBeUndefined();
    // Three preamble lines and the header, so the fifth data row is line 9.
    expect(publication.warnings[0]).toEqual({
      line: 9,
      reason: "notice_undated",
      rfc: "SYN040404DD4",
    });
  });

  it("reports the unreadable RFC instead of dropping it", () => {
    expect(publication.rejected[0]?.reason).toBe("rfc_shape");
    expect(publication.rejected[0]?.raw).toContain("XXXXXXXXXXXX");
    expect(publication.rejected[0]?.line).toBeGreaterThan(4);
  });

  it("quotes a legal name that carries a comma", () => {
    expect(entryOf("SYN010101AA1").name).toBe(
      "COMERCIALIZADORA SINTETICA UNO, S.A. DE C.V.",
    );
  });

  it("falls back to the RFC when the name cell is empty", () => {
    expect(entryOf("SYN050505EE5").name).toBe("SYN050505EE5");
  });

  it("keeps the oficio verbatim, which is how a clerk finds the resolution", () => {
    expect(entryOf("SYN020202BB2").oficio).toBe(
      "SIM-500-05-00-00-00-2026-90002 del 24 de julio de 2026",
    );
  });

  it("resolves the seven Anexo columns by name and never by position", () => {
    const shuffled = [
      "Numero y fecha de oficio de resolucion,R.F.C.,Fecha de fijacion en los estrados de la Autoridad Fiscal,Fecha en que surtio efectos la notificacion,Nombre del Contribuyente",
      "SIM-1 del 1 de julio de 2026,SYN060606FF6,03/07/2026,06/07/2026,PRUEBA SINTETICA",
    ].join("\n");

    const parsed = parse49BisPublication(shuffled, {
      publishedAt: "2026-07-10",
      now: "2026-09-12T09:00:00.000Z",
    });

    expect(parsed.entries).toHaveLength(1);
    expect(parsed.entries[0]).toEqual({
      rfc: "SYN060606FF6",
      name: "PRUEBA SINTETICA",
      publishedAt: "2026-07-10",
      oficio: "SIM-1 del 1 de julio de 2026",
      notifiedBy: "estrados",
      noticeEffectiveAt: "2026-07-06",
      listVersion: "2026-07-10",
    });
    expect(ANEXO_COLUMNS).toHaveLength(7);
  });

  it("refuses a file that is not the Anexo rather than answering an empty list", () => {
    expect(() =>
      parse49BisPublication("a,b,c\n1,2,3", { publishedAt: "2026-07-10" }),
    ).toThrow(Sat49BisFormatError);
  });

  it("refuses a publication date it cannot read", () => {
    // The thirty natural days run from this date. A publication loaded without
    // one would carry a window nobody could compute, which is worse than no row.
    expect(() =>
      parse49BisPublication("R.F.C.,Nombre\nSYN010101AA1,X", {
        publishedAt: "cuando sea",
      }),
    ).toThrow(/thirty natural days/);
  });

  it("refuses a row with no oficio behind it", () => {
    const parsed = parse49BisPublication(
      [
        "R.F.C.,Nombre del Contribuyente,Numero y fecha de oficio de resolucion",
        "SYN070707GG7,SIN OFICIO SINTETICA,",
      ].join("\n"),
      { publishedAt: "2026-07-10" },
    );

    expect(parsed.entries).toEqual([]);
    expect(parsed.rejected[0]?.reason).toBe("oficio_missing");
  });
});

describe("the thirty natural days of fraccion X", () => {
  it("counts the publication day as day one", () => {
    // Stated as an assumption rather than presented as law: the article says "a
    // partir de la publicacion" without spelling out the count, and being a day
    // early on a screen costs nothing where being a day late costs the seal.
    expect(ART_49BIS_CORRECTION_DAYS).toBe(30);
    expect(correctionDeadline("2026-08-28")).toBe("2026-09-26");
    expect(correctionDeadline("2026-07-10")).toBe("2026-08-08");
  });

  it("crosses a month and a leap day without a timezone", () => {
    expect(correctionDeadline("2028-02-10")).toBe("2028-03-10");
    expect(correctionDeadline("2026-12-20")).toBe("2027-01-18");
  });

  it("reports the days left, and says when the window has closed", () => {
    expect(correctionWindow("2026-08-28", "2026-09-12T09:00:00.000Z")).toEqual({
      publishedAt: "2026-08-28",
      correctBy: "2026-09-26",
      daysLeft: 14,
      open: true,
    });
    expect(
      correctionWindow("2026-07-10", "2026-09-12T09:00:00.000Z")?.open,
    ).toBe(false);
  });

  it("answers undefined rather than a guess for a date it cannot read", () => {
    expect(correctionDeadline("28/08/2026")).toBeUndefined();
  });
});

describe("looking one taxpayer up", () => {
  const index = create49BisIndex(publication.entries);

  it("answers listed for a published RFC, however it was typed", () => {
    expect(index.match("syn010101aa1").listed).toBe(true);
    expect(index.match(" SYN-010101-AA1 ").listed).toBe(true);
    expect(index.match("SYN010101AA1").effective?.oficio).toContain("90001");
  });

  it("answers an RFC on no publication without inventing anything", () => {
    const match = index.match("SYN999999ZZ9");

    expect(match.entries).toEqual([]);
    expect(match.listed).toBe(false);
    expect(match.effective).toBeUndefined();
  });

  it("never reports a 49 Bis taxpayer as cleared", () => {
    // Fraccion X publishes one outcome and provides for no published clearing, so
    // a second publication of the same RFC is the same accusation and not a
    // correction of it. There is deliberately no status to flip.
    const twice: Sat49BisEntry[] = [
      row("SYN010101AA1", "2026-07-10", "SIM-A"),
      row("SYN010101AA1", "2026-08-28", "SIM-B"),
    ];
    const match = match49Bis(twice, "SYN010101AA1");

    expect(match.listed).toBe(true);
    expect(match.entries).toHaveLength(2);
    expect(match.effective?.publishedAt).toBe("2026-08-28");
  });

  it("counts taxpayers and rows separately", () => {
    expect(index.taxpayers).toBe(5);
    expect(index.size).toBe(5);
  });
});

describe("the coverage of this build", () => {
  it("says the list is not loaded, and why, with the counts to check it", () => {
    const listing = official49BisListing();

    // The honest answer, and the reason this issue did not commit a file. If a
    // future build loads one, this arm changes and every reader of it is told.
    expect(listing.coverage).toBe("not_published_machine_readable");
    if (listing.coverage !== "not_published_machine_readable") {
      throw new Error("unreachable");
    }
    expect(listing.oficiosPublished).toBe(ART_49BIS_OFICIOS_PUBLISHED);
    expect(listing.taxpayersPublished).toBe(14);
    expect(listing.firstPublishedAt).toBe(ART_49BIS_FIRST_PUBLISHED_AT);
    expect(listing.lastPublishedAt).toBe("2026-08-28");
    expect(listing.surveyedAt).toBe(ART_49BIS_SURVEYED_AT);
    expect(listing.source).toContain("dof.gob.mx");
  });

  it("hands out a search that answers, with the phrase and its accents in it", () => {
    // Verified against the DOF on 2026-09-12, and both halves are the reason this
    // test exists rather than a style preference. `busqueda_detalle.php` on its own
    // answers 302 to /Error_BS.php, so a bare link is a dead link; and the search is
    // accent sensitive, so the unaccented phrase answers zero results, which reads
    // as "there is no list" instead of as "you spelled it wrong". This is the URL a
    // clerk is handed in the lookup, so a future edit back to the bare page has to
    // fail here.
    expect(ART_49BIS_DOF_SEARCH_URL).toContain("textobusqueda=");
    // The searched phrase, with the accent on each of its two long words.
    expect(ART_49BIS_DOF_SEARCH_URL).toContain(
      "fracci%C3%B3n+X+del+art%C3%ADculo",
    );
    expect(ART_49BIS_DOF_SEARCH_URL).toContain("49+Bis");
    expect(official49BisListing().source).toBe(ART_49BIS_DOF_SEARCH_URL);
  });

  it("holds no rows of its own, so nothing can leak onto a screen", () => {
    const listing = official49BisListing();
    expect("index" in listing).toBe(false);
  });
});

/* -------------------------------------------------------------------------- */
/* The sweep                                                                   */
/* -------------------------------------------------------------------------- */

const COMPANY = "SYN900101MTY";
const FALSAS = "SYN010101AA1";
const NUNCA_PAGADO = "SYN030303CC3";

function cfdi(
  uuid: string,
  issuerRfc: string,
  subtotal: number,
  iva: number,
  issuedAt: string,
): Cfdi {
  return {
    uuid,
    issuedAt,
    issuerRfc,
    issuerName: `PROVEEDORA SINTETICA ${issuerRfc}`,
    receiverRfc: COMPANY,
    subtotal,
    iva,
    total: Math.round((subtotal + iva) * 100) / 100,
    paymentMethod: "PUE",
    synthetic: true,
  };
}

function complement(
  uuid: string,
  relatedCfdiUuid: string,
  paidAt: string,
  paidAmount: number,
): PaymentComplement {
  return { uuid, relatedCfdiUuid, paidAt, paidAmount, synthetic: true };
}

function row(rfc: string, publishedAt: string, oficio: string): Sat49BisEntry {
  return {
    rfc,
    name: `PROVEEDORA SINTETICA ${rfc}`,
    publishedAt,
    oficio,
    notifiedBy: "buzon_tributario",
    listVersion: publishedAt,
  };
}

/**
 * Two invoices from the supplier that gets published, both paid and therefore
 * both deducted, plus one from a supplier that was published and never paid.
 */
const LEDGER: LedgerEvent[] = [
  {
    type: "cfdi_received",
    at: "2026-07-06T15:00:00.000Z",
    cfdi: cfdi("F-1", FALSAS, 40000, 6400, "2026-07-06"),
  },
  {
    type: "cfdi_received",
    at: "2026-08-11T15:00:00.000Z",
    cfdi: cfdi("F-2", FALSAS, 25000, 4000, "2026-08-11"),
  },
  {
    type: "cfdi_received",
    at: "2026-08-24T15:00:00.000Z",
    cfdi: cfdi("F-3", FALSAS, 90000, 14400, "2026-08-24"),
  },
  {
    type: "cfdi_received",
    at: "2026-08-25T15:00:00.000Z",
    cfdi: cfdi("N-1", NUNCA_PAGADO, 12000, 1920, "2026-08-25"),
  },
  {
    type: "complement_received",
    at: "2026-07-20T17:30:00.000Z",
    complement: complement("C-1", "F-1", "2026-07-20T17:30:00.000Z", 46400),
  },
  {
    type: "complement_received",
    at: "2026-08-21T17:30:00.000Z",
    complement: complement("C-2", "F-2", "2026-08-21T17:30:00.000Z", 29000),
  },
];

const swept = sweep49Bis(LEDGER, {
  entries: [row(FALSAS, "2026-08-28", "SIM-500-05-00-00-00-2026-90001")],
  publishedAt: "2026-08-28",
});

describe("the retroactive sweep of a 49 Bis publication", () => {
  it("prices only the invoices the ledger shows as settled", () => {
    // F-1 and F-2 were settled by a payment complement. F-3 is still in the run
    // unpaid, so no deduction has been taken against it and counting it would
    // inflate the headline number.
    const found = swept.newlyListed[0];

    expect(swept.newlyListed).toHaveLength(1);
    expect(found?.paidCfdis.map((entry) => entry.uuid)).toEqual(["F-1", "F-2"]);
    expect(found?.deductedBase).toBe(65000);
    expect(found?.isrExposure).toBe(65000 * DEFAULT_ISR_RATE);
    // The IVA the two CFDIs actually carry, summed and not multiplied.
    expect(found?.ivaExposure).toBe(10400);
    expect(swept.totalExposure).toBe(19500 + 10400);
  });

  it("carries the deadline, because the pesos alone are half the decision", () => {
    expect(swept.publishedAt).toBe("2026-08-28");
    expect(swept.correctBy).toBe("2026-09-26");
    expect(swept.listVersion).toBe("2026-08-28");
  });

  it("leaves out a published supplier we never paid", () => {
    const other = sweep49Bis(LEDGER, {
      entries: [row(NUNCA_PAGADO, "2026-08-28", "SIM-2")],
      publishedAt: "2026-08-28",
    });

    // An invoice we hold and never settled carries no deduction to reverse, so
    // the supplier is news rather than exposure and the total stays honest.
    expect(other.newlyListed).toHaveLength(1);
    expect(other.newlyListed[0]?.paidCfdis).toEqual([]);
    expect(other.totalExposure).toBe(0);
  });

  it("leaves out a published RFC we have never invoiced", () => {
    const stranger = sweep49Bis(LEDGER, {
      entries: [row("SYN080808HH8", "2026-08-28", "SIM-3")],
      publishedAt: "2026-08-28",
    });

    expect(stranger.newlyListed).toEqual([]);
    expect(stranger.totalExposure).toBe(0);
  });

  it("prices a republished RFC once", () => {
    const twice = sweep49Bis(LEDGER, {
      entries: [
        row(FALSAS, "2026-08-28", "SIM-A"),
        row(FALSAS, "2026-08-28", "SIM-B"),
      ],
      publishedAt: "2026-08-28",
    });

    expect(twice.newlyListed).toHaveLength(1);
    expect(twice.totalExposure).toBe(swept.totalExposure);
  });

  it("honours asOf, so no hindsight leaks into the number", () => {
    const early = sweep49Bis(LEDGER, {
      entries: [row(FALSAS, "2026-08-28", "SIM-A")],
      publishedAt: "2026-08-28",
      asOf: "2026-08-01T00:00:00.000Z",
    });

    expect(early.newlyListed[0]?.paidCfdis.map((entry) => entry.uuid)).toEqual([
      "F-1",
    ]);
    expect(early.newlyListed[0]?.deductedBase).toBe(40000);
  });

  it("takes the ISR rate as a parameter, like the 69-B sweep", () => {
    const atLoss = sweep49Bis(LEDGER, {
      entries: [row(FALSAS, "2026-08-28", "SIM-A")],
      publishedAt: "2026-08-28",
      isrRate: 0,
    });

    expect(atLoss.newlyListed[0]?.isrExposure).toBe(0);
    expect(atLoss.totalExposure).toBe(10400);
  });
});

function entryOf(rfc: string): Sat49BisEntry {
  const found = publication.entries.find((entry) => entry.rfc === rfc);
  if (found === undefined) {
    throw new Error(`the fixture has no row for ${rfc}`);
  }
  return found;
}
