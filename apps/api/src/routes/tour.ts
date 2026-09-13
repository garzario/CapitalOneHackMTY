/**
 * The guided tour, and the telephone call that is the whole of it.
 *
 * A judge walks up to the stand, types their own mobile number into the screen,
 * and thirty seconds later their telephone rings. The line says what it is, reads
 * them one held payment of the seeded run, asks the single question the owner of
 * a company is the only person who can answer, and whatever they say is applied
 * to the line in front of them, on the ledger, with their answer quoted against
 * it. Ten minutes later the line goes back to where the control had it.
 *
 * Five properties this file is written to keep, and each one is a refusal
 * somewhere below.
 *
 * **The visitor's number is never stored, never logged and never shown.** It
 * arrives in a request body, it is handed to the telephony provider to place one
 * call, and the only thing that survives is `phoneHash`, a salted SHA-256. That
 * hash is the one field of this feature that reaches the ledger, and it is what
 * lets somebody who asks be told which line was theirs without this product
 * holding a telephone number. `docs/06-regulatory-privacy.md`, "El numero del
 * visitante", is the argument in full.
 *
 * **Consent is a literal `true` and not a boolean.** A body carrying `false` is
 * not a request with a flag off, it is a request to telephone somebody who did
 * not agree to it, and `tourCallBodySchema` refuses it before this file runs.
 *
 * **Any telephone number this schema calls E.164 is dialled.** There is no
 * country rule and no rate limit on this route: the shape in
 * `tourCallBodySchema` is the whole of what it checks. The version this replaced
 * took Mexican mobiles only behind a `TOUR_ALLOW_ANY_COUNTRY` flag, and refused a
 * second call to one number for ten minutes and a twenty-first call from the
 * instance in an hour. All three were written for a stand this product never
 * had: the people who type a number into this screen are judges and teammates,
 * their telephones are not all Mexican, and the demo is two days long. What those
 * rules actually bought was a visitor who could not be rung, a rehearsal that
 * could not be repeated, and a `429` whose sentence was about somebody else's
 * call. Consent, the owner role and `ALLOW_TOUR_CALLS` are what stand between
 * this endpoint and a telephone, and each of those is a person or an operator
 * deciding rather than a counter.
 *
 * **The assistant does not decide.** The parser in `packages/voice` reads what
 * the person said, and what is recorded is a `decision_made` signed by them,
 * through the very `recordDecision` that `POST /instructions/:id/decide` calls.
 * Not a raw event: a decision that skipped that helper would be a decision the
 * repository never made, and a replay of the ledger would show an action nobody
 * can trace to a person.
 *
 * **Nothing here is hard-coded to a folio.** `readTourFacts` derives the line the
 * tour is about from the repository on every request: the largest payment the
 * run stopped whose CLABE forensics finding is what stopped it. A reseed with a
 * different company moves the tour with it, which is the difference between a
 * demo and a fixture with a demo painted on it.
 *
 * **It reverts.** A judge who releases the payment has released it, on the
 * ledger, with their words; and ten minutes later the tour puts the line back so
 * the next judge sees the run the way the first one did. The revert is a
 * decision too, signed `Recorrido`, so the history says what happened rather than
 * quietly forgetting it.
 *
 * The degradation is the same shape as the verification call next door: with no
 * `ALLOW_TOUR_CALLS=1` the endpoint answers `403`, with no voice configuration it
 * answers `422` carrying the script, and `GET /api/v1/tour` says `callsEnabled:
 * false` so the screen offers to read the words instead of offering a form that
 * cannot work.
 */

import { createHash } from "node:crypto";
import type {
  Actor,
  Finding,
  OwnerOutcome,
  VerificationOutcome,
} from "@hackmty/core";
import { lookupPlaza, roleSatisfies } from "@hackmty/core";
import {
  buildOwnerScript,
  type Conversation,
  type HttpLike,
  type OwnerScript,
  parseOwnerOutcome,
  VoiceClient,
  VoiceError,
} from "@hackmty/voice";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import type { ApiDeps } from "../deps";
import { errorBody, fail, notFound, rejectInvalid, requestIdOf } from "../http";
import { actorOf, requireActor } from "../middleware/actor";
import type { Repository } from "../repo";
import {
  type PaymentRunItem,
  type TourCallStarted,
  type TourCallStatus,
  type TourHero,
  type TourResponse,
  tourCallBodySchema,
  tourConversationParamSchema,
} from "../schemas";
import { readEnv, readVoiceConfig } from "./verify-call";

