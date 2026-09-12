/**
 * The two functions the rest of the product calls.
 *
 * `extractFromImage` reads a photographed or screenshotted payment instruction.
 * `extractFromAudio` transcribes a voice note. Both return characters and a
 * number between 0 and 1, and neither returns a `Finding`, a `Decision`, an
 * action or a score. There is a test in `boundary.test.ts` that fails if one of
 * those words ever appears in this package.
 *
 * The prompts below are the whole instruction set the model receives. They are
 * written in English because everything in this repository that is code is, and
 * the document being read is in Spanish, which the model handles. Read them once
 * before quoting the LLM boundary in the pitch: they ask for a transcription and
 * they forbid a guess, and the schema they are paired with has no field a
 * judgment could be written into.
 */

import {
  AUDIO_MIME_TYPES,
  type GeminiOptions,
  generateJson,
  IMAGE_MIME_TYPES,
  type ResponseSchema,
  requireMime,
} from "./gemini";
import {
  type ClabeReading,
  readAmount,
  readClabeFromText,
  readHint,
} from "./postprocess";

export type ExtractOptions = GeminiOptions;

/** What a photographed instruction gave up. */
export interface ImageExtraction {
  /** The eighteen digits, absent when the photo carries no account number. */
  clabe?: string;
  amount?: number;
  /** The payee as written. A label for the clerk, never matched to an RFC here. */
  supplierHint?: string;
  /** Everything legible in the image, which is what the clerk checks against. */
  rawText: string;
  /** 0 to 1, for `PaymentInstruction.ocrConfidence`. */
  confidence: number;
  /** How `clabe` and `confidence` were arrived at. Rendered as evidence chips. */
  reading: ClabeReading;
}

/** What a voice note gave up. */
export interface AudioExtraction {
  /** The spoken words. `PaymentInstruction.text` holds this, and nothing reads it. */
  transcript: string;
  clabe?: string;
  amount?: number;
  confidence: number;
  reading: ClabeReading;
}

/** The JSON the model is asked for when it is looking at an image. */
export const IMAGE_RESPONSE_SCHEMA: ResponseSchema = {
  type: "OBJECT",
  properties: {
    rawText: {
      type: "STRING",
      description: "Every legible character, line by line, exactly as written.",
    },
    clabe: {
      type: "STRING",
      nullable: true,
      description:
        "The 18-digit CLABE account number, digits only, or null if it is not written or not fully legible.",
    },
    amount: {
      type: "NUMBER",
      nullable: true,
      description:
        "The amount in Mexican pesos as a number, with no currency symbol and no thousands separator, or null.",
    },
    supplierHint: {
      type: "STRING",
      nullable: true,
      description: "The name of the person or company to be paid, or null.",
    },
    clarity: {
      type: "NUMBER",
      description:
        "How clearly the digits of the account number were legible, from 0 to 1.",
    },
  },
  required: ["rawText", "clarity"],
  propertyOrdering: ["rawText", "clabe", "amount", "supplierHint", "clarity"],
};

/** The JSON the model is asked for when it is listening to a voice note. */
export const AUDIO_RESPONSE_SCHEMA: ResponseSchema = {
  type: "OBJECT",
  properties: {
    transcript: {
      type: "STRING",
      description: "The spoken words, verbatim, in the language spoken.",
    },
    clabe: {
      type: "STRING",
      nullable: true,
      description:
        "The 18-digit CLABE account number if one is dictated, digits only, or null.",
    },
    amount: {
      type: "NUMBER",
      nullable: true,
      description:
        "The amount in Mexican pesos as a number, or null if none is said.",
    },
    clarity: {
      type: "NUMBER",
      description: "How clearly the digits were audible, from 0 to 1.",
    },
  },
  required: ["transcript", "clarity"],
  propertyOrdering: ["transcript", "clabe", "amount", "clarity"],
};

export const IMAGE_PROMPT = [
  "You are transcribing a payment instruction that a Mexican supplier sent to its client.",
  "It may be a photograph of a handwritten note, a scan, or a screenshot of a message.",
  "Transcribe what is there. Do not interpret it, do not judge it, do not advise anyone.",
  "",
  "Rules:",
  "- Never guess a digit. A digit you cannot read with certainty makes clabe null.",
  "- A CLABE is exactly 18 digits and is often written in groups. Report it as 18 digits with no spaces.",
  "- Report clarity as 1 only when every digit of the account number is unambiguous.",
  "- Copy rawText exactly as written, including the grouping of the digits.",
].join("\n");

