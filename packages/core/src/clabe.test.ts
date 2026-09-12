import { describe, expect, it } from "bun:test";
import {
  BANXICO_INSTITUTION_SNAPSHOT,
  BANXICO_INSTITUTIONS,
  CLABE_CHECK_WEIGHTS,
  clabeCheckDigit,
  clabeDistance,
  detectClabe,
  findNearestKnownAccount,
  isOcrConfusable,
  isValidClabe,
  lookupInstitution,
  normalizeClabe,
  OCR_CONFUSION_GROUPS,
  parseClabeParts,
  validateClabe,
} from "./clabe";
import type { KnownAccount, PaymentInstruction, Supplier } from "./domain";

/**
 * Every CLABE below is synthetic and closed with its real check digit, so no
 * fixture can drift out of arithmetic agreement with the code under test. The
 * one exception is `PUBLISHED_EXAMPLE`, a worked example from the public CLABE
 * documentation, hardcoded so the algorithm is pinned by a number this repo did
 * not produce.
 */
const PUBLISHED_EXAMPLE = "032180000118359719";

/** BANORTE (072), plaza 580. The account this supplier has always been paid on. */
const BANORTE_MTY = "072580000123456788";
/** A second BANORTE account in the same plaza, seven edits from the first. */
const BANORTE_MTY_OTHER = "072580000987654328";
/** BBVA (012), plaza 580, unrelated account number. */
const BBVA_MTY = "012580000445566772";
/** BBVA (012), plaza 180. Same bank as BBVA_MTY, different plaza. */
const BBVA_CDMX = "012180000998877664";

/**
 * Two digits of BANORTE_MTY moved, and the check digit happens to land on the
 * same value, so this CLABE is arithmetically perfect. Positions 12 and 15.
 */
const TWO_DIGITS_OFF = "072580000128451788";
/**
 * One account digit of BANORTE_MTY moved, 3 read as 8. Changing any single digit
 * forces the check digit to move with it, so this reads as two differing
 * positions, 12 and 18, and both of them are OCR confusions.
 */
const ONE_DIGIT_AND_CHECK = "072580000128456783";
/** Three digits of BANORTE_MTY moved. Positions 12, 15 and 18. */
const THREE_DIGITS_OFF = "072580000120451786";
/**
 * BANORTE_MTY with digits 2 and 3 swapped. The check digit is unchanged, which
 * is the documented hole in the scheme, and the institution is now 027.
 */
const TRANSPOSED = "027580000123456788";
/** Two edits from BANORTE_MTY_OTHER and eight from BANORTE_MTY. */
const NEAR_BANORTE_MTY_OTHER = "072580000988654327";

const SUPPLIER_RFC = "SYN010101AAA";

function account(
  clabe: string,
  overrides: Partial<KnownAccount> = {},
): KnownAccount {
  return {
    clabe,
    establishedBy: "payment_complement",
    establishedAt: "2026-03-04T10:00:00.000Z",
    timesPaid: 7,
    ...overrides,
  };
}

function makeSupplier(knownAccounts: KnownAccount[]): Supplier {
  return {
    rfc: SUPPLIER_RFC,
    legalName: "Refaccionaria Sintetica del Norte SA de CV",
    knownAccounts,
    firstInvoiceAt: "2025-11-02T00:00:00.000Z",
    synthetic: true,
  };
}

function makeInstruction(
  clabe: string,
  overrides: Partial<PaymentInstruction> = {},
): PaymentInstruction {
  return {
    id: "instr-001",
    supplierRfc: SUPPLIER_RFC,
    cfdiUuids: ["8f1d2c3b-0000-4000-8000-000000000001"],
    clabe,
    amount: 184300,
    source: "whatsapp",
    receivedAt: "2026-09-11T16:20:00.000Z",
    synthetic: true,
    ...overrides,
  };
}

