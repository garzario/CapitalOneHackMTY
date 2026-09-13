/**
 * The synthetic payment run the app falls back to when the API is not there.
 *
 * Why it exists: the front has to be demonstrable on a phone in a corridor, with
 * no server, no database and no network, and it has to look exactly like the real
 * thing so that what a judge sees offline is what they see online.
 *
 * **There is one dataset.** Every row below comes out of `./mock-data.ts`, which
 * `bun run web:mock` writes from the same seeded company the API serves in the
 * demo: seed 69, the week of 2026-09-07, 44 suppliers, 92 instructions, and the
 * findings and decisions the six controls in `@hackmty/engine` produce over them.
 * That is issue 125: this file used to carry a hand-written run of eight
 * suppliers, and the API and the offline fallback disagreed about the legal name
 * of every RFC they shared, so one RFC could show two company names on one screen
 * and an API that dropped mid-demo renamed every company on the projector.
 *
 * So nothing here invents data. What this file does is the three things a
 * generated data file should not:
 *
 * 1. It composes. `mockRun`, `mockInstruction` and `mockSupplierDetail` assemble
 *    the same payloads `MemoryRepository` assembles for the same endpoints, out
 *    of the same rows, so a screen cannot tell which side answered.
 * 2. It derives. `totalsFor` recomputes the totals after a decision is applied
 *    without the API, because the stored ones go stale the moment that happens.
 * 3. It says what is deliberately not one for one with the API, and why. Three
 *    things are, and all three are written down where they live: the invoices,
 *    the payment complements and the verified-beneficiary registry.
 *
 * The rules that were binding before are still binding, and are now properties of
 * the generator rather than of whoever last edited a literal: every object
 * carries `synthetic: true` where the domain has the flag, every RFC is synthetic
 * of the form SYN..., and no total on screen disagrees with the rows under it.
 * `mock.test.ts` asserts all three over the whole graph.
 */

import type {
  Actor,
  Cfdi,
  Decision,
  Finding,
  LedgerEvent,
  Metrics,
  PaymentExecution,
  PaymentExecutionLine,
  PaymentReceipt,
  Rfc,
  SatListEntry,
  Supplier,
  SweepResult,
} from "@hackmty/core";
import {
  lookupInstitution,
  runLevels,
  runMoney,
  sumAmounts,
} from "@hackmty/core";
import type {
  CepVerification,
  InstructionDetail,
  PaymentRun,
  PaymentRunItem,
  PaymentRunTotals,
  SatVersion,
  SupplierDetail,
  VerificationState,
  VerifiedBeneficiary,
} from "./contract";
import {
  ACTOR,
  CEP_VERIFICATION,
  DECISIONS,
  EXECUTION,
  FINDING_IDS_BY_INSTRUCTION,
  FINDINGS,
  CFDIS as GENERATED_CFDIS,
  COMPANY_NAME as GENERATED_COMPANY_NAME,
  COMPANY_RFC as GENERATED_COMPANY_RFC,
  COMPLEMENTS as GENERATED_COMPLEMENTS,
  LISTED_SUPPLIER_RFC as GENERATED_LISTED_RFC,
  SAT_ENTRIES as GENERATED_SAT_ENTRIES,
  SAT_VERSIONS as GENERATED_SAT_VERSIONS,
  SUPPLIERS as GENERATED_SUPPLIERS,
  VERIFICATIONS as GENERATED_VERIFICATIONS,
  HERO_INSTRUCTION_IDS,
  INSTRUCTIONS,
  INTAKE_EXAMPLE,
  METRICS,
  RECEIPTS,
  RUN_ID,
  SWEEP,
  TOTALS,
  WEEK_OF,
} from "./mock-data";
import { notStartedVerification } from "./verification";

/** The company running the payment run. Synthetic, like everything else. */
export const COMPANY_RFC: Rfc = GENERATED_COMPANY_RFC;
export const COMPANY_NAME = GENERATED_COMPANY_NAME;

/**
 * The supplier the simulated Article 69-B publication names, offline.
 *
 * Read off the run rather than written down: it is the RFC the `sat_69b` finding
 * of this company's own run is about. A constant here was an RFC from another
 * dataset once, and the sweep came back with nothing listed while the screen
 * showed a confident zero.
 */
