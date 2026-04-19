/* eslint-disable @typescript-eslint/no-explicit-any --
 * This handler normalises dynamic payloads from many Zernio-backed providers
 * (Facebook, Instagram, WhatsApp, Google Business, etc.). Each provider
 * returns differently-shaped JSON and we walk through `.data`, `.analytics`,
 * `.metrics`, `.posts`, etc. by convention. Casting every step to
 * `Record<string, unknown>` would make the code significantly harder to read
 * without improving runtime safety, so we accept `any` locally here.
 */

/**
 * Zernio generic account-data handler.
 *
 * Triggers when a stored account is marked `isZernio` and has a
 * `zernioAccountId`. Covers three sub-flows:
 *   1. Zernio-fronted calendars → empty shell (calendars sync via official OAuth)
 *   2. WhatsApp → templates + business profile (no follower analytics exist)
 *   3. Default → analytics + posts + enrichment, with a listAccounts() fallback
 *      for providers that return sparse analytics (e.g. Facebook).
 *
 * Also post-processes the payload for Google Business Profile to surface
 * reviews/ratings from the enrichment extras.
 */

import { calculateEngagementFromPosts } from "../analytics/socialMetrics.ts";
import { fetchZernioAccountEnrichment } from "../providers/zernioEnrichment.ts";
import { buildGoogleBusinessPanelFromZernioExtra } from "../providers/googleBusinessProfile.ts";
import type { ZernioModule } from "../providers/zernioModule.ts";
import type { PlatformHandlerResult } from "./types.ts";

/**
 * Zernio's `/accounts/follower-stats` response shape varies by tenant/version.
 * Walk the JSON looking for objects that carry follower-like fields and return
 * the largest plausible positive integer (avoids picking tiny IDs from nested
 * structures when multiple numbers exist).
 */
function pickFollowersFromFollowerStatsPayload(body: unknown): number | undefined {
  const candidates: number[] = [];
  const visit = (node: unknown, depth: number): void => {
    if (depth > 10 || node == null) return;
    if (Array.isArray(node)) {
      for (const el of node) visit(el, depth + 1);
      return;
    }
    if (typeof node !== "object") return;
    const o = node as Record<string, unknown>;
    const keys = Object.keys(o).map((k) => k.toLowerCase());
    const followerLikeKey = keys.some((kl) =>
      ["followers_count", "followerscount", "fan_count", "fancount", "total_followers"].includes(kl)
    );
    if (followerLikeKey) {
      const raw =
        o.followers_count ??
        o.followersCount ??
        o.fan_count ??
        o.fanCount ??
        o.total_followers ??
        (typeof o.followers === "number" ? o.followers : undefined);
      const n = raw != null ? Number(raw) : NaN;
      if (Number.isFinite(n) && n > 0 && n < 1_000_000_000) candidates.push(n);
    }
    for (const v of Object.values(o)) visit(v, depth + 1);
  };
  visit(body, 0);
  return candidates.length > 0 ? Math.max(...candidates) : undefined;
}

function pickAccountRowId(a: unknown): string | null {
  if (!a || typeof a !== "object") return null;
  const row = a as Record<string, unknown>;
  const id = row._id ?? row.id ?? row.accountId;
  return id != null && String(id).trim() !== "" ? String(id) : null;
}

/** Best-effort: positive fan / follower count from a Zernio account row or GET /accounts/:id body. */
function extractPositiveFollowersFromAccountRow(acc: unknown): number | undefined {
  if (!acc || typeof acc !== "object") return undefined;
  const a = acc as Record<string, any>;
  const meta = a.metadata && typeof a.metadata === "object" ? (a.metadata as Record<string, any>) : {};
  const nestedPd =
    meta.profileData && typeof meta.profileData === "object" ? (meta.profileData as Record<string, any>) : null;
  const candidates: unknown[] = [
    nestedPd?.fan_count,
    nestedPd?.fanCount,
    nestedPd?.followersCount,
    nestedPd?.follower_count,
    nestedPd?.fans,
    meta.fan_count,
    meta.fanCount,
    meta.followersCount,
    meta.follower_count,
    meta.fans,
    a.fan_count,
    a.fanCount,
    a.followers_count,
    a.followersCount,
    a.fans,
    a.globalBrandPageLikeCount,
    nestedPd?.likes,
    a.likes,
  ];
  for (const raw of candidates) {
    if (raw == null || raw === "") continue;
    const n = Number(raw);
    if (Number.isFinite(n) && n > 0 && n < 1_000_000_000) return n;
  }
  return undefined;
}

