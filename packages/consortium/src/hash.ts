/**
 * The privacy boundary of the consortium, and the only file that crosses it.
 *
 * Nothing personal leaves a tenant. What goes to the warehouse about one
 * beneficiary is a salted HMAC-SHA256 of the normalised RFC, the same over the
 * normalised CLABE, the three-digit bank code the CLABE already carries in
 * public, a date, a count and an outcome. No legal name, no amount, no clave de
 * rastreo, no invoice, no CLABE and no RFC in the clear, ever.
 *
 * Why an HMAC and not a plain SHA-256. A CLABE is eighteen digits with a check
 * digit, so the whole space is about 10^17 and a plain digest of one is
 * enumerable on a laptop: the hash would be a reversible encoding of the account
 * number and the privacy claim would be false. The salt is the secret that makes
 * the mapping one way for anybody who does not hold it, which is why it is a
 * network-wide secret in `CONSORTIUM_SALT` and not a per-row value. One salt for
 * the whole network is what makes two tenants agree that they are paying the same
 * account at all, which is the entire point of the consortium; a per-tenant salt
 * would make every row unjoinable.
 *
 * The honest consequence, stated here rather than in a pitch: whoever holds the
 * salt and a candidate list of RFCs can confirm a guess. The salt therefore
 * belongs to the network operator, it is never in the repository, and the
 * constant below is a documented demo value, not a secret. A production network
 * replaces it with a real secret and rotates it, and a rotation invalidates
 * every stored hash on purpose. `docs/06-regulatory-privacy.md` carries the
 * argument; this comment carries the limitation.
 *
 * Server only: `node:crypto` rather than WebCrypto, because `createHmac` is
 * synchronous and the dataset factory that builds the demo network is, too.
 * `@hackmty/cep` already imports the same module, so no new runtime assumption
 * enters the repository here. ADR-0005 forbids `bun:*`, not `node:*`.
 */

import { createHmac } from "node:crypto";

/**
 * The network-wide salt the demo runs on.
 *
 * It is a constant in the repository and that is deliberate: a salt nobody can
 * read makes `bun run consortium:seed` and `bun run consortium:pull` produce
 * different hashes on two laptops, and then the demo network and the demo
 * company stop joining. The value is documented as a demo value in
 * `.env.example` and in `docs/06-regulatory-privacy.md`, and `CONSORTIUM_SALT`
 * overrides it wherever a real network exists.
 */
export const DEMO_CONSORTIUM_SALT = "sentryone-demo-consortium-2026";

/** Length of a hash as this package writes it: 32 bytes, hex, lower case. */
export const HASH_LENGTH = 64;

/**
 * The salt in force, from the environment or the documented demo value.
 *
 * Read through a function rather than captured at import time so a script can
 * set the variable and a test can pass its own without either of them depending
 * on module load order.
 */
export function consortiumSalt(raw = readEnv("CONSORTIUM_SALT")): string {
  return raw === undefined || raw.trim() === ""
    ? DEMO_CONSORTIUM_SALT
    : raw.trim();
}

function readEnv(name: string): string | undefined {
  const holder = globalThis as {
    process?: { env?: Record<string, string | undefined> };
  };
  return holder.process?.env?.[name];
}

/**
 * An RFC as the network keys it: upper case, with every separator a human or a
 * form may have typed removed.
 *
 * `&` and `N with a tilde` survive, because both are legitimate in the name
 * portion of a moral person's RFC and dropping them would merge two taxpayers
 * into one hash. This is the same normalisation `GET /api/v1/sat/lookup`
 * applies, restated here rather than imported because `@hackmty/sat` carries the
 * whole official snapshot and this package must stay importable by a script that
 * only wants a hash.
 */
export function normalizeRfc(rfc: string): string {
  return rfc
    .toUpperCase()
    .normalize("NFC")
    .replace(/[\s.\-_/]+/g, "");
}

/** A CLABE as the network keys it: the eighteen digits and nothing else. */
export function normalizeClabe(clabe: string): string {
  return clabe.replace(/\D+/g, "");
}

/** The bank code a CLABE carries in its first three digits. */
export function bankCodeOf(clabe: string): string {
  return normalizeClabe(clabe).slice(0, 3);
}

export interface HashOptions {
  /** Defaults to `consortiumSalt()`. A test passes its own. */
  salt?: string;
}

/**
 * The keyed digest of one normalised value, with the kind of value mixed in.
 *
 * The domain prefix ("rfc:", "clabe:", "tenant:") is what stops a CLABE and an
 * RFC that happen to normalise to the same string from producing the same hash,
 * and it is what stops a tenant hash from being confused with a supplier hash in
 * a table that holds both as text.
 */
function keyed(domain: string, value: string, options: HashOptions): string {
  return createHmac("sha256", consortiumSalt(options.salt))
    .update(`${domain}:${value}`)
    .digest("hex");
}

export function hashRfc(rfc: string, options: HashOptions = {}): string {
  return keyed("rfc", normalizeRfc(rfc), options);
}

export function hashClabe(clabe: string, options: HashOptions = {}): string {
  return keyed("clabe", normalizeClabe(clabe), options);
}

/**
 * The hash that identifies a tenant to the network.
 *
 * A tenant is a company, so this is its RFC under its own domain prefix. It
 * exists so the warehouse can count DISTINCT tenants per beneficiary without
 * holding a list of which companies use SentryOne, which is itself commercially
 * sensitive information about our customers.
 */
export function hashTenant(rfc: string, options: HashOptions = {}): string {
  return keyed("tenant", normalizeRfc(rfc), options);
}

/** The pair of hashes that keys one beneficiary in the network. */
export interface PairHash {
  rfcHash: string;
  clabeHash: string;
  /** Public in every SPEI: the first three digits of the CLABE. */
  bankCode: string;
}

/**
 * Hashes one (RFC, CLABE) pair for the network.
 *
 * The returned object is everything about the pair that may ever leave the
 * tenant. A test in this package asserts that the raw RFC and the raw CLABE
 * appear nowhere in it, because that assertion is the product claim.
 */
export function hashPair(
  pair: { rfc: string; clabe: string },
  options: HashOptions = {},
): PairHash {
  return {
    rfcHash: hashRfc(pair.rfc, options),
    clabeHash: hashClabe(pair.clabe, options),
    bankCode: bankCodeOf(pair.clabe),
  };
}
