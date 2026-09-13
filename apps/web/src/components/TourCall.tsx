/**
 * The last stop of the recorrido: the telephone rings the visitor as the owner of
 * the company.
 *
 * Everything before this stop is a screen. This one is the part of the product that
 * does not fit on a screen, because the person who decides a held payment in a
 * twenty-eight-employee company is not at a desk: he answers his telephone between
 * two other things, and what he needs is one sentence and one question. A visitor
 * who hears that call understands the product in a way no panel explains.
 *
 * What it does, and the order matters because three of the four are refusals.
 *
 * 1. One field that takes a telephone number in whatever shape it was written in,
 *    a line underneath saying which number is about to be dialled, and a box that
 *    has to be ticked. The number is sent in the body of one POST and nowhere
 *    else, and the API keeps a salted hash of it rather than the number.
 * 2. The call, as a strip that walks `Marcando`, `En llamada`, `Procesando`,
 *    `Termino`. It follows the ledger stream, which is how the rest of this app
 *    learns that anything happened, and asks `GET /tour/call/:id` every four
 *    seconds only while that stream is not open.
 * 3. The answer, as the same badge the run uses, with the sentence the outcome was
 *    read from quoted underneath. A `hold` and a `release` are both an ordinary
 *    decision with the owner's name on it, and the two answers that are the
 *    telephone rather than the owner leave the line exactly where it was.
 * 4. With no telephony -- `?data=mock`, or a server with `ALLOW_TOUR_CALLS` off, or
 *    one with no voice configured -- the script is printed and the two answers can
 *    be simulated. The result card then says `simulado` on it, because a simulated
 *    answer that looks like a real one is the one thing this stop must not do.
 *
 * The button is dead only while there are fewer than eight digits or the box is
 * unticked, and both of those say so on screen next to the control they are
 * about. It used to be dead until the field held exactly ten digits after a
 * normaliser that deleted whatever did not fit, so a number typed with its
 * country code silently became a different number or dropped back under ten, and
 * a press produced no request and no sentence: the click went nowhere and the
 * screen said nothing about why.
 *
 * The actor is passed explicitly and is the owner, while the browser keeps acting as
 * whoever the entry screen selected. That is the point of the stop rather than a
 * shortcut: the visitor answers as the owner for one call, and the selector on
 * `#/entrada` is untouched by it.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  type ApiFailure,
  getTourCall,
  startTourCall,
  tourScriptFromFailure,
  useEvents,
} from "../lib/api";
import type {
  TourCallScript,
  TourCallStatus,
  TourConfig,
  TourOwnerOutcome,
} from "../lib/contract";
import { dataMode, reachesApi } from "../lib/resource";
import {
  CALL_BUSY,
  CALL_BUTTON,
  CONSENT_TEXT,
  callBody,
  callProblem,
  dialNote,
  isPhoneComplete,
  LOCAL_SCRIPT_NOTE,
  localScript,
  OUTCOME_SENTENCE,
  outcomeState,
  phoneProblem,
  revertSentence,
  SIMULATED_EVIDENCE,
  stateFromEvent,
  TOUR_CALL_STATUS_LABEL,
  TOUR_CALL_STATUS_ORDER,
} from "../lib/tour-call";
import { TransactionStateBadge } from "./Primitives";

/** How often to ask where the call is, and only while the stream is not open. */
const POLL_MS = 4000;

/** Who the visitor is for one call. Never written to the stored identity. */
const OWNER = { role: "owner", name: "Visitante" } as const;

type Result = {
  outcome: TourOwnerOutcome;
  evidence: string;
  /** True when nothing rang: the two buttons under the script. */
  simulated: boolean;
};

