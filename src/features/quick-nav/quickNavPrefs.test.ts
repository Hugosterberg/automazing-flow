import { describe, expect, it } from "vitest";
import {
  buildQuickNavPrefs,
  moreDestinationKeys,
  resolveHomeJumpKeys,
  resolvePrimaryKeys,
} from "@/features/quick-nav/quickNavPrefs";

describe("quickNavPrefs", () => {
  it("falls back to business defaults when prefs are empty", () => {
    expect(resolvePrimaryKeys({}, "business")).toEqual(["messages", "tasks", "reviews"]);
    expect(resolveHomeJumpKeys({}, "business")).toEqual([
      "connections",
      "social-media",
      "content",
    ]);
  });

  it("uses private defaults without reviews", () => {
    expect(resolvePrimaryKeys({}, "private")).toEqual(["messages", "tasks", "content"]);
  });

  it("sanitizes invalid keys, duplicates, and mode-blocked destinations", () => {
    const prefs = buildQuickNavPrefs(
      ["tasks", "reviews", "tasks", "not-a-key", "company"],
      ["sales", "bogus"],
      "private"
    );
    expect(prefs.primary).toEqual(["tasks"]);
    expect(prefs.homeJumps).toEqual([]);
  });

  it("rejects path conflicts such as content + drive-library", () => {
    const prefs = buildQuickNavPrefs(
      ["content", "drive-library", "calendar"],
      ["drive-library", "content"],
      "business"
    );
    expect(prefs.primary).toEqual(["content", "calendar"]);
    expect(prefs.homeJumps).toEqual(["drive-library"]);
  });

  it("caps primary and home jumps at three", () => {
    const prefs = buildQuickNavPrefs(
      ["messages", "tasks", "reviews", "calendar", "social-media"],
      ["connections", "social-media", "content", "activity"],
      "business"
    );
    expect(prefs.primary).toHaveLength(3);
    expect(prefs.homeJumps).toHaveLength(3);
  });

  it("lists Mer destinations excluding primary and path duplicates", () => {
    const more = moreDestinationKeys(["messages", "tasks", "content"], "business");
    expect(more).not.toContain("messages");
    expect(more).not.toContain("content");
    expect(more).not.toContain("drive-library");
    expect(more).toContain("calendar");
    expect(more).toContain("reviews");
  });

  it("honours custom primary prefs when resolving", () => {
    expect(
      resolvePrimaryKeys({ primary: ["calendar", "automations", "insights"] }, "business")
    ).toEqual(["calendar", "automations", "insights"]);
  });
});
