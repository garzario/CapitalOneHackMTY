/**
 * The two endpoints of the panel: one turn, and one conversation.
 *
 * `POST /api/v1/assistant/messages` is the endpoint docs/09-api.md calls the one
 * most able to become the thing ADR-0002 and ADR-0004 forbid, so everything it
 * refuses is in this file and every refusal has a status a client can act on:
 *
 * - `400` for a turn with no text and no image, and for an `X-Actor` that does not
 *   parse. Not a `403`: nothing about the caller was rejected, the request did not
 *   say who was acting, and the panel cannot write a conversation nobody signed.
 * - `404` for a `sessionId` nobody holds. A minted session is the ordinary path and
 *   reopening one that does not exist has to fail, or a client would believe it had
 *   recovered a conversation.
 * - `422` on a server with no model, naming the variable. The panel is not the
 *   product: an instance with no key still answers every other endpoint, which is
 *   why this is not a 500 and not a boot failure.
 * - `429` per client, like the lookup box, because a chat endpoint that calls a paid
 *   model is the one place a retry loop in our own web app costs money.
 *
 * Both content types of the contract are accepted and normalised into one body
 * before anything else happens: `multipart/form-data`, which is how a browser sends
 * the screenshot the panel exists for, and JSON with base64 images, which is how
 * `curl` and the eval drive it.
 *
 * The stream is `text/event-stream` and it is opened only once the turn is going to
 * run, so every failure above is an ordinary JSON envelope with a status on it
 * rather than an error event inside a 200 nobody can switch on.
 */

import { Buffer } from "node:buffer";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { ACTOR_REQUIRED, actorOf } from "../actor";
import type { ApiDeps } from "../deps";
import { fail, notFound, rejectInvalid } from "../http";
import { createRateLimit } from "../middleware/rate-limit";
import {
  ASSISTANT_IMAGES_MAX,
  type AssistantMessageBody,
  assistantMessageBodySchema,
  idParamSchema,
} from "../schemas";
import { assistantSessionFrom } from "./session";
import type { ApiCaller } from "./tools";
import { runTurn, type TurnEvent } from "./turn";

/**
 * Turns per client per minute.
 *
 * Lower than the SAT lookup's thirty, and for a different reason: that limit stops
 * somebody enumerating a public list, this one stops a retry loop spending the
 * company's tokens. Twenty is far above what a person can type and far below what a
 * loop does in a second.
 */
export const ASSISTANT_TURN_LIMIT = 20;

/** The form field the panel posts a screenshot under, repeated per image. */
const IMAGE_FIELD = "images";

/** Largest multipart body this endpoint reads, before base64 inflates it. */
const MAX_FORM_BYTES = 12_000_000;

