import app from "./app";

/**
 * Entry point, deliberately thin: everything testable lives in app.ts, which
 * bun test drives through app.request() without opening a socket.
 *
 * This workspace imports no `bun:*` module and touches no Bun global, per the
 * deploy target in AGENTS.md. The default export below is the portable
 * `{ port, fetch }` shape: Bun serves it natively, and a Node adapter consumes
 * the same `fetch` handler, so the runtime decision stays reversible.
 */
const DEFAULT_PORT = 3000;

const parsed = Number(process.env.PORT);
const port = Number.isInteger(parsed) && parsed > 0 ? parsed : DEFAULT_PORT;

export default {
  port,
  fetch: app.fetch,
};
