/**
 * The supplier profile composes six answers, and each one of them is a sentence
 * a judge reads off a screen and can check against something else in the repo.
 *
 * The bucket boundary, because a week cut in Monterrey instead of UTC puts every
 * bar one day off the row `supplier_weekly_outflow` holds, and nobody notices
 * until somebody compares the two. The filled gap, because a quiet month is the
 * signal in half of these cases and omitting the bucket would draw it as
 * activity. The plaza, because a city asserted next to a real account number on a
 * catalogue nobody can open is the claim ADR-0002 forbids outright. Both SAT
 * lists, because an absent row must never read as a cleared taxpayer. And the
 * network line, because "the network answered nothing" and "nobody asked the
 * network" are two different facts.
 *
 * Hermetic: fixtures built here, no network, no `.env`, no clock.
 */

import { describe, expect, test } from "bun:test";
import type { Cfdi, Finding, PaymentComplement } from "@hackmty/core";
import type { SupplierDetail, VerifiedBeneficiary } from "./contract";
import {
  accountRows,
  behaviourReading,
  DEFAULT_SERIES_WEEKS,
  networkLine,
  plazaChange,
  relationship,
  SERIES_SOURCE,
  satListRows,
  weeklySeries,
  weekStart,
} from "./supplier-profile";

const RFC = "SYN990202S02";
/** Plaza 580 is APODACA, NL in the committed snapshot. */
const KNOWN_CLABE = "012580100091764611";
/** Plaza 180 is DISTRITO FEDERAL, DF. Same bank, another plaza. */
const PROPOSED_CLABE = "012180102091764611";

function cfdi(over: Partial<Cfdi> = {}): Cfdi {
  return {
    uuid: over.uuid ?? "11111111-1111-1111-1111-111111111111",
    issuedAt: over.issuedAt ?? "2026-09-09T15:00:00.000Z",
    issuerRfc: RFC,
    issuerName: "Maquinados Industriales Regios SA de CV",
    receiverRfc: "SYN090615C01",
    subtotal: 1000,
    iva: 160,
    total: 1160,
    paymentMethod: "PUE",
    synthetic: true,
    ...over,
  };
}

function detail(over: Partial<SupplierDetail> = {}): SupplierDetail {
  return {
    supplier: {
      rfc: RFC,
      legalName: "Maquinados Industriales Regios SA de CV",
      firstInvoiceAt: "2021-03-08T15:00:00.000Z",
      knownAccounts: [
        {
          clabe: KNOWN_CLABE,
          establishedBy: "payment_complement",
          establishedAt: "2021-04-07T15:00:00.000Z",
          timesPaid: 52,
        },
      ],
      delayCostPerDay: 1120.05,
      synthetic: true,
    },
    cfdis: [],
    complements: [],
    findings: [],
    verifiedBeneficiaries: [],
    ...over,
  };
}

function finding(over: Partial<Finding> = {}): Finding {
  return {
    id: "f-1",
    detector: "clabe_forensics",
    severity: "critical",
    state: "requiere_verificacion",
    subject: { kind: "instruction", id: "INS-1" },
    amountAtRisk: 38417.48,
    explanation: "",
    evidence: {},
    createdAt: "2026-09-10T15:00:00.000Z",
    ...over,
  };
}

