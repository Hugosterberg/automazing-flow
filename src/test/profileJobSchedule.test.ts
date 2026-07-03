import { describe, expect, it } from "vitest";
import {
  expandRunTimes,
  isProfileJobDue,
  normaliseProfileJobSchedule,
  parseJobSchedulesJson,
} from "../../server/lib/profileJobSchedule";

describe("profileJobSchedule", () => {
  it("spreads times evenly between start and end", () => {
    const schedule = normaliseProfileJobSchedule({
      enabled: true,
      days: [1],
      timesPerDay: 3,
      startTime: "09:00",
      endTime: "17:00",
      timezone: "UTC",
    });
    expect(expandRunTimes(schedule)).toEqual(["09:00", "13:00", "17:00"]);
  });

  it("matches a scheduled slot in timezone", () => {
    const schedule = normaliseProfileJobSchedule({
      enabled: true,
      days: [1],
      timesPerDay: 1,
      startTime: "09:00",
      endTime: "09:00",
      timezone: "UTC",
    });
    const mondayNine = new Date("2026-01-05T09:05:00.000Z");
    expect(isProfileJobDue(schedule, mondayNine, 60)).toBe(true);
    expect(isProfileJobDue(schedule, new Date("2026-01-05T11:00:00.000Z"), 60)).toBe(false);
  });

  it("syncs legacy enable flags on parse", () => {
    const map = parseJobSchedulesJson({}, {
      dmAutoReplyEnabled: true,
      dailyDigestEnabled: true,
      marketingAlertsEnabled: false,
    });
    expect(map["auto-reply"].enabled).toBe(true);
    expect(map["daily-digest"].enabled).toBe(true);
    expect(map["weekly-report"].enabled).toBe(true);
    expect(map["marketing-alerts"].enabled).toBe(false);
  });
});
