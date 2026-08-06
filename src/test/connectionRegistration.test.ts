/**
 * Guards the wiring a new integration has to pass through: catalog entry →
 * connect path → server OAuth route. Each of these lives in a different file,
 * so nothing but a test notices when one of them is forgotten — the symptom is
 * a Connections row whose Connect button silently does nothing.
 *
 * Route registration uses the same fake-app trick as routeRegistration.test.ts.
 */
import { describe, expect, it, vi } from "vitest";
import { CONNECTION_CATALOG } from "@/lib/connectionCatalog";
import {
  getConnectConfig,
  getConnectionPathOptions,
  listConnectablePlatforms,
} from "@/features/connections/connectAuthPath";
import { guideCallbackPaths } from "@/features/connections/connectGuides";
import {
  MCP_KEYED_PLATFORMS,
  MCP_OAUTH_PLATFORMS,
  MCP_PLATFORMS,
} from "@/features/connections/mcpProviders";

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

function stubOAuthDeps() {
  const noop = async () => null;
  return {
    BASE_URL: "http://localhost:5173",
    API_BASE_URL: "http://localhost:3001",
    ZERNIO_API_BASE: "https://example.invalid",
    zernio: { getAccounts: noop, getConnectUrl: noop },
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

async function registeredOAuthPaths(): Promise<Set<string>> {
  vi.stubEnv("SHOPIFY_API_KEY", "");
  vi.stubEnv("NOTION_CLIENT_ID", "");
  const { registerOAuthRoutes } = await import("../../server/routes/oauthRoutes.ts");
  const { app, routes } = createFakeApp();
  registerOAuthRoutes(app, stubOAuthDeps() as never);
  return new Set(routes.map((r) => r.path));
}

/** `/api/auth/mcp/exa` is served by the `:platform` route, not a literal path. */
function toRoutePattern(authPath: string): string {
  const mcp = authPath.match(/^mcp\/(.+)$/);
  return mcp ? "/api/auth/mcp/:platform" : `/api/auth/${authPath}`;
}

describe("connection catalog wiring", () => {
  it("lists every connectable platform exactly once", () => {
    const platforms = CONNECTION_CATALOG.map((entry) => entry.platform);
    expect(new Set(platforms).size).toBe(platforms.length);
    expect([...platforms].sort()).toEqual([...listConnectablePlatforms()].sort());
  });

  it("gives every catalog entry a connect path and at least one path option", () => {
    for (const entry of CONNECTION_CATALOG) {
      expect(getConnectConfig(entry.platform), entry.platform).not.toBeNull();
      expect(getConnectionPathOptions(entry.platform).length, entry.platform).toBeGreaterThan(0);
    }
  });

  it("marks exactly one connect path option as the default", () => {
    for (const entry of CONNECTION_CATALOG) {
      const defaults = getConnectionPathOptions(entry.platform).filter((o) => o.isDefault);
      expect(defaults.length, entry.platform).toBe(1);
    }
  });

  it("defaults calendar and review platforms to Official API (Zernio paths are limited)", () => {
    for (const platform of [
      "google_calendar",
      "outlook_calendar",
      "google_reviews",
      "tripadvisor",
    ] as const) {
      const config = getConnectConfig(platform);
      expect(config?.provider, platform).toBe("official");
      const defaultPath = getConnectionPathOptions(platform).find((o) => o.isDefault);
      expect(defaultPath?.id, platform).toBe("official");
    }
  });

  it("splits every MCP provider into exactly one auth bucket", () => {
    const bucketed = [...MCP_OAUTH_PLATFORMS, ...MCP_KEYED_PLATFORMS];
    expect(new Set(bucketed).size).toBe(bucketed.length);
    expect([...bucketed].sort()).toEqual([...MCP_PLATFORMS].sort());
  });
});

describe("connect paths resolve to real server routes", () => {
  it("registers an OAuth entrypoint for every catalog connect path", async () => {
    const registered = await registeredOAuthPaths();
    const missing = CONNECTION_CATALOG.map((entry) => {
      const config = getConnectConfig(entry.platform);
      return config ? { platform: entry.platform, path: toRoutePattern(config.authPath) } : null;
    })
      .filter((x) => x !== null)
      .filter((x) => !registered.has(x.path));

    expect(missing.map((m) => `${m.platform} → ${m.path}`)).toEqual([]);
  });

  it("registers every callback URL the guides tell users to whitelist", async () => {
    const registered = await registeredOAuthPaths();
    const paths = guideCallbackPaths();
    expect(paths.length).toBeGreaterThan(0);
    expect(paths.filter((p) => !registered.has(p))).toEqual([]);
  });
});
