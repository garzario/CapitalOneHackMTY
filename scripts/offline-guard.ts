/**
 * Preloaded by `bun run offline`. Refuses every HTTP call that leaves the
 * machine.
 *
 * The first version of the offline rehearsal pointed the outward base URLs at a
 * closed port and called it proof. It was not. `NESSIE_BASE_URL` is a constant
 * in `packages/nessie/src/client.ts` and not an environment variable, so
 * setting it changed nothing and the rehearsal was green for a reason that had
 * nothing to do with the network. A list of hosts somebody remembered to write
 * down can only ever prove the hosts on the list.
 *
 * So this does not guess. It replaces `fetch` and lets through exactly what a
 * laptop with no uplink can still reach: loopback. Anything else throws with
 * the URL in the message, which is both the failure and the finding.
 *
 * What it deliberately does not touch is the database. Postgres speaks its own
 * protocol over a TCP socket, not `fetch`, so the local instance keeps working,
 * which is the whole point: the demo runs offline because the data is already
 * on the disk.
 *
 * The honest limit, and it is the reason the checklist still says to turn the
 * Wi-Fi off once: a dependency that opens a raw socket instead of calling
 * `fetch` walks straight past this.
 */

/** Hosts a machine with no uplink can still reach. */
const LOOPBACK = new Set(["127.0.0.1", "localhost", "::1", "[::1]", "0.0.0.0"]);

export class OfflineViolation extends Error {
  constructor(readonly url: string) {
    super(
      `offline rehearsal: something tried to reach ${url}. On conference Wi-Fi that call hangs until its timeout, and that is the demo.`,
    );
    this.name = "OfflineViolation";
  }
}

function hostOf(input: string): string {
  try {
    return new URL(input).hostname.toLowerCase();
  } catch {
    // A relative URL cannot leave the machine, so it is allowed. Nothing in
    // this repository issues one outside a browser, but refusing it would be a
    // failure with no diagnosis behind it.
    return "127.0.0.1";
  }
}

export function isLoopback(input: string): boolean {
  return LOOPBACK.has(hostOf(input));
}

function urlOf(input: Parameters<typeof fetch>[0]): string {
  if (typeof input === "string") {
    return input;
  }
  if (input instanceof URL) {
    return input.toString();
  }
  return (input as Request).url;
}

const real = globalThis.fetch;

globalThis.fetch = ((input, init) => {
  const url = urlOf(input);
  if (!isLoopback(url)) {
    throw new OfflineViolation(url);
  }
  return real(input, init);
}) as typeof fetch;
