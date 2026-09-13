/**
 * The one-cent verification, state by state.
 *
 * Two of these tests are here because the screen can mislead a judge in exactly
 * two ways: by calling a seal nobody checked valid, and by freezing on
 * "centavo enviado" because it stopped listening to the ledger. Neither is
 * visible in a screenshot, so both are pinned here.
 */

import { describe, expect, test } from "bun:test";
import type { VerificationStateName } from "./contract";
import { VERIFICATION_HELP, VERIFICATION_LABEL } from "./labels";
import { mockVerification, VERIFICATIONS } from "./mock";
import {
  advanceMockVerification,
  eventNamesInstruction,
  isInFlight,
  isSettled,
  notStartedVerification,
  sealVerdictOf,
  storedCepAt,
  syntheticClaveRastreo,
  verificationFailure,
} from "./verification";

const STATES: VerificationStateName[] = [
  "not_started",
  "cent_sent",
  "awaiting_cep",
  "cep_signed",
  "released",
  "blocked",
];

describe("sealVerdictOf", () => {
  test("calls a validated seal valid, and nothing else", () => {
    expect(sealVerdictOf("valid").state).toBe("valid");
    expect(sealVerdictOf("valid").label).toBe("sello valido");
  });

  test("never reads not_checked as valid", () => {
    /* The whole reason this function exists. A server with no
       BANXICO_CEP_CERT_PEM parsed the document and verified nothing, and that is
       the ordinary case rather than an edge one. */
    const verdict = sealVerdictOf("not_checked");

    expect(verdict.state).toBe("not_checked");
    expect(verdict.label).toBe("sello no verificado");
    expect(verdict.label).not.toContain("valido");
  });

  test("says out loud that not verified and invalid are different claims", () => {
    expect(sealVerdictOf("not_checked").detail).toContain(
      "no quiere decir invalido",
    );
  });

  test("reports an invalid seal as invalid", () => {
    expect(sealVerdictOf("invalid").state).toBe("invalid");
    expect(sealVerdictOf("invalid").label).toBe("sello invalido");
  });

  test("reads a value this build has never seen as not verified", () => {
    /* The value arrives over HTTP from a server that may be one version ahead.
       An unknown seal is one we did not verify, never one we vouch for. */
    for (const unknown of ["unconfirmed", "unconfirmed_scheme", "", "VALID"]) {
      expect(sealVerdictOf(unknown).state).toBe("not_checked");
    }
  });

  test("uses a different badge per state, so the colour carries it too", () => {
    const badges = new Set(
      ["valid", "not_checked", "invalid"].map(
        (state) => sealVerdictOf(state).badge,
      ),
    );

    expect(badges.size).toBe(3);
  });
});

describe("the state machine", () => {
  test("every state has a label and a sentence under it", () => {
    for (const state of STATES) {
      expect(VERIFICATION_LABEL[state].length).toBeGreaterThan(0);
      expect(VERIFICATION_HELP[state].length).toBeGreaterThan(0);
    }
  });

  test("names the large payment and not the centavo in the two endings", () => {
    /* The cent always leaves. "Liberado" is the large payment, and a clerk who
       reads it as "the centavo went out" has been told the wrong thing. */
    expect(VERIFICATION_LABEL.released).toBe("Pago liberado");
    expect(VERIFICATION_LABEL.blocked).toBe("Pago bloqueado");
  });

  test("only released and blocked are settled", () => {
    expect(STATES.filter(isSettled)).toEqual(["released", "blocked"]);
  });

  test("only the two waiting states keep the screen looking", () => {
    expect(STATES.filter(isInFlight)).toEqual(["cent_sent", "awaiting_cep"]);
  });

  test("not started carries no evidence it does not have", () => {
    const state = notStartedVerification("ins-1", "2026-09-12T00:00:00-06:00");

    expect(state.state).toBe("not_started");
    expect(state.claveRastreo).toBeNull();
    expect(state.sealState).toBeNull();
    expect(state.nameMatch).toBeNull();
    expect(state.decision).toBeNull();
  });
});

