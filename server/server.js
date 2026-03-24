import dotenv from "dotenv";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import express from "express";
import cors from "cors";
import crypto from "crypto";
import { calculateEngagementFromPosts } from "./analytics/socialMetrics.ts";
import { fetchTikTokAccountData } from "./providers/tiktok.ts";
import { fetchYouTubeAccountData } from "./providers/youtube.ts";
import { fetchShopifyAccountData } from "./providers/shopify.ts";
import { fetchGmailAccountData } from "./providers/gmail.ts";
import { fetchXAccountData } from "./providers/x.ts";
import { registerOAuthRoutes } from "./routes/oauthRoutes.js";
import { registerAccountRoutes } from "./routes/accountRoutes.ts";
import { registerAiRoutes } from "./routes/aiRoutes.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, "..");
// Ladda .env från cwd (npm run dev = projektrot) eller från projektrot relativt server-mappen
const envPath = fs.existsSync(path.join(process.cwd(), ".env"))
  ? path.join(process.cwd(), ".env")
  : path.join(rootDir, ".env");
const envExamplePath = path.join(rootDir, ".env.example");

if (!fs.existsSync(envPath) && fs.existsSync(envExamplePath)) {
  fs.copyFileSync(envExamplePath, envPath);
  console.log("Created .env from .env.example – fill in ZERNIO_API_KEY etc. in .env");
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
  const zk = (process.env.ZERNIO_API_KEY || process.env.LATE_API_KEY || "").trim();
  console.log(".env:", path.resolve(envPath), "| Zernio API key:", zk ? `${zk.slice(0, 6)}… (${zk.length} chars)` : "not set");
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

const ZERNIO_API_BASE = (process.env.ZERNIO_API_BASE || "https://zernio.com/api/v1").replace(/\/$/, "");
/** Also reads LATE_API_KEY if ZERNIO_API_KEY is unset (old .env files). */
function getZernioApiKey() {
  return (process.env.ZERNIO_API_KEY || process.env.LATE_API_KEY || "").trim();
}

const ERR_NO_ZERNIO_KEY = "Set ZERNIO_API_KEY in server .env";

function getZernioProfileIdEnv() {
  return (process.env.ZERNIO_PROFILE_ID || process.env.LATE_PROFILE_ID || "").trim();
}

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

/** Older tokens.json entries may still use isLate / lateAccountId */
function normalizeStoredAccount(stored) {
  if (!stored || typeof stored !== "object") return stored;
  const s = { ...stored };
  if (s.isLate && !s.instagramViaZernio) s.instagramViaZernio = true;
  if (s.lateAccountId && !s.zernioAccountId) s.zernioAccountId = s.lateAccountId;
  return s;
}

const tokenStore = {
  get: (k) => {
    const v = _tokenStoreRaw.get(k);
    return v ? normalizeStoredAccount(v) : undefined;
  },
  set: (k, v) => {
    _tokenStoreRaw.set(k, v);
    saveTokenStore(_tokenStoreRaw);
    return tokenStore;
  },
  delete: (k) => {
    const r = _tokenStoreRaw.delete(k);
    saveTokenStore(_tokenStoreRaw);
    return r;
  },
  has: (k) => _tokenStoreRaw.has(k),
  entries: () => _tokenStoreRaw.entries(),
};

const pendingStates = new Map();

function generateState() {
  const state = crypto.randomBytes(32).toString("hex");
  return state;
}

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

async function getOrCreateZernioProfileId() {
  const existing = getZernioProfileIdEnv();
  if (existing) return existing;
  const apiKey = getZernioApiKey();
  if (!apiKey) return null;
  const headers = { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" };

  try {
    const getRes = await fetch(`${ZERNIO_API_BASE}/profiles`, { headers });
    const getData = await getRes.json().catch(() => ({}));
    const idFromList = extractProfileId(getData);
    if (idFromList) {
      console.log("[Zernio] Using existing profile:", idFromList.slice(0, 8) + "...");
      return idFromList;
    }
    if (!getRes.ok) {
      console.warn("[Zernio] GET /profiles:", getRes.status, JSON.stringify(getData).slice(0, 200));
    }

    const postRes = await fetch(`${ZERNIO_API_BASE}/profiles`, {
      method: "POST",
      headers,
      body: JSON.stringify({ name: "Automazing Flow" }),
    });
    const postData = await postRes.json().catch(() => ({}));
    const idFromCreate = extractProfileId(postData);
    if (idFromCreate) return idFromCreate;

    console.warn("[Zernio] POST /profiles failed:", postRes.status, JSON.stringify(postData).slice(0, 300));
  } catch (e) {
    console.warn("[Zernio] getOrCreateZernioProfileId:", e.message);
  }
  return null;
}

function zernioAuthHeaders() {
  const key = getZernioApiKey();
  return key ? { Authorization: `Bearer ${key}` } : null;
}

function mapZernioPlatform(raw) {
  const s = String(raw || "")
    .toLowerCase()
    .replace(/_/g, "-");
  if (s.includes("whatsapp")) return "whatsapp";
  if (
    (s.includes("google") && s.includes("business")) ||
    s === "google-business" ||
    s === "googlebusiness" ||
    s.includes("gbp")
  ) {
    return "google_business";
  }
  if (s.includes("facebook") || s === "fb" || s.includes("pages")) return "facebook";
  if (s.includes("tiktok")) return "tiktok";
  if (s.includes("instagram")) return "instagram";
  if (s.includes("twitter") || s === "x") return "x";
  if (s.includes("youtube")) return "youtube";
  return null;
}

function normalizeZernioAccountsPayload(body) {
  if (!body || typeof body !== "object") return [];
  const list =
    body.data?.accounts ??
    body.accounts ??
    body.data ??
    (Array.isArray(body) ? body : null);
  return Array.isArray(list) ? list : [];
}

registerAccountRoutes(app, {
  zernioAuthHeaders,
  ERR_NO_ZERNIO_KEY,
  ZERNIO_API_BASE,
  normalizeZernioAccountsPayload,
  mapZernioPlatform,
  tokenStore,
});

registerOAuthRoutes(app, {
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
});

// --- Hämta live-data för konto ---
app.get("/api/accounts/:accountId/data", async (req, res) => {
  const { accountId } = req.params;
  const stored = tokenStore.get(accountId);
  if (!stored) {
    return res.status(404).json({ error: "Account not connected" });
  }
  const {
    platform,
    accessToken,
    isZernio,
    zernioAccountId,
    zernioPlatform,
  } = stored;
  const instagramViaZernio = stored.instagramViaZernio || stored.isLate;
  const zernioInstagramAccountId = zernioAccountId || stored.lateAccountId;

  try {
    // Zernio-linked channels (same API key; WhatsApp uses templates + business profile per Zernio docs)
    if (isZernio && zernioAccountId && getZernioApiKey()) {
      const zh = zernioAuthHeaders();
      const zid = String(zernioAccountId);
      const whatsAppLike =
        platform === "whatsapp" || String(zernioPlatform || "").toLowerCase().includes("whatsapp");

      if (whatsAppLike) {
        const [tplRes, bpRes] = await Promise.all([
          fetch(`${ZERNIO_API_BASE}/whatsapp/templates?accountId=${encodeURIComponent(zid)}`, {
            headers: zh,
          }),
          fetch(`${ZERNIO_API_BASE}/whatsapp/business-profile?accountId=${encodeURIComponent(zid)}`, {
            headers: zh,
          }),
        ]);
        const templatesData = tplRes.ok ? await tplRes.json().catch(() => ({})) : {};
        const bpData = bpRes.ok ? await bpRes.json().catch(() => ({})) : {};
        const templates =
          templatesData.templates ??
          templatesData.data?.templates ??
          (Array.isArray(templatesData.data) ? templatesData.data : []);
        const bp =
          bpData.businessProfile ??
          bpData.data?.businessProfile ??
          bpData.profile ??
          bpData.data ??
          {};
        const list = Array.isArray(templates) ? templates : [];
        const media = list.slice(0, 40).map((t, i) => ({
          id: String(t.id || t.name || i),
          caption: `[WhatsApp template] ${t.name || "unnamed"} — ${t.status || "?"} (${t.language || "?"})`,
          picture: "",
          permalink: "",
          mediaType: "whatsapp_template",
          likeCount: 0,
          commentCount: 0,
          createdTime: t.updatedAt || t.createdAt || "",
        }));
        const stats = {
          mediaCount: list.length,
          accountType: "WHATSAPP_BUSINESS",
          updatedAt: new Date().toISOString(),
          zernioNote:
            "WhatsApp has no follower/post analytics in the API; showing approved templates and business profile. See Zernio WhatsApp docs.",
        };
        return res.json({
          profile: {
            username: stored.username || zid,
            displayName: bp.description || bp.about || stored.displayName,
            ...bp,
          },
          stats,
          media,
          source: "zernio",
        });
      }

      let zernioNote;
      const anRes = await fetch(
        `${ZERNIO_API_BASE}/analytics?accountId=${encodeURIComponent(zid)}`,
        { headers: zh }
      );
      let an = {};
      if (anRes.ok) {
        an = await anRes.json().catch(() => ({}));
      } else if (anRes.status === 402 || anRes.status === 403) {
        zernioNote =
          "Zernio analytics may require a plan add-on, or this channel has limited metrics.";
      }

      const root = an.data ?? an;
      const data = root.analytics ?? root.metrics ?? root;
      const followersCount =
        data.followersCount ?? data.followers ?? data.followerCount ?? data.follower_count;
      const followingCount =
        data.followingCount ?? data.following ?? data.following_count;
      const mediaCount =
        data.postsCount ??
        data.mediaCount ??
        data.postCount ??
        data.videoCount ??
        data.videos_count;

      const recent =
        data.recentPosts ??
        data.posts ??
        data.media ??
        data.items ??
        [];

      const media = Array.isArray(recent)
        ? recent.slice(0, 25).map((p, i) => ({
            id: String(p.id || p.postId || i),
            caption: String(p.caption ?? p.text ?? p.title ?? p.description ?? "").slice(0, 2000),
            picture: String(p.imageUrl ?? p.thumbnailUrl ?? p.media_url ?? p.thumbnail_url ?? ""),
            permalink: String(p.url ?? p.permalink ?? p.platformPostUrl ?? ""),
            mediaType: String(p.type || p.mediaType || "post"),
            likeCount: Number(p.likeCount ?? p.likes ?? p.like_count ?? 0) || 0,
            commentCount: Number(p.commentCount ?? p.comments ?? p.comment_count ?? 0) || 0,
            createdTime: String(p.createdAt ?? p.timestamp ?? p.created_time ?? ""),
          }))
        : [];

      const stats = {
        followersCount: followersCount != null ? Number(followersCount) : undefined,
        followingCount: followingCount != null ? Number(followingCount) : undefined,
        mediaCount:
          mediaCount != null
            ? Number(mediaCount)
            : media.length > 0
              ? media.length
              : undefined,
        updatedAt: new Date().toISOString(),
        ...(zernioNote ? { zernioNote } : {}),
      };

      const hasStats =
        stats.followersCount != null || stats.mediaCount != null || media.length > 0;
      if (!hasStats && !zernioNote) {
        zernioNote =
          "No analytics payload returned for this account. Check Zernio dashboard or your plan.";
      }
      if (zernioNote && !stats.zernioNote) {
        stats.zernioNote = zernioNote;
      }

      return res.json({
        profile: {
          username: stored.username,
          displayName: stored.displayName,
          ...(typeof data.profile === "object" && data.profile ? data.profile : {}),
        },
        stats,
        media,
        source: "zernio",
      });
    }

    if (platform === "instagram" && instagramViaZernio && getZernioApiKey()) {
      const zernioKey = getZernioApiKey();
      const zernioHeaders = { Authorization: `Bearer ${zernioKey}` };
      const lookupId = String(zernioInstagramAccountId || accountId);

      const accountsRes = await fetch(`${ZERNIO_API_BASE}/accounts`, { headers: zernioHeaders });
      if (!accountsRes.ok) {
        console.error(`[Zernio] GET /accounts failed: ${accountsRes.status}`);
        return res.status(502).json({ error: "Could not fetch data from Zernio" });
      }
      const data = await accountsRes.json();
      const list = Array.isArray(data.accounts) ? data.accounts : [];
      console.log(`[Zernio] GET /accounts: ${list.length} accounts found`);

      // Match account: profileId._id matches lookupId (Zernio workspace profile)
      // Fallback: search by account _id, then first instagram account, then single account
      let acc =
        list.find((a) => String(a.profileId?._id || a.profileId || "") === lookupId) ??
        list.find((a) => String(a._id || a.id || "") === lookupId) ??
        list.find((a) => (a.platform || "").toLowerCase() === "instagram") ??
        (list.length === 1 ? list[0] : null);

      if (acc) console.log(`[Zernio] Matched account: _id=${acc._id} username=${acc.username}`);
      else console.warn(`[Zernio] No account matches lookupId=${lookupId}. Available: ${list.map(a => a._id).join(", ")}`);

      // Instagram stats from connected account metadata
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
          const postsRes = await fetch(`${ZERNIO_API_BASE}/accounts/${acc._id}/posts?limit=100`, {
            headers: zernioHeaders,
          });
          if (postsRes.ok) {
            const postsData = await postsRes.json();
            posts = Array.isArray(postsData.posts) ? postsData.posts : [];
          }
        } catch {
          // Ignore if posts cannot be fetched
        }
      }

      const engagement = calculateEngagementFromPosts(posts, followers);

      console.log(
        `[Zernio] Instagram stats: followers=${followers}, media=${mediaCount}, avgLikes=${engagement.avgLikes}, avgComments=${engagement.avgComments}, engagement=${engagement.engagementRate}%`
      );

      const stats = [followers, following, mediaCount].some((n) => n != null && !Number.isNaN(Number(n)))
        ? {
            followersCount: followers != null ? Number(followers) : undefined,
            followingCount: following != null ? Number(following) : undefined,
            mediaCount: mediaCount != null ? Number(mediaCount) : undefined,
            accountType: accountType ?? undefined,
            totalLikes: engagement.totalLikes,
            totalComments: engagement.totalComments,
            avgLikes: engagement.avgLikes,
            avgComments: engagement.avgComments,
            engagementRate: engagement.engagementRate,
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
      const data = await fetchTikTokAccountData(accessToken);
      return res.json(data);
    }
    if (platform === "youtube") {
      const data = await fetchYouTubeAccountData(accessToken);
      return res.json(data);
    }
    if (platform === "x") {
      const data = await fetchXAccountData({
        accessToken,
        stored,
        accountId,
        tokenStore,
        xClientId: process.env.X_CLIENT_ID,
        xClientSecret: process.env.X_CLIENT_SECRET,
      });
      if (data?.error) {
        return res.status(data.status || 500).json({ error: data.error });
      }
      return res.json(data);
    }

    if (platform === "gmail") {
      const data = await fetchGmailAccountData({
        accessToken,
        refreshToken: stored.refreshToken,
        accountId,
        tokenStore,
        stored,
        googleClientId: process.env.GOOGLE_CLIENT_ID,
        googleClientSecret: process.env.GOOGLE_CLIENT_SECRET,
      });
      if (data?.error) {
        return res.status(data.status || 500).json({ error: data.error });
      }
      return res.json(data);
    }

    if (platform === "shopify") {
      const data = await fetchShopifyAccountData(accessToken, stored.shop);
      if (data?.error) {
        return res.status(data.status || 500).json({ error: data.error });
      }
      return res.json(data);
    }

    res.status(400).json({ error: "Unknown platform" });
  } catch (err) {
    console.error("Fetch data error:", err);
    res.status(500).json({ error: "Could not fetch data" });
  }
});

registerAiRoutes(app);

app.get("/api/health", (req, res) => {
  res.json({ ok: true, ts: new Date().toISOString() });
});

app.get("/api/debug-env", (req, res) => {
  res.json({
    envPath: path.resolve(envPath),
    envExists: fs.existsSync(envPath),
    zernioApiKeySet: Boolean(getZernioApiKey()),
    ZERNIO_API_BASE,
  });
});

const server = app.listen(PORT, () => {
  console.log(`Server: http://localhost:${PORT}`);
  console.log(`Zernio: ${getZernioApiKey() ? "API key loaded" : ERR_NO_ZERNIO_KEY}`);
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
