import { describe, expect, it } from "bun:test";
import type { Cfdi, Finding, PaymentComplement } from "./domain";
import { detectDuplicateInvoice } from "./duplicates";

const NOW = "2026-09-10T18:00:00.000Z";
const ACME = "SYN010101AAA";
const OTHER = "SYN020202BBB";

interface CfdiOverrides {
  uuid?: string;
  issuerRfc?: string;
  issuedAt?: string;
  total?: number;
  folio?: string;
  serie?: string;
}

let sequence = 0;

function cfdi(overrides: CfdiOverrides = {}): Cfdi {
  sequence += 1;
  const total = overrides.total ?? 18430;
  return {
    uuid: overrides.uuid ?? `uuid-${sequence}`,
    ...(overrides.serie === undefined ? {} : { serie: overrides.serie }),
    ...(overrides.folio === undefined ? {} : { folio: overrides.folio }),
    issuedAt: overrides.issuedAt ?? "2026-09-08T12:00:00.000Z",
    issuerRfc: overrides.issuerRfc ?? ACME,
    issuerName: `${overrides.issuerRfc ?? ACME} SA de CV`,
    receiverRfc: "SYN990101ZZ9",
    subtotal: total,
    iva: 0,
    total,
    paymentMethod: "PUE",
    synthetic: true,
  };
}

function complement(
  relatedCfdiUuid: string,
  paidAt: string,
  paidAmount: number,
): PaymentComplement {
  sequence += 1;
  return {
    uuid: `complement-${sequence}`,
    relatedCfdiUuid,
    paidAt,
    paidAmount,
    beneficiaryAccount: "012180001234567895",
    synthetic: true,
  };
}

function rules(findings: readonly Finding[]): unknown[] {
  return findings.map((finding) => finding.evidence.rule);
}

