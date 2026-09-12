/**
 * CLABE arithmetic, for the generator only.
 *
 * Eighteen digits: three for the bank, three for the plaza, eleven for the account,
 * one check digit. The check digit is the 3-7-1 weighted sum, each product reduced
 * mod 10, the total reduced mod 10, subtracted from 10 and reduced mod 10 again.
 *
 * Why this lives in @hackmty/seed and not in @hackmty/core: the generator has to be
 * able to mint a syntactically valid account, and a fraudulent instruction two digits
 * off a real one, before any detector exists. The `clabe_forensics` detector owns
 * verification, not this file, and it owns the parts that are actual judgement:
 * bank and plaza consistency, edit distance against the supplier's history, and what
 * to do when the number came out of an OCR pass.
 *
 * TODO(garzario): when `clabe_forensics` lands in @hackmty/core, move the check digit
 * there and have this file import it. Two copies of the same arithmetic in one repo is
 * one copy too many, and the one a judge reads should be the one in the engine.
 */

import type { Rng } from "../rng";

/** Repeating 3-7-1, applied to the first seventeen digits. */
const WEIGHTS = [3, 7, 1] as const;

const CLABE_LENGTH = 18;
const CLABE_BODY_LENGTH = 17;
const BANK_CODE_LENGTH = 3;
const PLAZA_CODE_LENGTH = 3;
const ACCOUNT_LENGTH = 11;

export function isDigits(value: string): boolean {
  return /^[0-9]+$/.test(value);
}

/** The check digit for a seventeen-digit body. Throws on anything else. */
export function clabeCheckDigit(body: string): number {
  if (body.length !== CLABE_BODY_LENGTH || !isDigits(body)) {
    throw new RangeError(
      `a clabe body is ${CLABE_BODY_LENGTH} digits, got ${JSON.stringify(body)}`,
    );
  }
  let sum = 0;
  for (let index = 0; index < CLABE_BODY_LENGTH; index += 1) {
    const digit = Number(body[index]);
    const weight = WEIGHTS[index % WEIGHTS.length] as number;
    sum += (digit * weight) % 10;
  }
  return (10 - (sum % 10)) % 10;
}

/** Shape only: eighteen digits. Says nothing about the check digit. */
export function isClabeShaped(value: string): boolean {
  return value.length === CLABE_LENGTH && isDigits(value);
}

/**
 * Shape plus check digit. The generator asserts this over its own output; the
 * detector is the one that has to decide what a failure means to a clerk.
 */
export function isClabeValid(value: string): boolean {
  return (
    isClabeShaped(value) &&
    clabeCheckDigit(value.slice(0, CLABE_BODY_LENGTH)) ===
      Number(value[CLABE_BODY_LENGTH])
  );
}

/** Builds a valid CLABE from its parts, appending the check digit. */
export function mintClabe(
  bankCode: string,
  plazaCode: string,
  account: string,
): string {
  if (bankCode.length !== BANK_CODE_LENGTH || !isDigits(bankCode)) {
    throw new RangeError(`bank code is 3 digits, got ${bankCode}`);
  }
  if (plazaCode.length !== PLAZA_CODE_LENGTH || !isDigits(plazaCode)) {
    throw new RangeError(`plaza code is 3 digits, got ${plazaCode}`);
  }
  if (account.length !== ACCOUNT_LENGTH || !isDigits(account)) {
    throw new RangeError(`account is 11 digits, got ${account}`);
  }
  const body = `${bankCode}${plazaCode}${account}`;
  return `${body}${clabeCheckDigit(body)}`;
}

export function bankCodeOf(clabe: string): string {
  return clabe.slice(0, BANK_CODE_LENGTH);
}

export function plazaCodeOf(clabe: string): string {
  return clabe.slice(BANK_CODE_LENGTH, BANK_CODE_LENGTH + PLAZA_CODE_LENGTH);
}

/**
 * The subset of the bank catalogue the generator draws from. Codes are the public
 * three-digit institution codes used in a CLABE; the full catalogue is Banxico's and
 * this is not a copy of it.
 */
export const MX_BANKS: readonly { code: string; name: string }[] = [
  { code: "002", name: "Banamex" },
  { code: "012", name: "BBVA Mexico" },
  { code: "014", name: "Santander" },
  { code: "021", name: "HSBC" },
  { code: "044", name: "Scotiabank" },
  { code: "058", name: "Banregio" },
  { code: "072", name: "Banorte" },
  { code: "127", name: "Banco Azteca" },
];

