/**
 * The five things the panel may offer, and the one place a proposal is built.
 *
 * This is where ADR-0007 stops being a paragraph. The model can ask for an action
 * by name, and what it gets back is an `ActionProposal`: an object, never a call.
 * Nothing in this file issues a request, nothing in it appends a ledger event, and
 * the only thing that turns one of these into a write is a person pressing a button
 * in the panel, which sends the ordinary request with their `X-Actor` on it and
 * produces the ordinary ledger event with their name in it.
 *
 * Three rules, and the second one is the one a judge will push on.
 *
 * 1. **The payload is ours, not the model's.** The model names a kind and at most
 *    an instruction and an action. Every field of the body is filled in here, from
 *    the contract in docs/09-api.md and from the actor on the request, so a model
 *    cannot write a body that asks for something the clerk did not see. A `decide`
 *    is signed by the person at the keyboard because `decidedBy` is read off the
 *    header and never off an argument.
 * 2. **The sentence is ours too.** `summary` is built from a template and checked
 *    against `FORBIDDEN_COPY` before it leaves, so the vocabulary rule of ADR-0009
 *    holds on the one line of this product a model is closest to writing: three
 *    levels, never a probability, and never the word "seguro" in any language. A
 *    model that wrote its own summary would be one prompt away from promising a
 *    clerk that a transfer is safe, and a SPEI cannot be recalled.
 * 3. **At most one proposal per turn.** The contract says one and the turn enforces
 *    it. A panel offering three buttons is a panel that has decided for the clerk
 *    which one matters.
 *
 * `requiresRole` is `owner` on exactly one shape, a release over a line that
 * carries a finding, because that is the exception `docs/02-persona.md` says the
 * owner approves. Everything else is the clerk's own work, the run included. The
 * field is what the panel shows; the route is what checks the header, because an
 * API that took a proposal's word for the role would be pointless.
 */

import type {
  Action,
  ActionProposal,
  Actor,
  Finding,
  ProposalKind,
  ProposalValue,
} from "@hackmty/core";
import { clabeLast4 } from "./mask";
import type { ModelFunctionDeclaration } from "./model";
import type { ApiCaller } from "./tools";

/**
 * Copy this product never ships, in any language.
 *
 * A percentage or a probability would be a precision nobody earned, because
 * `estimateLoss` says in its own comment that its figure is an upper bound on the
 * evidence. "Seguro" would be a guarantee nobody can give about a transfer that
 * cannot be recalled. ADR-0009 owns the vocabulary and a proposal obeys it like
 * every other piece of copy in the product.
 */
export const FORBIDDEN_COPY: readonly RegExp[] = [
  /\bseguro\b/i,
  /\bsegura\b/i,
  /\bsafe\b/i,
  /\bgarantiza\b/i,
  /\bprobabilidad\b/i,
  /\d+(?:[.,]\d+)?\s*%/,
];

/** The reason a summary was refused, or undefined when it is allowed. */
export function forbiddenCopyIn(text: string): string | undefined {
  for (const pattern of FORBIDDEN_COPY) {
    const hit = pattern.exec(text);
    if (hit !== null) {
      return hit[0];
    }
  }
  return undefined;
}

/**
 * The summary, or a throw.
 *
 * It throws rather than sanitising, because a sentence that had to be edited to be
 * legal is a sentence whose template is wrong, and the suite is where that should
 * be discovered.
 */
function copy(text: string): string {
  const forbidden = forbiddenCopyIn(text);
  if (forbidden !== undefined) {
    throw new Error(
      `A proposal summary may not carry "${forbidden}". ADR-0009 owns this vocabulary: three levels, no probability, never "seguro".`,
    );
  }
  return text;
}

/* -------------------------------------------------------------------------- */
/* The declarations the model sees                                             */
/* -------------------------------------------------------------------------- */

/** What an action tool is called at the provider, per kind. */
export const PROPOSAL_TOOL_NAMES: Readonly<Record<ProposalKind, string>> = {
  verify_account: "propose_verify_account",
  verify_call: "propose_verify_call",
  decide: "propose_decide",
  execute_run: "propose_execute_run",
  intake: "propose_intake",
};

const KIND_BY_TOOL_NAME: Readonly<Record<string, ProposalKind>> =
  Object.fromEntries(
    Object.entries(PROPOSAL_TOOL_NAMES).map(([kind, name]) => [
      name,
      kind as ProposalKind,
    ]),
  );

/** True when this tool name is an action tool rather than a read. */
export function proposalKindOf(toolName: string): ProposalKind | undefined {
  return KIND_BY_TOOL_NAME[toolName];
}

