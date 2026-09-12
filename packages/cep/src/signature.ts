/**
 * Verification of the Banxico seal on a CEP.
 *
 * Read this before you quote a number from it.
 *
 * What is confirmed. The root element carries `sello`, a base64 string that on a
 * production CEP decodes to exactly 256 bytes, which is an RSA-2048 signature;
 * `numeroCertificado`, a 20-digit certificate serial; and `cadenaCDA`, a
 * pipe-delimited string whose last two fields are the certificate serial and the
 * seal itself. A signature cannot cover itself, so the signed string is at most
 * `cadenaCDA` with that trailing `||<sello>` removed. That much is structure we
 * can see in the document.
 *
 * What is NOT confirmed. Banxico publishes no specification of which hash is
 * used, which byte encoding the string is hashed in, whether the signed string is
 * exactly the truncated `cadenaCDA`, or which padding the signature uses. We
 * looked; the portal and the CEP validator pages carry no technical annex, and no
 * public implementation verifies the seal, they only parse around it. The sources
 * we did check are listed in packages/cep/README.md.
 *
 * So this module refuses to report a valid signature. It runs the whole candidate
 * matrix with `node:crypto` and reports, per candidate, whether RSA verification
 * succeeded, and then returns `{ valid: false, reason: "unconfirmed_scheme" }`.
 * The moment issue #57 supplies a real CEP and the matching Banxico certificate,
 * one run of `verifySignature` names the scheme: whichever attempt comes back
 * `matched: true` is the answer, and then CEP_SIGNATURE_SCHEME_CONFIRMED is
 * flipped in one line. Until that run happens, the UI shows "firma no verificada"
 * and the finding is `requiere_verificacion`, never "firma invalida".
 *
 * Server only. It imports `node:crypto`, so it must not be pulled into the
 * browser bundle. `apps/web` reaches this through POST /api/v1/cep/verify.
 */

import { createPublicKey, createVerify, X509Certificate } from "node:crypto";
import { CepParseError, readCepAttributes } from "./parse";

/**
 * Whether the signature scheme below has been confirmed against a real CEP and
 * the real Banxico certificate.
 *
 * Flip this to true in the PR that lands the golden file from issue #57, in the
 * same commit that records which candidate matched, and not before. It is typed
 * `boolean` rather than left as a literal on purpose, so the code that depends on
 * it stays live and type-checked while it is false.
 */
export const CEP_SIGNATURE_SCHEME_CONFIRMED: boolean = false;

/** Hashes tried under the candidate matrix, most plausible first. */
export const CANDIDATE_HASHES = ["sha256", "sha1", "sha512"] as const;
export type CandidateHash = (typeof CANDIDATE_HASHES)[number];

/**
 * Which string is hashed.
 *
 * `without_sello` is `cadenaCDA` with the trailing `||<sello>` removed, the only
 * variant that can be self-consistent. `full` is `cadenaCDA` verbatim, kept
 * because it is the obvious reading of the attribute name and costs one hash.
 */
export type CandidateCadena = "without_sello" | "full";

/**
 * Which bytes the string is hashed as.
 *
 * `latin1` is not paranoia: Mexican beneficiary names carry accents, and a
 * service of this vintage encoding its signed string as ISO-8859-1 is at least as
 * likely as UTF-8. The two differ only when the name has an accent, which is
 * exactly when a wrong guess would be hardest to notice.
 */
export type CandidateEncoding = "utf8" | "latin1";

export interface CepSignatureAttempt {
  hash: CandidateHash;
  cadena: CandidateCadena;
  encoding: CandidateEncoding;
  /** True when RSA verification of `sello` over these bytes succeeded. */
  matched: boolean;
}

export type CepSignatureReason =
  /** Structure is intact and the crypto ran, but the scheme is not confirmed. */
  | "unconfirmed_scheme"
  /** Confirmed scheme, signature verified. Unreachable while the flag is false. */
  | "verified"
  /** Confirmed scheme, signature did not verify. Also unreachable for now. */
  | "signature_mismatch"
  | "malformed_xml"
  | "missing_sello"
  | "malformed_sello"
  | "missing_cadena"
  | "invalid_certificate";

export interface CepSignatureResult {
  /** Never true while CEP_SIGNATURE_SCHEME_CONFIRMED is false. */
  valid: boolean;
  reason: CepSignatureReason;
  /** Empty when the check failed before any crypto could run. */
  attempts: CepSignatureAttempt[];
  /** Certificate serial the CEP claims, for the evidence chip. */
  numeroCertificado?: string;
  /** Free-text detail for the reviewer, never shown to the clerk. */
  detail?: string;
}

/** An RSA-2048 signature is 256 bytes. Anything else is not one. */
const RSA_2048_SIGNATURE_BYTES = 256;

/**
 * Removes the trailing `||<sello>` from `cadenaCDA`.
 *
 * Returns undefined when the seal is not the last field, because then we do not
 * know where the signed part ends and guessing would be inventing.
 */
