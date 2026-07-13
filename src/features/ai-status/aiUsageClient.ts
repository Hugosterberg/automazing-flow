import { apiJson } from "@/lib/apiJson";

export type AiUsageKind = "openai" | "mcp" | "apiai";

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

export async function fetchAiUsage(
  businessProfileId: string,
  windowDays = 30
): Promise<AiUsageSummary> {
  return apiJson<AiUsageSummary>(
    `/api/settings/ai-usage?business_profile_id=${encodeURIComponent(businessProfileId)}&days=${windowDays}`,
    "Kunde inte hämta AI-kostnader.",
    { timeoutMs: 15_000 }
  );
}
