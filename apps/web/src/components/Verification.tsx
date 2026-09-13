/**
 * The one-cent verification, on screen.
 *
 * The beat is the product's strongest claim and the easiest one to overstate, so
 * the panel is built around three rules.
 *
 * 1. **One click, no typing.** The button sends the cent through the rail; the
 *    clave de rastreo comes back from the rail and is shown, not entered. From
 *    there the screen follows `GET /verification` and re-reads on any ledger
 *    event that names this instruction, so the states arrive on their own.
 * 2. **The cent is ours and the CEP is Banxico's.** The rail is named on screen
 *    ("espejo Nessie" in the demo) next to the seal, because a judge is owed the
 *    difference between the outflow we recorded and the document the central
 *    bank signed.
 * 3. **Never a claim we did not earn.** The seal reads exactly as the API
 *    reported it, and `sealVerdictOf` in `lib/verification.ts` is the only place
 *    that maps it, so "no verificado" can never drift into "valido". Offline the
 *    panel advances the first two beats and stops: a browser with no API holds
 *    no signed document, and inventing one would fabricate the evidence the
 *    whole control rests on.
 */

import { motion, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useState } from "react";
import { getVerification, useEvents, verifyAccount } from "../lib/api";
import type { NameMatch, VerificationState } from "../lib/contract";
import { formatDateTime } from "../lib/format";
import {
  ACTION_BADGE,
  ACTION_LABEL,
  NAME_MATCH_BADGE,
  NAME_MATCH_LABEL,
  RAIL_LABEL,
  VERIFICATION_BADGE,
  VERIFICATION_HELP,
  VERIFICATION_LABEL,
} from "../lib/labels";
import { EXAMPLE_INSTRUCTION_ID, mockVerification } from "../lib/mock";
import { useResource } from "../lib/resource";
import {
  advanceMockVerification,
  eventNamesInstruction,
  isInFlight,
  isSettled,
  notStartedVerification,
  sealVerdictOf,
  storedCepAt,
  type VerificationFailure,
  verificationFailure,
} from "../lib/verification";
import { Amount, Field } from "./Primitives";
import { ErrorBlock, LoadingBlock, SourceNotice } from "./States";

/** The amount the probe moves, fixed by the product and never a field. */
const CENT = 0.01;

/**
 * While the cent is out, the screen looks again on its own.
 *
 * The ledger stream is the designed path and this is the belt: SSE dies on a
 * proxy that buffers, and the failure mode without a fallback is a panel frozen
 * on "centavo enviado" through the whole demo. Bounded on purpose, because a
 * page that polls forever is a page nobody notices is broken.
 */
const POLL_MS = 2500;
const POLL_ATTEMPTS = 8;

