export type OAuthErrorDetails = {
  code: string;
  statusCode: string | null;
  exception: string | null;
  hint: string | null;
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
  if (messages?.[details.code]) return messages[details.code];
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
