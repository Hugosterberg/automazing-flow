import { describe, expect, it } from "vitest";
import { formatBytes } from "@/features/content/DriveMediaGrid";

describe("formatBytes", () => {
  it("returns null for missing or invalid values", () => {
    expect(formatBytes()).toBeNull();
    expect(formatBytes(0)).toBeNull();
    expect(formatBytes(Number.NaN)).toBeNull();
  });

  it("formats bytes through gigabytes", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatBytes(5 * 1024 * 1024)).toBe("5.0 MB");
    expect(formatBytes(2 * 1024 * 1024 * 1024)).toBe("2.0 GB");
  });
});