export function assistantRoutes(deps: ApiDeps, api: ApiCaller) {
  return (
    new Hono()
      .get(
        "/sessions/:id",
        zValidator("param", idParamSchema, rejectInvalid),
        async (c) => {
          const { id } = c.req.valid("param");
          const session = assistantSessionFrom(
            await deps.repo.assistantMessages(id),
            id,
          );
          if (session === undefined) {
            return notFound(c, `No assistant session with id ${id}.`);
          }
          return c.json(session);
        },
      )
      /* The rate limit is on the turn and not on the session read: reopening a
         conversation costs a query, taking a turn costs tokens. */
      .post(
        "/messages",
        createRateLimit({ limit: ASSISTANT_TURN_LIMIT, label: "turns" }),
        async (c) => {
          const actor = actorOf(c.req.raw.headers);
          if (actor === undefined) {
            return fail(c, 400, "bad_request", ACTOR_REQUIRED);
          }

          const parsed = await readBody(c.req.raw);
          if (!parsed.ok) {
            return fail(c, 400, "bad_request", parsed.message);
          }
          const body = parsed.body;

          if (!deps.model.available) {
            return fail(
              c,
              422,
              "unprocessable",
              "This server holds no GEMINI_API_KEY, so the assistant panel cannot answer here. Every other endpoint works, and the payment run, the findings and the decisions are all on the screens.",
            );
          }

          /* A session that was named has to exist. The history is read here, before
           the stream opens, so a 404 is a 404 and not an event inside a 200. */
          let history: Awaited<ReturnType<typeof deps.repo.assistantMessages>> =
            [];
          if (body.sessionId !== undefined) {
            history = await deps.repo.assistantMessages(body.sessionId);
            if (history.length === 0) {
              return notFound(
                c,
                `No assistant session with id ${body.sessionId}.`,
              );
            }
          }
          const sessionId = body.sessionId ?? deps.clock.newId("ses");

          c.header("X-Accel-Buffering", "no");
          return streamSSE(c, async (stream) => {
            let sequence = 0;
            const emit = async (event: TurnEvent): Promise<void> => {
              await stream.writeSSE({
                event: event.event,
                id: String(sequence++),
                data: JSON.stringify(event.data),
              });
            };

            try {
              await runTurn(
                {
                  clock: deps.clock,
                  model: deps.model,
                  extractor: deps.extractor,
                  api,
                  emit: deps.emit,
                },
                {
                  sessionId,
                  text: body.text,
                  images: body.images ?? [],
                  actor,
                  history,
                },
                emit,
              );
            } catch (error) {
              /* The turn handles a provider failure itself and still stores an answer.
               Reaching here means something in our own code threw, so the client is
               told the turn ended rather than left holding an open stream, and the
               detail stays in the server log with the request id. */
              console.error(
                `[${c.get("requestId") ?? "unknown"}] assistant turn failed:`,
                error,
              );
              await stream.writeSSE({
                event: "done",
                id: String(sequence++),
                data: JSON.stringify({
                  id: deps.clock.newId("msg"),
                  sessionId,
                  author: "assistant",
                  text: "Algo falló de este lado y la respuesta quedó incompleta. La corrida y los hallazgos siguen en la pantalla, que es donde se decide.",
                  at: deps.clock.now(),
                }),
              });
            }
          });
        },
      )
  );
}

/** Either the normalised body, or the sentence that says what is wrong with it. */
type BodyOutcome =
  | { ok: true; body: AssistantMessageBody }
  | { ok: false; message: string };

/**
 * One body out of two content types.
 *
 * The multipart branch is the one the panel uses, because a browser cannot put a
 * file in a JSON body without base64 and a clerk's screenshot is a file. The JSON
 * branch is what `curl`, the eval and the tests use. Both end up in the same zod
 * schema, so there is one validation and one set of limits rather than two.
 */
async function readBody(request: Request): Promise<BodyOutcome> {
  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("multipart/form-data")) {
    let form: Awaited<ReturnType<Request["formData"]>>;
    try {
      form = await request.formData();
    } catch {
      return { ok: false, message: "The multipart body could not be read." };
    }

    const images: string[] = [];
    for (const value of form.getAll(IMAGE_FIELD)) {
      if (typeof value === "string") {
        images.push(value);
        continue;
      }
      if (value.size > MAX_FORM_BYTES) {
        return {
          ok: false,
          message: `An attached file is larger than ${MAX_FORM_BYTES} bytes.`,
        };
      }
      images.push(
        Buffer.from(new Uint8Array(await value.arrayBuffer())).toString(
          "base64",
        ),
      );
    }
    if (images.length > ASSISTANT_IMAGES_MAX) {
      return {
        ok: false,
        message: `A turn may carry at most ${ASSISTANT_IMAGES_MAX} images.`,
      };
    }

    return validate({
      ...(typeof form.get("sessionId") === "string"
        ? { sessionId: form.get("sessionId") as string }
        : {}),
      text: typeof form.get("text") === "string" ? form.get("text") : "",
      ...(images.length > 0 ? { images } : {}),
    });
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return {
      ok: false,
      message:
        "The body is neither multipart/form-data nor the JSON of docs/09-api.md.",
    };
  }
  return validate(json);
}

function validate(candidate: unknown): BodyOutcome {
  const result = assistantMessageBodySchema.safeParse(candidate);
  if (result.success) {
    return { ok: true, body: result.data };
  }
  const fields = [
    ...new Set(
      result.error.issues
        .map((issue) => issue.path.join("."))
        .filter((path) => path.length > 0),
    ),
  ].sort();
  /* The field list and never the values: a validation error is the response most
     likely to be pasted into a chat, and this body can carry a screenshot. */
  return {
    ok: false,
    message: `The request did not match the contract in docs/09-api.md. Send text, or an image to read, or both.${
      fields.length > 0 ? ` Check: ${fields.join(", ")}.` : ""
    }`,
  };
}
