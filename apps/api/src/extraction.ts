/**
 * The seam between the intake route and `@hackmty/extract`.
 *
 * Three jobs, all of them boring on purpose, because the interesting half of
 * this feature is a boundary and a boundary is only credible if the wiring
 * around it is dull:
 *
 * 1. Turn the base64 of `docs/09-api.md` into bytes and work out what kind of
 *    file it is, since that contract carries no media type.
 * 2. Answer `available` from the presence of `GEMINI_API_KEY`, so the pipeline
 *    can refuse an image up front with a message instead of failing mid-call.
 * 3. Turn every failure into a sentence, so a provider outage is a 422 the clerk
 *    can act on rather than a 500.
 *
 * The extractor is injected through `ApiDeps`, which is what lets the whole test
 * suite run this path with no key and no network.
 */

import { Buffer } from "node:buffer";
import {
  AUDIO_MIME_TYPES,
  type AudioExtraction,
  ExtractError,
  extractFromAudio,
  extractFromImage,
  hasApiKey,
  IMAGE_MIME_TYPES,
  type ImageExtraction,
  sniffMediaType,
} from "@hackmty/extract";

/** Either the reading, or the sentence to show the clerk. Never a throw. */
export type Read<T> = { ok: true; value: T } | { ok: false; message: string };

export interface IntakeExtractor {
  /** True when this server holds a key, so a call is possible at all. */
  readonly available: boolean;
  image(base64: string): Promise<Read<ImageExtraction>>;
  audio(base64: string): Promise<Read<AudioExtraction>>;
}

export const NO_KEY =
  "This server holds no GEMINI_API_KEY, so the CLABE cannot be read from an image or a voice note. Send it as text in `clabe`.";

/**
 * The extractor a server with no key gets. It refuses everything, which is the
 * behaviour docs/09-api.md promises and the behaviour CI exercises.
 */
export const UNAVAILABLE_EXTRACTOR: IntakeExtractor = {
  available: false,
  image: async () => ({ ok: false, message: NO_KEY }),
  audio: async () => ({ ok: false, message: NO_KEY }),
};

function readEnv(name: string): string | undefined {
  const holder = globalThis as {
    process?: { env?: Record<string, string | undefined> };
  };
  return holder.process?.env?.[name];
}

/**
 * The real extractor, reading the key from the environment.
 *
 * The key is read once, at wiring time, so that a request can never be the thing
 * that discovers the server is misconfigured.
 */
export function createExtractor(apiKey?: string): IntakeExtractor {
  const key = apiKey ?? readEnv("GEMINI_API_KEY");
  if (!hasApiKey(key)) {
    return UNAVAILABLE_EXTRACTOR;
  }

  return {
    available: true,
    image: (base64) =>
      run(base64, IMAGE_MIME_TYPES, "image", (bytes, mime) =>
        extractFromImage(bytes, mime, { apiKey: key }),
      ),
    audio: (base64) =>
      run(base64, AUDIO_MIME_TYPES, "audio", (bytes, mime) =>
        extractFromAudio(bytes, mime, { apiKey: key }),
      ),
  };
}

async function run<T>(
  base64: string,
  accepted: readonly string[],
  kind: "image" | "audio",
  call: (bytes: Uint8Array, mime: string) => Promise<T>,
): Promise<Read<T>> {
  const bytes = new Uint8Array(Buffer.from(base64, "base64"));
  const mime = sniffMediaType(bytes);

  if (mime === undefined || !accepted.includes(mime)) {
    return {
      ok: false,
      message: `That file is not ${kind} this server can read. Accepted: ${accepted.join(", ")}.`,
    };
  }

  try {
    return { ok: true, value: await call(bytes, mime) };
  } catch (error) {
    // Only our own message, never the provider's body: an error envelope is the
    // response most likely to be pasted into a chat, and the detail can carry
    // whatever the provider decided to echo back.
    return {
      ok: false,
      message:
        error instanceof ExtractError
          ? `The ${kind} could not be read: ${error.message}`
          : `The ${kind} could not be read.`,
    };
  }
}