describe("detectDuplicateInvoice, exact duplicates", () => {
  it("flags the same timbred UUID loaded twice as comprobable", () => {
    const first = cfdi({
      uuid: "F1A2",
      issuedAt: "2026-09-04T10:00:00.000Z",
      total: 184300,
      folio: "A-1201",
    });
    const second = {
      ...first,
      issuedAt: "2026-09-06T10:00:00.000Z",
    };

    const findings = detectDuplicateInvoice({
      cfdis: [second, first],
      now: NOW,
    });

    expect(findings).toHaveLength(1);
    const [finding] = findings;
    expect(finding.detector).toBe("duplicate_invoice");
    expect(finding.state).toBe("comprobable");
    expect(finding.severity).toBe("critical");
    expect(finding.subject).toEqual({ kind: "cfdi", id: "F1A2" });
    expect(finding.amountAtRisk).toBe(184300);
    expect(finding.createdAt).toBe(NOW);
    expect(finding.evidence).toMatchObject({
      rule: "uuid_collision",
      uuid: "F1A2",
      originalUuid: "F1A2",
      originalIssuedAt: "2026-09-04T10:00:00.000Z",
      candidateIssuedAt: "2026-09-06T10:00:00.000Z",
      copies: 2,
      daysApart: 2,
      totalsMatch: true,
    });
    expect(finding.explanation).toContain("184,300.00");
  });

  it("reports three copies once and links the first one", () => {
    const base = cfdi({
      uuid: "F1A2",
      issuedAt: "2026-09-01T10:00:00.000Z",
      total: 5000,
    });

    const findings = detectDuplicateInvoice({
      cfdis: [
        { ...base, issuedAt: "2026-09-05T10:00:00.000Z" },
        base,
        { ...base, issuedAt: "2026-09-03T10:00:00.000Z" },
      ],
      now: NOW,
    });

    expect(findings).toHaveLength(1);
    expect(findings[0].evidence.copies).toBe(3);
    expect(findings[0].evidence.originalIssuedAt).toBe(
      "2026-09-01T10:00:00.000Z",
    );
    expect(findings[0].evidence.daysApart).toBe(4);
  });

  it("flags a folio the issuer reused for the same total as comprobable", () => {
    const findings = detectDuplicateInvoice({
      cfdis: [
        cfdi({
          uuid: "A",
          serie: "F",
          folio: "1201",
          issuedAt: "2026-09-02T10:00:00.000Z",
          total: 9800,
        }),
        cfdi({
          uuid: "B",
          serie: "f",
          folio: " 1201 ",
          issuedAt: "2026-09-07T10:00:00.000Z",
          total: 9800,
        }),
      ],
      now: NOW,
    });

    expect(rules(findings)).toEqual(["folio_collision"]);
    expect(findings[0].state).toBe("comprobable");
    expect(findings[0].severity).toBe("critical");
    expect(findings[0].evidence.originalUuid).toBe("A");
    expect(findings[0].evidence.totalsMatch).toBe(true);
  });

  it("asks for a check when the same folio carries a different total", () => {
    // Cancelled and reissued looks exactly like this, and only a person knows.
    const findings = detectDuplicateInvoice({
      cfdis: [
        cfdi({
          uuid: "A",
          folio: "1201",
          issuedAt: "2026-09-02T10:00:00.000Z",
          total: 9800,
        }),
        cfdi({
          uuid: "B",
          folio: "1201",
          issuedAt: "2026-09-07T10:00:00.000Z",
          total: 11400,
        }),
      ],
      now: NOW,
    });

    expect(rules(findings)).toEqual(["folio_collision"]);
    expect(findings[0].state).toBe("requiere_verificacion");
    expect(findings[0].severity).toBe("warning");
    expect(findings[0].evidence).toMatchObject({
      originalTotal: 9800,
      candidateTotal: 11400,
      totalsMatch: false,
    });
  });

  it("still sees the collision when a parser lower cased one UUID", () => {
    const findings = detectDuplicateInvoice({
      cfdis: [
        cfdi({
          uuid: "3F2A9C10-0000-4000-8000-000000000001",
          issuedAt: "2026-09-02T10:00:00.000Z",
          total: 7300,
        }),
        cfdi({
          uuid: "3f2a9c10-0000-4000-8000-000000000001",
          issuedAt: "2026-09-05T10:00:00.000Z",
          total: 7300,
        }),
      ],
      now: NOW,
    });

    expect(rules(findings)).toEqual(["uuid_collision"]);
    expect(findings[0].evidence.copies).toBe(2);
  });

  it("does not join the same folio issued by two different suppliers", () => {
    const findings = detectDuplicateInvoice({
      cfdis: [
        cfdi({ uuid: "A", issuerRfc: ACME, folio: "1201", total: 9800 }),
        cfdi({ uuid: "B", issuerRfc: OTHER, folio: "1201", total: 7100 }),
      ],
      now: NOW,
    });

    expect(findings).toEqual([]);
  });
});

