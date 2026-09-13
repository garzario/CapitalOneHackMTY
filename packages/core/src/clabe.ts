/**
 * CLABE forensics, control 2 of the six in ADR-0002.
 *
 * A SPEI transfer is irrevocable. Once the payment run fires, an 18-digit number
 * that is one digit away from the supplier's real account is not a support
 * ticket, it is a loss. This module is the arithmetic and the comparison that
 * happen before that button is pressed.
 *
 * Three layers, weakest assumption first:
 *
 * 1. **Arithmetic.** The check digit is a closed calculation over the other 17
 *    digits, so an invalid CLABE is provably invalid with no external data and no
 *    history. That is the only signal in here that accuses the document itself,
 *    and it is the only one that is `comprobable`.
 * 2. **Catalogue.** Digits 1 to 3 are a Banxico participant and digits 4 to 6 are
 *    a plaza. The participant table in `clabe-institutions.ts` is a dated
 *    snapshot, so a code it does not know only ever raises a question. The plaza
 *    table in `plazas.ts` is weaker still and is allowed less: it only ever puts a
 *    name on three digits the history has already disagreed about, and a code it
 *    does not know produces no name and no signal. `snapshot/README.md` says why.
 * 2b. **Geography.** The plaza lives in the account number and the postal code of
 *    `LugarExpedicion` lives in the invoice, so the two can be compared and the
 *    ledger cannot do it on its own: an account whose plaza sits in another state
 *    than the state the supplier invoices from is one sentence worth asking about.
 *    It is raised only for an account with no payment history, because a supplier
 *    that has been paid sixty times on an account in another state has answered
 *    the question already.
 * 3. **History.** Everything else is relational: this account against the
 *    accounts this supplier has actually been paid on. A CLABE two digits away
 *    from an account paid seven times is the interesting case, and it is the one
 *    a plain equality check misses completely.
 *
 * Nothing here accuses a person. States are `comprobable` or
 * `requiere_verificacion`, per ADR-0002, and a human decides.
 *
 * Pure, like the rest of packages/core: no clock, no randomness, no network. The
 * finding is stamped with `instruction.receivedAt` unless the caller passes its
 * own instant, so two runs over the same ledger produce byte-identical findings.
 */

import type { ClabeInstitution } from "./clabe-institutions";
import {
  BANXICO_INSTITUTION_SNAPSHOT,
  lookupInstitution,
} from "./clabe-institutions";
import type {
  Clabe,
  Finding,
  KnownAccount,
  PaymentInstruction,
  Severity,
  Supplier,
} from "./domain";
import {
  lookupPlaza,
  plazaLabel,
  plazaLabels,
  stateOfPostalCode,
} from "./plazas";

export * from "./clabe-institutions";

/** A CLABE is 18 digits: 3 institution, 3 plaza, 11 account, 1 check digit. */
export const CLABE_LENGTH = 18;
/** Digits 1 to 3, the Banxico participant. */
export const CLABE_INSTITUTION_LENGTH = 3;
/** Digits 4 to 6, the plaza the account was opened in. */
export const CLABE_PLAZA_LENGTH = 3;
/** Digits 7 to 17, the account number as the institution assigned it. */
export const CLABE_ACCOUNT_LENGTH = 11;

/**
 * The repeating weight cycle of the check digit, applied to digits 1 to 17.
 *
 * Every weight is coprime to 10, so multiplication by any of them is a bijection
 * modulo 10 and every single-digit substitution is therefore caught.
 *
 * What the scheme never catches is a transposition of two adjacent digits that
 * are five apart, at any position. Swapping neighbours changes the sum by
 * (w1 - w2) * (d2 - d1), and the three neighbour weight differences are -4, 6 and
 * -2, each of which multiplied by 5 is 0 modulo 10. There is a test named after
 * that hole. It is half the reason the edit-distance layer below exists: a
 * transposed CLABE can be arithmetically perfect and still be somebody else's
 * account, and only the supplier's own history shows it.
 */
export const CLABE_CHECK_WEIGHTS = [3, 7, 1] as const;

const CLABE_PATTERN = /^\d{18}$/;
const DIGITS_PATTERN = /^\d+$/;

/** The four ways a string fails to be a CLABE. A stale catalogue is not one. */
export type ClabeProblem =
  | "empty"
  | "wrong_length"
  | "non_digit"
  | "check_digit";

export interface ClabeParts {
  /** Digits 1 to 3. */
  institution: string;
  /** Digits 4 to 6. */
  plaza: string;
  /** Digits 7 to 17. */
  account: string;
  /** Digit 18. */
  checkDigit: string;
}

export interface ClabeValidation {
  valid: boolean;
  /** The input with separators removed, which is the form everything else uses. */
  normalized: string;
  /** Absent when the input is not 18 digits and therefore has no fields. */
  parts?: ClabeParts;
  /** The digit the first 17 demand. Absent when there are not 18 digits. */
  expectedCheckDigit?: number;
  /** The participant, when the dated snapshot knows the code. */
  institution?: ClabeInstitution;
  /** Why it is not a CLABE. Absent when `valid` is true. */
  problem?: ClabeProblem;
}

