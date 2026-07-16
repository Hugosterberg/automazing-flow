import { apiJson } from "@/lib/apiJson";

export interface McpToolDescriptor {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}

export interface McpToolsResponse {
  platform: string;
  tools: McpToolDescriptor[];
}

export interface McpToolCallResponse {
  platform: string;
  tool: string;
  isError: boolean;
  text: string;
  truncated?: boolean;
}

export async function fetchMcpTools(accountId: string): Promise<McpToolsResponse> {
  return apiJson<McpToolsResponse>(
    `/api/mcp/${encodeURIComponent(accountId)}/tools`,
    "Kunde inte lista MCP-verktyg."
  );
}

export async function callMcpTool(options: {
  accountId: string;
  name: string;
  arguments?: Record<string, unknown>;
}): Promise<McpToolCallResponse> {
  return apiJson<McpToolCallResponse>(
    `/api/mcp/${encodeURIComponent(options.accountId)}/call`,
    "MCP tool call failed.",
    {
      body: { name: options.name, arguments: options.arguments ?? {} },
      timeoutMs: 60_000,
    }
  );
}