describe("detectDuplicateInvoice, already settled", () => {
  it("flags an invoice the supplier already acknowledged in a complement", () => {
    const invoice = cfdi({ uuid: "A", total: 120000 });

    const findings = detectDuplicateInvoice({
      cfdis: [invoice],
      complements: [complement("A", "2026-09-09T15:00:00.000Z", 120000)],
      now: NOW,
    });

    expect(rules(findings)).toEqual(["already_paid"]);
    expect(findings[0].state).toBe("comprobable");
    expect(findings[0].severity).toBe("critical");
    expect(findings[0].amountAtRisk).toBe(120000);
    expect(findings[0].evidence).toMatchObject({
      paidAmount: 120000,
      total: 120000,
      coverage: 1,
      complements: 1,
      lastPaidAt: "2026-09-09T15:00:00.000Z",
      beneficiaryAccount: "012180001234567895",
    });
  });

  it("puts only the covered part at risk when the settlement was partial", () => {
    const invoice = cfdi({ uuid: "A", total: 100000 });

    const findings = detectDuplicateInvoice({
      cfdis: [invoice],
      complements: [
        complement("A", "2026-09-02T15:00:00.000Z", 25000),
        complement("A", "2026-09-08T15:00:00.000Z", 15000),
      ],
      now: NOW,
    });

    expect(rules(findings)).toEqual(["partially_paid"]);
    expect(findings[0].state).toBe("requiere_verificacion");
    expect(findings[0].severity).toBe("warning");
    expect(findings[0].amountAtRisk).toBe(40000);
    expect(findings[0].evidence).toMatchObject({
      paidAmount: 40000,
      coverage: 0.4,
      complements: 2,
      lastPaidAt: "2026-09-08T15:00:00.000Z",
    });
  });

  it("only judges the invoices under review, so a settled ledger is not an alert storm", () => {
    // Every invoice a healthy company ever paid carries a complement. Without
    // the scope the rail would open with a hundred criticals.
    const paid = [
      cfdi({ uuid: "A", total: 1000 }),
      cfdi({ uuid: "B", total: 2000 }),
      cfdi({ uuid: "C", total: 3000 }),
    ];

    const findings = detectDuplicateInvoice({
      cfdis: paid,
      complements: [
        complement("A", "2026-08-01T15:00:00.000Z", 1000),
        complement("B", "2026-08-02T15:00:00.000Z", 2000),
        complement("C", "2026-08-03T15:00:00.000Z", 3000),
      ],
      underReview: ["B"],
      now: NOW,
    });

    expect(findings).toHaveLength(1);
    expect(findings[0].subject.id).toBe("B");
  });

  it("ignores complements with a non positive or non finite amount", () => {
    const findings = detectDuplicateInvoice({
      cfdis: [cfdi({ uuid: "A", total: 1000 })],
      complements: [
        complement("A", "2026-09-01T15:00:00.000Z", 0),
        complement("A", "2026-09-02T15:00:00.000Z", Number.NaN),
        complement("A", "2026-09-03T15:00:00.000Z", -500),
      ],
      now: NOW,
    });

    expect(findings).toEqual([]);
  });
});

