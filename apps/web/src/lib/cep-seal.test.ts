import { describe, expect, it } from "bun:test";
import { sealVerdict } from "./cep-seal";

/**
 * The three states have to stay three. Every test here exists because
 * collapsing "we could not check" into either neighbour is the one way this
 * screen can mislead a judge, and it is the kind of thing a refactor does by
 * accident.
 */
describe("sealVerdict", () => {
  it("calls a validated seal validated", () => {
    expect(sealVerdict(true).state).toBe("valid");
  });

  it("calls an unconfirmed scheme not verified, never invalid", () => {
    const verdict = sealVerdict(false, "unconfirmed_scheme");

    expect(verdict.state).toBe("unverified");
    expect(verdict.label).toContain("no verificada");
    expect(verdict.label).not.toContain("no valida");
  });

  it("treats a missing reason as not verified, because absence is not evidence", () => {
    expect(sealVerdict(false).state).toBe("unverified");
  });

  it("calls the reason parseCep writes not verified, never invalid", () => {
    /* `not_checked` is what every CEP carries on a deployment with no
       BANXICO_CEP_CERT_PEM, which is every deployment of this build: the document
       was read whole and the seal was not checked. It was missing from the set,
       so the screen called every CEP it has ever shown "Firma no valida", which
       is the accusation this module exists to prevent. */
    const verdict = sealVerdict(false, "not_checked");

    expect(verdict.state).toBe("unverified");
    expect(verdict.label).toContain("no verificada");
    expect(verdict.label).not.toContain("no valida");
  });

  it("calls a real verification failure invalid, and names the reason", () => {
    const verdict = sealVerdict(false, "signature_mismatch");

    expect(verdict.state).toBe("invalid");
    expect(verdict.detail).toContain("signature_mismatch");
  });

  it("treats a malformed document as invalid rather than merely unchecked", () => {
    expect(sealVerdict(false, "malformed_sello").state).toBe("invalid");
    expect(sealVerdict(false, "missing_cadena").state).toBe("invalid");
    expect(sealVerdict(false, "invalid_certificate").state).toBe("invalid");
  });

  it("says out loud that not verified and invalid are different claims", () => {
    expect(sealVerdict(false, "unconfirmed_scheme").detail).toContain(
      "no quiere decir invalida",
    );
  });

  it("uses a different badge for each state, so the colour carries it too", () => {
    const badges = new Set([
      sealVerdict(true).badge,
      sealVerdict(false, "unconfirmed_scheme").badge,
      sealVerdict(false, "signature_mismatch").badge,
    ]);

    expect(badges.size).toBe(3);
  });
});
