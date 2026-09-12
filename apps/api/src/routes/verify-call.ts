/**
 * `POST /api/v1/instructions/:id/verify-call`, the verification call.
 *
 * When a decision is `verify`, somebody still has to ask the supplier whether
 * the account we are about to pay is theirs. This endpoint is that phone call:
 * it builds the script from the instruction, rings the supplier through the
 * voice agent, and later records what was said as a `verification_call` ledger
 * event with the sentence it was read from.
 *
 * Three properties this file is written to keep.
 *
 * **It never releases a payment.** There is no path here that touches
 * `recordDecision` and none that emits `decision_made`. A `confirmed` outcome is
 * evidence, like a CEP, and the release stays the separate `/decide` call that a
 * person signs. `releasesPayment: false` is on every response so the UI states
 * it rather than implying it.
 *
 * **Without keys it degrades to a script, not to a failure.** If
 * `ELEVENLABS_API_KEY`, `ELEVENLABS_AGENT_ID` or `ELEVENLABS_PHONE_NUMBER_ID` is
 * missing, the answer is a 422 that carries the exact words for the clerk to say
 * on their own telephone. A demo where the telephony provider is unreachable is
 * a demo where the control still works, slower.
 *
 * **The account is never spoken in full.** The script carries four digits. The
 * ledger event carries four digits. Neither carries the CLABE.
 *
 * **Nobody answering is an answer, and it says what to do next.** A Capital One
 * judge asked what happens when the supplier does not pick up. The response that
 * reports `no_answer` carries `hold`: how long the payment stays stopped, and the
 * ordered next steps, one of which is the one-cent CEP path that needs nobody to
 * answer anything at all. The deadline is what bounds the retry loop, and nothing
 * is released or refused when it passes.
 *
 * It is mounted as a second router on `/instructions` rather than added to
 * `routes/instructions.ts`, so this feature is one file that can be reverted in
 * one commit while three other people edit that one.
 */

import type {
  Decision,
  VerificationOutcome,
  VerificationTurn,
} from "@hackmty/core";
import { holdWindow } from "@hackmty/core";
import {
  parseVerificationOutcome,
  scriptForInstruction,
  type VerificationScript,
  VoiceClient,
  VoiceError,
} from "@hackmty/voice";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import type { ApiDeps } from "../deps";
import { errorBody, fail, notFound, rejectInvalid, requestIdOf } from "../http";
import {
  idParamSchema,
  type VerifyCallResponse,
  type VerifyCallScriptResponse,
  verifyCallBodySchema,
} from "../schemas";

/** What the voice integration needs before it can ring anybody. */
export interface VoiceConfig {
  apiKey: string;
  agentId: string;
  phoneNumberId: string;
}

function readEnv(name: string): string | undefined {
  const holder = globalThis as {
    process?: { env?: Record<string, string | undefined> };
  };
  const value = holder.process?.env?.[name];

  return value === undefined || value.trim() === "" ? undefined : value.trim();
}

/**
 * The three variables, read together.
 *
 * All three or none: an agent id with no key, or a key with no phone number,
 * cannot place a call, and reporting that as a partial configuration would send
 * a clerk looking for a bug instead of for a `.env`.
 */
export function readVoiceConfig(): VoiceConfig | undefined {
  const apiKey = readEnv("ELEVENLABS_API_KEY");
  const agentId = readEnv("ELEVENLABS_AGENT_ID");
  const phoneNumberId = readEnv("ELEVENLABS_PHONE_NUMBER_ID");

  return apiKey === undefined ||
    agentId === undefined ||
    phoneNumberId === undefined
    ? undefined
    : { apiKey, agentId, phoneNumberId };
}

/** Injected so a test can drive the route with neither keys nor network. */
export interface VoiceDeps {
  /**
   * Reads the three variables. Injected rather than read directly so a test is
   * immune to whatever is in the `.env` of whoever runs it: a teammate with a
   * real key must not get a different result from CI.
   */
  readConfig?: () => VoiceConfig | undefined;
  /** Defaults to the global `fetch`. A test passes a stub and stays offline. */
  http?: (input: string, init?: RequestInit) => Promise<Response>;
}