describe("detectDuplicateInvoice, near duplicates", () => {
  it("flags the same issuer and amount three days apart, linking the original", () => {
    const findings = detectDuplicateInvoice({
      cfdis: [
        cfdi({
          uuid: "A",
          folio: "1201",
          issuedAt: "2026-09-02T10:00:00.000Z",
          total: 46800,
        }),
        cfdi({
          uuid: "B",
          folio: "1298",
          issuedAt: "2026-09-05T10:00:00.000Z",
          total: 46800,
        }),
      ],
      underReview: ["B"],
      now: NOW,
    });

    expect(rules(findings)).toEqual(["same_amount_window"]);
    expect(findings[0].state).toBe("requiere_verificacion");
    expect(findings[0].severity).toBe("warning");
    expect(findings[0].subject.id).toBe("B");
    expect(findings[0].evidence).toMatchObject({
      originalUuid: "A",
      originalIssuedAt: "2026-09-02T10:00:00.000Z",
      originalFolio: "1201",
      daysApart: 3,
      windowDays: 7,
      total: 46800,
    });
  });

  it("keeps a monthly rent quiet, because 30 days is not a duplicate", () => {
    const findings = detectDuplicateInvoice({
      cfdis: [
        cfdi({ uuid: "A", issuedAt: "2026-08-01T10:00:00.000Z", total: 35000 }),
        cfdi({ uuid: "B", issuedAt: "2026-09-01T10:00:00.000Z", total: 35000 }),
      ],
      now: NOW,
    });

    expect(findings).toEqual([]);
  });

  it("fires at exactly seven days and stays quiet one minute later", () => {
    const original = cfdi({
      uuid: "A",
      issuedAt: "2026-09-01T10:00:00.000Z",
      total: 12000,
    });

    const onTheEdge = detectDuplicateInvoice({
      cfdis: [
        original,
        cfdi({
          uuid: "B",
          issuedAt: "2026-09-08T10:00:00.000Z",
          total: 12000,
        }),
      ],
      now: NOW,
    });
    const justOutside = detectDuplicateInvoice({
      cfdis: [
        original,
        cfdi({
          uuid: "B",
          issuedAt: "2026-09-08T10:01:00.000Z",
          total: 12000,
        }),
      ],
      now: NOW,
    });

    expect(rules(onTheEdge)).toEqual(["same_amount_window"]);
    expect(justOutside).toEqual([]);
  });

  it("compares amounts to the cent, never as floats", () => {
    const findings = detectDuplicateInvoice({
      cfdis: [
        cfdi({
          uuid: "A",
          issuedAt: "2026-09-02T10:00:00.000Z",
          total: 0.1 + 0.2,
        }),
        cfdi({ uuid: "B", issuedAt: "2026-09-03T10:00:00.000Z", total: 0.3 }),
      ],
      now: NOW,
    });

    expect(rules(findings)).toEqual(["same_amount_window"]);
  });

  it("does not join two different issuers that billed the same amount", () => {
    const findings = detectDuplicateInvoice({
      cfdis: [
        cfdi({ uuid: "A", issuerRfc: ACME, total: 7500 }),
        cfdi({ uuid: "B", issuerRfc: OTHER, total: 7500 }),
      ],
      now: NOW,
    });

    expect(findings).toEqual([]);
  });

  it("reports one invoice once, against the earliest match in the window", () => {
    const findings = detectDuplicateInvoice({
      cfdis: [
        cfdi({ uuid: "A", issuedAt: "2026-09-01T10:00:00.000Z", total: 4000 }),
        cfdi({ uuid: "B", issuedAt: "2026-09-03T10:00:00.000Z", total: 4000 }),
        cfdi({ uuid: "C", issuedAt: "2026-09-05T10:00:00.000Z", total: 4000 }),
      ],
      underReview: ["C"],
      now: NOW,
    });

    expect(findings).toHaveLength(1);
    expect(findings[0].evidence.originalUuid).toBe("A");
    expect(findings[0].evidence.daysApart).toBe(4);
  });

  it("reports a pair once when both invoices are in the same run", () => {
    const pair = [
      cfdi({ uuid: "A", issuedAt: "2026-09-02T10:00:00.000Z", total: 46800 }),
      cfdi({ uuid: "B", issuedAt: "2026-09-05T10:00:00.000Z", total: 46800 }),
    ];

    const bothInTheRun = detectDuplicateInvoice({
      cfdis: pair,
      underReview: ["A", "B"],
      now: NOW,
    });
    const onlyTheOlderOne = detectDuplicateInvoice({
      cfdis: pair,
      underReview: ["A"],
      now: NOW,
    });

    // The later invoice owns the finding, because it is the one being paid.
    expect(bothInTheRun).toHaveLength(1);
    expect(bothInTheRun[0].subject.id).toBe("B");
    // Unless the run only holds the older one, which then links its twin.
    expect(onlyTheOlderOne).toHaveLength(1);
    expect(onlyTheOlderOne[0].subject.id).toBe("A");
    expect(onlyTheOlderOne[0].evidence.originalUuid).toBe("B");
  });

  it("does not repeat a pair a stronger rule already reported", () => {
    // Same UUID means same folio and same amount too. One pair, one finding.
    const first = cfdi({
      uuid: "F1A2",
      folio: "1201",
      issuedAt: "2026-09-02T10:00:00.000Z",
      total: 9800,
    });

    const findings = detectDuplicateInvoice({
      cfdis: [first, { ...first, issuedAt: "2026-09-04T10:00:00.000Z" }],
      now: NOW,
    });

    expect(rules(findings)).toEqual(["uuid_collision"]);
  });
});

