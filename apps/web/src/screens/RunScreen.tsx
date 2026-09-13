/**
 * The payment run. This is the screen the whole product is judged on, so it
 * answers three questions in the first ten seconds: how much money is in this
 * week's run, how much of it is not leaving yet, and which payment costs the
 * most to get wrong.
 *
 * Everything else on this screen is subordinate to those three.
 */

import type { Action, Rfc } from "@hackmty/core";
import { useCallback, useMemo, useState } from "react";
import { ActionBar } from "../components/Decision";
import { AlertRail, type RailEntry } from "../components/Findings";
import { IntakeQr } from "../components/IntakeQr";
import {
  Amount,
  anySynthetic,
  DecisionBadge,
  SectionHeader,
  SyntheticMark,
} from "../components/Primitives";
import { RunVerdict } from "../components/RunVerdict";
import {
  EmptyBlock,
  ErrorBlock,
  LoadingBlock,
  SourceNotice,
} from "../components/States";
import { StatusCard } from "../components/StatusCard";
import { SupplierDrawer } from "../components/SupplierDrawer";
import {
  decideInstruction,
  type EventsStatus,
  getCurrentRun,
  runConstanciaHref,
  useEvents,
} from "../lib/api";
import type { PaymentRun } from "../lib/contract";
import { formatClabe, formatCount, formatDate } from "../lib/format";
import { SOURCE_LABEL } from "../lib/labels";
import { bankName, mockRun } from "../lib/mock";
import { reachesApi, useResource } from "../lib/resource";
import { instructionPath, Link } from "../lib/router";
import { orderItems, runVerdict } from "../lib/run-view";

/** The border colour that marks a row's decision, from the semantic tokens. */
const ROW_ACCENT: Record<Action, string> = {
  hold: "var(--c-hold)",
  verify: "var(--c-verify)",
  release: "var(--c-release)",
};

/**
 * What the screen says about the event stream, in one place.
 *
 * It sits next to the data-source notice, so the two sentences have to be able
 * to stand together. A stream nobody opened is not a stream that closed: under
 * `?data=mock` the old wording read "Flujo de eventos cerrado" beside a
 * Reconectar button, which offered a judge with no API a button that could only
 * fail, for a connection the mode had already ruled out.
 */
export function streamLabel(allowed: boolean, status: EventsStatus): string {
  if (!allowed) {
    return "Sin conexion: el flujo de eventos no se abre";
  }

  if (status === "open") {
    return "Flujo de eventos conectado";
  }

  return status === "connecting"
    ? "Conectando al flujo de eventos"
    : "Flujo de eventos cerrado";
}

/** Whether the reconnect affordance means anything right now. */
export function canReconnectStream(
  allowed: boolean,
  status: EventsStatus,
): boolean {
  return allowed && status === "closed";
}

/** Applies a decision to a run without mutating it, for the offline path. */
function withDecision(
  run: PaymentRun,
  instructionId: string,
  action: Action,
): PaymentRun {
  const items = run.items.map((item) =>
    item.instruction.id === instructionId
      ? {
          ...item,
          decision: {
            ...item.decision,
            action,
            decidedAt: new Date().toISOString(),
            decidedBy: "clerk@demo",
          },
        }
      : item,
  );

  return { ...run, items };
}

