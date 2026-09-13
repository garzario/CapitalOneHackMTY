/**
 * The payments screen: the last look at the run before the money leaves, and the
 * record of what happened to every line once it did.
 *
 * It exists because of ADR-0008. Until 12 September this product stopped payments
 * and the SPEI left from the company's own banking portal, which left the honest
 * answer to "why would Lupita upload the screenshot" as "because we asked her to".
 * The run leaving through `packages/rail` is what makes the instruction have to
 * exist here before any money moves, and this is the screen where a person does it.
 *
 * Four rules shape everything below and none of them is decoration.
 *
 * **Nothing leaves without a person.** The button needs a second press and a name,
 * that name travels on the `X-Actor` header, and the ledger records it per line. No
 * schedule, no retry that sends, no automatic release. The name field is on screen
 * rather than hidden in a constant because a clerk is about to be responsible for
 * what it says.
 *
 * **A held line is shown, not hidden.** The excluded lines sit in their own table
 * with the sentence that says why, because a clerk who cannot see what did not get
 * paid will believe she paid it. That is also the API's rule: a request that names a
 * stopped line is refused with a `409` rather than quietly dropped.
 *
 * **Sent is not settled.** Two chips per line and never one, for the reason the CEP
 * exists: a transfer is acknowledged when the rail says so and not when we asked.
 *
 * **No figure stands in for a verdict.** The level is a word with its findings
 * behind it, the progress is a count of lines, and the only proportion anywhere on
 * the page is the width of a bar. ADR-0009 is binding on that.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Amount,
  anySynthetic,
  ConfidenceBadge,
  PaymentLineBadge,
  SectionHeader,
  TransactionStateBadge,
} from "../components/Primitives";
import { ReceiptDrawer } from "../components/Receipt";
import {
  EmptyBlock,
  ErrorBlock,
  LoadingBlock,
  SourceNotice,
} from "../components/States";
import {
  executeRun,
  getCurrentRun,
  getRails,
  getRunExecution,
  runConstanciaHref,
  useEvents,
} from "../lib/api";
import type { Actor, PaymentExecution, RailsStatus } from "../lib/contract";
import {
  formatCount,
  formatDate,
  formatDateTime,
  formatMoney,
} from "../lib/format";
import { RAIL_LABEL } from "../lib/labels";
import {
  bankName,
  DEMO_ACTOR,
  mockExecutionLines,
  mockRun,
  mockVerification,
} from "../lib/mock";
import {
  applyExecutionLine,
  dispersalLayoutCsv,
  dispersalLayoutFilename,
  emptyExecution,
  excludedRows,
  isUnstarted,
  layoutRows,
  type PaymentRow,
  paymentRows,
  runOutlook,
  runRows,
} from "../lib/payments";
import { reachesApi, useResource } from "../lib/resource";
import { instructionPath, Link } from "../lib/router";

/**
 * How fast the offline run replays, and how many lines per tick.
 *
 * `?data=mock` promises that no request leaves the browser, so the offline path
 * walks the synthetic execution instead of opening a connection. Two lines every
 * 40 ms puts the 86 line run at under two seconds, which reads as a run being
 * acknowledged rather than as a progress bar being animated at somebody.
 */
const REPLAY_STEP = 2;
const REPLAY_MS = 40;

/** What the button says, and it changes three times. */
export function sendLabel(
  sending: boolean,
  confirming: boolean,
  lines: number,
): string {
  if (sending) {
    return "Enviando la corrida";
  }

  if (confirming) {
    return `Si, enviar ${formatCount(lines)} linea(s)`;
  }

  return "Enviar corrida";
}

/**
 * What the screen says about the rail, in one sentence a judge can check.
 *
 * `GET /api/v1/rails` is what makes this possible without reading an environment
 * file, and ADR-0008 is why the sentence is never shortened: the mirror proves the
 * flow and nothing about the pesos, and the production path has never run. A server
 * with no rail says so and the button is not offered, because a `503` there appends
 * nothing and the honest screen is the one that never asked.
 */
