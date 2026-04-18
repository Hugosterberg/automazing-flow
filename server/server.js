import dotenv from "dotenv";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import express from "express";
import cors from "cors";
import { createClient } from "@supabase/supabase-js";

// Shared building blocks
import { createOAuthPendingStore } from "./lib/oauthPendingStore.js";
import { createPersistentTokenStore } from "./lib/persistentTokenStore.js";
import { createEnvConfig, INTEGRATION_CONFIG_CHECKS } from "./lib/envConfig.ts";
import { createAuthHelpers } from "./lib/authHelpers.ts";
import {
  ERR_NO_ZERNIO_KEY,
  getZernioApiKey,
  zernioAuthHeaders,
  mapZernioPlatform,
  normalizeZernioAccountsPayload,
  generateState,
  createGetOrCreateZernioProfileId,
} from "./lib/zernioHelpers.ts";
import { createZernioModule } from "./providers/zernioModule.ts";
import { createRequireMembership } from "./middleware/requireMembership.js";

// Route registrations
import { registerAuthRoutes } from "./routes/authRoutes.ts";
import { registerSettingsRoutes } from "./routes/settingsRoutes.ts";
import { registerMiscRoutes } from "./routes/miscRoutes.ts";
import { registerDriveFilesRoute } from "./routes/driveFilesRoute.ts";
import { registerNotionPagesRoute } from "./routes/notionPagesRoute.ts";
import { registerAccountDataRoute } from "./routes/accountDataRoute.js";
import { registerCronRoutes } from "./routes/cronRoutes.js";
import { registerOAuthRoutes } from "./routes/oauthRoutes.ts";
import { registerAccountRoutes } from "./routes/accountRoutes.ts";
import { registerAiRoutes } from "./routes/aiRoutes.ts";
import { registerAiRecommendationsRoutes } from "./routes/aiRecommendationsRoutes.ts";
import { registerMessagesRoutes } from "./routes/messagesRoutes.ts";
import { registerConnectionsRoutes } from "./routes/connectionsRoutes.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, "..");

// Load .env from cwd (npm run dev = project root) or from the project root
// relative to the server folder.
const envPath = fs.existsSync(path.join(process.cwd(), ".env"))
  ? path.join(process.cwd(), ".env")
  : path.join(rootDir, ".env");
const envExamplePath = path.join(rootDir, ".env.example");
const isVercelRuntime = process.env.VERCEL === "1";

