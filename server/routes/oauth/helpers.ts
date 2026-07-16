import crypto from "crypto";
import { describeZernioFailure, type ZernioModule } from "../../providers/zernioModule.ts";
import { fetchZernio, zernioFetchErrorMessage } from "../../lib/zernioFetch.ts";
import { X_TOKEN, X_TOKEN_LEGACY } from "./constants.ts";
import type {
  OAuthErrorExtras,
  PopupOAuthResult,
  ResolveZernioAccountArgs,
  ZernioConnectUrlArgs,
} from "./types.ts";

export function generateCodeVerifier(): string {
  return crypto.randomBytes(32).toString("base64url");
}
export function generateCodeChallenge(verifier: string): string {
  return crypto.createHash("sha256").update(verifier).digest("base64url");
}
export function profileParam(profileId: string | null | undefined): string {
  return profileId ? `&profile_id=${encodeURIComponent(profileId)}` : "";
}

export function normalizeRequestedProfileId(profileId: unknown): string | null {
  const normalized = String(profileId || "").trim();
  if (!normalized || normalized === "default") {
    return null;
  }
  return normalized;
}

/**
 * Tenant (business profile) id from the connect request. Used to resolve the
 * tenant's own Zernio profile and per-tenant secrets. Falsy → shared/global.
 */
export function requestBusinessProfileId(req): string | null {
  const normalized = String(
    req?.query?.business_profile_id || req?.body?.business_profile_id || ""
  ).trim();
  return normalized.length > 0 ? normalized : null;
}

export function buildContentUrl(baseUrl: string, params: Record<string, unknown> = {}): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value == null || value === "") continue;
    query.set(key, String(value));
  }
  const suffix = query.toString();
  return `${baseUrl}/content${suffix ? `?${suffix}` : ""}`;
}

export function popupTargetOrigin(baseUrl: string): string {
  try {
    return new URL(baseUrl).origin;
  } catch {
    return "*";
  }
}