/**
 * Strict id match first; for Facebook, fall back to the only (or username-matched)
 * Facebook row when Zernio's callback id does not match list payload shape.
 */
function resolveZernioAccountForFollowers(
  accountsList: unknown[],
  zid: string,
  isFacebook: boolean,
  storedUsername?: string
): unknown | null {
  const strict =
    accountsList.find((raw) => {
      if (!raw || typeof raw !== "object") return false;
      const a = raw as Record<string, unknown>;
      const idHit =
        String(a._id ?? a.id ?? a.accountId ?? "") === String(zid) ||
        String((a.profileId as Record<string, unknown> | undefined)?._id ?? a.profileId ?? "") === String(zid);
      return idHit;
    }) ?? null;
  if (strict && pickAccountRowId(strict)) return strict;
  if (!isFacebook) return null;
  const fbRows = accountsList.filter((raw) => {
    if (!raw || typeof raw !== "object") return false;
    const a = raw as Record<string, unknown>;
    const p = String(a.platform ?? a.type ?? a.provider ?? a.channel ?? "").toLowerCase();
    return p.includes("facebook") || p.includes("pages") || p === "fb";
  });
  if (fbRows.length === 1) return fbRows[0];
  const u = String(storedUsername || "")
    .trim()
    .replace(/^@/, "")
    .toLowerCase();
  if (u) {
    const byName = fbRows.find((raw) => {
      const a = raw as Record<string, unknown>;
      const name = String(a.username ?? a.name ?? a.displayName ?? a.handle ?? "")
        .trim()
        .replace(/^@/, "")
        .toLowerCase();
      return name.length > 0 && name === u;
    });
    if (byName) return byName;
  }
  return fbRows[0] ?? null;
}

interface ZernioGenericHandlerArgs {
  zernio: ZernioModule;
  stored: Record<string, any>;
  platform: string | null | undefined;
  zernioAccountId: string | null | undefined;
  zernioPlatform: string | null | undefined;
  getZernioApiKey: () => string;
}

