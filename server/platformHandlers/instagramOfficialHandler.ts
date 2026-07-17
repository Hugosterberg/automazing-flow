/* eslint-disable @typescript-eslint/no-explicit-any --
 * Meta Graph API responses are loosely typed; casts to `any` are kept local.
 */

/**
 * Instagram account-data handler for accounts connected via the native
 * Instagram/Meta Graph API (non-Zernio flow).
 *
 * Pulls profile + media count + recent media via `graph.instagram.com`, and
 * keeps the long-lived token alive: it refreshes proactively when the token is
 * near expiry and reactively when the API reports an expired token, persisting
 * the renewed token so the connection never silently dies.
 */

import type { PlatformHandlerResult } from "./types.ts";
import { calculateEngagementFromPosts } from "../analytics/socialMetrics.ts";
import {
  isInstagramAuthError,
  refreshLongLivedInstagramToken,
  shouldRefreshInstagramToken,
} from "../providers/instagram.ts";

type TokenStore = {
  set: (accountId: string, value: Record<string, unknown>) => Promise<unknown>;
};

export async function handleInstagramOfficialAccountData({
  accessToken,
  accountId,
  tokenStore,
  stored,
}: {
  accessToken: string;
  accountId?: string;
  tokenStore?: TokenStore;
  stored?: Record<string, unknown>;
}): Promise<PlatformHandlerResult> {
  let token = accessToken;

  async function persist(nextToken: string, expiresAt: string) {
    token = nextToken;
    if (accountId && tokenStore && stored) {
      await tokenStore.set(accountId, { ...stored, accessToken: nextToken, expiresAt });
    }
  }

  // Proactive refresh: long-lived IG tokens last ~60 days and must be renewed
  // before they expire. Refresh once we're inside the window and persist.
  if (tokenStore && accountId && stored && shouldRefreshInstagramToken(stored.expiresAt)) {
    const refreshed = await refreshLongLivedInstagramToken(token);
    if (refreshed) await persist(refreshed.accessToken, refreshed.expiresAt);
  }

  const fields = "id,username,account_type,media_count,followers_count,follows_count";
  const fetchProfile = (t: string) =>
    fetch(`https://graph.instagram.com/me?fields=${fields}&access_token=${t}`, {
      signal: AbortSignal.timeout(15_000),
    });

  let mediaRes = await fetchProfile(token);
  let media: any = await mediaRes.json().catch(() => ({}));

  // Reactive refresh: if Instagram reports an auth error, try one refresh and
  // retry before giving up — covers tokens that slipped past the proactive
  // window. An already-expired token can't be refreshed, so this then surfaces
  // a clean 401 telling the user to reconnect.
  if (isInstagramAuthError(media?.error) && tokenStore && accountId && stored) {
    const refreshed = await refreshLongLivedInstagramToken(token);
    if (refreshed) {
      await persist(refreshed.accessToken, refreshed.expiresAt);
      mediaRes = await fetchProfile(token);
      media = await mediaRes.json().catch(() => ({}));
    }
  }

  if (media?.error) {
    return {
      kind: "error",
      status: isInstagramAuthError(media.error) ? 401 : 400,
      body: {
        error: isInstagramAuthError(media.error)
          ? "Instagram access expired. Reconnect the account."
          : media.error.message || "Failed to fetch Instagram profile",
      },
    };
  }
  // like_count/comments_count/thumbnail_url are available on the same media
  // edge — request them so posts render with engagement and video thumbnails
  // (media_url is not an image for VIDEO items).
  const mediaFields =
    "id,caption,media_type,media_product_type,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count";
  const mediaListRes = await fetch(
    `https://graph.instagram.com/me/media?fields=${mediaFields}&access_token=${token}&limit=12`,
    { signal: AbortSignal.timeout(15_000) }
  );
  const mediaList: any = await mediaListRes.json().catch(() => ({}));
  let mediaCount = media.media_count != null && !media.error ? Number(media.media_count) : undefined;
  const mediaListData: any[] = Array.isArray(mediaList?.data) ? mediaList.data : [];
  if (mediaCount == null && mediaListData.length > 0) {
    mediaCount = mediaListData.length;
  }

  // Normalize to the SocialMediaApiPost shape the UI expects (same as the
  // Zernio/TikTok/X handlers) — raw Graph fields never reach the client.
  const normalizedPosts = mediaListData.map((m: any) => {
    const mediaType = String(m.media_type || "IMAGE").toLowerCase();
    return {
      id: String(m.id || ""),
      caption: String(m.caption || ""),
      picture: String((mediaType === "video" ? m.thumbnail_url : m.media_url) || m.media_url || m.thumbnail_url || ""),
      permalink: String(m.permalink || ""),
      mediaType,
      likeCount: Number(m.like_count ?? 0),
      commentCount: Number(m.comments_count ?? 0),
      createdTime: String(m.timestamp || ""),
    };
  });

  const followersCount =
    media.followers_count != null && !media.error ? Number(media.followers_count) : undefined;
  const followingCount =
    media.follows_count != null && !media.error ? Number(media.follows_count) : undefined;
  const engagement = calculateEngagementFromPosts(normalizedPosts, followersCount);
  const hasAnyStat = followersCount != null || followingCount != null || mediaCount != null;
  const stats = hasAnyStat
    ? {
        followersCount: followersCount ?? undefined,
        followingCount: followingCount ?? undefined,
        mediaCount: mediaCount ?? undefined,
        accountType: media.account_type ? String(media.account_type) : undefined,
        totalLikes: engagement.totalLikes,
        totalComments: engagement.totalComments,
        avgLikes: engagement.avgLikes,
        avgComments: engagement.avgComments,
        engagementRate: engagement.engagementRate,
        updatedAt: new Date().toISOString(),
      }
    : undefined;
  return {
    kind: "json",
    body: {
      profile: { ...media, ...(stats && { stats }) },
      media: normalizedPosts,
      stats,
    },
  };
}
