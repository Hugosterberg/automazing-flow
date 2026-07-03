import { describe, expect, it } from "vitest";
import {
  AUTOMATION_SCHEDULES,
  computeNextRun,
  getSchedule,
  nextRunIso,
} from "../../server/lib/automationSchedules";

// Monday 2026-01-05 08:20:00 UTC — a deterministic reference point.
const MONDAY_0820 = new Date(Date.UTC(2026, 0, 5, 8, 20, 0));

describe("computeNextRun", () => {
  it("rolls a */15 expression to the next quarter hour", () => {
    expect(computeNextRun("*/15 * * * *", MONDAY_0820)?.toISOString()).toBe(
      "2026-01-05T08:30:00.000Z"
    );
  });

  it("rolls a daily expression to the next day (UTC)", () => {
    expect(computeNextRun("0 4 * * *", MONDAY_0820)?.toISOString()).toBe(
      "2026-01-06T04:00:00.000Z"
    );
  });

  it("skips the weekend for a Mon–Fri expression", () => {
    const fridayEvening = new Date(Date.UTC(2026, 0, 9, 20, 0, 0));
    expect(computeNextRun("0 6 * * 1-5", fridayEvening)?.toISOString()).toBe(
      "2026-01-12T06:00:00.000Z"
    );
  });

  it("finds the next matching weekday for a weekly expression", () => {
    expect(computeNextRun("30 7 * * 1", MONDAY_0820)?.toISOString()).toBe(
      "2026-01-12T07:30:00.000Z"
    );
  });

  it("always returns a time strictly in the future", () => {
    const onTheMark = new Date(Date.UTC(2026, 0, 5, 8, 30, 0));
    expect(computeNextRun("*/15 * * * *", onTheMark)?.toISOString()).toBe(
      "2026-01-05T08:45:00.000Z"
    );
  });

  it("returns null for a malformed expression", () => {
    expect(computeNextRun("not a cron", MONDAY_0820)).toBeNull();
  });
});

describe("AUTOMATION_SCHEDULES", () => {
  it("has a unique key per automation", () => {
    const keys = AUTOMATION_SCHEDULES.map((s) => s.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("every schedule yields a parseable next run", () => {
    for (const schedule of AUTOMATION_SCHEDULES) {
      expect(nextRunIso(schedule.key, MONDAY_0820)).not.toBeNull();
    }
  });

  it("getSchedule resolves known keys and rejects unknown ones", () => {
    expect(getSchedule("auto-reply")?.cron).toBe("*/15 * * * *");
    expect(getSchedule("does-not-exist")).toBeUndefined();
  });
});
