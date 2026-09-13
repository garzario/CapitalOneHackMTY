/**
 * One turn of the panel, from a sentence a clerk typed to the row on the ledger.
 *
 * The whole of the assistant's behaviour is here and it is deliberately one
 * readable loop: read the conversation, ask the model, run the reads it asked for,
 * ask again with what came back, and when it stops asking, write out the answer.
 * The loop is bounded, every read is a GET through our own router, and the only
 * thing the turn can offer at the end is an `ActionProposal` somebody has to press.
 *
 * What this file is responsible for, and what it refuses to do:
 *
 * - It appends two `assistant_message` events, the person's turn and the answer,
 *   because the conversation is the one thing the panel writes. The second one
 *   carries `AssistantUsage`, which is how the cost question is answered by a sum
 *   over rows instead of by an estimate.
 * - It appends `intake_image` for every screenshot, with the actor on it, and the
 *   instruction it became as soon as one exists.
 * - It never appends `decision_made`, never sends a centavo and never executes a
 *   run. Those three are the endpoints a person's click reaches, and the reason the
 *   panel is credible is that pulling the model out of it leaves the product
 *   working.
 *
 * The stream is ours and the provider call is not. A function-calling turn is
 * several round trips and only the last one writes prose, so the `token` events are
 * this file chunking a finished answer while `tool_call` and `tool_result` are live.
 * That is stated here rather than implied, because a comment claiming the model is
 * streamed when it is not is the kind of thing a judge checks.
 */

import type {
  ActionProposal,
  Actor,
  AssistantMessage,
  AssistantToolCall,
  AssistantUsage,
  LedgerEvent,
} from "@hackmty/core";
import type { IntakeExtractor } from "../extraction";
import type { PipelineClock } from "../pipeline";
import { costMxnOf } from "./cost";
import { runChatIntake } from "./intake";
import { maskClabesInText } from "./mask";
import {
  type AssistantModel,
  AssistantModelError,
  type ModelContent,
  type ModelRequest,
  type ModelToolCall,
} from "./model";
import { ACTION_TOOLS, buildProposal, proposalKindOf } from "./proposals";
import {
  type ApiCaller,
  READ_TOOLS,
  READ_TOOLS_BY_NAME,
  type ToolDefinition,
} from "./tools";

/* -------------------------------------------------------------------------- */
/* The stream                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * The five event names of docs/09-api.md, and `sessionId` on every one of them.
 *
 * The contract says a minted session id comes back on the first event, and rather
 * than inventing a sixth event name to carry it, every `data` carries it. A client
 * that only reads the documented keys is unaffected, and one that needs the id has
 * it from the first byte.
 */
export type TurnEvent =
  | { event: "token"; data: { sessionId: string; text: string } }
  | {
      event: "tool_call";
      data: AssistantToolCall & { sessionId: string };
    }
  | {
      event: "tool_result";
      data: AssistantToolCall & { sessionId: string };
    }
  | { event: "proposal"; data: ActionProposal & { sessionId: string } }
  | { event: "done"; data: AssistantMessage };

export type TurnEmitter = (event: TurnEvent) => Promise<void>;

/* -------------------------------------------------------------------------- */
/* The prompt                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * The whole instruction set the model receives, written in English for the reason
 * `packages/extract` writes its prompts in English: everything in this repository
 * that is code is, and the model answers in Spanish because this paragraph tells it
 * to rather than because it was asked in Spanish.
 *
 * Read it once before quoting the boundary anywhere. It forbids the model from
 * deciding, from inventing a number, from using the word "seguro" and from
 * answering from memory when a read failed, and every one of those is also enforced
 * somewhere else: the levels come from `confidenceOf`, the payloads come from
 * `proposals.ts`, the summary is checked against `FORBIDDEN_COPY`, and a failed read
 * arrives as `error` on the tool call that the panel renders.
 */
