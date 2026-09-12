/**
 * The evidence reader has one job and one failure mode.
 *
 * The job is to understand both evidence vocabularies in this repository. The
 * failure mode is silent: when it does not recognise a key, nothing throws and
 * nothing looks broken in the offline demo, the panel just quietly stops
 * showing the comparison that is the whole point of the screen, or prints an
 * English variable name at a Mexican clerk. Both of those are invisible until
 * the app is pointed at the real API, which is the worst possible moment.
 *
 * So these tests assert against both vocabularies deliberately, and the last
 * one fails the build when a detector grows a key nobody translated.
 */

import { describe, expect, test } from "bun:test";
import type { Finding } from "@hackmty/core";
import { EVIDENCE_ALIASES, EVIDENCE_LABELS, readEvidence } from "./evidence";

function finding(evidence: Finding["evidence"]): Finding {
  return {
    id: "fnd-test",
    detector: "clabe_forensics",
    severity: "critical",
    state: "requiere_verificacion",
    subject: { kind: "instruction", id: "ins-test" },
    amountAtRisk: 96_420.5,
    explanation: "Hallazgo sintetico para la prueba.",
    evidence,
    createdAt: "2026-09-09T18:41:03-06:00",
  };
}

describe("the CLABE comparison", () => {
  test("reads the pair written by the detectors", () => {
    /* The engine keeps only the known account in the evidence, because the
       proposed one is already on the instruction. The caller supplies it. */
    const view = readEvidence(
      finding({
        nearestKnownAccount: "012180001234567899",
        differingPositions: "7,16",
      }),
      "012180101234567799",
    );

    expect(view.clabe).toEqual({
      proposed: "012180101234567799",
      known: "012180001234567899",
      differing: [7, 16],
    });
  });

  test("reads the pair written by the offline synthetic run", () => {
    const view = readEvidence(
      finding({
        clabe_propuesta: "012180101234567799",
        clabe_conocida: "012180001234567899",
        posiciones: "7, 16",
      }),
    );

    expect(view.clabe?.proposed).toBe("012180101234567799");
    expect(view.clabe?.known).toBe("012180001234567899");
    /* Spaces after the comma. The two vocabularies do not even agree on this. */
    expect(view.clabe?.differing).toEqual([7, 16]);
  });

  test("trusts the detector's positions over its own arithmetic", () => {
    /* The detector knows which substitutions are typical OCR confusions and
       this module does not, so when it reports positions they win even if a
       naive character diff would disagree. */
    const view = readEvidence(
      finding({
        clabe_propuesta: "111111111111111111",
        clabe_conocida: "222222222222222222",
        posiciones: "3",
      }),
    );

    expect(view.clabe?.differing).toEqual([3]);
  });

  test("computes the positions when the detector reported none", () => {
    /* One digit apart, at the check digit. Two eighteen-digit strings that
       differ in the last place is the case a human eye loses. */
    const view = readEvidence(
      finding({ nearestKnownAccount: "012180001234567899" }),
      "012180001234567890",
    );

    expect(view.clabe?.differing).toEqual([17]);
  });

  test("reads the pair written by the API repository", () => {
    /* The third vocabulary, and the only one the app actually meets when the
       API is up. It carries both accounts, so no caller hint is needed. */
    const view = readEvidence(
      finding({
        knownClabe: "012180001234567899",
        proposedClabe: "012180101234567799",
        accountDigitsChanged: 2,
      }),
    );

    expect(view.clabe?.known).toBe("012180001234567899");
    expect(view.clabe?.proposed).toBe("012180101234567799");
    expect(view.chips.map((chip) => chip.key)).toEqual([
      "accountDigitsChanged",
    ]);
  });

  test("offers no comparison when there is nothing to compare against", () => {
    /* Silence is correct here. A comparison drawn against a missing account
       would invent a difference, and this panel is evidence. */
    expect(readEvidence(finding({ checkDigit: "valid" })).clabe).toBeNull();
    expect(
      readEvidence(finding({ nearestKnownAccount: "012180001234567899" }))
        .clabe,
    ).toBeNull();
  });
});