/**
 * Strips the separators a human types and nothing else.
 *
 * Deliberately not `replace(/\D/g, "")`: dropping every non-digit would turn a
 * CLABE with a letter O in it into a 17-digit string, and a 17-digit string then
 * fails for the wrong reason. Spaces and hyphens are formatting, a letter is a
 * transcription error and has to be reported as one.
 */
export function normalizeClabe(value: string): string {
  return value.replace(/[\s-]/g, "");
}

/**
 * The digit that closes a CLABE, from its first 17 digits.
 *
 * Each digit is multiplied by 3, 7 or 1 in turn, each product is reduced modulo
 * 10, those residues are summed, the sum is reduced modulo 10, and the result is
 * subtracted from 10. The trailing modulo is what turns the 10 that a sum ending
 * in 0 would produce back into 0.
 *
 * Reducing each product before summing is how the rule is written, and it is kept
 * in that shape here so the code reads line for line against it. It changes no
 * answer: (a mod 10) + (b mod 10) is congruent to a + b modulo 10, so summing the
 * raw products gives the same digit. There is a test that asserts exactly that,
 * because "is the per-product modulo load bearing" is a fair question to be asked
 * at the table.
 *
 * @throws RangeError when the input is not exactly 17 digits.
 */
export function clabeCheckDigit(first17: string): number {
  if (first17.length !== CLABE_LENGTH - 1 || !DIGITS_PATTERN.test(first17)) {
    throw new RangeError(`expected 17 digits, got: ${first17}`);
  }
  let sum = 0;
  for (let index = 0; index < first17.length; index += 1) {
    const digit = first17.charCodeAt(index) - 48;
    const weight = CLABE_CHECK_WEIGHTS[index % CLABE_CHECK_WEIGHTS.length];
    sum += (digit * weight) % 10;
  }
  return (10 - (sum % 10)) % 10;
}

/**
 * Full structural validation of a CLABE: length, digits, fields and check digit.
 *
 * Returns the parsed fields even when the check digit fails, because "this is a
 * BBVA account in plaza 580 whose last digit is wrong" is a far more useful thing
 * to put on a screen than "invalid".
 */
export function validateClabe(value: string): ClabeValidation {
  const normalized = normalizeClabe(value);
  if (normalized.length === 0) {
    return { valid: false, normalized, problem: "empty" };
  }
  if (!DIGITS_PATTERN.test(normalized)) {
    return { valid: false, normalized, problem: "non_digit" };
  }
  if (!CLABE_PATTERN.test(normalized)) {
    return { valid: false, normalized, problem: "wrong_length" };
  }

  const parts = parseClabeParts(normalized);
  const expectedCheckDigit = clabeCheckDigit(
    normalized.slice(0, CLABE_LENGTH - 1),
  );
  const institution = lookupInstitution(parts.institution);
  const valid = Number(parts.checkDigit) === expectedCheckDigit;

  const validation: ClabeValidation = {
    valid,
    normalized,
    parts,
    expectedCheckDigit,
  };
  if (institution !== undefined) {
    validation.institution = institution;
  }
  if (!valid) {
    validation.problem = "check_digit";
  }
  return validation;
}

/** True when the value is a structurally valid CLABE. */
export function isValidClabe(value: string): boolean {
  return validateClabe(value).valid;
}

/**
 * Splits 18 digits into the four fields. The caller has already checked the
 * shape, so this is a slice and nothing more.
 *
 * @throws RangeError when the input is not exactly 18 digits.
 */
export function parseClabeParts(clabe: string): ClabeParts {
  if (!CLABE_PATTERN.test(clabe)) {
    throw new RangeError(`expected 18 digits, got: ${clabe}`);
  }
  const plazaEnd = CLABE_INSTITUTION_LENGTH + CLABE_PLAZA_LENGTH;
  return {
    institution: clabe.slice(0, CLABE_INSTITUTION_LENGTH),
    plaza: clabe.slice(CLABE_INSTITUTION_LENGTH, plazaEnd),
    account: clabe.slice(plazaEnd, plazaEnd + CLABE_ACCOUNT_LENGTH),
    checkDigit: clabe.slice(CLABE_LENGTH - 1),
  };
}

/** How many trailing digits of an account survive a mask. */
export const CLABE_VISIBLE_DIGITS = 4;

/** The last four digits, which is how every surface of this product names an account. */
export function clabeLast4(clabe: string): string {
  return clabe.slice(-CLABE_VISIBLE_DIGITS);
}

