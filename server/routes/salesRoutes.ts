/**
 * POST /api/sales/lead-suggestions — AI outreach-target suggestions for the
 * Sales page. Uses the tenant's OpenAI key when available, otherwise returns a
 * heuristic fallback so the feature always responds. Rate-limited per user
 * since it calls a paid API.
 *
 * POST /api/sales/outreach-discovery-suggestions — 20 concrete websites or
 * email addresses to check for outreach and brand presence (Sales / Outreach).
 *
 * POST /api/sales/marketing-playbook — pitch angles, outreach copy, objections,
 * campaigns, channels and promotions for sales & marketing.
 */

import { rateLimitMiddleware } from "../lib/rateLimit.ts";
import {
  buildLeadSuggestionPrompt,
  heuristicLeadSuggestions,
  parseLeadSuggestions,
  type LeadSuggestionContext,
} from "../ai/leadSuggestions.ts";
import {
  buildBrandDiscoveryPrompt,
  heuristicBrandDiscoverySuggestions,
  parseBrandDiscoverySuggestions,
  type BrandDiscoveryContext,
  type BrandDiscoveryMode,
} from "../ai/brandDiscoverySuggestions.ts";
import {
  buildSalesPlaybookPrompt,
  heuristicSalesPlaybookItems,
  normalizePlaybookMode,
  parseSalesPlaybookItems,
  type SalesPlaybookContext,
} from "../ai/salesMarketingPlaybook.ts";
import {
  buildOutreachDraftPrompt,
  heuristicOutreachDraft,
  normalizeOutreachChannel,
  parseOutreachDraft,
  type OutreachDraftContext,
} from "../ai/outreachDraft.ts";
import {
  buildOutreachContentPrompt,
  heuristicOutreachContentIdeas,
  parseOutreachContentIdeas,
  type OutreachContentContext,
} from "../ai/outreachContent.ts";
import { fetchSiteMeta } from "../lib/siteMeta.ts";
import { readRequestBodyBusinessProfileId } from "../lib/profileScope.ts";

type SalesRouteDeps = {
  getSessionUserId: (req: { headers?: { cookie?: string } }) => string | null;
  secretResolver?: {
    resolve: (businessProfileId: string | null | undefined, key: string) => Promise<string | null>;
  };
};

