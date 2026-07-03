import { describe, expect, it } from "vitest";
import { assessMcpAccount } from "../../server/lib/mcpReadiness.ts";

describe("assessMcpAccount", () => {
  it("flags missing API key for keyed providers", async () => {
    const result = await assessMcpAccount(
      { set: async () => {}, get: async () => null, entries: async () => [] },
      {
        __accountId: "exa-1",
        platform: "exa",
        mcpApiKey: "",
      }
    );
    expect(result.status).toBe("missing_credential");
    expect(result.message).toMatch(/API key/i);
  });

  it("marks keyless twilio as ready without probe", async () => {
    const result = await assessMcpAccount(
      { set: async () => {}, get: async () => null, entries: async () => [] },
      {
        __accountId: "twilio-1",
        platform: "twilio_mcp",
      }
    );
    expect(result.status).toBe("ready");
  });
});
