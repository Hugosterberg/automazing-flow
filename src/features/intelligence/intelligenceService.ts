import { apiUrl } from "@/lib/apiBase";
import { fetchWithTimeout } from "@/lib/fetchWithTimeout";
import { apiJson } from "@/lib/apiJson";
import type { McpQueryResponse } from "./toolPlanTypes";

export type { McpQueryResponse, AiToolPlan, ToolPlanPlatform } from "./toolPlanTypes";
export { ToolPlanHint } from "./ToolPlanHint";

export type McpProviderStatus =
  | "not_connected"
  | "missing_credential"
  | "auth_expired"
  | "ready"
  | "error";

export interface McpProviderReadiness {
  platform: string;
  label: string;
  auth: "oauth" | "api_key" | "shop_domain" | "keyless";
  keyOptional: boolean;
  credentialHint: string;
  usedBy: string[];
  status: McpProviderStatus;
  message?: string;
  accountId?: string;
  username?: string;
  toolCount?: number;
}

export interface McpProvidersResponse {
  providers: McpProviderReadiness[];
  fetchedAt: string;
}

export async function fetchMcpProvidersStatus(
  businessProfileId: string | null,
  options?: { probe?: boolean; platform?: string }
): Promise<McpProvidersResponse> {
  const params = new URLSearchParams();
  if (businessProfileId) params.set("business_profile_id", businessProfileId);
  if (options?.probe) params.set("probe", "1");
  if (options?.platform) params.set("platform", options.platform);
  return apiJson<McpProvidersResponse>(
    `/api/intelligence/providers?${params}`,
    "Kunde inte ladda status för MCP-leverantörer."
  );
}

export interface MarketPulse {
  available: boolean;
  reason?: "not_connected" | "missing_credential" | "auth_expired" | "provider_error" | "no_matching_tool";
  message?: string;
  topic?: string;
  tool?: string;
  text?: string;
  fetchedAt?: string;
  source?: "live" | "snapshot";
}

export async function fetchMarketPulse(
  businessProfileId: string | null,
  topic = "bitcoin",
  options?: { live?: boolean }
): Promise<MarketPulse> {
  const params = new URLSearchParams({ topic });
  if (businessProfileId) params.set("business_profile_id", businessProfileId);
  if (options?.live) params.set("live", "1");
  const res = await fetchWithTimeout(apiUrl(`/api/intelligence/pulse?${params}`), {
    credentials: "include",
  });
  if (!res.ok) {
    return { available: false, reason: "provider_error" };
  }
  return (await res.json()) as MarketPulse;
}

export interface LeadResearchResult extends McpQueryResponse {
  fetchedAt: string;
}

export async function researchLead(options: {
  businessProfileId: string | null;
  name?: string;
  company?: string;
  website?: string;
}): Promise<LeadResearchResult> {
  return apiJson<LeadResearchResult>("/api/intelligence/lead-research", "Lead research failed.", {
    body: {
      business_profile_id: options.businessProfileId || undefined,
      name: options.name,
      company: options.company,
      website: options.website,
    },
    timeoutMs: 60_000,
  });
}

export async function searchDocs(options: {
  businessProfileId: string | null;
  query: string;
}): Promise<McpTextResult> {
  return apiJson<McpTextResult>(
    "/api/intelligence/doc-search",
    "Doc search failed.",
    {
      body: {
        business_profile_id: options.businessProfileId || undefined,
        query: options.query,
      },
      timeoutMs: 60_000,
    }
  );
}

export type McpTextResult = McpQueryResponse;

async function postIntelligenceQuery(
  path: string,
  businessProfileId: string | null,
  body: Record<string, unknown>,
  failLabel: string
): Promise<McpTextResult> {
  return apiJson<McpTextResult>(path, failLabel, {
    body: { business_profile_id: businessProfileId || undefined, ...body },
    timeoutMs: 60_000,
  });
}

export async function fetchSeoOverview(options: {
  businessProfileId: string | null;
  target: string;
}): Promise<McpTextResult> {
  const params = new URLSearchParams({ target: options.target });
  if (options.businessProfileId) params.set("business_profile_id", options.businessProfileId);
  return apiJson<McpTextResult>(`/api/intelligence/seo-overview?${params}`, "SEO overview failed.");
}

