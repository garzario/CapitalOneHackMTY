/**
 * The assistant drawer: the front door of the product for the person who uses it.
 *
 * Lupita does not open six screens. She drops the screenshot that arrived on
 * WhatsApp, asks why a line is red, and presses the button on what the app
 * proposes. This drawer is that, and the reason it can exist in a payments product
 * at all is the boundary ADR-0007 draws: what is inside here reads and proposes,
 * and a person executes. So the panel is built to make that visible rather than to
 * hide it.
 *
 * - Every read the answer was built from is a card above the answer, with the
 *   evidence it returned. The answer cannot be checked without them.
 * - A proposal is a card with a button, and the card prints the method, the path
 *   and the body of the ordinary endpoint that would run. Nothing is ever sent on
 *   arrival, on a timer or on a hover.
 * - The level and the state on any card come from `packages/core`, never from the
 *   stream. A sentence that carries the word "seguro", a percentage or a
 *   probability is dropped by `decodeAssistantEvent` before it reaches this file,
 *   and the panel says how many frames it dropped.
 *
 * The three data modes are the same three the rest of the app has.
 * `?data=mock` opens no connection at all and answers out of the synthetic run,
 * which is what makes the panel demonstrable on a phone with no server and what
 * the header says in one sentence. `?data=api` talks to the API and reports its
 * failures as failures, which is how a judge proves the backend is answering.
 * `auto` tries the API and falls back to the synthetic answer with the reason
 * printed, exactly like `useResource`.
 */

import type {
  ActionProposal,
  Actor,
  AssistantMessage,
  AssistantToolCall,
} from "@hackmty/core";
import { motion, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useActor } from "../lib/actor";
import {
  IMAGE_TURN_TEXT,
  QUICK_PROMPTS,
  sendAssistantTurn,
} from "../lib/assistant";
import {
  defaultInstructionId,
  mockAssistantSession,
  offlineTurn,
} from "../lib/assistant-mock";
import type { AssistantImage, AssistantStreamEvent } from "../lib/contract";
import { useDictation } from "../lib/dictation";
import { formatTime } from "../lib/format";
import { ROLE_LABEL } from "../lib/labels";
import { type DataMode, dataMode } from "../lib/resource";
import { useRoute } from "../lib/router";
import {
  ExtractionCard,
  ImageThumb,
  ProposalCard,
  ToolCallCard,
} from "./AssistantCards";
import { SyntheticMark } from "./Primitives";
import { EmptyBlock, ErrorBlock, SourceNotice } from "./States";

/** A phone screenshot is a megabyte or three. Past this it is a mistake. */
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

/** How the offline answer is spaced out, so it reads as an answer being written. */
const TOKEN_MS = 26;
const READ_MS = 180;

type Turn = {
  text: string;
  toolCalls: AssistantToolCall[];
  proposal: ActionProposal | null;
  /** True while frames are still arriving, for `aria-busy`. */
  live: boolean;
};

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

/** Only images, and only ones small enough to post from a phone. */
function imagesFrom(files: readonly File[]): AssistantImage[] {
  return files
    .filter(
      (file) => file.type.startsWith("image/") && file.size <= MAX_IMAGE_BYTES,
    )
    .map((file) => ({
      file,
      name: file.name === "" ? "captura.png" : file.name,
      mediaType: file.type,
      bytes: file.size,
    }));
}

