/**
 * The receipt of one payment: what left, to whom, under which clave de rastreo,
 * and what can be proven about the seal.
 *
 * It is a drawer and not a page because it is opened from a row of the run and
 * closed again in the same breath, and because the document a clerk keeps is the
 * PDF the same endpoint answers, which is one click away at the bottom.
 *
 * Three rules of the type are rendered rather than assumed, and all three are the
 * product refusing to overstate what it holds.
 *
 * - **The seal is a state and never a tick.** `not_checked` reads "sello no
 *   verificado" and can never read as valid: on the Nessie mirror there is no
 *   Banxico document to check at all, and a deployment with no certificate parsed a
 *   CEP and verified nothing. `valid` appears only when a sello actually validated.
 * - **Four digits, not eighteen.** The account on a receipt is the last four. The
 *   full CLABE is on the instruction and a document that leaves the building does
 *   not need the rest.
 * - **Sent is not settled.** `settledAt` is absent while the rail has only
 *   acknowledged that we asked, and the drawer says which of the two it is holding
 *   instead of printing one date under an ambiguous label.
 *
 * There is no empty state here and that is not an omission: a receipt exists exactly
 * when a payment left, so the screen offers this drawer only from a line that
 * carries a `receiptId`, and a receipt the server does not hold is a `404` the error
 * block reports. An empty block would be a document about nothing.
 */

import { useCallback, useEffect, useRef } from "react";
import { getPaymentReceipt, paymentReceiptHref } from "../lib/api";
import { formatDateTime, formatMoney, shortUuid } from "../lib/format";
import {
  RAIL_LABEL,
  SEAL_STATE_BADGE,
  SEAL_STATE_LABEL,
  SYNTHETIC_LABEL,
} from "../lib/labels";
import { mockReceipt } from "../lib/mock";
import { useResource } from "../lib/resource";
import { Field, SyntheticMark } from "./Primitives";
import { ErrorBlock, LoadingBlock, SourceNotice } from "./States";

type Props = {
  /** The `receiptId` the execution line carries. */
  receiptId: string;
  onClose: () => void;
};

/**
 * What the rail this receipt came from does and does not prove.
 *
 * ADR-0008 says somebody will be tempted to shorten this sentence, and the receipt
 * is one of the three places that make the short version fail. On the mirror an
 * executed run proves the flow and nothing about the pesos; on STP it would carry a
 * Banxico-signed CEP, and that rail has never run from this repository.
 */
export function railProofSentence(rail: "nessie" | "stp"): string {
  return rail === "nessie"
    ? "El espejo Nessie es un sandbox y no un banco: prueba el flujo completo y no mueve pesos, y no produce CEP, asi que no hay sello de Banxico que revisar."
    : "STP es el camino que produce un CEP firmado por Banxico. Este repositorio nunca lo ha corrido en vivo, porque no tenemos contrato de empresa.";
}

export function ReceiptDrawer({ receiptId, onClose }: Props) {
  const panelRef = useRef<HTMLDivElement | null>(null);

  const load = useCallback(
    (signal: AbortSignal) => getPaymentReceipt(receiptId, { signal }),
    [receiptId],
  );
  const fallback = useCallback(() => mockReceipt(receiptId), [receiptId]);
  const { resource, reload } = useResource(load, { fallback });

  /* Escape closes and focus comes back out, the same contract the supplier drawer
     holds: a drawer a keyboard cannot leave is worse than no drawer. */
  useEffect(() => {
    const previous = document.activeElement;

    panelRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", onKeyDown);

    return () => {
      window.removeEventListener("keydown", onKeyDown);

      if (previous instanceof HTMLElement) {
        previous.focus();
      }
    };
  }, [onClose]);

  const receipt = resource.status === "ready" ? resource.data : null;
  const offline = resource.status === "ready" && resource.source === "mock";

  return (
    <>
      <button
        type="button"
        className="scrim"
        aria-label="Cerrar el recibo"
        onClick={onClose}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="receipt-drawer-title"
        tabIndex={-1}
        className="drawer"
      >
        <div className="flex flex-col gap-5 p-5">
          <header className="flex items-start justify-between gap-3">
            <div className="flex flex-col gap-2">
              <span className="eyebrow">Recibo del pago</span>
              <h2 id="receipt-drawer-title" className="t-lg">
                {receipt ? receipt.beneficiaryName : receiptId}
              </h2>
              <span className="code muted">{receiptId}</span>
            </div>
            <button type="button" className="btn" onClick={onClose}>
              Cerrar
            </button>
          </header>

          {resource.status === "loading" ? (
            <LoadingBlock label="Cargando el recibo" rows={5} />
          ) : null}

          {resource.status === "error" ? (
            <ErrorBlock message={resource.message} onRetry={reload} />
          ) : null}

          {receipt ? (
            <>
              <SourceNotice
                notice={resource.status === "ready" ? resource.notice : null}
              />
              <SyntheticMark when={receipt.synthetic} />

              <dl className="grid gap-4 sm:grid-cols-2">
                <Field label="Importe que salio">
                  <span className="num-lg">{formatMoney(receipt.amount)}</span>
                </Field>
                <Field label="Clave de rastreo">
                  <span className="code code-nowrap">
                    {receipt.claveRastreo}
                  </span>
                </Field>
                <Field label="Proveedor">
                  {receipt.beneficiaryName}
                  <span className="code subtle block t-xs">
                    {receipt.supplierRfc}
                  </span>
                </Field>
                <Field label="Cuenta abonada">
                  <span className="code code-nowrap">
                    {`terminacion ${receipt.beneficiaryAccountLast4}`}
                  </span>
                  <span className="subtle block t-xs">
                    {receipt.beneficiaryBank}
                  </span>
                </Field>
                <Field label="Riel">{RAIL_LABEL[receipt.rail]}</Field>
                <Field label="Sello del CEP">
                  <span className={SEAL_STATE_BADGE[receipt.sealState]}>
                    {SEAL_STATE_LABEL[receipt.sealState]}
                  </span>
                </Field>
                <Field label="Salio">{formatDateTime(receipt.sentAt)}</Field>
                <Field label="Reconocido por el riel">
                  {receipt.settledAt
                    ? formatDateTime(receipt.settledAt)
                    : "Todavia no. Salir y liquidar son dos cosas distintas."}
                </Field>
                <Field label="Ejecuto la corrida" wide>
                  {`${receipt.executedBy.name} (${receipt.executedBy.role === "owner" ? "dueno" : "cuentas por pagar"})`}
                </Field>
                <Field label="Facturas que liquida" wide>
                  {receipt.cfdiUuids.length === 0 ? (
                    "Ninguna factura quedo ligada a este pago."
                  ) : (
                    <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
                      {receipt.cfdiUuids.map((uuid) => (
                        <li key={uuid} className="code t-xs">
                          {shortUuid(uuid, 13)}
                        </li>
                      ))}
                    </ul>
                  )}
                </Field>
              </dl>

              <p className="panel-sunken muted px-4 py-3 t-sm">
                {railProofSentence(receipt.rail)}
              </p>

              {offline ? (
                <p className="subtle t-xs">
                  {`Este recibo viene de la corrida sintetica de este navegador (${SYNTHETIC_LABEL}), asi que no hay PDF que abrir.`}
                </p>
              ) : (
                <a
                  className="btn"
                  href={paymentReceiptHref(receipt.id)}
                  target="_blank"
                  rel="noreferrer"
                >
                  Abrir el recibo en PDF
                </a>
              )}
            </>
          ) : null}
        </div>
      </div>
    </>
  );
}
