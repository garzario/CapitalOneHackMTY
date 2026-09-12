/**
 * The warehouse side of the consortium: one table and one view.
 *
 * It is deliberately small. The operational ledger lives on Tiger Data per
 * company and answers in milliseconds on the hot path; this is the cold,
 * cross-tenant store, and the only question it is asked is "who else pays this
 * hashed pair, since when, and has anybody reported it". A schema that could
 * answer more than that would be a schema holding more than it should.
 *
 * `BENEFICIARY_EVENTS` is append-only by intent: one row per (tenant, pair,
 * outcome, date). Nothing in it identifies a company, a supplier, an account, a
 * person or an amount. `synthetic` is the watermark ADR-0002 requires, and the
 * demo network sets it to TRUE on every row, which is also what lets a judge
 * check the claim instead of taking it.
 *
 * `BENEFICIARY_NETWORK` is the aggregate the pull reads. It is a view and not a
 * table so there is nothing to refresh and nothing to go stale: the pull gets
 * whatever the events say at that moment, and the local snapshot carries the
 * instant it was taken.
 */

/** Statements are separate strings: the SQL API takes one statement per call. */
export interface DdlOptions {
  database?: string;
  schema?: string;
}

export const DEFAULT_DATABASE = "SENTRYONE";
export const DEFAULT_SCHEMA = "CONSORTIUM";

/** The four outcomes a tenant may report. Enforced in the table, not in prose. */
export const OUTCOMES = [
  "verified",
  "paid",
  "mismatch",
  "fraud_reported",
] as const;

export type Outcome = (typeof OUTCOMES)[number];

/**
 * An identifier for a Snowflake DDL statement, refused unless it is a plain
 * unquoted name.
 *
 * The database and the schema arrive from the environment and end up
 * concatenated into SQL, which is the one place in this package where a string
 * becomes code. Snowflake's SQL API takes no bind variables for identifiers, so
 * the defence is a whitelist rather than a parameter.
 */
function identifier(name: string, field: string): string {
  const candidate = name.trim().toUpperCase();
  if (!/^[A-Z_][A-Z0-9_$]{0,254}$/.test(candidate)) {
    throw new Error(
      `${field} must be a plain Snowflake identifier, got "${name}".`,
    );
  }
  return candidate;
}

/**
 * Everything needed to stand the network up, in order.
 *
 * Idempotent: every statement is `if not exists` or `or replace`, so
 * `bun run consortium:seed` can be run twice without a second database or a
 * duplicated view. The row load is a separate call, because it is data and this
 * is schema.
 */
export function consortiumDdl(options: DdlOptions = {}): string[] {
  const database = identifier(
    options.database ?? DEFAULT_DATABASE,
    "SNOWFLAKE_DATABASE",
  );
  const schema = identifier(
    options.schema ?? DEFAULT_SCHEMA,
    "SNOWFLAKE_SCHEMA",
  );
  const qualified = `${database}.${schema}`;

  return [
    `create database if not exists ${database}`,
    `create schema if not exists ${qualified}`,
    `create table if not exists ${qualified}.BENEFICIARY_EVENTS (
       tenant_hash  varchar(64)  not null,
       rfc_hash     varchar(64)  not null,
       clabe_hash   varchar(64)  not null,
       bank_code    varchar(3)   not null,
       outcome      varchar(16)  not null,
       event_date   date         not null,
       synthetic    boolean      not null default false,
       constraint beneficiary_events_outcome
         check (outcome in ('verified', 'paid', 'mismatch', 'fraud_reported'))
     )`,
    /* One row per hashed pair, which is exactly what the local snapshot holds.
       `other_accounts` is counted over the whole table for the rfc_hash and this
       account is subtracted, so it answers "how many OTHER accounts do other
       companies pay this supplier on", which is the impersonation signal. */
    `create or replace view ${qualified}.BENEFICIARY_NETWORK as
       with accounts_per_rfc as (
         select rfc_hash, count(distinct clabe_hash) as accounts
         from ${qualified}.BENEFICIARY_EVENTS
         group by rfc_hash
       )
       select events.rfc_hash                                as rfc_hash,
              events.clabe_hash                              as clabe_hash,
              max(events.bank_code)                          as bank_code,
              count(distinct events.tenant_hash)             as tenants,
              min(events.event_date)                         as first_seen,
              max(events.event_date)                         as last_seen,
              count(distinct case when events.outcome = 'fraud_reported'
                                  then events.tenant_hash end) as fraud_reports,
              max(accounts_per_rfc.accounts) - 1             as other_accounts,
              min(case when events.synthetic then 1 else 0 end) = 1 as synthetic
       from ${qualified}.BENEFICIARY_EVENTS as events
       join accounts_per_rfc
         on accounts_per_rfc.rfc_hash = events.rfc_hash
       group by events.rfc_hash, events.clabe_hash`,
  ];
}