export function cadenaWithoutSello(
  cadenaCda: string,
  sello: string,
): string | undefined {
  const suffix = `||${sello}`;
  if (!cadenaCda.endsWith(suffix)) {
    return undefined;
  }
  return cadenaCda.slice(0, cadenaCda.length - suffix.length);
}

/** Accepts a PEM certificate or a bare PEM public key and returns the key. */
function publicKeyFrom(
  certificatePem: string,
): ReturnType<typeof createPublicKey> {
  if (certificatePem.includes("BEGIN CERTIFICATE")) {
    return new X509Certificate(certificatePem).publicKey;
  }
  return createPublicKey(certificatePem);
}

/** base64 that decodes back to itself, so a truncated seal is caught here. */
function decodeSello(sello: string): Buffer | undefined {
  const compact = sello.replace(/\s+/g, "");
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(compact)) {
    return undefined;
  }
  const bytes = Buffer.from(compact, "base64");
  if (bytes.toString("base64") !== compact) {
    return undefined;
  }
  return bytes;
}

/**
 * Verifies the Banxico seal on a CEP against a certificate.
 *
 * `certificatePem` is a PEM X.509 certificate or a PEM public key. The CEP does
 * not carry the certificate, only its serial in `numeroCertificado`, so the
 * caller supplies it out of band and the caller is responsible for having got it
 * from Banxico rather than from the same place the CEP came from.
 */
export function verifySignature(
  xml: string,
  certificatePem: string,
): CepSignatureResult {
  let attributes: ReturnType<typeof readCepAttributes>;
  try {
    attributes = readCepAttributes(xml);
  } catch (cause) {
    return {
      valid: false,
      reason: "malformed_xml",
      attempts: [],
      detail: cause instanceof CepParseError ? cause.message : String(cause),
    };
  }

  const numeroCertificado = attributes.root.numeroCertificado;
  const sello = attributes.root.sello?.trim() ?? "";
  if (sello === "") {
    return {
      valid: false,
      reason: "missing_sello",
      attempts: [],
      numeroCertificado,
      detail: "the CEP root has no sello attribute",
    };
  }

  const signature = decodeSello(sello);
  if (signature === undefined) {
    return {
      valid: false,
      reason: "malformed_sello",
      attempts: [],
      numeroCertificado,
      detail: "sello is not base64",
    };
  }
  if (signature.length !== RSA_2048_SIGNATURE_BYTES) {
    return {
      valid: false,
      reason: "malformed_sello",
      attempts: [],
      numeroCertificado,
      detail: `sello decodes to ${signature.length} bytes, expected ${RSA_2048_SIGNATURE_BYTES} for RSA-2048`,
    };
  }

  // Hashed as it arrived, not trimmed. The schema puts no whitespace facet on
  // cadenaCDA, so a trim here would silently change the bytes being verified.
  const cadenaCda = attributes.root.cadenaCDA ?? "";
  if (cadenaCda.trim() === "") {
    return {
      valid: false,
      reason: "missing_cadena",
      attempts: [],
      numeroCertificado,
      detail:
        "the CEP root has no cadenaCDA attribute, so there is nothing to hash",
    };
  }

  let publicKey: ReturnType<typeof createPublicKey>;
  try {
    publicKey = publicKeyFrom(certificatePem);
  } catch (cause) {
    return {
      valid: false,
      reason: "invalid_certificate",
      attempts: [],
      numeroCertificado,
      detail: cause instanceof Error ? cause.message : String(cause),
    };
  }

  const cadenas: Array<[CandidateCadena, string | undefined]> = [
    ["without_sello", cadenaWithoutSello(cadenaCda, sello)],
    ["full", cadenaCda],
  ];
  const attempts: CepSignatureAttempt[] = [];
  for (const hash of CANDIDATE_HASHES) {
    for (const [cadena, text] of cadenas) {
      if (text === undefined) {
        continue;
      }
      for (const encoding of ["utf8", "latin1"] as const) {
        let matched = false;
        try {
          const verifier = createVerify(hash);
          verifier.update(Buffer.from(text, encoding));
          verifier.end();
          matched = verifier.verify(publicKey, signature);
        } catch {
          // A key the algorithm cannot use is a failed candidate, not a crash.
          matched = false;
        }
        attempts.push({ hash, cadena, encoding, matched });
      }
    }
  }

  if (!CEP_SIGNATURE_SCHEME_CONFIRMED) {
    return {
      valid: false,
      reason: "unconfirmed_scheme",
      attempts,
      numeroCertificado,
      detail:
        "the CEP signature scheme is not published and has not been confirmed against a real CEP; see issue #57",
    };
  }

  const matched = attempts.some((attempt) => attempt.matched);
  return {
    valid: matched,
    reason: matched ? "verified" : "signature_mismatch",
    attempts,
    numeroCertificado,
  };
}
