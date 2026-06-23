import { isNonEmptyString } from "@/lib/utils";

/**
 * Pull the most user-presentable string out of an API error envelope.
 *
 * Our API returns `{ error: "<code>", message?: "<human text>" }`. The human
 * `message` is preferred; the machine `error` code is only a fallback for
 * older routes that don't send one, and a caller-supplied `fallback` covers
 * non-JSON / empty bodies. Mirrors the server-side envelope shape and the
 * `parseOrThrow` helpers used in the service layer so error surfacing is
 * consistent everywhere.
 */
export function apiErrorMessage(payload: unknown, fallback: string): string {
  if (payload && typeof payload === "object") {
    const p = payload as { message?: unknown; error?: unknown };
    if (isNonEmptyString(p.message)) return p.message;
    if (isNonEmptyString(p.error)) return p.error;
  }
  return fallback;
}

/**
 * Fetch helper for JSON API calls: throws `apiErrorMessage(...)` on a non-OK
 * response and returns the parsed body otherwise. Pair with `fetchWithTimeout`
 * for the response.
 */
export async function jsonOrThrow<T>(res: Response, fallback: string): Promise<T> {
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(apiErrorMessage(payload, fallback));
  return payload as T;
}