describe("weekStart", () => {
  /*
   * 0007_supplier_outflow.sql cuts with `date_trunc('week', at at time zone
   * 'UTC')`, which lands on a Monday, and 0008 buckets with
   * `time_bucket('7 days', at)` from Timescale's origin of 2000-01-03, itself a
   * Monday. So every boundary this function answers has to be a Monday midnight
   * UTC or a bar of the chart is not the row the database holds.
   */
  test("answers the Monday 00:00 UTC that opens the bucket", () => {
    /* 2026-09-09 is a Wednesday; its week opens on Monday the 7th. */
    expect(weekStart("2026-09-09T15:00:00.000Z")).toBe(
      "2026-09-07T00:00:00.000Z",
    );
  });

  test("keeps a Monday on its own Monday", () => {
    expect(weekStart("2026-09-07T00:00:00.000Z")).toBe(
      "2026-09-07T00:00:00.000Z",
    );
  });

  test("puts a Sunday in the week that opened six days earlier", () => {
    /* The trap getUTCDay sets: Sunday is 0, so a naive subtraction would open
       the bucket on the Sunday itself and split the week in two. */
    expect(weekStart("2026-09-13T23:59:59.000Z")).toBe(
      "2026-09-07T00:00:00.000Z",
    );
  });

  test("cuts in UTC and not in Monterrey", () => {
    /* 2026-09-06T19:00 in Monterrey is 2026-09-07T01:00 UTC, which is already
       the new bucket. Local-time bucketing would answer the 31st of August. */
    expect(weekStart("2026-09-07T01:00:00.000Z")).toBe(
      "2026-09-07T00:00:00.000Z",
    );
  });

  test("answers null rather than a bucket for a date it cannot parse", () => {
    expect(weekStart("el jueves")).toBeNull();
  });
});

describe("weeklySeries", () => {
  test("totals the invoices of one week into one bucket", () => {
    const series = weeklySeries([
      cfdi({ uuid: "a", issuedAt: "2026-09-07T10:00:00.000Z", total: 100 }),
      cfdi({ uuid: "b", issuedAt: "2026-09-11T10:00:00.000Z", total: 250.5 }),
    ]);

    expect(series).toHaveLength(1);
    expect(series[0]?.week).toBe("2026-09-07T00:00:00.000Z");
    expect(series[0]?.invoices).toBe(2);
    expect(series[0]?.outflow).toBe(350.5);
    expect(series[0]?.maxInvoice).toBe(250.5);
  });

  test("sums to the cent rather than to within a float", () => {
    /* 0.1 + 0.2 is the canonical float sum that is not 0.3, and the view casts
       to numeric(14,2) for exactly this reason. */
    const series = weeklySeries([
      cfdi({ uuid: "a", issuedAt: "2026-09-07T10:00:00.000Z", total: 0.1 }),
      cfdi({ uuid: "b", issuedAt: "2026-09-08T10:00:00.000Z", total: 0.2 }),
    ]);

    expect(series[0]?.outflow).toBe(0.3);
  });

  test("fills a week with no invoice rather than closing the gap", () => {
    const series = weeklySeries([
      cfdi({ uuid: "a", issuedAt: "2026-08-24T10:00:00.000Z" }),
      cfdi({ uuid: "b", issuedAt: "2026-09-07T10:00:00.000Z" }),
    ]);

    expect(series.map((point) => point.week)).toEqual([
      "2026-08-24T00:00:00.000Z",
      "2026-08-31T00:00:00.000Z",
      "2026-09-07T00:00:00.000Z",
    ]);
    expect(series[1]?.invoices).toBe(0);
    expect(series[1]?.outflow).toBe(0);
  });

  test("clips to the detector's own window when it named one", () => {
    const series = weeklySeries(
      [
        cfdi({ uuid: "old", issuedAt: "2026-01-05T10:00:00.000Z" }),
        cfdi({ uuid: "new", issuedAt: "2026-09-09T10:00:00.000Z" }),
      ],
      {
        window: {
          from: "2026-08-24T15:00:00.000Z",
          to: "2026-09-10T15:00:00.000Z",
        },
      },
    );

    expect(series[0]?.week).toBe("2026-08-24T00:00:00.000Z");
    expect(series.at(-1)?.week).toBe("2026-09-07T00:00:00.000Z");
  });

  test("tints only the buckets inside the window under review", () => {
    const series = weeklySeries(
      [
        cfdi({ uuid: "a", issuedAt: "2026-08-24T10:00:00.000Z" }),
        cfdi({ uuid: "b", issuedAt: "2026-09-09T10:00:00.000Z" }),
      ],
      {
        window: {
          from: "2026-08-24T15:00:00.000Z",
          to: "2026-09-10T15:00:00.000Z",
        },
        recent: {
          from: "2026-09-03T15:00:00.000Z",
          to: "2026-09-10T15:00:00.000Z",
        },
      },
    );
    const recent = series.filter((point) => point.recent);

    expect(recent.map((point) => point.week)).toEqual([
      "2026-08-31T00:00:00.000Z",
      "2026-09-07T00:00:00.000Z",
    ]);
  });

  test("falls back to the most recent weeks of the file with no window", () => {
    /* Two invoices a year apart. Without a window the chart is the tail of the
       file and not fifty-two empty bars with one at each end. */
    const series = weeklySeries([
      cfdi({ uuid: "a", issuedAt: "2025-09-08T10:00:00.000Z" }),
      cfdi({ uuid: "b", issuedAt: "2026-09-07T10:00:00.000Z" }),
    ]);

    expect(series).toHaveLength(DEFAULT_SERIES_WEEKS);
    expect(series.at(-1)?.week).toBe("2026-09-07T00:00:00.000Z");
    expect(series.at(-1)?.invoices).toBe(1);
  });

  test("answers an empty series for an empty file", () => {
    expect(weeklySeries([])).toEqual([]);
  });

  test("drops an invoice whose date does not parse instead of throwing", () => {
    const series = weeklySeries([
      cfdi({ uuid: "a", issuedAt: "2026-09-07T10:00:00.000Z" }),
      cfdi({ uuid: "b", issuedAt: "cuando se pueda" }),
    ]);

    expect(series).toHaveLength(1);
    expect(series[0]?.invoices).toBe(1);
  });
});