export function TourCall({ config }: { config: TourConfig }) {
  const mode = dataMode();
  const online = reachesApi(mode);
  const canCall = config.callsEnabled && online;

  /* Exactly what was typed, kept exactly as it was typed. The field used to hold
     ten digits and redraw itself out of them, which is what ate the country code
     of a pasted number in front of the person who pasted it. */
  const [phone, setPhone] = useState("");
  const [consent, setConsent] = useState(false);
  const [touched, setTouched] = useState(false);
  const [sending, setSending] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [status, setStatus] = useState<TourCallStatus | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  /* The words the agent reads. The API's own script when it answered with one,
     including in its 422, and the offline stand-in otherwise. Which of the two
     is on screen is state as well, because the card says the words are the
     owner's and only one of them is: the stand-in is qualified and the API's
     script is not. */
  const [script, setScript] = useState<TourCallScript>(() =>
    localScript(config.hero),
  );
  const [scriptFromApi, setScriptFromApi] = useState(false);
  const [revertMs, setRevertMs] = useState(config.revertAfterMs);

  const settled = result !== null || status === "failed";

  /* The ledger stream is how every other screen of this app learns that something
     happened, so it is how this one learns too. Held closed under `?data=mock`,
     where the page promises that no request leaves the browser, and closed again
     once the answer is in: a card that is finished has nothing left to listen
     for. */
  const watching = conversationId !== null && !settled;

  const stream = useEvents({
    enabled: online && watching,
    onEvent: (event) => {
      if (conversationId === null) {
        return;
      }

      const next = stateFromEvent(event, conversationId);

      if (next === null) {
        return;
      }

      setStatus(next.status);
      setResult({
        outcome: next.ownerOutcome ?? "unclear",
        evidence: next.evidence ?? "",
        simulated: false,
      });
    },
  });

  /* The fallback, and only a fallback: four seconds while the stream is not open,
     and nothing at all while it is. A call that ended is never asked about again. */
  const polling = watching && online && stream.status !== "open";
  const pollTimer = useRef<number | null>(null);

  useEffect(() => {
    if (!polling || conversationId === null) {
      return;
    }

    let cancelled = false;

    const ask = () => {
      void getTourCall(conversationId).then((answer) => {
        if (cancelled || !answer.ok) {
          return;
        }

        setStatus(answer.data.status);

        if (answer.data.ownerOutcome !== undefined) {
          setResult({
            outcome: answer.data.ownerOutcome,
            evidence: answer.data.evidence ?? "",
            simulated: false,
          });
        }
      });
    };

    pollTimer.current = window.setInterval(ask, POLL_MS);

    return () => {
      cancelled = true;

      if (pollTimer.current !== null) {
        window.clearInterval(pollTimer.current);
        pollTimer.current = null;
      }
    };
  }, [polling, conversationId]);

  const complete = isPhoneComplete(phone);
  const phoneFault = touched ? phoneProblem(phone) : null;
  /* Which telephone this is about to ring, spelled out before anybody presses
     anything. It is the field's own answer to a normalisation that used to be
     invisible until the call was already placed. */
  const dial = complete ? dialNote(phone) : "";

  const call = useCallback(async () => {
    setProblem(null);
    setSending(true);

    const answer = await startTourCall(callBody(phone), OWNER);

    setSending(false);

    if (answer.ok) {
      setConversationId(answer.data.conversationId);
      setStatus("initiated");
      setScript(answer.data.script);
      setScriptFromApi(true);
      setRevertMs(answer.data.revertAfterMs);

      return;
    }

    /* A 422 from a deployment with no voice carries the script, exactly like the
       verification call does, so the stop still has the words to show. */
    const failure = answer.error as ApiFailure;
    const fallback = tourScriptFromFailure(failure);

    if (fallback !== null) {
      setScript(fallback);
      setScriptFromApi(true);
    }

    setProblem(callProblem(failure));
  }, [phone]);

  const simulate = useCallback((outcome: TourOwnerOutcome) => {
    setStatus("done");
    setResult({
      outcome,
      evidence: SIMULATED_EVIDENCE[outcome],
      simulated: true,
    });
  }, []);

  return (
    <div className="tour-call">
      {result === null ? (
        <>
          <div className="tour-field">
            <label className="label" htmlFor="tour-phone">
              Tu celular
            </label>
            <input
              id="tour-phone"
              className="input"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              /* The example is a Monterrey mobile because that is where the
                 company is, and it is only an example: the field takes a number
                 from anywhere, with or without a country code. */
              placeholder="81 1234 5678"
              aria-describedby="tour-phone-help"
              value={phone}
              onChange={(event) => {
                setTouched(true);
                setPhone(event.target.value);
              }}
            />
            {/* What is missing while something is, and which telephone is about
                to ring as soon as nothing is. */}
            <p id="tour-phone-help" className="subtle m-0 t-xs">
              {phoneFault ?? dial}
            </p>
          </div>

          <label className="tour-consent t-xs" htmlFor="tour-consent">
            <input
              id="tour-consent"
              type="checkbox"
              checked={consent}
              onChange={(event) => setConsent(event.target.checked)}
            />
            <span className="muted">{CONSENT_TEXT}</span>
          </label>

          {canCall ? (
            <>
              <button
                type="button"
                className="btn btn-accent btn-lg"
                aria-busy={sending}
                disabled={sending || !complete || !consent}
                onClick={() => {
                  void call();
                }}
              >
                {sending ? CALL_BUSY : CALL_BUTTON}
              </button>

              {/* A disabled button explains itself, because a press that does
                  nothing and says nothing is the failure this stop shipped
                  with: the box is below the field and nothing on screen tied
                  it to the control it was holding shut. */}
              {!consent && complete ? (
                <p className="subtle m-0 t-xs">
                  Marca la casilla para poder llamarte.
                </p>
              ) : null}
            </>
          ) : (
            <p className="panel-sunken muted m-0 p-3 t-xs">
              {mode === "mock"
                ? "Modo sin conexion: no sale ninguna peticion del navegador, asi que nadie marca. Abajo esta el guion y las dos respuestas se pueden simular."
                : "Este servidor tiene las llamadas del recorrido apagadas. Abajo esta el guion y las dos respuestas se pueden simular."}
            </p>
          )}

          {problem !== null ? (
            <p role="status" className="panel-sunken muted m-0 p-3 t-xs">
              {problem}
            </p>
          ) : null}
        </>
      ) : null}

      {/* The strip: where this one call has got to, in the provider's own four
          words. A call that failed is not a fifth step of it, so the strip comes
          off and the sentence underneath says what happened to the payment. */}
      {status !== null && status !== "failed" && result === null ? (
        <div aria-live="polite" className="tour-strip">
          {TOUR_CALL_STATUS_ORDER.map((name) => (
            <span
              key={name}
              className="tour-strip-step"
              data-on={
                TOUR_CALL_STATUS_ORDER.indexOf(name) <=
                TOUR_CALL_STATUS_ORDER.indexOf(status)
                  ? "true"
                  : "false"
              }
            >
              {TOUR_CALL_STATUS_LABEL[name]}
            </span>
          ))}
        </div>
      ) : null}

      {status === "failed" && result === null ? (
        <p role="status" className="panel-sunken muted m-0 p-3 t-xs">
          {TOUR_CALL_STATUS_LABEL.failed}. El pago sigue detenido, que es donde
          estaba.
        </p>
      ) : null}

      {result !== null ? (
        <div className="tour-result">
          <div className="tour-result-head">
            <TransactionStateBadge state={outcomeState(result.outcome)} />
            {result.simulated ? (
              <span className="badge badge-neutral">simulado</span>
            ) : null}
          </div>

          <p className="m-0 t-sm">{OUTCOME_SENTENCE[result.outcome]}</p>

          {result.evidence !== "" ? (
            <q className="muted t-sm">{result.evidence}</q>
          ) : null}

          <p className="subtle m-0 t-xs">
            {result.simulated
              ? "Simulado en el navegador: nada se escribio en la bitacora."
              : `Quedo en la bitacora a nombre del dueno. ${revertSentence(revertMs)}`}
          </p>
        </div>
      ) : null}

      {/* The words, always available and never behind the call: a visitor who
          does not want to give a telephone number still gets to read what the
          owner would hear. It opens itself where nothing can ring, because there
          the script is the stop rather than a footnote to it. */}
      <details className="tour-script" open={!canCall}>
        <summary className="t-xs">El guion que escucha el dueno</summary>

        {/* The stand-in is close to the call and is not the call, and a card
            that promised otherwise would be claiming what it cannot check. The
            line goes once the API sends its own script. */}
        {scriptFromApi ? null : (
          <p className="subtle m-0 t-xs">{LOCAL_SCRIPT_NOTE}</p>
        )}

        <p className="muted m-0 t-xs">{script.firstMessage}</p>

        <ol className="tour-script-list">
          {script.spoken.map((line) => (
            <li key={line} className="subtle t-xs">
              {line}
            </li>
          ))}
        </ol>

        <p className="m-0 t-xs">{script.question}</p>

        {!canCall && result === null ? (
          <div className="tour-simulate">
            <span className="eyebrow">Simular respuesta</span>
            <button
              type="button"
              className="btn btn-hold btn-sm"
              onClick={() => simulate("hold")}
            >
              Retener
            </button>
            <button
              type="button"
              className="btn btn-release btn-sm"
              onClick={() => simulate("release")}
            >
              Liberar
            </button>
          </div>
        ) : null}
      </details>
    </div>
  );
}
