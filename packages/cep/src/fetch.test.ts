/**
 * Nothing in this file touches the network. `http` is a stub in every case, and
 * the Banxico portal is never contacted from the test suite, by design: it is a
 * public service with a rate limit and a CAPTCHA, and a CI run that hammers it is
 * both rude and flaky.
 */

import { describe, expect, it } from "bun:test";
import {
  buildValidaForm,
  CepFetchError,
  classifyPortalResponse,
  fetchCep,
  type HttpLike,
  portalDate,
  sessionCookieHeader,
} from "./fetch";
import { syntheticCepXml } from "./fixtures";

const QUERY = {
  date: "2026-09-11",
  claveRastreo: "SYN20260912000000001",
  senderBank: "40012",
  receiverBank: "90999",
  beneficiaryAccount: "014180000000123453",
  amount: 184300,
};

interface Recorded {
  url: string;
  init: RequestInit | undefined;
}

/** Records the calls and answers with the scripted responses, in order. */
function stub(responses: Response[]): { calls: Recorded[]; http: HttpLike } {
  const calls: Recorded[] = [];
  const queue = [...responses];
  const http: HttpLike = async (url, init) => {
    calls.push({ url, init });
    const next = queue.shift();
    if (next === undefined) {
      throw new Error(`no scripted response left for ${url}`);
    }
    return next;
  };
  return { calls, http };
}

function html(body: string, init: ResponseInit = {}): Response {
  return new Response(body, {
    status: 200,
    headers: { "content-type": "text/html" },
    ...init,
  });
}

function validaOk(): Response {
  return new Response("<html>consulta aceptada</html>", {
    status: 200,
    headers: { "set-cookie": "JSESSIONID=abc123; Path=/cep; HttpOnly" },
  });
}

/** Fails the test when the call succeeds, instead of quietly passing. */
async function fetchError(http: HttpLike): Promise<CepFetchError> {
  try {
    await fetchCep(QUERY, http);
  } catch (error) {
    return error as CepFetchError;
  }
  throw new Error("expected fetchCep to reject and it resolved");
}

describe("portalDate", () => {
  it("turns the ISO date the domain uses into the DD-MM-YYYY the form wants", () => {
    expect(portalDate("2026-09-11")).toBe("11-09-2026");
  });

  it("refuses a date already in the portal format, which would silently swap day and month", () => {
    expect(() => portalDate("11-09-2026")).toThrow(CepFetchError);
  });
});

describe("buildValidaForm", () => {
  it("posts every field the portal form posts", () => {
    const form = buildValidaForm(QUERY);
    expect(Object.fromEntries(form)).toEqual({
      tipoCriterio: "T",
      captcha: "c",
      tipoConsulta: "1",
      fecha: "11-09-2026",
      criterio: "SYN20260912000000001",
      emisor: "40012",
      receptor: "90999",
      cuenta: "014180000000123453",
      monto: "184300.00",
      receptorParticipante: "0",
    });
  });

  it("flags a payment made to the receiving bank itself", () => {
    expect(
      buildValidaForm({ ...QUERY, toBank: true }).get("receptorParticipante"),
    ).toBe("1");
  });

  it("sends the amount with two decimals, since the portal matches on the string", () => {
    expect(buildValidaForm({ ...QUERY, amount: 1000 }).get("monto")).toBe(
      "1000.00",
    );
    expect(buildValidaForm({ ...QUERY, amount: 0.01 }).get("monto")).toBe(
      "0.01",
    );
  });

  it("refuses an empty clave de rastreo before any request leaves", () => {
    expect(() => buildValidaForm({ ...QUERY, claveRastreo: "  " })).toThrow(
      CepFetchError,
    );
  });

  it("refuses a zero amount before any request leaves", () => {
    expect(() => buildValidaForm({ ...QUERY, amount: 0 })).toThrow(
      CepFetchError,
    );
  });
});