/** Unweighted optimal string alignment, the textbook version, for comparison. */
function plainDamerauLevenshtein(left: string, right: string): number {
  const grid: number[][] = [];
  for (let row = 0; row <= left.length; row += 1) {
    grid.push(new Array<number>(right.length + 1).fill(0));
    grid[row][0] = row;
  }
  for (let column = 0; column <= right.length; column += 1) {
    grid[0][column] = column;
  }
  for (let row = 1; row <= left.length; row += 1) {
    for (let column = 1; column <= right.length; column += 1) {
      let best = Math.min(
        grid[row - 1][column] + 1,
        grid[row][column - 1] + 1,
        grid[row - 1][column - 1] +
          (left[row - 1] === right[column - 1] ? 0 : 1),
      );
      if (
        row > 1 &&
        column > 1 &&
        left[row - 1] === right[column - 2] &&
        left[row - 2] === right[column - 1]
      ) {
        best = Math.min(best, grid[row - 2][column - 2] + 1);
      }
      grid[row][column] = best;
    }
  }
  return grid[left.length][right.length];
}

describe("clabeCheckDigit", () => {
  it("reproduces the worked example from the published rule", () => {
    expect(clabeCheckDigit(PUBLISHED_EXAMPLE.slice(0, 17))).toBe(9);
  });

  it("gives the same digit whether the products are reduced before or after the sum", () => {
    // (a mod 10) + (b mod 10) is congruent to a + b modulo 10, so the
    // per-product reduction in the published rule changes no answer. This test
    // exists so nobody has to take that on trust at the table.
    const rawSumDigit = (first17: string): number => {
      let sum = 0;
      for (let index = 0; index < first17.length; index += 1) {
        const digit = first17.charCodeAt(index) - 48;
        sum += digit * CLABE_CHECK_WEIGHTS[index % CLABE_CHECK_WEIGHTS.length];
      }
      return (10 - (sum % 10)) % 10;
    };

    for (const clabe of [BANORTE_MTY, BBVA_MTY, BBVA_CDMX, PUBLISHED_EXAMPLE]) {
      expect(clabeCheckDigit(clabe.slice(0, 17))).toBe(
        rawSumDigit(clabe.slice(0, 17)),
      );
    }
  });

  it("returns 0 rather than 10 when the weighted sum ends in 0", () => {
    expect(clabeCheckDigit("00000000000000000")).toBe(0);
  });

  it("rejects anything that is not exactly 17 digits", () => {
    expect(() => clabeCheckDigit("0725800001234567")).toThrow(RangeError);
    expect(() => clabeCheckDigit("072580000123456789")).toThrow(RangeError);
    expect(() => clabeCheckDigit("0725800001234567X")).toThrow(RangeError);
  });

  it("catches every single-digit substitution, because 3, 7 and 1 are coprime to 10", () => {
    const misses: string[] = [];
    for (let index = 0; index < 17; index += 1) {
      for (let digit = 0; digit <= 9; digit += 1) {
        if (String(digit) === BANORTE_MTY[index]) {
          continue;
        }
        const digits = BANORTE_MTY.split("");
        digits[index] = String(digit);
        if (clabeCheckDigit(digits.slice(0, 17).join("")) === 8) {
          misses.push(digits.join(""));
        }
      }
    }
    expect(misses).toEqual([]);
  });

  it("never catches a transposition of two adjacent digits five apart", () => {
    // 7 and 2 swap, 072 becomes 027, a different institution entirely, and the
    // check digit is still 8. This is the hole in the scheme and the reason the
    // history comparison below is not optional.
    expect(isValidClabe(TRANSPOSED)).toBe(true);
    expect(TRANSPOSED.slice(-1)).toBe(BANORTE_MTY.slice(-1));
    expect(TRANSPOSED.slice(0, 3)).not.toBe(BANORTE_MTY.slice(0, 3));
  });
});

describe("normalizeClabe", () => {
  it("drops the spaces and hyphens a human types", () => {
    expect(normalizeClabe("072-580 0001 2345 6788")).toBe(BANORTE_MTY);
  });

  it("keeps a letter instead of silently deleting it", () => {
    // Stripping every non-digit would turn this into 17 digits, and it would
    // then fail as "wrong length", sending the clerk to look for a missing digit
    // that is not missing.
    expect(normalizeClabe("O72580000123456788")).toBe("O72580000123456788");
  });
});