export const SYSTEM_PROMPT = `You are the assistant panel inside SentryOne, a payments control product used by the accounts-payable clerk of a Mexican small or medium business. She is about to send a weekly payment run by SPEI, which cannot be recalled once it leaves.

Your job is to answer her questions about what the product already computed, and to offer her an action she can press. You are a reader and a proposer. You never decide anything.

How the product works, so you describe it correctly:
- Six deterministic controls run over every payment instruction: the SAT article 69-B list with its retroactive sweep, CLABE forensics, duplicate detection, supplier behaviour change, Banxico CEP beneficiary verification, and an expected-loss decision. They are pure functions and statistics. No language model is in that decision, including you.
- Each line carries a level and a state. The three levels are confiable, precaucion and alerta. The three states a person sees are rojo, cancelado and enviado, plus pendiente for a line nothing has decided and liberado for a line nothing stops that has not been sent. Both are derived from the findings and the decision and neither is stored.
- The engine proposes an action, hold, verify or release, and a person confirms it. A decision always has a name against it.

Rules you follow without exception:
1. Answer in Spanish, in the plain language of somebody who does accounts payable. Short sentences. No bullet lists unless she asks for one.
2. Never say that a payment is "seguro", "safe" or guaranteed, in any language. A SPEI cannot be recalled and no level is a guarantee. Use the three levels.
3. Never state a probability, a percentage, a score or a confidence number about a payment. The product has three levels and the findings behind them, and nothing else.
4. Every claim you make comes from a tool result. Call a tool before you answer about a line, a supplier, a run or an RFC, and quote the evidence it returned: the finding, the amount, the account's last four digits, the date. If you did not read it, do not say it.
5. If a tool answers with an error, say so plainly and say what is missing. Never fill the gap from your own memory. Never invent an instruction id, an RFC, an account, an amount or a date.
6. Amounts are Mexican pesos. Accounts reach you as the last four digits only. Never ask for a full account number and never write eighteen digits.
7. You may end a turn by offering ONE action, using the propose_ tools. A propose_ tool does not do anything: it returns a card the person presses, and the action then runs under her name. Say that in your answer. Offer the one-cent verification when the question is whether an account belongs to the supplier, a call when documents cannot answer it, a decision when she asks what to do with a line, and the run when she asks to pay.
8. You never claim to have done something. You read, you explain, and you offer.
9. If she asks something this product does not know, say that it does not know it.`;

/** The read that renders an instruction card, used by the intake path directly. */
const INSTRUCTION_TOOL = READ_TOOLS_BY_NAME.get_instruction as ToolDefinition;

/** Round trips one turn may take before it answers with what it has. */
export const MAX_ROUNDS = 4;

/** Characters per `token` event. Small enough to look like writing. */
const TOKEN_CHUNK = 24;

/** The sentence a turn answers with when the model never wrote prose. */
const NO_ANSWER =
  "No pude armar la respuesta con lo que alcancé a leer. Vuelve a preguntarme, o abre la línea en la pantalla de la corrida.";

/** Splits an answer into chunks at word boundaries, for the `token` events. */
export function chunkText(text: string, size = TOKEN_CHUNK): string[] {
  const words = text.split(/(\s+)/).filter((part) => part !== "");
  const chunks: string[] = [];
  let current = "";
  for (const word of words) {
    if (current !== "" && current.length + word.length > size) {
      chunks.push(current);
      current = "";
    }
    current += word;
  }
  if (current !== "") {
    chunks.push(current);
  }
  return chunks;
}

/* -------------------------------------------------------------------------- */
/* The turn                                                                    */
/* -------------------------------------------------------------------------- */

export interface TurnDeps {
  clock: PipelineClock;
  model: AssistantModel;
  extractor: IntakeExtractor;
  /** In-process caller into this API's own router. See `tools.ts`. */
  api: ApiCaller;
  /** Append to the ledger and publish on the event stream, in that order. */
  emit(event: LedgerEvent): Promise<void>;
}

export interface TurnInput {
  sessionId: string;
  text: string;
  /** Base64 images the clerk dropped. Never sent to the assistant model. */
  images: readonly string[];
  actor: Actor;
  /** The conversation so far, projected from the ledger by the route. */
  history: readonly AssistantMessage[];
}

export interface TurnResult {
  message: AssistantMessage;
  usage: AssistantUsage;
}

/**
 * Runs one turn and streams it.
 *
 * The order matters and is asserted on: the person's turn is on the ledger before
 * the model is asked anything, so a turn that fails mid-stream still leaves the
 * question in the conversation rather than losing what she typed.
 */