export async function handleZernioGenericAccountData({
  zernio,
  stored,
  platform,
  zernioAccountId,
  zernioPlatform,
  getZernioApiKey,
}: ZernioGenericHandlerArgs): Promise<PlatformHandlerResult> {
  const zid = String(zernioAccountId);
  const whatsAppLike =
    platform === "whatsapp" || String(zernioPlatform || "").toLowerCase().includes("whatsapp");
  const zernioCalendarLike =
    platform === "google_calendar" ||
    platform === "outlook_calendar" ||
    String(zernioPlatform || "").toLowerCase().includes("calendar");

  if (zernioCalendarLike) {
    return {
      kind: "json",
      body: {
        source: "zernio",
        events: [],
        calendars: [],
        note:
          "This Zernio tenant did not return calendar events for this account yet. Use Official API connect for live event sync.",
      },
    };
  }

  if (whatsAppLike) {
    const [tplResult, bpResult] = await Promise.all([
      zernio.getWhatsappTemplates(zid),
      zernio.getWhatsappBusinessProfile(zid),
    ]);
    const templatesData: any = tplResult.ok ? tplResult.data : {};
    const bpData: any = bpResult.ok ? bpResult.data : {};
    const templates =
      templatesData.templates ??
      templatesData.data?.templates ??
      (Array.isArray(templatesData.data) ? templatesData.data : []);
    const bp =
      bpData.businessProfile ??
      bpData.data?.businessProfile ??
      bpData.profile ??
      bpData.data ??
      {};
    const list = Array.isArray(templates) ? templates : [];
    const media = list.slice(0, 40).map((t, i) => ({
      id: String(t.id || t.name || i),
      caption: `[WhatsApp template] ${t.name || "unnamed"} — ${t.status || "?"} (${t.language || "?"})`,
      picture: "",
      permalink: "",
      mediaType: "whatsapp_template",
      likeCount: 0,
      commentCount: 0,
      createdTime: t.updatedAt || t.createdAt || "",
    }));
    const stats = {
      mediaCount: list.length,
      accountType: "WHATSAPP_BUSINESS",
      updatedAt: new Date().toISOString(),
      zernioNote:
        "WhatsApp has no follower/post analytics in the API; showing approved templates and business profile. See Zernio WhatsApp docs.",
    };
    return {
      kind: "json",
      body: {
        profile: {
          username: stored.username || zid,
          displayName: bp.description || bp.about || stored.displayName,
          ...bp,
        },
        stats,
        media,
        source: "zernio",
      },
    };
  }

  let zernioNote;
  const anResult = await zernio.getAnalytics(zid);
  let an: any = {};
  if (anResult.ok) {
    an = anResult.data;
  } else if (anResult.status === 402 || anResult.status === 403) {
    zernioNote =
      "Zernio analytics may require a plan add-on, or this channel has limited metrics.";
  }

  const root = an.data ?? an;
  const data = root.analytics ?? root.metrics ?? root;
  const followersCount =
    data.followersCount ??
    data.followers ??
    data.followerCount ??
    data.follower_count ??
    data.fan_count ??
    data.fanCount ??
    data.fans;
  const followingCount =
    data.followingCount ?? data.following ?? data.following_count;
  const mediaCount =
    data.postsCount ??
    data.mediaCount ??
    data.postCount ??
    data.videoCount ??
    data.videos_count;

  const recent =
    data.recentPosts ??
    data.posts ??
    data.media ??
    data.items ??
    [];

  const media = Array.isArray(recent)
    ? recent.slice(0, 25).map((p, i) => ({
        id: String(p.id || p.postId || i),
        caption: String(p.caption ?? p.text ?? p.title ?? p.description ?? "").slice(0, 2000),
        picture: String(p.imageUrl ?? p.thumbnailUrl ?? p.media_url ?? p.thumbnail_url ?? ""),
        permalink: String(p.url ?? p.permalink ?? p.platformPostUrl ?? ""),
        mediaType: String(p.type || p.mediaType || "post"),
        likeCount: Number(p.likeCount ?? p.likes ?? p.like_count ?? 0) || 0,
        commentCount: Number(p.commentCount ?? p.comments ?? p.comment_count ?? 0) || 0,
        createdTime: String(p.createdAt ?? p.timestamp ?? p.created_time ?? ""),
      }))
    : [];

  const stats: any = {
    followersCount: followersCount != null ? Number(followersCount) : undefined,
    followingCount: followingCount != null ? Number(followingCount) : undefined,
    mediaCount:
      mediaCount != null
        ? Number(mediaCount)
        : media.length > 0
          ? media.length
          : undefined,
    updatedAt: new Date().toISOString(),
    ...(zernioNote ? { zernioNote } : {}),
  };

  let fallbackMedia: any[] = media;
  let fallbackStats: any = stats;
  const hasStats =
    stats.followersCount != null || stats.mediaCount != null || media.length > 0;

  const platformBlob = String(platform || zernioPlatform || "").toLowerCase();
  const isFacebookLike = platform === "facebook" || platformBlob.includes("facebook");
  const hasPostSignal =
    (stats.mediaCount != null && Number(stats.mediaCount) > 0) || media.length > 0;
  const analyticsFollowersNum =
    stats.followersCount != null ? Number(stats.followersCount) : NaN;
  // Zernio's /analytics often returns `followersCount: 0` (or omits it) for
  // Facebook Pages while still returning post counts — that made `hasStats`
  // truthy so we skipped the listAccounts() fallback entirely, and the UI
  // showed "0 followers" even though the account object carries `fan_count`.
  const facebookNeedsProfileFollowers =
    isFacebookLike &&
    hasPostSignal &&
    (!Number.isFinite(analyticsFollowersNum) || analyticsFollowersNum === 0);

  // Fallback for sparse analytics, or Facebook when follower count is missing/zero
  // but posts exist (analytics payload is unreliable for Page fan counts).
  if (!hasStats || facebookNeedsProfileFollowers) {
    try {
      // Many Zernio tenants expose full Page stats on GET /accounts/:id even when
      // /analytics omits fan_count — try before listAccounts + id heuristics.
      if (facebookNeedsProfileFollowers) {
        const detailRes = await zernio.get(`/accounts/${encodeURIComponent(zid)}`);
        if (detailRes.ok && detailRes.data && typeof detailRes.data === "object") {
          const body = detailRes.data as Record<string, any>;
          const node = body.data ?? body.account ?? body;
          const fromDetail = extractPositiveFollowersFromAccountRow(node);
          if (fromDetail != null) {
            fallbackStats = {
              ...fallbackStats,
              followersCount: fromDetail,
              updatedAt: new Date().toISOString(),
            };
          }
        }
      }

      const accountsResult = await zernio.listAccounts();
      if (accountsResult.ok) {
        const accountsList = accountsResult.accounts as unknown[];
        const acc = resolveZernioAccountForFollowers(
          accountsList,
          zid,
          isFacebookLike,
          stored?.username
        ) as Record<string, any> | null;
        const postsAccountId = acc ? pickAccountRowId(acc) : null;
        if (postsAccountId) {
          let posts: any[] = [];
          const postsResult = await zernio.listAccountPosts(postsAccountId, {
            limit: 50,
          });
          if (postsResult.ok) {
            const postsBody: any = postsResult.data;
            posts = Array.isArray(postsBody.posts)
              ? postsBody.posts
              : Array.isArray(postsBody.data)
                ? postsBody.data
                : Array.isArray(postsBody.items)
                  ? postsBody.items
                  : [];
          }

          const meta =
            acc?.metadata && typeof acc.metadata === "object" ? (acc.metadata as Record<string, any>) : {};
          const nestedPd =
            meta.profileData && typeof meta.profileData === "object" ? meta.profileData : null;
          // Prefer nested Graph-style profileData, then metadata root, then account row.
          const followersRaw =
            nestedPd?.followersCount ??
            nestedPd?.follower_count ??
            nestedPd?.fan_count ??
            nestedPd?.fanCount ??
            nestedPd?.fans ??
            nestedPd?.likes ??
            meta.followersCount ??
            meta.follower_count ??
            meta.fan_count ??
            meta.fanCount ??
            meta.fans ??
            acc?.followers_count ??
            acc?.followersCount ??
            acc?.fan_count ??
            acc?.fanCount ??
            acc?.fans;
          const followingRaw =
            nestedPd?.followingCount ?? meta.followingCount ?? acc?.follows_count ?? acc?.followingCount;
          const mediaCountRaw =
            nestedPd?.mediaCount ??
            meta.mediaCount ??
            acc?.media_count ??
            acc?.mediaCount ??
            acc?.externalPostCount ??
            (Array.isArray(posts) ? posts.length : undefined);
          const fromAccRow = extractPositiveFollowersFromAccountRow(acc);
          const rawFollowerNum = followersRaw != null && followersRaw !== "" ? Number(followersRaw) : NaN;
          const mergedPositiveFollowers =
            fromAccRow ??
            (Number.isFinite(rawFollowerNum) && rawFollowerNum > 0 ? rawFollowerNum : undefined);
          const engagement = calculateEngagementFromPosts(posts, mergedPositiveFollowers ?? followersRaw);
          const fallbackTotalLikes = Array.isArray(posts)
            ? posts.reduce(
                (sum, p) =>
                  sum +
                  (Number(
                    p?.likeCount ??
                      p?.likes ??
                      p?.reactions ??
                      p?.reactionCount ??
                      p?.like_count ??
                      0
                  ) || 0),
                0
              )
            : undefined;
          const fallbackTotalComments = Array.isArray(posts)
            ? posts.reduce(
                (sum, p) =>
                  sum +
                  (Number(
                    p?.commentCount ??
                      p?.comments ??
                      p?.comment_count ??
                      p?.commentTotal ??
                      0
                  ) || 0),
                0
              )
            : undefined;
          const postsCount = Array.isArray(posts) ? posts.length : 0;
          const fallbackAvgLikes =
            postsCount > 0 && fallbackTotalLikes != null ? fallbackTotalLikes / postsCount : undefined;
          const fallbackAvgComments =
            postsCount > 0 && fallbackTotalComments != null ? fallbackTotalComments / postsCount : undefined;
          const fallbackEngagementRate =
            Number(followersRaw) > 0 && postsCount > 0 && fallbackTotalLikes != null && fallbackTotalComments != null
              ? ((fallbackTotalLikes + fallbackTotalComments) / postsCount / Number(followersRaw)) * 100
              : undefined;

          fallbackMedia = Array.isArray(posts)
            ? posts.slice(0, 25).map((p, i) => ({
                id: String(p.id || p.postId || i),
                caption: String(p.caption ?? p.message ?? p.text ?? p.title ?? "").slice(0, 2000),
                picture: String(p.picture ?? p.imageUrl ?? p.thumbnailUrl ?? p.media_url ?? ""),
                permalink: String(p.permalink ?? p.url ?? p.platformPostUrl ?? ""),
                mediaType: String(p.mediaType || p.type || "post"),
                likeCount: Number(
                  p.likeCount ?? p.likes ?? p.reactions ?? p.reactionCount ?? p.like_count ?? 0
                ) || 0,
                commentCount: Number(
                  p.commentCount ?? p.comments ?? p.comment_count ?? p.commentTotal ?? 0
                ) || 0,
                createdTime: String(p.createdTime ?? p.createdAt ?? p.timestamp ?? ""),
              }))
            : fallbackMedia;

          fallbackStats = {
            ...fallbackStats,
            followersCount:
              mergedPositiveFollowers ??
              (Number.isFinite(rawFollowerNum) && rawFollowerNum >= 0 ? rawFollowerNum : undefined) ??
              fallbackStats.followersCount,
            followingCount:
              followingRaw != null ? Number(followingRaw) : fallbackStats.followingCount,
            mediaCount:
              mediaCountRaw != null
                ? Number(mediaCountRaw)
                : fallbackMedia.length > 0
                  ? fallbackMedia.length
                  : fallbackStats.mediaCount,
            totalLikes: fallbackTotalLikes ?? engagement.totalLikes,
            totalComments: fallbackTotalComments ?? engagement.totalComments,
            avgLikes: fallbackAvgLikes ?? engagement.avgLikes,
            avgComments: fallbackAvgComments ?? engagement.avgComments,
            engagementRate: fallbackEngagementRate ?? engagement.engagementRate,
            updatedAt: new Date().toISOString(),
          };
        }
      }
    } catch {
      // Ignore fallback errors and keep original payload
    }
  }

  const hasFallbackStats =
    fallbackStats.followersCount != null ||
    fallbackStats.mediaCount != null ||
    fallbackMedia.length > 0;
  if (!hasFallbackStats && !zernioNote) {
    zernioNote =
      "No analytics payload returned for this account. Check Zernio dashboard or your plan.";
  }
  if (zernioNote && !fallbackStats.zernioNote) {
    fallbackStats.zernioNote = zernioNote;
  }

  let zernioExtra: Record<string, unknown> | null = null;
  let zernioEnrichmentNotes: string[] | null = null;
  if (getZernioApiKey()) {
    try {
      const enr = await fetchZernioAccountEnrichment(zernio, zid, {
        platform,
        zernioPlatform,
      });
      if (Object.keys(enr.zernioExtra).length > 0) zernioExtra = enr.zernioExtra;
      if (enr.zernioEnrichmentNotes.length > 0) zernioEnrichmentNotes = enr.zernioEnrichmentNotes;
    } catch {
      // enrichment is best-effort
    }
  }

  const fcAfterFallback = Number(fallbackStats.followersCount);
  if (
    isFacebookLike &&
    zernioExtra &&
    (!Number.isFinite(fcAfterFallback) || fcAfterFallback === 0)
  ) {
    const fromFollowerStats = pickFollowersFromFollowerStatsPayload(zernioExtra.followerStats);
    if (fromFollowerStats != null) {
      fallbackStats = {
        ...fallbackStats,
        followersCount: fromFollowerStats,
        updatedAt: new Date().toISOString(),
      };
    }
  }

  const zernioPayload: any = {
    profile: {
      username: stored.username,
      displayName: stored.displayName,
      ...(typeof data.profile === "object" && data.profile ? data.profile : {}),
    },
    stats: fallbackStats,
    media: fallbackMedia,
    source: "zernio",
    ...(zernioExtra ? { zernioExtra } : {}),
    ...(zernioEnrichmentNotes ? { zernioEnrichmentNotes } : {}),
  };
  if (platform === "google_business" && zernioExtra) {
    const gbp = buildGoogleBusinessPanelFromZernioExtra(zernioExtra);
    if (gbp) {
      zernioPayload.googleBusiness = gbp;
      zernioPayload.stats = {
        ...zernioPayload.stats,
        ...(gbp.averageRating != null ? { averageRating: gbp.averageRating } : {}),
        ...(gbp.reviewCount != null ? { reviewCount: gbp.reviewCount } : {}),
      };
    }
  }
  return { kind: "json", body: zernioPayload };
}
