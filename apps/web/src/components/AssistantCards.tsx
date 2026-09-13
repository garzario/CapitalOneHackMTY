/**
 * The four cards the assistant panel is made of, and the one button in the
 * product that turns a model's suggestion into a write.
 *
 * They are separate from the drawer because each one carries an argument of
 * ADR-0007 and the arguments are easier to check when they are not inside a chat
 * layout.
 *
 * - `ToolCallCard` renders a read. It says which read, what it was asked for and
 *   what came back, as the same evidence chips the finding panel renders, and it
 *   says "solo lectura" out loud because the whole list of tools is reads.
 * - `ProposalCard` is the button. Nothing here fires on mount, on hover, on a
 *   stream event or on a timer: the write happens in `onConfirm`, which exists
 *   only because somebody clicked. Above the button it prints the method, the path
 *   and the body of the ordinary endpoint that would run, so what is about to
 *   happen is stated in the words of the request itself, and it prints the role
 *   that click has to carry.
 * - `ExtractionCard` shows what was read off a dropped screenshot next to the
 *   facts about the file itself, which is what a clerk checks before she agrees to
 *   pay the digits in it.
 * - `InstructionCard` is where a confirmed intake ends: the level with the findings
 *   behind it and the state, derived by the two pure functions in
 *   `packages/core/src/levels.ts` and by nothing in this file.
 *
 * No component here prints a probability, a percentage, a score or the word
 * "seguro". `assistant.test.ts` reads these sources and fails when one appears.
 */

import type {
  ActionProposal,
  Actor,
  AssistantToolCall,
  ProposalValue,
} from "@hackmty/core";
import { assessConfidence, transactionStateOf } from "@hackmty/core";
import { useEffect, useState } from "react";
import {
  confirmProposal,
  needsReason,
  type ProposalOutcome,
  proposalHandoff,
  proposalRequest,
  roleAllows,
  toolResultChips,
} from "../lib/assistant";
import { offlineConfirm } from "../lib/assistant-mock";
import type {
  AssistantImage,
  InstructionDetail,
  VerificationState,
} from "../lib/contract";
import { formatClabe, formatDateTime, formatMoney } from "../lib/format";
import {
  ASSISTANT_TOOL_LABEL,
  CONFIDENCE_HELP,
  CONFIDENCE_RULE_LABEL,
  PROPOSAL_CONFIRM_LABEL,
  PROPOSAL_KIND_LABEL,
  SEAL_STATE_LABEL,
  VERIFICATION_HELP,
  VERIFICATION_LABEL,
} from "../lib/labels";
import type { DataMode } from "../lib/resource";
import { href, instructionPath, PATHS } from "../lib/router";
import { FindingPanel } from "./Findings";
import {
  Amount,
  ConfidenceBadge,
  DecisionBadge,
  SyntheticMark,
  TransactionStateBadge,
} from "./Primitives";
import { ErrorBlock } from "./States";

/* ------------------------------------------------------------------- reads */

