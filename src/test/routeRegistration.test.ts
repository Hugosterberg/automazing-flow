/**
 * Lightweight registration smoke tests — catches missing cron/oauth wiring
 * without spinning a full Express HTTP server (repo pattern: unit-test libs).
 */
import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

function createFakeApp() {
  const routes: Array<{ method: string; path: string }> = [];
  const track =
    (method: string) =>
    (path: string, ..._handlers: unknown[]) => {
      routes.push({ method, path });
      return app;
    };
  const app = {
    get: track("get"),
    post: track("post"),
    put: track("put"),
    delete: track("delete"),
    use: () => app,
  };
  return { app, routes };
}

function stubCronDeps() {
  return {
    oauthPendingStore: { deleteExpired: async () => ({ removed: 0 }) },
    supabaseAdmin: null,
    zernio: {},
    secretResolver: { resolve: async () => null },
    tokenStore: {
      get: async () => null,
      set: async () => undefined,
      entries: async () => [],
      delete: async () => undefined,
    },
  };
}

function stubOAuthDeps() {
  const noop = async () => null;
  return {
    BASE_URL: "http://localhost:5173",
    API_BASE_URL: "http://localhost:3001",
    ZERNIO_API_BASE: "https://example.invalid",
    zernio: {
      getAccounts: noop,
      getConnectUrl: noop,
    },
    getZernioApiKey: () => "",
    getOrCreateZernioProfileId: async () => null,
    secretResolver: { resolve: async () => null },
    normalizeZernioAccountsPayload: () => [],
    mapZernioPlatform: () => null,
    generateState: () => "state",
    oauthPendingStore: {
      get: async () => null,
      set: async () => undefined,
      delete: async () => undefined,
      listZernioRecentForUser: async () => [],
    },
    tokenStore: {
      get: async () => null,
      set: async () => undefined,
      entries: async () => [],
      delete: async () => undefined,
    },
    getSessionUserId: () => null,
  };
}

describe("cron route registration", () => {
  it("registers every path declared in vercel.json crons", async () => {
    const vercel = JSON.parse(readFileSync(join(process.cwd(), "vercel.json"), "utf8")) as {
      crons?: Array<{ path: string }>;
    };
    const expected = (vercel.crons ?? []).map((c) => c.path);
    expect(expected.length).toBeGreaterThan(10);

    const { registerCronRoutes } = await import("../../server/routes/cronRoutes.js");
    const { app, routes } = createFakeApp();
    registerCronRoutes(app, stubCronDeps());

    const registered = new Set(routes.filter((r) => r.method === "get").map((r) => r.path));
    const missing = expected.filter((p) => !registered.has(p));
    expect(missing, `missing cron routes: ${missing.join(", ")}`).toEqual([]);
  });
});

describe("oauth route registration", () => {
  it("registers core platform auth entrypoints", async () => {
    // Keep env empty so init handlers fail closed at request time, not at register time.
    vi.stubEnv("SHOPIFY_API_KEY", "");
    vi.stubEnv("NOTION_CLIENT_ID", "");

    const { registerOAuthRoutes } = await import("../../server/routes/oauthRoutes.ts");
    const { app, routes } = createFakeApp();
    registerOAuthRoutes(app, stubOAuthDeps() as never);

    const registered = new Set(routes.map((r) => r.path));
    const required = [
      "/api/auth/gmail",
      "/api/auth/outlook",
      "/api/auth/shopify",
      "/api/auth/notion",
      "/api/auth/instagram",
      "/api/auth/tiktok",
      "/api/auth/canva",
      "/api/auth/google_calendar",
      "/api/auth/google_drive",
    ];
    const missing = required.filter((p) => !registered.has(p));
    expect(missing, `missing oauth routes: ${missing.join(", ")}`).toEqual([]);
  });
});