export function sendPopupOAuthResult(
  res,
  payload: PopupOAuthResult,
  fallbackUrl: string,
  baseUrl: string
): void {
  const serializedPayload = JSON.stringify(payload).replace(/</g, "\\u003c");
  const serializedFallbackUrl = JSON.stringify(fallbackUrl);
  const serializedTargetOrigin = JSON.stringify(popupTargetOrigin(baseUrl));

  res
    .status(200)
    .type("html")
    .send(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Google Drive connection</title>
  </head>
  <body style="margin:0;background:#000;color:#f5f5f5;font-family:system-ui,sans-serif;display:grid;place-items:center;min-height:100vh;">
    <p style="opacity:.85;">Completing Google Drive connection...</p>
    <script>
      const payload = ${serializedPayload};
      const fallbackUrl = ${serializedFallbackUrl};
      const targetOrigin = ${serializedTargetOrigin};
      if (window.opener && !window.opener.closed) {
        window.opener.postMessage(payload, targetOrigin);
        window.close();
      }
      if (!window.closed) {
        window.location.replace(fallbackUrl);
      }
    </script>
  </body>
</html>`);
}

/**
 * Structured Zernio connect failure. `code` maps to a known oauth_error key
 * and `hint` carries Zernio's actual reason (plan limit, unsupported platform,
 * upstream outage, …) so the user sees WHY the connect was refused instead of
 * a generic "connect failed".
 */
export class ZernioConnectError extends Error {
  code: string;
  hint: string;
  constructor(code: string, hint: string) {
    super(code);
    this.code = code;
    this.hint = hint;
  }
}

/** `oauth_error=<code>&oauth_hint=<reason>` query for redirect URLs. */
export function zernioOauthErrorQuery(e: unknown, fallbackCode = "zernio_init_failed"): string {
  const err = e as { code?: string; hint?: string; message?: string } | null;
  const code = String(err?.code || fallbackCode);
  const hint = String(err?.hint || err?.message || "").slice(0, 240);
  return `oauth_error=${encodeURIComponent(code)}${hint ? `&oauth_hint=${encodeURIComponent(hint)}` : ""}`;
}

/** Human-readable reason out of a failed Zernio connect response body. */
export function zernioConnectFailureHint(status: number, rawBody: string, platformSlug: string): string {
  const upstream = rawBody.slice(0, 200);
  try {
    const parsed = JSON.parse(rawBody) as { message?: unknown; error?: unknown; code?: unknown };
    const failure = describeZernioFailure({
      status,
      error:
        typeof parsed.message === "string"
          ? parsed.message
          : typeof parsed.error === "string"
            ? parsed.error
            : "",
      data: parsed,
    });
    return failure.message;
  } catch {
    // Body was not JSON (e.g. an HTML 404 page) — fall back to a generic line.
  }
  if (status === 404) {
    return `Zernio has no connect endpoint for "${platformSlug}" — the platform may not be available on your Zernio plan.`;
  }
  return `Zernio replied ${status} on connect/${platformSlug}${upstream ? `: ${upstream}` : ""}`;
}

export async function getZernioConnectUrl({
  ZERNIO_API_BASE,
  zernioKey,
  platformSlugs,
  profileId,
  redirectUrl,
  extraParams,
}: ZernioConnectUrlArgs): Promise<string> {
  let lastErr: ZernioConnectError | null = null;
  for (const platformSlug of platformSlugs) {
    const connectUrl = new URL(`${ZERNIO_API_BASE}/connect/${platformSlug}`);
    if (profileId) connectUrl.searchParams.set("profileId", profileId);
    connectUrl.searchParams.set("redirect_url", redirectUrl);
    if (extraParams && typeof extraParams === "object") {
      for (const [k, v] of Object.entries(extraParams)) {
        if (v != null) connectUrl.searchParams.set(k, String(v));
      }
    }

    let connectRes: Response;
    try {
      connectRes = await fetchZernio(connectUrl.toString(), {
        headers: { Authorization: `Bearer ${zernioKey}` },
      });
    } catch (error) {
      const message = zernioFetchErrorMessage(error);
      console.warn(`[Zernio] connect/${platformSlug} request failed:`, message);
      lastErr = new ZernioConnectError(
        "zernio_fetch_failed",
        `Could not reach Zernio (connect/${platformSlug}): ${message}`
      );
      continue;
    }
    if (!connectRes.ok) {
      const err = await connectRes.text().catch(() => "");
      console.warn(`[Zernio] connect/${platformSlug} failed:`, connectRes.status, err.slice(0, 200));
      lastErr = new ZernioConnectError(
        "zernio_connect_failed",
        zernioConnectFailureHint(connectRes.status, err, platformSlug)
      );
      continue;
    }
    const data = await connectRes.json().catch(() => ({}));
    if (data.authUrl) {
      return data.authUrl;
    }
    lastErr = new ZernioConnectError(
      "zernio_no_auth_url",
      `Zernio accepted connect/${platformSlug} but returned no login link — try again, or contact Zernio support if it persists.`
    );
  }
  throw lastErr || new ZernioConnectError("zernio_connect_failed", "Zernio refused the connect request.");
}

export function parseLocationsFromBody(body): unknown[] {
  const candidateLists = [
    body?.locations,
    body?.data?.locations,
    body?.data,
    body?.items,
    body?.businessLocations,
  ];
  for (const list of candidateLists) {
    if (Array.isArray(list) && list.length > 0) {
      return list;
    }
  }
  return [];
}

export function getLocationId(location): string | null {
  if (!location || typeof location !== "object") return null;
  return String(
    location.locationId ??
      location.id ??
      location.name ??
      location.resourceName ??
      ""
  ).trim() || null;
}

export async function resolveAndSelectGoogleBusinessLocation({
  ZERNIO_API_BASE,
  apiKey,
  connectToken,
}: {
  ZERNIO_API_BASE: string;
  apiKey: string;
  connectToken: string;
}): Promise<void> {
  const headers = { Authorization: `Bearer ${apiKey}`, "X-Connect-Token": connectToken };
  const listEndpoints = [
    `${ZERNIO_API_BASE}/connect/list-google-business-locations`,
    `${ZERNIO_API_BASE}/connect/google-business/select-location`,
  ];

  let locations = [];
  for (const endpoint of listEndpoints) {
    const r = await fetch(endpoint, { headers, signal: AbortSignal.timeout(15_000) });
    if (!r.ok) continue;
    const body = await r.json().catch(() => ({}));
    locations = parseLocationsFromBody(body);
    if (locations.length > 0) break;
  }
  if (locations.length === 0) {
    throw new Error("zernio_gmb_no_locations");
  }

  const locationId = getLocationId(locations[0]);
  if (!locationId) {
    throw new Error("zernio_gmb_no_location_id");
  }

  const selectEndpoints = [
    `${ZERNIO_API_BASE}/connect/select-google-business-location`,
    `${ZERNIO_API_BASE}/connect/google-business/select-location`,
  ];
  const bodies = [
    { locationId },
    { id: locationId },
    { location: locationId },
  ];

  for (const endpoint of selectEndpoints) {
    for (const body of bodies) {
      const r = await fetch(endpoint, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(15_000),
      });
      if (r.ok) return;
    }
  }
  throw new Error("zernio_gmb_select_failed");
}

export async function resolveZernioAccountAfterCallback({
  zernio,
  mapZernioPlatform,
  desiredPlatform,
  queryAccountId,
  queryUsername,
}: ResolveZernioAccountArgs): Promise<{
  accountId: string | null | undefined;
  username: string | null | undefined;
  rawPlatform: string | null;
}> {
  let accountId = typeof queryAccountId === "string" && queryAccountId.trim() ? queryAccountId.trim() : null;
  let username = typeof queryUsername === "string" && queryUsername.trim() ? queryUsername.trim() : null;
  let rawPlatform: string | null = null;

  if (accountId && username) {
    return { accountId, username, rawPlatform };
  }

  const result = await zernio.listAccounts();
  if (!result.ok) {
    throw new Error("zernio_fetch_accounts_failed");
  }
  const list = result.accounts;

  const matchedByPlatform = list.find(
    (a) =>
      mapZernioPlatform(a.platform || a.type || a.provider || a.channel) === desiredPlatform
  );
  const acc = matchedByPlatform || (list.length ? list[list.length - 1] : null);
  if (!acc) {
    throw new Error("zernio_no_account");
  }

  accountId = accountId || acc._id || acc.id || acc.accountId;
  username =
    username ||
    acc.username ||
    acc.name ||
    acc.displayName ||
    acc.handle ||
    acc.phoneNumber ||
    acc.phone;
  rawPlatform = acc.platform || acc.type || acc.provider || acc.channel || null;

  if (!accountId) {
    throw new Error("zernio_no_account");
  }

  return { accountId, username, rawPlatform };
}

export async function fetchXToken(
  body: URLSearchParams,
  headers: Record<string, string>
): Promise<Response> {
  const primary = await fetch(X_TOKEN, { method: "POST", headers, body: body.toString(), signal: AbortSignal.timeout(15_000) });
  if (primary.ok) return primary;
  return fetch(X_TOKEN_LEGACY, { method: "POST", headers, body: body.toString(), signal: AbortSignal.timeout(15_000) });
}


