import { describe, expect, it } from "vitest";
import { scopedStorageKey } from "@/lib/storageUtils";

describe("scopedStorageKey", () => {
  it("uses the provided scope when present", () => {
    expect(scopedStorageKey("prefix", "profile-1")).toBe("prefix:profile-1");
  });

  it("uses default scope for profile-scoped storage", () => {
    expect(scopedStorageKey("prefix", null)).toBe("prefix:default");
  });

  it("can omit the suffix for user-scoped root keys", () => {
    expect(scopedStorageKey("prefix", undefined, null)).toBe("prefix");
  });
});
