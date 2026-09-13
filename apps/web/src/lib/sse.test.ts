/**
 * The framing of the execution stream.
 *
 * It is tested on its own because the bug it has is invisible: a decoder that
 * splits on a single newline, or that drops the remainder between two chunks,
 * still shows most of the lines of a run moving. What it loses is the one message
 * that happened to straddle a chunk boundary, which on a 86 line run is a payment
 * the screen never draws and nobody notices until a judge counts the rows.
 */

import { describe, expect, test } from "bun:test";
import { decodeSse, parseSseFrame, SseBuffer } from "./sse";

/** What Hono's `streamSSE` writes, field order included. */
function wire(event: string, data: unknown, id: number): string {
  return `event: ${event}\nid: ${id}\ndata: ${JSON.stringify(data)}\n\n`;
}

describe("decodeSse", () => {
  test("reads the event name, the id and the payload of one message", () => {
    const { messages, rest } = decodeSse(
      wire("line", { instructionId: "INS-1", state: "sent" }, 0),
    );

    expect(messages).toEqual([
      {
        event: "line",
        id: "0",
        data: '{"instructionId":"INS-1","state":"sent"}',
      },
    ]);
    expect(rest).toBe("");
  });

  test("reads several messages out of one chunk, in order", () => {
    const chunk =
      wire("line", { instructionId: "INS-1" }, 0) +
      wire("line", { instructionId: "INS-2" }, 1) +
      wire("done", { runId: "run-1" }, 2);

    const { messages } = decodeSse(chunk);

    expect(messages.map((message) => message.event)).toEqual([
      "line",
      "line",
      "done",
    ]);
  });

  test("hands back a message that has not ended yet instead of dropping it", () => {
    /* The case that matters. A chunk can stop between the two newlines, and a
       decoder that returns only whole messages and forgets the tail loses the
       payment the next chunk completes. */
    const whole = wire("line", { instructionId: "INS-1" }, 0);
    const cut = whole.length - 1;

    const first = decodeSse(whole.slice(0, cut));

    expect(first.messages).toEqual([]);
    expect(first.rest).toBe(whole.slice(0, cut));
  });

  test("ends a message at a blank line and not at a newline", () => {
    const { messages, rest } = decodeSse("event: line\ndata: {}\n");

    expect(messages).toEqual([]);
    expect(rest).toBe("event: line\ndata: {}\n");
  });

  test("ignores the heartbeat comment that keeps a proxy from closing", () => {
    /* `: heartbeat\n\n` is a frame with no field in it. A decoder that read it as
       a field would emit one empty message every fifteen seconds and the screen
       would count each one as progress. */
    const { messages } = decodeSse(`: heartbeat\n\n${wire("done", {}, 1)}`);

    expect(messages.map((message) => message.event)).toEqual(["done"]);
  });

  test("joins repeated data fields with a newline, as the spec says", () => {
    const { messages } = decodeSse("event: line\ndata: one\ndata: two\n\n");

    expect(messages[0]?.data).toBe("one\ntwo");
  });

  test("accepts CRLF, because what ends a line is not ours to choose", () => {
    const { messages } = decodeSse("event: line\r\ndata: {}\r\n\r\n");

    expect(messages).toEqual([{ event: "line", data: "{}" }]);
  });

  test("strips exactly one space after the colon and no more", () => {
    const { messages } = decodeSse("data:  two spaces\n\n");

    expect(messages[0]?.data).toBe(" two spaces");
  });

  test("defaults the event name the way the spec does", () => {
    const { messages } = decodeSse("data: {}\n\n");

    expect(messages[0]?.event).toBe("message");
  });
});

describe("parseSseFrame", () => {
  test("answers null for a frame that carries no data", () => {
    expect(parseSseFrame(": heartbeat")).toBeNull();
    expect(parseSseFrame("id: 7")).toBeNull();
    expect(parseSseFrame("")).toBeNull();
  });

  test("keeps a data field that is deliberately empty", () => {
    expect(parseSseFrame("event: done\ndata:")).toEqual({
      event: "done",
      data: "",
    });
  });
});

describe("SseBuffer", () => {
  test("reassembles a message split across chunks, byte by byte", () => {
    const whole =
      wire("line", { instructionId: "INS-1" }, 0) +
      wire("done", { ok: true }, 1);
    const buffer = new SseBuffer();
    const seen: string[] = [];

    for (const character of whole) {
      for (const message of buffer.push(character)) {
        seen.push(message.event);
      }
    }

    expect(seen).toEqual(["line", "done"]);
  });

  test("keeps nothing once a message has been handed out", () => {
    const buffer = new SseBuffer();

    buffer.push(wire("line", {}, 0));

    expect(buffer.flush()).toEqual([]);
  });

  test("flushes a final message the server did not end with a blank line", () => {
    /* A server that closes right after the last `done` has written a complete
       message. Dropping it would lose the frame that carries the whole
       PaymentExecution, which is the one the screen reconciles against. */
    const buffer = new SseBuffer();

    expect(buffer.push('event: done\ndata: {"runId":"run-1"}')).toEqual([]);
    expect(buffer.flush()).toEqual([
      { event: "done", data: '{"runId":"run-1"}' },
    ]);
  });

  test("flushes nothing when the tail is only whitespace", () => {
    const buffer = new SseBuffer();

    buffer.push("\n");

    expect(buffer.flush()).toEqual([]);
  });
});
