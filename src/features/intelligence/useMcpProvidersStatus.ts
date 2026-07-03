import { useQuery } from "@tanstack/react-query";
import { fetchMcpProvidersStatus, type McpProviderReadiness } from "./intelligenceService";

export const MCP_PROVIDERS_KEY = ["intelligence", "mcp-providers"] as const;

export function useMcpProvidersStatus(businessProfileId: string | null, options?: { probe?: boolean }) {
  const query = useQuery({
    queryKey: [...MCP_PROVIDERS_KEY, businessProfileId, options?.probe ? "probe" : "fast"],
    queryFn: () => fetchMcpProvidersStatus(businessProfileId, options),
    staleTime: 60_000,
  });

  const byPlatform = new Map<string, McpProviderReadiness>(
    (query.data?.providers ?? []).map((p) => [p.platform, p])
  );

  return {
    providers: query.data?.providers ?? [],
    byPlatform,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
}

export function mcpStatusLabel(status: McpProviderReadiness["status"]): string {
  switch (status) {
    case "ready":
      return "Ready";
    case "not_connected":
      return "Not connected";
    case "missing_credential":
      return "Key missing";
    case "auth_expired":
      return "Reconnect required";
    case "error":
      return "Error";
    default:
      return status;
  }
}
