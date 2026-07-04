import { describe, expect, it } from "vitest";
import { MARKETING_PATH_GROUPS, MARKETING_PATHS } from "@/features/marketing/marketingPaths";

describe("marketing paths", () => {
  it("defines paths for every group kind", () => {
    for (const group of MARKETING_PATH_GROUPS) {
      const paths = MARKETING_PATHS.filter((path) => path.kind === group.kind);
      expect(paths.length).toBeGreaterThan(0);
      expect(paths.every((path) => path.title && path.description && path.actions.length > 0)).toBe(true);
    }
  });

  it("covers paid, organic, owned and partnership routes", () => {
    const kinds = new Set(MARKETING_PATHS.map((path) => path.kind));
    expect(kinds.has("paid")).toBe(true);
    expect(kinds.has("organic")).toBe(true);
    expect(kinds.has("owned")).toBe(true);
    expect(kinds.has("partnership")).toBe(true);
  });
});
