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
const YOUTUBE_SCOPES =
  "https://www.googleapis.com/auth/youtube.readonly https://www.googleapis.com/auth/userinfo.profile";
const GMAIL_SCOPES =
  "https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/userinfo.email";

function generateCodeVerifier() {
  return crypto.randomBytes(32).toString("base64url");
}
function generateCodeChallenge(verifier) {
  return crypto.createHash("sha256").update(verifier).digest("base64url");
}
function profileParam(profileId) {
  return profileId ? `&profile_id=${encodeURIComponent(profileId)}` : "";
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
  }
) {
  // Instagram: via Zernio (recommended) eller direkt Meta OAuth
  app.get("/api/auth/instagram", async (req, res) => {
    res.set("Cache-Control", "no-store, no-cache");
    const zernioKey = getZernioApiKey();
    const ourProfileId = req.query.profile_id || null;
    console.log(
      "[Instagram] ZERNIO_API_KEY:",
      zernioKey ? "set" : "not set — add ZERNIO_API_KEY to .env"
    );

    if (zernioKey) {
      try {
        const zernioProfileId = await getOrCreateZernioProfileId();
        if (!zernioProfileId) {
          return res.redirect(`${BASE_URL}/social-media?oauth_error=zernio_profile_failed`);
        }
        const state = generateState();
        pendingStates.set(state, {
          platform: "instagram",
          profileId: ourProfileId,
          zernioProfileId,
          createdAt: Date.now(),
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
          return res.redirect(`${BASE_URL}/social-media?oauth_error=zernio_connect_failed`);
        }
        const { authUrl } = await connectRes.json();
        if (!authUrl) {
          return res.redirect(`${BASE_URL}/social-media?oauth_error=zernio_no_auth_url`);
        }
        return res.redirect(authUrl);
      } catch (err) {
        console.error("[Zernio] Instagram init error:", err);
        return res.redirect(`${BASE_URL}/social-media?oauth_error=zernio_init_failed`);
      }
    }

    const clientId = (process.env.INSTAGRAM_CLIENT_ID || "").trim();
    if (!clientId) {
      console.warn(
        "Instagram: ZERNIO_API_KEY is missing (length: %s). Add ZERNIO_API_KEY from zernio.com, or set INSTAGRAM_* for direct Meta OAuth.",
        (process.env.ZERNIO_API_KEY || process.env.LATE_API_KEY || "").length
      );
      return res.redirect(`${BASE_URL}/social-media?oauth_error=instagram_not_configured`);
    }
    const state = generateState();
    pendingStates.set(state, { platform: "instagram", profileId: ourProfileId, createdAt: Date.now() });
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
    if (error) {
      return res.redirect(`${BASE_URL}/social-media?oauth_error=${encodeURIComponent(error)}`);
    }
    const pending = pendingStates.get(state);
    if (!pending || pending.platform !== "instagram") {
      return res.redirect(`${BASE_URL}/social-media?oauth_error=invalid_state`);
    }
    pendingStates.delete(state);

    const apiKey = getZernioApiKey();
    if (!apiKey) {
      return res.redirect(`${BASE_URL}/social-media?oauth_error=zernio_not_configured`);
    }

    try {
      let accountId = queryAccountId;
      let displayUsername = username;
      if (!accountId || !displayUsername) {
        const accountsRes = await fetch(`${ZERNIO_API_BASE}/accounts`, {
          headers: { Authorization: `Bearer ${apiKey}` },
        });
        if (!accountsRes.ok) {
          return res.redirect(`${BASE_URL}/social-media?oauth_error=zernio_fetch_accounts_failed`);
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
        return res.redirect(`${BASE_URL}/social-media?oauth_error=zernio_no_account`);
      }
      const id = String(accountId);
      tokenStore.set(id, {
        platform: "instagram",
        zernioAccountId: id,
        username: displayUsername ? decodeURIComponent(String(displayUsername)) : "Instagram",
        instagramViaZernio: true,
      });
      const profileQuery = profileParam(pending.profileId);
      const usernameParam = encodeURIComponent(
        displayUsername ? decodeURIComponent(String(displayUsername)) : "Instagram"
      );
      res.redirect(
        `${BASE_URL}/social-media?oauth_success=1&platform=instagram&account_id=${id}&username=${usernameParam}&zernio_account_id=${id}${profileQuery}`
      );
    } catch (err) {
      console.error("[Zernio] Instagram callback error:", err);
      res.redirect(`${BASE_URL}/social-media?oauth_error=token_exchange_failed`);
    }
  }

  app.get("/api/auth/zernio/instagram/callback", handleZernioInstagramCallback);
  app.get("/api/auth/late/instagram/callback", handleZernioInstagramCallback);

  app.get("/api/auth/instagram/callback", async (req, res) => {
    const { code, state, error } = req.query;
    if (error) {
      return res.redirect(`${BASE_URL}/social-media?oauth_error=${error}`);
    }
    const pending = pendingStates.get(state);
    if (!pending) {
      return res.redirect(`${BASE_URL}/social-media?oauth_error=invalid_state`);
    }
    pendingStates.delete(state);

    const clientId = process.env.INSTAGRAM_CLIENT_ID;
    const clientSecret = process.env.INSTAGRAM_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      return res.redirect(`${BASE_URL}/social-media?oauth_error=instagram_not_configured`);
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
        return res.redirect(`${BASE_URL}/social-media?oauth_error=${data.error_message || data.error}`);
      }
      const accountId = crypto.randomUUID();
      tokenStore.set(accountId, {
        platform: "instagram",
        accessToken: data.access_token,
        userId: data.user_id,
        username: data.user?.username || `user_${data.user_id}`,
      });
      const username = data.user?.username || `user_${data.user_id}`;
      const profileQuery = profileParam(pending.profileId);
      res.redirect(
        `${BASE_URL}/social-media?oauth_success=1&platform=instagram&account_id=${accountId}&username=${encodeURIComponent(username)}${profileQuery}`
      );
    } catch (err) {
      console.error("Instagram OAuth error:", err);
      res.redirect(`${BASE_URL}/social-media?oauth_error=token_exchange_failed`);
    }
  });

  // --- TikTok OAuth ---
  app.get("/api/auth/tiktok", (req, res) => {
    const clientKey = process.env.TIKTOK_CLIENT_KEY;
    if (!clientKey) {
      return res.redirect(`${BASE_URL}/social-media?oauth_error=tiktok_not_configured`);
    }
    const state = generateState();
    pendingStates.set(state, { platform: "tiktok", profileId: req.query.profile_id, createdAt: Date.now() });
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
    const clientId = process.env.X_CLIENT_ID;
    if (!clientId) {
      return res.redirect(`${BASE_URL}/social-media?oauth_error=x_not_configured`);
    }
    const state = generateState();
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = generateCodeChallenge(codeVerifier);
    pendingStates.set(state, { platform: "x", profileId: req.query.profile_id, codeVerifier, createdAt: Date.now() });
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
    const clientId = process.env.GOOGLE_CLIENT_ID;
    if (!clientId) {
      return res.redirect(`${BASE_URL}/social-media?oauth_error=youtube_not_configured`);
    }
    const state = generateState();
    pendingStates.set(state, { platform: "youtube", profileId: req.query.profile_id, createdAt: Date.now() });
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
    pendingStates.set(state, { platform: "shopify", profileId: req.query.profile_id, shop, createdAt: Date.now() });
    const redirectUri = `${API_BASE_URL}/api/auth/shopify/callback`;
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
      tokenStore.set(accountId, { platform: "shopify", accessToken: data.access_token, shop: shopUrl });
      const profileQuery = profileParam(pending.profileId);
      res.redirect(
        `${BASE_URL}/ecommerce?oauth_success=1&platform=shopify&account_id=${accountId}&username=${encodeURIComponent(shopName)}${profileQuery}`
      );
    } catch (err) {
      console.error("Shopify OAuth error:", err);
      res.redirect(`${BASE_URL}/ecommerce?oauth_error=token_exchange_failed`);
    }
  });

  // --- Gmail OAuth (samma Google OAuth, andra scopes) ---
  app.get("/api/auth/gmail", (req, res) => {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    if (!clientId) {
      return res.redirect(`${BASE_URL}/mail?oauth_error=gmail_not_configured`);
    }
    const state = generateState();
    pendingStates.set(state, { platform: "gmail", profileId: req.query.profile_id, createdAt: Date.now() });
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

  app.get("/api/auth/gmail/callback", async (req, res) => {
    const { code, state, error } = req.query;
    if (error) {
      return res.redirect(`${BASE_URL}/mail?oauth_error=${error}`);
    }
    const pending = pendingStates.get(state);
    if (!pending) {
      return res.redirect(`${BASE_URL}/mail?oauth_error=invalid_state`);
    }
    pendingStates.delete(state);
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      return res.redirect(`${BASE_URL}/mail?oauth_error=gmail_not_configured`);
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
      if (data.error) {
        return res.redirect(`${BASE_URL}/mail?oauth_error=${data.error_description || data.error}`);
      }
      const accountId = crypto.randomUUID();
      let username = "Gmail";
      const meRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
        headers: { Authorization: `Bearer ${data.access_token}` },
      });
      const meData = await meRes.json();
      if (meData.email) username = meData.email;
      tokenStore.set(accountId, { platform: "gmail", accessToken: data.access_token, refreshToken: data.refresh_token });
      const profileQuery = profileParam(pending.profileId);
      res.redirect(
        `${BASE_URL}/mail?oauth_success=1&platform=gmail&account_id=${accountId}&username=${encodeURIComponent(username)}${profileQuery}`
      );
    } catch (err) {
      console.error("Gmail OAuth error:", err);
      res.redirect(`${BASE_URL}/mail?oauth_error=token_exchange_failed`);
    }
  });

  // --- Outlook OAuth (Microsoft) ---
  app.get("/api/auth/outlook", (req, res) => {
    const clientId = process.env.MICROSOFT_CLIENT_ID;
    if (!clientId) {
      return res.redirect(`${BASE_URL}/mail?oauth_error=outlook_not_configured`);
    }
    const state = generateState();
    pendingStates.set(state, { platform: "outlook", profileId: req.query.profile_id, createdAt: Date.now() });
    const redirectUri = `${API_BASE_URL}/api/auth/outlook/callback`;
    const scope = "offline_access openid profile email User.Read Mail.Read";
    const url = `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?client_id=${clientId}&response_type=code&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scope)}&state=${state}&response_mode=query`;
    res.redirect(url);
  });

  app.get("/api/auth/outlook/callback", async (req, res) => {
    const { code, state, error } = req.query;
    if (error) {
      return res.redirect(`${BASE_URL}/mail?oauth_error=${error}`);
    }
    const pending = pendingStates.get(state);
    if (!pending) {
      return res.redirect(`${BASE_URL}/mail?oauth_error=invalid_state`);
    }
    pendingStates.delete(state);
    const clientId = process.env.MICROSOFT_CLIENT_ID;
    const clientSecret = process.env.MICROSOFT_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      return res.redirect(`${BASE_URL}/mail?oauth_error=outlook_not_configured`);
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
        return res.redirect(`${BASE_URL}/mail?oauth_error=${data.error_description || data.error}`);
      }
      const accountId = crypto.randomUUID();
      let username = "Outlook";
      const meRes = await fetch("https://graph.microsoft.com/v1.0/me", {
        headers: { Authorization: `Bearer ${data.access_token}` },
      });
      const meData = await meRes.json();
      if (meData.mail) username = meData.mail;
      else if (meData.userPrincipalName) username = meData.userPrincipalName;
      tokenStore.set(accountId, { platform: "outlook", accessToken: data.access_token, refreshToken: data.refresh_token });
      const profileQuery = profileParam(pending.profileId);
      res.redirect(
        `${BASE_URL}/mail?oauth_success=1&platform=outlook&account_id=${accountId}&username=${encodeURIComponent(username)}${profileQuery}`
      );
    } catch (err) {
      console.error("Outlook OAuth error:", err);
      res.redirect(`${BASE_URL}/mail?oauth_error=token_exchange_failed`);
    }
  });
}
