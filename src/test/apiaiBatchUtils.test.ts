import { describe, expect, it } from "vitest";
import { batchStatusLabel, isBatchComplete, isBatchTerminal } from "@/features/content/apiaiBatchUtils";

describe("apiaiBatchUtils", () => {
  it("maps batch statuses to readable labels", () => {
    expect(batchStatusLabel("completed")).toBe("Complete");
    expect(batchStatusLabel("running")).toBe("Running");
    expect(batchStatusLabel("failed")).toBe("Failed");
    expect(batchStatusLabel("custom")).toBe("custom");
  });

  it("detects terminal batch states", () => {
    expect(isBatchTerminal("completed")).toBe(true);
    expect(isBatchTerminal("running")).toBe(false);
  });

  it("detects completed batches", () => {
    expect(isBatchComplete("completed")).toBe(true);
    expect(isBatchComplete("failed")).toBe(false);
  });
});