describe("validateClabe", () => {
  it("accepts a well formed CLABE and returns its fields", () => {
    const result = validateClabe(BANORTE_MTY);

    expect(result.valid).toBe(true);
    expect(result.problem).toBeUndefined();
    expect(result.parts).toEqual({
      institution: "072",
      plaza: "580",
      account: "00012345678",
      checkDigit: "8",
    });
    expect(result.institution?.name).toBe("BANORTE");
  });

  it("reports an empty input as empty, not as a length problem", () => {
    expect(validateClabe("   ").problem).toBe("empty");
  });

  it("reports a letter as non_digit", () => {
    expect(validateClabe("O72580000123456788").problem).toBe("non_digit");
  });

  it("reports 17 digits as wrong_length", () => {
    expect(validateClabe("07258000012345678").problem).toBe("wrong_length");
  });

  it("reports a broken check digit and still hands back the parsed fields", () => {
    const result = validateClabe("072580000123456789");

    expect(result.valid).toBe(false);
    expect(result.problem).toBe("check_digit");
    expect(result.expectedCheckDigit).toBe(8);
    expect(result.parts?.institution).toBe("072");
    expect(result.institution?.name).toBe("BANORTE");
  });

  it("stays valid when the institution is not in the dated snapshot", () => {
    // 032 is not a current participant. A table that can go stale must never
    // invalidate arithmetic that is correct.
    const result = validateClabe(PUBLISHED_EXAMPLE);

    expect(result.valid).toBe(true);
    expect(result.institution).toBeUndefined();
  });

  it("rejects 18 characters that are digits in another script", () => {
    expect(validateClabe("٠٧٢٥٨٠٠٠٠١٢٣٤٥٦٧٨٨").problem).toBe("non_digit");
  });
});

describe("parseClabeParts", () => {
  it("splits the four fields at 3, 3, 11 and 1", () => {
    const parts = parseClabeParts(BBVA_CDMX);

    expect(parts.institution).toBe("012");
    expect(parts.plaza).toBe("180");
    expect(parts.account).toHaveLength(11);
    expect(parts.checkDigit).toBe("4");
  });

  it("refuses anything that is not 18 digits", () => {
    expect(() => parseClabeParts("072580")).toThrow(RangeError);
  });
});

describe("BANXICO_INSTITUTIONS", () => {
  it("holds the row count the snapshot header claims", () => {
    expect(Object.keys(BANXICO_INSTITUTIONS)).toHaveLength(
      BANXICO_INSTITUTION_SNAPSHOT.rows,
    );
  });

  it("keys every row by its own three-digit code", () => {
    for (const [key, institution] of Object.entries(BANXICO_INSTITUTIONS)) {
      expect(key).toMatch(/^\d{3}$/);
      expect(institution.code).toBe(key);
      expect(institution.name.length).toBeGreaterThan(0);
    }
  });

  it("carries the participants the demo names", () => {
    expect(lookupInstitution("012")?.name).toBe("BBVA MEXICO");
    expect(lookupInstitution("002")?.name).toBe("BANAMEX");
    expect(lookupInstitution("072")?.name).toBe("BANORTE");
    expect(lookupInstitution("058")?.name).toBe("BANREGIO");
    expect(lookupInstitution("646")?.name).toBe("STP");
    expect(lookupInstitution("661")?.name).toBe("KLAR");
    expect(lookupInstitution("722")?.name).toBe("Mercado Pago W");
  });

  it("returns undefined for a code the snapshot does not hold", () => {
    expect(lookupInstitution("999")).toBeUndefined();
    // The prototype chain must not leak through the record index.
    expect(lookupInstitution("constructor")).toBeUndefined();
  });
});

describe("isOcrConfusable", () => {
  it("is symmetric across every pair in every group", () => {
    for (const group of OCR_CONFUSION_GROUPS) {
      for (const left of group) {
        for (const right of group) {
          if (left !== right) {
            expect(isOcrConfusable(left, right)).toBe(true);
            expect(isOcrConfusable(right, left)).toBe(true);
          }
        }
      }
    }
  });

  it("joins the overlapping groups instead of partitioning the digits", () => {
    // 6 belongs to both {0, 8, 6} and {5, 6}, which makes the relation a graph.
    expect(isOcrConfusable("6", "0")).toBe(true);
    expect(isOcrConfusable("6", "5")).toBe(true);
    // It is not transitive: 0 and 5 were never read as one another.
    expect(isOcrConfusable("0", "5")).toBe(false);
  });

  it("says nothing about a digit and itself", () => {
    expect(isOcrConfusable("8", "8")).toBe(false);
  });
});

