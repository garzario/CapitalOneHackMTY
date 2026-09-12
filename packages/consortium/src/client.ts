/**
 * The Snowflake SQL REST API, and no SDK.
 *
 * Verified against the official documentation on 2026-09-12,
 * https://docs.snowflake.com/en/developer-guide/sql-api/submitting-requests and
 * .../handling-responses. What the product needs from Snowflake is three
 * statements and one query, so what it gets is one POST, one GET and an
 * injectable `fetch`, exactly like `@hackmty/cep` does with the Banxico portal.
 * That decision is also what keeps the test suite offline: nothing in `bun test`
 * opens a socket, because every test passes a stub.
 *
 * The contract, in the four lines that matter:
 *
 * - `POST https://<account>.snowflakecomputing.com/api/v2/statements` with
 *   `{ statement, timeout, database, schema, warehouse, role }`.
 * - `200` means it finished inside the synchronous window and the body carries
 *   `resultSetMetaData` and `data`, which is an array of arrays of strings.
 * - `202` means it is still running and the body carries `statementHandle`; then
 *   `GET /api/v2/statements/<handle>` until it answers 200.
 * - Every row value arrives as a string or null, numbers included, because the
 *   API serialises them that way. `rowType` names the columns, so this module
 *   maps rows to objects by name and never by position: a `select *` that grows a
 *   column must not silently shift every value one place to the left.
 */

import { signJwt } from "./jwt";

/** Only the part of `fetch` this module uses, so a test stub is three lines. */
export type HttpLike = (input: string, init?: RequestInit) => Promise<Response>;

/** Seconds the synchronous POST is allowed to block before Snowflake defers. */
export const DEFAULT_STATEMENT_TIMEOUT_SECONDS = 45;
/** How long the whole call may take, polls included. */
export const DEFAULT_DEADLINE_MS = 120_000;
/** Gap between polls of a deferred statement. */
export const DEFAULT_POLL_INTERVAL_MS = 1500;

export class SnowflakeError extends Error {
  /** HTTP status, or 0 when the failure happened before a response arrived. */
  readonly status: number;
  /** Snowflake's own error code, when the body carried one. */
  readonly code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "SnowflakeError";
    this.status = status;
    if (code !== undefined) {
      this.code = code;
    }
  }
}

/** What a caller has to have before the network can be reached at all. */
export interface SnowflakeConfig {
  account: string;
  user: string;
  /** PKCS8 PEM, read from a path OUTSIDE the repository. */
  privateKeyPem: string;
  role?: string;
  warehouse?: string;
  database?: string;
  schema?: string;
}

export interface SnowflakeClientOptions {
  /** Defaults to the global `fetch`. A test passes a stub and stays offline. */
  http?: HttpLike;
  /** Overrides the host, for a stub that wants a recognisable URL. */
  baseUrl?: string;
  timeoutSeconds?: number;
  deadlineMs?: number;
  pollIntervalMs?: number;
  /** Injected so a test does not wait. Defaults to a real sleep. */
  sleep?(ms: number): Promise<void>;
}

/** One row as this module hands it over: column name to value, nulls kept. */
export type SqlRow = Record<string, string | null>;

export interface StatementResult {
  rows: SqlRow[];
  /** Column names in the order Snowflake declared them. */
  columns: string[];
  /** Rows Snowflake says the result has, which can exceed `rows.length`. */
  numRows: number;
  /** The handle, so a log line can name the statement a judge is looking at. */
  statementHandle?: string;
}

interface RowTypeEntry {
  name?: string;
}

interface StatementBody {
  code?: string;
  message?: string;
  statementHandle?: string;
  resultSetMetaData?: {
    numRows?: number;
    rowType?: RowTypeEntry[];
  };
  data?: (string | null)[][];
}

export function snowflakeBaseUrl(account: string): string {
  /* The hostname keeps the hyphenated org-account form; only the JWT claim
     replaces dots. Lower case because a hostname is case insensitive and a
     shouting URL in a log line reads like an error. */
  return `https://${account.trim().toLowerCase().replace(/\./g, "-")}.snowflakecomputing.com`;
}

/**
 * A client bound to one account, one role and one warehouse.
 *
 * The JWT is signed per request rather than cached. A statement costs a network
 * round trip and an RS256 signature costs microseconds, so caching it would buy
 * nothing and would introduce the one bug this code cannot afford: a token that
 * expired halfway through a push.
 */
export class SnowflakeClient {
  private readonly config: SnowflakeConfig;
  private readonly http: HttpLike;
  private readonly baseUrl: string;
  private readonly timeoutSeconds: number;
  private readonly deadlineMs: number;
  private readonly pollIntervalMs: number;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(config: SnowflakeConfig, options: SnowflakeClientOptions = {}) {
    this.config = config;
    this.http = options.http ?? fetch;
    this.baseUrl = (
      options.baseUrl ?? snowflakeBaseUrl(config.account)
    ).replace(/\/+$/, "");
    this.timeoutSeconds =
      options.timeoutSeconds ?? DEFAULT_STATEMENT_TIMEOUT_SECONDS;
    this.deadlineMs = options.deadlineMs ?? DEFAULT_DEADLINE_MS;
    this.pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
    this.sleep =
      options.sleep ??
      ((ms) =>
        new Promise((resolve) => {
          setTimeout(resolve, ms);
        }));
  }

