/**
 * The two constancia endpoints.
 *
 * A constancia is the retention artifact: the accountant files it and reads it
 * again when the SAT asks, eighteen months later, why a deduction was taken or
 * why a payment was held. That is what makes these two routes worth their own
 * file, and it is what shapes the three rules they follow.
 *
 * - The bytes come from `@hackmty/constancia`, which is pure. This file gathers
 *   the evidence and sets the headers, and it composes nothing.
 * - The issue instant comes from `deps.clock`, so a test gets a byte-identical
 *   file and the digest printed on the page is worth checking.
 * - Nothing is generated for a version or a run that does not exist. A
 *   constancia for something we never held would be a fabricated document, and
 *   this is the one place in the product where that word has legal weight.
 *
 * The response is a real `application/pdf` with a filename, served inline so a
 * judge who opens the link sees the document rather than a download they have
 * to find in a folder during a four minute demo. The headers come from
 * `src/pdf.ts`, which the evidence letter of issue #204 shares, so the three
 * documents of this API cannot be served three different ways.
 */

import {
  constanciaFilename,
  type RunConstanciaItem,
  runConstancia,
  sweepConstancia,
} from "@hackmty/constancia";
import {
  OFFICIAL_SNAPSHOT_LIST_VERSION,
  OFFICIAL_SNAPSHOT_RETRIEVED_AT,
  OFFICIAL_SNAPSHOT_URL,
} from "@hackmty/sat";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import type { ApiDeps } from "../deps";
import { notFound, rejectInvalid } from "../http";
import { pdfResponse } from "../pdf";
import { runRetroactiveSweep } from "../pipeline";
import { constanciaQuerySchema, idParamSchema } from "../schemas";

/** Where a stored version came from, said plainly on the document. */
function sourceOf(listVersion: string): string {
  if (listVersion === OFFICIAL_SNAPSHOT_LIST_VERSION) {
    return `${OFFICIAL_SNAPSHOT_URL}, descargada el ${OFFICIAL_SNAPSHOT_RETRIEVED_AT}`;
  }
  if (listVersion.startsWith("sim-")) {
    return "Publicacion simulada en esta instancia, con RFC sinteticos";
  }
  return "Version cargada en esta instancia";
}

export function constanciaRoutes(deps: ApiDeps) {
  return new Hono()
    .get(
      "/sat/constancia",
      zValidator("query", constanciaQuerySchema, rejectInvalid),
      async (c) => {
        const { listVersion } = c.req.valid("query");
        const snapshot = await deps.repo.sweepSnapshot(listVersion);

        if (snapshot === undefined) {
          return notFound(
            c,
            `No hay una version ${listVersion} cargada en esta instancia, asi que no hay nada que constatar.`,
          );
        }

        const company = await deps.repo.company();
        const bytes = sweepConstancia({
          company,
          issuedAt: deps.clock.now(),
          ledger: await deps.repo.ledger({}),
          synthetic: company.synthetic,
          sweep: await runRetroactiveSweep(listVersion, snapshot.subjects),
          publishedAt: snapshot.publishedAt,
          source: sourceOf(listVersion),
          suppliersChecked: snapshot.suppliersChecked,
        });

        return pdfResponse(c, bytes, constanciaFilename("sweep", listVersion));
      },
    )
    .get(
      "/run/:id/constancia",
      zValidator("param", idParamSchema, rejectInvalid),
      async (c) => {
        const { id } = c.req.valid("param");
        const run = await deps.repo.run(id);

        if (run === undefined) {
          return notFound(c, `No existe la corrida ${id}.`);
        }

        const company = await deps.repo.company();
        const items: RunConstanciaItem[] = run.items.map((item) => ({
          instruction: item.instruction,
          ...(item.supplier === null ? {} : { supplier: item.supplier }),
          ...(item.decision === null ? {} : { decision: item.decision }),
          findings: item.findings,
        }));

        const bytes = runConstancia({
          company,
          issuedAt: deps.clock.now(),
          ledger: await deps.repo.ledger({}),
          synthetic: company.synthetic,
          runId: run.id,
          weekOf: run.weekOf,
          items,
        });

        return pdfResponse(c, bytes, constanciaFilename("run", run.id));
      },
    );
}
