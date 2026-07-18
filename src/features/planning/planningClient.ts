import { apiUrl } from "@/lib/apiBase";
import { fetchWithTimeout } from "@/lib/fetchWithTimeout";

export type PlanningHoliday = {
  date: string;
  name: string;
  kind: "red" | "eve" | "squeeze";
  weekday: string;
};

export type PlanningForecastDay = {
  date: string;
  code: number;
  summary:
    | "clear"
    | "partly"
    | "overcast"
    | "fog"
    | "drizzle"
    | "rain"
    | "snow"
    | "showers"
    | "thunder";
  tMax: number;
  tMin: number;
  precipitationProbability: number;
};

export type PlanningOverview = {
  today: string;
  holidays: PlanningHoliday[];
  weather: { location: string; days: PlanningForecastDay[] } | null;
  fx: {
    date: string;
    eurSek: number | null;
    usdSek: number | null;
    eurSekWeekPct: number | null;
    usdSekWeekPct: number | null;
  } | null;
};

const EMPTY: PlanningOverview = { today: "", holidays: [], weather: null, fx: null };

export async function fetchPlanningOverview(options: {
  location?: string | null;
  includeFx?: boolean;
}): Promise<PlanningOverview> {
  const params = new URLSearchParams();
  if (options.location?.trim()) params.set("location", options.location.trim());
  if (options.includeFx === false) params.set("fx", "0");
  const query = params.toString() ? `?${params.toString()}` : "";
  const res = await fetchWithTimeout(apiUrl(`/api/planning/overview${query}`), {
    credentials: "include",
  });
  if (!res.ok) return EMPTY;
  const body = (await res.json().catch(() => null)) as PlanningOverview | null;
  if (!body || !Array.isArray(body.holidays)) return EMPTY;
  return body;
}