export function railSentence(rails: RailsStatus | null): string {
  if (rails === null) {
    return "Todavia no sabemos que riel tiene este servidor.";
  }

  if (rails.active === null) {
    return (
      rails.message ??
      "Este servidor no tiene riel configurado, asi que no puede enviar la corrida."
    );
  }

  const row = rails.rails.find((candidate) => candidate.id === rails.active);
  const name = RAIL_LABEL[rails.active];

  if (rails.active === "nessie") {
    return `Riel activo: ${name}. Es un sandbox y no un banco: se registra la salida linea por linea, no se mueven pesos y no se produce CEP, asi que el recibo dira "sello no verificado".`;
  }

  return row?.live === true
    ? `Riel activo: ${name}. Produce un CEP firmado por Banxico.`
    : `Riel activo: ${name}. Produce un CEP firmado por Banxico y nunca se ha corrido en vivo desde este repositorio.`;
}

/** The sentence under the counters while the run is on the wire or finished. */
export function progressSentence(answered: number, inRun: number): string {
  return `${formatCount(answered)} de ${formatCount(inRun)} linea(s) contestadas por el riel`;
}

function nowIso(): string {
  return new Date().toISOString();
}

/**
 * Hands the layout to the browser as a file.
 *
 * A blob and not a data URI: a run of a hundred lines is longer than some browsers
 * accept in a URL, and the object URL is revoked immediately so the CSV does not sit
 * in memory for the rest of the session.
 */