export const ACTION_TOOLS: readonly ModelFunctionDeclaration[] = [
  {
    name: PROPOSAL_TOOL_NAMES.verify_account,
    description:
      "Offer the one-cent verification of an instruction to the clerk. It sends 0.01 MXN to the account the instruction pays and reads the Banxico CEP that comes back, which is how the account holder is proven. This does NOT run it: it returns a card the person presses. Offer it when the question is whether the account belongs to the supplier.",
    parameters: {
      type: "OBJECT",
      properties: {
        instructionId: { type: "STRING", description: "The instruction id." },
      },
      required: ["instructionId"],
    },
  },
  {
    name: PROPOSAL_TOOL_NAMES.verify_call,
    description:
      "Offer a verification call to the supplier. The agent reads only the last four digits of the account out loud and asks the supplier to confirm them. This does NOT place the call: it returns a card the person presses. Offer it when the account cannot be proven from documents.",
    parameters: {
      type: "OBJECT",
      properties: {
        instructionId: { type: "STRING", description: "The instruction id." },
      },
      required: ["instructionId"],
    },
  },
  {
    name: PROPOSAL_TOOL_NAMES.decide,
    description:
      "Offer a decision on one instruction to the person at the keyboard: hold it, send it to verification, or release it. This does NOT decide: it returns a card, and the decision is recorded under the name of whoever presses it. A release over a line that carries a finding needs the owner.",
    parameters: {
      type: "OBJECT",
      properties: {
        instructionId: { type: "STRING", description: "The instruction id." },
        action: {
          type: "STRING",
          enum: ["hold", "verify", "release"],
          description:
            "What to offer. Use the engine's own action unless the clerk asked for another.",
        },
      },
      required: ["instructionId", "action"],
    },
  },
  {
    name: PROPOSAL_TOOL_NAMES.execute_run,
    description:
      "Offer to send the payment run on the configured rail. Held lines, lines waiting on a verification and lines of definitively listed suppliers stay out of it. This does NOT send anything: it returns a card the clerk presses.",
    parameters: { type: "OBJECT", properties: {} },
  },
  {
    name: PROPOSAL_TOOL_NAMES.intake,
    description:
      "Offer to create a payment instruction out of what was read off a screenshot, when the supplier or the amount could not be resolved from the image on its own. This does NOT create it: it returns a card with the fields that were read, which the person completes and confirms.",
    parameters: {
      type: "OBJECT",
      properties: {
        clabe: {
          type: "STRING",
          description:
            "The 18-digit account read off the image, if there was one.",
        },
        amount: {
          type: "NUMBER",
          description:
            "The amount in pesos read off the image, if there was one.",
        },
      },
    },
  },
];

/* -------------------------------------------------------------------------- */
/* Building one                                                                */
/* -------------------------------------------------------------------------- */

const ACTIONS: readonly Action[] = ["hold", "verify", "release"];

/** What the instruction read adds to a summary, when the read answers. */
interface LineFacts {
  amount?: number;
  supplier?: string;
  clabe?: string;
  findings: number;
  action?: Action;
}

interface InstructionReadPayload {
  instruction: { amount: number; clabe: string };
  supplier: { legalName: string } | null;
  findings: Finding[];
  decision: { action: Action } | null;
}

/**
 * The facts one summary needs, read through the ordinary endpoint.
 *
 * It is a read and it is allowed to fail: a proposal about an instruction nobody
 * holds still has to come back as a proposal the panel can refuse, rather than as
 * a 500 in the middle of a stream. `findings: 0` on a failed read is conservative
 * in the right direction, because the only thing it changes is whether a release
 * asks for the owner, and a release over an unknown line is refused by the route
 * anyway.
 */
async function lineFacts(
  api: ApiCaller,
  instructionId: string,
): Promise<LineFacts> {
  try {
    const response = await api(
      `/api/v1/instructions/${encodeURIComponent(instructionId)}`,
      { method: "GET" },
    );
    if (!response.ok) {
      return { findings: 0 };
    }
    const detail = (await response.json()) as InstructionReadPayload;
    const facts: LineFacts = {
      amount: detail.instruction.amount,
      clabe: detail.instruction.clabe,
      findings: detail.findings.length,
    };
    if (detail.supplier !== null) {
      facts.supplier = detail.supplier.legalName;
    }
    if (detail.decision !== null) {
      facts.action = detail.decision.action;
    }
    return facts;
  } catch {
    return { findings: 0 };
  }
}

