export interface MarketingSnapshot {
  snapshotDate: string; // YYYY-MM-DD
  adSpend: number | null;
  revenue: number | null;
  orders: number | null;
  roas: number | null;
  currency: string | null;
}

export interface MarketingTrend {
  current: MarketingSnapshot | null;
  previous: MarketingSnapshot | null;
  roasDelta: number | null;
  roasChangePct: number | null;
  spendChangePct: number | null;
  revenueChangePct: number | null;
  direction: "up" | "down" | "flat" | null;
}

function changePct(current: number | null, previous: number | null): number | null {
  if (current == null || previous == null || previous === 0) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

function daysBetween(a: string, b: string): number {
  return Math.abs((Date.parse(a) - Date.parse(b)) / 86_400_000);
}

/**
 * Week-over-week trend from daily snapshots: compares the latest snapshot to the
 * one closest to 7 days earlier (within a 4–10 day window so a missed day
 * doesn't break it). Returns nulls when there isn't enough history yet.
 */
export function computeMarketingTrend(snapshots: MarketingSnapshot[]): MarketingTrend {
  const empty: MarketingTrend = {
    current: null,
    previous: null,
    roasDelta: null,
    roasChangePct: null,
    spendChangePct: null,
    revenueChangePct: null,
    direction: null,
  };
  const sorted = [...snapshots]
    .filter((s) => s && s.snapshotDate)
    .sort((a, b) => Date.parse(b.snapshotDate) - Date.parse(a.snapshotDate));
  if (sorted.length === 0) return empty;

  const current = sorted[0];
  // Best baseline: the snapshot whose age relative to `current` is closest to 7
  // days, considering only those 4–10 days back.
  let previous: MarketingSnapshot | null = null;
  let bestDistance = Infinity;
  for (const s of sorted.slice(1)) {
    const gap = daysBetween(current.snapshotDate, s.snapshotDate);
    if (gap < 4 || gap > 10) continue;
    const distance = Math.abs(gap - 7);
    if (distance < bestDistance) {
      bestDistance = distance;
      previous = s;
    }
  }

  if (!previous) return { ...empty, current };

  const roasDelta = current.roas != null && previous.roas != null ? current.roas - previous.roas : null;
  const direction =
    roasDelta == null ? null : roasDelta > 0.05 ? "up" : roasDelta < -0.05 ? "down" : "flat";

  return {
    current,
    previous,
    roasDelta,
    roasChangePct: changePct(current.roas, previous.roas),
    spendChangePct: changePct(current.adSpend, previous.adSpend),
    revenueChangePct: changePct(current.revenue, previous.revenue),
    direction,
  };
}
