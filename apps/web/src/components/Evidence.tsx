/**
 * Evidence rendering. A finding is only as good as the facts under it, so the
 * machine-readable `evidence` record is shown as chips rather than folded into
 * the sentence: the clerk can read the explanation, and an auditor can read the
 * fields it was built from.
 */

import type { Finding } from "@hackmty/core";
import { diffPositions, formatDecimal, splitClabe } from "../lib/format";

/** `clabe_propuesta` becomes `clabe propuesta`, which is how it is read aloud. */
function humanKey(key: string): string {
  return key.replace(/_/g, " ");
}

function renderValue(value: string | number | boolean): string {
  if (typeof value === "boolean") {
    return value ? "si" : "no";
  }

  if (typeof value === "number") {
    return formatDecimal(value);
  }

  return value;
}

/**
 * The CLABE keys are rendered by ClabeDiff instead, in their own block, so they
 * are not repeated as chips.
 */
const CLABE_KEYS = new Set(["clabe_propuesta", "clabe_conocida"]);

export function EvidenceChips({ finding }: { finding: Finding }) {
  const entries = Object.entries(finding.evidence).filter(
    ([key]) => !CLABE_KEYS.has(key),
  );

  if (entries.length === 0) {
    return null;
  }

  return (
    <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
      {entries.map(([key, value]) => (
        <li key={key}>
          <span className="chip">
            <span className="chip-key">{humanKey(key)}</span>
            <span className="chip-value">{renderValue(value)}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

type ClabeDiffProps = {
  proposed: string;
  known: string;
};

/**
 * The two accounts side by side, with the digits that differ painted.
 *
 * This is the whole point of the screen for the account-change case: a clerk
 * comparing eighteen digits by eye misses two of them, every time. The detector
 * decides what the difference means. This only shows where it is.
 */
export function ClabeDiff({ proposed, known }: ClabeDiffProps) {
  const differing = new Set(diffPositions(proposed, known));
  const blocks = splitClabe(proposed);
  const knownBlocks = splitClabe(known);

  /** Offset of each block inside the eighteen digits: bank, plaza, account. */
  const renderBlock = (text: string, offset: number) =>
    [...text].map((digit, index) => {
      const position = offset + index;

      return (
        <span
          key={position}
          className={differing.has(position) ? "digit-diff" : undefined}
        >
          {digit}
        </span>
      );
    });

  return (
    <div className="panel-sunken flex flex-col gap-3 p-4">
      <div className="flex flex-col gap-1">
        <span className="eyebrow">Cuenta en la instruccion</span>
        <span className="code flex flex-wrap gap-x-3">
          <span>{renderBlock(blocks.bank, 0)}</span>
          <span>{renderBlock(blocks.plaza, 3)}</span>
          <span>{renderBlock(blocks.account, 6)}</span>
          <span>{renderBlock(blocks.control, 17)}</span>
        </span>
      </div>
      <div className="flex flex-col gap-1">
        <span className="eyebrow">Cuenta que ya cobraba</span>
        <span className="code muted flex flex-wrap gap-x-3">
          <span>{knownBlocks.bank}</span>
          <span>{knownBlocks.plaza}</span>
          <span>{knownBlocks.account}</span>
          <span>{knownBlocks.control}</span>
        </span>
      </div>
      <p className="subtle m-0 t-xs">
        Banco, plaza, cuenta y digito de control. {differing.size} de 18 digitos
        cambian.
      </p>
    </div>
  );
}

/** Pulls the CLABE pair out of a finding's evidence, when it carries one. */
export function clabePair(
  finding: Finding,
): { proposed: string; known: string } | null {
  const proposed = finding.evidence.clabe_propuesta;
  const known = finding.evidence.clabe_conocida;

  return typeof proposed === "string" && typeof known === "string"
    ? { proposed, known }
    : null;
}
