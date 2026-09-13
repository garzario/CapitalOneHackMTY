/**
 * The three sentences the payments screen composes, and they are the three it can
 * get wrong in a way nobody notices until a judge reads the screen.
 *
 * The button, because a control that says "Enviar corrida" twice cannot tell a
 * clerk that the second press is the one that moves money. The rail, because
 * ADR-0008 says somebody will be tempted to shorten that claim and the screen is one
 * of the three places that make the short version fail. And the progress, because
 * "34 de 86 lineas" is the only honest way to say how far a run has got when a
 * percentage is forbidden on every screen of this product.
 */

import { describe, expect, test } from "bun:test";
import type { RailsStatus } from "../lib/contract";
import {
  progressSentence,
  railName,
  railSentence,
  sendLabel,
} from "./PaymentsScreen";

describe("sendLabel", () => {
  test("asks once, confirms with the count, then admits it is working", () => {
    expect(sendLabel(false, false, 86)).toBe("Enviar corrida");
    expect(sendLabel(false, true, 86)).toBe("Si, enviar 86 lineas");
    expect(sendLabel(true, true, 86)).toBe("Enviando la corrida");
  });

  test("puts the number of lines in the confirmation and nowhere else", () => {
    /* The second press is the irreversible one, so it is the one that says how
       many payments it is about. A first press that already named them would read
       as the action having happened. */
    expect(sendLabel(false, false, 86)).not.toContain("86");
    expect(sendLabel(false, true, 1)).toBe("Si, enviar 1 linea");
  });
});

describe("railSentence", () => {
  const rails = (over: Partial<RailsStatus> = {}): RailsStatus => ({
    active: "nessie",
    rails: [
      {
        id: "nessie",
        configured: true,
        producesCep: false,
        live: true,
        detail: "espejo del banco de la empresa",
      },
      {
        id: "stp",
        configured: false,
        producesCep: true,
        live: false,
        detail: "participante SPEI",
      },
    ],
    ...over,
  });

  test("says the mirror is a sandbox and produces no CEP", () => {
    const sentence = railSentence(rails());

    expect(sentence).toContain("sandbox");
    expect(sentence).toContain("no se mueven pesos");
    expect(sentence).toContain("sello no verificado");
  });

  test("never claims the production path has run when it has not", () => {
    /* The one sentence on this screen that could quietly become a lie. `live` is
       read off the README in packages/rail, and a rail that has never moved money
       from this repository says so. */
    const sentence = railSentence(rails({ active: "stp" }));

    expect(sentence).toContain("nunca se ha corrido en vivo");
  });

  test("drops the caveat only when the rail really has run live", () => {
    const sentence = railSentence(
      rails({
        active: "stp",
        rails: [
          {
            id: "stp",
            configured: true,
            producesCep: true,
            live: true,
            detail: "participante SPEI",
          },
        ],
      }),
    );

    expect(sentence).not.toContain("nunca");
  });

  test("repeats the message of a server with no rail instead of inventing one", () => {
    /* `packages/rail/src/resolve.ts` wrote that sentence and it names the variables
       a deployment is missing. Paraphrasing it here would send somebody looking for
       the wrong configuration. */
    const message = "RAIL no esta configurado en este servidor.";

    expect(railSentence(rails({ active: null, message }))).toBe(message);
  });

  test("admits it does not know yet rather than guessing a rail", () => {
    expect(railSentence(null)).toContain("Todavia no sabemos");
  });
});

describe("railName", () => {
  test("names the rail short without shortening what it proves", () => {
    /* The header line is three words and `railSentence` is the claim. A label
       that said "Riel: STP" where the sentence would have said the production
       path has never run is the shortening ADR-0008 warns about, so the two are
       separate functions and both are on screen. */
    expect(railName(null)).toBe("Riel por confirmar");
    expect(railName({ active: null, rails: [], message: "sin riel" })).toBe(
      "Sin riel configurado",
    );
    expect(railName({ active: "nessie", rails: [] })).toBe(
      "Riel: espejo Nessie",
    );
  });
});

describe("progressSentence", () => {
  test("counts lines and never prints a proportion", () => {
    const sentence = progressSentence(34, 86);

    expect(sentence).toBe("34 de 86 lineas contestadas por el riel");
    expect(sentence).not.toContain("%");
  });

  test("reads correctly before anything has been answered", () => {
    expect(progressSentence(0, 86)).toBe(
      "0 de 86 lineas contestadas por el riel",
    );
  });
});
