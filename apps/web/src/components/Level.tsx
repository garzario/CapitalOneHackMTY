/**
 * The level and the state of one payment, side by side, with the rule that
 * produced each of them and the findings the level fired on.
 *
 * Three things this panel is not allowed to do, and they are the reason it is a
 * component rather than four spans in a screen.
 *
 * **It never prints a number for the level.** Three words and no fourth, and no
 * percentage anywhere near a supplier's name. The expected-loss arithmetic is an
 * upper bound on the evidence and says so in its own header, so a figure like
 * 0.73 here would be a precision nobody earned. ADR-0009 is binding.
 *
 * **It never says "seguro".** `confiable` means the documents we hold agree and
 * nothing is open. A SPEI cannot be recalled, so no level on this screen is a
 * guarantee about one, and the help text under the badge says that out loud
 * rather than leaving it to be inferred.
 *
 * **It never shows a level with nothing under it.** `assessConfidence` answers
 * the rule and the finding ids it fired on, and those findings are named here
 * with a link to their own panel further down the screen. A level a clerk cannot
 * explain to the supplier on the telephone is a level that gets overridden
 * blindly.
 *
 * The badges are the ones `AssistantCards` already draws, so the drawer and the
 * detail cannot paint one line two different colours.
 */

import type { Confidence, Finding, TransactionState } from "@hackmty/core";
import {
  CONFIDENCE_BADGE,
  CONFIDENCE_HELP,
  CONFIDENCE_LABEL,
  CONFIDENCE_RULE_LABEL,
  DETECTOR_LABEL,
  STATE_BADGE,
  STATE_HELP,
  STATE_LABEL,
  STATE_RULE_LABEL,
} from "../lib/labels";
import type { LineAssessment } from "../lib/levels";

export function LevelBadge({ confidence }: { confidence: Confidence }) {
  return (
    <span className={CONFIDENCE_BADGE[confidence]}>
      {CONFIDENCE_LABEL[confidence]}
    </span>
  );
}

export function StateBadge({ state }: { state: TransactionState }) {
  return <span className={STATE_BADGE[state]}>{STATE_LABEL[state]}</span>;
}

/** How much of a finding's sentence fits next to its name without wrapping twice. */
const EXPLANATION_CHARS = 96;

export function LevelPanel({
  assessment,
  findings,
  /** Where a named finding scrolls to. Each panel below carries this id. */
  findingAnchor,
}: {
  assessment: LineAssessment;
  findings: readonly Finding[];
  findingAnchor: (findingId: string) => string;
}) {
  const behind = findings.filter((finding) =>
    assessment.confidence.findingIds.includes(finding.id),
  );

  return (
    <section
      aria-labelledby="level-heading"
      className="panel flex flex-col gap-4 p-5"
    >
      <h2 id="level-heading" className="eyebrow">
        Nivel y estado
      </h2>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="eyebrow">Nivel de confianza</span>
            <LevelBadge confidence={assessment.confidence.level} />
          </div>
          <p className="m-0 max-w-prose t-sm">
            {`El nivel sale de esta regla: ${CONFIDENCE_RULE_LABEL[assessment.confidence.rule]}.`}
          </p>
          <p className="subtle m-0 max-w-prose t-xs">
            {CONFIDENCE_HELP[assessment.confidence.level]}
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="eyebrow">Estado del pago</span>
            <StateBadge state={assessment.state.state} />
          </div>
          <p className="m-0 max-w-prose t-sm">
            {`El estado sale de esta regla: ${STATE_RULE_LABEL[assessment.state.rule]}.`}
          </p>
          <p className="subtle m-0 max-w-prose t-xs">
            {STATE_HELP[assessment.state.state]}
          </p>
        </div>
      </div>

      {/* The evidence under the level, named. Empty only on `no_open_signal`,
          and then the sentence says the controls ran rather than leaving a gap
          that reads as "we did not look". */}
      <div className="panel-sunken flex flex-col gap-2 p-4">
        <span className="eyebrow">De donde sale el nivel</span>
        {behind.length === 0 ? (
          <p className="muted m-0 t-sm">
            Los seis controles corrieron sobre este pago y ninguno dejo nada
            abierto. No hay hallazgo que sostenga un nivel mas alto, y tampoco
            es un certificado de nada.
          </p>
        ) : (
          <ul className="m-0 flex list-none flex-col gap-1 p-0">
            {behind.map((finding) => (
              <li key={finding.id}>
                <a className="t-sm underline" href={findingAnchor(finding.id)}>
                  {DETECTOR_LABEL[finding.detector]}
                </a>
                <span className="subtle t-xs">
                  {` ${finding.explanation.slice(0, EXPLANATION_CHARS)}${finding.explanation.length > EXPLANATION_CHARS ? "..." : ""}`}
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="subtle m-0 t-xs">
          El nivel es una de tres palabras y nunca un porcentaje. La aritmetica
          de perdida esperada es una cota sobre la evidencia, no una
          probabilidad calibrada, asi que un numero aqui seria una precision que
          nadie se gano.
        </p>
      </div>
    </section>
  );
}