export const LISTED_SUPPLIER_RFC: Rfc = GENERATED_LISTED_RFC;

/** The run lines the demo opens on, in demo order. */
export const DEMO_INSTRUCTION_IDS: readonly string[] = HERO_INSTRUCTION_IDS;

/**
 * A folio and an RFC of this run, for the placeholder of a field a judge types
 * into.
 *
 * They are exported rather than written into each screen because a placeholder
 * from another dataset is an instruction to type something the API answers 404
 * for, which is how the SAT screen came to show a confident zero for an RFC the
 * seeded company does not hold.
 */
export const EXAMPLE_INSTRUCTION_ID: string = INTAKE_EXAMPLE.instruction.id;
export const EXAMPLE_SUPPLIER_RFC: Rfc = INTAKE_EXAMPLE.supplier.rfc;

/**
 * Display name for the bank in the first three digits of a CLABE.
 *
 * The catalogue is `BANXICO_INSTITUTIONS` in `@hackmty/core`, which is the same
 * snapshot the CLABE control names an institution from, so the bank column of the
 * run table and the `institutionName` on a finding cannot disagree. A code outside
 * the snapshot is reported as itself and never guessed: the table can go stale and
 * the check digit cannot, so the half that can go stale only asks a question.
 */
export function bankName(clabe: string): string {
  return bankNameFromCode(clabe.slice(0, 3));
}

/**
 * The same catalogue, addressed by the three-digit institution code on its own.
 * The API reports a change of bank as a pair of codes rather than a pair of
 * names, and "012 a 014" is not a sentence a clerk can act on.
 */
export function bankNameFromCode(code: string): string {
  return lookupInstitution(code)?.name ?? `Banco ${code}`;
}

/* ---------------------------------------------------------------- documents */

export const SUPPLIERS: readonly Supplier[] = GENERATED_SUPPLIERS;

/**
 * The invoices a screen can reach: 156 of the company's 4103.
 *
 * This is the first of the three places the offline dataset is deliberately
 * narrower than the API's. The ones here are the ones this run settles, the ones
 * the retroactive sweep prices and the ones a finding names, which is every
 * invoice any screen of this app opens. The eight-month history behind them is
 * 208 KB gzipped against 8.8, on a bundle that has to reach a phone in a corridor.
 *
 * `GET /api/v1/suppliers/:rfc` answers with an issuer's whole file, so the number
 * in the supplier drawer is the API's whenever the API answered. Offline it is
 * this array, and the drawer says so rather than printing a narrower count under
 * the same label: a count that changes with who answered is issue 125 itself.
 * `docs/07-architecture.md` carries the difference.
 */
export const CFDIS: readonly Cfdi[] = GENERATED_CFDIS;

/**
 * The payment complements that settle those invoices, and not the other 3799.
 *
 * The second narrowing, for the same reason and a stronger one:
 * `SupplierDetail.complements` is read by no component in `apps/web`, so the
 * whole set is 221 KB gzipped that a browser would download in order to render
 * nothing.
 */
export const COMPLEMENTS = GENERATED_COMPLEMENTS;

export const SAT_ENTRIES: readonly SatListEntry[] = GENERATED_SAT_ENTRIES;
export const SAT_VERSIONS: readonly SatVersion[] = GENERATED_SAT_VERSIONS;

/* --------------------------------------------------------------------- run */

const supplierByRfc = new Map(
  SUPPLIERS.map((supplier) => [supplier.rfc, supplier]),
);
const decisionByInstruction = new Map(
  DECISIONS.map((decision) => [decision.instructionId, decision]),
);
const findingById = new Map(FINDINGS.map((finding) => [finding.id, finding]));

/**
 * The findings of one line, in the order the run payload carries them.
 *
 * Read through the index rather than off the decision, because that is what
 * `MemoryRepository.findingsFor` does: one supplier finding can reach two lines,
 * so the store keeps findings once and indexes them per instruction.
 */
