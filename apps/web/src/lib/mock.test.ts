/**
 * Invariants of the synthetic run.
 *
 * These are not tests of the detectors, which live in `packages/core` and
 * `packages/engine` and are tested there. They are tests of the data the UI
 * renders offline, and they exist because four of the repository's rules are only
 * as strong as that data: every generated object carries `synthetic: true`, no
 * real RFC ever appears next to fabricated evidence, no total on screen disagrees
 * with the rows under it, and the offline run is the same company the API serves.
 *
 * The fourth is the one issue 125 was about, so it is the one with the most tests
 * here. `mock.ts` composes the payloads out of `mock-data.ts`, and the checks
 * below are that the composition holds together: a row references a supplier that
 * exists, a finding is reachable from the line it is about, and the drawer answers
 * for every RFC the run names. That the rows themselves are the API's rows is a
 * different claim with a different test, `scripts/web-mock.test.ts`, which fails
 * when the committed file stops matching the generator.
 *
 * A reviewer should be able to break any of the four and see a red test.
 */

import { describe, expect, test } from "bun:test";
import {
  BENEFICIARIES,
  bankName,
  bankNameFromCode,
  CEP_EXAMPLE_RFC,
  CFDIS,
  COMPANY_RFC,
  COMPLEMENTS,
  DEMO_INSTRUCTION_IDS,
  EXAMPLE_INSTRUCTION_ID,
  EXAMPLE_SUPPLIER_RFC,
  LISTED_SUPPLIER_RFC,
  MOCK_CEP,
  MOCK_METRICS,
  MOCK_RUN,
  mockCepVerification,
  mockInstruction,
  mockIntakeExample,
  mockLedger,
  mockSupplierDetail,
  mockSweep,
  SAT_ENTRIES,
  SUPPLIERS,
  totalsFor,
} from "./mock";

/** Synthetic RFC of a moral person: SYN, six characters, three characters. */
const SYNTHETIC_RFC = /^SYN[0-9A-Z]{6}[0-9A-Z]{3}$/;

/**
 * Independent check-digit verifier for a CLABE: weights 3, 7, 1 over the first
 * seventeen digits, each product taken modulo 10, and the control digit is the
 * complement of the sum modulo 10.
 *
 * This is a fixture check, not the detector. The real forensics belong in
 * `packages/core`; this only proves the accounts in the offline run are
 * well-formed, so a demo never shows an account that could not exist.
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

  test("is true across the CFDIs, the complements and the CEP", () => {
    for (const value of [CFDIS, COMPLEMENTS, MOCK_CEP]) {
      const flags = syntheticFlags(value);

      expect(flags.length).toBeGreaterThan(0);
      expect(flags.every((flag) => flag)).toBe(true);
    }
  });

  test("is true on the intake example the QR page shows", () => {
    const flags = syntheticFlags(mockIntakeExample());

    expect(flags.length).toBeGreaterThan(0);
    expect(flags.every((flag) => flag)).toBe(true);
  });
});

describe("identifiers", () => {
  test("the company RFC is synthetic", () => {
    expect(COMPANY_RFC).toMatch(SYNTHETIC_RFC);
  });

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

  test("every RFC a screen offers as a placeholder is one the run holds", () => {
    /* A placeholder from another dataset is an instruction to type something the
       API answers 404 for, which is how the SAT screen once showed a confident
       zero for an RFC the seeded company does not hold. */
    const known = new Set(SUPPLIERS.map((supplier) => supplier.rfc));

    expect(known.has(EXAMPLE_SUPPLIER_RFC)).toBe(true);
    expect(known.has(CEP_EXAMPLE_RFC)).toBe(true);
    expect(known.has(LISTED_SUPPLIER_RFC)).toBe(true);
  });

  test("every folio a screen offers as a placeholder is a line of the run", () => {
    expect(mockInstruction(EXAMPLE_INSTRUCTION_ID)).not.toBeNull();

    for (const id of DEMO_INSTRUCTION_IDS) {
      expect(mockInstruction(id)).not.toBeNull();
    }
  });

  test("every known account is a well-formed CLABE", () => {
    for (const supplier of SUPPLIERS) {
      for (const account of supplier.knownAccounts) {
        expect(isValidClabe(account.clabe)).toBe(true);
      }
    }
  });

  test("every account an instruction points at is eighteen digits", () => {
    for (const item of MOCK_RUN.items) {
      expect(item.instruction.clabe).toMatch(/^\d{18}$/);
    }
  });

  test("only a line the CLABE control flagged fails the check digit", () => {
    /* The seeded run carries one account whose control digit does not hold, and
       that is a labelled positive rather than a broken fixture: it is the line
       `clabe_forensics` reports as critical. Every other account has to be an
       account that could exist, because an invalid one would make the interesting
       cases trivially detectable by arithmetic alone. */
    const failing = MOCK_RUN.items.filter(
      (item) => !isValidClabe(item.instruction.clabe),
    );

    expect(failing.length).toBeGreaterThan(0);

    for (const item of failing) {
      expect(
        item.findings.some(
          (finding) =>
            finding.detector === "clabe_forensics" &&
            finding.severity === "critical",
        ),
      ).toBe(true);
      expect(item.decision.action).not.toBe("release");
    }
  });
});

