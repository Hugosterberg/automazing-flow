/**
 * Orchestrate company enrichment from Bolagsverket, website meta, Google Places,
 * and optional Exa/Sprouts MCP research.
 */

import { MCP_FEATURE_PLATFORMS } from "./mcpCatalog.ts";
import { findReadyMcpAccount } from "./mcpReadiness.ts";
import { runMcpQuery } from "./mcpQuery.ts";
import { fetchSiteMeta } from "./siteMeta.ts";
import {
  bolagsverketConfigured,
  lookupBolagsverketCompany,
  type BolagsverketCompany,
} from "../providers/bolagsverket.ts";
import {
  lookupGooglePlace,
  resolveGooglePlacesApiKey,
  type GooglePlaceMatch,
} from "../providers/googlePlaces.ts";
import { normalizeOrgNumber } from "./orgNumber.ts";

export type EnrichmentSourceResult = {
  id: string;
  label: string;
  status: "success" | "skipped" | "error";
  message?: string;
};

export type McpInsight = {
  platform: string;
  provider: string;
  text: string;
};

export type CompanyEnrichment = {
  orgNumber?: string;
  company?: string;
  description?: string;
  website?: string;
  phone?: string;
  email?: string;
  address?: string;
  location?: string;
  industry?: string;
  companyForm?: string;
  status?: string;
  sniCodes?: Array<{ code: string; label: string }>;
  googlePlace?: GooglePlaceMatch;
  registry?: BolagsverketCompany;
  sources: EnrichmentSourceResult[];
  mcpInsights?: McpInsight[];
};

type TokenStoreLike = {
  set: (id: string, value: Record<string, unknown>) => Promise<unknown>;
  get: (id: string) => Promise<Record<string, unknown> | null>;
  entries: () => Promise<Array<[string, Record<string, unknown>]>>;
};

function mergeDefined<T extends Record<string, unknown>>(base: T, patch: Partial<T>): T {
  const out = { ...base };
  for (const [k, v] of Object.entries(patch)) {
    if (v !== undefined && v !== null && String(v).trim() !== "") {
      (out as Record<string, unknown>)[k] = v;
    }
  }
  return out;
}

async function runMultiMcpResearch(opts: {
  tokenStore: TokenStoreLike;
  businessProfileId: string | null;
  query: string;
}): Promise<McpInsight[]> {
  const platforms = [...MCP_FEATURE_PLATFORMS.leadResearch];
  const results = await Promise.all(
    platforms.map(async (platform) => {
      const ready = await findReadyMcpAccount({
        tokenStore: opts.tokenStore,
        businessProfileId: opts.businessProfileId,
        platforms: [platform],
      });
      if (ready.ok === false) return null;
      const result = await runMcpQuery({
        tokenStore: opts.tokenStore,
        account: ready.account,
        toolPatterns: [/web_search/i, /^search/i, /prospect/i, /company/i],
        argCandidates: ["query", "q", "search", "text", "prompt", "name"],
        query: opts.query,
        maxChars: 2000,
      });
      if (result.ok === false) return null;
      return {
        platform,
        provider: result.provider,
        text: result.text,
      } satisfies McpInsight;
    })
  );
  return results.filter(Boolean) as McpInsight[];
}

