import { describe, expect, it } from "vitest";

describe("supermetrics_mcp directory contract", () => {
  it("registers supermetrics_mcp as an OAuth MCP provider", async () => {
    const { OAUTH_MCP_DIRECTORY, isOauthMcpPlatform } = await import(
      "../../server/providers/mcpOauth.ts"
    );
    expect(isOauthMcpPlatform("supermetrics_mcp")).toBe(true);
    expect(OAUTH_MCP_DIRECTORY.supermetrics_mcp.mcpUrl).toBe("https://mcp.supermetrics.com/mcp");
    expect(OAUTH_MCP_DIRECTORY.supermetrics_mcp.authUrl).toBe(
      "https://api.supermetrics.com/oauth/authorize"
    );
    expect(OAUTH_MCP_DIRECTORY.supermetrics_mcp.scopes).toContain("ds_queries_run");
    expect(OAUTH_MCP_DIRECTORY.supermetrics_mcp.scopes).toContain("offline_access");
  });
});
