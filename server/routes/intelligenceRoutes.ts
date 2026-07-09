/**
 * Intelligence features built on connected MCP servers.
 *
 *   GET  /api/intelligence/pulse          — market pulse (LunarCrush): crypto
 *        sentiment for the home dashboard. Quiet by design: available:false
 *        when no provider is connected, never a hard error.
 *   POST /api/intelligence/lead-research  — research a lead/company through
 *        the tenant's connected research providers (Exa, Sprouts).
 *   GET  /api/intelligence/providers      — readiness for all MCP providers
 *   POST /api/intelligence/doc-search       — Twilio Docs / Exa
 *   GET  /api/intelligence/seo-overview     — Ahrefs
 *   POST /api/intelligence/marketing-query  — Supermetrics / Windsor
 *   POST /api/intelligence/competitive-research — Peec AI
 *   POST /api/intelligence/mail-search          — Superhuman Mail
 *   POST /api/intelligence/domain-lookup        — GoDaddy
 *   POST /api/intelligence/architecture-docs    — Klarity
 *   POST /api/intelligence/deck-generation      — Gamma
 *   POST /api/intelligence/shop-catalog         — Shopify MCP
 *   POST /api/intelligence/crm-query            — Day.ai
 *   POST /api/intelligence/context-query        — Era
 *   POST /api/intelligence/design-assist        — Canva MCP
 *   POST /api/intelligence/multi-source-assessment — parallel domain/company
 *        assessment across all connected MCP lenses (Ahrefs, GoDaddy, Exa, …)
 *
 * Both resolve the tenant's own connected accounts via mcpAccess — no global
 * keys, no cross-tenant reads. Tool names differ per vendor, so tools are
 * picked by pattern and arguments are shaped from the tool's own inputSchema.
 */

import { fetchMarketPulseLive, DEFAULT_MARKET_PULSE_TOPIC } from "../lib/marketPulseFetch.ts";
import { findMcpAccountForProfile } from "../lib/mcpAccess.ts";
import { MCP_FEATURE_PLATFORMS } from "../lib/mcpCatalog.ts";
import { runMcpQuery } from "../lib/mcpQuery.ts";
import { runMultiSourceAssessment } from "../lib/mcpMultiSource.ts";
import { assessMcpAccount, buildMcpProvidersReadiness, findReadyMcpAccount } from "../lib/mcpReadiness.ts";
import { readRequestBusinessProfileId } from "../lib/profileScope.ts";
import {
  buildAiToolPlan,
  findReadyAccountFromPlan,
  inferFeatureFromQuery,
  type McpFeatureId,
} from "../lib/aiToolManager.ts";
import { usageFromToolPlan } from "../lib/aiUsageTracker.ts";

interface TokenStoreLike {
  set: (id: string, value: Record<string, unknown>) => Promise<unknown>;
  get: (id: string) => Promise<Record<string, unknown> | null>;
  entries: () => Promise<Array<[string, Record<string, unknown>]>>;
}

interface IntelligenceRouteDeps {
  tokenStore: TokenStoreLike;
  getSessionUserId: (req: unknown) => string | null;
  getStoredAccountAccess: (
    stored: Record<string, unknown> | null | undefined,
    userId: string
  ) => { allowed: boolean; migrate: boolean; reason: string };
  supabaseAdmin?: { from: (table: string) => unknown } | null;
}

/**
 * Per-instance response cache. Serverless instances are short-lived, so this
 * is a best-effort cost saver (LunarCrush rate limits), not a datastore.
 */
const pulseCache = new Map<string, { at: number; payload: Record<string, unknown> }>();
const PULSE_CACHE_MS = 15 * 60 * 1000;

