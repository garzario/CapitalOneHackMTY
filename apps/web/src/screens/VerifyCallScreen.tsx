/**
 * The verification call, from the laptop.
 *
 * This page exists because telephony is the part of the demo most likely to
 * fail on site: a hall with bad reception, a provider that will not dial a
 * Mexican mobile, a number that was never verified. When that happens the
 * control still has to work, so the page offers the same agent through the
 * browser microphone and, failing even that, the exact words for a person to
 * say on their own telephone.
 *
 * Three things in order, which is also the order of preference:
 *
 * 1. **The script.** Read from the API, side effect free. It carries the last
 *    four digits of the account and never the whole of it, and it is the same
 *    text the telephone agent reads, so a hand-made call proves the same thing.
 * 2. **The agent in the browser.** The public conversational widget, loaded
 *    only when somebody presses the button, so a page nobody uses costs no
 *    third-party script. It talks to the same agent id the telephone uses.
 * 3. **The outcome.** Whatever happened, a person records what they heard and
 *    it lands on the ledger as `verification_call`.
 *
 * What this page cannot do, on purpose: release a payment. A confirmation is
 * evidence, like a CEP. The release stays on the instruction screen with a name
 * against it.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Field } from "../components/Primitives";
import { ErrorBlock, LoadingBlock } from "../components/States";
import {
  type ApiFailure,
  getVerifyCallScript,
  scriptFromFailure,
  verifyCall,
} from "../lib/api";
import type {
  VerificationOutcome,
  VerificationScriptText,
} from "../lib/contract";
import { useRouteQuery } from "../lib/router";

/**
 * The widget, pinned to an exact version.
 *
 * A floating tag on a third-party script is a supply chain hole, and this repo
 * pins every dependency for the same reason. 0.18.1 was published on
 * 2026-09-07, which clears the three-day quarantine in `bunfig.toml` that the
 * package manager applies to everything else.
 */
const WIDGET_SRC = "https://unpkg.com/@elevenlabs/convai-widget-embed@0.18.1";

/** Set at build time when the team has an agent. Empty means type it in. */
const BUILD_AGENT_ID =
  (import.meta.env.VITE_ELEVENLABS_AGENT_ID as string | undefined) ?? "";

const OUTCOMES: Array<{ value: VerificationOutcome; label: string }> = [
  { value: "confirmed", label: "Confirmo que la cuenta es suya" },
  { value: "denied", label: "Dijo que la cuenta no es suya" },
  { value: "no_answer", label: "Nadie contesto" },
  { value: "unclear", label: "Contesto pero no quedo claro" },
];

type ScriptState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; script: VerificationScriptText; configured: boolean }
  | { status: "failed"; message: string };

type RecordState =
  | { status: "idle" }
  | { status: "sending" }
  | { status: "done"; outcome: VerificationOutcome }
  | { status: "failed"; message: string };

type WidgetState = "idle" | "loading" | "ready" | "failed";

/** Loads the widget script once per page, and resolves when it is there. */
function loadWidget(): Promise<void> {
  const existing = document.querySelector(`script[src="${WIDGET_SRC}"]`);

  if (existing !== null) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = WIDGET_SRC;
    script.async = true;
    script.addEventListener("load", () => resolve());
    script.addEventListener("error", () =>
      reject(new Error("the widget script did not load")),
    );
    document.head.appendChild(script);
  });
}