export function AssistantPanel({ onClose }: { onClose: () => void }) {
  const mode = dataMode();
  const reduceMotion = useReducedMotion();
  const route = useRoute();
  const panelRef = useRef<HTMLDivElement | null>(null);
  const logRef = useRef<HTMLDivElement | null>(null);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const cancelled = useRef(false);

  /**
   * Offline the drawer opens on the conversation the generator wrote out of this
   * run's own finding, which is the session the API would replay. Online it opens
   * empty: a conversation nobody had is not something to show as history.
   */
  const initial = useMemo(
    () => (mode === "mock" ? mockAssistantSession() : null),
    [mode],
  );

  const [messages, setMessages] = useState<AssistantMessage[]>(
    initial === null ? [] : initial.messages,
  );
  const [sessionId, setSessionId] = useState<string | undefined>(
    initial?.id ?? undefined,
  );
  const [turn, setTurn] = useState<Turn | null>(null);
  const [draft, setDraft] = useState("");
  const [attached, setAttached] = useState<AssistantImage[]>([]);
  const [notice, setNotice] = useState<string | null>(
    mode === "mock"
      ? "Modo sin conexion: las respuestas de este panel se arman con la corrida sintetica y no con un modelo. No sale ninguna peticion del navegador."
      : null,
  );
  const [failure, setFailure] = useState<string | null>(null);
  const [dropped, setDropped] = useState(0);
  const [sending, setSending] = useState(false);
  const [dragging, setDragging] = useState(false);

  /** The images of each turn, by message id, so a sent screenshot stays visible. */
  const [sentImages, setSentImages] = useState<
    Record<string, readonly AssistantImage[]>
  >({});

  /* Whoever is selected on the entry screen, live. It used to be the generated
     clerk, which made the panel unable to offer the one thing that needs the
     owner: `ProposalCard` reads this to decide whether a release over a finding
     can be confirmed at all, and a panel that always believed it was talking to
     the capturista asked for a name to be typed even when the owner was the one
     holding the laptop. */
  const actor = useActor();

  /** The line the panel is looking at, which is what a question with no folio is about. */
  const openInstructionId =
    route.name === "instruction"
      ? route.id
      : mode === "mock"
        ? defaultInstructionId()
        : null;

  const dictation = useDictation(
    useCallback((text: string) => {
      setDraft((current) => (current === "" ? text : `${current} ${text}`));
    }, []),
  );

  /* Escape closes and focus moves into the drawer and back out, because a drawer
     a keyboard cannot leave is worse than no drawer. */
  useEffect(() => {
    const previous = document.activeElement;

    composerRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", onKeyDown);

    return () => {
      window.removeEventListener("keydown", onKeyDown);

      if (previous instanceof HTMLElement) {
        previous.focus();
      }
    };
  }, [onClose]);

  /* Anything in flight stops when the drawer goes away. */
  useEffect(() => {
    cancelled.current = false;

    return () => {
      cancelled.current = true;
    };
  }, []);

  /* Drop anywhere on the drawer. The listeners are attached here rather than as
     JSX handlers so the drop target is the whole panel and not one box, which is
     how a person actually drags a screenshot out of WhatsApp. */
  useEffect(() => {
    const element = panelRef.current;

    if (element === null) {
      return;
    }

    const onDragOver = (event: DragEvent) => {
      event.preventDefault();
      setDragging(true);
    };
    const onDragLeave = () => setDragging(false);
    const onDrop = (event: DragEvent) => {
      event.preventDefault();
      setDragging(false);

      const files = Array.from(event.dataTransfer?.files ?? []);
      const images = imagesFrom(files);

      if (images.length === 0 && files.length > 0) {
        setFailure(
          "Solo imagenes, y de menos de 4 MB. Una captura de WhatsApp entra de sobra.",
        );

        return;
      }

      setAttached((current) => [...current, ...images]);
    };

    element.addEventListener("dragover", onDragOver);
    element.addEventListener("dragleave", onDragLeave);
    element.addEventListener("drop", onDrop);

    return () => {
      element.removeEventListener("dragover", onDragOver);
      element.removeEventListener("dragleave", onDragLeave);
      element.removeEventListener("drop", onDrop);
    };
  }, []);

  /* The newest turn is the one being read, so the log follows it. */
  // biome-ignore lint/correctness/useExhaustiveDependencies: `messages` and `turn` are the retrigger, not values the body reads
  useEffect(() => {
    const log = logRef.current;

    if (log !== null) {
      log.scrollTop = log.scrollHeight;
    }
  }, [messages, turn]);

  const onEvent = useCallback((event: AssistantStreamEvent) => {
    setTurn((current) => {
      const base: Turn = current ?? {
        text: "",
        toolCalls: [],
        proposal: null,
        live: true,
      };

      switch (event.kind) {
        case "token":
          return { ...base, text: base.text + event.text };
        case "tool_call":
          return { ...base, toolCalls: [...base.toolCalls, event.call] };
        case "tool_result":
          return {
            ...base,
            toolCalls: base.toolCalls.map((call) =>
              call.id === event.call.id ? event.call : call,
            ),
          };
        case "proposal":
          return { ...base, proposal: event.proposal };
        case "done":
          return base;
      }
    });

    if (event.kind === "token" && event.sessionId !== undefined) {
      setSessionId(event.sessionId);
    }

    if (event.kind === "done") {
      setSessionId(event.message.sessionId);
      setMessages((current) => [...current, event.message]);
      setTurn(null);
    }
  }, []);

  /** The offline answer, spaced out so it arrives the way the API's does. */
  const playOffline = useCallback(
    async (text: string, images: readonly AssistantImage[], seq: number) => {
      const id = sessionId ?? mockAssistantSession().id;
      const events = offlineTurn({
        text,
        images,
        sessionId: id,
        at: new Date().toISOString(),
        seq,
        instructionId: openInstructionId,
      });

      for (const event of events) {
        if (cancelled.current) {
          return;
        }

        onEvent(event);

        if (!reduceMotion) {
          await wait(event.kind === "token" ? TOKEN_MS : READ_MS);
        }
      }
    },
    [onEvent, openInstructionId, reduceMotion, sessionId],
  );

  const send = useCallback(
    async (text: string, images: readonly AssistantImage[]) => {
      const trimmed = text.trim();

      if (trimmed === "" && images.length === 0) {
        return;
      }

      const said = trimmed === "" ? IMAGE_TURN_TEXT : trimmed;
      const at = new Date().toISOString();
      const seq = messages.length + 1;
      const id = sessionId ?? mockAssistantSession().id;
      const mine: AssistantMessage = {
        id: `${id}-clerk-${seq}`,
        sessionId: id,
        author: "clerk",
        text: said,
        at,
        actor,
        ...(openInstructionId === null
          ? {}
          : { instructionId: openInstructionId }),
      };

      setMessages((current) => [...current, mine]);
      if (images.length > 0) {
        setSentImages((current) => ({ ...current, [mine.id]: images }));
      }
      setDraft("");
      setAttached([]);
      setFailure(null);
      setSending(true);
      setTurn({ text: "", toolCalls: [], proposal: null, live: true });

      if (mode === "mock") {
        await playOffline(said, images, seq + 1);
        setSending(false);

        return;
      }

      const result = await sendAssistantTurn(
        {
          text: said,
          ...(sessionId === undefined ? {} : { sessionId }),
          ...(images.length === 0 ? {} : { images }),
        },
        onEvent,
        { actor },
      );

      if (!result.ok) {
        setTurn(null);

        if (mode === "api") {
          setFailure(result.error.message);
          setSending(false);

          return;
        }

        /* `auto` is API first by definition, so a failure is answered the way
           every other screen answers it: the synthetic run, with the reason on
           screen rather than a blank panel. */
        setNotice(
          `Sin API (${result.error.message}). La respuesta se arma con la corrida sintetica.`,
        );
        await playOffline(said, images, seq + 1);
        setSending(false);

        return;
      }

      setDropped((current) => current + result.data.dropped);

      if (result.data.message === null) {
        setFailure(
          "El turno se corto antes de terminar. La conversacion se queda como esta y puedes volver a preguntar.",
        );
      }

      setSending(false);
    },
    [
      actor,
      messages.length,
      mode,
      onEvent,
      openInstructionId,
      playOffline,
      sessionId,
    ],
  );

  const quickPrompt = (prompt: string) => {
    const folio = openInstructionId;
    const text =
      folio !== null && prompt.startsWith("Por que esta en rojo")
        ? `${prompt} ${folio}`
        : prompt;

    void send(text, attached);
  };

  return (
    <>
      {/* A button and not a div with a handler, so closing by pointer and closing
          by keyboard are the same control. */}
      <button
        type="button"
        className="scrim"
        aria-label="Cerrar el asistente"
        onClick={onClose}
      />
      <motion.div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="assistant-title"
        tabIndex={-1}
        className="drawer"
        data-tour="assistant-panel"
        initial={reduceMotion ? false : { x: 32, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{
          duration: reduceMotion ? 0 : 0.24,
          ease: [0.2, 0.8, 0.2, 1],
        }}
        style={{
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          outline: dragging ? "2px dashed var(--c-accent)" : undefined,
        }}
      >
        <header
          className="flex flex-col gap-2 border-b p-4"
          style={{ borderColor: "var(--c-border)" }}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex flex-col gap-1">
              <span className="eyebrow">Asistente de la corrida</span>
              <h2 id="assistant-title" className="m-0 t-md">
                Lee la corrida y propone. Tu confirmas.
              </h2>
            </div>
            <button type="button" className="btn btn-sm" onClick={onClose}>
              Cerrar
            </button>
          </div>
          <p className="muted m-0 t-xs">
            No decide, no retiene y no manda dinero. Cada accion sale del
            endpoint de siempre, con tu nombre en el evento: {actor.name},{" "}
            {ROLE_LABEL[actor.role]}.
          </p>
          <SyntheticMark when={true} />
        </header>

        <div
          ref={logRef}
          role="log"
          aria-live="polite"
          aria-busy={sending}
          className="flex flex-1 flex-col gap-4 overflow-y-auto p-4"
        >
          <SourceNotice notice={notice} />

          {messages.length === 0 && turn === null ? (
            <EmptyBlock
              title="Preguntale algo de esta corrida"
              description="Por que se detuvo una linea, el resumen de la semana para el dueno, el historial de cuentas de un proveedor. O suelta aqui la captura que te llego."
            />
          ) : null}

          {messages.map((message) => (
            <MessageBlock
              key={message.id}
              message={message}
              images={sentImages[message.id] ?? []}
              actor={actor}
              mode={mode}
            />
          ))}

          {turn !== null ? (
            <section
              className="flex flex-col gap-2"
              aria-label="Respuesta en curso"
            >
              {turn.toolCalls.map((call) => (
                <ToolCallCard
                  key={call.id}
                  call={call}
                  pending={call.result === undefined}
                />
              ))}
              {turn.text === "" ? (
                <p className="muted m-0 t-sm">Leyendo la corrida.</p>
              ) : (
                <p className="m-0 t-base">{turn.text}</p>
              )}
            </section>
          ) : null}

          {dropped > 0 ? (
            <p className="panel-sunken muted m-0 px-3 py-2 t-xs">
              Se descartaron {dropped} eventos que no cumplen el contrato del
              panel: una lectura que no es de solo lectura, o una frase con un
              veredicto que este producto no usa.
            </p>
          ) : null}

          {failure !== null ? (
            <div className="panel-sunken">
              <ErrorBlock
                title="No se pudo contestar"
                message={failure}
                onRetry={() => setFailure(null)}
              />
            </div>
          ) : null}
        </div>

        <footer
          className="flex flex-col gap-2 border-t p-3"
          style={{
            borderColor: "var(--c-border)",
            backgroundColor: "var(--c-surface)",
          }}
        >
          <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
            {QUICK_PROMPTS.map((prompt) => (
              <li key={prompt}>
                <button
                  type="button"
                  className="btn btn-sm"
                  disabled={sending}
                  onClick={() => quickPrompt(prompt)}
                >
                  {prompt}
                </button>
              </li>
            ))}
          </ul>

          {attached.length > 0 ? (
            <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
              {attached.map((image, index) => (
                <li
                  key={`${image.name}-${image.bytes}`}
                  className="flex flex-col items-start gap-1"
                >
                  <ImageThumb image={image} />
                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={() =>
                      setAttached((current) =>
                        current.filter((_, at) => at !== index),
                      )
                    }
                  >
                    Quitar
                  </button>
                </li>
              ))}
            </ul>
          ) : null}

          {dictation.listening ? (
            <p className="muted m-0 t-xs" aria-live="polite">
              Escuchando. {dictation.interim}
            </p>
          ) : null}

          {dictation.error !== null ? (
            <p className="subtle m-0 t-xs">{dictation.error}</p>
          ) : null}

          <textarea
            ref={composerRef}
            className="textarea"
            style={{ minHeight: "4.5rem" }}
            placeholder="Escribe, dicta o suelta la captura que te llego."
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void send(draft, attached);
              }
            }}
            onPaste={(event) => {
              const images = imagesFrom(Array.from(event.clipboardData.files));

              if (images.length > 0) {
                event.preventDefault();
                setAttached((current) => [...current, ...images]);
              }
            }}
          />

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="btn btn-sm"
              aria-pressed={dictation.listening}
              disabled={!dictation.available}
              onClick={() =>
                dictation.listening ? dictation.stop() : dictation.start()
              }
            >
              {dictation.listening ? "Detener el dictado" : "Dictar"}
            </button>

            {/* A label wrapping the input, because a styled file picker has to stay
                a real input or the keyboard cannot reach it. */}
            <label className="btn btn-sm" htmlFor="assistant-image">
              Adjuntar captura
            </label>
            <input
              id="assistant-image"
              type="file"
              accept="image/*"
              multiple
              className="sr-only"
              onChange={(event) => {
                const images = imagesFrom(Array.from(event.target.files ?? []));
                setAttached((current) => [...current, ...images]);
                event.target.value = "";
              }}
            />

            <button
              type="button"
              className="btn btn-accent btn-sm ml-auto"
              aria-busy={sending}
              disabled={
                sending || (draft.trim() === "" && attached.length === 0)
              }
              onClick={() => void send(draft, attached)}
            >
              {sending ? "Leyendo" : "Preguntar"}
            </button>
          </div>

          {!dictation.available ? (
            <p className="subtle m-0 t-xs">
              Este navegador no trae dictado. El teclado del telefono si, y la
              nota de voz con una CLABE se transcribe en el alta por QR.
            </p>
          ) : null}
        </footer>
      </motion.div>
    </>
  );
}