describe("the bank change", () => {
  test("is reported when the account moved between institutions", () => {
    const view = readEvidence(
      finding({
        previousInstitutionNames: "BBVA Mexico",
        institutionName: "Santander",
      }),
    );

    expect(view.bankChange).toEqual({ from: "BBVA Mexico", to: "Santander" });
  });

  test("is not claimed when both accounts sit at the same bank", () => {
    /* The edge case that matters: a CLABE finding fires for two changed digits
       inside the same institution. Announcing a bank change there is simply a
       false statement, and the panel is the artefact a judge reads. */
    const view = readEvidence(
      finding({
        previousInstitutionNames: "BBVA Mexico",
        institutionName: "BBVA Mexico",
      }),
    );

    expect(view.bankChange).toBeNull();
  });

  test("names a bank the API reported as a three-digit code", () => {
    /* "012 a 014" is not a sentence a clerk can act on. The codes are resolved
       through the same catalogue the run table uses for its bank column. */
    const view = readEvidence(
      finding({ previousBankCode: "012", bankCode: "014" }),
    );

    expect(view.bankChange?.from).toBe("BBVA Mexico");
    expect(view.bankChange?.to).toBe("Santander");
  });

  test("is not claimed when there is no previous bank to compare", () => {
    expect(readEvidence(finding({ institutionName: "STP" })).bankChange).toBe(
      null,
    );
  });
});

describe("the Article 69-B status", () => {
  test("is read from the detector vocabulary", () => {
    const view = readEvidence(
      finding({
        status: "definitivo",
        publishedAt: "2026-08-28",
        listVersion: "2026-08-28",
      }),
    );

    expect(view.satStatus).toEqual({
      status: "definitivo",
      publishedAt: "2026-08-28",
      listVersion: "2026-08-28",
    });
  });

  test("is read from the offline vocabulary", () => {
    const view = readEvidence(
      finding({
        estado: "presunto",
        version_lista: "2026-08-28",
        publicado_en_dof: "2026-08-28",
      }),
    );

    expect(view.satStatus?.status).toBe("presunto");
    expect(view.satStatus?.listVersion).toBe("2026-08-28");
  });

  test("refuses a status that is not one of the four", () => {
    /* `status` is a common key name. A reconciliation finding that happens to
       carry one must not be painted with a 69-B badge. */
    expect(readEvidence(finding({ status: "completed" })).satStatus).toBeNull();
  });
});

describe("the invoice a duplicate copies", () => {
  test("is named from either vocabulary", () => {
    const engine = readEvidence(
      finding({ originalUuid: "a1b2-0001", originalFolio: "7781" }),
    );
    const offline = readEvidence(
      finding({ uuid_original: "a1b2-0001", folio_original: "7781" }),
    );

    expect(engine.duplicateOf).toEqual({ uuid: "a1b2-0001", folio: "7781" });
    expect(offline.duplicateOf).toEqual({ uuid: "a1b2-0001", folio: "7781" });
  });

  test("survives a rule that reports only one of the two", () => {
    /* `folio_collision` has no original UUID and `same_amount_window` may have
       no original folio. Both still have something worth naming. */
    expect(
      readEvidence(finding({ originalFolio: "7781" })).duplicateOf,
    ).toEqual({ uuid: null, folio: "7781" });
  });
});

