/**
 * AI & MCP usage tracking — records token spend and MCP tool calls so tenants
 * can see what costs what and why.
 */

import { mcpFeatureLabel } from "./aiToolManager.ts";
import type { AiToolPlan } from "./aiToolManager.ts";

export type AiUsageKind = "openai" | "mcp" | "apiai";

const EXTRA_FEATURE_LABELS: Record<string, string> = {
  "task-assist": "Task AI assist",
  "content-ideas": "Content ideas",
  "company-enrich": "Company enrichment",
  "lead-suggestions": "Lead suggestions",
  "outreach-draft": "Outreach draft",
  "ai-recommendations": "AI recommendations",
};

export function aiFeatureLabel(featureId: string): string {
  return EXTRA_FEATURE_LABELS[featureId] ?? mcpFeatureLabel(featureId);
}

export interface AiUsageRecordInput {
  businessProfileId: string;
  actorUserId?: string | null;
  runId?: string | null;
  kind: AiUsageKind;
  featureId: string;
  model?: string | null;
  provider?: string | null;
  toolName?: string | null;
  promptTokens?: number | null;
  completionTokens?: number | null;
  totalTokens?: number | null;
  estimatedUsd?: number | null;
  queryPreview?: string | null;
  toolsSelected?: string[] | null;
  selectionReason?: string | null;
  metadata?: Record<string, unknown>;
}

type SupabaseInsertClient = {
  from: (table: string) => {
    insert: (row: Record<string, unknown>) => Promise<{ error: { message?: string } | null }>;
    select: (cols?: string) => {
      eq: (col: string, val: string) => {
        gte: (col: string, val: string) => {
          order: (col: string, opts: { ascending: boolean }) => Promise<{
            data: Record<string, unknown>[] | null;
            error: { message?: string } | null;
          }>;
        };
      };
    };
  };
};

/** USD per 1M tokens — approximate list prices for cost estimates. */
const MODEL_PRICING_USD_PER_M: Record<string, { input: number; output: number }> = {
  "gpt-4o-mini": { input: 0.15, output: 0.6 },
  "gpt-4o": { input: 2.5, output: 10 },
  "gpt-4.1-mini": { input: 0.4, output: 1.6 },
  "gpt-4.1": { input: 2.0, output: 8.0 },
};

/** Flat estimate per MCP tool call when the provider has no token meter. */
const MCP_CALL_ESTIMATE_USD = 0.002;

export function estimateOpenAiCostUsd(
  model: string,
  promptTokens: number,
  completionTokens: number
): number {
  const pricing = MODEL_PRICING_USD_PER_M[model] ?? MODEL_PRICING_USD_PER_M["gpt-4o-mini"]!;
  const input = (promptTokens / 1_000_000) * pricing.input;
  const output = (completionTokens / 1_000_000) * pricing.output;
  return Math.round((input + output) * 1_000_000) / 1_000_000;
}

export function estimateMcpCallCostUsd(): number {
  return MCP_CALL_ESTIMATE_USD;
}

export async function recordAiUsage(
  supabase: SupabaseInsertClient | null | undefined,
  input: AiUsageRecordInput
): Promise<void> {
  if (!supabase || !input.businessProfileId) return;

  const row: Record<string, unknown> = {
    business_profile_id: input.businessProfileId,
    actor_user_id: input.actorUserId ?? null,
    run_id: input.runId ?? null,
    kind: input.kind,
    feature_id: input.featureId,
    model: input.model ?? null,
    provider: input.provider ?? null,
    tool_name: input.toolName ?? null,
    prompt_tokens: input.promptTokens ?? null,
    completion_tokens: input.completionTokens ?? null,
    total_tokens: input.totalTokens ?? null,
    estimated_usd: input.estimatedUsd ?? null,
    query_preview: input.queryPreview?.slice(0, 300) ?? null,
    tools_selected: input.toolsSelected ?? [],
    selection_reason: input.selectionReason?.slice(0, 500) ?? null,
    metadata: input.metadata ?? {},
  };

  try {
    const { error } = await supabase.from("ai_usage_events").insert(row);
    if (error) {
      console.warn("[aiUsage] insert failed:", error.message);
    }
  } catch (err) {
    console.warn("[aiUsage] insert threw:", err instanceof Error ? err.message : err);
  }
}

export function usageFromToolPlan(plan: AiToolPlan): {
  toolsSelected: string[];
  selectionReason: string;
  runId: string;
} {
  return {
    runId: plan.runId,
    toolsSelected: plan.selectedPlatforms,
    selectionReason: plan.explanation,
  };
}

export interface AiUsageSummary {
  windowDays: number;
  totals: {
    estimatedUsd: number;
    promptTokens: number;
    completionTokens: number;
    mcpCalls: number;
    openaiCalls: number;
    eventCount: number;
  };
  byFeature: Array<{
    featureId: string;
    label: string;
    estimatedUsd: number;
    eventCount: number;
    mcpCalls: number;
    tokens: number;
  }>;
  byProvider: Array<{
    provider: string;
    kind: AiUsageKind;
    estimatedUsd: number;
    eventCount: number;
  }>;
  /** Daily cost series over the window, oldest first; days without events are 0. */
  byDay: Array<{
    date: string;
    estimatedUsd: number;
    eventCount: number;
  }>;
  recent: Array<{
    id: string;
    createdAt: string;
    featureId: string;
    featureLabel: string;
    kind: AiUsageKind;
    provider: string | null;
    toolName: string | null;
    estimatedUsd: number;
    totalTokens: number | null;
    queryPreview: string | null;
    selectionReason: string | null;
    toolsSelected: string[];
  }>;
}

