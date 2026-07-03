/**
 * UI definitions for every MCP-backed intelligence feature.
 * One entry per user-facing query — fallback providers share the same input.
 */

import type { McpTextResult } from "./intelligenceService";
import {
  fetchMarketPulse,
  fetchSeoOverview,
  generateDeck,
  lookupDomain,
  queryShopCatalog,
  researchLead,
  runCompetitiveResearch,
  runContextQuery,
  runCrmQuery,
  runDesignAssist,
  runMarketingQuery,
  searchArchitectureDocs,
  searchDocs,
  searchMail,
} from "./intelligenceService";

export type McpHubTabId =
  | "overview"
  | "compare"
  | "research"
  | "marketing"
  | "content"
  | "commerce"
  | "crm-mail"
  | "developer";

export interface McpHubTab {
  id: McpHubTabId;
  label: string;
  description: string;
}

export interface McpFeatureDefinition {
  id: string;
  tab: Exclude<McpHubTabId, "overview">;
  platforms: string[];
  providerLabels: string;
  title: string;
  description: string;
  placeholder: string;
  buttonLabel: string;
  multiline?: boolean;
  run: (businessProfileId: string | null, input: string) => Promise<McpTextResult>;
}

export const MCP_HUB_TABS: McpHubTab[] = [
  { id: "overview", label: "Status", description: "Connection and credential readiness for all MCP providers." },
  {
    id: "compare",
    label: "Compare",
    description: "Run the same domain or company against every connected MCP lens and compare judgments side by side.",
  },
  { id: "research", label: "Research", description: "Market pulse, lead research, and competitive intelligence." },
  { id: "marketing", label: "Marketing", description: "SEO and marketing data queries." },
  { id: "content", label: "Content", description: "Decks and design assistance." },
  { id: "commerce", label: "Commerce", description: "Shopify storefront queries." },
  { id: "crm-mail", label: "CRM & Mail", description: "CRM assistant and mail search." },
  { id: "developer", label: "Developer", description: "Docs, domains, architecture, and context tools." },
];

