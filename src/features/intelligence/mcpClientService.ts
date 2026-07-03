import { apiUrl } from "@/lib/apiBase";
import { fetchWithTimeout } from "@/lib/fetchWithTimeout";
import { apiErrorMessage } from "@/lib/apiError";

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
  const res = await fetchWithTimeout(apiUrl(`/api/mcp/${encodeURIComponent(accountId)}/tools`), {
    credentials: "include",
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(apiErrorMessage(payload, "Could not list MCP tools."));
  }
  return payload as McpToolsResponse;
}

export async function callMcpTool(options: {
  accountId: string;
  name: string;
  arguments?: Record<string, unknown>;
}): Promise<McpToolCallResponse> {
  const res = await fetchWithTimeout(
    apiUrl(`/api/mcp/${encodeURIComponent(options.accountId)}/call`),
    {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: options.name,
        arguments: options.arguments ?? {},
      }),
    },
    60_000
  );
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(apiErrorMessage(payload, "MCP tool call failed."));
  }
  return payload as McpToolCallResponse;
}
