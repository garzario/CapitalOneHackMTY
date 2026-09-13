/**
 * The deadline a hold carries and what a person does next with it.
 *
 * It is the answer to the two questions a Capital One judge asked at the table
 * on 2026-09-12, and docs/12 sections 5a and 5b are the script: what happens if
 * the supplier does not answer the telephone, and what happens if the payment is
 * urgent. Both are answered on the screen now rather than in the API and a
 * rehearsal, because an answer that only exists in a rehearsal is an answer the
 * product does not have.
 *
 * **The deadline decides nothing.** When it passes, `expired` is true, the
 * payment goes back in front of a person, and nothing is released and nothing is
 * refused. That is binding under ADR-0002. What the deadline buys is a bound on
 * the retry loop: the call is retried until the window closes, and then a person
 * answers instead of the supplier.
 *
 * **The window is the delay the arithmetic already charged for.** Three days for
 * a hold and one for a verification, from `HOLD_WINDOW_DAYS`, which is
 * `EXPECTED_DELAY_DAYS` under another name. Quoting three days on a payment the
 * engine put in `verify` is the kind of thing a judge checks with one curl.
 *
 * **Every step is reachable from here.** `one_cent_cep` is the one worth naming
 * out loud, because it needs nobody to answer a telephone; `release_with_reason`
 * is offered rather than hidden, because a hold with no way out is a control
 * that gets bypassed outside the product, where nothing is recorded at all.
 */

import type { HoldNextStep, HoldWindow } from "@hackmty/core";
import { formatDateTime } from "../lib/format";
import { HOLD_STEP_HELP, HOLD_STEP_LABEL } from "../lib/labels";
import { remainingLabel } from "../lib/levels";
import { Link, verifyAccountPath, verifyCallPath } from "../lib/router";

/** The steps that live on another screen, and where each one goes. */
const STEP_PATH: Partial<
  Record<HoldNextStep, (instructionId: string) => string>
> = {
  call_supplier: verifyCallPath,
  retry_call: verifyCallPath,
  one_cent_cep: verifyAccountPath,
};

export function HoldPanel({
  hold,
  instructionId,
  /** Focuses the override form, which is the one step that lives on this screen. */
  onRelease,
}: {
  hold: HoldWindow | null;
  instructionId: string;
  onRelease: () => void;
}) {
  return (
    <section
      aria-labelledby="hold-heading"
      className="panel flex flex-col gap-4 p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h2 id="hold-heading" className="eyebrow">
          Plazo y siguientes pasos
        </h2>
        {hold === null ? null : (
          <span
            className={
              hold.expired ? "badge badge-verify" : "badge badge-neutral"
            }
          >
            {remainingLabel(hold)}
          </span>
        )}
      </div>

      {hold === null ? (
        /* Null and not a zero-hour window: a payment that was let go is not a
           hold that ran out, and rendering one as the other would tell a clerk
           that money they released is still waiting for them. */
        <p className="muted m-0 max-w-prose t-sm">
          Este pago no esta deteniendo dinero, asi que no tiene plazo. Un pago
          liberado no es una retencion que se cumplio.
        </p>
      ) : (
        <>
          <dl className="m-0 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <dt className="eyebrow">Fecha limite</dt>
              <dd className="m-0 mt-1 t-base">
                {formatDateTime(hold.deadline)}
              </dd>
            </div>
            <div>
              <dt className="eyebrow">Ventana</dt>
              <dd className="m-0 mt-1 t-base">
                {hold.days === 1 ? "1 dia" : `${String(hold.days)} dias`}
                <span className="subtle block t-xs">
                  Es el mismo retraso que la decision ya cobro en la perdida
                  esperada: tres dias para retener y uno para verificar.
                </span>
              </dd>
            </div>
          </dl>

          <p className="panel-sunken muted m-0 p-3 t-xs">
            {hold.expired
              ? "El plazo se cumplio y no paso nada solo: el pago sigue detenido y vuelve a estar enfrente de una persona. Nada se libera ni se rechaza por si mismo."
              : "Cuando se cumpla el plazo no se libera ni se rechaza nada por si mismo. El pago vuelve a estar enfrente de una persona, y el reintento de la llamada se acota con esta fecha."}
          </p>

          <div className="flex flex-col gap-2">
            <span className="eyebrow">Que sigue</span>
            <ol className="m-0 flex list-none flex-col gap-2 p-0">
              {hold.nextSteps.map((step, index) => (
                <li key={step} className="panel-sunken flex flex-col gap-1 p-3">
                  <span className="flex flex-wrap items-baseline gap-2">
                    <span className="subtle num t-xs">{String(index + 1)}</span>
                    <NextStep
                      step={step}
                      instructionId={instructionId}
                      onRelease={onRelease}
                    />
                  </span>
                  <span className="subtle t-xs">{HOLD_STEP_HELP[step]}</span>
                </li>
              ))}
            </ol>
          </div>
        </>
      )}
    </section>
  );
}

/**
 * One step, as the thing that performs it.
 *
 * A list of steps a clerk cannot act on is a list of suggestions, so the two
 * that live on another screen are links and the release is the button that
 * focuses the form on this one. `keep_held` is the only one that is neither, and
 * it is deliberate: after a `denied` the supplier said the account is not
 * theirs, and a button offering anything else next to that would be the product
 * arguing against its own finding.
 */
function NextStep({
  step,
  instructionId,
  onRelease,
}: {
  step: HoldNextStep;
  instructionId: string;
  onRelease: () => void;
}) {
  const path = STEP_PATH[step];

  if (path !== undefined) {
    return (
      <Link to={path(instructionId)} className="t-sm underline">
        {HOLD_STEP_LABEL[step]}
      </Link>
    );
  }

  if (step === "release_with_reason") {
    return (
      <button type="button" className="t-sm underline" onClick={onRelease}>
        {HOLD_STEP_LABEL[step]}
      </button>
    );
  }

  return <span className="t-sm font-medium">{HOLD_STEP_LABEL[step]}</span>;
}
