/**
 * The three decisions, as one control.
 *
 * ADR-0002 is explicit that the software never decides: it holds, asks for a
 * verification or lets the payment go, and a person confirms. So this is a
 * group of three buttons with the current decision pressed, not a traffic light
 * the clerk watches.
 */

import type {
  Action,
  Actor,
  ActorRole,
  Decision,
  Finding,
} from "@hackmty/core";
import {
  ACTOR_ROLE_LABEL,
  ACTOR_ROLES,
  decideRequirement,
  roleSatisfies,
} from "@hackmty/core";
import { type RefObject, useState } from "react";
import { currentActor, isActorName } from "../lib/actor";
import { ACTION_BUTTON, ACTION_HELP, ACTION_LABEL } from "../lib/labels";
import { Amount } from "./Primitives";

const ORDER: Action[] = ["hold", "verify", "release"];

/**
 * The role label as an option rather than as a clause.
 *
 * `ACTOR_ROLE_LABEL` in `@hackmty/core` is lower case because it is written into
 * sentences and printed on the constancia that way. A menu is not a sentence, so
 * the first letter is raised here rather than a second dictionary being kept in
 * step with the first one.
 */
function roleOption(role: ActorRole): string {
  const label = ACTOR_ROLE_LABEL[role];

  return `${label.slice(0, 1).toUpperCase()}${label.slice(1)}`;
}

type ActionBarProps = {
  /** The decision the engine proposes, or the one a person already confirmed. */
  current: Action;
  /** The action being written right now, so the row can show it is in flight. */
  pending?: Action | null;
  onDecide: (action: Action) => void;
  disabled?: boolean;
  /** Appended to each button's accessible name, for a row in a long table. */
  context?: string;
  compact?: boolean;
};

export function ActionBar({
  current,
  pending = null,
  onDecide,
  disabled = false,
  context,
  compact = false,
}: ActionBarProps) {
  return (
    /* A fieldset, so a screen reader announces the group before the three
       buttons. Compact lives in a table cell, where wrapping would make the row
       three lines tall and break the ledger rhythm. */
    <fieldset
      className={`m-0 min-w-0 border-0 p-0 ${compact ? "flex flex-nowrap gap-1" : "flex flex-wrap gap-2"}`}
    >
      <legend className="sr-only">
        {context ? `Decision de ${context}` : "Decision"}
      </legend>
      {ORDER.map((action) => {
        const isCurrent = current === action;
        const isPending = pending === action;

        return (
          <button
            key={action}
            type="button"
            aria-pressed={isCurrent}
            aria-busy={isPending}
            aria-label={
              context ? `${ACTION_LABEL[action]}: ${context}` : undefined
            }
            title={ACTION_HELP[action]}
            disabled={disabled || pending !== null}
            onClick={() => onDecide(action)}
            className={`${ACTION_BUTTON[action]} ${compact ? "btn-sm" : "btn-lg"}`}
          >
            {ACTION_LABEL[action]}
          </button>
        );
      })}
    </fieldset>
  );
}

/**
 * Going against the engine, with a name and an argument.
 *
 * Two of the objections the Capital One table raised are answered by this form,
 * and both are about the way out rather than about the control. A payment is
 * urgent and nobody answers the telephone: it is released, and released well,
 * with the name of whoever decides it, the reason written down, and the pesos at
 * risk on screen at that moment. A payment was let go and something turned up
 * afterwards: it is reopened the same way. A hold with no way out is a control
 * that gets bypassed outside the product, where nothing is recorded at all.
 *
 * The three rules it enforces, and the one it deliberately does not.
 *
 * **A person signs it, not a browser.** The name is typed and travels both in
 * `decidedBy` and on the `X-Actor` header, which the API compares: a decision
 * signed by one name under a header carrying another is a record nobody can rely
 * on later.
 *
 * **The owner approves an exception.** Releasing a payment that carries a
 * finding is the one thing docs/02-persona.md says the owner does, so the form
 * says so before anybody presses anything. Which role and whether prose is
 * required are not decided here: `decideRequirement` in `@hackmty/core` answers
 * both, and the API refuses on that same function with a `403` and a `422`. A
 * second copy of the rule in a component is how a screen comes to enable a button
 * the server will refuse.
 *
 * **The argument is asked for before the click, not after the refusal.** The API
 * answers `422` for an override with no reason, which is the right place for the
 * rule and the wrong place for the conversation: a clerk who finds out after
 * pressing the button has already decided. So the field is on the form and the
 * button stays disabled until it has something in it. An ordinary hold still
 * needs no prose, because an API that refused one would be refused by the clerk
 * instead, outside the product, where nothing is recorded at all.
 */