async function handleAuthenticatedMcpQuery(
  req: { body?: Record<string, unknown>; query?: Record<string, unknown> },
  res: {
    status: (n: number) => { json: (b: unknown) => unknown };
    json: (b: unknown) => unknown;
  },
  deps: {
    tokenStore: TokenStoreLike;
    getSessionUserId: (req: unknown) => string | null;
    getStoredAccountAccess: IntelligenceRouteDeps["getStoredAccountAccess"];
    supabaseAdmin?: IntelligenceRouteDeps["supabaseAdmin"];
    businessProfileId: string | null;
    userId: string;
    featureId: McpFeatureId;
    platforms: readonly string[];
    query: string;
    toolPatterns: RegExp[];
    argCandidates: string[];
    logTag: string;
    failMessage: string;
  }
): Promise<unknown> {
  try {
    const executed = await runFeatureMcpQuery({
      tokenStore: deps.tokenStore,
      supabaseAdmin: deps.supabaseAdmin,
      businessProfileId: deps.businessProfileId,
      userId: deps.userId,
      getStoredAccountAccess: deps.getStoredAccountAccess,
      featureId: deps.featureId,
      query: deps.query,
      toolPatterns: deps.toolPatterns,
      argCandidates: deps.argCandidates,
    });
    if (executed.ok === false) {
      return res.status(executed.status).json({
        error: executed.error,
        toolPlan: executed.toolPlan,
      });
    }

    return res.json({
      ...executed.result,
      query: deps.query,
      fetchedAt: new Date().toISOString(),
      toolPlan: executed.toolPlan,
      selectedPlatform: executed.selectedPlatform,
    });
  } catch (err) {
    console.error(`[intelligence] ${deps.logTag} failed:`, err);
    return res.status(500).json({ error: deps.failMessage });
  }
}

/** Shared MCP execution with smart tool selection and usage tracking. */
async function runFeatureMcpQuery(deps: {
  tokenStore: TokenStoreLike;
  supabaseAdmin?: IntelligenceRouteDeps["supabaseAdmin"];
  businessProfileId: string | null;
  userId: string;
  getStoredAccountAccess: IntelligenceRouteDeps["getStoredAccountAccess"];
  featureId: McpFeatureId;
  query: string;
  toolPatterns: RegExp[];
  argCandidates: string[];
  maxProviders?: number;
}): Promise<
  | {
      ok: true;
      result: { tool: string; text: string; provider: string };
      toolPlan: Awaited<ReturnType<typeof buildAiToolPlan>>;
      selectedPlatform: string;
    }
  | { ok: false; status: number; error: string; toolPlan?: Awaited<ReturnType<typeof buildAiToolPlan>> }
> {
  const plan = await buildAiToolPlan({
    featureId: deps.featureId,
    query: deps.query,
    tokenStore: deps.tokenStore,
    businessProfileId: deps.businessProfileId,
    maxProviders: deps.maxProviders,
  });
  const ready = await findReadyAccountFromPlan({
    tokenStore: deps.tokenStore,
    businessProfileId: deps.businessProfileId,
    plan,
  });
  if (ready.ok === false) {
    return { ok: false, status: ready.status, error: ready.error, toolPlan: plan };
  }
  const access = deps.getStoredAccountAccess(ready.account, deps.userId);
  if (!access.allowed) {
    return { ok: false, status: 403, error: "Account belongs to another user", toolPlan: plan };
  }
  const planMeta = usageFromToolPlan(plan);
  const result = await runMcpQuery({
    tokenStore: deps.tokenStore,
    account: ready.account,
    toolPatterns: deps.toolPatterns,
    argCandidates: deps.argCandidates,
    query: deps.query,
    usage: deps.businessProfileId
      ? {
          supabase: deps.supabaseAdmin as Parameters<typeof import("../lib/aiUsageTracker.ts").recordAiUsage>[0],
          businessProfileId: deps.businessProfileId,
          actorUserId: deps.userId,
          runId: planMeta.runId,
          featureId: deps.featureId,
          toolsSelected: planMeta.toolsSelected,
          selectionReason: planMeta.selectionReason,
          queryPreview: deps.query,
        }
      : undefined,
  });
  if (result.ok === false) {
    return { ok: false, status: result.status, error: result.error, toolPlan: plan };
  }
  return {
    ok: true,
    result,
    toolPlan: plan,
    selectedPlatform: ready.platform,
  };
}

