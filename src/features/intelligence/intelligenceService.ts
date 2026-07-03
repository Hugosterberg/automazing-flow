import { apiUrl } from "@/lib/apiBase";
import { fetchWithTimeout } from "@/lib/fetchWithTimeout";
import { apiErrorMessage } from "@/lib/apiError";

/**
 * Client for /api/intelligence/* — features built on the tenant's connected
 * MCP servers (LunarCrush market pulse, Exa/Sprouts lead research).
 */

export interface MarketPulse {
  available: boolean;
  reason?: "not_connected" | "provider_error" | "no_matching_tool";
  topic?: string;
  tool?: string;
  text?: string;
  fetchedAt?: string;
}

export async function fetchMarketPulse(
  businessProfileId: string | null,
  topic = "bitcoin"
): Promise<MarketPulse> {
  const params = new URLSearchParams({ topic });
  if (businessProfileId) params.set("business_profile_id", businessProfileId);
  const res = await fetchWithTimeout(apiUrl(`/api/intelligence/pulse?${params}`), {
    credentials: "include",
  });
  if (!res.ok) {
    // The endpoint is quiet by design; a non-OK here means auth/transport —
    // treat as unavailable rather than surfacing an error on the dashboard.
    return { available: false, reason: "provider_error" };
  }
  return (await res.json()) as MarketPulse;
}

export interface LeadResearchResult {
  provider: string;
  tool: string;
  query: string;
  text: string;
  fetchedAt: string;
}

export async function researchLead(options: {
  businessProfileId: string | null;
  name?: string;
  company?: string;
  website?: string;
}): Promise<LeadResearchResult> {
  const res = await fetchWithTimeout(
    apiUrl("/api/intelligence/lead-research"),
    {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        business_profile_id: options.businessProfileId || undefined,
        name: options.name,
        company: options.company,
        website: options.website,
      }),
    },
    // Research fans out to an external MCP provider — allow a slow upstream.
    60_000
  );
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(apiErrorMessage(payload, "Lead research failed."));
  }
  return payload as LeadResearchResult;
}
