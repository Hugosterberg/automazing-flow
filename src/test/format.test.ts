import { describe, expect, it } from "vitest";
import {
  formatCurrency,
  formatFullDateTime,
  formatNumber,
  formatShortDate,
  formatSmartDate,
  formatTime,
} from "@/lib/format";

// A fixed "now" keeps the relative buckets deterministic: Wednesday
// 2026-07-15 12:00 local time.
const NOW = new Date(2026, 6, 15, 12, 0, 0);

describe("formatSmartDate", () => {
  it("returns time of day for timestamps today", () => {
    const result = formatSmartDate(new Date(2026, 6, 15, 9, 5), NOW);
    expect(result).toBe("09:05");
  });

  it("uses local midnight (not a 24h window) for 'Igår'", () => {
    // 23:30 yesterday is <24h ago at 12:00 but must still read as yesterday.
    expect(formatSmartDate(new Date(2026, 6, 14, 23, 30), NOW)).toBe("Igår");
  });

  it("returns a weekday within the last week", () => {
    const result = formatSmartDate(new Date(2026, 6, 12, 10, 0), NOW);
    expect(result.length).toBeGreaterThan(0);
    expect(result).not.toContain("jul");
  });

  it("returns day + month within the current year", () => {
    const result = formatSmartDate(new Date(2026, 0, 3), NOW);
    expect(result).toMatch(/3 jan/);
    expect(result).not.toContain("2026");
  });

  it("appends the year for older dates", () => {
    const result = formatSmartDate(new Date(2025, 11, 20), NOW);
    expect(result).toContain("2025");
  });

  it("falls back to a dated label for future timestamps beyond today", () => {
    const result = formatSmartDate(new Date(2026, 6, 20), NOW);
    expect(result).toMatch(/20 jul/);
  });

  it("returns empty string for missing or invalid input", () => {
    expect(formatSmartDate(null, NOW)).toBe("");
    expect(formatSmartDate(undefined, NOW)).toBe("");
    expect(formatSmartDate("not-a-date", NOW)).toBe("");
    expect(formatSmartDate("", NOW)).toBe("");
  });
});

describe("formatShortDate", () => {
  it("omits the year inside the current year and includes it otherwise", () => {
    expect(formatShortDate(new Date(2026, 2, 9), NOW)).not.toContain("2026");
    expect(formatShortDate(new Date(2024, 2, 9), NOW)).toContain("2024");
  });
});

describe("formatFullDateTime", () => {
  it("includes weekday, date, year and time", () => {
    const result = formatFullDateTime(new Date(2026, 1, 5, 14, 5));
    expect(result).toContain("2026");
    expect(result).toContain("14:05");
  });

  it("returns empty string for invalid input", () => {
    expect(formatFullDateTime("nope")).toBe("");
  });
});

describe("formatTime", () => {
  it("formats hours and minutes", () => {
    expect(formatTime(new Date(2026, 0, 1, 8, 3))).toBe("08:03");
  });
});

describe("formatNumber", () => {
  it("groups thousands with Swedish separators", () => {
    // sv-SE uses non-breaking space as group separator.
    expect(formatNumber(12345)).toMatch(/^12\s345$/);
  });

  it("returns empty string for null/NaN", () => {
    expect(formatNumber(null)).toBe("");
    expect(formatNumber(Number.NaN)).toBe("");
  });
});

describe("formatCurrency", () => {
  it("formats whole units by default", () => {
    const result = formatCurrency(1234.56, "SEK");
    expect(result).toMatch(/1\s235/);
    expect(result).not.toContain(",56");
  });

  it("keeps decimals in detailed mode", () => {
    expect(formatCurrency(1234.5, "SEK", { detailed: true })).toContain(",50");
  });

  it("defaults to USD when the currency is missing", () => {
    const result = formatCurrency(10, null);
    expect(result.toLowerCase()).toContain("us");
  });

  it("degrades gracefully on an invalid currency code", () => {
    expect(formatCurrency(10, "NOT_A_CODE")).toContain("NOT_A_CODE");
  });

  it("returns empty string for missing amounts", () => {
    expect(formatCurrency(null, "SEK")).toBe("");
  });
});
