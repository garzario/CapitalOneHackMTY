/**
 * The synthetic CEP used by the tests and by anything that needs a CEP-shaped
 * document without a real one.
 *
 * It is redacted by construction, not by editing a real CEP: every name, RFC,
 * account, participant key and certificate serial in it was invented for this
 * repo, the participant key 99999 is outside the assigned range, and the `sello`
 * is 256 deterministic bytes rather than a signature anyone produced. `synthetic`
 * comes back true, so the UI watermark is driven by the flag and not by anyone
 * recognising the names. See SECURITY.md: no real PII, ever.
 *
 * What it is good for: the parser, the name comparison and the structural half of
 * the signature check. What it is not good for: confirming the signature scheme.
 * That needs a real CEP and the real Banxico certificate, which is issue #57.
 */

import { readFileSync } from "node:fs";
import type { Cep } from "@hackmty/core";
import { parseCep } from "./parse";

let cached: string | undefined;

/** The fixture as bytes on disk, read once. */
export function syntheticCepXml(): string {
  cached ??= readFileSync(
    new URL("./fixtures/synthetic-cep.xml", import.meta.url),
    "utf8",
  );
  return cached;
}

/** The fixture parsed, with `synthetic: true`. */
export function syntheticCep(): Cep {
  return parseCep(syntheticCepXml(), { synthetic: true });
}

/**
 * The legal name of the fixture's beneficiary as its CFDI would carry it.
 *
 * It is 44 characters, and the CEP `Nombre` field is capped at 40 by the schema,
 * so the fixture holds the truncated form. That pair is the point of the fixture:
 * the two strings differ and still describe one company.
 */
export const SYNTHETIC_BENEFICIARY_LEGAL_NAME =
  "Distribuidora Sint\u00e9tica del Poniente, S.A. de C.V.";