export function ToolCallCard({
  call,
  pending,
}: {
  call: AssistantToolCall;
  /** True between `tool_call` and `tool_result`, where there is no answer yet. */
  pending?: boolean;
}) {
  const chips = toolResultChips(call.result);
  const args = Object.entries(call.arguments);

  return (
    <article className="panel-sunken flex flex-col gap-2 p-3">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <span className="eyebrow">{ASSISTANT_TOOL_LABEL[call.tool]}</span>
        <span className="badge badge-neutral">solo lectura</span>
      </header>

      {args.length > 0 ? (
        <p className="code subtle m-0 t-xs">
          {args.map(([key, value]) => `${key}: ${String(value)}`).join("  ")}
        </p>
      ) : null}

      {pending ? (
        <p className="muted m-0 t-xs" aria-busy="true">
          Leyendo.
        </p>
      ) : null}

      {call.error !== undefined ? (
        <p className="m-0 t-xs" style={{ color: "var(--c-hold-ink)" }}>
          {call.error}
        </p>
      ) : null}

      {chips.length > 0 ? (
        <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
          {chips.map((chip) => (
            <li key={chip.key}>
              <span className="chip">
                <span className="chip-key">{chip.label}</span>
                <span className="chip-value">{chip.value}</span>
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </article>
  );
}

/* --------------------------------------------------------------- proposals */

type ConfirmState =
  | { status: "idle" }
  | { status: "sending" }
  | { status: "done"; outcome: ProposalOutcome }
  | { status: "offline"; outcome: ReturnType<typeof offlineConfirm> }
  | { status: "failed"; message: string };

/** The body of the request, printed as the endpoint would receive it. */
function PayloadList({ body }: { body: Record<string, ProposalValue> | null }) {
  const entries = body === null ? [] : Object.entries(body);

  if (entries.length === 0) {
    return (
      <p className="subtle m-0 t-xs">
        Sin cuerpo: el endpoint ya sabe de que instruccion se trata.
      </p>
    );
  }

  return (
    <dl className="m-0 grid grid-cols-1 gap-1">
      {entries.map(([key, value]) => (
        <div key={key} className="flex flex-wrap items-baseline gap-2">
          <dt className="code subtle t-xs">{key}</dt>
          <dd className="code m-0 t-xs">
            {key === "clabe" && typeof value === "string"
              ? formatClabe(value)
              : typeof value === "number"
                ? formatMoney(value)
                : String(value)}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function ProposalCard({
  proposal,
  actor,
  mode,
}: {
  proposal: ActionProposal;
  actor: Actor;
  /** `mock` never opens a connection, which is what `?data=mock` promises. */
  mode: DataMode;
}) {
  const [state, setState] = useState<ConfirmState>({ status: "idle" });
  const [reason, setReason] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [dismissed, setDismissed] = useState(false);

  const needsOwner = !roleAllows(proposal, actor);
  const signer: Actor = needsOwner
    ? { name: ownerName.trim(), role: "owner" }
    : actor;
  const request = proposalRequest(proposal, signer, reason);
  const handoff = proposalHandoff(proposal);
  const reasonRequired = needsReason(proposal);
  const ready =
    (!needsOwner || signer.name.length > 1) &&
    (!reasonRequired || reason.trim().length > 3);

  const onConfirm = async () => {
    if (mode === "mock") {
      setState({ status: "offline", outcome: offlineConfirm(proposal) });

      return;
    }

    setState({ status: "sending" });

    const result = await confirmProposal(proposal, signer, { reason });

    setState(
      result.ok
        ? { status: "done", outcome: result.data }
        : { status: "failed", message: result.error.message },
    );
  };

  return (
    <article
      className="panel flex flex-col gap-3 p-4"
      aria-label="Propuesta del asistente"
    >
      <header className="flex flex-wrap items-center justify-between gap-2">
        <span className="eyebrow">{PROPOSAL_KIND_LABEL[proposal.kind]}</span>
        <span className="badge badge-neutral">
          {proposal.requiresRole === "owner"
            ? "la autoriza el dueno"
            : "la confirma la capturista"}
        </span>
      </header>

      <p className="m-0 t-base">{proposal.summary}</p>

      {request !== null ? (
        <div className="panel-sunken flex flex-col gap-2 p-3">
          <span className="eyebrow">Lo que se enviaria</span>
          <p className="code m-0 t-xs">
            {request.method} {request.path}
          </p>
          <PayloadList body={request.body} />
          <p className="subtle m-0 t-xs">
            Se firma como {signer.name === "" ? "nadie todavia" : signer.name}
            {signer.name === ""
              ? ""
              : `, ${signer.role === "owner" ? "dueno" : "capturista"}`}
            . Nada sale hasta que presiones el boton.
          </p>
        </div>
      ) : null}

      {needsOwner ? (
        <div>
          <label className="label" htmlFor={`owner-${proposal.kind}`}>
            Nombre de quien autoriza la excepcion
          </label>
          <input
            id={`owner-${proposal.kind}`}
            className="input"
            autoComplete="off"
            placeholder="Nombre y apellido"
            value={ownerName}
            onChange={(event) => setOwnerName(event.target.value)}
          />
          <p className="subtle t-xs">
            Esta liberacion la aprueba el dueno, no la capturista. El nombre
            queda en el evento del ledger.
          </p>
        </div>
      ) : null}

      {reasonRequired ? (
        <div>
          <label className="label" htmlFor={`reason-${proposal.kind}`}>
            Por que se libera
          </label>
          <textarea
            id={`reason-${proposal.kind}`}
            className="textarea"
            placeholder="El motivo queda escrito en el evento, con el nombre de quien lo autoriza."
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
        </div>
      ) : null}

      {state.status === "idle" && !dismissed ? (
        <div className="flex flex-wrap gap-2">
          {handoff ? (
            <a className="btn btn-accent" href={href(PATHS.run)}>
              {PROPOSAL_CONFIRM_LABEL[proposal.kind]}
            </a>
          ) : (
            <button
              type="button"
              className="btn btn-accent"
              disabled={!ready}
              onClick={() => {
                void onConfirm();
              }}
            >
              {PROPOSAL_CONFIRM_LABEL[proposal.kind]}
            </button>
          )}
          <button
            type="button"
            className="btn"
            onClick={() => setDismissed(true)}
          >
            No por ahora
          </button>
        </div>
      ) : null}

      {handoff ? (
        <p className="subtle m-0 t-xs">
          La corrida sale desde su propia pantalla, donde se ve linea por linea
          lo que el riel acepto. Este panel no la envia.
        </p>
      ) : null}

      {dismissed && state.status === "idle" ? (
        <p className="muted m-0 t-xs">
          Propuesta descartada. Nada se escribio.
        </p>
      ) : null}

      {state.status === "sending" ? (
        <p role="status" className="muted m-0 t-sm" aria-busy="true">
          Ejecutando la accion con tu nombre.
        </p>
      ) : null}

      {state.status === "failed" ? (
        <div className="panel-sunken">
          <ErrorBlock
            title="No se ejecuto"
            message={state.message}
            onRetry={() => setState({ status: "idle" })}
          />
        </div>
      ) : null}

      {state.status === "done" ? (
        <OutcomeBlock outcome={state.outcome} />
      ) : null}

      {state.status === "offline" ? (
        <div className="flex flex-col gap-3">
          <p role="status" className="panel-sunken muted m-0 px-3 py-2 t-xs">
            Modo sin conexion: no salio ninguna peticion del navegador. Esto es
            lo que responde el endpoint sobre la corrida sintetica.
          </p>
          {state.outcome.kind === "intake" ? (
            <InstructionCard detail={state.outcome.detail} />
          ) : null}
          {state.outcome.kind === "verify_account" ? (
            <VerificationCard verification={state.outcome.verification} />
          ) : null}
          {state.outcome.kind === "none" ? (
            <p className="muted m-0 t-xs">
              Esta accion necesita la API: sin ella no hay nada honesto que
              mostrar.
            </p>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

function OutcomeBlock({ outcome }: { outcome: ProposalOutcome }) {
  switch (outcome.kind) {
    case "verify_account":
      return <VerificationCard verification={outcome.verification} />;
    case "verify_call":
      return (
        <div className="panel-sunken flex flex-col gap-2 p-3">
          <span className="eyebrow">Llamada de verificacion</span>
          <p className="m-0 t-sm">
            {outcome.call.status === "calling"
              ? "El telefono esta sonando. La llamada no libera el pago."
              : "La llamada quedo registrada. No libera el pago."}
          </p>
          <a className="btn btn-sm" href={href(PATHS.verifyCall)}>
            Ver la llamada
          </a>
        </div>
      );
    case "decide":
      return (
        <div className="panel-sunken flex flex-col gap-2 p-3">
          <span className="eyebrow">Decision registrada</span>
          <div className="flex flex-wrap items-center gap-2">
            <DecisionBadge action={outcome.detail.decision.action} />
            <span className="muted t-xs">
              firmada por {outcome.detail.decision.decidedBy ?? "sin nombre"}
            </span>
          </div>
          <a
            className="btn btn-sm"
            href={href(instructionPath(outcome.detail.instruction.id))}
          >
            Abrir la instruccion
          </a>
        </div>
      );
    case "intake":
      return <InstructionCard detail={outcome.detail} />;
  }
}

/* ------------------------------------------------------------ verification */

export function VerificationCard({
  verification,
}: {
  verification: VerificationState;
}) {
  return (
    <div className="panel-sunken flex flex-col gap-2 p-3">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <span className="eyebrow">Verificacion de la cuenta</span>
        <span className="badge badge-neutral">
          {VERIFICATION_LABEL[verification.state]}
        </span>
      </header>
      <p className="muted m-0 t-xs">{VERIFICATION_HELP[verification.state]}</p>
      {verification.claveRastreo !== null ? (
        <p className="code m-0 t-xs">
          Clave de rastreo {verification.claveRastreo}
        </p>
      ) : null}
      {verification.holderName !== null ? (
        <p className="m-0 t-xs">
          Titular segun el CEP: {verification.holderName}
        </p>
      ) : null}
      {verification.sealState !== null ? (
        <p className="subtle m-0 t-xs">
          {SEAL_STATE_LABEL[verification.sealState]}
        </p>
      ) : null}
      <a className="btn btn-sm" href={href(PATHS.cep)}>
        Ver el CEP
      </a>
    </div>
  );
}

/* -------------------------------------------------------------- extraction */

/**
 * What came off the screenshot, beside what the browser knows about the file.
 *
 * The two halves are labelled apart on purpose. The file name, the media type and
 * the size are facts this browser reported. The digits are a transcription, which
 * is the only thing a model is allowed to do in this product, and a CLABE somebody
 * typed always wins over one that was read: `docs/06-regulatory-privacy.md` section
 * 6.2.1 and ADR-0004. No reading confidence is printed as a number, because a
 * score on a screen is the thing ADR-0009 forbids outright.
 */
export function ExtractionCard({
  images,
  fields,
}: {
  images: readonly AssistantImage[];
  fields: Record<string, ProposalValue>;
}) {
  const entries = Object.entries(fields);

  return (
    <article className="panel-sunken flex flex-col gap-3 p-3">
      <span className="eyebrow">Lo que trae la captura</span>

      {images.length > 0 ? (
        <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
          {images.map((image) => (
            <li key={`${image.name}-${image.bytes}`}>
              <ImageThumb image={image} />
            </li>
          ))}
        </ul>
      ) : null}

      {entries.length > 0 ? (
        <dl className="m-0 grid grid-cols-1 gap-1">
          {entries.map(([key, value]) => (
            <div key={key} className="flex flex-wrap items-baseline gap-2">
              <dt className="subtle t-xs">{key}</dt>
              <dd className="code m-0 t-xs">
                {key === "clabe" && typeof value === "string"
                  ? formatClabe(value)
                  : typeof value === "number"
                    ? formatMoney(value)
                    : String(value)}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}

      <p className="subtle m-0 t-xs">
        Los digitos son una transcripcion de la imagen. Una CLABE escrita a mano
        siempre gana sobre una leida, y el digito verificador se revisa igual.
      </p>
    </article>
  );
}

/** A thumbnail of a local file, with the object URL released on unmount. */
export function ImageThumb({ image }: { image: AssistantImage }) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    const created = URL.createObjectURL(image.file);
    setUrl(created);

    return () => {
      URL.revokeObjectURL(created);
      setUrl(null);
    };
  }, [image.file]);

  return (
    <figure className="m-0 flex flex-col gap-1">
      {url === null ? null : (
        <img
          src={url}
          alt={`Captura adjunta ${image.name}`}
          style={{
            width: "6rem",
            height: "6rem",
            objectFit: "cover",
            border: "var(--border-width) solid var(--c-border)",
            borderRadius: "var(--radius-sm)",
          }}
        />
      )}
      <figcaption className="subtle t-xs" style={{ maxWidth: "6rem" }}>
        {image.mediaType.replace("image/", "")} ·{" "}
        {Math.max(1, Math.round(image.bytes / 1024))} KB
      </figcaption>
    </figure>
  );
}

/* ------------------------------------------------------------- instruction */

/**
 * Where a confirmed intake ends: one line, its level and the findings under it.
 *
 * The level and the state are computed by `assessConfidence` and
 * `transactionStateOf` from `packages/core`, the same two functions the API, the
 * run screen and the generated mock call, so this card cannot disagree with the
 * line it is about. The rule that produced the level is printed next to it, and
 * every finding is rendered with its own evidence, because a level with nothing
 * under it is not something this product shows.
 */
export function InstructionCard({ detail }: { detail: InstructionDetail }) {
  const assessment = assessConfidence(detail.findings, detail.decision);
  const state = transactionStateOf({
    ...detail.decision,
    findings: detail.findings,
  });

  return (
    <section
      className="flex flex-col gap-3"
      aria-label="Instruccion dada de alta"
    >
      <div className="panel flex flex-col gap-3 p-4">
        <header className="flex flex-wrap items-start justify-between gap-2">
          <div className="flex flex-col gap-1">
            <span className="eyebrow">{detail.supplier.legalName}</span>
            <span className="code subtle t-xs">{detail.instruction.id}</span>
          </div>
          <SyntheticMark when={detail.instruction.synthetic} />
        </header>

        <div className="flex flex-wrap items-center gap-2">
          <ConfidenceBadge level={assessment.level} />
          <TransactionStateBadge state={state} />
          <DecisionBadge action={detail.decision.action} />
        </div>

        <p className="muted m-0 t-xs">
          {CONFIDENCE_HELP[assessment.level]} El nivel sale de esta regla:{" "}
          {CONFIDENCE_RULE_LABEL[assessment.rule]}.
        </p>

        <div className="flex flex-wrap items-end justify-between gap-3">
          <Amount value={detail.instruction.amount} size="lg" />
          <span className="code t-xs">
            {formatClabe(detail.instruction.clabe)}
          </span>
        </div>

        <footer className="subtle t-xs">
          Recibida el {formatDateTime(detail.instruction.receivedAt)}
        </footer>
      </div>

      {detail.findings.map((finding) => (
        <FindingPanel
          key={finding.id}
          finding={finding}
          proposedClabe={detail.instruction.clabe}
        />
      ))}

      <a className="btn" href={href(instructionPath(detail.instruction.id))}>
        Abrir la linea completa
      </a>
    </section>
  );
}
