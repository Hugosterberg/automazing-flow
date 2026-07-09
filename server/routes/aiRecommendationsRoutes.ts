/**
 * /api/ai-recommendations/* — tenant-scoped producer endpoint.
 *
 * v1 exposes a single endpoint that (re)runs the heuristic producer for a
 * business profile. The endpoint is idempotent: repeated calls without
 * underlying data changes are no-ops. A future cron job can call the same
 * producer function server-side without going through HTTP.
 *
 * Routes:
 *   POST /api/ai-recommendations/generate   { business_profile_id }
 */

import { generateAiRecommendations } from "../ai/recommendations/producer.ts";
import type { SupabaseAdminLike as SupabaseLike } from "../lib/supabaseAdminLike.ts";

interface RegisterAiRecommendationsRoutesDeps {
  requireMembership: (req: unknown, res: unknown, next: () => void) => void;
  supabaseAdmin: SupabaseLike | null;
}

export function registerAiRecommendationsRoutes(
  app,
  { requireMembership, supabaseAdmin }: RegisterAiRecommendationsRoutesDeps
): void {
  app.post(
    "/api/ai-recommendations/generate",
    requireMembership,
    async (req, res) => {
      if (!supabaseAdmin) {
        return res
          .status(503)
          .json({ error: "supabase_service_role_not_configured" });
      }
      const businessProfileId = String(req.businessProfileId || "").trim();
      if (!businessProfileId) {
        return res.status(400).json({ error: "missing_business_profile_id" });
      }
      // Allow the caller to opt OUT of LLM even on the manual endpoint
      // (e.g. for cheap heuristic-only refreshes from admin tools).
      // Default is true because this is the manual "Generate" action where
      // users expect fresh content ideas.
      const bodyIncludeLlm =
        typeof req.body?.include_llm === "boolean"
          ? req.body.include_llm
          : true;

      try {
        const result = await generateAiRecommendations(supabaseAdmin, {
          businessProfileId,
          includeLlm: bodyIncludeLlm,
        });
        return res.json(result);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error("[ai-recommendations] generate failed:", message);
        return res.status(500).json({ error: "generate_failed", message });
      }
    }
  );
}
