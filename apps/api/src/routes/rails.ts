/**
 * `GET /api/v1/rails`, so a screen can say which rail is live without reading an
 * environment file it cannot see.
 *
 * It is its own endpoint rather than a field on `/health` for one reason: somebody
 * extends a health payload without thinking, and a rail row is one careless line away
 * from carrying a key fingerprint or an account id. Nothing in this response is a
 * secret. `configured` is whether the variables exist and never what they contain.
 *
 * `live` is the field the pitch depends on, and it is read off the README in
 * `packages/rail` rather than inferred: it says whether that rail has ever actually
 * moved money from this repository. The Nessie mirror has, on 2026-09-13, and the
 * README carries the counts. STP never has, because nothing here holds an `empresa`
 * contract, and a screen that claimed otherwise would be the exact pretending Capital
 * One said they are hunting for.
 */

import { railNameFrom } from "@hackmty/rail";
import { Hono } from "hono";
import type { ApiDeps } from "../deps";
import type { RailsResponse } from "../schemas";

/**
 * What each rail is, in one sentence, and whether it has run live.
 *
 * The sentences are in Spanish because they are rendered next to the run on the
 * payments screen. `live` here is a fact about this repository and it changes only
 * when somebody runs the rail for real and updates `packages/rail/README.md` in the
 * same commit.
 */
const RAILS = [
  {
    id: "nessie" as const,
    producesCep: false,
    live: true,
    detail:
      "Espejo bancario de la empresa en el sandbox de Nessie (api.nessieisreal.com). Es un sandbox y no un banco: no se mueven pesos y no se produce CEP, asi que comprueba el flujo y nada sobre el dinero. Verificado con una corrida real el 2026-09-13.",
  },
  {
    id: "stp" as const,
    producesCep: true,
    live: false,
    detail:
      "STP, el participante de SPEI que una PyME puede contratar, y el riel que si produce un CEP firmado por Banxico. Esta escrito y probado de nuestro lado del cable, y nunca se ha ejecutado en vivo: no tenemos contrato de empresa, asi que el constructor se niega en cualquier maquina.",
  },
];

export function railRoutes(deps: ApiDeps) {
  return new Hono().get("/", async (c) => {
    const resolution = await deps.rail();
    const named = railNameFrom();
    const active = resolution.ok ? resolution.rail.rail : null;

    const body: RailsResponse = {
      active,
      rails: RAILS.map((rail) => ({
        ...rail,
        /* Configured means this process could build it. For the active rail that is
           what `resolveRail` already answered; for the other one it is whether the
           environment names it at all, and never anything about what the variables
           hold. */
        configured: active === rail.id || named.rail === rail.id,
      })),
      ...(resolution.ok ? {} : { message: resolution.message }),
    };

    return c.json(body);
  });
}
