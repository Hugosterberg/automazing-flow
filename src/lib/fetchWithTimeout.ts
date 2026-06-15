/**
 * Drop-in replacement for `fetch` that applies a default request timeout so a
 * hung upstream can never leave the UI spinning forever, and normalises the
 * low-level failure modes into clear, human-readable errors.
 *
 * Same signature as `fetch`, plus an optional `timeoutMs` (default 30s).
 *
 * Error handling:
 *   - Timeout      → `FetchError` (kind "timeout") with a clear message.
 *   - Network down → `FetchError` (kind "network") instead of the opaque
 *                    "Failed to fetch" `TypeError`.
 *   - Caller abort → the original `AbortError` is preserved untouched, so
 *                    React Query (and other callers) still treat an
 *                    intentional cancellation as a cancellation, not a failure.
 *
 * Because every app request flows through this helper, surfacing a useful
 * message here means the global error toast shows something meaningful for any
 * timeout or connectivity problem, anywhere in the app.
 *
 * A caller-provided `signal` is preserved and combined with the timeout, so
 * either the caller or the timeout can abort the request. Implemented with
 * AbortController + a cleared timer (not `AbortSignal.timeout`) so it works
 * uniformly across every browser and the jsdom test environment, and never
 * leaks a pending timer.
 */

export const DEFAULT_FETCH_TIMEOUT_MS = 30_000;

export type FetchErrorKind = "timeout" | "network";

/** A normalised, user-presentable failure for timeouts and connectivity loss. */
export class FetchError extends Error {
  readonly kind: FetchErrorKind;
  // Declared explicitly because the ES2020 lib target predates `Error.cause`.
  readonly cause?: unknown;
  constructor(message: string, kind: FetchErrorKind, options?: { cause?: unknown }) {
    super(message);
    this.name = "FetchError";
    this.kind = kind;
    this.cause = options?.cause;
  }
}

/** Combine signals, preferring the native `AbortSignal.any` when present. */
function anySignal(signals: AbortSignal[]): AbortSignal {
  if (typeof AbortSignal.any === "function") return AbortSignal.any(signals);
  const controller = new AbortController();
  for (const signal of signals) {
    if (signal.aborted) {
      controller.abort(signal.reason);
      break;
    }
    signal.addEventListener("abort", () => controller.abort(signal.reason), { once: true });
  }
  return controller.signal;
}

export function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit = {},
  timeoutMs: number = DEFAULT_FETCH_TIMEOUT_MS,
): Promise<Response> {
  const callerSignal = init.signal ?? null;
  const timeoutController = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    timeoutController.abort();
  }, timeoutMs);

  const signal = callerSignal
    ? anySignal([callerSignal, timeoutController.signal])
    : timeoutController.signal;

  return fetch(input, { ...init, signal })
    .catch((err) => {
      if (timedOut) {
        throw new FetchError(
          `The request timed out after ${Math.round(timeoutMs / 1000)} seconds. Check your connection and try again.`,
          "timeout",
          { cause: err },
        );
      }
      // The caller cancelled deliberately — preserve the original AbortError.
      if (callerSignal?.aborted) throw err;
      // fetch() rejects with a TypeError for connectivity problems (offline,
      // DNS, connection reset, CORS). Turn that into something a user can act on.
      if (err instanceof TypeError) {
        throw new FetchError(
          "Couldn't reach the server. Check your internet connection and try again.",
          "network",
          { cause: err },
        );
      }
      throw err;
    })
    .finally(() => clearTimeout(timer));
}
