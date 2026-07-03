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
    businessProfileId: string | null;
    userId: string;
    platforms: readonly string[];
    query: string;
    toolPatterns: RegExp[];
    argCandidates: string[];
    logTag: string;
    failMessage: string;
  }
): Promise<unknown> {
  try {
    const ready = await findReadyMcpAccount({
      tokenStore: deps.tokenStore,
      businessProfileId: deps.businessProfileId,
      platforms: [...deps.platforms],
    });
    if (ready.ok === false) {
      return res.status(ready.status).json({ error: ready.error });
    }
    const access = deps.getStoredAccountAccess(ready.account, deps.userId);
    if (!access.allowed) return res.status(403).json({ error: "Account belongs to another user" });

    const result = await runMcpQuery({
      tokenStore: deps.tokenStore,
      account: ready.account,
      toolPatterns: deps.toolPatterns,
      argCandidates: deps.argCandidates,
      query: deps.query,
    });
    if (result.ok === false) return res.status(result.status).json({ error: result.error });
    return res.json({ ...result, query: deps.query, fetchedAt: new Date().toISOString() });
  } catch (err) {
    console.error(`[intelligence] ${deps.logTag} failed:`, err);
    return res.status(500).json({ error: deps.failMessage });
  }
}

export function registerIntelligenceRoutes(app, deps: IntelligenceRouteDeps) {
  const { tokenStore, getSessionUserId, getStoredAccountAccess, supabaseAdmin } = deps;

  app.get("/api/intelligence/providers", async (req, res) => {
    const userId = getSessionUserId(req);
    if (!userId) return res.status(401).json({ error: "Not authenticated" });
    const businessProfileId = readRequestBusinessProfileId(req);
    const probe = String(req.query.probe || "") === "1";
    try {
      const providers = await buildMcpProvidersReadiness({
        tokenStore,
        businessProfileId,
        probe,
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
      const ready = await findReadyMcpAccount({
        tokenStore,
        businessProfileId,
        platforms: [...MCP_FEATURE_PLATFORMS.leadResearch],
      });
      if (ready.ok === false) {
        return res.status(ready.status).json({ error: ready.error });
      }
      const account = ready.account;
      const access = getStoredAccountAccess(account, userId);
      if (!access.allowed) {
        return res.status(403).json({ error: "Account belongs to another user" });
      }

      const query = [company || name, website, "company overview news"]
        .filter(Boolean)
        .join(" ");
      const result = await runMcpQuery({
        tokenStore,
        account,
        toolPatterns: [/web_search/i, /^search/i, /prospect/i, /company/i],
        argCandidates: ["query", "q", "search", "text", "prompt", "name"],
        query,
      });
      if (result.ok === false) {
        return res.status(result.status).json({ error: result.error });
      }

      return res.json({
        provider: result.provider,
        tool: result.tool,
        query,
        text: result.text,
        fetchedAt: new Date().toISOString(),
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
      const ready = await findReadyMcpAccount({
        tokenStore,
        businessProfileId,
        platforms: [...MCP_FEATURE_PLATFORMS.docSearch],
      });
      if (ready.ok === false) {
        return res.status(ready.status).json({ error: ready.error });
      }
      const access = getStoredAccountAccess(ready.account, userId);
      if (!access.allowed) return res.status(403).json({ error: "Account belongs to another user" });

      const result = await runMcpQuery({
        tokenStore,
        account: ready.account,
        toolPatterns: [/twilio__search/i, /search/i, /web_search/i, /doc/i],
        argCandidates: ["query", "q", "search", "text", "prompt"],
        query,
      });
      if (result.ok === false) return res.status(result.status).json({ error: result.error });
      return res.json({ ...result, query, fetchedAt: new Date().toISOString() });
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
      const ready = await findReadyMcpAccount({
        tokenStore,
        businessProfileId,
        platforms: [...MCP_FEATURE_PLATFORMS.seoOverview],
      });
      if (ready.ok === false) {
        return res.status(ready.status).json({ error: ready.error });
      }
      const access = getStoredAccountAccess(ready.account, userId);
      if (!access.allowed) return res.status(403).json({ error: "Account belongs to another user" });

      const result = await runMcpQuery({
        tokenStore,
        account: ready.account,
        toolPatterns: [/site/i, /domain/i, /overview/i, /seo/i, /search/i],
        argCandidates: ["target", "domain", "url", "query", "q"],
        query: target,
      });
      if (result.ok === false) return res.status(result.status).json({ error: result.error });
      return res.json({ ...result, target, fetchedAt: new Date().toISOString() });
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
      const ready = await findReadyMcpAccount({
        tokenStore,
        businessProfileId,
        platforms: [...MCP_FEATURE_PLATFORMS.marketingQuery],
      });
      if (ready.ok === false) {
        return res.status(ready.status).json({ error: ready.error });
      }
      const access = getStoredAccountAccess(ready.account, userId);
      if (!access.allowed) return res.status(403).json({ error: "Account belongs to another user" });

      const result = await runMcpQuery({
        tokenStore,
        account: ready.account,
        toolPatterns: [/query/i, /report/i, /metric/i, /data/i, /search/i],
        argCandidates: ["query", "q", "prompt", "text", "question"],
        query,
      });
      if (result.ok === false) return res.status(result.status).json({ error: result.error });
      return res.json({ ...result, query, fetchedAt: new Date().toISOString() });
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
      const ready = await findReadyMcpAccount({
        tokenStore,
        businessProfileId,
        platforms: [...MCP_FEATURE_PLATFORMS.competitiveResearch],
      });
      if (ready.ok === false) {
        return res.status(ready.status).json({ error: ready.error });
      }
      const access = getStoredAccountAccess(ready.account, userId);
      if (!access.allowed) return res.status(403).json({ error: "Account belongs to another user" });

      const result = await runMcpQuery({
        tokenStore,
        account: ready.account,
        toolPatterns: [/compet/i, /company/i, /research/i, /search/i],
        argCandidates: ["query", "company", "name", "q", "text"],
        query,
      });
      if (result.ok === false) return res.status(result.status).json({ error: result.error });
      return res.json({ ...result, query, fetchedAt: new Date().toISOString() });
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
      businessProfileId: readRequestBusinessProfileId(req),
      userId,
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
      businessProfileId: readRequestBusinessProfileId(req),
      userId,
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
      businessProfileId: readRequestBusinessProfileId(req),
      userId,
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
      businessProfileId: readRequestBusinessProfileId(req),
      userId,
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
      businessProfileId: readRequestBusinessProfileId(req),
      userId,
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
      businessProfileId: readRequestBusinessProfileId(req),
      userId,
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
      businessProfileId: readRequestBusinessProfileId(req),
      userId,
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
      businessProfileId: readRequestBusinessProfileId(req),
      userId,
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
}