/**
 * `012580100091764611` becomes `****4611`, anywhere inside a sentence.
 *
 * It is here, in the file that owns every CLABE rule, because three surfaces need
 * the same answer and two of them had already got it wrong by writing their own.
 * `Finding.explanation` is the reason: control 2 writes the Spanish sentence a
 * person reads, and that sentence names the account the supplier has been paid into
 * ("difiere en 2 digitos de la cuenta 012...611, que ya se pago 52 veces"). Every
 * surface that carries a finding therefore carries a full account in prose unless it
 * masks the prose too, and masking the structured evidence next to it is not enough:
 * the assistant was sending eighteen digits to a third party while its own
 * `evidence.clabe` read `****4611`, and the evidence letter printed "cuenta terminada
 * en 4611" three lines above the whole number.
 *
 * Pure, and deliberately a replace over any eighteen-digit run rather than a
 * per-field projection: a detector that writes a new sentence tomorrow gets the mask
 * for free, and the alternative, which is each surface remembering, is the shape of
 * both leaks this function exists to close.
 */
export function maskClabesInText(value: string): string {
  return value.replace(/\d{18}/g, (digits) => `****${clabeLast4(digits)}`);
}

/**
 * True when this text still carries a full account number.
 *
 * The predicate a test asserts with, so a surface added later that forgets the mask
 * fails the suite instead of failing at a judge's table. Asserted per string value
 * and never over a serialised payload: a float such as a false-positive rate of
 * 0.015873015873015872 carries eighteen digits and is not an account.
 */
export function carriesFullClabe(value: string): boolean {
  return /\d{18}/.test(value);
}

/**
 * Digits that are read as one another, as groups.
 *
 * These are the pairs that actually appear in this pipeline: a CLABE photographed
 * off a PDF or a WhatsApp screenshot and passed through OCR, and a CLABE read
 * aloud over the phone and typed back. The groups are not a partition, they are a
 * graph: 6 sits in both {0, 8, 6} and {5, 6}, 8 in both {0, 8, 6} and {3, 8}, and
 * 7 in both {1, 7} and {2, 7}. `OCR_CONFUSABLE_PAIRS` is the symmetric closure.
 *
 * TODO(garzario): these come from the failure modes of digit OCR, not from a
 * measurement on our own intake. When the QR intake page has run for a while,
 * replace them with the confusions it actually produced.
 */
export const OCR_CONFUSION_GROUPS: readonly (readonly string[])[] = [
  ["0", "8", "6"],
  ["1", "7"],
  ["5", "6"],
  ["3", "8"],
  ["2", "7"],
];

/** Unordered confusable pairs as "ab" keys, both directions present. */
export const OCR_CONFUSABLE_PAIRS: ReadonlySet<string> = buildConfusablePairs();

function buildConfusablePairs(): ReadonlySet<string> {
  const pairs = new Set<string>();
  for (const group of OCR_CONFUSION_GROUPS) {
    for (const left of group) {
      for (const right of group) {
        if (left !== right) {
          pairs.add(`${left}${right}`);
        }
      }
    }
  }
  return pairs;
}

/** True when two different digits are plausibly the same digit misread. */
export function isOcrConfusable(left: string, right: string): boolean {
  return OCR_CONFUSABLE_PAIRS.has(`${left}${right}`);
}

export type ClabeEditKind =
  | "substitution"
  | "ocr_substitution"
  | "insertion"
  | "deletion"
  | "transposition";

export interface ClabeEdit {
  kind: ClabeEditKind;
  /**
   * 1-based digit position in the candidate. For a deletion, the position the
   * dropped digit would have occupied. For a transposition, the first of the two.
   */
  position: number;
  /** The digit or digits the known account carries here. Empty for an insertion. */
  known: string;
  /** The digit or digits the candidate carries here. Empty for a deletion. */
  candidate: string;
}

export interface ClabeDistance {
  /**
   * Number of edits, which is the number a person reasons about when they say
   * "two digits off". This is the value thresholds are written against.
   */
  operations: number;
  /** Edits that an OCR confusion explains. A subset of `operations`. */
  ocrSubstitutions: number;
  /** 1-based positions in the candidate that the edits touch, ascending, unique. */
  positions: number[];
  /** The edit script itself, oldest position first. */
  edits: ClabeEdit[];
}

/**
 * Damerau-Levenshtein distance between two digit strings, OCR aware.
 *
 * The variant is optimal string alignment: adjacent transpositions cost one edit,
 * and a substring is never edited twice. That is the standard practical choice
 * and it is stated out loud here because the unrestricted variant gives different
 * answers on pathological inputs and a reviewer is entitled to know which one
 * this is.
 *
 * The cost of a cell is a single integer that encodes the pair
 * (operations, substitutions an OCR confusion does NOT explain), compared
 * lexicographically, as `operations * scale + strictSubstitutions` with `scale`
 * one greater than any reachable substitution count. Minimising it therefore
 * means, in this exact order: the fewest edits, and among the alignments that
 * tie, the one OCR explains best. No tuned weights, no arbitrary discount, and
 * the reported `operations` is an exact count rather than a rounded cost.
 *
 * O(m * n) time and memory, on two 18-digit strings.
 */
