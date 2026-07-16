import { describe, expect, it } from "vitest";
import { buildDailyBrief } from "@/features/daily-brief/buildDailyBrief";
import {
  buildDemoBriefOverlay,
  buildDemoMessages,
  isDemoId,
  mergeDemoInboxMessages,
} from "@/features/demo";

describe("demo sample data", () => {
  it("builds five inbox samples with demo ids", () => {
    const msgs = buildDemoMessages();
    expect(msgs).toHaveLength(5);
    expect(msgs.every((m) => isDemoId(m.id))).toBe(true);
    expect(msgs.some((m) => m.kind === "email")).toBe(true);
    expect(msgs.some((m) => m.kind === "dm")).toBe(true);
  });

  it("merge keeps real messages and fills empty kinds", () => {
    const live = [
      {
        ...buildDemoMessages()[0],
        id: "real-1",
        kind: "email" as const,
      },
    ];
    const merged = mergeDemoInboxMessages(live, true);
    expect(merged.some((m) => m.id === "real-1")).toBe(true);
    expect(merged.filter((m) => m.kind === "email" && isDemoId(m.id))).toHaveLength(0);
    expect(merged.some((m) => m.kind === "dm" && isDemoId(m.id))).toBe(true);
  });

  it("merge strips demo rows when disabled", () => {
    const withDemo = mergeDemoInboxMessages([], true);
    expect(withDemo.length).toBeGreaterThan(0);
    expect(mergeDemoInboxMessages(withDemo, false)).toEqual([]);
  });

  it("demo brief overlay produces actionable items", () => {
    const overlay = buildDemoBriefOverlay();
    const brief = buildDailyBrief({
      connectionIssues: [],
      overdueTasks: [],
      dueTodayTasks: [],
      newRecommendations: [],
      ...overlay,
    });
    expect(brief.allClear).toBe(false);
    expect(brief.actionCount).toBeGreaterThan(0);
  });
});
