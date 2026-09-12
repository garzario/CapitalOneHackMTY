/**
 * One payment instruction, in full: what arrived, through which channel, what
 * the detectors found, and the decision a person is about to confirm.
 *
 * The raw message text is shown as context and nothing more. It never feeds a
 * decision, because a message is exactly the artefact an attacker controls.
 */

import type { Action } from "@hackmty/core";
import { useCallback, useState } from "react";
import { ActionBar } from "../components/Decision";
import { FindingPanel } from "../components/Findings";
import {
  Amount,
  DecisionBadge,
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
import { SupplierDrawer } from "../components/SupplierDrawer";
import { decideInstruction, getInstruction } from "../lib/api";
import {
  formatClabe,
  formatDateTime,
  formatPercent,
  shortUuid,
} from "../lib/format";
import { ACTION_HELP, SOURCE_LABEL } from "../lib/labels";
import { bankName, mockInstruction } from "../lib/mock";
import { useResource } from "../lib/resource";
import { Link, PATHS } from "../lib/router";

export function InstructionScreen({ id }: { id: string }) {
  const load = useCallback(
    (signal: AbortSignal) => getInstruction(id, { signal }),
    [id],
  );
  const fallback = useCallback(() => mockInstruction(id), [id]);
  const { resource, reload, replace } = useResource(load, { fallback });
  const [pending, setPending] = useState<Action | null>(null);
  const [writeError, setWriteError] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const onDecide = useCallback(
    async (action: Action) => {
      if (resource.status !== "ready") {
        return;
      }

      setWriteError(null);
      setPending(action);

      if (resource.source === "mock") {
        replace({
          ...resource.data,
          decision: {
            ...resource.data.decision,
            action,
            decidedAt: new Date().toISOString(),
            decidedBy: "clerk@demo",
          },
        });
        setWriteError(
          "Sin API: la decision se aplico solo en la corrida sintetica de este navegador.",
        );
        setPending(null);

        return;
      }

      const result = await decideInstruction(id, {
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
    [id, resource, replace, reload],
  );

  return (
    <>
      <Link to={PATHS.run} className="t-sm underline">
        Volver a la corrida
      </Link>

      {resource.status === "loading" ? (
        <div className="panel">
          <LoadingBlock label="Cargando la instruccion" rows={5} />
        </div>
      ) : null}

      {resource.status === "error" ? (
        <div className="panel">
          <ErrorBlock
            title="No se encontro la instruccion"
            message={`${resource.message} Identificador: ${id}.`}
            onRetry={reload}
          />
        </div>
      ) : null}

      {resource.status === "ready" ? (
        <>
          <SourceNotice notice={resource.notice} />

          <SectionHeader
            title={resource.data.supplier.legalName}
            /* No trailing stop: the localised time already ends in one. */
            description={`Instruccion ${resource.data.instruction.id}, recibida por ${SOURCE_LABEL[resource.data.instruction.source]} el ${formatDateTime(resource.data.instruction.receivedAt)}`}
            aside={
              <div className="flex flex-col items-start gap-2 sm:items-end">
                <SyntheticMark when={resource.data.instruction.synthetic} />
                <DecisionBadge action={resource.data.decision.action} />
              </div>
            }
          />

          <section className="panel flex flex-col gap-5 p-5">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div className="flex flex-col">
                <span className="eyebrow">Importe de la instruccion</span>
                <Amount value={resource.data.instruction.amount} size="xl" />
              </div>
              <div className="flex flex-col items-start gap-2">
                <span className="eyebrow">Decision</span>
                <ActionBar
                  current={resource.data.decision.action}
                  pending={pending}
                  context={resource.data.supplier.legalName}
                  onDecide={(action) => {
                    void onDecide(action);
                  }}
                />
                <p className="subtle t-xs">
                  {ACTION_HELP[resource.data.decision.action]}
                </p>
              </div>
            </div>

            {writeError ? (
              <p role="status" className="panel-sunken muted px-4 py-2 t-sm">
                {writeError}
              </p>
            ) : null}

            <hr className="divider" />

            <dl className="m-0 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Cuenta destino">
                <span className="code">
                  {formatClabe(resource.data.instruction.clabe)}
                </span>
                <span className="subtle block t-xs">
                  {bankName(resource.data.instruction.clabe)}
                </span>
              </Field>
              <Field label="Proveedor">
                <span className="code">{resource.data.supplier.rfc}</span>
                <span className="block">
                  <button
                    type="button"
                    className="t-sm underline"
                    onClick={() => setDrawerOpen(true)}
                  >
                    Ver expediente del proveedor
                  </button>
                </span>
              </Field>
              <Field label="Facturas que dice pagar">
                {resource.data.instruction.cfdiUuids.length === 0 ? (
                  <span className="muted">Ninguna</span>
                ) : (
                  <ul className="m-0 list-none p-0">
                    {resource.data.instruction.cfdiUuids.map((uuid) => (
                      <li key={uuid} className="code">
                        {shortUuid(uuid, 13)}
                      </li>
                    ))}
                  </ul>
                )}
              </Field>
              <Field label="Costo de retrasar un dia">
                <Amount value={resource.data.decision.delayCostPerDay} />
              </Field>
              {resource.data.instruction.ocrConfidence === undefined ? null : (
                <Field label="Confianza del OCR">
                  <span className="num">
                    {formatPercent(resource.data.instruction.ocrConfidence)}
                  </span>
                  <span className="subtle block t-xs">
                    La CLABE se leyo de una imagen, no de un texto.
                  </span>
                </Field>
              )}
              <Field label="Perdida esperada">
                <Amount value={resource.data.decision.expectedLoss} />
              </Field>
              {resource.data.instruction.text ? (
                <Field label="Mensaje recibido" wide>
                  <q className="muted t-sm">{resource.data.instruction.text}</q>
                  <span className="subtle block t-xs">
                    Se muestra como contexto. El texto nunca decide.
                  </span>
                </Field>
              ) : null}
            </dl>
          </section>

          <section
            aria-labelledby="findings-heading"
            className="flex flex-col gap-4"
          >
            <h2 id="findings-heading" className="eyebrow">
              Hallazgos
            </h2>
            {resource.data.findings.length === 0 ? (
              <div className="panel">
                <EmptyBlock
                  title="Sin hallazgos"
                  description="Los seis detectores corrieron y ninguno encontro nada que revisar en esta instruccion."
                />
              </div>
            ) : (
              resource.data.findings.map((finding) => (
                <FindingPanel key={finding.id} finding={finding} />
              ))
            )}
          </section>

          {drawerOpen ? (
            <SupplierDrawer
              rfc={resource.data.supplier.rfc}
              onClose={() => setDrawerOpen(false)}
            />
          ) : null}
        </>
      ) : null}
    </>
  );
}