/**
 * The plaza code the generator stamps on a Monterrey metropolitan account. It is the
 * code in the example CLABE in docs/09-api.md.
 *
 * TODO(Apanawa): confirm this against the Banxico plaza catalogue before the
 * `clabe_forensics` detector starts treating a plaza mismatch as evidence. A detector
 * that flags a legitimate account because our plaza table is wrong is worse than no
 * plaza check at all.
 */
export const MTY_PLAZA_CODE = "180";

export function bankNameOf(clabe: string): string | undefined {
  const code = bankCodeOf(clabe);
  return MX_BANKS.find((bank) => bank.code === code)?.name;
}

/**
 * The RFC of the bank that holds an account, as a complement's `RfcEmisorCtaBen`
 * would carry it.
 *
 * It is invented, and it has to be: a real bank's RFC printed next to fabricated
 * payment evidence is exactly what ADR-0002 forbids. The shape is the same
 * `SYN` plus six digits plus a homoclave every other identifier in this package
 * uses, and the digits carry the institution code so the row stays greppable.
 */
export function syntheticBankRfc(bankCode: string): string {
  if (bankCode.length !== BANK_CODE_LENGTH || !isDigits(bankCode)) {
    throw new RangeError(`bank code is 3 digits, got ${bankCode}`);
  }
  return `SYN${bankCode}001BCO`;
}

/** The account body, the eleven digits between the plaza code and the check digit. */
export function accountOf(clabe: string): string {
  return clabe.slice(BANK_CODE_LENGTH + PLAZA_CODE_LENGTH, CLABE_BODY_LENGTH);
}

/**
 * A CLABE that differs from `known` in exactly two digits and still passes the
 * check digit.
 *
 * This is the shape of the attack the product exists for, and the shape matters: an
 * account that fails the arithmetic is a typo, and a typo is not what takes 180,000
 * pesos out of the country. Both changed digits sit inside the account body, so the
 * bank and the plaza still agree with the supplier's history and the only thing left
 * to notice is the distance, which is what `clabeDistance` in @hackmty/core measures.
 *
 * The search is exhaustive and ordered, so it is deterministic: it walks the account
 * positions from an offset the RNG chose and returns the first pair of digit
 * substitutions that leaves the check digit alone. Such a pair always exists,
 * because the repeating 3-7-1 weights give every position a partner to cancel
 * against.
 */
export function mintNearMissClabe(known: string, rng: Rng): string {
  if (!isClabeValid(known)) {
    throw new RangeError(`not a valid clabe to derive from: ${known}`);
  }
  const digits = [...known];
  const first = BANK_CODE_LENGTH + PLAZA_CODE_LENGTH;
  const span = CLABE_BODY_LENGTH - first;
  const start = rng.int(0, span - 1);

  for (let leftStep = 0; leftStep < span; leftStep += 1) {
    const left = first + ((start + leftStep) % span);
    for (let rightStep = 1; rightStep < span; rightStep += 1) {
      const right = first + ((left - first + rightStep) % span);
      for (let leftDelta = 1; leftDelta < 10; leftDelta += 1) {
        for (let rightDelta = 1; rightDelta < 10; rightDelta += 1) {
          const candidate = [...digits];
          candidate[left] = String((Number(digits[left]) + leftDelta) % 10);
          candidate[right] = String((Number(digits[right]) + rightDelta) % 10);
          const minted = candidate.join("");
          if (minted !== known && isClabeValid(minted)) {
            return minted;
          }
        }
      }
    }
  }
  throw new Error(`no two-digit near miss exists for ${known}`);
}

function randomAccount(rng: Rng): string {
  let account = "";
  for (let index = 0; index < ACCOUNT_LENGTH; index += 1) {
    account += String(rng.int(0, 9));
  }
  return account;
}

/** A fresh valid account at `bankCode`, for a supplier that really did change bank. */
export function mintRandomClabe(bankCode: string, rng: Rng): string {
  return mintClabe(bankCode, MTY_PLAZA_CODE, randomAccount(rng));
}

/**
 * A CLABE whose check digit is wrong on purpose, at an account nobody has ever been
 * paid on. The bank and the plaza are kept, so the only thing wrong with it is the
 * arithmetic: the case a clerk reading eighteen digits off a photographed PDF cannot
 * see and a mod-10 sum catches in microseconds.
 */
export function mintBrokenClabe(bankCode: string, rng: Rng): string {
  const valid = mintRandomClabe(bankCode, rng);
  const wrong = (Number(valid[CLABE_BODY_LENGTH]) + rng.int(1, 9)) % 10;
  return `${valid.slice(0, CLABE_BODY_LENGTH)}${wrong}`;
}
