/**
 * The key-pair JWT the Snowflake SQL REST API authenticates with.
 *
 * Verified against the official documentation on 2026-09-12,
 * https://docs.snowflake.com/en/developer-guide/sql-api/authenticating. Five
 * details come straight from that page and every one of them fails with an
 * unhelpful 401 if it is wrong:
 *
 * 1. `iss` is `<ACCOUNT>.<USER>.SHA256:<fingerprint>` and `sub` is
 *    `<ACCOUNT>.<USER>`.
 * 2. The account identifier and the user are UPPER CASE in both claims.
 * 3. The fingerprint is the SHA-256 of the public key's raw DER bytes
 *    (SubjectPublicKeyInfo), base64 encoded, behind the literal prefix
 *    `SHA256:`. Base64 and not hex, and the DER of the PUBLIC key derived from
 *    the private one, never of the private key itself.
 * 4. An account identifier that contains dots has them replaced with hyphens.
 * 5. The token is valid for at most one hour whatever `exp` says, so asking for
 *    longer buys nothing and `MAX_LIFETIME_SECONDS` clamps it.
 *
 * The request carries `Authorization: Bearer <jwt>` and
 * `X-Snowflake-Authorization-Token-Type: KEYPAIR_JWT`; without the second header
 * Snowflake reads the bearer as an OAuth token and refuses it.
 *
 * No SDK and no JWT library. RS256 is `node:crypto` in a dozen lines, and this
 * repository holds a three-day supply-chain quarantine on new dependencies: a
 * signing library here would be transitive packages to audit for something the
 * platform already does. Server only, like `hash.ts`, and `node:crypto` rather
 * than `bun:*` so ADR-0005 stays satisfied.
 */

import {
  createHash,
  createPrivateKey,
  createPublicKey,
  createSign,
} from "node:crypto";

/** Snowflake ignores anything longer, so this is the ceiling and the default. */
export const MAX_LIFETIME_SECONDS = 3600;

export class SnowflakeAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SnowflakeAuthError";
  }
}

/** Base64 with the URL alphabet and no padding, which is what a JWT part is. */
function base64Url(input: Buffer | string): string {
  const buffer = typeof input === "string" ? Buffer.from(input, "utf8") : input;
  return buffer
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/**
 * The account identifier as Snowflake wants it inside a claim: upper case, with
 * dots turned into hyphens.
 *
 * The dots matter. An org-account identifier is written `myorg-myaccount` in a
 * hostname and some consoles print it as `myorg.myaccount`; the second form in a
 * claim authenticates as a different account and answers 401.
 */
export function normalizeAccount(account: string): string {
  return account.trim().toUpperCase().replace(/\./g, "-");
}

export function normalizeUser(user: string): string {
  return user.trim().toUpperCase();
}

/**
 * `SHA256:<base64>` over the DER of the public key that belongs to this private
 * key.
 *
 * Exported because it is the one value a human has to be able to compare by eye.
 * `desc user <name>` in Snowflake prints `RSA_PUBLIC_KEY_FP`, and when a JWT is
 * refused this is the string to diff against it.
 */
export function publicKeyFingerprint(privateKeyPem: string): string {
  const der = createPublicKey(createPrivateKey(privateKeyPem)).export({
    type: "spki",
    format: "der",
  });
  return `SHA256:${createHash("sha256").update(der).digest("base64")}`;
}

export interface JwtClaims {
  iss: string;
  sub: string;
  /** Seconds since the epoch. */
  iat: number;
  /** Seconds since the epoch, at most one hour after `iat`. */
  exp: number;
}

export interface JwtInput {
  account: string;
  user: string;
  /** PKCS8 PEM, unencrypted, read from a file OUTSIDE the repository. */
  privateKeyPem: string;
  /** Defaults to `MAX_LIFETIME_SECONDS`, and clamped to it. */
  lifetimeSeconds?: number;
  /** The instant the token is issued at. Injected so a test is deterministic. */
  now?: Date;
}

/**
 * The claims, without signing anything.
 *
 * Separate from `signJwt` because the claims are the part that is easy to get
 * wrong and cheap to assert: the shape of `iss`, the upper casing and the one
 * hour ceiling are all checkable from this object.
 *
 * @throws SnowflakeAuthError when the account, the user or the key is unusable.
 */
export function jwtClaims(input: JwtInput): JwtClaims {
  const account = normalizeAccount(input.account);
  const user = normalizeUser(input.user);
  if (account === "" || user === "") {
    throw new SnowflakeAuthError(
      "SNOWFLAKE_ACCOUNT and SNOWFLAKE_USER are both required to build a key-pair JWT.",
    );
  }

  let fingerprint: string;
  try {
    fingerprint = publicKeyFingerprint(input.privateKeyPem);
  } catch (cause) {
    throw new SnowflakeAuthError(
      `SNOWFLAKE_PRIVATE_KEY_PATH does not hold a usable PKCS8 private key: ${messageOf(cause)}`,
    );
  }

  const issuedAt = Math.floor((input.now ?? new Date()).getTime() / 1000);
  const lifetime = Math.min(
    Math.max(Math.floor(input.lifetimeSeconds ?? MAX_LIFETIME_SECONDS), 1),
    MAX_LIFETIME_SECONDS,
  );

  return {
    iss: `${account}.${user}.${fingerprint}`,
    sub: `${account}.${user}`,
    iat: issuedAt,
    exp: issuedAt + lifetime,
  };
}

/**
 * One signed RS256 JWT.
 *
 * @throws SnowflakeAuthError when the account, the user or the key is unusable.
 */
export function signJwt(input: JwtInput): string {
  const claims = jwtClaims(input);
  const header = { alg: "RS256", typ: "JWT" };
  const payload = `${base64Url(JSON.stringify(header))}.${base64Url(
    JSON.stringify(claims),
  )}`;
  const signer = createSign("RSA-SHA256");
  signer.update(payload);

  try {
    return `${payload}.${base64Url(signer.sign(createPrivateKey(input.privateKeyPem)))}`;
  } catch (cause) {
    throw new SnowflakeAuthError(
      `the private key could not sign the token: ${messageOf(cause)}`,
    );
  }
}

function messageOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}