export async function runMarketingQuery(options: {
  businessProfileId: string | null;
  query: string;
}): Promise<McpTextResult> {
  return postIntelligenceQuery(
    "/api/intelligence/marketing-query",
    options.businessProfileId,
    { query: options.query },
    "Marketing query failed."
  );
}

export async function runCompetitiveResearch(options: {
  businessProfileId: string | null;
  query: string;
}): Promise<McpTextResult> {
  return postIntelligenceQuery(
    "/api/intelligence/competitive-research",
    options.businessProfileId,
    { query: options.query },
    "Competitive research failed."
  );
}

export async function searchMail(options: {
  businessProfileId: string | null;
  query: string;
}): Promise<McpTextResult> {
  return postIntelligenceQuery(
    "/api/intelligence/mail-search",
    options.businessProfileId,
    { query: options.query },
    "Mail search failed."
  );
}

export async function lookupDomain(options: {
  businessProfileId: string | null;
  domain: string;
}): Promise<McpTextResult> {
  return postIntelligenceQuery(
    "/api/intelligence/domain-lookup",
    options.businessProfileId,
    { domain: options.domain },
    "Domain lookup failed."
  );
}

export async function searchArchitectureDocs(options: {
  businessProfileId: string | null;
  query: string;
}): Promise<McpTextResult> {
  return postIntelligenceQuery(
    "/api/intelligence/architecture-docs",
    options.businessProfileId,
    { query: options.query },
    "Architecture doc search failed."
  );
}

export async function generateDeck(options: {
  businessProfileId: string | null;
  prompt: string;
}): Promise<McpTextResult> {
  return postIntelligenceQuery(
    "/api/intelligence/deck-generation",
    options.businessProfileId,
    { prompt: options.prompt },
    "Deck generation failed."
  );
}

export async function queryShopCatalog(options: {
  businessProfileId: string | null;
  query: string;
}): Promise<McpTextResult> {
  return postIntelligenceQuery(
    "/api/intelligence/shop-catalog",
    options.businessProfileId,
    { query: options.query },
    "Shop catalog query failed."
  );
}

export async function runCrmQuery(options: {
  businessProfileId: string | null;
  query: string;
}): Promise<McpTextResult> {
  return postIntelligenceQuery(
    "/api/intelligence/crm-query",
    options.businessProfileId,
    { query: options.query },
    "CRM query failed."
  );
}

export async function runContextQuery(options: {
  businessProfileId: string | null;
  query: string;
}): Promise<McpTextResult> {
  return postIntelligenceQuery(
    "/api/intelligence/context-query",
    options.businessProfileId,
    { query: options.query },
    "Context query failed."
  );
}

export async function runDesignAssist(options: {
  businessProfileId: string | null;
  prompt: string;
}): Promise<McpTextResult> {
  return postIntelligenceQuery(
    "/api/intelligence/design-assist",
    options.businessProfileId,
    { prompt: options.prompt },
    "Design assist failed."
  );
}

export interface McpSourceAssessment {
  sourceId: string;
  platform: string;
  providerLabel: string;
  lens: string;
  status: "success" | "skipped" | "error";
  skipReason?: "not_connected" | "missing_credential" | "auth_expired" | "forbidden" | "unknown_platform";
  message?: string;
  tool?: string;
  query?: string;
  text?: string;
}

export interface MultiSourceAssessmentResponse {
  subject: string;
  kind: "domain" | "company";
  sources: McpSourceAssessment[];
  summary: { total: number; success: number; skipped: number; error: number };
  fetchedAt: string;
}

export async function fetchMultiSourceAssessment(options: {
  businessProfileId: string | null;
  subject: string;
}): Promise<MultiSourceAssessmentResponse> {
  return apiJson<MultiSourceAssessmentResponse>(
    "/api/intelligence/multi-source-assessment",
    "Multi-source comparison failed.",
    {
      body: {
        business_profile_id: options.businessProfileId || undefined,
        subject: options.subject,
      },
      timeoutMs: 120_000,
    }
  );
}
