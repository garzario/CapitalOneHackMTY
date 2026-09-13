/**
 * `GET /api/v1/instructions/:id/carta`, asserted on the four things the letter
 * promises: it is a real PDF on one page, it names every signal including the ones
 * that could not answer, it carries the level and the state the run carries for the
 * same line, and it names the article when a definitive listing cancelled it.
 *
 * The assertions read the rendered bytes, which is what a person opening the file
 * sees. A test over the input object would prove the route assembled something and
 * nothing about the page.
 */

import { describe, expect, it } from "bun:test";
import { paymentRunSchema } from "../schemas";
import { createTestApp } from "../test-app";

/** The fixture line whose supplier the seeded 69-B list names. */
const LISTED_RFC = "SYN020202BBB";

/**
 * The bytes as latin1, one code unit per byte.
 *
 * Hand rolled rather than `new TextDecoder("latin1")` because the `@types/bun`
 * `Encoding` union in this workspace does not carry that label, and a PDF content
 * stream is latin1 by the file format: decoding it as UTF-8 would mangle every
 * accented character in the Spanish copy under test.
 */
function text(bytes: ArrayBuffer): string {
  let out = "";
  for (const byte of new Uint8Array(bytes)) {
    out += String.fromCharCode(byte);
  }
  return out;
}

/** Only what is drawn on the page: the file header carries a percent sign. */
function drawn(page: string): string {
  return [...page.matchAll(/\((.*?)\) Tj/g)].map((match) => match[1]).join(" ");
}

async function anyInstructionId(
  app: ReturnType<typeof createTestApp>["app"],
  rfc?: string,
): Promise<string> {
  const run = paymentRunSchema.parse(
    await (await app.request("/api/v1/run/current")).json(),
  );
  const item =
    rfc === undefined
      ? run.items[0]
      : run.items.find((row) => row.supplier.rfc === rfc);
  if (item === undefined) {
    throw new Error(`the fixture holds no line for ${rfc ?? "any supplier"}`);
  }
  return item.instruction.id;
}

describe("GET /api/v1/instructions/:id/carta", () => {
  it("answers a real PDF, inline, never cached", async () => {
    const { app } = createTestApp();
    const id = await anyInstructionId(app);
    const res = await app.request(`/api/v1/instructions/${id}/carta`);

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
    expect(res.headers.get("content-disposition")).toBe(
      `inline; filename="carta-${id}.pdf"`,
    );
    expect(res.headers.get("cache-control")).toBe("no-store");

    const page = text(await res.arrayBuffer());
    expect(page.startsWith("%PDF-1.4")).toBe(true);
    expect(page).toContain("/Type /Pages /Count 1");
  });

  it("names every signal, including the two that could not answer", async () => {
    const { app } = createTestApp();
    const id = await anyInstructionId(app, LISTED_RFC);
    const page = text(
      await (
        await app.request(`/api/v1/instructions/${id}/carta`)
      ).arrayBuffer(),
    );

    expect(page).toContain("Lista 69-B del SAT");
    expect(page).toContain("Lista 49 Bis del SAT");
    expect(page).toContain("Cuenta y plaza");
    expect(page).toContain("Historial de pagos");
    expect(page).toContain("CEP de Banxico");
    expect(page).toContain("Llamada al proveedor");
    expect(page).toContain("Documentos recibidos");

    /* The two that cannot answer on this fixture say why, and neither says "no
       esta listado" or leaves a blank. A blank next to a control reads as a
       control that passed. */
    expect(page).toContain("No se pudo cotejar");
    expect(page).toContain("no se envio el centavo de verificacion");
    expect(page).toContain("no se registro ninguna llamada");
  });

  it("carries the level and the state the run carries for the same line", async () => {
    const { app } = createTestApp();
    const run = paymentRunSchema.parse(
      await (await app.request("/api/v1/run/current")).json(),
    );
    const item = run.items.find((row) => row.supplier.rfc === LISTED_RFC);
    if (item === undefined) {
      throw new Error("the fixture holds no listed supplier");
    }

    const page = drawn(
      text(
        await (
          await app.request(`/api/v1/instructions/${item.instruction.id}/carta`)
        ).arrayBuffer(),
      ),
    );

    expect(item.confidence).toBe("alerta");
    expect(page).toContain("Alerta, porque");
    expect(page).toContain(item.supplier.legalName);
  });

  it("names the article once the publication cancelled the line", async () => {
    const { app } = createTestApp();
    await app.request("/api/v1/sat/publish", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        simulate: true,
        rfcs: [LISTED_RFC],
        status: "definitivo",
      }),
    });

    const id = await anyInstructionId(app, LISTED_RFC);
    const page = drawn(
      text(
        await (
          await app.request(`/api/v1/instructions/${id}/carta`)
        ).arrayBuffer(),
      ),
    );

    expect(page).toContain("articulo 69-B");
    expect(page).toContain("Cancelado. No sale con esta evidencia");
    expect(page).toContain("Definitivo desde el");
  });

  it("prints four digits of the account and never the other fourteen", async () => {
    const { app } = createTestApp();
    const run = paymentRunSchema.parse(
      await (await app.request("/api/v1/run/current")).json(),
    );
    const item = run.items[0];
    if (item === undefined) {
      throw new Error("the fixture holds no lines");
    }

    const page = drawn(
      text(
        await (
          await app.request(`/api/v1/instructions/${item.instruction.id}/carta`)
        ).arrayBuffer(),
      ),
    );

    expect(page).toContain(`terminada en ${item.instruction.clabe.slice(-4)}`);
    expect(page).not.toContain(item.instruction.clabe);
  });

  it("never prints a percentage, a score or the word this product bans", async () => {
    const { app } = createTestApp();
    const id = await anyInstructionId(app);
    const page = drawn(
      text(
        await (
          await app.request(`/api/v1/instructions/${id}/carta`)
        ).arrayBuffer(),
      ),
    );

    expect(page.toLowerCase()).not.toContain("seguro");
    expect(page).not.toContain("%");
    expect(page).toContain("No es una probabilidad ni una calificacion");
  });

  it("watermarks the page, because this company is generated", async () => {
    const { app } = createTestApp();
    const id = await anyInstructionId(app);
    const page = text(
      await (
        await app.request(`/api/v1/instructions/${id}/carta`)
      ).arrayBuffer(),
    );

    expect(page).toContain("DATOS SINTETICOS");
  });

  it("answers 404 for an instruction this instance never held", async () => {
    const { app } = createTestApp();
    const res = await app.request("/api/v1/instructions/INS-NOPE/carta");

    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({
      error: { code: "not_found" },
    });
  });

  it("produces the same bytes twice, which is what the huella rests on", async () => {
    const { app } = createTestApp();
    const id = await anyInstructionId(app);
    const once = await (
      await app.request(`/api/v1/instructions/${id}/carta`)
    ).arrayBuffer();
    const twice = await (
      await app.request(`/api/v1/instructions/${id}/carta`)
    ).arrayBuffer();

    expect(new Uint8Array(once)).toEqual(new Uint8Array(twice));
  });
});
