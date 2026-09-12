import { describe, expect, it } from "bun:test";
import type { VerifiedBeneficiary } from "../lib/contract";
import { groupBySupplier } from "./CepScreen";

function row(
  supplierRfc: string,
  clabe: string,
  verifiedAt: string,
): VerifiedBeneficiary {
  return {
    supplierRfc,
    clabe,
    verifiedAt,
    cep: {
      claveRastreo: `CEP-${clabe.slice(-4)}`,
      transferredAt: verifiedAt,
      amount: 0.01,
      senderName: "Distribuidora Sintetica del Norte SA de CV",
      senderBank: "BANORTE",
      beneficiaryName: "Proveedor Sintetico SA de CV",
      beneficiaryAccount: clabe,
      beneficiaryBank: "BBVA MEXICO",
      signatureValid: true,
      xml: "<SPEI_Tercero/>",
      synthetic: true,
    },
  };
}

describe("groupBySupplier", () => {
  it("puts every account of one supplier under one entry", () => {
    const groups = groupBySupplier([
      row("SYN010101AAA", "012180100091764613", "2026-09-01T15:00:00.000Z"),
      row("SYN010101AAA", "014180004551203983", "2026-09-05T15:00:00.000Z"),
      row("SYN020202BBB", "072180100000000007", "2026-09-03T15:00:00.000Z"),
    ]);

    expect(groups).toHaveLength(2);
    expect(groups.map((group) => group.accounts.length).sort()).toEqual([1, 2]);
  });

  it("orders a supplier's accounts newest verification first", () => {
    const [group] = groupBySupplier([
      row("SYN010101AAA", "012180100091764613", "2026-09-01T15:00:00.000Z"),
      row("SYN010101AAA", "014180004551203983", "2026-09-05T15:00:00.000Z"),
    ]);

    expect(group?.accounts[0]?.verifiedAt).toBe("2026-09-05T15:00:00.000Z");
  });

  it("puts the supplier verified most recently at the top", () => {
    // The account verified during the demo is the one the judge just watched
    // being verified, so it is the one that has to be on screen.
    const groups = groupBySupplier([
      row("SYN010101AAA", "012180100091764613", "2026-09-01T15:00:00.000Z"),
      row("SYN020202BBB", "072180100000000007", "2026-09-09T15:00:00.000Z"),
    ]);

    expect(groups[0]?.supplierRfc).toBe("SYN020202BBB");
  });

  it("answers with nothing for an empty registry", () => {
    expect(groupBySupplier([])).toEqual([]);
  });

  it("keeps a supplier that appears once", () => {
    const groups = groupBySupplier([
      row("SYN010101AAA", "012180100091764613", "2026-09-01T15:00:00.000Z"),
    ]);

    expect(groups[0]?.accounts).toHaveLength(1);
  });
});
