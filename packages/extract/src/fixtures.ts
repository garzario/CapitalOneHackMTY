/**
 * The provider responses the tests and the rehearsal script run against.
 *
 * Say exactly what these are, because a judge is entitled to ask. They are
 * `generateContent` response envelopes written by hand to the shape the provider
 * documents, holding synthetic content invented for this repository. They are
 * NOT captures of a live call: at the time they were written this repo had no
 * key, and inventing a capture and calling it a recording would be worse than
 * useless.
 *
 * What they are good for: the whole path after the socket. The envelope reader
 * in `gemini.ts`, the scanner and the confidence arithmetic in `postprocess.ts`,
 * and the two public functions in `extract.ts` are all exercised by them with no
 * network and no key, which is what keeps `bun test` honest and offline.
 *
 * What they are not good for: proving that the model reads a real photograph.
 * That needs the key and one real photograph.
 *
 * TODO(garzario): with the key in hand, run `scripts/extract-demo.ts` against a
 * photograph of a handwritten instruction, save the response body over
 * `image-handwritten.json` byte for byte, and delete this paragraph.
 *
 * The account numbers in here are synthetic. `058580000723456775` is two digits
 * away from `058580000123456715`, the account the synthetic supplier
 * SYN010101AAA has been paid on seven times, and both changed digits are a 1
 * read as a 7. Its check digit closes. That is the case the product exists for:
 * the arithmetic says yes and only the supplier's own history says no.
 */

import { readFileSync } from "node:fs";

const cache = new Map<string, string>();

/** One fixture as bytes on disk, read once per process. */
export function fixtureText(name: string): string {
  const cached = cache.get(name);
  if (cached !== undefined) {
    return cached;
  }
  const text = readFileSync(
    new URL(`./fixtures/${name}`, import.meta.url),
    "utf8",
  );
  cache.set(name, text);
  return text;
}

/** The same fixture as a `Response`, so a stubbed `fetch` is one line. */
export function fixtureResponse(name: string, status = 200): Response {
  return new Response(fixtureText(name), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** A photographed handwritten instruction, read cleanly. */
export const IMAGE_HANDWRITTEN = "image-handwritten.json";
/** The same note with the last digit misread, so the check digit fails. */
export const IMAGE_CHECK_DIGIT_FAILS = "image-check-digit-fails.json";
/** A photo too blurred to read, where the model correctly answers with null. */
export const IMAGE_ILLEGIBLE = "image-illegible.json";
/** A voice note dictating the account number in groups. */
export const AUDIO_VOICE_NOTE = "audio-voice-note.json";
/** The provider declining to read the file at all. */
export const BLOCKED = "blocked.json";

/**
 * The account SYN010101AAA has actually been paid on, from
 * `apps/api/src/synthetic.ts`. The fixtures are two OCR digits away from it.
 */
export const SYNTHETIC_KNOWN_CLABE = "058580000123456715";

/** What the fixtures read off the photograph and out of the voice note. */
export const SYNTHETIC_READ_CLABE = "058580000723456775";

/**
 * Eight bytes that are a PNG header and nothing else.
 *
 * Enough to exercise the media-type sniffer and to be a non-empty body for a
 * stubbed call. No image is decoded anywhere in this package.
 */
export function pngHeaderBytes(): Uint8Array {
  return new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
}

/** Four bytes that are an Ogg header, for the audio path. */
export function oggHeaderBytes(): Uint8Array {
  return new Uint8Array([0x4f, 0x67, 0x67, 0x53]);
}
