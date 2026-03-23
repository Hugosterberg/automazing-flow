import dotenv from "dotenv";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import express from "express";
import cors from "cors";
import crypto from "crypto";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, "..");
// Ladda .env från cwd (npm run dev = projektrot) eller från projektrot relativt server-mappen
const envPath = fs.existsSync(path.join(process.cwd(), ".env"))
  ? path.join(process.cwd(), ".env")
  : path.join(rootDir, ".env");
const envExamplePath = path.join(rootDir, ".env.example");

if (!fs.existsSync(envPath) && fs.existsSync(envExamplePath)) {
  fs.copyFileSync(envExamplePath, envPath);
  console.log("Created .env from .env.example – fill in LATE_API_KEY etc. in .env");
}
// Read .env from project root: strip BOM, trim keys/values, .env should always win over empty system env
if (fs.existsSync(envPath)) {
  let raw = fs.readFileSync(envPath, "utf8");
  if (raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1);
  const parsed = dotenv.parse(raw);
  for (const [k, v] of Object.entries(parsed)) {
    const key = (k.replace(/^\uFEFF/, "") || "").trim();
    if (!key) continue;
    const val = v === undefined || v === null ? "" : (typeof v === "string" ? v.trim() : String(v));
    process.env[key] = val;
  }
  const late = (process.env.LATE_API_KEY || "").trim();
  console.log(".env loaded from:", path.resolve(envPath), "| LATE_API_KEY:", late ? `${late.slice(0, 6)}... (${late.length} chars)` : "MISSING");
} else {
  dotenv.config({ path: envPath });
  console.log(".env missing, tried:", path.resolve(envPath));
}

const app = express();
app.use(cors({ origin: process.env.BASE_URL || "http://localhost:8080", credentials: true }));
app.use(express.json());

const PORT = process.env.PORT || 3001;
const BASE_URL = process.env.BASE_URL || "http://localhost:8080";
const API_BASE_URL = process.env.API_BASE_URL || `http://localhost:${PORT}`;

// Persistent token storage – saved to disk so restarts don't break connections
const TOKEN_STORE_PATH = path.join(__dirname, "tokens.json");

function loadTokenStore() {
  try {
    if (fs.existsSync(TOKEN_STORE_PATH)) {
      const raw = fs.readFileSync(TOKEN_STORE_PATH, "utf8");
      const entries = JSON.parse(raw);
      if (Array.isArray(entries)) {
        console.log(`[tokenStore] Loaded ${entries.length} saved accounts from tokens.json`);
        return new Map(entries);
      }
    }
  } catch (e) {
    console.warn("[tokenStore] Could not read tokens.json:", e.message);
  }
  return new Map();
}

function saveTokenStore(store) {
  try {
    fs.writeFileSync(TOKEN_STORE_PATH, JSON.stringify([...store.entries()]), "utf8");
  } catch (e) {
    console.warn("[tokenStore] Could not save tokens.json:", e.message);
  }
}

const _tokenStoreRaw = loadTokenStore();
const tokenStore = {
  get: (k) => _tokenStoreRaw.get(k),
  set: (k, v) => { _tokenStoreRaw.set(k, v); saveTokenStore(_tokenStoreRaw); return tokenStore; },
  delete: (k) => { const r = _tokenStoreRaw.delete(k); saveTokenStore(_tokenStoreRaw); return r; },
  has: (k) => _tokenStoreRaw.has(k),
  entries: () => _tokenStoreRaw.entries(),
};

const pendingStates = new Map();

function generateState() {
  const state = crypto.randomBytes(32).toString("hex");
  return state;
}

// --- Late API (Instagram via getlate.dev) ---
const LATE_API_BASE = "https://getlate.dev/api/v1";

function extractProfileId(data) {
  if (!data) return null;
  const id = data.profile?._id ?? data.profile?.id ?? data._id ?? data.id;
  if (id) return String(id);
  const list = data.profiles ?? data.data ?? (Array.isArray(data) ? data : null);
  if (Array.isArray(list) && list.length > 0) {
    const first = list[0];
    return String(first._id ?? first.id ?? first.profileId ?? "");
  }
  return null;
}