describe("SERIES_SOURCE", () => {
  /*
   * The one sentence on this screen that says where a number came from. It has to
   * name the endpoint that answered and the object that did not, because the
   * weekly aggregate exists in the database and a reader who assumes the chart is
   * the warehouse talking has been misled by us rather than by themselves.
   */
  test("names the endpoint that answered and the aggregate that did not", () => {
    expect(SERIES_SOURCE).toContain("GET /api/v1/suppliers/:rfc");
    expect(SERIES_SOURCE).toContain("supplier_weekly_outflow");
    expect(SERIES_SOURCE).toContain("no tiene");
  });

  test("promises no probability and no verdict", () => {
    /* ADR-0009 forbids a percentage, a score and the word "seguro" on every
       screen of this product, and copy is where one gets in. */
    expect(SERIES_SOURCE).not.toMatch(/seguro/i);
    expect(SERIES_SOURCE).not.toContain("%");
  });
});

describe("behaviourReading", () => {
  const behaviour = finding({
    id: "supplier_behaviour:SYN:1",
    detector: "supplier_behaviour",
    evidence: {
      signals: "issuance_rate,amount_drift",
      baselineStart: "2026-05-14T15:00:00.000Z",
      baselineEnd: "2026-09-03T15:00:00.000Z",
      recentStart: "2026-09-03T15:00:00.000Z",
      recentEnd: "2026-09-10T15:00:00.000Z",
      baselineInvoices: 34,
      baselineRatePerWeek: 2.125,
    },
  });

  test("reads the window and the pace off the finding", () => {
    const read = behaviourReading([behaviour]);

    expect(read?.baselineStart).toBe("2026-05-14T15:00:00.000Z");
    expect(read?.recentEnd).toBe("2026-09-10T15:00:00.000Z");
    expect(read?.ratePerWeek).toBe(2.125);
    expect(read?.baselineInvoices).toBe(34);
    expect(read?.signals).toEqual(["issuance_rate", "amount_drift"]);
    expect(read?.findingId).toBe("supplier_behaviour:SYN:1");
  });

  test("answers null when the detector raised nothing", () => {
    /* The detector gates itself on thin history, so silence is a result. The
       screen then prints the invoice file's own window and draws no reference
       line, because there is no baseline the arithmetic ran. */
    expect(behaviourReading([])).toBeNull();
    expect(behaviourReading([finding()])).toBeNull();
  });

  test("answers null rather than half a window", () => {
    const partial = finding({
      detector: "supplier_behaviour",
      evidence: { baselineStart: "2026-05-14T15:00:00.000Z" },
    });

    expect(behaviourReading([partial])).toBeNull();
  });
});

