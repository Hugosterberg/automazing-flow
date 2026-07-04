/**
 * Portfolio score week-over-week delta from marketing_snapshots rows.
 * Mirrors the client marketingTrend baseline logic (4–10 day window).
 */

export interface SnapshotTrendRow {
  snapshotDate: string;
  portfolioScore: number | null;
}

function daysBetween(a: string, b: string): number {
  return Math.abs((Date.parse(a) - Date.parse(b)) / 86_400_000);
}

export function portfolioScoreDeltaFromSnapshots(rows: SnapshotTrendRow[]): number | null {
  const sorted = [...rows]
    .filter((r) => r.snapshotDate)
    .sort((a, b) => Date.parse(b.snapshotDate) - Date.parse(a.snapshotDate));
  if (sorted.length === 0) return null;
  const current = sorted[0];
  if (current.portfolioScore == null) return null;

  let previous: SnapshotTrendRow | null = null;
  let bestDistance = Infinity;
  for (const s of sorted.slice(1)) {
    const gap = daysBetween(current.snapshotDate, s.snapshotDate);
    if (gap < 4 || gap > 10) continue;
    if (s.portfolioScore == null) continue;
    const distance = Math.abs(gap - 7);
    if (distance < bestDistance) {
      bestDistance = distance;
      previous = s;
    }
  }
  if (!previous || previous.portfolioScore == null) return null;
  return current.portfolioScore - previous.portfolioScore;
}
