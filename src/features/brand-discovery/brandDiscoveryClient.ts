import { apiJson } from "@/lib/apiJson";

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
  const body = await apiJson<{ suggestions?: unknown; source?: unknown; mode?: unknown }>(
    "/api/sales/outreach-discovery-suggestions",
    "Kunde inte ladda varumärkesförslag.",
    { body: input, timeoutMs: 35_000 }
  );
  return {
    suggestions: Array.isArray(body.suggestions) ? (body.suggestions as BrandDiscoverySuggestion[]) : [],
    source: String(body.source || ""),
    mode: body.mode === "emails" ? "emails" : "websites",
  };
}