export function registerIntelligenceRoutes(app, deps: IntelligenceRouteDeps) {
  const { tokenStore, getSessionUserId, getStoredAccountAccess, supabaseAdmin } = deps;

  app.get("/api/intelligence/providers", async (req, res) => {
    const userId = getSessionUserId(req);
    if (!userId) return res.status(401).json({ error: "Not authenticated" });
    const businessProfileId = readRequestBusinessProfileId(req);
    const probe = String(req.query.probe || "") === "1";
    const platform = String(req.query.platform || "").trim();
    try {
      const providers = await buildMcpProvidersReadiness({
        tokenStore,
        businessProfileId,
        probe,
        platforms: platform ? [platform] : undefined,
      });
      return res.json({ providers, fetchedAt: new Date().toISOString() });
    } catch (err) {
      console.error("[intelligence] providers status failed:", err);
      return res.status(500).json({ error: "Could not load MCP provider status." });
    }
  });

  app.get("/api/intelligence/pulse", async (req, res) => {
    const userId = getSessionUserId(req);
    if (!userId) return res.status(401).json({ error: "Not authenticated" });
    const businessProfileId = readRequestBusinessProfileId(req);
    const topic =
      String(req.query.topic || DEFAULT_MARKET_PULSE_TOPIC)
        .trim()
        .toLowerCase() || DEFAULT_MARKET_PULSE_TOPIC;
    const preferLive = String(req.query.live || "") === "1";

    const cacheKey = `${businessProfileId || "global"}:${topic}:${preferLive ? "live" : "auto"}`;
    const cached = pulseCache.get(cacheKey);
    if (cached && Date.now() - cached.at < PULSE_CACHE_MS) {
      return res.json(cached.payload);
    }

    try {
      if (!preferLive && supabaseAdmin && businessProfileId) {
        const today = new Date().toISOString().slice(0, 10);
        const { data: row, error } = await (supabaseAdmin as {
          from: (t: string) => {
            select: (c: string) => {
              eq: (a: string, v: string) => {
                eq: (b: string, v: string) => {
                  eq: (c: string, v: string) => {
                    maybeSingle: () => Promise<{ data: Record<string, unknown> | null; error: { message: string } | null }>;
                  };
                };
              };
            };
          };
        })
          .from("intelligence_pulse_snapshots")
          .select("topic,tool,text,provider,fetched_at")
          .eq("business_profile_id", businessProfileId)
          .eq("snapshot_date", today)
          .eq("topic", topic)
          .maybeSingle();
        if (!error && row?.text) {
          const payload = {
            available: true,
            topic: String(row.topic || topic),
            tool: String(row.tool || ""),
            text: String(row.text || ""),
            provider: row.provider ? String(row.provider) : undefined,
            fetchedAt: row.fetched_at ? String(row.fetched_at) : new Date().toISOString(),
            source: "snapshot",
          };
          pulseCache.set(cacheKey, { at: Date.now(), payload });
          return res.json(payload);
        }
      }

      const ready = await findReadyMcpAccount({
        tokenStore,
        businessProfileId,
        platforms: [...MCP_FEATURE_PLATFORMS.marketPulse],
      });
      if (ready.ok === false) {
        const account = await findMcpAccountForProfile({
          tokenStore,
          businessProfileId,
          platforms: [...MCP_FEATURE_PLATFORMS.marketPulse],
        });
        if (account) {
          const assessed = await assessMcpAccount(tokenStore, account);
          if (assessed.status === "missing_credential" || assessed.status === "auth_expired") {
            return res.json({
              available: false,
              reason: assessed.status,
              message: assessed.message,
            });
          }
        }
        return res.json({
          available: false,
          reason: "not_connected",
          message: ready.error,
        });
      }

      const access = getStoredAccountAccess(ready.account, userId);
      if (!access.allowed) {
        return res.json({ available: false, reason: "not_connected" });
      }

      const live = await fetchMarketPulseLive({ tokenStore, businessProfileId, topic });
      if (!live.available) {
        return res.json(live);
      }

      const payload = {
        available: true,
        topic: live.topic,
        tool: live.tool,
        text: live.text,
        provider: live.provider,
        fetchedAt: live.fetchedAt,
        source: "live",
      };
      pulseCache.set(cacheKey, { at: Date.now(), payload });
      return res.json(payload);
    } catch (err) {
      console.error("[intelligence] pulse failed:", err);
      return res.json({ available: false, reason: "provider_error" });
    }
  });

  app.post("/api/intelligence/lead-research", async (req, res) => {
    const userId = getSessionUserId(req);
    if (!userId) return res.status(401).json({ error: "Not authenticated" });
    const businessProfileId = readRequestBusinessProfileId(req);
    const name = String(req.body?.name || "").trim();
    const company = String(req.body?.company || "").trim();
    const website = String(req.body?.website || "").trim();
    if (!name && !company && !website) {
      return res.status(400).json({ error: "Provide a lead name, company, or website to research." });
    }

    try {
      const query = [company || name, website, "company overview news"]
        .filter(Boolean)
        .join(" ");
      const executed = await runFeatureMcpQuery({
        tokenStore,
        supabaseAdmin,
        businessProfileId,
        userId,
        getStoredAccountAccess,
        featureId: "leadResearch",
        query,
        toolPatterns: [/web_search/i, /^search/i, /prospect/i, /company/i],
        argCandidates: ["query", "q", "search", "text", "prompt", "name"],
        maxProviders: 2,
      });
      if (executed.ok === false) {
        return res.status(executed.status).json({ error: executed.error, toolPlan: executed.toolPlan });
      }

      return res.json({
        provider: executed.result.provider,
        tool: executed.result.tool,
        query,
        text: executed.result.text,
        fetchedAt: new Date().toISOString(),
        toolPlan: executed.toolPlan,
        selectedPlatform: executed.selectedPlatform,
      });
    } catch (err) {
      console.error("[intelligence] lead-research failed:", err);
      return res.status(500).json({ error: "Lead research failed." });
    }
  });

  app.post("/api/intelligence/doc-search", async (req, res) => {
    const userId = getSessionUserId(req);
    if (!userId) return res.status(401).json({ error: "Not authenticated" });
    const businessProfileId = readRequestBusinessProfileId(req);
    const query = String(req.body?.query || "").trim();
    if (!query) return res.status(400).json({ error: "Query is required." });

    try {
      const executed = await runFeatureMcpQuery({
        tokenStore,
        supabaseAdmin,
        businessProfileId,
        userId,
        getStoredAccountAccess,
        featureId: "docSearch",
        query,
        toolPatterns: [/twilio__search/i, /search/i, /web_search/i, /doc/i],
        argCandidates: ["query", "q", "search", "text", "prompt"],
      });
      if (executed.ok === false) {
        return res.status(executed.status).json({ error: executed.error, toolPlan: executed.toolPlan });
      }
      return res.json({
        ...executed.result,
        query,
        fetchedAt: new Date().toISOString(),
        toolPlan: executed.toolPlan,
        selectedPlatform: executed.selectedPlatform,
      });
    } catch (err) {
      console.error("[intelligence] doc-search failed:", err);
      return res.status(500).json({ error: "Doc search failed." });
    }
  });

  app.get("/api/intelligence/seo-overview", async (req, res) => {
    const userId = getSessionUserId(req);
    if (!userId) return res.status(401).json({ error: "Not authenticated" });
    const businessProfileId = readRequestBusinessProfileId(req);
    const target = String(req.query.target || req.query.domain || "").trim();
    if (!target) return res.status(400).json({ error: "Provide a domain or URL (target=)." });

    try {
      const executed = await runFeatureMcpQuery({
        tokenStore,
        supabaseAdmin,
        businessProfileId,
        userId,
        getStoredAccountAccess,
        featureId: "seoOverview",
        query: target,
        toolPatterns: [/site/i, /domain/i, /overview/i, /seo/i, /search/i],
        argCandidates: ["target", "domain", "url", "query", "q"],
      });
      if (executed.ok === false) {
        return res.status(executed.status).json({ error: executed.error, toolPlan: executed.toolPlan });
      }
      return res.json({
        ...executed.result,
        target,
        fetchedAt: new Date().toISOString(),
        toolPlan: executed.toolPlan,
        selectedPlatform: executed.selectedPlatform,
      });
    } catch (err) {
      console.error("[intelligence] seo-overview failed:", err);
      return res.status(500).json({ error: "SEO overview failed." });
    }
  });

  app.post("/api/intelligence/marketing-query", async (req, res) => {
    const userId = getSessionUserId(req);
    if (!userId) return res.status(401).json({ error: "Not authenticated" });
    const businessProfileId = readRequestBusinessProfileId(req);
    const query = String(req.body?.query || "").trim();
    if (!query) return res.status(400).json({ error: "Query is required." });

    try {
      const executed = await runFeatureMcpQuery({
        tokenStore,
        supabaseAdmin,
        businessProfileId,
        userId,
        getStoredAccountAccess,
        featureId: "marketingQuery",
        query,
        toolPatterns: [/query/i, /report/i, /metric/i, /data/i, /search/i],
        argCandidates: ["query", "q", "prompt", "text", "question"],
      });
      if (executed.ok === false) {
        return res.status(executed.status).json({ error: executed.error, toolPlan: executed.toolPlan });
      }
      return res.json({
        ...executed.result,
        query,
        fetchedAt: new Date().toISOString(),
        toolPlan: executed.toolPlan,
        selectedPlatform: executed.selectedPlatform,
      });
    } catch (err) {
      console.error("[intelligence] marketing-query failed:", err);
      return res.status(500).json({ error: "Marketing query failed." });
    }
  });

  app.post("/api/intelligence/competitive-research", async (req, res) => {
    const userId = getSessionUserId(req);
    if (!userId) return res.status(401).json({ error: "Not authenticated" });
    const businessProfileId = readRequestBusinessProfileId(req);
    const query = String(req.body?.query || req.body?.company || "").trim();
    if (!query) return res.status(400).json({ error: "Company or query is required." });

    try {
      const executed = await runFeatureMcpQuery({
        tokenStore,
        supabaseAdmin,
        businessProfileId,
        userId,
        getStoredAccountAccess,
        featureId: "competitiveResearch",
        query,
        toolPatterns: [/compet/i, /company/i, /research/i, /search/i],
        argCandidates: ["query", "company", "name", "q", "text"],
      });
      if (executed.ok === false) {
        return res.status(executed.status).json({ error: executed.error, toolPlan: executed.toolPlan });
      }
      return res.json({
        ...executed.result,
        query,
        fetchedAt: new Date().toISOString(),
        toolPlan: executed.toolPlan,
        selectedPlatform: executed.selectedPlatform,
      });
    } catch (err) {
      console.error("[intelligence] competitive-research failed:", err);
      return res.status(500).json({ error: "Competitive research failed." });
    }
  });

  app.post("/api/intelligence/mail-search", async (req, res) => {
    const userId = getSessionUserId(req);
    if (!userId) return res.status(401).json({ error: "Not authenticated" });
    const query = String(req.body?.query || "").trim();
    if (!query) return res.status(400).json({ error: "Search query is required." });
    return handleAuthenticatedMcpQuery(req, res, {
      tokenStore,
      getSessionUserId,
      getStoredAccountAccess,
      supabaseAdmin,
      businessProfileId: readRequestBusinessProfileId(req),
      userId,
      featureId: "mailSearch",
      platforms: MCP_FEATURE_PLATFORMS.mailSearch,
      query,
      toolPatterns: [/mail/i, /search/i, /inbox/i, /message/i],
      argCandidates: ["query", "q", "search", "text", "prompt"],
      logTag: "mail-search",
      failMessage: "Mail search failed.",
    });
  });

  app.post("/api/intelligence/domain-lookup", async (req, res) => {
    const userId = getSessionUserId(req);
    if (!userId) return res.status(401).json({ error: "Not authenticated" });
    const query = String(req.body?.domain || req.body?.query || "").trim();
    if (!query) return res.status(400).json({ error: "Domain name is required." });
    return handleAuthenticatedMcpQuery(req, res, {
      tokenStore,
      getSessionUserId,
      getStoredAccountAccess,
      supabaseAdmin,
      businessProfileId: readRequestBusinessProfileId(req),
      userId,
      featureId: "domainLookup",
      platforms: MCP_FEATURE_PLATFORMS.domainLookup,
      query,
      toolPatterns: [/domain/i, /lookup/i, /dns/i, /whois/i, /search/i],
      argCandidates: ["domain", "name", "query", "q", "url"],
      logTag: "domain-lookup",
      failMessage: "Domain lookup failed.",
    });
  });

  app.post("/api/intelligence/architecture-docs", async (req, res) => {
    const userId = getSessionUserId(req);
    if (!userId) return res.status(401).json({ error: "Not authenticated" });
    const query = String(req.body?.query || "").trim();
    if (!query) return res.status(400).json({ error: "Query is required." });
    return handleAuthenticatedMcpQuery(req, res, {
      tokenStore,
      getSessionUserId,
      getStoredAccountAccess,
      supabaseAdmin,
      businessProfileId: readRequestBusinessProfileId(req),
      userId,
      featureId: "architectureDocs",
      platforms: MCP_FEATURE_PLATFORMS.architectureDocs,
      query,
      toolPatterns: [/arch/i, /doc/i, /search/i, /query/i],
      argCandidates: ["query", "q", "prompt", "text", "question"],
      logTag: "architecture-docs",
      failMessage: "Architecture doc search failed.",
    });
  });

  app.post("/api/intelligence/deck-generation", async (req, res) => {
    const userId = getSessionUserId(req);
    if (!userId) return res.status(401).json({ error: "Not authenticated" });
    const query = String(req.body?.prompt || req.body?.query || "").trim();
    if (!query) return res.status(400).json({ error: "Deck prompt is required." });
    return handleAuthenticatedMcpQuery(req, res, {
      tokenStore,
      getSessionUserId,
      getStoredAccountAccess,
      supabaseAdmin,
      businessProfileId: readRequestBusinessProfileId(req),
      userId,
      featureId: "deckGeneration",
      platforms: MCP_FEATURE_PLATFORMS.deckGeneration,
      query,
      toolPatterns: [/deck/i, /presentation/i, /slide/i, /generate/i, /create/i],
      argCandidates: ["prompt", "query", "text", "topic", "title"],
      logTag: "deck-generation",
      failMessage: "Deck generation failed.",
    });
  });

  app.post("/api/intelligence/shop-catalog", async (req, res) => {
    const userId = getSessionUserId(req);
    if (!userId) return res.status(401).json({ error: "Not authenticated" });
    const query = String(req.body?.query || "").trim();
    if (!query) return res.status(400).json({ error: "Catalog query is required." });
    return handleAuthenticatedMcpQuery(req, res, {
      tokenStore,
      getSessionUserId,
      getStoredAccountAccess,
      supabaseAdmin,
      businessProfileId: readRequestBusinessProfileId(req),
      userId,
      featureId: "shopCatalog",
      platforms: MCP_FEATURE_PLATFORMS.shopCatalog,
      query,
      toolPatterns: [/product/i, /catalog/i, /collection/i, /shop/i, /search/i],
      argCandidates: ["query", "q", "search", "title", "handle"],
      logTag: "shop-catalog",
      failMessage: "Shop catalog query failed.",
    });
  });

  app.post("/api/intelligence/crm-query", async (req, res) => {
    const userId = getSessionUserId(req);
    if (!userId) return res.status(401).json({ error: "Not authenticated" });
    const query = String(req.body?.query || "").trim();
    if (!query) return res.status(400).json({ error: "CRM query is required." });
    return handleAuthenticatedMcpQuery(req, res, {
      tokenStore,
      getSessionUserId,
      getStoredAccountAccess,
      supabaseAdmin,
      businessProfileId: readRequestBusinessProfileId(req),
      userId,
      featureId: "crmQuery",
      platforms: MCP_FEATURE_PLATFORMS.crmQuery,
      query,
      toolPatterns: [/crm/i, /customer/i, /contact/i, /deal/i, /search/i, /query/i],
      argCandidates: ["query", "q", "prompt", "text", "question"],
      logTag: "crm-query",
      failMessage: "CRM query failed.",
    });
  });

  app.post("/api/intelligence/context-query", async (req, res) => {
    const userId = getSessionUserId(req);
    if (!userId) return res.status(401).json({ error: "Not authenticated" });
    const query = String(req.body?.query || "").trim();
    if (!query) return res.status(400).json({ error: "Query is required." });
    return handleAuthenticatedMcpQuery(req, res, {
      tokenStore,
      getSessionUserId,
      getStoredAccountAccess,
      supabaseAdmin,
      businessProfileId: readRequestBusinessProfileId(req),
      userId,
      featureId: "contextQuery",
      platforms: MCP_FEATURE_PLATFORMS.contextQuery,
      query,
      toolPatterns: [/context/i, /search/i, /query/i, /tool/i],
      argCandidates: ["query", "q", "prompt", "text", "question"],
      logTag: "context-query",
      failMessage: "Context query failed.",
    });
  });

  app.post("/api/intelligence/design-assist", async (req, res) => {
    const userId = getSessionUserId(req);
    if (!userId) return res.status(401).json({ error: "Not authenticated" });
    const query = String(req.body?.prompt || req.body?.query || "").trim();
    if (!query) return res.status(400).json({ error: "Design prompt is required." });
    return handleAuthenticatedMcpQuery(req, res, {
      tokenStore,
      getSessionUserId,
      getStoredAccountAccess,
      supabaseAdmin,
      businessProfileId: readRequestBusinessProfileId(req),
      userId,
      featureId: "designAssist",
      platforms: MCP_FEATURE_PLATFORMS.designAssist,
      query,
      toolPatterns: [/design/i, /create/i, /template/i, /generate/i, /search/i],
      argCandidates: ["prompt", "query", "text", "title", "description"],
      logTag: "design-assist",
      failMessage: "Design assist failed.",
    });
  });

  app.post("/api/intelligence/multi-source-assessment", async (req, res) => {
    const userId = getSessionUserId(req);
    if (!userId) return res.status(401).json({ error: "Not authenticated" });
    const businessProfileId = readRequestBusinessProfileId(req);
    const subject = String(req.body?.subject || req.body?.domain || req.body?.company || "").trim();

    try {
      const result = await runMultiSourceAssessment({
        tokenStore,
        businessProfileId,
        userId,
        getStoredAccountAccess: (stored, uid) => getStoredAccountAccess(stored, uid),
        subjectInput: subject,
      });
      if ("error" in result) {
        return res.status(result.status).json({ error: result.error });
      }
      return res.json(result);
    } catch (err) {
      console.error("[intelligence] multi-source-assessment failed:", err);
      return res.status(500).json({ error: "Multi-source assessment failed." });
    }
  });

  app.get("/api/intelligence/tool-plan", async (req, res) => {
    const userId = getSessionUserId(req);
    if (!userId) return res.status(401).json({ error: "Not authenticated" });
    const businessProfileId = readRequestBusinessProfileId(req);
    const query = String(req.query.query || req.query.q || "").trim();
    let featureId = String(req.query.feature || req.query.featureId || "").trim() as McpFeatureId;
    if (!featureId || !(featureId in MCP_FEATURE_PLATFORMS)) {
      const inferred = inferFeatureFromQuery(query);
      featureId = inferred ?? "leadResearch";
    }
    try {
      const plan = await buildAiToolPlan({
        featureId,
        query,
        tokenStore,
        businessProfileId,
      });
      return res.json(plan);
    } catch (err) {
      console.error("[intelligence] tool-plan failed:", err);
      return res.status(500).json({ error: "Could not build tool plan." });
    }
  });
}
