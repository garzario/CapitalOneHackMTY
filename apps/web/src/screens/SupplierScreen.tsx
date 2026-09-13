/**
 * The supplier profile: everything this product holds about one counterparty, on
 * one screen, in the order a clerk asks for it.
 *
 * It replaced the drawer. The drawer answered the first question -- which
 * invoices, which accounts -- and had no room for the three that decide whether
 * this week's payment leaves: which plaza each account sits in and whether that
 * moved, what the supplier's own invoicing looks like week by week, and where it
 * stands on both SAT lists. A panel over the payment run could hold one of those.
 * One expediente in one place is also the point: two renderings of the same
 * supplier is issue 125 waiting to happen, so the drawer is gone rather than kept
 * beside this.
 *
 * Five decisions worth their reasons.
 *
 * **No level and no verdict about the supplier.** `confiable`, `precaucion` and
 * `alerta` are about one payment, derived by `confidenceOf` from that payment's
 * findings under ADR-0009, and a badge over a legal name would be a rating of a
 * company this product has no business issuing. The findings are shown; the
 * conclusion stays on the payment.
 *
 * **The plaza is three digits with a name beside it, or three digits alone.** The
 * catalogue is a transcription of a table a SPEI participant publishes, not
 * Banxico's file, and `packages/core/src/snapshot/README.md` says so in its first
 * paragraphs. So the code is always printed, the provenance is on the screen
 * rather than in a commit message, and a code the snapshot does not carry gets no
 * city.
 *
 * **The behaviour chart says where its numbers came from.** The weekly aggregate
 * is in the database and not on HTTP, so the series is cut from the invoices the
 * supplier endpoint answered, on the bucket boundary the view cuts. The sentence
 * is `SERIES_SOURCE`, it sits under the chart, and it is a constant with a test on
 * it so it cannot quietly become "from the warehouse".
 *
 * **Both SAT lists always answer, and neither answer is reassurance.** Two rows,
 * always, because a list that holds no row for this RFC has to be
 * distinguishable from a list nobody read. The copy says "en el corte que este
 * build tiene cargado" for exactly that reason, and the link to the official
 * lookup is a link and not a request: ADR-0002 keeps the real list behind a button
 * a person presses.
 *
 * **The consortium is one line and it renders even when it is empty.** It is
 * corroboration and never proof, so it gets a line rather than a panel, and
 * "no consultada" is printed rather than hidden, because a clerk has to be able to
 * tell a network that answered nothing from a network nobody asked.
 */

import type { Cfdi, Rfc } from "@hackmty/core";
import { BANXICO_PLAZA_SNAPSHOT, plazaLabel, plazaLabels } from "@hackmty/core";
import { useCallback } from "react";
import { BehaviourChart } from "../components/BehaviourChart";
import { type Column, DataTable } from "../components/DataTable";
import { NetworkBlock } from "../components/Evidence";
import { FindingPanel } from "../components/Findings";
import {
  Amount,
  Field,
  SectionHeader,
  SyntheticMark,
} from "../components/Primitives";
import {
  EmptyBlock,
  ErrorBlock,
  LoadingBlock,
  SourceNotice,
} from "../components/States";
import { getSupplier } from "../lib/api";
import {
  formatClabe,
  formatCount,
  formatDate,
  formatDecimal,
  formatPlural,
  shortUuid,
} from "../lib/format";
import {
  ESTABLISHED_BY_LABEL,
  SAT_STATUS_BADGE,
  SAT_STATUS_LABEL,
} from "../lib/labels";
import { bankName, mockSupplierDetail } from "../lib/mock";
import { useResource } from "../lib/resource";
import { Link, PATHS, satPath } from "../lib/router";
import {
  accountRows,
  behaviourReading,
  networkLine,
  plazaChange,
  relationship,
  SERIES_SOURCE,
  type SupplierAccountRow,
  satListRows,
  weeklySeries,
} from "../lib/supplier-profile";

/** The invoice columns, the same five the drawer showed, described once. */
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

