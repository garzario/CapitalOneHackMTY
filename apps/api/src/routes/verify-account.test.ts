/**
 * The HTTP half of the one-cent verification: four status codes and one shape.
 *
 * The pipeline itself is asserted in `src/verification.test.ts`. What is asserted
 * here is the contract in docs/09-api.md: a `202` whose body is a
 * `VerificationState`, a `404` for an instruction nobody holds, a `409` once the
 * payment is resolved, a `503` naming the variables when this server has no rail,
 * and the same payload from `GET .../verification` that the stream tells a screen
 * to re-read.
 */

import { describe, expect, it } from "bun:test";
import { syntheticCepFor } from "@hackmty/cep";
import type { Cep } from "@hackmty/core";
import { FakeRail } from "@hackmty/rail";
import { staticCepInbox } from "../cep";
import { verificationStateSchema } from "../schemas";
import { createTestApp, flush, TEST_NOW } from "../test-app";

const HELD_ID = "ins-2026w37-01";
const HELD_CLABE = "058580000123456812";
const SUPPLIER_LEGAL_NAME = "Aceros y Perfiles del Norte SA de CV";
const CLAVE = "SYNVER0000000001";

type ErrorBody = {
  error: { code: string; message: string; requestId: string };
};

function matchingCep(): Cep {
  return syntheticCepFor({
    claveRastreo: CLAVE,
    transferredAt: "2026-09-12T09:15:42.000-06:00",
    amount: 0.01,
    senderName: "Distribuidora Sintetica del Norte SA de CV",
    senderBank: "SinteticoDos",
    senderAccount: "012180000123456782",
    senderRfc: "SYN090615C01",
    beneficiaryName: SUPPLIER_LEGAL_NAME.toUpperCase(),
    beneficiaryBank: "SinteticoUno",
    beneficiaryAccount: HELD_CLABE,
    beneficiaryRfc: "SYN010101AAA",
    concepto: "Verificacion de cuenta",
  });
}

function withRail(ceps: readonly Cep[] = []) {
  return createTestApp({
    rail: async () => ({
      ok: true,
      rail: new FakeRail({ now: () => TEST_NOW }),
    }),
    cepInbox: staticCepInbox(ceps, "test CEP index"),
  });
}

function post(app: ReturnType<typeof withRail>["app"], id: string) {
  return app.request(
    `/api/v1/instructions/${encodeURIComponent(id)}/verify-account`,
    { method: "POST" },
  );
}

describe("POST /api/v1/instructions/:id/verify-account", () => {
  it("answers 202 with the verification as far as it got", async () => {
    const { app } = withRail([matchingCep()]);

    const response = await post(app, HELD_ID);
    const body = verificationStateSchema.parse(await response.json());

    expect(response.status).toBe(202);
    expect(body.instructionId).toBe(HELD_ID);
    expect(body.state).toBe("released");
    expect(body.claveRastreo).toBe(CLAVE);
    expect(body.sealState).toBe("not_checked");
  });

  /** The cent has left and the CEP is published later. That is not a 200. */
  it("answers 202 on the waiting path too, with the clave the clerk needs", async () => {
    const { app } = withRail();

    const response = await post(app, HELD_ID);
    const body = verificationStateSchema.parse(await response.json());

    expect(response.status).toBe(202);
    expect(body.state).toBe("awaiting_cep");
    expect(body.claveRastreo).toBe(CLAVE);
    expect(body.decision).toBeNull();
  });

  it("answers 404 for an instruction nobody holds", async () => {
    const { app } = withRail();

    const response = await post(app, "ins-nope");
    const body = (await response.json()) as ErrorBody;

    expect(response.status).toBe(404);
    expect(body.error.code).toBe("not_found");
  });

  it("answers 409 once the payment is released, rather than spending a second cent", async () => {
    const { app } = withRail([matchingCep()]);

    await post(app, HELD_ID);
    const response = await post(app, HELD_ID);
    const body = (await response.json()) as ErrorBody;

    expect(response.status).toBe(409);
    expect(body.error.code).toBe("conflict");
    expect(body.error.message).toContain(CLAVE);
  });

  /**
   * A server with no rail is our configuration and not a bad request, so it is a
   * 503 that names the variables. A 422 would tell a clerk they got it wrong.
   */
  it("answers 503 and names the variables when there is no rail", async () => {
    const { app } = createTestApp();

    const response = await post(app, HELD_ID);
    const body = (await response.json()) as ErrorBody;

    expect(response.status).toBe(503);
    expect(body.error.code).toBe("unavailable");
    expect(body.error.message).toContain("RAIL=nessie");
    expect(body.error.message).toContain("RAIL=stp");
  });
});

describe("GET /api/v1/instructions/:id/verification", () => {
  it("answers not_started before the cent has been sent", async () => {
    const { app } = withRail();

    const response = await app.request(
      `/api/v1/instructions/${HELD_ID}/verification`,
    );
    const body = verificationStateSchema.parse(await response.json());

    expect(response.status).toBe(200);
    expect(body.state).toBe("not_started");
    expect(body.rail).toBeNull();
    // The legal name is there from the start: it is the CFDI side of the
    // comparison and the screen shows it next to the holder when one arrives.
    expect(body.legalName).toBe(SUPPLIER_LEGAL_NAME);
  });

  it("answers the same state the POST left behind", async () => {
    const { app } = withRail([matchingCep()]);

    await post(app, HELD_ID);
    const response = await app.request(
      `/api/v1/instructions/${HELD_ID}/verification`,
    );
    const body = verificationStateSchema.parse(await response.json());

    expect(body.state).toBe("released");
    expect(body.holderName).toBe(SUPPLIER_LEGAL_NAME.toUpperCase());
    expect(body.nameMatch).toBe("match");
    expect(body.decision?.decidedBy).toBe("system");
  });

  it("answers 404 for an instruction nobody holds", async () => {
    const { app } = withRail();

    const response = await app.request(
      "/api/v1/instructions/ins-nope/verification",
    );

    expect(response.status).toBe(404);
  });
});

describe("the stream", () => {
  /**
   * The web re-reads `GET .../verification` whenever an event names the
   * instruction, so the two new kinds have to reach the stream like every other
   * ledger event. Nothing about the verification is pushed on a private channel.
   */
  it("broadcasts the new event kinds to an open subscriber", async () => {
    const { app, deps } = withRail([matchingCep()]);
    const seen: string[] = [];
    const stop = deps.events.subscribe((event) => seen.push(event.type));

    await post(app, HELD_ID);
    await flush();
    stop();

    expect(seen).toContain("cent_sent");
    expect(seen).toContain("cep_verified");
    expect(seen).toContain("decision_made");
  });

  it("broadcasts cep_awaited when the CEP is not published yet", async () => {
    const { app, deps } = withRail();
    const seen: string[] = [];
    const stop = deps.events.subscribe((event) => seen.push(event.type));

    await post(app, HELD_ID);
    await flush();
    stop();

    expect(seen).toEqual(["cent_sent", "cep_awaited"]);
  });
});