export function clabeDistance(known: string, candidate: string): ClabeDistance {
  const rows = known.length;
  const columns = candidate.length;
  // One greater than the largest substitution count any alignment can reach.
  const scale = Math.min(rows, columns) + 1;
  const grid: number[][] = [];

  for (let row = 0; row <= rows; row += 1) {
    grid.push(new Array<number>(columns + 1).fill(0));
  }
  for (let row = 1; row <= rows; row += 1) {
    grid[row][0] = row * scale;
  }
  for (let column = 1; column <= columns; column += 1) {
    grid[0][column] = column * scale;
  }

  for (let row = 1; row <= rows; row += 1) {
    for (let column = 1; column <= columns; column += 1) {
      const diagonal =
        grid[row - 1][column - 1] +
        substitutionCost(known[row - 1], candidate[column - 1], scale);
      let best = Math.min(
        grid[row - 1][column] + scale,
        grid[row][column - 1] + scale,
        diagonal,
      );
      if (isTransposition(known, candidate, row, column)) {
        best = Math.min(best, grid[row - 2][column - 2] + scale);
      }
      grid[row][column] = best;
    }
  }

  return backtrack(grid, known, candidate, scale);
}

function substitutionCost(
  knownDigit: string,
  candidateDigit: string,
  scale: number,
): number {
  if (knownDigit === candidateDigit) {
    return 0;
  }
  // One operation either way; the +1 is the "OCR does not explain this" penalty.
  return isOcrConfusable(knownDigit, candidateDigit) ? scale : scale + 1;
}

function isTransposition(
  known: string,
  candidate: string,
  row: number,
  column: number,
): boolean {
  return (
    row > 1 &&
    column > 1 &&
    known[row - 1] === candidate[column - 2] &&
    known[row - 2] === candidate[column - 1] &&
    known[row - 1] !== known[row - 2]
  );
}

/**
 * Walks the filled grid backwards to recover the edit script, which is what the
 * evidence chips are built from. Branches are tried in a fixed order, so the
 * script for a given pair of CLABEs is the same on every run and in every process.
 */
function backtrack(
  grid: readonly number[][],
  known: string,
  candidate: string,
  scale: number,
): ClabeDistance {
  const edits: ClabeEdit[] = [];
  let row = known.length;
  let column = candidate.length;

  while (row > 0 && column > 0) {
    const knownDigit = known[row - 1];
    const candidateDigit = candidate[column - 1];
    const cost = grid[row][column];

    if (knownDigit === candidateDigit && cost === grid[row - 1][column - 1]) {
      row -= 1;
      column -= 1;
      continue;
    }
    if (
      isTransposition(known, candidate, row, column) &&
      cost === grid[row - 2][column - 2] + scale
    ) {
      edits.push({
        kind: "transposition",
        position: column - 1,
        known: known.slice(row - 2, row),
        candidate: candidate.slice(column - 2, column),
      });
      row -= 2;
      column -= 2;
      continue;
    }
    if (
      cost ===
      grid[row - 1][column - 1] +
        substitutionCost(knownDigit, candidateDigit, scale)
    ) {
      edits.push({
        kind: isOcrConfusable(knownDigit, candidateDigit)
          ? "ocr_substitution"
          : "substitution",
        position: column,
        known: knownDigit,
        candidate: candidateDigit,
      });
      row -= 1;
      column -= 1;
      continue;
    }
    if (cost === grid[row - 1][column] + scale) {
      edits.push({
        kind: "deletion",
        position: column + 1,
        known: knownDigit,
        candidate: "",
      });
      row -= 1;
      continue;
    }
    edits.push({
      kind: "insertion",
      position: column,
      known: "",
      candidate: candidateDigit,
    });
    column -= 1;
  }
  while (row > 0) {
    edits.push({
      kind: "deletion",
      position: 1,
      known: known[row - 1],
      candidate: "",
    });
    row -= 1;
  }
  while (column > 0) {
    edits.push({
      kind: "insertion",
      position: column,
      known: "",
      candidate: candidate[column - 1],
    });
    column -= 1;
  }

  edits.reverse();
  return summarise(edits);
}

function summarise(edits: readonly ClabeEdit[]): ClabeDistance {
  const positions = new Set<number>();
  let ocrSubstitutions = 0;
  for (const edit of edits) {
    positions.add(edit.position);
    if (edit.kind === "transposition") {
      positions.add(edit.position + 1);
    }
    if (edit.kind === "ocr_substitution") {
      ocrSubstitutions += 1;
    }
  }
  return {
    operations: edits.length,
    ocrSubstitutions,
    positions: [...positions].sort((left, right) => left - right),
    edits: [...edits],
  };
}

/**
 * Beyond this many edits an 18-digit number is a different account rather than a
 * mistyped one, and saying otherwise would fire on half the payment run.
 */
export const CLABE_NEAR_MISS_MAX_OPERATIONS = 3;

/**
 * At or below this, the account is close enough to one the company has actually
 * paid that the run stops. Two digits is the documented shape of both an OCR
 * misread and a hand-edited account number.
 */
export const CLABE_CRITICAL_MAX_OPERATIONS = 2;

