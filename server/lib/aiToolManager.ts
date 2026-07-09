/**
 * Smart tool manager — picks which MCP providers to expose for each AI/MCP run
 * based on feature context, query signals, and what is actually connected.
 */

import { MCP_FEATURE_PLATFORMS } from "./mcpCatalog.ts";
import { mcpCatalogEntry } from "./mcpCatalog.ts";
import { assessMcpAccount } from "./mcpReadiness.ts";
import { findMcpAccountForProfile, type StoredMcpAccount } from "./mcpAccess.ts";

export type McpFeatureId = keyof typeof MCP_FEATURE_PLATFORMS;

interface TokenStoreLike {
  set: (id: string, value: Record<string, unknown>) => Promise<unknown>;
  get: (id: string) => Promise<Record<string, unknown> | null>;
  entries: () => Promise<Array<[string, Record<string, unknown>]>>;
}

export interface ToolPlanPlatform {
  platform: string;
  label: string;
  score: number;
  reasons: string[];
  ready: boolean;
  selected: boolean;
  skipReason?: string;
}

export interface AiToolPlan {
  runId: string;
  featureId: McpFeatureId;
  queryPreview: string;
  platforms: ToolPlanPlatform[];
  selectedPlatforms: string[];
  explanation: string;
  maxProviders: number;
}

const PLATFORM_KEYWORDS: Partial<Record<string, RegExp[]>> = {
  exa: [/\b(search|research|company|prospect|web|find)\b/i, /\bföretag\b/i],
  sprouts: [/\b(prospect|lead|company|sales|contact)\b/i, /\blead\b/i],
  ahrefs: [/\b(seo|keyword|backlink|rank|organic|traffic)\b/i],
  supermetrics_mcp: [/\b(marketing|ads|campaign|spend|roas|metric)\b/i],
  windsor: [/\b(marketing|ads|report|metric|data)\b/i],
  peec: [/\b(competitor|competitive|market|rival)\b/i],
  lunarcrush: [/\b(crypto|coin|token|sentiment|market)\b/i],
  twilio_mcp: [/\b(doc|documentation|api|developer|twilio)\b/i],
  superhuman_mcp: [/\b(mail|email|inbox|message)\b/i],
  godaddy: [/\b(domain|dns|whois|register)\b/i],
  klarity: [/\b(architecture|diagram|system|docs)\b/i],
  gamma: [/\b(deck|presentation|slide|pitch)\b/i],
  shopify_mcp: [/\b(shop|store|product|catalog|ecommerce)\b/i],
  dayai: [/\b(crm|customer|contact|deal)\b/i],
  era: [/\b(context|background|company info)\b/i],
  canva_mcp: [/\b(design|brand|visual|template)\b/i],
};

const FEATURE_LABELS: Record<McpFeatureId, string> = {
  marketPulse: "Market pulse",
  leadResearch: "Lead research",
  docSearch: "Doc search",
  seoOverview: "SEO overview",
  marketingQuery: "Marketing query",
  competitiveResearch: "Competitive research",
  mailSearch: "Mail search",
  domainLookup: "Domain lookup",
  architectureDocs: "Architecture docs",
  deckGeneration: "Deck generation",
  shopCatalog: "Shop catalog",
  crmQuery: "CRM query",
  contextQuery: "Context query",
  designAssist: "Design assist",
  multiSourceCompare: "Multi-source compare",
};

export function mcpFeatureLabel(featureId: string): string {
  return FEATURE_LABELS[featureId as McpFeatureId] ?? featureId;
}

export function defaultMaxProviders(featureId: McpFeatureId): number {
  if (featureId === "multiSourceCompare") return 8;
  if (featureId === "leadResearch") return 2;
  if (featureId === "docSearch") return 1;
  return 1;
}

export function scorePlatformForQuery(
  platform: string,
  query: string,
  orderIndex: number,
  maxCandidates: number
): { score: number; reasons: string[] } {
  const reasons: string[] = [];
  let score = Math.max(5, 100 - orderIndex * 12);
  reasons.push(`Priority ${orderIndex + 1} for this feature`);

  const q = query.trim();
  if (q) {
    const patterns = PLATFORM_KEYWORDS[platform] ?? [];
    let hits = 0;
    for (const re of patterns) {
      if (re.test(q)) hits += 1;
    }
    if (hits > 0) {
      const boost = Math.min(40, hits * 15);
      score += boost;
      reasons.push(`Query matches ${platform} (${hits} signal${hits === 1 ? "" : "s"})`);
    }
  }

  // Slight preference for earlier catalog entries when scores tie
  score += (maxCandidates - orderIndex) * 0.1;
  return { score, reasons };
}

