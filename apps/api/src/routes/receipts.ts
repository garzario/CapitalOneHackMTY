/**
 * `GET /api/v1/payments/:id/receipt`, as JSON and as the PDF the accountant files.
 *
 * One object and two renderings. The JSON is `PaymentReceipt` and the PDF is the same
 * object with the ledger digest every constancia carries, so a receipt a judge reads
 * on the screen and a receipt an auditor opens eighteen months later cannot say
 * different things about one transfer.
 *
 * Nothing about a receipt is stored. `receiptOf` rebuilds it from the ledger on every
 * request: the clave de rastreo is inside the id, the events say when it was sent and
 * whether the rail acknowledged it, the instruction says how much and to whom, and the
 * CEP for that clave says what can be proven about the seal. A stored receipt could
 * disagree with all four, which is the same argument ADR-0009 makes about a stored
 * level and `holdWindow` makes about a stored deadline.
 *
 * A payment this instance never held is `404`. A receipt for something that does not
 * exist would be a fabricated document, and that is the one word in this repository
 * with legal weight.
 */

import { paymentReceipt, receiptFilename } from "@hackmty/constancia";
import { zValidator } from "@hono/zod-validator";
import type { Context } from "hono";
import { Hono } from "hono";
import type { ApiDeps } from "../deps";
import { receiptOf } from "../execution";
import { notFound, rejectInvalid } from "../http";
import { idParamSchema, type PaymentReceiptResponse } from "../schemas";

/** True when the caller asked for the PDF rather than the JSON. */
export function wantsPdf(c: Context): boolean {
  const format = c.req.query("format");
  if (format === "pdf") {
    return true;
  }
  if (format === "json") {
    return false;
  }
  return (c.req.header("accept") ?? "").includes("application/pdf");
}

export function receiptRoutes(deps: ApiDeps) {
  return new Hono().get(
    "/:id/receipt",
    zValidator("param", idParamSchema, rejectInvalid),
    async (c) => {
      const { id } = c.req.valid("param");
      const found = await receiptOf(deps, id);

      if (found === undefined) {
        return notFound(
          c,
          `No hay un pago con el comprobante ${id} en esta instancia, asi que no hay nada que comprobar.`,
        );
      }

      if (!wantsPdf(c)) {
        const receipt: PaymentReceiptResponse = found.receipt;
        return c.json(receipt);
      }

      const company = await deps.repo.company();
      const bytes = paymentReceipt({
        company,
        issuedAt: deps.clock.now(),
        ledger: await deps.repo.ledger({}),
        synthetic: found.receipt.synthetic,
        receipt: found.receipt,
      });

      return c.body(bytes as unknown as ArrayBuffer, 200, {
        "content-type": "application/pdf",
        // Inline, because the judge is watching a screen and not a downloads
        // folder. The filename still travels, so saving it keeps a usable name.
        "content-disposition": `inline; filename="${receiptFilename(found.receipt.id)}"`,
        // A statement about a moment. A cached one would hand back a receipt with
        // no settlement on it after the rail acknowledged the transfer.
        "cache-control": "no-store",
      });
    },
  );
}
