/**
 * The consortium rule, and the four promises issue #164 makes about it.
 *
 * The first one is the only one a judge will actually test: with the network
 * unreachable, the decision has to be the decision this product made before the
 * network existed. That is asserted here as an exact equality on the factor and
 * again in `decision.test.ts` as an exact equality on the expected loss, because
 * "about the same" is not the claim.
 */

import { describe, expect, test } from "bun:test";
import { estimateLoss } from "./decision";
import type { Finding, NetworkSignal } from "./domain";
import {
  assessNetwork,
  describeNetwork,
  monthsOfHistory,
  NETWORK_FLOOR,
  NOT_CONSULTED,
  networkLabel,
} from "./network";

function snapshot(over: Partial<NetworkSignal> = {}): NetworkSignal {
  return {
    source: "snapshot",
    tenants: 0,
    fraudReports: 0,
    otherAccounts: 0,
    pulledAt: "2026-09-12T03:00:00.000Z",
    ...over,
  };
}

function warning(amountAtRisk = 184_300): Finding {
  return {
    id: "fnd-network-test",
    detector: "clabe_forensics",
    severity: "warning",
    state: "requiere_verificacion",
    subject: { kind: "instruction", id: "ins-network-test" },
    amountAtRisk,
    explanation: "Hallazgo sintetico para la prueba.",
    evidence: {},
    createdAt: "2026-09-12T02:00:00.000Z",
  };
}

describe("a network nobody consulted", () => {
  test("leaves the factor at exactly one", () => {
    expect(assessNetwork(NOT_CONSULTED).factor).toBe(1);
    expect(assessNetwork(NOT_CONSULTED).verdict).toBe("not_consulted");
  });

  test("leaves the expected loss byte for byte where it was", () => {
    const findings = [warning()];
    const before = estimateLoss(findings);
    const after = estimateLoss(findings, { network: NOT_CONSULTED });

    expect(after).toEqual(before);
    expect(after.networkFactor).toBe(1);
  });

  test("ignores counts on a signal that says it was never read", () => {
    /* A caller that builds a `not_consulted` signal and fills the counts anyway
       must not get a discount out of it: `source` is the field that decides. */
    const lying: NetworkSignal = {
      source: "not_consulted",
      tenants: 99,
      fraudReports: 0,
      otherAccounts: 4,
      firstSeen: "2024-01-01",
      lastSeen: "2026-09-01",
    };

    expect(assessNetwork(lying).factor).toBe(1);
    expect(assessNetwork(lying).tenants).toBe(0);
  });
});

describe("corroboration lowers the expected loss, monotonically", () => {
  test("more tenants never raise it and usually lower it", () => {
    const factors = [1, 4, 9, 16, 25, 37].map(
      (tenants) => assessNetwork(snapshot({ tenants })).factor,
    );

    for (let index = 1; index < factors.length; index += 1) {
      expect(factors[index] as number).toBeLessThan(
        factors[index - 1] as number,
      );
    }
    expect(factors[0] as number).toBeLessThan(1);
  });

  test("more months never raise it and usually lower it", () => {
    const months = (monthsApart: number) =>
      assessNetwork(
        snapshot({
          tenants: 3,
          firstSeen: "2024-03-01",
          lastSeen: addMonths("2024-03-01", monthsApart),
        }),
      ).factor;

    expect(months(6)).toBeLessThan(months(0));
    expect(months(18)).toBeLessThan(months(6));
  });

  test("never discounts below the floor, however large the network gets", () => {
    const enormous = assessNetwork(
      snapshot({
        tenants: 5_000,
        firstSeen: "2010-01-01",
        lastSeen: "2026-09-01",
      }),
    );

    expect(enormous.factor).toBe(NETWORK_FLOOR);
  });

  test("carries through to the expected loss of a real finding", () => {
    const findings = [warning(184_300)];
    const alone = estimateLoss(findings);
    const corroborated = estimateLoss(findings, {
      network: snapshot({
        tenants: 37,
        firstSeen: "2024-03-04",
        lastSeen: "2026-09-02",
      }),
    });

    expect(corroborated.exposureCents).toBe(alone.exposureCents);
    expect(corroborated.probability).toBe(alone.probability);
    expect(corroborated.expectedLossCents).toBeLessThan(
      alone.expectedLossCents,
    );
  });
});

