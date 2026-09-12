/**
 * The committed download of the real Article 69-B list.
 *
 * `snapshot/official-2026-09-12.csv` is the complete listing as the SAT
 * published it, retrieved on 2026-09-12 and committed byte for byte. It is
 * public data (the file says so in its own first line) and it is in the
 * repository for one reason: `GET /api/v1/sat/lookup` has to answer a real RFC
 * a judge types in, on a conference network, in front of them. A control that
 * only works when the SAT portal is reachable is a control that does not work.
 *
 * Provenance, the whole of it, is in `snapshot/README.md`. The two facts that
 * belong in the code as well:
 *
 * - The file the SAT serves is ISO-8859-1, not UTF-8. `decodeSnapshot` detects
 *   that rather than being told, so a future UTF-8 export needs no change here.
 * - The published URL answers over HTTP and NOT over HTTPS: a TLS connection to
 *   the host times out (verified 2026-09-12). That is why the live path in
 *   `loadSnapshot` is optional and the committed file is the default. Nothing
 *   in this product depends on an unauthenticated fetch at demo time.
 *
 * ADR-0002 binds what may be done with these rows: they answer a lookup, and
 * they never stand next to a fabricated invoice. Nothing in this file joins them
 * to anything. The sweep is fed by `simulatePublication` over synthetic RFCs.
 */

import { type LoadOptions, loadSnapshot, type SatSnapshot } from "./loader";
import { createSatIndex, type SatIndex } from "./match";

/** The file, next to this module. */
export const OFFICIAL_SNAPSHOT_FILENAME = "official-2026-09-12.csv";

/** The day the file was downloaded. It is in the filename for the same reason. */
export const OFFICIAL_SNAPSHOT_RETRIEVED_AT = "2026-09-12";

/**
 * The version id of this download.
 *
 * The SAT puts no version number in the document, so the date the file states it
 * is current to is the only identifier it gives out, and it is the sentence in
 * the file's own preamble: "Informacion actualizada al 31 de diciembre de 2025".
 * The loader reads that sentence back out of the file, so this constant and the
 * file cannot disagree without a test failing.
 */
export const OFFICIAL_SNAPSHOT_LIST_VERSION = "2025-12-31";

/**
 * Where the SAT publishes it. HTTP only, see the header: a fetch over HTTPS to
 * this host does not complete.
 */
export const OFFICIAL_SNAPSHOT_URL =
  "http://omawww.sat.gob.mx/cifras_sat/Documents/Listado_Completo_69-B.csv";

/** The committed file, resolved relative to this module rather than to a cwd. */
export function officialSnapshotFile(): URL {
  return new URL(`./snapshot/${OFFICIAL_SNAPSHOT_FILENAME}`, import.meta.url);
}

export interface LoadOfficialOptions extends LoadOptions {
  /**
   * Injected so a test can hand over bytes without touching the disk. The
   * default reads the committed file through `node:fs/promises`, imported
   * dynamically so that importing this package in a browser bundle does not
   * pull a Node builtin into it.
   */
  readFile?: (file: URL) => Promise<Uint8Array>;
}

/** Parses the committed download. Roughly 14000 taxpayers, so call it once. */
export async function loadOfficialSnapshot(
  options: LoadOfficialOptions = {},
): Promise<SatSnapshot> {
  const read = options.readFile ?? readLocalFile;
  const bytes = await read(officialSnapshotFile());

  return loadSnapshot(
    {
      kind: "bytes",
      bytes,
      listVersion: OFFICIAL_SNAPSHOT_LIST_VERSION,
      source: `${OFFICIAL_SNAPSHOT_URL} retrieved ${OFFICIAL_SNAPSHOT_RETRIEVED_AT}`,
    },
    options,
  );
}

async function readLocalFile(file: URL): Promise<Uint8Array> {
  const { readFile } = await import("node:fs/promises");
  return new Uint8Array(await readFile(file));
}

let cached: Promise<SatIndex> | undefined;

/**
 * The official list as a lookup index, parsed at most once per process.
 *
 * A failure is NOT cached and NOT swallowed. A lookup that cannot read the list
 * has to fail loudly, because the alternative is answering "not listed" for
 * every RFC a judge types, and a blacklist that silently returns nothing is
 * worse than no blacklist at all.
 */
export function officialSatIndex(
  options: LoadOfficialOptions = {},
): Promise<SatIndex> {
  cached ??= loadOfficialSnapshot(options)
    .then((snapshot) => createSatIndex(snapshot.entries))
    .catch((error: unknown) => {
      cached = undefined;
      throw error;
    });

  return cached;
}

/** Drops the memoised index. For tests, never for a request path. */
export function resetOfficialSatIndex(): void {
  cached = undefined;
}
