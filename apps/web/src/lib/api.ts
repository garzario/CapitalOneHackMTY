/**
 * The only place the web app talks to the API. Requests go to a relative path
 * so the Vite proxy handles development and the same build works wherever it
 * is deployed. Every call resolves: failures are values, not exceptions, so a
 * component can render an offline state instead of blanking out.
 *
 * The HTTP contract itself is documented in docs/09-api.md.
 */

export const API_TIMEOUT_MS = 5000;

export type ApiFailure = {
  /** HTTP status, or 0 when the request never produced a response. */
  status: number;
  message: string;
};

export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: ApiFailure };

export type RequestOptions = {
  signal?: AbortSignal;
  timeoutMs?: number;
};

export type Health = {
  ok: boolean;
  service: string;
  version: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isAbortError(error: unknown): boolean {
  return (
    isRecord(error) &&
    typeof error.name === "string" &&
    error.name === "AbortError"
  );
}

/** Narrow the payload instead of asserting it, so a contract change is visible. */
export function parseHealth(value: unknown): Health | null {
  if (!isRecord(value)) {
    return null;
  }

  const { ok, service, version } = value;

  if (
    typeof ok !== "boolean" ||
    typeof service !== "string" ||
    typeof version !== "string"
  ) {
    return null;
  }

  return { ok, service, version };
}

async function getJson(
  path: string,
  options: RequestOptions = {},
): Promise<ApiResult<unknown>> {
  const { signal, timeoutMs = API_TIMEOUT_MS } = options;
  const controller = new AbortController();
  const forwardAbort = () => controller.abort();

  signal?.addEventListener("abort", forwardAbort, { once: true });

  let timedOut = false;
  const timer = window.setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  try {
    const response = await fetch(path, {
      headers: { accept: "application/json" },
      signal: controller.signal,
    });

    if (!response.ok) {
      return {
        ok: false,
        error: {
          status: response.status,
          message: `The API answered with status ${response.status}.`,
        },
      };
    }

    return { ok: true, data: await response.json() };
  } catch (error) {
    if (timedOut) {
      return {
        ok: false,
        error: {
          status: 0,
          message: `The API did not answer within ${timeoutMs} ms.`,
        },
      };
    }

    if (isAbortError(error)) {
      return { ok: false, error: { status: 0, message: "Request cancelled." } };
    }

    return {
      ok: false,
      error: { status: 0, message: "The API is not reachable." },
    };
  } finally {
    window.clearTimeout(timer);
    signal?.removeEventListener("abort", forwardAbort);
  }
}

export async function getHealth(
  options?: RequestOptions,
): Promise<ApiResult<Health>> {
  const result = await getJson("/health", options);

  if (!result.ok) {
    return result;
  }

  const health = parseHealth(result.data);

  if (!health) {
    return {
      ok: false,
      error: {
        status: 0,
        message: "The health payload did not match the documented shape.",
      },
    };
  }

  return { ok: true, data: health };
}
