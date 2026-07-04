export interface CampaignSnapshot {
  snapshotDate: string;
  platform: "meta_business" | "google_ads";
  campaignId: string;
  campaignName: string;
  score: number | null;
  grade: string | null;
  roas: number | null;
  spend: number | null;
}

export interface CampaignTrend {
  key: string;
  platform: "meta_business" | "google_ads";
  campaignId: string;
  current: CampaignSnapshot | null;
  previous: CampaignSnapshot | null;
  scoreDelta: number | null;
  roasDelta: number | null;
  direction: "up" | "down" | "flat" | null;
  previousGrade: string | null;
}

function campaignKey(platform: string, campaignId: string): string {
  return `${platform}:${campaignId}`;
}

function daysBetween(a: string, b: string): number {
  return Math.abs((Date.parse(a) - Date.parse(b)) / 86_400_000);
}

function findBaseline(
  sorted: CampaignSnapshot[],
  currentDate: string,
): CampaignSnapshot | null {
  let previous: CampaignSnapshot | null = null;
  let bestDistance = Infinity;
  for (const s of sorted) {
    if (s.snapshotDate >= currentDate) continue;
    const gap = daysBetween(currentDate, s.snapshotDate);
    if (gap < 4 || gap > 10) continue;
    const distance = Math.abs(gap - 7);
    if (distance < bestDistance) {
      bestDistance = distance;
      previous = s;
    }
  }
  return previous;
}

/**
 * Week-over-week trend per campaign from daily snapshots. Compares the latest
 * row to the snapshot closest to 7 days earlier (4–10 day window).
 */
export function computeCampaignTrends(snapshots: CampaignSnapshot[]): Map<string, CampaignTrend> {
  const byKey = new Map<string, CampaignSnapshot[]>();
  for (const s of snapshots) {
    if (!s.snapshotDate || !s.campaignId) continue;
    const key = campaignKey(s.platform, s.campaignId);
    const list = byKey.get(key) ?? [];
    list.push(s);
    byKey.set(key, list);
  }

  const trends = new Map<string, CampaignTrend>();
  for (const [key, rows] of byKey) {
    const sorted = [...rows].sort((a, b) => Date.parse(b.snapshotDate) - Date.parse(a.snapshotDate));
    const current = sorted[0] ?? null;
    if (!current) continue;
    const previous = findBaseline(sorted, current.snapshotDate);

    const scoreDelta =
      current.score != null && previous?.score != null ? current.score - previous.score : null;
    const roasDelta =
      current.roas != null && previous?.roas != null ? current.roas - previous.roas : null;

    let direction: CampaignTrend["direction"] = null;
    if (scoreDelta != null) {
      direction = scoreDelta >= 8 ? "up" : scoreDelta <= -8 ? "down" : "flat";
    } else if (roasDelta != null) {
      direction = roasDelta > 0.05 ? "up" : roasDelta < -0.05 ? "down" : "flat";
    }

    const [platform, ...idParts] = key.split(":");
    trends.set(key, {
      key,
      platform: platform as CampaignTrend["platform"],
      campaignId: idParts.join(":"),
      current,
      previous,
      scoreDelta,
      roasDelta,
      direction,
      previousGrade: previous?.grade ?? null,
    });
  }
  return trends;
}

export function campaignTrendKey(platform: string, campaignId: string): string {
  return campaignKey(platform, campaignId);
}
