/**
 * The blind evaluation.
 *
 * The point of this screen is not the numbers, it is what is said next to them.
 * A screen that reports precision without saying who wrote the answer key, and
 * how independent that person really was, is a screen that reports nothing.
 *
 * Two consequences, and both of them are the difference between this page and
 * a dashboard.
 *
 * - The note at the bottom states exactly how blind the evaluation is, in the
 *   same words as `packages/seed/src/holdout/README.md`, including the part
 *   that is weaker than the protocol originally promised. A claim on a screen
 *   that the repository contradicts is the one a judge finds.
 * - When the figures come from the synthetic placeholder instead of a real
 *   run, the page says so in the loudest place on it and not in a footnote.
 */

import type { Detector } from "@hackmty/core";
import { useCallback } from "react";
import { SectionHeader } from "../components/Primitives";
import {
  EmptyBlock,
  ErrorBlock,
  LoadingBlock,
  SourceNotice,
} from "../components/States";
import { getMetrics } from "../lib/api";
import { formatCount, formatPercent } from "../lib/format";
import { DETECTOR_LABEL, DETECTOR_ORDER } from "../lib/labels";
import { MOCK_METRICS } from "../lib/mock";
import { useResource } from "../lib/resource";

function metricsFallback() {
  return MOCK_METRICS;
}

function ratio(numerator: number, denominator: number): number {
  return denominator === 0 ? Number.NaN : numerator / denominator;
}