export const AUDIO_PROMPT = [
  "You are transcribing a voice note that a Mexican supplier sent to its client about a payment.",
  "Transcribe what is said. Do not interpret it, do not judge it, do not advise anyone.",
  "",
  "Rules:",
  "- Never guess a digit. A digit you cannot hear with certainty makes clabe null.",
  "- A CLABE is exactly 18 digits and is usually dictated in groups. Report it as 18 digits with no spaces.",
  "- Report clarity as 1 only when every digit of the account number is unambiguous.",
  "- Write the transcript in the language spoken, verbatim.",
  "- Write a number that is dictated digit by digit as digits, grouped the way it was spoken, so the transcript can be checked against the account number.",
].join("\n");

/**
 * Output budgets. A photograph of a note transcribes into a few hundred tokens
 * and a thirty second voice note into a few hundred more, so these are generous
 * without being open ended. A budget that runs out returns `bad_response`
 * rather than a truncated account number.
 */
export const IMAGE_MAX_OUTPUT_TOKENS = 1024;
export const AUDIO_MAX_OUTPUT_TOKENS = 2048;

/** The fields the image schema asks for, before any of our own checks. */
export interface ImagePayload {
  rawText?: string | null;
  clabe?: string | null;
  amount?: number | null;
  supplierHint?: string | null;
  clarity?: number | null;
}

/** The fields the audio schema asks for, before any of our own checks. */
export interface AudioPayload {
  transcript?: string | null;
  clabe?: string | null;
  amount?: number | null;
  clarity?: number | null;
}

/**
 * Reads the account number, the amount and the payee off a photographed
 * instruction.
 *
 * @param bytes The image. This and the prompt above are the only things sent.
 * @param mime The media type. `sniffMediaType` derives one from the bytes when
 *   the caller has none, which is the case for the base64 in docs/09-api.md.
 * @throws ExtractError for a bad key, an unreadable media type, a provider
 *   failure or an answer that is not the JSON the schema asked for.
 */
export async function extractFromImage(
  bytes: Uint8Array,
  mime: string,
  options: ExtractOptions = {},
): Promise<ImageExtraction> {
  const payload = await generateJson<ImagePayload>(
    {
      prompt: IMAGE_PROMPT,
      mimeType: requireMime(mime, IMAGE_MIME_TYPES, "image"),
      data: bytes,
      schema: IMAGE_RESPONSE_SCHEMA,
      maxOutputTokens: IMAGE_MAX_OUTPUT_TOKENS,
    },
    options,
  );
  return readImagePayload(payload);
}

/**
 * Transcribes a voice note and picks up an account number if one is dictated.
 *
 * @throws ExtractError, as `extractFromImage` does.
 */
export async function extractFromAudio(
  bytes: Uint8Array,
  mime: string,
  options: ExtractOptions = {},
): Promise<AudioExtraction> {
  const payload = await generateJson<AudioPayload>(
    {
      prompt: AUDIO_PROMPT,
      mimeType: requireMime(mime, AUDIO_MIME_TYPES, "audio"),
      data: bytes,
      schema: AUDIO_RESPONSE_SCHEMA,
      maxOutputTokens: AUDIO_MAX_OUTPUT_TOKENS,
    },
    options,
  );
  return readAudioPayload(payload);
}

/**
 * The pure half of `extractFromImage`. Exported so a recorded response is a
 * test, and so that the only untested thing left is the POST itself.
 */
export function readImagePayload(payload: ImagePayload): ImageExtraction {
  const rawText = typeof payload.rawText === "string" ? payload.rawText : "";
  const reading = readClabeFromText(rawText, payload.clabe, payload.clarity);
  const amount = readAmount(payload.amount);
  const supplierHint = readHint(payload.supplierHint);

  const result: ImageExtraction = {
    rawText,
    confidence: reading.confidence,
    reading,
  };
  if (reading.clabe !== undefined) {
    result.clabe = reading.clabe;
  }
  if (amount !== undefined) {
    result.amount = amount;
  }
  if (supplierHint !== undefined) {
    result.supplierHint = supplierHint;
  }
  return result;
}

/** The pure half of `extractFromAudio`. */
export function readAudioPayload(payload: AudioPayload): AudioExtraction {
  const transcript =
    typeof payload.transcript === "string" ? payload.transcript : "";
  const reading = readClabeFromText(transcript, payload.clabe, payload.clarity);
  const amount = readAmount(payload.amount);

  const result: AudioExtraction = {
    transcript,
    confidence: reading.confidence,
    reading,
  };
  if (reading.clabe !== undefined) {
    result.clabe = reading.clabe;
  }
  if (amount !== undefined) {
    result.amount = amount;
  }
  return result;
}
