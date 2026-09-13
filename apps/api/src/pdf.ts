/**
 * The one way this API answers with a PDF.
 *
 * Three endpoints do: the two constancias and the evidence letter. The headers are
 * part of the contract rather than a detail of each handler, so they live here,
 * which is the same argument `src/http.ts` makes for the error envelope.
 *
 * - `inline`, because the judge is watching a screen and not a downloads folder.
 *   The filename still travels, so saving the file keeps a usable name.
 * - `no-store`, because each of these documents is a statement about a moment. A
 *   cached constancia hands back yesterday's exposure after a new list version
 *   landed, and a cached letter hands back a level that has since changed.
 */

import type { Context } from "hono";

export function pdfResponse(
  c: Context,
  bytes: Uint8Array,
  filename: string,
): Response {
  return c.body(bytes as unknown as ArrayBuffer, 200, {
    "content-type": "application/pdf",
    "content-disposition": `inline; filename="${filename}"`,
    "cache-control": "no-store",
  });
}
