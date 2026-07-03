import { describe, expect, it } from "vitest";

describe("superhuman_mcp directory contract", () => {
  it("registers superhuman_mcp as an OAuth MCP provider", async () => {
    const { OAUTH_MCP_DIRECTORY, isOauthMcpPlatform } = await import(
      "../../server/providers/mcpOauth.ts"
    );
    expect(isOauthMcpPlatform("superhuman_mcp")).toBe(true);
    expect(OAUTH_MCP_DIRECTORY.superhuman_mcp.mcpUrl).toBe("https://mcp.mail.superhuman.com/mcp");
    expect(OAUTH_MCP_DIRECTORY.superhuman_mcp.authUrl).toBe(
      "https://mcp.auth.mail.superhuman.com/oauth2/authorize"
    );
    expect(OAUTH_MCP_DIRECTORY.superhuman_mcp.scopes).toContain("offline_access");
  });
});
