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

/* -------------------------------------------------------------------------- */
/* Documents filed under a clave de rastreo                                    */
/* -------------------------------------------------------------------------- */

/**
 * The committed CEPs, indexed by the clave de rastreo they were filed under.
 *
 * This is the index the verification pipeline asks before it asks Banxico: a CEP
 * this repository holds for that clave is the evidence, and a public government
 * portal is not consulted for something already on disk. Today it holds the one
 * synthetic fixture; the real one-cent CEP of issue #57 lands here as a second
 * committed file under its own clave, and the pipeline finds it with no code
 * change at all, which is the whole reason this is an index and not a constant.
 */
export function committedCeps(): Cep[] {
  return [syntheticCep()];
}

/** One committed CEP by clave de rastreo. Undefined when we hold none. */
export function cepByClave(clave: string): Cep | undefined {
  const wanted = clave.trim().toUpperCase();
  return committedCeps().find(
    (cep) => cep.claveRastreo.toUpperCase() === wanted,
  );
}

/* -------------------------------------------------------------------------- */
/* Building one                                                                */
/* -------------------------------------------------------------------------- */

/** Participant key of the synthetic fixtures, outside the assigned range. */
export const SYNTHETIC_SPEI_KEY = "99999";

/** Certificate serial of the synthetic fixtures. Twenty digits, invented. */
export const SYNTHETIC_CERTIFICATE_SERIAL = "00000100000100099999";

/** RSA-2048 is 256 bytes, which is the length `verifySignature` checks for. */
const SELLO_BYTES = 256;

export interface SyntheticCepFields {
  claveRastreo: string;
  /** ISO instant. The document carries the day and the wall clock separately. */
  transferredAt: string;
  amount: number;
  senderName: string;
  senderBank: string;
  senderAccount: string;
  senderRfc: string;
  beneficiaryName: string;
  beneficiaryBank: string;
  beneficiaryAccount: string;
  beneficiaryRfc: string;
  concepto: string;
}

/**
 * Renders a CEP-shaped XML for fields a caller invented.
 *
 * It exists so the demo and the suite can hold a CEP for a SPEI that the seeded
 * company sent, which no committed file can be: the accounts and the legal names
 * come out of the generator and change with the seed. Everything about the
 * document says what it is. The participant key is 99999, outside the assigned
 * range; the certificate serial is invented; the `sello` is 256 deterministic
 * bytes derived from the clave de rastreo and is not a signature anybody produced,
 * so `verifySignature` can exercise its structural half and can never answer
 * `valid`. Parse it with `{ synthetic: true }` and the watermark follows the flag.
 *
 * What it must never be used for: standing in for a real CEP in a claim. The one
 * real document is issue #57 and it arrives as a committed file.
 */
export function syntheticCepXmlFor(fields: SyntheticCepFields): string {
  const day = fields.transferredAt.slice(0, 10);
  const time = fields.transferredAt.slice(11, 19);
  const amount = fields.amount.toFixed(2);
  const sello = syntheticSello(fields.claveRastreo);
  const cadena = [
    "",
    "",
    "3",
    compactDay(day),
    compactDay(day),
    time.replace(/:/g, ""),
    SYNTHETIC_SPEI_KEY,
    fields.senderBank,
    fields.senderName,
    "40",
    fields.senderAccount,
    fields.senderRfc,
    fields.beneficiaryBank,
    fields.beneficiaryName,
    "40",
    fields.beneficiaryAccount,
    fields.beneficiaryRfc,
    fields.concepto,
    "0.00",
    amount,
    SYNTHETIC_CERTIFICATE_SERIAL,
    "",
    sello,
  ].join("|");

  return `<?xml version="1.0" encoding="UTF-8"?>
<SPEI_Tercero FechaOperacion="${day}" Hora="${time}" ClaveSPEI="${SYNTHETIC_SPEI_KEY}" sello="${sello}" numeroCertificado="${SYNTHETIC_CERTIFICATE_SERIAL}" cadenaCDA="${escapeXml(cadena)}" claveRastreo="${escapeXml(fields.claveRastreo)}">
    <Beneficiario BancoReceptor="${escapeXml(fields.beneficiaryBank)}" Nombre="${escapeXml(fields.beneficiaryName)}" TipoCuenta="40" Cuenta="${escapeXml(fields.beneficiaryAccount)}" RFC="${escapeXml(fields.beneficiaryRfc)}" Concepto="${escapeXml(fields.concepto)}" IVA="0.00" MontoPago="${amount}"/>
    <Ordenante BancoEmisor="${escapeXml(fields.senderBank)}" Nombre="${escapeXml(fields.senderName)}" TipoCuenta="40" Cuenta="${escapeXml(fields.senderAccount)}" RFC="${escapeXml(fields.senderRfc)}"/>
</SPEI_Tercero>`;
}

/** `syntheticCepXmlFor` parsed, with `synthetic: true`. */
export function syntheticCepFor(fields: SyntheticCepFields): Cep {
  return parseCep(syntheticCepXmlFor(fields), { synthetic: true });
}

/** "2026-09-12" into "12092026", which is the order a cadena original uses. */
function compactDay(day: string): string {
  const [year, month, date] = day.split("-");
  return `${date ?? ""}${month ?? ""}${year ?? ""}`;
}

/**
 * 256 deterministic bytes, base64, derived from the clave de rastreo.
 *
 * Deterministic so the same fields always render the same document, which is what
 * lets a test assert bytes. Not a signature: a 32-bit xorshift is not a signing
 * algorithm and nothing here holds a key, which is exactly the property wanted.
 */
function syntheticSello(claveRastreo: string): string {
  let state = 0x2f6e2b1;
  for (const character of claveRastreo) {
    state = (state ^ character.charCodeAt(0)) >>> 0;
    state = (state * 16_777_619) >>> 0;
  }

  const bytes = new Uint8Array(SELLO_BYTES);
  for (let index = 0; index < SELLO_BYTES; index += 1) {
    state ^= state << 13;
    state >>>= 0;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    bytes[index] = state & 0xff;
  }
  return Buffer.from(bytes).toString("base64");
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