async function getOrCreateLateProfileId() {
  const existing = (process.env.LATE_PROFILE_ID || "").trim();
  if (existing) return existing;
  const apiKey = (process.env.LATE_API_KEY || "").trim();
  if (!apiKey) return null;
  const headers = { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" };

  try {
    // 1. Hämta befintliga profiler (GET)
    const getRes = await fetch(`${LATE_API_BASE}/profiles`, { headers });
    const getData = await getRes.json().catch(() => ({}));
    const idFromList = extractProfileId(getData);
    if (idFromList) {
      console.log("[Late] Using existing profile:", idFromList.slice(0, 8) + "...");
      return idFromList;
    }
    if (!getRes.ok) {
      console.warn("[Late] GET /profiles:", getRes.status, JSON.stringify(getData).slice(0, 200));
    }

    // 2. Skapa ny profil (POST)
    const postRes = await fetch(`${LATE_API_BASE}/profiles`, {
      method: "POST",
      headers,
      body: JSON.stringify({ name: "Automazing Flow" }),
    });
    const postData = await postRes.json().catch(() => ({}));
    const idFromCreate = extractProfileId(postData);
    if (idFromCreate) return idFromCreate;

    console.warn("[Late] POST /profiles misslyckades:", postRes.status, JSON.stringify(postData).slice(0, 300));
  } catch (e) {
    console.warn("[Late] getOrCreateLateProfileId:", e.message);
  }
  return null;
}

// Instagram: antingen via Late API eller direkt Meta OAuth
const IG_AUTH = "https://api.instagram.com/oauth/authorize";
const IG_TOKEN = "https://api.instagram.com/oauth/access_token";

app.get("/api/auth/instagram", async (req, res) => {
  res.set("Cache-Control", "no-store, no-cache");
  const lateApiKey = (process.env.LATE_API_KEY || "").trim();
  const ourProfileId = req.query.profile_id || null;
  console.log("[Instagram] LATE_API_KEY:", lateApiKey ? "set" : "MISSING – check .env and that the correct server process is running");

  if (lateApiKey) {
    // Connect Instagram via Late API
    try {
      const lateProfileId = await getOrCreateLateProfileId();
      if (!lateProfileId) {
        return res.redirect(`${BASE_URL}/social-media?oauth_error=late_profile_failed`);
      }
      const state = generateState();
      pendingStates.set(state, {
        platform: "instagram",
        profileId: ourProfileId,
        lateProfileId,
        createdAt: Date.now(),
      });
      const redirectUrl = `${API_BASE_URL}/api/auth/late/instagram/callback?state=${state}`;
      const connectUrl = new URL(`${LATE_API_BASE}/connect/instagram`);
      connectUrl.searchParams.set("profileId", lateProfileId);
      connectUrl.searchParams.set("redirect_url", redirectUrl);

      const lateRes = await fetch(connectUrl.toString(), {
        headers: { Authorization: `Bearer ${lateApiKey}` },
      });
      if (!lateRes.ok) {
        const err = await lateRes.text();
        console.error("Late connect URL error:", lateRes.status, err);
        return res.redirect(`${BASE_URL}/social-media?oauth_error=late_connect_failed`);
      }
      const { authUrl } = await lateRes.json();
      if (!authUrl) {
        return res.redirect(`${BASE_URL}/social-media?oauth_error=late_no_auth_url`);
      }
      return res.redirect(authUrl);
    } catch (err) {
      console.error("Late Instagram init error:", err);
      return res.redirect(`${BASE_URL}/social-media?oauth_error=late_init_failed`);
    }
  }

  // Fallback: direkt Instagram (Meta) OAuth
  const clientId = (process.env.INSTAGRAM_CLIENT_ID || "").trim();
  if (!clientId) {
    console.warn(
      "Instagram: LATE_API_KEY is missing or empty (length: %s). Add LATE_API_KEY to .env for Late API.",
      (process.env.LATE_API_KEY || "").length
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

// Callback från Late efter Instagram-anslutning
app.get("/api/auth/late/instagram/callback", async (req, res) => {
  const { state, error, accountId: lateAccountId, username } = req.query;
  if (error) {
    return res.redirect(`${BASE_URL}/social-media?oauth_error=${encodeURIComponent(error)}`);
  }
  const pending = pendingStates.get(state);
  if (!pending || pending.platform !== "instagram") {
    return res.redirect(`${BASE_URL}/social-media?oauth_error=invalid_state`);
  }
  pendingStates.delete(state);

  const apiKey = (process.env.LATE_API_KEY || "").trim();
  if (!apiKey) {
    return res.redirect(`${BASE_URL}/social-media?oauth_error=late_not_configured`);
  }

  try {
    let accountId = lateAccountId;
    let displayUsername = username;
    if (!accountId || !displayUsername) {
      const profilesRes = await fetch(`${LATE_API_BASE}/profiles`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (!profilesRes.ok) {
        return res.redirect(`${BASE_URL}/social-media?oauth_error=late_fetch_accounts_failed`);
      }
      const profilesData = await profilesRes.json();
      const accounts = profilesData.accounts ?? profilesData.data ?? profilesData.profiles ?? [];
      const list = Array.isArray(accounts) ? accounts : (profilesData.profile?.accounts || []);
      const ig = list.find((a) => a.platform === "instagram" || (a.accountId && String(a.accountId).includes("instagram")));
      const acc = ig || (list.length ? list[list.length - 1] : null);
      if (acc) {
        accountId = accountId || acc._id || acc.id || acc.accountId;
        displayUsername = displayUsername || acc.username || acc.name || "Instagram";
      }
    }
    if (!accountId) {
      return res.redirect(`${BASE_URL}/social-media?oauth_error=late_no_account`);
    }
    const id = String(accountId);
    tokenStore.set(id, {
      platform: "instagram",
      lateAccountId: id,
      username: displayUsername ? decodeURIComponent(String(displayUsername)) : "Instagram",
      isLate: true,
    });
    const profileParam = pending.profileId ? `&profile_id=${encodeURIComponent(pending.profileId)}` : "";
    const usernameParam = encodeURIComponent(displayUsername ? decodeURIComponent(String(displayUsername)) : "Instagram");
    res.redirect(`${BASE_URL}/social-media?oauth_success=1&platform=instagram&account_id=${id}&username=${usernameParam}&late_account_id=${id}${profileParam}`);
  } catch (err) {
    console.error("Late Instagram callback error:", err);
    res.redirect(`${BASE_URL}/social-media?oauth_error=token_exchange_failed`);
  }
});

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
    const profileParam = pending.profileId ? `&profile_id=${encodeURIComponent(pending.profileId)}` : "";
    res.redirect(`${BASE_URL}/social-media?oauth_success=1&platform=instagram&account_id=${accountId}&username=${encodeURIComponent(username)}${profileParam}`);
  } catch (err) {
    console.error("Instagram OAuth error:", err);
    res.redirect(`${BASE_URL}/social-media?oauth_error=token_exchange_failed`);
  }
});

// --- TikTok OAuth ---
const TIKTOK_AUTH = "https://www.tiktok.com/v2/auth/authorize/";
const TIKTOK_TOKEN = "https://open.tiktokapis.com/v2/oauth/token/";

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
    const profileParam = pending.profileId ? `&profile_id=${encodeURIComponent(pending.profileId)}` : "";
    res.redirect(`${BASE_URL}/social-media?oauth_success=1&platform=tiktok&account_id=${accountId}&username=${encodeURIComponent(username)}${profileParam}`);
  } catch (err) {
    console.error("TikTok OAuth error:", err);
    res.redirect(`${BASE_URL}/social-media?oauth_error=token_exchange_failed`);
  }
});