/* -------------------------------------------------------------------------- */
/* What the tour writes on the ledger                                          */
/* -------------------------------------------------------------------------- */

/**
 * The three sentences the tour records, and they are written without accents.
 *
 * They are read on a screen and not out loud, so they follow the convention of
 * `apps/web/src/lib/labels.ts`, which writes "dueno" and "capturista" in plain
 * ASCII. `packages/voice` is the one place that breaks that rule, and it breaks
 * it because a text to speech model stresses "dia" and "día" differently. A
 * reason nobody hears has no such excuse.
 *
 * They are exported because the screens and `docs/09-api.md` quote them, and one
 * sentence in three places drifts in an afternoon.
 */
export const TOUR_HOLD_REASON = "El dueno la retuvo por telefono";
export const TOUR_RELEASE_REASON = "El dueno la libero por telefono";
export const TOUR_REVERT_REASON =
  "Fin del recorrido: la linea vuelve a su estado";

/**
 * Who signs the revert.
 *
 * Not the visitor. They said one thing and it was recorded; ten minutes later
 * the tour puts the line back for the next person, and attributing that to the
 * judge who just left would put an action on the ledger under a name that did
 * not take it. `Recorrido` is the tour itself, said plainly.
 */
export const TOUR_REVERT_ACTOR: Actor = { role: "owner", name: "Recorrido" };

/**
 * The owner's instruction, as the ledger's one verification vocabulary.
 *
 * `hold` maps onto `denied` and `release` onto `confirmed` because the ledger
 * records what a call proved about a payment and not which line placed it: a
 * timeline that had to switch on `line` before it could read an outcome would be
 * two histories in one table. `line: "owner"` is on the event for whoever wants
 * to tell them apart, and `ownerOutcome` carries the word the owner's question
 * was actually answered with.
 */
export const OWNER_OUTCOME_ON_LEDGER: Record<
  OwnerOutcome,
  VerificationOutcome
> = {
  hold: "denied",
  release: "confirmed",
  no_answer: "no_answer",
  unclear: "unclear",
};

/* -------------------------------------------------------------------------- */
/* Configuration                                                               */
/* -------------------------------------------------------------------------- */

/** How often the tour asks the provider whether the call has finished. */
export const DEFAULT_TOUR_POLL_INTERVAL_MS = 3_000;

/**
 * How long it keeps asking. Three minutes, because the call itself is written to
 * end under ninety seconds and the provider needs a moment after that to publish
 * the transcript. Finite on purpose: a loop with no deadline is a process that
 * asks a paid API forever about a call nobody is on.
 */
export const DEFAULT_TOUR_POLL_DEADLINE_MS = 180_000;

/** How long an applied decision stands before the line goes back. */
export const DEFAULT_TOUR_REVERT_MS = 600_000;

/**
 * The salt the visitor's number is hashed with when nothing configures one.
 *
 * A default and not a secret, and it is written down rather than generated so
 * that two processes of the same demo hash one number the same way.
 * `CONSORTIUM_SALT` wins when it exists, so a deployment that already rotates
 * one salt rotates this one with it.
 */
export const DEFAULT_TOUR_SALT = "sentryone-tour";

export interface TourOptions {
  /** `TOUR_POLL_INTERVAL_MS`. Zero means the tour starts no background work. */
  pollIntervalMs: number;
  /** `TOUR_POLL_DEADLINE_MS`. Zero means the same. */
  pollDeadlineMs: number;
  /** `TOUR_REVERT_MS`. Zero disables the revert and the response says zero. */
  revertAfterMs: number;
  /** `CONSORTIUM_SALT`, then `TOUR_SALT`, then the documented default. */
  salt: string;
  /** Injected so a test drives the whole wait in microseconds. */
  sleep(ms: number): Promise<void>;
}

/** A number somebody may legitimately set to zero, so zero is not "unset". */
function nonNegative(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw.trim() === "") {
    return fallback;
  }
  const parsed = Number(raw);

  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