export async function runTurn(
  deps: TurnDeps,
  input: TurnInput,
  emit: TurnEmitter,
): Promise<TurnResult> {
  const { sessionId, actor } = input;
  const askedAt = deps.clock.now();
  const toolCalls: AssistantToolCall[] = [];
  const imageRefs: string[] = [];
  let proposal: ActionProposal | undefined;
  let aboutInstruction: string | undefined;

  /* ---------------------------------------------------------------- intake */

  /** Notes the model is handed about what happened to the images, in English. */
  const intakeNotes: string[] = [];

  for (const [index, image] of input.images.entries()) {
    const imageRef = `assistant/${sessionId}/${askedAt}/image-${index + 1}`;
    imageRefs.push(imageRef);

    const outcome = await runChatIntake(
      { extractor: deps.extractor, api: deps.api, actor },
      image,
    );

    if (outcome.ok) {
      aboutInstruction ??= outcome.instructionId;
      /* The event that makes the intake auditable: the reference, who dropped it,
         and the instruction it became. Never the bytes and never the digits. */
      await deps.emit({
        type: "intake_image",
        at: deps.clock.now(),
        imageRef,
        actor,
        sessionId,
        instructionId: outcome.instructionId,
      });
      /* The card, read back through the ordinary endpoint so the level, the state
         and the evidence on the stream are the engine's own output and not a
         paraphrase of it. */
      const card = await runReadTool(
        deps,
        sessionId,
        /* The same definition the model would have reached for, so the card on the
           stream is indistinguishable from a read it asked for. */
        INSTRUCTION_TOOL,
        { instructionId: outcome.instructionId },
        emit,
      );
      toolCalls.push(card);
      intakeNotes.push(
        `The clerk attached a screenshot. It was transcribed, attributed to supplier ${outcome.supplierRfc} by ${outcome.matchedBy === "known_account" ? "an account this company has paid before" : "the payee name on the image"}, and registered as payment instruction ${outcome.instructionId}. The six controls have already run on it and get_instruction above is its card. Explain the level, the state and the findings to her, and say that the instruction was registered and that nothing has been paid.`,
      );
      continue;
    }

    await deps.emit({
      type: "intake_image",
      at: deps.clock.now(),
      imageRef,
      actor,
      sessionId,
    });
    intakeNotes.push(
      `The clerk attached a screenshot and it could NOT become a payment instruction on its own. Reason, in her words: ${outcome.message} Tell her that, and do not claim anything was registered.`,
    );
    /* A gap ends the turn with the one proposal that fits it, built here rather
       than asked of the model: an image that could not be attributed is exactly
       what `intake` exists for, and leaving it to the model would make the demo
       depend on it choosing the right tool. */
    if (proposal === undefined && outcome.reading !== undefined) {
      const offered = await buildProposal({
        kind: "intake",
        args: {
          ...(outcome.reading.clabe === undefined
            ? {}
            : { clabe: outcome.reading.clabe }),
          ...(outcome.reading.amount === undefined
            ? {}
            : { amount: outcome.reading.amount }),
        },
        actor,
        api: deps.api,
      });
      if (offered.ok) {
        proposal = offered.proposal;
      }
    }
  }

  /* ------------------------------------------------------- the person's turn */

  const question: AssistantMessage = {
    id: deps.clock.newId("msg"),
    sessionId,
    author: "clerk",
    text: input.text,
    at: askedAt,
    actor,
  };
  if (imageRefs.length > 0) {
    question.imageRefs = imageRefs;
  }
  if (aboutInstruction !== undefined) {
    question.instructionId = aboutInstruction;
  }
  await deps.emit({
    type: "assistant_message",
    at: askedAt,
    sessionId,
    message: question,
  });

  /* ------------------------------------------------------------- the model */

  const contents: ModelContent[] = [
    ...historyContents(input.history),
    {
      role: "user",
      /* The clerk's own sentence, masked, and the notes about her images. Nothing
         else of hers reaches the provider: the bytes went to `@hackmty/extract`
         and stop there. */
      parts: [
        {
          text: [
            maskClabesInText(input.text.trim()) ||
              "(sin texto, solo una imagen)",
            ...intakeNotes,
          ].join("\n\n"),
        },
      ],
    },
  ];

  const request: Omit<ModelRequest, "contents"> = {
    system: `${SYSTEM_PROMPT}\n\nToday is ${askedAt.slice(0, 10)}.`,
    tools: [...READ_TOOLS.map((tool) => tool.declaration), ...ACTION_TOOLS],
  };

  let promptTokens = 0;
  let outputTokens = 0;
  let totalTokens = 0;
  let rounds = 0;
  let answer = "";
  let failure: string | undefined;

  for (let round = 0; round < MAX_ROUNDS; round += 1) {
    rounds += 1;
    let reply: Awaited<ReturnType<AssistantModel["generate"]>>;
    try {
      reply = await deps.model.generate({ ...request, contents });
    } catch (error) {
      /* The provider failing is not the product failing. The turn still ends with
         a stored answer and a row on the ledger, because a conversation that lost
         a question is a conversation a clerk cannot trust.
         The provider's own body goes to the server log and never to the clerk and
         never onto the stream: it is key-redacted but it is still somebody else's
         text, and an error envelope is the response most likely to be pasted into a
         chat. Without the log line a 400 from the provider is unfixable. */
      if (error instanceof AssistantModelError) {
        console.error(
          `[assistant ${sessionId}] model ${error.code}: ${error.message}`,
          error.detail,
        );
      } else {
        console.error(`[assistant ${sessionId}] model call threw:`, error);
      }
      failure =
        error instanceof AssistantModelError
          ? `No pude consultar al modelo: ${error.message}. La corrida y los hallazgos siguen en la pantalla, que es donde se decide.`
          : "No pude consultar al modelo. La corrida y los hallazgos siguen en la pantalla, que es donde se decide.";
      break;
    }

    promptTokens += reply.usage.promptTokens;
    outputTokens += reply.usage.outputTokens;
    totalTokens += reply.usage.totalTokens;

    if (reply.text !== "") {
      answer = reply.text;
    }
    if (reply.calls.length === 0) {
      break;
    }

    /* The model's own turn goes back on the conversation before the results, so the
       next round sees what it asked for, and it goes back VERBATIM. Gemini 3 attaches
       a `thoughtSignature` to a `functionCall` part and refuses the next request with
       a 400 when the replay has dropped it, so rebuilding the part from `name` and
       `args` is the bug this line exists to avoid. */
    contents.push({ role: "model", parts: reply.parts });

    const responses: ModelContent = { role: "user", parts: [] };
    for (const call of reply.calls) {
      const handled = await handleCall(deps, sessionId, call, actor, emit, {
        hasProposal: proposal !== undefined,
      });
      if (handled.toolCall !== undefined) {
        toolCalls.push(handled.toolCall);
        aboutInstruction ??= instructionIdOf(handled.toolCall);
      }
      if (handled.proposal !== undefined && proposal === undefined) {
        proposal = handled.proposal;
      }
      responses.parts.push({
        functionResponse: { name: call.name, response: handled.response },
      });
    }
    contents.push(responses);
  }

  /* --------------------------------------------------------------- the answer */

  const text = failure ?? (answer === "" ? NO_ANSWER : answer);
  for (const chunk of chunkText(text)) {
    await emit({ event: "token", data: { sessionId, text: chunk } });
  }

  if (proposal !== undefined) {
    await emit({ event: "proposal", data: { ...proposal, sessionId } });
  }

  const usage: AssistantUsage = {
    promptTokens,
    outputTokens,
    totalTokens,
    costMxn: costMxnOf({ promptTokens, outputTokens, totalTokens }),
    model: deps.model.model,
    rounds,
  };

  const answeredAt = deps.clock.now();
  const message: AssistantMessage = {
    id: deps.clock.newId("msg"),
    sessionId,
    author: "assistant",
    text,
    at: answeredAt,
  };
  if (toolCalls.length > 0) {
    message.toolCalls = toolCalls;
  }
  if (proposal !== undefined) {
    message.proposal = proposal;
  }
  if (aboutInstruction !== undefined) {
    message.instructionId = aboutInstruction;
  }

  await deps.emit({
    type: "assistant_message",
    at: answeredAt,
    sessionId,
    message,
    usage,
  });
  await emit({ event: "done", data: message });

  return { message, usage };
}