export async function enrichCompany(opts: {
  orgNumber?: string;
  url?: string;
  company?: string;
  businessProfileId?: string | null;
  includeMcpResearch?: boolean;
  secretResolver?: {
    resolve: (businessProfileId: string | null | undefined, key: string) => Promise<string | null>;
  };
  tokenStore?: TokenStoreLike;
}): Promise<CompanyEnrichment> {
  const sources: EnrichmentSourceResult[] = [];
  let result: CompanyEnrichment = { sources };

  const orgDigits = opts.orgNumber ? normalizeOrgNumber(opts.orgNumber) : "";
  const website = String(opts.url || "").trim();
  const companyQuery = String(opts.company || "").trim();

  if (orgDigits) {
    if (!bolagsverketConfigured()) {
      sources.push({
        id: "bolagsverket",
        label: "Bolagsverket",
        status: "skipped",
        message: "Saknar BOLAGSVERKET_CLIENT_ID och BOLAGSVERKET_CLIENT_SECRET.",
      });
    } else {
      try {
        const registry = await lookupBolagsverketCompany(orgDigits);
        result.registry = registry;
        result = mergeDefined(result, {
          orgNumber: registry.orgNumber,
          company: registry.company,
          description: registry.description,
          address: registry.address,
          location: registry.location,
          industry: registry.industry,
          companyForm: registry.companyForm,
          status: registry.status,
          sniCodes: registry.sniCodes,
        });
        sources.push({ id: "bolagsverket", label: "Bolagsverket", status: "success" });
      } catch (e) {
        const msg = e instanceof Error ? e.message : "lookup_failed";
        sources.push({
          id: "bolagsverket",
          label: "Bolagsverket",
          status: "error",
          message: msg,
        });
      }
    }
  }

  const siteUrl = website || result.website;
  if (siteUrl) {
    try {
      const meta = await fetchSiteMeta(siteUrl);
      result.website = meta.url;
      result = mergeDefined(result, {
        company: meta.company,
        description: meta.description,
        phone: meta.phone,
        email: meta.email,
        address: meta.address,
        location: meta.location,
      });
      sources.push({ id: "website", label: "Webbplats", status: "success" });
    } catch (e) {
      sources.push({
        id: "website",
        label: "Webbplats",
        status: "error",
        message: e instanceof Error ? e.message : "fetch_failed",
      });
    }
  } else if (website === "" && !orgDigits) {
    /* no website requested */
  }

  const placesQuery = companyQuery || result.company || website;
  const placesKey = await resolveGooglePlacesApiKey(opts.businessProfileId, opts.secretResolver);
  if (placesQuery && placesKey) {
    try {
      const place = await lookupGooglePlace(placesQuery, placesKey);
      if (place) {
        result.googlePlace = place;
        result = mergeDefined(result, {
          company: place.name,
          website: place.website,
          phone: place.phone,
          address: place.address,
          location: place.location,
        });
        if (place.categories?.length && !result.industry) {
          result.industry = place.categories.slice(0, 2).join(", ");
        }
        sources.push({ id: "google_places", label: "Google Places", status: "success" });
      } else {
        sources.push({
          id: "google_places",
          label: "Google Places",
          status: "skipped",
          message: "Ingen träff.",
        });
      }
    } catch {
      sources.push({
        id: "google_places",
        label: "Google Places",
        status: "error",
        message: "Places lookup failed.",
      });
    }
  } else if (placesQuery) {
    sources.push({
      id: "google_places",
      label: "Google Places",
      status: "skipped",
      message: "Saknar GOOGLE_PLACES_API_KEY.",
    });
  }

  if (opts.includeMcpResearch && opts.tokenStore) {
    const researchQuery = [result.company || companyQuery, result.website || website, result.location]
      .filter(Boolean)
      .join(" ");
    if (researchQuery.trim()) {
      try {
        const insights = await runMultiMcpResearch({
          tokenStore: opts.tokenStore,
          businessProfileId: opts.businessProfileId ?? null,
          query: `${researchQuery} company overview news reputation`,
        });
        if (insights.length > 0) {
          result.mcpInsights = insights;
          sources.push({
            id: "mcp_research",
            label: "Exa / Sprouts",
            status: "success",
            message: `${insights.length} källa(or)`,
          });
        } else {
          sources.push({
            id: "mcp_research",
            label: "Exa / Sprouts",
            status: "skipped",
            message: "Koppla Exa eller Sprouts under Inställningar.",
          });
        }
      } catch {
        sources.push({
          id: "mcp_research",
          label: "Exa / Sprouts",
          status: "error",
          message: "Research failed.",
        });
      }
    }
  }

  result.sources = sources;
  return result;
}