export function RunScreen() {
  const load = useCallback(
    (signal: AbortSignal) => getCurrentRun({ signal }),
    [],
  );
  const { resource, reload, replace } = useResource(load, {
    fallback: mockRun,
  });
  const [pending, setPending] = useState<string | null>(null);
  const [writeError, setWriteError] = useState<string | null>(null);
  const [drawerRfc, setDrawerRfc] = useState<Rfc | null>(null);

  /* Every appended ledger event is a reason to re-read the run. The stream
     carries the event; the run stays the single source of truth for the table,
     so there is no second copy of the state to keep in sync. */
  const onLedgerEvent = useCallback(() => {
    reload();
  }, [reload]);
  /* `?data=mock` promises that no request leaves the browser, and the stream is
     a request. Held closed there rather than opened and reported, which is what
     it used to do: the screen said "solo datos sinteticos" and "flujo de eventos
     conectado" at the same time. */
  const streamAllowed = reachesApi();
  const stream = useEvents({ enabled: streamAllowed, onEvent: onLedgerEvent });

  const run = resource.status === "ready" ? resource.data : null;
  const source = resource.status === "ready" ? resource.source : null;

  const railEntries = useMemo<RailEntry[]>(() => {
    if (!run) {
      return [];
    }

    return run.items.flatMap((item) =>
      item.findings.map((finding) => ({
        finding,
        instructionId: item.instruction.id,
      })),
    );
  }, [run]);

  /* Both read the items rather than `run.totals`, so the headline and the
     table stay consistent with each other after a decision applied with no
     API behind the page. See lib/run-view.test.ts. */
  const verdict = useMemo(() => (run ? runVerdict(run) : null), [run]);
  const rows = useMemo(() => (run ? orderItems(run.items) : []), [run]);

  const onDecide = useCallback(
    async (instructionId: string, action: Action) => {
      setWriteError(null);
      setPending(instructionId);

      /* Offline the write cannot happen, so the interaction is applied to the
         synthetic run and labelled as such. The real path is the POST below.
         TODO(FabriBanda): surface the confirmed decision in a toast once the
         API answers, and keep the optimistic update for the offline demo. */
      if (source === "mock" && run) {
        replace(withDecision(run, instructionId, action));
        setWriteError(
          "Sin API: la decision se aplico solo en la corrida sintetica de este navegador.",
        );
        setPending(null);

        return;
      }

      const result = await decideInstruction(instructionId, {
        action,
        decidedBy: "clerk@demo",
      });

      setPending(null);

      if (!result.ok) {
        setWriteError(result.error.message);

        return;
      }

      reload();
    },
    [source, run, replace, reload],
  );

  return (
    <>
      <SectionHeader
        title="Corrida de pagos"
        description={
          run
            ? `Semana del ${formatDate(run.weekOf)}. ${formatCount(verdict?.totalCount ?? 0)} instrucciones.`
            : "Semana en curso."
        }
        aside={
          <div className="flex flex-col items-start gap-2 sm:items-end">
            <SyntheticMark
              when={
                run !== null &&
                anySynthetic(run.items.map((i) => i.instruction))
              }
            />
            {/* The retention artifact for this run: what was checked, what was
                decided, and a digest of the ledger range behind it. Offered
                only against the engine, because a constancia of a run the
                browser made up would be a document about nothing. */}
            {run && source !== "mock" ? (
              <a
                className="btn"
                href={runConstanciaHref(run.id)}
                target="_blank"
                rel="noreferrer"
              >
                Constancia de la corrida (PDF)
              </a>
            ) : null}
            <span className="subtle t-xs">
              {streamLabel(streamAllowed, stream.status)}
              {canReconnectStream(streamAllowed, stream.status) ? (
                <>
                  {". "}
                  <button
                    type="button"
                    className="underline"
                    onClick={stream.reconnect}
                  >
                    Reconectar
                  </button>
                </>
              ) : null}
            </span>
          </div>
        }
      />

      {resource.status === "loading" ? (
        <div className="panel">
          <LoadingBlock label="Cargando la corrida" rows={6} />
        </div>
      ) : null}

      {resource.status === "error" ? (
        <div className="panel">
          <ErrorBlock message={resource.message} onRetry={reload} />
        </div>
      ) : null}

      {run && verdict ? (
        <>
          <SourceNotice
            notice={resource.status === "ready" ? resource.notice : null}
          />

          <RunVerdict verdict={verdict} />

          {writeError ? (
            <p role="status" className="panel-sunken muted px-4 py-2 t-sm">
              {writeError}
            </p>
          ) : null}

          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_var(--rail-width)]">
            <section
              aria-labelledby="run-table-heading"
              className="panel min-w-0"
            >
              <div className="flex flex-col gap-1 p-5 pb-0">
                <h2 id="run-table-heading" className="eyebrow">
                  Instrucciones de pago
                </h2>
                <p className="subtle m-0 t-xs">
                  Primero lo que no sale, despues por importe.
                </p>
              </div>

              {run.items.length === 0 ? (
                <EmptyBlock
                  title="No hay instrucciones esta semana"
                  description="Cuando llegue la primera instruccion por correo, portal o la pagina de alta, aparece aqui."
                  action={
                    <Link to="/intake" className="btn">
                      Dar de alta una instruccion
                    </Link>
                  }
                />
              ) : (
                <div className="table-scroll p-2">
                  <table className="data-table">
                    <caption className="sr-only">
                      Instrucciones de pago de la semana, con su cuenta, su
                      decision y sus acciones.
                    </caption>
                    <thead>
                      <tr>
                        <th scope="col">Proveedor</th>
                        <th scope="col" className="align-end">
                          Importe
                        </th>
                        <th scope="col">Cuenta</th>
                        <th scope="col">Decision</th>
                        <th scope="col">Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((item) => (
                        <tr key={item.instruction.id}>
                          <td
                            className="cell-supplier"
                            style={{
                              borderLeft: `3px solid ${ROW_ACCENT[item.decision.action]}`,
                            }}
                          >
                            <div className="flex flex-col gap-1">
                              <button
                                type="button"
                                className="link-quiet text-left font-medium"
                                onClick={() => setDrawerRfc(item.supplier.rfc)}
                              >
                                {item.supplier.legalName}
                              </button>
                              <span className="code subtle">
                                {item.supplier.rfc}
                              </span>
                              <span className="subtle t-xs">
                                {SOURCE_LABEL[item.instruction.source]},{" "}
                                {formatDate(item.instruction.receivedAt)},{" "}
                                {item.instruction.cfdiUuids.length === 0
                                  ? "sin factura"
                                  : `${formatCount(item.instruction.cfdiUuids.length)} factura(s)`}
                              </span>
                            </div>
                          </td>
                          <td className="align-end">
                            <Amount value={item.instruction.amount} size="lg" />
                          </td>
                          <td>
                            <span className="code code-nowrap">
                              {formatClabe(item.instruction.clabe)}
                            </span>
                            <span className="subtle block t-xs">
                              {bankName(item.instruction.clabe)}
                            </span>
                          </td>
                          <td>
                            <div className="flex flex-col items-start gap-1">
                              <DecisionBadge action={item.decision.action} />
                              {item.findings.length > 0 ? (
                                <Link
                                  to={instructionPath(item.instruction.id)}
                                  className="t-xs underline"
                                >
                                  {formatCount(item.findings.length)}{" "}
                                  hallazgo(s)
                                </Link>
                              ) : null}
                            </div>
                          </td>
                          <td className="cell-actions">
                            <ActionBar
                              compact
                              current={item.decision.action}
                              pending={
                                pending === item.instruction.id
                                  ? item.decision.action
                                  : null
                              }
                              context={item.supplier.legalName}
                              onDecide={(action) => {
                                void onDecide(item.instruction.id, action);
                              }}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <aside className="flex min-w-0 flex-col gap-4">
              <section
                aria-labelledby="rail-heading"
                className="flex flex-col gap-3"
              >
                <h2 id="rail-heading" className="eyebrow">
                  En riesgo, de mayor a menor
                </h2>
                <AlertRail entries={railEntries} />
              </section>

              <IntakeQr />

              <StatusCard />
            </aside>
          </div>
        </>
      ) : null}

      {drawerRfc ? (
        <SupplierDrawer rfc={drawerRfc} onClose={() => setDrawerRfc(null)} />
      ) : null}
    </>
  );
}
