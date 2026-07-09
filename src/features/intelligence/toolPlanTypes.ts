/** Mirrors server `AiToolPlan` — which MCP providers were considered/selected. */
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
  featureId: string;
  queryPreview: string;
  platforms: ToolPlanPlatform[];
  selectedPlatforms: string[];
  explanation: string;
  maxProviders: number;
}

export interface McpQueryResponse {
  provider: string;
  tool: string;
  query: string;
  text: string;
  fetchedAt?: string;
  toolPlan?: AiToolPlan;
  selectedPlatform?: string;
}