export function defaultTourOptions(
  read: (name: string) => string | undefined,
): TourOptions {
  return {
    pollIntervalMs: nonNegative(
      read("TOUR_POLL_INTERVAL_MS"),
      DEFAULT_TOUR_POLL_INTERVAL_MS,
    ),
    pollDeadlineMs: nonNegative(
      read("TOUR_POLL_DEADLINE_MS"),
      DEFAULT_TOUR_POLL_DEADLINE_MS,
    ),
    revertAfterMs: nonNegative(read("TOUR_REVERT_MS"), DEFAULT_TOUR_REVERT_MS),
    salt: read("CONSORTIUM_SALT") ?? read("TOUR_SALT") ?? DEFAULT_TOUR_SALT,
    sleep: (ms) =>
      new Promise((resolve) => {
        setTimeout(resolve, ms);
      }),
  };
}

/** What the owner call needs before it can ring anybody. */
export interface OwnerVoiceConfig {
  apiKey: string;
  /** The SECOND agent, the one `bun run voice-setup --owner` created. */
  agentId: string;
  phoneNumberId: string;
}

/**
 * The four variables, read together.
 *
 * The three of the verification call plus `ELEVENLABS_OWNER_AGENT_ID`, and all
 * four or none. The owner agent alone cannot dial and the supplier agent alone
 * would ring a visitor and ask them to confirm somebody else's bank account,
 * which is the one call this product must never place.
 */
export function readOwnerVoiceConfig(): OwnerVoiceConfig | undefined {
  const base = readVoiceConfig();
  const agentId = readEnv("ELEVENLABS_OWNER_AGENT_ID");

  return base === undefined || agentId === undefined
    ? undefined
    : { apiKey: base.apiKey, agentId, phoneNumberId: base.phoneNumberId };
}

/** Injected so the suite drives the whole feature with no key and no network. */
export interface TourDeps {
  /**
   * Reads the four variables. Injected rather than read here so a teammate whose
   * `.env` holds real ElevenLabs keys gets exactly the results CI gets.
   */
  readConfig?: () => OwnerVoiceConfig | undefined;
  /** `ALLOW_TOUR_CALLS=1`, injected for the same reason. */
  allowCalls?: () => boolean;
  /** Defaults to the global `fetch`. A test passes a stub and stays offline. */
  http?: HttpLike;
  options?: TourOptions;
  /**
   * Handed the background poll of every call this router starts.
   *
   * The route answers `202` and does not await that promise, exactly like the
   * CEP poll in `src/verification.ts`, so a test that wanted to assert the
   * ledger would otherwise be racing it. A test collects the promise here and
   * awaits it; nothing in production sets this.
   */
  watch?(pending: Promise<void>): void;
}

/* -------------------------------------------------------------------------- */
/* The line the tour is about                                                  */
/* -------------------------------------------------------------------------- */

export interface TourFacts {
  hero: TourHero;
  /** The whole run line, so the caller need not look it up a second time. */
  heroLine: PaymentRunItem;
  listedSupplierRfc: string;
  cepInstructionId: string;
}

function hasDetector(item: PaymentRunItem, detector: Finding["detector"]) {
  return item.findings.some((finding) => finding.detector === detector);
}

/** Largest amount wins, and the id breaks a tie, so the answer never varies. */
function biggest(items: PaymentRunItem[]): PaymentRunItem | undefined {
  return [...items].sort(
    (a, b) =>
      b.instruction.amount - a.instruction.amount ||
      a.instruction.id.localeCompare(b.instruction.id),
  )[0];
}

/** A string off a finding's evidence, or undefined for anything else. */
function textOf(finding: Finding | undefined, key: string): string | undefined {
  const value = finding?.evidence[key];

  return typeof value === "string" && value.trim() !== "" ? value : undefined;
}

/** The three digits a CLABE encodes the plaza in, as a place a person says. */
function plazaCityOf(clabe: string): string {
  const digits = clabe.replace(/\D/g, "");

  return digits.length < 6 ? "" : (lookupPlaza(digits.slice(3, 6))?.city ?? "");
}

