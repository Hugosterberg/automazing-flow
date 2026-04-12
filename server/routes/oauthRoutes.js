import crypto from "crypto";

const IG_AUTH = "https://api.instagram.com/oauth/authorize";
const IG_TOKEN = "https://api.instagram.com/oauth/access_token";
const TIKTOK_AUTH = "https://www.tiktok.com/v2/auth/authorize/";
const TIKTOK_TOKEN = "https://open.tiktokapis.com/v2/oauth/token/";
const X_AUTH = "https://x.com/i/oauth2/authorize";
const X_TOKEN = "https://api.x.com/2/oauth2/token";
const X_TOKEN_LEGACY = "https://api.twitter.com/2/oauth2/token";
const X_SCOPES = "tweet.read users.read offline.access like.read";
const GOOGLE_AUTH = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN = "https://oauth2.googleapis.com/token";
const NOTION_AUTH = "https://api.notion.com/v1/oauth/authorize";
const NOTION_TOKEN = "https://api.notion.com/v1/oauth/token";
const YOUTUBE_SCOPES =
  "https://www.googleapis.com/auth/youtube.readonly https://www.googleapis.com/auth/userinfo.profile";
const GMAIL_SCOPES =
  "https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/userinfo.email";
const GOOGLE_DRIVE_SCOPES =
  "openid email profile https://www.googleapis.com/auth/drive.readonly";
const GOOGLE_CALENDAR_SCOPES =
  "openid email profile https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/calendar.events";
const GOOGLE_REVIEWS_SCOPES =
  "openid email profile https://www.googleapis.com/auth/business.manage";
const OUTLOOK_CALENDAR_SCOPES =
  "offline_access openid profile email User.Read Calendars.ReadWrite";
const DEBUG_INGEST_URL = "http://127.0.0.1:7917/ingest/7239d227-c463-4b17-b647-b3b429e5fe5c";

function generateCodeVerifier() {
  return crypto.randomBytes(32).toString("base64url");
}
function generateCodeChallenge(verifier) {
  return crypto.createHash("sha256").update(verifier).digest("base64url");
}
function profileParam(profileId) {
  return profileId ? `&profile_id=${encodeURIComponent(profileId)}` : "";
}

function normalizeRequestedProfileId(profileId) {
  const normalized = String(profileId || "").trim();
  if (!normalized || normalized === "default") {
    return null;
  }
  return normalized;
}

function buildContentUrl(baseUrl, params = {}) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value == null || value === "") continue;
    query.set(key, String(value));
  }
  const suffix = query.toString();
  return `${baseUrl}/content${suffix ? `?${suffix}` : ""}`;
}

function popupTargetOrigin(baseUrl) {
  try {
    return new URL(baseUrl).origin;
  } catch {
    return "*";
  }
}

function sendPopupOAuthResult(res, payload, fallbackUrl, baseUrl) {
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

async function getZernioConnectUrl({
  ZERNIO_API_BASE,
  zernioKey,
  platformSlugs,
  profileId,
  redirectUrl,
  extraParams,
}) {
  let lastErr = null;
  for (const platformSlug of platformSlugs) {
    const connectUrl = new URL(`${ZERNIO_API_BASE}/connect/${platformSlug}`);
    connectUrl.searchParams.set("profileId", profileId);
    connectUrl.searchParams.set("redirect_url", redirectUrl);
    if (extraParams && typeof extraParams === "object") {
      for (const [k, v] of Object.entries(extraParams)) {
        if (v != null) connectUrl.searchParams.set(k, String(v));
      }
    }

    const connectRes = await fetch(connectUrl.toString(), {
      headers: { Authorization: `Bearer ${zernioKey}` },
    });
    if (!connectRes.ok) {
      const err = await connectRes.text().catch(() => "");
      lastErr = `zernio_connect_failed:${connectRes.status}:${err.slice(0, 200)}`;
      continue;
    }
    const data = await connectRes.json().catch(() => ({}));
    if (data.authUrl) {
      return data.authUrl;
    }
    lastErr = "zernio_no_auth_url";
  }
  throw new Error(lastErr || "zernio_connect_failed");
}

function parseLocationsFromBody(body) {
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

function getLocationId(location) {
  if (!location || typeof location !== "object") return null;
  return String(
    location.locationId ??
      location.id ??
      location.name ??
      location.resourceName ??
      ""
  ).trim() || null;
}

async function resolveAndSelectGoogleBusinessLocation({
  ZERNIO_API_BASE,
  apiKey,
  connectToken,
}) {
  const headers = { Authorization: `Bearer ${apiKey}`, "X-Connect-Token": connectToken };
  const listEndpoints = [
    `${ZERNIO_API_BASE}/connect/list-google-business-locations`,
    `${ZERNIO_API_BASE}/connect/google-business/select-location`,
  ];

  let locations = [];
  for (const endpoint of listEndpoints) {
    const r = await fetch(endpoint, { headers });
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
      });
      if (r.ok) return;
    }
  }
  throw new Error("zernio_gmb_select_failed");
}