export function inferFeatureFromQuery(query: string): McpFeatureId | null {
  const q = query.trim();
  if (!q) return null;
  let best: { id: McpFeatureId; score: number } | null = null;
  for (const id of Object.keys(MCP_FEATURE_PLATFORMS) as McpFeatureId[]) {
    const candidates = MCP_FEATURE_PLATFORMS[id];
    let score = 0;
    for (const platform of candidates) {
      for (const re of PLATFORM_KEYWORDS[platform] ?? []) {
        if (re.test(q)) score += 1;
      }
    }
    if (!best || score > best.score) best = { id, score };
  }
  return best && best.score > 0 ? best.id : null;
}

function newRunId(): string {
  return `run_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export async function buildAiToolPlan(options: {
  featureId: McpFeatureId;
  query?: string;
  tokenStore: TokenStoreLike;
  businessProfileId: string | null;
  maxProviders?: number;
}): Promise<AiToolPlan> {
  const featureId = options.featureId;
  const queryPreview = String(options.query || "").trim().slice(0, 200);
  const maxProviders = options.maxProviders ?? defaultMaxProviders(featureId);
  const candidates = [...MCP_FEATURE_PLATFORMS[featureId]];

  const scored: ToolPlanPlatform[] = [];

  for (let i = 0; i < candidates.length; i += 1) {
    const platform = candidates[i]!;
    const entry = mcpCatalogEntry(platform);
    const label = entry?.label ?? platform;
    const { score, reasons } = scorePlatformForQuery(platform, queryPreview, i, candidates.length);

    const account = await findMcpAccountForProfile({
      tokenStore: options.tokenStore,
      businessProfileId: options.businessProfileId,
      platforms: [platform],
    });
    if (!account) {
      scored.push({
        platform,
        label,
        score,
        reasons: [...reasons, "Not connected"],
        ready: false,
        selected: false,
        skipReason: "not_connected",
      });
      continue;
    }

    const assessment = await assessMcpAccount(options.tokenStore, account as StoredMcpAccount);
    if (assessment.status !== "ready") {
      scored.push({
        platform,
        label,
        score,
        reasons: [...reasons, assessment.message ?? "Not ready"],
        ready: false,
        selected: false,
        skipReason: assessment.status,
      });
      continue;
    }

    scored.push({
      platform,
      label,
      score,
      reasons,
      ready: true,
      selected: false,
    });
  }

  const readySorted = [...scored].filter((p) => p.ready).sort((a, b) => b.score - a.score);
  const selectedSet = new Set(readySorted.slice(0, maxProviders).map((p) => p.platform));

  for (const row of scored) {
    row.selected = selectedSet.has(row.platform);
  }

  const selectedPlatforms = readySorted.slice(0, maxProviders).map((p) => p.platform);
  const featureLabel = mcpFeatureLabel(featureId);

  let explanation: string;
  if (selectedPlatforms.length === 0) {
    explanation = `No connected MCP providers are ready for ${featureLabel}. Connect a provider under Connections.`;
  } else if (selectedPlatforms.length === 1) {
    const p = scored.find((s) => s.platform === selectedPlatforms[0]);
    explanation = `Using ${p?.label ?? selectedPlatforms[0]} for ${featureLabel}${queryPreview ? ` — best match for your query` : ""}.`;
  } else {
    explanation = `Using ${selectedPlatforms.length} providers for ${featureLabel}: ${selectedPlatforms
      .map((id) => scored.find((s) => s.platform === id)?.label ?? id)
      .join(", ")}.`;
  }

  return {
    runId: newRunId(),
    featureId,
    queryPreview,
    platforms: scored,
    selectedPlatforms,
    explanation,
    maxProviders,
  };
}

export async function findReadyAccountFromPlan(
  options: {
    tokenStore: TokenStoreLike;
    businessProfileId: string | null;
    plan: AiToolPlan;
  }
): Promise<
  | { ok: true; account: StoredMcpAccount; platform: string }
  | { ok: false; status: number; error: string; missingPlatforms: string[] }
> {
  for (const platform of options.plan.selectedPlatforms) {
    const account = await findMcpAccountForProfile({
      tokenStore: options.tokenStore,
      businessProfileId: options.businessProfileId,
      platforms: [platform],
    });
    if (!account) continue;
    const assessment = await assessMcpAccount(options.tokenStore, account as StoredMcpAccount);
    if (assessment.status === "ready") {
      return { ok: true, account: account as StoredMcpAccount, platform };
    }
  }
  const missing = options.plan.platforms.filter((p) => !p.ready).map((p) => p.platform);
  return {
    ok: false,
    status: 503,
    error: options.plan.explanation,
    missingPlatforms: missing,
  };
}