export function VerifyAccountPanel({
  instructionId: fromLink,
  onCepStored,
}: {
  /** Prefilled from `?instruction=`, so the instruction detail is one click away. */
  instructionId: string;
  /**
   * Called once a signed CEP has landed for the instruction on screen.
   *
   * The registry of verified beneficiaries is a sibling resource on the same
   * screen, and storing the CEP is exactly what writes a row into it. Without
   * this the panel would show a released payment next to a registry still
   * reading "registro vacio" until somebody reloaded the page, which is the one
   * reading of that panel that is false. Must be stable across renders.
   */
  onCepStored?: () => void;
}) {
  const [typed, setTyped] = useState(fromLink);
  /* The id the panel is following, which only changes on submit. The input
     alone must not start a request on every keystroke. */
  const [selected, setSelected] = useState(fromLink);
  const [sending, setSending] = useState(false);
  const [failure, setFailure] = useState<VerificationFailure | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const reduceMotion = useReducedMotion();

  const load = useCallback(
    (signal: AbortSignal) => getVerification(selected, { signal }),
    [selected],
  );
  const fallback = useCallback(() => mockVerification(selected), [selected]);
  const { resource, reload, replace } = useResource(load, {
    fallback,
    enabled: selected !== "",
  });

  const state = resource.status === "ready" ? resource.data : null;
  const source = resource.status === "ready" ? resource.source : null;

  /* In place, not through the loading state: the card is what a judge is
     watching, and a skeleton every two seconds reads as a page that is broken
     rather than one that is waiting. */
  const refresh = useCallback(async () => {
    if (selected === "") {
      return;
    }

    const result = await getVerification(selected);

    if (result.ok) {
      replace(result.data);
    }
  }, [selected, replace]);

  const onLedgerEvent = useCallback(
    (event: unknown) => {
      if (
        eventNamesInstruction(event, {
          instructionId: selected,
          claveRastreo: state?.claveRastreo ?? null,
        })
      ) {
        void refresh();
      }
    },
    [refresh, selected, state?.claveRastreo],
  );

  useEvents({
    enabled: selected !== "" && source === "api",
    onEvent: onLedgerEvent,
  });

  const waiting = state !== null && source === "api" && isInFlight(state.state);

  /* The instant the CEP was stored, or null. `storedCepAt` is the rule and it is
     in lib because it is a decision rather than a rendering: keyed on the instant,
     it fires once per document and never again as the machine walks on to
     released or blocked, and never at all for the offline run. */
  const storedAt = storedCepAt(state, source);

  useEffect(() => {
    if (storedAt !== null) {
      onCepStored?.();
    }
  }, [storedAt, onCepStored]);

  useEffect(() => {
    if (!waiting) {
      return;
    }

    let attempts = 0;
    const timer = window.setInterval(() => {
      attempts += 1;

      if (attempts > POLL_ATTEMPTS) {
        window.clearInterval(timer);

        return;
      }

      void refresh();
    }, POLL_MS);

    return () => window.clearInterval(timer);
  }, [waiting, refresh]);

  const onSelect = useCallback(() => {
    setFailure(null);
    setNotice(null);
    setSelected(typed.trim());
  }, [typed]);

  const onVerify = useCallback(async () => {
    const id = selected;

    if (id === "") {
      setFailure({
        title: "Falta la instruccion",
        message:
          "Escribe el folio de la instruccion, o entra desde la corrida para que llegue solo.",
      });

      return;
    }

    setFailure(null);
    setNotice(null);

    /* The same refusal the API answers with a 409, said before the request:
       a settled payment is not verified again and the cent is not sent twice. */
    if (state !== null && isSettled(state.state)) {
      setFailure(verificationFailure({ status: 409, message: "" }));

      return;
    }

    if (source === "mock") {
      const now = new Date().toISOString();
      const current = state ?? notStartedVerification(id, now);
      const next = advanceMockVerification(current, now);

      replace(next);
      setNotice(
        next === current
          ? "Sin API: este estado ya viene en la corrida sintetica. El paso que sigue necesita un CEP firmado por Banxico, y eso no se inventa en el navegador."
          : "Sin API: ningun centavo salio de un banco. Se avanza el estado en la corrida sintetica de este navegador.",
      );

      return;
    }

    setSending(true);
    const result = await verifyAccount(id);
    setSending(false);

    if (!result.ok) {
      setFailure(verificationFailure(result.error));

      return;
    }

    replace(result.data);
  }, [replace, selected, source, state]);

  /* The cent only goes out for the folio whose state is on screen. Typing a
     different one asks for its state first, which is one extra click and the
     one place in this app where a click moves money. */
  const ready = selected !== "" && typed.trim() === selected;

  return (
    <section
      aria-labelledby="verify-account-heading"
      className="panel flex flex-col gap-4 p-5"
    >
      <div className="flex flex-col gap-1">
        <h2 id="verify-account-heading" className="t-lg">
          Verificar la cuenta con un centavo
        </h2>
        <p className="muted max-w-prose t-sm">
          Un SPEI de un centavo viaja en la misma corrida que el pago grande. La
          salida se registra en el espejo Nessie de la cuenta de la empresa, el
          banco devuelve la clave de rastreo y el CEP lo firma Banxico. Con el
          CEP en la mano, el motor libera o bloquea el pago grande. Nadie
          escribe nada.
        </p>
      </div>

      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          onSelect();
        }}
      >
        <div className="grow">
          <label className="label" htmlFor="verify-account-instruction">
            Instruccion de pago
          </label>
          <input
            id="verify-account-instruction"
            className="input code"
            autoComplete="off"
            spellCheck={false}
            placeholder={EXAMPLE_INSTRUCTION_ID}
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
          />
        </div>
        <button type="submit" className="btn">
          Ver el estado
        </button>
      </form>

      {selected === "" ? (
        <p className="subtle t-sm">
          Escribe el folio de la instruccion, o entra desde la instruccion en la
          corrida de pagos para que llegue solo.
        </p>
      ) : null}

      {selected !== "" && resource.status === "loading" ? (
        <LoadingBlock label="Consultando la verificacion" rows={2} />
      ) : null}

      {selected !== "" && resource.status === "error" ? (
        <ErrorBlock
          title="No se pudo leer la verificacion"
          message={`${resource.message} Instruccion: ${selected}.`}
          onRetry={reload}
        />
      ) : null}

      {state !== null ? (
        <>
          <SourceNotice
            notice={resource.status === "ready" ? resource.notice : null}
          />
          <VerificationCard
            state={state}
            reduceMotion={reduceMotion === true}
          />
        </>
      ) : null}

      <button
        type="button"
        className="btn btn-accent btn-lg"
        aria-busy={sending}
        disabled={sending || !ready}
        onClick={() => {
          void onVerify();
        }}
      >
        {sending ? "Enviando el centavo" : "Verificar cuenta"}
      </button>

      {waiting ? (
        <p role="status" className="subtle t-xs">
          Esperando a que Banxico publique el CEP. La pantalla se actualiza sola
          con la bitacora.
        </p>
      ) : null}

      {notice ? (
        <p role="status" className="panel-sunken muted m-0 px-4 py-2 t-sm">
          {notice}
        </p>
      ) : null}

      {failure ? (
        <ErrorBlock title={failure.title} message={failure.message} />
      ) : null}
    </section>
  );
}

