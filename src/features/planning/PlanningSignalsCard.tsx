import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { CalendarHeart, TrendingDown, TrendingUp } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { formatDateCustom, formatNumber } from "@/lib/format";
import { usePlanningOverview } from "./usePlanningOverview";
import type { PlanningForecastDay, PlanningHoliday } from "./planningClient";

const WEATHER_EMOJI: Record<PlanningForecastDay["summary"], string> = {
  clear: "☀️",
  partly: "🌤️",
  overcast: "☁️",
  fog: "🌫️",
  drizzle: "🌦️",
  rain: "🌧️",
  snow: "🌨️",
  showers: "🌦️",
  thunder: "⛈️",
};

function holidayDate(holiday: PlanningHoliday): string {
  return formatDateCustom(`${holiday.date}T12:00:00`, {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

function FxDelta({ pct }: { pct: number | null }) {
  if (pct == null || pct === 0) return null;
  const up = pct > 0;
  const Icon = up ? TrendingUp : TrendingDown;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 tabular-nums",
        up ? "text-warning" : "text-success"
      )}
    >
      <Icon className="h-3 w-3" />
      {formatNumber(Math.abs(pct), { maximumFractionDigits: 1 })}%
    </span>
  );
}

/**
 * Quiet forward-planning card for Home: upcoming helgdagar/klämdagar (post
 * ideas + scheduling awareness), the week's weather for the profile's town,
 * and EUR/USD→SEK for e-commerce margins. All from free keyless APIs; the
 * card renders nothing when there is nothing useful to show.
 */
export function PlanningSignalsCard({
  location,
  showFx = true,
  horizonDays = 21,
}: {
  location?: string | null;
  showFx?: boolean;
  horizonDays?: number;
}) {
  const { t } = useTranslation("home");
  const { overview } = usePlanningOverview({ location, includeFx: showFx });

  const upcoming = useMemo(() => {
    if (!overview?.holidays?.length || !overview.today) return [];
    const limit = Date.parse(overview.today) + horizonDays * 24 * 60 * 60 * 1000;
    return overview.holidays.filter((h) => Date.parse(h.date) <= limit).slice(0, 3);
  }, [overview, horizonDays]);

  const weatherDays = overview?.weather?.days?.slice(0, 3) ?? [];
  const fx = showFx ? overview?.fx ?? null : null;

  if (upcoming.length === 0 && weatherDays.length === 0 && !fx) return null;

  return (
    <Card className="border-border/60">
      <CardContent className="space-y-2.5 p-3 sm:p-4">
        <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          <CalendarHeart className="h-3.5 w-3.5" />
          {t("planning.title")}
        </p>

        {upcoming.length > 0 ? (
          <ul className="space-y-1">
            {upcoming.map((holiday) => (
              <li key={holiday.date} className="flex items-baseline justify-between gap-2 text-sm">
                <span className="min-w-0 truncate">
                  {holiday.kind === "squeeze" ? t("planning.squeezeDay") : holiday.name}
                  {holiday.kind === "red" ? (
                    <span className="ml-1.5 rounded bg-destructive/10 px-1 text-[10px] font-medium text-destructive">
                      {t("planning.redDay")}
                    </span>
                  ) : null}
                </span>
                <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                  {holidayDate(holiday)}
                </span>
              </li>
            ))}
          </ul>
        ) : null}

        {weatherDays.length > 0 ? (
          <div className="flex items-center gap-3 border-t border-border/50 pt-2 text-sm">
            <span className="text-xs text-muted-foreground">{overview?.weather?.location}</span>
            {weatherDays.map((day) => (
              <span key={day.date} className="inline-flex items-center gap-1 tabular-nums" title={day.date}>
                <span aria-hidden>{WEATHER_EMOJI[day.summary]}</span>
                {Math.round(day.tMax)}°
                {day.precipitationProbability >= 60 ? (
                  <span className="text-[10px] text-info">{day.precipitationProbability}%</span>
                ) : null}
              </span>
            ))}
          </div>
        ) : null}

        {fx && (fx.eurSek != null || fx.usdSek != null) ? (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border/50 pt-2 text-xs text-muted-foreground">
            {fx.eurSek != null ? (
              <span className="inline-flex items-center gap-1.5 tabular-nums">
                EUR {formatNumber(fx.eurSek, { maximumFractionDigits: 2 })} kr
                <FxDelta pct={fx.eurSekWeekPct} />
              </span>
            ) : null}
            {fx.usdSek != null ? (
              <span className="inline-flex items-center gap-1.5 tabular-nums">
                USD {formatNumber(fx.usdSek, { maximumFractionDigits: 2 })} kr
                <FxDelta pct={fx.usdSekWeekPct} />
              </span>
            ) : null}
            <span>{t("planning.fxHint")}</span>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
