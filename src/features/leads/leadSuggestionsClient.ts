import { apiJson } from "@/lib/apiJson";
import type { CompanyEnrichment } from "@/features/business-profiles/companyEnrichmentClient";

export interface LeadSuggestion {
  target: string;
  why: string;
  how: string;
}

export interface LeadSuggestionInput {
  business_profile_id?: string | null;
  businessName?: string;
  company?: string;
  website?: string;
  industry?: string;
  description?: string;
  location?: string;
  offering?: string;
  sampleCustomers?: string[];
  existingLeadSegments?: string[];
}

export interface LeadEnrichment extends CompanyEnrichment {
  url?: string;
}

/** Look up company data from website, org number, or name. */
export async function enrichLead(input: {
  url?: string;
  orgNumber?: string;
  company?: string;
  business_profile_id?: string | null;
}): Promise<LeadEnrichment> {
  return apiJson<LeadEnrichment>("/api/sales/lead-enrich", "Kunde inte hämta företagsdata.", {
    body: input,
    timeoutMs: 45_000,
  });
}

/** @deprecated Use enrichLead — kept for callers that only pass a URL. */
export async function enrichLeadFromWebsite(url: string): Promise<LeadEnrichment> {
  const data = await enrichLead({ url });
  return { ...data, url: data.website || data.url || url };
}

export async function fetchLeadSuggestions(
  input: LeadSuggestionInput,
): Promise<{ suggestions: LeadSuggestion[]; source: string }> {
  const body = await apiJson<{ suggestions?: unknown; source?: unknown }>(
    "/api/sales/lead-suggestions",
    "Kunde inte hämta förslag.",
    { body: input, timeoutMs: 30_000 },
  );
  return {
    suggestions: Array.isArray(body.suggestions) ? (body.suggestions as LeadSuggestion[]) : [],
    source: String(body.source || ""),
  };
}
