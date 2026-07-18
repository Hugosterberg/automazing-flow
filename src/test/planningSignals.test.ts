import { describe, expect, it } from "vitest";
import {
  fxWeekChangePct,
  parseFrankfurter,
  parseOpenMeteoDaily,
  parseSvenskaDagar,
  shiftDate,
  upcomingPlanningHolidays,
  wmoSummary,
  type SwedishDay,
} from "../../server/lib/planningSignals";

function day(partial: Partial<SwedishDay> & Pick<SwedishDay, "date" | "weekday">): SwedishDay {
  return { isWorkFree: false, isRed: false, ...partial };
}

describe("parseSvenskaDagar", () => {
  it("normalises the Svenska Dagar 2.1 shape", () => {
    const days = parseSvenskaDagar({
      dagar: [
        {
          datum: "2026-06-19",
          veckodag: "Fredag",
          "arbetsfri dag": "Ja",
          "röd dag": "Nej",
          helgdag: "Midsommarafton",
        },
        { datum: "2026-06-21", veckodag: "Söndag", "arbetsfri dag": "Ja", "röd dag": "Ja" },
        { datum: "not-a-date" },
      ],
    });
    expect(days).toEqual([
      {
        date: "2026-06-19",
        weekday: "Fredag",
        isWorkFree: true,
        isRed: false,
        holidayName: "Midsommarafton",
      },
      { date: "2026-06-21", weekday: "Söndag", isWorkFree: true, isRed: true },
    ]);
  });

  it("returns [] on malformed payloads", () => {
    expect(parseSvenskaDagar(null)).toEqual([]);
    expect(parseSvenskaDagar({ dagar: "nope" })).toEqual([]);
  });
});

describe("upcomingPlanningHolidays", () => {
  // Kristi himmelsfärdsdag 2026-05-14 (Thu) → Friday 15th is a klämdag.
  const week: SwedishDay[] = [
    day({ date: "2026-05-13", weekday: "Onsdag" }),
    day({
      date: "2026-05-14",
      weekday: "Torsdag",
      isWorkFree: true,
      isRed: true,
      holidayName: "Kristi himmelsfärdsdag",
    }),
    day({ date: "2026-05-15", weekday: "Fredag" }),
    day({ date: "2026-05-16", weekday: "Lördag", isWorkFree: true }),
    day({ date: "2026-05-17", weekday: "Söndag", isWorkFree: true, isRed: true }),
  ];

  it("finds named holidays and derives the klämdag", () => {
    const result = upcomingPlanningHolidays(week, "2026-05-13", 7);
    expect(result).toEqual([
      {
        date: "2026-05-14",
        name: "Kristi himmelsfärdsdag",
        kind: "red",
        weekday: "Torsdag",
      },
      { date: "2026-05-15", name: "Klämdag", kind: "squeeze", weekday: "Fredag" },
    ]);
  });

  it("skips unnamed Sundays and respects the horizon", () => {
    const result = upcomingPlanningHolidays(week, "2026-05-13", 1);
    expect(result.map((h) => h.date)).toEqual(["2026-05-14"]);
    expect(upcomingPlanningHolidays(week, "2026-05-18", 7)).toEqual([]);
  });

  it("classifies non-red named days as eves", () => {
    const eve = [
      day({
        date: "2026-06-19",
        weekday: "Fredag",
        isWorkFree: true,
        holidayName: "Midsommarafton",
      }),
    ];
    expect(upcomingPlanningHolidays(eve, "2026-06-15", 7)[0]).toMatchObject({
      kind: "eve",
      name: "Midsommarafton",
    });
  });
});

describe("shiftDate / wmoSummary", () => {
  it("shifts ISO dates across month boundaries", () => {
    expect(shiftDate("2026-12-31", 1)).toBe("2027-01-01");
    expect(shiftDate("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("maps WMO codes to summary keys", () => {
    expect(wmoSummary(0)).toBe("clear");
    expect(wmoSummary(2)).toBe("partly");
    expect(wmoSummary(3)).toBe("overcast");
    expect(wmoSummary(55)).toBe("drizzle");
    expect(wmoSummary(63)).toBe("rain");
    expect(wmoSummary(75)).toBe("snow");
    expect(wmoSummary(81)).toBe("showers");
    expect(wmoSummary(95)).toBe("thunder");
  });
});

describe("parseOpenMeteoDaily", () => {
  it("zips the parallel daily arrays", () => {
    const days = parseOpenMeteoDaily({
      daily: {
        time: ["2026-07-18", "2026-07-19"],
        weather_code: [63, 0],
        temperature_2m_max: [22.8, 16.5],
        temperature_2m_min: [16.2, 14.1],
        precipitation_probability_max: [93, 67],
      },
    });
    expect(days).toHaveLength(2);
    expect(days[0]).toMatchObject({
      date: "2026-07-18",
      summary: "rain",
      tMax: 22.8,
      precipitationProbability: 93,
    });
    expect(days[1]?.summary).toBe("clear");
  });

  it("returns [] when the shape is wrong", () => {
    expect(parseOpenMeteoDaily(null)).toEqual([]);
    expect(parseOpenMeteoDaily({ daily: { time: "x" } })).toEqual([]);
  });
});

describe("FX helpers", () => {
  it("derives SEK per EUR and USD from an EUR-based response", () => {
    const parsed = parseFrankfurter({ date: "2026-07-17", rates: { SEK: 11.0405, USD: 1.1435 } });
    expect(parsed).toEqual({ date: "2026-07-17", eurSek: 11.04, usdSek: 9.66 });
  });

  it("computes week change in percent with one decimal", () => {
    expect(fxWeekChangePct(11.04, 10.8)).toBe(2.2);
    expect(fxWeekChangePct(10.8, 11.04)).toBe(-2.2);
    expect(fxWeekChangePct(null, 10)).toBeNull();
    expect(fxWeekChangePct(10, 0)).toBeNull();
  });
});
