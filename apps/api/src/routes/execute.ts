/**
 * The four endpoints of the payment execution.
 *
 * `POST /api/v1/run/:id/execute` is the one place in this product where money that is
 * not a centavo leaves, and the rest of this file is how a screen follows it and how
 * the no-API path closes its loop.
 *
 * Transport only, like every other file under `src/routes`: the pipeline is
 * `src/execution.ts`, the selection rule is `planRunExecution` in `@hackmty/core`, and
 * what lives here is the mapping from outcomes to status codes. Three of them are
 * worth writing down because they are about us and not about the caller.
 *
 * - `202` and not `200`: on a real rail the transfer is acknowledged after the
 *   response is written, so the work is not finished when the status code is chosen.
 *   The stream says how far it got.
 * - `409` when nothing may be sent: a run already executed, or a request naming a line
 *   the decisions stop. The message says which line and why, because silently dropping
 *   it would let a clerk believe they paid somebody they did not.
 * - `503` when this server has no rail. That is our configuration and not the request,
 *   and nothing is appended: a `payment_sent` for a payment that never left is the one
 *   entry this ledger must not hold.
 *
 * There is deliberately no `403` branch. `docs/09-api.md` reserves one for a role that
 * may not execute, and today both roles may: `docs/02-persona.md` puts a maker-checker
 * chain in the anti-persona column, so sending the run is the clerk's own work and the
 * owner-only shape is a release over a finding, which belongs to `decide`. The header
 * is still required, because the ledger has to answer who.
 */

import { readLayoutResponse } from "@hackmty/rail";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { actorOf } from "../actor";
import type { ApiDeps } from "../deps";
import {
  applyLayoutResponse,
  type ExecutionProgress,
  executeRun,
  executionOf,
  layoutFor,
} from "../execution";
import { fail, notFound, rejectInvalid } from "../http";
import {
  executeBodySchema,
  idParamSchema,
  layoutResponseBodySchema,
  type PaymentExecutionResponse,
} from "../schemas";

/** SSE event names of the execution stream. The web client reads these. */
export const LINE_EVENT_NAME = "line";
export const SKIPPED_EVENT_NAME = "skipped";
export const DONE_EVENT_NAME = "done";