if (!fs.existsSync(envPath) && fs.existsSync(envExamplePath) && !isVercelRuntime) {
  try {
    fs.copyFileSync(envExamplePath, envPath);
    console.log("Created .env from .env.example – fill in ZERNIO_API_KEY etc. in .env");
  } catch (e) {
    console.warn("[env] Could not create .env from .env.example:", e?.message || e);
  }
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

const PORT = process.env.PORT || 3001;

function urlHostIsLoopback(hostname) {
  const h = String(hostname || "").toLowerCase();
  return h === "localhost" || h === "127.0.0.1" || h === "[::1]";
}

function parseOriginIsLoopback(origin) {
  try {
    return urlHostIsLoopback(new URL(origin).hostname);
  } catch {
    return true;
  }
}

/** https://… origin from Vercel’s VERCEL_URL (no trailing slash). */
function vercelDeploymentOrigin() {
  const v = String(process.env.VERCEL_URL || "").trim();
  if (!v) return "";
  const withProto = v.includes("://") ? v : `https://${v}`;
  return withProto.replace(/\/$/, "");
}

/**
 * Public URL of this API (OAuth redirect_uri / Zernio redirect_url). On Vercel, never use localhost
 * from .env if VERCEL_URL is set — otherwise Zernio sends the browser to localhost:3001.
 */
function resolveApiBaseUrl() {
  const fallbackLocal = `http://localhost:${PORT}`;
  const explicitApi = String(process.env.API_BASE_URL || "").trim();
  const explicitBase = String(process.env.BASE_URL || "").trim();
  const onVercel = process.env.VERCEL === "1";
  const deployed = vercelDeploymentOrigin();

  if (explicitApi && !parseOriginIsLoopback(explicitApi)) {
    return explicitApi.replace(/\/$/, "");
  }
  if (onVercel && deployed) {
    return deployed;
  }
  if (explicitBase && !parseOriginIsLoopback(explicitBase)) {
    return explicitBase.replace(/\/$/, "");
  }
  if (explicitApi) return explicitApi.replace(/\/$/, "");
  return fallbackLocal;
}

function resolveBaseUrl(apiBaseResolved) {
  const explicitBase = String(process.env.BASE_URL || "").trim();
  const onVercel = process.env.VERCEL === "1";
  const deployed = vercelDeploymentOrigin();

  if (explicitBase && !parseOriginIsLoopback(explicitBase)) {
    return explicitBase.replace(/\/$/, "");
  }
  if (onVercel && deployed) {
    return deployed;
  }
  if (apiBaseResolved && !parseOriginIsLoopback(apiBaseResolved)) {
    return apiBaseResolved;
  }
  if (explicitBase) return explicitBase.replace(/\/$/, "");
  return "http://localhost:8080";
}

const API_BASE_URL = resolveApiBaseUrl();
const BASE_URL = resolveBaseUrl(API_BASE_URL);

if (process.env.VERCEL === "1") {
  console.log("[vercel] BASE_URL=%s API_BASE_URL=%s", BASE_URL, API_BASE_URL);
}

const app = express();

function parseCorsAllowedOrigins() {
  const fromList = (process.env.CORS_ORIGINS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (fromList.length > 0) return fromList;
  return [BASE_URL];
}

const corsAllowedOrigins = parseCorsAllowedOrigins();
app.use(
  cors({
    origin(origin, callback) {
      if (!origin) return callback(null, true);
      if (corsAllowedOrigins.includes(origin)) return callback(null, true);
      callback(null, false);
    },
    credentials: true,
  })
);
app.use(express.json());

const SUPABASE_URL = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "").trim();
const SUPABASE_ANON_KEY = (
  process.env.SUPABASE_PUBLISHABLE_KEY ||
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY ||
  process.env.VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY ||
  ""
).trim();
const DEBUG_INGEST_URL = "http://127.0.0.1:7917/ingest/7239d227-c463-4b17-b647-b3b429e5fe5c";

const ZERNIO_API_BASE = (process.env.ZERNIO_API_BASE || "https://zernio.com/api/v1").replace(/\/$/, "");

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

// Persistent token storage: Supabase when service role is set; else local disk (/tmp on Vercel).
const TOKEN_STORE_PATH =
  process.env.VERCEL === "1"
    ? path.join("/tmp", "automazing-tokens.json")
    : path.join(__dirname, "tokens.json");

const SUPABASE_SERVICE_ROLE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
const supabaseServiceClient =
  SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
      })
    : null;

// Env file + integration probes (used by /api/settings/api-keys and tests)
const envConfig = createEnvConfig({ envPath });

// Auth (signed session cookies + Supabase token verification)
const auth = createAuthHelpers({
  baseUrl: BASE_URL,
  supabaseUrl: SUPABASE_URL,
  supabaseAnonKey: SUPABASE_ANON_KEY,
});

// Session helpers exported as bare functions so existing route registrars
// (accountRoutes, messagesRoutes, oauthRoutes, connectionsRoutes, aiRoutes)
// can be passed `getSessionUserId` / `getStoredAccountAccess` without change.
const getSessionUserId = (req) => auth.getSessionUserId(req);
const getStoredAccountAccess = (stored, userId) =>
  auth.getStoredAccountAccess(stored, userId);

const tokenStore = createPersistentTokenStore({
  supabaseAdmin: supabaseServiceClient,
  filePath: TOKEN_STORE_PATH,
  normalizeStoredAccount: auth.normalizeStoredAccount,
});

