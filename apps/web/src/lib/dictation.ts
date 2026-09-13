/**
 * Voice input for the assistant panel: the browser's own dictation, and nothing
 * this app uploads.
 *
 * The clerk is holding the invoice in one hand and her telephone in the other, so
 * typing a question is the part of the panel that is genuinely in the way. What
 * she dictates becomes text in the composer, she reads it, and she sends it. The
 * turn that reaches the API is the sentence she confirmed, which is exactly what
 * ADR-0007 says may leave the perimeter: the clerk's own sentence, the image she
 * dropped, and the evidence of the findings the turn is about.
 *
 * Why the browser and not our own transcription. `packages/extract` transcribes a
 * voice note through Gemini, and that path exists for the one thing the contract
 * documents it for: a voice note that arrives with a payment instruction, on
 * `POST /api/v1/instructions`, where the transcript lands in `text` and a CLABE is
 * read out of it. `POST /api/v1/assistant/messages` takes `text` and `images` and
 * no audio part, so sending a recording there would mean inventing a field the
 * contract does not have, on the endpoint whose whole point is that what leaves is
 * bounded and written down. Web Speech keeps the audio out of our perimeter
 * entirely: no bytes reach our API, no bytes reach our model, nothing is stored,
 * and the only thing that travels is the sentence she pressed send on. If the team
 * wants the Gemini path in the panel instead, the contract needs an `audio` part
 * first, and the request for it is in the pull request rather than in this file.
 *
 * The API is not in the TypeScript DOM library yet and Safari still only exposes
 * the prefixed constructor, so the surface this module needs is declared here and
 * nothing wider. Absent support is a first-class state and not an error: the
 * button says dictation is unavailable in this browser, and the composer still
 * takes typing, which is the one input that always works.
 */

import { useCallback, useEffect, useRef, useState } from "react";

/** What `onresult` carries, narrowed to the three fields this reads. */
interface RecognitionAlternative {
  transcript: string;
}

interface RecognitionResult {
  readonly length: number;
  isFinal: boolean;
  item(index: number): RecognitionAlternative;
  [index: number]: RecognitionAlternative;
}

interface RecognitionResultList {
  readonly length: number;
  item(index: number): RecognitionResult;
  [index: number]: RecognitionResult;
}

interface RecognitionEvent {
  resultIndex: number;
  results: RecognitionResultList;
}

interface RecognitionErrorEvent {
  error: string;
}

interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: RecognitionEvent) => void) | null;
  onerror: ((event: RecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
}

type RecognitionConstructor = new () => SpeechRecognitionLike;

/** The interface is Spanish and so is the speech: es-MX, not es-ES. */
export const DICTATION_LANG = "es-MX";

/** What the browser calls the failure, in a sentence the clerk can act on. */
export const DICTATION_ERRORS: Record<string, string> = {
  "not-allowed":
    "El navegador no dio permiso del microfono. Puedes escribir la pregunta.",
  "service-not-allowed":
    "El navegador no dio permiso del microfono. Puedes escribir la pregunta.",
  "no-speech": "No se escucho nada. Intenta de nuevo o escribe la pregunta.",
  "audio-capture":
    "No se encontro microfono en este equipo. Puedes escribir la pregunta.",
  network:
    "El dictado del navegador no alcanzo su servicio. Escribe la pregunta.",
  aborted: "Se corto el dictado.",
};

export function recognitionConstructor(): RecognitionConstructor | null {
  if (typeof window === "undefined") {
    return null;
  }

  const holder = window as unknown as Record<string, unknown>;
  const found = holder.SpeechRecognition ?? holder.webkitSpeechRecognition;

  return typeof found === "function" ? (found as RecognitionConstructor) : null;
}

export type UseDictation = {
  /** False when this browser has no recogniser at all. */
  available: boolean;
  listening: boolean;
  /** What is being heard right now, before the recogniser commits to it. */
  interim: string;
  /** Null when nothing has gone wrong. */
  error: string | null;
  start: () => void;
  stop: () => void;
};

/**
 * Dictation into a text field.
 *
 * `onText` is called with each final phrase, which the composer appends. Interim
 * words are exposed separately rather than written into the field, so the clerk
 * never watches her own sentence being rewritten under the cursor.
 */
export function useDictation(onText: (text: string) => void): UseDictation {
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [error, setError] = useState<string | null>(null);
  const recognition = useRef<SpeechRecognitionLike | null>(null);
  const onTextRef = useRef(onText);
  onTextRef.current = onText;

  const available = recognitionConstructor() !== null;

  /* A recogniser left running holds the microphone open after the drawer closes,
     which on a laptop is an indicator light nobody asked for. */
  useEffect(() => {
    return () => {
      recognition.current?.abort();
      recognition.current = null;
    };
  }, []);

  const stop = useCallback(() => {
    recognition.current?.stop();
    setListening(false);
    setInterim("");
  }, []);

  const start = useCallback(() => {
    const Recognition = recognitionConstructor();

    if (Recognition === null) {
      setError(
        "Este navegador no trae dictado. Puedes escribir la pregunta o usar el teclado del telefono.",
      );

      return;
    }

    recognition.current?.abort();

    const instance = new Recognition();
    instance.lang = DICTATION_LANG;
    instance.continuous = false;
    instance.interimResults = true;
    instance.maxAlternatives = 1;

    instance.onresult = (event) => {
      let pending = "";

      for (
        let index = event.resultIndex;
        index < event.results.length;
        index++
      ) {
        const result = event.results[index];

        if (result === undefined) {
          continue;
        }

        const alternative = result[0];

        if (alternative === undefined) {
          continue;
        }

        if (result.isFinal) {
          onTextRef.current(alternative.transcript.trim());
        } else {
          pending += alternative.transcript;
        }
      }

      setInterim(pending.trim());
    };

    instance.onerror = (event) => {
      setError(
        DICTATION_ERRORS[event.error] ??
          "El dictado del navegador se detuvo. Puedes escribir la pregunta.",
      );
      setListening(false);
      setInterim("");
    };

    instance.onend = () => {
      setListening(false);
      setInterim("");
    };

    recognition.current = instance;
    setError(null);
    setInterim("");

    try {
      instance.start();
      setListening(true);
    } catch {
      /* Calling start twice throws, and a thrown dictation must not take the
         panel with it. */
      setListening(false);
    }
  }, []);

  return { available, listening, interim, error, start, stop };
}