export function VerifyCallScreen() {
  const query = useRouteQuery();
  const fromLink = query.get("instruction") ?? "";

  const [instructionId, setInstructionId] = useState(fromLink);
  const [agentId, setAgentId] = useState(BUILD_AGENT_ID);
  const [script, setScript] = useState<ScriptState>({ status: "idle" });
  const [outcome, setOutcome] = useState<VerificationOutcome>("confirmed");
  const [heard, setHeard] = useState("");
  const [recordedBy, setRecordedBy] = useState("");
  const [record, setRecord] = useState<RecordState>({ status: "idle" });
  const [widget, setWidget] = useState<WidgetState>("idle");
  const widgetSlot = useRef<HTMLDivElement>(null);

  /* A link from the payment run carries the instruction, so the page loads
     itself. Typed by hand it waits for the button. */
  const load = useCallback(async (id: string) => {
    if (id.trim() === "") {
      setScript({ status: "idle" });

      return;
    }

    setScript({ status: "loading" });
    const result = await getVerifyCallScript(id.trim());

    setScript(
      result.ok
        ? {
            status: "ready",
            script: result.data.script,
            configured: result.data.voiceConfigured,
          }
        : { status: "failed", message: result.error.message },
    );
  }, []);

  useEffect(() => {
    if (fromLink !== "") {
      void load(fromLink);
    }
  }, [fromLink, load]);

  /* The custom element is created rather than written as JSX, so the page needs
     no ambient declaration for a tag that only exists after the script loads. */
  const startWidget = useCallback(async () => {
    const slot = widgetSlot.current;

    if (slot === null || agentId.trim() === "") {
      setWidget("failed");

      return;
    }

    setWidget("loading");

    try {
      await loadWidget();
      slot.replaceChildren();
      const element = document.createElement("elevenlabs-convai");
      element.setAttribute("agent-id", agentId.trim());
      slot.appendChild(element);
      setWidget("ready");
    } catch {
      setWidget("failed");
    }
  }, [agentId]);

  const submit = useCallback(async () => {
    if (instructionId.trim() === "" || recordedBy.trim() === "") {
      setRecord({
        status: "failed",
        message:
          "Falta la instruccion o quien hizo la llamada. Las dos quedan en la bitacora.",
      });

      return;
    }

    setRecord({ status: "sending" });

    const result = await verifyCall(instructionId.trim(), {
      outcome,
      ...(heard.trim() === "" ? {} : { evidence: heard.trim() }),
      recordedBy: recordedBy.trim(),
    });

    if (result.ok) {
      setRecord({ status: "done", outcome: result.data.outcome ?? outcome });

      return;
    }

    /* A 422 from a deployment with no keys still carries the script, so the
       page can show the words instead of only reporting the failure. */
    const fallback = scriptFromFailure(result.error as ApiFailure);
    if (fallback !== null && script.status !== "ready") {
      setScript({ status: "ready", script: fallback, configured: false });
    }
    setRecord({ status: "failed", message: result.error.message });
  }, [heard, instructionId, outcome, recordedBy, script.status]);

  return (
    <>
      <p className="muted max-w-prose t-sm">
        Cuando la decision es verificar, el agente de voz le pregunta al
        proveedor si la cuenta es suya. La respuesta queda en la bitacora y
        nunca libera el pago sola.
      </p>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)] [&>*]:min-w-0">
        <div className="flex flex-col gap-5">
          <section
            aria-labelledby="script-heading"
            className="panel flex flex-col gap-4 p-5"
          >
            <h2 id="script-heading" className="t-lg">
              El guion
            </h2>

            <div className="flex flex-wrap items-end gap-3">
              <div className="grow">
                <label className="label" htmlFor="call-instruction">
                  Instruccion de pago
                </label>
                <input
                  id="call-instruction"
                  className="input code"
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="ins-2026w37-01"
                  value={instructionId}
                  onChange={(event) => setInstructionId(event.target.value)}
                />
              </div>
              <button
                type="button"
                className="btn"
                onClick={() => {
                  void load(instructionId);
                }}
              >
                Ver el guion
              </button>
            </div>

            {script.status === "loading" ? (
              <LoadingBlock label="Cargando el guion" rows={2} />
            ) : null}

            {script.status === "failed" ? (
              <ErrorBlock
                title="No se pudo traer el guion"
                message={script.message}
                onRetry={() => {
                  void load(instructionId);
                }}
              />
            ) : null}

            {script.status === "ready" ? (
              <Script script={script.script} configured={script.configured} />
            ) : null}

            {script.status === "idle" ? (
              <p className="subtle t-sm">
                Escribe el folio de la instruccion, o entra desde la corrida de
                pagos para que llegue solo.
              </p>
            ) : null}
          </section>

          <section
            aria-labelledby="browser-heading"
            className="panel flex flex-col gap-4 p-5"
          >
            <h2 id="browser-heading" className="t-lg">
              Hablar con el agente desde esta computadora
            </h2>
            <p className="muted t-sm">
              Es el mismo agente que marca por telefono. Sirve cuando la
              telefonia no funciona en la sede: se pone el altavoz junto al
              telefono del proveedor, o se prueba el guion antes de marcar. Pide
              permiso del microfono y carga un componente de ElevenLabs desde su
              CDN, por eso se carga solo cuando lo pides.
            </p>

            <div className="flex flex-wrap items-end gap-3">
              <div className="grow">
                <label className="label" htmlFor="call-agent">
                  Agente
                </label>
                <input
                  id="call-agent"
                  className="input code"
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="agent-..."
                  value={agentId}
                  onChange={(event) => setAgentId(event.target.value)}
                />
              </div>
              <button
                type="button"
                className="btn btn-accent"
                aria-busy={widget === "loading"}
                disabled={widget === "loading" || agentId.trim() === ""}
                onClick={() => {
                  void startWidget();
                }}
              >
                {widget === "ready"
                  ? "Reiniciar el agente"
                  : "Activar el agente"}
              </button>
            </div>

            {widget === "failed" ? (
              <ErrorBlock
                title="No se pudo cargar el agente en el navegador"
                message="Revisa el id del agente y la conexion. Si sigue fallando, marca por telefono y usa el guion de arriba."
              />
            ) : null}

            {/* The widget mounts itself in here. */}
            <div ref={widgetSlot} />
          </section>
        </div>

        <section
          aria-labelledby="outcome-heading"
          className="panel flex h-fit flex-col gap-4 p-5"
        >
          <h2 id="outcome-heading" className="t-lg">
            Registrar lo que contesto
          </h2>
          <p className="subtle t-xs">
            Queda como evento verification_call en la bitacora, con la frase que
            escuchaste. No libera el pago: eso se decide en la instruccion, con
            nombre.
          </p>

          <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
            <legend className="label">Resultado</legend>
            {OUTCOMES.map((option) => (
              <label
                key={option.value}
                className="flex items-start gap-2 t-sm"
                htmlFor={`outcome-${option.value}`}
              >
                <input
                  id={`outcome-${option.value}`}
                  type="radio"
                  name="verification-outcome"
                  value={option.value}
                  checked={outcome === option.value}
                  onChange={() => setOutcome(option.value)}
                />
                {option.label}
              </label>
            ))}
          </fieldset>

          <div>
            <label className="label" htmlFor="call-heard">
              Frase que escuchaste
            </label>
            <textarea
              id="call-heard"
              className="textarea"
              rows={3}
              placeholder="No, esa cuenta no es nuestra."
              value={heard}
              onChange={(event) => setHeard(event.target.value)}
            />
          </div>

          <div>
            <label className="label" htmlFor="call-by">
              Quien llamo
            </label>
            <input
              id="call-by"
              className="input"
              autoComplete="off"
              placeholder="nombre o correo"
              value={recordedBy}
              onChange={(event) => setRecordedBy(event.target.value)}
            />
          </div>

          <button
            type="button"
            className="btn btn-accent btn-lg"
            aria-busy={record.status === "sending"}
            disabled={record.status === "sending"}
            onClick={() => {
              void submit();
            }}
          >
            {record.status === "sending" ? "Guardando" : "Guardar el resultado"}
          </button>

          {record.status === "failed" ? (
            <ErrorBlock title="No se guardo" message={record.message} />
          ) : null}

          {record.status === "done" ? (
            <p className="badge badge-release">
              Guardado. El pago sigue esperando una decision.
            </p>
          ) : null}
        </section>
      </div>
    </>
  );
}

function Script({
  script,
  configured,
}: {
  script: VerificationScriptText;
  configured: boolean;
}) {
  return (
    <div className="panel-sunken flex flex-col gap-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="eyebrow">Lo que se dice</span>
        <span
          className={configured ? "badge badge-release" : "badge badge-verify"}
        >
          {configured ? "Telefonia lista" : "Sin telefonia, marca a mano"}
        </span>
      </div>

      <ol className="m-0 flex list-decimal flex-col gap-2 pl-5">
        {script.spoken.map((line) => (
          <li key={line} className="t-sm">
            {line}
          </li>
        ))}
      </ol>

      <dl className="m-0 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Ultimos digitos que se dicen">
          <span className="code">{script.clabeLast4}</span>
        </Field>
        <Field label="Lo que nunca se dice">
          La CLABE completa, ni una promesa de pago
        </Field>
      </dl>
    </div>
  );
}
