/**
 * The alert rail and the finding panel.
 *
 * The rail is sorted by pesos at risk and by nothing else. That ordering is the
 * product's opinion: a clerk with forty minutes reads from the top, and the top
 * has to be the payment that costs the most to get wrong, not the newest one or
 * the most severe label.
 */

import type { Finding } from "@hackmty/core";
import { readEvidence } from "../lib/evidence";
import { formatDateTime } from "../lib/format";
import {
  DETECTOR_LABEL,
  FINDING_STATE_HELP,
  FINDING_STATE_LABEL,
} from "../lib/labels";
import {
  BankChangeBlock,
  ClabeDiff,
  DuplicateOriginBlock,
  EvidenceChips,
  SatStatusBlock,
} from "./Evidence";
import { Amount, SeverityBadge } from "./Primitives";

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
