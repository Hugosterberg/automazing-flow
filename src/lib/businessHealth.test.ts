import { describe, expect, it } from "vitest";
import { computeBusinessHealth } from "./businessHealth";

describe("computeBusinessHealth", () => {
  it("is a perfect 100 when nothing needs attention", () => {
    const result = computeBusinessHealth({
      connectionIssues: 0,
      overdueTasks: 0,
      dueTodayTasks: 0,
      activeRecommendations: 0,
    });
    expect(result.score).toBe(100);
    expect(result.label).toBe("Excellent");
    expect(result.tone).toBe("success");
    expect(result.topReason).toBeNull();
  });

  it("treats a broken connection as the dominant signal", () => {
    const result = computeBusinessHealth({
      connectionIssues: 1,
      overdueTasks: 1,
      dueTodayTasks: 0,
      activeRecommendations: 0,
    });
    expect(result.topReason).toBe("1 connection needs attention");
    expect(result.score).toBe(100 - 18 - 8);
  });

  it("caps each penalty so a pile-up cannot zero the score alone", () => {
    const result = computeBusinessHealth({
      connectionIssues: 10,
      overdueTasks: 0,
      dueTodayTasks: 0,
      activeRecommendations: 0,
    });
    expect(result.score).toBe(100 - 36);
  });

  it("never goes below zero", () => {
    const result = computeBusinessHealth({
      connectionIssues: 99,
      overdueTasks: 99,
      dueTodayTasks: 99,
      activeRecommendations: 99,
    });
    expect(result.score).toBe(100 - 36 - 32 - 8 - 9);
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.label).toBe("Needs attention");
    expect(result.tone).toBe("warning");
  });

  it("uses plural/singular phrasing in reasons", () => {
    const plural = computeBusinessHealth({
      connectionIssues: 0,
      overdueTasks: 3,
      dueTodayTasks: 0,
      activeRecommendations: 0,
    });
    expect(plural.topReason).toBe("3 overdue tasks");
  });

  it("buckets scores into labels", () => {
    const good = computeBusinessHealth({
      connectionIssues: 1,
      overdueTasks: 0,
      dueTodayTasks: 0,
      activeRecommendations: 0,
    });
    expect(good.label).toBe("Good");
    expect(good.tone).toBe("info");
  });
});