describe("accountRows", () => {
  test("names the plaza off the committed snapshot, code first", () => {
    const rows = accountRows(detail());

    expect(rows).toHaveLength(1);
    expect(rows[0]?.plazaCode).toBe("580");
    expect(rows[0]?.plaza?.city).toBe("APODACA");
    expect(rows[0]?.plaza?.state).toBe("NL");
    expect(rows[0]?.origin).toBe("known");
    expect(rows[0]?.timesPaid).toBe(52);
  });

  test("leaves a plaza the snapshot does not carry without a name", () => {
    /* 999 is not in the 786 rows. A code with no row yields no city and no
       claim: that is the rule in packages/core/src/snapshot/README.md, and a
       screen that invented one would be asserting a place on a catalogue
       nobody can open. */
    const rows = accountRows(
      detail({
        supplier: {
          ...detail().supplier,
          knownAccounts: [
            {
              clabe: "012999100091764611",
              establishedBy: "instruction",
              establishedAt: "2026-01-01T00:00:00.000Z",
              timesPaid: 1,
            },
          ],
        },
      }),
    );

    expect(rows[0]?.plazaCode).toBe("999");
    expect(rows[0]?.plaza).toBeNull();
  });

  test("adds the account a finding names as a row with no history", () => {
    const rows = accountRows(
      detail({
        findings: [finding({ evidence: { clabe: PROPOSED_CLABE } })],
      }),
    );

    expect(rows).toHaveLength(2);
    const proposed = rows.find((row) => row.clabe === PROPOSED_CLABE);

    expect(proposed?.origin).toBe("proposed");
    expect(proposed?.establishedBy).toBeNull();
    expect(proposed?.timesPaid).toBeNull();
    expect(proposed?.plaza?.city).toBe("DISTRITO FEDERAL");
    expect(proposed?.flagged).toBe(true);
  });

  test("flags a known account a finding names instead of duplicating it", () => {
    const rows = accountRows(
      detail({ findings: [finding({ evidence: { clabe: KNOWN_CLABE } })] }),
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]?.origin).toBe("known");
    expect(rows[0]?.flagged).toBe(true);
  });

  test("carries the CEP from the registry onto the account it proved", () => {
    const verified: VerifiedBeneficiary = {
      supplierRfc: RFC,
      clabe: KNOWN_CLABE,
      verifiedAt: "2026-09-02T10:00:00.000Z",
      cep: {
        claveRastreo: "SENTRYONE0001",
        transferredAt: "2026-09-02T10:00:00.000Z",
        amount: 0.01,
        senderName: "Metalicos del Norte SA de CV",
        senderBank: "BANORTE",
        beneficiaryName: "Maquinados Industriales Regios SA de CV",
        beneficiaryAccount: KNOWN_CLABE,
        beneficiaryBank: "BBVA MEXICO",
        signatureValid: true,
        xml: "<SPEI_Tercero/>",
        synthetic: true,
      },
    };
    const rows = accountRows(detail({ verifiedBeneficiaries: [verified] }));

    expect(rows[0]?.verified?.cep.claveRastreo).toBe("SENTRYONE0001");
  });

  test("ignores an evidence value that is not eighteen digits", () => {
    /* `clabe` is not the only key a detector writes, and a truncated or masked
       account on a finding must not become a row claiming to be an account. */
    const rows = accountRows(
      detail({ findings: [finding({ evidence: { clabe: "0125801000" } })] }),
    );

    expect(rows).toHaveLength(1);
  });
});