describe("storedCepAt", () => {
  const stored = { cepAt: "2026-09-12T09:15:42-06:00" };

  test("answers the instant the CEP landed, so the registry is re-read once", () => {
    expect(storedCepAt(stored, "api")).toBe(stored.cepAt);
  });

  test("is the same instant while the machine walks on to released or blocked", () => {
    /* The reload effect is keyed on this value, so a state name that changed
       under an unchanged CEP must not look like a second document. */
    expect(storedCepAt(stored, "api")).toBe(storedCepAt({ ...stored }, "api"));
  });

  test("is null before a CEP, so nothing is re-read on a cent that is still out", () => {
    expect(storedCepAt({ cepAt: null }, "api")).toBeNull();
    expect(storedCepAt(null, "api")).toBeNull();
  });

  test("is null offline, because a browser stored nothing in any registry", () => {
    expect(storedCepAt(stored, "mock")).toBeNull();
    expect(storedCepAt(stored, null)).toBeNull();
  });
});

describe("eventNamesInstruction", () => {
  const subject = { instructionId: "ins-2026w37-002" };

  test("matches the flat events, including the two kinds the rail appends", () => {
    for (const type of ["cent_sent", "cep_awaited", "payment_sent"]) {
      expect(
        eventNamesInstruction(
          {
            type,
            at: "2026-09-12T10:00:00-06:00",
            instructionId: subject.instructionId,
          },
          subject,
        ),
      ).toBe(true);
    }
  });

  test("matches an intake event through the instruction it carries", () => {
    expect(
      eventNamesInstruction(
        {
          type: "instruction_received",
          instruction: { id: subject.instructionId },
        },
        subject,
      ),
    ).toBe(true);
  });

  test("matches a decision through the instruction it decides", () => {
    expect(
      eventNamesInstruction(
        {
          type: "decision_made",
          decision: { instructionId: subject.instructionId },
        },
        subject,
      ),
    ).toBe(true);
  });

  test("matches a verified CEP through the clave de rastreo", () => {
    /* cep_verified names the transfer and no instruction, so the clave is the
       only thread back to the payment on screen. */
    const event = {
      type: "cep_verified",
      cep: { claveRastreo: "SYN20260912X1" },
    };

    expect(
      eventNamesInstruction(event, {
        ...subject,
        claveRastreo: "SYN20260912X1",
      }),
    ).toBe(true);
    expect(eventNamesInstruction(event, subject)).toBe(false);
  });

  test("ignores an event about another instruction", () => {
    expect(
      eventNamesInstruction(
        { type: "payment_sent", instructionId: "ins-2026w37-003" },
        subject,
      ),
    ).toBe(false);
  });

  test("ignores anything that is not an event, and an empty subject", () => {
    expect(eventNamesInstruction(null, subject)).toBe(false);
    expect(eventNamesInstruction("cent_sent", subject)).toBe(false);
    expect(
      eventNamesInstruction(
        { type: "payment_sent", instructionId: "" },
        { instructionId: "" },
      ),
    ).toBe(false);
  });
});

describe("verificationFailure", () => {
  test("reads a 409 as a payment already resolved, not as a breakage", () => {
    const failure = verificationFailure({
      status: 409,
      message: "already released",
    });

    expect(failure.title).toContain("ya se resolvio");
    expect(failure.message).toContain("liberada o bloqueada");
  });

  test("reads a 503 as a rail nobody configured, and names the variables", () => {
    const failure = verificationFailure({
      status: 503,
      message: "RAIL is unset on this server.",
    });

    expect(failure.title).toContain("riel");
    expect(failure.message).toContain("RAIL");
    /* The server's own sentence is what says which half is missing, so it
       survives into the message the clerk reads. */
    expect(failure.message).toContain("RAIL is unset on this server.");
  });

  test("reads a 404 as a folio this API did not answer for, and keeps its sentence", () => {
    /* Two different 404s reach this screen and only the API can tell them
       apart: an instruction this instance does not hold, and a server with no
       verification route yet. */
    const failure = verificationFailure({
      status: 404,
      message: "No route matches this request.",
    });

    expect(failure.title).toContain("No existe");
    expect(failure.message).toContain("No route matches this request.");
  });

  test("passes anything else through with the API's own sentence", () => {
    expect(
      verificationFailure({ status: 0, message: "The API is not reachable." })
        .message,
    ).toBe("The API is not reachable.");
  });
});

