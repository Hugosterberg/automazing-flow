import "dotenv/config";
import express from "express";
import cors from "cors";
import crypto from "crypto";

const app = express();
app.use(cors({ origin: process.env.BASE_URL || "http://localhost:8080", credentials: true }));
app.use(express.json());

const PORT = process.env.PORT || 3001;
const BASE_URL = process.env.BASE_URL || "http://localhost:8080";
const API_BASE_URL = process.env.API_BASE_URL || `http://localhost:${PORT}`;

// Temporär token-lagring (ersätt med databas i produktion)
const tokenStore = new Map();
const pendingStates = new Map();

function generateState() {
  const state = crypto.randomBytes(32).toString("hex");
  return state;
}

// --- Instagram OAuth ---
const IG_AUTH = "https://api.instagram.com/oauth/authorize";
const IG_TOKEN = "https://api.instagram.com/oauth/access_token";

app.get("/api/auth/instagram", (req, res) => {
  const clientId = process.env.INSTAGRAM_CLIENT_ID;
  if (!clientId) {
    return res.redirect(`${BASE_URL}/social-media?oauth_error=instagram_not_configured`);
  }
  const state = generateState();
  pendingStates.set(state, { platform: "instagram", profileId: req.query.profile_id, createdAt: Date.now() });
  const redirectUri = `${API_BASE_URL}/api/auth/instagram/callback`;
  const url = new URL(IG_AUTH);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "user_profile,user_media");
  url.searchParams.set("state", state);
  res.redirect(url.toString());
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

// --- Hämta live-data för konto ---
app.get("/api/accounts/:accountId/data", async (req, res) => {
  const { accountId } = req.params;
  const stored = tokenStore.get(accountId);
  if (!stored) {
    return res.status(404).json({ error: "Konto inte anslutet" });
  }
  const { platform, accessToken } = stored;

  try {
    if (platform === "instagram") {
      const mediaRes = await fetch(
        `https://graph.instagram.com/me?fields=id,username,account_type,media_count&access_token=${accessToken}`
      );
      const media = await mediaRes.json();
      const mediaListRes = await fetch(
        `https://graph.instagram.com/me/media?fields=id,caption,media_type,media_url,permalink,timestamp&access_token=${accessToken}&limit=12`
      );
      const mediaList = await mediaListRes.json();
      return res.json({
        profile: media,
        media: mediaList.data || [],
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
    res.status(400).json({ error: "Okänd plattform" });
  } catch (err) {
    console.error("Fetch data error:", err);
    res.status(500).json({ error: "Kunde inte hämta data" });
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

app.listen(PORT, () => {
  console.log(`Server kör på http://localhost:${PORT}`);
  console.log(`OAuth callbacks: ${API_BASE_URL}/api/auth/{instagram|tiktok|youtube}/callback`);
});
