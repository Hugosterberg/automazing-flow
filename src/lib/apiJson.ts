import { apiUrl } from "@/lib/apiBase";
import { jsonOrThrow } from "@/lib/apiError";
import { fetchWithTimeout } from "@/lib/fetchWithTimeout";

export interface ApiJsonOptions {
  /** Defaults to POST when `body` is set, GET otherwise. */
  method?: string;
  /** JSON-serialised request body (sets Content-Type: application/json). */
  body?: unknown;
  /** Request timeout, forwarded to fetchWithTimeout (default 30s). */
  timeoutMs?: number;
  signal?: AbortSignal;
}

/**
 * One call for the standard JSON round-trip against our API:
 * `apiUrl` + `fetchWithTimeout` + `jsonOrThrow`.
 *
 * Sends cookies (`credentials: "include"`), serialises `body` as JSON, and
 * throws a user-presentable `Error` (via `apiErrorMessage`) on non-OK
 * responses. Callers that need special handling of specific status codes
 * should keep using `fetchWithTimeout` directly.
 */
export async function apiJson<T>(
  path: string,
  fallbackError: string,
  options: ApiJsonOptions = {}
): Promise<T> {
  const { method, body, timeoutMs, signal } = options;
  const init: RequestInit = {
    method: method ?? (body !== undefined ? "POST" : "GET"),
    credentials: "include",
  };
  if (signal) init.signal = signal;
  if (body !== undefined) {
    init.headers = { "Content-Type": "application/json" };
    init.body = JSON.stringify(body);
  }
  const res = await fetchWithTimeout(apiUrl(path), init, timeoutMs);
  return jsonOrThrow<T>(res, fallbackError);
}
