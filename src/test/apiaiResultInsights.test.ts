import { describe, expect, it } from "vitest";
import { insightFromApiaiResult, publishBlockReason } from "@/features/content/apiaiResultInsights";

describe("apiaiResultInsights", () => {
  it("marks moderation reject as blocked", () => {
    const insight = insightFromApiaiResult(
      {
        resultType: "json",
        data: { decision: "reject", reasons: [{ message: "NSFW content" }] },
      },
      { slug: "moderation", endpoint: "/api/moderation/check-image" } as never
    );
    expect(insight?.severity).toBe("block");
    expect(publishBlockReason(insight)).toContain("NSFW");
  });

  it("marks moderation allow as ok", () => {
    const insight = insightFromApiaiResult(
      { resultType: "json", data: { decision: "allow" } },
      { slug: "moderation", endpoint: "/api/moderation/check-image" } as never
    );
    expect(insight?.ok).toBe(true);
    expect(publishBlockReason(insight)).toBeNull();
  });

  it("marks quality gate fail as warning", () => {
    const insight = insightFromApiaiResult(
      { resultType: "json", data: { answer: "no", explanation: "Too dark" } },
      { slug: "quality-gate", endpoint: "/api/quality-gate" } as never
    );
    expect(insight?.severity).toBe("warn");
    expect(publishBlockReason(insight)).toBeNull();
  });
});