describe("clabeDistance", () => {
  it("is zero for the same account", () => {
    const distance = clabeDistance(BANORTE_MTY, BANORTE_MTY);

    expect(distance.operations).toBe(0);
    expect(distance.positions).toEqual([]);
  });

  it("reports one OCR substitution and its 1-based position", () => {
    // Digit 12 is a 3, read as an 8.
    const candidate = `${BANORTE_MTY.slice(0, 11)}8${BANORTE_MTY.slice(12)}`;
    const distance = clabeDistance(BANORTE_MTY, candidate);

    expect(distance.operations).toBe(1);
    expect(distance.ocrSubstitutions).toBe(1);
    expect(distance.positions).toEqual([12]);
    expect(distance.edits[0].kind).toBe("ocr_substitution");
    expect(distance.edits[0].known).toBe("3");
    expect(distance.edits[0].candidate).toBe("8");
  });

  it("reports a substitution OCR does not explain as a plain substitution", () => {
    const candidate = `${BANORTE_MTY.slice(0, 12)}9${BANORTE_MTY.slice(13)}`;
    const distance = clabeDistance(BANORTE_MTY, candidate);

    expect(distance.operations).toBe(1);
    expect(distance.ocrSubstitutions).toBe(0);
    expect(distance.positions).toEqual([13]);
    expect(distance.edits[0].kind).toBe("substitution");
  });

  it("counts an adjacent transposition as one edit over two positions", () => {
    const distance = clabeDistance(BANORTE_MTY, TRANSPOSED);

    expect(distance.operations).toBe(1);
    expect(distance.edits[0].kind).toBe("transposition");
    expect(distance.edits[0].known).toBe("72");
    expect(distance.edits[0].candidate).toBe("27");
    expect(distance.positions).toEqual([2, 3]);
  });

  it("counts an OCR substitution and a plain one as two edits, flagging one", () => {
    const distance = clabeDistance(BANORTE_MTY, TWO_DIGITS_OFF);

    expect(distance.operations).toBe(2);
    expect(distance.ocrSubstitutions).toBe(1);
    expect(distance.positions).toEqual([12, 15]);
  });

  it("never inflates the edit count that plain Damerau-Levenshtein reports", () => {
    // The OCR term only chooses between alignments that already tie on the
    // number of edits. If it ever bought a cheaper alignment with a longer one,
    // every threshold in the detector would be wrong. Twenty thousand
    // deterministic pairs, no mocks, no randomness the test cannot reproduce.
    let seed = 20260912;
    const next = (): number => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
    const digits = (length: number): string =>
      Array.from({ length }, () => String(Math.floor(next() * 10))).join("");

    let mismatches = 0;
    for (let trial = 0; trial < 20_000; trial += 1) {
      const left = digits(1 + Math.floor(next() * 8));
      const right = digits(1 + Math.floor(next() * 8));
      if (
        clabeDistance(left, right).operations !==
        plainDamerauLevenshtein(left, right)
      ) {
        mismatches += 1;
      }
    }
    expect(mismatches).toBe(0);
  });

  it("handles a dropped digit as one deletion", () => {
    const distance = clabeDistance(BANORTE_MTY, BANORTE_MTY.slice(0, 17));

    expect(distance.operations).toBe(1);
    expect(distance.edits[0].kind).toBe("deletion");
    expect(distance.edits[0].known).toBe("8");
  });

  it("handles an extra digit as one insertion", () => {
    const distance = clabeDistance(BANORTE_MTY, `${BANORTE_MTY}4`);

    expect(distance.operations).toBe(1);
    expect(distance.edits[0].kind).toBe("insertion");
    expect(distance.edits[0].position).toBe(19);
  });

  it("reports the same edit count in either direction", () => {
    const left = clabeDistance(BANORTE_MTY, BBVA_CDMX);
    const right = clabeDistance(BBVA_CDMX, BANORTE_MTY);

    expect(left.operations).toBe(right.operations);
  });

  it("never reports a position outside the candidate", () => {
    const distance = clabeDistance(BANORTE_MTY, "000000000000000000");

    expect(distance.operations).toBeGreaterThan(0);
    for (const position of distance.positions) {
      expect(position).toBeGreaterThanOrEqual(1);
      expect(position).toBeLessThanOrEqual(18);
    }
  });
});

