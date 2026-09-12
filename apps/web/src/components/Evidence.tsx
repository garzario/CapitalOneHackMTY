/**
 * Evidence rendering. A finding is only as good as the facts under it, so the
 * machine-readable `evidence` record is shown beside the sentence rather than
 * folded into it: the clerk reads the explanation, an auditor reads the fields
 * it was built from.
 *
 * Four of those facts are not chips. The account comparison, the change of
 * bank, the Article 69-B row and the invoice a duplicate copies each carry a
 * different kind of weight, and flattening them into `key: value` pairs makes
 * the strongest evidence on the screen look like the weakest. What each of
 * them means is decided in `lib/evidence.ts`; this file only draws it.
 */

import type { EvidenceView } from "../lib/evidence";
import { shortUuid, splitClabe } from "../lib/format";
import { SAT_STATUS_BADGE, SAT_STATUS_LABEL } from "../lib/labels";

export function EvidenceChips({ chips }: { chips: EvidenceView["chips"] }) {
  if (chips.length === 0) {
    return null;
  }

  return (
    <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
      {chips.map((chip) => (
        <li key={chip.key}>
          <span className="chip">
            <span className="chip-key">{chip.label}</span>
            <span className="chip-value">{chip.value}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

/**
 * The two accounts side by side, with the digits that differ painted.
 *
 * This is the whole point of the screen for the account-change case: a clerk
 * comparing eighteen digits by eye misses two of them, every time. The detector
 * decides what the difference means and which positions count. This only shows
 * where they are.
 */
export function ClabeDiff({
  comparison,
}: {
  comparison: NonNullable<EvidenceView["clabe"]>;
}) {
  const differing = new Set(comparison.differing);
  const blocks = splitClabe(comparison.proposed);
  const knownBlocks = splitClabe(comparison.known);

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

/**
 * Where the money used to go and where it is being sent now.
 *
 * Rendered as two named banks rather than as a chip, because "the account moved
 * to another institution" is the single fact a clerk can act on without reading
 * eighteen digits. It only appears when the banks genuinely differ.
 */
export function BankChangeBlock({
  change,
}: {
  change: NonNullable<EvidenceView["bankChange"]>;
}) {
  return (
    <div className="panel-sunken flex flex-wrap items-baseline gap-x-3 gap-y-1 p-4">
      <span className="eyebrow">Cambio de banco</span>
      <span className="t-base">
        <span className="muted">{change.from}</span>
        <span className="subtle"> a </span>
        <span style={{ color: "var(--c-hold-ink)" }}>{change.to}</span>
      </span>
    </div>
  );
}

/**
 * The Article 69-B row.
 *
 * The badge colour is not severity, it is the status itself:
 * `desvirtuado` and `sentencia_favorable` mean the taxpayer answered and won,
 * and painting those red would be both wrong and unfair. The mapping lives in
 * `lib/labels.ts` and is the same one the lookup screen uses.
 */
export function SatStatusBlock({
  sat,
}: {
  sat: NonNullable<EvidenceView["satStatus"]>;
}) {
  return (
    <div className="panel-sunken flex flex-wrap items-center gap-x-3 gap-y-2 p-4">
      <span className="eyebrow">Lista 69-B</span>
      <span className={SAT_STATUS_BADGE[sat.status]}>
        {SAT_STATUS_LABEL[sat.status]}
      </span>
      {sat.publishedAt ? (
        <span className="subtle t-xs">
          Publicado en el DOF {sat.publishedAt}
        </span>
      ) : null}
      {sat.listVersion ? (
        <span className="subtle t-xs">Version {sat.listVersion}</span>
      ) : null}
    </div>
  );
}

/** The invoice this one repeats. Named, because the clerk has to go find it. */
export function DuplicateOriginBlock({
  origin,
}: {
  origin: NonNullable<EvidenceView["duplicateOf"]>;
}) {
  return (
    <div className="panel-sunken flex flex-wrap items-baseline gap-x-3 gap-y-1 p-4">
      <span className="eyebrow">Factura original</span>
      {origin.folio ? (
        <span className="t-base">Folio {origin.folio}</span>
      ) : null}
      {origin.uuid ? (
        <span className="code subtle">{shortUuid(origin.uuid, 13)}</span>
      ) : null}
    </div>
  );
}