async function resolveZernioAccountAfterCallback({
  ZERNIO_API_BASE,
  apiKey,
  normalizeZernioAccountsPayload,
  mapZernioPlatform,
  desiredPlatform,
  queryAccountId,
  queryUsername,
}) {
  let accountId = queryAccountId;
  let username = queryUsername;
  let rawPlatform = null;

  if (accountId && username) {
    return { accountId, username, rawPlatform };
  }

  const accountsRes = await fetch(`${ZERNIO_API_BASE}/accounts`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!accountsRes.ok) {
    throw new Error("zernio_fetch_accounts_failed");
  }
  const accountsData = await accountsRes.json().catch(() => ({}));
  const list = normalizeZernioAccountsPayload(accountsData);

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

async function fetchXToken(body, headers) {
  const primary = await fetch(X_TOKEN, { method: "POST", headers, body: body.toString() });
  if (primary.ok) return primary;
  return fetch(X_TOKEN_LEGACY, { method: "POST", headers, body: body.toString() });
}

export function registerOAuthRoutes(
  app,
  {
    BASE_URL,
    API_BASE_URL,
    ZERNIO_API_BASE,
    getZernioApiKey,
    getOrCreateZernioProfileId,
    normalizeZernioAccountsPayload,
    mapZernioPlatform,
    generateState,
    pendingStates,
    tokenStore,
    getSessionUserId,
  }
) {
  function getShopifyPublicBaseUrl() {
    const raw = String(process.env.SHOPIFY_APP_URL || API_BASE_URL || "").trim();
    return raw.replace(/\/$/, "");
  }

  function getNotionPublicBaseUrl() {
    const raw = String(process.env.NOTION_APP_URL || API_BASE_URL || "").trim();
    return raw.replace(/\/$/, "");
  }

  function debugLog(runId, hypothesisId, location, message, data = {}) {
    // #region agent log
    if (process.env.VERCEL === "1" || process.env.NODE_ENV === "production") return;
    fetch(DEBUG_INGEST_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "9f37ed" },
      body: JSON.stringify({
        sessionId: "9f37ed",
        runId,
        hypothesisId,
        location,
        message,
        data,
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion
  }

  function buildPageUrl(page, params = {}) {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value == null || value === "") continue;
      query.set(key, String(value));
    }
    const suffix = query.toString();
    return `${BASE_URL}/${page}${suffix ? `?${suffix}` : ""}`;
  }

  function buildOauthErrorParams(errorCode, extras = {}) {
    return {
      oauth_error: errorCode,
      oauth_status: extras.status,
      oauth_exception: extras.exception,
      oauth_hint: extras.hint,
    };
  }

  function buildPageOauthErrorUrl(page, errorCode, extras = {}) {
    return buildPageUrl(page, buildOauthErrorParams(errorCode, extras));
  }

  function getExceptionMessage(error) {
    if (!error) return undefined;
    if (error instanceof Error) return error.message;
    return String(error);
  }

  function buildPopupOauthErrorPayload(errorCode, extras = {}) {
    return {
      type: "google_drive_oauth",
      error: errorCode,
      statusCode: extras.status ? String(extras.status) : null,
      exception: extras.exception ? String(extras.exception) : null,
      hint: extras.hint ? String(extras.hint) : null,
    };
  }

  function requireSessionOrRedirect(req, res, page) {
    const userId = getSessionUserId(req);
    if (!userId) {
      res.redirect(
        buildPageOauthErrorUrl(page, "not_authenticated", {
          status: 401,
          exception: "No active session found on the server.",
        })
      );
      return null;
    }
    return userId;
  }

  function oauthPageForPlatform(platform) {
    if (
      platform === "google_calendar" ||
      platform === "outlook_calendar"
    ) {
      return "calendar";
    }
    if (platform === "gmail" || platform === "outlook") {
      return "messages";
    }
    if (platform === "google_drive") {
      return "content";
    }
    if (platform === "google_reviews" || platform === "tripadvisor") {
      return "reviews";
    }
    if (platform === "shopify" || platform === "notion") {
      return "ecommerce";
    }
    return "social-media";
  }

  function oauthRedirect(platform, query, oauthReturnPage) {
    const page =
      oauthReturnPage === "connect-accounts" ? "connect-accounts" : oauthPageForPlatform(platform);
    return `${BASE_URL}/${page}?${query}`;
  }

  /** Optional `?oauth_return=connect-accounts` on /api/auth/* to land on the hub after OAuth. */
  function parseOauthReturnPage(req) {
    const v = String(req.query?.oauth_return || "").trim();
    return v === "connect-accounts" ? "connect-accounts" : null;
  }

  function postOauthPage(pending, platform) {
    if (pending?.oauthReturnPage === "connect-accounts") return "connect-accounts";
    return oauthPageForPlatform(platform);
  }

  // Instagram: via Zernio (recommended) eller direkt Meta OAuth
  app.get("/api/auth/instagram", async (req, res) => {
    const returnPage = parseOauthReturnPage(req) || "social-media";
    const userId = requireSessionOrRedirect(req, res, returnPage);
    if (!userId) return;
    res.set("Cache-Control", "no-store, no-cache");
    const zernioKey = getZernioApiKey();
    const ourProfileId = normalizeRequestedProfileId(req.query.profile_id);
    console.log(
      "[Instagram] ZERNIO_API_KEY:",
      zernioKey ? "set" : "not set — add ZERNIO_API_KEY to .env"
    );

    if (zernioKey) {
      try {
        const zernioProfileId = await getOrCreateZernioProfileId();
        if (!zernioProfileId) {
          return res.redirect(`${BASE_URL}/${returnPage}?oauth_error=zernio_profile_failed`);
        }
        const state = generateState();
        pendingStates.set(state, {
          platform: "instagram",
          userId,
          profileId: ourProfileId,
          zernioProfileId,
          createdAt: Date.now(),
          oauthReturnPage: parseOauthReturnPage(req) || undefined,
        });
        const redirectUrl = `${API_BASE_URL}/api/auth/zernio/instagram/callback?state=${state}`;
        const connectUrl = new URL(`${ZERNIO_API_BASE}/connect/instagram`);
        connectUrl.searchParams.set("profileId", zernioProfileId);
        connectUrl.searchParams.set("redirect_url", redirectUrl);

        const connectRes = await fetch(connectUrl.toString(), {
          headers: { Authorization: `Bearer ${zernioKey}` },
        });
        if (!connectRes.ok) {
          const err = await connectRes.text();
          console.error("[Zernio] Instagram connect URL error:", connectRes.status, err);
          return res.redirect(`${BASE_URL}/${returnPage}?oauth_error=zernio_connect_failed`);
        }
        const { authUrl } = await connectRes.json();
        if (!authUrl) {
          return res.redirect(`${BASE_URL}/${returnPage}?oauth_error=zernio_no_auth_url`);
        }
        return res.redirect(authUrl);
      } catch (err) {
        console.error("[Zernio] Instagram init error:", err);
        return res.redirect(`${BASE_URL}/${returnPage}?oauth_error=zernio_init_failed`);
      }
    }

    const clientId = (process.env.INSTAGRAM_CLIENT_ID || "").trim();
    if (!clientId) {
      console.warn(
        "Instagram: ZERNIO_API_KEY is missing (length: %s). Add ZERNIO_API_KEY from zernio.com, or set INSTAGRAM_* for direct Meta OAuth.",
        (process.env.ZERNIO_API_KEY || process.env.LATE_API_KEY || "").length
      );
      return res.redirect(`${BASE_URL}/${returnPage}?oauth_error=instagram_not_configured`);
    }
    const state = generateState();
    pendingStates.set(state, {
      platform: "instagram",
      userId,
      profileId: ourProfileId,
      createdAt: Date.now(),
      oauthReturnPage: parseOauthReturnPage(req) || undefined,
    });
    const redirectUri = `${API_BASE_URL}/api/auth/instagram/callback`;
    const url = new URL(IG_AUTH);
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", "user_profile,user_media");
    url.searchParams.set("state", state);
    res.redirect(url.toString());
  });

  async function handleZernioInstagramCallback(req, res) {
    const { state, error, accountId: queryAccountId, username } = req.query;
    const pendingEarly = state ? pendingStates.get(state) : null;
    const pageEarly = postOauthPage(pendingEarly, "instagram");
    if (error) {
      return res.redirect(`${BASE_URL}/${pageEarly}?oauth_error=${encodeURIComponent(error)}`);
    }
    const pending = pendingStates.get(state);
    if (!pending || pending.platform !== "instagram") {
      return res.redirect(`${BASE_URL}/${pageEarly}?oauth_error=invalid_state`);
    }
    const callbackUserId = getSessionUserId(req);
    const pendingUserId = pending?.userId ? String(pending.userId) : "";
    const callbackUserIdStr = callbackUserId ? String(callbackUserId) : "";
    const isLocalToCloudTransition =
      pendingUserId.startsWith("local_") &&
      Boolean(callbackUserIdStr) &&
      !callbackUserIdStr.startsWith("local_");
    const isLocalPairMismatch =
      pendingUserId.startsWith("local_") &&
      callbackUserIdStr.startsWith("local_") &&
      pendingUserId !== callbackUserIdStr;

    if (callbackUserIdStr && pendingUserId !== callbackUserIdStr && !isLocalToCloudTransition && !isLocalPairMismatch) {
      pendingStates.delete(state);
      return res.redirect(`${BASE_URL}/${postOauthPage(pending, "instagram")}?oauth_error=invalid_state`);
    }
    const successPage = postOauthPage(pending, "instagram");
    pendingStates.delete(state);

    const apiKey = getZernioApiKey();
    if (!apiKey) {
      return res.redirect(`${BASE_URL}/${successPage}?oauth_error=zernio_not_configured`);
    }

    try {
      let accountId = queryAccountId;
      let displayUsername = username;
      if (!accountId || !displayUsername) {
        const accountsRes = await fetch(`${ZERNIO_API_BASE}/accounts`, {
          headers: { Authorization: `Bearer ${apiKey}` },
        });
        if (!accountsRes.ok) {
          return res.redirect(`${BASE_URL}/${successPage}?oauth_error=zernio_fetch_accounts_failed`);
        }
        const accountsData = await accountsRes.json().catch(() => ({}));
        const list = normalizeZernioAccountsPayload(accountsData);
        const ig = list.find(
          (a) => mapZernioPlatform(a.platform || a.type || a.provider || a.channel) === "instagram"
        );
        const acc = ig || (list.length ? list[list.length - 1] : null);
        if (acc) {
          accountId = accountId || acc._id || acc.id || acc.accountId;
          displayUsername = displayUsername || acc.username || acc.name || acc.displayName || "Instagram";
        }
      }
      if (!accountId) {
        return res.redirect(`${BASE_URL}/${successPage}?oauth_error=zernio_no_account`);
      }
      const id = String(accountId);
      tokenStore.set(id, {
        platform: "instagram",
        ownerUserId: callbackUserId || pending.userId,
        profileId: pending.profileId || null,
        zernioAccountId: id,
        username: displayUsername ? decodeURIComponent(String(displayUsername)) : "Instagram",
        instagramViaZernio: true,
      });
      const profileQuery = profileParam(pending.profileId);
      const usernameParam = encodeURIComponent(
        displayUsername ? decodeURIComponent(String(displayUsername)) : "Instagram"
      );
      res.redirect(
        `${BASE_URL}/${successPage}?oauth_success=1&platform=instagram&account_id=${id}&username=${usernameParam}&zernio_account_id=${id}${profileQuery}`
      );
    } catch (err) {
      console.error("[Zernio] Instagram callback error:", err);
      res.redirect(`${BASE_URL}/${successPage}?oauth_error=token_exchange_failed`);
    }
  }

  app.get("/api/auth/zernio/instagram/callback", handleZernioInstagramCallback);
  app.get("/api/auth/late/instagram/callback", handleZernioInstagramCallback);

  const zernioConnectPlatformMap = {
    facebook: { slugs: ["facebook"], appPlatform: "facebook" },
    google_business: {
      slugs: ["google-business", "google-business-profile", "google-business-location", "google_business"],
      appPlatform: "google_business",
      extraParams: { headless: "true" },
    },
    whatsapp: { slugs: ["whatsapp"], appPlatform: "whatsapp" },
  };

  function registerZernioOAuthPlatformRoute(routePlatform) {
    const config = zernioConnectPlatformMap[routePlatform];
    if (!config) return;

    app.get(`/api/auth/${routePlatform}`, async (req, res) => {
      const hubReturn = parseOauthReturnPage(req);
      const userId = requireSessionOrRedirect(
        req,
        res,
        hubReturn || oauthPageForPlatform(config.appPlatform)
      );
      if (!userId) return;
      const zernioKey = getZernioApiKey();
      if (!zernioKey) {
        return res.redirect(
          oauthRedirect(config.appPlatform, "oauth_error=zernio_not_configured", hubReturn || undefined)
        );
      }
      try {
        const zernioProfileId = await getOrCreateZernioProfileId();
        if (!zernioProfileId) {
          return res.redirect(
            oauthRedirect(config.appPlatform, "oauth_error=zernio_profile_failed", hubReturn || undefined)
          );
        }
        const state = generateState();
        const ourProfileId = normalizeRequestedProfileId(req.query.profile_id);
        pendingStates.set(state, {
          platform: config.appPlatform,
          userId,
          profileId: ourProfileId,
          zernioProfileId,
          createdAt: Date.now(),
          oauthReturnPage: hubReturn || undefined,
        });
        const redirectUrl = `${API_BASE_URL}/api/auth/zernio/platform/callback?state=${state}`;
        const authUrl = await getZernioConnectUrl({
          ZERNIO_API_BASE,
          zernioKey,
          platformSlugs: config.slugs,
          profileId: zernioProfileId,
          redirectUrl,
          extraParams: config.extraParams,
        });
        return res.redirect(authUrl);
      } catch (e) {
        const msg = String(e?.message || "");
        console.error(`[Zernio ${routePlatform}] connect init failed:`, msg);
        if (routePlatform === "google_business" && msg.includes("Platform not supported")) {
          return res.redirect(
            oauthRedirect(config.appPlatform, "oauth_error=zernio_gmb_not_supported", hubReturn || undefined)
          );
        }
        if (msg.startsWith("zernio_connect_failed")) {
          return res.redirect(
            oauthRedirect(config.appPlatform, "oauth_error=zernio_connect_failed", hubReturn || undefined)
          );
        }
        if (msg === "zernio_no_auth_url") {
          return res.redirect(
            oauthRedirect(config.appPlatform, "oauth_error=zernio_no_auth_url", hubReturn || undefined)
          );
        }
        return res.redirect(
          oauthRedirect(config.appPlatform, "oauth_error=zernio_init_failed", hubReturn || undefined)
        );
      }
    });
  }

  registerZernioOAuthPlatformRoute("facebook");
  registerZernioOAuthPlatformRoute("google_business");
  registerZernioOAuthPlatformRoute("whatsapp");

  app.get("/api/auth/zernio/platform/callback", async (req, res) => {
    const {
      state,
      error,
      accountId: queryAccountId,
      username: queryUsername,
      connect_token: queryConnectToken,
      connectToken: queryConnectTokenCamel,
    } = req.query;
    if (error) {
      const pendingForError = state ? pendingStates.get(String(state)) : null;
      const platformForError = pendingForError?.platform || "facebook";
      return res.redirect(
        oauthRedirect(
          platformForError,
          `oauth_error=${encodeURIComponent(error)}`,
          pendingForError?.oauthReturnPage
        )
      );
    }
    let resolvedState = state ? String(state) : "";
    let pending = pendingStates.get(resolvedState);
    const callbackUserId = getSessionUserId(req);
    const callbackUserIdStr = callbackUserId ? String(callbackUserId) : "";
    // Some Zernio provider flows may drop/replace query params on redirect.
    // Recover by using the most recent pending Zernio state for the same user.
    if (!pending) {
      const now = Date.now();
      const recentWindowMs = 20 * 60 * 1000;
      const candidates = Array.from(pendingStates.entries()).filter(([, value]) => {
        if (!value) return false;
        const isZernioPlatform =
          value.platform === "facebook" ||
          value.platform === "google_business" ||
          value.platform === "whatsapp" ||
          value.platform === "google_calendar" ||
          value.platform === "outlook_calendar" ||
          value.platform === "google_reviews" ||
          value.platform === "tripadvisor";
        if (!isZernioPlatform) return false;
        const createdAt = Number(value.createdAt || 0);
        if (!createdAt || now - createdAt > recentWindowMs) return false;
        if (!callbackUserIdStr) return true;
        const pendingUserId = String(value.userId || "");
        const sameUser = pendingUserId === callbackUserIdStr;
        const localToLocalMismatch =
          pendingUserId.startsWith("local_") && callbackUserIdStr.startsWith("local_");
        return sameUser || localToLocalMismatch;
      });
      if (candidates.length === 1) {
        [resolvedState, pending] = candidates[0];
      }
    }
    if (!pending) {
      return res.redirect(oauthRedirect("facebook", "oauth_error=invalid_state"));
    }
    const pendingUserId = pending?.userId ? String(pending.userId) : "";
    const isLocalToCloudTransition =
      pendingUserId.startsWith("local_") &&
      Boolean(callbackUserIdStr) &&
      !callbackUserIdStr.startsWith("local_");
    const isLocalToLocalTransition =
      pendingUserId.startsWith("local_") && callbackUserIdStr.startsWith("local_");

    if (
      callbackUserIdStr &&
      pendingUserId !== callbackUserIdStr &&
      !isLocalToCloudTransition &&
      !isLocalToLocalTransition
    ) {
      pendingStates.delete(resolvedState);
      return res.redirect(
        oauthRedirect(
          pending?.platform || "facebook",
          "oauth_error=invalid_state",
          pending?.oauthReturnPage
        )
      );
    }
    pendingStates.delete(resolvedState);

    const apiKey = getZernioApiKey();
    if (!apiKey) {
      return res.redirect(
        oauthRedirect(
          pending?.platform || "facebook",
          "oauth_error=zernio_not_configured",
          pending?.oauthReturnPage
        )
      );
    }

    try {
      const connectToken =
        String(queryConnectToken || queryConnectTokenCamel || "").trim() || null;
      if (pending.platform === "google_business" && connectToken) {
        await resolveAndSelectGoogleBusinessLocation({
          ZERNIO_API_BASE,
          apiKey,
          connectToken,
        });
      }

      const { accountId, username, rawPlatform } = await resolveZernioAccountAfterCallback({
        ZERNIO_API_BASE,
        apiKey,
        normalizeZernioAccountsPayload,
        mapZernioPlatform,
        desiredPlatform: pending.platform,
        queryAccountId,
        queryUsername,
      });

      const zernioAccountId = String(accountId);
      const appAccountId = `zernio_${zernioAccountId.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
      const safeUsername = String(username || pending.platform || "account").replace(/^@/, "");

      tokenStore.set(appAccountId, {
        platform: pending.platform,
        ownerUserId: pending.userId,
        profileId: pending.profileId || null,
        accessToken: null,
        isZernio: true,
        zernioAccountId,
        zernioPlatform: rawPlatform || pending.platform,
        username: safeUsername,
      });

      const profileQuery = profileParam(pending.profileId);
      const successPath = postOauthPage(pending, pending.platform);
      return res.redirect(
        `${BASE_URL}/${successPath}?oauth_success=1&platform=${encodeURIComponent(
          pending.platform
        )}&account_id=${encodeURIComponent(appAccountId)}&username=${encodeURIComponent(
          safeUsername
        )}&zernio_account_id=${encodeURIComponent(zernioAccountId)}${profileQuery}`
      );
    } catch (e) {
      const msg = String(e?.message || "");
      if (msg === "zernio_fetch_accounts_failed") {
        return res.redirect(
          oauthRedirect(
            pending?.platform || "facebook",
            "oauth_error=zernio_fetch_accounts_failed",
            pending?.oauthReturnPage
          )
        );
      }
      if (msg === "zernio_no_account") {
        return res.redirect(
          oauthRedirect(pending?.platform || "facebook", "oauth_error=zernio_no_account", pending?.oauthReturnPage)
        );
      }
      if (
        msg === "zernio_gmb_no_locations" ||
        msg === "zernio_gmb_no_location_id" ||
        msg === "zernio_gmb_select_failed"
      ) {
        return res.redirect(
          oauthRedirect(
            pending?.platform || "facebook",
            "oauth_error=zernio_gmb_selection_failed",
            pending?.oauthReturnPage
          )
        );
      }
      return res.redirect(
        oauthRedirect(pending?.platform || "facebook", "oauth_error=token_exchange_failed", pending?.oauthReturnPage)
      );
    }
  });

  app.get("/api/auth/instagram/callback", async (req, res) => {
    const { code, state, error } = req.query;
    const pendingMeta = state ? pendingStates.get(state) : null;
    const igPage = postOauthPage(pendingMeta, "instagram");
    if (error) {
      return res.redirect(`${BASE_URL}/${igPage}?oauth_error=${error}`);
    }
    const pending = pendingMeta;
    if (!pending) {
      return res.redirect(`${BASE_URL}/${igPage}?oauth_error=invalid_state`);
    }
    const callbackUserId = getSessionUserId(req);
    if (!callbackUserId || pending.userId !== callbackUserId) {
      pendingStates.delete(state);
      return res.redirect(`${BASE_URL}/${postOauthPage(pending, "instagram")}?oauth_error=invalid_state`);
    }
    const igSuccessPage = postOauthPage(pending, "instagram");
    pendingStates.delete(state);

    const clientId = process.env.INSTAGRAM_CLIENT_ID;
    const clientSecret = process.env.INSTAGRAM_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      return res.redirect(`${BASE_URL}/${igSuccessPage}?oauth_error=instagram_not_configured`);
    }

    try {
      const redirectUri = `${API_BASE_URL}/api/auth/instagram/callback`;
      const body = new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: "authorization_code",
        redirect_uri: redirectUri,
        code: code,
      });
      const tokenRes = await fetch(IG_TOKEN, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: body.toString(),
      });
      const data = await tokenRes.json();
      if (data.error) {
        return res.redirect(`${BASE_URL}/${igSuccessPage}?oauth_error=${data.error_message || data.error}`);
      }
      const accountId = crypto.randomUUID();
      tokenStore.set(accountId, {
        platform: "instagram",
        ownerUserId: pending.userId,
        profileId: pending.profileId || null,
        accessToken: data.access_token,
        userId: data.user_id,
        username: data.user?.username || `user_${data.user_id}`,
      });
      const username = data.user?.username || `user_${data.user_id}`;
      const profileQuery = profileParam(pending.profileId);
      res.redirect(
        `${BASE_URL}/${igSuccessPage}?oauth_success=1&platform=instagram&account_id=${accountId}&username=${encodeURIComponent(username)}${profileQuery}`
      );
    } catch (err) {
      console.error("Instagram OAuth error:", err);
      res.redirect(`${BASE_URL}/${igSuccessPage}?oauth_error=token_exchange_failed`);
    }
  });

  // --- TikTok OAuth ---
  app.get("/api/auth/tiktok", async (req, res) => {
    const userId = requireSessionOrRedirect(req, res, "social-media");
    if (!userId) return;

    const ourProfileId = normalizeRequestedProfileId(req.query.profile_id);
    const provider = String(req.query.provider || "auto").toLowerCase();
    const tryZernio = provider !== "official";
    const zernioKey = getZernioApiKey();
    if (tryZernio && zernioKey) {
      try {
        const zernioProfileId = await getOrCreateZernioProfileId();
        if (zernioProfileId) {
          const state = generateState();
          pendingStates.set(state, {
            platform: "tiktok",
            userId,
            profileId: ourProfileId,
            zernioProfileId,
            createdAt: Date.now(),
          });
          const redirectUrl = `${API_BASE_URL}/api/auth/zernio/platform/callback?state=${state}`;
          const authUrl = await getZernioConnectUrl({
            ZERNIO_API_BASE,
            zernioKey,
            platformSlugs: ["tiktok"],
            profileId: zernioProfileId,
            redirectUrl,
          });
          return res.redirect(authUrl);
        }
      } catch (e) {
        // Fallback to official TikTok OAuth if Zernio connect is unavailable.
        console.warn("[TikTok] Zernio connect unavailable, using official OAuth:", String(e?.message || e));
      }
    }

    const clientKey = process.env.TIKTOK_CLIENT_KEY;
    if (!clientKey) {
      return res.redirect(`${BASE_URL}/social-media?oauth_error=tiktok_not_configured`);
    }
    const state = generateState();
    pendingStates.set(state, { platform: "tiktok", userId, profileId: ourProfileId, createdAt: Date.now() });
    const redirectUri = `${API_BASE_URL}/api/auth/tiktok/callback`;
    const url = new URL(TIKTOK_AUTH);
    url.searchParams.set("client_key", clientKey);
    url.searchParams.set("scope", "user.info.basic,video.list");
    url.searchParams.set("response_type", "code");
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("state", state);
    res.redirect(url.toString());
  });

  app.get("/api/auth/tiktok/callback", async (req, res) => {
    const { code, state, error } = req.query;
    if (error) {
      return res.redirect(`${BASE_URL}/social-media?oauth_error=${error}`);
    }
    const pending = pendingStates.get(state);
    if (!pending) {
      return res.redirect(`${BASE_URL}/social-media?oauth_error=invalid_state`);
    }
    const callbackUserId = getSessionUserId(req);
    if (!callbackUserId || pending.userId !== callbackUserId) {
      pendingStates.delete(state);
      return res.redirect(`${BASE_URL}/social-media?oauth_error=invalid_state`);
    }
    pendingStates.delete(state);

    const clientKey = process.env.TIKTOK_CLIENT_KEY;
    const clientSecret = process.env.TIKTOK_CLIENT_SECRET;
    if (!clientKey || !clientSecret) {
      return res.redirect(`${BASE_URL}/social-media?oauth_error=tiktok_not_configured`);
    }

    try {
      const redirectUri = `${API_BASE_URL}/api/auth/tiktok/callback`;
      const body = new URLSearchParams({
        client_key: clientKey,
        client_secret: clientSecret,
        code: code,
        grant_type: "authorization_code",
        redirect_uri: redirectUri,
      });
      const tokenRes = await fetch(TIKTOK_TOKEN, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Cache-Control": "no-cache",
        },
        body: body.toString(),
      });
      const data = await tokenRes.json();
      if (data.error) {
        return res.redirect(`${BASE_URL}/social-media?oauth_error=${data.error_description || data.error}`);
      }
      const accountId = crypto.randomUUID();
      let username = data.open_id;
      try {
        const userRes = await fetch("https://open.tiktokapis.com/v2/user/info/?fields=username,display_name", {
          headers: {
            Authorization: `Bearer ${data.access_token}`,
            "Content-Type": "application/json",
          },
        });
        const userData = await userRes.json();
        if (userData.data?.user?.username) username = userData.data.user.username;
        else if (userData.data?.user?.display_name) username = userData.data.user.display_name;
      } catch {
        // behåll open_id som fallback
      }
      tokenStore.set(accountId, {
        platform: "tiktok",
        ownerUserId: pending.userId,
        profileId: pending.profileId || null,
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        openId: data.open_id,
        username,
      });
      const profileQuery = profileParam(pending.profileId);
      res.redirect(
        `${BASE_URL}/social-media?oauth_success=1&platform=tiktok&account_id=${accountId}&username=${encodeURIComponent(username)}${profileQuery}`
      );
    } catch (err) {
      console.error("TikTok OAuth error:", err);
      res.redirect(`${BASE_URL}/social-media?oauth_error=token_exchange_failed`);
    }
  });

  // --- X (Twitter) OAuth 2.0 with PKCE ---
  app.get("/api/auth/x", (req, res) => {
    const userId = requireSessionOrRedirect(req, res, "social-media");
    if (!userId) return;
    const clientId = process.env.X_CLIENT_ID;
    if (!clientId) {
      return res.redirect(`${BASE_URL}/social-media?oauth_error=x_not_configured`);
    }
    const state = generateState();
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = generateCodeChallenge(codeVerifier);
    pendingStates.set(state, {
      platform: "x",
      userId,
      profileId: normalizeRequestedProfileId(req.query.profile_id),
      codeVerifier,
      createdAt: Date.now(),
    });
    const redirectUri = `${API_BASE_URL}/api/auth/x/callback`;
    const url = new URL(X_AUTH);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("scope", X_SCOPES);
    url.searchParams.set("state", state);
    url.searchParams.set("code_challenge", codeChallenge);
    url.searchParams.set("code_challenge_method", "S256");
    res.redirect(url.toString());
  });

  app.get("/api/auth/x/callback", async (req, res) => {
    const { code, state, error } = req.query;
    if (error) return res.redirect(`${BASE_URL}/social-media?oauth_error=${error}`);
    const pending = pendingStates.get(state);
    if (!pending) return res.redirect(`${BASE_URL}/social-media?oauth_error=invalid_state`);
    const callbackUserId = getSessionUserId(req);
    if (!callbackUserId || pending.userId !== callbackUserId) {
      pendingStates.delete(state);
      return res.redirect(`${BASE_URL}/social-media?oauth_error=invalid_state`);
    }
    pendingStates.delete(state);
    const clientId = process.env.X_CLIENT_ID;
    const clientSecret = process.env.X_CLIENT_SECRET;
    if (!clientId) return res.redirect(`${BASE_URL}/social-media?oauth_error=x_not_configured`);
    try {
      const redirectUri = `${API_BASE_URL}/api/auth/x/callback`;
      const body = new URLSearchParams({
        grant_type: "authorization_code",
        code: String(code),
        redirect_uri: redirectUri,
        code_verifier: pending.codeVerifier,
      });
      const headers = { "Content-Type": "application/x-www-form-urlencoded" };
      if (clientSecret) {
        headers["Authorization"] = `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`;
      } else {
        body.set("client_id", clientId);
      }
      const tokenRes = await fetchXToken(body, headers);
      const tokenData = await tokenRes.json();
      if (tokenData.error) {
        console.error("[X] token error:", tokenData.error, tokenData.error_description);
        return res.redirect(`${BASE_URL}/social-media?oauth_error=${tokenData.error}`);
      }
      const userRes = await fetch(
        "https://api.twitter.com/2/users/me?user.fields=public_metrics,profile_image_url,description,username,name,created_at",
        { headers: { Authorization: `Bearer ${tokenData.access_token}` } }
      );
      const userData = await userRes.json();
      const user = userData.data || {};
      const accountId = crypto.randomUUID();
      tokenStore.set(accountId, {
        platform: "x",
        ownerUserId: pending.userId,
        profileId: pending.profileId || null,
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token,
        xUserId: user.id,
      });
      const username = user.username || user.name || accountId.slice(0, 8);
      const profileQuery = profileParam(pending.profileId);
      res.redirect(
        `${BASE_URL}/social-media?oauth_success=1&platform=x&account_id=${accountId}&username=${encodeURIComponent(username)}${profileQuery}`
      );
    } catch (err) {
      console.error("[X] OAuth error:", err);
      res.redirect(`${BASE_URL}/social-media?oauth_error=token_exchange_failed`);
    }
  });

  // --- YouTube (Google) OAuth ---
  app.get("/api/auth/youtube", (req, res) => {
    const userId = requireSessionOrRedirect(req, res, "social-media");
    if (!userId) return;
    const clientId = process.env.GOOGLE_CLIENT_ID;
    if (!clientId) {
      return res.redirect(`${BASE_URL}/social-media?oauth_error=youtube_not_configured`);
    }
    const state = generateState();
    pendingStates.set(state, {
      platform: "youtube",
      userId,
      profileId: normalizeRequestedProfileId(req.query.profile_id),
      createdAt: Date.now(),
    });
    const redirectUri = `${API_BASE_URL}/api/auth/youtube/callback`;
    const url = new URL(GOOGLE_AUTH);
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", YOUTUBE_SCOPES);
    url.searchParams.set("access_type", "offline");
    url.searchParams.set("prompt", "consent");
    url.searchParams.set("state", state);
    res.redirect(url.toString());
  });

  app.get("/api/auth/youtube/callback", async (req, res) => {
    const { code, state, error } = req.query;
    if (error) {
      return res.redirect(`${BASE_URL}/social-media?oauth_error=${error}`);
    }
    const pending = pendingStates.get(state);
    if (!pending) {
      return res.redirect(`${BASE_URL}/social-media?oauth_error=invalid_state`);
    }
    const callbackUserId = getSessionUserId(req);
    if (!callbackUserId || pending.userId !== callbackUserId) {
      pendingStates.delete(state);
      return res.redirect(`${BASE_URL}/social-media?oauth_error=invalid_state`);
    }
    pendingStates.delete(state);

    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      return res.redirect(`${BASE_URL}/social-media?oauth_error=youtube_not_configured`);
    }

    try {
      const redirectUri = `${API_BASE_URL}/api/auth/youtube/callback`;
      const body = new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code: code,
        grant_type: "authorization_code",
        redirect_uri: redirectUri,
      });
      const tokenRes = await fetch(GOOGLE_TOKEN, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: body.toString(),
      });
      const data = await tokenRes.json();
      if (data.error) {
        return res.redirect(`${BASE_URL}/social-media?oauth_error=${data.error_description || data.error}`);
      }
      const accountId = crypto.randomUUID();
      tokenStore.set(accountId, {
        platform: "youtube",
        ownerUserId: pending.userId,
        profileId: pending.profileId || null,
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        username: null,
      });
      // Hämta kanalinfo för username
      let username = "YouTube-konto";
      const meRes = await fetch("https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true", {
        headers: { Authorization: `Bearer ${data.access_token}` },
      });
      const meData = await meRes.json();
      if (meData.items?.[0]?.snippet?.title) {
        username = meData.items[0].snippet.title;
      }
      const profileQuery = profileParam(pending.profileId);
      res.redirect(
        `${BASE_URL}/social-media?oauth_success=1&platform=youtube&account_id=${accountId}&username=${encodeURIComponent(username)}${profileQuery}`
      );
    } catch (err) {
      console.error("YouTube OAuth error:", err);
      res.redirect(`${BASE_URL}/social-media?oauth_error=token_exchange_failed`);
    }
  });

  // --- Shopify OAuth (kräver shop-parameter: mittbutik.myshopify.com) ---
  app.get("/api/auth/shopify", (req, res) => {
    const userId = requireSessionOrRedirect(req, res, "ecommerce");
    if (!userId) return;
    const clientId = process.env.SHOPIFY_API_KEY;
    const shop = req.query.shop;
    if (!clientId) {
      return res.redirect(`${BASE_URL}/ecommerce?oauth_error=shopify_not_configured`);
    }
    if (!shop) {
      return res.redirect(`${BASE_URL}/ecommerce?oauth_error=shopify_missing_shop`);
    }
    const shopName = String(shop).replace(/\.myshopify\.com$/, "");
    const state = generateState();
    pendingStates.set(state, {
      platform: "shopify",
      userId,
      profileId: normalizeRequestedProfileId(req.query.profile_id),
      shop,
      createdAt: Date.now(),
    });
    const shopifyPublicBase = getShopifyPublicBaseUrl();
    const redirectUri = `${shopifyPublicBase}/api/auth/shopify/callback`;
    if (!/^https:\/\//i.test(shopifyPublicBase)) {
      return res.redirect(`${BASE_URL}/ecommerce?oauth_error=shopify_public_url_must_be_https`);
    }
    const scope = "read_products,read_orders,read_customers";
    const url = `https://${shopName}.myshopify.com/admin/oauth/authorize?client_id=${clientId}&scope=${scope}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}`;
    res.redirect(url);
  });

  app.get("/api/auth/shopify/callback", async (req, res) => {
    const { code, state, shop, error } = req.query;
    if (error) {
      return res.redirect(`${BASE_URL}/ecommerce?oauth_error=${error}`);
    }
    const pending = pendingStates.get(state);
    if (!pending) {
      return res.redirect(`${BASE_URL}/ecommerce?oauth_error=invalid_state`);
    }
    const callbackUserId = getSessionUserId(req);
    // Tunnel callbacks run on a different host than localhost, so callback cookies may be missing.
    // If callback user is present we still enforce strict owner match.
    if (callbackUserId && pending.userId !== callbackUserId) {
      pendingStates.delete(state);
      return res.redirect(`${BASE_URL}/ecommerce?oauth_error=invalid_state`);
    }
    pendingStates.delete(state);
    const apiKey = process.env.SHOPIFY_API_KEY;
    const apiSecret = process.env.SHOPIFY_API_SECRET;
    if (!apiKey || !apiSecret) {
      return res.redirect(`${BASE_URL}/ecommerce?oauth_error=shopify_not_configured`);
    }
    try {
      const shopUrl = pending.shop || shop;
      const tokenRes = await fetch(`https://${shopUrl}/admin/oauth/access_token`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: apiKey,
          client_secret: apiSecret,
          code,
        }),
      });
      const data = await tokenRes.json();
      if (data.error) {
        return res.redirect(`${BASE_URL}/ecommerce?oauth_error=${data.error_description || data.error}`);
      }
      const accountId = crypto.randomUUID();
      const shopName = String(shopUrl).replace(/\.myshopify\.com$/, "");
      tokenStore.set(accountId, {
        platform: "shopify",
        ownerUserId: pending.userId,
        profileId: pending.profileId || null,
        accessToken: data.access_token,
        shop: shopUrl,
      });
      const profileQuery = profileParam(pending.profileId);
      res.redirect(
        `${BASE_URL}/ecommerce?oauth_success=1&platform=shopify&account_id=${accountId}&username=${encodeURIComponent(shopName)}${profileQuery}`
      );
    } catch (err) {
      console.error("Shopify OAuth error:", err);
      res.redirect(`${BASE_URL}/ecommerce?oauth_error=token_exchange_failed`);
    }
  });

  // --- Notion OAuth ---
  app.get("/api/auth/notion", (req, res) => {
    const userId = requireSessionOrRedirect(req, res, "ecommerce");
    if (!userId) return;

    const clientId = String(process.env.NOTION_CLIENT_ID || "").trim();
    if (!clientId) {
      return res.redirect(`${BASE_URL}/ecommerce?oauth_error=notion_not_configured`);
    }

    const notionPublicBase = getNotionPublicBaseUrl();
    if (!/^https:\/\//i.test(notionPublicBase)) {
      return res.redirect(`${BASE_URL}/ecommerce?oauth_error=notion_public_url_must_be_https`);
    }
    const redirectUri = `${notionPublicBase}/api/auth/notion/callback`;

    const state = generateState();
    pendingStates.set(state, {
      platform: "notion",
      userId,
      profileId: normalizeRequestedProfileId(req.query.profile_id),
      createdAt: Date.now(),
    });

    const url = new URL(NOTION_AUTH);
    url.searchParams.set("owner", "user");
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("state", state);
    res.redirect(url.toString());
  });

  app.get("/api/auth/notion/callback", async (req, res) => {
    const { code, state, error } = req.query;
    if (error) {
      return res.redirect(`${BASE_URL}/ecommerce?oauth_error=${encodeURIComponent(String(error))}`);
    }
    const pending = pendingStates.get(state);
    if (!pending || pending.platform !== "notion") {
      return res.redirect(`${BASE_URL}/ecommerce?oauth_error=invalid_state`);
    }

    const callbackUserId = getSessionUserId(req);
    if (callbackUserId && pending.userId !== callbackUserId) {
      pendingStates.delete(state);
      return res.redirect(`${BASE_URL}/ecommerce?oauth_error=invalid_state`);
    }
    pendingStates.delete(state);

    const clientId = String(process.env.NOTION_CLIENT_ID || "").trim();
    const clientSecret = String(process.env.NOTION_CLIENT_SECRET || "").trim();
    if (!clientId || !clientSecret) {
      return res.redirect(`${BASE_URL}/ecommerce?oauth_error=notion_not_configured`);
    }

    try {
      const notionPublicBase = getNotionPublicBaseUrl();
      const redirectUri = `${notionPublicBase}/api/auth/notion/callback`;
      const auth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
      const tokenRes = await fetch(NOTION_TOKEN, {
        method: "POST",
        headers: {
          Authorization: `Basic ${auth}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          grant_type: "authorization_code",
          code,
          redirect_uri: redirectUri,
        }),
      });

      const tokenData = await tokenRes.json().catch(() => ({}));
      if (!tokenRes.ok || !tokenData?.access_token) {
        const rawErr = tokenData?.error || tokenData?.message || "token_exchange_failed";
        return res.redirect(`${BASE_URL}/ecommerce?oauth_error=${encodeURIComponent(String(rawErr))}`);
      }

      const workspaceId = String(tokenData.workspace_id || tokenData.bot_id || "").trim();
      const stableId = workspaceId || crypto.createHash("sha1").update(String(tokenData.access_token)).digest("hex").slice(0, 20);
      const accountId = `notion_${stableId}`;
      const workspaceName = String(tokenData.workspace_name || "Notion Workspace");

      tokenStore.set(accountId, {
        platform: "notion",
        ownerUserId: pending.userId,
        profileId: pending.profileId || null,
        accessToken: tokenData.access_token,
        workspaceId: tokenData.workspace_id,
        workspaceName: tokenData.workspace_name,
        workspaceIcon: tokenData.workspace_icon,
        botId: tokenData.bot_id,
      });

      const profileQuery = profileParam(pending.profileId);
      res.redirect(
        `${BASE_URL}/ecommerce?oauth_success=1&platform=notion&account_id=${encodeURIComponent(
          accountId
        )}&username=${encodeURIComponent(workspaceName)}${profileQuery}`
      );
    } catch (err) {
      console.error("Notion OAuth error:", err);
      res.redirect(`${BASE_URL}/ecommerce?oauth_error=token_exchange_failed`);
    }
  });

  // --- Google Calendar OAuth (official + optional Zernio auto path) ---
  app.get("/api/auth/google_calendar", async (req, res) => {
    const userId = requireSessionOrRedirect(req, res, "calendar");
    if (!userId) return;
    const provider = String(req.query.provider || "auto").trim().toLowerCase();
    const ourProfileId = normalizeRequestedProfileId(req.query.profile_id);

    if (provider !== "official") {
      const zernioKey = getZernioApiKey();
      if (zernioKey) {
        try {
          const zernioProfileId = await getOrCreateZernioProfileId();
          if (!zernioProfileId) {
            return res.redirect(`${BASE_URL}/calendar?oauth_error=zernio_profile_failed`);
          }
          const state = generateState();
          pendingStates.set(state, {
            platform: "google_calendar",
            userId,
            profileId: ourProfileId,
            zernioProfileId,
            createdAt: Date.now(),
          });
          const redirectUrl = `${API_BASE_URL}/api/auth/zernio/platform/callback?state=${state}`;
          const authUrl = await getZernioConnectUrl({
            ZERNIO_API_BASE,
            zernioKey,
            platformSlugs: ["google-calendar", "google_calendar", "google-workspace-calendar", "google-workspace"],
            profileId: zernioProfileId,
            redirectUrl,
          });
          return res.redirect(authUrl);
        } catch (e) {
          const msg = String(e?.message || "");
          if (provider === "zernio") {
            if (msg.startsWith("zernio_connect_failed")) {
              return res.redirect(`${BASE_URL}/calendar?oauth_error=zernio_connect_failed`);
            }
            return res.redirect(`${BASE_URL}/calendar?oauth_error=zernio_init_failed`);
          }
        }
      } else if (provider === "zernio") {
        return res.redirect(`${BASE_URL}/calendar?oauth_error=zernio_not_configured`);
      }
    }

    const clientId = process.env.GOOGLE_CLIENT_ID;
    if (!clientId) {
      return res.redirect(`${BASE_URL}/calendar?oauth_error=google_calendar_not_configured`);
    }
    const state = generateState();
    pendingStates.set(state, { platform: "google_calendar", userId, profileId: ourProfileId, createdAt: Date.now() });
    const redirectUri = `${API_BASE_URL}/api/auth/google-calendar/callback`;
    const url = new URL(GOOGLE_AUTH);
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", GOOGLE_CALENDAR_SCOPES);
    url.searchParams.set("access_type", "offline");
    url.searchParams.set("prompt", "consent");
    url.searchParams.set("state", state);
    res.redirect(url.toString());
  });

  app.get("/api/auth/google-calendar/callback", async (req, res) => {
    const { code, state, error } = req.query;
    if (error) {
      return res.redirect(`${BASE_URL}/calendar?oauth_error=${encodeURIComponent(String(error))}`);
    }
    const pending = pendingStates.get(state);
    if (!pending) {
      return res.redirect(`${BASE_URL}/calendar?oauth_error=invalid_state`);
    }
    const callbackUserId = getSessionUserId(req);
    const pendingUserId = pending?.userId ? String(pending.userId) : "";
    const callbackUserIdStr = callbackUserId ? String(callbackUserId) : "";
    const isLocalToCloudTransition =
      pendingUserId.startsWith("local_") &&
      Boolean(callbackUserIdStr) &&
      !callbackUserIdStr.startsWith("local_");
    if (callbackUserIdStr && pendingUserId !== callbackUserIdStr && !isLocalToCloudTransition) {
      pendingStates.delete(state);
      return res.redirect(`${BASE_URL}/calendar?oauth_error=invalid_state`);
    }
    pendingStates.delete(state);

    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      return res.redirect(`${BASE_URL}/calendar?oauth_error=google_calendar_not_configured`);
    }
    try {
      const redirectUri = `${API_BASE_URL}/api/auth/google-calendar/callback`;
      const body = new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        grant_type: "authorization_code",
        redirect_uri: redirectUri,
      });
      const tokenRes = await fetch(GOOGLE_TOKEN, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: body.toString(),
      });
      const data = await tokenRes.json();
      if (data.error) {
        return res.redirect(`${BASE_URL}/calendar?oauth_error=${data.error_description || data.error}`);
      }
      let username = "Google Calendar";
      const meRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
        headers: { Authorization: `Bearer ${data.access_token}` },
      });
      const meData = await meRes.json().catch(() => ({}));
      if (meData.email) username = meData.email;
      const identityRaw = String(meData.id || meData.email || username || "").toLowerCase();
      const accountId = `gcal_${crypto.createHash("sha1").update(identityRaw).digest("hex").slice(0, 20)}`;
      tokenStore.set(accountId, {
        platform: "google_calendar",
        ownerUserId: callbackUserId || pending.userId,
        profileId: pending.profileId || null,
        username,
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
      });
      const profileQuery = profileParam(pending.profileId);
      res.redirect(
        `${BASE_URL}/calendar?oauth_success=1&platform=google_calendar&account_id=${encodeURIComponent(accountId)}&username=${encodeURIComponent(username)}${profileQuery}`
      );
    } catch (err) {
      console.error("Google Calendar OAuth error:", err);
      res.redirect(`${BASE_URL}/calendar?oauth_error=token_exchange_failed`);
    }
  });

  // --- Outlook Calendar OAuth (official + optional Zernio auto path) ---
  app.get("/api/auth/outlook_calendar", async (req, res) => {
    const userId = requireSessionOrRedirect(req, res, "calendar");
    if (!userId) return;
    const provider = String(req.query.provider || "auto").trim().toLowerCase();
    const ourProfileId = normalizeRequestedProfileId(req.query.profile_id);

    if (provider !== "official") {
      const zernioKey = getZernioApiKey();
      if (zernioKey) {
        try {
          const zernioProfileId = await getOrCreateZernioProfileId();
          if (!zernioProfileId) {
            return res.redirect(`${BASE_URL}/calendar?oauth_error=zernio_profile_failed`);
          }
          const state = generateState();
          pendingStates.set(state, {
            platform: "outlook_calendar",
            userId,
            profileId: ourProfileId,
            zernioProfileId,
            createdAt: Date.now(),
          });
          const redirectUrl = `${API_BASE_URL}/api/auth/zernio/platform/callback?state=${state}`;
          const authUrl = await getZernioConnectUrl({
            ZERNIO_API_BASE,
            zernioKey,
            platformSlugs: ["outlook-calendar", "outlook_calendar", "microsoft-calendar", "microsoft-outlook-calendar"],
            profileId: zernioProfileId,
            redirectUrl,
          });
          return res.redirect(authUrl);
        } catch (e) {
          const msg = String(e?.message || "");
          if (provider === "zernio") {
            if (msg.startsWith("zernio_connect_failed")) {
              return res.redirect(`${BASE_URL}/calendar?oauth_error=zernio_connect_failed`);
            }
            return res.redirect(`${BASE_URL}/calendar?oauth_error=zernio_init_failed`);
          }
        }
      } else if (provider === "zernio") {
        return res.redirect(`${BASE_URL}/calendar?oauth_error=zernio_not_configured`);
      }
    }

    const clientId = process.env.MICROSOFT_CLIENT_ID;
    if (!clientId) {
      return res.redirect(`${BASE_URL}/calendar?oauth_error=outlook_calendar_not_configured`);
    }
    const state = generateState();
    pendingStates.set(state, { platform: "outlook_calendar", userId, profileId: ourProfileId, createdAt: Date.now() });
    const redirectUri = `${API_BASE_URL}/api/auth/outlook-calendar/callback`;
    const url = `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?client_id=${clientId}&response_type=code&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(OUTLOOK_CALENDAR_SCOPES)}&state=${state}&response_mode=query`;
    res.redirect(url);
  });

  app.get("/api/auth/outlook-calendar/callback", async (req, res) => {
    const { code, state, error } = req.query;
    if (error) {
      return res.redirect(`${BASE_URL}/calendar?oauth_error=${error}`);
    }
    const pending = pendingStates.get(state);
    if (!pending) {
      return res.redirect(`${BASE_URL}/calendar?oauth_error=invalid_state`);
    }
    const callbackUserId = getSessionUserId(req);
    if (callbackUserId && pending.userId !== callbackUserId) {
      pendingStates.delete(state);
      return res.redirect(`${BASE_URL}/calendar?oauth_error=invalid_state`);
    }
    pendingStates.delete(state);
    const clientId = process.env.MICROSOFT_CLIENT_ID;
    const clientSecret = process.env.MICROSOFT_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      return res.redirect(`${BASE_URL}/calendar?oauth_error=outlook_calendar_not_configured`);
    }
    try {
      const redirectUri = `${API_BASE_URL}/api/auth/outlook-calendar/callback`;
      const body = new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        grant_type: "authorization_code",
        redirect_uri: redirectUri,
      });
      const tokenRes = await fetch("https://login.microsoftonline.com/common/oauth2/v2.0/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: body.toString(),
      });
      const data = await tokenRes.json();
      if (data.error) {
        return res.redirect(`${BASE_URL}/calendar?oauth_error=${data.error_description || data.error}`);
      }
      const accountId = crypto.randomUUID();
      let username = "Outlook Calendar";
      const meRes = await fetch("https://graph.microsoft.com/v1.0/me", {
        headers: { Authorization: `Bearer ${data.access_token}` },
      });
      const meData = await meRes.json().catch(() => ({}));
      if (meData.mail) username = meData.mail;
      else if (meData.userPrincipalName) username = meData.userPrincipalName;
      tokenStore.set(accountId, {
        platform: "outlook_calendar",
        ownerUserId: callbackUserId || pending.userId,
        profileId: pending.profileId || null,
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        username,
      });
      const profileQuery = profileParam(pending.profileId);
      res.redirect(
        `${BASE_URL}/calendar?oauth_success=1&platform=outlook_calendar&account_id=${encodeURIComponent(accountId)}&username=${encodeURIComponent(username)}${profileQuery}`
      );
    } catch (err) {
      console.error("Outlook Calendar OAuth error:", err);
      res.redirect(`${BASE_URL}/calendar?oauth_error=token_exchange_failed`);
    }
  });

  // --- Google Reviews OAuth (official + optional Zernio auto path) ---
  app.get("/api/auth/google_reviews", async (req, res) => {
    const userId = requireSessionOrRedirect(req, res, "reviews");
    if (!userId) return;
    const provider = String(req.query.provider || "auto").trim().toLowerCase();
    const ourProfileId = normalizeRequestedProfileId(req.query.profile_id);

    if (provider !== "official") {
      const zernioKey = getZernioApiKey();
      if (zernioKey) {
        try {
          const zernioProfileId = await getOrCreateZernioProfileId();
          if (!zernioProfileId) {
            return res.redirect(`${BASE_URL}/reviews?oauth_error=zernio_profile_failed`);
          }
          const state = generateState();
          pendingStates.set(state, {
            platform: "google_reviews",
            userId,
            profileId: ourProfileId,
            zernioProfileId,
            createdAt: Date.now(),
          });
          const redirectUrl = `${API_BASE_URL}/api/auth/zernio/platform/callback?state=${state}`;
          const authUrl = await getZernioConnectUrl({
            ZERNIO_API_BASE,
            zernioKey,
            platformSlugs: ["google-reviews", "google_reviews", "google-business-reviews"],
            profileId: zernioProfileId,
            redirectUrl,
          });
          return res.redirect(authUrl);
        } catch (e) {
          const msg = String(e?.message || "");
          if (provider === "zernio") {
            if (msg.startsWith("zernio_connect_failed")) {
              return res.redirect(`${BASE_URL}/reviews?oauth_error=zernio_connect_failed`);
            }
            return res.redirect(`${BASE_URL}/reviews?oauth_error=zernio_init_failed`);
          }
        }
      } else if (provider === "zernio") {
        return res.redirect(`${BASE_URL}/reviews?oauth_error=zernio_not_configured`);
      }
    }

    const clientId = process.env.GOOGLE_CLIENT_ID;
    if (!clientId) {
      return res.redirect(`${BASE_URL}/reviews?oauth_error=google_reviews_not_configured`);
    }
    const state = generateState();
    pendingStates.set(state, { platform: "google_reviews", userId, profileId: ourProfileId, createdAt: Date.now() });
    const redirectUri = `${API_BASE_URL}/api/auth/google-reviews/callback`;
    const url = new URL(GOOGLE_AUTH);
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", GOOGLE_REVIEWS_SCOPES);
    url.searchParams.set("access_type", "offline");
    url.searchParams.set("prompt", "consent");
    url.searchParams.set("state", state);
    res.redirect(url.toString());
  });

  app.get("/api/auth/google-reviews/callback", async (req, res) => {
    const { code, state, error } = req.query;
    if (error) {
      return res.redirect(`${BASE_URL}/reviews?oauth_error=${encodeURIComponent(String(error))}`);
    }
    const pending = pendingStates.get(state);
    if (!pending) {
      return res.redirect(`${BASE_URL}/reviews?oauth_error=invalid_state`);
    }
    const callbackUserId = getSessionUserId(req);
    const pendingUserId = pending?.userId ? String(pending.userId) : "";
    const callbackUserIdStr = callbackUserId ? String(callbackUserId) : "";
    const isLocalToCloudTransition =
      pendingUserId.startsWith("local_") &&
      Boolean(callbackUserIdStr) &&
      !callbackUserIdStr.startsWith("local_");
    if (callbackUserIdStr && pendingUserId !== callbackUserIdStr && !isLocalToCloudTransition) {
      pendingStates.delete(state);
      return res.redirect(`${BASE_URL}/reviews?oauth_error=invalid_state`);
    }
    pendingStates.delete(state);

    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      return res.redirect(`${BASE_URL}/reviews?oauth_error=google_reviews_not_configured`);
    }
    try {
      const redirectUri = `${API_BASE_URL}/api/auth/google-reviews/callback`;
      const body = new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        grant_type: "authorization_code",
        redirect_uri: redirectUri,
      });
      const tokenRes = await fetch(GOOGLE_TOKEN, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: body.toString(),
      });
      const tokenData = await tokenRes.json().catch(() => ({}));
      if (!tokenRes.ok || tokenData.error || !tokenData.access_token) {
        return res.redirect(`${BASE_URL}/reviews?oauth_error=${encodeURIComponent(String(tokenData.error || "token_exchange_failed"))}`);
      }

      const headers = { Authorization: `Bearer ${tokenData.access_token}` };
      // Primary API: account management v1. Fallback: legacy v4 for tenants with partial migration.
      const accountsRes = await fetch("https://mybusinessaccountmanagement.googleapis.com/v1/accounts", { headers });
      const accountsBody = await accountsRes.json().catch(() => ({}));
      let accounts = Array.isArray(accountsBody.accounts) ? accountsBody.accounts : [];
      if ((!accounts || accounts.length === 0) && accountsRes.ok) {
        const legacyAccountsRes = await fetch("https://mybusiness.googleapis.com/v4/accounts", { headers });
        const legacyAccountsBody = await legacyAccountsRes.json().catch(() => ({}));
        const legacyAccounts = Array.isArray(legacyAccountsBody.accounts) ? legacyAccountsBody.accounts : [];
        if (legacyAccounts.length > 0) {
          accounts = legacyAccounts;
        }
      }
      if (!accountsRes.ok && (!accounts || accounts.length === 0)) {
        const errHint = encodeURIComponent(String(accountsBody?.error?.message || accountsBody?.error || "accounts_api_failed"));
        return res.redirect(`${BASE_URL}/reviews?oauth_error=google_reviews_accounts_api_failed&oauth_hint=${errHint}`);
      }
      const firstAccount = accounts[0] || null;
      const accountNamePath = String(firstAccount?.name || "");
      const accountId = accountNamePath.split("/")[1] || "";
      if (!accountId) {
        return res.redirect(`${BASE_URL}/reviews?oauth_error=google_reviews_no_account_access`);
      }

      const locationsRes = await fetch(
        `https://mybusinessbusinessinformation.googleapis.com/v1/${accountNamePath}/locations?pageSize=20&readMask=name,title`,
        { headers }
      );
      const locationsBody = await locationsRes.json().catch(() => ({}));
      let locations = Array.isArray(locationsBody.locations) ? locationsBody.locations : [];
      if ((!locations || locations.length === 0) && locationsRes.ok) {
        const legacyLocationsRes = await fetch(
          `https://mybusiness.googleapis.com/v4/accounts/${encodeURIComponent(accountId)}/locations?pageSize=20`,
          { headers }
        );
        const legacyLocationsBody = await legacyLocationsRes.json().catch(() => ({}));
        const legacyLocations = Array.isArray(legacyLocationsBody.locations) ? legacyLocationsBody.locations : [];
        if (legacyLocations.length > 0) {
          locations = legacyLocations;
        }
      }
      if (!locationsRes.ok && (!locations || locations.length === 0)) {
        const errHint = encodeURIComponent(String(locationsBody?.error?.message || locationsBody?.error || "locations_api_failed"));
        return res.redirect(`${BASE_URL}/reviews?oauth_error=google_reviews_locations_api_failed&oauth_hint=${errHint}`);
      }
      const firstLocation = locations[0] || null;
      const locationNamePath = String(firstLocation?.name || "");
      const locationId = locationNamePath.split("/").pop() || "";
      const locationTitle = String(firstLocation?.title || firstLocation?.locationName || firstLocation?.storeCode || "Google location");
      if (!locationId) {
        return res.redirect(`${BASE_URL}/reviews?oauth_error=google_reviews_no_location_access`);
      }

      const stableId = crypto
        .createHash("sha1")
        .update(`${accountId}:${locationId}`)
        .digest("hex")
        .slice(0, 20);
      const appAccountId = `grev_${stableId}`;
      tokenStore.set(appAccountId, {
        platform: "google_reviews",
        ownerUserId: callbackUserId || pending.userId,
        profileId: pending.profileId || null,
        username: locationTitle,
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token,
        googleBusinessAccountId: accountId,
        googleBusinessLocationId: locationId,
        googleBusinessLocationName: locationTitle,
      });
      const profileQuery = profileParam(pending.profileId);
      return res.redirect(
        `${BASE_URL}/reviews?oauth_success=1&platform=google_reviews&account_id=${encodeURIComponent(appAccountId)}&username=${encodeURIComponent(locationTitle)}${profileQuery}`
      );
    } catch (err) {
      console.error("Google Reviews OAuth error:", err);
      return res.redirect(`${BASE_URL}/reviews?oauth_error=token_exchange_failed`);
    }
  });

  // --- Tripadvisor connect (Zernio + official API key fallback) ---
  app.get("/api/auth/tripadvisor", async (req, res) => {
    const userId = requireSessionOrRedirect(req, res, "reviews");
    if (!userId) return;
    const provider = String(req.query.provider || "auto").trim().toLowerCase();
    const ourProfileId = normalizeRequestedProfileId(req.query.profile_id);

    if (provider !== "official") {
      const zernioKey = getZernioApiKey();
      if (zernioKey) {
        try {
          const zernioProfileId = await getOrCreateZernioProfileId();
          if (!zernioProfileId) {
            return res.redirect(`${BASE_URL}/reviews?oauth_error=zernio_profile_failed`);
          }
          const state = generateState();
          pendingStates.set(state, {
            platform: "tripadvisor",
            userId,
            profileId: ourProfileId,
            zernioProfileId,
            createdAt: Date.now(),
          });
          const redirectUrl = `${API_BASE_URL}/api/auth/zernio/platform/callback?state=${state}`;
          const authUrl = await getZernioConnectUrl({
            ZERNIO_API_BASE,
            zernioKey,
            platformSlugs: ["tripadvisor", "trip-advisor"],
            profileId: zernioProfileId,
            redirectUrl,
          });
          return res.redirect(authUrl);
        } catch (e) {
          const msg = String(e?.message || "");
          if (provider === "zernio") {
            if (msg.startsWith("zernio_connect_failed")) {
              return res.redirect(`${BASE_URL}/reviews?oauth_error=zernio_connect_failed`);
            }
            return res.redirect(`${BASE_URL}/reviews?oauth_error=zernio_init_failed`);
          }
        }
      } else if (provider === "zernio") {
        return res.redirect(`${BASE_URL}/reviews?oauth_error=zernio_not_configured`);
      }
    }

    const apiKey = String(process.env.TRIPADVISOR_API_KEY || "").trim();
    const locationId = String(req.query.location_id || process.env.TRIPADVISOR_LOCATION_ID || "").trim();
    if (!apiKey || !locationId) {
      return res.redirect(`${BASE_URL}/reviews?oauth_error=tripadvisor_not_configured`);
    }
    const accountId = `tripadvisor_${locationId.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
    tokenStore.set(accountId, {
      platform: "tripadvisor",
      ownerUserId: userId,
      profileId: ourProfileId,
      username: `Tripadvisor ${locationId}`,
      accessToken: null,
      tripadvisorApiKey: apiKey,
      tripadvisorLocationId: locationId,
    });
    const profileQuery = profileParam(ourProfileId);
    return res.redirect(
      `${BASE_URL}/reviews?oauth_success=1&platform=tripadvisor&account_id=${encodeURIComponent(accountId)}&username=${encodeURIComponent(`Tripadvisor ${locationId}`)}${profileQuery}`
    );
  });

  app.post("/api/auth/tripadvisor/manual-connect", (req, res) => {
    const userId = getSessionUserId(req);
    if (!userId) {
      return res.status(401).json({ error: "Not authenticated" });
    }
    const locationId = String(req.body?.locationId || "").trim();
    const providedApiKey = String(req.body?.apiKey || "").trim();
    const profileId = String(req.body?.profileId || "").trim() || null;
    const apiKey = providedApiKey || String(process.env.TRIPADVISOR_API_KEY || "").trim();
    if (!locationId) {
      return res.status(400).json({ error: "locationId is required" });
    }
    if (!apiKey) {
      return res.status(400).json({ error: "Tripadvisor API key is required" });
    }
    const accountId = `tripadvisor_${locationId.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
    tokenStore.set(accountId, {
      platform: "tripadvisor",
      ownerUserId: userId,
      profileId,
      username: `Tripadvisor ${locationId}`,
      accessToken: null,
      tripadvisorApiKey: apiKey,
      tripadvisorLocationId: locationId,
    });
    return res.json({
      ok: true,
      account_id: accountId,
      platform: "tripadvisor",
      username: `Tripadvisor ${locationId}`,
      ...(profileId ? { profile_id: profileId } : {}),
    });
  });

  // --- Gmail OAuth (samma Google OAuth, andra scopes) ---
  app.get("/api/auth/gmail", (req, res) => {
    const userId = requireSessionOrRedirect(req, res, "messages");
    debugLog("pre-fix", "H1", "oauthRoutes.js:/api/auth/gmail", "Gmail OAuth init hit", {
      hasUserId: Boolean(userId),
      profileIdPresent: Boolean(normalizeRequestedProfileId(req.query.profile_id)),
      hasGoogleClientId: Boolean(process.env.GOOGLE_CLIENT_ID),
    });
    if (!userId) return;
    const clientId = process.env.GOOGLE_CLIENT_ID;
    if (!clientId) {
      return res.redirect(`${BASE_URL}/messages?oauth_error=gmail_not_configured`);
    }
    const state = generateState();
    pendingStates.set(state, {
      platform: "gmail",
      userId,
      profileId: normalizeRequestedProfileId(req.query.profile_id),
      createdAt: Date.now(),
    });
    const redirectUri = `${API_BASE_URL}/api/auth/gmail/callback`;
    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", GMAIL_SCOPES);
    url.searchParams.set("access_type", "offline");
    url.searchParams.set("prompt", "consent");
    url.searchParams.set("state", state);
    res.redirect(url.toString());
  });

  app.get("/api/auth/google_drive", (req, res) => {
    const userId = requireSessionOrRedirect(req, res, "content");
    if (!userId) return;
    const clientId = process.env.GOOGLE_CLIENT_ID;
    if (!clientId) {
      return res.redirect(`${BASE_URL}/content?oauth_error=google_drive_not_configured`);
    }
    const state = generateState();
    pendingStates.set(state, {
      platform: "google_drive",
      userId,
      profileId: normalizeRequestedProfileId(req.query.profile_id),
      popup: req.query.popup === "1",
      createdAt: Date.now(),
    });
    const redirectUri = `${API_BASE_URL}/api/auth/google_drive/callback`;
    const url = new URL(GOOGLE_AUTH);
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", GOOGLE_DRIVE_SCOPES);
    url.searchParams.set("access_type", "offline");
    url.searchParams.set("prompt", "consent");
    url.searchParams.set("state", state);
    res.redirect(url.toString());
  });

  app.get("/api/auth/google_drive/callback", async (req, res) => {
    const { code, state, error } = req.query;
    if (error) {
      const errorCode = String(error);
      if (pendingStates.get(state)?.popup) {
        return sendPopupOAuthResult(
          res,
          buildPopupOauthErrorPayload(errorCode),
          buildContentUrl(BASE_URL, buildOauthErrorParams(errorCode)),
          BASE_URL
        );
      }
      return res.redirect(buildContentUrl(BASE_URL, buildOauthErrorParams(errorCode)));
    }
    const pending = pendingStates.get(state);
    if (!pending) {
      return res.redirect(
        buildContentUrl(
          BASE_URL,
          buildOauthErrorParams("invalid_state", {
            status: 400,
            exception: "OAuth state was missing or expired.",
          })
        )
      );
    }
    const callbackUserId = getSessionUserId(req);
    const pendingUserId = pending?.userId ? String(pending.userId) : "";
    const callbackUserIdStr = callbackUserId ? String(callbackUserId) : "";
    const isLocalToCloudTransition =
      pendingUserId.startsWith("local_") &&
      Boolean(callbackUserIdStr) &&
      !callbackUserIdStr.startsWith("local_");
    if (callbackUserIdStr && pendingUserId !== callbackUserIdStr && !isLocalToCloudTransition) {
      pendingStates.delete(state);
      if (pending?.popup) {
        return sendPopupOAuthResult(
          res,
          buildPopupOauthErrorPayload("invalid_state", {
            status: 400,
            exception: "OAuth state did not match the active session.",
          }),
          buildContentUrl(
            BASE_URL,
            buildOauthErrorParams("invalid_state", {
              status: 400,
              exception: "OAuth state did not match the active session.",
            })
          ),
          BASE_URL
        );
      }
      return res.redirect(
        buildContentUrl(
          BASE_URL,
          buildOauthErrorParams("invalid_state", {
            status: 400,
            exception: "OAuth state did not match the active session.",
          })
        )
      );
    }
    pendingStates.delete(state);

    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      if (pending?.popup) {
        return sendPopupOAuthResult(
          res,
          buildPopupOauthErrorPayload("google_drive_not_configured", {
            status: 500,
            exception: "GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET is missing.",
          }),
          buildContentUrl(
            BASE_URL,
            buildOauthErrorParams("google_drive_not_configured", {
              status: 500,
              exception: "GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET is missing.",
            })
          ),
          BASE_URL
        );
      }
      return res.redirect(
        buildContentUrl(
          BASE_URL,
          buildOauthErrorParams("google_drive_not_configured", {
            status: 500,
            exception: "GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET is missing.",
          })
        )
      );
    }

    try {
      const redirectUri = `${API_BASE_URL}/api/auth/google_drive/callback`;
      const body = new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        grant_type: "authorization_code",
        redirect_uri: redirectUri,
      });
      const tokenRes = await fetch(GOOGLE_TOKEN, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: body.toString(),
      });
      const data = await tokenRes.json().catch(() => ({}));
      if (!tokenRes.ok || data.error || !data.access_token) {
        const errorCode = String(data.error_description || data.error || "token_exchange_failed");
        if (pending?.popup) {
          return sendPopupOAuthResult(
            res,
            buildPopupOauthErrorPayload(errorCode, {
              status: tokenRes.status,
              exception: data.error_description || data.error || "Google token exchange failed.",
            }),
            buildContentUrl(
              BASE_URL,
              buildOauthErrorParams(errorCode, {
                status: tokenRes.status,
                exception: data.error_description || data.error || "Google token exchange failed.",
              })
            ),
            BASE_URL
          );
        }
        return res.redirect(buildContentUrl(BASE_URL, buildOauthErrorParams(errorCode, {
          status: tokenRes.status,
          exception: data.error_description || data.error || "Google token exchange failed.",
        })));
      }

      let username = "Google Drive";
      const meRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
        headers: { Authorization: `Bearer ${data.access_token}` },
      });
      const meData = await meRes.json().catch(() => ({}));
      if (meData.email) username = String(meData.email);
      const driveIdentityRaw = String(meData.id || meData.email || username || "").toLowerCase();
      const driveIdentityHash = crypto.createHash("sha1").update(driveIdentityRaw).digest("hex").slice(0, 20);
      const accountId = `gdrive_${driveIdentityHash}`;
      tokenStore.set(accountId, {
        platform: "google_drive",
        ownerUserId: callbackUserId || pending.userId,
        profileId: pending.profileId || null,
        username,
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
      });
      if (pending?.popup) {
        return sendPopupOAuthResult(
          res,
          {
            type: "google_drive_oauth",
            success: true,
            platform: "google_drive",
            account_id: accountId,
            username,
            ...(pending.profileId ? { profile_id: pending.profileId } : {}),
          },
          buildContentUrl(BASE_URL, {
            oauth_success: 1,
            platform: "google_drive",
            account_id: accountId,
            username,
            profile_id: pending.profileId,
          }),
          BASE_URL
        );
      }
      const profileQuery = profileParam(pending.profileId);
      return res.redirect(
        `${BASE_URL}/content?oauth_success=1&platform=google_drive&account_id=${encodeURIComponent(accountId)}&username=${encodeURIComponent(username)}${profileQuery}`
      );
    } catch (err) {
      console.error("Google Drive OAuth error:", err);
      if (pending?.popup) {
        return sendPopupOAuthResult(
          res,
          buildPopupOauthErrorPayload("token_exchange_failed", {
            status: 500,
            exception: getExceptionMessage(err),
          }),
          buildContentUrl(
            BASE_URL,
            buildOauthErrorParams("token_exchange_failed", {
              status: 500,
              exception: getExceptionMessage(err),
            })
          ),
          BASE_URL
        );
      }
      return res.redirect(
        buildContentUrl(
          BASE_URL,
          buildOauthErrorParams("token_exchange_failed", {
            status: 500,
            exception: getExceptionMessage(err),
          })
        )
      );
    }
  });

  app.get("/api/auth/gmail/callback", async (req, res) => {
    const { code, state, error } = req.query;
    debugLog("pre-fix", "H2", "oauthRoutes.js:/api/auth/gmail/callback", "Gmail callback received", {
      hasCode: Boolean(code),
      hasState: Boolean(state),
      error: error ? String(error) : null,
    });
    if (error) {
      return res.redirect(buildPageOauthErrorUrl("messages", String(error)));
    }
    const pending = pendingStates.get(state);
    debugLog("pre-fix", "H2", "oauthRoutes.js:/api/auth/gmail/callback", "Pending state lookup", {
      pendingFound: Boolean(pending),
      pendingPlatform: pending?.platform ?? null,
    });
    if (!pending) {
      return res.redirect(`${BASE_URL}/messages?oauth_error=invalid_state`);
    }
    const callbackUserId = getSessionUserId(req);
    const pendingUserId = pending?.userId ? String(pending.userId) : "";
    const callbackUserIdStr = callbackUserId ? String(callbackUserId) : "";
    const isLocalToCloudTransition =
      pendingUserId.startsWith("local_") &&
      Boolean(callbackUserIdStr) &&
      !callbackUserIdStr.startsWith("local_");
    debugLog("pre-fix", "H2", "oauthRoutes.js:/api/auth/gmail/callback", "Callback user/session validation", {
      callbackUserIdPrefix: callbackUserIdStr ? callbackUserIdStr.slice(0, 14) : null,
      pendingUserIdPrefix: pendingUserId ? pendingUserId.slice(0, 14) : null,
      matches: Boolean(callbackUserIdStr && pendingUserId && callbackUserIdStr === pendingUserId),
      isLocalToCloudTransition,
    });
    if (callbackUserIdStr && pendingUserId !== callbackUserIdStr && !isLocalToCloudTransition) {
      pendingStates.delete(state);
      return res.redirect(`${BASE_URL}/messages?oauth_error=invalid_state`);
    }
    if (isLocalToCloudTransition) {
      debugLog("pre-fix", "H2", "oauthRoutes.js:/api/auth/gmail/callback", "Allowing local-to-cloud transition", {
        callbackUserIdPrefix: callbackUserIdStr.slice(0, 14),
        pendingUserIdPrefix: pendingUserId.slice(0, 14),
      });
    }
    if (!callbackUserId) {
      debugLog("pre-fix", "H2", "oauthRoutes.js:/api/auth/gmail/callback", "Proceeding without callback cookie session", {
        fallbackToPendingUserIdPrefix: pending?.userId ? String(pending.userId).slice(0, 14) : null,
      });
    }
    pendingStates.delete(state);
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      return res.redirect(
        buildPageOauthErrorUrl("messages", "gmail_not_configured", {
          status: 500,
          exception: "GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET is missing.",
        })
      );
    }
    try {
      const redirectUri = `${API_BASE_URL}/api/auth/gmail/callback`;
      const body = new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        grant_type: "authorization_code",
        redirect_uri: redirectUri,
      });
      const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: body.toString(),
      });
      const data = await tokenRes.json();
      debugLog("pre-fix", "H3", "oauthRoutes.js:/api/auth/gmail/callback", "Google token exchange response", {
        status: tokenRes.status,
        ok: tokenRes.ok,
        hasAccessToken: Boolean(data.access_token),
        hasRefreshToken: Boolean(data.refresh_token),
        tokenError: data.error ?? null,
      });
      if (data.error) {
        return res.redirect(
          buildPageOauthErrorUrl("messages", String(data.error), {
            status: tokenRes.status,
            exception: data.error_description || data.error,
          })
        );
      }
      let username = "Gmail";
      const meRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
        headers: { Authorization: `Bearer ${data.access_token}` },
      });
      const meData = await meRes.json();
      if (meData.email) username = meData.email;
      const gmailIdentityRaw = String(meData.id || meData.email || username || "").toLowerCase();
      const gmailIdentityHash = crypto.createHash("sha1").update(gmailIdentityRaw).digest("hex").slice(0, 20);
      const accountId = `gmail_${gmailIdentityHash}`;
      debugLog("pre-fix", "H3", "oauthRoutes.js:/api/auth/gmail/callback", "Resolved stable Gmail account id", {
        hasGoogleUserId: Boolean(meData.id),
        hasEmail: Boolean(meData.email),
        accountId,
      });
      tokenStore.set(accountId, {
        platform: "gmail",
        ownerUserId: callbackUserId || pending.userId,
        profileId: pending.profileId || null,
        username,
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
      });
      const profileQuery = profileParam(pending.profileId);
      res.redirect(
        `${BASE_URL}/messages?oauth_success=1&platform=gmail&account_id=${accountId}&username=${encodeURIComponent(username)}${profileQuery}`
      );
    } catch (err) {
      console.error("Gmail OAuth error:", err);
      res.redirect(
        buildPageOauthErrorUrl("messages", "token_exchange_failed", {
          status: 500,
          exception: getExceptionMessage(err),
        })
      );
    }
  });

  // --- Outlook OAuth (Microsoft) ---
  app.get("/api/auth/outlook", (req, res) => {
    const userId = requireSessionOrRedirect(req, res, "messages");
    if (!userId) return;
    const clientId = process.env.MICROSOFT_CLIENT_ID;
    if (!clientId) {
      return res.redirect(`${BASE_URL}/messages?oauth_error=outlook_not_configured`);
    }
    const state = generateState();
    pendingStates.set(state, {
      platform: "outlook",
      userId,
      profileId: normalizeRequestedProfileId(req.query.profile_id),
      createdAt: Date.now(),
    });
    const redirectUri = `${API_BASE_URL}/api/auth/outlook/callback`;
    const scope = "offline_access openid profile email User.Read Mail.Read";
    const url = `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?client_id=${clientId}&response_type=code&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scope)}&state=${state}&response_mode=query`;
    res.redirect(url);
  });

  app.get("/api/auth/outlook/callback", async (req, res) => {
    const { code, state, error } = req.query;
    if (error) {
      return res.redirect(`${BASE_URL}/messages?oauth_error=${error}`);
    }
    const pending = pendingStates.get(state);
    if (!pending) {
      return res.redirect(`${BASE_URL}/messages?oauth_error=invalid_state`);
    }
    const callbackUserId = getSessionUserId(req);
    if (!callbackUserId || pending.userId !== callbackUserId) {
      pendingStates.delete(state);
      return res.redirect(`${BASE_URL}/messages?oauth_error=invalid_state`);
    }
    pendingStates.delete(state);
    const clientId = process.env.MICROSOFT_CLIENT_ID;
    const clientSecret = process.env.MICROSOFT_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      return res.redirect(`${BASE_URL}/messages?oauth_error=outlook_not_configured`);
    }
    try {
      const redirectUri = `${API_BASE_URL}/api/auth/outlook/callback`;
      const body = new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        grant_type: "authorization_code",
        redirect_uri: redirectUri,
      });
      const tokenRes = await fetch("https://login.microsoftonline.com/common/oauth2/v2.0/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: body.toString(),
      });
      const data = await tokenRes.json();
      if (data.error) {
        return res.redirect(`${BASE_URL}/messages?oauth_error=${data.error_description || data.error}`);
      }
      const accountId = crypto.randomUUID();
      let username = "Outlook";
      const meRes = await fetch("https://graph.microsoft.com/v1.0/me", {
        headers: { Authorization: `Bearer ${data.access_token}` },
      });
      const meData = await meRes.json();
      if (meData.mail) username = meData.mail;
      else if (meData.userPrincipalName) username = meData.userPrincipalName;
      tokenStore.set(accountId, {
        platform: "outlook",
        ownerUserId: pending.userId,
        profileId: pending.profileId || null,
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
      });
      const profileQuery = profileParam(pending.profileId);
      res.redirect(
        `${BASE_URL}/messages?oauth_success=1&platform=outlook&account_id=${accountId}&username=${encodeURIComponent(username)}${profileQuery}`
      );
    } catch (err) {
      console.error("Outlook OAuth error:", err);
      res.redirect(`${BASE_URL}/messages?oauth_error=token_exchange_failed`);
    }
  });
}
