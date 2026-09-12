import { describe, expect, it } from "bun:test";
import { createTestApp } from "../test-app";

type ErrorBody = { error: { code: string; message: string } };

async function bytes(res: Response): Promise<Uint8Array> {
  return new Uint8Array(await res.arrayBuffer());
}

/**
 * The PDF is Latin-1 bytes, and `TextDecoder` in this workspace is typed
 * against the Node encodings, so the bytes are widened by hand. It is three
 * lines and it keeps the assertions readable.
 */
function asText(raw: Uint8Array): string {
  let out = "";
  for (const byte of raw) {
    out += String.fromCharCode(byte);
  }
  return out;
}

/** The version the fixture publishes, taken from the endpoint rather than typed. */
async function aLoadedVersion(
  app: ReturnType<typeof createTestApp>["app"],
): Promise<string> {
  const body = (await (await app.request("/api/v1/sat/versions")).json()) as {
    versions: { listVersion: string }[];
  };
  return body.versions[0]?.listVersion ?? "";
}

describe("GET /api/v1/sat/constancia", () => {
  it("answers with a PDF a reader can open", async () => {
    const { app } = createTestApp();
    const res = await app.request(
      `/api/v1/sat/constancia?listVersion=${encodeURIComponent(await aLoadedVersion(app))}`,
    );

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");

    const raw = await bytes(res);
    expect(asText(raw).startsWith("%PDF-1.4")).toBe(true);
    expect(asText(raw).trimEnd().endsWith("%%EOF")).toBe(true);
  });

  it("serves it inline with a filename a person can find again", async () => {
    const { app } = createTestApp();
    const version = await aLoadedVersion(app);
    const res = await app.request(
      `/api/v1/sat/constancia?listVersion=${encodeURIComponent(version)}`,
    );

    expect(res.headers.get("content-disposition")).toContain("inline");
    expect(res.headers.get("content-disposition")).toContain(
      "constancia-sweep",
    );
    // A constancia is a statement about a moment, so a cache would hand back
    // yesterday's exposure after a new version landed.
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("names the version, the DOF date and the denominator", async () => {
    const { app } = createTestApp();
    const version = await aLoadedVersion(app);
    const text = asText(
      await bytes(
        await app.request(
          `/api/v1/sat/constancia?listVersion=${encodeURIComponent(version)}`,
        ),
      ),
    );

    expect(text).toContain(`(${version}) Tj`);
    expect(text).toContain("(Proveedores cotejados) Tj");
    expect(text).toContain("(Publicacion en el DOF) Tj");
  });

  it("prints the ledger digest and refuses to call it a signature", async () => {
    const { app } = createTestApp();
    const version = await aLoadedVersion(app);
    const text = asText(
      await bytes(
        await app.request(
          `/api/v1/sat/constancia?listVersion=${encodeURIComponent(version)}`,
        ),
      ),
    );

    expect(text).toContain("(sha256) Tj");
    expect(text).toContain("no una firma electronica");
  });

  it("refuses a version this instance never held, rather than printing an empty one", async () => {
    const { app } = createTestApp();
    const res = await app.request(
      "/api/v1/sat/constancia?listVersion=1999-01-01",
    );

    expect(res.status).toBe(404);
    expect(((await res.json()) as ErrorBody).error.code).toBe("not_found");
  });

  it("rejects a request with no version through the shared envelope", async () => {
    const { app } = createTestApp();
    const res = await app.request("/api/v1/sat/constancia");

    expect(res.status).toBe(400);
    expect(((await res.json()) as ErrorBody).error.code).toBe("bad_request");
  });

  it("gives the same bytes twice, because the clock is the only moving part", async () => {
    const { app } = createTestApp();
    const version = await aLoadedVersion(app);
    const path = `/api/v1/sat/constancia?listVersion=${encodeURIComponent(version)}`;

    expect(await bytes(await app.request(path))).toEqual(
      await bytes(await app.request(path)),
    );
  });
});

describe("GET /api/v1/run/:id/constancia", () => {
  it("answers with a PDF for the current run", async () => {
    const { app } = createTestApp();
    const res = await app.request("/api/v1/run/current/constancia");

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
    expect(asText(await bytes(res)).startsWith("%PDF")).toBe(true);
  });

  it("answers for the run's own id as well as for the alias", async () => {
    const { app } = createTestApp();
    const run = (await (await app.request("/api/v1/run/current")).json()) as {
      id: string;
    };
    const res = await app.request(
      `/api/v1/run/${encodeURIComponent(run.id)}/constancia`,
    );

    expect(res.status).toBe(200);
  });

  it("carries the resolution counts and the findings of the run", async () => {
    const { app } = createTestApp();
    const text = asText(
      await bytes(await app.request("/api/v1/run/current/constancia")),
    );

    expect(text).toContain("(Instrucciones revisadas) Tj");
    expect(text).toContain("detenidas");
    expect(text).toContain("(Hallazgos con detalle) Tj");
  });

  it("watermarks the synthetic company on the document itself", async () => {
    const { app } = createTestApp();
    const text = asText(
      await bytes(await app.request("/api/v1/run/current/constancia")),
    );

    // ADR-0002: the watermark comes from the flag on the record, never from a
    // name, and a demo document must never be mistakable for a real one.
    expect(text).toContain("DATOS SINTETICOS");
  });

  it("refuses a run that does not exist", async () => {
    const { app } = createTestApp();
    const res = await app.request("/api/v1/run/run-1999/constancia");

    expect(res.status).toBe(404);
  });
});
