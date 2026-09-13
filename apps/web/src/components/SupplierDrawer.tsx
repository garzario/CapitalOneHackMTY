/**
 * The supplier drawer: everything we know about the counterparty, in the order
 * a clerk asks for it.
 *
 * The important part is "known accounts, and how each one was established".
 * An account that came from a stamped payment complement is a different kind of
 * fact from an account that arrived in an email, and the drawer says which.
 *
 * The invoice count is the one number on this screen whose meaning depends on who
 * answered. `GET /api/v1/suppliers/:rfc` answers with the issuer's whole file;
 * the offline fallback carries only the invoices this run settles, the sweep
 * prices or a finding names, because the eight-month history is 208 KB gzipped a
 * phone in a corridor would download to render a table nobody opens. So the field
 * is labelled for the source that answered it. Printing 3 under "facturas en el
 * expediente" for an issuer that has 23 would be issue 125 again: one RFC, two
 * numbers, depending on whether the API was up.
 */

import type { Rfc } from "@hackmty/core";
import { motion, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useRef } from "react";
import { getSupplier } from "../lib/api";
import { formatClabe, formatCount, formatDate, shortUuid } from "../lib/format";
import { ESTABLISHED_BY_LABEL } from "../lib/labels";
import { mockSupplierDetail } from "../lib/mock";
import { useResource } from "../lib/resource";
import { FindingPanel } from "./Findings";
import { Amount, Field, SyntheticMark } from "./Primitives";
import { EmptyBlock, ErrorBlock, LoadingBlock, SourceNotice } from "./States";

type Props = {
  rfc: Rfc;
  onClose: () => void;
};

