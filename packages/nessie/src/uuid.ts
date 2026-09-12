/**
 * Deterministic identifiers for imported rows.
 *
 * Our ledger key is a uuid (see packages/db/migrations/0001_init.sql) but Nessie
 * `_id` values are not uuids: the pool mixes uuids with Mongo ObjectIds such as
 * 56c66be5a73e4927415071a3. Inserting one into a uuid column fails, and minting a
 * random uuid per import would duplicate every row on the second import.
 *
 * So the importer derives the key from the Nessie id. `stableUuid` is a version 8
 * uuid, which RFC 9562 reserves for exactly this: a custom, vendor-defined layout.
 * It is NOT a version 5 uuid and it is not cryptographic. The only guarantee it
 * makes is the one the importer needs: the same key always produces the same uuid,
 * on every machine and every runtime, with no dependency and no async call.
 */

/** Four independent FNV-1a offset bases, one per 32-bit lane of the output. */
const LANE_SEEDS = [0x811c9dc5, 0x01000193, 0x9e3779b9, 0x85ebca6b] as const;
const FNV_PRIME = 0x01000193;
const HEX_LENGTH = 32;

/** FNV-1a over the UTF-16 code units, then an avalanche so short keys differ widely. */
function hashLane(input: string, seed: number): number {
  let hash = seed >>> 0;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, FNV_PRIME) >>> 0;
  }
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x7feb352d) >>> 0;
  hash ^= hash >>> 15;
  hash = Math.imul(hash, 0x846ca68b) >>> 0;
  hash ^= hash >>> 16;
  return hash >>> 0;
}

/**
 * A version 8 uuid derived from `key`, stable across runs, machines and runtimes.
 *
 * Build the key so it cannot collide across entity kinds, for example
 * `nessie:purchase:<_id>`.
 */
export function stableUuid(key: string): string {
  const hex = LANE_SEEDS.map((seed) =>
    hashLane(key, seed).toString(16).padStart(8, "0"),
  ).join("");
  if (hex.length !== HEX_LENGTH) {
    throw new Error(
      `expected ${HEX_LENGTH} hex characters, built ${hex.length}`,
    );
  }
  // Version nibble is 8 (custom layout) and the variant nibble is one of 8, 9, a, b.
  const variant = "89ab".charAt(Number.parseInt(hex.charAt(16), 16) % 4);
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    `8${hex.slice(13, 16)}`,
    `${variant}${hex.slice(17, 20)}`,
    hex.slice(20, 32),
  ].join("-");
}

/** True for any RFC 4122 or RFC 9562 shaped uuid. Used by tests, never on input. */
export function looksLikeUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}