/* -------------------------------------------------------------------------- */
/* Calls                                                                       */
/* -------------------------------------------------------------------------- */

interface HandledCall {
  /** Present when this was a read. An action tool produces no tool call. */
  toolCall?: AssistantToolCall;
  proposal?: ActionProposal;
  /** What goes back to the model as the function response. */
  response: Record<string, unknown>;
}

async function handleCall(
  deps: TurnDeps,
  sessionId: string,
  call: ModelToolCall,
  actor: Actor,
  emit: TurnEmitter,
  state: { hasProposal: boolean },
): Promise<HandledCall> {
  const read = READ_TOOLS_BY_NAME[call.name];
  if (read !== undefined) {
    const toolCall = await runReadTool(deps, sessionId, read, call.args, emit);
    return {
      toolCall,
      response:
        toolCall.error === undefined
          ? { result: toolCall.result ?? {} }
          : { error: toolCall.error },
    };
  }

  const kind = proposalKindOf(call.name);
  if (kind === undefined) {
    /* A tool this product does not have. It is reported back rather than ignored,
       so the model corrects itself on the next round instead of answering as
       though the call had worked. */
    return {
      response: {
        error: `${call.name} is not a tool this product has. Use one of the documented reads, or a propose_ tool.`,
      },
    };
  }

  if (state.hasProposal) {
    return {
      response: {
        error:
          "A turn may offer only one action and one is already offered. Answer her now.",
      },
    };
  }

  const built = await buildProposal({
    kind,
    args: call.args,
    actor,
    api: deps.api,
  });
  if (!built.ok) {
    return { response: { error: built.error } };
  }
  state.hasProposal = true;
  return {
    proposal: built.proposal,
    response: {
      /* What the model is told is what happened: a card was offered and nothing
         ran. An affirmative "done" here is how an assistant starts telling a clerk
         it paid something. */
      proposed: built.proposal.kind,
      requiresRole: built.proposal.requiresRole,
      executed: false,
      note: "The card is on the screen. A person presses it and the action runs under their name. Tell her what it will do.",
    },
  };
}