describe("the SentryOne network line", () => {
  const pulled = "2026-09-11T06:00:00-06:00";

  test("reads the corroborated case as the headline the brief asks for", () => {
    const view = readEvidence(
      finding({
        network: {
          source: "snapshot",
          tenants: 37,
          firstSeen: "2024-03-04",
          lastSeen: "2026-09-02",
          fraudReports: 0,
          otherAccounts: 1,
          pulledAt: pulled,
        },
      }),
    );

    expect(view.network).toEqual({
      label: "pagada por 37 empresas desde mar 2024",
      verdict: "corroborated",
      pulledAt: pulled,
    });
  });

  test("renders a network nobody consulted rather than hiding it", () => {
    /* The bug this pins: a missing line and a line that says "no consultada"
       look the same to a reader, and only one of them is true. */
    const view = readEvidence(
      finding({
        network: {
          source: "not_consulted",
          tenants: 0,
          fraudReports: 0,
          otherAccounts: 0,
        },
      }),
    );

    expect(view.network?.label).toBe("no consultada");
    expect(view.network?.pulledAt).toBeNull();
  });

  test("separates an account the network never saw from one it never read", () => {
    const view = readEvidence(
      finding({
        network: {
          source: "snapshot",
          tenants: 0,
          fraudReports: 0,
          otherAccounts: 23,
          pulledAt: pulled,
        },
      }),
    );

    expect(view.network?.verdict).toBe("other_accounts_only");
    expect(view.network?.label).toContain("23 otras cuentas del proveedor");
  });

  test("leads with the fraud report when the network holds one", () => {
    const view = readEvidence(
      finding({
        network: {
          source: "snapshot",
          tenants: 3,
          fraudReports: 1,
          otherAccounts: 0,
          pulledAt: pulled,
        },
      }),
    );

    expect(view.network?.verdict).toBe("fraud_reported");
    expect(view.network?.label).toBe("1 reporte de fraude");
  });

  test("is null on a finding that carries no network at all", () => {
    expect(readEvidence(finding({ checkDigit: "valid" })).network).toBeNull();
  });

  test("never renders the signal as a chip as well", () => {
    /* An object in the chip list prints as "[object Object]" at a clerk, which is
       the failure this filter exists to make impossible. */
    const view = readEvidence(
      finding({
        canal: "whatsapp",
        network: {
          source: "snapshot",
          tenants: 4,
          fraudReports: 0,
          otherAccounts: 0,
          pulledAt: pulled,
        },
      }),
    );

    expect(view.chips.map((chip) => chip.key)).toEqual(["canal"]);
  });
});

describe("the chips", () => {
  test("never repeat a fact that was rendered on its own", () => {
    /* The bug this pins: the CLABE shown twice, once in the comparison and
       once as an unreadable eighteen-digit chip beside it. */
    const view = readEvidence(
      finding({
        clabe_propuesta: "012180101234567799",
        clabe_conocida: "012180001234567899",
        posiciones: "7, 16",
        estado: "definitivo",
        originalUuid: "a1b2-0001",
        institutionName: "Santander",
        previousInstitutionNames: "BBVA Mexico",
        canal: "whatsapp",
      }),
    );

    expect(view.chips.map((chip) => chip.key)).toEqual(["canal"]);
  });

  test("render booleans and numbers as a person reads them", () => {
    const view = readEvidence(
      finding({ totalsMatch: true, mismo_banco: false, copies: 3 }),
    );
    const byKey = Object.fromEntries(
      view.chips.map((chip) => [chip.key, chip.value]),
    );

    expect(byKey.totalsMatch).toBe("si");
    expect(byKey.mismo_banco).toBe("no");
    expect(byKey.copies).toBe("3");
  });

  test("space an untranslated key rather than printing it raw", () => {
    const view = readEvidence(finding({ someNewSignal: 1, otro_dato: 2 }));

    expect(view.chips.map((chip) => chip.label)).toEqual([
      "some new signal",
      "otro dato",
    ]);
  });
});