/** `select` the pull runs against the view. Ordered so a diff of two pulls reads. */
export function networkSelect(options: DdlOptions = {}): string {
  const database = identifier(
    options.database ?? DEFAULT_DATABASE,
    "SNOWFLAKE_DATABASE",
  );
  const schema = identifier(
    options.schema ?? DEFAULT_SCHEMA,
    "SNOWFLAKE_SCHEMA",
  );

  return `select rfc_hash, clabe_hash, bank_code, tenants, first_seen, last_seen,
                 fraud_reports, other_accounts
          from ${database}.${schema}.BENEFICIARY_NETWORK
          order by rfc_hash, clabe_hash`;
}

/** One row as it goes into `BENEFICIARY_EVENTS`. Nothing here identifies anybody. */
export interface BeneficiaryEvent {
  tenantHash: string;
  rfcHash: string;
  clabeHash: string;
  bankCode: string;
  outcome: Outcome;
  /** ISO YYYY-MM-DD. A date and not an instant: a day is all the network needs. */
  eventDate: string;
  synthetic: boolean;
}

/** How many rows one insert carries. Snowflake takes a long VALUES list happily. */
export const INSERT_CHUNK = 500;

/** A single-quoted SQL literal, with quotes doubled. */
function literal(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

/**
 * Hex of the right length, and nothing else, for a value that is about to be
 * concatenated into SQL.
 *
 * The hashes are produced by `hash.ts` one function call earlier, so this is
 * belt and braces rather than a real threat. It costs one regex and it means no
 * statement this module builds can carry anything but hex, a three-digit code,
 * one of four outcomes and an ISO date.
 */
function assertHash(value: string, field: string): string {
  if (!/^[0-9a-f]{64}$/.test(value)) {
    throw new Error(`${field} must be a 64-character lower-case hex hash.`);
  }
  return value;
}

function assertBankCode(value: string): string {
  if (!/^[0-9]{3}$/.test(value)) {
    throw new Error(`bankCode must be three digits, got "${value}".`);
  }
  return value;
}

function assertDate(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`eventDate must be ISO YYYY-MM-DD, got "${value}".`);
  }
  return value;
}

function assertOutcome(value: string): Outcome {
  if (!(OUTCOMES as readonly string[]).includes(value)) {
    throw new Error(`outcome must be one of ${OUTCOMES.join(", ")}.`);
  }
  return value as Outcome;
}

/**
 * The insert statements for a batch of events, chunked.
 *
 * Written as literals rather than bindings because the SQL API's `bindings` are
 * positional over `?` placeholders and a five-hundred-row load would mean two
 * thousand numbered entries; every value that reaches a literal here is
 * validated to be hex, three digits, one of four words or an ISO date first, so
 * there is no string in these statements a caller chose freely.
 */
export function insertEvents(
  events: readonly BeneficiaryEvent[],
  options: DdlOptions = {},
): string[] {
  const database = identifier(
    options.database ?? DEFAULT_DATABASE,
    "SNOWFLAKE_DATABASE",
  );
  const schema = identifier(
    options.schema ?? DEFAULT_SCHEMA,
    "SNOWFLAKE_SCHEMA",
  );
  const statements: string[] = [];

  for (let start = 0; start < events.length; start += INSERT_CHUNK) {
    const chunk = events.slice(start, start + INSERT_CHUNK);
    const values = chunk
      .map(
        (event) =>
          `(${literal(assertHash(event.tenantHash, "tenantHash"))}, ${literal(
            assertHash(event.rfcHash, "rfcHash"),
          )}, ${literal(assertHash(event.clabeHash, "clabeHash"))}, ${literal(
            assertBankCode(event.bankCode),
          )}, ${literal(assertOutcome(event.outcome))}, ${literal(
            assertDate(event.eventDate),
          )}, ${event.synthetic ? "TRUE" : "FALSE"})`,
      )
      .join(",\n         ");

    statements.push(
      `insert into ${database}.${schema}.BENEFICIARY_EVENTS
         (tenant_hash, rfc_hash, clabe_hash, bank_code, outcome, event_date, synthetic)
       values ${values}`,
    );
  }

  return statements;
}

/** Empties the table. Only `consortium:seed --reset` calls it. */
export function truncateEvents(options: DdlOptions = {}): string {
  const database = identifier(
    options.database ?? DEFAULT_DATABASE,
    "SNOWFLAKE_DATABASE",
  );
  const schema = identifier(
    options.schema ?? DEFAULT_SCHEMA,
    "SNOWFLAKE_SCHEMA",
  );
  return `truncate table if exists ${database}.${schema}.BENEFICIARY_EVENTS`;
}
