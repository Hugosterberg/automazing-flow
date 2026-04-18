/**
 * Best-effort parallel fetches against Zernio REST paths (aligned with zernio-php SDK docs).
 *
 * All calls are optional: failures and 402/403 do not throw — we surface
 * informational notes in `zernioEnrichmentNotes` instead so the UI can explain
 * gaps ("feature requires add-on", etc.).
 *
 * Goes through the shared `ZernioModule` gateway so auth headers, error
 * envelopes, and (later) rate-limiting/retries live in one place.
 */

import type { ZernioModule } from "./zernioModule.ts";

export type ZernioEnrichmentOptions = {
  platform?: string;
  zernioPlatform?: string;
};

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function platformBlob(opts?: ZernioEnrichmentOptions): string {
  return String(opts?.zernioPlatform || opts?.platform || "").toLowerCase();
}

/** Zernio analytics "platform" query value for posting-frequency. */
function analyticsPlatformParam(blob: string): string | null {
  const s = blob.toLowerCase();
  if (s.includes("instagram")) return "instagram";
  if (s.includes("tiktok")) return "tiktok";
  if (s.includes("youtube")) return "youtube";
  if (s.includes("facebook") || s.includes("pages")) return "facebook";
  if (s.includes("linkedin")) return "linkedin";
  if (s === "x" || s.includes("twitter")) return "twitter";
  return null;
}

type EnrichmentJob = { key: string; path: string; label: string };

export async function fetchZernioAccountEnrichment(
  zernio: ZernioModule,
  zernioAccountId: string,
  opts?: ZernioEnrichmentOptions
): Promise<{ zernioExtra: Record<string, unknown>; zernioEnrichmentNotes: string[] }> {
  const enc = encodeURIComponent(String(zernioAccountId));
  const blob = platformBlob(opts);
  const notes: string[] = [];
  const extra: Record<string, unknown> = {};

  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - 30);
  const fromStr = isoDate(from);
  const toStr = isoDate(to);

  const jobs: EnrichmentJob[] = [
    { key: "accountHealth", path: `/accounts/${enc}/health`, label: "Account health" },
    {
      key: "followerStats",
      path: `/accounts/follower-stats?account_ids=${enc}&granularity=daily`,
      label: "Follower stats",
    },
    {
      key: "dailyMetrics",
      path: `/analytics/daily-metrics?account_id=${enc}&from_date=${fromStr}&to_date=${toStr}`,
      label: "Daily metrics",
    },
    {
      key: "inboxComments",
      path: `/inbox/comments?account_id=${enc}&limit=25&sort_order=desc`,
      label: "Comment inbox",
    },
    {
      key: "inboxReviews",
      path: `/inbox/reviews?account_id=${enc}&limit=15&sort_order=desc`,
      label: "Review inbox",
    },
  ];

  if (blob.includes("tiktok")) {
    jobs.push({
      key: "tiktokCreatorInfo",
      path: `/accounts/${enc}/tiktok/creator-info?media_type=video`,
      label: "TikTok creator info",
    });
  }
  if (blob.includes("instagram")) {
    jobs.push({
      key: "instagramAccountInsights",
      path: `/analytics/instagram/account-insights?account_id=${enc}`,
      label: "Instagram account insights",
    });
  }
  if (blob.includes("youtube")) {
    jobs.push({
      key: "youtubeDemographics",
      path: `/analytics/youtube/demographics?account_id=${enc}`,
      label: "YouTube demographics",
    });
  }
  if (blob.includes("linkedin")) {
    jobs.push({
      key: "linkedInAggregateAnalytics",
      path: `/accounts/${enc}/linkedin-aggregate-analytics`,
      label: "LinkedIn aggregate analytics",
    });
  }
  if (
    blob.includes("google_business") ||
    blob.includes("google-business") ||
    blob.includes("googlebusiness") ||
    (blob.includes("google") && blob.includes("business")) ||
    blob.includes("gbp")
  ) {
    jobs.push({
      key: "gmbReviews",
      path: `/accounts/${enc}/gmb-reviews`,
      label: "Google Business reviews",
    });
    jobs.push({
      key: "gmbLocationDetails",
      path: `/accounts/${enc}/gmb-location-details`,
      label: "Google Business location",
    });
  }

  const ap = analyticsPlatformParam(blob);
  if (ap) {
    jobs.push({
      key: "postingFrequency",
      path: `/analytics/posting-frequency?platform=${encodeURIComponent(ap)}`,
      label: "Posting frequency",
    });
  }

  async function runJob(job: EnrichmentJob) {
    const result = await zernio.get(job.path);
    if (result.status === 402 || result.status === 403) {
      notes.push(`${job.label} requires an add-on or permission (HTTP ${result.status}).`);
      return;
    }
    if (!result.ok) return;
    if (result.data != null) extra[job.key] = result.data;
  }

  await Promise.all(jobs.map((j) => runJob(j)));

  return { zernioExtra: extra, zernioEnrichmentNotes: notes };
}