/** The colour of the state, from the same palette the decisions use. */
const STATE_DOT: Record<VerificationState["state"], string> = {
  not_started: "var(--c-ink-subtle)",
  cent_sent: "var(--c-verify)",
  awaiting_cep: "var(--c-verify)",
  cep_signed: "var(--c-accent)",
  released: "var(--c-release)",
  blocked: "var(--c-hold)",
};

/**
 * One state of the beat, with the evidence that got it there.
 *
 * Keyed on the state in the caller's markup, so a new state animates in with the
 * same entrance the alert rail uses and the change is visible from the back of
 * the room. `aria-live` is what makes the same change arrive for somebody who is
 * not looking at it.
 */
export function VerificationCard({
  state,
  reduceMotion,
}: {
  state: VerificationState;
  reduceMotion: boolean;
}) {
  const seal = state.sealState === null ? null : sealVerdictOf(state.sealState);

  return (
    <motion.div
      key={state.state}
      aria-live="polite"
      className="panel-sunken flex flex-col gap-4 p-4"
      initial={reduceMotion ? false : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: reduceMotion ? 0 : 0.22,
        ease: [0.2, 0.8, 0.2, 1],
      }}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className="status-dot"
            style={{ backgroundColor: STATE_DOT[state.state] }}
          />
          <span className="eyebrow">Verificacion de la cuenta</span>
        </span>
        <span className={VERIFICATION_BADGE[state.state]}>
          {VERIFICATION_LABEL[state.state]}
        </span>
      </div>

      <p className="muted m-0 max-w-prose t-sm">
        {VERIFICATION_HELP[state.state]}
      </p>

      {state.claveRastreo === null && state.rail === null ? null : (
        <dl className="m-0 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {state.claveRastreo === null ? null : (
            <Field label="Clave de rastreo">
              <span className="code">{state.claveRastreo}</span>
              <span className="subtle block t-xs">
                La devuelve el riel. Nadie la escribe a mano.
              </span>
            </Field>
          )}
          {state.rail === null ? null : (
            <Field label="Por donde salio el centavo">
              {RAIL_LABEL[state.rail]}
              <span className="subtle block t-xs">
                El centavo, no el CEP: el CEP lo firma Banxico.
              </span>
            </Field>
          )}
          {state.centSentAt === null ? null : (
            <Field label="Centavo enviado">
              {formatDateTime(state.centSentAt)}
              <span className="subtle block t-xs">
                <Amount value={CENT} size="sm" /> en la misma corrida
              </span>
            </Field>
          )}
          {state.cepAt === null ? null : (
            <Field label="CEP recibido">{formatDateTime(state.cepAt)}</Field>
          )}
        </dl>
      )}

      {state.nameMatch === null ? null : (
        <NameComparison
          nameMatch={state.nameMatch}
          holder={state.holderName ?? "sin titular en el CEP"}
          legalName={state.legalName}
        />
      )}

      {seal === null ? null : (
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="eyebrow">Sello de Banxico</span>
            <span className={seal.badge}>{seal.label}</span>
          </div>
          <p className="panel-sunken muted m-0 p-3 t-xs">{seal.detail}</p>
        </div>
      )}

      {state.decision === null ? null : (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="flex flex-col">
            <span className="eyebrow">Decision del motor</span>
            <span className="subtle t-xs">
              La tomo el motor con la evidencia del CEP, no una persona.
            </span>
          </span>
          <span className="flex items-center gap-3">
            <span className={ACTION_BADGE[state.decision.action]}>
              {ACTION_LABEL[state.decision.action]}
            </span>
            {/* Labelled, because an unlabelled amount next to a decision reads
                as the payment and this one is the expected loss. */}
            <span className="flex flex-col items-end">
              <Amount value={state.decision.expectedLoss} size="sm" />
              <span className="subtle t-xs">perdida esperada</span>
            </span>
          </span>
        </div>
      )}
    </motion.div>
  );
}

/**
 * The holder Banxico reports next to the legal name on the CFDI.
 *
 * Shared by the CEP viewer and the verification panel, because the two are the
 * same comparison and a second copy of it would eventually word the same fact
 * two ways.
 */
export function NameComparison({
  nameMatch,
  holder,
  legalName,
}: {
  nameMatch: NameMatch;
  holder: string;
  legalName: string | null;
}) {
  return (
    <div className="panel-sunken flex flex-col gap-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="eyebrow">Comparacion de nombre</span>
        <span className={NAME_MATCH_BADGE[nameMatch]}>
          {NAME_MATCH_LABEL[nameMatch]}
        </span>
      </div>
      <dl className="m-0 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Titular en el CEP">{holder}</Field>
        <Field label="Razon social en el CFDI">
          {legalName ?? <span className="muted">no disponible</span>}
        </Field>
      </dl>
    </div>
  );
}