/**
 * What the evidence says when there is no history to compare a plaza against.
 *
 * Exported because it is a sentence the product promises rather than a detail:
 * issue #203 asks that a brand-new account with no history raise the level for
 * lack of information and that the evidence say so in those words, and a test
 * asserts this exact string reaches the finding.
 */
export const NO_PLAZA_HISTORY =
  "No hay plazas previas de este proveedor con las que comparar esta cuenta, asi que el nivel sube por falta de informacion y no por una senal en contra.";

/** The opening of the evidence line when the plaza did not move. */
const PLAZA_UNCHANGED = "Misma plaza que las cuentas ya pagadas:";

/** Every reason this detector can raise, most severe first. */
export type ClabeSignal =
  | "malformed"
  | "check_digit_invalid"
  | "near_miss"
  | "bank_changed"
  | "plaza_changed"
  | "plaza_off_invoice"
  | "unknown_institution"
  | "first_time_seen"
  | "new_supplier";

const SIGNAL_ORDER: readonly ClabeSignal[] = [
  "malformed",
  "check_digit_invalid",
  "near_miss",
  "bank_changed",
  "plaza_changed",
  "plaza_off_invoice",
  "unknown_institution",
  "first_time_seen",
  "new_supplier",
];

export interface DetectClabeOptions {
  /**
   * Instant stamped on the finding. Defaults to `instruction.receivedAt`, so the
   * detector needs no clock and a replay of the ledger reproduces the finding.
   */
  now?: string;
  /** Finding id. Defaults to `clabe-<instruction id>`, which is idempotent. */
  findingId?: string;
  /**
   * `LugarExpedicion` of the CFDIs this instruction settles: the postal codes the
   * supplier issued those invoices from.
   *
   * Passed in rather than read off the instruction because `packages/core` holds
   * no repository and an instruction carries uuids, not documents.
   * `@hackmty/engine` resolves them. Absent means no geographic comparison, which
   * is the right default: a missing place must never become a finding.
   *
   * Several codes are allowed and they are folded to the states they point at. If
   * they point at more than one state the comparison is skipped, because a
   * supplier that invoices from two states has not contradicted anything.
   */
  invoicePostalCodes?: readonly string[];
}

/** The known account a candidate is closest to, with the distance to it. */
export interface NearestKnownAccount {
  account: KnownAccount;
  distance: ClabeDistance;
}

/**
 * The CLABE forensics detector.
 *
 * Returns `null` when the instruction pays a structurally valid CLABE that the
 * supplier has already been paid on, which is the overwhelming majority of a real
 * payment run and the case a demo has to get right first.
 *
 * Pass `supplier` as `undefined` when the RFC has never been seen. That is the
 * brand-new-supplier case and it is a warning, not silence: the company is about
 * to send money to an account with no history behind it.
 *
 * @throws RangeError when `supplier.rfc` is not the RFC the instruction names,
 *   because scoring an instruction against somebody else's account history is a
 *   wiring mistake, not dirty data, and silently mis-scoring it is worse than
 *   failing.
 */
