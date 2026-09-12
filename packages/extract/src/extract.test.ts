/**
 * Nothing in this file touches the network and nothing needs a key. `http` is a
 * stub in every case and every answer comes from a fixture in `src/fixtures/`,
 * so `bun test` behaves the same on a laptop with a key, in CI without one, and
 * on the venue wifi at 03:00 when there is no wifi.
 */

import { describe, expect, it } from "bun:test";
import {
  AUDIO_PROMPT,
  extractFromAudio,
  extractFromImage,
  IMAGE_PROMPT,
  IMAGE_RESPONSE_SCHEMA,
  readImagePayload,
} from "./extract";
import {
  AUDIO_VOICE_NOTE,
  BLOCKED,
  fixtureResponse,
  IMAGE_CHECK_DIGIT_FAILS,
  IMAGE_HANDWRITTEN,
  IMAGE_ILLEGIBLE,
  oggHeaderBytes,
  pngHeaderBytes,
  SYNTHETIC_KNOWN_CLABE,
  SYNTHETIC_READ_CLABE,
} from "./fixtures";
import { ExtractError, type HttpLike } from "./gemini";

interface Recorded {
  url: string;
  init: RequestInit | undefined;
}

/** Answers with the scripted responses in order and records what was sent. */
function stub(responses: Response[]): { calls: Recorded[]; http: HttpLike } {
  const calls: Recorded[] = [];
  const queue = [...responses];
  const http: HttpLike = async (url, init) => {
    calls.push({ url, init });
    const next = queue.shift();
    if (next === undefined) {
      throw new Error(`no scripted response left for ${url}`);
    }
    return next;
  };
  return { calls, http };
}

const KEY = { apiKey: "test-key-not-a-real-one" };

function bodyOf(call: Recorded): Record<string, unknown> {
  return JSON.parse(String(call.init?.body)) as Record<string, unknown>;
}

describe("extractFromImage", () => {
  it("reads the account number, the amount and the payee off a photo", async () => {
    const { http } = stub([fixtureResponse(IMAGE_HANDWRITTEN)]);

    const result = await extractFromImage(pngHeaderBytes(), "image/png", {
      ...KEY,
      http,
    });

    expect(result.clabe).toBe(SYNTHETIC_READ_CLABE);
    expect(result.amount).toBe(184_300);
    expect(result.supplierHint).toBe("Aceros y Perfiles del Norte");
    expect(result.rawText).toContain("0585 8000 0723 4567 75");
    expect(result.reading.checkDigitValid).toBe(true);
    expect(result.reading.penalties).toEqual([]);
    expect(result.confidence).toBe(0.86);
  });

  it("reads an account two digits from the one paid seven times", () => {
    // The demo case. The check digit closes, so nothing about the number itself
    // is wrong; only the supplier's own history says anything, and that is the
    // detector's job in packages/core, not this package's.
    expect(SYNTHETIC_READ_CLABE).not.toBe(SYNTHETIC_KNOWN_CLABE);
    expect(SYNTHETIC_READ_CLABE.slice(0, 6)).toBe(
      SYNTHETIC_KNOWN_CLABE.slice(0, 6),
    );
  });

  it("drops the confidence when the check digit does not close", async () => {
    const { http } = stub([fixtureResponse(IMAGE_CHECK_DIGIT_FAILS)]);

    const result = await extractFromImage(pngHeaderBytes(), "image/png", {
      ...KEY,
      http,
    });

    expect(result.reading.checkDigitValid).toBe(false);
    expect(result.reading.penalties).toEqual(["check_digit_failed"]);
    expect(result.confidence).toBeLessThan(0.25);
  });

  it("answers with no account number when the photo is illegible", async () => {
    const { http } = stub([fixtureResponse(IMAGE_ILLEGIBLE)]);

    const result = await extractFromImage(pngHeaderBytes(), "image/png", {
      ...KEY,
      http,
    });

    expect(result.clabe).toBeUndefined();
    expect(result.confidence).toBe(0);
    expect(result.rawText).not.toBe("");
  });

  it("sends the prompt, the schema and the bytes, and nothing else", async () => {
    const { calls, http } = stub([fixtureResponse(IMAGE_HANDWRITTEN)]);

    await extractFromImage(pngHeaderBytes(), "image/png", { ...KEY, http });

    const body = bodyOf(calls[0] as Recorded);
    const contents = body.contents as Array<{ parts: unknown[] }>;
    expect(contents).toHaveLength(1);
    expect(contents[0]?.parts).toEqual([
      { text: IMAGE_PROMPT },
      { inlineData: { mimeType: "image/png", data: "iVBORw0KGgo=" } },
    ]);

    const config = body.generationConfig as Record<string, unknown>;
    expect(config.responseMimeType).toBe("application/json");
    expect(config.responseSchema).toEqual(IMAGE_RESPONSE_SCHEMA);
    expect(config.temperature).toBe(0);
    expect(config.thinkingConfig).toEqual({ thinkingBudget: 0 });
  });

  it("puts the key in a header and never in the URL", async () => {
    const { calls, http } = stub([fixtureResponse(IMAGE_HANDWRITTEN)]);

    await extractFromImage(pngHeaderBytes(), "image/png", { ...KEY, http });

    const call = calls[0] as Recorded;
    expect(call.url).not.toContain(KEY.apiKey);
    expect(call.url).toContain("models/gemini-2.5-flash:generateContent");
    const headers = call.init?.headers as Record<string, string>;
    expect(headers["x-goog-api-key"]).toBe(KEY.apiKey);
  });

  it("refuses a media type it will not send, before any request", async () => {
    const { calls, http } = stub([]);

    const failure = await extractFromImage(
      pngHeaderBytes(),
      "application/pdf",
      { ...KEY, http },
    ).catch((error: unknown) => error as ExtractError);

    expect(failure).toBeInstanceOf(ExtractError);
    expect((failure as ExtractError).code).toBe("unsupported_mime");
    expect(calls).toHaveLength(0);
  });

  it("refuses to run with no key, before any request", async () => {
    const { calls, http } = stub([]);

    const failure = await extractFromImage(pngHeaderBytes(), "image/png", {
      apiKey: "   ",
      http,
    }).catch((error: unknown) => error as ExtractError);

    expect((failure as ExtractError).code).toBe("missing_api_key");
    expect(calls).toHaveLength(0);
  });

  it("refuses an empty file", async () => {
    const { http } = stub([]);

    const failure = await extractFromImage(new Uint8Array(), "image/png", {
      ...KEY,
      http,
    }).catch((error: unknown) => error as ExtractError);

    expect((failure as ExtractError).code).toBe("empty_input");
  });

  it("reports a provider failure without echoing the key", async () => {
    const { http } = stub([
      new Response(`{"error":{"message":"key ${KEY.apiKey} is bad"}}`, {
        status: 400,
      }),
    ]);

    const failure = (await extractFromImage(pngHeaderBytes(), "image/png", {
      ...KEY,
      http,
    }).catch((error: unknown) => error)) as ExtractError;

    expect(failure.code).toBe("http_error");
    expect(failure.message).toContain("400");
    expect(failure.detail).not.toContain(KEY.apiKey);
    expect(failure.detail).toContain("[redacted]");
  });

  it("reports a refusal as blocked rather than as an empty reading", async () => {
    const { http } = stub([fixtureResponse(BLOCKED)]);

    const failure = (await extractFromImage(pngHeaderBytes(), "image/png", {
      ...KEY,
      http,
    }).catch((error: unknown) => error)) as ExtractError;

    expect(failure.code).toBe("blocked");
  });

  it("reports an exhausted output budget rather than a truncated account", async () => {
    const { http } = stub([
      new Response(
        JSON.stringify({ candidates: [{ finishReason: "MAX_TOKENS" }] }),
        { status: 200 },
      ),
    ]);

    const failure = (await extractFromImage(pngHeaderBytes(), "image/png", {
      ...KEY,
      http,
    }).catch((error: unknown) => error)) as ExtractError;

    expect(failure.code).toBe("bad_response");
    expect(failure.message).toContain("budget");
  });

  it("reports an answer that is not JSON", async () => {
    const { http } = stub([new Response("<html>502</html>", { status: 200 })]);

    const failure = (await extractFromImage(pngHeaderBytes(), "image/png", {
      ...KEY,
      http,
    }).catch((error: unknown) => error)) as ExtractError;

    expect(failure.code).toBe("bad_response");
  });
});