function findingsFor(instructionId: string): Finding[] {
  const ids = FINDING_IDS_BY_INSTRUCTION[instructionId] ?? [];

  return ids
    .map((id) => findingById.get(id))
    .filter((finding): finding is Finding => finding !== undefined);
}

export const RUN_ITEMS: PaymentRunItem[] = INSTRUCTIONS.flatMap(
  (instruction) => {
    const supplier = supplierByRfc.get(instruction.supplierRfc);
    const decision = decisionByInstruction.get(instruction.id);

    /* An instruction always has both by the time it is stored, which is why the
       API skips a line that does not rather than rendering a hole. */
    return supplier === undefined || decision === undefined
      ? []
      : [
          {
            instruction,
            supplier,
            decision,
            findings: findingsFor(instruction.id),
          },
        ];
  },
);

/**
 * Totals, derived, never typed in.
 *
 * Counts and pesos both, the shape `docs/09-api.md` documents and the shape
 * `MemoryRepository.currentRun` answers with: `held` is a number of lines and
 * `heldAmount` is money. The pesos come from `runMoney` and the sum from
 * `sumAmounts`, both in `@hackmty/core`, which is where the API and the
 * constancia get them: two implementations of "how much did this run stop" is how
 * a screen and a document end up disagreeing in front of a judge, and a bare `+`
 * over ninety-two amounts lands two thousandths of a centavo away from the API.
 */
export function totalsFor(items: readonly PaymentRunItem[]): PaymentRunTotals {
  const actions = items.map((item) => item.decision.action);
  const countOf = (action: Decision["action"]) =>
    actions.filter((candidate) => candidate === action).length;

  return {
    instructions: items.length,
    amount: sumAmounts(items.map((item) => item.instruction.amount)),
    held: countOf("hold"),
    toVerify: countOf("verify"),
    released: countOf("release"),
    ...runMoney(items),
    /* And the run by level and by state, from the same file as the pesos. A screen
       that recomputed the money here and the levels somewhere else would be the
       four implementations ADR-0009 removed. */
    ...runLevels(items),
  };
}

export const MOCK_RUN: PaymentRun = {
  id: RUN_ID,
  weekOf: WEEK_OF,
  /* The stored totals, so the offline payload is the API's payload. `totalsFor`
     is what a screen calls again after applying a decision locally. */
  totals: TOTALS,
  items: RUN_ITEMS,
};

export function mockRun(): PaymentRun {
  return MOCK_RUN;
}

export function mockInstruction(id: string): PaymentRunItem | null {
  return RUN_ITEMS.find((item) => item.instruction.id === id) ?? null;
}

/**
 * The answer `POST /api/v1/instructions` gives, for a reviewer with no backend.
 *
 * It is the demo's hero line scored again with the consortium consulted, which is
 * what that endpoint answers on a server with `ALLOW_CONSORTIUM=1`. This is the
 * one place the offline app carries the network line, for the same reason the API
 * only carries it here: the intake path hands the controls a signal and the boot
 * assessment of a whole run does not.
 */
export function mockIntakeExample(): InstructionDetail {
  return {
    instruction: INTAKE_EXAMPLE.instruction,
    supplier: INTAKE_EXAMPLE.supplier,
    decision: INTAKE_EXAMPLE.decision,
    findings: [...INTAKE_EXAMPLE.findings],
  };
}

/* -------------------------------------------------------------- supplier --- */

/**
 * The supplier drawer, assembled the way `MemoryRepository.supplierDetail`
 * assembles it: this issuer's invoices, the complements that settle them, every
 * finding about the supplier, its invoices or its lines of the run, and the
 * beneficiaries verified with a CEP.
 *
 * The invoices are the ones `CFDIS` carries, so for an issuer this week's run
 * never touched there are none, and for the rest there are fewer than the API
 * answers with. `SupplierDrawer` renders that as what it is, per the note on
 * `CFDIS`. Every other field is the API's answer row for row.
 */
