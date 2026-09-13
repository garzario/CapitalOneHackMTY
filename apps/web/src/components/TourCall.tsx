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
 * What it does, in the order it is on screen, and it is one thing at a time.
 *
 * 1. One compact block: the field that takes a telephone number in whatever shape
 *    it was written in, the line underneath saying which number is about to be
 *    dialled, the consent line, and the button. The number is sent in the body of
 *    one POST and nowhere else, and the API keeps a salted hash of it rather than
 *    the number. The block goes as soon as the call is under way, because a form
 *    that is still there is a form somebody presses twice.
 * 2. The call, as a strip of three: `Marcando`, `En llamada`, `Termino`. It
 *    follows the ledger stream, which is how the rest of this app learns that
 *    anything happened, and asks `GET /tour/call/:id` every four seconds only
 *    while that stream is not open.
 * 3. The answer, as the same badge the run uses, with the sentence the outcome was
 *    read from quoted underneath. A `hold` and a `release` are both an ordinary
 *    decision with the owner's name on it, and the two answers that are the
 *    telephone rather than the owner leave the line exactly where it was.
 * 4. With no telephony -- `?data=mock`, or a server with `ALLOW_TOUR_CALLS` off, or
 *    one with no voice configured -- the field and the consent box are not
 *    rendered at all and the two answers are the card's own primary pair, so the
 *    flow is demonstrable at every stand, on every laptop, with or without a
 *    server. They used to sit under a small `Simular` eyebrow beneath a live
 *    field that could not place a call: a visitor typed a number, ticked the box
 *    and found nothing to press. The strip and the result then run exactly as
 *    they do for a real call, over the same seconds, and the result card says
 *    `simulado` on it, because a simulated answer that looks like a real one is
 *    the one thing this stop must not do.
 * 5. And the answer reaches the run. `hold` and `release` are applied to the line
 *    this stop is about through `lib/run-local.ts`, so the figure the spotlight
 *    is ringing moves when the owner releases the payment. Without it the card
 *    said "el dueno la libero bajo su nombre" over a figure that read the same
 *    string before and after the press.
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
import { applyLocalDecision } from "../lib/run-local";
import {
  CALL_BUSY,
  CALL_BUTTON,
  CONSENT_TEXT,
  callBody,
  callProblem,
  dialNote,
  HOLD_BUTTON,
  isPhoneComplete,
  LOCAL_SCRIPT_NOTE,
  localScript,
  noDialReason,
  OUTCOME_SENTENCE,
  outcomeState,
  ownerDecided,
  phoneProblem,
  RELEASE_BUTTON,
  revertSentence,
  SIMULATE_LEAD,
  SIMULATED_EVIDENCE,
  SIMULATED_RING_MS,
  SIMULATED_TALK_MS,
  stateFromEvent,
  stripIndexOf,
  TOUR_CALL_STATUS_LABEL,
  TOUR_CALL_STRIP,
  telephonyOff,
} from "../lib/tour-call";
import { TransactionStateBadge } from "./Primitives";

/** How often to ask where the call is, and only while the stream is not open. */
const POLL_MS = 4000;

/** Who the visitor is for one call. Never written to the stored identity. */
const OWNER = { role: "owner", name: "Visitante" } as const;

type Result = {
  outcome: TourOwnerOutcome;
  evidence: string;
  /** True when nothing rang: the two buttons in place of the call button. */
  simulated: boolean;
};