export function detectClabe(
  instruction: PaymentInstruction,
  supplier?: Supplier,
  options: DetectClabeOptions = {},
): Finding | null {
  if (supplier !== undefined && supplier.rfc !== instruction.supplierRfc) {
    throw new RangeError(
      `supplier ${supplier.rfc} does not match instruction ${instruction.supplierRfc}`,
    );
  }

  const validation = validateClabe(instruction.clabe);
  const knownAccounts = supplier?.knownAccounts ?? [];
  const signals = new Set<ClabeSignal>();
  const evidence: Finding["evidence"] = { clabe: validation.normalized };

  // Recorded on every finding, malformed included: "the scan produced this" is
  // exactly the context a clerk needs before deciding whether to retype it.
  evidence.ocrChannel =
    instruction.imageRef !== undefined ||
    typeof instruction.ocrConfidence === "number" ||
    instruction.source === "pdf";
  if (typeof instruction.ocrConfidence === "number") {
    evidence.ocrConfidence = instruction.ocrConfidence;
  }

  if (validation.parts === undefined) {
    signals.add("malformed");
    evidence.problem = validation.problem ?? "wrong_length";
    evidence.digits = validation.normalized.length;
    return buildFinding(instruction, supplier, signals, evidence, {
      validation,
      options,
    });
  }

  const { parts } = validation;
  evidence.institutionCode = parts.institution;
  evidence.plazaCode = parts.plaza;
  evidence.checkDigit = validation.valid ? "valid" : "invalid";
  if (validation.institution !== undefined) {
    evidence.institutionName = validation.institution.name;
  } else {
    signals.add("unknown_institution");
    evidence.institutionCatalogue = BANXICO_INSTITUTION_SNAPSHOT.fetchedAt;
  }
  if (!validation.valid) {
    signals.add("check_digit_invalid");
    evidence.expectedCheckDigit = validation.expectedCheckDigit ?? -1;
  }

  const invoiceState = singleInvoiceState(options.invoicePostalCodes);

  if (knownAccounts.length === 0) {
    signals.add("new_supplier");
    evidence.knownAccounts = 0;
    /* The plaza control has nothing to compare against here, and saying so is the
       point: the level rises because we are missing information, not because a
       rule fired. `confidenceOf` answers `precaucion` on this finding under the
       rule `new_account_without_history`, and this sentence is the reason a clerk
       reads next to it. */
    evidence.plazaComparison = NO_PLAZA_HISTORY;
    describePlaza(evidence, parts.plaza);
    compareWithInvoice(signals, evidence, parts.plaza, invoiceState);
    return buildFinding(instruction, supplier, signals, evidence, {
      validation,
      options,
    });
  }

  evidence.knownAccounts = knownAccounts.length;
  const exactMatch = knownAccounts.find(
    (account) => normalizeClabe(account.clabe) === validation.normalized,
  );
  if (exactMatch !== undefined) {
    evidence.timesPaid = exactMatch.timesPaid;
    evidence.establishedBy = exactMatch.establishedBy;
    return buildFinding(instruction, supplier, signals, evidence, {
      validation,
      options,
    });
  }

  signals.add("first_time_seen");

  const nearest = findNearestKnownAccount(validation.normalized, knownAccounts);
  if (
    nearest !== undefined &&
    nearest.distance.operations <= CLABE_NEAR_MISS_MAX_OPERATIONS
  ) {
    signals.add("near_miss");
    evidence.nearestKnownAccount = nearest.account.clabe;
    evidence.nearestTimesPaid = nearest.account.timesPaid;
    evidence.editOperations = nearest.distance.operations;
    evidence.ocrSubstitutions = nearest.distance.ocrSubstitutions;
    // Positions are joined because Finding.evidence holds no arrays; the chip
    // renderer splits on the comma. They are 1-based, the way a clerk counts.
    evidence.differingPositions = nearest.distance.positions.join(",");
  }

  const knownInstitutions = uniqueSorted(
    knownAccounts.map((account) => institutionOf(account.clabe)),
  );
  if (!knownInstitutions.includes(parts.institution)) {
    signals.add("bank_changed");
    evidence.previousInstitutionCodes = knownInstitutions.join(",");
    evidence.previousInstitutionNames = knownInstitutions
      .map((code) => lookupInstitution(code)?.name ?? code)
      .join(",");
  } else {
    // Only meaningful inside one institution. When the bank changed the plaza
    // changed with it, and reporting both is noise on the same fact.
    const knownPlazas = uniqueSorted(
      knownAccounts
        .filter((account) => institutionOf(account.clabe) === parts.institution)
        .map((account) => plazaOf(account.clabe)),
    );
    if (knownPlazas.includes(parts.plaza)) {
      /* Same plaza as the accounts we have paid. Recorded rather than inferred
         from the absence of the signal, because "the geography did not move" is
         the sentence that makes a changed account read as a typo. */
      evidence.plazaComparison = `${PLAZA_UNCHANGED} ${plazaLabel(parts.plaza)}.`;
    } else {
      signals.add("plaza_changed");
      evidence.previousPlazaCodes = knownPlazas.join(",");
      evidence.previousPlazaPlaces = plazaLabels(knownPlazas);
    }
  }

  describePlaza(evidence, parts.plaza);
  compareWithInvoice(signals, evidence, parts.plaza, invoiceState);

  return buildFinding(instruction, supplier, signals, evidence, {
    validation,
    options,
  });
}

/**
 * The known account a candidate CLABE is closest to.
 *
 * Ties break on the account that has been paid most, then the most recently
 * established, then the CLABE itself, so the answer never depends on the order
 * the caller happened to load the accounts in.
 */
export function findNearestKnownAccount(
  candidate: Clabe,
  knownAccounts: readonly KnownAccount[],
): NearestKnownAccount | undefined {
  let best: NearestKnownAccount | undefined;
  for (const account of knownAccounts) {
    const distance = clabeDistance(normalizeClabe(account.clabe), candidate);
    if (best === undefined || isCloser(account, distance, best)) {
      best = { account, distance };
    }
  }
  return best;
}

function isCloser(
  account: KnownAccount,
  distance: ClabeDistance,
  best: NearestKnownAccount,
): boolean {
  if (distance.operations !== best.distance.operations) {
    return distance.operations < best.distance.operations;
  }
  if (distance.ocrSubstitutions !== best.distance.ocrSubstitutions) {
    return distance.ocrSubstitutions > best.distance.ocrSubstitutions;
  }
  if (account.timesPaid !== best.account.timesPaid) {
    return account.timesPaid > best.account.timesPaid;
  }
  if (account.establishedAt !== best.account.establishedAt) {
    return account.establishedAt > best.account.establishedAt;
  }
  return account.clabe < best.account.clabe;
}

