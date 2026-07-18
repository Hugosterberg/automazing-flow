/**
 * GET /api/planning/overview — forward-looking planning signals from free,
 * keyless APIs: upcoming Swedish holidays/klämdagar (content planning +
 * schedule warnings), a 7-day forecast for the profile's town (optional
 * `location` query), and EUR/USD→SEK with week deltas. Everything degrades
 * to null/[] so the dashboard never breaks on an upstream hiccup.
 */

import {
  fetchFxSnapshot,
  fetchSwedishDaysAhead,
  fetchWeatherForLocation,
} from "../providers/planningData.ts";
import { upcomingPlanningHolidays } from "../lib/planningSignals.ts";

interface PlanningRoutesDeps {
  getSessionUserId: (req: unknown) => string | null;
}

/** Long enough for schedule-collision checks ~4 months out. */
const HOLIDAY_HORIZON_DAYS = 120;

export function registerPlanningRoutes(app, deps: PlanningRoutesDeps) {
  const { getSessionUserId } = deps;

  app.get("/api/planning/overview", async (req, res) => {
    const userId = getSessionUserId(req);
    if (!userId) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const location = String(req.query?.location || "").trim();
    const includeFx = String(req.query?.fx || "") !== "0";

    const [holidayData, weather, fx] = await Promise.all([
      fetchSwedishDaysAhead(HOLIDAY_HORIZON_DAYS),
      location ? fetchWeatherForLocation(location) : Promise.resolve(null),
      includeFx ? fetchFxSnapshot() : Promise.resolve(null),
    ]);

    const holidays = upcomingPlanningHolidays(
      holidayData.days,
      holidayData.from,
      HOLIDAY_HORIZON_DAYS
    );

    return res.json({
      today: holidayData.from,
      holidays,
      weather,
      fx,
    });
  });
}