export function registerSalesRoutes(app: import("express").Express, deps: SalesRouteDeps) {
  const { getSessionUserId } = deps;
  const limit = rateLimitMiddleware("sales:lead-suggestions", (req) => getSessionUserId(req), 12, 60_000);
  const limitEnrich = rateLimitMiddleware("sales:lead-enrich", (req) => getSessionUserId(req), 20, 60_000);
  const limitOutreachDiscovery = rateLimitMiddleware(
    "sales:outreach-discovery-suggestions",
    (req) => getSessionUserId(req),
    10,
    60_000
  );
  const limitPlaybook = rateLimitMiddleware(
    "sales:marketing-playbook",
    (req) => getSessionUserId(req),
    18,
    60_000
  );
  const limitOutreachDraft = rateLimitMiddleware(
    "sales:outreach-draft",
    (req) => getSessionUserId(req),
    20,
    60_000
  );
  const limitOutreachContent = rateLimitMiddleware(
    "sales:outreach-content-ideas",
    (req) => getSessionUserId(req),
    12,
    60_000
  );

  // Auto-fill a lead from its website: fetch the site (SSRF-safe) and read its
  // company name + description from meta tags. Degrades to an empty result.
  app.post("/api/sales/lead-enrich", async (req, res) => {
    const userId = getSessionUserId(req);
    if (!userId) return res.status(401).json({ error: "Not authenticated" });
    if (!limitEnrich(req, res)) return;
    const url = String((req.body as { url?: string })?.url || "").trim();
    if (!url) return res.status(400).json({ error: "missing_url", message: "Enter a website to look up." });
    try {
      const meta = await fetchSiteMeta(url);
      return res.json({ ok: true, ...meta });
    } catch (e) {
      const code = e instanceof Error ? e.message : "enrich_failed";
      return res
        .status(422)
        .json({ error: code, message: "Couldn't read that website. Enter the details manually." });
    }
  });

  app.post("/api/sales/lead-suggestions", async (req, res) => {
    const userId = getSessionUserId(req);
    if (!userId) return res.status(401).json({ error: "Not authenticated" });
    if (!limit(req, res)) return;

    const body = (req.body ?? {}) as {
      business_profile_id?: string;
      businessName?: string;
      company?: string;
      website?: string;
      industry?: string;
      description?: string;
      location?: string;
      offering?: string;
      sampleCustomers?: unknown;
      existingLeadSegments?: unknown;
    };
    const ctx: LeadSuggestionContext = {
      businessName: String(body.businessName || body.company || "").slice(0, 200),
      company: String(body.company || "").slice(0, 200),
      website: String(body.website || "").slice(0, 300),
      industry: String(body.industry || "").slice(0, 200),
      description: String(body.description || "").slice(0, 1000),
      location: String(body.location || "").slice(0, 200),
      offering: String(body.offering || "").slice(0, 500),
      sampleCustomers: Array.isArray(body.sampleCustomers)
        ? body.sampleCustomers.map((c) => String(c)).filter(Boolean).slice(0, 10)
        : undefined,
      existingLeadSegments: Array.isArray(body.existingLeadSegments)
        ? body.existingLeadSegments.map((c) => String(c)).filter(Boolean).slice(0, 15)
        : undefined,
    };

    const openaiKey = String(
      (deps.secretResolver
        ? await deps.secretResolver.resolve(readRequestBodyBusinessProfileId(req), "OPENAI_API_KEY")
        : process.env.OPENAI_API_KEY) || "",
    ).trim();

    if (!openaiKey) {
      return res.json({ suggestions: heuristicLeadSuggestions(ctx), source: "heuristic" });
    }

    try {
      const aiRes = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${openaiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [{ role: "user", content: buildLeadSuggestionPrompt(ctx) }],
          temperature: 0.5,
          max_tokens: 700,
          response_format: { type: "json_object" },
        }),
        signal: AbortSignal.timeout(20_000),
      });
      if (!aiRes.ok) {
        const detail = (await aiRes.text().catch(() => "")).slice(0, 300);
        console.warn("[sales/lead-suggestions] OpenAI request failed:", aiRes.status, detail);
        return res.json({ suggestions: heuristicLeadSuggestions(ctx), source: "heuristic" });
      }
      const aiData = await aiRes.json().catch(() => ({}));
      const content = aiData?.choices?.[0]?.message?.content ?? "{}";
      const suggestions = parseLeadSuggestions(content);
      if (suggestions.length === 0) {
        return res.json({ suggestions: heuristicLeadSuggestions(ctx), source: "heuristic" });
      }
      return res.json({ suggestions, source: "ai" });
    } catch (error) {
      console.warn("[sales/lead-suggestions] Falling back to heuristic suggestions:", error instanceof Error ? error.message : error);
      return res.json({ suggestions: heuristicLeadSuggestions(ctx), source: "heuristic" });
    }
  });

  app.post("/api/sales/outreach-discovery-suggestions", async (req, res) => {
    const userId = getSessionUserId(req);
    if (!userId) return res.status(401).json({ error: "Not authenticated" });
    if (!limitOutreachDiscovery(req, res)) return;

    const body = (req.body ?? {}) as {
      business_profile_id?: string;
      mode?: string;
      businessName?: string;
      company?: string;
      website?: string;
      email?: string;
      location?: string;
      notes?: string;
      industry?: string;
    };

    const mode: BrandDiscoveryMode = body.mode === "emails" ? "emails" : "websites";
    const ctx: BrandDiscoveryContext = {
      businessName: String(body.businessName || "").slice(0, 200),
      company: String(body.company || "").slice(0, 200),
      website: String(body.website || "").slice(0, 500),
      email: String(body.email || "").slice(0, 200),
      location: String(body.location || "").slice(0, 200),
      notes: String(body.notes || "").slice(0, 1000),
      industry: String(body.industry || "").slice(0, 200),
    };

    const openaiKey = String(
      (deps.secretResolver
        ? await deps.secretResolver.resolve(readRequestBodyBusinessProfileId(req), "OPENAI_API_KEY")
        : process.env.OPENAI_API_KEY) || ""
    ).trim();

    if (!openaiKey) {
      return res.json({
        suggestions: heuristicBrandDiscoverySuggestions(ctx, mode),
        source: "heuristic",
        mode,
      });
    }

    try {
      const aiRes = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${openaiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [{ role: "user", content: buildBrandDiscoveryPrompt(ctx, mode) }],
          temperature: 0.55,
          max_tokens: 2200,
          response_format: { type: "json_object" },
        }),
        signal: AbortSignal.timeout(25_000),
      });

      if (!aiRes.ok) {
        const detail = (await aiRes.text().catch(() => "")).slice(0, 300);
        console.warn("[sales/outreach-discovery-suggestions] OpenAI failed:", aiRes.status, detail);
        return res.json({
          suggestions: heuristicBrandDiscoverySuggestions(ctx, mode),
          source: "heuristic",
          mode,
        });
      }

      const aiData = await aiRes.json().catch(() => ({}));
      const content = aiData?.choices?.[0]?.message?.content ?? "{}";
      const suggestions = parseBrandDiscoverySuggestions(content, mode);
      if (suggestions.length === 0) {
        return res.json({
          suggestions: heuristicBrandDiscoverySuggestions(ctx, mode),
          source: "heuristic",
          mode,
        });
      }

      return res.json({ suggestions, source: "ai", mode });
    } catch (error) {
      console.warn(
        "[sales/outreach-discovery-suggestions] Falling back to heuristic:",
        error instanceof Error ? error.message : error
      );
      return res.json({
        suggestions: heuristicBrandDiscoverySuggestions(ctx, mode),
        source: "heuristic",
        mode,
      });
    }
  });

  app.post("/api/sales/marketing-playbook", async (req, res) => {
    const userId = getSessionUserId(req);
    if (!userId) return res.status(401).json({ error: "Not authenticated" });
    if (!limitPlaybook(req, res)) return;

    const body = (req.body ?? {}) as {
      business_profile_id?: string;
      mode?: string;
      businessName?: string;
      company?: string;
      website?: string;
      email?: string;
      location?: string;
      notes?: string;
      industry?: string;
    };

    const mode = normalizePlaybookMode(body.mode);
    const ctx: SalesPlaybookContext = {
      businessName: String(body.businessName || "").slice(0, 200),
      company: String(body.company || "").slice(0, 200),
      website: String(body.website || "").slice(0, 500),
      email: String(body.email || "").slice(0, 200),
      location: String(body.location || "").slice(0, 200),
      notes: String(body.notes || "").slice(0, 1000),
      industry: String(body.industry || "").slice(0, 200),
    };

    const openaiKey = String(
      (deps.secretResolver
        ? await deps.secretResolver.resolve(readRequestBodyBusinessProfileId(req), "OPENAI_API_KEY")
        : process.env.OPENAI_API_KEY) || ""
    ).trim();

    if (!openaiKey) {
      return res.json({
        items: heuristicSalesPlaybookItems(ctx, mode),
        source: "heuristic",
        mode,
      });
    }

    try {
      const aiRes = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${openaiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [{ role: "user", content: buildSalesPlaybookPrompt(ctx, mode) }],
          temperature: 0.55,
          max_tokens: 2200,
          response_format: { type: "json_object" },
        }),
        signal: AbortSignal.timeout(25_000),
      });

      if (!aiRes.ok) {
        const detail = (await aiRes.text().catch(() => "")).slice(0, 300);
        console.warn("[sales/marketing-playbook] OpenAI failed:", aiRes.status, detail);
        return res.json({
          items: heuristicSalesPlaybookItems(ctx, mode),
          source: "heuristic",
          mode,
        });
      }

      const aiData = await aiRes.json().catch(() => ({}));
      const content = aiData?.choices?.[0]?.message?.content ?? "{}";
      const items = parseSalesPlaybookItems(content);
      if (items.length === 0) {
        return res.json({
          items: heuristicSalesPlaybookItems(ctx, mode),
          source: "heuristic",
          mode,
        });
      }

      return res.json({ items, source: "ai", mode });
    } catch (error) {
      console.warn(
        "[sales/marketing-playbook] Falling back to heuristic:",
        error instanceof Error ? error.message : error
      );
      return res.json({
        items: heuristicSalesPlaybookItems(ctx, mode),
        source: "heuristic",
        mode,
      });
    }
  });

  app.post("/api/sales/outreach-draft", async (req, res) => {
    const userId = getSessionUserId(req);
    if (!userId) return res.status(401).json({ error: "Not authenticated" });
    if (!limitOutreachDraft(req, res)) return;

    const body = (req.body ?? {}) as OutreachDraftContext & {
      business_profile_id?: string;
      channel?: string;
    };
    const channel = normalizeOutreachChannel(body.channel);
    const ctx: OutreachDraftContext = {
      businessName: String(body.businessName || "").slice(0, 200),
      company: String(body.company || "").slice(0, 200),
      website: String(body.website || "").slice(0, 500),
      email: String(body.email || "").slice(0, 200),
      location: String(body.location || "").slice(0, 200),
      notes: String(body.notes || "").slice(0, 1000),
      offering: String(body.offering || "").slice(0, 500),
      industry: String(body.industry || "").slice(0, 200),
      prospectCompany: String(body.prospectCompany || "").slice(0, 200),
      prospectContact: String(body.prospectContact || "").slice(0, 200),
      prospectEmail: String(body.prospectEmail || "").slice(0, 200),
      prospectWebsite: String(body.prospectWebsite || "").slice(0, 500),
      prospectNotes: String(body.prospectNotes || "").slice(0, 1000),
      prospectReason: String(body.prospectReason || "").slice(0, 500),
    };

    const openaiKey = String(
      (deps.secretResolver
        ? await deps.secretResolver.resolve(readRequestBodyBusinessProfileId(req), "OPENAI_API_KEY")
        : process.env.OPENAI_API_KEY) || ""
    ).trim();

    if (!openaiKey) {
      return res.json({ draft: heuristicOutreachDraft(ctx, channel), source: "heuristic", channel });
    }

    try {
      const aiRes = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${openaiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [{ role: "user", content: buildOutreachDraftPrompt(ctx, channel) }],
          temperature: 0.6,
          max_tokens: 1400,
          response_format: { type: "json_object" },
        }),
        signal: AbortSignal.timeout(25_000),
      });

      if (!aiRes.ok) {
        const detail = (await aiRes.text().catch(() => "")).slice(0, 300);
        console.warn("[sales/outreach-draft] OpenAI failed:", aiRes.status, detail);
        return res.json({ draft: heuristicOutreachDraft(ctx, channel), source: "heuristic", channel });
      }

      const aiData = await aiRes.json().catch(() => ({}));
      const content = aiData?.choices?.[0]?.message?.content ?? "{}";
      const draft = parseOutreachDraft(content);
      if (!draft) {
        return res.json({ draft: heuristicOutreachDraft(ctx, channel), source: "heuristic", channel });
      }

      return res.json({ draft, source: "ai", channel });
    } catch (error) {
      console.warn(
        "[sales/outreach-draft] Falling back to heuristic:",
        error instanceof Error ? error.message : error
      );
      return res.json({ draft: heuristicOutreachDraft(ctx, channel), source: "heuristic", channel });
    }
  });

  app.post("/api/sales/outreach-content-ideas", async (req, res) => {
    const userId = getSessionUserId(req);
    if (!userId) return res.status(401).json({ error: "Not authenticated" });
    if (!limitOutreachContent(req, res)) return;

    const body = (req.body ?? {}) as OutreachContentContext & { business_profile_id?: string };
    const ctx: OutreachContentContext = {
      businessName: String(body.businessName || "").slice(0, 200),
      company: String(body.company || "").slice(0, 200),
      description: String(body.description || body.notes || "").slice(0, 1000),
      offering: String(body.offering || "").slice(0, 500),
      location: String(body.location || "").slice(0, 200),
      industry: String(body.industry || "").slice(0, 200),
      targetAudience: String(body.targetAudience || "").slice(0, 200),
      idealCustomer: String(body.idealCustomer || "").slice(0, 300),
    };

    const openaiKey = String(
      (deps.secretResolver
        ? await deps.secretResolver.resolve(readRequestBodyBusinessProfileId(req), "OPENAI_API_KEY")
        : process.env.OPENAI_API_KEY) || ""
    ).trim();

    if (!openaiKey) {
      return res.json({ ideas: heuristicOutreachContentIdeas(ctx), source: "heuristic" });
    }

    try {
      const aiRes = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${openaiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [{ role: "user", content: buildOutreachContentPrompt(ctx) }],
          temperature: 0.65,
          max_tokens: 1200,
          response_format: { type: "json_object" },
        }),
        signal: AbortSignal.timeout(22_000),
      });

      if (!aiRes.ok) {
        const detail = (await aiRes.text().catch(() => "")).slice(0, 300);
        console.warn("[sales/outreach-content-ideas] OpenAI failed:", aiRes.status, detail);
        return res.json({ ideas: heuristicOutreachContentIdeas(ctx), source: "heuristic" });
      }

      const aiData = await aiRes.json().catch(() => ({}));
      const content = aiData?.choices?.[0]?.message?.content ?? "{}";
      const ideas = parseOutreachContentIdeas(content);
      if (ideas.length === 0) {
        return res.json({ ideas: heuristicOutreachContentIdeas(ctx), source: "heuristic" });
      }

      return res.json({ ideas, source: "ai" });
    } catch (error) {
      console.warn(
        "[sales/outreach-content-ideas] Falling back to heuristic:",
        error instanceof Error ? error.message : error
      );
      return res.json({ ideas: heuristicOutreachContentIdeas(ctx), source: "heuristic" });
    }
  });
}
