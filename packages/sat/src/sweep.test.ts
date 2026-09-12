/**
 * The retroactive sweep, over a ledger written here so that every peso in the
 * assertions is traceable to an event above it.
 *
 * Everything in this file is synthetic and every RFC starts with SYN. The sweep
 * is the one place in the product where a list row meets an invoice, and
 * ADR-0002 forbids that row being a real one.
 */

import { describe, expect, it } from "bun:test";
import type {
  Cfdi,
  LedgerEvent,
  PaymentComplement,
  PaymentInstruction,
  SatListEntry,
} from "@hackmty/core";
import {
  DEFAULT_ISR_RATE,
  paidCfdisOf,
  priceSweep,
  SyntheticOnlyError,
  simulatePublication,
  sweep,
} from "./sweep";

const COMPANY = "SYN900101MTY";
const ACEROS = "SYN010101AAA";
const PLASTICOS = "SYN020202BBB";
const VIDRIOS = "SYN030303CCC";

function cfdi(
  uuid: string,
  issuerRfc: string,
  issuerName: string,
  subtotal: number,
  iva: number,
  issuedAt: string,
): Cfdi {
  return {
    uuid,
    issuedAt,
    issuerRfc,
    issuerName,
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
  beneficiaryAccount?: string,
): PaymentComplement {
  return {
    uuid,
    relatedCfdiUuid,
    paidAt,
    paidAmount,
    ...(beneficiaryAccount === undefined ? {} : { beneficiaryAccount }),
    synthetic: true,
  };
}

function instruction(
  id: string,
  supplierRfc: string,
  cfdiUuids: string[],
  amount: number,
  receivedAt: string,
): PaymentInstruction {
  return {
    id,
    supplierRfc,
    cfdiUuids,
    clabe: "058580000123456715",
    amount,
    source: "email",
    receivedAt,
    synthetic: true,
  };
}

function published(
  at: string,
  listVersion: string,
  entries: SatListEntry[],
): LedgerEvent {
  return { type: "sat_list_published", at, listVersion, entries };
}

function entry(
  rfc: string,
  status: SatListEntry["status"],
  publishedAt: string,
  listVersion: string,
): SatListEntry {
  return { rfc, name: `SINTETICA ${rfc}`, status, publishedAt, listVersion };
}

/**
 * The ledger under every assertion below.
 *
 * Aceros issued three invoices. Two were settled (one by a payment complement,
 * one by a SPEI that left the bank against an instruction) and the third is
 * still sitting in the run unpaid. Plasticos issued one, settled, and has been
 * on the list since June. Vidrios issued one and it was never paid.
 */
const LEDGER: LedgerEvent[] = [
  {
    type: "cfdi_received",
    at: "2026-08-03T15:00:00.000Z",
    cfdi: cfdi(
      "A-1",
      ACEROS,
      "Aceros Sinteticos del Norte SA de CV",
      52435.34,
      8389.65,
      "2026-08-03",
    ),
  },
  {
    type: "cfdi_received",
    at: "2026-08-17T15:00:00.000Z",
    cfdi: cfdi(
      "A-2",
      ACEROS,
      "Aceros Sinteticos del Norte SA de CV",
      52435.35,
      8389.66,
      "2026-08-17",
    ),
  },
  {
    type: "cfdi_received",
    at: "2026-09-07T15:00:00.000Z",
    cfdi: cfdi(
      "A-3",
      ACEROS,
      "Aceros Sinteticos del Norte SA de CV",
      90000,
      14400,
      "2026-09-07",
    ),
  },
  {
    type: "cfdi_received",
    at: "2026-07-02T15:00:00.000Z",
    cfdi: cfdi(
      "P-1",
      PLASTICOS,
      "Plasticos Sinteticos SA de CV",
      10000,
      1600,
      "2026-07-02",
    ),
  },
  {
    type: "cfdi_received",
    at: "2026-08-20T15:00:00.000Z",
    cfdi: cfdi(
      "V-1",
      VIDRIOS,
      "Vidrios Sinteticos SA de CV",
      4000,
      640,
      "2026-08-20",
    ),
  },
  {
    type: "complement_received",
    at: "2026-08-10T17:30:00.000Z",
    complement: complement(
      "B-1",
      "A-1",
      "2026-08-10T17:30:00.000Z",
      60824.99,
      "058580000123456715",
    ),
  },
  {
    type: "instruction_received",
    at: "2026-08-24T14:00:00.000Z",
    instruction: instruction(
      "ins-01",
      ACEROS,
      ["A-2"],
      60825.01,
      "2026-08-24T14:00:00.000Z",
    ),
  },
  {
    type: "payment_sent",
    at: "2026-08-24T18:05:00.000Z",
    instructionId: "ins-01",
    claveRastreo: "SYN20260824000001",
  },
  {
    type: "instruction_received",
    at: "2026-09-08T14:00:00.000Z",
    instruction: instruction(
      "ins-02",
      ACEROS,
      ["A-3"],
      104400,
      "2026-09-08T14:00:00.000Z",
    ),
  },
  {
    type: "complement_received",
    at: "2026-07-09T17:30:00.000Z",
    complement: complement("B-2", "P-1", "2026-07-09T17:30:00.000Z", 11600),
  },
  published("2026-06-27T12:00:00.000Z", "2026-06-27", [
    entry(PLASTICOS, "presunto", "2026-06-27", "2026-06-27"),
  ]),
  published("2026-09-12T12:00:00.000Z", "2026-09-12", [
    entry(ACEROS, "definitivo", "2026-09-12", "2026-09-12"),
    entry(PLASTICOS, "definitivo", "2026-09-12", "2026-09-12"),
    entry(VIDRIOS, "desvirtuado", "2026-09-12", "2026-09-12"),
    entry("SYN040404DDD", "definitivo", "2026-09-12", "2026-09-12"),
  ]),
];

function run() {
  return sweep(LEDGER, { listVersion: "2026-09-12" });
}

describe("sweep", () => {
  it("prices only the invoices the ledger shows as paid", () => {
    const result = run();
    const aceros = result.newlyListed.find(
      (row) => row.supplier.rfc === ACEROS,
    );

    // A-3 was invoiced and instructed but the SPEI has not left, so it is not
    // exposure. Counting it would inflate the headline by 90000 pesos of base,
    // which is the fastest way to lose a judge who reads the ledger.
    expect(aceros?.paidCfdis.map((row) => row.uuid)).toEqual(["A-1", "A-2"]);
    expect(aceros?.deductedBase).toBe(104870.69);
  });

  it("applies the 30 percent assumption and rounds to the cent", () => {
    const aceros = run().newlyListed.find((row) => row.supplier.rfc === ACEROS);

    // 104870.69 * 0.30 is 31461.207 in decimal and worse in binary floating
    // point. Money is rounded to the cent through core's helpers, never left as
    // a float that a total will drift on.
    expect(aceros?.isrExposure).toBe(31461.21);
    expect(DEFAULT_ISR_RATE).toBe(0.3);
  });

  it("sums the IVA the invoices carry instead of multiplying the base", () => {
    const aceros = run().newlyListed.find((row) => row.supplier.rfc === ACEROS);

    // 8389.65 + 8389.66. A flat 16 percent of the base would give 16779.31 here
    // as well, and would overstate any invoice carrying a zero-rated line.
    expect(aceros?.ivaExposure).toBe(16779.31);
  });

  it("totals both taxes across every newly listed supplier", () => {
    expect(run().totalExposure).toBe(48240.52);
    expect(run().listVersion).toBe("2026-09-12");
  });

  it("leaves out a supplier who was already on the list", () => {
    // Plasticos was presunto in June and is definitivo now. The publication did
    // not create that exposure, June did, and reporting it again double counts.
    expect(run().newlyListed.map((row) => row.supplier.rfc)).toEqual([ACEROS]);
  });

  it("leaves out a supplier the new version clears", () => {
    // Vidrios appears in the publication as desvirtuado. Being named in a
    // version is not being listed by it.
    expect(run().newlyListed.some((row) => row.supplier.rfc === VIDRIOS)).toBe(
      false,
    );
  });

  it("leaves out a listed taxpayer we have never invoiced", () => {
    // SYN040404DDD is on the list and is not a supplier of ours. That is news,
    // not exposure, and the sweep does not fabricate a supplier row for it.
    expect(
      run().newlyListed.some((row) => row.supplier.rfc === "SYN040404DDD"),
    ).toBe(false);
  });

  it("builds the supplier out of the ledger and nothing else", () => {
    const aceros = run().newlyListed[0]?.supplier;

    expect(aceros?.legalName).toBe("Aceros Sinteticos del Norte SA de CV");
    expect(aceros?.firstInvoiceAt).toBe("2026-08-03");
    expect(aceros?.synthetic).toBe(true);
    // The account came from the payment complement the supplier itself issued,
    // which is the only evidence in the ledger that they received money there.
    expect(aceros?.knownAccounts).toEqual([
      {
        clabe: "058580000123456715",
        establishedBy: "payment_complement",
        establishedAt: "2026-08-10T17:30:00.000Z",
        timesPaid: 1,
      },
    ]);
  });

  it("stops at asOf, so a payment made later is not hindsight", () => {
    const result = sweep(LEDGER, {
      listVersion: "2026-09-12",
      asOf: "2026-08-15T00:00:00.000Z",
    });

    expect(result.newlyListed[0]?.paidCfdis.map((row) => row.uuid)).toEqual([
      "A-1",
    ]);
    expect(result.newlyListed[0]?.deductedBase).toBe(52435.34);
  });

  it("takes a different ISR rate for a company on a different regime", () => {
    const result = sweep(LEDGER, { listVersion: "2026-09-12", isrRate: 0 });

    expect(result.newlyListed[0]?.isrExposure).toBe(0);
    expect(result.totalExposure).toBe(16779.31);
  });

  it("prices a publication that is not in the ledger yet", () => {
    // The API prices the sweep before it appends the event, so the rows arrive
    // as an argument and the ledger supplies only the invoices.
    const result = sweep(LEDGER.slice(0, -1), {
      listVersion: "2026-09-12",
      entries: [entry(ACEROS, "definitivo", "2026-09-12", "2026-09-12")],
    });

    expect(result.newlyListed).toHaveLength(1);
    expect(result.newlyListed[0]?.status).toBe("definitivo");
  });

  it("answers nothing for a version nobody published", () => {
    const result = sweep(LEDGER, { listVersion: "2026-10-31" });

    expect(result.newlyListed).toEqual([]);
    expect(result.totalExposure).toBe(0);
  });

  it("is a fold, so the same events give the same number every time", () => {
    expect(run()).toEqual(run());
  });

  it("survives an empty ledger without inventing a total", () => {
    expect(sweep([], { listVersion: "2026-09-12" })).toEqual({
      listVersion: "2026-09-12",
      newlyListed: [],
      totalExposure: 0,
    });
  });
});

describe("paidCfdisOf", () => {
  it("counts a complement and a sent payment as settled, and nothing else", () => {
    expect(paidCfdisOf(LEDGER, ACEROS).map((row) => row.uuid)).toEqual([
      "A-1",
      "A-2",
    ]);
    expect(paidCfdisOf(LEDGER, VIDRIOS)).toEqual([]);
  });

  it("normalises the RFC it is asked about", () => {
    expect(paidCfdisOf(LEDGER, " syn-010101 aaa ")).toHaveLength(2);
  });
});

describe("priceSweep", () => {
  it("prices subjects a repository assembled, the same way the fold does", () => {
    const subjects = run().newlyListed.map((row) => ({
      supplier: row.supplier,
      status: row.status,
      paidCfdis: row.paidCfdis,
    }));

    expect(priceSweep(subjects, { listVersion: "2026-09-12" })).toEqual(run());
  });
});

describe("simulatePublication", () => {
  const NOW = "2026-09-12T03:00:00.000Z";

  it("builds a publication out of the company's own synthetic suppliers", () => {
    const simulated = simulatePublication([ACEROS], {
      now: NOW,
      status: "definitivo",
      names: { [ACEROS]: "Aceros Sinteticos del Norte SA de CV" },
    });

    expect(simulated.listVersion).toBe(`sim-${NOW}`);
    expect(simulated.publishedAt).toBe("2026-09-12");
    expect(simulated.entries).toEqual([
      {
        rfc: ACEROS,
        name: "Aceros Sinteticos del Norte SA de CV",
        status: "definitivo",
        publishedAt: "2026-09-12",
        listVersion: `sim-${NOW}`,
      },
    ]);
  });

  it("keeps the RFC as the name when we hold no legal name", () => {
    // A name we do not have is not a name we make up, on a row that reads as an
    // accusation.
    expect(simulatePublication([ACEROS], { now: NOW }).entries[0]?.name).toBe(
      ACEROS,
    );
  });

  it("defaults to presunto, the situation a publication opens with", () => {
    expect(simulatePublication([ACEROS], { now: NOW }).entries[0]?.status).toBe(
      "presunto",
    );
  });

  it("refuses a real RFC, which is the ADR-0002 rule in code", () => {
    // The API validates this at the edge too. It is enforced here as well
    // because the rule has to survive the next caller, not only this one.
    expect(() => simulatePublication(["AAA121206EV5"], { now: NOW })).toThrow(
      SyntheticOnlyError,
    );
    expect(() =>
      simulatePublication([ACEROS, "AAA080808HL8"], { now: NOW }),
    ).toThrow(/ADR-0002/);
  });

  it("refuses something that is not an RFC at all", () => {
    expect(() => simulatePublication(["SYN123"], { now: NOW })).toThrow(
      SyntheticOnlyError,
    );
  });

  it("normalises what it is handed", () => {
    expect(
      simulatePublication([" syn-010101 aaa "], { now: NOW }).entries[0]?.rfc,
    ).toBe(ACEROS);
  });

  it("feeds the sweep, which is the whole point of it", () => {
    const simulated = simulatePublication([ACEROS], {
      now: NOW,
      status: "definitivo",
    });
    // Without the 2026-09-12 publication: on stage the simulated version IS the
    // news, so a ledger that already listed the supplier would correctly report
    // no new exposure and prove nothing.
    const result = sweep(LEDGER.slice(0, -1), {
      listVersion: simulated.listVersion,
      entries: simulated.entries,
    });

    expect(result.newlyListed[0]?.supplier.rfc).toBe(ACEROS);
    expect(result.totalExposure).toBe(48240.52);
  });
});
