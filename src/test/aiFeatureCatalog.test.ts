import { describe, expect, it } from "vitest";
import {
  buildAiFeatureStatus,
  type AiFeatureFlags,
} from "../../server/lib/aiFeatureCatalog.ts";

const NONE: AiFeatureFlags = {
  openaiTenant: false,
  openaiPlatform: false,
  apiai: false,
  zernio: false,
  cron: false,
};

const ALL: AiFeatureFlags = {
  openaiTenant: true,
  openaiPlatform: true,
  apiai: true,
  zernio: true,
  cron: true,
};

function byId(flags: AiFeatureFlags) {
  return new Map(buildAiFeatureStatus(flags).map((f) => [f.id, f]));
}

describe("buildAiFeatureStatus", () => {
  it("marks everything active when all capabilities are configured", () => {
    for (const feature of buildAiFeatureStatus(ALL)) {
      expect(feature.state, feature.id).toBe("active");
      expect(feature.activation, feature.id).toBeNull();
    }
  });

  it("degrades OpenAI-backed features to limited (not inactive) without a key", () => {
    const features = byId(NONE);
    for (const id of ["task-assist", "content-ideas", "review-reply-drafts", "sales-ai"]) {
      expect(features.get(id)!.state, id).toBe("limited");
      expect(features.get(id)!.activation, id).toContain("OpenAI");
    }
  });

  it("marks no-fallback features inactive without their key", () => {
    const features = byId(NONE);
    expect(features.get("image-generation")!.state).toBe("inactive");
    expect(features.get("apiai-tools")!.state).toBe("inactive");
    expect(features.get("apiai-tools")!.activation).toContain("APIAI_API_KEY");
  });

  it("gates DM auto-reply on Zernio before OpenAI", () => {
    const noZernio = byId({ ...ALL, zernio: false }).get("dm-auto-reply")!;
    expect(noZernio.state).toBe("inactive");
    expect(noZernio.activation).toContain("ZERNIO_API_KEY");

    const zernioNoAi = byId({ ...NONE, zernio: true }).get("dm-auto-reply")!;
    expect(zernioNoAi.state).toBe("limited");
  });

  it("AI recommendations require the platform key — tenant key does not count", () => {
    const tenantOnly = byId({ ...NONE, openaiTenant: true }).get("ai-recommendations")!;
    expect(tenantOnly.state).toBe("inactive");
    const platform = byId({ ...NONE, openaiPlatform: true }).get("ai-recommendations")!;
    expect(platform.state).toBe("active");
  });

  it("scheduled AI jobs need cron first, then a key", () => {
    const noCron = byId({ ...ALL, cron: false }).get("scheduled-ai-jobs")!;
    expect(noCron.state).toBe("inactive");
    expect(noCron.activation).toContain("CRON_SECRET");

    const cronNoKey = byId({ ...NONE, cron: true }).get("scheduled-ai-jobs")!;
    expect(cronNoKey.state).toBe("limited");
  });

  it("reports which key source made a feature active", () => {
    const viaTenant = byId({ ...NONE, openaiTenant: true }).get("task-assist")!;
    expect(viaTenant.detail).toContain("profile's own");
    const viaPlatform = byId({ ...NONE, openaiPlatform: true }).get("task-assist")!;
    expect(viaPlatform.detail).toContain("platform");
  });
});
