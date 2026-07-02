import { beforeEach, describe, expect, it } from "vitest";
import {
  isPersonalProfile,
  modeForProfile,
  profileMatchesMode,
  readLastProfileIdForMode,
  writeLastProfileIdForMode,
} from "./workspaceMode";
import {
  isNavUrlAllowedInMode,
  navItemsForMode,
  topNavItemsForMode,
  navItems,
  topNavItems,
} from "@/components/navConfig";

describe("workspaceMode", () => {
  it("derives private mode only from personal profiles", () => {
    expect(modeForProfile({ kind: "personal" })).toBe("private");
    expect(modeForProfile({ kind: "company" })).toBe("business");
    expect(modeForProfile({ kind: undefined })).toBe("business");
    expect(modeForProfile(null)).toBe("business");
  });

  it("isPersonalProfile matches only personal kind", () => {
    expect(isPersonalProfile({ kind: "personal" })).toBe(true);
    expect(isPersonalProfile({ kind: "company" })).toBe(false);
    expect(isPersonalProfile(undefined)).toBe(false);
  });

  it("profileMatchesMode maps kinds to their workspace", () => {
    expect(profileMatchesMode({ kind: "personal" }, "private")).toBe(true);
    expect(profileMatchesMode({ kind: "personal" }, "business")).toBe(false);
    expect(profileMatchesMode({ kind: "company" }, "business")).toBe(true);
    expect(profileMatchesMode({ kind: undefined }, "business")).toBe(true);
  });

  describe("last profile per mode storage", () => {
    beforeEach(() => {
      localStorage.clear();
    });

    it("round-trips per mode and user", () => {
      writeLastProfileIdForMode("private", "user-1", "profile-a");
      writeLastProfileIdForMode("business", "user-1", "profile-b");
      expect(readLastProfileIdForMode("private", "user-1")).toBe("profile-a");
      expect(readLastProfileIdForMode("business", "user-1")).toBe("profile-b");
    });

    it("is isolated between users", () => {
      writeLastProfileIdForMode("private", "user-1", "profile-a");
      expect(readLastProfileIdForMode("private", "user-2")).toBeNull();
    });

    it("returns null when nothing stored", () => {
      expect(readLastProfileIdForMode("business", "user-1")).toBeNull();
    });
  });
});

describe("navConfig workspace filtering", () => {
  it("business mode shows every nav item", () => {
    expect(navItemsForMode("business")).toHaveLength(navItems.length);
    expect(topNavItemsForMode("business")).toHaveLength(topNavItems.length);
  });

  it("private mode hides company-oriented items", () => {
    const privateKeys = navItemsForMode("private").map((i) => i.key);
    for (const hidden of [
      "ecommerce",
      "sales-marketing",
      "marketing",
      "digital-brand",
      "customers",
      "reviews",
    ]) {
      expect(privateKeys).not.toContain(hidden);
    }
  });

  it("private mode keeps the personal surface", () => {
    const privateKeys = navItemsForMode("private").map((i) => i.key);
    for (const kept of [
      "content",
      "social-media",
      "calendar",
      "messages",
      "tasks",
      "activity",
      "ai-recommendations",
    ]) {
      expect(privateKeys).toContain(kept);
    }
    const topKeys = topNavItemsForMode("private").map((i) => i.key);
    expect(topKeys).toContain("connections");
    expect(topKeys).toContain("preferences");
    expect(topKeys).not.toContain("company");
  });

  it("fences business-only URLs in private mode", () => {
    expect(isNavUrlAllowedInMode("/marketing", "private")).toBe(false);
    expect(isNavUrlAllowedInMode("/company", "private")).toBe(false);
    expect(isNavUrlAllowedInMode("/messages", "private")).toBe(true);
    // Non-nav URLs (home, deep links) are never fenced.
    expect(isNavUrlAllowedInMode("/", "private")).toBe(true);
    expect(isNavUrlAllowedInMode("/marketing", "business")).toBe(true);
  });
});