function buildFinding(
  instruction: PaymentInstruction,
  supplier: Supplier | undefined,
  signals: ReadonlySet<ClabeSignal>,
  evidence: Finding["evidence"],
  context: { validation: ClabeValidation; options: DetectClabeOptions },
): Finding | null {
  if (signals.size === 0) {
    return null;
  }
  const ordered = SIGNAL_ORDER.filter((signal) => signals.has(signal));
  const { options } = context;
  return {
    id: options.findingId ?? `clabe-${instruction.id}`,
    detector: "clabe_forensics",
    severity: severityOf(ordered, evidence),
    state: ordered.some(
      (signal) => signal === "malformed" || signal === "check_digit_invalid",
    )
      ? "comprobable"
      : "requiere_verificacion",
    subject: { kind: "instruction", id: instruction.id },
    amountAtRisk: Number.isFinite(instruction.amount) ? instruction.amount : 0,
    explanation: explain(ordered, evidence, context.validation, supplier),
    evidence: { ...evidence, signals: ordered.join(",") },
    createdAt: options.now ?? instruction.receivedAt,
  };
}

function severityOf(
  signals: readonly ClabeSignal[],
  evidence: Finding["evidence"],
): Severity {
  if (
    signals.includes("malformed") ||
    signals.includes("check_digit_invalid")
  ) {
    return "critical";
  }
  const operations = evidence.editOperations;
  if (
    signals.includes("near_miss") &&
    typeof operations === "number" &&
    operations <= CLABE_CRITICAL_MAX_OPERATIONS
  ) {
    return "critical";
  }
  return "warning";
}

/**
 * Plain Spanish for the clerk, one sentence per signal, most severe first.
 *
 * The wording states what the documents say and never what somebody did. ADR-0002
 * is explicit that the product does not accuse.
 */
function explain(
  signals: readonly ClabeSignal[],
  evidence: Finding["evidence"],
  validation: ClabeValidation,
  supplier: Supplier | undefined,
): string {
  const sentences: string[] = [];
  for (const signal of signals) {
    switch (signal) {
      case "malformed":
        sentences.push(explainMalformed(validation));
        break;
      case "check_digit_invalid":
        sentences.push(
          `El dígito verificador no cuadra: la CLABE termina en ${validation.parts?.checkDigit ?? "?"} y el cálculo 3-7-1 de Banxico exige ${validation.expectedCheckDigit ?? "?"}, así que esa cuenta no puede existir.`,
        );
        break;
      case "near_miss":
        sentences.push(explainNearMiss(evidence));
        break;
      case "bank_changed":
        sentences.push(
          `Cambió el banco: las cuentas conocidas de este proveedor están en ${String(evidence.previousInstitutionNames)} y esta está en ${String(evidence.institutionName ?? evidence.institutionCode)}.`,
        );
        break;
      case "plaza_changed":
        sentences.push(explainPlazaChanged(evidence));
        break;
      case "plaza_off_invoice":
        sentences.push(
          explainPlazaOffInvoice(evidence, signals.includes("plaza_changed")),
        );
        break;
      case "unknown_institution":
        sentences.push(
          `El código de institución ${String(evidence.institutionCode)} no aparece en el catálogo de Banxico del ${BANXICO_INSTITUTION_SNAPSHOT.fetchedAt}, hay que confirmarlo antes de pagar.`,
        );
        break;
      case "first_time_seen":
        sentences.push(explainFirstTimeSeen(supplier));
        break;
      case "new_supplier":
        sentences.push(
          `Proveedor sin cuentas previas: no hay historial contra el cual comparar esta CLABE. ${NO_PLAZA_HISTORY}`,
        );
        break;
    }
  }
  return sentences.join(" ");
}

function explainMalformed(validation: ClabeValidation): string {
  switch (validation.problem) {
    case "empty":
      return "La instrucción llegó sin CLABE.";
    case "non_digit":
      return "La CLABE trae caracteres que no son dígitos, así que no se puede verificar ni pagar.";
    default:
      return `La CLABE tiene ${validation.normalized.length} dígitos y una CLABE tiene ${CLABE_LENGTH}, así que no corresponde a ninguna cuenta.`;
  }
}

function explainNearMiss(evidence: Finding["evidence"]): string {
  const operations = Number(evidence.editOperations ?? 0);
  const positions = String(evidence.differingPositions ?? "").split(",");
  const timesPaid = Number(evidence.nearestTimesPaid ?? 0);
  const label = positions.length === 1 ? "posición" : "posiciones";
  const digits = operations === 1 ? "dígito" : "dígitos";
  const payments = timesPaid === 1 ? "vez" : "veces";
  const ocr = Number(evidence.ocrSubstitutions ?? 0);
  const ocrNote =
    ocr > 0
      ? ` ${ocr === 1 ? "Ese cambio es" : `${ocr} de esos cambios son`} entre dígitos que se confunden al leer (0/8/6, 1/7, 5/6, 3/8, 2/7).`
      : "";
  return `Difiere en ${operations} ${digits} (${label} ${joinSpanish(positions)}) de la cuenta ${String(evidence.nearestKnownAccount)}, que ya se pagó ${timesPaid} ${payments}.${ocrNote}`;
}