/**
 * Where this account was opened, and where the supplier has been paid before.
 *
 * Both are plain place names, because the call says them out loud: `plazaLabel`
 * in `@hackmty/core` writes "580 (APODACA, NL)", which is right on a screen and
 * wrong in an ear. The new one comes off the finding's own evidence when the
 * engine named it, so the telephone and the chip cannot disagree; the usual one
 * is computed from the accounts this supplier has actually been paid on.
 *
 * Either may come back empty, and empty is an answer: a code the catalogue does
 * not carry yields no name and `buildOwnerScript` then says the plaza is not
 * known rather than naming a city nobody can check. A supplier with no previous
 * account yields nothing at all, and the call says there is no history, which is
 * the ADR-0002 rule about invented data applied to speech.
 */
function plazasOf(item: PaymentRunItem): {
  plazaNew: string;
  plazaUsual: string;
} {
  const forensics = item.findings.find(
    (finding) => finding.detector === "clabe_forensics",
  );
  const plazaNew =
    textOf(forensics, "plazaCity") ?? plazaCityOf(item.instruction.clabe);

  const previous = new Set<string>();
  for (const account of item.supplier.knownAccounts) {
    const city = plazaCityOf(account.clabe);
    if (city !== "") {
      previous.add(city);
    }
  }

  return { plazaNew, plazaUsual: [...previous].sort().join(" y ") };
}

/**
 * The three lines the tour points at, derived from the run rather than named.
 *
 * - The hero is the largest payment the run STOPPED that a CLABE forensics
 *   finding is standing against. Stopped and not merely flagged, because the
 *   question the owner is asked is what to do with a payment that is being held,
 *   and asking it about a line nothing stopped would be theatre.
 * - The listed supplier is whoever this run pays that the SAT list names, read
 *   off the `sat_69b` finding the engine authored rather than off a second
 *   lookup, so the tour and the screen agree about who is listed.
 * - The CEP line is the largest payment no control stops at all, which is
 *   exactly why the Banxico receipt is the only thing that can say anything
 *   about it. `docs/10-demo-script.md` describes that beat in the same words.
 *
 * `undefined` when this store holds no run with a stopped CLABE line, which is a
 * real state (an empty database, a company seeded with nothing wrong) and is
 * answered `404` rather than papered over with an invented folio.
 */
export async function readTourFacts(
  repo: Repository,
): Promise<TourFacts | undefined> {
  const run = await repo.currentRun();

  const heroLine = biggest(
    run.items.filter(
      (item) =>
        item.decision !== null &&
        item.decision.action !== "release" &&
        hasDetector(item, "clabe_forensics"),
    ),
  );
  if (heroLine === undefined) {
    return undefined;
  }

  const listed = biggest(
    run.items.filter((item) => hasDetector(item, "sat_69b")),
  );
  const cepLine = biggest(
    run.items.filter((item) => item.findings.length === 0),
  );

  return {
    heroLine,
    hero: {
      instructionId: heroLine.instruction.id,
      supplierRfc: heroLine.instruction.supplierRfc,
      supplierName: heroLine.supplier.legalName,
      amount: heroLine.instruction.amount,
      /* Four digits, like every other surface of this product. No field of this
         payload carries the CLABE, and neither does the call. */
      accountLast4: heroLine.instruction.clabe.replace(/\D/g, "").slice(-4),
      ...plazasOf(heroLine),
    },
    listedSupplierRfc: listed?.instruction.supplierRfc ?? "",
    cepInstructionId: cepLine?.instruction.id ?? "",
  };
}

/** The words of this call, built from the line the tour just derived. */
function scriptFor(facts: TourFacts, ownerName: string): OwnerScript {
  return buildOwnerScript({
    supplierLegalName: facts.hero.supplierName,
    clabe: facts.heroLine.instruction.clabe,
    amount: facts.hero.amount,
    plazaNew: facts.hero.plazaNew,
    plazaUsual: facts.hero.plazaUsual,
    ownerName,
  });
}

/** Only the part of the script that goes on the wire. No CLABE, ever. */
function wireScript(script: OwnerScript) {
  return {
    firstMessage: script.firstMessage,
    question: script.question,
    spoken: script.spoken,
  };
}

/* -------------------------------------------------------------------------- */
/* The visitor's number                                                        */
/* -------------------------------------------------------------------------- */