if (supabaseServiceClient) {
  console.log("[tokenStore] Using Supabase oauth_token_entries (durable across instances)");
} else {
  console.log("[tokenStore] File fallback — set SUPABASE_SERVICE_ROLE_KEY for durable OAuth tokens on Vercel");
}

await tokenStore.init();

const oauthPendingStore = createOAuthPendingStore({
  supabaseAdmin: supabaseServiceClient,
  fallbackMap: new Map(),
});
if (supabaseServiceClient) {
  console.log("[oauth] Using Supabase oauth_pending_states (shared CSRF/PKCE state)");
}

{
  const pruned = await oauthPendingStore.deleteExpired();
  if (pruned.removed > 0) {
    console.log(`[oauth] Startup prune: removed ${pruned.removed} expired pending OAuth state(s)`);
  }
}

// Single Zernio gateway shared by all routes. Everything that talks to the
// Zernio HTTP API should flow through this module so that auth headers,
// error envelopes, and (later) rate limiting/tracing live in one file.
const zernioModule = createZernioModule({
  apiBase: ZERNIO_API_BASE,
  authHeaders: zernioAuthHeaders,
  normalizeAccountsPayload: normalizeZernioAccountsPayload,
  mapPlatform: mapZernioPlatform,
});

const getOrCreateZernioProfileId = createGetOrCreateZernioProfileId(zernioModule);

// ---------------------------------------------------------------------------
// Route registration
// ---------------------------------------------------------------------------

registerCronRoutes(app, {
  oauthPendingStore,
  supabaseAdmin: supabaseServiceClient,
});

registerAuthRoutes(app, {
  auth,
  supabaseUrl: SUPABASE_URL,
  supabaseAnonKey: SUPABASE_ANON_KEY,
  debugLog,
});

registerSettingsRoutes(app, {
  auth,
  envConfig,
  integrationConfigChecks: INTEGRATION_CONFIG_CHECKS,
});

registerAccountRoutes(app, {
  zernio: zernioModule,
  ERR_NO_ZERNIO_KEY,
  mapZernioPlatform,
  tokenStore,
  getSessionUserId,
});

registerMessagesRoutes(app, {
  getSessionUserId,
  tokenStore,
  getStoredAccountAccess,
  zernio: zernioModule,
  zernioProfileIdFilter: (process.env.ZERNIO_PROFILE_ID || process.env.LATE_PROFILE_ID || "").trim(),
});

registerOAuthRoutes(app, {
  BASE_URL,
  API_BASE_URL,
  ZERNIO_API_BASE,
  zernio: zernioModule,
  getZernioApiKey,
  getOrCreateZernioProfileId,
  normalizeZernioAccountsPayload,
  mapZernioPlatform,
  generateState,
  oauthPendingStore,
  tokenStore,
  getSessionUserId,
});

const requireMembership = createRequireMembership({
  supabaseServiceClient,
  getSessionUserId,
});
registerConnectionsRoutes(app, {
  requireMembership,
  supabaseAdmin: supabaseServiceClient,
  zernio: zernioModule,
  tokenStore,
  getSessionUserId,
});

registerDriveFilesRoute(app, { auth, tokenStore });

registerAccountDataRoute(app, {
  auth,
  tokenStore,
  zernio: zernioModule,
  getZernioApiKey,
  debugLog,
});

registerNotionPagesRoute(app, { auth, tokenStore });

registerAiRoutes(app, { getSessionUserId, tokenStore });

registerAiRecommendationsRoutes(app, {
  requireMembership,
  supabaseAdmin: supabaseServiceClient,
});

registerMiscRoutes(app, {
  envPath,
  zernioApiBase: ZERNIO_API_BASE,
  getZernioApiKey,
});

// ---------------------------------------------------------------------------
// HTTP listener
// ---------------------------------------------------------------------------

const thisFilePath = fileURLToPath(import.meta.url);
const entryScriptPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
const shouldStartHttpListener =
  Boolean(entryScriptPath) && path.resolve(thisFilePath) === entryScriptPath;

if (shouldStartHttpListener) {
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
}

export { app };
export default app;
