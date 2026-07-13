/**
 * Aggregate follower history across a tenant's social accounts, from the
 * daily social_stats_snapshots rows. Pure — the Insights page feeds it rows.
 */

export interface SocialSnapshotRowLite {
  accountId: string;
  snapshotDate: string;
  followers: number | null;
}

export interface FollowerPoint {
  date: string;
  followers: number;
}

/**
 * Total followers per day, summed across accounts. Only days where every
 * follower-reporting account has a row are kept — a partially-captured day
 * would otherwise show as a false dip in the total.
 */
export function buildFollowerSeries(rows: SocialSnapshotRowLite[]): FollowerPoint[] {
  const reporting = new Set<string>();
  for (const row of rows) {
    if (row.followers != null) reporting.add(row.accountId);
  }
  if (reporting.size === 0) return [];

  const byDate = new Map<string, Map<string, number>>();
  for (const row of rows) {
    if (row.followers == null || !row.snapshotDate) continue;
    let day = byDate.get(row.snapshotDate);
    if (!day) {
      day = new Map();
      byDate.set(row.snapshotDate, day);
    }
    day.set(row.accountId, row.followers);
  }

  const points: FollowerPoint[] = [];
  for (const [date, day] of byDate) {
    if (day.size !== reporting.size) continue;
    let total = 0;
    for (const value of day.values()) total += value;
    points.push({ date, followers: total });
  }
  return points.sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
}
