/**
 * Active OAuth token health probes for the Connections center.
 *
 * Zernio-backed social accounts are health-checked by comparing them against
 * Zernio's account list (see connectionsRoutes). Direct OAuth providers
 * (Gmail, Outlook, Drive, Calendar, Google/Meta Ads, ...) have no such list,
 * so a revoked/expired token used to go undetected — resync reported them
 * "healthy" forever and the user never saw a "Reconnect required" prompt.
 *
 * These probes attempt a refresh against the provider's token endpoint, which
 * cleanly distinguishes a still-valid grant from a revoked one — both Google
 * and Microsoft answer `invalid_grant` for a dead grant. We only ever flip a
 * connection to `expired` on that explicit signal, so a network blip or a
 * misconfigured server never produces a false "reconnect" prompt.
 *
 * Microsoft rotates its refresh token on every refresh, so a successful probe
 * MUST persist the rotated token — otherwise the probe itself would invalidate
 * the old refresh token and kill the connection. Google does not rotate, but we
 * still persist the freshened access token for free.
 */

type TokenStoreLike = {
  set: (accountId: string, value: Record<string, unknown>) => Promise<unknown>;
};

export type TokenProbeResult =
  /** Grant verified valid (token refreshed and persisted). */
  | { status: "healthy" }
  /** Provider explicitly revoked/expired the grant — reconnect required. */
  | { status: "expired"; error: string }
  /** Transient, unsupported, or unconfigured — caller should NOT change health. */
  | { status: "unknown"; error?: string };

const GOOGLE_PLATFORMS = new Set([
  "gmail",
  "google_drive",
  "google_calendar",
  "google_ads",
  "google_business",
  "google_reviews",
  "youtube",
]);

const MICROSOFT_PLATFORMS = new Set(["outlook", "outlook_calendar"]);

/** Whether this platform's token can be actively verified by a refresh probe. */
export function isProbeablePlatform(platform: string): boolean {
  return GOOGLE_PLATFORMS.has(platform) || MICROSOFT_PLATFORMS.has(platform);
}

/**
 * Verify a stored OAuth connection's token. Returns "healthy"/"expired" only
 * when the provider gives a definitive answer; "unknown" otherwise (so the
 * caller leaves the recorded health untouched).
 */
export async function probeOAuthConnection(args: {
  accountId: string;
  stored: Record<string, unknown>;
  tokenStore: TokenStoreLike;
}): Promise<TokenProbeResult> {
  const { accountId, stored, tokenStore } = args;
  const platform = String(stored.platform || "");
  const refreshToken = String(stored.refreshToken || "").trim();

  if (GOOGLE_PLATFORMS.has(platform)) {
    return probeGoogle({ accountId, stored, refreshToken, tokenStore });
  }
  if (MICROSOFT_PLATFORMS.has(platform)) {
    return probeMicrosoft({ accountId, stored, refreshToken, tokenStore });
  }
  return { status: "unknown" };
}

async function probeGoogle(args: {
  accountId: string;
  stored: Record<string, unknown>;
  refreshToken: string;
  tokenStore: TokenStoreLike;
}): Promise<TokenProbeResult> {
  const { accountId, stored, refreshToken, tokenStore } = args;
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return { status: "unknown", error: "Google OAuth isn't configured on the server." };
  }
  if (!refreshToken) {
    // No refresh token to verify with — can't prove the grant is dead, so we
    // stay conservative and leave health unchanged.
    return { status: "unknown", error: "No refresh token stored for this account." };
  }

  let res: Response;
  try {
    res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }).toString(),
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    return { status: "unknown", error: "Couldn't reach Google to verify the connection." };
  }

  const data = (await res.json().catch(() => ({}))) as {
    access_token?: string;
    error?: string;
    error_description?: string;
  };

  if (res.ok && data.access_token) {
    await tokenStore
      .set(accountId, { ...stored, accessToken: String(data.access_token) })
      .catch(() => {});
    return { status: "healthy" };
  }
  if (String(data.error || "") === "invalid_grant") {
    return { status: "expired", error: "Google revoked access to this account — reconnect to restore it." };
  }
  return { status: "unknown", error: data.error_description || data.error || "Google token check failed." };
}

async function probeMicrosoft(args: {
  accountId: string;
  stored: Record<string, unknown>;
  refreshToken: string;
  tokenStore: TokenStoreLike;
}): Promise<TokenProbeResult> {
  const { accountId, stored, refreshToken, tokenStore } = args;
  const clientId = process.env.MICROSOFT_CLIENT_ID;
  const clientSecret = process.env.MICROSOFT_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return { status: "unknown", error: "Microsoft OAuth isn't configured on the server." };
  }
  if (!refreshToken) {
    return { status: "unknown", error: "No refresh token stored for this account." };
  }

  let res: Response;
  try {
    res = await fetch("https://login.microsoftonline.com/common/oauth2/v2.0/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }).toString(),
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    return { status: "unknown", error: "Couldn't reach Microsoft to verify the connection." };
  }

  const data = (await res.json().catch(() => ({}))) as {
    access_token?: string;
    refresh_token?: string;
    error?: string;
    error_description?: string;
  };

  if (res.ok && data.access_token) {
    // Persist the rotated refresh token — Microsoft invalidates the old one.
    await tokenStore
      .set(accountId, {
        ...stored,
        accessToken: String(data.access_token),
        ...(data.refresh_token ? { refreshToken: String(data.refresh_token) } : {}),
      })
      .catch(() => {});
    return { status: "healthy" };
  }
  if (String(data.error || "") === "invalid_grant") {
    return { status: "expired", error: "Microsoft revoked access to this account — reconnect to restore it." };
  }
  return { status: "unknown", error: data.error_description || data.error || "Microsoft token check failed." };
}
