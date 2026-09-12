/**
 * The key-pair JWT, against the five details Snowflake refuses with a 401 for.
 *
 * The key is generated in the test rather than committed: a private key in a
 * repository is a private key in a screenshot, whatever it opens. 2048 bits
 * because that is Snowflake's minimum and generating 4096 in a unit test is
 * seconds nobody gets back.
 */

import { describe, expect, test } from "bun:test";
import { generateKeyPairSync } from "node:crypto";
import { snowflakeBaseUrl } from "./client";
import {
  jwtClaims,
  MAX_LIFETIME_SECONDS,
  normalizeAccount,
  publicKeyFingerprint,
  SnowflakeAuthError,
  signJwt,
} from "./jwt";

const { privateKey, publicKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
});
const PEM = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
const NOW = new Date("2026-09-12T18:00:00.000Z");

function claims(over: Partial<Parameters<typeof jwtClaims>[0]> = {}) {
  return jwtClaims({
    account: "myorg-sentryone",
    user: "sentryone_svc",
    privateKeyPem: PEM,
    now: NOW,
    ...over,
  });
}

describe("the claims", () => {
  test("iss is account.user.SHA256:fingerprint, all upper case", () => {
    const { iss, sub } = claims();

    expect(sub).toBe("MYORG-SENTRYONE.SENTRYONE_SVC");
    expect(iss.startsWith(`${sub}.SHA256:`)).toBe(true);
  });

  test("an account identifier written with dots is sent with hyphens", () => {
    /* The console prints `myorg.myaccount` and the hostname wants
       `myorg-myaccount`; the dotted form in a claim authenticates as a different
       account and answers 401. */
    expect(normalizeAccount("myorg.sentryone")).toBe("MYORG-SENTRYONE");
    expect(claims({ account: "myorg.sentryone" }).sub).toBe(
      "MYORG-SENTRYONE.SENTRYONE_SVC",
    );
  });

  test("the fingerprint is base64 of the SHA-256 of the public key DER", () => {
    const fingerprint = publicKeyFingerprint(PEM);
    const der = publicKey.export({ type: "spki", format: "der" });
    const expected = new Bun.CryptoHasher("sha256")
      .update(der)
      .digest("base64");

    expect(fingerprint).toBe(`SHA256:${expected}`);
    /* Base64 and not hex: a 44-character base64 digest, not 64 hex characters. */
    expect(fingerprint.slice("SHA256:".length)).not.toMatch(/^[0-9a-f]{64}$/);
  });

  test("lives at most one hour, however long the caller asks for", () => {
    expect(claims().exp - claims().iat).toBe(MAX_LIFETIME_SECONDS);
    expect(
      claims({ lifetimeSeconds: 86_400 }).exp -
        claims({ lifetimeSeconds: 86_400 }).iat,
    ).toBe(MAX_LIFETIME_SECONDS);
    expect(
      claims({ lifetimeSeconds: 120 }).exp -
        claims({ lifetimeSeconds: 120 }).iat,
    ).toBe(120);
  });

  test("iat comes from the clock it was handed, so a test is deterministic", () => {
    expect(claims().iat).toBe(Math.floor(NOW.getTime() / 1000));
  });
});

describe("the token", () => {
  test("is three base64url parts and carries the claims", () => {
    const token = signJwt({
      account: "myorg-sentryone",
      user: "sentryone_svc",
      privateKeyPem: PEM,
      now: NOW,
    });
    const parts = token.split(".");

    expect(parts).toHaveLength(3);
    expect(token).not.toContain("+");
    expect(token).not.toContain("/");
    expect(token).not.toContain("=");

    const header = JSON.parse(
      Buffer.from(parts[0] as string, "base64url").toString("utf8"),
    );
    const payload = JSON.parse(
      Buffer.from(parts[1] as string, "base64url").toString("utf8"),
    );

    expect(header).toEqual({ alg: "RS256", typ: "JWT" });
    expect(payload.sub).toBe("MYORG-SENTRYONE.SENTRYONE_SVC");
  });

  test("never carries the private key in any part of itself", () => {
    const token = signJwt({
      account: "myorg-sentryone",
      user: "sentryone_svc",
      privateKeyPem: PEM,
      now: NOW,
    });

    expect(token).not.toContain("PRIVATE KEY");
    for (const line of PEM.split("\n").filter((part) => part.length > 40)) {
      expect(token).not.toContain(line);
    }
  });
});

describe("the refusals name what is missing", () => {
  test("an empty account or user is refused before anything is signed", () => {
    expect(() => claims({ account: "  " })).toThrow(SnowflakeAuthError);
    expect(() => claims({ user: "" })).toThrow(
      /SNOWFLAKE_ACCOUNT and SNOWFLAKE_USER/,
    );
  });

  test("a key that is not a PKCS8 PEM names the variable that holds the path", () => {
    expect(() => claims({ privateKeyPem: "not a key" })).toThrow(
      /SNOWFLAKE_PRIVATE_KEY_PATH/,
    );
  });
});

describe("the host", () => {
  test("is the account identifier, lower case, dots as hyphens", () => {
    expect(snowflakeBaseUrl("MyOrg.SentryOne")).toBe(
      "https://myorg-sentryone.snowflakecomputing.com",
    );
  });
});