/** Only the part of the script that goes on the wire. No full CLABE, ever. */
function wireScript(script: VerificationScript) {
  return {
    firstMessage: script.firstMessage,
    question: script.question,
    clabeLast4: script.clabeLast4,
    spoken: script.spoken,
  };
}

/**
 * Anything thrown on the way to the provider, as the one type this route knows
 * how to answer.
 *
 * `VoiceClient` throws `VoiceError` for everything it can classify, but the
 * injected `fetch` can still throw a `TypeError` on a dead network or an
 * `AbortError` on the timeout. Those have to become an error too, or a handler
 * that checks `instanceof` would carry a thrown object forward as if it were a
 * conversation.
 */
function asVoiceError(thrown: unknown): VoiceError {
  return thrown instanceof VoiceError
    ? thrown
    : new VoiceError("http_error", "the voice provider could not be reached");
}

/** What the clerk is told when there is no telephony to use. */
const NO_VOICE_MESSAGE =
  "The voice integration is not configured (ELEVENLABS_API_KEY, ELEVENLABS_AGENT_ID, ELEVENLABS_PHONE_NUMBER_ID). Call the supplier and read the script in `script`.";

export function verifyCallRoutes(deps: ApiDeps, voice: VoiceDeps = {}) {
  return new Hono()
    .get(
      "/:id/verify-call",
      zValidator("param", idParamSchema, rejectInvalid),
      async (c) => {
        const { id } = c.req.valid("param");
        const detail = await deps.repo.instructionDetail(id);

        if (detail === undefined) {
          return notFound(c, `No instruction with id ${id}.`);
        }

        /* Reading the script rings nobody and writes nothing. The page shows a
           clerk the exact words before anything happens, which is also what
           makes the by-hand fallback usable. */
        const response: VerifyCallScriptResponse = {
          script: wireScript(
            scriptForInstruction(
              detail.instruction,
              detail.supplier ?? undefined,
            ),
          ),
          voiceConfigured:
            (voice.readConfig ?? readVoiceConfig)() !== undefined,
          releasesPayment: false,
        };

        return c.json(response);
      },
    )
    .post(
      "/:id/verify-call",
      zValidator("param", idParamSchema, rejectInvalid),
      zValidator("json", verifyCallBodySchema, rejectInvalid),
      async (c) => {
        const { id } = c.req.valid("param");
        const body = c.req.valid("json");

        const detail = await deps.repo.instructionDetail(id);
        if (detail === undefined) {
          return notFound(c, `No instruction with id ${id}.`);
        }

        const { instruction } = detail;
        const script = scriptForInstruction(
          instruction,
          detail.supplier ?? undefined,
        );

        /* A call a person made on their own telephone. Nothing to fetch: the
           outcome is what they heard, and `manual` records that on the event so
           nobody later reads it as something the agent proved. */
        if ("outcome" in body) {
          return c.json(
            await record(deps, {
              instruction,
              script,
              outcome: body.outcome,
              evidence: body.evidence,
              transcript: [],
              manual: true,
              decision: detail.decision,
            }),
          );
        }

        const config = (voice.readConfig ?? readVoiceConfig)();
        if (config === undefined) {
          /* The one place this API answers a failure with more than the
             envelope. The clerk needs the words, and a 422 whose body is only a
             message would send them looking for the script somewhere else. */
          return c.json(
            {
              ...errorBody("unprocessable", NO_VOICE_MESSAGE, requestIdOf(c)),
              script: wireScript(script),
              releasesPayment: false as const,
            },
            422,
          );
        }

        const client = new VoiceClient({
          apiKey: config.apiKey,
          http: voice.http ?? fetch,
        });

        /* Collecting a call that already happened: the outbound one whose id
           the clerk holds, or the browser fallback on /verify-call. */
        if ("conversationId" in body) {
          const conversation = await client
            .getConversation(body.conversationId)
            .catch(asVoiceError);

          if (conversation instanceof VoiceError) {
            return voiceFailure(c, conversation);
          }
          if (conversation.status !== "done") {
            return fail(
              c,
              422,
              "unprocessable",
              `The call is ${conversation.status}. Its transcript is not final yet, so nothing was recorded.`,
            );
          }

          const reading = parseVerificationOutcome(conversation.transcript);

          return c.json(
            await record(deps, {
              instruction,
              script,
              outcome: reading.outcome,
              evidence: reading.evidence,
              transcript: conversation.transcript,
              conversationId: conversation.conversationId,
              manual: false,
              decision: detail.decision,
            }),
          );
        }

        /* Ringing the supplier. Nothing is appended to the ledger here: a call
           that started has proved nothing, and an event now would show the
           clerk an outcome before anybody answered. */
        const call = await client
          .startOutboundCall({
            agentId: config.agentId,
            agentPhoneNumberId: config.phoneNumberId,
            toNumber: body.toNumber,
          })
          .catch(asVoiceError);

        if (call instanceof VoiceError) {
          return voiceFailure(c, call);
        }
        if (!call.success) {
          return fail(
            c,
            422,
            "unprocessable",
            `The voice provider did not place the call: ${call.message}`,
          );
        }

        const response: VerifyCallResponse = {
          status: "calling",
          script: wireScript(script),
          releasesPayment: false,
        };
        if (call.conversationId !== undefined) {
          response.conversationId = call.conversationId;
        }

        return c.json(response, 202);
      },
    );
}