describe("plazaChange", () => {
  const changed = finding({
    evidence: {
      clabe: PROPOSED_CLABE,
      plazaCode: "180",
      previousPlazaCodes: "580",
      previousPlazaPlaces: "580 (APODACA, NL)",
      plazaComparison:
        "Cambio la plaza dentro del mismo banco: la cuenta conocida esta en la plaza 580 (APODACA, NL) y esta en la plaza 180 (DISTRITO FEDERAL, DF).",
      invoicePostalCode: "64000",
      invoiceState: "NL",
      signals: "near_miss,plaza_changed,plaza_off_invoice,first_time_seen",
    },
  });

  test("reads the change off the finding that raised it", () => {
    const change = plazaChange([changed]);

    expect(change?.toCode).toBe("180");
    expect(change?.fromCodes).toEqual(["580"]);
    /* The detector's own naming of the previous plazas, read rather than
       rebuilt, so the screen and the finding say the same words. */
    expect(change?.fromPlaces).toBe("580 (APODACA, NL)");
    expect(change?.offInvoice).toBe(true);
    expect(change?.invoiceState).toBe("NL");
    expect(change?.clabe).toBe(PROPOSED_CLABE);
  });

  test("stays silent when the plaza did not move", () => {
    /*
     * The detector writes `plazaComparison` on every account it inspects,
     * including the reassuring case. Keying off the sentence rather than off the
     * signal would put "cambio de plaza" on a screen where the plaza is the
     * same, which is a false statement about a supplier.
     */
    const same = finding({
      evidence: {
        plazaCode: "580",
        plazaComparison:
          "Misma plaza que las cuentas ya pagadas: 580 (APODACA, NL).",
        signals: "check_digit_invalid,first_time_seen",
      },
    });

    expect(plazaChange([same])).toBeNull();
    expect(plazaChange([])).toBeNull();
  });

  test("ignores a plaza signal on a detector that is not the forensics one", () => {
    const wrong = finding({
      detector: "duplicate_invoice",
      evidence: { signals: "plaza_changed" },
    });

    expect(plazaChange([wrong])).toBeNull();
  });
});

describe("satListRows", () => {
  test("answers two rows even when neither list holds this RFC", () => {
    /*
     * The same rule as the six bars of `ControlsPanel`: a list that found
     * nothing has to be distinguishable from a list nobody read. An absent row
     * is never a clearance, which matters most on 49 Bis, where the article
     * provides for no published clearing at all.
     */
    const rows = satListRows([]);

    expect(rows.map((row) => row.list)).toEqual(["69b", "49bis"]);
    expect(rows.every((row) => !row.present)).toBe(true);
    expect(rows.every((row) => row.status === null)).toBe(true);
  });

  test("puts a 69-B finding on the 69-B row with its status", () => {
    const rows = satListRows([
      finding({
        id: "sat69b:SYN:2026-08-14:presunto",
        detector: "sat_69b",
        evidence: {
          rfc: RFC,
          status: "presunto",
          publishedAt: "2026-08-14",
          listVersion: "2026-08-14",
          listedNow: true,
        },
      }),
    ]);

    expect(rows[0]?.present).toBe(true);
    expect(rows[0]?.status).toBe("presunto");
    expect(rows[0]?.listedNow).toBe(true);
    expect(rows[0]?.publishedAt).toBe("2026-08-14");
    expect(rows[1]?.present).toBe(false);
  });

  test("sorts a 49 Bis finding by its article and never gives it a status", () => {
    /*
     * Both findings carry the detector id `sat_69b`, because ADR-0002 has six
     * controls and control 1 is the SAT lists cross-check. `evidence.article`
     * is what tells them apart, and a status on the 49 Bis row would invite
     * somebody to read an absent row as a cleared one.
     */
    const rows = satListRows([
      finding({
        id: "sat49bis:SYN:2026-07-01",
        detector: "sat_69b",
        evidence: {
          article: "49 Bis",
          rfc: RFC,
          publishedAt: "2026-07-01",
          oficio: "500-05-00-00-00-2026-24472",
          listVersion: "2026-07-01",
          correctBy: "2026-07-31",
        },
      }),
    ]);

    expect(rows[0]?.present).toBe(false);
    expect(rows[1]?.present).toBe(true);
    expect(rows[1]?.status).toBeNull();
    expect(rows[1]?.oficio).toBe("500-05-00-00-00-2026-24472");
    expect(rows[1]?.correctBy).toBe("2026-07-31");
  });

  test("reads a finding with no article as a 69-B one", () => {
    /* Every 69-B row written before the second list landed looks like this. */
    const rows = satListRows([
      finding({
        detector: "sat_69b",
        evidence: { status: "definitivo", publishedAt: "2026-08-14" },
      }),
    ]);

    expect(rows[0]?.present).toBe(true);
    expect(rows[0]?.status).toBe("definitivo");
  });
});

