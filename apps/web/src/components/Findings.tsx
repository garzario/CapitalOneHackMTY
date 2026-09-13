/**
 * The finding panel: one detector's claim, the evidence behind it, and the way
 * to go check that evidence yourself.
 *
 * The panel states the amount at risk, renders whichever evidence blocks the
 * detector filled in, and closes with the moment it was detected. Opposite that
 * date sits the link out: the screen in this app that proves the claim, which
 * is the 69-B lookup, the CEP verification or the call to the supplier,
 * depending on the detector. The map lives in lib/labels.ts, and the link only
 * carries the subject -- it never runs the query on arrival.
 */

import type { Finding } from "@hackmty/core";
import { readEvidence } from "../lib/evidence";
import { formatDateTime } from "../lib/format";
import {
  DETECTOR_LABEL,
  EVIDENCE_ACTION,
  FINDING_STATE_HELP,
  FINDING_STATE_LABEL,
} from "../lib/labels";
import { cepPath, Link, satPath, verifyCallPath } from "../lib/router";
import {
  BankChangeBlock,
  ClabeDiff,
  DuplicateOriginBlock,
  EvidenceChips,
  NetworkBlock,
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
  /** The instruction this finding was raised on, when there is one. */
  instructionId?: string;
  /** The supplier this finding is about, when the caller knows it. */
  supplierRfc?: string;
};

/**
 * The evidence link for a finding, or null when the detector has none and when
 * the caller did not hand over the subject the link would need.
 */
function evidenceLink(
  detector: Finding["detector"],
  instructionId: string | undefined,
  supplierRfc: string | undefined,
): { to: string; label: string } | null {
  const action = EVIDENCE_ACTION[detector];

  if (action === undefined) {
    return null;
  }

  if (action.kind === "sat") {
    return supplierRfc === undefined
      ? null
      : { to: satPath(supplierRfc), label: action.label };
  }

  if (action.kind === "cep") {
    return supplierRfc === undefined
      ? null
      : { to: cepPath(supplierRfc), label: action.label };
  }

  return instructionId === undefined
    ? null
    : { to: verifyCallPath(instructionId), label: action.label };
}

export function FindingPanel({
  finding,
  showSubject = false,
  proposedClabe,
  instructionId,
  supplierRfc,
}: PanelProps) {
  const evidence = readEvidence(finding, proposedClabe);
  const link = evidenceLink(finding.detector, instructionId, supplierRfc);

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

      {evidence.network ? <NetworkBlock network={evidence.network} /> : null}

      <EvidenceChips chips={evidence.chips} />

      <footer className="flex flex-wrap items-center justify-between gap-3">
        <span className="subtle t-xs">
          Detectado el {formatDateTime(finding.createdAt)}
        </span>
        {link ? (
          <Link to={link.to} className="btn">
            {link.label}
          </Link>
        ) : null}
      </footer>
    </article>
  );
}