describe("extractFromAudio", () => {
  it("transcribes a voice note and picks up the dictated account", async () => {
    const { calls, http } = stub([fixtureResponse(AUDIO_VOICE_NOTE)]);

    const result = await extractFromAudio(oggHeaderBytes(), "audio/ogg", {
      ...KEY,
      http,
    });

    expect(result.transcript).toContain("Aceros y Perfiles del Norte");
    expect(result.clabe).toBe(SYNTHETIC_READ_CLABE);
    expect(result.amount).toBe(184_300);
    expect(result.reading.source).toBe("text");
    expect(result.confidence).toBe(0.78);

    const body = bodyOf(calls[0] as Recorded);
    const contents = body.contents as Array<{
      parts: Array<{ text?: string }>;
    }>;
    expect(contents[0]?.parts[0]?.text).toBe(AUDIO_PROMPT);
  });

  it("normalises the media type a browser recorder produces", async () => {
    const { calls, http } = stub([fixtureResponse(AUDIO_VOICE_NOTE)]);

    await extractFromAudio(oggHeaderBytes(), "Audio/OGG; codecs=opus", {
      ...KEY,
      http,
    });

    const body = bodyOf(calls[0] as Recorded);
    const contents = body.contents as Array<{
      parts: Array<{ inlineData?: { mimeType: string } }>;
    }>;
    expect(contents[0]?.parts[1]?.inlineData?.mimeType).toBe("audio/ogg");
  });

  it("refuses an image media type on the audio path", async () => {
    const { http } = stub([]);

    const failure = (await extractFromAudio(oggHeaderBytes(), "image/png", {
      ...KEY,
      http,
    }).catch((error: unknown) => error)) as ExtractError;

    expect(failure.code).toBe("unsupported_mime");
  });
});

describe("readImagePayload", () => {
  it("survives a payload with every field missing", () => {
    const result = readImagePayload({});

    expect(result.rawText).toBe("");
    expect(result.clabe).toBeUndefined();
    expect(result.amount).toBeUndefined();
    expect(result.supplierHint).toBeUndefined();
    expect(result.confidence).toBe(0);
  });

  it("drops an amount the model wrote as a string", () => {
    const result = readImagePayload({
      rawText: "total",
      amount: "184,300.00" as unknown as number,
      clarity: 0.9,
    });

    expect(result.amount).toBeUndefined();
  });
});
