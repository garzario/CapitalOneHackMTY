/**
 * The SQL REST API client against a stub, which is the only thing it is ever run
 * against in `bun test`. Nothing here opens a socket.
 *
 * The cases are the four the documentation names and the two a hackathon
 * actually hits: a synchronous 200, a deferred 202 that is polled, a 401 with a
 * sentence that says which variable to check, and a result whose columns moved.
 */

import { describe, expect, test } from "bun:test";
import { generateKeyPairSync } from "node:crypto";
import {
  type HttpLike,
  readResult,
  SnowflakeClient,
  SnowflakeError,
} from "./client";

const PEM = generateKeyPairSync("rsa", { modulusLength: 2048 })
  .privateKey.export({ type: "pkcs8", format: "pem" })
  .toString();

const CONFIG = {
  account: "myorg-sentryone",
  user: "sentryone_svc",
  privateKeyPem: PEM,
  database: "SENTRYONE",
  schema: "CONSORTIUM",
  warehouse: "COMPUTE_WH",
  role: "ACCOUNTADMIN",
};

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function resultBody(rows: (string | null)[][]) {
  return {
    resultSetMetaData: {
      numRows: rows.length,
      rowType: [{ name: "RFC_HASH" }, { name: "TENANTS" }],
    },
    data: rows,
    statementHandle: "01b2-handle",
  };
}

interface Recorded {
  url: string;
  init?: RequestInit;
}

function recorder(answers: readonly Response[]): {
  http: HttpLike;
  calls: Recorded[];
} {
  const calls: Recorded[] = [];
  let index = 0;
  return {
    calls,
    http: async (url, init) => {
      calls.push({ url, ...(init === undefined ? {} : { init }) });
      const answer = answers[Math.min(index, answers.length - 1)] as Response;
      index += 1;
      return answer;
    },
  };
}

function client(answers: readonly Response[]) {
  const { http, calls } = recorder(answers);
  return {
    calls,
    client: new SnowflakeClient(CONFIG, {
      http,
      pollIntervalMs: 0,
      sleep: async () => {},
    }),
  };
}

describe("a statement that finishes inside the window", () => {
  test("posts to /api/v2/statements with both auth headers", async () => {
    const { client: sql, calls } = client([
      jsonResponse(200, resultBody([["a".repeat(64), "37"]])),
    ]);

    await sql.statement("select 1");

    const call = calls[0];
    expect(call?.url).toBe(
      "https://myorg-sentryone.snowflakecomputing.com/api/v2/statements",
    );
    expect(call?.init?.method).toBe("POST");
    const headers = call?.init?.headers as Record<string, string>;
    expect(headers.authorization?.startsWith("Bearer ")).toBe(true);
    expect(headers["x-snowflake-authorization-token-type"]).toBe("KEYPAIR_JWT");
  });

  test("sends the warehouse, role, database and schema in the body", async () => {
    const { client: sql, calls } = client([jsonResponse(200, resultBody([]))]);

    await sql.statement("select 1");

    const body = JSON.parse(String(calls[0]?.init?.body));
    expect(body).toMatchObject({
      statement: "select 1",
      database: "SENTRYONE",
      schema: "CONSORTIUM",
      warehouse: "COMPUTE_WH",
      role: "ACCOUNTADMIN",
    });
    expect(body.timeout).toBeGreaterThan(0);
  });

  test("maps rows to objects by column name", async () => {
    const { client: sql } = client([
      jsonResponse(200, resultBody([["b".repeat(64), "12"]])),
    ]);

    const result = await sql.statement("select rfc_hash, tenants from v");

    expect(result.rows).toEqual([{ RFC_HASH: "b".repeat(64), TENANTS: "12" }]);
    expect(result.columns).toEqual(["RFC_HASH", "TENANTS"]);
    expect(result.numRows).toBe(1);
    expect(result.statementHandle).toBe("01b2-handle");
  });
});

describe("a deferred statement", () => {
  test("is polled at its handle until it answers with a result", async () => {
    const { client: sql, calls } = client([
      jsonResponse(202, { statementHandle: "01b2-deferred" }),
      jsonResponse(202, { statementHandle: "01b2-deferred" }),
      jsonResponse(200, resultBody([["c".repeat(64), "4"]])),
    ]);

    const result = await sql.statement("call something_slow()");

    expect(result.rows).toHaveLength(1);
    expect(calls).toHaveLength(3);
    expect(calls[1]?.url).toBe(
      "https://myorg-sentryone.snowflakecomputing.com/api/v2/statements/01b2-deferred",
    );
    expect(calls[1]?.init?.method).toBe("GET");
  });

  test("escapes the handle it was given rather than pasting it into a path", async () => {
    const { client: sql, calls } = client([
      jsonResponse(202, { statementHandle: "../../v2/statements" }),
      jsonResponse(200, resultBody([])),
    ]);

    await sql.statement("select 1");

    expect(calls[1]?.url).toContain("%2F");
    expect(calls[1]?.url).not.toContain("../");
  });

  test("a 202 with no handle is a failure and not a silent empty result", async () => {
    const { client: sql } = client([jsonResponse(202, {})]);

    await expect(sql.statement("select 1")).rejects.toThrow(
      /no statementHandle/,
    );
  });

  test("gives up on its own deadline and says the work is not lost", async () => {
    const { client: sql } = client([
      jsonResponse(202, { statementHandle: "01b2-forever" }),
    ]);
    const bounded = new SnowflakeClient(CONFIG, {
      http: async () => jsonResponse(202, { statementHandle: "01b2-forever" }),
      deadlineMs: 1,
      pollIntervalMs: 0,
      sleep: async () => {},
    });
    void sql;

    await expect(bounded.statement("select 1")).rejects.toThrow(
      /will not lose the work/,
    );
  });
});

describe("a failure", () => {
  test("names the three variables to check on a 401", async () => {
    const { client: sql } = client([
      jsonResponse(401, { code: "390144", message: "JWT token is invalid" }),
    ]);

    const failure = await sql.statement("select 1").catch((cause) => cause);

    expect(failure).toBeInstanceOf(SnowflakeError);
    expect(failure.status).toBe(401);
    expect(failure.code).toBe("390144");
    expect(failure.message).toContain("SNOWFLAKE_ACCOUNT");
  });

  test("survives a gateway error that answers HTML", async () => {
    const { client: sql } = client([
      new Response("<html>502</html>", { status: 502 }),
    ]);

    await expect(sql.statement("select 1")).rejects.toThrow(/answered 502/);
  });

  test("a 200 that is not JSON is a failure, not an empty result", async () => {
    const { client: sql } = client([new Response("not json", { status: 200 })]);

    await expect(sql.statement("select 1")).rejects.toThrow(/not JSON/);
  });
});

describe("reading a result", () => {
  test("pads a short row rather than dropping the column", () => {
    const result = readResult({
      resultSetMetaData: {
        numRows: 1,
        rowType: [{ name: "A" }, { name: "B" }],
      },
      data: [["only"]],
    });

    expect(result.rows).toEqual([{ A: "only", B: null }]);
  });

  test("names a column the metadata forgot rather than losing the value", () => {
    const result = readResult({
      resultSetMetaData: { rowType: [{}] },
      data: [["value"]],
    });

    expect(result.rows).toEqual([{ COLUMN_0: "value" }]);
  });

  test("an empty body is an empty result and not a throw", () => {
    expect(readResult({})).toEqual({ rows: [], columns: [], numRows: 0 });
  });
});