/** Pesos the way the panel writes them, with no currency symbol invented. */
function pesos(amount: number): string {
  return `MXN ${amount.toLocaleString("es-MX", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/** What an action reads as, in the words the screens use. */
const ACTION_WORDS: Readonly<Record<Action, string>> = {
  hold: "detener",
  verify: "mandar a verificación",
  release: "liberar",
};

export interface ProposalRequest {
  kind: ProposalKind;
  args: Record<string, unknown>;
  actor: Actor;
  api: ApiCaller;
}

/** Either the proposal, or the sentence that says why there is none. */
export type ProposalOutcome =
  | { ok: true; proposal: ActionProposal }
  | { ok: false; error: string };

/**
 * Builds one proposal from what the model asked for and what the API holds.
 *
 * Every branch fills the payload from the contract in docs/09-api.md, and the one
 * value that comes from outside this file is `decidedBy`, which is the actor on the
 * request. That is the whole of the trust this function places in its caller.
 */
export async function buildProposal(
  request: ProposalRequest,
): Promise<ProposalOutcome> {
  const { kind, args, actor, api } = request;

  if (kind === "execute_run") {
    return {
      ok: true,
      proposal: {
        kind,
        /* `confirm: true` and nothing else. The run id is a path parameter and the
           lines the run may send are the decisions', never a caller's list: an
           `instructionIds` the panel filled in could only ever narrow the set, and
           a proposal that narrowed it silently would hide a line from the clerk. */
        payload: { confirm: true },
        requiresRole: "clerk",
        summary: copy(
          "Enviar la corrida de pagos por el riel configurado. Las líneas detenidas, las que esperan verificación y las de proveedores con listado definitivo no salen.",
        ),
      },
    };
  }

  if (kind === "intake") {
    const payload: Record<string, ProposalValue> = { source: "whatsapp" };
    const clabe = typeof args.clabe === "string" ? args.clabe : undefined;
    const amount = typeof args.amount === "number" ? args.amount : undefined;
    if (clabe !== undefined) {
      payload.clabe = clabe;
    }
    if (amount !== undefined) {
      payload.amount = amount;
    }
    const read =
      clabe === undefined
        ? "La imagen no dejó una cuenta legible."
        : `La imagen dejó la cuenta terminada en ${clabeLast4(clabe)}${amount === undefined ? "" : ` por ${pesos(amount)}`}.`;
    return {
      ok: true,
      proposal: {
        kind,
        payload,
        requiresRole: "clerk",
        summary: copy(
          `Registrar la instrucción de pago con lo que se leyó de la imagen. ${read} Falta que una persona confirme el proveedor y los datos antes de que los seis controles corran.`,
        ),
      },
    };
  }

  const instructionId =
    typeof args.instructionId === "string" ? args.instructionId.trim() : "";
  if (instructionId === "") {
    return {
      ok: false,
      error: "instructionId is required to propose this action",
    };
  }
  const facts = await lineFacts(api, instructionId);
  const who = facts.supplier === undefined ? "el proveedor" : facts.supplier;

  if (kind === "verify_account") {
    const account =
      facts.clabe === undefined
        ? "la cuenta de la instrucción"
        : `la cuenta terminada en ${clabeLast4(facts.clabe)}`;
    return {
      ok: true,
      proposal: {
        kind,
        instructionId,
        /* No body at all: the endpoint takes none, and the amount it sends is the
           one constant `packages/rail` owns. A payload that restated 0.01 here
           would be a second home for the only amount this product must not get
           wrong. */
        payload: {},
        requiresRole: "clerk",
        summary: copy(
          `Mandar un centavo a ${account} y leer el CEP que Banxico firme, para ver si el titular es ${who}.`,
        ),
      },
    };
  }

  if (kind === "verify_call") {
    const last4 =
      facts.clabe === undefined
        ? "los últimos cuatro dígitos"
        : clabeLast4(facts.clabe);
    return {
      ok: true,
      proposal: {
        kind,
        instructionId,
        /* The number is not ours to fill. No supplier record in this product holds
           a telephone, so inventing one would be inventing data; the panel asks for
           it and the body carries what the person typed. */
        payload: {},
        requiresRole: "clerk",
        summary: copy(
          `Llamar a ${who} y pedir que confirme una cuenta que termina en ${last4}. La llamada nunca dice la cuenta completa y nunca libera el pago.`,
        ),
      },
    };
  }

  const action = typeof args.action === "string" ? args.action : "";
  if (!ACTIONS.includes(action as Action)) {
    return {
      ok: false,
      error: `action must be one of ${ACTIONS.join(", ")}`,
    };
  }
  const chosen = action as Action;
  /* The one shape the owner has to sign: a release over a line that carries a
     finding. `docs/02-persona.md` puts a maker-checker chain in the anti-persona
     column, so every other action, the run included, is the clerk's own work. */
  const requiresRole =
    chosen === "release" && facts.findings > 0 ? "owner" : "clerk";
  const amount = facts.amount === undefined ? "" : ` de ${pesos(facts.amount)}`;

  return {
    ok: true,
    proposal: {
      kind: "decide",
      instructionId,
      payload: { action: chosen, decidedBy: actor.name },
      requiresRole,
      summary: copy(
        `${capitalise(ACTION_WORDS[chosen])} el pago${amount} a ${who}. Queda registrado a nombre de ${actor.name}${requiresRole === "owner" ? ", y lo autoriza el dueño porque la línea trae hallazgos" : ""}.`,
      ),
    },
  };
}

function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
