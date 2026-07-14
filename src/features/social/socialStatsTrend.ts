/**
 * Week-over-week trend for a social account's KPI cards, computed from the
 * daily social_stats_snapshots the cron writes. Pure — the hook feeds it rows
 * and the component formats the deltas.
 */
import { formatNumber } from "@/lib/format";

export interface SocialStatsSnapshotPoint {
  /** ISO date (YYYY-MM-DD). */
  snapshotDate: string;
  followers: number | null;
  following: number | null;
  mediaCount: number | null;
  avgLikes: number | null;
  avgComments: number | null;
  avgViews: number | null;
  engagementRate: number | null;
  averageRating: number | null;
  reviewCount: number | null;
}

export type SocialTrendMetric =
  | "followers"
  | "following"
  | "mediaCount"
  | "avgLikes"
  | "avgComments"
  | "avgViews"
  | "engagementRate"
  | "averageRating"
  | "reviewCount";

const METRICS: SocialTrendMetric[] = [
  "followers",
  "following",
  "mediaCount",
  "avgLikes",
  "avgComments",
  "avgViews",
  "engagementRate",
  "averageRating",
  "reviewCount",
];

export interface SocialStatsTrend {
  latestDate: string;
  baselineDate: string;
  /** Whole days between baseline and latest snapshot (≥ 1). */
  spanDays: number;
  /** Latest value minus baseline value, per metric present in both snapshots. */
  deltas: Partial<Record<SocialTrendMetric, number>>;
}

const DAY_MS = 24 * 60 * 60 * 1000;
/** Target comparison window: one week back from the latest snapshot. */
const TARGET_SPAN_DAYS = 7;

function dateMs(isoDate: string): number {
  const ms = Date.parse(`${isoDate}T00:00:00Z`);
  return Number.isFinite(ms) ? ms : NaN;
}

/**
 * Compare the newest snapshot against the one closest to a week older: the
 * newest snapshot dated at least 7 days before the latest, else the oldest
 * available as long as it is a different day. Returns null until there are two
 * snapshots on different days — a single datapoint has no trend.
 */
export function computeSocialStatsTrend(
  snapshots: SocialStatsSnapshotPoint[]
): SocialStatsTrend | null {
  const sorted = snapshots
    .filter((s) => Number.isFinite(dateMs(s.snapshotDate)))
    .sort((a, b) => dateMs(b.snapshotDate) - dateMs(a.snapshotDate));
  if (sorted.length < 2) return null;

  const latest = sorted[0];
  const latestMs = dateMs(latest.snapshotDate);
  const targetMs = latestMs - TARGET_SPAN_DAYS * DAY_MS;
  const baseline =
    sorted.find((s) => dateMs(s.snapshotDate) <= targetMs) ?? sorted[sorted.length - 1];
  const baselineMs = dateMs(baseline.snapshotDate);
  if (baselineMs >= latestMs) return null;

  const deltas: Partial<Record<SocialTrendMetric, number>> = {};
  for (const metric of METRICS) {
    const now = latest[metric];
    const then = baseline[metric];
    if (now != null && then != null) deltas[metric] = now - then;
  }

  return {
    latestDate: latest.snapshotDate,
    baselineDate: baseline.snapshotDate,
    spanDays: Math.max(1, Math.round((latestMs - baselineMs) / DAY_MS)),
    deltas,
  };
}

/**
 * "+12 (7d)" / "−0.4% (7d)" — signed delta with the comparison window, for the
 * KPI card corner. Returns "" for a zero delta so the card stays quiet.
 */
export function formatStatChange(
  delta: number,
  spanDays: number,
  options: { decimals?: number; suffix?: string } = {}
): string {
  const decimals = options.decimals ?? 0;
  const rounded = Number(delta.toFixed(decimals));
  if (rounded === 0) return "";
  const abs = formatNumber(Math.abs(rounded), {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  const sign = rounded > 0 ? "+" : "−";
  return `${sign}${abs}${options.suffix ?? ""} (${spanDays}d)`;
}
