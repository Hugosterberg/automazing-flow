/**
 * Builds rows for social_stats_snapshots from connected_accounts rows.
 * Pure — the social-stats-snapshot cron upserts the result via the service role.
 *
 * Snapshots re-capture whatever is currently stored in
 * `connected_accounts.stats` (data the app already ingested); they never call
 * providers. `stats_updated_at` carries the blob's own refresh time so trend
 * readers can tell a fresh datapoint from a re-captured stale one.
 */

/** Platforms whose stats blob carries audience/review KPIs worth trending. */
export const SOCIAL_STATS_PLATFORMS: ReadonlySet<string> = new Set([
  "instagram",
  "tiktok",
  "youtube",
  "x",
  "facebook",
  "google_business",
  "whatsapp",
  "google_reviews",
  "tripadvisor",
]);

export interface SocialStatsSnapshotRow {
  business_profile_id: string;
  account_id: string;
  snapshot_date: string;
  platform: string;
  followers: number | null;
  following: number | null;
  media_count: number | null;
  avg_likes: number | null;
  avg_comments: number | null;
  avg_views: number | null;
  engagement_rate: number | null;
  average_rating: number | null;
  review_count: number | null;
  stats_updated_at: string | null;
}

export interface ConnectedAccountStatsRow {
  id: string;
  business_profile_id: string | null;
  platform: string;
  stats: Record<string, unknown> | null;
}

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * One snapshot row for an account, or null when there is nothing to record
 * (non-social platform, missing tenant, or a stats blob without any numeric
 * KPI — recording all-null rows would only pollute the history).
 */
export function buildSocialStatsSnapshotRow(
  account: ConnectedAccountStatsRow,
  snapshotDate: string,
): SocialStatsSnapshotRow | null {
  const businessProfileId = String(account.business_profile_id || "").trim();
  if (!businessProfileId) return null;
  const platform = String(account.platform || "");
  if (!SOCIAL_STATS_PLATFORMS.has(platform)) return null;
  const stats =
    account.stats && typeof account.stats === "object" && !Array.isArray(account.stats)
      ? account.stats
      : null;
  if (!stats) return null;

  const row: SocialStatsSnapshotRow = {
    business_profile_id: businessProfileId,
    account_id: account.id,
    snapshot_date: snapshotDate,
    platform,
    followers: num(stats.followersCount),
    following: num(stats.followingCount),
    media_count: num(stats.mediaCount),
    avg_likes: num(stats.avgLikes),
    avg_comments: num(stats.avgComments),
    avg_views: num(stats.avgViews),
    engagement_rate: num(stats.engagementRate),
    average_rating: num(stats.averageRating),
    review_count: num(stats.reviewCount),
    stats_updated_at:
      typeof stats.updatedAt === "string" && stats.updatedAt ? stats.updatedAt : null,
  };

  const hasMetric =
    row.followers != null ||
    row.following != null ||
    row.media_count != null ||
    row.avg_likes != null ||
    row.avg_comments != null ||
    row.avg_views != null ||
    row.engagement_rate != null ||
    row.average_rating != null ||
    row.review_count != null;
  return hasMetric ? row : null;
}
