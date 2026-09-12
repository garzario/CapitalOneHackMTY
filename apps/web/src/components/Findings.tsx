/**
 * The alert rail and the finding panel.
 *
 * The rail is sorted by pesos at risk and by nothing else. That ordering is the
 * product's opinion: a clerk with forty minutes reads from the top, and the top
 * has to be the payment that costs the most to get wrong, not the newest one or
 * the most severe label.
 */

import type { Finding } from "@hackmty/core";
import { motion, useReducedMotion } from "motion/react";
import { readEvidence } from "../lib/evidence";
import { formatDateTime } from "../lib/format";
import {
  DETECTOR_LABEL,
  FINDING_STATE_HELP,
  FINDING_STATE_LABEL,
} from "../lib/labels";
import { instructionPath, Link } from "../lib/router";
import {
  BankChangeBlock,
  ClabeDiff,
  DuplicateOriginBlock,
  EvidenceChips,
  SatStatusBlock,
} from "./Evidence";
import { Amount, SeverityBadge } from "./Primitives";

export type RailEntry = {
  finding: Finding;
  /** Where the rail jumps to. Null when nothing can be opened yet. */
  instructionId: string | null;
};

export function sortByAmountAtRisk(entries: RailEntry[]): RailEntry[] {
  return [...entries].sort(
    (a, b) => b.finding.amountAtRisk - a.finding.amountAtRisk,
  );
}

type RailProps = {
  entries: RailEntry[];
  /** Highlights the entry whose detail is open. */
  activeInstructionId?: string | null;
};

export function AlertRail({ entries, activeInstructionId = null }: RailProps) {
  const reduceMotion = useReducedMotion();
  const sorted = sortByAmountAtRisk(entries);

  if (sorted.length === 0) {
    return (
      <p className="muted t-sm">
        Ninguna instruccion de esta corrida tiene hallazgos. La corrida puede
        salir completa.
      </p>
    );
  }

  return (
    <ol className="m-0 flex list-none flex-col gap-2 p-0">
      {sorted.map((entry, index) => {
        const { finding, instructionId } = entry;
        const isActive =
          instructionId !== null && instructionId === activeInstructionId;
        const body = (
          <span className="flex w-full flex-col gap-2">
            <span className="flex items-start justify-between gap-3">
              <span className="t-sm font-medium">
                {DETECTOR_LABEL[finding.detector]}
              </span>
              <SeverityBadge severity={finding.severity} />
            </span>
            <Amount value={finding.amountAtRisk} size="lg" />
            <span className="subtle t-xs">
              {FINDING_STATE_LABEL[finding.state]}
            </span>
          </span>
        );

        return (
          <motion.li
            key={finding.id}
            initial={reduceMotion ? false : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              duration: reduceMotion ? 0 : 0.22,
              delay: reduceMotion ? 0 : Math.min(index * 0.03, 0.18),
              ease: [0.2, 0.8, 0.2, 1],
            }}
          >
            {instructionId ? (
              <Link
                to={instructionPath(instructionId)}
                aria-current={isActive ? "true" : undefined}
                className="panel flex w-full p-3 no-underline"
                style={
                  isActive ? { borderColor: "var(--c-accent)" } : undefined
                }
              >
                {body}
              </Link>
            ) : (
              <div className="panel flex w-full p-3">{body}</div>
            )}
          </motion.li>
        );
      })}
    </ol>
  );
}

type PanelProps = {
  finding: Finding;
  /** Shown when the panel stands alone, outside an instruction detail. */
  showSubject?: boolean;
  /**
   * The account on the payment instruction. The detectors keep only the known
   * account in the evidence record, because the proposed one is already on the
   * instruction, so a caller that has one hands it over and the comparison can
   * be drawn. A caller that does not gets no comparison rather than a wrong
   * one: see `readEvidence` in lib/evidence.ts.
   */
  proposedClabe?: string;
};

export function FindingPanel({
  finding,
  showSubject = false,
  proposedClabe,
}: PanelProps) {
  const evidence = readEvidence(finding, proposedClabe);

  return (
    <article className="panel flex flex-col gap-4 p-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <span className="eyebrow">{DETECTOR_LABEL[finding.detector]}</span>
          {showSubject ? (
            <span className="muted t-xs">
              {finding.subject.kind} {finding.subject.id}
            </span>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SeverityBadge severity={finding.severity} />
          <span className="badge badge-neutral">
            {FINDING_STATE_LABEL[finding.state]}
          </span>
        </div>
      </header>

      <p className="t-base">{finding.explanation}</p>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col">
          <span className="eyebrow">En riesgo</span>
          <Amount value={finding.amountAtRisk} size="xl" />
        </div>
        <p className="subtle max-w-prose t-xs">
          {FINDING_STATE_HELP[finding.state]}
        </p>
      </div>

      {evidence.satStatus ? <SatStatusBlock sat={evidence.satStatus} /> : null}

      {evidence.duplicateOf ? (
        <DuplicateOriginBlock origin={evidence.duplicateOf} />
      ) : null}

      {evidence.bankChange ? (
        <BankChangeBlock change={evidence.bankChange} />
      ) : null}

      {evidence.clabe ? <ClabeDiff comparison={evidence.clabe} /> : null}

      <EvidenceChips chips={evidence.chips} />

      <footer className="subtle t-xs">
        Detectado el {formatDateTime(finding.createdAt)}
      </footer>
    </article>
  );
}
