/**
 * Planning signals — pure helpers for the free, keyless planning APIs
 * (Svenska Dagar for helgdagar/klämdagar, Open-Meteo for weather, Frankfurter
 * for FX). No fetching here; providers feed these and routes/UI consume the
 * normalised shapes. Keeping this pure makes the calendar math (klämdagar,
 * upcoming windows) and code mappings unit-testable.
 */

export type SwedishDay = {
  /** YYYY-MM-DD */
  date: string;
  weekday: string;
  isWorkFree: boolean;
  isRed: boolean;
  /** Named holiday/eve when present (e.g. "Midsommarafton", "Juldagen"). */
  holidayName?: string;
};

export type PlanningHolidayKind = "red" | "eve" | "squeeze";

export type PlanningHoliday = {
  date: string;
  name: string;
  kind: PlanningHolidayKind;
  weekday: string;
};

type RawSvenskaDag = Record<string, unknown>;

function yes(value: unknown): boolean {
  return String(value ?? "").trim().toLowerCase() === "ja";
}

/** Normalises one day from the Svenska Dagar 2.1 API (sholiday.faboul.se). */
export function parseSvenskaDagar(payload: unknown): SwedishDay[] {
  const dagar = (payload as { dagar?: unknown })?.dagar;
  if (!Array.isArray(dagar)) return [];
  const days: SwedishDay[] = [];
  for (const raw of dagar as RawSvenskaDag[]) {
    const date = String(raw?.datum || "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    const holidayName = String(raw?.helgdag || "").trim();
    days.push({
      date,
      weekday: String(raw?.veckodag || "").trim(),
      isWorkFree: yes(raw?.["arbetsfri dag"]),
      isRed: yes(raw?.["röd dag"]),
      ...(holidayName ? { holidayName } : {}),
    });
  }
  return days.sort((a, b) => a.date.localeCompare(b.date));
}

function isWeekend(day: SwedishDay): boolean {
  return day.weekday === "Lördag" || day.weekday === "Söndag";
}

/**
 * Named holidays plus derived klämdagar in [from, from+horizonDays].
 * Ordinary Sundays are red but unnamed, so they never show up — signal over
 * noise. A klämdag is a working weekday squeezed between two work-free days.
 */
export function upcomingPlanningHolidays(
  days: SwedishDay[],
  fromDate: string,
  horizonDays: number
): PlanningHoliday[] {
  const from = Date.parse(`${fromDate}T00:00:00Z`);
  if (!Number.isFinite(from)) return [];
  const to = from + horizonDays * 24 * 60 * 60 * 1000;
  const byDate = new Map(days.map((d) => [d.date, d]));
  const result: PlanningHoliday[] = [];

  for (const day of days) {
    const ts = Date.parse(`${day.date}T00:00:00Z`);
    if (!Number.isFinite(ts) || ts < from || ts > to) continue;

    if (day.holidayName && !(day.weekday === "Söndag" && !day.isRed)) {
      result.push({
        date: day.date,
        name: day.holidayName,
        kind: day.isRed ? "red" : "eve",
        weekday: day.weekday,
      });
      continue;
    }

    if (!day.isWorkFree && !isWeekend(day)) {
      const prev = byDate.get(shiftDate(day.date, -1));
      const next = byDate.get(shiftDate(day.date, 1));
      if (prev?.isWorkFree && next?.isWorkFree) {
        result.push({ date: day.date, name: "Klämdag", kind: "squeeze", weekday: day.weekday });
      }
    }
  }
  return result;
}

export function shiftDate(date: string, deltaDays: number): string {
  const ts = Date.parse(`${date}T00:00:00Z`);
  if (!Number.isFinite(ts)) return date;
  return new Date(ts + deltaDays * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/** Today's date in Sweden regardless of server timezone. */
export function todayInSweden(now = new Date()): string {
  return now.toLocaleDateString("sv-SE", { timeZone: "Europe/Stockholm" });
}

// --- Weather (Open-Meteo, WMO weather codes) ---

export type ForecastDay = {
  date: string;
  /** WMO weather code from Open-Meteo. */
  code: number;
  /** Stable summary key the client translates (sv/en). */
  summary: WeatherSummaryKey;
  tMax: number;
  tMin: number;
  precipitationProbability: number;
};

export type WeatherSummaryKey =
  | "clear"
  | "partly"
  | "overcast"
  | "fog"
  | "drizzle"
  | "rain"
  | "snow"
  | "showers"
  | "thunder";

export function wmoSummary(code: number): WeatherSummaryKey {
  if (code === 0) return "clear";
  if (code === 1 || code === 2) return "partly";
  if (code === 3) return "overcast";
  if (code === 45 || code === 48) return "fog";
  if (code >= 51 && code <= 57) return "drizzle";
  if (code >= 61 && code <= 67) return "rain";
  if (code >= 71 && code <= 77) return "snow";
  if (code >= 80 && code <= 82) return "showers";
  if (code === 85 || code === 86) return "snow";
  if (code >= 95) return "thunder";
  return "partly";
}

/** Normalises Open-Meteo's parallel daily arrays into one object per day. */
export function parseOpenMeteoDaily(payload: unknown): ForecastDay[] {
  const daily = (payload as { daily?: Record<string, unknown> })?.daily;
  const time = Array.isArray(daily?.time) ? (daily?.time as unknown[]) : [];
  const codes = Array.isArray(daily?.weather_code) ? (daily?.weather_code as unknown[]) : [];
  const tMax = Array.isArray(daily?.temperature_2m_max) ? (daily?.temperature_2m_max as unknown[]) : [];
  const tMin = Array.isArray(daily?.temperature_2m_min) ? (daily?.temperature_2m_min as unknown[]) : [];
  const precip = Array.isArray(daily?.precipitation_probability_max)
    ? (daily?.precipitation_probability_max as unknown[])
    : [];

  const days: ForecastDay[] = [];
  for (let i = 0; i < time.length; i++) {
    const date = String(time[i] || "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    const code = Number(codes[i]);
    days.push({
      date,
      code: Number.isFinite(code) ? code : 3,
      summary: wmoSummary(Number.isFinite(code) ? code : 3),
      tMax: Number(tMax[i]) || 0,
      tMin: Number(tMin[i]) || 0,
      precipitationProbability: Number(precip[i]) || 0,
    });
  }
  return days;
}

// --- FX (Frankfurter / ECB reference rates) ---

export type FxSnapshot = {
  date: string;
  eurSek: number | null;
  usdSek: number | null;
  /** Week-over-week change in percent (positive = SEK weakened). */
  eurSekWeekPct: number | null;
  usdSekWeekPct: number | null;
};

export function fxWeekChangePct(current: number | null, weekAgo: number | null): number | null {
  if (current == null || weekAgo == null || !Number.isFinite(current) || !Number.isFinite(weekAgo) || weekAgo === 0) {
    return null;
  }
  return Math.round(((current - weekAgo) / weekAgo) * 1000) / 10;
}

/** Frankfurter `latest?base=EUR&symbols=SEK,USD` → SEK per EUR/USD. */
export function parseFrankfurter(payload: unknown): { date: string; eurSek: number | null; usdSek: number | null } {
  const body = (payload ?? {}) as { date?: unknown; rates?: Record<string, unknown> };
  const sekPerEur = Number(body.rates?.SEK);
  const usdPerEur = Number(body.rates?.USD);
  return {
    date: String(body.date || ""),
    eurSek: Number.isFinite(sekPerEur) && sekPerEur > 0 ? Math.round(sekPerEur * 100) / 100 : null,
    usdSek:
      Number.isFinite(sekPerEur) && Number.isFinite(usdPerEur) && usdPerEur > 0
        ? Math.round((sekPerEur / usdPerEur) * 100) / 100
        : null,
  };
}