export function mockSupplierDetail(rfc: Rfc): SupplierDetail | null {
  const supplier = supplierByRfc.get(rfc);

  if (supplier === undefined) {
    return null;
  }

  const cfdis = CFDIS.filter((cfdi) => cfdi.issuerRfc === rfc);
  const uuids = new Set(cfdis.map((cfdi) => cfdi.uuid));
  const instructionIds = new Set(
    INSTRUCTIONS.filter((instruction) => instruction.supplierRfc === rfc).map(
      (instruction) => instruction.id,
    ),
  );

  return {
    supplier,
    cfdis,
    complements: COMPLEMENTS.filter((complement) =>
      uuids.has(complement.relatedCfdiUuid),
    ),
    findings: FINDINGS.filter((finding) => {
      const { kind, id } = finding.subject;

      if (kind === "supplier") {
        return id === rfc;
      }

      if (kind === "cfdi") {
        return uuids.has(id);
      }

      return instructionIds.has(id);
    }),
    verifiedBeneficiaries: BENEFICIARIES.filter(
      (entry) => entry.supplierRfc === rfc,
    ),
  };
}

/* --------------------------------------------------------------------- sat */

/**
 * The retroactive sweep, priced by `priceSweep` in `@hackmty/sat` over the
 * invoices this company has already paid the listed supplier.
 *
 * The arithmetic is not repeated here: the generator ran it, so the three numbers
 * on screen offline are the three the API answers for the same list version. The
 * argument stays so a caller can price a version it was handed instead.
 */
export function mockSweep(listVersion = SWEEP.listVersion): SweepResult {
  return listVersion === SWEEP.listVersion ? SWEEP : { ...SWEEP, listVersion };
}

/* --------------------------------------------------------------------- cep */

/**
 * What `POST /api/v1/cep/verify` answers for the probe on the released line: the
 * document, the comparison and the sixth control's own finding about it.
 */
export function mockCepVerification(): CepVerification {
  return {
    cep: CEP_VERIFICATION.cep,
    nameMatch: CEP_VERIFICATION.nameMatch,
    finding: CEP_VERIFICATION.finding,
  };
}

export const MOCK_CEP = CEP_VERIFICATION.cep;

/** The supplier that CEP was compared against, for the example heading. */
export const CEP_EXAMPLE_RFC: Rfc = CEP_VERIFICATION.supplierRfc;

/**
 * The registry of beneficiaries verified with a CEP, empty.
 *
 * This is the third place the offline dataset is deliberately narrower than the
 * API's, and it is narrower in the same way: `sentryoneDataset` hands the API an
 * empty registry too. A row is written when a one-cent probe is verified, and a
 * browser with no API has verified nothing, so a row here would be a row claiming
 * a document reached a registry it never reached. The screens already render the
 * empty case, which is the honest one.
 */
export const BENEFICIARIES: readonly VerifiedBeneficiary[] = [];

/* --------------------------------------------------- one-cent verification */

/**
 * The one-cent verification, one line of the run per state.
 *
 * All five reachable states are here, on five different lines, because the panel
 * that renders them has to be demonstrable with no API behind it and a fixture
 * carrying only the happy ending proves nothing about the other four.
 * `not_started` is the sixth and `mockVerification` answers it below.
 *
 * Each row was folded by the generator the way `foldVerification` folds one out
 * of the ledger: the CEP is a document `@hackmty/cep` rendered and parsed, the
 * seal is `sealStateOf`, the comparison is `nameMatch`, and the decision on the
 * two endings is `decide` over the sixth control's findings, signed `system`.
 *
 * The seal reads `not_checked` on every row that holds a document, and that is
 * not a gap: a deployment with no `BANXICO_CEP_CERT_PEM` parsed the CEP and
 * verified nothing, `bun run demo` asserts that a synthetic CEP never comes back
 * with a validated seal, and the row that would say "sello valido" is the one
 * claim this product may not make on its own.
 */
export const VERIFICATIONS: Readonly<Record<string, VerificationState>> =
  Object.fromEntries(
    GENERATED_VERIFICATIONS.map((state) => [state.instructionId, state]),
  );

/**
 * The verification of one instruction, offline.
 *
 * An instruction of the run with no row above has simply never been probed, so
 * it answers `not_started` rather than nothing: an empty answer would render as
 * a failure, and "nobody has verified this account" is a state and not an
 * error. A folio this run does not contain answers null, which is what makes a
 * typed-in mistake visible.
 */
