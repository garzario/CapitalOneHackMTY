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

import type { Cfdi, Rfc } from "@hackmty/core";
import { useCallback } from "react";
import { getSupplier } from "../lib/api";
import { formatClabe, formatCount, formatDate, shortUuid } from "../lib/format";
import { ESTABLISHED_BY_LABEL } from "../lib/labels";
import { mockSupplierDetail } from "../lib/mock";
import { useResource } from "../lib/resource";
import { type Column, DataTable } from "./DataTable";
import { Drawer } from "./Drawer";
import { FindingPanel } from "./Findings";
import { Amount, Field, SyntheticMark } from "./Primitives";
import { EmptyBlock, ErrorBlock, LoadingBlock, SourceNotice } from "./States";

/**
 * The invoice columns, described once instead of written as markup. The UUID is
 * `.code` because a judge compares one against the CFDI on their own screen
 * character by character, and the total is right aligned so a column of pesos
 * can be read down.
 */
const CFDI_COLUMNS: ReadonlyArray<Column<Cfdi>> = [
  {
    key: "folio",
    header: "Folio",
    rowHeader: true,
    cell: (row) => row.folio ?? "sin folio",
  },
  { key: "issuedAt", header: "Fecha", cell: (row) => formatDate(row.issuedAt) },
  { key: "method", header: "Metodo", cell: (row) => row.paymentMethod },
  {
    key: "total",
    header: "Total",
    align: "end",
    cell: (row) => <Amount value={row.total} size="sm" />,
  },
  {
    key: "uuid",
    header: "UUID",
    cellClass: "code",
    cell: (row) => shortUuid(row.uuid),
  },
];

type Props = {
  rfc: Rfc;
  onClose: () => void;
};

export function SupplierDrawer({ rfc, onClose }: Props) {
  const load = useCallback(
    (signal: AbortSignal) => getSupplier(rfc, { signal }),
    [rfc],
  );
  const fallback = useCallback(() => mockSupplierDetail(rfc), [rfc]);
  const { resource, reload } = useResource(load, { fallback });

  /* Whether this drawer is reading the offline fallback, which carries a narrower
     invoice history than the API. Only the invoice block reads it: every other
     field is the same row on both sides. */
  const offline = resource.status === "ready" && resource.source === "mock";

  /* The scrim, Escape, the focus trap and the return of focus to whatever opened
     this panel all live in `Drawer`. They used to live here, which is how the app
     ended up with a dialog a keyboard could tab out of and into the payment run
     behind the overlay. */
  return (
    <Drawer
      eyebrow="Proveedor"
      title={
        resource.status === "ready" ? resource.data.supplier.legalName : rfc
      }
      subtitle={<span className="code muted">{rfc}</span>}
      scrimLabel="Cerrar el panel del proveedor"
      onClose={onClose}
    >
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
                      <span className="num">{formatCount(item.timesPaid)}</span>{" "}
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
                      Clave de rastreo {item.cep.claveRastreo}, verificada el{" "}
                      {formatDate(item.verifiedAt)}
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
                Sin API solo viajan las facturas que esta corrida paga, que el
                barrido retroactivo tasa o que un hallazgo nombra. El expediente
                completo del proveedor lo responde la API.
              </p>
            ) : null}
            <DataTable
              caption={`Facturas de ${resource.data.supplier.legalName}, con su folio, su fecha, su metodo de pago y su total.`}
              columns={CFDI_COLUMNS}
              rows={resource.data.cfdis}
              rowKey={(row) => row.uuid}
              empty={
                <EmptyBlock
                  title="Sin facturas"
                  description={
                    offline
                      ? "Ninguna factura de este proveedor entra en esta corrida. Abre la pantalla con la API para ver su expediente completo."
                      : "No hay ningun CFDI de este proveedor en el expediente. Un pago sin factura detras es justo lo que revisa la conciliacion bancaria."
                  }
                />
              }
            />
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
    </Drawer>
  );
}