/** The plaza as the catalogue publishes it, with the digits always in front. */
function plazaText(row: SupplierAccountRow): string {
  if (row.plazaCode === "") {
    return "sin plaza legible";
  }

  return row.plaza === null
    ? `${row.plazaCode}, sin nombre en el corte`
    : `${row.plazaCode} (${row.plaza.city}, ${row.plaza.state})`;
}

export function SupplierScreen({ rfc }: { rfc: Rfc }) {
  const load = useCallback(
    (signal: AbortSignal) => getSupplier(rfc, { signal }),
    [rfc],
  );
  const fallback = useCallback(() => mockSupplierDetail(rfc), [rfc]);
  const { resource, reload } = useResource(load, { fallback });

  if (resource.status === "loading") {
    return <LoadingBlock label="Cargando el proveedor" rows={6} />;
  }

  if (resource.status === "error") {
    return <ErrorBlock message={resource.message} onRetry={reload} />;
  }

  const detail = resource.data;
  /* Whether this screen is reading the offline fallback, which carries a
     narrower invoice history than the API: the generator ships the invoices a
     screen of this app can reach and not the issuer's whole file. Only the
     invoice count and the series read it, because every other field is the same
     row on both sides. */
  const offline = resource.source === "mock";
  const history = relationship(detail);
  const behaviour = behaviourReading(detail.findings);
  const series = weeklySeries(detail.cfdis, {
    window:
      behaviour === null
        ? null
        : { from: behaviour.baselineStart, to: behaviour.recentEnd },
    recent:
      behaviour === null
        ? null
        : { from: behaviour.recentStart, to: behaviour.recentEnd },
  });
  const accounts = accountRows(detail);
  const plaza = plazaChange(detail.findings);
  const network = networkLine(detail.findings);
  const satRows = satListRows(detail.findings);

  return (
    <div className="run-stack">
      <header className="run-hero">
        <div>
          <h2 className="run-hero-title">{detail.supplier.legalName}</h2>
          <p className="run-hero-sub">
            <span className="code">{detail.supplier.rfc}</span>
            {` · primera factura ${formatDate(history.firstInvoiceAt)} · ${formatPlural(history.months, "mes")} de relacion`}
          </p>
        </div>

        <div className="run-hero-aside">
          <SourceNotice notice={resource.notice} compact />
          <SyntheticMark when={detail.supplier.synthetic} />
          <Link to={PATHS.run} className="btn btn-pill">
            Volver a la corrida
          </Link>
        </div>
      </header>

      {/* The history, in the numbers the documents already hold. Nothing here is
          derived from anything: four counts and two sums over the payload. */}
      <section aria-labelledby="history-heading" className="well min-w-0">
        <div className="well-head">
          <h2 id="history-heading" className="t-lg">
            Historia
          </h2>
          <span className="subtle t-sm">
            {offline ? "Facturas de esta corrida" : "Expediente completo"}
          </span>
        </div>

        <div className="well-panel">
          <dl className="m-0 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Primera factura">
              {formatDate(history.firstInvoiceAt)}
            </Field>
            <Field label="Ultima factura que tenemos">
              {history.lastInvoiceAt === null
                ? "ninguna"
                : formatDate(history.lastInvoiceAt)}
            </Field>
            <Field
              label={
                offline
                  ? "Facturas de esta corrida"
                  : "Facturas en el expediente"
              }
            >
              <span className="num">{formatCount(history.invoices)}</span>
            </Field>
            <Field label="Facturado">
              <Amount value={history.invoiced} />
            </Field>
            <Field label="Complementos de pago">
              <span className="num">{formatCount(history.complements)}</span>
              <span className="subtle block t-xs">
                Lo que el proveedor declara haber cobrado:{" "}
                <Amount value={history.paid} size="sm" />
              </span>
            </Field>
            <Field label="Costo de retrasarle un dia">
              {detail.supplier.delayCostPerDay === undefined ? (
                <span className="muted">sin tasar</span>
              ) : (
                <Amount value={detail.supplier.delayCostPerDay} />
              )}
            </Field>
          </dl>

          {offline ? (
            <p className="subtle m-0 mt-4 t-xs">
              Sin API solo viajan las facturas que esta corrida paga, que el
              barrido retroactivo tasa o que un hallazgo nombra. El expediente
              completo del proveedor lo responde la API.
            </p>
          ) : null}
        </div>
      </section>

      {/* The accounts, with their plazas. This is the block the product exists
          for: the account the instruction proposes sits in the same list as the
          accounts we already pay, and the plaza is beside each one. */}
      <section aria-labelledby="accounts-heading" className="well min-w-0">
        <div className="well-head">
          <h2 id="accounts-heading" className="t-lg">
            Cuentas y sus plazas
          </h2>
          <span className="subtle t-sm">
            {formatPlural(accounts.length, "cuenta")}
          </span>
        </div>

        <div className="well-panel">
          {plaza === null ? null : (
            <div
              className="panel-sunken mb-4 flex flex-col gap-1 p-4"
              style={{ borderColor: "var(--c-hold)" }}
            >
              <span className="eyebrow">Cambio de plaza</span>
              {/* The detector's own sentence when it wrote one. The fallback
                names the plazas through `plazaLabel` and `plazaLabels`, the same
                table the detector read, so the three digits sit in front of
                every place on this screen whichever branch ran. */}
              <p className="m-0 t-base">
                {plaza.comparison ??
                  `La cuenta propuesta esta en la plaza ${
                    plaza.toCode === null
                      ? "que no se pudo leer"
                      : plazaLabel(plaza.toCode)
                  } y las cuentas ya pagadas en ${
                    plaza.fromPlaces ?? plazaLabels(plaza.fromCodes)
                  }.`}
              </p>
              {plaza.offInvoice && plaza.invoiceState !== null ? (
                <p className="muted m-0 t-sm">
                  Esa plaza no coincide con el lugar de expedicion de la
                  factura: el codigo postal{" "}
                  {plaza.invoicePostalCode ?? "sin leer"} queda en{" "}
                  {plaza.invoiceState}.
                </p>
              ) : null}
            </div>
          )}

          {accounts.length === 0 ? (
            <EmptyBlock
              title="Sin cuentas conocidas"
              description="Nunca le hemos pagado a este proveedor, asi que cualquier cuenta que llegue es nueva."
            />
          ) : (
            <ul className="m-0 flex list-none flex-col gap-2 p-0">
              {accounts.map((account) => (
                <li
                  key={account.clabe}
                  className="panel-sunken flex flex-col gap-1 p-3"
                  style={
                    account.flagged
                      ? { borderColor: "var(--c-hold)" }
                      : undefined
                  }
                >
                  <span className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <span className="code code-nowrap">
                      {formatClabe(account.clabe)}
                    </span>
                    <span className="subtle t-xs">
                      {bankName(account.clabe)}
                    </span>
                    {account.origin === "proposed" ? (
                      <span className="badge badge-hold">
                        Propuesta esta semana
                      </span>
                    ) : null}
                    {account.verified === null ? null : (
                      <span className="badge badge-release">
                        Verificada con CEP
                      </span>
                    )}
                  </span>
                  <span className="muted t-xs">Plaza {plazaText(account)}</span>
                  <span className="subtle t-xs">
                    {account.establishedBy === null
                      ? "Sin nada que la establezca todavia: ningun complemento, ninguna instruccion anterior y ningun CEP."
                      : `${ESTABLISHED_BY_LABEL[account.establishedBy] ?? account.establishedBy}${
                          account.establishedAt === null
                            ? ""
                            : `, desde ${formatDate(account.establishedAt)}`
                        }${
                          account.timesPaid === null
                            ? ""
                            : `, pagada ${formatCount(account.timesPaid)} veces`
                        }`}
                    {account.verified === null
                      ? ""
                      : ` · clave de rastreo ${account.verified.cep.claveRastreo}, verificada el ${formatDate(account.verified.verifiedAt)}`}
                  </span>
                </li>
              ))}
            </ul>
          )}

          {/* The provenance of the plaza names, on the screen that prints them.
              `snapshot/README.md` answers "is this Banxico's file?" with "no" in
              its first paragraph, and a screen that quoted the names without the
              publisher would be making the claim the README refuses. */}
          <p className="subtle m-0 mt-4 t-xs">
            Los nombres de plaza salen del catalogo de{" "}
            {BANXICO_PLAZA_SNAPSHOT.publisher}, {BANXICO_PLAZA_SNAPSHOT.rows}{" "}
            plazas leidas el {formatDate(BANXICO_PLAZA_SNAPSHOT.retrievedAt)}.
            No es un archivo de Banco de Mexico: la definicion de clave de plaza
            si lo es. Por eso los tres digitos se imprimen siempre y una clave
            que el corte no trae se queda sin ciudad.
          </p>
        </div>
      </section>

      {/* The behaviour chart, with the window the detector reasoned over. */}
      <section aria-labelledby="behaviour-heading" className="well min-w-0">
        <div className="well-head">
          <h2 id="behaviour-heading" className="t-lg">
            Comportamiento por semana
          </h2>
          <span className="subtle t-sm">
            {behaviour === null
              ? "Sin hallazgo de patron"
              : `Ventana del detector: ${formatDate(behaviour.baselineStart)} a ${formatDate(behaviour.recentEnd)}`}
          </span>
        </div>

        <div className="well-panel min-w-0">
          {series.length === 0 ? (
            <EmptyBlock
              title="Sin facturas que agrupar"
              description="No hay ningun CFDI de este proveedor en lo que respondio el servidor, asi que no hay serie semanal que dibujar."
            />
          ) : (
            <>
              <BehaviourChart
                series={series}
                ratePerWeek={behaviour?.ratePerWeek ?? null}
              />

              {behaviour === null ? (
                <p className="muted m-0 mt-3 t-sm">
                  El control de comportamiento no levanto nada sobre este
                  proveedor, asi que no hay linea de ritmo: el detector se
                  silencia cuando el historial no alcanza para medir, y dibujar
                  un umbral sacado de la propia grafica seria inventarlo. La
                  ventana es la que cubren las facturas, las ultimas{" "}
                  {formatPlural(series.length, "semana")}.
                </p>
              ) : (
                <p className="muted m-0 mt-3 t-sm">
                  La linea punteada es el ritmo propio del proveedor sobre su
                  propio historial,{" "}
                  <span className="num">
                    {formatDecimal(behaviour.ratePerWeek ?? 0)}
                  </span>{" "}
                  facturas por semana sobre{" "}
                  {formatPlural(behaviour.baselineInvoices ?? 0, "factura")}.
                  Las barras tintadas son la ventana en revision.
                </p>
              )}

              <p className="subtle m-0 mt-2 t-xs">{SERIES_SOURCE}</p>
            </>
          )}
        </div>
      </section>

      {/* The consortium, one line. */}
      <section aria-labelledby="network-heading" className="well min-w-0">
        <div className="well-head">
          <h2 id="network-heading" className="t-lg">
            Red SentryOne
          </h2>
        </div>

        <div className="well-panel">
          {network === null ? (
            <div className="panel-sunken flex flex-wrap items-baseline gap-x-3 gap-y-1 p-4">
              <span className="eyebrow">Red SentryOne</span>
              <span className="t-base" style={{ color: "var(--c-ink-muted)" }}>
                no consultada
              </span>
            </div>
          ) : (
            <>
              <NetworkBlock network={network.network} />
              {network.clabe === null ? null : (
                <p className="subtle m-0 mt-2 t-xs">
                  Sobre la cuenta{" "}
                  <span className="code">{formatClabe(network.clabe)}</span>.
                </p>
              )}
            </>
          )}

          <p className="muted m-0 mt-3 t-sm">
            La red es corroboracion y nunca prueba: son cuentas y fechas de
            pares hasheados, sin nombres, sin importes y sin la cuenta completa
            de nadie. Una decision no espera al almacen, asi que esta linea es
            la que venia con el hallazgo y no una segunda consulta.
          </p>
        </div>
      </section>

      {/* Both SAT lists, always both. */}
      <section aria-labelledby="sat-heading" className="well min-w-0">
        <div className="well-head">
          <h2 id="sat-heading" className="t-lg">
            Listas del SAT
          </h2>
          <Link to={satPath(detail.supplier.rfc)} className="t-sm underline">
            Consultar la lista oficial
          </Link>
        </div>

        <div className="well-panel flex flex-col gap-2">
          {satRows.map((row) => (
            <div
              key={row.list}
              className="panel-sunken flex flex-col gap-1 p-4"
              style={row.present ? { borderColor: "var(--c-hold)" } : undefined}
            >
              <span className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="eyebrow">
                  {row.list === "69b"
                    ? "Articulo 69-B del CFF"
                    : "Articulo 49 Bis, fraccion X del CFF"}
                </span>
                {row.present ? (
                  row.status === null ? (
                    <span className="badge badge-hold">Publicado</span>
                  ) : (
                    <span className={SAT_STATUS_BADGE[row.status]}>
                      {SAT_STATUS_LABEL[row.status]}
                    </span>
                  )
                ) : (
                  <span className="badge badge-neutral">Sin fila</span>
                )}
              </span>

              {row.present ? (
                <span className="muted t-sm">
                  {row.publishedAt === null
                    ? "Publicado en el DOF, sin fecha legible en la fila."
                    : `Publicado en el DOF el ${formatDate(row.publishedAt)}.`}
                  {row.oficio === null ? "" : ` Oficio ${row.oficio}.`}
                  {row.correctBy === null
                    ? ""
                    : ` Ultimo dia para corregir: ${formatDate(row.correctBy)}.`}
                  {row.listVersion === null
                    ? ""
                    : ` Version ${row.listVersion}.`}
                </span>
              ) : (
                <span className="muted t-sm">
                  {row.list === "69b"
                    ? "Este RFC no trae fila en el corte del 69-B que este build tiene cargado. No es una constancia de nada: el corte tiene fecha y la lista se publica de nuevo cada tanto."
                    : "Este RFC no aparece en ninguna publicacion del 49 Bis que tengamos. El articulo publica una sola resolucion y no preve publicar que alguien quedo limpio, asi que la ausencia de fila no es un desvirtuamiento."}
                </span>
              )}
            </div>
          ))}

          <p className="subtle m-0 t-xs">
            Los dos articulos se leen distinto y por eso son dos filas. El 69-B
            publica cuatro situaciones y se corrige en los dos sentidos, asi que
            su fila trae estado. El 49 Bis, fraccion X ordena publicar una sola
            resolucion y no contempla publicar lo contrario, asi que ahi estar
            en la lista ES el estado.
          </p>
        </div>
      </section>

      {/* The invoices, last: it is the longest block and the least asked for. */}
      <section aria-labelledby="cfdis-heading" className="well min-w-0">
        <div className="well-head">
          <h2 id="cfdis-heading" className="t-lg">
            Facturas
          </h2>
          <span className="subtle t-sm">
            {formatPlural(detail.cfdis.length, "factura")}
          </span>
        </div>

        {/* `DataTable` brings its own `.table-scroll`, so the panel is only the
            ground the table stands on. */}
        <div className="well-panel well-panel-table">
          <DataTable
            caption={`Facturas de ${detail.supplier.legalName}, con su folio, su fecha, su metodo de pago y su total.`}
            columns={CFDI_COLUMNS}
            rows={detail.cfdis}
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
        </div>
      </section>

      {detail.findings.length > 0 ? (
        <section
          aria-labelledby="findings-heading"
          className="flex flex-col gap-4"
        >
          <SectionHeader
            id="findings-heading"
            title="Hallazgos"
            description="Todo lo que los seis controles levantaron sobre este proveedor, sus facturas o sus lineas de la corrida."
          />
          {detail.findings.map((finding) => (
            <FindingPanel
              key={finding.id}
              finding={finding}
              showSubject
              supplierRfc={detail.supplier.rfc}
            />
          ))}
        </section>
      ) : null}
    </div>
  );
}
