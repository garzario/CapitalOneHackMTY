/**
 * The no-API path, both halves of it.
 *
 * The file is asserted byte for byte, because a bank portal rejects a file for
 * reasons it does not explain and the only defence is a test that pins the bytes. The
 * response reader is asserted on the shapes a portal actually hands back: a header in
 * the wrong order, a semicolon instead of a comma, a rejected line, and the one case
 * it has to refuse, which is a line reported as paid with no clave de rastreo on it.
 */

import { describe, expect, it } from "bun:test";
import {
  LAYOUT_COLUMNS,
  LAYOUT_NEWLINE,
  LayoutRail,
  layoutFile,
  readLayoutResponse,
} from "./layout";
import { type PaymentOrder, RailConfigError } from "./rail";

const CLABE = "012180101391764613";

function order(overrides: Partial<PaymentOrder> = {}): PaymentOrder {
  return {
    instructionId: "INS-2026-09-07-047",
    runId: "run-2026w37",
    beneficiaryAccount: CLABE,
    amount: 42180.5,
    beneficiary: {
      legalName: "Aceros y Laminas del Norte SA de CV",
      rfc: "SYN080910HI8",
      cfdiUuids: ["a1b2c3d4-1111-2222-3333-444455556666"],
    },
    ...overrides,
  };
}

describe("LayoutRail", () => {
  it("queues a line and claims nothing about it having left", async () => {
    const rail = new LayoutRail({ now: () => "2026-09-12T18:00:00.000Z" });
    const sent = await rail.send(order());

    expect(sent.state).toBe("queued");
    // No clave de rastreo, because the bank has not seen the file yet. A clave here
    // would be a string this repository invented for a transfer nobody ordered.
    expect(sent.claveRastreo).toBeUndefined();
    // And no rail id, because the participant that will execute the file is the
    // company's own bank and this product does not know which one it is.
    expect(sent.rail).toBeUndefined();
    expect(sent.simulated).toBe(false);
    expect(sent.reference).toBe("0000001");
    expect(rail.queued).toHaveLength(1);
  });

  it("writes the six columns a portal asks for, with the total as centavos", async () => {
    const rail = new LayoutRail();
    await rail.send(order());
    await rail.send(
      order({
        instructionId: "INS-2026-09-07-048",
        amount: 1234.5,
        beneficiary: {
          // A comma in a legal name is what breaks a hand-rolled CSV writer.
          legalName: "Recubrimientos, Ceramicos de Pesqueria SA de CV",
          rfc: "SYN260401R43",
          cfdiUuids: [],
        },
      }),
    );

    const file = rail.file();
    const rows = file.split(LAYOUT_NEWLINE);

    expect(rows[0]).toBe(LAYOUT_COLUMNS.join(","));
    expect(rows[1]).toBe(
      `${CLABE},Aceros y Laminas del Norte SA de CV,SYN080910HI8,42180.50,0000001,Facturas A1B2C3D4`,
    );
    expect(rows[2]).toBe(
      `${CLABE},"Recubrimientos, Ceramicos de Pesqueria SA de CV",SYN260401R43,1234.50,0000002,Pago de facturas`,
    );
    // Trailing newline: a portal that reads the last line only when it ends is a
    // portal that drops the last payment of the week.
    expect(file.endsWith(LAYOUT_NEWLINE)).toBe(true);
  });

  it("refuses a line with no beneficiary rather than writing a nameless row", async () => {
    const rail = new LayoutRail();
    await expect(
      rail.send(order({ beneficiary: undefined })),
    ).rejects.toBeInstanceOf(RailConfigError);
  });

  it("refuses an amount that is not a whole number of centavos", async () => {
    const rail = new LayoutRail();
    await expect(rail.send(order({ amount: 10.005 }))).rejects.toThrow(
      /centavos/,
    );
  });

  it("builds the same file from the lines alone", async () => {
    const rail = new LayoutRail();
    await rail.send(order());
    expect(layoutFile(rail.queued)).toBe(rail.file());
  });
});

describe("readLayoutResponse", () => {
  it("recovers the clave de rastreo of every paid line", () => {
    const rows = readLayoutResponse(
      [
        "referencia,clave de rastreo,estado",
        "0000001,BBVA20260912000001,PAGADO",
        "0000002,BBVA20260912000002,Aplicado",
        "",
      ].join("\r\n"),
    );

    expect(rows).toEqual([
      {
        referencia: "0000001",
        state: "settled",
        claveRastreo: "BBVA20260912000001",
      },
      {
        referencia: "0000002",
        state: "settled",
        claveRastreo: "BBVA20260912000002",
      },
    ]);
  });

  it("reads a header in another order, another spelling and another separator", () => {
    const rows = readLayoutResponse(
      [
        "Estatus;Motivo;Clave_Rastreo;Referencia Numerica",
        "Pagado;;BBVA20260912000007;0000007",
      ].join("\n"),
    );

    expect(rows).toEqual([
      {
        referencia: "0000007",
        state: "settled",
        claveRastreo: "BBVA20260912000007",
      },
    ]);
  });

  it("carries the portal's own sentence on a refused line", () => {
    const rows = readLayoutResponse(
      [
        "referencia,clave de rastreo,estado,motivo",
        "0000003,,RECHAZADO,Cuenta CLABE inexistente",
      ].join("\n"),
    );

    expect(rows[0]).toEqual({
      referencia: "0000003",
      state: "failed",
      reason: "Cuenta CLABE inexistente",
    });
  });

  it("drops a line reported as paid with no clave, rather than inventing one", () => {
    const rows = readLayoutResponse(
      ["referencia,clave de rastreo,estado", "0000004,,PAGADO"].join("\n"),
    );

    expect(rows).toEqual([]);
  });

  it("reads a file with no header positionally", () => {
    const rows = readLayoutResponse("0000005,BBVA20260912000005,PAGADO");

    expect(rows).toEqual([
      {
        referencia: "0000005",
        state: "settled",
        claveRastreo: "BBVA20260912000005",
      },
    ]);
  });

  it("answers nothing for an empty file", () => {
    expect(readLayoutResponse("")).toEqual([]);
    expect(readLayoutResponse("\r\n\r\n")).toEqual([]);
  });
});
