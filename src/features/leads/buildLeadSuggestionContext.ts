import type { BusinessProfile } from "@/types/businessProfile";
import { leadSuggestionProfileReadiness } from "@/features/business-profiles/businessProfileCompleteness";
import type { LeadSuggestionInput } from "./leadSuggestionsClient";
import type { Lead } from "./leadsService";
import { isLeadOpen } from "./leadHelpers";

export { leadSuggestionProfileReadiness };

const INDUSTRY_HINTS: Array<{ keywords: RegExp; label: string }> = [
  { keywords: /\b(saas|software|app|platform|tech)\b/i, label: "Software / SaaS" },
  { keywords: /\b(agency|marketing|byrå|digital)\b/i, label: "Marketing agency" },
  { keywords: /\b(restaurant|café|cafe|food|hotel|hospitality)\b/i, label: "Hospitality" },
  { keywords: /\b(gym|fitness|wellness|health)\b/i, label: "Health & wellness" },
  { keywords: /\b(retail|shop|store|ecommerce|e-commerce)\b/i, label: "Retail / e-commerce" },
  { keywords: /\b(consult|consulting|rådgiv)\b/i, label: "Consulting" },
  { keywords: /\b(construction|bygg|entreprenad)\b/i, label: "Construction" },
  { keywords: /\b(design|studio|creative|brand)\b/i, label: "Creative / design" },
];

function inferIndustry(profile?: BusinessProfile | null): string | undefined {
  const hay = [profile?.notes, profile?.company, profile?.name, profile?.website].filter(Boolean).join(" ");
  if (!hay.trim()) return undefined;
  for (const hint of INDUSTRY_HINTS) {
    if (hint.keywords.test(hay)) return hint.label;
  }
  return undefined;
}

/** Build a rich lead-suggestion payload from the tenant's business profile and CRM data. */
export function buildLeadSuggestionContext(opts: {
  businessProfileId: string | null;
  profile?: BusinessProfile | null;
  leads?: Lead[];
  productNames?: string[];
}): LeadSuggestionInput {
  const { profile, leads = [], productNames = [] } = opts;

  const wonCustomers = [
    ...new Set(
      leads
        .filter((l) => l.status === "won")
        .map((l) => l.company.trim())
        .filter(Boolean)
    ),
  ].slice(0, 10);

  const existingLeadSegments = [
    ...new Set(
      leads
        .filter((l) => isLeadOpen(l.status) || l.source === "ai-suggestion")
        .map((l) => l.company.trim())
        .filter(Boolean)
    ),
  ].slice(0, 15);

  const productLine =
    productNames.length > 0 ? `Products/services: ${productNames.slice(0, 10).join(", ")}` : "";
  const notes = profile?.notes?.trim() || "";
  const offering = [notes, productLine].filter(Boolean).join(". ") || undefined;

  const displayName = profile?.company?.trim() || profile?.name?.trim();

  return {
    business_profile_id: opts.businessProfileId,
    businessName: displayName,
    company: profile?.company?.trim() || profile?.name?.trim(),
    website: profile?.website?.trim(),
    description: notes || undefined,
    location: profile?.location?.trim(),
    offering,
    industry: inferIndustry(profile),
    sampleCustomers: wonCustomers.length > 0 ? wonCustomers : undefined,
    existingLeadSegments: existingLeadSegments.length > 0 ? existingLeadSegments : undefined,
  };
}