export const MCP_FEATURE_DEFINITIONS: McpFeatureDefinition[] = [
  {
    id: "market-pulse",
    tab: "research",
    platforms: ["lunarcrush"],
    providerLabels: "LunarCrush",
    title: "Market pulse",
    description: "Crypto/social sentiment for a topic on your home dashboard.",
    placeholder: "e.g. bitcoin, ethereum, solana",
    buttonLabel: "Fetch pulse",
    run: async (businessProfileId, topic) => {
      const pulse = await fetchMarketPulse(businessProfileId, topic.toLowerCase());
      if (!pulse.available) {
        throw new Error(pulse.message || "Market pulse unavailable — connect LunarCrush with an API key.");
      }
      return {
        provider: "lunarcrush",
        tool: pulse.tool || "pulse",
        query: topic,
        text: pulse.text || "",
      };
    },
  },
  {
    id: "lead-research",
    tab: "research",
    platforms: ["exa", "sprouts"],
    providerLabels: "Exa or Sprouts",
    title: "Lead research",
    description: "Company overview from your connected research provider (Exa preferred, Sprouts fallback).",
    placeholder: "Company name, person, or website",
    buttonLabel: "Research",
    run: async (businessProfileId, input) => {
      const result = await researchLead({
        businessProfileId,
        company: input,
        website: input.includes(".") ? input : undefined,
      });
      return result;
    },
  },
  {
    id: "competitive-research",
    tab: "research",
    platforms: ["peec"],
    providerLabels: "Peec AI",
    title: "Competitive research",
    description: "Competitor and market positioning research.",
    placeholder: "e.g. Acme Corp vs our positioning",
    buttonLabel: "Research",
    run: (businessProfileId, query) => runCompetitiveResearch({ businessProfileId, query }),
  },
  {
    id: "seo-overview",
    tab: "marketing",
    platforms: ["ahrefs"],
    providerLabels: "Ahrefs",
    title: "SEO overview",
    description: "Domain or URL overview via Ahrefs OAuth MCP.",
    placeholder: "e.g. automazing.life",
    buttonLabel: "Analyze",
    run: async (businessProfileId, target) => {
      const result = await fetchSeoOverview({ businessProfileId, target });
      return { ...result, query: target };
    },
  },
  {
    id: "marketing-query",
    tab: "marketing",
    platforms: ["supermetrics_mcp", "windsor"],
    providerLabels: "Supermetrics or Windsor",
    title: "Marketing data",
    description: "Ask for campaign or channel metrics (Supermetrics preferred, Windsor fallback).",
    placeholder: "e.g. Meta ad spend last 7 days",
    buttonLabel: "Query",
    run: (businessProfileId, query) => runMarketingQuery({ businessProfileId, query }),
  },
  {
    id: "deck-generation",
    tab: "content",
    platforms: ["gamma"],
    providerLabels: "Gamma",
    title: "Deck generation",
    description: "Generate a presentation outline or deck from a prompt.",
    placeholder: "e.g. Q3 marketing results for stakeholders",
    buttonLabel: "Generate",
    multiline: true,
    run: (businessProfileId, prompt) => generateDeck({ businessProfileId, prompt }),
  },
  {
    id: "design-assist",
    tab: "content",
    platforms: ["canva_mcp"],
    providerLabels: "Canva MCP",
    title: "Design assist",
    description: "Design briefs and creative direction via Canva OAuth MCP.",
    placeholder: "e.g. Instagram carousel for product launch",
    buttonLabel: "Assist",
    multiline: true,
    run: (businessProfileId, prompt) => runDesignAssist({ businessProfileId, prompt }),
  },
  {
    id: "shop-catalog",
    tab: "commerce",
    platforms: ["shopify_mcp"],
    providerLabels: "Shopify MCP",
    title: "Shop catalog",
    description: "Search products in your connected Shopify store (shop domain required at connect).",
    placeholder: "e.g. best sellers tagged summer",
    buttonLabel: "Search",
    run: (businessProfileId, query) => queryShopCatalog({ businessProfileId, query }),
  },
  {
    id: "crm-query",
    tab: "crm-mail",
    platforms: ["dayai"],
    providerLabels: "Day.ai",
    title: "CRM assistant",
    description: "Ask about customers, deals, and pipeline via Day.ai OAuth MCP.",
    placeholder: "e.g. open deals over 50k this quarter",
    buttonLabel: "Ask CRM",
    run: (businessProfileId, query) => runCrmQuery({ businessProfileId, query }),
  },
  {
    id: "mail-search",
    tab: "crm-mail",
    platforms: ["superhuman_mcp"],
    providerLabels: "Superhuman Mail MCP",
    title: "Mail search",
    description: "Search mail via Superhuman when OAuth is configured.",
    placeholder: "e.g. invoices from Acme last week",
    buttonLabel: "Search mail",
    run: (businessProfileId, query) => searchMail({ businessProfileId, query }),
  },
  {
    id: "doc-search",
    tab: "developer",
    platforms: ["twilio_mcp", "exa"],
    providerLabels: "Twilio Docs MCP or Exa",
    title: "Doc search",
    description: "Developer documentation search (Twilio keyless MCP preferred, Exa fallback).",
    placeholder: "e.g. How do I send SMS with Twilio?",
    buttonLabel: "Search",
    run: (businessProfileId, query) => searchDocs({ businessProfileId, query }),
  },
  {
    id: "domain-lookup",
    tab: "developer",
    platforms: ["godaddy"],
    providerLabels: "GoDaddy",
    title: "Domain lookup",
    description: "Look up domain availability or DNS via GoDaddy API key.",
    placeholder: "e.g. automazing.life",
    buttonLabel: "Lookup",
    run: (businessProfileId, domain) => lookupDomain({ businessProfileId, domain }),
  },
  {
    id: "architecture-docs",
    tab: "developer",
    platforms: ["klarity"],
    providerLabels: "Klarity Architect",
    title: "Architecture docs",
    description: "Search architecture documentation via Klarity API key.",
    placeholder: "e.g. event-driven order pipeline",
    buttonLabel: "Search",
    run: (businessProfileId, query) => searchArchitectureDocs({ businessProfileId, query }),
  },
  {
    id: "context-query",
    tab: "developer",
    platforms: ["era"],
    providerLabels: "Era MCP",
    title: "Context tools",
    description: "Context and integration queries via Era OAuth MCP.",
    placeholder: "e.g. summarize connected integrations",
    buttonLabel: "Query",
    run: (businessProfileId, query) => runContextQuery({ businessProfileId, query }),
  },
];

/** All MCP platform ids referenced by feature definitions (16 total). */
export const MCP_PLATFORMS_WITH_UI = [
  ...new Set(MCP_FEATURE_DEFINITIONS.flatMap((f) => f.platforms)),
];

export function mcpFeaturesForTab(tab: Exclude<McpHubTabId, "overview">): McpFeatureDefinition[] {
  return MCP_FEATURE_DEFINITIONS.filter((f) => f.tab === tab);
}