describe("detectDuplicateInvoice, dirty input and determinism", () => {
  it("skips rows with an unparsable date or a non finite total", () => {
    const findings = detectDuplicateInvoice({
      cfdis: [
        cfdi({ uuid: "A", issuedAt: "el martes", total: 4000 }),
        cfdi({ uuid: "B", issuedAt: "2026-09-03T10:00:00.000Z", total: 4000 }),
        cfdi({
          uuid: "C",
          issuedAt: "2026-09-04T10:00:00.000Z",
          total: Number.NaN,
        }),
        cfdi({
          uuid: "D",
          issuedAt: "2026-09-05T10:00:00.000Z",
          total: Number.POSITIVE_INFINITY,
        }),
      ],
      now: NOW,
    });

    expect(findings).toEqual([]);
  });

  it("does not mutate the caller's arrays", () => {
    const cfdis = [
      cfdi({ uuid: "B", issuedAt: "2026-09-05T10:00:00.000Z", total: 4000 }),
      cfdi({ uuid: "A", issuedAt: "2026-09-03T10:00:00.000Z", total: 4000 }),
    ];
    const before = cfdis.map((row) => row.uuid);

    detectDuplicateInvoice({ cfdis, now: NOW });

    expect(cfdis.map((row) => row.uuid)).toEqual(before);
  });

  it("returns the same findings whatever the input order", () => {
    const rows = [
      cfdi({ uuid: "A", issuedAt: "2026-09-01T10:00:00.000Z", total: 4000 }),
      cfdi({ uuid: "B", issuedAt: "2026-09-03T10:00:00.000Z", total: 4000 }),
      cfdi({
        uuid: "C",
        folio: "77",
        issuedAt: "2026-09-04T10:00:00.000Z",
        total: 9000,
      }),
      cfdi({
        uuid: "D",
        folio: "77",
        issuedAt: "2026-09-06T10:00:00.000Z",
        total: 9000,
      }),
    ];

    const forwards = detectDuplicateInvoice({ cfdis: rows, now: NOW });
    const backwards = detectDuplicateInvoice({
      cfdis: [...rows].reverse(),
      now: NOW,
    });

    expect(backwards).toEqual(forwards);
    expect(rules(forwards)).toEqual(["folio_collision", "same_amount_window"]);
  });

  it("orders the rail by how provable the rule is, then by money", () => {
    const exact = cfdi({
      uuid: "X",
      issuedAt: "2026-09-01T10:00:00.000Z",
      total: 1000,
    });
    const findings = detectDuplicateInvoice({
      cfdis: [
        exact,
        { ...exact, issuedAt: "2026-09-02T10:00:00.000Z" },
        cfdi({
          uuid: "P",
          issuerRfc: OTHER,
          issuedAt: "2026-09-01T10:00:00.000Z",
          total: 500000,
        }),
        cfdi({
          uuid: "Q",
          issuerRfc: OTHER,
          issuedAt: "2026-09-03T10:00:00.000Z",
          total: 500000,
        }),
      ],
      complements: [complement("P", "2026-09-04T10:00:00.000Z", 500000)],
      now: NOW,
    });

    expect(rules(findings)).toEqual([
      "uuid_collision",
      "already_paid",
      "same_amount_window",
    ]);
  });

  it("throws on an unusable clock or window", () => {
    expect(() =>
      detectDuplicateInvoice({ cfdis: [], now: "el jueves pasado" }),
    ).toThrow(RangeError);
    expect(() =>
      detectDuplicateInvoice({
        cfdis: [],
        now: NOW,
        options: { amountWindowDays: 0 },
      }),
    ).toThrow(RangeError);
  });

  it("returns nothing for an empty ledger", () => {
    expect(detectDuplicateInvoice({ cfdis: [], now: NOW })).toEqual([]);
  });
});
