/**
 * Invariants of the synthetic run.
 *
 * These are not tests of the detectors, which live in packages/core and are not
 * part of this scaffold. They are tests of the fixture the UI renders, and they
 * exist because three of the repo's rules are only as strong as the data behind
 * them: every generated object carries `synthetic: true`, no real RFC ever
 * appears next to fabricated evidence, and no total on screen disagrees with the
 * rows under it.
 *
 * A reviewer should be able to break any of those three and see a red test.
 */

import { describe, expect, test } from "bun:test";
import {
  BENEFICIARIES,
  CFDIS,
  COMPLEMENTS,
  MOCK_CEP,
  MOCK_METRICS,
  MOCK_RUN,
  mockLedger,
  mockSupplierDetail,
  mockSweep,
  SAT_ENTRIES,
  SUPPLIERS,
  totalsFor,
} from "./mock";

/** Synthetic RFC of a moral person: SYN, six digits, three letters. */
const SYNTHETIC_RFC = /^SYN\d{6}[A-Z]{3}$/;

/**
 * Independent check-digit verifier for a CLABE: weights 3, 7, 1 over the first
 * seventeen digits, each product taken modulo 10, and the control digit is the
 * complement of the sum modulo 10.
 *
 * This is a fixture check, not the detector. The real forensics belong in
 * packages/core; this only proves the accounts in the mock are well-formed, so a
 * demo never shows an account that could not exist.
 */
function controlDigit(first17: string): number {
  const weights = [3, 7, 1];
  let sum = 0;

  for (let index = 0; index < 17; index += 1) {
    sum += (Number(first17[index]) * (weights[index % 3] ?? 0)) % 10;
  }

  return (10 - (sum % 10)) % 10;
}

function isValidClabe(clabe: string): boolean {
  return (
    /^\d{18}$/.test(clabe) &&
    String(controlDigit(clabe.slice(0, 17))) === clabe[17]
  );
}

/** Every `synthetic` flag anywhere in a value, however deep. */
function syntheticFlags(value: unknown, found: boolean[] = []): boolean[] {
  if (Array.isArray(value)) {
    for (const item of value) {
      syntheticFlags(item, found);
    }

    return found;
  }

  if (typeof value === "object" && value !== null) {
    const record = value as Record<string, unknown>;

    if ("synthetic" in record) {
      found.push(record.synthetic === true);
    }

    for (const item of Object.values(record)) {
      syntheticFlags(item, found);
    }
  }

  return found;
}

describe("the synthetic flag", () => {
  test("is true on every object of the run that carries one", () => {
    const flags = syntheticFlags(MOCK_RUN);

    /* One instruction and one supplier per row. Decisions and findings carry no
       flag of their own in the domain, because they are derived from data that
       does. */
    expect(flags.length).toBe(MOCK_RUN.items.length * 2);
    expect(flags.every((flag) => flag)).toBe(true);
  });

  test("is true across the CFDIs, complements, CEP and registry", () => {
    for (const value of [CFDIS, COMPLEMENTS, MOCK_CEP, BENEFICIARIES]) {
      const flags = syntheticFlags(value);

      expect(flags.length).toBeGreaterThan(0);
      expect(flags.every((flag) => flag)).toBe(true);
    }
  });
});

describe("identifiers", () => {
  test("every supplier RFC is synthetic", () => {
    for (const supplier of SUPPLIERS) {
      expect(supplier.rfc).toMatch(SYNTHETIC_RFC);
    }
  });

  test("every RFC on the list entries is synthetic", () => {
    for (const entry of SAT_ENTRIES) {
      expect(entry.rfc).toMatch(SYNTHETIC_RFC);
    }
  });

  test("every known account is a well-formed CLABE", () => {
    for (const supplier of SUPPLIERS) {
      for (const account of supplier.knownAccounts) {
        expect(isValidClabe(account.clabe)).toBe(true);
      }
    }
  });

  test("every account an instruction points at is a well-formed CLABE", () => {
    for (const item of MOCK_RUN.items) {
      expect(isValidClabe(item.instruction.clabe)).toBe(true);
    }
  });

  test("the forensics case differs from the known account in two digits", () => {
    const item = MOCK_RUN.items.find(
      (candidate) => candidate.instruction.id === "ins-2026w37-002",
    );

    expect(item).toBeDefined();

    const finding = item?.findings[0];
    const proposed = String(finding?.evidence.clabe_propuesta);
    const known = String(finding?.evidence.clabe_conocida);
    const differing = [...proposed].filter(
      (digit, index) => digit !== known[index],
    ).length;

    /* Both accounts have to be valid, otherwise the interesting case would be
       trivially detectable by the check digit alone. */
    expect(isValidClabe(proposed)).toBe(true);
    expect(isValidClabe(known)).toBe(true);
    expect(differing).toBe(2);
    expect(finding?.evidence.digitos_distintos).toBe(differing);
  });
});

describe("the run totals", () => {
  test("are the sum of the rows", () => {
    const recomputed = totalsFor(MOCK_RUN.items);

    expect(MOCK_RUN.totals).toEqual(recomputed);
  });

  test("split the amount across the three decisions without losing a peso", () => {
    const { amount, held, toVerify, released } = MOCK_RUN.totals;

    expect(held + toVerify + released).toBeCloseTo(amount, 2);
  });

  test("count every instruction", () => {
    expect(MOCK_RUN.totals.instructions).toBe(MOCK_RUN.items.length);
  });
});

