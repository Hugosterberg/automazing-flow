import { apiUrl } from "@/lib/apiBase";

/**
 * Thin client for our own /api/zernio/* endpoints. The browser never talks
 * to Zernio directly — only through the Express broker, which adds auth and
 * scopes every call to the active business profile.
 */
export interface ZernioWorkspaceAccount {
  id?: string;
  _id?: string;
  accountId?: string;
  mappedPlatform?: string;
  rawPlatform?: string;
  username?: string;
  displayName?: string;
  name?: string;
}

export async function listZernioAccounts(): Promise<ZernioWorkspaceAccount[]> {
  const res = await fetch(apiUrl("/api/zernio/accounts"), { credentials: "include" });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      typeof body?.error === "string" ? body.error : `Zernio accounts: ${res.statusText}`
    );
  }
  return Array.isArray(body?.accounts) ? body.accounts : [];
}

export async function reconcileConnections(businessProfileId: string): Promise<{
  ok: boolean;
  updated: number;
}> {
  const params = new URLSearchParams({ business_profile_id: businessProfileId });
  const res = await fetch(apiUrl(`/api/connections/reconcile?${params.toString()}`), {
    method: "POST",
    credentials: "include",
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      typeof body?.error === "string" ? body.error : `Reconcile failed: ${res.statusText}`
    );
  }
  return { ok: Boolean(body?.ok), updated: Number(body?.updated ?? 0) };
}

/** Build a connect URL for a given platform (server-side OAuth start). */
export function buildConnectUrl(
  authPath: string,
  businessProfileId: string,
  options?: {
    provider?: "zernio" | "official";
    returnTo?: string;
    params?: Record<string, string | null | undefined>;
  }
): string {
  const params = new URLSearchParams();
  params.set("oauth_return", options?.returnTo ?? "connections");
  params.set("business_profile_id", businessProfileId);
  if (typeof window !== "undefined") params.set("app_origin", window.location.origin);
  // Legacy compat: some callbacks still read profile_id.
  params.set("profile_id", businessProfileId);
  if (options?.provider) params.set("provider", options.provider);
  for (const [key, value] of Object.entries(options?.params ?? {})) {
    if (value) params.set(key, value);
  }
  return `${apiUrl(`/api/auth/${authPath}`)}?${params.toString()}`;
}
