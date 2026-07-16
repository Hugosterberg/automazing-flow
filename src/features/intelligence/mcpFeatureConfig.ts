/**
 * UI definitions for every MCP-backed intelligence feature.
 * One entry per user-facing query — fallback providers share the same input.
 */

import { t } from "@/lib/i18n";
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
  | "catalog"
  | "tools"
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

/** Workflow order: status → act (compare/research domains) → catalog/tools last. */
export const MCP_HUB_TABS: McpHubTab[] = [
  { id: "overview", label: "Status", description: "Kopplings- och nyckelstatus för alla MCP-leverantörer." },
  {
    id: "compare",
    label: "Jämför",
    description: "Kör samma domän eller företag mot varje kopplad MCP-lins och jämför bedömningarna sida vid sida.",
  },
  { id: "research", label: "Research", description: "Marknadspuls, lead-research och konkurrentanalys." },
  { id: "marketing", label: "Marknadsföring", description: "SEO- och marknadsföringsdata." },
  { id: "content", label: "Innehåll", description: "Presentationer och designhjälp." },
  { id: "commerce", label: "E-handel", description: "Frågor mot din Shopify-butik." },
  { id: "crm-mail", label: "CRM & mail", description: "CRM-assistent och mailsökning." },
  {
    id: "catalog",
    label: "Katalog",
    description: "Alla MCP-leverantörer och vilka datatyper var och en kan hämta.",
  },
  {
    id: "tools",
    label: "Verktyg",
    description: "Bläddra bland och anropa råa verktyg från valfri kopplad MCP-server.",
  },
  { id: "developer", label: "Utvecklare", description: "Dokumentation, domäner, arkitektur och kontextverktyg." },
];

