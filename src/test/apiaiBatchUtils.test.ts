import { describe, expect, it } from "vitest";
import { batchStatusLabel, isBatchComplete, isBatchTerminal } from "@/features/content/apiaiBatchUtils";

describe("apiaiBatchUtils", () => {
  it("maps batch statuses to readable labels", () => {
    expect(batchStatusLabel("completed")).toBe("Klar");
    expect(batchStatusLabel("running")).toBe("Körs");
    expect(batchStatusLabel("failed")).toBe("Misslyckad");
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