export function OverrideForm({
  id,
  nameRef,
  standing,
  findings,
  cancelled = false,
  amountAtRisk,
  expectedLoss,
  delayCostPerDay,
  pending,
  onSubmit,
}: {
  id: string;
  nameRef: RefObject<HTMLInputElement | null>;
  /** The decision standing right now, which is what makes a release an override. */
  standing: Pick<Decision, "action">;
  /** The findings against the line. The rule reads the level, never the count. */
  findings: readonly Finding[];
  /** True when the run already dropped this line, which makes any decision a reopening. */
  cancelled?: boolean;
  amountAtRisk: number;
  expectedLoss: number;
  delayCostPerDay: number;
  pending: Action | null;
  onSubmit: (action: Action, actor: Actor, reason: string) => void;
}) {
  /* Seeded from whoever this browser is acting as, because an override is still
     signed by a person who is already at the keyboard and retyping their own
     name is friction with no safety in it. The field stays editable: the owner
     who walks over to approve an exception is not the clerk the selector holds. */
  const signedIn = currentActor();
  const [name, setName] = useState(signedIn.name);
  const [role, setRole] = useState<ActorRole>(signedIn.role);
  const [reason, setReason] = useState("");

  const actor: Actor = { name: name.trim(), role };
  const isReopen = cancelled || standing.action === "release";
  const action: Action = isReopen ? "hold" : "release";

  /* The API's own rule, asked before the click rather than after the refusal.
     It reads the level rather than counting findings, which is the case that
     matters on screen every day: a supplier who was listed and cleared their
     name carries a row that stops nothing, and asking the owner to approve a
     payment nothing stands against is how a control becomes a formality. */
  const requirement = decideRequirement({
    action,
    findings,
    standing,
    cancelled,
  });
  const needsOwner = !roleSatisfies(role, requirement.requiresRole);
  const blocked =
    !isActorName(name) ||
    (requirement.requiresReason && reason.trim().length === 0) ||
    needsOwner;

  return (
    <section
      aria-labelledby={`${id}-heading`}
      className="panel flex flex-col gap-4 p-5"
    >
      <div className="flex flex-col gap-1">
        <h2 id={`${id}-heading`} className="eyebrow">
          {isReopen
            ? "Reabrir bajo responsabilidad"
            : "Liberar bajo responsabilidad"}
        </h2>
        <p className="muted m-0 max-w-prose t-sm">
          {isReopen
            ? "Este pago esta liberado. Reabrirlo lo vuelve a detener con un nombre y una razon escrita, y queda en la bitacora igual que la liberacion."
            : "Hay una salida y esta dentro del producto. Sale con el nombre de quien lo decide y la razon escrita, y queda como un evento en una bitacora que solo crece."}
        </p>
      </div>

      {/* The three figures, at the moment of signing and not from memory. The
          pesos at risk is the largest single amount among the findings, which
          is what the API records next to the decision. */}
      <dl className="panel-sunken m-0 grid grid-cols-1 gap-4 p-4 sm:grid-cols-3">
        <div>
          <dt className="eyebrow">Pesos en riesgo</dt>
          <dd className="m-0 mt-1">
            <Amount value={amountAtRisk} size="lg" />
          </dd>
        </div>
        <div>
          <dt className="eyebrow">Perdida esperada</dt>
          <dd className="m-0 mt-1">
            <Amount value={expectedLoss} size="lg" />
          </dd>
        </div>
        <div>
          <dt className="eyebrow">Costo de un dia de retraso</dt>
          <dd className="m-0 mt-1">
            <Amount value={delayCostPerDay} size="lg" />
          </dd>
        </div>
      </dl>

      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (!blocked) {
            onSubmit(action, actor, reason.trim());
          }
        }}
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor={`${id}-name`}>
              Quien lo decide
            </label>
            <input
              id={`${id}-name`}
              ref={nameRef}
              className="input"
              autoComplete="off"
              placeholder="Nombre y apellido"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
            <p className="subtle t-xs">
              Viaja en la decision y en el encabezado X-Actor, y los dos tienen
              que decir lo mismo.
            </p>
          </div>
          <div>
            <label className="label" htmlFor={`${id}-role`}>
              Con que rol
            </label>
            <select
              id={`${id}-role`}
              className="input"
              value={role}
              onChange={(event) => setRole(event.target.value as ActorRole)}
            >
              {ACTOR_ROLES.map((option) => (
                <option key={option} value={option}>
                  {roleOption(option)}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="label" htmlFor={`${id}-reason`}>
            Por que
          </label>
          <textarea
            id={`${id}-reason`}
            className="textarea"
            placeholder="El proveedor confirmo la cuenta por el canal de siempre y la linea de produccion para el lunes."
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
          <p className="subtle t-xs">
            {requirement.requiresReason
              ? "La API rechaza esta excepcion sin una razon escrita. Se pide aqui, antes de apretar el boton, y no despues del rechazo."
              : "Esta frase es el valor de la entrada en la bitacora. Esta decision no la exige, y de todas formas se guarda si la escribes."}
          </p>
        </div>

        {needsOwner ? (
          <p role="status" className="panel-sunken muted m-0 px-4 py-2 t-sm">
            {requirement.rule === "reopen_cancelled"
              ? "La corrida ya dejo caer esta linea, asi que volver a abrirla es una excepcion y la firma el dueno. No es una cadena de aprobaciones: todo lo demas lo hace la capturista."
              : "Algo detiene este pago, asi que liberarlo es aprobar una excepcion y la firma el dueno. No es una cadena de aprobaciones: todo lo demas lo hace la capturista."}
          </p>
        ) : null}

        <button
          type="submit"
          className={`${ACTION_BUTTON[action]} btn-lg`}
          aria-busy={pending === action}
          disabled={blocked || pending !== null}
        >
          {isReopen ? "Reabrir y retener" : "Liberar con mi nombre"}
        </button>
      </form>
    </section>
  );
}