describe("findNearestKnownAccount", () => {
  it("breaks a tie toward the account that has been paid most, whatever the order", () => {
    // Both are one plain substitution away from BANORTE_MTY, so only the
    // payment history separates them.
    const rarely = account("072580000123456789", { timesPaid: 1 });
    const often = account("072580000123456798", { timesPaid: 30 });

    const forwards = findNearestKnownAccount(BANORTE_MTY, [rarely, often]);
    const backwards = findNearestKnownAccount(BANORTE_MTY, [often, rarely]);

    expect(forwards?.distance.operations).toBe(1);
    expect(forwards?.account.clabe).toBe(often.clabe);
    expect(backwards?.account.clabe).toBe(often.clabe);
  });

  it("returns undefined when the supplier has no accounts", () => {
    expect(findNearestKnownAccount(BANORTE_MTY, [])).toBeUndefined();
  });
});

describe("detectClabe", () => {
  it("says nothing about a legitimate account the supplier has been paid on", () => {
    const supplier = makeSupplier([account(BANORTE_MTY)]);

    expect(detectClabe(makeInstruction(BANORTE_MTY), supplier)).toBeNull();
  });

  it("says nothing when that same account arrives with separators in it", () => {
    const supplier = makeSupplier([account(BANORTE_MTY)]);

    expect(
      detectClabe(makeInstruction("072-580 0001 2345 6788"), supplier),
    ).toBeNull();
  });

  it("raises a critical, provable finding when the check digit is wrong", () => {
    const supplier = makeSupplier([account(BANORTE_MTY)]);
    const finding = detectClabe(
      makeInstruction("072580000123456789"),
      supplier,
    );

    expect(finding?.detector).toBe("clabe_forensics");
    expect(finding?.severity).toBe("critical");
    expect(finding?.state).toBe("comprobable");
    expect(finding?.evidence.checkDigit).toBe("invalid");
    expect(finding?.evidence.expectedCheckDigit).toBe(8);
    expect(String(finding?.evidence.signals)).toContain("check_digit_invalid");
    expect(finding?.amountAtRisk).toBe(184300);
    expect(finding?.explanation).toContain("3-7-1");
  });

  it("raises a critical finding when the account is two digits off a known one", () => {
    const supplier = makeSupplier([account(BANORTE_MTY, { timesPaid: 7 })]);
    const finding = detectClabe(makeInstruction(TWO_DIGITS_OFF), supplier);

    expect(finding?.severity).toBe("critical");
    // Nobody is accused. The documents prove a difference, not an intent.
    expect(finding?.state).toBe("requiere_verificacion");
    expect(finding?.evidence.checkDigit).toBe("valid");
    expect(finding?.evidence.editOperations).toBe(2);
    expect(finding?.evidence.nearestKnownAccount).toBe(BANORTE_MTY);
    expect(finding?.evidence.nearestTimesPaid).toBe(7);
    expect(finding?.evidence.differingPositions).toBe("12,15");
    expect(String(finding?.evidence.signals)).toContain("near_miss");
    expect(finding?.explanation).toContain("posiciones 12 y 15");
  });

  it("counts the check digit as a differing position when one account digit moved", () => {
    // Every single-digit change forces the check digit to move with it, so the
    // honest answer is two positions, not one, and the chip says so.
    const supplier = makeSupplier([account(BANORTE_MTY)]);
    const finding = detectClabe(
      makeInstruction(ONE_DIGIT_AND_CHECK, {
        source: "pdf",
        imageRef: "img-0007",
        ocrConfidence: 0.82,
      }),
      supplier,
    );

    expect(finding?.evidence.editOperations).toBe(2);
    expect(finding?.evidence.differingPositions).toBe("12,18");
    expect(finding?.evidence.ocrSubstitutions).toBe(2);
    expect(finding?.evidence.ocrChannel).toBe(true);
    expect(finding?.evidence.ocrConfidence).toBe(0.82);
    expect(finding?.severity).toBe("critical");
    expect(finding?.explanation).toContain("0/8/6, 1/7, 5/6, 3/8, 2/7");
  });

  it("marks an instruction typed by hand as not coming through OCR", () => {
    const supplier = makeSupplier([account(BANORTE_MTY)]);
    const finding = detectClabe(
      makeInstruction(BBVA_MTY, { source: "manual" }),
      supplier,
    );

    expect(finding?.evidence.ocrChannel).toBe(false);
    expect(finding?.evidence.ocrConfidence).toBeUndefined();
  });

  it("drops to a warning at three digits off, which is a different account", () => {
    const supplier = makeSupplier([account(BANORTE_MTY)]);
    const finding = detectClabe(makeInstruction(THREE_DIGITS_OFF), supplier);

    expect(finding?.evidence.editOperations).toBe(3);
    expect(finding?.evidence.differingPositions).toBe("12,15,18");
    expect(finding?.severity).toBe("warning");
  });

  it("reports a new account at the same bank as first time seen, with no near miss", () => {
    const supplier = makeSupplier([account(BANORTE_MTY)]);
    const finding = detectClabe(makeInstruction(BANORTE_MTY_OTHER), supplier);

    expect(finding?.severity).toBe("warning");
    expect(finding?.state).toBe("requiere_verificacion");
    expect(finding?.evidence.signals).toBe("first_time_seen");
    expect(finding?.evidence.editOperations).toBeUndefined();
    expect(finding?.evidence.knownAccounts).toBe(1);
  });

  it("reports a change of bank against the supplier's history", () => {
    const supplier = makeSupplier([account(BANORTE_MTY)]);
    const finding = detectClabe(makeInstruction(BBVA_MTY), supplier);

    expect(finding?.severity).toBe("warning");
    expect(String(finding?.evidence.signals)).toContain("bank_changed");
    expect(finding?.evidence.institutionName).toBe("BBVA MEXICO");
    expect(finding?.evidence.previousInstitutionCodes).toBe("072");
    expect(finding?.evidence.previousInstitutionNames).toBe("BANORTE");
    expect(finding?.explanation).toContain("BANORTE");
    expect(finding?.explanation).toContain("BBVA MEXICO");
  });

  it("reports a change of plaza inside the same bank", () => {
    const supplier = makeSupplier([account(BBVA_MTY)]);
    const finding = detectClabe(makeInstruction(BBVA_CDMX), supplier);

    expect(String(finding?.evidence.signals)).toContain("plaza_changed");
    expect(String(finding?.evidence.signals)).not.toContain("bank_changed");
    expect(finding?.evidence.plazaCode).toBe("180");
    expect(finding?.evidence.previousPlazaCodes).toBe("580");
  });

  it("does not also report a plaza change when the bank already changed", () => {
    // Both fields moved, but that is one fact and two chips would double count it.
    const supplier = makeSupplier([account(BANORTE_MTY)]);
    const finding = detectClabe(makeInstruction(BBVA_CDMX), supplier);

    expect(String(finding?.evidence.signals)).toContain("bank_changed");
    expect(String(finding?.evidence.signals)).not.toContain("plaza_changed");
  });

  it("warns on a brand new supplier with no account history at all", () => {
    const finding = detectClabe(makeInstruction(BANORTE_MTY), undefined);

    expect(finding?.severity).toBe("warning");
    expect(finding?.state).toBe("requiere_verificacion");
    expect(finding?.evidence.signals).toBe("new_supplier");
    expect(finding?.evidence.knownAccounts).toBe(0);
    expect(finding?.explanation).toContain("sin cuentas previas");
  });

  it("treats a known supplier with an empty account list as a new supplier", () => {
    const finding = detectClabe(makeInstruction(BANORTE_MTY), makeSupplier([]));

    expect(finding?.evidence.signals).toBe("new_supplier");
  });

  it("raises a critical, provable finding when the CLABE is not 18 digits", () => {
    const supplier = makeSupplier([account(BANORTE_MTY)]);
    const finding = detectClabe(makeInstruction("07258000012345678"), supplier);

    expect(finding?.severity).toBe("critical");
    expect(finding?.state).toBe("comprobable");
    expect(finding?.evidence.problem).toBe("wrong_length");
    expect(finding?.evidence.digits).toBe(17);
    expect(finding?.evidence.institutionCode).toBeUndefined();
  });

  it("asks about an institution code the snapshot does not know, without calling it invalid", () => {
    const supplier = makeSupplier([account(BANORTE_MTY)]);
    const finding = detectClabe(makeInstruction(PUBLISHED_EXAMPLE), supplier);

    expect(finding?.severity).toBe("warning");
    expect(finding?.evidence.checkDigit).toBe("valid");
    expect(String(finding?.evidence.signals)).toContain("unknown_institution");
    expect(finding?.evidence.institutionCatalogue).toBe(
      BANXICO_INSTITUTION_SNAPSHOT.fetchedAt,
    );
    expect(finding?.evidence.institutionName).toBeUndefined();
  });

  it("catches through the history the transposition the check digit cannot", () => {
    const supplier = makeSupplier([account(BANORTE_MTY, { timesPaid: 12 })]);
    const finding = detectClabe(makeInstruction(TRANSPOSED), supplier);

    expect(finding?.evidence.checkDigit).toBe("valid");
    expect(finding?.severity).toBe("critical");
    expect(finding?.evidence.editOperations).toBe(1);
    expect(finding?.evidence.differingPositions).toBe("2,3");
    expect(finding?.explanation).toContain("posiciones 2 y 3");
  });

  it("compares against the closest known account when the supplier has several", () => {
    const supplier = makeSupplier([
      account(BANORTE_MTY, { timesPaid: 2 }),
      account(BANORTE_MTY_OTHER, { timesPaid: 40 }),
    ]);
    const finding = detectClabe(
      makeInstruction(NEAR_BANORTE_MTY_OTHER),
      supplier,
    );

    expect(finding?.evidence.nearestKnownAccount).toBe(BANORTE_MTY_OTHER);
    expect(finding?.evidence.editOperations).toBe(2);
    expect(finding?.evidence.knownAccounts).toBe(2);
    expect(finding?.severity).toBe("critical");
  });

  it("stamps the finding with the instruction's own instant and a stable id", () => {
    const supplier = makeSupplier([account(BANORTE_MTY)]);
    const instruction = makeInstruction(BBVA_MTY);

    const first = detectClabe(instruction, supplier);
    const second = detectClabe(instruction, supplier);

    expect(first?.id).toBe("clabe-instr-001");
    expect(first?.createdAt).toBe("2026-09-11T16:20:00.000Z");
    expect(first?.subject).toEqual({ kind: "instruction", id: "instr-001" });
    expect(second).toEqual(first);
  });

  it("lets the caller own the clock and the id", () => {
    const supplier = makeSupplier([account(BANORTE_MTY)]);
    const finding = detectClabe(makeInstruction(BBVA_MTY), supplier, {
      now: "2026-09-12T03:00:00.000Z",
      findingId: "f-42",
    });

    expect(finding?.id).toBe("f-42");
    expect(finding?.createdAt).toBe("2026-09-12T03:00:00.000Z");
  });

  it("refuses to score an instruction against another supplier's history", () => {
    const other: Supplier = { ...makeSupplier([]), rfc: "SYN020202BBB" };

    expect(() => detectClabe(makeInstruction(BANORTE_MTY), other)).toThrow(
      RangeError,
    );
  });

  it("survives an amount that is not a finite number", () => {
    const finding = detectClabe(
      makeInstruction(BBVA_MTY, { amount: Number.NaN }),
      makeSupplier([account(BANORTE_MTY)]),
    );

    expect(finding?.amountAtRisk).toBe(0);
  });

  it("does not mutate the supplier it was handed", () => {
    const accounts = [account(BANORTE_MTY)];
    const supplier = makeSupplier(accounts);
    const before = JSON.stringify(supplier);

    detectClabe(makeInstruction(BBVA_CDMX), supplier);

    expect(JSON.stringify(supplier)).toBe(before);
    expect(accounts).toHaveLength(1);
  });
});
