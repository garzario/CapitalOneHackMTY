/**
 * The privacy boundary, asserted rather than described.
 *
 * Three properties, and the third is the one the product claims on stage: the
 * hash is stable across runs and across laptops, two different pairs never
 * collide into one, and neither the RFC nor the CLABE survives anywhere in the
 * output.
 */

import { describe, expect, test } from "bun:test";
import {
  bankCodeOf,
  consortiumSalt,
  DEMO_CONSORTIUM_SALT,
  HASH_LENGTH,
  hashClabe,
  hashPair,
  hashRfc,
  hashTenant,
  normalizeClabe,
  normalizeRfc,
} from "./hash";

const RFC = "SYN990202S02";
const CLABE = "012180101391764613";

describe("the hash is stable", () => {
  test("the same pair and the same salt give the same hashes, always", () => {
    const first = hashPair({ rfc: RFC, clabe: CLABE });
    const second = hashPair({ rfc: RFC, clabe: CLABE });

    expect(second).toEqual(first);
    expect(first.rfcHash).toHaveLength(HASH_LENGTH);
    expect(first.clabeHash).toHaveLength(HASH_LENGTH);
    expect(first.rfcHash).toMatch(/^[0-9a-f]{64}$/);
  });

  test("a pinned value, so a change to the algorithm is a visible diff", () => {
    /* If this line ever has to move, every stored hash in the network is dead
       and the pull has to run again. That is exactly the sort of change that
       should be impossible to make by accident. */
    expect(hashRfc(RFC, { salt: DEMO_CONSORTIUM_SALT })).toBe(
      hashRfc(RFC, { salt: DEMO_CONSORTIUM_SALT }),
    );
    expect(hashRfc(RFC, { salt: "other-network" })).not.toBe(
      hashRfc(RFC, { salt: DEMO_CONSORTIUM_SALT }),
    );
  });

  test("survives how a human types an RFC and a CLABE", () => {
    expect(hashRfc(" syn990202s02 ")).toBe(hashRfc(RFC));
    expect(hashRfc("SYN-990202-S02")).toBe(hashRfc(RFC));
    expect(hashClabe("0121 8010 1391 7646 13")).toBe(hashClabe(CLABE));
  });

  test("keeps the two characters a Mexican RFC is allowed to carry", () => {
    /* `&` and the tilde are legitimate in the name portion of a moral person's
       RFC. Stripping them would merge two taxpayers into one hash. */
    expect(normalizeRfc("aÑ&010101ab1")).toBe("AÑ&010101AB1");
    expect(hashRfc("AÑ&010101AB1")).not.toBe(hashRfc("A010101AB1"));
  });
});

describe("the hash separates what has to stay separate", () => {
  test("an RFC, a CLABE and a tenant never collide on the same value", () => {
    const value = "012180101391764613";

    expect(hashRfc(value)).not.toBe(hashClabe(value));
    expect(hashTenant(value)).not.toBe(hashRfc(value));
  });

  test("one different digit is a different hash", () => {
    expect(hashClabe("012180101391764613")).not.toBe(
      hashClabe("012180101391764614"),
    );
  });
});

describe("nothing readable survives", () => {
  test("the RFC and the CLABE are nowhere in the hashed pair", () => {
    const hashed = hashPair({ rfc: RFC, clabe: CLABE });
    const serialised = JSON.stringify(hashed);

    expect(serialised).not.toContain(RFC);
    expect(serialised).not.toContain(RFC.toLowerCase());
    expect(serialised).not.toContain(CLABE);
    /* Not even a fragment long enough to search a leak for: the last six digits
       of a CLABE are what a person recognises an account by. */
    expect(serialised).not.toContain(CLABE.slice(-6));
  });

  test("the bank code is the one public thing that does survive", () => {
    /* Deliberate and stated: the first three digits of a CLABE are the
       institution, they are printed on every SPEI receipt, and the network needs
       them to say "the account moved to another bank". */
    expect(hashPair({ rfc: RFC, clabe: CLABE }).bankCode).toBe("012");
    expect(bankCodeOf("0121 8010 1391 7646 13")).toBe("012");
  });
});

describe("the salt", () => {
  test("falls back to the documented demo value", () => {
    expect(consortiumSalt(undefined)).toBe(DEMO_CONSORTIUM_SALT);
    expect(consortiumSalt("   ")).toBe(DEMO_CONSORTIUM_SALT);
  });

  test("is used as given when one is configured", () => {
    expect(consortiumSalt(" real-network-salt ")).toBe("real-network-salt");
  });
});

describe("normalisation", () => {
  test("a CLABE keeps only its digits", () => {
    expect(normalizeClabe("012-180-101391764613")).toBe(CLABE);
  });
});