export async function getAiUsageSummary(
  supabase: SupabaseInsertClient | null | undefined,
  businessProfileId: string,
  windowDays = 30
): Promise<AiUsageSummary> {
  const empty: AiUsageSummary = {
    windowDays,
    totals: {
      estimatedUsd: 0,
      promptTokens: 0,
      completionTokens: 0,
      mcpCalls: 0,
      openaiCalls: 0,
      eventCount: 0,
    },
    byFeature: [],
    byProvider: [],
    byDay: [],
    recent: [],
  };

  if (!supabase || !businessProfileId) return empty;

  const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000).toISOString();

  try {
    const { data, error } = await supabase
      .from("ai_usage_events")
      .select("*")
      .eq("business_profile_id", businessProfileId)
      .gte("created_at", since)
      .order("created_at", { ascending: false });

    if (error || !data) {
      console.warn("[aiUsage] summary query failed:", error?.message);
      return empty;
    }

    const byFeatureMap = new Map<
      string,
      { estimatedUsd: number; eventCount: number; mcpCalls: number; tokens: number }
    >();
    const byProviderMap = new Map<string, { kind: AiUsageKind; estimatedUsd: number; eventCount: number }>();
    const byDayMap = new Map<string, { estimatedUsd: number; eventCount: number }>();

    let estimatedUsd = 0;
    let promptTokens = 0;
    let completionTokens = 0;
    let mcpCalls = 0;
    let openaiCalls = 0;

    for (const row of data) {
      const kind = String(row.kind || "") as AiUsageKind;
      const featureId = String(row.feature_id || "unknown");
      const provider = row.provider ? String(row.provider) : kind === "openai" ? "openai" : "unknown";
      const usd = Number(row.estimated_usd) || 0;
      const pt = Number(row.prompt_tokens) || 0;
      const ct = Number(row.completion_tokens) || 0;
      const tokens = Number(row.total_tokens) || pt + ct;

      estimatedUsd += usd;
      promptTokens += pt;
      completionTokens += ct;
      if (kind === "mcp") mcpCalls += 1;
      if (kind === "openai") openaiCalls += 1;

      const feat = byFeatureMap.get(featureId) ?? { estimatedUsd: 0, eventCount: 0, mcpCalls: 0, tokens: 0 };
      feat.estimatedUsd += usd;
      feat.eventCount += 1;
      feat.tokens += tokens;
      if (kind === "mcp") feat.mcpCalls += 1;
      byFeatureMap.set(featureId, feat);

      const provKey = `${kind}:${provider}`;
      const prov = byProviderMap.get(provKey) ?? { kind, estimatedUsd: 0, eventCount: 0 };
      prov.estimatedUsd += usd;
      prov.eventCount += 1;
      byProviderMap.set(provKey, prov);

      const day = String(row.created_at || "").slice(0, 10);
      if (day) {
        const dayStats = byDayMap.get(day) ?? { estimatedUsd: 0, eventCount: 0 };
        dayStats.estimatedUsd += usd;
        dayStats.eventCount += 1;
        byDayMap.set(day, dayStats);
      }
    }

    const byFeature = [...byFeatureMap.entries()]
      .map(([featureId, stats]) => ({
        featureId,
        label: aiFeatureLabel(featureId),
        ...stats,
        estimatedUsd: Math.round(stats.estimatedUsd * 1_000_000) / 1_000_000,
      }))
      .sort((a, b) => b.estimatedUsd - a.estimatedUsd);

    const byProvider = [...byProviderMap.entries()]
      .map(([key, stats]) => ({
        provider: key.split(":").slice(1).join(":"),
        kind: stats.kind,
        estimatedUsd: Math.round(stats.estimatedUsd * 1_000_000) / 1_000_000,
        eventCount: stats.eventCount,
      }))
      .sort((a, b) => b.estimatedUsd - a.estimatedUsd);

    // Fill the window day by day (oldest first) so the client's chart shows
    // quiet days as 0 instead of skipping them.
    const byDay: AiUsageSummary["byDay"] = [];
    const todayMs = Date.parse(new Date().toISOString().slice(0, 10));
    for (let i = windowDays - 1; i >= 0; i -= 1) {
      const date = new Date(todayMs - i * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const stats = byDayMap.get(date);
      byDay.push({
        date,
        estimatedUsd: stats ? Math.round(stats.estimatedUsd * 1_000_000) / 1_000_000 : 0,
        eventCount: stats?.eventCount ?? 0,
      });
    }

    const recent = data.slice(0, 40).map((row) => ({
      id: String(row.id),
      createdAt: String(row.created_at),
      featureId: String(row.feature_id || ""),
      featureLabel: aiFeatureLabel(String(row.feature_id || "")),
      kind: String(row.kind || "openai") as AiUsageKind,
      provider: row.provider ? String(row.provider) : null,
      toolName: row.tool_name ? String(row.tool_name) : null,
      estimatedUsd: Number(row.estimated_usd) || 0,
      totalTokens: row.total_tokens != null ? Number(row.total_tokens) : null,
      queryPreview: row.query_preview ? String(row.query_preview) : null,
      selectionReason: row.selection_reason ? String(row.selection_reason) : null,
      toolsSelected: Array.isArray(row.tools_selected)
        ? row.tools_selected.map(String)
        : [],
    }));

    return {
      windowDays,
      totals: {
        estimatedUsd: Math.round(estimatedUsd * 1_000_000) / 1_000_000,
        promptTokens,
        completionTokens,
        mcpCalls,
        openaiCalls,
        eventCount: data.length,
      },
      byFeature,
      byProvider,
      byDay,
      recent,
    };
  } catch (err) {
    console.warn("[aiUsage] summary threw:", err instanceof Error ? err.message : err);
    return empty;
  }
}
