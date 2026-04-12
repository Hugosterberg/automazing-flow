export type OAuthErrorDetails = {
  code: string;
  statusCode: string | null;
  exception: string | null;
  hint: string | null;
};

/** Shown when pages do not pass a custom `messages` map; extend per-page maps to override. */
export const DEFAULT_OAUTH_ERROR_MESSAGES: Record<string, string> = {
  not_authenticated:
    "The app had no active server session when OAuth completed. Open the app again, stay signed in (or use local mode on localhost), go back to the same section, and start Connect once more.",
  access_denied: "The provider declined access. Try Connect again and approve the requested permissions.",
  invalid_state:
    "OAuth state did not match (expired step, another tab, or tunnel/cookie issues). Start Connect again from a single browser tab.",
  user_cancelled: "Sign-in was cancelled at the provider. Try again when you are ready to approve access.",
  interaction_required: "The provider needs another sign-in step. Try Connect again and complete any prompts.",
};

export function parseOAuthErrorDetails(searchParams: URLSearchParams): OAuthErrorDetails | null {
  const code = searchParams.get("oauth_error");
  if (!code) return null;
  return {
    code,
    statusCode: searchParams.get("oauth_status"),
    exception: searchParams.get("oauth_exception"),
    hint: searchParams.get("oauth_hint"),
  };
}

export function removeOAuthErrorParams(searchParams: URLSearchParams) {
  const next = new URLSearchParams(searchParams);
  next.delete("oauth_error");
  next.delete("oauth_status");
  next.delete("oauth_exception");
  next.delete("oauth_hint");
  return next;
}

export function formatOAuthErrorMessage(
  details: OAuthErrorDetails,
  messages?: Record<string, string>,
  fallbackPrefix = "Connection failed"
) {
  const merged = { ...DEFAULT_OAUTH_ERROR_MESSAGES, ...(messages || {}) };
  if (merged[details.code]) return merged[details.code];
  return `${fallbackPrefix}: ${details.code.replace(/_/g, " ")}`;
}

export function formatConnectFetchError(params: {
  status?: number;
  payload?: { error?: unknown; exception?: unknown; status?: unknown } | null;
  fallbackMessage: string;
}) {
  const statusCode =
    typeof params.payload?.status === "number"
      ? String(params.payload.status)
      : typeof params.status === "number"
        ? String(params.status)
        : "unknown";
  const errorCode =
    typeof params.payload?.error === "string" && params.payload.error.trim().length > 0
      ? params.payload.error
      : params.fallbackMessage;
  const exception =
    typeof params.payload?.exception === "string" && params.payload.exception.trim().length > 0
      ? params.payload.exception
      : "not provided";

  return `Error: ${errorCode} | Status: ${statusCode} | Exception: ${exception}`;
}
