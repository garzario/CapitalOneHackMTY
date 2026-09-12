import app from "./app";
import { ceptinelaBootNotes } from "./ceptinela";

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
 * Under `SEED=ceptinela`, say on stdout which company was loaded and what the
 * engine found on it. The ids are the ones docs/10-demo-script.md curls, and a
 * boot line that reports the findings is a boot line that cannot promise a
 * payment run it did not actually assess.
 */
const notes = ceptinelaBootNotes();
if (notes !== undefined) {
  console.log(
    `ceptinela seed ${notes.seed}, run ${notes.runId} week of ${notes.weekOf}`,
  );
  console.log(
    `engine: ${notes.findings} findings, ${notes.held} held, ${notes.toVerify} to verify`,
  );
  console.log(`hero instructions: ${notes.heroInstructionIds.join(", ")}`);
  console.log(`demo rfcs: ${notes.demoRfcs.join(", ")}`);
}

export default {
  port,
  fetch: app.fetch,
};
