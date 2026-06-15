import { apiUrl } from "@/lib/apiBase";
import { fetchWithTimeout } from "@/lib/fetchWithTimeout";
import { apiErrorMessage } from "@/lib/apiError";

export interface LeadSuggestion {
  target: string;
  why: string;
  how: string;
}

export interface LeadSuggestionInput {
  business_profile_id?: string | null;
  businessName?: string;
  description?: string;
  location?: string;
  sampleCustomers?: string[];
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
  if (!res.ok) throw new Error(apiErrorMessage(body, "Couldn't load suggestions."));
  return {
    suggestions: Array.isArray(body.suggestions) ? (body.suggestions as LeadSuggestion[]) : [],
    source: String(body.source || ""),
  };
}
