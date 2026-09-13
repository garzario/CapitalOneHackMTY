/**
 * Server-Sent Events, decoded from a byte stream the browser hands over in
 * arbitrary chunks.
 *
 * `EventSource` exists and the ledger stream uses it, but it can only ever issue
 * a GET. Three endpoints of this API answer a stream to a POST, and
 * `POST /api/v1/assistant/messages` is one of them, so the panel reads the
 * response body of a `fetch` and needs the part `EventSource` was doing for
 * free: turning chunks into frames.
 *
 * The decoder is a state machine over lines rather than a `split` over the whole
 * body, and that is the whole reason this file exists. A chunk boundary lands
 * wherever the network put it: in the middle of a field name, between `data:` and
 * its value, or between the two newlines that dispatch a frame. A regex over one
 * chunk drops every frame that straddles a boundary, which in practice is the
 * long ones, which in this product are the tool results. So bytes accumulate in a
 * buffer and a frame is only emitted on the blank line that the specification
 * says ends it.
 *
 * It implements the parts of the WHATWG event-stream grammar this API uses, and
 * says so rather than claiming the whole thing: `event`, `data` (repeatable,
 * joined with a newline), `id` and `retry` are read, a line starting with `:` is
 * a comment and is ignored, and `\r\n`, `\n` and a bare `\r` all end a line. The
 * one deliberate omission is reconnection, because a POST turn is not something
 * to replay on a dropped connection: the panel says the turn was cut and the
 * clerk asks again.
 *
 * Pure and with no DOM in it, so `sse.test.ts` drives it with the nastiest chunk
 * boundaries it can think of and no server at all.
 */

/** One dispatched event. `event` defaults to `message`, like the specification. */
export interface SseFrame {
  event: string;
  data: string;
  id?: string;
  retry?: number;
}

export interface SseDecoder {
  /** Feed a decoded text chunk. Returns the frames it completed, in order. */
  push(chunk: string): SseFrame[];
  /**
   * Flush what is left when the stream ends.
   *
   * A well behaved server ends its last frame with a blank line, so this is
   * normally empty. It is here because a stream that is cut mid-frame is a real
   * thing during a demo, and a decoder that silently kept half an answer in a
   * buffer would be the panel losing a turn it had already received.
   */
  flush(): SseFrame[];
}

const DEFAULT_EVENT = "message";

interface Draft {
  event: string;
  data: string[];
  id?: string;
  retry?: number;
}

function emptyDraft(): Draft {
  return { event: DEFAULT_EVENT, data: [] };
}

/** A draft is worth dispatching only once some field landed in it. */
function frameOf(draft: Draft): SseFrame | null {
  if (draft.data.length === 0 && draft.event === DEFAULT_EVENT) {
    return null;
  }

  const frame: SseFrame = {
    event: draft.event,
    data: draft.data.join("\n"),
  };

  if (draft.id !== undefined) {
    frame.id = draft.id;
  }
  if (draft.retry !== undefined) {
    frame.retry = draft.retry;
  }

  return frame;
}

export function createSseDecoder(): SseDecoder {
  let buffer = "";
  let draft = emptyDraft();

  /** One line of the grammar. Returns a frame when the line dispatched one. */
  const readLine = (line: string): SseFrame | null => {
    if (line === "") {
      const frame = frameOf(draft);
      draft = emptyDraft();

      return frame;
    }

    /* A comment. The usual one is the keep-alive a proxy needs to not close an
       idle stream, and reading it as a field would invent an event. */
    if (line.startsWith(":")) {
      return null;
    }

    const colon = line.indexOf(":");
    const field = colon === -1 ? line : line.slice(0, colon);
    const raw = colon === -1 ? "" : line.slice(colon + 1);
    /* Exactly one leading space is part of the syntax and not of the value. */
    const value = raw.startsWith(" ") ? raw.slice(1) : raw;

    switch (field) {
      case "event":
        draft.event = value;
        break;
      case "data":
        draft.data.push(value);
        break;
      case "id":
        draft.id = value;
        break;
      case "retry": {
        const retry = Number.parseInt(value, 10);
        if (Number.isInteger(retry) && retry >= 0) {
          draft.retry = retry;
        }
        break;
      }
      default:
        /* An unknown field is ignored, which is what keeps a server free to add
           one without this decoder being the thing that breaks. */
        break;
    }

    return null;
  };

  return {
    push(chunk: string): SseFrame[] {
      buffer += chunk;
      const frames: SseFrame[] = [];

      /* A trailing `\r` is held back: it may be the first half of a `\r\n` that
         the next chunk completes, and treating it as a line ending here would
         dispatch the frame twice. */
      while (true) {
        const match = /\r\n|\n|\r/.exec(buffer);

        if (match === null) {
          break;
        }
        if (
          match[0] === "\r" &&
          match.index === buffer.length - 1 &&
          buffer.length > 0
        ) {
          break;
        }

        const line = buffer.slice(0, match.index);
        buffer = buffer.slice(match.index + match[0].length);

        const frame = readLine(line);
        if (frame !== null) {
          frames.push(frame);
        }
      }

      return frames;
    },

    flush(): SseFrame[] {
      const frames: SseFrame[] = [];

      if (buffer !== "") {
        const line = buffer;
        buffer = "";
        const frame = readLine(line);
        if (frame !== null) {
          frames.push(frame);
        }
      }

      const last = frameOf(draft);
      draft = emptyDraft();

      if (last !== null) {
        frames.push(last);
      }

      return frames;
    },
  };
}
