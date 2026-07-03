import { MCP_FEATURE_DEFINITIONS, type McpFeatureDefinition } from "./mcpFeatureConfig";

/** Lookup feature definitions by id (for page-level widget strips). */
export function mcpFeaturesByIds(ids: string[]): McpFeatureDefinition[] {
  const map = new Map(MCP_FEATURE_DEFINITIONS.map((f) => [f.id, f]));
  return ids.map((id) => map.get(id)).filter(Boolean) as McpFeatureDefinition[];
}

/** Which intelligence features to surface on each product page. */
export const MCP_PAGE_FEATURE_IDS: Record<string, string[]> = {
  sales: ["lead-research", "competitive-research"],
  marketing: ["seo-overview", "marketing-query", "competitive-research"],
  "digital-brand": ["seo-overview", "domain-lookup"],
  content: ["deck-generation", "design-assist"],
  ecommerce: ["shop-catalog"],
  customers: ["crm-query"],
  messages: ["mail-search"],
  automations: ["doc-search", "context-query", "architecture-docs"],
  "ai-recommendations": ["context-query"],
  home: ["market-pulse"],
  company: ["domain-lookup", "seo-overview", "competitive-research"],
  social: ["design-assist"],
};