/**
 * The only thing this product ever holds about the number that was dialled.
 *
 * Salt first and then the number, which is the order `packages/consortium`
 * hashes a pair in, so the two salted hashes of this repository are built the
 * same way. It is deliberately reproducible: the same number gives the same hash
 * on the same salt, which is what lets somebody who asks be told which hash is
 * theirs.
 */
export function hashPhone(salt: string, phone: string): string {
  return createHash("sha256").update(`${salt}${phone}`).digest("hex");
}

/* -------------------------------------------------------------------------- */
/* The calls this process started                                              */
/* -------------------------------------------------------------------------- */

/**
 * One call, as `GET /api/v1/tour/call/:conversationId` reports it.
 *
 * In memory and per process, which is the honest limit of not adding a store for
 * something that lives ten minutes: a conversation this process did not start
 * answers `404`. The screen does not need it in the ordinary case either, because
 * both events reach it over the existing SSE stream; this endpoint is the
 * fallback for a browser that could not hold the stream open.
 *
 * The number that was dialled is NOT in here. `phoneHash` is.
 */
interface TourCall {
  conversationId: string;
  instructionId: string;
  phoneHash: string;
  status: Conversation["status"];
  ownerOutcome?: OwnerOutcome;
  evidence?: string;
  appliedAt?: string;
  revertsAt?: string;
}

function statusResponse(call: TourCall): TourCallStatus {
  return {
    conversationId: call.conversationId,
    status: call.status,
    ...(call.ownerOutcome === undefined
      ? {}
      : { ownerOutcome: call.ownerOutcome }),
    ...(call.evidence === undefined ? {} : { evidence: call.evidence }),
    ...(call.appliedAt === undefined ? {} : { appliedAt: call.appliedAt }),
    ...(call.revertsAt === undefined ? {} : { revertsAt: call.revertsAt }),
  };
}

/* -------------------------------------------------------------------------- */
/* The routes                                                                  */
/* -------------------------------------------------------------------------- */

/** What the visitor is told when this instance has no telephony to use. */
const NO_VOICE_MESSAGE =
  "The owner call is not configured on this instance (ELEVENLABS_API_KEY, ELEVENLABS_AGENT_ID, ELEVENLABS_PHONE_NUMBER_ID, ELEVENLABS_OWNER_AGENT_ID). The words the line would have said are in `script`.";

const CALLS_OFF_MESSAGE =
  "The guided tour does not place calls on this instance. Set ALLOW_TOUR_CALLS=1 to let it ring a telephone; every other part of the tour works without it.";

const NO_TOUR_MESSAGE =
  "This instance holds no payment run with a stopped line that CLABE forensics is standing against, so there is nothing for the tour to be about. Seed the demo company (SEED=sentryone, or bun run seed) and ask again.";

const OWNER_ONLY_MESSAGE =
  "The tour call is the owner's line: it asks whether a held payment stays held or is released under the answerer's own name, and only an owner can release one. Send X-Actor with role=owner.";