export function mockVerification(
  instructionId: string,
): VerificationState | null {
  const carried = VERIFICATIONS[instructionId];

  if (carried !== undefined) {
    return carried;
  }

  return mockInstruction(instructionId) === null
    ? null
    : notStartedVerification(instructionId, `${WEEK_OF}T00:00:00.000Z`);
}

/* ----------------------------------------------------------------- metrics */

/**
 * The blind evaluation, scored offline by the same controls that score it online.
 *
 * It is not a placeholder any more. `GET /api/v1/metrics` runs the six controls
 * over the labelled cases in `packages/seed/src/holdout`, and the generator ran
 * exactly that, so the numbers here are the numbers the API answers rather than a
 * shape with invented counts in it. ADR-0002 gives the cases to a different
 * person from the detectors, which is what makes either copy of the number blind.
 */
export const MOCK_METRICS: Metrics = METRICS;

/* ------------------------------------------------------------------- ledger */

/**
 * The ledger the timeline replays, derived from the rows above so the events and
 * the table can never tell two different stories.
 *
 * Only the two kinds a screen reads offline: an instruction arriving and a
 * decision being made. The seeded company's own event stream carries eight
 * months of documents as well, and it is 3.1 MB, which is not a thing to send to
 * a browser so a timeline can show this week.
 */
export function mockLedger(): LedgerEvent[] {
  const events: LedgerEvent[] = [];

  for (const item of RUN_ITEMS) {
    events.push({
      type: "instruction_received",
      at: item.instruction.receivedAt,
      instruction: item.instruction,
    });
  }

  for (const item of RUN_ITEMS) {
    events.push({
      type: "decision_made",
      at: item.decision.decidedAt,
      decision: item.decision,
    });
  }

  return events.sort((left, right) => left.at.localeCompare(right.at));
}

/** Every alert in the run, sorted the way the rail shows them. */
export function mockFindings(): Finding[] {
  return [...FINDINGS].sort(
    (left, right) => right.amountAtRisk - left.amountAtRisk,
  );
}

/* --------------------------------------------------------- the payment run */

/**
 * Who sends the run offline.
 *
 * `docs/02-persona.md` names her and the generator already carries her, so this is
 * a re-export and not a second persona: a name invented here would end up on an
 * `X-Actor` header and on a ledger entry with no document behind it. ADR-0008 is
 * why there is a name at all, because nothing in this product leaves without a
 * person, and the screen shows whose name it is about to use before anything
 * happens.
 */
export const DEMO_ACTOR: Actor = ACTOR;

/**
 * What the run did on the rail, offline: the 86 lines of the 92 that nothing
 * stopped.
 *
 * `MemoryRepository` folds this out of the ledger and the generator folded the same
 * projection out of the same decisions and verifications, so the offline screen
 * reads the execution the API would answer for this run. The blocked beneficiary is
 * `cancelled` with the two names the CEP comparison read, the partial match is
 * `queued`, the last line handed over is `sent` because a rail acknowledges in its
 * own time, and the rest are `settled`. No line is `failed`: nothing in this company
 * produces a rail refusal and inventing a bank error to fill a state would be
 * inventing evidence.
 */
export function mockExecution(): PaymentExecution {
  return EXECUTION;
}

/**
 * The same lines in the order the stream would push them.
 *
 * The payments screen walks this offline instead of opening a connection, which is
 * what `?data=mock` promises. It is the real sequence and not a flourish: each line
 * arrives with the state the generator derived for it, so the one `sent` among 83
 * `settled` is still the line a judge can ask about.
 */
export function mockExecutionLines(): readonly PaymentExecutionLine[] {
  return EXECUTION.lines;
}

/**
 * One receipt, by the id the execution line carries.
 *
 * 84 of them, one per line that left, and none for a line that did not: a receipt
 * for a payment that never happened is the document this product may not produce.
 * `sealState` is `not_checked` on every one, which is the honest answer on the
 * mirror rather than a gap, because Nessie is a sandbox and there is no Banxico
 * document to check.
 */
export function mockReceipt(receiptId: string): PaymentReceipt | null {
  return RECEIPTS.find((receipt) => receipt.id === receiptId) ?? null;
}
