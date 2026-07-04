import { apiUrl } from "@/lib/apiBase";
import { fetchWithTimeout } from "@/lib/fetchWithTimeout";
import { apiErrorMessage } from "@/lib/apiError";

export type BrandDiscoveryMode = "websites" | "emails";

export interface BrandDiscoverySuggestion {
  value: string;
  kind: "website" | "email";
  label: string;
  reason: string;
  category: string;
}

export interface BrandDiscoveryInput {
  business_profile_id?: string | null;
  mode?: BrandDiscoveryMode;
  businessName?: string;
  company?: string;
  website?: string;
  email?: string;
  location?: string;
  notes?: string;
  industry?: string;
}

export async function fetchBrandDiscoverySuggestions(
  input: BrandDiscoveryInput
): Promise<{ suggestions: BrandDiscoverySuggestion[]; source: string; mode: BrandDiscoveryMode }> {
  const res = await fetchWithTimeout(
    apiUrl("/api/sales/outreach-discovery-suggestions"),
    {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    },
    35_000
  );
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(apiErrorMessage(body, "Couldn't load brand suggestions."));
  return {
    suggestions: Array.isArray(body.suggestions) ? (body.suggestions as BrandDiscoverySuggestion[]) : [],
    source: String(body.source || ""),
    mode: body.mode === "emails" ? "emails" : "websites",
  };
}
