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
