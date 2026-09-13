/**
 * One payment instruction, in full: what arrived, through which channel, what
 * the detectors found, how much it is trusted, where it stands, until when it is
 * stopped and what a person does next with it.
 *
 * The raw message text is shown as context and nothing more. It never feeds a
 * decision, because a message is exactly the artefact an attacker controls.
 *
 * This is where the objections the Capital One table raised are answered by
 * pointing rather than by talking, so four things are on the screen that used to
 * live in the API and in a rehearsal.
 *
 * 1. **The level, with the findings under it.** Three words and never a
 *    percentage, and never the word "seguro" in any language. `LevelPanel` holds
 *    that argument.
 * 2. **The deadline and the steps.** A hold has a window, the window is the
 *    delay the expected-loss arithmetic already charged for, and nothing happens
 *    by itself when it closes. `HoldPanel` holds that one.
 * 3. **The three figures, at the moment of signing.** Pesos at risk, expected
 *    loss and what a day of delay costs with this supplier, next to the person
 *    typing their name. The expected loss carries the sentence that the
 *    probability behind it is a prior and not a measurement, because saying it
 *    on the screen is the difference between a number and a claim.
 * 4. **A way out that is inside the product.** A release over a finding is
 *    signed by the owner with a written reason, and a released payment is
 *    reopened the same way. A control with no way out is a control that gets
 *    bypassed outside the product, where nothing is recorded at all.
 */

import type { Action, Actor } from "@hackmty/core";
import { ACTOR_ROLE_LABEL } from "@hackmty/core";
import { useCallback, useMemo, useRef, useState } from "react";
import { ActionBar, OverrideForm } from "../components/Decision";
import { FindingPanel } from "../components/Findings";
import { HoldPanel } from "../components/Hold";
import { LevelBadge, LevelPanel, StateBadge } from "../components/Level";
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
import { currentActor } from "../lib/actor";
import {
  cartaHref,
  decideInstruction,
  getInstruction,
  getVerification,
} from "../lib/api";
import type { InstructionDetail } from "../lib/contract";
import {
  formatClabe,
  formatDateTime,
  formatMoney,
  formatPercent,
  shortUuid,
} from "../lib/format";
import { ACTION_HELP, SOURCE_LABEL } from "../lib/labels";
import { amountAtRiskOf, assessLine, holdOf } from "../lib/levels";
import { bankName, mockInstruction, mockVerification } from "../lib/mock";
import { useResource } from "../lib/resource";
import {
  Link,
  PATHS,
  supplierPath,
  verifyAccountPath,
  verifyCallPath,
} from "../lib/router";

/** Where `LevelPanel` links a named finding to its own panel further down. */
function findingAnchor(findingId: string): string {
  return `#finding-${encodeURIComponent(findingId)}`;
}

