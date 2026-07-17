import { calculateEngagementFromPosts } from "../analytics/socialMetrics.ts";

const TIKTOK_TOKEN = "https://open.tiktokapis.com/v2/oauth/token/";

type TikTokVideo = {
  id?: string;
  title?: string;
  video_description?: string;
  create_time?: number | string;
  cover_image_url?: string;
  share_url?: string;
  like_count?: number | string;
  comment_count?: number | string;
  view_count?: number | string;
  share_count?: number | string;
};

type TikTokUser = Record<string, unknown> & {
  follower_count?: number | string;
  following_count?: number | string;
  likes_count?: number | string;
  video_count?: number | string;
};

type TikTokFetchArgs = {
  accessToken: string;
  refreshToken?: string;
  accountId: string;
  tokenStore: {
    set: (accountId: string, value: Record<string, unknown>) => Promise<unknown>;
  };
  stored: Record<string, unknown>;
  tiktokClientKey?: string;
  tiktokClientSecret?: string;
};

/**
 * TikTok access tokens expire after ~24h. Without a refresh step the
 * connection silently returns an empty profile once that window passes, so
 * this retries once with a refreshed token (TikTok rotates the refresh token,
 * so the new one is persisted) and surfaces a real 401 when refresh fails.
 */
export async function fetchTikTokAccountData(args: TikTokFetchArgs) {
  const { accessToken, refreshToken, accountId, tokenStore, stored, tiktokClientKey, tiktokClientSecret } = args;

  async function refreshTikTokToken(rt: string): Promise<string | null> {
    if (!tiktokClientKey || !tiktokClientSecret || !rt) return null;
    const r = await fetch(TIKTOK_TOKEN, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", "Cache-Control": "no-cache" },
      body: new URLSearchParams({
        client_key: tiktokClientKey,
        client_secret: tiktokClientSecret,
        grant_type: "refresh_token",
        refresh_token: rt,
      }).toString(),
      signal: AbortSignal.timeout(15_000),
    });
    const d = (await r.json().catch(() => ({}))) as { access_token?: string; refresh_token?: string };
    if (!d.access_token) return null;
    await tokenStore.set(accountId, {
      ...stored,
      accessToken: d.access_token,
      refreshToken: d.refresh_token || rt,
    });
    return d.access_token;
  }

  // Full field set needs the user.info.profile + user.info.stats scopes.
  // Connections created before those scopes were requested only granted
  // user.info.basic, and TikTok rejects the whole request when a field is
  // outside the granted scopes — so fall back to the basic fields on error.
  const USER_FIELDS_FULL =
    "username,display_name,avatar_url,bio_description,profile_deep_link,is_verified," +
    "follower_count,following_count,likes_count,video_count";
  const USER_FIELDS_BASIC = "display_name,avatar_url,username";

  function fetchUser(token: string, fields: string) {
    return fetch(`https://open.tiktokapis.com/v2/user/info/?fields=${fields}`, {
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(15_000),
    });
  }

  let token = accessToken;
  let userRes = await fetchUser(token, USER_FIELDS_FULL);
  if (userRes.status === 401 && refreshToken) {
    const refreshed = await refreshTikTokToken(refreshToken);
    if (!refreshed) {
      return { error: "TikTok access expired. Reconnect the account.", status: 401 };
    }
    token = refreshed;
    userRes = await fetchUser(token, USER_FIELDS_FULL);
  }
  if (userRes.status === 401) {
    return { error: "TikTok access expired. Reconnect the account.", status: 401 };
  }
  let userData = (await userRes.json().catch(() => ({}))) as {
    data?: { user?: TikTokUser };
    error?: { code?: string };
  };
  const scopeError = !userRes.ok || (userData.error?.code && userData.error.code !== "ok");
  if (scopeError || !userData.data?.user) {
    userRes = await fetchUser(token, USER_FIELDS_BASIC);
    if (!userRes.ok) {
      return { error: `Could not fetch TikTok profile (${userRes.status})`, status: 502 };
    }
    userData = (await userRes.json().catch(() => ({}))) as typeof userData;
  }

  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  const videosRes = await fetch(
    "https://open.tiktokapis.com/v2/video/list/?fields=id,title,video_description,create_time,cover_image_url,share_url,like_count,comment_count,view_count,share_count",
    { method: "POST", headers, body: JSON.stringify({ max_count: 10 }), signal: AbortSignal.timeout(15_000) }
  ).catch(() => null);
  const videosData = videosRes?.ok ? await videosRes.json().catch(() => ({})) : {};
  const videos = Array.isArray((videosData as { data?: { videos?: unknown[] } }).data?.videos)
    ? ((videosData as { data?: { videos?: TikTokVideo[] } }).data?.videos ?? [])
    : [];

  const media = videos.map((v) => ({
    id: v.id,
    caption: v.video_description || v.title || "",
    picture: v.cover_image_url || "",
    permalink: v.share_url || "",
    mediaType: "video",
    likeCount: Number(v.like_count || 0),
    commentCount: Number(v.comment_count || 0),
    viewCount: v.view_count != null ? Number(v.view_count) : undefined,
    createdTime: v.create_time ? new Date(Number(v.create_time) * 1000).toISOString() : "",
  }));

  const user = userData.data?.user || {};
  const followersCount = user.follower_count != null ? Number(user.follower_count) : undefined;
  const engagement = calculateEngagementFromPosts(media, followersCount);

  return {
    profile: user,
    stats: {
      followersCount,
      followingCount: user.following_count != null ? Number(user.following_count) : undefined,
      mediaCount:
        user.video_count != null ? Number(user.video_count) : media.length || undefined,
      totalLikes: engagement.totalLikes,
      totalComments: engagement.totalComments,
      totalViews: engagement.totalViews,
      avgLikes: engagement.avgLikes,
      avgComments: engagement.avgComments,
      avgViews: engagement.avgViews,
      engagementRate: engagement.engagementRate,
      updatedAt: new Date().toISOString(),
    },
    media,
  };
}