export const MCP_FEATURE_DEFINITIONS: McpFeatureDefinition[] = [
  {
    id: "market-pulse",
    tab: "research",
    platforms: ["lunarcrush"],
    providerLabels: "LunarCrush",
    title: "Marknadspuls",
    description: "Krypto/socialt sentiment för ett ämne på din startsida.",
    placeholder: "t.ex. bitcoin, ethereum, solana",
    buttonLabel: "Hämta puls",
    run: async (businessProfileId, topic) => {
      const pulse = await fetchMarketPulse(businessProfileId, topic.toLowerCase());
      if (!pulse.available) {
        throw new Error(pulse.message || t("mcp:features.market-pulse.unavailable"));
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
    providerLabels: "Exa eller Sprouts",
    title: "Lead-research",
    description: "Företagsöversikt från din kopplade research-leverantör (Exa i första hand, Sprouts som reserv).",
    placeholder: "Företagsnamn, person eller webbplats",
    buttonLabel: "Undersök",
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
    title: "Konkurrentanalys",
    description: "Research om konkurrenter och marknadspositionering.",
    placeholder: "t.ex. Acme Corp mot vår positionering",
    buttonLabel: "Undersök",
    run: (businessProfileId, query) => runCompetitiveResearch({ businessProfileId, query }),
  },
  {
    id: "seo-overview",
    tab: "marketing",
    platforms: ["ahrefs"],
    providerLabels: "Ahrefs",
    title: "SEO-översikt",
    description: "Domän- eller URL-översikt via Ahrefs OAuth MCP.",
    placeholder: "t.ex. automazing.life",
    buttonLabel: "Analysera",
    run: async (businessProfileId, target) => {
      const result = await fetchSeoOverview({ businessProfileId, target });
      return { ...result, query: target };
    },
  },
  {
    id: "marketing-query",
    tab: "marketing",
    platforms: ["supermetrics_mcp", "windsor"],
    providerLabels: "Supermetrics eller Windsor",
    title: "Marknadsföringsdata",
    description: "Fråga efter kampanj- eller kanalsiffror (Supermetrics i första hand, Windsor som reserv).",
    placeholder: "t.ex. Meta-annonskostnad senaste 7 dagarna",
    buttonLabel: "Fråga",
    run: (businessProfileId, query) => runMarketingQuery({ businessProfileId, query }),
  },
  {
    id: "deck-generation",
    tab: "content",
    platforms: ["gamma"],
    providerLabels: "Gamma",
    title: "Skapa presentation",
    description: "Generera en presentationsdisposition eller ett deck från en prompt.",
    placeholder: "t.ex. Q3-marknadsresultat för intressenter",
    buttonLabel: "Generera",
    multiline: true,
    run: (businessProfileId, prompt) => generateDeck({ businessProfileId, prompt }),
  },
  {
    id: "design-assist",
    tab: "content",
    platforms: ["canva_mcp"],
    providerLabels: "Canva MCP",
    title: "Designhjälp",
    description: "Designbriefer och kreativ riktning via Canva OAuth MCP.",
    placeholder: "t.ex. Instagram-karusell för produktlansering",
    buttonLabel: "Hjälp till",
    multiline: true,
    run: (businessProfileId, prompt) => runDesignAssist({ businessProfileId, prompt }),
  },
  {
    id: "shop-catalog",
    tab: "commerce",
    platforms: ["shopify_mcp"],
    providerLabels: "Shopify MCP",
    title: "Butikskatalog",
    description: "Sök produkter i din kopplade Shopify-butik (butiksdomän krävs vid koppling).",
    placeholder: "t.ex. bästsäljare taggade sommar",
    buttonLabel: "Sök",
    run: (businessProfileId, query) => queryShopCatalog({ businessProfileId, query }),
  },
  {
    id: "crm-query",
    tab: "crm-mail",
    platforms: ["dayai"],
    providerLabels: "Day.ai",
    title: "CRM-assistent",
    description: "Fråga om kunder, affärer och pipeline via Day.ai OAuth MCP.",
    placeholder: "t.ex. öppna affärer över 50k detta kvartal",
    buttonLabel: "Fråga CRM",
    run: (businessProfileId, query) => runCrmQuery({ businessProfileId, query }),
  },
  {
    id: "mail-search",
    tab: "crm-mail",
    platforms: ["superhuman_mcp"],
    providerLabels: "Superhuman Mail MCP",
    title: "Mailsökning",
    description: "Sök i mail via Superhuman när OAuth är konfigurerat.",
    placeholder: "t.ex. fakturor från Acme förra veckan",
    buttonLabel: "Sök mail",
    run: (businessProfileId, query) => searchMail({ businessProfileId, query }),
  },
  {
    id: "doc-search",
    tab: "developer",
    platforms: ["twilio_mcp", "exa"],
    providerLabels: "Twilio Docs MCP eller Exa",
    title: "Dokumentationssökning",
    description: "Sök i utvecklardokumentation (Twilio nyckellös MCP i första hand, Exa som reserv).",
    placeholder: "t.ex. Hur skickar jag SMS med Twilio?",
    buttonLabel: "Sök",
    run: (businessProfileId, query) => searchDocs({ businessProfileId, query }),
  },
  {
    id: "domain-lookup",
    tab: "developer",
    platforms: ["godaddy"],
    providerLabels: "GoDaddy",
    title: "Domänuppslag",
    description: "Slå upp domäntillgänglighet eller DNS via GoDaddy-API-nyckel.",
    placeholder: "t.ex. automazing.life",
    buttonLabel: "Slå upp",
    run: (businessProfileId, domain) => lookupDomain({ businessProfileId, domain }),
  },
  {
    id: "architecture-docs",
    tab: "developer",
    platforms: ["klarity"],
    providerLabels: "Klarity Architect",
    title: "Arkitekturdokumentation",
    description: "Sök i arkitekturdokumentation via Klarity-API-nyckel.",
    placeholder: "t.ex. händelsedriven orderpipeline",
    buttonLabel: "Sök",
    run: (businessProfileId, query) => searchArchitectureDocs({ businessProfileId, query }),
  },
  {
    id: "context-query",
    tab: "developer",
    platforms: ["era"],
    providerLabels: "Era MCP",
    title: "Kontextverktyg",
    description: "Kontext- och integrationsfrågor via Era OAuth MCP.",
    placeholder: "t.ex. sammanfatta kopplade integrationer",
    buttonLabel: "Fråga",
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

/** Localized hub tab label/description (id stays stable). */
export function localizeMcpHubTab(tab: McpHubTab): McpHubTab {
  return {
    ...tab,
    label: t(`mcp:tabs.${tab.id}.label`),
    description: t(`mcp:tabs.${tab.id}.description`),
  };
}

/** Localized feature chrome for query boxes. */
export function localizeMcpFeature(feature: McpFeatureDefinition): McpFeatureDefinition {
  const base = `mcp:features.${feature.id}`;
  return {
    ...feature,
    title: t(`${base}.title`),
    description: t(`${base}.description`),
    placeholder: t(`${base}.placeholder`),
    buttonLabel: t(`${base}.buttonLabel`),
  };
}