export function executeRoutes(deps: ApiDeps) {
  return new Hono()
    .get(
      "/:id/execution",
      zValidator("param", idParamSchema, rejectInvalid),
      async (c) => {
        const { id } = c.req.valid("param");
        const run = await deps.repo.run(id);

        if (run === undefined) {
          return notFound(c, `No existe la corrida ${id}.`);
        }

        /* A run nobody has executed answers `200` with no lines and zeros. "Nothing
           has been sent" is an answer, and a `404` there would read as "no such
           run". */
        const execution: PaymentExecutionResponse = await executionOf(
          deps,
          run,
        );

        return c.json(execution);
      },
    )
    .post(
      "/:id/execute",
      zValidator("param", idParamSchema, rejectInvalid),
      zValidator("json", executeBodySchema, rejectInvalid),
      async (c) => {
        const { id } = c.req.valid("param");
        const body = c.req.valid("json");
        const actor = actorOf(c);

        if (!actor.ok) {
          return fail(c, 400, "bad_request", actor.message);
        }

        const run = await deps.repo.run(id);
        if (run === undefined) {
          return notFound(c, `No existe la corrida ${id}.`);
        }

        /* The whole run is executed, appended and folded BEFORE a byte of the stream
           is written, and the progress is collected here. That order is forced rather
           than chosen: a `409` for a run with nothing to send and a `503` for a server
           with no rail are status codes, and they cannot be status codes if the first
           SSE frame has already committed a `202`. `executeRun` resolves the rail only
           after the plan says something may go, so nothing is sent on either branch.

           What it costs is that a run of eighty-six lines is streamed at once instead
           of line by line while it happens. The ledger is the record either way, the
           screen re-reads `GET /api/v1/run/:id/execution`, and every one of these
           events also goes out on `GET /api/v1/events` as it is appended, which is the
           channel a second screen watches. */
        const pending: ExecutionProgress[] = [];
        const outcome = await executeRun(
          deps,
          {
            run,
            actor: actor.actor,
            ...(body.instructionIds === undefined
              ? {}
              : { instructionIds: body.instructionIds }),
          },
          async (progress) => {
            pending.push(progress);
          },
        );

        if (!outcome.ok) {
          if (outcome.failure === "not_found") {
            return notFound(c, outcome.message);
          }
          if (outcome.failure === "conflict") {
            return fail(c, 409, "conflict", outcome.message);
          }
          return fail(c, 503, "service_unavailable", outcome.message);
        }

        c.header("X-Accel-Buffering", "no");
        /* `202` and not `200`: on a real rail the transfer is acknowledged after the
           response is written, so the work this call started is not finished when the
           status code is chosen. `streamSSE` writes whatever status the context
           carries, so it is set here. */
        c.status(202);

        return streamSSE(
          c,
          async (stream) => {
            let sequence = 0;
            const nextId = () => String(sequence++);

            for (const progress of pending) {
              await stream.writeSSE({
                event:
                  progress.kind === "line"
                    ? LINE_EVENT_NAME
                    : SKIPPED_EVENT_NAME,
                id: nextId(),
                data: JSON.stringify(progress.line),
              });
            }

            await stream.writeSSE({
              event: DONE_EVENT_NAME,
              id: nextId(),
              data: JSON.stringify({
                execution: outcome.execution,
                skipped: outcome.skipped,
                rail: outcome.rail,
              }),
            });
          },
          async (error, stream) => {
            /* The payments already happened and the ledger already holds them. A
               stream that breaks after the rail accepted a transfer is a lost view of
               a recorded fact, so it is logged and the connection closed rather than
               turned into an error the caller could read as a failed run. */
            console.error(
              `[execute] the stream of run ${run.id} broke after the rail answered:`,
              error,
            );
            await stream.close();
          },
        );
      },
    )
    .get(
      "/:id/layout",
      zValidator("param", idParamSchema, rejectInvalid),
      async (c) => {
        const { id } = c.req.valid("param");
        const run = await deps.repo.run(id);

        if (run === undefined) {
          return notFound(c, `No existe la corrida ${id}.`);
        }

        const { file, lines } = await layoutFor(deps, run);

        /* A CSV and not JSON, because the thing a clerk needs is the file their bank
           portal takes. Nothing is appended: writing a file sends nothing, and the
           line count is on a header so a screen can say what it handed over without
           parsing it. */
        return c.body(file, 200, {
          "content-type": "text/csv; charset=utf-8",
          "content-disposition": `attachment; filename="dispersion-${run.id.replace(/[^A-Za-z0-9._-]+/g, "-")}.csv"`,
          "cache-control": "no-store",
          "x-layout-lines": String(lines),
        });
      },
    )
    .post(
      "/:id/layout/response",
      zValidator("param", idParamSchema, rejectInvalid),
      zValidator("json", layoutResponseBodySchema, rejectInvalid),
      async (c) => {
        const { id } = c.req.valid("param");
        const { file } = c.req.valid("json");
        const actor = actorOf(c);

        if (!actor.ok) {
          return fail(c, 400, "bad_request", actor.message);
        }

        const run = await deps.repo.run(id);
        if (run === undefined) {
          return notFound(c, `No existe la corrida ${id}.`);
        }

        const rows = readLayoutResponse(file);
        if (rows.length === 0) {
          return fail(
            c,
            422,
            "unprocessable",
            "El archivo no trae ninguna linea con referencia y clave de rastreo, asi que no hay nada que registrar. El portal entrega una columna de referencia y una de clave de rastreo; revisa que el archivo sea el de respuesta y no el que se subio.",
          );
        }

        const outcome = await applyLayoutResponse(deps, run, rows, actor.actor);

        return c.json({
          applied: outcome.applied,
          unknown: outcome.unknown,
          execution: outcome.execution,
        });
      },
    );
}
