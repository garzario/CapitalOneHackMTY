/**
 * The media-type layer and the envelope reader. No network, no key.
 *
 * The sniffer earns its tests because the intake contract in docs/09-api.md
 * carries base64 and no media type: if this function is wrong, a clerk's photo
 * is refused at the edge or sent to the provider in a format it will not read,
 * and neither failure is visible from the screen.
 */

import { describe, expect, it } from "bun:test";
import {
  AUDIO_MIME_TYPES,
  IMAGE_MIME_TYPES,
  normalizeMime,
  requireMime,
  sniffMediaType,
  stripJsonFence,
} from "./gemini";

function bytes(...values: Array<number | string>): Uint8Array {
  const flat: number[] = [];
  for (const value of values) {
    if (typeof value === "number") {
      flat.push(value);
    } else {
      for (const character of value) {
        flat.push(character.charCodeAt(0));
      }
    }
  }
  return new Uint8Array(flat);
}

describe("sniffMediaType", () => {
  it("recognises the formats a phone camera produces", () => {
    expect(sniffMediaType(bytes(0x89, "PNG", 0x0d, 0x0a, 0x1a, 0x0a))).toBe(
      "image/png",
    );
    expect(sniffMediaType(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe("image/jpeg");
    expect(sniffMediaType(bytes("RIFF", 0, 0, 0, 0, "WEBP"))).toBe(
      "image/webp",
    );
    expect(sniffMediaType(bytes(0, 0, 0, 0x20, "ftypheic"))).toBe("image/heic");
  });

  it("recognises the formats a voice note arrives in", () => {
    expect(sniffMediaType(bytes("OggS"))).toBe("audio/ogg");
    expect(sniffMediaType(bytes("RIFF", 0, 0, 0, 0, "WAVE"))).toBe("audio/wav");
    expect(sniffMediaType(bytes("fLaC"))).toBe("audio/flac");
    expect(sniffMediaType(bytes("ID3", 3, 0))).toBe("audio/mp3");
    expect(sniffMediaType(bytes(0xff, 0xfb, 0x90))).toBe("audio/mp3");
    expect(sniffMediaType(bytes(0x1a, 0x45, 0xdf, 0xa3))).toBe("audio/webm");
    expect(sniffMediaType(bytes(0, 0, 0, 0x20, "ftypM4A "))).toBe("audio/mp4");
  });

  it("tells a WEBP from a WAV, which share the RIFF header", () => {
    expect(sniffMediaType(bytes("RIFF", 1, 2, 3, 4, "WEBPVP8 "))).toBe(
      "image/webp",
    );
    expect(sniffMediaType(bytes("RIFF", 1, 2, 3, 4, "WAVEfmt "))).toBe(
      "audio/wav",
    );
  });

  it("answers undefined for anything it does not know", () => {
    expect(sniffMediaType(bytes("%PDF-1.7"))).toBeUndefined();
    expect(sniffMediaType(new Uint8Array())).toBeUndefined();
    expect(sniffMediaType(bytes("hola"))).toBeUndefined();
  });
});

describe("normalizeMime", () => {
  it("drops parameters and case", () => {
    expect(normalizeMime("Audio/OGG; codecs=opus")).toBe("audio/ogg");
    expect(normalizeMime("  IMAGE/PNG ")).toBe("image/png");
  });

  it("resolves the spellings a browser and a phone actually send", () => {
    expect(normalizeMime("image/jpg")).toBe("image/jpeg");
    expect(normalizeMime("audio/mpeg")).toBe("audio/mp3");
    expect(normalizeMime("audio/x-m4a")).toBe("audio/mp4");
  });
});

describe("requireMime", () => {
  it("returns the normalised type when it is accepted", () => {
    expect(requireMime("image/jpg", IMAGE_MIME_TYPES, "image")).toBe(
      "image/jpeg",
    );
  });

  it("names what is accepted when it is not", () => {
    expect(() => requireMime("video/mp4", AUDIO_MIME_TYPES, "audio")).toThrow(
      /audio\/ogg/,
    );
  });
});

describe("stripJsonFence", () => {
  it("leaves plain JSON alone", () => {
    expect(stripJsonFence(' {"a":1} ')).toBe('{"a":1}');
  });

  it("removes a fence the model added anyway", () => {
    expect(stripJsonFence('```json\n{"a":1}\n```')).toBe('{"a":1}');
    expect(stripJsonFence('```\n{"a":1}\n```')).toBe('{"a":1}');
  });
});
