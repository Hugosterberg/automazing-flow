import { beforeEach, describe, expect, it } from "vitest";
import {
  isExternalEvent,
  localTimeOfIso,
  readLegacyEvents,
  sortByTime,
  sortCalendarAccounts,
  writeLegacyEvents,
} from "@/features/calendar/calendarHelpers";
import type { CalendarEvent } from "@/types/calendar";
import type { ConnectedAccount } from "@/types/accounts";

function account(partial: Pick<ConnectedAccount, "platform" | "username">): ConnectedAccount {
  return {
    id: partial.username,
    profileId: "p1",
    platform: partial.platform,
    username: partial.username,
    connectedAt: "2026-01-01T00:00:00Z",
  };
}

function event(partial: Partial<CalendarEvent> & Pick<CalendarEvent, "id" | "title">): CalendarEvent {
  return {
    date: "2026-07-16",
    isAutomated: false,
    createdAt: "2026-07-01T00:00:00Z",
    ...partial,
  };
}

describe("sortCalendarAccounts", () => {
  it("orders Google before Outlook, then by username", () => {
    const accounts = [
      account({ platform: "outlook_calendar", username: "z@ex.com" }),
      account({ platform: "google_calendar", username: "b@ex.com" }),
      account({ platform: "google_calendar", username: "a@ex.com" }),
      account({ platform: "instagram", username: "brand" }),
    ];
    const sorted = [...accounts].sort(sortCalendarAccounts);
    expect(sorted.map((a) => a.username)).toEqual([
      "a@ex.com",
      "b@ex.com",
      "z@ex.com",
      "brand",
    ]);
  });
});

describe("sortByTime", () => {
  it("sorts timed events ascending and pushes missing times last", () => {
    const sorted = sortByTime([
      event({ id: "1", title: "Late", time: "15:00" }),
      event({ id: "2", title: "Untimed" }),
      event({ id: "3", title: "Early", time: "09:30" }),
    ]);
    expect(sorted.map((e) => e.id)).toEqual(["3", "1", "2"]);
  });

  it("does not mutate the input array", () => {
    const input = [
      event({ id: "1", title: "B", time: "12:00" }),
      event({ id: "2", title: "A", time: "08:00" }),
    ];
    const before = input.map((e) => e.id);
    sortByTime(input);
    expect(input.map((e) => e.id)).toEqual(before);
  });
});

describe("isExternalEvent", () => {
  it("treats external source or readOnly as external", () => {
    expect(isExternalEvent(event({ id: "1", title: "X", source: "external" }))).toBe(true);
    expect(isExternalEvent(event({ id: "2", title: "Y", readOnly: true }))).toBe(true);
    expect(isExternalEvent(event({ id: "3", title: "Z", source: "local" }))).toBe(false);
  });
});

describe("localTimeOfIso", () => {
  it("formats a local ISO timestamp as HH:mm", () => {
    expect(localTimeOfIso("2026-07-16T09:05:00")).toBe("09:05");
  });

  it("returns empty string for invalid input", () => {
    expect(localTimeOfIso("not-a-date")).toBe("");
  });
});

describe("readLegacyEvents / writeLegacyEvents", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("round-trips events through localStorage", () => {
    const events = [event({ id: "1", title: "Standup", time: "09:00" })];
    writeLegacyEvents(events);
    expect(readLegacyEvents()).toEqual(events);
  });

  it("returns undefined when empty or corrupt", () => {
    expect(readLegacyEvents()).toBeUndefined();
    localStorage.setItem("automazing-calendar-events", "{bad");
    expect(readLegacyEvents()).toBeUndefined();
  });
});
