import { describe, expect, it } from "vitest";
import { dateInputToEndOfDayIso, isoToLocalDateInputValue } from "./localDate";

describe("dateInputToEndOfDayIso", () => {
  it("maps a date-input value to the local end of that day", () => {
    const iso = dateInputToEndOfDayIso("2026-07-02");
    expect(iso).not.toBeNull();
    const parsed = new Date(iso!);
    // Local calendar components, not UTC — that's the point of the helper.
    expect(parsed.getFullYear()).toBe(2026);
    expect(parsed.getMonth()).toBe(6);
    expect(parsed.getDate()).toBe(2);
    expect(parsed.getHours()).toBe(23);
    expect(parsed.getMinutes()).toBe(59);
  });

  it("rejects empty and malformed input", () => {
    expect(dateInputToEndOfDayIso("")).toBeNull();
    expect(dateInputToEndOfDayIso("not-a-date")).toBeNull();
    expect(dateInputToEndOfDayIso("2026-07-02T10:00:00Z")).toBeNull();
  });

  it("round-trips through isoToLocalDateInputValue", () => {
    const iso = dateInputToEndOfDayIso("2026-12-31");
    expect(isoToLocalDateInputValue(iso!)).toBe("2026-12-31");
    const jan = dateInputToEndOfDayIso("2026-01-01");
    expect(isoToLocalDateInputValue(jan!)).toBe("2026-01-01");
  });
});

describe("isoToLocalDateInputValue", () => {
  it("formats a timestamp as the local calendar date", () => {
    const now = new Date(2026, 6, 2, 12, 0, 0);
    expect(isoToLocalDateInputValue(now.toISOString())).toBe("2026-07-02");
  });

  it("falls back to the raw date prefix for unparseable input", () => {
    expect(isoToLocalDateInputValue("2026-07-02garbage")).toBe("2026-07-02");
  });
});

describe("deadline semantics (task due dates)", () => {
  it("a deadline picked today is not yet in the past", () => {
    const today = isoToLocalDateInputValue(new Date().toISOString());
    const iso = dateInputToEndOfDayIso(today);
    expect(Date.parse(iso!)).toBeGreaterThan(Date.now());
  });
});