interface RecordInput {
  instruction: { id: string; supplierRfc: string };
  script: VerificationScript;
  outcome: VerificationOutcome;
  evidence?: string | undefined;
  transcript: VerificationTurn[];
  conversationId?: string;
  manual: boolean;
  /** The standing decision, so the answer can say how long the hold lasts. */
  decision: Decision | null;
}

/**
 * Appends the outcome to the ledger and shapes the answer.
 *
 * One function for both the collected call and the hand-recorded one, so the
 * two can never write a different event for the same thing.
 */
async function record(
  deps: ApiDeps,
  input: RecordInput,
): Promise<VerifyCallResponse> {
  const at = deps.clock.now();

  await deps.emit({
    type: "verification_call",
    at,
    instructionId: input.instruction.id,
    supplierRfc: input.instruction.supplierRfc,
    outcome: input.outcome,
    clabeLast4: input.script.clabeLast4,
    ...(input.evidence === undefined ? {} : { evidence: input.evidence }),
    transcript: input.transcript,
    ...(input.conversationId === undefined
      ? {}
      : { conversationId: input.conversationId }),
    manual: input.manual,
  });

  const response: VerifyCallResponse = {
    status: "recorded",
    script: wireScript(input.script),
    outcome: input.outcome,
    transcript: input.transcript,
    releasesPayment: false,
    /* Null when the payment was already released, which is the one case where
       there is no window to report and no next step to offer. */
    hold:
      input.decision === null
        ? null
        : holdWindow(input.decision, { now: at, outcome: input.outcome }),
  };
  if (input.evidence !== undefined) {
    response.evidence = input.evidence;
  }
  if (input.conversationId !== undefined) {
    response.conversationId = input.conversationId;
  }

  return response;
}

/**
 * Maps a provider failure onto the API's own envelope.
 *
 * The provider's status is deliberately not passed through: a 401 from
 * ElevenLabs is our configuration problem, not the caller's, and answering 401
 * would tell a clerk they are not signed in.
 */
function voiceFailure(
  c: Parameters<typeof fail>[0],
  error: VoiceError,
): ReturnType<typeof fail> {
  if (error.code === "not_found") {
    return fail(
      c,
      404,
      "not_found",
      "The voice provider has no such agent, number or conversation.",
    );
  }

  return fail(
    c,
    422,
    "unprocessable",
    `The voice provider could not be used right now (${error.code}). Call the supplier and read the script.`,
  );
}
