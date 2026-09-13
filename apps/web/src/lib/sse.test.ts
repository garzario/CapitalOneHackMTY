/**
 * The decoder is tested at the chunk boundaries, because that is the only place
 * it can be wrong.
 *
 * A frame that arrives in one piece is decoded by anything, including the `split`
 * this file exists to replace. What breaks a demo is the long frame, which is the
 * tool result, arriving in three pieces with the split landing between `data:` and
 * its value, or between the `\r` and the `\n` that end the line. So every test
 * below feeds the same stream in a different shape and asserts the same frames.
 */

import { describe, expect, test } from "bun:test";
import { createSseDecoder, type SseFrame } from "./sse";

const STREAM =
  'event: token\ndata: {"text":"Difiere en 2 digitos"}\n\n' +
  'event: tool_result\ndata: {"id":"t1","tool":"get_instruction"}\n\n' +
  'event: done\ndata: {"id":"m1"}\n\n';

/** Feed a whole stream in pieces of `size` characters. */
function decodeInChunks(stream: string, size: number): SseFrame[] {
  const decoder = createSseDecoder();
  const frames: SseFrame[] = [];

  for (let index = 0; index < stream.length; index += size) {
    frames.push(...decoder.push(stream.slice(index, index + size)));
  }

  frames.push(...decoder.flush());

  return frames;
}

describe("the event stream decoder", () => {
  test("one frame, in one chunk", () => {
    const decoder = createSseDecoder();

    expect(decoder.push('event: token\ndata: {"text":"hola"}\n\n')).toEqual([
      { event: "token", data: '{"text":"hola"}' },
    ]);
  });

  test("the same three frames whatever the chunk size", () => {
    const whole = decodeInChunks(STREAM, STREAM.length);

    expect(whole.map((frame) => frame.event)).toEqual([
      "token",
      "tool_result",
      "done",
    ]);

    /* One character at a time is the worst case and the cheapest proof: every
       boundary in the stream is exercised by it, including the one between the
       two newlines that dispatch a frame. */
    for (const size of [1, 2, 3, 7, 13, 64]) {
      expect([size, decodeInChunks(STREAM, size)]).toEqual([size, whole]);
    }
  });

  test("a frame cut between its carriage return and its newline is one frame", () => {
    const decoder = createSseDecoder();

    expect(decoder.push("event: token\r")).toEqual([]);
    expect(decoder.push("\ndata: uno\r\n\r\n")).toEqual([
      { event: "token", data: "uno" },
    ]);
  });

  test("two data lines are one value joined with a newline", () => {
    const decoder = createSseDecoder();

    expect(decoder.push("event: token\ndata: uno\ndata: dos\n\n")).toEqual([
      { event: "token", data: "uno\ndos" },
    ]);
  });

  test("a comment is not an event", () => {
    const decoder = createSseDecoder();

    /* The keep-alive a proxy needs so it does not close an idle stream. Reading
       it as a field would invent a frame the server never sent. */
    expect(decoder.push(": keep-alive\n\n")).toEqual([]);
    expect(decoder.push("event: done\ndata: {}\n\n")).toEqual([
      { event: "done", data: "{}" },
    ]);
  });

  test("exactly one leading space belongs to the syntax and not to the value", () => {
    const decoder = createSseDecoder();

    expect(decoder.push("event:token\ndata:  dos espacios\n\n")).toEqual([
      { event: "token", data: " dos espacios" },
    ]);
  });

  test("id and retry are read, unknown fields are ignored", () => {
    const decoder = createSseDecoder();
    const frames = decoder.push(
      "event: token\nid: 7\nretry: 2000\nunknown: x\ndata: hola\n\n",
    );

    expect(frames).toEqual([
      { event: "token", data: "hola", id: "7", retry: 2000 },
    ]);
  });

  test("blank lines between frames dispatch nothing", () => {
    const decoder = createSseDecoder();

    expect(decoder.push("\n\n\n")).toEqual([]);
  });

  test("a stream cut before its blank line is not a lost answer", () => {
    const decoder = createSseDecoder();

    expect(decoder.push('event: done\ndata: {"id":"m1"}')).toEqual([]);

    /* The edge case that matters during a demo: the connection drops after the
       last frame's data and before its terminator. Keeping it in the buffer
       would be the panel losing a turn it had already received. */
    expect(decoder.flush()).toEqual([{ event: "done", data: '{"id":"m1"}' }]);
  });
});
