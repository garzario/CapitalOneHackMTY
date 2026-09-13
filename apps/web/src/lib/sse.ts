/**
 * Server-Sent Events, decoded by hand, because `EventSource` cannot POST.
 *
 * Two of the streams in `docs/09-api.md` start with a request that carries a body
 * and a header: `POST /api/v1/run/:id/execute` needs `confirm: true` and a valid
 * `X-Actor`, and the assistant turn needs the message. `EventSource` issues a bare
 * GET with neither, so the only way to read those two is `fetch` plus a reader,
 * and that means owning the framing. `GET /api/v1/events` stays on `EventSource`
 * in `api.ts`, where the browser's own reconnection is worth having.
 *
 * The framing is the part that looks trivial and is not. A chunk boundary can fall
 * anywhere, including between the two newlines that end a message, so the decoder
 * has to be incremental and has to hand back what it could not yet use. Three
 * things in the spec are load bearing here and all three are things Hono's
 * `streamSSE` actually emits:
 *
 * - a message ends at a BLANK line, not at a newline;
 * - `data:` may appear more than once in one message and the values join with a
 *   newline between them, which is why the field is accumulated and not replaced;
 * - a line beginning with `:` is a comment, and the heartbeat that keeps the
 *   connection alive through a proxy is exactly that, so a decoder that treated it
 *   as a field would emit one empty message every fifteen seconds.
 *
 * Pure and synchronous, so the framing is tested without a server, a socket or a
 * clock. `api.ts` owns the reader; this file owns the bytes.
 */

/** One decoded message. `event` is the name, defaulting to the spec's `message`. */
export interface SseMessage {
  event: string;
  data: string;
  id?: string;
}

/** The spec's default event name for a message that carries no `event:` field. */
export const DEFAULT_EVENT_NAME = "message";

/**
 * Splits whatever is buffered into whole messages and the remainder.
 *
 * The remainder is returned rather than dropped: a partial message is the normal
 * state of a stream between two chunks, and discarding it loses the line of a
 * payment the next chunk was going to complete.
 */
export function decodeSse(buffer: string): {
  messages: SseMessage[];
  rest: string;
} {
  /* Normalised first, because the spec allows CRLF, CR and LF to end a line and a
     server behind a proxy is not the only thing that decides which arrives. */
  const normalised = buffer.replace(/\r\n|\r/g, "\n");
  const messages: SseMessage[] = [];
  let start = 0;

  for (;;) {
    const boundary = normalised.indexOf("\n\n", start);

    if (boundary === -1) {
      break;
    }

    const frame = normalised.slice(start, boundary);
    const message = parseSseFrame(frame);

    if (message) {
      messages.push(message);
    }

    start = boundary + 2;
  }

  return { messages, rest: normalised.slice(start) };
}

/**
 * One frame, already cut at its blank line, as a message.
 *
 * Answers null for a frame that carries no data at all: a heartbeat comment and a
 * frame of `id:` on its own are both real traffic and neither is a message.
 */
export function parseSseFrame(frame: string): SseMessage | null {
  let event = DEFAULT_EVENT_NAME;
  let id: string | undefined;
  const data: string[] = [];

  for (const line of frame.split("\n")) {
    if (line === "" || line.startsWith(":")) {
      continue;
    }

    const colon = line.indexOf(":");
    const field = colon === -1 ? line : line.slice(0, colon);
    /* One optional space after the colon belongs to the framing and not to the
       value. A decoder that keeps it turns every JSON payload into a string that
       starts with a space, which parses anyway and hides the bug until something
       compares the raw text. */
    const rawValue = colon === -1 ? "" : line.slice(colon + 1);
    const value = rawValue.startsWith(" ") ? rawValue.slice(1) : rawValue;

    if (field === "event") {
      event = value;
    } else if (field === "data") {
      data.push(value);
    } else if (field === "id") {
      id = value;
    }
    /* `retry` is reconnection advice and this reader never reconnects: the caller
       started one piece of work and is waiting on it. Ignored rather than stored
       so nothing here pretends to honour it. */
  }

  if (data.length === 0) {
    return null;
  }

  return id === undefined
    ? { event, data: data.join("\n") }
    : { event, data: data.join("\n"), id };
}

/**
 * The incremental form: feed it chunks, take whole messages out.
 *
 * A class rather than a closure because the buffer is the whole state and a reader
 * loop reads better with `reader.push(chunk)` in it than with a tuple being
 * rebound on every iteration.
 */
export class SseBuffer {
  private buffer = "";

  /** Every message completed by this chunk, in arrival order. */
  push(chunk: string): SseMessage[] {
    this.buffer += chunk;

    const { messages, rest } = decodeSse(this.buffer);
    this.buffer = rest;

    return messages;
  }

  /**
   * The last message when the stream ended without its blank line.
   *
   * Worth having rather than tidy: a server that closes the connection right after
   * writing the final `done` has written a complete message, and dropping it would
   * lose the one frame that carries the whole `PaymentExecution`.
   */
  flush(): SseMessage[] {
    const frame = this.buffer;
    this.buffer = "";

    const message = frame.trim() === "" ? null : parseSseFrame(frame);

    return message ? [message] : [];
  }
}