export function SupplierDrawer({ rfc, onClose }: Props) {
  const reduceMotion = useReducedMotion();
  const panelRef = useRef<HTMLDivElement | null>(null);

  const load = useCallback(
    (signal: AbortSignal) => getSupplier(rfc, { signal }),
    [rfc],
  );
  const fallback = useCallback(() => mockSupplierDetail(rfc), [rfc]);
  const { resource, reload } = useResource(load, { fallback });

  /* Escape closes, and focus moves into the drawer and back out again, because
     a drawer a keyboard cannot leave is worse than no drawer. */
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

  /* Whether this drawer is reading the offline fallback, which carries a narrower
     invoice history than the API. Only the invoice block reads it: every other
     field is the same row on both sides. */
  const offline = resource.status === "ready" && resource.source === "mock";

  return (
    <>
      {/* A button, not a div with a click handler, so closing by pointer and
          closing by keyboard are the same control. */}
      <motion.button
        type="button"
        className="scrim"
        aria-label="Cerrar el panel del proveedor"
        onClick={onClose}
        initial={reduceMotion ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{
          duration: reduceMotion ? 0 : 0.16,
          ease: [0.4, 0, 1, 1],
        }}
      />
      <motion.div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="supplier-drawer-title"
        tabIndex={-1}
        className="drawer"
        initial={reduceMotion ? false : { x: 32, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        /* Out faster than in, and on the exit curve rather than the entrance
           one. Arriving is an introduction and is worth 240ms; leaving is a
           decision already made, and a panel that takes as long to go as it
           took to come reads as hesitation. */
        exit={{
          x: 16,
          opacity: 0,
          transition: {
            duration: reduceMotion ? 0 : 0.16,
            ease: [0.4, 0, 1, 1],
          },
        }}
        transition={{
          duration: reduceMotion ? 0 : 0.24,
          ease: [0.2, 0.8, 0.2, 1],
        }}
      >
        <div className="flex flex-col gap-5 p-5">
          <header className="flex items-start justify-between gap-3">
            <div className="flex flex-col gap-2">
              <span className="eyebrow">Proveedor</span>
              <h2 id="supplier-drawer-title" className="t-lg">
                {resource.status === "ready"
                  ? resource.data.supplier.legalName
                  : rfc}
              </h2>
              <span className="code muted">{rfc}</span>
            </div>
            <button type="button" className="btn" onClick={onClose}>
              Cerrar
            </button>
          </header>

          {resource.status === "loading" ? (
            <LoadingBlock label="Cargando el proveedor" rows={5} />
          ) : null}

          {resource.status === "error" ? (
            <ErrorBlock message={resource.message} onRetry={reload} />
          ) : null}

          {resource.status === "ready" ? (
            <>
              <SourceNotice notice={resource.notice} />
              <SyntheticMark when={resource.data.supplier.synthetic} />

              <dl className="m-0 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Primera factura">
                  {formatDate(resource.data.supplier.firstInvoiceAt)}
                </Field>
                <Field
                  label={
                    offline
                      ? "Facturas de esta corrida"
                      : "Facturas en el expediente"
                  }
                >
                  <span className="num">
                    {formatCount(resource.data.cfdis.length)}
                  </span>
                </Field>
              </dl>

              <section className="flex flex-col gap-3">
                <h3 className="eyebrow">Cuentas conocidas</h3>
                {resource.data.supplier.knownAccounts.length === 0 ? (
                  <EmptyBlock
                    title="Sin cuentas conocidas"
                    description="Nunca le hemos pagado a este proveedor, asi que cualquier cuenta es nueva."
                  />
                ) : (
                  <ul className="m-0 flex list-none flex-col gap-2 p-0">
                    {resource.data.supplier.knownAccounts.map((item) => (
                      <li key={item.clabe} className="panel-sunken p-3">
                        <p className="code">{formatClabe(item.clabe)}</p>
                        <p className="muted t-xs">
                          {ESTABLISHED_BY_LABEL[item.establishedBy] ??
                            item.establishedBy}
                          , desde {formatDate(item.establishedAt)}, pagada{" "}
                          <span className="num">
                            {formatCount(item.timesPaid)}
                          </span>{" "}
                          veces
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section className="flex flex-col gap-3">
                <h3 className="eyebrow">Beneficiarios verificados con CEP</h3>
                {resource.data.verifiedBeneficiaries.length === 0 ? (
                  <p className="muted t-sm">
                    Ninguna cuenta de este proveedor se ha verificado con un CEP
                    todavia.
                  </p>
                ) : (
                  <ul className="m-0 flex list-none flex-col gap-2 p-0">
                    {resource.data.verifiedBeneficiaries.map((item) => (
                      <li key={item.clabe} className="panel-sunken p-3">
                        <p className="code">{formatClabe(item.clabe)}</p>
                        <p className="muted t-xs">
                          Clave de rastreo {item.cep.claveRastreo}, verificada
                          el {formatDate(item.verifiedAt)}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section className="flex flex-col gap-3">
                <h3 className="eyebrow">Facturas</h3>
                {offline ? (
                  <p className="muted t-sm">
                    Sin API solo viajan las facturas que esta corrida paga, que
                    el barrido retroactivo tasa o que un hallazgo nombra. El
                    expediente completo del proveedor lo responde la API.
                  </p>
                ) : null}
                {resource.data.cfdis.length === 0 ? (
                  <EmptyBlock
                    title="Sin facturas"
                    description={
                      offline
                        ? "Ninguna factura de este proveedor entra en esta corrida. Abre la pantalla con la API para ver su expediente completo."
                        : "No hay ningun CFDI de este proveedor en el expediente. Un pago sin factura detras es justo lo que revisa la conciliacion bancaria."
                    }
                  />
                ) : (
                  <div className="table-scroll">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th scope="col">Folio</th>
                          <th scope="col">Fecha</th>
                          <th scope="col">Metodo</th>
                          <th scope="col" className="align-end">
                            Total
                          </th>
                          <th scope="col">UUID</th>
                        </tr>
                      </thead>
                      <tbody>
                        {resource.data.cfdis.map((item) => (
                          <tr key={item.uuid}>
                            <td>{item.folio ?? "sin folio"}</td>
                            <td>{formatDate(item.issuedAt)}</td>
                            <td>{item.paymentMethod}</td>
                            <td className="align-end">
                              <Amount value={item.total} size="sm" />
                            </td>
                            <td className="code">{shortUuid(item.uuid)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>

              {resource.data.findings.length > 0 ? (
                <section className="flex flex-col gap-3">
                  <h3 className="eyebrow">Hallazgos</h3>
                  {resource.data.findings.map((item) => (
                    <FindingPanel key={item.id} finding={item} showSubject />
                  ))}
                </section>
              ) : null}
            </>
          ) : null}
        </div>
      </motion.div>
    </>
  );
}
