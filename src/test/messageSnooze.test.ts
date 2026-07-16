import { describe, expect, it } from "vitest";
import {
  isSnoozed,
  pruneSnoozeMap,
  snoozeUntilNextWeek,
  snoozeUntilTomorrowMorning,
} from "../features/messages/messageSnooze";

describe("messageSnooze", () => {
  it("prunes expired entries", () => {
    const past = new Date(Date.now() - 60_000).toISOString();
    const future = new Date(Date.now() + 60_000).toISOString();
    const pruned = pruneSnoozeMap({ a: past, b: future });
    expect(pruned.a).toBeUndefined();
    expect(pruned.b).toBe(future);
  });

  it("detects active snooze", () => {
    const until = new Date(Date.now() + 3_600_000).toISOString();
    expect(isSnoozed({ x: until }, "x")).toBe(true);
    expect(isSnoozed({ x: until }, "y")).toBe(false);
  });

  it("schedules tomorrow morning after now", () => {
    const from = new Date("2026-07-16T15:00:00");
    const until = new Date(snoozeUntilTomorrowMorning(from));
    expect(until.getDate()).toBe(17);
    expect(until.getHours()).toBe(8);
  });

  it("schedules next monday", () => {
    const wednesday = new Date("2026-07-15T12:00:00"); // Wed
    const until = new Date(snoozeUntilNextWeek(wednesday));
    expect(until.getDay()).toBe(1);
    expect(until.getHours()).toBe(8);
  });
});
