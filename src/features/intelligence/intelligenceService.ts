import { apiUrl } from "@/lib/apiBase";
import { fetchWithTimeout } from "@/lib/fetchWithTimeout";
import { apiErrorMessage } from "@/lib/apiError";

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
  options?: { probe?: boolean }
): Promise<McpProvidersResponse> {
  const params = new URLSearchParams();
  if (businessProfileId) params.set("business_profile_id", businessProfileId);
  if (options?.probe) params.set("probe", "1");
  const res = await fetchWithTimeout(apiUrl(`/api/intelligence/providers?${params}`), {
    credentials: "include",
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(apiErrorMessage(payload, "Could not load MCP provider status."));
  }
  return payload as McpProvidersResponse;
}

export interface MarketPulse {
  available: boolean;
  reason?: "not_connected" | "missing_credential" | "auth_expired" | "provider_error" | "no_matching_tool";
  message?: string;
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
    60_000
  );
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(apiErrorMessage(payload, "Lead research failed."));
  }
  return payload as LeadResearchResult;
}

export async function searchDocs(options: {
  businessProfileId: string | null;
  query: string;
}): Promise<{ provider: string; tool: string; query: string; text: string }> {
  const res = await fetchWithTimeout(
    apiUrl("/api/intelligence/doc-search"),
    {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        business_profile_id: options.businessProfileId || undefined,
        query: options.query,
      }),
    },
    60_000
  );
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(apiErrorMessage(payload, "Doc search failed."));
  }
  return payload as { provider: string; tool: string; query: string; text: string };
}

export interface McpTextResult {
  provider: string;
  tool: string;
  query: string;
  text: string;
  fetchedAt?: string;
}

async function postIntelligenceQuery(
  path: string,
  businessProfileId: string | null,
  body: Record<string, unknown>,
  failLabel: string
): Promise<McpTextResult> {
  const res = await fetchWithTimeout(
    apiUrl(path),
    {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        business_profile_id: businessProfileId || undefined,
        ...body,
      }),
    },
    60_000
  );
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(apiErrorMessage(payload, failLabel));
  }
  return payload as McpTextResult;
}

export async function fetchSeoOverview(options: {
  businessProfileId: string | null;
  target: string;
}): Promise<McpTextResult> {
  const params = new URLSearchParams({ target: options.target });
  if (options.businessProfileId) params.set("business_profile_id", options.businessProfileId);
  const res = await fetchWithTimeout(apiUrl(`/api/intelligence/seo-overview?${params}`), {
    credentials: "include",
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(apiErrorMessage(payload, "SEO overview failed."));
  }
  return payload as McpTextResult;
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