// --- X (Twitter) OAuth 2.0 with PKCE ---
const X_AUTH = "https://twitter.com/i/oauth2/authorize";
const X_TOKEN = "https://api.twitter.com/2/oauth2/token";
const X_SCOPES = "tweet.read users.read offline.access like.read";

function generateCodeVerifier() {
  return crypto.randomBytes(32).toString("base64url");
}
function generateCodeChallenge(verifier) {
  return crypto.createHash("sha256").update(verifier).digest("base64url");
}

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
    const tokenRes = await fetch(X_TOKEN, { method: "POST", headers, body: body.toString() });
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
    const profileParam = pending.profileId ? `&profile_id=${encodeURIComponent(pending.profileId)}` : "";
    res.redirect(`${BASE_URL}/social-media?oauth_success=1&platform=x&account_id=${accountId}&username=${encodeURIComponent(username)}${profileParam}`);
  } catch (err) {
    console.error("[X] OAuth error:", err);
    res.redirect(`${BASE_URL}/social-media?oauth_error=token_exchange_failed`);
  }
});

// --- YouTube (Google) OAuth ---
const GOOGLE_AUTH = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN = "https://oauth2.googleapis.com/token";
const YOUTUBE_SCOPES = "https://www.googleapis.com/auth/youtube.readonly https://www.googleapis.com/auth/userinfo.profile";

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
    const profileParam = pending.profileId ? `&profile_id=${encodeURIComponent(pending.profileId)}` : "";
    res.redirect(`${BASE_URL}/social-media?oauth_success=1&platform=youtube&account_id=${accountId}&username=${encodeURIComponent(username)}${profileParam}`);
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
    const profileParam = pending.profileId ? `&profile_id=${encodeURIComponent(pending.profileId)}` : "";
    res.redirect(`${BASE_URL}/ecommerce?oauth_success=1&platform=shopify&account_id=${accountId}&username=${encodeURIComponent(shopName)}${profileParam}`);
  } catch (err) {
    console.error("Shopify OAuth error:", err);
    res.redirect(`${BASE_URL}/ecommerce?oauth_error=token_exchange_failed`);
  }
});

