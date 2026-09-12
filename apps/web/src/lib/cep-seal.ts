/**
 * What the screen is allowed to say about a Banxico seal.
 *
 * This is the single most dangerous sentence in the product. "Firma valida"
 * next to a CEP is a claim about a cryptographic fact, and the difference
 * between "we checked it and it holds", "we could not check it" and "we checked
 * it and it does not hold" is the difference between evidence, an open question
 * and an accusation. Collapsing the middle one into either of the others is
 * how a demo becomes a lie.
 *
 * `Cep.signatureValid` alone cannot carry that, which is why the domain also
 * carries `signatureReason`. Today `CEP_SIGNATURE_SCHEME_CONFIRMED` in
 * `packages/cep` is false, so every real CEP comes back `unconfirmed_scheme`:
 * the document parsed, the certificate is there, the arithmetic ran, and the
 * exact canonical string Banxico signs is not confirmed. That is "no
 * verificada", never "invalida".
 */

export type SealState = "valid" | "unverified" | "invalid";

export interface SealVerdict {
  state: SealState;
  /** Two or three words for the badge. */
  label: string;
  /** The class the badge uses, from the decision palette. */
  badge: string;
  /** One sentence under it, in the register the rest of the product uses. */
  detail: string;
}

/** Reasons that mean "we could not check", as opposed to "it did not hold". */
const UNCONFIRMED = new Set(["unconfirmed_scheme"]);

export function sealVerdict(
  signatureValid: boolean,
  signatureReason?: string,
): SealVerdict {
  if (signatureValid) {
    return {
      state: "valid",
      label: "Firma validada",
      badge: "badge badge-release",
      detail:
        "El sello del XML valida contra el certificado de Banxico. Es la evidencia mas fuerte que tiene este producto.",
    };
  }

  if (signatureReason === undefined || UNCONFIRMED.has(signatureReason)) {
    return {
      state: "unverified",
      label: "Firma no verificada",
      badge: "badge badge-verify",
      detail:
        "El documento se leyo completo y el certificado esta, pero todavia no confirmamos la cadena exacta que Banxico firma. No verificada no quiere decir invalida: son dos afirmaciones distintas y solo una es nuestra.",
    };
  }

  return {
    state: "invalid",
    label: "Firma no valida",
    badge: "badge badge-hold",
    detail: `El sello no valido contra el certificado (${signatureReason}). Conviene descargar el CEP de nuevo desde el portal antes de concluir nada.`,
  };
}
