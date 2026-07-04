import { describe, expect, it } from "vitest";
import { findToolForAction, APIAI_DOCUMENTED_IMAGE_ACTIONS } from "@/features/content/apiaiQuickActions";

describe("contentSafetyCheck setup", () => {
  it("resolves moderation synthetic tool without listed tools", () => {
    const action = APIAI_DOCUMENTED_IMAGE_ACTIONS.find((item) => item.id === "moderation");
    expect(action).toBeTruthy();
    const tool = findToolForAction(action!, []);
    expect(tool?.endpoint).toContain("moderation");
  });
});
