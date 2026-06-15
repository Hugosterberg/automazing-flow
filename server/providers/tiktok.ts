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

  function fetchUser(token: string) {
    return fetch("https://open.tiktokapis.com/v2/user/info/?fields=username,display_name,avatar_url", {
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(15_000),
    });
  }

  let token = accessToken;
  let userRes = await fetchUser(token);
  if (userRes.status === 401 && refreshToken) {
    const refreshed = await refreshTikTokToken(refreshToken);
    if (!refreshed) {
      return { error: "TikTok access expired. Reconnect the account.", status: 401 };
    }
    token = refreshed;
    userRes = await fetchUser(token);
  }
  if (userRes.status === 401) {
    return { error: "TikTok access expired. Reconnect the account.", status: 401 };
  }
  if (!userRes.ok) {
    return { error: `Could not fetch TikTok profile (${userRes.status})`, status: 502 };
  }
  const userData = await userRes.json().catch(() => ({}));

  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  const videosRes = await fetch(
    "https://open.tiktokapis.com/v2/video/list/?fields=id,title,video_description,create_time,cover_image_url,share_url,like_count,comment_count",
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
    createdTime: v.create_time ? new Date(Number(v.create_time) * 1000).toISOString() : "",
  }));
  const totalLikes = media.reduce((sum, m) => sum + m.likeCount, 0);
  const avgLikes = media.length > 0 ? Math.round(totalLikes / media.length) : undefined;

  return {
    profile: (userData as { data?: { user?: Record<string, unknown> } }).data?.user || {},
    stats: {
      mediaCount: media.length || undefined,
      totalLikes: media.length > 0 ? totalLikes : undefined,
      avgLikes,
      updatedAt: new Date().toISOString(),
    },
    media,
  };
}
