/**
 * Free, keyless planning data sources:
 *  - Svenska Dagar 2.1 (sholiday.faboul.se) — helgdagar/röda dagar
 *  - Open-Meteo geocoding + daily forecast — weather for the profile's town
 *  - Frankfurter (ECB reference rates) — EUR/USD vs SEK
 *
 * All responses are cached in-memory with generous TTLs: the data changes at
 * most daily, external calls stay rare, and a cold serverless instance simply
 * refetches. Every function degrades to null/[] on failure — planning signals
 * must never break a page.
 */

import {
  parseFrankfurter,
  parseOpenMeteoDaily,
  parseSvenskaDagar,
  fxWeekChangePct,
  shiftDate,
  todayInSweden,
  type FxSnapshot,
  type ForecastDay,
  type SwedishDay,
} from "../lib/planningSignals.ts";

const FETCH_TIMEOUT_MS = 8_000;

type CacheEntry<T> = { value: T; expiresAt: number };
const cache = new Map<string, CacheEntry<unknown>>();

async function cached<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
  const hit = cache.get(key) as CacheEntry<T> | undefined;
  if (hit && hit.expiresAt > Date.now()) return hit.value;
  const value = await load();
  cache.set(key, { value, expiresAt: Date.now() + ttlMs });
  return value;
}

async function fetchJson(url: string): Promise<unknown | null> {
  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json", "User-Agent": "automazing.life planning" },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/** Full-year Swedish day list; cached 24h per year. */
export async function fetchSwedishYear(year: number): Promise<SwedishDay[]> {
  if (!Number.isInteger(year) || year < 2000 || year > 2100) return [];
  return cached(`sv-dagar:${year}`, 24 * 60 * 60 * 1000, async () => {
    const payload = await fetchJson(`https://sholiday.faboul.se/dagar/v2.1/${year}`);
    return parseSvenskaDagar(payload);
  });
}

/**
 * Day list covering [today, today + horizonDays] — spans the year boundary
 * when the horizon reaches into the next year.
 */
export async function fetchSwedishDaysAhead(horizonDays: number): Promise<{ from: string; days: SwedishDay[] }> {
  const from = todayInSweden();
  const startYear = Number(from.slice(0, 4));
  const endYear = Number(shiftDate(from, horizonDays).slice(0, 4));
  const years = startYear === endYear ? [startYear] : [startYear, endYear];
  const lists = await Promise.all(years.map((y) => fetchSwedishYear(y)));
  return { from, days: lists.flat() };
}

/** Town/city name → coordinates via Open-Meteo geocoding; cached 7 days. */
export async function geocodeLocation(
  location: string
): Promise<{ latitude: number; longitude: number; name: string } | null> {
  const query = location.trim().slice(0, 80);
  if (!query) return null;
  return cached(`geocode:${query.toLowerCase()}`, 7 * 24 * 60 * 60 * 1000, async () => {
    const payload = await fetchJson(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=1&language=sv`
    );
    const first = (payload as { results?: Array<Record<string, unknown>> })?.results?.[0];
    const latitude = Number(first?.latitude);
    const longitude = Number(first?.longitude);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
    return { latitude, longitude, name: String(first?.name || query) };
  });
}

/** 7-day daily forecast for a location string; cached 1h per rounded coordinate. */
export async function fetchWeatherForLocation(
  location: string
): Promise<{ location: string; days: ForecastDay[] } | null> {
  const geo = await geocodeLocation(location);
  if (!geo) return null;
  const lat = Math.round(geo.latitude * 100) / 100;
  const lon = Math.round(geo.longitude * 100) / 100;
  const days = await cached(`forecast:${lat},${lon}`, 60 * 60 * 1000, async () => {
    const payload = await fetchJson(
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
        `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max` +
        `&timezone=Europe%2FStockholm&forecast_days=7`
    );
    return parseOpenMeteoDaily(payload);
  });
  if (days.length === 0) return null;
  return { location: geo.name, days };
}

/** Latest EUR/USD→SEK with week-over-week change; cached 6h. */
export async function fetchFxSnapshot(): Promise<FxSnapshot | null> {
  return cached("fx:sek", 6 * 60 * 60 * 1000, async () => {
    const latest = parseFrankfurter(
      await fetchJson("https://api.frankfurter.dev/v1/latest?base=EUR&symbols=SEK,USD")
    );
    if (!latest.date || (latest.eurSek == null && latest.usdSek == null)) return null;
    const weekAgoDate = shiftDate(latest.date, -7);
    const weekAgo = parseFrankfurter(
      await fetchJson(`https://api.frankfurter.dev/v1/${weekAgoDate}?base=EUR&symbols=SEK,USD`)
    );
    return {
      date: latest.date,
      eurSek: latest.eurSek,
      usdSek: latest.usdSek,
      eurSekWeekPct: fxWeekChangePct(latest.eurSek, weekAgo.eurSek),
      usdSekWeekPct: fxWeekChangePct(latest.usdSek, weekAgo.usdSek),
    };
  });
}