/**
 * Both places, named, which is the whole point of the plaza control.
 *
 * The three digits are printed beside each name so a reader can check the name
 * against `snapshot/plazas-2026-09-13.csv` without trusting the table, and a code
 * the snapshot does not carry degrades to the bare digits rather than to silence:
 * "la plaza 999" still says the geography moved.
 */
function explainPlazaChanged(evidence: Finding["evidence"]): string {
  const codes = String(evidence.previousPlazaCodes ?? "").split(",");
  const previous =
    evidence.previousPlazaPlaces === undefined
      ? plazaLabels(codes)
      : String(evidence.previousPlazaPlaces);
  const mine = plazaLabel(String(evidence.plazaCode ?? ""));
  const known =
    codes.length === 1
      ? "la cuenta conocida está"
      : "las cuentas conocidas están";
  return `Cambió la plaza dentro del mismo banco: ${known} en la plaza ${previous} y esta en la plaza ${mine}.`;
}

/**
 * The account's plaza against the state the invoice was issued from.
 *
 * Never says somebody moved money: it says the two documents point at two states,
 * which is a question for the supplier and is exactly how ADR-0002 requires this
 * product to speak.
 *
 * `plazaNamed` is true when the sentence before this one already said where this
 * account's plaza is, which is the common case because a plaza that contradicts the
 * invoice usually also contradicts the history. Naming it twice in four sentences
 * reads like a template rather than like a person, so it is named once.
 */
function explainPlazaOffInvoice(
  evidence: Finding["evidence"],
  plazaNamed: boolean,
): string {
  const where = plazaNamed
    ? "Esa plaza"
    : `La plaza de esta cuenta, ${plazaLabel(String(evidence.plazaCode ?? ""))},`;
  return `${where} no coincide con el lugar de expedición de la factura: el código postal ${String(evidence.invoicePostalCode)} queda en ${String(evidence.invoiceState)}, así que la cuenta y la factura apuntan a estados distintos.`;
}

function explainFirstTimeSeen(supplier: Supplier | undefined): string {
  const count = supplier?.knownAccounts.length ?? 0;
  const accounts =
    count === 1 ? "1 cuenta registrada" : `${count} cuentas registradas`;
  return `Es la primera vez que se ve esta cuenta para este proveedor, que ya tiene ${accounts}.`;
}

/** "12", "12 y 15", "12, 15 y 17". */
function joinSpanish(values: readonly string[]): string {
  if (values.length <= 1) {
    return values[0] ?? "";
  }
  return `${values.slice(0, -1).join(", ")} y ${values[values.length - 1]}`;
}

function institutionOf(clabe: Clabe): string {
  return normalizeClabe(clabe).slice(0, CLABE_INSTITUTION_LENGTH);
}

/**
 * The one state a set of `LugarExpedicion` postal codes points at, or nothing.
 *
 * Nothing is the answer in three cases and all three are deliberate: no codes
 * were passed, none of them resolves (`stateOfPostalCode` covers the states the
 * synthetic dataset uses and no more), or they resolve to more than one state. A
 * supplier that invoices from two states has contradicted nothing, so the
 * comparison is skipped rather than guessed.
 */
function singleInvoiceState(
  postalCodes: readonly string[] | undefined,
): { postalCode: string; state: string } | undefined {
  if (postalCodes === undefined) {
    return undefined;
  }
  let found: { postalCode: string; state: string } | undefined;
  for (const postalCode of postalCodes) {
    const state = stateOfPostalCode(postalCode);
    if (state === undefined) {
      continue;
    }
    if (found === undefined) {
      found = { postalCode, state };
      continue;
    }
    if (found.state !== state) {
      return undefined;
    }
  }
  return found;
}

/** Puts the plaza's place on the evidence, when the snapshot knows the code. */
function describePlaza(evidence: Finding["evidence"], code: string): void {
  const plaza = lookupPlaza(code);
  if (plaza === undefined) {
    return;
  }
  evidence.plazaCity = plaza.city;
  evidence.plazaState = plaza.state;
}

/**
 * Raises `plaza_off_invoice` when the account's plaza and the invoice's postal
 * code sit in different states.
 *
 * Only ever reached for an account this supplier has no payment history on, so a
 * supplier legitimately banking in another state is asked once and never again.
 * A plaza the snapshot does not know raises nothing: the comparison needs both
 * sides, and the side that can go stale is not allowed to accuse on its own.
 */
function compareWithInvoice(
  signals: Set<ClabeSignal>,
  evidence: Finding["evidence"],
  code: string,
  invoice: { postalCode: string; state: string } | undefined,
): void {
  if (invoice === undefined) {
    return;
  }
  evidence.invoicePostalCode = invoice.postalCode;
  evidence.invoiceState = invoice.state;
  const plaza = lookupPlaza(code);
  if (plaza === undefined || plaza.state === invoice.state) {
    return;
  }
  signals.add("plaza_off_invoice");
}

function plazaOf(clabe: Clabe): string {
  return normalizeClabe(clabe).slice(
    CLABE_INSTITUTION_LENGTH,
    CLABE_INSTITUTION_LENGTH + CLABE_PLAZA_LENGTH,
  );
}

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}