/**
 * One stored turn: who said it, what it says, its reads and its one proposal.
 *
 * The clerk's own turn carries the screenshots she dropped as thumbnails, and the
 * answer that proposes an intake carries the extraction card: the fields a person
 * is about to agree to pay, which is the half of the flow that has to be readable
 * before the button is pressed.
 */
function MessageBlock({
  message,
  images,
  actor,
  mode,
}: {
  message: AssistantMessage;
  images: readonly AssistantImage[];
  actor: Actor;
  mode: DataMode;
}) {
  const mine = message.author === "clerk";

  return (
    <section
      className="flex flex-col gap-2"
      aria-label={mine ? "Tu pregunta" : "Respuesta del asistente"}
    >
      <header className="flex items-baseline justify-between gap-2">
        <span className="eyebrow">
          {mine ? (message.actor?.name ?? actor.name) : "Asistente"}
        </span>
        <span className="subtle t-xs">{formatTime(message.at)}</span>
      </header>

      <p
        className={mine ? "panel-sunken m-0 p-3 t-base" : "m-0 t-base"}
        style={mine ? { borderRadius: "var(--radius-md)" } : undefined}
      >
        {message.text}
      </p>

      {images.length > 0 ? (
        <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
          {images.map((image) => (
            <li key={`${image.name}-${image.bytes}`}>
              <ImageThumb image={image} />
            </li>
          ))}
        </ul>
      ) : null}

      {message.toolCalls?.map((call) => (
        <ToolCallCard key={call.id} call={call} />
      ))}

      {message.proposal !== undefined ? (
        <>
          {message.proposal.kind === "intake" ? (
            <ExtractionCard images={[]} fields={message.proposal.payload} />
          ) : null}
          <ProposalCard proposal={message.proposal} actor={actor} mode={mode} />
        </>
      ) : null}
    </section>
  );
}
