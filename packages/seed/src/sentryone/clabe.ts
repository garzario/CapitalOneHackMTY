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
 * The plaza code the generator stamps on a Monterrey metropolitan account.
 *
 * It used to be `180`, with a TODO asking somebody to check it against the plaza
 * catalogue before the detector treated a plaza mismatch as evidence. Somebody
 * did, in issue #203, and `180` is `DISTRITO FEDERAL`. The Monterrey metropolitan
 * plaza is `580`: the catalogue committed at
 * `packages/core/src/snapshot/plazas-2026-09-13.csv` has 22 Nuevo Leon rows, `580`
 * plus an alphabetical run from `581` to `601` that contains no municipality of the
 * metropolitan area, so the metro is one plaza and `580` is it.
 *
 * The TODO was right about the cost of being wrong, which is why the whole seeded
 * dataset moved rather than the detector being pointed at the old value: a clerk
 * reading "DISTRITO FEDERAL" beside a Monterrey foundry would be reading a wrong
 * place next to a real account number, and `detectClabe` would have been comparing
 * every supplier's accounts against a plaza none of them is in.
 */
export const MTY_METRO_PLAZA_CODE = "580";

/**
 * Plaza per municipality, for the nine the supplier catalogue invoices from.
 *
 * Eight of them are inside the Monterrey metropolitan plaza and Pesqueria is not:
 * the catalogue gives it `598` of its own. That is a detail worth keeping rather
 * than flattening, because a dataset where every account sits in one plaza cannot
 * show a plaza comparison working and cannot show it staying quiet.
 */
export const PLAZA_BY_CITY: Readonly<Record<string, string>> = {
  Apodaca: MTY_METRO_PLAZA_CODE,
  Escobedo: MTY_METRO_PLAZA_CODE,
  Garcia: MTY_METRO_PLAZA_CODE,
  Guadalupe: MTY_METRO_PLAZA_CODE,
  Juarez: MTY_METRO_PLAZA_CODE,
  Monterrey: MTY_METRO_PLAZA_CODE,
  "San Nicolas de los Garza": MTY_METRO_PLAZA_CODE,
  "Santa Catarina": MTY_METRO_PLAZA_CODE,
  Pesqueria: "598",
};

/**
 * The plaza a supplier in this city banks in, falling back to the metropolitan
 * plaza for a city nobody has mapped yet.
 *
 * The fallback is the conservative direction: a new city mapped to the metro plaza
 * makes its accounts agree with the rest of the dataset and raises nothing, where a
 * throw would stop the generator and a random plaza would invent a finding.
 */
export function plazaOfCity(city: string): string {
  return Object.hasOwn(PLAZA_BY_CITY, city)
    ? (PLAZA_BY_CITY[city] as string)
    : MTY_METRO_PLAZA_CODE;
}

/**
 * The plaza of `DISTRITO FEDERAL`, which is where the seeded impostor account sits.
 *
 * One digit away from `580`, which is what makes the demo line work: the fraudulent
 * CLABE is two digits from the account the supplier has always been paid on, it
 * still closes its own check digit, and one of those two digits moves the money from
 * Nuevo Leon to Mexico City.
 */
export const CDMX_PLAZA_CODE = "180";

/**
 * `LugarExpedicion` on every CFDI this generator writes: the postal code the
 * invoice was issued from.
 *
 * One value for the whole dataset, and it is the same 64000 the CFDI fixtures in
 * `@hackmty/core` carry. The company and all 44 suppliers are in the Monterrey
 * metropolitan area, so every invoice is issued in Nuevo Leon, and the only thing
 * control 2 reads off this is the state: `stateOfPostalCode` answers `NL`. Per
 * municipality postal codes would be a row of real-world claims the dataset does
 * not need, and this dataset is watermarked synthetic end to end.
 */
