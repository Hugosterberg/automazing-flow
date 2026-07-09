import { apiUrl } from "@/lib/apiBase";
import { fetchWithTimeout } from "@/lib/fetchWithTimeout";
import { apiErrorMessage } from "@/lib/apiError";
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
  const res = await fetchWithTimeout(
    apiUrl("/api/sales/lead-enrich"),
    {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    },
    45_000
  );
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(apiErrorMessage(body, "Kunde inte hämta företagsdata."));
  return body as LeadEnrichment;
}

/** @deprecated Use enrichLead — kept for callers that only pass a URL. */
export async function enrichLeadFromWebsite(url: string): Promise<LeadEnrichment> {
  const data = await enrichLead({ url });
  return { ...data, url: data.website || data.url || url };
}

export async function fetchLeadSuggestions(
  input: LeadSuggestionInput,
): Promise<{ suggestions: LeadSuggestion[]; source: string }> {
  const res = await fetchWithTimeout(
    apiUrl("/api/sales/lead-suggestions"),
    {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    },
    30_000,
  );
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(apiErrorMessage(body, "Kunde inte hämta förslag."));
  return {
    suggestions: Array.isArray(body.suggestions) ? (body.suggestions as LeadSuggestion[]) : [],
    source: String(body.source || ""),
  };
}
