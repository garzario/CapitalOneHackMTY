/**
 * Every name here is invented. The cases are the real ways two correct strings
 * differ in Mexico, and the real ways two wrong ones look similar.
 */

import { describe, expect, it } from "bun:test";
import { SYNTHETIC_BENEFICIARY_LEGAL_NAME, syntheticCep } from "./fixtures";
import {
  nameCore,
  nameMatch,
  normalizeLegalName,
  normalizeName,
} from "./name-match";

describe("normalizeName", () => {
  it("folds accents, N tilde and case the way a bank prints them", () => {
    expect(normalizeName("Mu\u00f1oz Pe\u00f1a")).toBe("MUNOZ PENA");
    expect(normalizeName("Sint\u00e9tica")).toBe("SINTETICA");
  });

  it("turns the ampersand into Y instead of deleting it", () => {
    expect(normalizeName("Garza & Asociados")).toBe("GARZA Y ASOCIADOS");
  });

  it("collapses the three ways a legal form gets punctuated", () => {
    expect(normalizeName("Acme, S.A. de C.V.")).toBe("ACME S A DE C V");
    expect(normalizeName("ACME  SA   DE CV")).toBe("ACME SA DE CV");
  });
});

describe("nameCore", () => {
  it("strips SA DE CV however it is written", () => {
    expect(normalizeLegalName("Acme Sintetica, S.A. de C.V.")).toBe(
      "ACME SINTETICA",
    );
    expect(normalizeLegalName("ACME SINTETICA SA DE CV")).toBe(
      "ACME SINTETICA",
    );
    expect(normalizeLegalName("ACME SINTETICA S.A.P.I. DE C.V.")).toBe(
      "ACME SINTETICA",
    );
    expect(normalizeLegalName("ACME SINTETICA S DE RL DE CV")).toBe(
      "ACME SINTETICA",
    );
    expect(normalizeLegalName("ACME SINTETICA SOFOM ENR")).toBe(
      "ACME SINTETICA",
    );
  });

  it("only strips the legal form from the end, never from the middle", () => {
    expect(normalizeLegalName("CASA DE BOLSA SINTETICA SA DE CV")).toBe(
      "CASA DE BOLSA SINTETICA",
    );
  });

  it("returns nothing for a string that is only a legal form", () => {
    expect(nameCore("S.A. DE C.V.")).toEqual([]);
  });

  it("returns nothing for the NA and ND placeholders banks send", () => {
    expect(nameCore("NA")).toEqual([]);
    expect(nameCore("ND")).toEqual([]);
  });
});

describe("nameMatch says match only on real agreement", () => {
  it("matches across accents, punctuation and the societary type", () => {
    expect(
      nameMatch(
        "DISTRIBUIDORA SINTETICA DEL PONIENTE SA",
        "Distribuidora Sint\u00e9tica del Poniente, S.A. de C.V.",
      ),
    ).toBe("match");
  });

  it("matches the fixture beneficiary against its own CFDI legal name", () => {
    expect(
      nameMatch(
        syntheticCep().beneficiaryName,
        SYNTHETIC_BENEFICIARY_LEGAL_NAME,
      ),
    ).toBe("match");
  });

  it("matches a name the bank cut at the 40 character field limit", () => {
    expect(
      nameMatch(
        "CONSTRUCTORA Y URBANIZADORA SINTETICA DE",
        "CONSTRUCTORA Y URBANIZADORA SINTETICA DEL BAJIO SA DE CV",
      ),
    ).toBe("match");
  });

  it("matches a natural person whose second surname the bank dropped", () => {
    expect(
      nameMatch("JUAN CARLOS PEREZ", "Juan Carlos P\u00e9rez Gonz\u00e1lez"),
    ).toBe("match");
  });

  it("matches the ampersand spelled out", () => {
    expect(nameMatch("GARZA & ASOCIADOS SC", "Garza y Asociados, S.C.")).toBe(
      "match",
    );
  });
});

describe("nameMatch says partial when a human has to look", () => {
  it("flags two companies that share only the head word", () => {
    expect(
      nameMatch(
        "COMERCIALIZADORA DEL NORTE SA DE CV",
        "Comercializadora del Sur, S.A. de C.V.",
      ),
    ).toBe("partial");
  });

  it("flags two people who share a surname", () => {
    expect(nameMatch("PEDRO PEREZ", "Juan P\u00e9rez")).toBe("partial");
  });

  it("refuses to call a two-word prefix a match when nothing was truncated", () => {
    expect(nameMatch("GRUPO SINTETICO", "Grupo Sintetico Alfa SA de CV")).toBe(
      "partial",
    );
  });

  it("flags a surname alone against a full name", () => {
    expect(nameMatch("PEREZ", "Juan Carlos P\u00e9rez Gonz\u00e1lez")).toBe(
      "partial",
    );
  });
});

describe("nameMatch says mismatch when there is no evidence at all", () => {
  it("reports two unrelated entities", () => {
    expect(
      nameMatch(
        "ROBERTO SANCHEZ MORA",
        "Aceros Sinteticos del Bajio, S.A. de C.V.",
      ),
    ).toBe("mismatch");
  });

  it("does not let two shared legal forms look like agreement", () => {
    expect(nameMatch("ALFA SA DE CV", "BETA SA DE CV")).toBe("mismatch");
  });

  it("does not let two shared connectors look like agreement", () => {
    expect(nameMatch("CASA DE LA MONEDA", "TIENDA DE LA ESQUINA")).toBe(
      "mismatch",
    );
  });

  it("reports an empty CEP name rather than treating it as agreement", () => {
    expect(nameMatch("", "Acme Sintetica SA de CV")).toBe("mismatch");
  });

  it("reports the NA placeholder as no evidence, not as a valid name", () => {
    expect(nameMatch("NA", "Acme Sintetica SA de CV")).toBe("mismatch");
  });

  it("reports a CEP name that is only a legal form", () => {
    expect(nameMatch("S.A. DE C.V.", "Acme Sintetica SA de CV")).toBe(
      "mismatch",
    );
  });
});

describe("nameMatch is symmetric", () => {
  it("gives the same answer whichever side the CEP name is on", () => {
    const pairs: Array<[string, string]> = [
      [
        "DISTRIBUIDORA SINTETICA DEL PONIENTE SA",
        SYNTHETIC_BENEFICIARY_LEGAL_NAME,
      ],
      [
        "COMERCIALIZADORA DEL NORTE SA DE CV",
        "Comercializadora del Sur SA de CV",
      ],
      ["ROBERTO SANCHEZ MORA", "Aceros Sinteticos del Bajio SA de CV"],
      ["JUAN CARLOS PEREZ", "Juan Carlos P\u00e9rez Gonz\u00e1lez"],
    ];
    for (const [cep, legal] of pairs) {
      expect(nameMatch(cep, legal)).toBe(nameMatch(legal, cep));
    }
  });
});
