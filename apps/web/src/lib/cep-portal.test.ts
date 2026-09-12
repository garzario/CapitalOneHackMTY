import { describe, expect, it } from "bun:test";
import type { Cep } from "@hackmty/core";
import { portalClipboardText, portalDate, portalFields } from "./cep-portal";

const CEP: Cep = {
  claveRastreo: "SYN2026090900000042",
  transferredAt: "2026-09-09T21:00:00.000Z",
  amount: 0.01,
  senderName: "Distribuidora Sintetica del Norte SA de CV",
  senderBank: "BANORTE",
  beneficiaryName: "CLIMAS Y VENTILACION DEL NORTE SA DE CV",
  beneficiaryAccount: "062180300022233345",
  beneficiaryBank: "AFIRME",
  signatureValid: true,
  xml: '<SPEI_Tercero synthetic="true"/>',
  synthetic: true,
};

describe("portalDate", () => {
  it("turns an instant into the day-month-year the form takes", () => {
    expect(portalDate("2026-09-09T21:00:00.000Z")).toBe("09-09-2026");
  });

  it("hands back what it got when there is no date to read", () => {
    expect(portalDate("ayer")).toBe("ayer");
  });
});

/**
 * These assert the values against the portal's own form, transcribed from
 * `buildValidaForm` in `packages/cep`. They do not import it: that package is
 * server only, it reaches for `node:crypto`, and pulling it into the browser
 * workspace to tighten one test would be the wrong trade. The comment in
 * `cep-portal.ts` names it as the source, and the two files have to be edited
 * together.
 */
describe("portalFields", () => {
  it("carries every value the portal asks for", () => {
    const byLabel = new Map(
      portalFields(CEP).map((field) => [field.label, field.value]),
    );

    expect(byLabel.get("Clave de rastreo")).toBe("SYN2026090900000042");
    expect(byLabel.get("Fecha")).toBe("09-09-2026");
    expect(byLabel.get("Banco emisor")).toBe("BANORTE");
    expect(byLabel.get("Banco receptor")).toBe("AFIRME");
    expect(byLabel.get("Cuenta beneficiaria")).toBe("062180300022233345");
  });

  it("prints the amount with two decimals, like the form", () => {
    const byLabel = new Map(
      portalFields(CEP).map((field) => [field.label, field.value]),
    );

    expect(byLabel.get("Monto")).toBe("0.01");
  });
});

describe("portalClipboardText", () => {
  it("is one line per field, so it pastes into a note and reads", () => {
    const lines = portalClipboardText(CEP).split("\n");

    expect(lines).toHaveLength(portalFields(CEP).length);
    expect(lines[0]).toBe("Fecha: 09-09-2026");
  });
});