export function tourRoutes(deps: ApiDeps, tour: TourDeps = {}) {
  const options = tour.options ?? defaultTourOptions(readEnv);
  const readConfig = tour.readConfig ?? readOwnerVoiceConfig;
  const allowCalls =
    tour.allowCalls ?? (() => readEnv("ALLOW_TOUR_CALLS") === "1");
  const calls = new Map<string, TourCall>();

  /**
   * Asks the provider until the call is finished, then applies what was said.
   *
   * The elapsed time is the sum of the intervals rather than a clock reading, the
   * way `pollForCep` in `src/verification.ts` does it, so an injected `sleep`
   * that returns immediately runs the whole budget in microseconds and a test
   * asserts the end of the machine with no timers at all. `undefined` when there
   * is no budget to spend, which is how the suite stays free of background work.
   *
   * A failure inside the loop is swallowed and logged, and only here: the caller
   * already has its `202`, nothing has been applied, and an unhandled rejection
   * in a detached promise would take the process down over a telephone call.
   */
  function follow(
    entry: TourCall,
    facts: TourFacts,
    script: OwnerScript,
    actor: Actor,
    client: VoiceClient,
  ): Promise<void> | undefined {
    if (options.pollDeadlineMs <= 0 || options.pollIntervalMs <= 0) {
      return undefined;
    }

    return (async () => {
      let waited = 0;

      while (waited < options.pollDeadlineMs) {
        await options.sleep(options.pollIntervalMs);
        waited += options.pollIntervalMs;

        const conversation = await client.getConversation(entry.conversationId);
        entry.status = conversation.status;

        if (conversation.status === "failed") {
          return;
        }
        if (conversation.status === "done") {
          await apply(entry, conversation, facts, script, actor);
          return;
        }
      }
    })().catch((cause: unknown) => {
      entry.status = "failed";
      deps.log(
        `[tour] the call ${entry.conversationId} stopped: ${String(cause)}`,
      );
    });
  }

  /**
   * Writes what the owner said, and then what they decided.
   *
   * Two events and never one. The call is evidence and it is recorded whatever
   * was said, including the two answers that are not an instruction; the decision
   * is a separate act, it only exists when the owner actually gave one, and it
   * goes through `recordDecision`, which is the very helper
   * `POST /instructions/:id/decide` calls. `deps.emit` appends before it
   * publishes, so no subscriber can see an event the ledger does not hold.
   */
  async function apply(
    entry: TourCall,
    conversation: Conversation,
    facts: TourFacts,
    script: OwnerScript,
    actor: Actor,
  ): Promise<void> {
    const reading = parseOwnerOutcome(conversation.transcript);
    const at = deps.clock.now();

    entry.ownerOutcome = reading.outcome;
    if (reading.evidence !== undefined) {
      entry.evidence = reading.evidence;
    }

    await deps.emit({
      type: "verification_call",
      at,
      instructionId: facts.hero.instructionId,
      supplierRfc: facts.hero.supplierRfc,
      outcome: OWNER_OUTCOME_ON_LEDGER[reading.outcome],
      clabeLast4: script.clabeLast4,
      ...(reading.evidence === undefined ? {} : { evidence: reading.evidence }),
      transcript: conversation.transcript,
      conversationId: entry.conversationId,
      manual: false,
      line: "owner",
      phoneHash: entry.phoneHash,
      ownerOutcome: reading.outcome,
      question: script.question,
      actor,
    });

    /* `no_answer` and `unclear` apply nothing, which is the whole of their
       meaning: the payment stays exactly where the control left it. */
    if (reading.outcome !== "hold" && reading.outcome !== "release") {
      return;
    }

    const decision = await deps.repo.recordDecision(
      facts.hero.instructionId,
      reading.outcome,
      actor,
      at,
      reading.outcome === "hold" ? TOUR_HOLD_REASON : TOUR_RELEASE_REASON,
    );
    if (decision === undefined) {
      return;
    }
    await deps.emit({
      type: "decision_made",
      at: decision.decidedAt,
      decision,
    });

    entry.appliedAt = at;
    if (options.revertAfterMs <= 0) {
      return;
    }
    entry.revertsAt = new Date(
      Date.parse(at) + options.revertAfterMs,
    ).toISOString();

    await revert(facts);
  }

  /**
   * Puts the line back, so the next visitor sees the run the first one saw.
   *
   * A decision like any other, signed `Recorrido` and carrying its reason, rather
   * than a deletion: an append-only ledger that quietly forgot an action would be
   * worth less than one that records the tour undoing it. It is awaited inside
   * the detached poll rather than fired separately, which is what lets a test
   * await one promise and see all three events.
   */
  async function revert(facts: TourFacts): Promise<void> {
    await options.sleep(options.revertAfterMs);

    const at = deps.clock.now();
    const decision = await deps.repo.recordDecision(
      facts.hero.instructionId,
      "hold",
      TOUR_REVERT_ACTOR,
      at,
      TOUR_REVERT_REASON,
    );
    if (decision === undefined) {
      return;
    }

    await deps.emit({
      type: "decision_made",
      at: decision.decidedAt,
      decision,
    });
  }

  return new Hono()
    .get("/", async (c) => {
      const facts = await readTourFacts(deps.repo);
      if (facts === undefined) {
        return notFound(c, NO_TOUR_MESSAGE);
      }

      const response: TourResponse = {
        /* Both halves, because either one alone is a form that cannot work: the
           flag says this instance is willing and the configuration says it is
           able. The screen shows the words either way. */
        callsEnabled: allowCalls() && readConfig() !== undefined,
        hero: facts.hero,
        listedSupplierRfc: facts.listedSupplierRfc,
        cepInstructionId: facts.cepInstructionId,
        revertAfterMs: options.revertAfterMs,
      };

      return c.json(response);
    })
    .post(
      "/call",
      requireActor,
      zValidator("json", tourCallBodySchema, rejectInvalid),
      async (c) => {
        const actor = actorOf(c);
        const { phone } = c.req.valid("json");

        /* A clerk cannot release a payment something stands against, which is
           half of what this call asks, so a clerk cannot place it. `400` and not
           `403`: `403` on this endpoint means the instance does not ring
           telephones at all, and a screen switching on the status has to be able
           to tell the two apart. */
        if (!roleSatisfies(actor.role, "owner")) {
          return fail(c, 400, "bad_request", OWNER_ONLY_MESSAGE);
        }
        if (!allowCalls()) {
          return fail(c, 403, "forbidden", CALLS_OFF_MESSAGE);
        }

        const facts = await readTourFacts(deps.repo);
        if (facts === undefined) {
          return notFound(c, NO_TOUR_MESSAGE);
        }
        const script = scriptFor(facts, actor.name);

        const config = readConfig();
        if (config === undefined) {
          /* The same degradation as `/verify-call`, and the same reason: a 422
             whose body was only a message would send a visitor looking for the
             script somewhere else. */
          return c.json(
            {
              ...errorBody("unprocessable", NO_VOICE_MESSAGE, requestIdOf(c)),
              script: wireScript(script),
            },
            422,
          );
        }

        /* Hashed once, here, and the number is never read again. */
        const phoneHash = hashPhone(options.salt, phone);

        const client = new VoiceClient({
          apiKey: config.apiKey,
          http: tour.http ?? fetch,
        });
        const call = await client
          .startOutboundCall({
            agentId: config.agentId,
            agentPhoneNumberId: config.phoneNumberId,
            toNumber: phone,
            /* This line's own words, per call. The agent the provider stores
               carries the rules and empty slots, so no supplier, no amount and
               no digits sit in somebody else's dashboard. */
            dynamicVariables: script.dynamicVariables,
          })
          .catch((thrown: unknown) =>
            thrown instanceof VoiceError
              ? thrown
              : new VoiceError("http_error", "the provider was unreachable"),
          );

        if (call instanceof VoiceError || !call.success) {
          const detail =
            call instanceof VoiceError ? call.code : "the call was refused";

          return c.json(
            {
              ...errorBody(
                "unprocessable",
                `The voice provider could not place the call right now (${detail}). The words are in \`script\`.`,
                requestIdOf(c),
              ),
              script: wireScript(script),
            },
            422,
          );
        }

        const conversationId = call.conversationId ?? "";
        if (conversationId === "") {
          return c.json(
            {
              ...errorBody(
                "unprocessable",
                "The voice provider placed the call and named no conversation, so there is nothing to follow. The words are in `script`.",
                requestIdOf(c),
              ),
              script: wireScript(script),
            },
            422,
          );
        }

        const entry: TourCall = {
          conversationId,
          instructionId: facts.hero.instructionId,
          phoneHash,
          status: "initiated",
        };
        calls.set(conversationId, entry);

        /* Not awaited. The telephone is ringing and the answer says so; the
           outcome reaches the screen over the event stream, and this endpoint's
           `GET` is the fallback for a browser with no stream. */
        const pending = follow(entry, facts, script, actor, client);
        if (pending !== undefined) {
          tour.watch?.(pending);
        }

        const response: TourCallStarted = {
          conversationId,
          instructionId: facts.hero.instructionId,
          script: wireScript(script),
          revertAfterMs: options.revertAfterMs,
        };

        return c.json(response, 202);
      },
    )
    .get(
      "/call/:conversationId",
      zValidator("param", tourConversationParamSchema, rejectInvalid),
      (c) => {
        const { conversationId } = c.req.valid("param");
        const call = calls.get(conversationId);

        return call === undefined
          ? notFound(
              c,
              `This process did not start a tour call with id ${conversationId}. The registry of tour calls lives in memory and for ten minutes.`,
            )
          : c.json(statusResponse(call));
      },
    );
}