describe("networkLine", () => {
  test("reads the consortium signal off the finding that carries it", () => {
    const line = networkLine([
      finding({
        id: "network:INS-1",
        detector: "beneficiary_cep",
        severity: "warning",
        evidence: {
          proposedClabe: PROPOSED_CLABE,
          network: {
            source: "snapshot",
            tenants: 0,
            firstSeen: "2025-01-06",
            lastSeen: "2026-08-31",
            fraudReports: 0,
            otherAccounts: 12,
            pulledAt: "2026-09-10T12:00:00.000Z",
          },
        },
      }),
    ]);

    expect(line?.network.verdict).toBe("other_accounts_only");
    expect(line?.clabe).toBe(PROPOSED_CLABE);
    expect(line?.findingId).toBe("network:INS-1");
  });

  test("keeps a signal nobody read as its own answer", () => {
    /*
     * `not_consulted` is a rendered line and not a hidden one. A clerk has to be
     * able to tell a network that has never seen this account from a network
     * this instance never asked, and `NetworkSignal.source` is the field that
     * keeps the two apart.
     */
    const line = networkLine([
      finding({
        detector: "beneficiary_cep",
        evidence: {
          network: {
            source: "not_consulted",
            tenants: 0,
            fraudReports: 0,
            otherAccounts: 0,
          },
        },
      }),
    ]);

    expect(line?.network.verdict).toBe("not_consulted");
  });

  test("answers null when no finding carries a signal", () => {
    expect(networkLine([finding()])).toBeNull();
    expect(networkLine([])).toBeNull();
  });
});

describe("relationship", () => {
  test("counts and sums what the payload actually answered", () => {
    const complement: PaymentComplement = {
      uuid: "c-1",
      relatedCfdiUuid: "a",
      paidAt: "2026-09-09T10:00:00.000Z",
      paidAmount: 1160,
      synthetic: true,
    };
    const read = relationship(
      detail({
        cfdis: [
          cfdi({
            uuid: "a",
            issuedAt: "2026-08-24T10:00:00.000Z",
            total: 1160,
          }),
          cfdi({
            uuid: "b",
            issuedAt: "2026-09-09T10:00:00.000Z",
            total: 40.5,
          }),
        ],
        complements: [complement],
      }),
    );

    expect(read.invoices).toBe(2);
    expect(read.invoiced).toBe(1200.5);
    expect(read.complements).toBe(1);
    expect(read.paid).toBe(1160);
    expect(read.lastInvoiceAt).toBe("2026-09-09T10:00:00.000Z");
    expect(read.months).toBeGreaterThan(50);
  });

  test("answers zero months and no last invoice on an empty file", () => {
    const read = relationship(detail());

    expect(read.invoices).toBe(0);
    expect(read.lastInvoiceAt).toBeNull();
    expect(read.months).toBe(0);
  });
});
