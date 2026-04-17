const OAUTH_PENDING_RETURN_KEY = "automazing-oauth-pending-return";

export function hasOAuthCallbackParams(search: string): boolean {
  const params = new URLSearchParams(search);
  return Boolean(params.get("oauth_success") || params.get("oauth_error"));
}

export function storePendingOAuthReturn(pathname: string, search: string): void {
  if (!hasOAuthCallbackParams(search)) return;
  const value = `${pathname || "/"}${search || ""}`;
  sessionStorage.setItem(OAUTH_PENDING_RETURN_KEY, value);
}

export function readPendingOAuthReturn(): string | null {
  const value = sessionStorage.getItem(OAUTH_PENDING_RETURN_KEY);
  return value && value.trim() ? value : null;
}

export function clearPendingOAuthReturn(): void {
  sessionStorage.removeItem(OAUTH_PENDING_RETURN_KEY);
}