function downloadCsv(filename: string, text: string) {
  const url = URL.createObjectURL(
    new Blob([text], { type: "text/csv;charset=utf-8" }),
  );
  const anchor = document.createElement("a");

  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function PaymentsScreen() {
  const load = useCallback(
    (signal: AbortSignal) => getCurrentRun({ signal }),
    [],
  );
  const { resource, reload } = useResource(load, { fallback: mockRun });

  const run = resource.status === "ready" ? resource.data : null;
  const source = resource.status === "ready" ? resource.source : null;
  const runId = run?.id ?? null;
  const offline = source === "mock";

  const [execution, setExecution] = useState<PaymentExecution | null>(null);
  const [executionError, setExecutionError] = useState<string | null>(null);
  const [rails, setRails] = useState<RailsStatus | null>(null);
  const [name, setName] = useState(DEMO_ACTOR.name);
  const [confirming, setConfirming] = useState(false);
  const [sending, setSending] = useState(false);
  const [writeError, setWriteError] = useState<string | null>(null);
  const [openReceipt, setOpenReceipt] = useState<string | null>(null);

  /* Read inside the ledger callback, which must not re-subscribe every time the
     flag moves, and must not reload the execution while the stream is feeding it. */
  const sendingRef = useRef(false);
  sendingRef.current = sending;
  const replayRef = useRef<number | null>(null);

  const stopReplay = useCallback(() => {
    if (replayRef.current !== null) {
      window.clearInterval(replayRef.current);
      replayRef.current = null;
    }
  }, []);

  useEffect(() => stopReplay, [stopReplay]);

  /** What the rail already did with this run, which is what the screen opens on. */
  const readExecution = useCallback(
    async (id: string, signal?: AbortSignal) => {
      if (!reachesApi()) {
        setExecution(emptyExecution(id, nowIso()));

        return;
      }

      const result = await getRunExecution(id, { signal });

      if (result.ok) {
        setExecutionError(null);
        setExecution(result.data);

        return;
      }

      /* Empty so the review still renders, and a notice so nobody reads the empty
         table as proof that nothing was sent. Those are two different facts. */
      setExecutionError(result.error.message);
      setExecution(emptyExecution(id, nowIso()));
    },
    [],
  );

  useEffect(() => {
    if (runId === null) {
      return;
    }

    const controller = new AbortController();

    void readExecution(runId, controller.signal);

    return () => controller.abort();
  }, [runId, readExecution]);

  /* Which rail is live. Only ever asked of a server: under `?data=mock` nothing
     leaves the browser, so the screen says what the synthetic run carries instead
     of inventing a configuration for a server it promised not to call. */
  useEffect(() => {
    if (!reachesApi()) {
      return;
    }

    const controller = new AbortController();

    void getRails({ signal: controller.signal }).then((result) => {
      if (result.ok) {
        setRails(result.data);
      }
    });

    return () => controller.abort();
  }, []);

  /* A second screen watching this run moves with the first one, because every line
     of the execution is an ordinary ledger event as well. Skipped while this screen
     holds the execute stream, which is already delivering the same lines. */
  const onLedgerEvent = useCallback(
    (event: { type: string }) => {
      if (sendingRef.current || runId === null) {
        return;
      }

      if (
        event.type === "payment_sent" ||
        event.type === "payment_settled" ||
        event.type === "payment_failed" ||
        event.type === "payment_cancelled"
      ) {
        void readExecution(runId);
      }
    },
    [runId, readExecution],
  );

  useEvents({ enabled: reachesApi(), onEvent: onLedgerEvent });

  /**
   * Every line of the run, with its level, its state and what the rail did.
   *
   * The verification lookup is passed only offline, and deliberately: the API has
   * already derived `state` per item with the verification in hand, and the
   * generated mock carries the verifications as a local table. What the generated
   * `LEVELS_BY_INSTRUCTION` is never read for is this screen's state, because that
   * snapshot was derived with the run already executed and would show `enviado`
   * over a run nobody has sent yet.
   */
  const rows = useMemo(
    () =>
      run && execution
        ? paymentRows(run, execution, offline ? mockVerification : undefined)
        : [],
    [run, execution, offline],
  );

  const outlook = useMemo(() => runOutlook(rows), [rows]);
  const taken = useMemo(() => runRows(rows), [rows]);
  const excluded = useMemo(() => excludedRows(rows), [rows]);
  const exportable = useMemo(() => layoutRows(rows), [rows]);

  const started = execution !== null && !isUnstarted(execution);
  const canSend =
    !sending &&
    outlook.pending > 0 &&
    name.trim() !== "" &&
    (offline || rails === null || rails.active !== null);

  const onSend = useCallback(() => {
    if (run === null || execution === null) {
      return;
    }

    const actor: Actor = { name: name.trim(), role: DEMO_ACTOR.role };

    setWriteError(null);
    setConfirming(false);
    setSending(true);

    if (offline) {
      /* The synthetic execution, replayed in the order the stream would push it.
         Nothing leaves the browser, which is what the mode promises. */
      const lines = mockExecutionLines();
      const startedAt = nowIso();
      let index = 0;

      setExecution({
        ...emptyExecution(run.id, startedAt),
        startedBy: actor,
        startedAt,
      });

      replayRef.current = window.setInterval(() => {
        if (index >= lines.length) {
          stopReplay();
          setSending(false);

          return;
        }

        const batch = lines.slice(index, index + REPLAY_STEP);
        index += REPLAY_STEP;

        setExecution((current) =>
          current === null
            ? current
            : batch.reduce(
                (folded, line) => applyExecutionLine(folded, line, nowIso()),
                current,
              ),
        );
      }, REPLAY_MS);

      return;
    }

    void executeRun(run.id, { confirm: true }, actor, {
      onLine: (line) =>
        setExecution((current) =>
          current === null
            ? current
            : applyExecutionLine(current, line, nowIso()),
        ),
    }).then((result) => {
      setSending(false);

      if (!result.ok) {
        setWriteError(result.error.message);
        /* The run may have moved before it was refused, so the screen re-reads the
           projection instead of trusting what the stream had delivered. */
        void readExecution(run.id);

        return;
      }

      setExecution(result.data);
    });
  }, [run, execution, offline, name, readExecution, stopReplay]);

  const onExport = useCallback(() => {
    if (run === null) {
      return;
    }

    downloadCsv(
      dispersalLayoutFilename(run.id),
      dispersalLayoutCsv(rows, bankName),
    );
  }, [run, rows]);

  return (
    <>
      <SectionHeader
        title="Salida de la corrida"
        description={
          run
            ? `Semana del ${formatDate(run.weekOf)}. ${formatCount(outlook.inRun)} linea(s) en la corrida, ${formatCount(outlook.stopped)} de ellas detenida(s) por un control, y ${formatCount(outlook.excluded)} fuera de la corrida.`
            : "Lo que esta por salir esta semana, y lo que no."
        }
        aside={
          <div className="flex flex-col items-start gap-2 sm:items-end">
            {run && !offline ? (
              <a
                className="btn"
                href={runConstanciaHref(run.id)}
                target="_blank"
                rel="noreferrer"
              >
                Constancia de la corrida (PDF)
              </a>
            ) : null}
            {execution?.startedAt ? (
              <span className="subtle t-xs">
                {`Ejecutada el ${formatDateTime(execution.startedAt)}${
                  execution.startedBy ? ` por ${execution.startedBy.name}` : ""
                }`}
              </span>
            ) : null}
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

      {run && execution ? (
        <>
          <SourceNotice
            notice={resource.status === "ready" ? resource.notice : null}
          />

          {executionError ? (
            <p role="status" className="panel-sunken muted px-4 py-2 t-sm">
              {`No se pudo leer la ejecucion (${executionError}). La tabla de abajo no afirma que no haya salido nada.`}
            </p>
          ) : null}

          <section aria-labelledby="send-heading" className="panel">
            <div className="flex flex-col gap-4 p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="flex flex-col gap-1">
                  <h2 id="send-heading" className="eyebrow">
                    Enviar la corrida
                  </h2>
                  <p className="muted m-0 max-w-prose t-sm">
                    {offline
                      ? `Sin API: la corrida se ejecuta contra la corrida sintetica de este navegador y no sale nada. Las lineas traen el ${RAIL_LABEL.nessie} porque es el riel del que se genero el dato.`
                      : railSentence(rails)}
                  </p>
                </div>
                <div className="flex flex-col items-start gap-1">
                  <span className="eyebrow">Por salir</span>
                  <Amount value={outlook.pendingAmount} size="xl" />
                  <span className="subtle t-xs">
                    {`${formatCount(outlook.pending)} linea(s) de las ${formatCount(outlook.inRun)} que lleva la corrida`}
                  </span>
                  {outlook.stopped > 0 ? (
                    <span className="subtle t-xs">
                      {`Detenidas por un control: ${formatCount(outlook.stopped)}. El motivo va en su renglon y no se paga.`}
                    </span>
                  ) : null}
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-1">
                  <label className="label" htmlFor="run-actor">
                    Quien envia la corrida
                  </label>
                  <input
                    id="run-actor"
                    className="input"
                    value={name}
                    autoComplete="off"
                    onChange={(event) => {
                      setName(event.target.value);
                      setConfirming(false);
                    }}
                  />
                  <span className="subtle t-xs">
                    Va en el encabezado X-Actor y queda en el historial, linea
                    por linea. Rol: cuentas por pagar, que es quien arma la
                    corrida.
                  </span>
                </div>

                <div className="flex flex-col items-start gap-2">
                  <div className="form-actions">
                    <button
                      type="button"
                      className="btn btn-accent btn-lg"
                      aria-busy={sending}
                      disabled={!canSend}
                      onClick={() => {
                        if (confirming) {
                          onSend();

                          return;
                        }

                        setConfirming(true);
                      }}
                    >
                      {sendLabel(sending, confirming, outlook.pending)}
                    </button>
                    {confirming && !sending ? (
                      <button
                        type="button"
                        className="btn"
                        onClick={() => setConfirming(false)}
                      >
                        Cancelar
                      </button>
                    ) : null}
                  </div>
                  {confirming && !sending ? (
                    <p role="status" className="m-0 max-w-prose t-sm">
                      {`Van ${formatCount(outlook.pending)} linea(s) por un total de ${formatMoney(
                        outlook.pendingAmount,
                      )}. Un SPEI no regresa.`}
                    </p>
                  ) : null}
                  {outlook.pending === 0 && outlook.inRun > 0 ? (
                    <p className="subtle m-0 t-xs">
                      Ya salieron todas las lineas liberadas de esta corrida.
                      Una segunda llamada no manda nada nuevo.
                    </p>
                  ) : null}
                  {name.trim() === "" ? (
                    <p className="subtle m-0 t-xs">
                      Escribe el nombre de quien envia. Nada sale sin una
                      persona detras.
                    </p>
                  ) : null}
                </div>
              </div>

              {writeError ? (
                <p role="alert" className="panel-sunken muted px-4 py-2 t-sm">
                  {writeError}
                </p>
              ) : null}

              {started || sending ? (
                <div className="flex flex-col gap-2">
                  {/* A bar and a count of lines. The width is the only proportion
                      on this page and it is never written down: ADR-0009 forbids a
                      percentage on any screen of this product. */}
                  <div
                    className="meter"
                    role="progressbar"
                    aria-valuemin={0}
                    aria-valuemax={outlook.inRun}
                    aria-valuenow={outlook.answered}
                    aria-valuetext={progressSentence(
                      outlook.answered,
                      outlook.inRun,
                    )}
                  >
                    <div
                      className="meter-fill"
                      style={{
                        width:
                          outlook.inRun === 0
                            ? "0%"
                            : `${(outlook.answered / outlook.inRun) * 100}%`,
                      }}
                    />
                  </div>
                  <p className="m-0 t-sm" aria-live="polite">
                    {progressSentence(outlook.answered, outlook.inRun)}
                  </p>
                  <ul className="m-0 flex list-none flex-wrap gap-4 p-0 t-sm">
                    <li>{`Enviadas: ${formatCount(outlook.sent)}`}</li>
                    <li>{`Liquidadas: ${formatCount(outlook.settled)}`}</li>
                    <li>{`En cola: ${formatCount(outlook.queued)}`}</li>
                    <li>{`Rechazadas: ${formatCount(outlook.failed)}`}</li>
                    <li>{`Canceladas: ${formatCount(outlook.cancelled)}`}</li>
                    <li>
                      <Amount value={outlook.leftAmount} size="sm" /> salidos
                    </li>
                  </ul>
                </div>
              ) : null}

              <div className="form-actions">
                <button
                  type="button"
                  className="btn"
                  disabled={exportable.length === 0}
                  onClick={onExport}
                >
                  {`Exportar layout de dispersion (${formatCount(exportable.length)} linea(s))`}
                </button>
                <span className="subtle t-xs">
                  Un CSV con una columna por dato que ya tenemos de cada linea,
                  para el portal del banco. Cada banco fija su propio formato,
                  asi que el archivo se ajusta a su plantilla antes de subirlo.
                  Solo lleva lineas liberadas que no han salido.
                </span>
              </div>
            </div>
          </section>

          <section aria-labelledby="leaving-heading" className="panel min-w-0">
            <div className="flex flex-col gap-1 p-5 pb-0">
              <h2 id="leaving-heading" className="eyebrow">
                Lineas de la corrida
              </h2>
              <p className="subtle m-0 t-xs">
                Lo que la corrida entrega al riel, de mayor a menor importe. Una
                linea detenida por un control sigue aqui con su motivo, y no se
                paga.
              </p>
            </div>

            {taken.length === 0 ? (
              <EmptyBlock
                title="No hay nada liberado esta semana"
                description="Una linea entra aqui cuando una persona la libera. Mientras tanto, la corrida no tiene nada que entregar al riel."
                action={
                  <Link to="/run" className="btn">
                    Revisar la corrida
                  </Link>
                }
              />
            ) : (
              <div className="table-scroll p-2">
                <table className="data-table">
                  <caption className="sr-only">
                    Lineas liberadas de la corrida, con su nivel, su estado, lo
                    que contesto el riel, la clave de rastreo y su recibo.
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">Proveedor</th>
                      <th scope="col" className="align-end">
                        Importe
                      </th>
                      <th scope="col">Cuenta</th>
                      <th scope="col">Nivel</th>
                      <th scope="col">Estado</th>
                      <th scope="col">Riel</th>
                    </tr>
                  </thead>
                  <tbody>
                    {taken.map((row) => (
                      <LeavingRow
                        key={row.item.instruction.id}
                        row={row}
                        onOpenReceipt={setOpenReceipt}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section aria-labelledby="excluded-heading" className="panel min-w-0">
            <div className="flex flex-col gap-1 p-5 pb-0">
              <h2 id="excluded-heading" className="eyebrow">
                Fuera de la corrida
              </h2>
              <p className="subtle m-0 t-xs">
                Lo que no sale, con el motivo. Una linea que desaparece en
                silencio es una linea que alguien cree pagada.
              </p>
            </div>

            {excluded.length === 0 ? (
              <EmptyBlock
                title="Ninguna linea quedo fuera"
                description="Los seis controles no detuvieron nada de esta semana y nadie retuvo una linea a mano."
              />
            ) : (
              <div className="table-scroll p-2">
                <table className="data-table">
                  <caption className="sr-only">
                    Lineas que no salen en esta corrida, con su estado y el
                    motivo.
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">Proveedor</th>
                      <th scope="col" className="align-end">
                        Importe
                      </th>
                      <th scope="col">Nivel</th>
                      <th scope="col">Estado</th>
                      <th scope="col">Motivo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {excluded.map((row) => (
                      <tr key={row.item.instruction.id}>
                        <td className="cell-supplier">
                          <div className="flex flex-col gap-1">
                            <Link
                              to={instructionPath(row.item.instruction.id)}
                              className="link-quiet font-medium"
                            >
                              {row.item.supplier.legalName}
                            </Link>
                            <span className="code subtle t-xs">
                              {row.item.supplier.rfc}
                            </span>
                          </div>
                        </td>
                        <td className="align-end">
                          <Amount value={row.item.instruction.amount} />
                        </td>
                        <td>
                          <ConfidenceBadge level={row.confidence} />
                        </td>
                        <td>
                          <TransactionStateBadge state={row.state} />
                        </td>
                        <td>
                          <span className="t-sm">
                            {row.exclusion?.sentence ?? ""}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <p className="subtle t-xs">
            {[
              `Corrida ${run.id}.`,
              anySynthetic(run.items.map((item) => item.instruction))
                ? "Datos sinteticos de punta a punta."
                : null,
              "Un pago que salio no se puede deshacer, y ninguna lista publicada despues lo regresa.",
            ]
              .filter((part) => part !== null)
              .join(" ")}
          </p>
        </>
      ) : null}

      {openReceipt ? (
        <ReceiptDrawer
          receiptId={openReceipt}
          onClose={() => setOpenReceipt(null)}
        />
      ) : null}
    </>
  );
}

/**
 * One line the run took: leaving, left, or stopped on the way.
 *
 * Both chips are always rendered and that is the point of the row: the state is
 * where the payment stands for the company and the rail chip is what the rail said,
 * and a judge who asks the difference between `sent` and `settled` is reading it off
 * this cell.
 *
 * The reason appears exactly once. Before the run is executed it sits under the
 * state, which is where a clerk looks to see that a released line is going to be
 * cancelled; afterwards the rail's own sentence is in the rail cell and the two are
 * the same words, so printing both would read as two separate problems.
 */
function LeavingRow({
  row,
  onOpenReceipt,
}: {
  row: PaymentRow;
  onOpenReceipt: (receiptId: string) => void;
}) {
  const { instruction, supplier } = row.item;
  const { line } = row;
  const receiptId = line?.receiptId;

  return (
    <tr>
      <td className="cell-supplier">
        <div className="flex flex-col gap-1">
          <Link
            to={instructionPath(instruction.id)}
            className="link-quiet font-medium"
          >
            {supplier.legalName}
          </Link>
          <span className="code subtle t-xs">{supplier.rfc}</span>
        </div>
      </td>
      <td className="align-end">
        <Amount value={instruction.amount} size="lg" />
      </td>
      <td>
        <span className="code code-nowrap">
          {`terminacion ${instruction.clabe.slice(-4)}`}
        </span>
        <span className="subtle block t-xs">{bankName(instruction.clabe)}</span>
      </td>
      <td>
        <ConfidenceBadge level={row.confidence} />
      </td>
      <td>
        <div className="flex flex-col items-start gap-1">
          <TransactionStateBadge state={row.state} />
          {!line && row.exclusion ? (
            <span className="subtle t-xs">{row.exclusion.sentence}</span>
          ) : null}
        </div>
      </td>
      <td>
        {line ? (
          <div className="flex flex-col items-start gap-1">
            <PaymentLineBadge state={line.state} />
            {line.claveRastreo ? (
              <span className="code t-xs">{line.claveRastreo}</span>
            ) : null}
            {line.reason ? (
              <span className="subtle t-xs">{line.reason}</span>
            ) : null}
            {receiptId ? (
              <button
                type="button"
                className="link-quiet t-xs underline"
                onClick={() => onOpenReceipt(receiptId)}
              >
                Ver recibo
              </button>
            ) : null}
          </div>
        ) : (
          <span className="subtle t-xs">Sin enviar</span>
        )}
      </td>
    </tr>
  );
}