export const ISSUE_POSTAL_CODE = "64000";

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
export function mintNearMissClabe(
  known: string,
  rng: Rng,
  options: NearMissOptions = {},
): string {
  if (!isClabeValid(known)) {
    throw new RangeError(`not a valid clabe to derive from: ${known}`);
  }
  if (options.plazaCode !== undefined) {
    return mintPlazaMoveClabe(known, options.plazaCode, rng);
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

export interface NearMissOptions {
  /**
   * Move the account to this plaza, keeping the total distance at two digits.
   *
   * The plaza has to differ from the plaza of `known` in exactly one digit, which
   * is what leaves room for exactly one compensating digit in the account body.
   * `580` to `180` is such a pair and it is the one the demo uses.
   */
  plazaCode?: string;
}

/**
 * A CLABE two digits from `known` whose plaza is `plazaCode`, still valid.
 *
 * This is the second shape of the same attack and the more interesting one. The
 * fraudulent account is two digits from the one the supplier has always been paid
 * on, so a clerk comparing eighteen digits by eye will not see it, and the check
 * digit closes so the transfer will not bounce. The difference is where the two
 * digits are: one of them is in the plaza, so the money leaves for another state,
 * which is the thing a person can ask the supplier about in one sentence.
 *
 * The search is exhaustive and ordered from an offset the RNG chose, so it is
 * deterministic. A compensating digit always exists: every weight in the 3-7-1
 * cycle is coprime to 10, so for a fixed position the ten possible digits produce
 * ten distinct contributions modulo 10, one of which cancels the plaza edit.
 *
 * @throws RangeError when the plaza is not three digits, when it is the plaza
 *   `known` already has, or when it differs in more than one digit. All three are
 *   wiring mistakes rather than data, and silently minting an account three digits
 *   away would quietly change what the `near_miss` layer is being tested on.
 */
export function mintPlazaMoveClabe(
  known: string,
  plazaCode: string,
  rng: Rng,
): string {
  if (!isClabeValid(known)) {
    throw new RangeError(`not a valid clabe to derive from: ${known}`);
  }
  if (plazaCode.length !== PLAZA_CODE_LENGTH || !isDigits(plazaCode)) {
    throw new RangeError(`plaza code is 3 digits, got ${plazaCode}`);
  }
  const current = plazaCodeOf(known);
  const moved = [...plazaCode].filter(
    (digit, index) => digit !== current[index],
  ).length;
  if (moved !== 1) {
    throw new RangeError(
      `plaza ${current} to ${plazaCode} moves ${moved} digits and a two-digit near miss needs exactly 1`,
    );
  }

  const first = BANK_CODE_LENGTH + PLAZA_CODE_LENGTH;
  const body = [
    ...known.slice(0, BANK_CODE_LENGTH),
    ...plazaCode,
    ...known.slice(first, CLABE_BODY_LENGTH),
  ];
  const span = CLABE_BODY_LENGTH - first;
  const start = rng.int(0, span - 1);
  const target = Number(known[CLABE_BODY_LENGTH]);

  for (let step = 0; step < span; step += 1) {
    const at = first + ((start + step) % span);
    for (let delta = 1; delta < 10; delta += 1) {
      const candidate = [...body];
      candidate[at] = String((Number(body[at]) + delta) % 10);
      const minted = candidate.join("");
      if (clabeCheckDigit(minted) === target) {
        return `${minted}${target}`;
      }
    }
  }
  throw new Error(
    `no two-digit plaza move exists for ${known} to ${plazaCode}`,
  );
}

function randomAccount(rng: Rng): string {
  let account = "";
  for (let index = 0; index < ACCOUNT_LENGTH; index += 1) {
    account += String(rng.int(0, 9));
  }
  return account;
}

/**
 * A fresh valid account at `bankCode`, for a supplier that really did change bank.
 *
 * The plaza defaults to the Monterrey metropolitan one, so a minted account agrees
 * with the geography of the dataset unless a caller deliberately moves it.
 */
export function mintRandomClabe(
  bankCode: string,
  rng: Rng,
  plazaCode: string = MTY_METRO_PLAZA_CODE,
): string {
  return mintClabe(bankCode, plazaCode, randomAccount(rng));
}

/**
 * A CLABE whose check digit is wrong on purpose, at an account nobody has ever been
 * paid on. The bank and the plaza are kept, so the only thing wrong with it is the
 * arithmetic: the case a clerk reading eighteen digits off a photographed PDF cannot
 * see and a mod-10 sum catches in microseconds.
 */
export function mintBrokenClabe(
  bankCode: string,
  rng: Rng,
  plazaCode: string = MTY_METRO_PLAZA_CODE,
): string {
  const valid = mintRandomClabe(bankCode, rng, plazaCode);
  const wrong = (Number(valid[CLABE_BODY_LENGTH]) + rng.int(1, 9)) % 10;
  return `${valid.slice(0, CLABE_BODY_LENGTH)}${wrong}`;
}
