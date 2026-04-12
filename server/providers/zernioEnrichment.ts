/**
 * Best-effort parallel fetches against Zernio REST paths (aligned with zernio-php SDK docs).
 * All calls are optional: failures and 402/403 do not throw.
 */

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

type EnrichmentJob = { key: string; url: string; label: string };

export async function fetchZernioAccountEnrichment(
  apiBase: string,
  headers: Record<string, string>,
  zernioAccountId: string,
  opts?: ZernioEnrichmentOptions
): Promise<{ zernioExtra: Record<string, unknown>; zernioEnrichmentNotes: string[] }> {
  const base = apiBase.replace(/\/$/, "");
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
    { key: "accountHealth", url: `${base}/accounts/${enc}/health`, label: "Account health" },
    {
      key: "followerStats",
      url: `${base}/accounts/follower-stats?account_ids=${enc}&granularity=daily`,
      label: "Follower stats",
    },
    {
      key: "dailyMetrics",
      url: `${base}/analytics/daily-metrics?account_id=${enc}&from_date=${fromStr}&to_date=${toStr}`,
      label: "Daily metrics",
    },
    {
      key: "inboxComments",
      url: `${base}/inbox/comments?account_id=${enc}&limit=25&sort_order=desc`,
      label: "Comment inbox",
    },
    {
      key: "inboxReviews",
      url: `${base}/inbox/reviews?account_id=${enc}&limit=15&sort_order=desc`,
      label: "Review inbox",
    },
  ];

  if (blob.includes("tiktok")) {
    jobs.push({
      key: "tiktokCreatorInfo",
      url: `${base}/accounts/${enc}/tiktok/creator-info?media_type=video`,
      label: "TikTok creator info",
    });
  }
  if (blob.includes("instagram")) {
    jobs.push({
      key: "instagramAccountInsights",
      url: `${base}/analytics/instagram/account-insights?account_id=${enc}`,
      label: "Instagram account insights",
    });
  }
  if (blob.includes("youtube")) {
    jobs.push({
      key: "youtubeDemographics",
      url: `${base}/analytics/youtube/demographics?account_id=${enc}`,
      label: "YouTube demographics",
    });
  }
  if (blob.includes("linkedin")) {
    jobs.push({
      key: "linkedInAggregateAnalytics",
      url: `${base}/accounts/${enc}/linkedin-aggregate-analytics`,
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
      url: `${base}/accounts/${enc}/gmb-reviews`,
      label: "Google Business reviews",
    });
    jobs.push({
      key: "gmbLocationDetails",
      url: `${base}/accounts/${enc}/gmb-location-details`,
      label: "Google Business location",
    });
  }

  const ap = analyticsPlatformParam(blob);
  if (ap) {
    jobs.push({
      key: "postingFrequency",
      url: `${base}/analytics/posting-frequency?platform=${encodeURIComponent(ap)}`,
      label: "Posting frequency",
    });
  }

  async function runJob(job: EnrichmentJob) {
    try {
      const res = await fetch(job.url, { headers });
      if (res.status === 402 || res.status === 403) {
        notes.push(`${job.label} requires an add-on or permission (HTTP ${res.status}).`);
        return;
      }
      if (!res.ok) return;
      const data: unknown = await res.json().catch(() => null);
      if (data != null) extra[job.key] = data;
    } catch {
      // ignore
    }
  }

  await Promise.all(jobs.map((j) => runJob(j)));

  return { zernioExtra: extra, zernioEnrichmentNotes: notes };
}