describe("classifyPortalResponse", () => {
  it("reads the rate limit even when the accents arrived mis-decoded", () => {
    const mangled =
      "Lo sentimos, pero ha excedido el n\u00famero m\u00e1ximo de consultas en este portal";
    expect(classifyPortalResponse(mangled)?.code).toBe("rate_limited");
    expect(
      classifyPortalResponse(
        "Lo sentimos, pero ha excedido el numero maximo de consultas en este portal",
      )?.code,
    ).toBe("rate_limited");
  });

  it("reads the four sentences the portal answers with instead of a status code", () => {
    expect(
      classifyPortalResponse(
        "No se encontr\u00f3 ning\u00fan pago con la informaci\u00f3n proporcionada",
      )?.code,
    ).toBe("not_found");
    expect(
      classifyPortalResponse(
        "El SPEI no ha recibido una orden de pago que cumpla con el criterio de b\u00fasqueda especificado",
      )?.code,
    ).toBe("no_payment_order");
    expect(
      classifyPortalResponse(
        "Con la informaci\u00f3n proporcionada se identific\u00f3 el siguiente pago",
      )?.code,
    ).toBe("cep_unavailable");
  });

  it("says nothing about a page with no sentinel in it", () => {
    expect(classifyPortalResponse("<html>ok</html>")).toBeUndefined();
  });
});

describe("sessionCookieHeader", () => {
  it("keeps only the name and value, dropping Path and HttpOnly", () => {
    expect(sessionCookieHeader(validaOk())).toBe("JSESSIONID=abc123");
  });

  it("returns undefined when the portal set no cookie", () => {
    expect(sessionCookieHeader(html("ok"))).toBeUndefined();
  });
});

describe("fetchCep", () => {
  it("posts valida.do then gets descarga.do on the same session", async () => {
    const { calls, http } = stub([validaOk(), html(syntheticCepXml())]);
    const cep = await fetchCep(QUERY, http, { synthetic: true });

    expect(calls.length).toBe(2);
    expect(calls[0]?.url).toBe("https://www.banxico.org.mx/cep/valida.do");
    expect(calls[0]?.init?.method).toBe("POST");
    expect(String(calls[0]?.init?.body)).toContain(
      "criterio=SYN20260912000000001",
    );
    expect(calls[1]?.url).toBe(
      "https://www.banxico.org.mx/cep/descarga.do?formato=XML",
    );
    expect(calls[1]?.init?.method).toBe("GET");
    expect(cep.claveRastreo).toBe("SYN20260912000000001");
    expect(cep.amount).toBe(184300);
    expect(cep.synthetic).toBe(true);
  });

  it("carries the session cookie from the first call into the second", async () => {
    const { calls, http } = stub([validaOk(), html(syntheticCepXml())]);
    await fetchCep(QUERY, http);
    const headers = calls[1]?.init?.headers as Record<string, string>;
    expect(headers.cookie).toBe("JSESSIONID=abc123");
  });

  it("never sends a cookie on the first call, since there is no session yet", async () => {
    const { calls, http } = stub([validaOk(), html(syntheticCepXml())]);
    await fetchCep(QUERY, http);
    const headers = calls[0]?.init?.headers as Record<string, string>;
    expect(headers.cookie).toBeUndefined();
  });

  it("reports the rate limit without retrying into it", async () => {
    const { calls, http } = stub([
      html(
        "Lo sentimos, pero ha excedido el n\u00famero m\u00e1ximo de consultas",
      ),
    ]);
    const error = await fetchError(http);
    expect(error.code).toBe("rate_limited");
    expect(calls.length).toBe(1);
  });

  it("reports a transfer the portal cannot find", async () => {
    const { http } = stub([
      html(
        "No se encontr\u00f3 ning\u00fan pago con la informaci\u00f3n proporcionada",
      ),
    ]);
    expect((await fetchError(http)).code).toBe("not_found");
  });

  it("reports a payment whose CEP is not available yet", async () => {
    const { http } = stub([
      html(
        "Con la informaci\u00f3n proporcionada se identific\u00f3 el siguiente pago",
      ),
    ]);
    expect((await fetchError(http)).code).toBe("cep_unavailable");
  });

  it("reports a portal error status rather than parsing the error page", async () => {
    const { http } = stub([html("gateway down", { status: 503 })]);
    const error = await fetchError(http);
    expect(error.code).toBe("http_error");
    expect(error.message).toContain("503");
  });

  it("reports a download that answered with a login page instead of a CEP", async () => {
    const { http } = stub([validaOk(), html("<html>sesion expirada</html>")]);
    expect((await fetchError(http)).code).toBe("not_a_cep");
  });

  it("honours a base URL override, so a local fake portal needs no network", async () => {
    const { calls, http } = stub([validaOk(), html(syntheticCepXml())]);
    await fetchCep(QUERY, http, { baseUrl: "https://example.test/cep/" });
    expect(calls[0]?.url).toBe("https://example.test/cep/valida.do");
  });
});
