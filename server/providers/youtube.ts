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

export async function fetchYouTubeAccountData(accessToken: string) {
  const channelRes = await fetch(
    "https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics,contentDetails&mine=true",
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  const channelData = (await channelRes.json()) as YouTubeChannelResponse;
  const channel = channelData.items?.[0];
  const uploadsId = channel?.contentDetails?.relatedPlaylists?.uploads;

  let videos: PlaylistItem[] = [];
  if (uploadsId) {
    const playRes = await fetch(
      `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&playlistId=${uploadsId}&maxResults=12`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const playData = (await playRes.json()) as { items?: PlaylistItem[] };
    videos = playData.items || [];
  }

  const media = videos.map((item) => ({
    id: item.snippet?.resourceId?.videoId || item.id,
    caption: item.snippet?.title || "",
    picture: item.snippet?.thumbnails?.medium?.url || item.snippet?.thumbnails?.default?.url || "",
    permalink: item.snippet?.resourceId?.videoId ? `https://www.youtube.com/watch?v=${item.snippet.resourceId.videoId}` : "",
    mediaType: "video",
    likeCount: 0,
    commentCount: 0,
    createdTime: item.snippet?.publishedAt || "",
  }));

  return {
    profile: channel?.snippet ? { ...channel.snippet, statistics: channel.statistics } : {},
    stats: channel?.statistics
      ? {
          followersCount: Number(channel.statistics.subscriberCount || 0) || undefined,
          mediaCount: Number(channel.statistics.videoCount || 0) || media.length || undefined,
          updatedAt: new Date().toISOString(),
        }
      : undefined,
    media,
  };
}