  /** Runs one statement and returns its rows, polling a 202 until it settles. */
  async statement(sql: string): Promise<StatementResult> {
    const response = await this.http(
      `${this.baseUrl}/api/v2/statements`,
      this.init("POST", {
        statement: sql,
        timeout: this.timeoutSeconds,
        ...(this.config.database === undefined
          ? {}
          : { database: this.config.database }),
        ...(this.config.schema === undefined
          ? {}
          : { schema: this.config.schema }),
        ...(this.config.warehouse === undefined
          ? {}
          : { warehouse: this.config.warehouse }),
        ...(this.config.role === undefined ? {} : { role: this.config.role }),
      }),
    );

    if (response.status === 200) {
      return readResult(await body(response));
    }
    if (response.status !== 202) {
      throw await failure(response);
    }

    const deferred = await body(response);
    const handle = deferred.statementHandle;
    if (handle === undefined) {
      throw new SnowflakeError(
        "Snowflake deferred the statement and returned no statementHandle, so there is nothing to poll.",
        202,
      );
    }
    return this.poll(handle);
  }

  /** Runs several statements in order and returns the last result. */
  async statements(sqls: readonly string[]): Promise<StatementResult> {
    let last: StatementResult = { rows: [], columns: [], numRows: 0 };
    for (const sql of sqls) {
      last = await this.statement(sql);
    }
    return last;
  }

  /**
   * Polls a deferred statement until it answers with a result or the deadline
   * passes.
   *
   * A deadline and not a retry count, because what a caller actually has is a
   * budget: `bun run consortium:seed` can wait two minutes for a warehouse to
   * resume and a judge watching a demo cannot.
   */
  private async poll(handle: string): Promise<StatementResult> {
    const until = Date.now() + this.deadlineMs;
    /* encodeURIComponent on the handle: it is a value Snowflake chose, it goes
       into a path, and a client that pastes a server-provided string into a URL
       unescaped is a client with a path-traversal bug waiting to happen. */
    const url = `${this.baseUrl}/api/v2/statements/${encodeURIComponent(handle)}`;

    while (Date.now() < until) {
      await this.sleep(this.pollIntervalMs);
      const response = await this.http(url, this.init("GET"));
      if (response.status === 200) {
        return readResult(await body(response));
      }
      if (response.status !== 202) {
        throw await failure(response);
      }
    }

    throw new SnowflakeError(
      `statement ${handle} was still running after ${Math.round(this.deadlineMs / 1000)}s. Snowflake has it; re-running this command will not lose the work.`,
      202,
    );
  }

  private init(method: "GET" | "POST", payload?: unknown): RequestInit {
    const headers: Record<string, string> = {
      authorization: `Bearer ${signJwt({
        account: this.config.account,
        user: this.config.user,
        privateKeyPem: this.config.privateKeyPem,
      })}`,
      /* Without this header Snowflake reads the bearer as an OAuth token. */
      "x-snowflake-authorization-token-type": "KEYPAIR_JWT",
      accept: "application/json",
      /* We identify ourselves rather than impersonating a driver. */
      "user-agent": "SentryOne/0.1",
    };
    if (payload !== undefined) {
      headers["content-type"] = "application/json";
    }
    const init: RequestInit = { method, headers };
    if (payload !== undefined) {
      init.body = JSON.stringify(payload);
    }
    return init;
  }
}

async function body(response: Response): Promise<StatementBody> {
  try {
    return (await response.json()) as StatementBody;
  } catch {
    throw new SnowflakeError(
      `Snowflake answered ${response.status} with something that is not JSON.`,
      response.status,
    );
  }
}

/**
 * Snowflake's failure as one sentence, and never the whole body.
 *
 * A SQL error message can quote the statement, and a statement in this product
 * can carry a salted hash. One of our own sentences on the wire, the rest in the
 * exception nobody pastes into a chat.
 */
async function failure(response: Response): Promise<SnowflakeError> {
  let message = `Snowflake answered ${response.status}.`;
  let code: string | undefined;
  try {
    const parsed = (await response.json()) as StatementBody;
    if (typeof parsed.message === "string" && parsed.message !== "") {
      message = `Snowflake answered ${response.status}: ${parsed.message}`;
    }
    if (typeof parsed.code === "string") {
      code = parsed.code;
    }
  } catch {
    /* A gateway error is HTML. The status is the whole of what we know. */
  }
  if (response.status === 401) {
    message +=
      " Check SNOWFLAKE_ACCOUNT, SNOWFLAKE_USER and the key fingerprint on the user.";
  }
  return new SnowflakeError(message, response.status, code);
}

/**
 * Rows as objects, keyed by the column names Snowflake declared.
 *
 * By name and not by position on purpose: a `select` that grows a column is a
 * change a reviewer can see, and a mapping by index would silently shift every
 * value one place to the left instead.
 */
export function readResult(payload: StatementBody): StatementResult {
  const columns = (payload.resultSetMetaData?.rowType ?? []).map(
    (entry, index) => entry.name ?? `COLUMN_${index}`,
  );
  const rows = (payload.data ?? []).map((values) => {
    const row: SqlRow = {};
    columns.forEach((column, index) => {
      row[column] = values[index] ?? null;
    });
    return row;
  });
  const result: StatementResult = {
    rows,
    columns,
    numRows: payload.resultSetMetaData?.numRows ?? rows.length,
  };
  if (payload.statementHandle !== undefined) {
    result.statementHandle = payload.statementHandle;
  }
  return result;
}