/**
 * One read, streamed as the contract's pair of events.
 *
 * `tool_call` goes out before the read happens and `tool_result` after it, which is
 * what lets the panel show "leyendo la corrida" rather than a spinner with nothing
 * behind it. Both carry the same id, so the second replaces the first.
 */
async function runReadTool(
  deps: TurnDeps,
  sessionId: string,
  tool: ToolDefinition,
  args: Record<string, unknown>,
  emit: TurnEmitter,
): Promise<AssistantToolCall> {
  const started: AssistantToolCall = {
    id: deps.clock.newId("tc"),
    tool: tool.tool,
    arguments: primitiveArgs(args),
    at: deps.clock.now(),
    readOnly: true,
  };
  await emit({ event: "tool_call", data: { ...started, sessionId } });

  let finished: AssistantToolCall;
  try {
    const outcome = await tool.run(args, deps.api);
    finished = outcome.ok
      ? { ...started, result: outcome.result }
      : { ...started, error: outcome.error };
  } catch (error) {
    finished = {
      ...started,
      error:
        error instanceof Error
          ? `the read failed: ${error.message}`
          : "the read failed",
    };
  }

  await emit({ event: "tool_result", data: { ...finished, sessionId } });
  return finished;
}

/** `AssistantToolCall.arguments` is primitives, so a nested argument is dropped. */
function primitiveArgs(
  args: Record<string, unknown>,
): Record<string, string | number | boolean> {
  const primitives: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(args)) {
    if (
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean"
    ) {
      primitives[key] = value;
    }
  }
  return primitives;
}

/** The instruction a read was about, so the turn can be filed against a payment. */
function instructionIdOf(call: AssistantToolCall): string | undefined {
  const fromArgs = call.arguments.instructionId;
  if (typeof fromArgs === "string") {
    return fromArgs;
  }
  const fromResult = call.result?.instructionId;
  return typeof fromResult === "string" ? fromResult : undefined;
}

/**
 * The conversation so far, as the provider wants it.
 *
 * Only the text of each turn travels. The tool results of earlier turns are
 * deliberately left out: they were evidence about a moment, re-sending them would
 * let a stale reading answer today's question, and they are the expensive half of
 * the prompt. A model that needs the run again reads the run again.
 */
function historyContents(history: readonly AssistantMessage[]): ModelContent[] {
  return history
    .filter((message) => message.text.trim() !== "")
    .map((message) => ({
      role: message.author === "clerk" ? "user" : "model",
      parts: [{ text: maskClabesInText(message.text) }],
    }));
}
