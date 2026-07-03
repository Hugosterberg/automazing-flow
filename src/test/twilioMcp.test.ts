import { describe, expect, it } from "vitest";

describe("twilio_mcp directory contract", () => {
  it("registers twilio_mcp as a keyless MCP provider", async () => {
    const { KEYED_MCP_DIRECTORY, isKeyedMcpPlatform } = await import(
      "../../server/providers/mcpDirectory.ts"
    );
    expect(isKeyedMcpPlatform("twilio_mcp")).toBe(true);
    expect(KEYED_MCP_DIRECTORY.twilio_mcp.mcpUrl).toBe("https://mcp.twilio.com/docs");
    expect(KEYED_MCP_DIRECTORY.twilio_mcp.keyOptional).toBe(true);
  });
});