describe("the offline beat", () => {
  test("moves the first two steps and no further", () => {
    const at = "2026-09-12T18:00:00-06:00";
    const start = notStartedVerification("ins-2026w37-005", at);
    const sent = advanceMockVerification(start, at);
    const waiting = advanceMockVerification(sent, at);

    expect(sent.state).toBe("cent_sent");
    expect(sent.rail).toBe("nessie");
    expect(sent.claveRastreo).not.toBeNull();
    expect(waiting.state).toBe("awaiting_cep");
  });

  test("never invents a CEP, a holder name or a seal", () => {
    /* A browser with no API holds no signed document. Walking the mock into
       "CEP firmado por Banxico" would fabricate the evidence the control rests
       on, so the step past awaiting_cep does nothing at all. */
    const at = "2026-09-12T18:00:00-06:00";
    const waiting = advanceMockVerification(
      advanceMockVerification(notStartedVerification("ins-1", at), at),
      at,
    );
    const again = advanceMockVerification(waiting, at);

    expect(again).toBe(waiting);
    expect(again.sealState).toBeNull();
    expect(again.holderName).toBeNull();
  });

  test("leaves a settled payment exactly as it was", () => {
    const released = VERIFICATIONS["ins-2026w37-007"];

    expect(released).toBeDefined();
    expect(
      advanceMockVerification(
        released as NonNullable<typeof released>,
        "2026-09-12T18:00:00-06:00",
      ),
    ).toBe(released);
  });

  test("derives a clave nobody can mistake for a bank's", () => {
    const clave = syntheticClaveRastreo(
      "ins-2026w37-005",
      "2026-09-12T18:00:00-06:00",
    );

    expect(clave.startsWith("SYN20260912")).toBe(true);
    expect(clave).toBe(
      syntheticClaveRastreo("ins-2026w37-005", "2026-09-12T18:00:00-06:00"),
    );
  });
});

describe("the synthetic run", () => {
  test("carries every state, so ?data=mock can render all six", () => {
    const carried = new Set(
      Object.values(VERIFICATIONS).map((state) => state.state),
    );
    carried.add("not_started");

    expect([...carried].sort()).toEqual([...STATES].sort());
  });

  test("answers not_started for an instruction of the run nobody probed", () => {
    const state = mockVerification("ins-2026w37-001");

    expect(state?.state).toBe("not_started");
    expect(state?.instructionId).toBe("ins-2026w37-001");
  });

  test("answers nothing for a folio this run does not have", () => {
    expect(mockVerification("ins-2026w37-999")).toBeNull();
  });

  test("keys every row by the instruction it is about", () => {
    for (const [id, state] of Object.entries(VERIFICATIONS)) {
      expect(state.instructionId).toBe(id);
    }
  });

  test("names both sides only once the CEP is in", () => {
    /* A holder name before the CEP would be a name we do not have yet, and a
       nameMatch without both names is a comparison nobody made. */
    for (const state of Object.values(VERIFICATIONS)) {
      if (state.nameMatch !== null) {
        expect(typeof state.holderName).toBe("string");
        expect(typeof state.legalName).toBe("string");
        expect(state.cepAt).not.toBeNull();
      } else {
        expect(state.holderName).toBeNull();
      }
    }
  });

  test("only claims a valid seal where a CEP exists", () => {
    for (const state of Object.values(VERIFICATIONS)) {
      if (state.sealState !== null) {
        expect(state.cepAt).not.toBeNull();
      }
    }
  });

  test("carries the engine's decision on both endings and on neither other state", () => {
    for (const state of Object.values(VERIFICATIONS)) {
      expect([state.state, state.decision !== null]).toEqual([
        state.state,
        isSettled(state.state),
      ]);
    }
  });
});
