/**
 * Channel-aware benchmarks for Meta & Google Ads scoring.
 * Values are industry medians — used comparatively, not as absolute truth.
 */

import type { AdPlatform } from "./marketingPerformance.ts";

export type AdChannel =
  | "search"
  | "shopping"
  | "display"
  | "video"
  | "social"
  | "performance_max"
  | "unknown";

export interface ChannelBenchmark {
  label: string;
  /** Good CTR as a fraction (e.g. 0.025 = 2.5%). */
  ctrGood: number;
  ctrOk: number;
  /** Good conversion rate (clicks → conversions). */
  cvrGood: number;
  cvrOk: number;
  /** Frequency above this suggests creative fatigue (Meta). */
  frequencyWarn: number;
  frequencyBad: number;
}

const BENCHMARKS: Record<AdChannel, ChannelBenchmark> = {
  search: {
    label: "Google Search",
    ctrGood: 0.04,
    ctrOk: 0.025,
    cvrGood: 0.05,
    cvrOk: 0.025,
    frequencyWarn: 999,
    frequencyBad: 999,
  },
  shopping: {
    label: "Shopping",
    ctrGood: 0.012,
    ctrOk: 0.008,
    cvrGood: 0.025,
    cvrOk: 0.012,
    frequencyWarn: 999,
    frequencyBad: 999,
  },
  performance_max: {
    label: "Performance Max",
    ctrGood: 0.015,
    ctrOk: 0.009,
    cvrGood: 0.03,
    cvrOk: 0.015,
    frequencyWarn: 999,
    frequencyBad: 999,
  },
  display: {
    label: "Display",
    ctrGood: 0.006,
    ctrOk: 0.003,
    cvrGood: 0.012,
    cvrOk: 0.006,
    frequencyWarn: 999,
    frequencyBad: 999,
  },
  video: {
    label: "Video",
    ctrGood: 0.008,
    ctrOk: 0.004,
    cvrGood: 0.008,
    cvrOk: 0.004,
    frequencyWarn: 3,
    frequencyBad: 5,
  },
  social: {
    label: "Meta social",
    ctrGood: 0.015,
    ctrOk: 0.009,
    cvrGood: 0.025,
    cvrOk: 0.012,
    frequencyWarn: 3.5,
    frequencyBad: 5,
  },
  unknown: {
    label: "Annonser",
    ctrGood: 0.012,
    ctrOk: 0.007,
    cvrGood: 0.02,
    cvrOk: 0.01,
    frequencyWarn: 4,
    frequencyBad: 6,
  },
};

export function detectAdChannel(objective: string | undefined, platform: AdPlatform): AdChannel {
  const obj = String(objective || "").toUpperCase().replace(/^OUTCOME_/, "");
  if (platform === "google_ads") {
    if (obj.includes("SEARCH")) return "search";
    if (obj.includes("SHOPPING")) return "shopping";
    if (obj.includes("PERFORMANCE_MAX")) return "performance_max";
    if (obj.includes("DISPLAY")) return "display";
    if (obj.includes("VIDEO")) return "video";
    return "unknown";
  }
  if (/SALES|CONVERSIONS|CATALOG|TRAFFIC|ENGAGEMENT|LEAD/i.test(obj)) return "social";
  if (/AWARENESS|REACH|VIDEO/i.test(obj)) return "video";
  return "social";
}

export function channelBenchmark(channel: AdChannel): ChannelBenchmark {
  return BENCHMARKS[channel] ?? BENCHMARKS.unknown;
}

export function scoreAgainstBenchmark(
  value: number | null,
  good: number,
  ok: number,
  higherIsBetter = true,
): number {
  if (value == null || !Number.isFinite(value)) return 50;
  if (higherIsBetter) {
    if (value >= good) return 95;
    if (value >= ok) return 75;
    if (value >= ok * 0.6) return 55;
    return 35;
  }
  if (value <= good) return 95;
  if (value <= ok) return 75;
  if (value <= ok * 1.4) return 55;
  return 30;
}