describe("the rows", () => {
  test("reference a supplier that exists", () => {
    for (const item of MOCK_RUN.items) {
      expect(item.supplier.rfc).toBe(item.instruction.supplierRfc);
    }
  });

  test("reference CFDIs that exist", () => {
    const known = new Set(CFDIS.map((cfdi) => cfdi.uuid));

    for (const item of MOCK_RUN.items) {
      for (const uuid of item.instruction.cfdiUuids) {
        expect(known.has(uuid)).toBe(true);
      }
    }
  });

  test("ask for exactly the total of the CFDI they settle", () => {
    const byUuid = new Map(CFDIS.map((cfdi) => [cfdi.uuid, cfdi]));

    for (const item of MOCK_RUN.items) {
      if (item.instruction.cfdiUuids.length !== 1) {
        continue;
      }

      const cfdi = byUuid.get(item.instruction.cfdiUuids[0] ?? "");

      expect(cfdi).toBeDefined();
      expect(item.instruction.amount).toBeCloseTo(cfdi?.total ?? 0, 2);
    }
  });

  test("carry a decision for the instruction they belong to", () => {
    for (const item of MOCK_RUN.items) {
      expect(item.decision.instructionId).toBe(item.instruction.id);
      expect(item.decision.findings).toEqual(item.findings);
    }
  });

  test("only state comprobable or requiere_verificacion", () => {
    for (const item of MOCK_RUN.items) {
      for (const finding of item.findings) {
        expect(["comprobable", "requiere_verificacion"]).toContain(
          finding.state,
        );
      }
    }
  });
});

describe("every CFDI", () => {
  test("adds up: subtotal plus IVA is the total", () => {
    for (const cfdi of CFDIS) {
      expect(cfdi.subtotal + cfdi.iva).toBeCloseTo(cfdi.total, 2);
    }
  });

  test("is issued to the same company", () => {
    const receivers = new Set(CFDIS.map((cfdi) => cfdi.receiverRfc));

    expect(receivers.size).toBe(1);
  });
});

describe("the retroactive sweep", () => {
  test("derives the deducted base from the CFDIs it lists", () => {
    const sweep = mockSweep();

    for (const entry of sweep.newlyListed) {
      const fromCfdis = entry.paidCfdis.reduce(
        (total, cfdi) => total + cfdi.subtotal,
        0,
      );

      expect(entry.deductedBase).toBeCloseTo(fromCfdis, 2);
    }
  });

  test("total exposure is the ISR plus the IVA of every listed supplier", () => {
    const sweep = mockSweep();
    const expected = sweep.newlyListed.reduce(
      (total, entry) => total + entry.isrExposure + entry.ivaExposure,
      0,
    );

    expect(sweep.totalExposure).toBeCloseTo(expected, 2);
  });

  test("only lists suppliers that are in the run", () => {
    const known = new Set(SUPPLIERS.map((supplier) => supplier.rfc));

    for (const entry of mockSweep().newlyListed) {
      expect(known.has(entry.supplier.rfc)).toBe(true);
    }
  });
});

describe("the placeholder metrics", () => {
  test("report precision as true positives over everything flagged", () => {
    const { truePositives, falsePositives, precision } = MOCK_METRICS;

    expect(precision).toBeCloseTo(
      truePositives / (truePositives + falsePositives),
      6,
    );
  });

  test("report recall as true positives over everything real", () => {
    const { truePositives, falseNegatives, recall } = MOCK_METRICS;

    expect(recall).toBeCloseTo(
      truePositives / (truePositives + falseNegatives),
      6,
    );
  });

  test("sum the per detector counts into the totals", () => {
    const rows = Object.values(MOCK_METRICS.perDetector);
    const sum = (
      pick: (row: { tp: number; fp: number; fn: number }) => number,
    ) => rows.reduce((total, row) => total + pick(row), 0);

    expect(MOCK_METRICS.truePositives).toBe(sum((row) => row.tp));
    expect(MOCK_METRICS.falsePositives).toBe(sum((row) => row.fp));
    expect(MOCK_METRICS.falseNegatives).toBe(sum((row) => row.fn));
  });

  test("never claim more real cases than the set has", () => {
    const positives = MOCK_METRICS.truePositives + MOCK_METRICS.falseNegatives;

    expect(positives).toBeLessThanOrEqual(MOCK_METRICS.cases);
  });
});

describe("the ledger", () => {
  test("is ordered by time", () => {
    const events = mockLedger();
    const times = events.map((event) => event.at);

    expect(times).toEqual([...times].sort((a, b) => a.localeCompare(b)));
  });

  test("carries one instruction event per row of the run", () => {
    const received = mockLedger().filter(
      (event) => event.type === "instruction_received",
    );

    expect(received.length).toBe(MOCK_RUN.items.length);
  });
});

describe("the supplier drawer data", () => {
  test("returns only the CFDIs of the supplier asked for", () => {
    const detail = mockSupplierDetail("SYN010101AAA");

    expect(detail).not.toBeNull();

    for (const cfdi of detail?.cfdis ?? []) {
      expect(cfdi.issuerRfc).toBe("SYN010101AAA");
    }
  });

  test("is null for a supplier nobody has", () => {
    expect(mockSupplierDetail("SYN999999ZZZ")).toBeNull();
  });

  test("leaves the bank reconciliation supplier without invoices", () => {
    const detail = mockSupplierDetail("SYN060606FFF");

    expect(detail?.cfdis).toEqual([]);
  });
});