// --- Gmail OAuth (samma Google OAuth, andra scopes) ---
const GMAIL_SCOPES = "https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/userinfo.email";

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
    const profileParam = pending.profileId ? `&profile_id=${encodeURIComponent(pending.profileId)}` : "";
    res.redirect(`${BASE_URL}/mail?oauth_success=1&platform=gmail&account_id=${accountId}&username=${encodeURIComponent(username)}${profileParam}`);
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
  const scope = "offline_access openid profile email https://outlook.office.com/Mail.ReadWrite";
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
    const profileParam = pending.profileId ? `&profile_id=${encodeURIComponent(pending.profileId)}` : "";
    res.redirect(`${BASE_URL}/mail?oauth_success=1&platform=outlook&account_id=${accountId}&username=${encodeURIComponent(username)}${profileParam}`);
  } catch (err) {
    console.error("Outlook OAuth error:", err);
    res.redirect(`${BASE_URL}/mail?oauth_error=token_exchange_failed`);
  }
});

// --- Hämta live-data för konto ---
app.get("/api/accounts/:accountId/data", async (req, res) => {
  const { accountId } = req.params;
  const stored = tokenStore.get(accountId);
  if (!stored) {
    return res.status(404).json({ error: "Account not connected" });
  }
  const { platform, accessToken, isLate, lateAccountId } = stored;

  try {
    if (platform === "instagram" && isLate && (process.env.LATE_API_KEY || "").trim()) {
      const lateKey = (process.env.LATE_API_KEY || "").trim();
      const lateHeaders = { Authorization: `Bearer ${lateKey}` };
      // lookupId = Late profile-ID (e.g. 69a7aa7d...) stored at OAuth-callback
      const lookupId = String(lateAccountId || accountId);

      // GET /v1/accounts – correct endpoint for connected accounts (not /profiles which are Late workspaces)
      const lateRes = await fetch(`${LATE_API_BASE}/accounts`, { headers: lateHeaders });
      if (!lateRes.ok) {
        console.error(`[Late] GET /accounts failed: ${lateRes.status}`);
        return res.status(502).json({ error: "Could not fetch data from Late" });
      }
      const data = await lateRes.json();
      const list = Array.isArray(data.accounts) ? data.accounts : [];
      console.log(`[Late] GET /accounts: ${list.length} accounts found`);

      // Match account: profileId._id matches lookupId (Late profileId = Late workspace, stored at OAuth)
      // Fallback: search by account _id, then first instagram account, then single account
      let acc =
        list.find((a) => String(a.profileId?._id || a.profileId || "") === lookupId) ??
        list.find((a) => String(a._id || a.id || "") === lookupId) ??
        list.find((a) => (a.platform || "").toLowerCase() === "instagram") ??
        (list.length === 1 ? list[0] : null);

      if (acc) console.log(`[Late] Matched account: _id=${acc._id} username=${acc.username}`);
      else console.warn(`[Late] No account matches lookupId=${lookupId}. Available: ${list.map(a => a._id).join(", ")}`);

      // Late stores Instagram stats in metadata.profileData
      const profileData = acc?.metadata?.profileData ?? {};
      const profile = {
        username: profileData.username ?? acc?.username ?? acc?.name,
        id: acc?._id ?? acc?.id,
        displayName: profileData.displayName ?? acc?.displayName,
        profilePicture: profileData.profilePicture ?? acc?.profilePicture,
      };

      const followers = profileData.followersCount ?? acc?.followers_count ?? acc?.followersCount;
      const following = profileData.followingCount ?? acc?.follows_count ?? acc?.followingCount ?? undefined;
      const mediaCount = profileData.mediaCount ?? acc?.media_count ?? acc?.mediaCount ?? acc?.externalPostCount;
      const accountType = profileData.accountType ?? acc?.accountType ?? undefined;

      // Fetch posts for likes/comment stats in parallel
      let posts = [];
      if (acc?._id) {
        try {
          const postsRes = await fetch(`${LATE_API_BASE}/accounts/${acc._id}/posts?limit=100`, { headers: lateHeaders });
          if (postsRes.ok) {
            const postsData = await postsRes.json();
            posts = Array.isArray(postsData.posts) ? postsData.posts : [];
          }
        } catch {
          // Ignore if posts cannot be fetched
        }
      }

      // Calculate aggregated stats from posts
      const postsWithEngagement = posts.filter((p) => p.likeCount != null || p.commentCount != null);
      const totalLikes = postsWithEngagement.reduce((s, p) => s + (p.likeCount || 0), 0);
      const totalComments = postsWithEngagement.reduce((s, p) => s + (p.commentCount || 0), 0);
      const postCount = postsWithEngagement.length;
      const avgLikes = postCount > 0 ? Math.round(totalLikes / postCount) : undefined;
      const avgComments = postCount > 0 ? Math.round(totalComments / postCount) : undefined;
      // Engagement rate = (avg likes + avg comments) / followers * 100
      const engagementRate =
        followers != null && followers > 0 && postCount > 0
          ? Math.round(((totalLikes + totalComments) / postCount / Number(followers)) * 10000) / 100
          : undefined;

      console.log(`[Late] Stats: followers=${followers}, media=${mediaCount}, avgLikes=${avgLikes}, avgComments=${avgComments}, engagement=${engagementRate}%`);

      const stats = [followers, following, mediaCount].some((n) => n != null && !Number.isNaN(Number(n)))
        ? {
            followersCount: followers != null ? Number(followers) : undefined,
            followingCount: following != null ? Number(following) : undefined,
            mediaCount: mediaCount != null ? Number(mediaCount) : undefined,
            accountType: accountType ?? undefined,
            totalLikes: postCount > 0 ? totalLikes : undefined,
            totalComments: postCount > 0 ? totalComments : undefined,
            avgLikes,
            avgComments,
            engagementRate,
            updatedAt: new Date().toISOString(),
          }
        : undefined;

      // Return the 12 most recent posts with image, likes and comments
      const recentPosts = posts.slice(0, 12).map((p) => ({
        id: p.id,
        caption: p.message || "",
        picture: p.picture || "",
        permalink: p.permalink || "",
        mediaType: p.mediaType || "image",
        likeCount: p.likeCount || 0,
        commentCount: p.commentCount || 0,
        createdTime: p.createdTime,
      }));

      return res.json({
        profile: { ...profile, ...(stats && { stats }) },
        media: recentPosts,
        stats,
      });
    }
    if (platform === "instagram") {
      // Begär alla tillgängliga statistikfält (Graph API: followers_count, follows_count, media_count)
      const fields = "id,username,account_type,media_count,followers_count,follows_count";
      const mediaRes = await fetch(
        `https://graph.instagram.com/me?fields=${fields}&access_token=${accessToken}`
      );
      const media = await mediaRes.json();
      const mediaListRes = await fetch(
        `https://graph.instagram.com/me/media?fields=id,caption,media_type,media_url,permalink,timestamp&access_token=${accessToken}&limit=12`
      );
      const mediaList = await mediaListRes.json();
      let mediaCount = media.media_count != null && !media.error ? Number(media.media_count) : undefined;
      if (mediaCount == null && Array.isArray(mediaList.data)) {
        mediaCount = mediaList.data.length;
      }
      const followersCount = media.followers_count != null && !media.error ? Number(media.followers_count) : undefined;
      const followingCount = media.follows_count != null && !media.error ? Number(media.follows_count) : undefined;
      const hasAnyStat = followersCount != null || followingCount != null || mediaCount != null;
      const stats = hasAnyStat
        ? {
            followersCount: followersCount ?? undefined,
            followingCount: followingCount ?? undefined,
            mediaCount: mediaCount ?? undefined,
            updatedAt: new Date().toISOString(),
          }
        : undefined;
      return res.json({
        profile: { ...media, ...(stats && { stats }) },
        media: mediaList.data || [],
        stats,
      });
    }
    if (platform === "tiktok") {
      const userRes = await fetch("https://open.tiktokapis.com/v2/user/info/?fields=username,display_name,avatar_url", {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      });
      const userData = await userRes.json();
      return res.json({
        profile: userData.data?.user || {},
        videos: [],
      });
    }
    if (platform === "youtube") {
      const channelRes = await fetch(
        "https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&mine=true",
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      const channelData = await channelRes.json();
      const channel = channelData.items?.[0];
      const uploadsId = channel?.contentDetails?.relatedPlaylists?.uploads;
      let videos = [];
      if (uploadsId) {
        const playRes = await fetch(
          `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&playlistId=${uploadsId}&maxResults=12`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );
        const playData = await playRes.json();
        videos = playData.items || [];
      }
      return res.json({
        profile: channel?.snippet ? { ...channel.snippet, statistics: channel.statistics } : {},
        videos,
      });
    }
    if (platform === "x") {
      const { xUserId, refreshToken } = stored;

      async function refreshXToken(rt) {
        const clientId = process.env.X_CLIENT_ID;
        const clientSecret = process.env.X_CLIENT_SECRET;
        if (!clientId || !rt) return null;
        const body = new URLSearchParams({ grant_type: "refresh_token", refresh_token: rt });
        const headers = { "Content-Type": "application/x-www-form-urlencoded" };
        if (clientSecret) {
          headers["Authorization"] = `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`;
        } else {
          body.set("client_id", clientId);
        }
        const r = await fetch(X_TOKEN, { method: "POST", headers, body: body.toString() });
        const d = await r.json();
        if (d.access_token) {
          tokenStore.set(accountId, { ...stored, accessToken: d.access_token, refreshToken: d.refresh_token || rt });
          return d.access_token;
        }
        return null;
      }

      let token = accessToken;

      // Fetch user info
      let userRes = await fetch(
        "https://api.twitter.com/2/users/me?user.fields=public_metrics,profile_image_url,description,username,name,created_at",
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (userRes.status === 401 && refreshToken) {
        token = await refreshXToken(refreshToken);
        if (!token) return res.status(401).json({ error: "X token invalid. Reconnect the account." });
        userRes = await fetch(
          "https://api.twitter.com/2/users/me?user.fields=public_metrics,profile_image_url,description,username,name,created_at",
          { headers: { Authorization: `Bearer ${token}` } }
        );
      }
      const userData = await userRes.json();
      const user = userData.data || {};
      const metrics = user.public_metrics || {};

      // Fetch recent tweets (up to 10)
      const userId = xUserId || user.id;
      let tweets = [];
      if (userId) {
        const tweetsRes = await fetch(
          `https://api.twitter.com/2/users/${userId}/tweets?max_results=10&tweet.fields=public_metrics,created_at,text`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (tweetsRes.ok) {
          const tweetsData = await tweetsRes.json();
          tweets = tweetsData.data || [];
        }
      }

      // Calculate engagement from tweets
      const tweetsWithMetrics = tweets.filter((t) => t.public_metrics);
      const totalLikes = tweetsWithMetrics.reduce((s, t) => s + (t.public_metrics.like_count || 0), 0);
      const totalReplies = tweetsWithMetrics.reduce((s, t) => s + (t.public_metrics.reply_count || 0), 0);
      const totalRetweets = tweetsWithMetrics.reduce((s, t) => s + (t.public_metrics.retweet_count || 0), 0);
      const postCount = tweetsWithMetrics.length;
      const avgLikes = postCount > 0 ? Math.round(totalLikes / postCount) : undefined;
      const followers = metrics.followers_count;
      const engagementRate =
        followers && followers > 0 && postCount > 0
          ? Math.round(((totalLikes + totalReplies + totalRetweets) / postCount / followers) * 10000) / 100
          : undefined;

      const stats = {
        followersCount: metrics.followers_count,
        followingCount: metrics.following_count,
        mediaCount: metrics.tweet_count,
        totalLikes,
        avgLikes,
        engagementRate,
        updatedAt: new Date().toISOString(),
      };

      const media = tweets.map((t) => ({
        id: t.id,
        caption: t.text || "",
        picture: "",
        permalink: `https://twitter.com/${user.username}/status/${t.id}`,
        mediaType: "tweet",
        likeCount: t.public_metrics?.like_count || 0,
        commentCount: t.public_metrics?.reply_count || 0,
        createdTime: t.created_at,
      }));

      return res.json({
        profile: {
          username: user.username,
          displayName: user.name,
          profilePicture: user.profile_image_url,
          description: user.description,
        },
        stats,
        media,
      });
    }

    if (platform === "gmail") {
      // Hjälpfunktion: försök förnya access token med refresh token
      async function refreshGmailToken(rt) {
        const clientId = process.env.GOOGLE_CLIENT_ID;
        const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
        if (!clientId || !clientSecret || !rt) return null;
        const r = await fetch("https://oauth2.googleapis.com/token", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, refresh_token: rt, grant_type: "refresh_token" }).toString(),
        });
        const d = await r.json();
        return d.access_token ?? null;
      }

      let token = accessToken;
      const { refreshToken } = stored;

      // Hämta lista med senaste 10 inkorg-meddelanden
      async function fetchMessages(t) {
        const listRes = await fetch(
          "https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=10&labelIds=INBOX",
          { headers: { Authorization: `Bearer ${t}` } }
        );
        if (listRes.status === 401) return { unauthorized: true };
        if (!listRes.ok) return { error: listRes.status };
        return listRes.json();
      }

      let listData = await fetchMessages(token);

      // Om token löpt ut – försök förnya
      if (listData.unauthorized && refreshToken) {
        const newToken = await refreshGmailToken(refreshToken);
        if (newToken) {
          token = newToken;
          tokenStore.set(accountId, { ...stored, accessToken: newToken });
          listData = await fetchMessages(token);
        }
      }

      if (listData.error || listData.unauthorized) {
        return res.status(401).json({ error: "Gmail token invalid. Reconnect the account." });
      }

      const messageIds = (listData.messages || []).map((m) => m.id);

      // Hämta metadata för varje meddelande parallellt
      const messages = await Promise.all(
        messageIds.map((id) =>
          fetch(
            `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=metadata&metadataHeaders=Subject,From,Date,To`,
            { headers: { Authorization: `Bearer ${token}` } }
          ).then((r) => r.json()).catch(() => null)
        )
      );

      const getHeader = (headers, name) =>
        (headers || []).find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value ?? "";

      // Extrahera visningsnamn ur "Name <email@...>"
      const parseSender = (from) => {
        const match = from.match(/^(.+?)\s*<(.+)>$/);
        if (match) return { name: match[1].replace(/"/g, "").trim(), email: match[2].trim() };
        return { name: from, email: from };
      };

      const formatted = messages
        .filter(Boolean)
        .map((msg) => {
          const headers = msg.payload?.headers ?? [];
          const from = getHeader(headers, "Subject") ? parseSender(getHeader(headers, "From")) : { name: "", email: "" };
          const dateRaw = getHeader(headers, "Date");
          return {
            id: msg.id,
            subject: getHeader(headers, "Subject") || "(No subject)",
            from: parseSender(getHeader(headers, "From")),
            date: dateRaw,
            snippet: msg.snippet || "",
            isUnread: (msg.labelIds || []).includes("UNREAD"),
          };
        });

      return res.json({ messages: formatted });
    }

    if (platform === "shopify") {
      const { shop } = stored;
      if (!shop) return res.status(400).json({ error: "No shop domain stored for this account" });
      const shopHeaders = { "X-Shopify-Access-Token": accessToken, "Content-Type": "application/json" };
      const apiBase = `https://${shop}/admin/api/2024-01`;

      const [shopRes, ordersRes, productsCountRes, ordersCountRes] = await Promise.all([
        fetch(`${apiBase}/shop.json`, { headers: shopHeaders }),
        fetch(`${apiBase}/orders.json?status=any&limit=10&order=created_at+desc`, { headers: shopHeaders }),
        fetch(`${apiBase}/products/count.json`, { headers: shopHeaders }),
        fetch(`${apiBase}/orders/count.json?status=any`, { headers: shopHeaders }),
      ]);

      if (!shopRes.ok) {
        console.error(`[Shopify] shop.json failed: ${shopRes.status}`);
        return res.status(502).json({ error: "Could not fetch Shopify store data" });
      }

      const [shopData, ordersData, productsCountData, ordersCountData] = await Promise.all([
        shopRes.json(),
        ordersRes.ok ? ordersRes.json() : { orders: [] },
        productsCountRes.ok ? productsCountRes.json() : { count: 0 },
        ordersCountRes.ok ? ordersCountRes.json() : { count: 0 },
      ]);

      const shopInfo = shopData.shop || {};
      const orders = ordersData.orders || [];

      const revenue30d = orders
        .filter((o) => {
          const created = new Date(o.created_at);
          return Date.now() - created.getTime() < 30 * 86400 * 1000;
        })
        .reduce((sum, o) => sum + parseFloat(o.total_price || "0"), 0);

      const avgOrderValue =
        orders.length > 0
          ? orders.reduce((s, o) => s + parseFloat(o.total_price || "0"), 0) / orders.length
          : 0;

      const formattedOrders = orders.map((o) => ({
        id: o.id,
        name: o.name,
        email: o.email || "",
        total: parseFloat(o.total_price || "0"),
        currency: o.currency || shopInfo.currency || "USD",
        status: o.financial_status || "pending",
        fulfillment: o.fulfillment_status || "unfulfilled",
        createdAt: o.created_at,
        lineItemCount: (o.line_items || []).length,
      }));

      return res.json({
        shop: {
          name: shopInfo.name,
          domain: shopInfo.domain || shop,
          currency: shopInfo.currency,
          plan: shopInfo.plan_display_name || shopInfo.plan_name,
          email: shopInfo.email,
        },
        stats: {
          ordersCount: ordersCountData.count || 0,
          productsCount: productsCountData.count || 0,
          revenue30d: Math.round(revenue30d * 100) / 100,
          avgOrderValue: Math.round(avgOrderValue * 100) / 100,
          currency: shopInfo.currency || "USD",
        },
        orders: formattedOrders,
      });
    }

    res.status(400).json({ error: "Unknown platform" });
  } catch (err) {
    console.error("Fetch data error:", err);
    res.status(500).json({ error: "Could not fetch data" });
  }
});

// --- AI-analys av konto ---
app.post("/api/accounts/:accountId/analyze", async (req, res) => {
  const { captions = [], displayName = "", username = "", followersCount } = req.body;
  const openaiKey = (process.env.OPENAI_API_KEY || "").trim();

  // Helper: smart keyword analysis as fallback
  function keywordAnalysis() {
    const allText = captions.join(" ").toLowerCase();
    const words = allText.match(/\b\w{4,}\b/g) || [];
    const freq = {};
    for (const w of words) freq[w] = (freq[w] || 0) + 1;
    const stopwords = new Set(["this","that","with","from","have","they","been","your","will","just","more","into","than","its","are","for","the","and","but","not","you","all","can","her","was","one","our","out","day","get","has","him","his","how","man","new","now","old","see","two","way","who","boy","did","its","let","put","say","she","too","use","com","www"]);
    const topWords = Object.entries(freq)
      .filter(([w]) => !stopwords.has(w))
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12)
      .map(([w]) => w);
    const hashtags = [...new Set((captions.join(" ").match(/#\w+/g) || []).map(h => h.toLowerCase()))]
      .slice(0, 8).map(h => h.replace("#", ""));

    const mainTopic = topWords.slice(0, 3).join(", ");
    const hashtagStr = hashtags.slice(0, 5).join(", ") || mainTopic;
    const n = followersCount ? `with ${Number(followersCount).toLocaleString("en-US")} followers` : "";
    return {
      about: `@${username} ${n} is an account focused on ${mainTopic}. The content revolves around a personal journey and shares experiences within this area.`,
      writes: `The account posts about ${hashtagStr}. Common post types include updates, quotes and milestones related to the main topic.`,
      perception: `An outside person sees an engaged account with a clear focus and consistent message. The account appears driven by passion rather than commercial intent.`,
    };
  }

  if (!openaiKey) {
    return res.json(keywordAnalysis());
  }

  try {
    const captionSample = captions.slice(0, 25).join("\n---\n");
    const prompt = `You are a social media analyst. Analyze this Instagram account briefly and factually in English.

Account: @${username} – "${displayName}"
Followers: ${followersCount ? Number(followersCount).toLocaleString("en-US") : "unknown"}

Recent post captions (sample):
${captionSample}

Reply with exactly these three points. Keep each answer to 1–2 short sentences. No headings, no lists – only flowing text.

ABOUT: [What the account is about – niche, theme and purpose]
WRITES ABOUT: [Concrete topics, events and types of content that appear]
PERCEPTION: [How a regular person with no prior knowledge of the topic would describe and perceive the account]`;

    const aiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${openaiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.6,
        max_tokens: 350,
      }),
    });

    if (!aiRes.ok) {
      console.warn("[AI] OpenAI responded", aiRes.status, "– using fallback");
      return res.json(keywordAnalysis());
    }

    const aiData = await aiRes.json();
    const text = aiData.choices?.[0]?.message?.content || "";

    // Parse the three parts from the response
    const extract = (label) => {
      const match = text.match(new RegExp(`${label}:\\s*(.+?)(?=\\n[A-Z ]+:|$)`, "si"));
      return match ? match[1].trim() : null;
    };
    const about = extract("ABOUT");
    const writes = extract("WRITES ABOUT") || extract("WRITES");
    const perception = extract("PERCEPTION");

    if (about && writes && perception) {
      return res.json({ about, writes, perception });
    }
    // Strukturen var inte rätt – returnera hela texten uppdelad
    const lines = text.split("\n").filter(l => l.trim()).slice(0, 3);
    return res.json({
      about: lines[0] || text.slice(0, 150),
      writes: lines[1] || "",
      perception: lines[2] || "",
    });
  } catch (err) {
    console.error("[AI] Analysfel:", err.message);
    return res.json(keywordAnalysis());
  }
});

app.delete("/api/accounts/:accountId", (req, res) => {
  const { accountId } = req.params;
  if (tokenStore.delete(accountId)) {
    return res.json({ ok: true });
  }
  res.status(404).json({ error: "Konto inte hittat" });
});

app.get("/api/health", (req, res) => {
  res.json({ ok: true, ts: new Date().toISOString() });
});

// Diagnostik: vad ser denna process för .env och LATE_API_KEY? (endast i utveckling)
app.get("/api/debug-env", (req, res) => {
  const lateRaw = process.env.LATE_API_KEY || "";
  const hasLate = lateRaw.trim().length > 0;
  res.json({
    envPath: path.resolve(envPath),
    envExists: fs.existsSync(envPath),
    LATE_API_KEY: hasLate ? "satt" : "saknas",
    LATE_API_KEY_length: lateRaw.length,
  });
});

const server = app.listen(PORT, () => {
  console.log(`Server kör på http://localhost:${PORT}`);
  console.log(`OAuth callbacks: ${API_BASE_URL}/api/auth/{instagram|tiktok|youtube}/callback`);
  const hasLate = (process.env.LATE_API_KEY || "").trim().length > 0;
  console.log(`LATE_API_KEY: ${hasLate ? "satt (Instagram via Late)" : "saknas"}`);
});
server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(`
Port ${PORT} is already in use by another process (likely an older server without .env).
The old process responds on /api – that's why you see "Instagram not configured".

To fix:
1. Close ALL terminals where you ran "npm run dev" or "npm run dev:server"
2. Or find and kill the process:  netstat -ano | findstr :${PORT}
   Take the PID from the last column and run:  taskkill /PID <pid> /F
3. Then restart:  npm run dev
`);
  }
  throw err;
});
