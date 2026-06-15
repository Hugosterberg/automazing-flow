/**
 * POST /api/sales/lead-suggestions — AI outreach-target suggestions for the
 * Sales page. Uses the tenant's OpenAI key when available, otherwise returns a
 * heuristic fallback so the feature always responds. Rate-limited per user
 * since it calls a paid API.
 */

import { rateLimitMiddleware } from "../lib/rateLimit.ts";
import {
  buildLeadSuggestionPrompt,
  heuristicLeadSuggestions,
  parseLeadSuggestions,
  type LeadSuggestionContext,
} from "../ai/leadSuggestions.ts";

type SalesRouteDeps = {
  getSessionUserId: (req: { headers?: { cookie?: string } }) => string | null;
  secretResolver?: {
    resolve: (businessProfileId: string | null | undefined, key: string) => Promise<string | null>;
  };
};

export function registerSalesRoutes(app: import("express").Express, deps: SalesRouteDeps) {
  const { getSessionUserId } = deps;
  const limit = rateLimitMiddleware("sales:lead-suggestions", (req) => getSessionUserId(req), 12, 60_000);

  app.post("/api/sales/lead-suggestions", async (req, res) => {
    const userId = getSessionUserId(req);
    if (!userId) return res.status(401).json({ error: "Not authenticated" });
    if (!limit(req, res)) return;

    const body = (req.body ?? {}) as {
      business_profile_id?: string;
      businessName?: string;
      industry?: string;
      description?: string;
      location?: string;
      offering?: string;
      sampleCustomers?: unknown;
    };
    const ctx: LeadSuggestionContext = {
      businessName: String(body.businessName || "").slice(0, 200),
      industry: String(body.industry || "").slice(0, 200),
      description: String(body.description || "").slice(0, 1000),
      location: String(body.location || "").slice(0, 200),
      offering: String(body.offering || "").slice(0, 500),
      sampleCustomers: Array.isArray(body.sampleCustomers)
        ? body.sampleCustomers.map((c) => String(c)).filter(Boolean).slice(0, 10)
        : undefined,
    };

    const openaiKey = String(
      (deps.secretResolver
        ? await deps.secretResolver.resolve(body.business_profile_id || null, "OPENAI_API_KEY")
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
        return res.json({ suggestions: heuristicLeadSuggestions(ctx), source: "heuristic" });
      }
      const aiData = await aiRes.json().catch(() => ({}));
      const content = aiData?.choices?.[0]?.message?.content ?? "{}";
      const suggestions = parseLeadSuggestions(content);
      if (suggestions.length === 0) {
        return res.json({ suggestions: heuristicLeadSuggestions(ctx), source: "heuristic" });
      }
      return res.json({ suggestions, source: "ai" });
    } catch {
      return res.json({ suggestions: heuristicLeadSuggestions(ctx), source: "heuristic" });
    }
  });
}