describe("the label dictionary", () => {
  /*
   * Every key the six detectors emit today, read off the evidence literals in
   * packages/core/src/{clabe,duplicates,behaviour,reconciliation}.ts and
   * packages/engine/src/sat69b.ts. When a detector grows a key, this list and
   * the dictionary move together or the build goes red, which is the point:
   * an untranslated key is invisible in review and obvious to a judge.
   */
  const EMITTED = [
    // sat69b
    "rfc",
    "status",
    "statusLabel",
    "publishedAt",
    "listVersion",
    "listedNow",
    "rowsHeld",
    "paidCfdis",
    "deductedBase",
    "retroactiveExposure",
    // clabe
    "signals",
    "institutionCode",
    "institutionName",
    "plazaCode",
    "checkDigit",
    "expectedCheckDigit",
    "knownAccounts",
    "timesPaid",
    "establishedBy",
    "nearestKnownAccount",
    "nearestTimesPaid",
    "editOperations",
    "ocrSubstitutions",
    "differingPositions",
    "previousInstitutionCodes",
    "previousInstitutionNames",
    "previousPlazaCodes",
    "institutionCatalogue",
    "ocrChannel",
    "ocrConfidence",
    "problem",
    "digits",
    // duplicates
    "rule",
    "issuerRfc",
    "uuid",
    "originalUuid",
    "originalIssuedAt",
    "originalTotal",
    "originalFolio",
    "candidateIssuedAt",
    "candidateTotal",
    "copies",
    "daysApart",
    "windowDays",
    "total",
    "totalsMatch",
    "serie",
    "folio",
    "complementUuid",
    "complements",
    "paidAmount",
    "lastPaidAt",
    "coverage",
    "beneficiaryAccount",
    // behaviour
    "baselineStart",
    "baselineEnd",
    "recentStart",
    "recentEnd",
    "baselineInvoices",
    "baselineExposureWeeks",
    "baselineRatePerWeek",
    "baselineMedianAmount",
    "baselineLogSigma",
    "baselineAmount",
    "baselineShare",
    "recentInvoices",
    "expectedInvoices",
    "ratePValue",
    "recentMaxAmount",
    "amountZScore",
    "recentAmount",
    // reconciliation
    "case",
    "ledgerTxId",
    "accountId",
    "day",
    "amount",
    "source",
    "documentsConsidered",
    "toleranceMxn",
    "documentKind",
    "documentId",
    "cfdiUuid",
    "supplierRfc",
    "expectedAmount",
    "expectedDay",
    "matchedOutflowId",
    "matchedOutflowDay",
    "instructionId",
    "sentAt",
    "sentDay",
    "outflowsNearby",
    // the consortium, packages/engine/src/beneficiary.ts. `network` itself is
    // rendered on its own line and is in EVIDENCE_ALIASES rather than here.
    "networkVerdict",
    "networkAdjustment",
    "networkTenants",
    "networkMonths",
    "networkFraudReports",
    "networkOtherAccounts",
    // the API's in-memory repository, apps/api/src/synthetic.ts
    "knownClabe",
    "proposedClabe",
    "accountDigitsChanged",
    "checkDigitValid",
    "timesPaidToKnownAccount",
    "channel",
    "bankCode",
    "previousBankCode",
    "gatedBySampleSize",
    "ratioToMedian",
    "sampleSize",
    "windowDays",
    "instructionsThisRun",
    "nameMatch",
    "signatureValid",
    "claveRastreo",
    "verifiedAt",
    "matchedDocuments",
    "outflowAmount",
    "outflowDate",
    "otherUuid",
    "otherFolio",
  ];

  /** A key rendered on its own does not need a chip label. */
  const rendered = new Set<string>(Object.values(EVIDENCE_ALIASES).flat());

  test("covers every key the detectors emit", () => {
    const untranslated = EMITTED.filter(
      (key) => !rendered.has(key) && !(key in EVIDENCE_LABELS),
    );

    expect(untranslated).toEqual([]);
  });

  test("carries no entry that adds nothing to the key", () => {
    /* A dictionary entry may repeat its key when the key is already one
       lowercase Spanish word, as `folio` and `importe` are. What it may not do
       is repeat a camelCase or snake_case key, because then the entry is not a
       translation, it is a variable name with a straight face. */
    const lazy = Object.entries(EVIDENCE_LABELS).filter(
      ([key, label]) => key === label && /[A-Z_]/.test(key),
    );

    expect(lazy).toEqual([]);
  });
});
