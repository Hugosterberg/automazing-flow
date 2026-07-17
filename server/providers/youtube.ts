import { calculateEngagementFromPosts } from "../analytics/socialMetrics.ts";

type VideoStatistics = {
  viewCount?: string;
  likeCount?: string;
  commentCount?: string;
};

type YouTubeChannelResponse = {
  items?: Array<{
    snippet?: Record<string, unknown>;
    statistics?: {
      subscriberCount?: string;
      videoCount?: string;
    };
    contentDetails?: {
      relatedPlaylists?: {
        uploads?: string;
      };
    };
  }>;
};

type PlaylistItem = {
  id?: string;
  snippet?: {
    title?: string;
    publishedAt?: string;
    thumbnails?: {
      medium?: { url?: string };
      default?: { url?: string };
    };
    resourceId?: {
      videoId?: string;
    };
  };
};

type YouTubeFetchArgs = {
  accessToken: string;
  refreshToken?: string;
  accountId: string;
  tokenStore: {
    set: (accountId: string, value: Record<string, unknown>) => Promise<unknown>;
  };
  stored: Record<string, unknown>;
  googleClientId?: string;
  googleClientSecret?: string;
};

/**
 * YouTube data uses Google OAuth, so its access token expires after ~1 hour.
 * Without a refresh step the connection silently returns empty data once that
 * window passes — so this mirrors the Gmail/Drive flow: retry once with a
 * refreshed token, persist it, and surface a real 401 when refresh fails so
 * the UI can prompt a reconnect instead of showing an empty channel.
 */
export async function fetchYouTubeAccountData(args: YouTubeFetchArgs) {
  const { accessToken, refreshToken, accountId, tokenStore, stored, googleClientId, googleClientSecret } = args;

  async function refreshGoogleToken(rt: string): Promise<string | null> {
    if (!googleClientId || !googleClientSecret || !rt) return null;
    const r = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: googleClientId,
        client_secret: googleClientSecret,
        refresh_token: rt,
        grant_type: "refresh_token",
      }).toString(),
      signal: AbortSignal.timeout(15_000),
    });
    const d = (await r.json().catch(() => ({}))) as { access_token?: string };
    if (!d.access_token) return null;
    await tokenStore.set(accountId, { ...stored, accessToken: d.access_token });
    return d.access_token;
  }

  function fetchChannel(token: string) {
    return fetch(
      "https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics,contentDetails&mine=true",
      { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15_000) }
    );
  }

  let token = accessToken;
  let channelRes = await fetchChannel(token);
  if (channelRes.status === 401 && refreshToken) {
    const refreshed = await refreshGoogleToken(refreshToken);
    if (!refreshed) {
      return { error: "YouTube access expired. Reconnect the account.", status: 401 };
    }
    token = refreshed;
    channelRes = await fetchChannel(token);
  }
  if (channelRes.status === 401) {
    return { error: "YouTube access expired. Reconnect the account.", status: 401 };
  }
  if (!channelRes.ok) {
    return { error: `Could not fetch YouTube channel (${channelRes.status})`, status: 502 };
  }

  const channelData = (await channelRes.json().catch(() => ({}))) as YouTubeChannelResponse;
  const channel = channelData.items?.[0];
  const uploadsId = channel?.contentDetails?.relatedPlaylists?.uploads;

  let videos: PlaylistItem[] = [];
  if (uploadsId) {
    const playRes = await fetch(
      `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&playlistId=${uploadsId}&maxResults=12`,
      { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15_000) }
    ).catch(() => null);
    if (playRes?.ok) {
      const playData = (await playRes.json().catch(() => ({}))) as { items?: PlaylistItem[] };
      videos = playData.items || [];
    }
  }

  // Per-video statistics come from the videos endpoint, not playlistItems —
  // one batched call turns the hardcoded 0 likes/comments into real numbers.
  const videoIds = videos
    .map((item) => item.snippet?.resourceId?.videoId)
    .filter((id): id is string => Boolean(id));
  const statsById = new Map<string, VideoStatistics>();
  if (videoIds.length > 0) {
    const statsRes = await fetch(
      `https://www.googleapis.com/youtube/v3/videos?part=statistics&id=${videoIds.join(",")}&maxResults=${videoIds.length}`,
      { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15_000) }
    ).catch(() => null);
    if (statsRes?.ok) {
      const statsData = (await statsRes.json().catch(() => ({}))) as {
        items?: Array<{ id?: string; statistics?: VideoStatistics }>;
      };
      for (const item of statsData.items || []) {
        if (item.id && item.statistics) statsById.set(item.id, item.statistics);
      }
    }
  }

  const media = videos.map((item) => {
    const videoId = item.snippet?.resourceId?.videoId;
    const vStats = videoId ? statsById.get(videoId) : undefined;
    return {
      id: videoId || item.id,
      caption: item.snippet?.title || "",
      picture: item.snippet?.thumbnails?.medium?.url || item.snippet?.thumbnails?.default?.url || "",
      permalink: videoId ? `https://www.youtube.com/watch?v=${videoId}` : "",
      mediaType: "video",
      likeCount: Number(vStats?.likeCount || 0),
      commentCount: Number(vStats?.commentCount || 0),
      viewCount: vStats?.viewCount != null ? Number(vStats.viewCount) : undefined,
      createdTime: item.snippet?.publishedAt || "",
    };
  });

  const followersCount = Number(channel?.statistics?.subscriberCount || 0) || undefined;
  const engagement = calculateEngagementFromPosts(media, followersCount);

  return {
    profile: channel?.snippet ? { ...channel.snippet, statistics: channel.statistics } : {},
    stats: channel?.statistics
      ? {
          followersCount,
          mediaCount: Number(channel.statistics.videoCount || 0) || media.length || undefined,
          totalLikes: engagement.totalLikes,
          totalComments: engagement.totalComments,
          totalViews: engagement.totalViews,
          avgLikes: engagement.avgLikes,
          avgComments: engagement.avgComments,
          avgViews: engagement.avgViews,
          engagementRate: engagement.engagementRate,
          updatedAt: new Date().toISOString(),
        }
      : undefined,
    media,
  };
}