export function TourCall({ config }: { config: TourConfig }) {
  const mode = dataMode();
  const online = reachesApi(mode);
  /* A deployment that answered "I cannot dial" is treated from then on exactly
     like one that never could: the field goes and the two answers take over,
     rather than a telephone box standing over a server that just refused it. */
  const [refused, setRefused] = useState(false);
  const canCall = config.callsEnabled && online && !refused;

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

    if (telephonyOff(failure)) {
      setRefused(true);
    }

    setProblem(callProblem(failure));
  }, [phone]);

  /* The two simulated steps of the strip, so they can be cleared if the stop is
     left before the call has ended. */
  const timers = useRef<number[]>([]);

  useEffect(
    () => () => {
      for (const timer of timers.current) {
        window.clearTimeout(timer);
      }
    },
    [],
  );

  /*
   * The simulated call, in the three beats a call has.
   *
   * It rings, you talk, it ends. The version this replaced set the status and
   * the answer in the same tick, so `Marcando`, `En llamada` and `Termino` all
   * lit at once over a result card that was already rendered, and the strip read
   * as three decorative pills rather than as a call in flight. The delays are
   * the call taking time and not an animation, so they are the same under
   * reduced motion.
   */
  const simulate = useCallback((outcome: TourOwnerOutcome) => {
    setProblem(null);
    setStatus("initiated");

    timers.current.push(
      window.setTimeout(() => setStatus("in-progress"), SIMULATED_RING_MS),
      window.setTimeout(() => {
        setStatus("done");
        setResult({
          outcome,
          evidence: SIMULATED_EVIDENCE[outcome],
          simulated: true,
        });
      }, SIMULATED_TALK_MS),
    );
  }, []);

  /*
   * And the answer reaches the run underneath.
   *
   * The spotlight of this stop is the one figure of the payment run, because a
   * released line walks out of the slice the table is showing while the figure
   * is always there to move. It could not move: nothing on this card asked the
   * run anything again, so "el dueno la libero bajo su nombre" was printed over
   * a figure that read the same string before and after the press, with an API
   * or without one. `applyLocalDecision` is the overlay the run screen folds in
   * while it renders, and with an API behind the page it sets the same action
   * the ledger already recorded. The two answers that are the telephone rather
   * than the owner decide nothing and are not applied.
   */
  useEffect(() => {
    if (result === null || !ownerDecided(result.outcome)) {
      return;
    }

    applyLocalDecision({
      instructionId: config.hero.instructionId,
      action: result.outcome === "release" ? "release" : "hold",
      decidedBy: OWNER.name,
    });
  }, [result, config.hero.instructionId]);

  /* A call that is under way, which is the one state the form must not be in:
     a form still on screen while the telephone is ringing is a form that gets
     pressed twice. A refusal is not one of these, so the block comes back with
     the reason next to it. */
  const dialing = status !== null && status !== "failed";
  const reached = status === null ? -1 : stripIndexOf(status);

  return (
    <div className="tour-call">
      {result === null && !dialing ? (
        <div className="tour-block">
          {canCall ? (
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
                     company is, and it is only an example: the field takes a
                     number from anywhere, with or without a country code. */
                  placeholder="81 1234 5678"
                  aria-describedby="tour-phone-help"
                  value={phone}
                  onChange={(event) => {
                    setTouched(true);
                    setPhone(event.target.value);
                  }}
                />
                {/* What is missing while something is, and which telephone is
                    about to ring as soon as nothing is. */}
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
            <>
              {/* Nothing here can dial, so nothing here asks for a telephone
                  number: the field and the consent box are for placing a call.
                  What is left is the same flow, answered by the visitor, with
                  the two answers as the primary pair of the card. */}
              {problem === null ? (
                <p className="muted m-0 t-sm">
                  {noDialReason(mode === "mock")}
                </p>
              ) : null}

              <p className="m-0 t-sm">{SIMULATE_LEAD}</p>

              <div className="tour-simulate">
                <button
                  type="button"
                  className="btn btn-hold btn-lg"
                  onClick={() => simulate("hold")}
                >
                  {HOLD_BUTTON}
                </button>
                <button
                  type="button"
                  className="btn btn-release btn-lg"
                  onClick={() => simulate("release")}
                >
                  {RELEASE_BUTTON}
                </button>
              </div>
            </>
          )}

          {problem !== null ? (
            <p role="status" className="panel-sunken muted m-0 p-3 t-xs">
              {problem}
            </p>
          ) : null}
        </div>
      ) : null}

      {/* The strip: where this one call has got to, in three words. It stays
          under the result, because "Termino" and the answer are one thing. A
          call that failed is not a fourth step of it, so the strip comes off and
          the sentence underneath says what happened to the payment. */}
      {reached >= 0 ? (
        <div aria-live="polite" className="tour-strip">
          {TOUR_CALL_STRIP.map((label, at) => (
            <span
              key={label}
              className="tour-strip-step"
              data-on={at <= reached ? "true" : "false"}
            >
              {label}
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
              ? "Simulado en este navegador: la corrida ya lo refleja y la bitacora no."
              : `Quedo en la bitacora a nombre del dueno. ${revertSentence(revertMs)}`}
          </p>
        </div>
      ) : null}

      {/* The words, always available and never behind the call: a visitor who
          does not want to give a telephone number still gets to read what the
          owner would hear. It stays shut, because the stop is the call and this
          is the footnote to it. */}
      <details className="tour-script">
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
      </details>
    </div>
  );
}