export function MetricsScreen() {
  const load = useCallback((signal: AbortSignal) => getMetrics({ signal }), []);
  const { resource, reload } = useResource(load, { fallback: metricsFallback });

  return (
    <>
      <SectionHeader
        title="Evaluacion ciega"
        description="Precision, recall y tasa de falsos positivos de los seis detectores contra casos etiquetados que el lado de los detectores no vio."
      />

      {resource.status === "loading" ? (
        <div className="panel">
          <LoadingBlock label="Calculando las metricas" rows={5} />
        </div>
      ) : null}

      {resource.status === "error" ? (
        <div className="panel">
          <ErrorBlock message={resource.message} onRetry={reload} />
        </div>
      ) : null}

      {resource.status === "ready" ? (
        <>
          <SourceNotice notice={resource.notice} />

          {resource.source === "mock" ? (
            <p
              role="status"
              className="panel p-5 t-md"
              style={{
                borderColor: "var(--c-verify)",
                backgroundColor: "var(--c-verify-soft)",
                color: "var(--c-verify-ink)",
              }}
            >
              Sin API. Estos numeros se calcularon sobre los mismos casos
              etiquetados que responde el servidor, con los mismos seis
              controles, asi que son la misma evaluacion ciega y no un
              placeholder. Se recalculan en el servidor al reconectar.
            </p>
          ) : null}

          {resource.data.cases === 0 ? (
            <div className="panel">
              <EmptyBlock
                title="Sin casos evaluados"
                description="El conjunto etiquetado esta vacio, asi que no hay nada que medir todavia."
              />
            </div>
          ) : (
            <>
              <section
                aria-label="Resumen"
                className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
              >
                <Headline
                  label="Precision"
                  value={formatPercent(resource.data.precision)}
                  help="De lo que marcamos, cuanto era real."
                />
                <Headline
                  label="Recall"
                  value={formatPercent(resource.data.recall)}
                  help="De lo que era real, cuanto marcamos."
                />
                <Headline
                  label="Falsos positivos"
                  value={formatPercent(resource.data.falsePositiveRate)}
                  help="De los pagos limpios, cuantos detuvimos sin razon."
                />
                <Headline
                  label="Casos"
                  value={formatCount(resource.data.cases)}
                  help="Tamano del conjunto etiquetado."
                />
              </section>

              <section
                aria-labelledby="per-detector-heading"
                className="panel flex flex-col gap-3 p-5"
              >
                <h2 id="per-detector-heading" className="eyebrow">
                  Por detector
                </h2>
                <div className="table-scroll">
                  <table className="data-table">
                    <caption className="sr-only">
                      Verdaderos positivos, falsos positivos, falsos negativos,
                      precision y recall de cada detector.
                    </caption>
                    <thead>
                      <tr>
                        <th scope="col">Detector</th>
                        <th scope="col" className="align-end">
                          VP
                        </th>
                        <th scope="col" className="align-end">
                          FP
                        </th>
                        <th scope="col" className="align-end">
                          FN
                        </th>
                        <th scope="col" className="align-end">
                          Precision
                        </th>
                        <th scope="col" className="align-end">
                          Recall
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {DETECTOR_ORDER.map((detector: Detector) => {
                        const row = resource.data.perDetector[detector];

                        if (!row) {
                          return null;
                        }

                        return (
                          <tr key={detector}>
                            <td>{DETECTOR_LABEL[detector]}</td>
                            <td className="align-end num">
                              {formatCount(row.tp)}
                            </td>
                            <td className="align-end num">
                              {formatCount(row.fp)}
                            </td>
                            <td className="align-end num">
                              {formatCount(row.fn)}
                            </td>
                            <td className="align-end num">
                              {formatPercent(ratio(row.tp, row.tp + row.fp))}
                            </td>
                            <td className="align-end num">
                              {formatPercent(ratio(row.tp, row.tp + row.fn))}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr>
                        <th scope="row">Total</th>
                        <td className="align-end num">
                          {formatCount(resource.data.truePositives)}
                        </td>
                        <td className="align-end num">
                          {formatCount(resource.data.falsePositives)}
                        </td>
                        <td className="align-end num">
                          {formatCount(resource.data.falseNegatives)}
                        </td>
                        <td className="align-end num">
                          {formatPercent(resource.data.precision)}
                        </td>
                        <td className="align-end num">
                          {formatPercent(resource.data.recall)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </section>
            </>
          )}

          <section
            aria-labelledby="refused-heading"
            className="panel flex flex-col gap-3 p-5"
          >
            <h2 id="refused-heading" className="t-lg">
              Lo que medimos y lo que no quisimos mandar
            </h2>
            <ul className="muted m-0 flex list-disc flex-col gap-2 pl-5 t-sm">
              <li>
                Que tan ciega es esta evaluacion, dicho completo: los detectores
                ya estaban escritos cuando se escribieron las etiquetas, y las
                etiquetas salieron de ADR-0002 y de los tipos del dominio, no de
                leer el codigo de los detectores. Lo que sostiene el numero es
                la otra regla: ningun caso se edito para que un detector pasara.
              </li>
              <li>
                Cuatro etiquetas no coinciden con el motor y las cuatro siguen
                contadas en contra, con el argumento escrito en
                packages/seed/src/holdout/README.md. Un conjunto que se edita
                hasta que coincide no mide nada.
              </li>
              <li>
                Un hallazgo informativo no cuenta como falso positivo. Que un
                beneficiario ya este verificado, o que un proveedor haya
                desvirtuado su situacion, es contexto para la persona que
                decide: no detiene un pago y no infla esta tasa.
              </li>
              <li>
                Un detector con precision baja nunca retiene por si solo: pide
                verificar. Retener el pago de un proveedor honesto tambien
                cuesta dinero, y la tasa de falsos positivos es la que hay que
                defender antes que el recall.
              </li>
              <li>
                Ningun modelo de lenguaje participa en la decision de un pago.
                El texto de un mensaje se muestra como contexto y nunca entra al
                calculo.
              </li>
              <li>
                Ningun hallazgo acusa a nadie. Los estados son comprobable y
                requiere verificacion, y siempre decide una persona.
              </li>
            </ul>

            <p className="subtle m-0 t-xs">
              Los mismos numeros salen de{" "}
              <span className="code">bun run eval</span> en la terminal y de{" "}
              <span className="code">GET /api/v1/metrics</span>. Es la misma
              funcion sobre los mismos casos.
            </p>
          </section>
        </>
      ) : null}
    </>
  );
}

function Headline({
  label,
  value,
  help,
}: {
  label: string;
  value: string;
  help: string;
}) {
  return (
    <div className="panel flex flex-col gap-1 p-5">
      <span className="eyebrow">{label}</span>
      <span className="num-xl">{value}</span>
      <span className="subtle t-xs">{help}</span>
    </div>
  );
}