describe("the run totals", () => {
  test("are the sum of the rows", () => {
    expect(MOCK_RUN.totals).toEqual(totalsFor(MOCK_RUN.items));
  });

  test("count the lines in the three bare names and not the pesos", () => {
    /* The half of issue 125 nothing rendered: this interface read `held` as a
       peso sum and the API has answered a count all along. */
    const { held, toVerify, released, instructions } = MOCK_RUN.totals;

    expect(held + toVerify + released).toBe(instructions);
    expect(instructions).toBe(MOCK_RUN.items.length);
  });

  test("split the amount across the three actions without losing a peso", () => {
    const { amount, heldAmount, toVerifyAmount, releasedAmount } =
      MOCK_RUN.totals;

    expect(heldAmount + toVerifyAmount + releasedAmount).toBeCloseTo(amount, 2);
  });

  test("report the pesos that did not leave as the two that were stopped", () => {
    const { heldAmount, toVerifyAmount, stoppedAmount } = MOCK_RUN.totals;

    expect(stoppedAmount).toBeCloseTo(heldAmount + toVerifyAmount, 2);
  });
});

describe("the rows", () => {
  test("reference a supplier that exists", () => {
    const known = new Set(SUPPLIERS.map((supplier) => supplier.rfc));

    for (const item of MOCK_RUN.items) {
      expect(item.supplier.rfc).toBe(item.instruction.supplierRfc);
      expect(known.has(item.supplier.rfc)).toBe(true);
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
    }
  });

  test("carry the same findings the decision was made on", () => {
    /* The run payload indexes findings per line and the decision embeds the ones
       it weighed. Two answers to "what is wrong with this payment" is how the
       alert rail and the verdict end up disagreeing. */
    for (const item of MOCK_RUN.items) {
      expect(item.findings.map((finding) => finding.id).sort()).toEqual(
        item.decision.findings.map((finding) => finding.id).sort(),
      );
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

  test("carry at least one line the engine stopped, so the rail is not empty", () => {
    const stopped = MOCK_RUN.items.filter(
      (item) => item.decision.action !== "release",
    );

    expect(stopped.length).toBeGreaterThan(0);
    expect(stopped.every((item) => item.findings.length > 0)).toBe(true);
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

    expect([...receivers]).toEqual([COMPANY_RFC]);
  });

  test("is issued by a supplier the run holds", () => {
    const known = new Set(SUPPLIERS.map((supplier) => supplier.rfc));

    for (const cfdi of CFDIS) {
      expect(known.has(cfdi.issuerRfc)).toBe(true);
    }
  });
});

describe("the retroactive sweep", () => {
  test("derives the deducted base from the CFDIs it lists", () => {
    for (const entry of mockSweep().newlyListed) {
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

  test("only lists suppliers this company holds", () => {
    const known = new Set(SUPPLIERS.map((supplier) => supplier.rfc));

    for (const entry of mockSweep().newlyListed) {
      expect(known.has(entry.supplier.rfc)).toBe(true);
    }
  });

  test("is about the supplier the 69-B finding of this run names", () => {
    expect(
      mockSweep().newlyListed.map((entry) => entry.supplier.rfc),
    ).toContain(LISTED_SUPPLIER_RFC);
  });

  test("keeps the rows when a caller prices another version", () => {
    const priced = mockSweep("2026-09-12");

    expect(priced.listVersion).toBe("2026-09-12");
    expect(priced.totalExposure).toBe(mockSweep().totalExposure);
  });
});

describe("the metrics", () => {
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

  test("are a measurement, so the set is not empty", () => {
    /* They used to be a placeholder with invented counts and the screen said so.
       They are now the blind holdout the API scores, so an empty set would mean
       the generator scored nothing rather than that nobody has run it. */
    expect(MOCK_METRICS.cases).toBeGreaterThan(0);
  });
});

describe("the ledger", () => {
  test("is ordered by time", () => {
    const times = mockLedger().map((event) => event.at);

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
  test("answers for every supplier the run names", () => {
    /* This is issue 125 from the drawer's side: the row renders from the run
       payload and the drawer loads the supplier separately, so an RFC the drawer
       cannot answer for is two different screens for one company. */
    for (const item of MOCK_RUN.items) {
      const detail = mockSupplierDetail(item.instruction.supplierRfc);

      expect(detail).not.toBeNull();
      expect(detail?.supplier.legalName).toBe(item.supplier.legalName);
    }
  });

  test("returns only the CFDIs of the supplier asked for", () => {
    /* A supplier of the run, not `SUPPLIERS[0]`: the offline file carries the
       invoices this run settles, the sweep prices or a finding names, so "this
       issuer has at least one invoice here" is a guarantee for a supplier the run
       names and luck for any other. */
    const rfc = MOCK_RUN.items[0]?.instruction.supplierRfc ?? "";
    const detail = mockSupplierDetail(rfc);

    expect(detail).not.toBeNull();
    expect(detail?.cfdis.length).toBeGreaterThan(0);

    for (const cfdi of detail?.cfdis ?? []) {
      expect(cfdi.issuerRfc).toBe(rfc);
    }
  });

  test("returns every finding about that supplier, its invoices or its lines", () => {
    const rfc = LISTED_SUPPLIER_RFC;
    const detail = mockSupplierDetail(rfc);

    expect(
      detail?.findings.some((finding) => finding.detector === "sat_69b"),
    ).toBe(true);
  });

  test("holds no verified beneficiary until a probe is verified", () => {
    /* The registry starts empty on both sides. A row here would be a document
       claiming it reached a registry no browser wrote to. */
    expect(BENEFICIARIES).toEqual([]);

    for (const item of MOCK_RUN.items) {
      expect(
        mockSupplierDetail(item.instruction.supplierRfc)?.verifiedBeneficiaries,
      ).toEqual([]);
    }
  });

  test("is null for a supplier nobody has", () => {
    expect(mockSupplierDetail("SYN999999ZZZ")).toBeNull();
  });
});

describe("the CEP example", () => {
  test("never claims a seal nobody validated", () => {
    /* `bun run demo` asserts the same thing about the API's answer. A synthetic
       document cannot come back with a validated Banxico seal, so the offline
       copy of that answer must not claim one either. */
    const { cep, finding } = mockCepVerification();

    expect(cep.signatureValid).toBe(false);
    expect(cep.signatureReason).toBe("not_checked");
    expect(finding.state).toBe("requiere_verificacion");
  });

  test("is the engine's own finding about that document", () => {
    const { finding, cep } = mockCepVerification();

    expect(finding.detector).toBe("beneficiary_cep");
    expect(finding.evidence.claveRastreo).toBe(cep.claveRastreo);
  });

  test("compares against the supplier the screen names", () => {
    const { cep, nameMatch } = mockCepVerification();
    const supplier = SUPPLIERS.find((row) => row.rfc === CEP_EXAMPLE_RFC);

    expect(supplier).toBeDefined();
    expect(cep.beneficiaryName).toBe(supplier?.legalName ?? "");
    expect(nameMatch).toBe("match");
  });
});

describe("the intake example", () => {
  test("carries the consortium line, so ?data=mock still renders it", () => {
    const { findings } = mockIntakeExample();
    const carried = findings.filter(
      (finding) => finding.evidence.network !== undefined,
    );

    expect(carried.length).toBeGreaterThan(0);
  });

  test("is a line of the run, with the supplier that line names", () => {
    const example = mockIntakeExample();
    const row = mockInstruction(example.instruction.id);

    expect(row).not.toBeNull();
    expect(example.supplier.rfc).toBe(example.instruction.supplierRfc);
    expect(row?.supplier.legalName).toBe(example.supplier.legalName);
  });
});

describe("the bank names", () => {
  test("come from the Banxico participant catalogue", () => {
    expect(bankNameFromCode("012")).toBe("BBVA MEXICO");
    expect(bankNameFromCode("014")).toBe("SANTANDER");
  });

  test("name the institution of every account in the run", () => {
    /* The hand-written table this replaced held five banks and the seeded company
       pays through more than five, so the column read "Banco 044" at a judge. */
    for (const item of MOCK_RUN.items) {
      expect(bankName(item.instruction.clabe)).not.toContain("Banco ");
    }
  });

  test("report a code outside the snapshot rather than guessing", () => {
    expect(bankNameFromCode("999")).toBe("Banco 999");
  });
});