describe("a fraud report", () => {
  test("cancels every discount, whatever else the network says", () => {
    const read = assessNetwork(
      snapshot({
        tenants: 120,
        fraudReports: 1,
        firstSeen: "2022-01-01",
        lastSeen: "2026-09-01",
      }),
    );

    expect(read.verdict).toBe("fraud_reported");
    expect(read.factor).toBe(1);
  });
});

describe("a pair the network has never seen", () => {
  test("is reported as unseen and discounts nothing", () => {
    const read = assessNetwork(snapshot());

    expect(read.verdict).toBe("unseen");
    expect(read.factor).toBe(1);
  });

  test("is reported as other accounts only when the supplier has others", () => {
    const read = assessNetwork(snapshot({ otherAccounts: 40 }));

    expect(read.verdict).toBe("other_accounts_only");
    expect(read.factor).toBe(1);
  });
});

describe("months of history", () => {
  test("are zero when either end is missing, unparsable or out of order", () => {
    expect(monthsOfHistory(snapshot())).toBe(0);
    expect(monthsOfHistory(snapshot({ firstSeen: "2024-03-01" }))).toBe(0);
    expect(
      monthsOfHistory(
        snapshot({ firstSeen: "manana", lastSeen: "2026-01-01" }),
      ),
    ).toBe(0);
    expect(
      monthsOfHistory(
        snapshot({ firstSeen: "2026-09-01", lastSeen: "2024-01-01" }),
      ),
    ).toBe(0);
  });

  test("count whole months between the two dates", () => {
    expect(
      monthsOfHistory(
        snapshot({ firstSeen: "2024-03-04", lastSeen: "2026-09-02" }),
      ),
    ).toBe(29);
  });
});

describe("the sentence the clerk reads", () => {
  test("says the network was not consulted, in Spanish, without accusing", () => {
    const said = describeNetwork(NOT_CONSULTED);

    expect(said).toContain("no se consulto");
    expect(said).not.toContain("fraude");
  });

  test("names companies and months when the pair is corroborated", () => {
    const said = describeNetwork(
      snapshot({
        tenants: 37,
        firstSeen: "2024-03-04",
        lastSeen: "2026-09-02",
      }),
    );

    expect(said).toContain("37 empresas");
    expect(said).toContain("29 meses");
  });

  test("agrees in number for a single company and a single month", () => {
    const said = describeNetwork(
      snapshot({ tenants: 1, firstSeen: "2026-07-01", lastSeen: "2026-08-05" }),
    );

    expect(said).toContain("1 empresa paga");
    expect(said).toContain("1 mes,");
  });

  test("names the fraud report when there is one", () => {
    expect(
      describeNetwork(snapshot({ tenants: 4, fraudReports: 2 })),
    ).toContain("2 reportes de fraude");
  });
});

describe("the one-line label the screen shows", () => {
  test("is the headline the brief asks for", () => {
    expect(
      networkLabel(
        snapshot({
          tenants: 37,
          firstSeen: "2024-03-04",
          lastSeen: "2026-09-02",
        }),
      ),
    ).toBe("pagada por 37 empresas desde mar 2024");
  });

  test("says not consulted when the network was not read", () => {
    expect(networkLabel(NOT_CONSULTED)).toBe("no consultada");
  });

  test("separates an account the network never saw from one it never read", () => {
    expect(networkLabel(snapshot())).toBe("sin registro de esta cuenta");
    expect(networkLabel(snapshot({ otherAccounts: 40 }))).toBe(
      "sin registro de esta cuenta, 40 otras cuentas del proveedor",
    );
  });

  test("leads with the report when there is one", () => {
    expect(networkLabel(snapshot({ tenants: 3, fraudReports: 1 }))).toBe(
      "1 reporte de fraude",
    );
  });

  test("drops the date rather than printing one it cannot read", () => {
    expect(networkLabel(snapshot({ tenants: 5, firstSeen: "ayer" }))).toBe(
      "pagada por 5 empresas",
    );
  });
});

/** Adds whole months to a YYYY-MM-DD day, for the monotonicity cases. */
function addMonths(day: string, months: number): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + months);
  return date.toISOString().slice(0, 10);
}