export function InstructionScreen({ id }: { id: string }) {
  const load = useCallback(
    (signal: AbortSignal) => getInstruction(id, { signal }),
    [id],
  );
  const fallback = useCallback(() => mockInstruction(id), [id]);
  /* Named explicitly: the offline row is a `PaymentRunItem`, which satisfies the
     detail without the `hold` the API adds, and letting inference pick the
     narrower of the two would drop that field from the whole screen. */
  const { resource, reload, replace } = useResource<InstructionDetail>(load, {
    fallback,
  });

  /* The verification is read here and not only on the CEP screen, because
     `blocked` is what makes a line `cancelado`, and a detail that ignored it
     would read `rojo` next to a run that reads `cancelado` for the same payment.
     It loads on its own and never blocks this screen: an instruction nobody has
     probed answers `not_started`, which is an answer. */
  const loadVerification = useCallback(
    (signal: AbortSignal) => getVerification(id, { signal }),
    [id],
  );
  const verificationFallback = useCallback(() => mockVerification(id), [id]);
  const { resource: verification } = useResource(loadVerification, {
    fallback: verificationFallback,
  });

  const [pending, setPending] = useState<Action | null>(null);
  const [writeError, setWriteError] = useState<string | null>(null);
  const [recorded, setRecorded] = useState<string | null>(null);
  const overrideName = useRef<HTMLInputElement | null>(null);

  const detail = resource.status === "ready" ? resource.data : null;
  const verificationState =
    verification.status === "ready" ? verification.data : null;

  const assessment = useMemo(
    () =>
      detail === null
        ? null
        : assessLine({
            decision: detail.decision,
            findings: detail.findings,
            verification: verificationState,
          }),
    [detail, verificationState],
  );

  const onDecide = useCallback(
    async (action: Action, actor: Actor, reason?: string) => {
      if (resource.status !== "ready") {
        return;
      }

      setWriteError(null);
      setRecorded(null);
      setPending(action);

      const atRisk = amountAtRiskOf(resource.data.findings);

      if (resource.source === "mock") {
        replace({
          ...resource.data,
          decision: {
            ...resource.data.decision,
            action,
            decidedAt: new Date().toISOString(),
            /* The offline path records the same fields the API records, or the
               mock would show a decision the API could not produce. */
            decidedBy: actor.name,
            decidedByRole: actor.role,
            ...(reason === undefined ? {} : { reason }),
          },
        });
        setWriteError(
          "Sin API: la decision se aplico solo en la corrida sintetica de este navegador.",
        );
        setPending(null);

        return;
      }

      const result = await decideInstruction(
        id,
        {
          action,
          decidedBy: actor.name,
          ...(reason === undefined ? {} : { reason }),
        },
        { actor },
      );

      setPending(null);

      if (!result.ok) {
        setWriteError(result.error.message);

        return;
      }

      /* What was recorded, in the API's own figures where it sent them. The
         pesos at risk is the one worth echoing back: it is what the person was
         looking at when they signed, and stating it closes the gap between the
         screen and the ledger entry. */
      setRecorded(
        `Quedo en la bitacora a nombre de ${actor.name}, ${ACTOR_ROLE_LABEL[actor.role]}, con ${formatMoney(result.data.amountAtRisk ?? atRisk)} en riesgo en ese momento.`,
      );
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

      {detail !== null && assessment !== null ? (
        <>
          <SourceNotice
            notice={resource.status === "ready" ? resource.notice : null}
          />

          <SectionHeader
            title={detail.supplier.legalName}
            /* No trailing stop: the localised time already ends in one. */
            description={`Instruccion ${detail.instruction.id}, recibida por ${SOURCE_LABEL[detail.instruction.source]} el ${formatDateTime(detail.instruction.receivedAt)}`}
            aside={
              <div className="flex flex-col items-start gap-2 sm:items-end">
                <SyntheticMark when={detail.instruction.synthetic} />
                <div className="flex flex-wrap items-center gap-2">
                  {/* The API's own pair when it sent one, and the same two pure
                      functions over the same findings when it did not. */}
                  <LevelBadge
                    confidence={
                      detail.confidence ?? assessment.confidence.level
                    }
                  />
                  <StateBadge state={detail.state ?? assessment.state.state} />
                  <DecisionBadge action={detail.decision.action} />
                </div>
              </div>
            }
          />

          <LevelPanel
            assessment={assessment}
            findings={detail.findings}
            findingAnchor={findingAnchor}
          />

          <HoldPanel
            hold={holdOf(
              detail.decision,
              new Date().toISOString(),
              detail.hold,
            )}
            instructionId={detail.instruction.id}
            onRelease={() => overrideName.current?.focus()}
          />

          <section className="panel flex flex-col gap-5 p-5">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div className="flex flex-col">
                <span className="eyebrow">Importe de la instruccion</span>
                <Amount value={detail.instruction.amount} size="xl" />
              </div>
              <div className="flex flex-col items-start gap-2">
                <span className="eyebrow">Decision</span>
                <ActionBar
                  current={detail.decision.action}
                  pending={pending}
                  context={detail.supplier.legalName}
                  onDecide={(action) => {
                    void onDecide(action, currentActor());
                  }}
                />
                <p className="subtle t-xs">
                  {ACTION_HELP[detail.decision.action]}
                </p>
                {/* Nobody signs invisibly. Confirming what the engine proposed
                    is one click and it still carries the name of whoever this
                    browser is acting as, which is what the person selector
                    sets. */}
                <p className="subtle t-xs">
                  {`Se confirma a nombre de ${currentActor().name}, ${ACTOR_ROLE_LABEL[currentActor().role]}.`}
                </p>

                {/* The call is a step in this decision, not a section of the
                    app, so it is offered here and only when the decision asks
                    for it. It left the rail for the same reason. */}
                {detail.decision.action === "verify" ? (
                  <>
                    <Link to={verifyCallPath(id)} className="btn">
                      Llamar para verificar
                    </Link>
                    <p className="subtle t-xs">
                      El guion lleva los ultimos cuatro digitos de la cuenta,
                      nunca la CLABE completa.
                    </p>
                  </>
                ) : null}
              </div>
            </div>

            {writeError ? (
              <p role="status" className="panel-sunken muted px-4 py-2 t-sm">
                {writeError}
              </p>
            ) : null}

            {recorded ? (
              <p role="status" className="panel-sunken muted px-4 py-2 t-sm">
                {recorded}
              </p>
            ) : null}

            <hr className="divider" />

            <dl className="m-0 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Cuenta destino">
                <span className="code">
                  {formatClabe(detail.instruction.clabe)}
                </span>
                <span className="subtle block t-xs">
                  {bankName(detail.instruction.clabe)}
                </span>
                {/* The beneficiary check starts here, on the account it is
                    about. One click sends the centavo through the rail inside
                    this same run; nobody types a clave de rastreo. */}
                <span className="block">
                  <Link
                    to={verifyAccountPath(detail.instruction.id)}
                    className="t-sm underline"
                  >
                    Verificar la cuenta con un centavo
                  </Link>
                </span>
              </Field>
              <Field label="Proveedor">
                <span className="code">{detail.supplier.rfc}</span>
                <span className="block">
                  {/* A route and not a drawer over this panel. The expediente
                    carries the accounts with their plazas, the weekly
                    behaviour and both SAT lists, which is more than a sheet
                    sliding over the finding a clerk is reading. */}
                  <Link
                    to={supplierPath(detail.supplier.rfc)}
                    className="t-sm underline"
                  >
                    Ver expediente del proveedor
                  </Link>
                </span>
              </Field>
              <Field label="Facturas que dice pagar">
                {detail.instruction.cfdiUuids.length === 0 ? (
                  <span className="muted">Ninguna</span>
                ) : (
                  <ul className="m-0 list-none p-0">
                    {detail.instruction.cfdiUuids.map((uuid) => (
                      <li key={uuid} className="code">
                        {shortUuid(uuid, 13)}
                      </li>
                    ))}
                  </ul>
                )}
              </Field>
              <Field label="Pesos en riesgo">
                <Amount value={amountAtRiskOf(detail.findings)} />
                <span className="subtle block t-xs">
                  El mayor monto en riesgo de un solo hallazgo, nunca la suma:
                  seis controles sobre un pago describen los mismos pesos desde
                  seis angulos.
                </span>
              </Field>
              <Field label="Costo de retrasar un dia">
                <Amount value={detail.decision.delayCostPerDay} />
                <span className="subtle block t-xs">
                  Asi valuamos la relacion con este proveedor en esta empresa
                  sintetica. En una real el dato sale de sus contratos.
                </span>
              </Field>
              {detail.instruction.ocrConfidence === undefined ? null : (
                <Field label="Confianza del OCR">
                  <span className="num">
                    {formatPercent(detail.instruction.ocrConfidence)}
                  </span>
                  <span className="subtle block t-xs">
                    La CLABE se leyo de una imagen, no de un texto.
                  </span>
                </Field>
              )}
              <Field label="Perdida esperada">
                <Amount value={detail.decision.expectedLoss} />
                {/* Said on the screen and not only at the table. The probability
                    behind this figure is a prior per severity with a TODO on top
                    of it in `decision.ts`, so the number is an upper bound on the
                    evidence and not a measurement. */}
                <span className="subtle block t-xs">
                  La probabilidad detras de esta cifra es un supuesto por
                  severidad, no una medicion. Es una cota sobre la evidencia y
                  se lee como tal.
                </span>
              </Field>
              {detail.instruction.text ? (
                <Field label="Mensaje recibido" wide>
                  <q className="muted t-sm">{detail.instruction.text}</q>
                  <span className="subtle block t-xs">
                    Se muestra como contexto. El texto nunca decide.
                  </span>
                </Field>
              ) : null}
            </dl>

            {/* The letter a clerk attaches to an email when the supplier asks
                why the payment has not arrived. Offered only against the API:
                the page is produced by the server out of the ledger, and a
                letter about a run the browser invented would be a document about
                nothing. */}
            {resource.status === "ready" && resource.source === "api" ? (
              <a
                className="btn"
                href={cartaHref(detail.instruction.id)}
                target="_blank"
                rel="noreferrer"
                data-tour="instruction-carta"
              >
                Carta de evidencia (PDF)
              </a>
            ) : (
              <p className="subtle t-xs">
                La carta de evidencia en PDF la emite el servidor a partir de la
                bitacora. Con la API apagada no hay documento que emitir.
              </p>
            )}
          </section>

          <OverrideForm
            id="override"
            nameRef={overrideName}
            standing={detail.decision}
            findings={detail.findings}
            amountAtRisk={amountAtRiskOf(detail.findings)}
            expectedLoss={detail.decision.expectedLoss}
            delayCostPerDay={detail.decision.delayCostPerDay}
            pending={pending}
            onSubmit={(action, actor, reason) => {
              void onDecide(action, actor, reason);
            }}
          />

          <section
            aria-labelledby="findings-heading"
            className="flex flex-col gap-4"
            data-tour="instruction-findings"
          >
            <h2 id="findings-heading" className="eyebrow">
              Hallazgos
            </h2>
            {detail.findings.length === 0 ? (
              <div className="panel">
                <EmptyBlock
                  title="Sin hallazgos"
                  description="Los seis detectores corrieron y ninguno encontro nada que revisar en esta instruccion."
                />
              </div>
            ) : (
              detail.findings.map((finding) => (
                <div
                  key={finding.id}
                  id={`finding-${encodeURIComponent(finding.id)}`}
                >
                  <FindingPanel
                    finding={finding}
                    proposedClabe={detail.instruction.clabe}
                    instructionId={detail.instruction.id}
                    supplierRfc={detail.supplier.rfc}
                  />
                </div>
              ))
            )}
          </section>
        </>
      ) : null}
    </>
  );
}
