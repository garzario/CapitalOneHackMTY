import app from "./app";
import { repositoryBootNote } from "./deps";
import { sentryoneBootNotes } from "./sentryone";

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

/**
 * Say which store is live before anything else, because "the API is up" and "the
 * API is serving the database you seeded" are different claims and the second one
 * is the one a demo depends on. The connection string is named by host and
 * database only: the credentials in it never reach a log line or a screenshot.
 */
const repository = repositoryBootNote();
if (repository !== undefined) {
  console.log(`repository: ${repository}`);
}

/**
 * Under `SEED=sentryone`, say on stdout which company was loaded and what the
 * engine found on it. The ids are the ones docs/10-demo-script.md curls, and a
 * boot line that reports the findings is a boot line that cannot promise a
 * payment run it did not actually assess.
 */
const notes = sentryoneBootNotes();
if (notes !== undefined) {
  console.log(
    `sentryone seed ${notes.seed}, run ${notes.runId} week of ${notes.weekOf}`,
  );
  console.log(
    `engine: ${notes.findings} findings, ${notes.held} held, ${notes.toVerify} to verify`,
  );
  console.log(`hero instructions: ${notes.heroInstructionIds.join(", ")}`);
  console.log(`demo rfcs: ${notes.demoRfcs.join(", ")}`);
}

/**
 * How long a connection may say nothing before the runtime closes it, in
 * seconds.
 *
 * The default is ten, and this API has two responses that are legitimately
 * quiet for longer than that, so under the default both were being cut with no
 * error on either side. `GET /api/v1/events` writes its first heartbeat at
 * `HEARTBEAT_MS`, fifteen seconds, so the ledger stream died five seconds
 * before its own keep-alive and every screen stopped moving until somebody
 * reloaded. And an assistant turn that carries a screenshot says nothing at all
 * until the extractor has answered: `GEMINI_TIMEOUT_MS` bounds that at twenty
 * seconds and the model round trip after it at another twenty, so the turn that
 * is the whole reason the panel exists answered `200 text/event-stream` with an
 * empty body. Sixty is those two bounds plus margin, and it is still short
 * enough that a client that has gone away is collected.
 *
 * It is a plain property of the exported server object rather than a Bun call,
 * so this file still imports no `bun:*` module and touches no Bun global, and a
 * Node adapter that does not know the key ignores it. ADR-0005 is untouched.
 */
export const IDLE_TIMEOUT_SECONDS = 60;

export default {
  port,
  idleTimeout: IDLE_TIMEOUT_SECONDS,
  fetch: app.fetch,
};
